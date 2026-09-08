# Season Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provider-neutral in-season intelligence system that grades rosters and recommends maximum-edge lineups, waivers, trades, and opponent-specific actions while accounting for player availability/status.

**Architecture:** Extend the existing canonical provider boundary with a normalized LeagueSnapshot, then feed focused pure-function intelligence engines from that single snapshot. Sleeper supplies the first live implementation; UI consumes a composed Weekly Attack Plan and drill-down results without independently deciding ownership or status.

**Tech Stack:** Browser JavaScript/CommonJS-compatible modules, existing draft-core architecture, Sleeper HTTP API adapter, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-season-intelligence-design.md`

## Global Constraints
- Maximum Edge recommendations show confidence, expected upside, downside/risk, and reasoning.
- Never autonomously submit starts, drops, waiver claims, or trades.
- No user, league, roster ID, league size, scoring format, or lineup structure may be hard-coded.
- Current roster ownership is authoritative for availability.
- Provider IDs must be normalized before recommendation logic.
- Stale/unknown status is never silently treated as healthy/current.
- Existing Vercel deployment lock remains enabled; no preview or production deployment during implementation.
- Avoid service workers.

---

### ABL-16: Canonical In-Season League Snapshot
**Files:** Create `season-core/contracts.js`; modify `draft-core/sleeper-provider.js`; test `tests/season-contracts.test.js`, `tests/sleeper-season-snapshot.test.js`.
**Produces:** `normalizeLeagueSnapshot(input)` returning normalized league/week/rosters/ownership/freeAgents/status/freshness.
- [ ] Write failing tests proving two differently structured leagues normalize without hard-coding and every owned player is excluded from free agents.
- [ ] Run targeted tests and verify RED.
- [ ] Implement immutable snapshot contracts and Sleeper normalization using existing Matrix-ID crosswalk behavior.
- [ ] Run targeted tests and verify GREEN.
- [ ] Run draft/post-draft provider regressions and commit.

### ABL-17: Player Availability & Risk Monitor
**Files:** Create `season-core/player-status.js`; test `tests/player-status.test.js`.
**Consumes:** normalized player metadata/status from ABL-16.
**Produces:** `normalizePlayerStatus(player)`, `statusRisk(status, freshness)`.
- [ ] Write failing cases for IR, PUP, Questionable, Doubtful, Out, active/healthy, unknown, and stale data.
- [ ] Verify RED.
- [ ] Implement canonical status categories, severity, availability and stale/unknown confidence penalties.
- [ ] Verify GREEN and commit.

### ABL-18: Roster Doctor
**Files:** Create `season-core/roster-doctor.js`; test `tests/roster-doctor.test.js`.
**Consumes:** LeagueSnapshot, Matrix player values/projections, status risk.
**Produces:** `evaluateRoster(snapshot, rosterId, playerValues)` with overall grade, positional grades, weaknesses, strengths, surplus and health/bye risk.
- [ ] Write failing tests with weak RB/strong WR, injury exposure, bench depth and alternate league slots.
- [ ] Verify RED.
- [ ] Implement replacement-value and slot-aware grading without fixed roster assumptions.
- [ ] Verify GREEN and commit.

### ABL-19: Maximum-Edge Lineup Optimizer
**Files:** Create `season-core/lineup-optimizer.js`; test `tests/lineup-optimizer.test.js`.
**Consumes:** snapshot, roster evaluation, values/projections, status risk.
**Produces:** `optimizeLineup(...)` with legal starters, bench, swaps, contingencies, expected edge, confidence/risk/reasoning.
- [ ] Write failing tests for QB/RB/WR/TE/FLEX/K/DST, multi-FLEX, a famous/high-value player correctly benched for a superior expected play, and Questionable contingency.
- [ ] Verify RED.
- [ ] Implement deterministic legal-slot optimization and Maximum Edge decision metadata.
- [ ] Verify GREEN and commit.

### ABL-20: Waiver Assassin
**Files:** Create `season-core/waiver-assassin.js`; test `tests/waiver-assassin.test.js`.
**Consumes:** snapshot.freeAgentPlayerIds, roster evaluation, lineup optimizer, values/status.
**Produces:** `rankWaiverMoves(...)` containing explicit add/drop pairs, priority, improvement, risk, confidence and rationale.
- [ ] Write failing tests proving owned players can never appear, weak positions are prioritized, aggressive bench churn is allowed, and IR/PUP/status risk affects ranking.
- [ ] Verify RED.
- [ ] Implement add/drop delta scoring plus streamer/stash classification.
- [ ] Verify GREEN and commit.

### ABL-21: Whole-League Trade Hunter
**Files:** Create `season-core/trade-hunter.js`; test `tests/trade-hunter.test.js`.
**Consumes:** evaluations for every roster plus values/status.
**Produces:** `findTradeOpportunities(...)` with counterpart roster, give/get players, complementary need, expected improvement, risk/confidence/rationale.
- [ ] Write failing tests where user's WR surplus and opponent RB surplus produce a sensible complementary target; reject deals that do not improve user or have invalid ownership.
- [ ] Verify RED.
- [ ] Implement whole-league need/surplus matching and buy-low/sell-high signals using available value inputs.
- [ ] Verify GREEN and commit.

### ABL-22: Opponent Exploiter
**Files:** Create `season-core/opponent-exploiter.js`; test `tests/opponent-exploiter.test.js`.
**Consumes:** current-week matchup identity, both roster evaluations, lineup/waiver/trade outputs.
**Produces:** `analyzeOpponent(...)` with matchup edges, opponent weak points and linked actionable counters.
- [ ] Write failing tests for current opponent identification, injury-driven weakness, positional vulnerability, and no-opponent/bye behavior.
- [ ] Verify RED.
- [ ] Implement current-week comparison while preserving whole-league intelligence separately.
- [ ] Verify GREEN and commit.

### ABL-23: Weekly Attack Plan Composer
**Files:** Create `season-core/weekly-attack-plan.js`; test `tests/weekly-attack-plan.test.js`.
**Consumes:** ABL-18 through ABL-22 outputs.
**Produces:** `buildWeeklyAttackPlan(...)` with roster grade, biggest weakness, opponent edge, lineup actions, top waiver action, top trade action, urgent status alerts and snapshot freshness.
- [ ] Write failing composition tests including conflicting candidate actions and stale-data confidence reduction.
- [ ] Verify RED.
- [ ] Implement deterministic prioritization so engines cannot present contradictory primary actions.
- [ ] Verify GREEN and commit.

### ABL-24: In-Season Sync & Refresh Reliability
**Files:** Create `season-core/provider-session.js`; modify `sleeper-live-sync.js`; test `tests/season-provider-session.test.js`.
**Consumes:** Sleeper normalized snapshot.
**Produces:** fresh/stale/disconnected in-season state and `ffm:season-state` event.
- [ ] Write failing tests proving completed drafts continue low-frequency in-season refresh, LKG is marked stale on failure, and recovered data replaces stale ownership/status.
- [ ] Verify RED.
- [ ] Implement conservative in-season refresh/backoff without restoring draft-speed polling after completion.
- [ ] Verify GREEN and commit.

### ABL-25: Season Intelligence UI
**Files:** Create `season-intelligence.js`; modify `api/app.js`; test `tests/season-intelligence-ui.test.js`.
**Consumes:** Weekly Attack Plan and drill-down engine outputs.
**Produces:** Weekly Attack Plan primary surface plus Roster, Waivers, Trades, Opponent and Player Status drill-down views.
- [ ] Write failing DOM/static contract tests for the summary fields, action metadata, status badges and recommendation-only semantics.
- [ ] Verify RED.
- [ ] Implement mobile-first/Z Fold-friendly rendering and runtime injection using existing app visual conventions.
- [ ] Verify GREEN and commit.

### ABL-26: Full-System Replay & Regression Gate
**Files:** Create `tests/season-replay.test.js`; extend existing regression fixtures only where contracts changed.
**Consumes:** all Season Intelligence modules.
**Produces:** deterministic week-level replay proof.
- [ ] Add fixtures for multiple league sizes/lineups, ownership changes, injury changes, waiver availability, trades, opponent changes and stale/recovery transitions.
- [ ] Run replay tests after each simulated change and assert ownership/lineup/action invariants.
- [ ] Run `node --test tests/*.test.js` and syntax checks for every new/modified runtime file.
- [ ] Confirm draft mode, completed-draft mode and current roster-authority fix remain green.
- [ ] Remove any temporary QA workflow, verify `vercel.json` still has `deploymentEnabled:false`, and commit QA closure.

## Deployment Gate
After ABL-16 through ABL-26 are green, report exact test totals and changed files. Do not unlock Vercel, create a preview, or deploy production until Brett explicitly approves deployment.