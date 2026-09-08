const test = require('node:test');
const assert = require('node:assert/strict');
const { createSleeperDraftProvider } = require('../draft-core/sleeper-provider');

const USER_ID = '1398461457967951872';
const LEAGUE_ID = '1398465187236823040';
const DRAFT_ID = '1401714143009984512';

function response(payload) {
  return { ok:true, status:200, async json(){ return payload; } };
}

function dogfoodFetch(url) {
  if (url.endsWith('/user/BRoss81')) return Promise.resolve(response({ user_id:USER_ID, username:'bross81', display_name:'BRoss81' }));
  if (url.endsWith(`/user/${USER_ID}/leagues/nfl/2026`)) return Promise.resolve(response([{ league_id:LEAGUE_ID, name:'Game of Throws', season:'2026', total_rosters:16, draft_id:DRAFT_ID }]));
  if (url.endsWith(`/league/${LEAGUE_ID}`)) return Promise.resolve(response({
    league_id:LEAGUE_ID, name:'Game of Throws', season:'2026', total_rosters:16, draft_id:DRAFT_ID,
    scoring_settings:{ rec:1 },
    roster_positions:['QB','RB','RB','WR','WR','TE','FLEX','FLEX','K','DEF','BN','BN','BN','BN','BN']
  }));
  if (url.endsWith(`/league/${LEAGUE_ID}/rosters`)) return Promise.resolve(response([
    { roster_id:1, owner_id:USER_ID, players:['8130','8144','ATL'] }
  ]));
  if (url.endsWith('/players/nfl')) return Promise.resolve(response({
    '8130':{ player_id:'8130', first_name:'Trey', last_name:'McBride', position:'TE', team:'ARI' },
    '8144':{ player_id:'8144', first_name:'Chris', last_name:'Olave', position:'WR', team:'NO' },
    'ATL':{ player_id:'ATL', first_name:'Atlanta', last_name:'Falcons', position:'DEF', team:'ATL' }
  }));
  if (url.endsWith(`/draft/${DRAFT_ID}/picks`)) return Promise.resolve(response([
    { pick_no:12, round:1, draft_slot:12, player_id:'8130', roster_id:1, picked_by:USER_ID, metadata:{ first_name:'Trey', last_name:'McBride', position:'TE', team:'ARI' } },
    { pick_no:21, round:2, draft_slot:12, player_id:'8144', roster_id:1, picked_by:USER_ID, metadata:{ first_name:'Chris', last_name:'Olave', position:'WR', team:'NO' } },
    { pick_no:172, round:11, draft_slot:12, player_id:'ATL', roster_id:1, picked_by:USER_ID, metadata:{ first_name:'Atlanta', last_name:'Falcons', position:'DEF', team:'ATL' } }
  ]));
  if (url.endsWith(`/draft/${DRAFT_ID}`)) return Promise.resolve(response({
    draft_id:DRAFT_ID, league_id:LEAGUE_ID, status:'complete', type:'snake',
    settings:{ teams:16, rounds:15, slots_qb:1, slots_rb:2, slots_wr:2, slots_te:1, slots_flex:2, slots_k:1, slots_def:1, slots_bn:5 },
    draft_order:{ [USER_ID]:12 }, slot_to_roster_id:{ '12':1 }
  }));
  return Promise.resolve({ ok:false, status:404, async json(){ return {}; } });
}

const playerPool = [
  { id:'00-0038130', name:'Trey McBride', position:'TE', team:'ARI' },
  { id:'00-0039144', name:'Chris Olave', position:'WR', team:'NO' },
  { id:'DST-ATL', name:'ATL Defense / Special Teams', position:'DST', team:'ATL' },
  { id:'00-0099999', name:'Available Player', position:'RB', team:'DAL' }
];

test('real Game of Throws shape resolves the owner to roster 1 and preserves exact lineup settings', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl:dogfoodFetch });
  await provider.connect({ username:'BRoss81', season:2026, playerPool });
  const league = await provider.loadLeague(LEAGUE_ID);
  const state = await provider.loadDraft(DRAFT_ID);
  assert.equal(league.teams, 16);
  assert.equal(league.rosterSlots.find(s => s.type === 'FLEX').count, 2);
  assert.equal(league.rosterSlots.find(s => s.type === 'DST').count, 1);
  assert.equal(league.rosterSlots.find(s => s.type === 'BN').count, 5);
  assert.equal(state.myTeamId, '1');
  assert.equal(state.status, 'completed');
  assert.equal(state.currentPick, null);
  assert.equal(state.picksUntilMyNext, null);
});

test('Sleeper player IDs crosswalk to Matrix GSIS IDs so rostered players leave the board', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl:dogfoodFetch });
  await provider.connect({ username:'BRoss81', season:2026, playerPool });
  const state = await provider.loadDraft(DRAFT_ID);
  assert.deepEqual(state.draftedPlayerIds, ['00-0038130','00-0039144','DST-ATL']);
  assert.deepEqual(state.myRoster.map(p => p.playerId), ['00-0038130','00-0039144','DST-ATL']);
  assert.deepEqual(state.myRoster.map(p => p.position), ['TE','WR','DST']);
  assert.deepEqual(state.availablePlayerIds, ['00-0099999']);
});

test('a Sleeper DEF pick always canonicalizes to the Matrix DST team ID', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl:dogfoodFetch });
  await provider.connect({ username:'BRoss81', season:2026, playerPool });
  const picks = await provider.loadPicks(DRAFT_ID);
  assert.equal(picks[2].playerId, 'DST-ATL');
});