# Fantasy Football Matrix™

Version **1.2.1** — Cactus🌵Byte Studios™

A mobile-first fantasy football decision engine designed to answer one question fast: **what is the smartest move I can make right now?**

## v1.2.1

- Real NFL roster and player-performance data through the Matrix server-side data engine
- PPR, Half-PPR, and Standard fantasy scoring calculated from raw weekly statistics
- Matrix Selection Score™ derived from production, opportunity, consistency, ceiling, trend, availability, positional scarcity, draft round, and user risk preference
- True Opportunity Value™ (TOV™) derived from weighted touches, targets, and high-value scoring opportunities
- Matrix Volatility Index™ (MVI™) based on week-to-week scoring variation
- Draft board with search, position filters, drafted-player removal, and dynamic recommendations
- Multi-player Draft Compare for up to four players
- Direct head-to-head player comparison
- Waiver Watch Matrix based on opportunity, trend, and ceiling
- Trade Matrix player-profile comparison
- Fast Draft runtime with cached data, one-tap drafted marking, a persistent best-pick dock, and undo
- Android/iOS-friendly responsive PWA shell
- Native sharing plus branded Matrix QR
- Settings, visible version number, and Cactus🌵Byte Studios™ footer

## Data methodology

The app uses current NFL roster data and the latest available regular-season player statistics. During the preseason, when the current regular season has not started, the engine uses the current roster together with the previous regular season as a performance baseline. Rookies without NFL regular-season history receive a separate draft-capital baseline instead of invented performance numbers.

The Matrix score itself is calculated by this app. The raw football data feed is provided by **nflverse** under **CC BY 4.0**. Matrix estimates such as Next-Pick Survival™ are labeled as Matrix estimates and are not represented as live market ADP.

Fantasy Football Matrix™ · Cactus🌵Byte Studios™ · All Rights Reserved
