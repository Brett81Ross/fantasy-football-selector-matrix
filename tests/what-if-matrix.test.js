const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeLeagueSnapshot}=require('../season-core/contracts');

function league(){
  return {
    leagueId:'WHATIF-L1',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},
    rosterSlots:[
      {id:'RB',type:'RB',count:1,eligiblePositions:['RB'],isBench:false,isReserve:false},
      {id:'WR',type:'WR',count:1,eligiblePositions:['WR'],isBench:false,isReserve:false},
      {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
      {id:'BN',type:'BN',count:3,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
    ]
  };
}

function values(){
  return [
    {id:'R1',name:'Current RB',position:'RB',projection:8,value:48,restOfSeasonValue:49,gamesPlayed:6,opportunity:62,roleStability:70},
    {id:'R2',name:'Bench RB',position:'RB',projection:15,value:75,restOfSeasonValue:77,gamesPlayed:6,opportunity:82,roleStability:84},
    {id:'W1',name:'Current WR',position:'WR',projection:12,value:68,restOfSeasonValue:70,gamesPlayed:6,opportunity:75,roleStability:80},
    {id:'T1',name:'Current TE',position:'TE',projection:6,value:38,restOfSeasonValue:40,gamesPlayed:6,opportunity:55,roleStability:65},
    {id:'O1',name:'Opponent RB',position:'RB',projection:13,value:70,restOfSeasonValue:71,gamesPlayed:6,opportunity:76,roleStability:81},
    {id:'O2',name:'Opponent WR',position:'WR',projection:11,value:64,restOfSeasonValue:66,gamesPlayed:6,opportunity:72,roleStability:78},
    {id:'O3',name:'Opponent TE',position:'TE',projection:9,value:58,restOfSeasonValue:60,gamesPlayed:6,opportunity:68,roleStability:74},
    {id:'FA1',name:'Waiver WR',position:'WR',projection:18,value:82,restOfSeasonValue:84,gamesPlayed:6,opportunity:86,roleStability:85},
    {id:'P1',name:'Partner RB',position:'RB',projection:16,value:80,restOfSeasonValue:82,gamesPlayed:6,opportunity:84,roleStability:86}
  ];
}

function snapshot(){
  const status=Object.fromEntries(values().map(p=>[p.id,{raw:'Active'}]));
  return normalizeLeagueSnapshot({
    league:league(),week:4,myRosterId:'1',opponentRosterId:'2',
    rosters:[
      {rosterId:'1',ownerId:'U1',playerIds:['R1','R2','W1','T1'],starterPlayerIds:['R1','W1','T1']},
      {rosterId:'2',ownerId:'U2',playerIds:['O1','O2','O3','P1'],starterPlayerIds:['O1','O2','O3']}
    ],
    playerPool:values(),playerStatuses:status,
    freshness:{status:'fresh',asOf:'2026-09-10T19:00:00.000Z',source:'sleeper'}
  });
}

test('START_SIT evaluates the requested legal swap without mutating canonical starters',()=>{
  const {simulateScenario}=require('../season-core/what-if-matrix');
  const source=snapshot();
  const before=JSON.stringify(source);
  const result=simulateScenario(source,'1',values(),{type:'START_SIT',startPlayerId:'R2',sitPlayerId:'R1'},{seed:'start-sit'});
  assert.equal(result.valid,true);
  assert.equal(result.scenario.type,'START_SIT');
  assert.equal(result.deltas.lineupEdge,7);
  assert.equal(result.recommendation,'IMPROVES TEAM');
  assert.deepEqual(result.simulatedSnapshot.rosters.find(r=>r.rosterId==='1').starterPlayerIds.sort(),['R2','T1','W1'].sort());
  assert.equal(JSON.stringify(source),before);
});

test('ADD_DROP rebuilds canonical ownership and free-agent sets on the clone only',()=>{
  const {simulateScenario}=require('../season-core/what-if-matrix');
  const source=snapshot();
  const before=JSON.stringify(source);
  const result=simulateScenario(source,'1',values(),{type:'ADD_DROP',addPlayerId:'FA1',dropPlayerId:'T1'},{seed:'add-drop',iterations:700});
  assert.equal(result.valid,true);
  const mine=result.simulatedSnapshot.rosters.find(r=>r.rosterId==='1');
  assert.ok(mine.playerIds.includes('FA1'));
  assert.ok(!mine.playerIds.includes('T1'));
  assert.ok(result.simulatedSnapshot.ownedPlayerIds.includes('FA1'));
  assert.ok(result.simulatedSnapshot.freeAgentPlayerIds.includes('T1'));
  assert.ok(result.deltas.lineupEdge>0);
  assert.ok(result.deltas.rosterValue>0);
  assert.equal(result.recommendation,'IMPROVES TEAM');
  assert.equal(JSON.stringify(source),before);
});

test('ADD_DROP rejects owned adds and unowned drops before recomputation',()=>{
  const {simulateScenario}=require('../season-core/what-if-matrix');
  const source=snapshot();
  const owned=simulateScenario(source,'1',values(),{type:'ADD_DROP',addPlayerId:'O1',dropPlayerId:'T1'});
  const missing=simulateScenario(source,'1',values(),{type:'ADD_DROP',addPlayerId:'FA1',dropPlayerId:'NOPE'});
  assert.equal(owned.valid,false);
  assert.ok(owned.errors.some(error=>/free agent/i.test(error)));
  assert.equal(missing.valid,false);
  assert.ok(missing.errors.some(error=>/owned/i.test(error)));
});

test('TRADE reuses ownership-safe exchange semantics and scores the simulated roster',()=>{
  const {simulateScenario}=require('../season-core/what-if-matrix');
  const source=snapshot();
  const result=simulateScenario(source,'1',values(),{type:'TRADE',counterpartRosterId:'2',givePlayerIds:['R1'],getPlayerIds:['P1']},{seed:'trade',iterations:700});
  assert.equal(result.valid,true);
  const mine=result.simulatedSnapshot.rosters.find(r=>r.rosterId==='1');
  const other=result.simulatedSnapshot.rosters.find(r=>r.rosterId==='2');
  assert.ok(mine.playerIds.includes('P1')&&!mine.playerIds.includes('R1'));
  assert.ok(other.playerIds.includes('R1')&&!other.playerIds.includes('P1'));
  assert.ok(result.deltas.lineupEdge>0);
  assert.equal(result.recommendation,'IMPROVES TEAM');
});

test('invalid TRADE ownership is rejected and never creates a simulated league state',()=>{
  const {simulateScenario}=require('../season-core/what-if-matrix');
  const result=simulateScenario(snapshot(),'1',values(),{type:'TRADE',counterpartRosterId:'2',givePlayerIds:['FA1'],getPlayerIds:['P1']});
  assert.equal(result.valid,false);
  assert.equal(result.simulatedSnapshot,null);
  assert.ok(result.errors.some(error=>/not owned|owned by roster/i.test(error)));
});

test('same inputs are deterministic and preserve both source snapshot and player values byte-for-byte',()=>{
  const {simulateScenario}=require('../season-core/what-if-matrix');
  const source=snapshot();
  const players=values();
  const snapshotBefore=JSON.stringify(source);
  const valuesBefore=JSON.stringify(players);
  const scenario={type:'ADD_DROP',addPlayerId:'FA1',dropPlayerId:'T1'};
  const first=simulateScenario(source,'1',players,scenario,{seed:'deterministic',iterations:700});
  const second=simulateScenario(source,'1',players,scenario,{seed:'deterministic',iterations:700});
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(source),snapshotBefore);
  assert.equal(JSON.stringify(players),valuesBefore);
});

