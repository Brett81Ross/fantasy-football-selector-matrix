const test=require('node:test');
const assert=require('node:assert/strict');
const {createSleeperDraftProvider}=require('../draft-core/sleeper-provider');

function response(payload,status=200){return{ok:status>=200&&status<300,status,async json(){return payload;}};}

function makeFetch({missingWeek5=false}={}){
  const payloads=new Map([
    ['https://api.sleeper.app/v1/user/testuser',{user_id:'U1',username:'testuser'}],
    ['https://api.sleeper.app/v1/user/U1/leagues/nfl/2026',[{league_id:'L1',name:'Season League',season:'2026',total_rosters:2,draft_id:'D1'}]],
    ['https://api.sleeper.app/v1/league/L1',{league_id:'L1',season:'2026',total_rosters:2,draft_id:'D1',settings:{waiver_budget:100,playoff_week_start:6,playoff_teams:1},scoring_settings:{rec:1},roster_positions:['QB','RB','WR','TE','FLEX','BN']}],
    ['https://api.sleeper.app/v1/draft/D1',{draft_id:'D1',league_id:'L1',status:'complete',type:'snake',settings:{teams:2,rounds:6},draft_order:{U1:1,U2:2},slot_to_roster_id:{'1':1,'2':2}}],
    ['https://api.sleeper.app/v1/state/nfl',{season:'2026',season_type:'regular',week:3}],
    ['https://api.sleeper.app/v1/league/L1/rosters',[
      {roster_id:1,owner_id:'U1',players:['S1','S2'],starters:['S1'],reserve:[],settings:{wins:2,losses:1,ties:0,fpts:301,fpts_decimal:42,fpts_against:280,fpts_against_decimal:11,waiver_budget_used:37,waiver_position:4}},
      {roster_id:2,owner_id:'U2',players:['S3'],starters:['S3'],reserve:[],settings:{wins:1,losses:2,ties:0,fpts:270,fpts_decimal:0,fpts_against:315,fpts_against_decimal:0,waiver_budget_used:12,waiver_position:1}}
    ]],
    ['https://api.sleeper.app/v1/league/L1/matchups/3',[{roster_id:1,matchup_id:43,starters:['S1']},{roster_id:2,matchup_id:43,starters:['S3']}]],
    ['https://api.sleeper.app/v1/league/L1/matchups/4',[{roster_id:1,matchup_id:44},{roster_id:2,matchup_id:44}]],
    ['https://api.sleeper.app/v1/league/L1/matchups/5',[{roster_id:1,matchup_id:45},{roster_id:2,matchup_id:45}]],
    ['https://api.sleeper.app/v1/players/nfl',{
      S1:{player_id:'S1',first_name:'Alpha',last_name:'Quarterback',position:'QB',team:'DAL',status:'Active'},
      S2:{player_id:'S2',first_name:'Beta',last_name:'Runner',position:'RB',team:'NYG',status:'Active'},
      S3:{player_id:'S3',first_name:'Gamma',last_name:'Receiver',position:'WR',team:'SEA',status:'Active'},
      S4:{player_id:'S4',first_name:'Delta',last_name:'Tight End',position:'TE',team:'CLE',status:'Active'}
    }]
  ]);
  return async url=>{
    if(missingWeek5&&url.endsWith('/matchups/5'))return response({},404);
    return payloads.has(url)?response(payloads.get(url)):response({},404);
  };
}

async function load(options){
  const provider=createSleeperDraftProvider({fetchImpl:makeFetch(options)});
  await provider.connect({username:'testuser',season:2026,playerPool:[
    {id:'M1',sleeperId:'S1',name:'Alpha Quarterback',position:'QB',team:'DAL'},
    {id:'M2',sleeperId:'S2',name:'Beta Runner',position:'RB',team:'NYG'},
    {id:'M3',sleeperId:'S3',name:'Gamma Receiver',position:'WR',team:'SEA'},
    {id:'M4',sleeperId:'S4',name:'Delta Tight End',position:'TE',team:'CLE'}
  ]});
  return provider.loadSeasonSnapshot('L1');
}

test('Sleeper playoff snapshot carries league playoff settings standings and all remaining regular-season matchups',async()=>{
  const snapshot=await load();
  assert.equal(snapshot.league.playoffWeekStart,6);
  assert.equal(snapshot.league.playoffTeams,1);
  const mine=snapshot.rosters.find(r=>r.rosterId==='1');
  assert.deepEqual(mine.record,{wins:2,losses:1,ties:0,pointsFor:301.42,pointsAgainst:280.11});
  assert.deepEqual(snapshot.scheduleCoverage,{expectedWeeks:[4,5],loadedWeeks:[4,5],complete:true});
  assert.deepEqual(snapshot.remainingSchedule.filter(row=>row.rosterId==='1'),[
    {week:4,rosterId:'1',opponentRosterId:'2',matchupId:'44'},
    {week:5,rosterId:'1',opponentRosterId:'2',matchupId:'45'}
  ]);
});

test('one unavailable future matchup week degrades schedule coverage without failing the season snapshot',async()=>{
  const snapshot=await load({missingWeek5:true});
  assert.equal(snapshot.freshness.status,'fresh');
  assert.deepEqual(snapshot.scheduleCoverage.expectedWeeks,[4,5]);
  assert.deepEqual(snapshot.scheduleCoverage.loadedWeeks,[4]);
  assert.equal(snapshot.scheduleCoverage.complete,false);
  assert.equal(snapshot.remainingSchedule.some(row=>row.week===5),false);
});
