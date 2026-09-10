const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSleeperDraftProvider } = require('../draft-core/sleeper-provider');

function response(payload) {
  return { ok:true, status:200, async json(){ return payload; } };
}

function crosswalkFetch(url) {
  if (url.endsWith('/user/testuser')) return Promise.resolve(response({ user_id:'U1', username:'testuser' }));
  if (url.endsWith('/user/U1/leagues/nfl/2026')) return Promise.resolve(response([
    { league_id:'L1', name:'Crosswalk League', season:'2026', total_rosters:2, draft_id:'D1' }
  ]));
  if (url.endsWith('/league/L1')) return Promise.resolve(response({
    league_id:'L1', name:'Crosswalk League', season:'2026', total_rosters:2, draft_id:'D1',
    scoring_settings:{ rec:1 }, roster_positions:['QB','RB','WR','TE','FLEX','BN']
  }));
  if (url.endsWith('/draft/D1')) return Promise.resolve(response({
    draft_id:'D1', league_id:'L1', status:'complete', type:'snake', settings:{teams:2,rounds:6},
    draft_order:{U1:1,U2:2}, slot_to_roster_id:{'1':1,'2':2}
  }));
  if (url.endsWith('/state/nfl')) return Promise.resolve(response({ season:'2026', season_type:'regular', week:0 }));
  if (url.endsWith('/league/L1/rosters')) return Promise.resolve(response([
    { roster_id:1, owner_id:'U1', players:['SLEEPER-1'], starters:['SLEEPER-1'], reserve:[] },
    { roster_id:2, owner_id:'U2', players:[], starters:[], reserve:[] }
  ]));
  if (url.endsWith('/players/nfl')) return Promise.resolve(response({
    'SLEEPER-1':{
      player_id:'SLEEPER-1',
      first_name:'Provider',
      last_name:'DisplayName',
      position:'WR',
      team:'PHI',
      status:'Active'
    }
  }));
  return Promise.resolve({ ok:false, status:404, async json(){ return {}; } });
}

test('season ownership uses nflverse sleeper_id crosswalk before fragile name matching', async () => {
  const provider = createSleeperDraftProvider({ fetchImpl:crosswalkFetch });
  await provider.connect({ username:'testuser', season:2026, playerPool:[
    { id:'00-0000001', sleeperId:'SLEEPER-1', name:'Matrix Name Variant', position:'WR', team:'PHI' },
    { id:'00-0000002', sleeperId:'SLEEPER-2', name:'Actual Free Agent', position:'RB', team:'DAL' }
  ]});

  const snapshot = await provider.loadSeasonSnapshot('L1');

  assert.deepEqual(snapshot.ownedPlayerIds, ['00-0000001']);
  assert.deepEqual(snapshot.freeAgentPlayerIds, ['00-0000002']);
  assert.deepEqual(snapshot.rosters.find(r => r.rosterId === '1').playerIds, ['00-0000001']);
});

test('NFL data payload preserves nflverse sleeper_id for the Sleeper crosswalk', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'nfl-data.js'), 'utf8');
  assert.match(source, /sleeper_id/);
  assert.match(source, /sleeperId\s*:/);
});
