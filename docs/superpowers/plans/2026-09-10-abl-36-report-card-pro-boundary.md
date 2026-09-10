# ABL-36 Weekly Team Report Card + Pro Intelligence Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create one resilient Weekly Team Report Card that summarizes the user's roster and best actions, while defining stable entitlement-ready feature IDs for future CactusByte Pro wiring without adding billing or enforcement.

**Architecture:** Add a pure `season-core/weekly-report-card.js` composer that uses Roster Doctor as the grade authority and consumes the existing Weekly Attack Plan/advanced outputs instead of duplicating recommendation scoring. Add a pure `season-core/feature-entitlements.js` registry containing immutable feature identifiers and metadata only; it never gates features or contacts a payment service. Season Intelligence renders the Report Card as the first summary view and omits/degrades cards whose advanced source is unavailable.

**Tech Stack:** Node.js 20, browser-compatible UMD modules, built-in `node:test`, existing Season Intelligence modules.

**Spec:** `docs/superpowers/specs/2026-09-09-abl-27-36-fantasy-intelligence-design.md`

## Global Constraints

- Production remains untouched until explicit deployment approval.
- `vercel.json` remains `git.deploymentEnabled=false`.
- Runtime version authority remains `v1.5.5` during branch work.
- No service-worker registration or push notification implementation.
- No Stripe, checkout, payment SDK, entitlement backend, or feature enforcement is introduced.
- Safety-critical injury/lineup warnings, live data, ownership sync, rankings, and data health remain core/ungated.
- Advanced module absence must not prevent the Report Card from rendering.

---

### Task 1: Entitlement-ready feature registry

**Files:**
- Create: `season-core/feature-entitlements.js`
- Create: `tests/feature-entitlements.test.js`

**Interfaces:**
- Exports immutable `FEATURE_IDS`, `PRO_CANDIDATES`, `CORE_UNGATED`, and `getFeatureDescriptor(id)`.
- Stable Pro IDs: `ffm.matchup_simulator.advanced`, `ffm.waiver.faab_bid_optimizer`, `ffm.what_if_matrix`, `ffm.trade_analyzer.advanced`, `ffm.playoff_path`.
- Core IDs include live data, ownership sync, rankings, data health, injury command center, and lineup safety.

- [ ] Write RED tests for exact stable IDs, uniqueness, immutability, core/pro separation, and zero billing/enforcement behavior.
- [ ] Verify RED because the registry does not exist.
- [ ] Implement the immutable metadata registry only.
- [ ] Verify targeted and full suites GREEN.

### Task 2: Pure Weekly Team Report Card

**Files:**
- Create: `season-core/weekly-report-card.js`
- Create: `tests/weekly-report-card.test.js`

**Interfaces:**
- `buildWeeklyReportCard(snapshot, rosterId, playerValues, context={})`
- Returns `grades` for `QB`, `RB`, `WR`, `TE`, `FLEX`, `BENCH`, `OVERALL`.
- Returns cards keyed as `bestMove`, `biggestRisk`, `biggestOpportunity`, `playerToSell`, `playerToBuy`, `waiverPriority`, `nextAction`.
- Every non-null card contains `confidence`, `risk`, `freshness`, `source`, and action/detail fields.
- `context` may supply precomputed `attackPlan`, `playoffPath`, or module overrides; absent advanced outputs are omitted/degraded rather than thrown.

- [ ] Write RED tests for all required grades and cards.
- [ ] Test safety-critical status priority over convenience actions.
- [ ] Test Player to Buy/Sell are omitted when no defensible signal exists.
- [ ] Test missing advanced modules/output still renders grades/core risk card.
- [ ] Test stale freshness is propagated and inputs remain immutable.
- [ ] Implement grade composition from Roster Doctor, including FLEX from actual league flexible-slot eligibility and BENCH from Roster Doctor depth.
- [ ] Compose summary cards from existing Weekly Attack Plan outputs without rescoring underlying moves.
- [ ] Verify targeted and full suites GREEN.

### Task 3: Runtime + Report Card UI

**Files:**
- Modify: `api/app.js`
- Modify: `season-intelligence.js`
- Create: `tests/weekly-report-card-wiring.test.js`

**Interfaces:**
- Load feature registry and report-card module before Season Intelligence.
- Add `Weekly Report Card` as the first Season Intelligence summary tab while preserving existing drill-down views.
- Render grade cards and the seven summary-card slots; null advanced cards render as omitted/available-when-data-supports rather than blocking the report.

- [ ] Write RED runtime/UI tests.
- [ ] Wire modules in dependency order.
- [ ] Render compact action-first Report Card layout for narrow Android screens and Z Fold unfolded layouts.
- [ ] Keep advanced feature IDs metadata-only; do not hide or lock current features.
- [ ] Verify no Stripe/payment code, no service worker, no transaction submission, no version change, and no deployment-policy change.
- [ ] Run full `node --test tests/*.test.js` to zero failures.

### Task 4: ABL-27–36 release-candidate QA gate

**Files:**
- Create: `tests/abl-27-36-release-gate.test.js`

**Acceptance checks:**
- All ten ABL modules/runtime dependencies exist in correct order.
- Sleeper ownership fail-closed behavior remains covered.
- Stale/offline, contradictory ownership, locked-player, and deterministic replay tests remain present and passing.
- Static narrow-screen and unfolded-screen layout guardrails are present without requiring a preview deployment.
- No service-worker registration, payment dependency, production deployment enablement, or version bump occurred.
- Footer/legal/branding runtime remains loaded.

- [ ] Add the final static release-candidate guard tests.
- [ ] Run the entire repository test suite and require zero failures.
- [ ] Remove temporary ABL-36 workflow.
- [ ] Compare branch to `main` and confirm `main`/production remain untouched.
- [ ] Report Ready-for-release status and wait for Brett's explicit merge/deploy approval.
