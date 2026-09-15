const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('regular-season policy tries current stats, previous stats, then legacy', () => {
  const { buildNflSourcePolicy } = require('../api/nfl-source-policy');
  const p = buildNflSourcePolicy(new Date('2026-09-10T12:00:00Z'));
  assert.equal(p.currentSeason, 2026);
  assert.equal(p.preseason, false);
  assert.deepEqual(p.statsCandidates.map(x => [x.kind, x.season]), [
    ['weekly', 2026],
    ['weekly', 2025],
    ['legacy', 2026]
  ]);
});

test('preseason policy prefers prior-year weekly stats without duplicate candidates', () => {
  const { buildNflSourcePolicy } = require('../api/nfl-source-policy');
  const p = buildNflSourcePolicy(new Date('2026-08-10T12:00:00Z'));
  assert.equal(p.currentSeason, 2026);
  assert.equal(p.preseason, true);
  assert.deepEqual(p.statsCandidates.map(x => [x.kind, x.season]), [
    ['weekly', 2025],
    ['legacy', 2025]
  ]);
});

test('policy uses identical shared-version headers plus nflverse schedule and runtime scoreboard URLs', () => {
  const { buildNflSourcePolicy } = require('../api/nfl-source-policy');
  const p = buildNflSourcePolicy(new Date('2026-09-10T12:00:00Z'));
  assert.equal(p.csvHeaders['User-Agent'], 'Fantasy-Football-Matrix/1.6.11');
  assert.equal(p.csvHeaders.Accept, 'text/csv,text/plain,*/*');
  assert.match(p.jsonHeaders.Accept, /application\/json/);
  assert.match(p.jsonHeaders['User-Agent'], /Fantasy-Football-Matrix\/1\.6\.11/);
  assert.match(p.scheduleUrl, /nflverse\/nfldata\/.*games\.csv/);
  assert.equal(p.scoreboardCandidates.length,3);
  assert.equal(p.scoreboardCandidates[0].name, 'ESPN web');
  assert.match(p.scoreboardCandidates[0].url, /contentorigin=espn/);
  assert.match(p.scoreboardCandidates[2].url, /limit=100/);
});

test('data engine is wired to the canonical source policy and nflverse schedule parser', () => {
  const source = fs.readFileSync(require.resolve('../api/nfl-data'), 'utf8');
  assert.match(source, /buildNflSourcePolicy/);
  assert.match(source, /parseNflverseSchedule/);
  assert.match(source, /scheduleFeed/);
});
