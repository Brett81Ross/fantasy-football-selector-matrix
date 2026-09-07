# Canonical Draft Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ABL-01 as a small, browser-compatible, platform-independent contract layer that validates canonical league, roster-slot, pick-event, draft-state, recommendation, and provider shapes without changing production behavior.

**Architecture:** The existing app remains plain browser JavaScript. Canonical contracts live in focused UMD-style modules that work both in Node tests and in the browser. The contract layer contains no Sleeper calls, no recommendation scoring, no UI, and no persistence; later ABL items consume these validated shapes.

**Tech Stack:** Plain JavaScript, browser globals, CommonJS compatibility for tests, Node built-in `node:test` + `assert/strict`; no new runtime dependency or frontend state library.

**Spec:** `docs/superpowers/specs/2026-09-07-universal-draft-core-design.md`

## Global Constraints

- Preserve the existing browser-first JavaScript architecture; do not introduce Zustand, TypeScript compilation, React, or another framework.
- Recommendation code must never depend on Sleeper-specific fields.
- Roster slots must be first-class and must not assume fixed QB/RB/WR/TE/FLEX counts.
- Phase 1 provider names are `manual` and `sleeper`; contract code must still permit future platform strings.
- No network requests, service workers, Vercel config changes, production deployment, or live app behavior changes in ABL-01.
- All work stays on `abl/fantasy-universal-draft-core-2026-09-07`.
- Tests use only Node built-ins so the repo gains no dependency-install requirement.

---

## File Structure

- Create `draft-core/contracts.js` — canonical constants, object guards, normalization helpers, and validators for `RosterSlot`, `LeagueSettings`, `PickEvent`, `DraftState`, and `Recommendation`.
- Create `draft-core/provider-contract.js` — validates the minimal `DraftStateProvider` boundary without containing platform logic.
- Create `tests/draft-contracts.test.js` — contract acceptance/rejection tests, including flexible roster slots, duplicate picks, and sync metadata.
- Create `tests/provider-contract.test.js` — provider interface tests.
- No existing runtime file is modified in ABL-01. Runtime integration begins in ABL-02 after the contract layer is proven independently.

---

### Task 1: Canonical constants and roster/league validation

**Files:**
- Create: `draft-core/contracts.js`
- Test: `tests/draft-contracts.test.js`

**Interfaces:**
- Consumes: plain JavaScript objects.
- Produces: `FFMDraftContracts.ROSTER_SLOT_FLAGS`, `DRAFT_TYPES`, `DRAFT_STATUSES`, `SYNC_STATUSES`, `normalizeRosterSlot(slot)`, `validateLeagueSettings(value)`.

- [ ] **Step 1: Write failing roster-slot and league tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../draft-core/contracts');

test('normalizes flexible roster slots without hard-coded positions', () => {
  assert.deepEqual(
    C.normalizeRosterSlot({
      id: 'FLEX-1',
      type: 'FLEX',
      count: 2,
      eligiblePositions: ['RB', 'WR', 'TE']
    }),
    {
      id: 'FLEX-1',
      type: 'FLEX',
      count: 2,
      eligiblePositions: ['RB', 'WR', 'TE'],
      isBench: false,
      isReserve: false
    }
  );
});

test('accepts a superflex-shaped league without special-case code', () => {
  const league = {
    leagueId: 'L1',
    platform: 'manual',
    season: 2026,
    scoring: { pass_td: 4, rush_td: 6 },
    teams: 12,
    draftType: 'snake',
    rosterSlots: [
      { id: 'QB', type: 'QB', count: 1, eligiblePositions: ['QB'] },
      { id: 'SF', type: 'SUPERFLEX', count: 1, eligiblePositions: ['QB', 'RB', 'WR', 'TE'] },
      { id: 'BN', type: 'BN', count: 5, eligiblePositions: ['QB', 'RB', 'WR', 'TE', 'K', 'DST'], isBench: true }
    ]
  };
  assert.equal(C.validateLeagueSettings(league).ok, true);
});

