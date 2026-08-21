# API

- `/api/health` — deployment health and app version.
- `/api/nfl-data?scoring=ppr|half|standard` — server-side Matrix player dataset built from nflverse roster and weekly statistics.

The browser does not receive the raw scoring formula source from this API file; Vercel executes it server-side.
