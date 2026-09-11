const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  const healthPath = require.resolve('../api/health');
  const policyPath = require.resolve('../api/nfl-source-policy');
  delete require.cache[healthPath];
  delete require.cache[policyPath];
  global.fetch = fetchImpl;
  return require('../api/health');
}

function healthyRequiredRoute(url) {
  if (url.includes('/rosters/roster_2026.csv')) return response(200);
  if (url.includes('/stats_player/stats_player_week_2026.csv')) return response(200);
  if (url.includes('nflverse/nfldata') && url.includes('games.csv')) return response(200);
  return response(404);
}

test('ESPN 403 does not degrade health when required nflverse roster performance and schedule are healthy', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const handler = loadHealth(async url => {
    if (url.includes('site.api.espn.com')) return response(403);
    return healthyRequiredRoute(url);
  });
  const res = mockRes();
  await handler({}, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.status, 'LIVE');
  assert.equal(res.body.data.roster.ok, true);
  assert.equal(res.body.data.performance.ok, true);
  assert.equal(res.body.data.schedule.ok, true);
  assert.equal(res.body.data.liveScoreboard.ok, false);
  assert.equal(res.body.data.liveScoreboard.required, false);
});

test('required nflverse schedule failure degrades health even when ESPN is healthy', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const handler = loadHealth(async url => {
    if (url.includes('nflverse/nfldata') && url.includes('games.csv')) return response(503);
    if (url.includes('site.api.espn.com')) return response(200, { events: [] });
    return healthyRequiredRoute(url);
  });
  const res = mockRes();
  await handler({}, res);
  assert.equal(res.code, 206);
  assert.equal(res.body.status, 'DEGRADED');
  assert.equal(res.body.data.schedule.ok, false);
  assert.equal(res.body.data.schedule.required, true);
  assert.equal(res.body.data.liveScoreboard.ok, true);
});

test('schedule and ESPN failures stay explicitly degraded without pretending timing is available', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const handler = loadHealth(async url => {
    if (url.includes('nflverse/nfldata') && url.includes('games.csv')) return response(503);
    if (url.includes('site.api.espn.com')) return response(403);
    return healthyRequiredRoute(url);
  });
  const res = mockRes();
  await handler({}, res);
  assert.equal(res.code, 206);
  assert.equal(res.body.status, 'DEGRADED');
  assert.equal(res.body.data.schedule.ok, false);
  assert.equal(res.body.data.liveScoreboard.ok, false);
});

test('source policy exposes required nflverse schedule and gets v1.6.1 from shared version authority', () => {
  const policyPath = require.resolve('../api/nfl-source-policy');
  delete require.cache[policyPath];
  const { buildNflSourcePolicy } = require('../api/nfl-source-policy');
  const policy = buildNflSourcePolicy(new Date('2026-09-11T12:00:00Z'));
  assert.match(policy.scheduleUrl, /nflverse\/nfldata\/.*games\.csv/);
  assert.equal(policy.csvHeaders['User-Agent'], 'Fantasy-Football-Matrix/1.6.1');
  assert.equal(policy.jsonHeaders['User-Agent'], 'Fantasy-Football-Matrix/1.6.1');
});

test('runtime API files consume one shared v1.6.1 version authority', () => {
  const root = path.join(__dirname, '..');
  const versionPath = path.join(root, 'version.js');
  assert.equal(fs.existsSync(versionPath), true, 'version.js should be the runtime authority');
  if (fs.existsSync(versionPath)) {
    delete require.cache[require.resolve(versionPath)];
    assert.equal(require(versionPath), '1.6.1');
  }
  assert.equal(fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(), '1.6.1');
  for (const relative of ['api/app.js', 'api/health.js', 'api/nfl-data.js', 'api/nfl-source-policy.js']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /require\(['"]\.\.\/version['"]\)/, `${relative} should import shared version authority`);
    assert.doesNotMatch(source, /const VERSION\s*=\s*['"]1\.[0-9]+\.[0-9]+['"]/, `${relative} should not own a hard-coded version`);
  }
});