test('rejects league settings with no roster slots', () => {
  const result = C.validateLeagueSettings({
    leagueId: 'L1', platform: 'manual', season: 2026,
    scoring: {}, teams: 12, draftType: 'snake', rosterSlots: []
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /rosterSlots/);
});
```

- [ ] **Step 2: Run the tests and verify they fail because the module does not exist**

Run:

```bash
node --test tests/draft-contracts.test.js
```

Expected: FAIL with `Cannot find module '../draft-core/contracts'`.

- [ ] **Step 3: Implement the minimal contract module and roster/league validation**

Use a browser/CommonJS wrapper and exact exported names:

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMDraftContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DRAFT_TYPES = Object.freeze(['snake', 'linear', 'auction']);
  const DRAFT_STATUSES = Object.freeze(['not_started', 'pre_draft', 'live', 'paused', 'completed']);
  const SYNC_STATUSES = Object.freeze(['live', 'stale', 'disconnected', 'manual']);
  const ROSTER_SLOT_FLAGS = Object.freeze(['isBench', 'isReserve']);

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function positiveInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function normalizeRosterSlot(slot) {
    const source = slot && typeof slot === 'object' ? slot : {};
    return {
      id: text(source.id),
      type: text(source.type),
      count: positiveInt(source.count) || 0,
      eligiblePositions: Array.isArray(source.eligiblePositions)
        ? [...new Set(source.eligiblePositions.map(text).filter(Boolean))]
        : [],
      isBench: source.isBench === true,
      isReserve: source.isReserve === true
    };
  }

  function validateLeagueSettings(value) {
    const errors = [];
    const league = value && typeof value === 'object' ? value : {};
    if (!text(league.leagueId)) errors.push('leagueId is required');
    if (!text(league.platform)) errors.push('platform is required');
    if (!positiveInt(league.season)) errors.push('season must be a positive integer');
    if (!positiveInt(league.teams)) errors.push('teams must be a positive integer');
    if (!DRAFT_TYPES.includes(league.draftType)) errors.push('draftType is invalid');
    if (!league.scoring || typeof league.scoring !== 'object' || Array.isArray(league.scoring)) errors.push('scoring must be an object');
    if (!Array.isArray(league.rosterSlots) || league.rosterSlots.length === 0) errors.push('rosterSlots must contain at least one slot');
    else {
      league.rosterSlots.forEach((raw, index) => {
        const slot = normalizeRosterSlot(raw);
        if (!slot.id) errors.push(`rosterSlots[${index}].id is required`);
        if (!slot.type) errors.push(`rosterSlots[${index}].type is required`);
        if (!slot.count) errors.push(`rosterSlots[${index}].count must be positive`);
        if (!slot.isBench && !slot.isReserve && slot.eligiblePositions.length === 0) errors.push(`rosterSlots[${index}].eligiblePositions is required`);
      });
    }
    return { ok: errors.length === 0, errors };
  }

  return {
    DRAFT_TYPES,
    DRAFT_STATUSES,
    SYNC_STATUSES,
    ROSTER_SLOT_FLAGS,
    normalizeRosterSlot,
    validateLeagueSettings
  };
});
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
node --test tests/draft-contracts.test.js
```

Expected: all Task 1 tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add draft-core/contracts.js tests/draft-contracts.test.js
git commit -m "feat(fantasy): add canonical league contracts"
```

---

### Task 2: Pick events and canonical draft-state validation

**Files:**
- Modify: `draft-core/contracts.js`
- Modify: `tests/draft-contracts.test.js`

**Interfaces:**
- Consumes: `LeagueSettings`, chronological `PickEvent[]`, and canonical `DraftState` objects.
- Produces: `normalizePickEvent(value)`, `validatePickEvents(picks)`, `validateDraftState(value)`.

- [ ] **Step 1: Add failing tests for pick identity, ordering, duplicates, and sync metadata**

```js
test('accepts chronological unique pick events', () => {
  const result = C.validatePickEvents([
    { pickId: 'D1:1', draftId: 'D1', overall: 1, round: 1, pickInRound: 1, playerId: 'P1', teamId: 'T1', source: 'manual' },
    { pickId: 'D1:2', draftId: 'D1', overall: 2, round: 1, pickInRound: 2, playerId: 'P2', teamId: 'T2', source: 'manual' }
  ]);
  assert.equal(result.ok, true);
});

test('rejects duplicate player or pick identity', () => {
  const result = C.validatePickEvents([
    { pickId: 'D1:1', draftId: 'D1', overall: 1, round: 1, pickInRound: 1, playerId: 'P1', teamId: 'T1', source: 'manual' },
    { pickId: 'D1:1', draftId: 'D1', overall: 2, round: 1, pickInRound: 2, playerId: 'P1', teamId: 'T2', source: 'manual' }
  ]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /duplicate/i);
});

test('rejects a draft state with invalid sync status', () => {
  const state = makeValidDraftState();
  state.sync.status = 'mystery';
  const result = C.validateDraftState(state);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /sync.status/);
});
```

Add this exact test helper above the tests:

```js
function makeValidDraftState() {
  return {
    draftId: 'D1',
    league: {
      leagueId: 'L1', platform: 'manual', season: 2026, scoring: {}, teams: 2, draftType: 'snake',
      rosterSlots: [
        { id: 'QB', type: 'QB', count: 1, eligiblePositions: ['QB'] },
        { id: 'BN', type: 'BN', count: 1, eligiblePositions: ['QB', 'RB', 'WR', 'TE'], isBench: true }
      ]
    },
    status: 'live',
    myTeamId: 'T1',
    currentPick: { round: 1, pickInRound: 2, overall: 2, onTheClockTeamId: 'T2' },
    picksUntilMyNext: 1,
    teams: [{ teamId: 'T1', ownerName: 'Me' }, { teamId: 'T2', ownerName: 'Other' }],
    picks: [],
    draftedPlayerIds: [],
    availablePlayerIds: ['P1', 'P2'],
    myRoster: [],
    recentPicks: [],
    sync: {
      status: 'manual',
      lastSuccessfulSyncAt: null,
      lastAttemptAt: null,
      consecutiveFailures: 0
    }
  };
}
```

- [ ] **Step 2: Run and verify the new tests fail for missing functions**

Run:

```bash
node --test tests/draft-contracts.test.js
```

Expected: FAIL because `validatePickEvents` / `validateDraftState` are not functions.

- [ ] **Step 3: Implement normalized pick validation and draft-state validation**

Add exact rules:

```js
function normalizePickEvent(value) {
  const pick = value && typeof value === 'object' ? value : {};
  return {
    pickId: text(pick.pickId),
    draftId: text(pick.draftId),
    overall: positiveInt(pick.overall) || 0,
    round: positiveInt(pick.round) || 0,
    pickInRound: positiveInt(pick.pickInRound) || 0,
    playerId: text(pick.playerId),
    teamId: text(pick.teamId),
    ...(text(pick.originalOwnerTeamId) ? { originalOwnerTeamId: text(pick.originalOwnerTeamId) } : {}),
    ...(text(pick.timestamp) ? { timestamp: text(pick.timestamp) } : {}),
    source: text(pick.source)
  };
}

