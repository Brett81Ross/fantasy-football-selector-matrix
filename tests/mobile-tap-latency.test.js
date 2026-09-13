const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('UI performance layer loads deterministically after Weekly Attack Plan and before Season Intelligence', () => {
  const app = read('api/app.js');
  const weekly = app.indexOf('season-core/weekly-attack-plan.js');
  const perf = app.indexOf('ui-performance.js');
  const season = app.indexOf('season-intelligence.js');
  assert.ok(weekly >= 0, 'Weekly Attack Plan runtime missing');
  assert.ok(perf >= 0, 'UI performance runtime missing');
  assert.ok(season >= 0, 'Season Intelligence runtime missing');
  assert.ok(weekly < perf, 'UI performance must load after Weekly Attack Plan exists');
  assert.ok(perf < season, 'UI performance must wrap engines before Season Intelligence installs click handlers');
});

test('version lock does not dynamically inject the performance layer', () => {
  const source = read('version-lock.js');
  assert.doesNotMatch(source, /ui-performance\.js/);
  assert.doesNotMatch(source, /loadPerformanceLayer/);
});

test('performance layer does not depend on a bounded retry race', () => {
  const source = read('ui-performance.js');
  assert.doesNotMatch(source, /attempts\+\+/);
  assert.doesNotMatch(source, /setTimeout\(installSeason/);
});

test('mobile tap controls explicitly opt into immediate manipulation behavior', () => {
  const app = read('api/app.js');
  assert.match(app, /touch-action\s*:\s*manipulation/);
});
