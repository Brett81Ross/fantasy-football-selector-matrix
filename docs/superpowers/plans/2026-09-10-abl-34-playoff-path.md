# ABL-34 Playoff Path™ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the user's estimated path to the fantasy playoffs, the weeks with the most leverage, schedule difficulty, and the roster weakness most likely to reduce playoff odds—without fabricating a probability when standings or schedule data is incomplete.

**Architecture:** Extend the canonical LeagueSnapshot with optional normalized standings records and remaining regular-season matchups sourced from Sleeper. Add a pure deterministic `season-core/playoff-path.js` engine that reuses Lineup Optimizer, Roster Doctor, Rest-of-Season Value Matrix™, and Data Confidence Matrix™. Full probability mode is available only when playoff settings, standings, and the remaining schedule are complete; otherwise the engine returns a clearly labeled readiness mode with `playoffProbability:null`.

**Tech Stack:** JavaScript UMD/CommonJS modules, Node `node:test`, Sleeper read-only API, existing LeagueSnapshot contracts and Season Intelligence UI.

**Spec:** `docs/superpowers/specs/2026-09-09-abl-27-36-fantasy-intelligence-design.md`

## Global Constraints

- No Vercel preview deployments.
- No production deployment until Brett explicitly approves the completed ABL batch.
- Keep `vercel.json` `git.deploymentEnabled=false` during implementation and QA.
- Keep app version authority at `1.5.5` during branch work.
- Do not introduce service workers.
- Do not introduce payment, database, or automatic Sleeper transaction dependencies.
- Degrade missing data explicitly instead of inventing standings, schedules, probabilities, or playoff strength.
- Keep calculations deterministic and explainable.
- Preserve narrow-screen/Z Fold usability; actionable recommendations come before secondary detail.

---

### Task 1: Canonical Standings and Remaining Schedule

**Files:**
- Modify: `season-core/contracts.js`
- Modify: `draft-core/sleeper-provider.js`
- Modify: `tests/season-contracts.test.js`
- Modify: `tests/sleeper-season-snapshot.test.js`

**Interfaces:**
- `LeagueSnapshot.rosters[].record` -> `{wins,losses,ties,pointsFor,pointsAgainst}` or `null`.
- `LeagueSnapshot.remainingSchedule` -> frozen array of `{week,rosterId,opponentRosterId,matchupId}`.
- `LeagueSnapshot.scheduleCoverage` -> `{expectedWeeks,loadedWeeks,complete}`.
- `league.playoffWeekStart` and `league.playoffTeams` remain optional positive integers.

- [ ] **Step 1: Write failing contract/provider tests**

Require that record fields normalize without changing ownership; unknown record remains `null`; schedule entries only include valid roster IDs and positive weeks; Sleeper roster `settings.wins/losses/ties/fpts/fpts_decimal/fpts_against/fpts_against_decimal` normalize into canonical records; `settings.playoff_week_start` and `settings.playoff_teams` flow into league settings; future matchup endpoints map same-`matchup_id` roster pairs into canonical schedule rows.

- [ ] **Step 2: Run RED gate**

Run: `node --test tests/season-contracts.test.js tests/sleeper-season-snapshot.test.js`
Expected: FAIL on missing standings/schedule fields.

- [ ] **Step 3: Implement normalization and Sleeper enrichment**

Use `Promise.allSettled` for future matchup weeks so one unavailable week does not destroy the entire season snapshot. Fetch from `week+1` through `playoffWeekStart-1`. Build `scheduleCoverage.complete=true` only when every expected regular-season week loaded successfully. Never infer a missing opponent.

- [ ] **Step 4: Run GREEN gate**

Run: `node --test tests/season-contracts.test.js tests/sleeper-season-snapshot.test.js`
Expected: PASS.

---

### Task 2: Pure Playoff Path Engine

**Files:**
- Create: `season-core/playoff-path.js`
- Create: `tests/playoff-path.test.js`

**Interfaces:**
- Consumes: `buildPlayoffPath(snapshot, rosterId, playerValues, context={})`.
- Produces: `{mode,playoffProbability,readinessScore,currentSeedEstimate,scheduleDifficulty,leverageWeeks,biggestWeakness,improvementTarget,confidence,risk,freshness,reasons,risks}`.

