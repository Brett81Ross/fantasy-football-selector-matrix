const test=require('node:test');
const assert=require('node:assert/strict');

function makeRoot(){
  const calls={draftPick:0,draftList:0,compareTray:0,waivers:0,selects:0};
  const root={
    state:{players:[{id:'A'},{id:'B'}],drafted:new Set(),teams:12,risk:'balanced'},
    renderDraftPick(){calls.draftPick++;},
    renderDraftList(){calls.draftList++;},
    renderCompareTray(){calls.compareTray++;},
    renderWaivers(){calls.waivers++;},
    populateSelects(){calls.selects++;},
    renderAll(){
      root.renderDraftPick();
      root.renderDraftList();
      root.renderCompareTray();
      root.renderWaivers();
      root.populateSelects();
    }
  };
  return {root,calls};
}

test('unchanged draft-state taps do not rebuild waiver and player-select DOM',()=>{
  const perf=require('../ui-performance');
  const {root,calls}=makeRoot();
  assert.equal(typeof perf.installRenderFastPath,'function','UI performance layer must expose the incremental render fast path');
  perf.installRenderFastPath(root);

  root.renderAll();
  root.renderAll();

  assert.equal(calls.draftPick,2);
  assert.equal(calls.draftList,2);
  assert.equal(calls.compareTray,2);
  assert.equal(calls.waivers,0,'unchanged taps must not rebuild the waiver list');
  assert.equal(calls.selects,0,'unchanged taps must not recreate the large player option lists');
});

test('new NFL player dataset refreshes static waiver and select DOM exactly once',()=>{
  const perf=require('../ui-performance');
  const {root,calls}=makeRoot();
  perf.installRenderFastPath(root);

  root.state.players=[{id:'A'},{id:'B'},{id:'C'}];
  root.renderAll();
  root.renderAll();

  assert.equal(calls.waivers,1,'new player data should refresh waiver content once');
  assert.equal(calls.selects,1,'new player data should rebuild player option lists once');
});
