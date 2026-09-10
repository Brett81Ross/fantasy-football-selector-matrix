const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeLeagueSnapshot}=require('../season-core/contracts');

function league(){
  return {
    leagueId:'PLAYOFF-L1',platform:'sleeper',season:2026,teams:4,playoffTeams:2,playoffWeekStart:7,
    scoring:{rec:1},
    rosterSlots:[{id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false}]
  };
}

function playerValues(myProjection=18){
  return [
    {id:'A',name:'My RB',position:'RB',projection:myProjection,value:86,gamesPlayed:6,opportunity:82,roleStability:88},
    {id:'B',name:'Team 2 WR',position:'WR',projection:15,value:76,gamesPlayed:6,opportunity:78,roleStability:84},
    {id:'C',name:'Team 3 RB',position:'RB',projection:13,value:70,gamesPlayed:6,opportunity:74,roleStability:80},
    {id:'D',name:'Team 4 TE',position:'TE',projection:11,value:64,gamesPlayed:6,opportunity:70,roleStability:78}
  ];
}

function fullSnapshot({freshness='fresh',missingRecord=false,complete=true}={}){
  const schedule=[
    {week:5,rosterId:'1',opponentRosterId:'4',matchupId:'5-a'},
    {week:5,rosterId:'4',opponentRosterId:'1',matchupId:'5-a'},
    {week:5,rosterId:'2',opponentRosterId:'3',matchupId:'5-b'},
    {week:5,rosterId:'3',opponentRosterId:'2',matchupId:'5-b'},
    {week:6,rosterId:'1',opponentRosterId:'2',matchupId:'6-a'},
    {week:6,rosterId:'2',opponentRosterId:'1',matchupId:'6-a'},
    {week:6,rosterId:'3',opponentRosterId:'4',matchupId:'6-b'},
    {week:6,rosterId:'4',opponentRosterId:'3',matchupId:'6-b'}
  ];
  return normalizeLeagueSnapshot({
    league:league(),week:4,myRosterId:'1',opponentRosterId:'4',
    rosters:[
      {rosterId:'1',playerIds:['A'],record:missingRecord?null:{wins:2,losses:2,ties:0,pointsFor:410,pointsAgainst:400}},
      {rosterId:'2',playerIds:['B'],record:{wins:3,losses:1,ties:0,pointsFor:430,pointsAgainst:395}},
      {rosterId:'3',playerIds:['C'],record:{wins:2,losses:2,ties:0,pointsFor:405,pointsAgainst:410}},
      {rosterId:'4',playerIds:['D'],record:{wins:1,losses:3,ties:0,pointsFor:390,pointsAgainst:430}}
    ],
    playerPool:playerValues(),
    remainingSchedule:complete?schedule:schedule.filter(row=>row.week===5),
    scheduleCoverage:{expectedWeeks:[5,6],loadedWeeks:complete?[5,6]:[5],complete},
    freshness:{status:freshness,asOf:'2026-09-10T19:00:00.000Z',source:'sleeper'}
  });
}

test('complete standings and schedule produce a deterministic playoff probability and leverage path',()=>{
  const {buildPlayoffPath}=require('../season-core/playoff-path');
  const snapshot=fullSnapshot();
  const values=playerValues();
  const first=buildPlayoffPath(snapshot,'1',values,{seed:'abl34',iterations:2000});
  const second=buildPlayoffPath(snapshot,'1',values,{seed:'abl34',iterations:2000});
  assert.deepEqual(first,second);
  assert.equal(first.mode,'PROBABILITY');
  assert.equal(typeof first.playoffProbability,'number');
  assert.ok(first.playoffProbability>=0&&first.playoffProbability<=100);
  assert.ok(first.leverageWeeks.length>=1);
  assert.ok(first.leverageWeeks.every((item,index,array)=>index===0||array[index-1].probabilitySwing>=item.probabilitySwing));
  assert.equal(typeof first.scheduleDifficulty.score,'number');
});