- [ ] **Step 1: Write failing unit tests**

Cover: complete standings + complete schedule produces a 0–100 probability; stronger roster/easier path improves probability versus an otherwise identical weaker path; leverage weeks are sorted by conditional playoff-probability swing; missing standings sets `mode:'READINESS'` and `playoffProbability:null`; partial schedule does the same; readiness remains deterministic; stale data lowers confidence; original snapshot/player values remain unchanged.

- [ ] **Step 2: Run RED gate**

Run: `node --test tests/playoff-path.test.js`
Expected: FAIL because `season-core/playoff-path.js` does not exist.

- [ ] **Step 3: Implement deterministic engine**

Use existing Lineup Optimizer expected totals as team-strength inputs. In probability mode, run a deterministic seeded simulation of remaining league matchups using logistic head-to-head win probabilities and current records. Rank simulated final standings by wins plus half ties, then points-for proxy, and count top `playoffTeams` finishes. For each future user matchup, repeat with that matchup forced to win and forced to loss; leverage is the difference between those conditional playoff rates. Keep all randomization seeded from stable league/week inputs so identical inputs are deep-equal.

In readiness mode, combine normalized roster grade, optimized-lineup strength relative to league, depth/resilience, and rest-of-season value. Do not populate `playoffProbability`.

Schedule difficulty is based on remaining opponents' optimized lineup strength relative to league strength. The actionable improvement target must come from Roster Doctor's weakest demanded position.

- [ ] **Step 4: Run GREEN gate**

Run: `node --test tests/playoff-path.test.js`
Expected: PASS.

---

### Task 3: Runtime + Season Intelligence UI

**Files:**
- Modify: `api/app.js`
- Modify: `season-intelligence.js`
- Create: `tests/playoff-path-wiring.test.js`

**Interfaces:**
- Browser global: `window.FFMPlayoffPath`.
- Load after Data Confidence, ROS, Roster Doctor, and Lineup Optimizer; before Weekly Attack Plan / Season Intelligence.

- [ ] **Step 1: Write failing wiring/UI tests**

Require runtime order, a `Playoff Path` Season Intelligence surface, visible `PLAYOFF PROBABILITY` only when the engine returns a probability, explicit `PLAYOFF READINESS` degraded copy otherwise, `MUST-WIN`/`HIGH LEVERAGE` week display, `SCHEDULE DIFFICULTY`, `BIGGEST PLAYOFF RISK`, and `IMPROVEMENT TARGET`.

- [ ] **Step 2: Run RED gate**

Run: `node --test tests/playoff-path-wiring.test.js`
Expected: FAIL on missing runtime/UI wiring.

- [ ] **Step 3: Implement runtime/UI**

Add `season-core/playoff-path.js` to the app runtime. Add one horizontally scrollable `Playoff Path` tab within existing Season Intelligence rather than a new top-level app navigation section. Render the actionable risk/target first, then probability/readiness and schedule/leverage detail. Preserve the existing single-column layout below 560px.

- [ ] **Step 4: Run GREEN gate**

Run: `node --test tests/playoff-path-wiring.test.js`
Expected: PASS.

---

### Task 4: Full Regression and Hygiene

**Files:**
- Temporary only: `.github/workflows/abl-34-playoff-qa.yml`

- [ ] **Step 1: Run full repository suite**

Run: `node --test tests/*.test.js`
Expected: all tests PASS.

- [ ] **Step 2: Verify release guardrails**

Confirm deployment remains disabled, version authority remains `1.5.5`, no new service-worker registration exists, and Playoff Path is recommendation-only.

- [ ] **Step 3: Remove temporary QA workflow**

Delete `.github/workflows/abl-34-playoff-qa.yml` after capturing final GREEN evidence.

- [ ] **Step 4: Compare branch to main**

Confirm work remains only on `abl-sleeper-id-crosswalk`. Do not merge or deploy.

After this checkpoint, continue to ABL-35 What-If Matrix™.