const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeLeagueSnapshot}=require('../season-core/contracts');

const slots=[
 {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
 {id:'RB',type:'RB',count:2,eligiblePositions:['RB'],isBench:false,isReserve:false},
 {id:'WR',type:'WR',count:2,eligiblePositions:['WR'],isBench:false,isReserve:false},
 {id:'TE',type:'TE',count:1,eligiblePositions:['TE'],isBench:false,isReserve:false},
 {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
 {id:'BN',type:'BN',count:6,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
];

const mine=['Q1','R1','R2','W1','W2','W3','W4','T1'];
const theirs=['Q2','R3','R4','W5','W6','W7','T2'];

function snapshot(freshness='fresh'){
 const rosters=[{rosterId:'1',playerIds:mine},{rosterId:'2',playerIds:theirs}];
 return normalizeLeagueSnapshot({
  league:{leagueId:'L',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},rosterSlots:slots},
  week:7,myRosterId:'1',opponentRosterId:'2',rosters,
  playerPool:rosters.flatMap(r=>r.playerIds).map(id=>({id})),
  playerStatuses:{},freshness:{status:freshness,asOf:'2026-09-10T12:00:00.000Z'}
 });
}

const values={
 Q1:{position:'QB',projection:22,floor:16,ceiling:30,games:8,metrics:{consistency:86}},
 R1:{position:'RB',projection:18,floor:10,ceiling:28,games:8,metrics:{consistency:80}},
 R2:{position:'RB',projection:16,floor:9,ceiling:25,games:8,metrics:{consistency:78}},
 W1:{position:'WR',projection:19,floor:10,ceiling:31,games:8,metrics:{consistency:78}},
 W2:{position:'WR',projection:17,floor:9,ceiling:28,games:8,metrics:{consistency:76}},
 W3:{position:'WR',projection:14,floor:10,ceiling:18,volatility:.12,games:8,metrics:{consistency:84}},
 W4:{position:'WR',projection:11,floor:0,ceiling:34,volatility:.8,games:8,metrics:{consistency:48}},
 T1:{position:'TE',projection:12,floor:6,ceiling:20,games:8,metrics:{consistency:74}},
 Q2:{position:'QB',projection:19,floor:14,ceiling:27,games:8,metrics:{consistency:82}},
 R3:{position:'RB',projection:16,floor:8,ceiling:24,games:8,metrics:{consistency:75}},
 R4:{position:'RB',projection:14,floor:7,ceiling:22,games:8,metrics:{consistency:74}},
 W5:{position:'WR',projection:15,floor:8,ceiling:25,games:8,metrics:{consistency:75}},
 W6:{position:'WR',projection:14,floor:7,ceiling:24,games:8,metrics:{consistency:72}},
 W7:{position:'WR',projection:12,floor:5,ceiling:22,games:8,metrics:{consistency:68}},
 T2:{position:'TE',projection:10,floor:5,ceiling:17,games:8,metrics:{consistency:76}}
};

function simulator(){return require('../season-core/matchup-simulator');}

test('same seed and inputs produce exactly the same matchup simulation',()=>{
 const {simulateMatchup}=simulator();
 const a=simulateMatchup(snapshot(),'1',values,{seed:'week-7',iterations:1800});
 const b=simulateMatchup(snapshot(),'1',values,{seed:'week-7',iterations:1800});
 assert.deepEqual(a,b);
 assert.equal(a.iterations,1800);
 assert.equal(a.seed,'week-7');
});

test('a materially stronger optimized lineup produces a win probability above 50 percent',()=>{
 const {simulateMatchup}=simulator();
 const result=simulateMatchup(snapshot(),'1',values,{seed:'favorite',iterations:2500});
 assert.ok(result.winProbability>50,result.winProbability);
 assert.ok(Math.abs(result.winProbability+result.tieProbability+result.lossProbability-100)<0.11);
 assert.ok(result.myAverageScore>result.opponentAverageScore);
 assert.ok(result.averageMargin>0);
});

test('stale league data lowers matchup confidence without changing roster ownership',()=>{
 const {simulateMatchup}=simulator();
 const fresh=simulateMatchup(snapshot('fresh'),'1',values,{seed:'confidence',iterations:1200});
 const stale=simulateMatchup(snapshot('stale'),'1',values,{seed:'confidence',iterations:1200});
 assert.ok(stale.confidence<fresh.confidence,`${stale.confidence} !< ${fresh.confidence}`);
 assert.equal(stale.myRosterId,fresh.myRosterId);
 assert.equal(stale.opponentRosterId,fresh.opponentRosterId);
});

test('an underdog can receive a legal high-upside bench swap when it improves win probability',()=>{
 const {simulateMatchup}=simulator();
 const underdogValues=structuredClone(values);
 underdogValues.Q2.projection=25; underdogValues.Q2.floor=20; underdogValues.Q2.ceiling=31;
 underdogValues.R3.projection=20; underdogValues.R4.projection=18;
 underdogValues.W5.projection=19; underdogValues.W6.projection=18; underdogValues.W7.projection=16;
 underdogValues.T2.projection=14;
 // Keep the upside option just below the starter on median projection, while giving it a much wider winning tail.
 underdogValues.W4.projection=13.5;
 const result=simulateMatchup(snapshot(),'1',underdogValues,{seed:'upside-swap',iterations:4000,minSwapDelta:0.2});
 const swap=result.recommendedSwaps.find(item=>item.outPlayerId==='W3'&&item.inPlayerId==='W4');
 assert.ok(result.winProbability<50,result.winProbability);
 assert.ok(swap,JSON.stringify({winProbability:result.winProbability,averageMargin:result.averageMargin,recommendedSwaps:result.recommendedSwaps},null,2));
 assert.ok(swap.winProbabilityDelta>0);
 assert.equal(swap.legal,true);
 assert.ok(swap.reason.length>20);
});

test('simulation output includes legal lineups confidence risk and advisory swap details',()=>{
 const {simulateMatchup}=simulator();
 const result=simulateMatchup(snapshot(),'1',values,{seed:'shape',iterations:1000});
 assert.equal(result.myLineup.legal,true);
 assert.equal(result.opponentLineup.legal,true);
 assert.equal(typeof result.confidence,'number');
 assert.ok(['HIGH','MEDIUM','LOW','UNAVAILABLE'].includes(result.confidenceLabel));
 assert.equal(typeof result.risk,'number');
 assert.ok(result.risk>=0&&result.risk<=1);
 assert.ok(Array.isArray(result.recommendedSwaps));
});

test('matchup simulation never mutates snapshot or player values',()=>{
 const {simulateMatchup}=simulator();
 const s=snapshot();
 const v=structuredClone(values);
 const beforeSnapshot=JSON.stringify(s);
 const beforeValues=JSON.stringify(v);
 simulateMatchup(s,'1',v,{seed:'immutable',iterations:900});
 assert.equal(JSON.stringify(s),beforeSnapshot);
 assert.equal(JSON.stringify(v),beforeValues);
});
