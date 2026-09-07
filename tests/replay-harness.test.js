const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../draft-core/replay-harness');

function baseState() {
  return {
    draftId:'D1',
    league:{ leagueId:'L1', platform:'manual', season:2026, scoring:{}, teams:2, draftType:'snake', rosterSlots:[
      { id:'QB', type:'QB', count:1, eligiblePositions:['QB'] },
      { id:'FLEX', type:'FLEX', count:1, eligiblePositions:['RB','WR','TE'] },
      { id:'BN', type:'BN', count:2, eligiblePositions:['QB','RB','WR','TE'], isBench:true }
    ]},
    status:'live', myTeamId:'T1', currentPick:null, picksUntilMyNext:1,
    teams:[{teamId:'T1',ownerName:'Me'},{teamId:'T2',ownerName:'Other'}],
    picks:[], draftedPlayerIds:[], availablePlayerIds:['QB1','WR1','RB1','TE1'], myRoster:[], recentPicks:[],
    sync:{ status:'manual', lastSuccessfulSyncAt:null, lastAttemptAt:null, consecutiveFailures:0 }
  };
}

const players = [
  { id:'QB1', position:'QB' },
  { id:'WR1', position:'WR' },
  { id:'RB1', position:'RB' },
  { id:'TE1', position:'TE' }
];
const picks = [
  { pickId:'D1:1', draftId:'D1', overall:1, round:1, pickInRound:1, playerId:'QB1', teamId:'T1', source:'manual' },
  { pickId:'D1:2', draftId:'D1', overall:2, round:1, pickInRound:2, playerId:'WR1', teamId:'T2', source:'manual' },
  { pickId:'D1:3', draftId:'D1', overall:3, round:2, pickInRound:1, playerId:'RB1', teamId:'T2', source:'manual' },
  { pickId:'D1:4', draftId:'D1', overall:4, round:2, pickInRound:2, playerId:'TE1', teamId:'T1', source:'manual' }
];

test('replayDraft materializes one snapshot per pick and never leaves drafted players available', () => {
  const out = H.replayDraft({ initialState:baseState(), authoritativePicks:picks, playerPool:players });
  assert.equal(out.snapshots.length, 4);
  out.snapshots.forEach((snapshot, index) => {
    assert.equal(snapshot.picks.length, index + 1);
    for (const id of snapshot.draftedPlayerIds) assert.equal(snapshot.availablePlayerIds.includes(id), false);
  });
});

test('replayDraft tracks only my picks in myRoster and preserves chronological history', () => {
  const out = H.replayDraft({ initialState:baseState(), authoritativePicks:picks, playerPool:players });
  assert.deepEqual(out.finalState.picks.map(p => p.playerId), ['QB1','WR1','RB1','TE1']);
  assert.deepEqual(out.finalState.myRoster.map(p => p.playerId), ['QB1','TE1']);
});

test('replayDraft can run an invariant callback after every pick', () => {
  const seen = [];
  H.replayDraft({ initialState:baseState(), authoritativePicks:picks, playerPool:players, assertSnapshot:(snapshot,index) => {
    seen.push([index, snapshot.draftedPlayerIds.length]);
  }});
  assert.deepEqual(seen, [[0,1],[1,2],[2,3],[3,4]]);
});