# Universal roster closure — 2026-09-07

Purpose: remove the temporary Game of Throws-specific runtime bias now that the Fantasy Matrix has canonical provider state.

Changes:
- `league-profile.js` remains in source history but is no longer loaded by the app shell.
- Sleeper-connected mode treats canonical `league.rosterSlots` as authoritative for QB/RB/WR/TE/FLEX legacy compatibility settings.
- The legacy roster-need matrix boost is suppressed while canonical provider state is active so roster need is not scored twice.
- Legacy roster explanation is also suppressed while canonical state is active; Live Draft Mode owns provider-aware explanations.
- Starting-lineup controls are locked while a provider is connected and become editable again in Manual Draft mode.
- Manual mode keeps the existing local lineup workflow.

Scope intentionally unchanged:
- K/DST and full custom-slot logic remain owned by the canonical draft engine / special-teams logic rather than forcing unsupported shapes into the legacy lineup widget.
- `league-profile.js` is not deleted so it remains available for rollback/history.
- no Vercel deployment or deployment-lock changes.
