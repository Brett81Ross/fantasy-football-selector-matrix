const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeLeagueSnapshot}=require('../season-core/contracts');

function league(){return{leagueId:'L1',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},playoffWeekStart:6,playoffTeams:1,rosterSlots:[{id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false}]};}

test('normalizes standings records and a valid remaining schedule without changing ownership',()=>{
  const snapshot=normalizeLeagueSnapshot({
    league:league(),week:3,myRosterId:'1',opponentRosterId:'2',
    rosters:[
      {rosterId:'1',playerIds:['P1'],record:{wins:2,losses:1,ties:0,pointsFor:301.42,pointsAgainst:280.11}},
      {rosterId:'2',playerIds:['P2'],record:{wins:1,losses:2,ties:0,pointsFor:270,pointsAgainst:315}}
    ],
    remainingSchedule:[
      {week:4,rosterId:'1',opponentRosterId:'2',matchupId:'44'},
      {week:4,rosterId:'2',opponentRosterId:'1',matchupId:'44'},
      {week:5,rosterId:'1',opponentRosterId:'2',matchupId:'45'},
      {week:5,rosterId:'2',opponentRosterId:'1',matchupId:'45'},
      {week:0,rosterId:'1',opponentRosterId:'2',matchupId:'bad'},
      {week:5,rosterId:'1',opponentRosterId:'MISSING',matchupId:'bad2'}
    ],
    scheduleCoverage:{expectedWeeks:[4,5],loadedWeeks:[4,5],complete:true},
    playerPool:[{id:'P1'},{id:'P2'},{id:'P3'}],freshness:{status:'fresh',asOf:'2026-09-10T18:00:00.000Z',source:'sleeper'}
  });
  assert.deepEqual(snapshot.rosters[0].record,{wins:2,losses:1,ties:0,pointsFor:301.42,pointsAgainst:280.11});
  assert.equal(snapshot.remainingSchedule.length,4);
  assert.equal(snapshot.remainingSchedule.every(row=>row.week>0&&['1','2'].includes(row.rosterId)&&['1','2'].includes(row.opponentRosterId)),true);
  assert.deepEqual(snapshot.scheduleCoverage,{expectedWeeks:[4,5],loadedWeeks:[4,5],complete:true});
  assert.deepEqual(snapshot.ownedPlayerIds,['P1','P2']);
  assert.equal(Object.isFrozen(snapshot.remainingSchedule),true);
});

test('unknown standings remain null and incomplete coverage cannot be promoted to complete',()=>{
  const snapshot=normalizeLeagueSnapshot({
    league:league(),week:3,myRosterId:'1',
    rosters:[{rosterId:'1',playerIds:['P1']},{rosterId:'2',playerIds:['P2'],record:{wins:null,losses:null}}],
    remainingSchedule:[{week:4,rosterId:'1',opponentRosterId:'2',matchupId:'44'}],
    scheduleCoverage:{expectedWeeks:[4,5],loadedWeeks:[4],complete:true},
    playerPool:[{id:'P1'},{id:'P2'}],freshness:{status:'fresh'}
  });
  assert.equal(snapshot.rosters[0].record,null);
  assert.equal(snapshot.rosters[1].record,null);
  assert.deepEqual(snapshot.scheduleCoverage.expectedWeeks,[4,5]);
  assert.deepEqual(snapshot.scheduleCoverage.loadedWeeks,[4]);
  assert.equal(snapshot.scheduleCoverage.complete,false);
});
