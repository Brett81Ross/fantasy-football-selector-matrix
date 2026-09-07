const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('live draft mode exposes the two dominant manual fallback actions', () => {
  const source = read('live-draft-mode.js');
  assert.match(source, /THEY TOOK HIM/);
  assert.match(source, /I TOOK HIM/);
  assert.match(source, /Recent Picks/);
  assert.match(source, /fastDrafted/);
  assert.match(source, /fastMine/);
  assert.match(source, /fastUndo/);
});

test('live draft mode delegates manual mutations to existing fast-draft controls', () => {
  const source = read('live-draft-mode.js');
  assert.match(source, /getElementById\('fastDrafted'\).*click/s);
  assert.match(source, /getElementById\('fastMine'\).*click/s);
  assert.match(source, /getElementById\('fastUndo'\).*click/s);
  assert.doesNotMatch(source, /localStorage\.setItem/);
  assert.doesNotMatch(source, /state\.drafted\.add/);
});

test('app shell injects draft-core dependencies before live-draft-mode', () => {
  const source = read('api/app.js');
  const files = [
    'draft-core/roster-assignment.js',
    'draft-core/position-intelligence.js',
    'draft-core/flex-intelligence.js',
    'draft-core/live-draft-view.js',
    'live-draft-mode.js'
  ];
  let previous = -1;
  for (const file of files) {
    const index = source.indexOf(`'${file}'`);
    assert.ok(index > previous, `${file} must be injected after its dependency`);
    previous = index;
  }
});

test('ABL-10 wiring does not touch service-worker or deployment configuration', () => {
  const source = read('live-draft-mode.js');
  assert.doesNotMatch(source, /serviceWorker/);
  assert.doesNotMatch(source, /vercel/i);
});