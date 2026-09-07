const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'api/app.js'), 'utf8');
const live = fs.readFileSync(path.join(root, 'live-draft-mode.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'sleeper-live-sync.js'), 'utf8');

test('app shell loads provider dependencies before Sleeper live sync', () => {
  const order = [
    'draft-core/contracts.js',
    'draft-core/sleeper-provider.js',
    'draft-core/reliability.js',
    'draft-core/provider-session.js',
    'live-draft-mode.js',
    'sleeper-live-sync.js'
  ].map(name => app.indexOf(`'${name}'`));
  order.forEach(index => assert.ok(index >= 0));
  for (let i=1;i<order.length;i++) assert.ok(order[i] > order[i-1]);
});

test('Sleeper sync publishes canonical state and notifies Live Draft Mode', () => {
  assert.match(sync, /window\.ffmCanonicalDraftState\s*=\s*next/);
  assert.match(sync, /ffm:draft-state/);
  assert.match(live, /ffm:draft-state/);
});

test('Sleeper sync exposes connect, league selection, and manual fallback controls', () => {
  assert.match(sync, /Connect Sleeper/);
  assert.match(sync, /sleeperLeague/);
  assert.match(sync, /Use Manual Draft/);
});

test('Sleeper sync pauses external polling while the document is hidden', () => {
  assert.match(sync, /document\.hidden/);
});