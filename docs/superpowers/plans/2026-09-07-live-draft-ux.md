# Live Draft UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the approved universal draft core as a one-handed Live Draft Mode with one dominant recommendation, exact roster status, recent picks/undo, and clear manual fallback actions.

**Architecture:** Add a focused browser module, `live-draft-mode.js`, that reads the existing Matrix player state and the draft-core modules already implemented in ABL-01 through ABL-09. It does not own platform networking in ABL-10; it renders canonical state when available and preserves the current `fast-draft.js` manual controls as fallback. `api/app.js` will inject the draft-core modules before the new Live Draft Mode, but no Vercel configuration or production deployment occurs in this ABL.

**Tech Stack:** Plain browser JavaScript, existing HTML/CSS runtime, Node built-in `node:test` for pure presentation-model tests; no React/Zustand/service worker/new dependency.

**Spec:** `docs/superpowers/specs/2026-09-07-universal-draft-core-design.md`

## Global Constraints

- Mobile/Z Fold first and nearly scroll-free.
- One dominant recommendation with player, position, slot, and reason.
- Manual fallback actions must read `THEY TOOK HIM` and `I TOOK HIM`.
- Preserve current `fast-draft.js` draft state and undo behavior rather than creating a second manual draft source.
- FLEX choice must come from automatic FLEX/position intelligence, not a user position guess.
- Show a compact roster strip and recent-picks strip.
- ABL-10 does not implement Sleeper polling/backoff/reconnect; that is ABL-11.
- No service-worker changes, no Vercel changes, no deployment.

---

### Task 1: Pure Live Draft View Model

**Files:**
- Create: `draft-core/live-draft-view.js`
- Create: `tests/live-draft-view.test.js`

**Interfaces:**
- Consumes: player recommendation, canonical roster assignments/open slots, canonical picks, sync metadata.
- Produces: `buildLiveDraftView(input)` with `headline`, `playerName`, `position`, `slotLabel`, `reason`, `rosterChips`, `recentPicks`, `syncLabel`, and action labels.

- [ ] Write failing tests proving the exact dominant copy, Game of Throws roster strip, recent-pick ordering, and sync label.
- [ ] Run `node --test tests/live-draft-view.test.js` and confirm failure because the module does not exist.
- [ ] Implement `buildLiveDraftView` as a pure CommonJS/browser-compatible module.
- [ ] Run the focused tests and require zero failures.

### Task 2: Browser Live Draft Controller

**Files:**
- Create: `live-draft-mode.js`
- Create: `tests/live-draft-wiring.test.js`

**Interfaces:**
- Consumes: `state`, `bestDraftPlayer()`, `matrixScore()`, `FFMRosterAssignment`, `FFMPositionIntelligence`, `FFMFlexIntelligence`, `FFMLiveDraftView`, existing `#fastDrafted`, `#fastMine`, and `#fastUndo` actions.
- Produces: `#liveDraftMode` UI with recommendation card, roster strip, recent picks, and fallback buttons.

- [ ] Write a static wiring test requiring the new module to contain `THEY TOOK HIM`, `I TOOK HIM`, `Recent Picks`, and delegation to the existing fast action buttons.
- [ ] Run the wiring test and confirm failure because `live-draft-mode.js` does not exist.
- [ ] Implement the browser controller so it mounts only when the draft screen exists, updates after `renderAll`, and never creates duplicate state mutations.
- [ ] Keep manual action delegation through the existing fast buttons so current persistence/undo semantics remain authoritative.
- [ ] Run the wiring test and the existing draft-core test files.

### Task 3: App-Shell Runtime Wiring

**Files:**
- Modify: `api/app.js`
- Modify: `tests/live-draft-wiring.test.js`

**Interfaces:**
- Loads draft-core scripts in dependency order before `live-draft-mode.js`.

- [ ] Extend the static wiring test to verify `api/app.js` injects `draft-core/roster-assignment.js`, `draft-core/position-intelligence.js`, `draft-core/flex-intelligence.js`, `draft-core/live-draft-view.js`, then `live-draft-mode.js` in that order.
- [ ] Run and confirm failure against current `api/app.js`.
- [ ] Add those scripts to the app-shell runtime injection while leaving version and Vercel configuration unchanged.
- [ ] Run all ABL-10 tests and verify zero failures.
- [ ] Compare branch to `main`; allowed files are this plan, `draft-core/live-draft-view.js`, `live-draft-mode.js`, tests, and `api/app.js` only.

## QA Gate

Before PR/merge:
- Live Draft view tests green.
- Wiring tests green.
- Existing draft-core contract/evaluator/provider/reconciliation/roster/position/FLEX tests remain green.
- No `vercel.json`, service worker, backend data API, or deployment changes.
- No production deployment.
