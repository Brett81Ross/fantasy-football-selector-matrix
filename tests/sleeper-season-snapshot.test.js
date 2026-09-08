const test = require('node:test');
const assert = require('node:assert/strict');
const { createSleeperDraftProvider } = require('../draft-core/sleeper-provider');

function fetchFactory() {
  const payloads = new Map([
    ['https://api.sleeper.app/v1/user/testuser', { user_id:'U1', username:'testuser' }],
    ['https://api.sleeper.app/v1/user/U1/leagues/nfl/2026', [{ league_id:'L1', name:'Season League', season:'2026', total_rosters:2, draft_id:'D1' }]],
    ['https://api.sleeper.app/v1/league/L1', {
      league_id:'L1', name:'Season League', season:'2026', total_rosters:2,
      scoring_settings:{ rec:1 }, roster_positions:['QB','RB','WR','TE','FLEX','BN','IR'], draft_id:'D1'
    }],
    ['https://api.sleeper.app/v1/draft/D1', {
      draft_id:'D1', league_id:'L1', status:'complete', type:'snake', settings:{teams:2,rounds:7},
      draft_order:{U1:1,U2:2}, slot_to_roster_id:{'1':1,'2':2}
    }],
    ['https://api.sleeper.app/v1/state/nfl', { season:'2026', season_type:'regular', week:3 }],
    ['https://api.sleeper.app/v1/league/L1/rosters', [
      { roster_id:1, owner_id:'U1', players:['S1','S2'], starters:['S1'], reserve:['S2'] },
      { roster_id:2, owner_id:'U2', players:['S3'], starters:['S3'], reserve:[] }
    ]],
    ['https://api.sleeper.app/v1/league/L1/matchups/3', [
      { roster_id:1, matchup_id:44, starters:['S1'] },
      { roster_id:2, matchup_id:44, starters:['S3'] }
    ]],
    ['https://api.sleeper.app/v1/players/nfl', {
      S1:{ player_id:'S1', first_name:'Alpha', last_name:'Quarterback', position:'QB', team:'DAL', status:'Active' },
      S2:{ player_id:'S2', first_name:'Beta', last_name:'Runner', position:'RB', team:'NYG', injury_status:'Questionable' },
      S3:{ player_id:'S3', first_name:'Gamma', last_name:'Receiver', position:'WR', team:'SEA', status:'Active' },
      S4:{ player_id:'S4', first_name:'Delta', last_name:'Tight End', position:'TE', team:'CLE', status:'Active' }
    }]
  ]);
  return async url => payloads.has(url)
    ? { ok:true, status:200, async json(){ return payloads.get(url); } }
    : { ok:false, status:404, async json(){ return {}; } };
}

test('Sleeper season snapshot uses current rosters, identifies this-week opponent, and crosswalks player IDs', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl: fetchFactory() });
  await provider.connect({ username:'testuser', season:2026, playerPool:[
    { id:'M1', name:'Alpha Quarterback', position:'QB', team:'DAL' },
    { id:'M2', name:'Beta Runner', position:'RB', team:'NYG' },
    { id:'M3', name:'Gamma Receiver', position:'WR', team:'SEA' },
    { id:'M4', name:'Delta Tight End', position:'TE', team:'CLE' }
  ]});

  assert.equal(typeof provider.loadSeasonSnapshot, 'function');
  const snapshot = await provider.loadSeasonSnapshot('L1');

  assert.equal(snapshot.week, 3);
  assert.equal(snapshot.myRosterId, '1');
  assert.equal(snapshot.opponentRosterId, '2');
  assert.deepEqual(snapshot.ownedPlayerIds.sort(), ['M1','M2','M3']);
  assert.deepEqual(snapshot.freeAgentPlayerIds, ['M4']);
  assert.deepEqual(snapshot.rosters.find(r=>r.rosterId==='1').reservePlayerIds, ['M2']);
  assert.equal(snapshot.playerStatuses.M2.raw, 'Questionable');
  assert.equal(snapshot.freshness.status, 'fresh');
});
