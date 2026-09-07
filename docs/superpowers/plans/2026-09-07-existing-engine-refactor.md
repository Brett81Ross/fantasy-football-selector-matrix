# Existing Engine Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. This plan uses TDD and keeps production behavior unchanged.

**Goal:** Implement ABL-02 by extracting the current player-value, VORP/WAIT, roster-need, and tier-cliff calculations into deterministic platform-independent evaluators while preserving the existing browser UI behavior.

**Architecture:** Add one focused UMD/CommonJS module under `draft-core/` containing pure evaluator functions. Existing browser modules continue to own DOM rendering and localStorage compatibility, but delegate calculations to the pure module. No Sleeper code, network access, persistence redesign, or UI redesign is included.

**Tech Stack:** Plain JavaScript, Node built-in `node:test` + `assert/strict`, existing browser globals; no dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-universal-draft-core-design.md`

## Global Constraints

- Preserve current ranking behavior as closely as possible; this is a refactor, not a retuning pass.
- Do not add Sleeper-specific fields or calls.
- Do not change `vercel.json`, service workers, API routes, production deployment, or version authority in ABL-02.
- Pure evaluators must not touch DOM, localStorage, timers, or network.
- Existing `window.ffmVorp` and `window.ffmTiers` compatibility surfaces must remain available.
- Work only on `abl/fantasy-engine-refactor-2026-09-07`.

---

### Task 1: Pure player-value and VORP/WAIT evaluator

**Files:**
- Create: `draft-core/evaluators.js`
- Create: `tests/draft-evaluators.test.js`

**Produces:**
- `playerQuality(player, clampFn?)`
- `evaluateVorpWait(input)`

**Test cases:**
- weighted player quality matches the current formula.
- rookie zero-game `draftBase` floor is preserved.
- injured/PUP status penalty is preserved.
- VORP uses replacement baseline derived from remaining demand.
- WAIT cost increases when expected positional selections push the next option below the candidate.
- no candidate/unsupported position returns zeroed metrics rather than throwing.

### Task 2: Pure roster-need evaluator

**Files:**
- Modify: `draft-core/evaluators.js`
- Modify: `tests/draft-evaluators.test.js`

**Produces:**
- `buildLegacyRosterSnapshot(input)`
- `evaluateRosterNeed(input)`

**Test cases:**
- open natural-position starter receives the current boost curve.
- open FLEX accepts RB/WR/TE only under the existing legacy behavior.
- completed starter/FLEX need yields zero boost.
- functions operate entirely on supplied objects/arrays and never read storage.

### Task 3: Pure tier-cliff classifier

**Files:**
- Modify: `draft-core/evaluators.js`
- Modify: `tests/draft-evaluators.test.js`

**Produces:**
- `classifyTierValues(items)` where each item carries `{ player, value }`.

**Test cases:**
- stable values stay in one tier.
- a large gap creates a new tier and marks the preceding player `cliffAfter`.
- empty input returns a safe empty result.

### Task 4: Wire legacy browser modules to pure evaluators

**Files:**
- Modify: `vorp.js`
- Modify: `roster-needs.js`
- Modify: `tier-cliffs.js`
- Create: `tests/legacy-engine-wiring.test.js`

**Behavior:**
- browser modules use `globalThis.FFMDraftEvaluators` when available.
- each module retains a local fallback calculation so existing script ordering does not break the live app before the new module is added to the app shell in a later integration ABL.
- `window.ffmVorp.evaluate` remains available.
- `window.ffmTiers.classify` remains available.
- no UI copy, styling, scoring weights, or localStorage keys change.

**Static tests:**
- evaluator module contains no DOM/storage/network/timer references.
- legacy modules reference `FFMDraftEvaluators` but retain current globals and storage keys.

### Task 5: ABL-02 QA gate

Run:

```bash
node --test tests/draft-contracts.test.js tests/provider-contract.test.js tests/draft-evaluators.test.js tests/legacy-engine-wiring.test.js
```

Expected: zero failures.

Then compare branch against `main`; allowed changed files are only:
- `docs/superpowers/plans/2026-09-07-existing-engine-refactor.md`
- `draft-core/evaluators.js`
- `tests/draft-evaluators.test.js`
- `tests/legacy-engine-wiring.test.js`
- `vorp.js`
- `roster-needs.js`
- `tier-cliffs.js`

Stop before merge/deploy. Production remains untouched.