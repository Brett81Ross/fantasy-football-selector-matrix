# Matrix Data Method — v1.1.0

Fantasy Football Selector Matrix™ uses raw NFL roster and weekly statistical data as inputs, then calculates its own decision metrics.

## Inputs

- Current-season roster status
- Weekly passing, rushing, receiving, target, carry, touchdown, turnover, and scoring-event statistics
- Current player position and team
- Draft capital for rookies without an NFL regular-season sample

## Matrix metrics

- **Production**: positional percentile of fantasy points per game under the user's scoring setting.
- **True Opportunity Value™ (TOV™)**: a weighted blend of opportunity volume and high-value scoring opportunities.
- **Matrix Volatility Index™ (MVI™)**: positional percentile of week-to-week scoring variation. Higher means more volatile.
- **Floor Strength**: inverse positional percentile of coefficient of variation.
- **Ceiling**: positional percentile of a player's upper scoring range.
- **Trend**: positional percentile of recent production versus season-long production.
- **Availability**: availability signal informed by roster status and games in the performance sample.
- **Positional Scarcity**: dynamic score based on remaining players at the position and league size.

## Matrix Selection Score™

The Matrix Selection Score™ blends the metrics above with weights that change according to draft round and the user's selected risk style. Early rounds emphasize production and floor; later rounds increase ceiling and trend weight.

## Important labels

Next-Pick Survival™ is an internal Matrix estimate based on the current remaining board and picks until the user's next turn. It is not represented as market ADP.

Raw data source: nflverse, CC BY 4.0. Matrix formulas and decision logic are application calculations.
