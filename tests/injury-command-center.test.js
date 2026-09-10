const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeLeagueSnapshot}=require('../season-core/contracts');

const standardSlots=[
 {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
 {id:'RB',type:'RB',count:1,eligiblePositions:['RB'],isBench:false,isReserve:false},
 {id:'WR',type:'WR',count:1,eligiblePositions:['WR'],isBench:false,isReserve:false},
 {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
 {id:'BN',type:'BN',count:5,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
];

const baseValues={
 Q1:{id:'Q1',name:'Starter QB',position:'QB',team:'AAA',projection:20,games:8,metrics:{consistency:82}},
 R1:{id:'R1',name:'Starter RB',position:'RB',team:'BBB',projection:16,games:8,metrics:{consistency:78}},
 W1:{id:'W1',name:'Starter WR',position:'WR',team:'CCC',projection:15,games:8,metrics:{consistency:76}},
 W2:{id:'W2',name:'Flex WR',position:'WR',team:'DDD',projection:13,games:8,metrics:{consistency:74}},
 R2:{id:'R2',name:'Bench RB',position:'RB',team:'EEE',projection:14,games:8,metrics:{consistency:80}},
 W3:{id:'W3',name:'Bench WR',position:'WR',team:'FFF',projection:12,games:8,metrics:{consistency:77}},
 Q2:{id:'Q2',name:'Bench QB',position:'QB',team:'GGG',projection:18,games:8,metrics:{consistency:79}},
 T1:{id:'T1',name:'Bench TE',position:'TE',team:'HHH',projection:11,games:8,metrics:{consistency:72}},
 OQ:{id:'OQ',name:'Opponent QB',position:'QB',team:'III',projection:18,games:8,metrics:{consistency:80}},
 OR:{id:'OR',name:'Opponent RB',position:'RB',team:'JJJ',projection:14,games:8,metrics:{consistency:75}},
 OW:{id:'OW',name:'Opponent WR',position:'WR',team:'KKK',projection:14,games:8,metrics:{consistency:75}},
 OF:{id:'OF',name:'Opponent Flex',position:'WR',team:'LLL',projection:12,games:8,metrics:{consistency:70}}
};

function makeSnapshot({statuses={},freshness='fresh',starterIds=['Q1','R1','W1','W2'],slots=standardSlots}={}){
 const mine=Object.keys(baseValues).filter(id=>!id.startsWith('O'));
 const theirs=['OQ','OR','OW','OF'];
 return normalizeLeagueSnapshot({
  league:{leagueId:'CMD',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},rosterSlots:slots},
  week:7,myRosterId:'1',opponentRosterId:'2',
  rosters:[
   {rosterId:'1',playerIds:mine,starterPlayerIds:starterIds},
   {rosterId:'2',playerIds:theirs,starterPlayerIds:theirs}
  ],
  playerPool:[...mine,...theirs].map(id=>({id})),playerStatuses:statuses,
  freshness:{status:freshness,asOf:'2026-09-10T13:00:00.000Z'}
 });
}

function engine(){return require('../season-core/injury-command-center');}

test('OUT starter produces a critical actionable alert with a legal bench replacement',()=>{
 const {buildCommandCenter}=engine();
 const snapshot=makeSnapshot({statuses:{R1:{status:'Out'}}});
 const result=buildCommandCenter(snapshot,'1',baseValues,{now:'2026-09-10T13:00:00.000Z'});
 const alert=result.alerts.find(a=>a.playerId==='R1'&&a.type==='UNAVAILABLE_STARTER');
 assert.ok(alert);
 assert.equal(alert.severity,'CRITICAL');
 assert.equal(alert.actionable,true);
 assert.equal(alert.replacementPlayerId,'R2');
 assert.equal(alert.lockState,'UNKNOWN');
 assert.ok(alert.reason.length>20);
});

test('Doubtful ranks above Questionable and stale data reduces confidence without erasing alerts',()=>{
 const {buildCommandCenter}=engine();
 const statuses={R1:{status:'Doubtful'},W1:{status:'Questionable'}};
 const fresh=buildCommandCenter(makeSnapshot({statuses}),'1',baseValues,{});
 const stale=buildCommandCenter(makeSnapshot({statuses,freshness:'stale'}),'1',baseValues,{});
 const freshD=fresh.alerts.find(a=>a.playerId==='R1');
 const freshQ=fresh.alerts.find(a=>a.playerId==='W1');
 const staleD=stale.alerts.find(a=>a.playerId==='R1');
 assert.equal(freshD.severity,'HIGH');
 assert.equal(freshQ.severity,'WATCH');
 assert.ok(fresh.alerts.indexOf(freshD)<fresh.alerts.indexOf(freshQ));
 assert.ok(staleD.confidence<freshD.confidence);
});

test('starter on the current bye week is critical and gets a replacement',()=>{
 const {buildCommandCenter}=engine();
 const values=structuredClone(baseValues);
 values.W1.byeWeek=7;
 const result=buildCommandCenter(makeSnapshot(),'1',values,{});
 const alert=result.alerts.find(a=>a.playerId==='W1'&&a.type==='BYE_STARTER');
 assert.ok(alert);
 assert.equal(alert.severity,'CRITICAL');
 assert.equal(alert.actionable,true);
 assert.equal(alert.replacementPlayerId,'W3');
});

test('already locked unavailable starter is informational and never recommends an impossible swap',()=>{
 const {buildCommandCenter}=engine();
 const snapshot=makeSnapshot({statuses:{R1:{status:'Out'}}});
 const result=buildCommandCenter(snapshot,'1',baseValues,{
  now:'2026-09-10T20:00:00.000Z',kickoffsByPlayerId:{R1:'2026-09-10T19:00:00.000Z',R2:'2026-09-11T00:00:00.000Z'}
 });
 const alert=result.alerts.find(a=>a.playerId==='R1'&&a.type==='UNAVAILABLE_STARTER');
 assert.equal(alert.lockState,'LOCKED');
 assert.equal(alert.severity,'INFO');
 assert.equal(alert.actionable,false);
 assert.equal(alert.replacementPlayerId,null);
});

test('Questionable late starter escalates when its viable backup locks first inside the late-swap window',()=>{
 const {buildCommandCenter}=engine();
 const snapshot=makeSnapshot({statuses:{W1:{status:'Questionable'}}});
 const result=buildCommandCenter(snapshot,'1',baseValues,{
  now:'2026-09-10T17:30:00.000Z',lateSwapWindowMinutes:120,
  kickoffsByPlayerId:{W1:'2026-09-11T00:20:00.000Z',W3:'2026-09-10T18:30:00.000Z'}
 });
 const alert=result.alerts.find(a=>a.playerId==='W1'&&a.type==='QUESTIONABLE_STARTER');
 assert.ok(alert);
 assert.equal(alert.severity,'HIGH');
 assert.equal(alert.actionable,true);
 assert.equal(alert.replacementPlayerId,'W3');
 assert.match(alert.reason,/locks|kickoff|backup/i);
});

test('missing kickoff data stays UNKNOWN and never fabricates a lock',()=>{
 const {buildCommandCenter}=engine();
 const result=buildCommandCenter(makeSnapshot({statuses:{W1:{status:'Questionable'}}}),'1',baseValues,{now:'2026-09-10T23:59:00.000Z'});
 const alert=result.alerts.find(a=>a.playerId==='W1');
 assert.equal(alert.lockState,'UNKNOWN');
 assert.equal(alert.kickoffAt,null);
});

test('SUPERFLEX replacement legality allows a QB backup without hard-coded standard-lineup logic',()=>{
 const {buildCommandCenter}=engine();
 const slots=[
  {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
  {id:'SF',type:'SUPERFLEX',count:1,eligiblePositions:['QB','RB','WR','TE'],isBench:false,isReserve:false},
  {id:'BN',type:'BN',count:5,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
 ];
 const snapshot=makeSnapshot({statuses:{W2:{status:'Out'}},starterIds:['Q1','W2'],slots});
 const result=buildCommandCenter(snapshot,'1',baseValues,{});
 const alert=result.alerts.find(a=>a.playerId==='W2');
 assert.ok(alert);
 assert.equal(alert.replacementPlayerId,'Q2');
 assert.equal(alert.actionable,true);
});

test('locked bench player alone is not surfaced as a lineup emergency',()=>{
 const {buildCommandCenter}=engine();
 const result=buildCommandCenter(makeSnapshot(),'1',baseValues,{
  now:'2026-09-10T20:00:00.000Z',kickoffsByPlayerId:{W3:'2026-09-10T19:00:00.000Z'}
 });
 assert.equal(result.alerts.some(a=>a.playerId==='W3'),false);
});

test('command center never mutates snapshot, player values, or schedule context',()=>{
 const {buildCommandCenter}=engine();
 const snapshot=makeSnapshot({statuses:{R1:{status:'Doubtful'}}});
 const values=structuredClone(baseValues);
 const context={now:'2026-09-10T13:00:00.000Z',kickoffsByTeam:{BBB:'2026-09-11T00:00:00.000Z'}};
 const before=[JSON.stringify(snapshot),JSON.stringify(values),JSON.stringify(context)];
 buildCommandCenter(snapshot,'1',values,context);
 assert.deepEqual([JSON.stringify(snapshot),JSON.stringify(values),JSON.stringify(context)],before);
});
