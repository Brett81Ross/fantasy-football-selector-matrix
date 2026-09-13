const test = require('node:test');
const assert = require('node:assert/strict');

function response(status, data = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; }
  };
}

function mockRes() {
  return {
    code: 0,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function loadHealth(fetchImpl) {
  const path = require.resolve('../api/health');
  delete require.cache[path];
  global.fetch = fetchImpl;
  return require('../api/health');
}

function normalRoute(url, options = {}) {
  if (url.includes('/rosters/roster_2026.csv')) return response(200);
  if (url.includes('/stats_player/stats_player_week_2026.csv')) return response(200);
  if (url.includes('nflverse/nfldata') && url.includes('games.csv')) return response(200);
  if (url.includes('site.api.espn.com')) {
    return response(200, { events: [], season: { year: 2026 } });
  }
  return response(404);
}

test('current stats 404 with previous weekly success is a healthy fallback, not an outage', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const handler = loadHealth(async (url, options) => {
    if (url.includes('/rosters/roster_2026.csv')) return response(200);
    if (url.includes('/stats_player/stats_player_week_2026.csv')) return response(404);
    if (url.includes('/stats_player/stats_player_week_2025.csv')) return response(200);
    if (url.includes('nflverse/nfldata') && url.includes('games.csv')) return response(200);
    if (url.includes('site.api.espn.com')) return response(200, { events: [] });
    return response(404);
  });
  const res = mockRes();
  await handler({}, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.status, 'LIVE');
  assert.equal(res.body.data.performance.ok, true);
  assert.equal(res.body.data.performance.fallback, true);
  assert.equal(res.body.data.performance.activeSeason, 2025);
  assert.equal(res.body.data.performance.activeKind, 'weekly');
  assert.deepEqual(res.body.data.performance.attempts.map(x => x.http), [404, 200]);
});

test('health uses the same ESPN headers and limit as the runtime data engine', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let sawScoreboard = false;
  const handler = loadHealth(async (url, options = {}) => {
    if (url.includes('site.api.espn.com')) {
      sawScoreboard = true;
      assert.match(url, /limit=100/);
      assert.equal(options.headers.Accept, 'application/json');
      assert.equal(options.headers['User-Agent'], 'Fantasy-Football-Matrix/1.6.1');
      return response(200, { events: [] });
    }
    return normalRoute(url, options);
  });
  const res = mockRes();
  await handler({}, res);
  assert.equal(sawScoreboard, true);
  assert.equal(res.body.data.liveScoreboard.ok, true);
  assert.equal(res.body.data.liveScoreboard.required, false);
});

test('all stats sources failing degrades health without taking roster data offline', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const handler = loadHealth(async url => {
    if (url.includes('/rosters/roster_2026.csv')) return response(200);
    if (url.includes('stats_player') || url.includes('player_stats/player_stats.csv')) return response(404);
    if (url.includes('nflverse/nfldata') && url.includes('games.csv')) return response(200);
    if (url.includes('site.api.espn.com')) return response(200, { events: [] });
    return response(404);
  });
  const res = mockRes();
  await handler({}, res);
  assert.equal(res.code, 206);
  assert.equal(res.body.status, 'DEGRADED');
  assert.equal(res.body.data.roster.ok, true);
  assert.equal(res.body.data.performance.ok, false);
});

test('legacy performance fallback is explicit and degraded rather than falsely primary', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const handler = loadHealth(async url => {
    if (url.includes('/rosters/roster_2026.csv')) return response(200);
    if (url.includes('/stats_player/')) return response(404);
    if (url.includes('/player_stats/player_stats.csv')) return response(200);
    if (url.includes('nflverse/nfldata') && url.includes('games.csv')) return response(200);
    if (url.includes('site.api.espn.com')) return response(200, { events: [] });
    return response(404);
  });
  const res = mockRes();
  await handler({}, res);
  assert.equal(res.code, 206);
  assert.equal(res.body.status, 'DEGRADED');
  assert.equal(res.body.data.performance.ok, true);
  assert.equal(res.body.data.performance.fallback, true);
  assert.equal(res.body.data.performance.activeKind, 'legacy');
});

test('current roster failure with previous roster success is STALE rather than OFFLINE', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const handler = loadHealth(async url => {
    if (url.includes('/rosters/roster_2026.csv')) return response(404);
    if (url.includes('/rosters/roster_2025.csv')) return response(200);
    if (url.includes('/stats_player/stats_player_week_2026.csv')) return response(200);
    if (url.includes('nflverse/nfldata') && url.includes('games.csv')) return response(200);
    if (url.includes('site.api.espn.com')) return response(200, { events: [] });
    return response(404);
  });
  const res = mockRes();
  await handler({}, res);
  assert.equal(res.code, 206);
  assert.equal(res.body.status, 'STALE');
  assert.equal(res.body.data.roster.ok, true);
  assert.equal(res.body.data.roster.fallback, true);
  assert.equal(res.body.data.roster.activeSeason, 2025);
});

test('all roster candidates failing returns OFFLINE', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const handler = loadHealth(async url => {
    if (url.includes('/rosters/')) return response(404);
    if (url.includes('/stats_player/stats_player_week_2026.csv')) return response(200);
    if (url.includes('nflverse/nfldata') && url.includes('games.csv')) return response(200);
    if (url.includes('site.api.espn.com')) return response(200, { events: [] });
    return response(404);
  });
  const res = mockRes();
  await handler({}, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.status, 'OFFLINE');
  assert.equal(res.body.data.roster.ok, false);
});

test('warm instance preserves last successful scoreboard timestamp across a later optional ESPN failure', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let failScoreboard = false;
  const handler = loadHealth(async url => {
    if (url.includes('/rosters/roster_2026.csv')) return response(200);
    if (url.includes('/stats_player/stats_player_week_2026.csv')) return response(200);
    if (url.includes('nflverse/nfldata') && url.includes('games.csv')) return response(200);
    if (url.includes('site.api.espn.com')) return failScoreboard ? response(503) : response(200, { events: [] });
    return response(404);
  });
  const first = mockRes();
  await handler({}, first);
  const timestamp = first.body.data.liveScoreboard.lastSuccessfulAt;
  assert.match(timestamp, /^\d{4}-\d{2}-\d{2}T/);
  failScoreboard = true;
  const second = mockRes();
  await handler({}, second);
  assert.equal(second.code, 200);
  assert.equal(second.body.status, 'LIVE');
  assert.equal(second.body.data.liveScoreboard.ok, false);
  assert.equal(second.body.data.liveScoreboard.lastSuccessfulAt, timestamp);
});
