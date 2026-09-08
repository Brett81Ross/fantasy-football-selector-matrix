const test = require('node:test');
const assert = require('node:assert/strict');
const { createSleeperDraftProvider } = require('../draft-core/sleeper-provider');
const { assertDraftStateProvider } = require('../draft-core/provider-contract');

function fakeFetchFactory() {
  const payloads = new Map([
    ['https://api.sleeper.app/v1/user/BRoss81', { user_id: 'U1', username: 'BRoss81', display_name: 'BRoss81' }],
    ['https://api.sleeper.app/v1/user/U1/leagues/nfl/2026', [
      { league_id: 'L1', name: 'Game of Throws', season: '2026', total_rosters: 2, draft_id: 'D1' }
    ]],
    ['https://api.sleeper.app/v1/league/L1', {
      league_id: 'L1',
      name: 'Game of Throws',
      season: '2026',
      total_rosters: 2,
      scoring_settings: { pass_td: 4, rush_td: 6, rec: 1 },
      roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF', 'BN', 'BN'],
      draft_id: 'D1'
    }],
    ['https://api.sleeper.app/v1/draft/D1', {
      draft_id: 'D1',
      league_id: 'L1',
      status: 'drafting',
      type: 'snake',
      settings: { teams: 2, rounds: 10 },
      draft_order: { U1: 1, U2: 2 },
      slot_to_roster_id: { '1': 1, '2': 2 }
    }],
    ['https://api.sleeper.app/v1/draft/D1/picks', [
      { pick_no: 1, round: 1, draft_slot: 1, player_id: 'P1', roster_id: 1, picked_by: 'U1' },
      { pick_no: 2, round: 1, draft_slot: 2, player_id: 'P2', roster_id: 2, picked_by: 'U2' }
    ]]
  ]);
  return async function fakeFetch(url) {
    if (!payloads.has(url)) return { ok: false, status: 404, async json() { return {}; } };
    return { ok: true, status: 200, async json() { return payloads.get(url); } };
  };
}

test('sleeper provider satisfies the provider boundary', () => {
  const provider = createSleeperDraftProvider({ fetchImpl: fakeFetchFactory() });
  assert.equal(assertDraftStateProvider(provider), true);
});

test('connect resolves a Sleeper username and listLeagues returns normalized summaries', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl: fakeFetchFactory() });
  await provider.connect({ username: 'BRoss81', season: 2026, playerPool: [{ id: 'P1', position: 'WR' }, { id: 'P2', position: 'RB' }, { id: 'P3', position: 'QB' }] });
  assert.deepEqual(await provider.listLeagues(), [{ leagueId: 'L1', name: 'Game of Throws', season: 2026, teams: 2, draftId: 'D1', platform: 'sleeper' }]);
});

test('loadLeague normalizes Sleeper roster positions into flexible canonical slots', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl: fakeFetchFactory() });
  await provider.connect({ username: 'BRoss81', season: 2026, playerPool: [] });
  const league = await provider.loadLeague('L1');
  assert.equal(league.platform, 'sleeper');
  assert.equal(league.draftType, 'snake');
  assert.deepEqual(league.rosterSlots.find(slot => slot.type === 'FLEX'), { id: 'FLEX', type: 'FLEX', count: 2, eligiblePositions: ['RB', 'WR', 'TE'], isBench: false, isReserve: false });
  assert.equal(league.rosterSlots.find(slot => slot.type === 'BN').count, 2);
});

test('loadPicks converts Sleeper pick fields into canonical PickEvents', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl: fakeFetchFactory() });
  await provider.connect({ username: 'BRoss81', season: 2026, playerPool: [] });
  const picks = await provider.loadPicks('D1');
  assert.deepEqual(picks[0], { pickId: 'D1:1', draftId: 'D1', overall: 1, round: 1, pickInRound: 1, playerId: 'P1', teamId: '1', source: 'sleeper' });
});

