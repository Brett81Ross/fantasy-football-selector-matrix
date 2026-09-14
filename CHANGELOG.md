# Changelog

## 1.6.7

- Reduced residual Android tap latency in Season Intelligence by reusing derived player values while the underlying NFL player dataset is unchanged.
- Re-tapping the already active Season Intelligence tab now exits without rerunning its render path.
- Replaced repeated per-row Draft Board click-handler binding with a single delegated handler.
- Compare taps now update only the affected Draft Board row instead of rebuilding the full visible board.
- Added regression coverage for tap responsiveness and HTML-escaping safety.

## 1.5.5

- Retired the Fantasy Football Matrix service worker and removed offline app-shell caching from the active application path.
- Added automatic cleanup for previously registered service workers and old `ff-matrix-*` / fantasy-football caches.
- Replaced the old worker with a one-release self-retiring tombstone so existing installs can unregister cleanly.
- Forced the production root through the uncached server-rendered app shell to prevent stale `index.html` builds from bypassing the current version.
- Added explicit no-store headers to the application shell.
- Preserved the current live nflverse-backed football data engine and existing runtime features.

## 1.1.0

- Replaced demo player scoring with a server-side NFL data engine.
- Added PPR, Half-PPR, and Standard scoring calculations from raw weekly statistics.
- Added dynamic Matrix Selection Score™, TOV™, MVI™, floor, ceiling, trend, availability, and scarcity calculations.
- Added searchable draft board, drafted-player removal, multi-player Draft Compare, and direct head-to-head comparison.
- Added waiver watch and trade-profile analysis.
- Added live data-source status and methodology disclosure.
- Updated service worker behavior so API data is not served from a stale app-shell cache.
