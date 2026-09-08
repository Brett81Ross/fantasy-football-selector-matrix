const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const liveView = require('../draft-core/live-draft-view');

test('completed canonical draft switches Live Draft view into universal post-draft mode', () => {
  const view = liveView.buildLiveDraftView({
    draftStatus: 'completed',
    recommendation: { playerId:'p1', playerName:'Should Not Render', position:'WR' },
    rosterSlots: [{ id:'QB', type:'QB', count:1, eligiblePositions:['QB'] }],
    assignments: [{ slotId:'QB:1', playerId:'qb1' }],
    recentPicks: [],
    sync: { status:'live' }
  });
  assert.equal(view.mode, 'post_draft');
  assert.equal(view.headline, 'DRAFT COMPLETE');
  assert.equal(view.showDraftActions, false);
  assert.deepEqual(view.actions, { waivers:'OPEN WAIVERS', trade:'OPEN TRADE' });
  assert.match(view.reason, /final roster/i);
});

test('active and manual drafts retain draft controls', () => {
  const active = liveView.buildLiveDraftView({
    draftStatus: 'live',
    recommendation: { playerId:'p1', playerName:'Player One', position:'RB' },
    sync: { status:'live' }
  });
  assert.equal(active.mode, 'live_draft');
  assert.equal(active.showDraftActions, true);
  assert.equal(active.headline, 'BEST PICK: RB — Player One');

  const manual = liveView.buildLiveDraftView({
    recommendation: { playerId:'p2', playerName:'Player Two', position:'WR' },
    sync: { status:'manual' }
  });
  assert.equal(manual.mode, 'live_draft');
  assert.equal(manual.showDraftActions, true);
});

test('splash version is derived from runtime version authority rather than a stale hard-coded release', () => {
  const splash = fs.readFileSync(path.join(__dirname, '..', 'splash.js'), 'utf8');
  const version = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();
  assert.ok(version);
  assert.doesNotMatch(splash, /const VERSION='1\.4\.5'/);
  assert.match(splash, /document\.currentScript|FFM_VERSION/);
});
