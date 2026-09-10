# ABL-30 — Late-Swap / Injury Command Center Implementation Plan

## Objective
Build a pure in-app decision engine that identifies roster situations needing attention before kickoff: OUT/IR/PUP starters, Doubtful and Questionable starters, bye-week starters, locked players, and late-swap timing risk. It must recommend only legal replacements and must never invent kickoff/lock information.

## Source-of-truth rules
- LeagueSnapshot roster ownership and `starterPlayerIds` are authoritative when present.
- If the provider has no starter assignment, fall back to the existing Lineup Optimizer for a legal active lineup.
- Player health comes from canonical `playerStatuses`; use existing Player Status normalization.
- Kickoff/lock state comes only from explicit schedule context keyed by player or team. Missing schedule data means `lockState: UNKNOWN`, never an inferred lock.
- Bye state comes from explicit `onBye` or a numeric `byeWeek` matching `snapshot.week`.
- All recommendations are advisory. No roster transactions.

## Public API
`buildCommandCenter(snapshot, rosterId, playerValues, context={})`

Context may contain:
- `now` ISO timestamp (defaults to current time only for evaluating supplied kickoff timestamps)
- `kickoffsByPlayerId`
- `kickoffsByTeam`
- `sourceHealth`
- `lateSwapWindowMinutes` (default 120)

Output:
- `rosterId`, `week`, `generatedAt`
- `attentionRequired`
- `criticalCount`, `highCount`, `watchCount`
- `alerts[]` sorted CRITICAL → HIGH → WATCH → INFO
- each alert: `type`, `severity`, `playerId`, `name`, `position`, `status`, `isStarter`, `lockState`, `kickoffAt`, `actionable`, `replacementPlayerId`, `replacementName`, `confidence`, `risk`, `reason`

## Alert policy
1. `UNAVAILABLE_STARTER` — OUT/IR/PUP starter. CRITICAL if unlocked/unknown and a move is possible; INFO if already locked because no lineup change is possible.
2. `DOUBTFUL_STARTER` — HIGH when unlocked/unknown.
3. `QUESTIONABLE_STARTER` — WATCH normally; HIGH when a viable backup locks within the late-swap window before the questionable player kicks off.
4. `BYE_STARTER` — CRITICAL if unlocked/unknown; INFO if already locked.
5. `LOCKED_STARTER` — INFO metadata; never recommend an impossible swap.
6. Locked bench players are not presented as lineup emergencies by themselves.

## Replacement rules
- Use actual starter identity where available.
- Legal replacements must respect canonical roster-slot eligibility.
- Prefer the highest `lineupScore` / projection among available, unlocked bench players.
- Do not recommend OUT/IR/PUP or bye players as replacements.
- For ambiguous FLEX/SUPERFLEX assignments, derive a legal slot assignment from league roster rules rather than hard-coding positions.

## Confidence/risk
- Reuse Data Confidence Matrix for the affected player and replacement.
- Stale/disconnected source state reduces confidence but does not erase the alert.
- Risk is separate from confidence.

## TDD gates
- RED: module absent.
- GREEN core: OUT starter, Doubtful/Questionable priority, bye starter, locked starter no impossible move, late-swap backup timing, missing schedule stays UNKNOWN, SUPERFLEX legality, immutable inputs.
- Browser wiring: load after player status, confidence, and lineup optimizer; before Season Intelligence.
- UI: add a Command Center tab/card without service workers or notifications.
- Full regression: `node --test tests/*.test.js`.
- Cleanup: remove temporary branch-only CI workflow after final GREEN.
