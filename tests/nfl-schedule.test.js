const test=require('node:test');
const assert=require('node:assert/strict');

function loadScheduleModule(){
  const path=require.resolve('../api/nfl-schedule');
  delete require.cache[path];
  return require('../api/nfl-schedule');
}

test('parses a 2026 nflverse schedule row into a safe UTC kickoff instant',()=>{
  const {parseNflverseSchedule}=loadScheduleModule();
  const csv=[
    'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score',
    '2026_01_CHI_CAR,2026,REG,1,2026-09-13,Sunday,13:00,CHI,,CAR,'
  ].join('\n');
  const games=parseNflverseSchedule(csv,2026);
  assert.deepEqual(games,[{
    id:'2026_01_CHI_CAR',
    kickoffAt:'2026-09-13T17:00:00.000Z',
    state:'pre',
    teams:['CHI','CAR'],
    week:1,
    gameType:'REG'
  }]);
});

test('Eastern kickoff conversion observes standard time after DST ends',()=>{
  const {kickoffEasternToIso}=loadScheduleModule();
  assert.equal(kickoffEasternToIso('2026-11-08','13:00'),'2026-11-08T18:00:00.000Z');
});

test('completed games are post while future games are never invented as live',()=>{
  const {parseNflverseSchedule}=loadScheduleModule();
  const csv=[
    'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score',
    '2026_01_NE_SEA,2026,REG,1,2026-09-09,Wednesday,20:20,NE,10,SEA,13',
    '2026_02_DET_BUF,2026,REG,2,2026-09-17,Thursday,20:15,DET,,BUF,'
  ].join('\n');
  const games=parseNflverseSchedule(csv,2026);
  assert.equal(games[0].state,'post');
  assert.equal(games[1].state,'pre');
  assert.equal(games.some(game=>game.state==='in'),false);
});

test('missing or invalid kickoff fields are omitted rather than fabricated',()=>{
  const {parseNflverseSchedule}=loadScheduleModule();
  const csv=[
    'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score',
    '2026_BAD_ONE,2026,REG,1,2026-09-13,Sunday,,CHI,,CAR,',
    '2026_BAD_TWO,2026,REG,1,not-a-date,Sunday,13:00,TB,,CIN,'
  ].join('\n');
  assert.deepEqual(parseNflverseSchedule(csv,2026),[]);
});
