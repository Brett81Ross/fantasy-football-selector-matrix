# Sleeper Dogfood QA — 2026-09-07

## Scope

Real-data validation of the Sleeper provider against the 2026 `Game of Throws` league for the connected test identity supplied by the product owner.

This QA uses Sleeper's read-only public API. It does not deploy the app and does not change production.

## Live API facts verified

- User lookup resolves successfully.
- League: `Game of Throws`.
- Season: 2026.
- League size: 16 teams.
- Draft type: snake.
- Draft status: complete.
- Draft length: 15 rounds / 240 total selections.
- Roster shape: QB 1, RB 2, WR 2, TE 1, FLEX 2, K 1, DEF 1, bench 5.
- The owner identity resolves through Sleeper `draft_order` to draft slot 12 and then through `slot_to_roster_id` to roster 1.

## Real-data issue discovered

The first Sleeper provider implementation assumed the external `player_id` could be used directly as the canonical Matrix player ID.

That is not safe:

- Sleeper uses its own player IDs.
- The Matrix player pool currently uses nflverse GSIS IDs.
- Sleeper defenses use team IDs such as `ATL` while the Matrix uses IDs such as `DST-ATL`.

Without a crosswalk, a player could be drafted in Sleeper but remain available in the Matrix recommendation pool.

## Correction

The provider boundary now resolves a Sleeper pick to the Matrix player pool in this order:

1. DEF is canonicalized directly to `DST-<TEAM>`.
2. Exact player ID is used when the supplied Matrix pool already contains it.
3. Otherwise the provider matches normalized Sleeper first/last name against the Matrix player name.
4. If a name is ambiguous, position and current team are used as tie-breakers.
5. If no safe Matrix match exists, the raw Sleeper ID is retained instead of inventing an identity.

This also prevents Sleeper's occasional unusual position metadata from being allowed to redefine the Matrix player's canonical position. Once the player resolves to the Matrix pool, the Matrix position remains authoritative for roster assignment.

## Fixture coverage

A real-shape regression fixture locks:

- 16-team league identity.
- two FLEX slots.
- one defense slot normalized to DST.
- five bench slots.
- owner -> draft slot 12 -> roster 1 mapping.
- completed-draft semantics (`currentPick = null`, `picksUntilMyNext = null`).
- Sleeper offensive IDs resolving to Matrix GSIS IDs.
- Sleeper `ATL` defense resolving to `DST-ATL`.
- drafted Matrix IDs disappearing from `availablePlayerIds`.

## Gate result

**Completed-draft dogfood: PASS with crosswalk correction.**

The completed draft is sufficient to validate user resolution, league settings, draft order, authoritative pick history, player-ID normalization, completed-state semantics, and replay inputs.

**Active live-clock dogfood: PENDING.**

Because this draft is already complete, it cannot validate real-time on-the-clock polling latency, transient 429/network recovery during an active draft, or mid-draft reconnect behavior against Sleeper's live changing state. Those behaviors are covered deterministically by the reliability/replay tests but require the next active or dedicated test draft for a true external dogfood run.

## Commercial gate

No conclusion here changes the existing commercial-use gate. Sleeper-dependent monetization remains blocked pending explicit commercial-use permission/licensing confirmation.