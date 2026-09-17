const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeLeagueSnapshot}=require('../season-core/contracts');
const {buildWeeklyAttackPlan}=require('../season-core/weekly-attack-plan');

const slots=[
  {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
  {id:'RB',type:'RB',count:2,eligiblePositions:['RB'],isBench:false,isReserve:false},
  {id:'WR',type:'WR',count:2,eligiblePositions:['WR'],isBench:false,isReserve:false},
  {id:'TE',type:'TE',count:1,eligiblePositions:['TE'],isBench:false,isReserve:false},
  {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
  {id:'BN',type:'BN',count:5,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
];

const values={
  Q1:{position:'QB',value:80,projection:20},R1:{position:'RB',value:48,projection:9},R2:{position:'RB',value:45,projection:8},
  W1:{position:'WR',value:90,projection:18},W2:{position:'WR',value:86,projection:17},W3:{position:'WR',value:80,projection:14},
  T1:{position:'TE',value:70,projection:11},B1:{position:'WR',value:32,projection:4},
  Q2:{position:'QB',value:76,projection:18},R3:{position:'RB',value:82,projection:16},R4:{position:'RB',value:78,projection:15},
  W4:{position:'WR',value:50,projection:8},W5:{position:'WR',value:44,projection:7},T2:{position:'TE',value:65,projection:10},
  FA_RB:{position:'RB',value:78,projection:15},FA_WR:{position:'WR',value:60,projection:10}
};

function snapshot({opponentRosterId='2',freshness='fresh'}={}){
  const rosters=[
    {rosterId:'1',playerIds:['Q1','R1','R2','W1','W2','W3','T1','B1']},
    {rosterId:'2',playerIds:['Q2','R3','R4','W4','W5','T2']}
  ];
  return normalizeLeagueSnapshot({
    league:{leagueId:'L',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},rosterSlots:slots},
    week:7,myRosterId:'1',opponentRosterId,
    rosters,
    playerPool:[...rosters.flatMap(r=>r.playerIds),'FA_RB','FA_WR'].map(id=>({id})),
    playerStatuses:{R2:{status:'Questionable'},W5:{status:'Out'}},
    freshness:{status:freshness,asOf:'2026-09-17T10:00:00.000Z'}
  });
}

function tradeFixture(){
  const rosters=[
    {rosterId:'1',ownerId:'ME',playerIds:['Q1','R1','R2','W1','W2','W3','W4','T1']},
    {rosterId:'2',ownerId:'THEM',playerIds:['Q2','R3','R4','R5','W5','W6','T2']}
  ];
  const tradeValues={
    Q1:{position:'QB',value:75,projection:18},R1:{position:'RB',value:48,projection:9},R2:{position:'RB',value:46,projection:8},
    W1:{position:'WR',value:92,projection:18},W2:{position:'WR',value:88,projection:17},W3:{position:'WR',value:83,projection:15},W4:{position:'WR',value:78,projection:14},T1:{position:'TE',value:70,projection:11},
    Q2:{position:'QB',value:74,projection:17},R3:{position:'RB',value:88,projection:17},R4:{position:'RB',value:82,projection:15},R5:{position:'RB',value:76,projection:13},
    W5:{position:'WR',value:48,projection:8},W6:{position:'WR',value:44,projection:7},T2:{position:'TE',value:69,projection:10}
  };
  const snap=normalizeLeagueSnapshot({
    league:{leagueId:'TRADE',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},rosterSlots:slots},
    week:7,myRosterId:'1',opponentRosterId:'2',rosters,
    playerPool:rosters.flatMap(r=>r.playerIds).map(id=>({id})),playerStatuses:{},
    freshness:{status:'fresh',asOf:'2026-09-17T10:00:00.000Z'}
  });
  return {snap,tradeValues};
}

function noWeeklyEdgeWaiverFixture(){
  const rosters=[
    {rosterId:'1',playerIds:['Q1','R1','R2','W1','W2','W3','T1','B1']},
    {rosterId:'2',playerIds:['Q2','R3','R4','W4','W5','T2']}
  ];
  const waiverValues={...values,FUTURE:{position:'RB',value:100,projection:1}};
  const snap=normalizeLeagueSnapshot({
    league:{leagueId:'WAIVER',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},rosterSlots:slots},
    week:7,myRosterId:'1',opponentRosterId:'2',rosters,
    playerPool:[...rosters.flatMap(r=>r.playerIds),'FUTURE'].map(id=>({id})),playerStatuses:{},
    freshness:{status:'fresh',asOf:'2026-09-17T10:00:00.000Z'}
  });
  return {snap,waiverValues};
}

test('missing opponent identity explicitly degrades the matchup plan and suppresses matchup recommendations',()=>{
  const plan=buildWeeklyAttackPlan(snapshot({opponentRosterId:''}),'1',values);
  assert.equal(plan.matchupReady,false);
  assert.equal(plan.opponentDataAvailable,false);
  assert.ok(plan.actions.some(action=>action.type==='OPPONENT_DATA_MISSING'&&action.blocking===true));
  assert.equal(plan.actions.some(action=>['WAIVER','TRADE','OPPONENT'].includes(action.type)),false);
});

test('weekly matchup actions exclude season-long trade advice while preserving Trade Hunter output for its own screen',()=>{
  const {snap,tradeValues}=tradeFixture();
  const plan=buildWeeklyAttackPlan(snap,'1',tradeValues);
  assert.ok(plan.tradeOpportunity,'fixture should expose a valid trade opportunity');
  assert.equal(plan.actions.some(action=>action.type==='TRADE'),false);
});

test('weekly matchup actions exclude waivers that do not improve this weeks optimized lineup',()=>{
  const {snap,waiverValues}=noWeeklyEdgeWaiverFixture();
  const plan=buildWeeklyAttackPlan(snap,'1',waiverValues);
  assert.ok(plan.waiverMove,'fixture should still expose a season-long Waiver Assassin move');
  assert.equal(plan.waiverMove.addPlayerId,'FUTURE');
  assert.equal(plan.actions.some(action=>action.type==='WAIVER'),false);
});
