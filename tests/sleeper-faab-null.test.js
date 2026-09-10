const test=require('node:test');
const assert=require('node:assert/strict');
const {createSleeperDraftProvider}=require('../draft-core/sleeper-provider');

function fetchImpl(url){
  const data={
    'https://api.sleeper.app/v1/user/nullbudget':{user_id:'U1',username:'nullbudget'},
    'https://api.sleeper.app/v1/user/U1/leagues/nfl/2026':[{league_id:'L1',season:'2026',total_rosters:1,draft_id:'D1'}],
    'https://api.sleeper.app/v1/league/L1':{league_id:'L1',season:'2026',total_rosters:1,draft_id:'D1',settings:{waiver_budget:null},scoring_settings:{rec:1},roster_positions:['QB','BN']},
    'https://api.sleeper.app/v1/draft/D1':{draft_id:'D1',league_id:'L1',status:'complete',type:'snake',settings:{teams:1,rounds:2},draft_order:{U1:1},slot_to_roster_id:{'1':1}},
    'https://api.sleeper.app/v1/state/nfl':{season:'2026',season_type:'regular',week:1},
    'https://api.sleeper.app/v1/league/L1/rosters':[{roster_id:1,owner_id:'U1',players:['S1'],starters:['S1'],reserve:[],settings:{waiver_budget_used:0,waiver_position:1}}],
    'https://api.sleeper.app/v1/league/L1/matchups/1':[{roster_id:1,matchup_id:1,starters:['S1']}],
    'https://api.sleeper.app/v1/players/nfl':{S1:{player_id:'S1',first_name:'Null',last_name:'Budget',position:'QB',team:'DAL',status:'Active'}}
  };
  return Promise.resolve(Object.prototype.hasOwnProperty.call(data,url)
    ?{ok:true,status:200,json:async()=>data[url]}
    :{ok:false,status:404,json:async()=>({})});
}

test('explicit null Sleeper waiver budget stays unknown and never fabricates a FAAB league',async()=>{
  const provider=createSleeperDraftProvider({fetchImpl});
  await provider.connect({username:'nullbudget',season:2026,playerPool:[{id:'M1',sleeperId:'S1',name:'Null Budget',position:'QB',team:'DAL'}]});
  const snapshot=await provider.loadSeasonSnapshot('L1');
  assert.equal(snapshot.league.waiverBudgetTotal,null);
  assert.equal(snapshot.league.waiverType,'unknown');
  assert.equal(snapshot.rosters[0].waiverBudgetRemaining,null);
});
