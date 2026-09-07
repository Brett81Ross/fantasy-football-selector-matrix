# Fantasy Football Matrix — Universal Draft Core Design

Date: 2026-09-07
Status: Approved architecture, staged for implementation
Branch: `abl/fantasy-universal-draft-core-2026-09-07`

## Objective

Make live fantasy drafts substantially more automatic and less chaotic by separating platform ingestion from a single recommendation core. The first production implementation will support Sleeper plus a first-class Manual provider. Additional platforms will plug into the same contracts only after Sleeper proves the model in real use.

The user experience goal is simple: the app should know who is drafted, who is still available, which players belong to the user, what roster slots remain, and which player/position should be taken next. FLEX decisions must be automatic across all eligible positions.

## Non-Goals for the First Release

The first release will not implement auction-draft strategy, Monte Carlo draft simulation, full dynasty/keeper support, full IDP support, speculative ESPN/NFL/CBS adapters, or user-facing tuning sliders for recommendation weights. The schema must not prevent those later features, but they are intentionally deferred.

## Architecture

The data flow is:

`Platform Provider -> Normalized Pick Events -> Canonical DraftState -> Recommendation Evaluators -> Recommendation -> UI`

The recommendation layer must never read Sleeper-specific fields directly. Platform providers are responsible for converting external data into canonical contracts.

The current app is a browser-first JavaScript application with existing state, VORP, roster-need, tier, WAIT-cost, and live-refresh behavior. The new design evolves those capabilities rather than replacing them or introducing a new frontend framework/state library without need.

## Canonical Contracts

### LeagueSettings

```ts
interface LeagueSettings {
  leagueId: string;
  platform: 'manual' | 'sleeper' | string;
  season: number;
  scoring: Record<string, number>;
  teams: number;
  draftType: 'snake' | 'linear' | 'auction';
  rosterSlots: RosterSlot[];
}
```

### RosterSlot

```ts
interface RosterSlot {
  id: string;
  type: string;
  count: number;
  eligiblePositions: string[];
  isBench?: boolean;
  isReserve?: boolean;
}
```

Roster slots are first-class and flexible. The engine must not assume a fixed QB/RB/WR/TE/FLEX shape.

### PickEvent

```ts
interface PickEvent {
  pickId: string;
  draftId: string;
  overall: number;
  round: number;
  pickInRound: number;
  playerId: string;
  teamId: string;
  originalOwnerTeamId?: string;
  timestamp?: string;
  source: 'manual' | 'sleeper' | string;
}
```

Pick events are append-oriented and chronologically ordered. Reconciliation may replace the materialized state from an authoritative full pick history, but pick identity must remain stable.

### DraftState

```ts
interface DraftState {
  draftId: string;
  league: LeagueSettings;
  status: 'not_started' | 'pre_draft' | 'live' | 'paused' | 'completed';
  myTeamId: string | null;
  currentPick: {
    round: number;
    pickInRound: number;
    overall: number;
    onTheClockTeamId?: string;
  } | null;
  picksUntilMyNext: number | null;
  teams: DraftTeam[];
  picks: PickEvent[];
  draftedPlayerIds: string[];
  availablePlayerIds: string[];
  myRoster: PlayerAssignment[];
  recentPicks: PickEvent[];
  sync: {
    status: 'live' | 'stale' | 'disconnected' | 'manual';
    lastSuccessfulSyncAt: string | null;
    lastAttemptAt: string | null;
    consecutiveFailures: number;
  };
}
```

### PlayerAssignment

```ts
interface PlayerAssignment {
  playerId: string;
  slotId: string;
  position: string;
}
```

Assignments are derived from the roster-slot model. FLEX assignment must consider all eligible natural positions. Bench assignments are explicit rather than inferred from overfilling a positional starter count.

### Recommendation

```ts
interface Recommendation {
  playerId: string;
  position: string;
  slotId: string | null;
  score: number;
  components: {
    playerValue: number;
    rosterNeed: number;
    positionalDropoff: number;
    tierCliff: number;
    waitCost: number;
  };
  explanation: string;
  generatedAt: string;
  basedOnSyncAt: string | null;
}
```

## Provider Boundary

A provider exposes normalized league and draft information without leaking platform-specific structures into the core.

```ts
interface DraftStateProvider {
  platform: string;
  connect(input: unknown): Promise<void>;
  listLeagues(): Promise<LeagueSummary[]>;
  loadLeague(leagueId: string): Promise<LeagueSettings>;
  loadDraft(draftId: string): Promise<DraftState>;
  loadPicks(draftId: string): Promise<PickEvent[]>;
}
```

