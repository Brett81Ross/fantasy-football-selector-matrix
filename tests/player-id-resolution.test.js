// Regression gate for Sleeper provider IDs leaking into waiver recommendations.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSleeperDraftProvider } = require('../draft-core/sleeper-provider');
const { normalizeLeagueSnapshot } = require('../season-core/contracts');
const { rankWaiverMoves } = require('../season-core/waiver-assassin');

function response(payload) {
  return { ok:true, status:200, async json(){ return payload; } };
}

function unresolvedSleeperFetch(url) {
  if (url.endsWith('/user/testuser')) return Promise.resolve(response({ user_id:'U1', username:'testuser' }));
  if (url.endsWith('/user/U1/leagues/nfl/2026')) return Promise.resolve(response([
    { league_id:'L1', name:'Identity League', season:'2026', total_rosters:2, draft_id:'D1' }
  ]));
  if (url.endsWith('/league/L1')) return Promise.resolve(response({
    league_id:'L1', name:'Identity League', season:'2026', total_rosters:2, draft_id:'D1',
    scoring_settings:{ rec:1 }, roster_positions:['QB','RB','WR','TE','FLEX','BN']
  }));
  if (url.endsWith('/draft/D1')) return Promise.resolve(response({
    draft_id:'D1', league_id:'L1', status:'complete', type:'snake', settings:{teams:2,rounds:6},
    draft_order:{U1:1,U2:2}, slot_to_roster_id:{'1':1,'2':2}
  }));
  if (url.endsWith('/state/nfl')) return Promise.resolve(response({ season:'2026', season_type:'regular', week:0 }));
  if (url.endsWith('/league/L1/rosters')) return Promise.resolve(response([
    { roster_id:1, owner_id:'U1', players:['10232'], starters:['10232'], reserve:[] },
    { roster_id:2, owner_id:'U2', players:[], starters:[], reserve:[] }
  ]));
  if (url.endsWith('/players/nfl')) return Promise.resolve(response({
    '10232':{
      player_id:'10232',
      gsis_id:'00-0099999',
      first_name:'Provider',
      last_name:'Name Does Not Match',
      position:'WR',
      team:'PHI',
      status:'Active'
    }
  }));
  return Promise.resolve({ ok:false, status:404, async json(){ return {}; } });
}

test('season roster resolves a Sleeper provider ID through directory gsis_id before UI/waiver logic sees it', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl:unresolvedSleeperFetch });
  await provider.connect({ username:'testuser', season:2026, playerPool:[
    { id:'00-0099999', name:'Canonical Matrix Player', position:'WR', team:'PHI' },
    { id:'00-0000002', name:'Actual Free Agent', position:'RB', team:'DAL' }
  ]});

  const snapshot = await provider.loadSeasonSnapshot('L1');

  assert.deepEqual(snapshot.rosters.find(r => r.rosterId === '1').playerIds, ['00-0099999']);
  assert.deepEqual(snapshot.ownedPlayerIds, ['00-0099999']);
  assert.deepEqual(snapshot.freeAgentPlayerIds, ['00-0000002']);
  assert.equal(snapshot.playerStatuses['00-0099999'].providerPlayerId, '10232');
});

const slots = [
  {id:'RB',type:'RB',count:1,eligiblePositions:['RB'],isBench:false,isReserve:false},
  {id:'BN',type:'BN',count:2,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
];

test('Waiver Assassin never treats an unresolved provider ID as a zero-value drop candidate', () => {
  const snapshot = normalizeLeagueSnapshot({
    league:{leagueId:'L2',platform:'sleeper',season:2026,teams:2,rosterSlots:slots},
    week:2,myRosterId:'1',
    rosters:[
      {rosterId:'1',playerIds:['RB1','10232'],starterPlayerIds:['RB1']},
      {rosterId:'2',playerIds:[]}
    ],
    playerPool:[{id:'RB1'},{id:'FA1'}],
    freshness:{status:'fresh',asOf:'2026-09-14T00:00:00.000Z'}
  });

  const moves = rankWaiverMoves(snapshot,'1',{
    RB1:{id:'RB1',name:'Known Starter',position:'RB',value:55,projection:10},
    FA1:{id:'FA1',name:'Real Free Agent',position:'RB',value:85,projection:17}
  });

  assert.ok(moves.length > 0);
  assert.equal(moves.some(move => move.dropPlayerId === '10232'), false);
  assert.equal(moves.some(move => /\b10232\b/.test(move.reason)), false);
});
