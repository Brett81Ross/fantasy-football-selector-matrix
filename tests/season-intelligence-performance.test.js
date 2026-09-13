const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function makePlayers(count=240){
  const positions=['QB','RB','WR','TE'];
  return Array.from({length:count},(_,i)=>({
    id:`P${i}`,
    position:positions[i%positions.length],
    rookie:false,
    games:8,
    status:'ACT',
    metrics:{production:(i*13)%100,opportunity:(i*17)%100,consistency:60,ceiling:(i*19)%100,trend:55,availability:100}
  }));
}

test('draft score cache builds positional scarcity once per unchanged board state',()=>{
  const perf=require('../ui-performance');
  const root={
    state:{players:makePlayers(),drafted:new Set(),teams:12,risk:'balanced'},
    document:{getElementById:()=>({value:'4'})},
    weightsFor:()=>({production:.25,opportunity:.20,consistency:.12,ceiling:.17,trend:.10,scarcity:.10,availability:.06})
  };
  const installed=perf.installDraftScoreCache(root);
  assert.equal(installed.installed,true);
  for(const player of root.state.players.slice(0,120))root.matrixScore(player,4,true);
  for(const player of root.state.players.slice(0,120))root.matrixScore(player,4,true);
  assert.equal(installed.stats.scarcityBuilds,1,'scarcity groups should sort once, not once per Matrix score');
  assert.ok(installed.stats.matrixComputations<=120,'repeat scores should come from cache');

  root.state.drafted.add(root.state.players[0].id);
  root.matrixScore(root.state.players[1],4,true);
  assert.equal(installed.stats.scarcityBuilds,2,'draft-state changes must invalidate cached scarcity safely');
});

test('browser classic-script globals use the optimized Matrix scorer even when state is a lexical const',()=>{
  const context={console,setTimeout:()=>0};
  context.document={getElementById:()=>({value:'4'}),querySelector:()=>null};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(`
    const state={players:${JSON.stringify(makePlayers(80))},drafted:new Set(),teams:12,risk:'balanced'};
    function weightsFor(){return{production:.25,opportunity:.20,consistency:.12,ceiling:.17,trend:.10,scarcity:.10,availability:.06}}
    function scarcityScore(){throw new Error('slow scorer should have been replaced')}
    function matrixScore(){throw new Error('slow Matrix scorer should have been replaced')}
  `,context);
  vm.runInContext(fs.readFileSync('ui-performance.js','utf8'),context);
  const value=vm.runInContext('matrixScore(state.players[0],4,true)',context);
  assert.equal(typeof value,'number');
  assert.equal(context.FFMUIPerformance.installDraftScoreCache(context).stats.scarcityBuilds,1);
});

function seasonRoot(){
  let activeTab='Command Center';
  const calls={full:0,doctor:0,lineup:0,waiver:0,trade:0,opponent:0};
  const freshness={status:'fresh',asOf:'2026-09-13T15:00:00Z',source:'test'};
  const roster={rosterId:'1',playerIds:['A'],starterPlayerIds:['A']};
  const root={
    state:{dataMeta:{generatedAt:'2026-09-13T15:00:00Z'}},
    document:{querySelector:()=>({dataset:{seasonTab:activeTab}})},
    FFMWeeklyAttackPlan:{buildWeeklyAttackPlan(){calls.full++;return{freshness,confidence:95,risk:.12,actions:[],urgentStatusAlerts:[]};}},
    FFMRosterDoctor:{evaluateRoster(){calls.doctor++;return{overallGrade:80,weaknesses:[],positionalGrades:{},demand:{}};}},
    FFMLineupOptimizer:{optimizeLineup(){calls.lineup++;return{starters:[],decisions:[],expectedTotal:0,legal:true};}},
    FFMWaiverAssassin:{rankWaiverMoves(){calls.waiver++;return[];}},
    FFMTradeHunter:{findTradeOpportunities(){calls.trade++;return[];}},
    FFMOpponentExploiter:{analyzeOpponent(){calls.opponent++;return null;}},
    FFMPlayerStatus:{normalizePlayerStatus(){return{category:'ACTIVE',label:'Active'};},statusRisk(){return{risk:0,stale:false,confidenceMultiplier:1};}}
  };
  return {root,calls,setTab:value=>{activeTab=value;},snapshot:{myRosterId:'1',rosters:[roster],playerStatuses:{},freshness,week:1},values:{A:{id:'A',position:'RB',value:70}}};
}

test('Season Intelligence fast path runs only the engine needed by the selected tab and caches repeats',()=>{
  const perf=require('../ui-performance');
  const {root,calls,setTab,snapshot,values}=seasonRoot();
  assert.equal(perf.installSeasonFastPath(root),true);

  root.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,'1',values);
  assert.deepEqual(calls,{full:0,doctor:0,lineup:0,waiver:0,trade:0,opponent:0},'Command Center should not build unrelated analytics');

  setTab('Roster Doctor');
  root.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,'1',values);
  assert.equal(calls.doctor,1);assert.equal(calls.lineup,1);assert.equal(calls.full,0);

  setTab('Waiver Assassin');
  root.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,'1',values);
  assert.equal(calls.doctor,1,'shared roster analysis should be reused');
  assert.equal(calls.lineup,1,'shared lineup analysis should be reused');
  assert.equal(calls.waiver,1);assert.equal(calls.full,0);

  setTab('Trade Hunter');
  root.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,'1',values);
  root.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,'1',values);
  assert.equal(calls.trade,1,'repeat Trade Hunter clicks should reuse the same result until data changes');
  assert.equal(calls.full,0);

  setTab('Opponent Exploiter');
  root.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,'1',values);
  assert.equal(calls.opponent,1);assert.equal(calls.full,0);

  setTab('Weekly Attack Plan');
  root.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,'1',values);
  root.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,'1',values);
  assert.equal(calls.full,1,'full Weekly Attack Plan should also cache repeated renders for unchanged data');
});

test('runtime loader includes the UI performance layer without enabling service workers or deployment',()=>{
  const versionLock=fs.readFileSync('version-lock.js','utf8');
  const vercel=fs.readFileSync('vercel.json','utf8');
  assert.match(versionLock,/ui-performance\.js/);
  assert.match(vercel,/"deploymentEnabled":false/);
  assert.doesNotMatch(versionLock,/serviceWorker\.register/);
});
