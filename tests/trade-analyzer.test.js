const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLeagueSnapshot } = require('../season-core/contracts');
const { analyzeTrade } = require('../season-core/trade-analyzer');

const slots = [
  {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
  {id:'RB',type:'RB',count:1,eligiblePositions:['RB'],isBench:false,isReserve:false},
  {id:'WR',type:'WR',count:1,eligiblePositions:['WR'],isBench:false,isReserve:false},
  {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
  {id:'BN',type:'BN',count:4,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
];

function makeSnapshot(rosters, freshness='fresh') {
  const ids=[...new Set(rosters.flatMap(roster=>roster.playerIds))];
  return normalizeLeagueSnapshot({
    league:{leagueId:'L1',platform:'sleeper',season:2026,teams:rosters.length,scoring:{rec:1},rosterSlots:slots},
    week:7,
    myRosterId:'ME',
    opponentRosterId:'THEM',
    rosters,
    playerPool:ids.map(id=>({id})),
    playerStatuses:{},
    freshness:{status:freshness,asOf:'2026-09-10T18:00:00.000Z',source:'sleeper'}
  });
}

function fairButBadFixture() {
  const snapshot=makeSnapshot([
    {rosterId:'ME',playerIds:['Q1','R_STAR','R_LOW','W1','W2']},
    {rosterId:'THEM',playerIds:['Q2','R2','W_GET','W3','W4']}
  ]);
  const values={
    Q1:{name:'My QB',position:'QB',projection:20,marketValue:75,restOfSeasonValue:75},
    R_STAR:{name:'My RB1',position:'RB',projection:20,marketValue:80,restOfSeasonValue:82},
    R_LOW:{name:'My RB2',position:'RB',projection:5,marketValue:25,restOfSeasonValue:30},
    W1:{name:'My WR1',position:'WR',projection:18,marketValue:78,restOfSeasonValue:78},
    W2:{name:'My WR2',position:'WR',projection:17,marketValue:74,restOfSeasonValue:74},
    Q2:{name:'Their QB',position:'QB',projection:19,marketValue:72,restOfSeasonValue:72},
    R2:{name:'Their RB',position:'RB',projection:16,marketValue:70,restOfSeasonValue:70},
    W_GET:{name:'Their WR1',position:'WR',projection:20,marketValue:80,restOfSeasonValue:82},
    W3:{name:'Their WR2',position:'WR',projection:16,marketValue:68,restOfSeasonValue:68},
    W4:{name:'Their WR3',position:'WR',projection:14,marketValue:60,restOfSeasonValue:60}
  };
  return {snapshot,values,deal:{counterpartRosterId:'THEM',givePlayerIds:['R_STAR'],getPlayerIds:['W_GET']}};
}

test('a market-fair trade can still hurt my optimized roster', () => {
  const {snapshot,values,deal}=fairButBadFixture();
  const result=analyzeTrade(snapshot,'ME',deal,values);
  assert.equal(result.valid,true);
  assert.equal(result.fairness.label,'FAIR');
  assert.equal(result.rosterBenefit.label,'HURTS_TEAM');
  assert.ok(result.deltas.lineupPoints<0);
  assert.ok(result.before.lineupPoints>result.after.lineupPoints);
});

test('a beneficial trade improves optimized lineup and rest-of-season roster value', () => {
  const snapshot=makeSnapshot([
    {rosterId:'ME',playerIds:['Q1','R_LOW','W1','W2','W3']},
    {rosterId:'THEM',playerIds:['Q2','R_GET','R2','W4','W5']}
  ]);
  const values={
    Q1:{position:'QB',projection:20,marketValue:75,restOfSeasonValue:75},R_LOW:{position:'RB',projection:5,marketValue:30,restOfSeasonValue:30},
    W1:{position:'WR',projection:18,marketValue:82,restOfSeasonValue:82},W2:{position:'WR',projection:17,marketValue:76,restOfSeasonValue:76},W3:{position:'WR',projection:16,marketValue:70,restOfSeasonValue:60},
    Q2:{position:'QB',projection:19,marketValue:72,restOfSeasonValue:72},R_GET:{position:'RB',projection:19,marketValue:70,restOfSeasonValue:82},R2:{position:'RB',projection:16,marketValue:64,restOfSeasonValue:64},
    W4:{position:'WR',projection:15,marketValue:65,restOfSeasonValue:65},W5:{position:'WR',projection:14,marketValue:60,restOfSeasonValue:60}
  };
  const result=analyzeTrade(snapshot,'ME',{counterpartRosterId:'THEM',givePlayerIds:['W3'],getPlayerIds:['R_GET']},values);
  assert.equal(result.valid,true);
  assert.equal(result.fairness.label,'FAIR');
  assert.equal(result.rosterBenefit.label,'IMPROVES_TEAM');
  assert.ok(result.deltas.lineupPoints>0);
  assert.ok(result.deltas.restOfSeasonValue>0);
});

test('a two-for-two trade preserves both roster counts and legal lineups', () => {
  const snapshot=makeSnapshot([
    {rosterId:'ME',playerIds:['Q1','R1','R2','W1','W2','W3']},
    {rosterId:'THEM',playerIds:['Q2','R3','R4','W4','W5','W6']}
  ]);
  const values={
    Q1:{position:'QB',projection:20,marketValue:75,restOfSeasonValue:75},R1:{position:'RB',projection:18,marketValue:78,restOfSeasonValue:78},R2:{position:'RB',projection:12,marketValue:55,restOfSeasonValue:55},W1:{position:'WR',projection:18,marketValue:78,restOfSeasonValue:78},W2:{position:'WR',projection:16,marketValue:70,restOfSeasonValue:70},W3:{position:'WR',projection:12,marketValue:55,restOfSeasonValue:55},
    Q2:{position:'QB',projection:19,marketValue:72,restOfSeasonValue:72},R3:{position:'RB',projection:17,marketValue:76,restOfSeasonValue:76},R4:{position:'RB',projection:13,marketValue:58,restOfSeasonValue:58},W4:{position:'WR',projection:17,marketValue:76,restOfSeasonValue:76},W5:{position:'WR',projection:15,marketValue:66,restOfSeasonValue:66},W6:{position:'WR',projection:13,marketValue:58,restOfSeasonValue:58}
  };
  const result=analyzeTrade(snapshot,'ME',{counterpartRosterId:'THEM',givePlayerIds:['R2','W3'],getPlayerIds:['R4','W6']},values);
  assert.equal(result.valid,true);
  assert.equal(result.before.rosterCount,result.after.rosterCount);
  assert.equal(result.before.counterpartRosterCount,result.after.counterpartRosterCount);
  assert.equal(result.before.lineupLegal,true);
  assert.equal(result.after.lineupLegal,true);
  assert.equal(result.after.counterpartLineupLegal,true);
});

test('invalid ownership duplicates and unequal trade counts are rejected without mutating state', () => {
  const {snapshot,values}=fairButBadFixture();
  const snapshotBefore=JSON.stringify(snapshot);
  const valuesBefore=JSON.stringify(values);
  const wrongOwner=analyzeTrade(snapshot,'ME',{counterpartRosterId:'THEM',givePlayerIds:['W_GET'],getPlayerIds:['R_STAR']},values);
  const duplicate=analyzeTrade(snapshot,'ME',{counterpartRosterId:'THEM',givePlayerIds:['R_STAR','R_STAR'],getPlayerIds:['W_GET','W3']},values);
  const unequal=analyzeTrade(snapshot,'ME',{counterpartRosterId:'THEM',givePlayerIds:['R_STAR'],getPlayerIds:['W_GET','W3']},values);
  assert.equal(wrongOwner.valid,false);
  assert.equal(duplicate.valid,false);
  assert.equal(unequal.valid,false);
  assert.equal(JSON.stringify(snapshot),snapshotBefore);
  assert.equal(JSON.stringify(values),valuesBefore);
});

test('identical inputs are deterministic and inputs remain byte-for-byte unchanged', () => {
  const {snapshot,values,deal}=fairButBadFixture();
  const snapshotBefore=JSON.stringify(snapshot);
  const valuesBefore=JSON.stringify(values);
  const first=analyzeTrade(snapshot,'ME',deal,values);
  const second=analyzeTrade(snapshot,'ME',deal,values);
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(snapshot),snapshotBefore);
  assert.equal(JSON.stringify(values),valuesBefore);
  assert.ok(Object.isFrozen(first));
});

test('playoff outlook stays null when explicit playoff factors are unavailable', () => {
  const {snapshot,values,deal}=fairButBadFixture();
  const result=analyzeTrade(snapshot,'ME',deal,values);
  assert.equal(result.before.playoffOutlook,null);
  assert.equal(result.after.playoffOutlook,null);
  assert.equal(result.deltas.playoffOutlook,null);
});
