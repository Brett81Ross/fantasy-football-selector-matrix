# Platform Expansion Gate — 2026-09-07

## Decision

Do not start a third external fantasy-platform adapter yet.

The universal core has now been proven with Manual mode and completed-draft Sleeper data, but real active-draft Sleeper polling still needs an on-the-clock dogfood run. Platform expansion stays closed until that proof is complete.

## Candidate 1 — Yahoo

Yahoo remains the product-priority next adapter because Yahoo operates an official Fantasy Sports API covering football league, team, and player data. Yahoo requires application registration and OAuth authorization for user fantasy data, so implementation requires secure server-side credential/token handling rather than a browser-only shortcut.

Sources checked 2026-09-07:
- https://developer.yahoo.com/api/
- https://developer.yahoo.com/fantasysports/guide/

Commercial/usage terms still require a dedicated review before implementation begins. Therefore Yahoo is technically viable but not yet cleared by the expansion gate.

## Candidate 2 — Fleaflicker

Fleaflicker exposes an official HTTPS API with concrete endpoints useful to the existing canonical core, including:

- `FetchLeagueDraftBoard`
- `FetchLeagueRules`
- `FetchLeagueRosters`

The draft-board response exposes draft order, rows/cells, players, team identity, slot/overall information, keepers, and an in-progress indicator. Its rules endpoint exposes roster positions and scoring rules. This maps cleanly to the current `DraftStateProvider` boundary.

Source checked 2026-09-07:
- https://www.fleaflicker.com/api-docs/index.html

Commercial/usage terms still require a dedicated review before implementation begins.

## Deliberately deferred

No ESPN, NFL.com, CBS, or MyFantasyLeague adapter is authorized by this gate. Their feasibility and terms must be established from official access before any implementation is promised.

## Gate prerequisites

A new platform adapter may begin only when:

1. active Sleeper draft synchronization has been verified against a live changing draft or dedicated test league;
2. the candidate platform's terms/commercial-use requirements have been reviewed;
3. the new adapter can conform to the existing canonical provider boundary without leaking platform-specific fields into the recommendation engine.

When all three are true, Yahoo is first choice. Fleaflicker is the fallback/secondary candidate if Yahoo is not cleared or practical.

## Current result

**Gate status: CLOSED.**

Reason: completed-draft Sleeper dogfood passed, but active live-clock external dogfood remains pending and candidate commercial/usage terms are not yet cleared.