Phase 1 providers:

1. `manual` — local/manual pick events and league configuration.
2. `sleeper` — username -> leagues -> league -> draft -> picks -> normalized state.

No Yahoo/Fleaflicker/ESPN adapter code is included in this first implementation cycle.

## Recommendation Pipeline

The existing recommendation logic will be preserved but split conceptually into deterministic evaluators:

1. Player value — existing quality/VORP-style signal.
2. Roster need — value of filling the best legal remaining starting slot.
3. Positional drop-off — expected loss before the user’s next pick.
4. Tier cliff — penalty for crossing an existing positional tier boundary.
5. Wait cost — projected quality lost by waiting.

The final recommendation combines evaluator outputs through internal defaults. User-facing weight tuning is deferred.

The engine consumes a pure `DraftState` snapshot plus the player-value dataset. It does not perform network requests.

## FLEX Intelligence

FLEX is modeled as a marginal-value decision with cheap roster assignment:

1. Determine all legal open slots for a candidate.
2. Compute the candidate’s improvement in the best legal slot.
3. Compare FLEX-eligible RB/WR/TE candidates using the same process.
4. Adjust with positional drop-off, tier cliff, and wait cost.
5. Recommend both the player and the position/slot rationale.

The engine should tell the user what to do, not ask the user to choose the FLEX position manually.

## Sync and Reconciliation

Sleeper sync will start with REST polling. Push/WebSocket behavior is not required for the first release.

Rules:

- Poll only while the live draft experience is active or when the app regains focus.
- Use conservative intervals and backoff rather than sub-second polling.
- Keep the latest valid `DraftState` as last-known-good state.
- Surface freshness explicitly in the UI.
- On failed sync, continue recommendations from the last-known-good snapshot.
- On reconnect, fetch authoritative full pick history and rebuild/reconcile state rather than assuming no incremental events were missed.
- Repeated failures transition the UI to stale/disconnected state and expose manual correction/fallback.
- Avoid service-worker-based draft synchronization.

## Projection / Ranking Authority

The current app already derives player quality from nflverse-backed roster/statistical data and existing heuristics. Before the new engine is treated as authoritative for forward-looking draft recommendations, the implementation must audit whether those signals are sufficient or whether a separate projection/ranking source is required.

The first implementation must make the player-value source explicit and track freshness/fallback behavior. It must not silently imply that historical production equals a formal forward projection.

## Manual Provider

Manual mode is a first-class provider, not an emergency afterthought. It enables:

- deterministic engine development without an external API,
- live fallback if Sleeper becomes unavailable,
- correction of mismatched external state,
- replay testing from recorded draft events.

## Reliability States

The UI must distinguish:

- `LIVE` — current provider state recently verified,
- `STALE` — last-known-good state is usable but older than expected,
- `DISCONNECTED` — provider sync has repeatedly failed,
- `MANUAL` — user is operating from manual state.

Recommendations remain available in stale/disconnected states, but their freshness must be visible.

## Testing Strategy

### Contract tests
Validate canonical draft objects, slot eligibility, pick ordering, duplicate-pick rejection, and sync metadata.

### Recommendation tests
Use static snapshots to verify:

- drafted players cannot be recommended,
- player availability updates after each pick,
- user picks update roster state,
- FLEX compares eligible RB/WR/TE candidates,
- recommendation position changes as roster needs change,
- K/DEF logic remains late-round biased where applicable,
- stale provider state still yields a recommendation based on the last-known-good snapshot.

### Replay tests
Feed a complete recorded/mock snake draft one pick at a time through the normalized event pipeline and assert the materialized state after every event.

### Real Sleeper QA
After the provider is implemented, validate against an actual Sleeper league/draft before declaring live sync production-ready.

## Commercial/API Gate

Sleeper commercial-use/licensing requirements must be resolved before monetizing a feature whose value depends on Sleeper integration. The technical design must isolate Sleeper so the core and Manual provider continue to function if API access changes.

## Atomic Build List

1. Canonical Draft Contracts
2. Existing Engine Refactor
3. Projection Authority Audit
4. Manual Draft Provider
5. Sleeper Provider
6. Authoritative Pick Reconciliation
7. Automatic Roster Assignment
8. Position Intelligence
9. FLEX Intelligence
10. Live Draft UX
11. Reliability Layer
12. Automated QA + Replay Harness
13. Real Sleeper Dogfood QA
14. Commercial/API Gate
15. Platform Expansion Gate

## Deployment Rule

All implementation stays off production while staged and tested. Vercel deployment remains locked. Production deployment requires explicit user approval after QA.