function validatePickEvents(picks) {
  const errors = [];
  if (!Array.isArray(picks)) return { ok: false, errors: ['picks must be an array'] };
  const pickIds = new Set();
  const playerIds = new Set();
  let previousOverall = 0;
  picks.forEach((raw, index) => {
    const pick = normalizePickEvent(raw);
    for (const key of ['pickId', 'draftId', 'playerId', 'teamId', 'source']) {
      if (!pick[key]) errors.push(`picks[${index}].${key} is required`);
    }
    for (const key of ['overall', 'round', 'pickInRound']) {
      if (!pick[key]) errors.push(`picks[${index}].${key} must be positive`);
    }
    if (pick.overall < previousOverall) errors.push(`picks[${index}] is out of chronological order`);
    previousOverall = Math.max(previousOverall, pick.overall);
    if (pickIds.has(pick.pickId)) errors.push(`duplicate pickId ${pick.pickId}`);
    if (playerIds.has(pick.playerId)) errors.push(`duplicate drafted player ${pick.playerId}`);
    pickIds.add(pick.pickId);
    playerIds.add(pick.playerId);
  });
  return { ok: errors.length === 0, errors };
}
```

`validateDraftState(value)` must additionally verify:
- `draftId` exists.
- embedded `league` passes `validateLeagueSettings`.
- `status` is in `DRAFT_STATUSES`.
- `myTeamId` is either `null` or a non-empty string.
- `picksUntilMyNext` is either `null` or an integer >= 0.
- `teams`, `picks`, `draftedPlayerIds`, `availablePlayerIds`, `myRoster`, and `recentPicks` are arrays.
- `picks` passes `validatePickEvents`.
- no player ID appears in both `draftedPlayerIds` and `availablePlayerIds`.
- every `myRoster` entry has non-empty `playerId`, `slotId`, and `position`.
- `sync.status` is in `SYNC_STATUSES`.
- `sync.consecutiveFailures` is an integer >= 0.
- `lastSuccessfulSyncAt` and `lastAttemptAt` are either `null` or strings.

Export all three new functions.

- [ ] **Step 4: Run all contract tests**

Run:

```bash
node --test tests/draft-contracts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add draft-core/contracts.js tests/draft-contracts.test.js
git commit -m "feat(fantasy): validate canonical draft state"
```

---

### Task 3: Recommendation contract validation

**Files:**
- Modify: `draft-core/contracts.js`
- Modify: `tests/draft-contracts.test.js`

**Interfaces:**
- Consumes: canonical `Recommendation` objects.
- Produces: `validateRecommendation(value)`.

- [ ] **Step 1: Add failing recommendation tests**

```js
test('accepts an explainable recommendation with component scores', () => {
  const result = C.validateRecommendation({
    playerId: 'P9',
    position: 'WR',
    slotId: 'FLEX-1',
    score: 91.4,
    components: {
      playerValue: 82,
      rosterNeed: 8,
      positionalDropoff: 5.4,
      tierCliff: 3,
      waitCost: 4.7
    },
    explanation: 'WR is the best FLEX value and has the sharpest drop before your next pick.',
    generatedAt: '2026-09-07T12:00:00.000Z',
    basedOnSyncAt: '2026-09-07T11:59:58.000Z'
  });
  assert.equal(result.ok, true);
});