test('matchup win-probability delta is null when no current opponent is available',()=>{
  const {simulateScenario}=require('../season-core/what-if-matrix');
  const raw=JSON.parse(JSON.stringify(snapshot()));
  raw.opponentRosterId=null;
  const result=simulateScenario(raw,'1',values(),{type:'ADD_DROP',addPlayerId:'FA1',dropPlayerId:'T1'},{seed:'no-opponent'});
  assert.equal(result.valid,true);
  assert.equal(result.deltas.matchupWinProbability,null);
});

test('every valid scenario returns the complete decision envelope',()=>{
  const {simulateScenario}=require('../season-core/what-if-matrix');
  const result=simulateScenario(snapshot(),'1',values(),{type:'ADD_DROP',addPlayerId:'FA1',dropPlayerId:'T1'},{seed:'envelope',iterations:700});
  assert.ok(['IMPROVES TEAM','NEUTRAL','HURTS TEAM'].includes(result.recommendation));
  for(const key of ['lineupEdge','rosterValue','positionalDepth','matchupWinProbability','confidence','risk'])assert.ok(Object.prototype.hasOwnProperty.call(result.deltas,key),key);
  assert.equal(typeof result.confidence,'number');
  assert.equal(typeof result.risk,'number');
  assert.ok(Array.isArray(result.reasons));
});
