const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeLeagueSnapshot}=require('../season-core/contracts');
const {buildWeeklyAttackPlan}=require('../season-core/weekly-attack-plan');

const slots=[
 {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
 {id:'WR',type:'WR',count:1,eligiblePositions:['WR'],isBench:false,isReserve:false},
 {id:'BN',type:'BN',count:2,eligiblePositions:['QB','WR'],isBench:true,isReserve:false}
];
const values={
 Q1:{name:'Starter QB',position:'QB',value:90,projection:20},
 WQ:{name:'Questionable Star',position:'WR',value:90,projection:16},
 WB:{name:'Bench Backup',position:'WR',value:60,projection:11},
 Q2:{name:'Opponent QB',position:'QB',value:80,projection:18},
 W2:{name:'Opponent WR',position:'WR',value:75,projection:13},
 FA:{name:'Free Agent WR',position:'WR',value:70,projection:12}
};
function snap(){
 return normalizeLeagueSnapshot({
  league:{leagueId:'L',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},rosterSlots:slots},
  week:5,myRosterId:'1',opponentRosterId:'2',
  rosters:[{rosterId:'1',playerIds:['Q1','WQ','WB']},{rosterId:'2',playerIds:['Q2','W2']}],
  playerPool:['Q1','WQ','WB','Q2','W2','FA'].map(id=>({id})),
  playerStatuses:{WQ:{status:'Questionable'}},
  freshness:{status:'fresh',asOf:'2026-10-02T18:00:00.000Z'}
 });
}
test('questionable starter status action names the best legal bench fallback',()=>{
 const plan=buildWeeklyAttackPlan(snap(),'1',values);
 const action=plan.actions.find(item=>item.type==='STATUS'&&item.playerId==='WQ');
 assert.ok(action);
 assert.equal(action.recommendedAction,'PREPARE_BENCH_FALLBACK');
 assert.equal(action.backupPlayerId,'WB');
 assert.equal(action.backupName,'Bench Backup');
 assert.equal(action.backupExpectedPoints,11);
 assert.equal(action.waiverAddPlayerId,null);
 assert.match(action.reason,/bench him and start Bench Backup/i);
 assert.doesNotMatch(action.reason,/keep the best legal fallback ready/i);
});
