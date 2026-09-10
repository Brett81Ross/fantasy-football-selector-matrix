const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeLeagueSnapshot}=require('../season-core/contracts');

function league(){return{
  leagueId:'CARD-L1',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},
  rosterSlots:[
    {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
    {id:'RB',type:'RB',count:1,eligiblePositions:['RB'],isBench:false,isReserve:false},
    {id:'WR',type:'WR',count:1,eligiblePositions:['WR'],isBench:false,isReserve:false},
    {id:'TE',type:'TE',count:1,eligiblePositions:['TE'],isBench:false,isReserve:false},
    {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
    {id:'BN',type:'BN',count:3,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
  ]
};}
function values(){return[
  {id:'Q1',name:'Quarterback One',position:'QB',value:82,projection:18},
  {id:'R1',name:'Running Back One',position:'RB',value:55,projection:11},
  {id:'R2',name:'Running Back Two',position:'RB',value:50,projection:9},
  {id:'W1',name:'Receiver One',position:'WR',value:88,projection:17},
  {id:'W2',name:'Receiver Two',position:'WR',value:84,projection:15},
  {id:'T1',name:'Tight End One',position:'TE',value:72,projection:10},
  {id:'O1',name:'Opponent One',position:'RB',value:74,projection:14},
  {id:'FA1',name:'Waiver Target',position:'RB',value:73,projection:15},
  {id:'BUY1',name:'Buy Low Receiver',position:'WR',value:78,projection:16},
  {id:'SELL1',name:'Sell High Receiver',position:'WR',value:67,projection:12}
];}
function snapshot({freshness='fresh',out=false}={}){
  const statuses=Object.fromEntries(values().map(p=>[p.id,{raw:'Active'}]));
  if(out)statuses.R1={raw:'Out'};
  return normalizeLeagueSnapshot({
    league:league(),week:5,myRosterId:'1',opponentRosterId:'2',
    rosters:[
      {rosterId:'1',playerIds:['Q1','R1','R2','W1','W2','T1','SELL1'],starterPlayerIds:['Q1','R1','W1','T1','W2']},
      {rosterId:'2',playerIds:['O1','BUY1'],starterPlayerIds:['O1','BUY1']}
    ],
    playerPool:values(),playerStatuses:statuses,
    freshness:{status:freshness,asOf:'2026-09-10T20:00:00.000Z',source:'sleeper'}
  });
}
function attackPlan({status=false,tradeSignals=true}={}){
  return{
    confidence:91,risk:.18,freshness:{status:'fresh',asOf:'2026-09-10T20:00:00.000Z',source:'sleeper'},
    actions:[
      {type:'WAIVER',priority:97,confidence:90,risk:.15,reason:'RB upgrade available.',addPlayerId:'FA1',dropPlayerId:'R2'},
      ...(status?[{type:'STATUS',priority:98,confidence:93,risk:.92,reason:'R1 is Out; replace before lock.',playerId:'R1',status:'OUT'}]:[])
    ],
    urgentStatusAlerts:status?[{playerId:'R1',status:'OUT',label:'Out',risk:.92,confidence:93}]:[],
    waiverMove:{addPlayerId:'FA1',dropPlayerId:'R2',priority:9,confidence:90,risk:.15,reason:'Upgrade weak RB depth.',faab:{available:true,recommendedBid:17,minBid:13,maxBid:21}},
    tradeOpportunity:{
      givePlayerIds:['SELL1'],getPlayerIds:['BUY1'],counterpartRosterId:'2',confidence:84,risk:.24,reason:'Sell high at WR for a stronger ROS receiver.',
      signals:tradeSignals?['SELL_HIGH','BUY_LOW']:[],expectedImprovement:8.4,
      rosterBenefit:{label:'IMPROVES_TEAM',compositeEdge:8.4}
    },
    opponent:{primaryVulnerability:{position:'RB',reason:'Opponent is thin at RB.'},actions:[]}
  };
}

test('report card returns every required grade and summary card from existing decision outputs',()=>{
  const {buildWeeklyReportCard}=require('../season-core/weekly-report-card');
  const result=buildWeeklyReportCard(snapshot(),'1',values(),{attackPlan:attackPlan()});
  assert.deepEqual(Object.keys(result.grades),['QB','RB','WR','TE','FLEX','BENCH','OVERALL']);
  for(const grade of Object.values(result.grades))assert.ok(grade===null||(grade>=0&&grade<=100));
  for(const key of ['bestMove','biggestRisk','biggestOpportunity','playerToSell','playerToBuy','waiverPriority','nextAction'])assert.ok(Object.prototype.hasOwnProperty.call(result.cards,key),key);
  assert.equal(result.cards.playerToSell.playerId,'SELL1');
  assert.equal(result.cards.playerToBuy.playerId,'BUY1');
  assert.equal(result.cards.waiverPriority.addPlayerId,'FA1');
});

test('FLEX grade follows actual flexible-slot eligibility instead of hard-coded position assumptions',()=>{
  const {buildWeeklyReportCard}=require('../season-core/weekly-report-card');
  const result=buildWeeklyReportCard(snapshot(),'1',values(),{attackPlan:attackPlan()});
  assert.equal(typeof result.grades.FLEX,'number');
  assert.ok(result.grades.FLEX>=result.grades.RB,'strong WR/TE flexibility should protect the FLEX grade from the weak RB room');
});

test('safety-critical status becomes the biggest risk and next action ahead of convenience moves',()=>{
  const {buildWeeklyReportCard}=require('../season-core/weekly-report-card');
  const result=buildWeeklyReportCard(snapshot({out:true}),'1',values(),{attackPlan:attackPlan({status:true})});
  assert.equal(result.cards.biggestRisk.type,'STATUS');
  assert.equal(result.cards.biggestRisk.playerId,'R1');
  assert.equal(result.cards.nextAction.type,'STATUS');
  assert.equal(result.cards.nextAction.playerId,'R1');
});

test('buy and sell cards are omitted when Trade Hunter supplies no defensible signal',()=>{
  const {buildWeeklyReportCard}=require('../season-core/weekly-report-card');
  const result=buildWeeklyReportCard(snapshot(),'1',values(),{attackPlan:attackPlan({tradeSignals:false})});
  assert.equal(result.cards.playerToSell,null);
  assert.equal(result.cards.playerToBuy,null);
  assert.ok(result.cards.bestMove);
});

test('missing advanced attack-plan output still renders core grades and roster risk without throwing',()=>{
  const {buildWeeklyReportCard}=require('../season-core/weekly-report-card');
  const result=buildWeeklyReportCard(snapshot(),'1',values(),{attackPlan:null,disableAttackPlan:true});
  assert.equal(typeof result.grades.OVERALL,'number');
  assert.ok(result.cards.biggestRisk);
  assert.equal(result.cards.playerToSell,null);
  assert.equal(result.cards.playerToBuy,null);
  assert.equal(result.cards.waiverPriority,null);
  assert.equal(result.degraded,true);
  assert.ok(result.missingSources.includes('weekly-attack-plan'));
});

test('stale freshness propagates into every non-null card and lowers report confidence',()=>{
  const {buildWeeklyReportCard}=require('../season-core/weekly-report-card');
  const fresh=buildWeeklyReportCard(snapshot(),'1',values(),{attackPlan:attackPlan()});
  const stalePlan={...attackPlan(),freshness:{status:'stale',asOf:'2026-09-10T19:00:00.000Z',source:'sleeper'},confidence:61,risk:.42};
  const stale=buildWeeklyReportCard(snapshot({freshness:'stale'}),'1',values(),{attackPlan:stalePlan});
  assert.ok(stale.confidence<fresh.confidence);
  for(const card of Object.values(stale.cards))if(card)assert.equal(card.freshness,'STALE');
});

test('report-card composition is deterministic and never mutates snapshot player values or supplied plan',()=>{
  const {buildWeeklyReportCard}=require('../season-core/weekly-report-card');
  const source=snapshot(),players=values(),plan=attackPlan();
  const beforeSource=JSON.stringify(source),beforePlayers=JSON.stringify(players),beforePlan=JSON.stringify(plan);
  const first=buildWeeklyReportCard(source,'1',players,{attackPlan:plan});
  const second=buildWeeklyReportCard(source,'1',players,{attackPlan:plan});
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(source),beforeSource);
  assert.equal(JSON.stringify(players),beforePlayers);
  assert.equal(JSON.stringify(plan),beforePlan);
});
