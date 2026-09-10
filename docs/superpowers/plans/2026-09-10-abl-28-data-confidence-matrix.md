# ABL-28 Data Confidence Matrix™ Implementation Plan

**Goal:** Replace fragmented confidence math with one deterministic, explainable confidence authority that every season intelligence engine can reuse.

**Architecture:** Add `season-core/data-confidence.js` as a pure UMD/CommonJS module. It converts source freshness, sample size, rookie status, injury/availability, role stability, ownership certainty, source health, and volatility into a 0–100 score, `HIGH | MEDIUM | LOW | UNAVAILABLE` label, component breakdown, and human-readable reasons. Existing risk logic remains in `player-status.js`; confidence becomes a separate concept. Migrate lineup, waiver, trade, and opponent engines without changing their public output shapes except for more truthful confidence values.

**Spec:** `docs/superpowers/specs/2026-09-09-abl-27-36-fantasy-intelligence-design.md`

## Confidence policy

Start from 100 and apply deterministic penalties. Missing optional analytics (role stability/volatility) do not automatically make a decision unavailable; missing required identity/ownership or an offline source can.

- Freshness: fresh 0, stale -18, disconnected -32, unknown -24.
- Source health: LIVE 0, DEGRADED -10, STALE -18, OFFLINE => UNAVAILABLE.
- Sample size: >=8 games 0; 4–7 up to -8; 1–3 up to -20; 0 -30 when sample size is supplied.
- Limited-sample rookie cap: rookie with <4 games cannot exceed 72.
- Availability: ACTIVE/healthy 0; QUESTIONABLE -10; DOUBTFUL -24; OUT/IR/PUP -40; UNKNOWN -12.
- Role stability: when supplied, 0–100 maps to at most -15.
- Ownership: known 0; unknown -15; contradictory -35.
- Volatility: when supplied as 0–1, up to -12.
- Clamp final score 0–100. Labels: HIGH >=80, MEDIUM >=60, LOW >0, UNAVAILABLE = 0 or hard-unavailable dependency.

Every non-zero penalty must produce a short reason. Score components remain exposed for audit/debugging.

## Task 1 — Pure confidence authority

**Create:** `season-core/data-confidence.js`
**Create:** `tests/data-confidence.test.js`

TDD cases:
- same player + stale snapshot scores lower than fresh snapshot;
- 2-game rookie cannot score above 72;
- veteran with 10 games, active status, stable role and fresh sources can score HIGH;
- questionable/doubtful/out statuses lower confidence progressively;
- contradictory ownership sharply lowers confidence;
- OFFLINE required source returns `UNAVAILABLE`/0;
- reasons and component penalties explain every reduction;
- input objects are not mutated.

Exports:
```js
assessConfidence(input)
assessPlayerConfidence(player, snapshot, options)
combineConfidence(results, options)
```

## Task 2 — Migrate player-level consumers

**Modify:** `season-core/lineup-optimizer.js`
**Modify:** `season-core/waiver-assassin.js`
**Modify:** `season-core/trade-hunter.js`

- Require `data-confidence` in the existing UMD wrappers.
- Keep `player-status` as risk/availability authority.
- Replace direct `statusRisk(...).confidenceMultiplier * 100` calculations with `assessPlayerConfidence`.
- Feed available fields: `games`, `rookie`/`yearsExp`, `metrics.consistency` or explicit role stability, floor/ceiling/projection volatility, snapshot freshness, and known canonical ownership.
- Preserve existing returned `confidence` number so downstream consumers do not break.

Regression cases:
- existing lineup/waiver/trade behavior stays deterministic;
- stale data reduces confidence without changing legal ownership/lineup invariants;
- low-sample rookie waiver target does not receive HIGH confidence.

## Task 3 — Migrate opponent-level confidence

**Modify:** `season-core/opponent-exploiter.js`

- Replace hand-coded `90 - stale penalty - alerts` confidence with the shared authority.
- Combine snapshot freshness with player confidence for the optimized opponent starters and any status alerts.
- Preserve `confidence` and `risk` output fields.
- Do not turn opponent injury uncertainty into false certainty.

Regression cases:
- fresh healthy opponent analysis scores above the equivalent stale analysis;
- stale status alerts remain explicitly risky;
- existing opponent actions remain present and deterministic.

## Task 4 — Runtime wiring

**Modify:** `api/app.js` only if browser dependency ordering requires it.

If `data-confidence.js` is consumed only through modules already injected into the browser, ensure it is injected before lineup/waiver/trade/opponent modules. Do not add navigation or UI in ABL-28; later ABL-36 surfaces confidence labels/reasons.

Static test must prove dependency order and no service-worker/deployment changes.

## Task 5 — Verification gate

Run `node --test tests/*.test.js` on branch CI. Required:
- all tests pass;
- no temporary workflow remains after verification;
- `vercel.json` still has `git.deploymentEnabled=false`;
- branch diff contains only approved Fantasy Football Matrix files;
- no merge to `main`, no Vercel deployment, no preview deployment.

ABL-28 is a dependency checkpoint only. Continue to ABL-32 after this gate because Rest-of-Season Value Matrix™ supplies value inputs needed by later simulator/waiver/trade/playoff features.
