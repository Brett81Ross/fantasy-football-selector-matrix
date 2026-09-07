const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../draft-core/reliability');

function state(sync={}) {
  return {
    draftId:'D1',
    picks:[{ pickId:'p1', playerId:'A' }],
    sync:{
      status:'live',
      lastSuccessfulSyncAt:'2026-09-07T20:00:00.000Z',
      lastAttemptAt:'2026-09-07T20:00:00.000Z',
      consecutiveFailures:0,
      ...sync
    }
  };
}

test('classifyFreshness returns live stale or disconnected from age and failures', () => {
  const now = Date.parse('2026-09-07T20:05:00.000Z');
  assert.equal(R.classifyFreshness(state(), { nowMs:now, staleAfterMs:10*60*1000, disconnectAfterFailures:3 }), 'live');
  assert.equal(R.classifyFreshness(state({ lastSuccessfulSyncAt:'2026-09-07T19:30:00.000Z' }), { nowMs:now, staleAfterMs:10*60*1000, disconnectAfterFailures:3 }), 'stale');
  assert.equal(R.classifyFreshness(state({ consecutiveFailures:3 }), { nowMs:now, staleAfterMs:10*60*1000, disconnectAfterFailures:3 }), 'disconnected');
});

test('nextBackoffMs uses capped exponential backoff', () => {
  assert.equal(R.nextBackoffMs(0), 1000);
  assert.equal(R.nextBackoffMs(1), 2000);
  assert.equal(R.nextBackoffMs(2), 4000);
  assert.equal(R.nextBackoffMs(9), 30000);
});

test('recordSuccess stores last-known-good and requests full reconciliation after failures', () => {
  const prior = state({ status:'stale', consecutiveFailures:2 });
  const fresh = state({ lastSuccessfulSyncAt:'2026-09-07T20:10:00.000Z' });
  const out = R.recordSuccess({ current:prior, incoming:fresh, nowIso:'2026-09-07T20:10:00.000Z' });
  assert.equal(out.state.sync.status, 'live');
  assert.equal(out.state.sync.consecutiveFailures, 0);
  assert.equal(out.shouldFullReconcile, true);
  assert.deepEqual(out.lastKnownGood, out.state);
});

test('recordFailure keeps last-known-good usable and escalates state', () => {
  const lkg = state();
  const one = R.recordFailure({ current:lkg, lastKnownGood:lkg, nowIso:'2026-09-07T20:01:00.000Z', disconnectAfterFailures:3 });
  assert.equal(one.state.sync.status, 'stale');
  assert.equal(one.state.sync.consecutiveFailures, 1);
  assert.deepEqual(one.state.picks, lkg.picks);
  const three = R.recordFailure({ current:{...one.state,sync:{...one.state.sync,consecutiveFailures:2}}, lastKnownGood:lkg, nowIso:'2026-09-07T20:03:00.000Z', disconnectAfterFailures:3 });
  assert.equal(three.state.sync.status, 'disconnected');
});

test('manual fallback marks state manual without discarding draft data', () => {
  const out = R.enterManualMode(state());
  assert.equal(out.sync.status, 'manual');
  assert.equal(out.picks.length, 1);
});