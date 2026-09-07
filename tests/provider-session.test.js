const test = require('node:test');
const assert = require('node:assert/strict');
const { createProviderSession } = require('../draft-core/provider-session');
const reliability = require('../draft-core/reliability');

function draftState(overrides={}) {
  return {
    draftId:'D1',
    status:'live',
    picks:[],
    draftedPlayerIds:[],
    availablePlayerIds:['A'],
    myRoster:[],
    sync:{status:'live',lastSuccessfulSyncAt:'2026-09-07T20:00:00.000Z',lastAttemptAt:'2026-09-07T20:00:00.000Z',consecutiveFailures:0},
    ...overrides
  };
}

test('successful refresh publishes the canonical provider state', async () => {
  const published=[];
  const provider={ async loadDraft(){ return draftState(); } };
  const session=createProviderSession({provider,reliability,now:()=> '2026-09-07T20:01:00.000Z',onState:s=>published.push(s)});
  const result=await session.refresh('D1');
  assert.equal(result.ok,true);
  assert.equal(result.state.sync.status,'live');
  assert.equal(published.length,1);
  assert.equal(session.getState().draftId,'D1');
});

test('failed refresh preserves last-known-good state and returns retry delay', async () => {
  let calls=0;
  const provider={ async loadDraft(){ if(calls++===0)return draftState(); throw new Error('offline'); } };
  const session=createProviderSession({provider,reliability,now:()=> '2026-09-07T20:02:00.000Z'});
  await session.refresh('D1');
  const failed=await session.refresh('D1');
  assert.equal(failed.ok,false);
  assert.equal(failed.state.sync.status,'stale');
  assert.deepEqual(failed.state.availablePlayerIds,['A']);
  assert.ok(failed.retryAfterMs>=1000);
});

test('successful refresh after a failure reports recovery from stale state', async () => {
  let step=0;
  const provider={async loadDraft(){step++;if(step===2)throw new Error('offline');return draftState({picks:step===3?[{pickId:'P1'}]:[]});}};
  const session=createProviderSession({provider,reliability,now:()=> '2026-09-07T20:03:00.000Z'});
  await session.refresh('D1');
  await session.refresh('D1');
  const recovered=await session.refresh('D1');
  assert.equal(recovered.ok,true);
  assert.equal(recovered.recovered,true);
  assert.equal(recovered.state.sync.status,'live');
});

test('manual fallback clears external ownership without destroying last state', async () => {
  const provider={async loadDraft(){return draftState();}};
  const session=createProviderSession({provider,reliability});
  await session.refresh('D1');
  const manual=session.enterManual();
  assert.equal(manual.sync.status,'manual');
  assert.deepEqual(manual.availablePlayerIds,['A']);
});