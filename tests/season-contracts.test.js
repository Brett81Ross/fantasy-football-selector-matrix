const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLeagueSnapshot } = require('../season-core/contracts');

function standardLeague() {
  return {
    leagueId: 'L1', platform: 'sleeper', season: 2026, teams: 2,
    scoring: { rec: 1 },
    rosterSlots: [
      { id:'QB', type:'QB', count:1, eligiblePositions:['QB'], isBench:false, isReserve:false },
      { id:'FLEX', type:'FLEX', count:1, eligiblePositions:['RB','WR','TE'], isBench:false, isReserve:false },
      { id:'BN', type:'BN', count:3, eligiblePositions:['QB','RB','WR','TE','K','DST'], isBench:true, isReserve:false }
    ]
  };
}

test('normalizes a league snapshot and excludes every owned player from free agents', () => {
  const snapshot = normalizeLeagueSnapshot({
    league: standardLeague(),
    week: 3,
    myRosterId: '1',
    opponentRosterId: '2',
    rosters: [
      { rosterId:'1', ownerId:'U1', playerIds:['P1','P2'], starterPlayerIds:['P1'], reservePlayerIds:[] },
      { rosterId:'2', ownerId:'U2', playerIds:['P3'], starterPlayerIds:['P3'], reservePlayerIds:['P4'] }
    ],
    playerPool: [{id:'P1'},{id:'P2'},{id:'P3'},{id:'P4'},{id:'P5'}],
    playerStatuses: { P2:{ raw:'Questionable' } },
    freshness: { status:'fresh', asOf:'2026-09-08T03:00:00.000Z' }
  });

  assert.equal(snapshot.week, 3);
  assert.equal(snapshot.myRosterId, '1');
  assert.equal(snapshot.opponentRosterId, '2');
  assert.deepEqual([...snapshot.ownedPlayerIds].sort(), ['P1','P2','P3','P4']);
  assert.deepEqual(snapshot.freeAgentPlayerIds, ['P5']);
  assert.equal(snapshot.playerStatuses.P2.raw, 'Questionable');
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.rosters), true);
});

test('supports a different league size and lineup shape without hard-coded roster assumptions', () => {
  const league = {
    leagueId:'L2', platform:'sleeper', season:2026, teams:4,
    scoring:{ pass_td:6 },
    rosterSlots:[
      { id:'SUPER_FLEX', type:'SUPER_FLEX', count:2, eligiblePositions:['QB','RB','WR','TE'], isBench:false, isReserve:false },
      { id:'IR', type:'IR', count:2, eligiblePositions:['QB','RB','WR','TE','K','DST'], isBench:false, isReserve:true }
    ]
  };
  const snapshot = normalizeLeagueSnapshot({
    league,
    week: 9,
    myRosterId:'3',
    rosters:[
      { rosterId:'1', playerIds:['A'] },
      { rosterId:'2', playerIds:['B'] },
      { rosterId:'3', playerIds:['C','D'], reservePlayerIds:['E'] },
      { rosterId:'4', playerIds:['F'] }
    ],
    playerPool:['A','B','C','D','E','F','G'].map(id=>({id})),
    freshness:{ status:'stale', asOf:'2026-09-08T02:00:00.000Z' }
  });

  assert.equal(snapshot.league.teams, 4);
  assert.equal(snapshot.league.rosterSlots[0].type, 'SUPER_FLEX');
  assert.deepEqual(snapshot.freeAgentPlayerIds, ['G']);
  assert.equal(snapshot.freshness.status, 'stale');
});
