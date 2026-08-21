const CURRENT_DATE = new Date();
const CURRENT_SEASON = CURRENT_DATE.getUTCMonth() >= 2
  ? CURRENT_DATE.getUTCFullYear()
  : CURRENT_DATE.getUTCFullYear() - 1;

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const EXCLUDED_STATUSES = new Set(['CUT', 'RET', 'UFA', 'TRC', 'TRD', 'TRT', 'NWT']);
const cache = { value: null, expires: 0 };

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function parseCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

function csvRows(text, wanted) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]);
  const indexes = {};
  for (const key of wanted) {
    const i = header.indexOf(key);
    if (i >= 0) indexes[key] = i;
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    for (const [key, idx] of Object.entries(indexes)) row[key] = cols[idx] ?? '';
    rows.push(row);
  }
  return rows;
}

async function getText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Fantasy-Football-Selector-Matrix/1.1' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`Source request failed (${response.status})`);
  return response.text();
}

function fantasyPoints(row, scoring) {
  const recPts = scoring === 'ppr' ? 1 : scoring === 'half' ? 0.5 : 0;
  return (
    num(row.passing_yards) * 0.04 +
    num(row.passing_tds) * 4 -
    num(row.interceptions) * 2 +
    num(row.rushing_yards) * 0.1 +
    num(row.rushing_tds) * 6 +
    num(row.receptions) * recPts +
    num(row.receiving_yards) * 0.1 +
    num(row.receiving_tds) * 6 +
    num(row.receiving_2pt_conversions) * 2 +
    num(row.rushing_2pt_conversions) * 2 +
    num(row.passing_2pt_conversions) * 2 -
    num(row.fumbles_lost) * 2
  );
}

function percentile(values, value, inverse = false) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 50;
  let count = 0;
  for (const x of clean) if (x <= value) count++;
  let pct = (count / clean.length) * 100;
  if (inverse) pct = 100 - pct;
  return clamp(pct);
}

function quantile(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const pos = (clean.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return clean[base + 1] !== undefined
    ? clean[base] + rest * (clean[base + 1] - clean[base])
    : clean[base];
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map(v => (v - avg) ** 2)));
}

function statusPenalty(status) {
  if (!status || status === 'ACT') return 0;
  if (status === 'INA') return 7;
  if (status === 'PUP') return 12;
  if (status === 'RES' || status === 'RSN') return 18;
  if (status === 'SUS') return 20;
  return 5;
}

function rookieBaseline(meta) {
  const draftOverall = num(meta.draft_number || meta.draft_ovr || meta.draft_pick);
  const draftRound = num(meta.draft_round);
  let score = 48;
  if (draftOverall > 0) score = clamp(94 - Math.log2(draftOverall + 1) * 8, 45, 90);
  else if (draftRound > 0) score = clamp(88 - (draftRound - 1) * 7, 45, 88);
  if (meta.position === 'RB') score += 3;
  if (meta.position === 'TE') score -= 3;
  return clamp(score);
}