test('loadDraft identifies my roster from Sleeper draft_order and slot_to_roster_id', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl: fakeFetchFactory() });
  await provider.connect({ username: 'BRoss81', season: 2026, playerPool: [{ id: 'P1', position: 'WR' }, { id: 'P2', position: 'RB' }, { id: 'P3', position: 'QB' }] });
  const state = await provider.loadDraft('D1');
  assert.equal(state.myTeamId, '1');
  assert.deepEqual(state.draftedPlayerIds, ['P1', 'P2']);
  assert.deepEqual(state.availablePlayerIds, ['P3']);
  assert.deepEqual(state.myRoster, [{ playerId: 'P1', slotId: 'UNASSIGNED', position: 'WR' }]);
  assert.equal(state.sync.status, 'live');
});

test('completed draft uses current league rosters as availability authority, including post-draft adds', async () => {
  const payloads = new Map([
    ['https://api.sleeper.app/v1/user/testuser', { user_id: 'U1', username: 'testuser' }],
    ['https://api.sleeper.app/v1/user/U1/leagues/nfl/2026', [{ league_id:'L2', name:'Another League', season:'2026', total_rosters:2, draft_id:'D2' }]],
    ['https://api.sleeper.app/v1/league/L2', { league_id:'L2', season:'2026', total_rosters:2, scoring_settings:{ rec:1 }, roster_positions:['QB','RB','WR','TE','FLEX','BN'], draft_id:'D2' }],
    ['https://api.sleeper.app/v1/draft/D2', { draft_id:'D2', league_id:'L2', status:'complete', type:'snake', settings:{teams:2,rounds:3}, draft_order:{U1:1,U2:2}, slot_to_roster_id:{'1':1,'2':2} }],
    ['https://api.sleeper.app/v1/draft/D2/picks', [
      { pick_no:1, round:1, player_id:'S1', roster_id:1, picked_by:'U1', metadata:{ first_name:'Alpha', last_name:'Receiver', position:'WR', team:'DAL' } },
      { pick_no:2, round:1, player_id:'S2', roster_id:2, picked_by:'U2', metadata:{ first_name:'Beta', last_name:'Runner', position:'RB', team:'NYG' } }
    ]],
    ['https://api.sleeper.app/v1/league/L2/rosters', [
      { roster_id:1, owner_id:'U1', players:['S1'] },
      { roster_id:2, owner_id:'U2', players:['S2','S3'] }
    ]],
    ['https://api.sleeper.app/v1/players/nfl', {
      S1:{ player_id:'S1', first_name:'Alpha', last_name:'Receiver', position:'WR', team:'DAL' },
      S2:{ player_id:'S2', first_name:'Beta', last_name:'Runner', position:'RB', team:'NYG' },
      S3:{ player_id:'S3', first_name:'Harold', last_name:'Fannin Jr.', position:'TE', team:'CLE' }
    }]
  ]);
  const fetchImpl = async url => payloads.has(url)
    ? { ok:true, status:200, async json(){ return payloads.get(url); } }
    : { ok:false, status:404, async json(){ return {}; } };
  const provider = createSleeperDraftProvider({ fetchImpl });
  await provider.connect({ username:'testuser', season:2026, playerPool:[
    { id:'M1', name:'Alpha Receiver', position:'WR', team:'DAL' },
    { id:'M2', name:'Beta Runner', position:'RB', team:'NYG' },
    { id:'M3', name:'Harold Fannin Jr.', position:'TE', team:'CLE' },
    { id:'M4', name:'Free Agent', position:'QB', team:'SEA' }
  ]});
  const state = await provider.loadDraft('D2');
  assert.equal(state.status, 'completed');
  assert.deepEqual(state.draftedPlayerIds.sort(), ['M1','M2','M3']);
  assert.deepEqual(state.availablePlayerIds, ['M4']);
  assert.deepEqual(state.myRoster, [{ playerId:'M1', slotId:'UNASSIGNED', position:'WR' }]);
});

test('provider fails clearly on an unknown Sleeper username', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl: async () => ({ ok: false, status: 404, async json() { return null; } }) });
  await assert.rejects(() => provider.connect({ username: 'missing', season: 2026, playerPool: [] }), /Sleeper user/i);
});