# ABL-27 Live Data Health Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/health` report the same source fallback reality as `/api/nfl-data`, including explicit `LIVE`, `DEGRADED`, `STALE`, and `OFFLINE` states plus truthful active-source metadata.

**Architecture:** Introduce one small pure source-policy module that owns season calculation, roster/stat candidate order, ESPN URL, and request headers. Both `api/nfl-data.js` and `api/health.js` consume that policy so they cannot silently drift again. Health probes candidates in policy order, records which source actually succeeded, tracks best-effort in-process last-success timestamps without adding a database, and returns degraded/stale states without fabricating availability.

**Tech Stack:** Node.js CommonJS, Vercel serverless functions, Node built-in `node:test` + `node:assert/strict`, native `fetch`/`AbortController`.

**Spec:** `docs/superpowers/specs/2026-09-09-abl-27-36-fantasy-intelligence-design.md`

## Global Constraints

- No Vercel preview deployments.
- No production deployment until Brett explicitly approves the completed ABL batch.
- Keep production deployment lock intact during implementation and QA.
- Do not introduce service workers.
- Preserve current successful production deployment as rollback candidate.
- Keep Fantasy Football Matrix™ isolated from other CactusByte apps except future centralized entitlement integration.
- Mobile-first UI, including narrow Android and Samsung Galaxy Z Fold layouts.
- Every recommendation must degrade safely when upstream data is stale or unavailable.
- Prefer deterministic, explainable scoring over opaque model outputs.
- No payment integration in this batch.
- ABL-27 adds no database or persistence dependency.

---

## File Map

- Create `api/nfl-source-policy.js` — pure source-selection policy: season math, ordered roster/stat candidates, ESPN scoreboard URL, and request headers.
- Modify `api/nfl-data.js` — consume the shared policy without changing payload semantics beyond source-policy parity.
- Modify `api/health.js` — probe ordered candidates, classify health accurately, and expose active source/fallback/freshness metadata.
- Create `tests/nfl-source-policy.test.js` — deterministic season/candidate-order contract.
- Create `tests/health-fallback.test.js` — mocked-fetch health endpoint regression coverage.
- Run all existing `tests/*.test.js` — verify no Sleeper/season/waiver regressions.

---

### Task 1: Canonical NFL Source Policy

**Files:**
- Create: `api/nfl-source-policy.js`
- Create: `tests/nfl-source-policy.test.js`

**Interfaces:**
- Produces: `buildNflSourcePolicy(now = new Date(), version = '1.5.5')`
- Return shape:

```js
{
  currentSeason: 2026,
  preseason: false,
  preferredStatsSeason: 2026,
  rosterCandidates: [{ season: 2026, url: '...' }, { season: 2025, url: '...' }],
  statsCandidates: [
    { kind: 'weekly', season: 2026, url: '...' },
    { kind: 'weekly', season: 2025, url: '...' },
    { kind: 'legacy', season: 2026, url: '...' }
  ],
  scoreboardUrl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100',
  csvHeaders: { 'User-Agent': 'Fantasy-Football-Matrix/1.5.5', Accept: 'text/csv,text/plain,*/*' },
  jsonHeaders: { Accept: 'application/json', 'User-Agent': 'Fantasy-Football-Matrix/1.5.5' }
}
```

- [ ] **Step 1: Write failing policy tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNflSourcePolicy } = require('../api/nfl-source-policy');

test('regular-season policy tries current stats, previous stats, then legacy', () => {
  const p = buildNflSourcePolicy(new Date('2026-09-10T12:00:00Z'), '1.5.5');
  assert.equal(p.currentSeason, 2026);
  assert.equal(p.preseason, false);
  assert.deepEqual(p.statsCandidates.map(x => [x.kind, x.season]), [
    ['weekly', 2026],
    ['weekly', 2025],
    ['legacy', 2026]
  ]);
});

