const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

function renderBody(){
  const src=fs.readFileSync('season-intelligence.js','utf8');
  const start=src.indexOf('function render(snapshot');
  const end=src.indexOf('function renderWeekly',start);
  assert.ok(start>=0&&end>start,'render(snapshot) function must exist');
  return src.slice(start,end);
}

test('lightweight Season Intelligence tabs bypass the full Weekly Attack Plan',()=>{
  const body=renderBody();
  const plan=body.indexOf('buildWeeklyAttackPlan');
  assert.ok(plan>=0,'Weekly Attack Plan remains available for the Weekly Attack Plan tab');
  for(const marker of [
    "tab==='Command Center'",
    "tab==='Roster Doctor'",
    "tab==='Waiver Assassin'",
    "tab==='Playoff Path'",
    "tab==='Opponent Exploiter'",
    "tab==='Player Status'"
  ]){
    const i=body.indexOf(marker);
    assert.ok(i>=0,`${marker} route must exist`);
    assert.ok(i<plan,`${marker} must return before buildWeeklyAttackPlan runs`);
  }
});

test('Trade Hunter tab does not pay for Weekly Attack Plan before running Trade Hunter',()=>{
  const body=renderBody();
  const trade=body.indexOf("tab==='Trade Hunter'");
  const plan=body.indexOf('buildWeeklyAttackPlan');
  assert.ok(trade>=0&&plan>=0);
  assert.ok(trade<plan,'Trade Hunter must call its own engine directly instead of building every weekly engine first');
});
