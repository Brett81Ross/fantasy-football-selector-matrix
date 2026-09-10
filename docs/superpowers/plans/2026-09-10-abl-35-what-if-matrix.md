# ABL-35 What-If Matrix™ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user safely simulate start/sit, add/drop, and trade scenarios against a cloned league snapshot and see the roster impact without changing Sleeper or the canonical synced state.

**Architecture:** Add one pure `season-core/what-if-matrix.js` orchestrator that validates a scenario, clones/re-normalizes league state where ownership changes, and delegates scoring to existing Lineup Optimizer, Roster Doctor, Rest-of-Season Value, Matchup Simulator, Data Confidence, and Trade Analyzer modules. The browser UI stores only the latest simulation result in local JavaScript state; `window.ffmLeagueSnapshot` is never assigned from a simulated snapshot, and Reset only clears the local simulation result and re-renders the canonical snapshot.

**Tech Stack:** Node.js 20, browser-compatible UMD modules, built-in `node:test`, existing FFM Season Contracts and Season Intelligence runtime.

**Spec:** `docs/superpowers/specs/2026-09-09-abl-27-36-fantasy-intelligence-design.md`

## Global Constraints

- Production URL remains untouched until explicit deployment approval.
- `vercel.json` must keep `git.deploymentEnabled=false`.
- Runtime version authority remains `v1.5.5` during branch work.
- No service-worker registration or push notifications.
- No roster transaction may be submitted to Sleeper or any external provider.
- No simulated state may replace `window.ffmLeagueSnapshot` or be written to localStorage.
- Original canonical snapshot and player-value inputs must remain byte-for-byte unchanged.

---

### Task 1: Pure scenario engine

**Files:**
- Create: `season-core/what-if-matrix.js`
- Create: `tests/what-if-matrix.test.js`

**Interfaces:**
- Consumes `simulateScenario(snapshot, rosterId, playerValues, scenario, context={})`.
- Supported scenario shapes:
  - `{type:'START_SIT', startPlayerId, sitPlayerId}`
  - `{type:'ADD_DROP', addPlayerId, dropPlayerId}`
  - `{type:'TRADE', counterpartRosterId, givePlayerIds, getPlayerIds}`
- Produces `{valid,errors,scenario,recommendation,before,after,deltas,confidence,risk,reasons,simulatedSnapshot}`.
- `recommendation` is exactly `IMPROVES TEAM`, `NEUTRAL`, or `HURTS TEAM`.
- `deltas` contains `lineupEdge`, `rosterValue`, `positionalDepth`, `matchupWinProbability`, `confidence`, and `risk`.

- [ ] Write failing tests for all three scenario types, invalid ownership, deterministic output, null matchup delta when unavailable, and immutable source inputs.
- [ ] Run the full suite and verify only the new What-If tests fail because the module does not exist.
- [ ] Implement strict scenario validation.
- [ ] For ownership-changing scenarios, clone the snapshot and re-normalize with Season Contracts so owned/free-agent sets cannot become contradictory.
- [ ] Reuse Trade Analyzer for trade validity and trade scoring signals.
- [ ] Reuse Lineup Optimizer, Roster Doctor, Rest-of-Season Value, Data Confidence, and Matchup Simulator for before/after scoring.
- [ ] START_SIT evaluates the specific requested legal swap rather than silently substituting the optimizer's preferred starter.
- [ ] Run targeted and full suites to GREEN.

### Task 2: Runtime and What-If UI

**Files:**
- Modify: `api/app.js`
- Modify: `season-intelligence.js`
- Create: `tests/what-if-matrix-wiring.test.js`

**Interfaces:**
- Runtime loads `season-core/what-if-matrix.js` after its scoring dependencies and before `season-intelligence.js`.
- Season Intelligence adds a `What-If Matrix` drill-down under the existing season workflow.
- UI exposes scenario selector, player/partner inputs appropriate to each scenario, Run Simulation, Reset Simulation, recommendation, before/after deltas, confidence, and risk.

- [ ] Write RED runtime/UI guardrail tests.
- [ ] Load What-If Matrix in the browser dependency chain.
- [ ] Add compact Android-first controls in the existing Season Intelligence panel without creating a new app-level navigation surface.
- [ ] Store the current simulation only in module-local UI state.
- [ ] Reset clears the local result and renders from `window.ffmLeagueSnapshot` immediately.
- [ ] Verify no assignment to `window.ffmLeagueSnapshot`, no transaction fetch, no localStorage persistence, no service-worker registration, no version change, and no deployment-policy change.
- [ ] Run `node --test tests/*.test.js` and require zero failures.
- [ ] Remove the temporary ABL-35 QA workflow and re-check branch-vs-main hygiene.