test('policy uses identical app headers for runtime and health probes', () => {
  const p = buildNflSourcePolicy(new Date('2026-09-10T12:00:00Z'), '1.5.5');
  assert.equal(p.csvHeaders['User-Agent'], 'Fantasy-Football-Matrix/1.5.5');
  assert.equal(p.jsonHeaders.Accept, 'application/json');
  assert.match(p.scoreboardUrl, /limit=100/);
});
```

- [ ] **Step 2: Run policy test and verify RED**

Run: `node --test tests/nfl-source-policy.test.js`

Expected: FAIL because `../api/nfl-source-policy` does not exist.

- [ ] **Step 3: Implement minimal pure policy module**

```js
function buildNflSourcePolicy(now = new Date(), version = '1.5.5') {
  const currentSeason = now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const preseason = now.getUTCMonth() < 8;
  const preferredStatsSeason = preseason ? currentSeason - 1 : currentSeason;
  const weeklySeasons = [preferredStatsSeason, currentSeason - 1].filter((v, i, a) => a.indexOf(v) === i);
  const rosterCandidates = [currentSeason, currentSeason - 1].map(season => ({
    season,
    url: `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`
  }));
  const statsCandidates = weeklySeasons.map(season => ({
    kind: 'weekly', season,
    url: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`
  }));
  statsCandidates.push({
    kind: 'legacy', season: preferredStatsSeason,
    url: 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv'
  });
  return {
    currentSeason, preseason, preferredStatsSeason, rosterCandidates, statsCandidates,
    scoreboardUrl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100',
    csvHeaders: { 'User-Agent': `Fantasy-Football-Matrix/${version}`, Accept: 'text/csv,text/plain,*/*' },
    jsonHeaders: { Accept: 'application/json', 'User-Agent': `Fantasy-Football-Matrix/${version}` }
  };
}
module.exports = { buildNflSourcePolicy };
```

- [ ] **Step 4: Run policy tests and verify GREEN**

Run: `node --test tests/nfl-source-policy.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/nfl-source-policy.js tests/nfl-source-policy.test.js
git commit -m "feat: centralize NFL source policy"
```

---

### Task 2: Make the Data Engine Consume the Policy

**Files:**
- Modify: `api/nfl-data.js`
- Test: `tests/nfl-source-policy.test.js`

**Interfaces:**
- Consumes: `buildNflSourcePolicy()` from Task 1.
- Preserves: current `/api/nfl-data` payload contract and fallback behavior.

- [ ] **Step 1: Extend the policy test with a static wiring assertion**

```js
const fs = require('node:fs');
const dataSource = fs.readFileSync(require.resolve('../api/nfl-data'), 'utf8');
assert.match(dataSource, /buildNflSourcePolicy/);
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/nfl-source-policy.test.js`

Expected: FAIL because `api/nfl-data.js` still defines source selection independently.

- [ ] **Step 3: Wire `api/nfl-data.js` to the policy**

At module initialization:

```js
const { buildNflSourcePolicy } = require('./nfl-source-policy');
const SOURCE_POLICY = buildNflSourcePolicy(new Date(), VERSION);
const CURRENT_SEASON = SOURCE_POLICY.currentSeason;
const PRESEASON = SOURCE_POLICY.preseason;
```

Replace hard-coded roster/stat URL construction with iteration over `SOURCE_POLICY.rosterCandidates` and `SOURCE_POLICY.statsCandidates`. Use `SOURCE_POLICY.csvHeaders` in `fetchText()` and `SOURCE_POLICY.jsonHeaders` + `SOURCE_POLICY.scoreboardUrl` in `fetchJson()`/`live()`.

Keep legacy fallback semantics: if no stat source succeeds, return role-based metrics instead of failing the whole player pool.

- [ ] **Step 4: Run targeted source and existing data tests**

Run: `node --test tests/nfl-source-policy.test.js tests/season-contracts.test.js tests/season-provider-session.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/nfl-data.js tests/nfl-source-policy.test.js
git commit -m "refactor: share NFL source policy with data engine"
```

---

### Task 3: Health Fallback Parity

**Files:**
- Modify: `api/health.js`
- Create: `tests/health-fallback.test.js`

**Interfaces:**
- Consumes: `buildNflSourcePolicy()`.
- Health response status: `LIVE | DEGRADED | STALE | OFFLINE`.
- HTTP semantics: `503` only when all roster candidates fail; otherwise `200` for LIVE and `206` for DEGRADED/STALE.

- [ ] **Step 1: Write failing mocked-fetch health tests**

Test helper:

```js
function mockRes() {
  return {
    code: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
```

Primary test cases:

```js
test('2026 stats 404 with 2025 success is healthy fallback, not outage', async () => {
  // mock current roster 200, 2026 weekly 404, 2025 weekly 200, ESPN 200
  // assert HTTP 200, status LIVE, performance.ok true, performance.fallback true,
  // active season is 2025 and attempted primary 404 remains visible in attempts.
});

test('health uses the same ESPN headers and limit as runtime', async () => {
  // reject ESPN unless User-Agent + Accept match policy and URL contains limit=100
  // assert liveScoreboard.ok === true.
});

test('all stats sources failing degrades but does not take roster data offline', async () => {
  // roster 200, every stats candidate fails, ESPN 200
  // assert HTTP 206 and status DEGRADED.
});

test('current roster failure with previous roster success is STALE rather than OFFLINE', async () => {
  // current roster 404, previous roster 200, stats/ESPN 200
  // assert HTTP 206, status STALE, roster.fallback true.
});

test('all roster candidates failing returns OFFLINE', async () => {
  // both roster candidates fail
  // assert HTTP 503 and status OFFLINE.
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/health-fallback.test.js`

Expected: FAIL because current health endpoint checks only one roster/stat source and exposes lowercase `ok/degraded/down` states.

- [ ] **Step 3: Implement ordered candidate probing**

Add helpers inside `api/health.js`:

```js
async function firstHealthy(candidates, probe) {
  const attempts = [];
  for (const candidate of candidates) {
    const result = await probe(candidate);
    attempts.push({ ...candidate, ...result });
    if (result.ok) return { active: { ...candidate, ...result }, attempts };
  }
  return { active: null, attempts };
}
```

Build roster and performance results from shared policy candidates. Scoreboard uses the shared URL/headers. Preserve enough attempt detail to explain primary failure + fallback success without exposing large response bodies.

- [ ] **Step 4: Implement truthful status classification**

Classification order:

```js
if (!roster.active) status = 'OFFLINE';
else if (roster.active.season !== policy.currentSeason) status = 'STALE';
else if (!performance.active || !scoreboard.ok) status = 'DEGRADED';
else status = 'LIVE';
```

A previous-season performance fallback during early/current-season feed lag remains `LIVE` when it is the first successful supported fallback and roster/live scoreboard are healthy, but response includes `fallback: true` and active season. A legacy stats source succeeds as `DEGRADED` because its season granularity is weaker than weekly data.

- [ ] **Step 5: Add best-effort last-success timestamps**

Use module-scope memory only:

```js
const lastSuccess = { roster: null, performance: null, scoreboard: null };
```

On a successful probe, update the relevant ISO timestamp. On failure, return the previous value if this warm instance has one; otherwise `null`. Never imply persistence across cold starts.

Response data fields:

```js
{
  source: 'nflverse',
  ok: true,
  fallback: true,
  activeSeason: 2025,
  activeKind: 'weekly',
  lastSuccessfulAt: '2026-09-10T...',
  attempts: [{ season: 2026, kind: 'weekly', ok: false, http: 404 }, ...]
}
```

- [ ] **Step 6: Run health tests and verify GREEN**

Run: `node --test tests/health-fallback.test.js tests/nfl-source-policy.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/health.js tests/health-fallback.test.js
git commit -m "fix: align health checks with runtime fallbacks"
```

---

### Task 4: Full ABL-27 Regression Gate

**Files:**
- No new production files.
- Validate all files touched in Tasks 1–3.

- [ ] **Step 1: Run targeted ownership/season/data suite**

Run:

```bash
node --test \
  tests/nfl-source-policy.test.js \
  tests/health-fallback.test.js \
  tests/sleeper-id-crosswalk.test.js \
  tests/sleeper-season-snapshot.test.js \
  tests/sleeper-provider.test.js \
  tests/sleeper-dogfood.test.js \
  tests/sleeper-live-sync-wiring.test.js \
  tests/season-contracts.test.js \
  tests/season-provider-session.test.js \
  tests/waiver-ownership-sync.test.js
```

Expected: all PASS.

- [ ] **Step 2: Run full repository regression**

Run: `node --test tests/*.test.js`

Expected: all PASS.

- [ ] **Step 3: Static deployment-safety check**

Verify `vercel.json` still contains the `CACTUSBYTE_RELEASE !== 'go'` build lock and no service-worker registration was added.

- [ ] **Step 4: Compare branch against `main`**

Expected ABL-27 production-code additions are limited to source policy + health/data parity work, alongside the already-approved Sleeper ownership branch changes and design/plan docs. No unrelated app files may appear.

- [ ] **Step 5: Commit any test-only finalization if required**

```bash
git add tests api docs
# commit only if there are legitimate uncommitted ABL-27 verification changes
```

- [ ] **Step 6: Stop at approval gate**

Do not merge to `main`. Do not modify Vercel release lock. Do not deploy. Report ABL-27 test evidence and proceed to planning ABL-28 on the same isolated branch only after ABL-27 is clean.
