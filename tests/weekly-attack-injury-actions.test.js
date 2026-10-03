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
  rosters:[{rosterId:'1',playerIds:['Q1','WQ','WB'],starterPlayerIds:['Q1','WQ'],reservePlayerIds:['WB']},{rosterId:'2',playerIds:['Q2','W2'],starterPlayerIds:['Q2','W2']}],
  playerPool:['Q1','WQ','WB','Q2','W2','FA'].map(id=>({id})),
  playerStatuses:{WQ:{status:'Questionable',injuryBodyPart:'hamstring',injuryStartDate:'2026-09-28',practiceParticipation:'Limited',practiceDescription:'Limited Practice',newsUpdated:1790989200000,source:'sleeper'}},
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
 const alert=plan.urgentStatusAlerts.find(item=>item.playerId==='WQ');
 assert.equal(alert.injuryBodyPart,'hamstring');
 assert.equal(alert.injuryStartDate,'2026-09-28');
 assert.equal(alert.practiceParticipation,'Limited');
 assert.equal(alert.practiceDescription,'Limited Practice');
 assert.equal(alert.source,'sleeper');
 assert.equal(alert.asOf,'2026-10-02T18:00:00.000Z');
});


test('injured bench player remains visible in status data but does not create urgent replacement action',()=>{
 const snapshot=snap();
 snapshot.playerStatuses.WB={status:'Questionable',injuryBodyPart:'ankle',source:'sleeper'};
 const plan=buildWeeklyAttackPlan(snapshot,'1',values);
 assert.ok(plan.urgentStatusAlerts.some(item=>item.playerId==='WB'));
 assert.equal(plan.actions.some(item=>item.type==='STATUS'&&item.playerId==='WB'),false);
});

test('OUT starter gets explicit replace-with-bench action instead of wait-and-see language',()=>{
 const snapshot=snap();
 snapshot.playerStatuses.WQ={status:'Out',injuryBodyPart:'hamstring',source:'sleeper'};
 const plan=buildWeeklyAttackPlan(snapshot,'1',values);
 const action=plan.actions.find(item=>item.type==='STATUS'&&item.playerId==='WQ');
 assert.ok(action);
 assert.equal(action.recommendedAction,'REPLACE_WITH_BENCH');
 assert.equal(action.backupPlayerId,'WB');
 assert.match(action.reason,/Replace him with Bench Backup/i);
 assert.doesNotMatch(action.reason,/If ruled inactive/i);
});

test('Weekly Attack Plan does not promote Trade Hunter output as a weekly action',()=>{
 const plan=buildWeeklyAttackPlan(snap(),'1',values);
 assert.equal(plan.actions.some(item=>item.type==='TRADE'),false);
});


test('injury waiver fallback must be legal for the injured starter slot and positively improve this week',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../season-core/weekly-attack-plan.js'),'utf8');
 assert.match(source,/eligiblePositions\.has\(text\(move\.targetPosition\)\.toUpperCase\(\)\)/);
 assert.match(source,/num\(move\.expectedImprovement\)>0/);
 assert.match(source,/num\(move\.weeklyLineupDelta\)>0/);
 assert.doesNotMatch(source,/\|\|waiverMove/);
});