test('stronger roster improves playoff probability versus an otherwise identical weaker roster',()=>{
  const {buildPlayoffPath}=require('../season-core/playoff-path');
  const snapshot=fullSnapshot();
  const strong=buildPlayoffPath(snapshot,'1',playerValues(22),{seed:'strength-check',iterations:3000});
  const weak=buildPlayoffPath(snapshot,'1',playerValues(7),{seed:'strength-check',iterations:3000});
  assert.ok(strong.playoffProbability>weak.playoffProbability);
});

test('missing standings degrades to readiness and never fabricates a probability',()=>{
  const {buildPlayoffPath}=require('../season-core/playoff-path');
  const result=buildPlayoffPath(fullSnapshot({missingRecord:true}),'1',playerValues(),{seed:'missing-record'});
  assert.equal(result.mode,'READINESS');
  assert.equal(result.playoffProbability,null);
  assert.equal(typeof result.readinessScore,'number');
  assert.ok(result.reasons.some(reason=>/standings/i.test(reason)));
});

test('partial remaining schedule degrades to readiness and names schedule coverage as the reason',()=>{
  const {buildPlayoffPath}=require('../season-core/playoff-path');
  const result=buildPlayoffPath(fullSnapshot({complete:false}),'1',playerValues(),{seed:'partial-schedule'});
  assert.equal(result.mode,'READINESS');
  assert.equal(result.playoffProbability,null);
  assert.ok(result.reasons.some(reason=>/schedule/i.test(reason)));
});

test('stale snapshot lowers confidence without inventing or mutating league state',()=>{
  const {buildPlayoffPath}=require('../season-core/playoff-path');
  const fresh=fullSnapshot();
  const stale=fullSnapshot({freshness:'stale'});
  const beforeSnapshot=JSON.stringify(stale);
  const values=playerValues();
  const beforeValues=JSON.stringify(values);
  const freshResult=buildPlayoffPath(fresh,'1',values,{seed:'freshness',iterations:1200});
  const staleResult=buildPlayoffPath(stale,'1',values,{seed:'freshness',iterations:1200});
  assert.ok(staleResult.confidence<freshResult.confidence);
  assert.equal(JSON.stringify(stale),beforeSnapshot);
  assert.equal(JSON.stringify(values),beforeValues);
});

test('improvement target comes from an actionable Roster Doctor weakness',()=>{
  const {buildPlayoffPath}=require('../season-core/playoff-path');
  const custom=normalizeLeagueSnapshot({
    league:{...league(),rosterSlots:[
      {id:'RB',type:'RB',count:1,eligiblePositions:['RB'],isBench:false,isReserve:false},
      {id:'WR',type:'WR',count:1,eligiblePositions:['WR'],isBench:false,isReserve:false}
    ]},week:4,myRosterId:'1',
    rosters:[
      {rosterId:'1',playerIds:['A','W1'],record:{wins:2,losses:2,ties:0,pointsFor:400,pointsAgainst:400}},
      {rosterId:'2',playerIds:['B'],record:{wins:3,losses:1,ties:0,pointsFor:430,pointsAgainst:390}},
      {rosterId:'3',playerIds:['C'],record:{wins:2,losses:2,ties:0,pointsFor:405,pointsAgainst:410}},
      {rosterId:'4',playerIds:['D'],record:{wins:1,losses:3,ties:0,pointsFor:380,pointsAgainst:430}}
    ],
    playerPool:[...playerValues(),{id:'W1',name:'Weak WR',position:'WR',projection:4,value:28,gamesPlayed:6,opportunity:35,roleStability:40}],
    remainingSchedule:fullSnapshot().remainingSchedule,
    scheduleCoverage:{expectedWeeks:[5,6],loadedWeeks:[5,6],complete:true},
    freshness:{status:'fresh',asOf:'2026-09-10T19:00:00.000Z',source:'sleeper'}
  });
  const result=buildPlayoffPath(custom,'1',[...playerValues(),{id:'W1',name:'Weak WR',position:'WR',projection:4,value:28}],{seed:'weakness',iterations:1000});
  assert.equal(result.improvementTarget.position,'WR');
  assert.match(result.improvementTarget.action,/upgrade/i);
});
