# Season Intelligence Design

## Goal
Turn Fantasy Football Matrix from a draft assistant into a universal in-season decision engine that continuously evaluates the user's roster, the entire league, current opponent, free agents, trades, lineup choices, and player availability/status.

## Product Mode
Maximum Edge. Recommendations optimize expected winning advantage rather than protecting name recognition or minimizing roster churn. Aggressive recommendations must show confidence, expected upside, downside/risk, and reasoning. The app recommends actions but never autonomously submits starts, drops, waiver claims, or trades.

## Canonical Data Boundary
All in-season engines consume one normalized LeagueSnapshot. Provider-specific IDs never enter recommendation logic. Sleeper adapters normalize league settings, all current rosters, matchup/opponent identity, transactions/ownership where available, and player metadata/status into Matrix player IDs. Existing Matrix valuation/projection logic remains provider-independent.

LeagueSnapshot contains league identity/settings, week, myRosterId, opponentRosterId, all normalized rosters, freeAgentPlayerIds, player status metadata, and freshness/reliability metadata. Engines must not independently fetch or infer ownership.

## Engines

### Roster Doctor
Grades overall roster and QB/RB/WR/TE/FLEX/K/DST groups, starter quality, bench depth, replacement-level advantage, bye exposure, and health risk. Produces ranked weak points, strengths, surplus positions, and actionable needs.

### Waiver Assassin
Ranks actual free agents against the user's weakest roster spots. Produces explicit ADD X / DROP Y moves, waiver priority, streaming options, upside stashes, expected improvement, risk, confidence, and rationale. A player owned by any roster is never a waiver candidate.

### Trade Hunter
Analyzes every roster for complementary needs and surpluses. Generates plausible targets and packages where the user's surplus addresses another team's weakness while improving the user's weakness. Supports buy-low and sell-high signals. Recommendations include both sides, expected roster impact, risk, confidence, and rationale; no automatic trade submission.

### Opponent Exploiter
Prioritizes the current week's opponent while retaining whole-league intelligence. Compares positional strength, lineup quality, injuries/status risk, replacement options, and projected matchup edges. Produces exploitable opponent weak points and ties those weaknesses to lineup, waiver, or trade actions when actionable.

### Lineup Optimizer
Builds a legal recommended starting lineup from league roster-slot rules. It may bench a higher-profile player when expected outcome supports it. START/BENCH/FLEX decisions show expected edge, risk, confidence, status warnings, and reasoning. Injured/questionable alternatives generate contingency recommendations.

### Availability & Risk Monitor
Normalizes relevant player designations including IR, PUP, Questionable, Doubtful, Out, and healthy/active states when available from authoritative provider/player data. Status is first-class input to roster grades, waivers, trades, opponent analysis, and lineup decisions. Unknown/stale status must be represented as unknown/stale rather than healthy.

## Weekly Attack Plan
The primary in-season surface summarizes: overall roster grade, largest weakness, current-opponent edge/vulnerability, recommended lineup changes, top waiver add/drop, best trade opportunity, and urgent player-status alerts. Drill-down views expose Roster, Waivers, Trades, Opponent, and Player Status details.

## Reliability
Ownership must come from current league rosters, not historical draft picks. Recommendations operate only on one internally consistent snapshot. Snapshot freshness is visible. On provider failure, last-known-good data may be displayed as stale, but the UI must not present stale ownership or injury data as current. High-impact recommendations involving stale/unknown status receive reduced confidence or are withheld.

## Universal Scope
No Brett Ross, BRoss81, Game of Throws, roster ID, team count, scoring format, or lineup structure is hard-coded. League roster slots and ownership determine behavior. Sleeper is the first provider implementation; recommendation engines remain provider-neutral for future adapters.

## QA Gates
Tests cover: roster weakness grading; legal lineup optimization including FLEX; owned-player exclusion from waivers; add/drop ranking; trade complementarity across all rosters; current-opponent identification and exploitation; IR/PUP/Questionable/Doubtful/Out normalization; stale/unknown status behavior; aggressive Maximum Edge decisions; provider-ID crosswalks; different league sizes/lineups; and regression of draft/post-draft behavior.

## Deployment
Development is staged behind the existing Vercel deployment lock. No preview or production deployment is authorized by this design approval. Production deployment requires separate explicit approval after implementation and QA.