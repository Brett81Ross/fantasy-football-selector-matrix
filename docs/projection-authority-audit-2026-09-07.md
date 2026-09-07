# Fantasy Football Matrix — Projection Authority Audit

Date: 2026-09-07
ABL: 03 — Projection Authority Audit

## Decision

The first production-safe forward-looking authority will be **Matrix Forecast**, a CactusByte-derived forecast built from permitted data inputs. Raw nflverse historical statistics remain a **Historical baseline** and must not be presented to users as a formal projection.

Licensed external projections may override Matrix Forecast later, but only when their commercial-use terms are satisfied and the source is explicitly enabled.

## Current State

The app currently uses:
- current NFL roster/status data,
- historical weekly player statistics,
- rookie draft capital fallback,
- Matrix-created production/opportunity/consistency/ceiling/trend/availability metrics,
- dynamic VORP, roster need, tier cliff, and wait-cost calculations.

Those inputs are useful draft signals, but historical performance by itself is not a forward-looking projection feed.

## Source Audit

### nflverse

Status: **Approved base data source**.

- nflverse-data is distributed under CC BY 4.0.
- It is appropriate for roster, player, historical performance, play-by-play-derived, and other permitted analytical inputs with attribution.
- The Matrix may transform these inputs into its own forecast/model outputs.

References:
- https://github.com/nflverse/nflverse-data
- https://nflreadpy.nflverse.com/

### FantasyPros

Status: **Do not use in the commercial app without a commercial agreement**.

- FantasyPros provides rankings/projections APIs.
- Its current API guidance states that paid applications, business use, revenue-generating products, and data redistribution require separate commercial API access.
- Free access is for personal/non-production use; premium access remains personal/non-commercial.

References:
- https://www.fantasypros.com/api-data/
- https://support.fantasypros.com/hc/en-us/articles/49749297704475-How-do-I-request-access-to-the-FantasyPros-API

### Sleeper projections

Status: **Do not make an undocumented Sleeper projection endpoint an authority**.

- Sleeper's documented public API covers users, leagues, drafts, picks, rosters, and player data.
- Official docs state the API is free for non-commercial use and commercial use requires contacting Sleeper for licensing.
- Community libraries reference undocumented stats/projection endpoints, but undocumented endpoints are not a suitable production authority for CactusByte.

Reference:
- https://docs.sleeper.com/

## Phase-One Authority Chain

1. A licensed external projection source, if one has been explicitly configured and approved.
2. Matrix Forecast, when a current forecast is available.
3. Historical baseline, when no forward-looking forecast is available.

The app must never silently label step 3 as a projection.

## Matrix Forecast Requirements

Matrix Forecast will be a forward-looking CactusByte calculation, not a copied third-party projection. Its implementation belongs to the later recommendation/data ABL work and should use only permitted inputs.

Initial inputs should include:
- recent and prior-season production,
- opportunity volume and high-value opportunities,
- availability/status,
- positional usage,
- team/roster context available from approved sources,
- rookie draft capital where established NFL history is unavailable.

The forecast must carry source metadata and generation time so the recommendation engine can explain what it is using.

## Freshness Rules

Every forecast payload must expose a generation timestamp.

The authority layer distinguishes:
- `fresh` — within the configured maximum age,
- `stale` — older than the configured maximum age but still usable as last-known-good context,
- `unavailable` — no valid timestamp/source data.

The current ABL-03 module intentionally does not hard-code a universal maximum age. Preseason/draft-rank data and in-season weekly forecasts have different refresh expectations; the consuming data pipeline must provide the correct maximum age.

## User-Facing Labels

Allowed:
- `Matrix Forecast`
- `Matrix Forecast · STALE`
- `Historical baseline`
- explicit licensed-provider labels when enabled

Not allowed:
- calling the historical baseline a projection,
- implying nflverse publishes the Matrix recommendation,
- implying an undocumented third-party endpoint is guaranteed or licensed.

## Engineering Boundary

`draft-core/projection-authority.js` centralizes authority selection, licensing gates, freshness state, and presentation labels. It performs no network requests and does not change the current live recommendation engine in ABL-03.

## Gate Result

ABL-03 is complete when:
- the authority policy is codified,
- tests prove the fallback chain and labeling rules,
- no external commercial projection feed is silently introduced,
- production runtime behavior remains unchanged.

Next ABL: **ABL-04 — Manual Draft Provider**.