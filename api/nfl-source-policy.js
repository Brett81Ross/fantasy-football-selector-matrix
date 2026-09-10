function buildNflSourcePolicy(now = new Date(), version = '1.5.5') {
  const currentSeason = now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const preseason = now.getUTCMonth() < 8;
  const preferredStatsSeason = preseason ? currentSeason - 1 : currentSeason;
  const weeklySeasons = [preferredStatsSeason, currentSeason - 1].filter((value, index, values) => values.indexOf(value) === index);
  const rosterCandidates = [currentSeason, currentSeason - 1].map(season => ({
    season,
    url: `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`
  }));
  const statsCandidates = weeklySeasons.map(season => ({
    kind: 'weekly',
    season,
    url: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`
  }));
  statsCandidates.push({
    kind: 'legacy',
    season: preferredStatsSeason,
    url: 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv'
  });
  return {
    currentSeason,
    preseason,
    preferredStatsSeason,
    rosterCandidates,
    statsCandidates,
    scoreboardUrl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100',
    csvHeaders: {
      'User-Agent': `Fantasy-Football-Matrix/${version}`,
      Accept: 'text/csv,text/plain,*/*'
    },
    jsonHeaders: {
      Accept: 'application/json',
      'User-Agent': `Fantasy-Football-Matrix/${version}`
    }
  };
}

module.exports = { buildNflSourcePolicy };