async function loadSource(scoring) {
  if (cache.value && cache.expires > Date.now() && cache.value.scoring === scoring) {
    return cache.value.payload;
  }

  const rosterUrl = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${CURRENT_SEASON}.csv`;
  const playersUrl = 'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';
  const currentStatsUrl = `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${CURRENT_SEASON}.csv`;
  const previousStatsUrl = `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${CURRENT_SEASON - 1}.csv`;

  const [rosterText, playersText] = await Promise.all([getText(rosterUrl), getText(playersUrl)]);

  let statsText = '';
  let statsSeason = CURRENT_SEASON;
  try {
    statsText = await getText(currentStatsUrl);
    const hasRegular = statsText.includes(',REG,') || statsText.includes(',REG\r') || statsText.includes(',REG\n');
    if (!hasRegular) throw new Error('No regular-season rows yet');
  } catch {
    statsSeason = CURRENT_SEASON - 1;
    statsText = await getText(previousStatsUrl);
  }

  const rosterRows = csvRows(rosterText, [
    'team', 'position', 'status', 'full_name', 'birth_date', 'gsis_id', 'years_exp', 'headshot_url'
  ]);
  const playerRows = csvRows(playersText, [
    'gsis_id', 'display_name', 'position', 'latest_team', 'birth_date', 'headshot',
    'draft_year', 'draft_round', 'draft_number', 'draft_ovr'
  ]);
  const statRows = csvRows(statsText, [
    'player_id', 'player_display_name', 'position', 'team', 'week', 'season_type',
    'completions', 'attempts', 'passing_yards', 'passing_tds', 'interceptions',
    'carries', 'rushing_yards', 'rushing_tds',
    'targets', 'receptions', 'receiving_yards', 'receiving_tds',
    'receiving_2pt_conversions', 'rushing_2pt_conversions', 'passing_2pt_conversions',
    'fumbles_lost'
  ]);

  const metaById = new Map();
  for (const row of playerRows) {
    if (row.gsis_id) metaById.set(row.gsis_id, row);
  }

  const active = new Map();
  for (const row of rosterRows) {
    if (!row.gsis_id || !POSITIONS.has(row.position) || !row.team) continue;
    if (EXCLUDED_STATUSES.has(row.status)) continue;
    active.set(row.gsis_id, row);
  }

  const weeksById = new Map();
  for (const row of statRows) {
    if (row.season_type && row.season_type !== 'REG') continue;
    if (!row.player_id || !POSITIONS.has(row.position)) continue;
    const points = fantasyPoints(row, scoring);
    const opportunity = row.position === 'QB'
      ? num(row.attempts) * 0.18 + num(row.carries) * 0.85
      : num(row.carries) + num(row.targets) * 1.55;
    const highValue = row.position === 'QB'
      ? num(row.passing_tds) * 4 + num(row.rushing_tds) * 7
      : num(row.targets) * 1.7 + num(row.receptions) * 0.7 +
        (num(row.rushing_tds) + num(row.receiving_tds)) * 6;
    if (!weeksById.has(row.player_id)) weeksById.set(row.player_id, []);
    weeksById.get(row.player_id).push({
      week: num(row.week),
      points,
      opportunity,
      highValue
    });
  }

  const rawPlayers = [];
  for (const [id, roster] of active) {
    const meta = metaById.get(id) || {};
    const position = roster.position || meta.position;
    if (!POSITIONS.has(position)) continue;
    const weeks = (weeksById.get(id) || []).sort((a, b) => a.week - b.week);
    const pointWeeks = weeks.map(w => w.points).filter(v => v >= 0);
    const oppWeeks = weeks.map(w => w.opportunity);
    const last4 = weeks.slice(-4);
    const avgPoints = mean(pointWeeks);
    const avgOpportunity = mean(oppWeeks);
    const recentPoints = mean(last4.map(w => w.points));
    const recentOpp = mean(last4.map(w => w.opportunity));
    const deviation = stdev(pointWeeks);
    const cv = avgPoints > 0 ? deviation / avgPoints : 1.25;
    const floor = quantile(pointWeeks, 0.25);
    const ceiling = quantile(pointWeeks, 0.9);
    const trendRatio = avgPoints > 0 ? recentPoints / avgPoints : 1;
    const oppTrendRatio = avgOpportunity > 0 ? recentOpp / avgOpportunity : 1;
    const games = pointWeeks.length;
    const yearsExp = num(roster.years_exp);
    const rookie = statsSeason < CURRENT_SEASON && yearsExp === 0;
    const draftBase = rookie ? rookieBaseline({ ...meta, position }) : 0;

    rawPlayers.push({
      id,
      name: roster.full_name || meta.display_name || 'Unknown Player',
      position,
      team: roster.team || meta.latest_team || '',
      status: roster.status || 'ACT',
      yearsExp,
      rookie,
      draftYear: num(meta.draft_year),
      draftRound: num(meta.draft_round),
      draftOverall: num(meta.draft_number || meta.draft_ovr),
      games,
      avgPoints,
      avgOpportunity,
      recentPoints,
      recentOpp,
      trendRatio,
      oppTrendRatio,
      deviation,
      cv,
      floor,
      ceiling,
      highValuePerGame: mean(weeks.map(w => w.highValue)),
      draftBase
    });
  }

  const byPos = {};
  for (const pos of POSITIONS) byPos[pos] = rawPlayers.filter(p => p.position === pos && p.games >= 3);

  for (const p of rawPlayers) {
    const group = byPos[p.position] || [];
    const production = p.games >= 3
      ? percentile(group.map(x => x.avgPoints), p.avgPoints)
      : p.draftBase || 35;
    const opportunity = p.games >= 3
      ? percentile(group.map(x => x.avgOpportunity), p.avgOpportunity)
      : p.draftBase || 35;
    const consistency = p.games >= 3
      ? percentile(group.map(x => x.cv), p.cv, true)
      : clamp((p.draftBase || 45) - 8);
    const ceiling = p.games >= 3
      ? percentile(group.map(x => x.ceiling), p.ceiling)
      : clamp((p.draftBase || 45) + 4);
    const trend = p.games >= 3
      ? percentile(group.map(x => x.trendRatio), p.trendRatio)
      : 50;
    const tov = p.games >= 3
      ? clamp(
          percentile(group.map(x => x.avgOpportunity), p.avgOpportunity) * 0.68 +
          percentile(group.map(x => x.highValuePerGame), p.highValuePerGame) * 0.32
        )
      : p.draftBase || 40;
    const mvi = p.games >= 3
      ? clamp(percentile(group.map(x => x.cv), p.cv))
      : 64;
    const availability = clamp((p.games / 17) * 100 - statusPenalty(p.status));
    p.metrics = {
      production: Math.round(production),
      opportunity: Math.round(opportunity),
      consistency: Math.round(consistency),
      ceiling: Math.round(ceiling),
      trend: Math.round(trend),
      tov: Math.round(tov),
      mvi: Math.round(mvi),
      availability: Math.round(availability)
    };
  }

  const sorted = rawPlayers
    .filter(p => p.name !== 'Unknown Player')
    .sort((a, b) => {
      const sa = a.metrics.production * 0.42 + a.metrics.opportunity * 0.24 +
        a.metrics.ceiling * 0.14 + a.metrics.consistency * 0.1 + a.metrics.availability * 0.1;
      const sb = b.metrics.production * 0.42 + b.metrics.opportunity * 0.24 +
        b.metrics.ceiling * 0.14 + b.metrics.consistency * 0.1 + b.metrics.availability * 0.1;
      return sb - sa;
    })
    .slice(0, 300);

  const payload = {
    generatedAt: new Date().toISOString(),
    currentSeason: CURRENT_SEASON,
    statsSeason,
    scoring,
    source: {
      name: 'nflverse',
      license: 'CC BY 4.0',
      note: statsSeason === CURRENT_SEASON
        ? `${CURRENT_SEASON} regular-season data`
        : `${CURRENT_SEASON} roster + ${statsSeason} regular-season performance baseline`
    },
    players: sorted
  };

  cache.value = { scoring, payload };
  cache.expires = Date.now() + 1000 * 60 * 30;
  return payload;
}

module.exports = async function handler(req, res) {
  try {
    const scoringRaw = String(req.query?.scoring || 'ppr').toLowerCase();
    const scoring = scoringRaw === 'standard' ? 'standard' : scoringRaw === 'half' ? 'half' : 'ppr';
    const data = await loadSource(scoring);
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(data);
  } catch (error) {
    console.error('nfl-data error', error);
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      error: 'Live football data is temporarily unavailable.',
      detail: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined
    });
  }
};