test('rejects a recommendation missing an explanation', () => {
  const result = C.validateRecommendation({
    playerId: 'P9', position: 'WR', slotId: null, score: 91,
    components: { playerValue: 82, rosterNeed: 8, positionalDropoff: 5, tierCliff: 3, waitCost: 4 },
    explanation: '', generatedAt: '2026-09-07T12:00:00.000Z', basedOnSyncAt: null
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /explanation/);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
node --test tests/draft-contracts.test.js
```

Expected: FAIL because `validateRecommendation` is not a function.

- [ ] **Step 3: Implement `validateRecommendation`**

Require these exact fields:
- non-empty `playerId` and `position`.
- `slotId` is `null` or a non-empty string.
- finite numeric `score`.
- `components` object with finite numeric `playerValue`, `rosterNeed`, `positionalDropoff`, `tierCliff`, and `waitCost`.
- non-empty `explanation`.
- non-empty string `generatedAt`.
- `basedOnSyncAt` is `null` or a non-empty string.

Do not impose weights or scoring ranges in ABL-01; those belong to later recommendation tasks.

- [ ] **Step 4: Run contract tests**

Run:

```bash
node --test tests/draft-contracts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add draft-core/contracts.js tests/draft-contracts.test.js
git commit -m "feat(fantasy): validate recommendation contract"
```

---

### Task 4: Draft-state provider boundary

**Files:**
- Create: `draft-core/provider-contract.js`
- Create: `tests/provider-contract.test.js`

**Interfaces:**
- Consumes: provider objects.
- Produces: `assertDraftStateProvider(provider)` and `REQUIRED_PROVIDER_METHODS`.

- [ ] **Step 1: Write failing provider tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertDraftStateProvider } = require('../draft-core/provider-contract');

function validProvider() {
  return {
    platform: 'manual',
    async connect() {},
    async listLeagues() { return []; },
    async loadLeague() { return {}; },
    async loadDraft() { return {}; },
    async loadPicks() { return []; }
  };
}

test('accepts the minimal platform-independent provider boundary', () => {
  assert.equal(assertDraftStateProvider(validProvider()), true);
});

test('rejects a provider missing loadPicks', () => {
  const provider = validProvider();
  delete provider.loadPicks;
  assert.throws(() => assertDraftStateProvider(provider), /loadPicks/);
});

test('rejects a provider with no platform identity', () => {
  const provider = validProvider();
  provider.platform = '';
  assert.throws(() => assertDraftStateProvider(provider), /platform/);
});
```

- [ ] **Step 2: Run and verify the provider tests fail**

Run:

```bash
node --test tests/provider-contract.test.js
```

Expected: FAIL with `Cannot find module '../draft-core/provider-contract'`.

- [ ] **Step 3: Implement the provider boundary**

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMDraftProviderContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REQUIRED_PROVIDER_METHODS = Object.freeze([
    'connect',
    'listLeagues',
    'loadLeague',
    'loadDraft',
    'loadPicks'
  ]);

  function assertDraftStateProvider(provider) {
    if (!provider || typeof provider !== 'object') throw new TypeError('provider must be an object');
    if (typeof provider.platform !== 'string' || !provider.platform.trim()) throw new TypeError('provider.platform is required');
    for (const method of REQUIRED_PROVIDER_METHODS) {
      if (typeof provider[method] !== 'function') throw new TypeError(`provider.${method} must be a function`);
    }
    return true;
  }

  return { REQUIRED_PROVIDER_METHODS, assertDraftStateProvider };
});
```

- [ ] **Step 4: Run all ABL-01 tests together**

Run:

```bash
node --test tests/draft-contracts.test.js tests/provider-contract.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add draft-core/provider-contract.js tests/provider-contract.test.js
git commit -m "feat(fantasy): define draft provider boundary"
```

---

### Task 5: Contract self-check and ABL-01 QA gate

**Files:**
- Verify only; no runtime file changes expected.

**Interfaces:**
- Consumes: outputs from Tasks 1-4.
- Produces: an ABL-01 QA result that later ABL tasks can trust.

- [ ] **Step 1: Run the complete ABL-01 test suite from a clean checkout**

Run:

```bash
node --test tests/draft-contracts.test.js tests/provider-contract.test.js
```

Expected: zero failures.

- [ ] **Step 2: Confirm browser compatibility statically**

Check that both new runtime modules:
- do not reference `require` except inside the `module.exports` compatibility branch,
- attach only `FFMDraftContracts` / `FFMDraftProviderContract` to `globalThis`,
- make no network, DOM, storage, timer, or service-worker calls.

- [ ] **Step 3: Compare branch against `main`**

Run:

```bash
git diff --stat main...HEAD
git diff main...HEAD -- draft-core tests docs/superpowers
```

Expected: only the approved spec/plan plus `draft-core/*` and `tests/*`; no `vercel.json`, `api/*`, `index.html`, or existing live runtime files changed.

- [ ] **Step 4: Record the gate result in the implementation handoff**

The completion report must include:
- test command and exact pass/fail count,
- branch head SHA,
- changed-file list,
- confirmation that production and Vercel deployment lock were untouched,
- next ABL item: **ABL-02 Existing Engine Refactor**.

- [ ] **Step 5: Stop before ABL-02 unless the implementation workflow explicitly continues into the next approved plan**

Do not deploy. Do not merge to `main`. Do not modify `vercel.json`.
