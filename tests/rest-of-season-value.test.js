const test = require('node:test');
const assert = require('node:assert/strict');

function api(){ return require('../season-core/rest-of-season-value'); }

function snapshot(statuses={}){
  return {
    freshness:{ status:'fresh', asOf:'2026-09-10T12:00:00.000Z', source:'sleeper' },
    playerStatuses:statuses,
    ownedPlayerIds:['HOT','STEADY','ACTIVE','OUT','QB1','QB2','RB1','RB2','SCHED'],
    freeAgentPlayerIds:[]
  };
}

function player(id,position,metrics,extra={}){
  return { id, name:id, position, value:70, projection:15, games:8, rookie:false, yearsExp:3, floor:10, ceiling:20, metrics:{ availability:100, ...metrics }, ...extra };
}

test('supported hot streak with strong opportunity can rank highly',()=>{
  const { rankRestOfSeason }=api();
  const hot=player('HOT','WR',{production:94,opportunity:95,consistency:74,ceiling:95,trend:100});
  const steady=player('STEADY','WR',{production:80,opportunity:82,consistency:82,ceiling:84,trend:62});
  const ranked=rankRestOfSeason([hot,steady],snapshot({HOT:{status:'Active'},STEADY:{status:'Active'}}),{positionScarcity:{WR:50}});
  assert.equal(ranked[0].playerId,'HOT');
});

test('unsupported hot streak cannot beat a stable role solely on trend',()=>{
  const { rankRestOfSeason }=api();
  const hot=player('HOT','WR',{production:95,opportunity:25,consistency:55,ceiling:90,trend:100});
  const steady=player('STEADY','WR',{production:80,opportunity:85,consistency:80,ceiling:82,trend:60});
  const ranked=rankRestOfSeason([hot,steady],snapshot({HOT:{status:'Active'},STEADY:{status:'Active'}}),{positionScarcity:{WR:50}});
  assert.equal(ranked[0].playerId,'STEADY');
  const hotResult=ranked.find(x=>x.playerId==='HOT');
  assert.ok(hotResult.reasons.some(reason=>/trend|opportunity/i.test(reason)));
});

test('injured player receives an availability adjustment without changing the source player',()=>{
  const { rankRestOfSeason }=api();
  const active=player('ACTIVE','RB',{production:82,opportunity:86,consistency:78,ceiling:88,trend:70});
  const out=player('OUT','RB',{production:82,opportunity:86,consistency:78,ceiling:88,trend:70});
  const before=JSON.stringify([active,out]);
  const ranked=rankRestOfSeason([active,out],snapshot({ACTIVE:{status:'Active'},OUT:{status:'Out'}}),{positionScarcity:{RB:50}});
  const a=ranked.find(x=>x.playerId==='ACTIVE');
  const b=ranked.find(x=>x.playerId==='OUT');
  assert.ok(a.restOfSeasonValue>b.restOfSeasonValue);
  assert.ok(a.factors.availability>b.factors.availability);
  assert.ok(b.reasons.some(reason=>/availability|out/i.test(reason)));
  assert.equal(JSON.stringify([active,out]),before);
});

test('position normalization does not naively reward QB raw points over equivalent RB value',()=>{
  const { rankRestOfSeason }=api();
  const common={production:80,opportunity:80,consistency:80,ceiling:80,trend:70};
  const players=[
    player('QB1','QB',common,{projection:25,value:80}),
    player('QB2','QB',common,{projection:20,value:60}),
    player('RB1','RB',common,{projection:15,value:80}),
    player('RB2','RB',common,{projection:10,value:60})
  ];
  const ranked=rankRestOfSeason(players,snapshot(Object.fromEntries(players.map(p=>[p.id,{status:'Active'}]))),{positionScarcity:{QB:50,RB:50}});
  const qb=ranked.find(x=>x.playerId==='QB1');
  const rb=ranked.find(x=>x.playerId==='RB1');
  assert.equal(qb.factors.replacementValue,rb.factors.replacementValue);
  assert.equal(qb.restOfSeasonValue,rb.restOfSeasonValue);
});

test('schedule and playoff factors stay neutral unless context is supplied',()=>{
  const { rankRestOfSeason }=api();
  const p=player('SCHED','TE',{production:75,opportunity:80,consistency:75,ceiling:80,trend:65});
  const snap=snapshot({SCHED:{status:'Active'}});
  const neutral=rankRestOfSeason([p],snap,{positionScarcity:{TE:50}})[0];
  const favorable=rankRestOfSeason([p],snap,{positionScarcity:{TE:50},scheduleStrength:{SCHED:90},playoffScheduleStrength:{SCHED:90}})[0];
  assert.equal(neutral.factors.schedule,50);
  assert.equal(neutral.factors.playoffSchedule,50);
  assert.ok(neutral.reasons.some(reason=>/neutral/i.test(reason)));
  assert.ok(favorable.restOfSeasonValue>neutral.restOfSeasonValue);
});

test('every result exposes deterministic factors confidence tier and reasoning',()=>{
  const { rankRestOfSeason }=api();
  const a=player('A','WR',{production:70,opportunity:70,consistency:70,ceiling:70,trend:70});
  const b=player('B','WR',{production:70,opportunity:70,consistency:70,ceiling:70,trend:70});
  const snap={...snapshot({A:{status:'Active'},B:{status:'Active'}}),ownedPlayerIds:['A','B']};
  const first=rankRestOfSeason([b,a],snap,{positionScarcity:{WR:50}});
  const second=rankRestOfSeason([b,a],snap,{positionScarcity:{WR:50}});
  assert.deepEqual(first,second);
  assert.deepEqual(first.map(x=>x.playerId),['A','B']);
  for(const result of first){
    assert.equal(typeof result.restOfSeasonValue,'number');
    assert.ok(['ELITE','STRONG','STARTABLE','DEPTH','REPLACEMENT'].includes(result.tier));
    assert.equal(typeof result.confidence,'number');
    assert.ok(['HIGH','MEDIUM','LOW','UNAVAILABLE'].includes(result.confidenceLabel));
    assert.equal(Object.keys(result.factors).length,10);
    assert.ok(result.reasons.length>=1);
  }
});

test('enrichPlayerValues preserves original fields and adds only ROS compatibility fields',()=>{
  const { enrichPlayerValues }=api();
  const original={
    P1:{id:'P1',name:'Player One',position:'WR',custom:'keep-me',value:66,projection:14,games:9,metrics:{production:70,opportunity:75,consistency:72,ceiling:80,trend:68,availability:100}}
  };
  const before=JSON.stringify(original);
  const enriched=enrichPlayerValues(original,{...snapshot({P1:{status:'Active'}}),ownedPlayerIds:['P1']},{positionScarcity:{WR:50}});
  assert.equal(JSON.stringify(original),before);
  assert.equal(enriched.P1.custom,'keep-me');
  assert.equal(typeof enriched.P1.restOfSeasonValue,'number');
  assert.equal(typeof enriched.P1.rosTier,'string');
  assert.equal(typeof enriched.P1.rosConfidence,'number');
  assert.equal(typeof enriched.P1.rosFactors,'object');
  const added=Object.keys(enriched.P1).filter(key=>!(key in original.P1));
  assert.deepEqual(added.sort(),['restOfSeasonValue','rosConfidence','rosFactors','rosTier'].sort());
});
