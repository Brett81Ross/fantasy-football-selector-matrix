const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeEspnScoreboard,mergeScheduleWithScoreboard}=require('../api/live-scoreboard');

test('normalizes ESPN site scoreboard events with live scores',()=>{
  const games=normalizeEspnScoreboard({events:[{
    id:'401',name:'Chicago Bears at Carolina Panthers',date:'2026-09-13T17:00:00Z',
    status:{type:{state:'in',shortDetail:'3rd 08:21'}},
    competitions:[{competitors:[
      {homeAway:'away',score:'17',team:{abbreviation:'CHI'}},
      {homeAway:'home',score:'14',team:{abbreviation:'CAR'}}
    ]}]
  }]});
  assert.deepEqual(games,[{
    id:'401',name:'Chicago Bears at Carolina Panthers',status:'3rd 08:21',state:'in',
    kickoffAt:'2026-09-13T17:00:00Z',teams:['CHI','CAR'],scores:{away:17,home:14},provider:'ESPN'
  }]);
});

test('accepts ESPN CDN and header response wrappers',()=>{
  const event={id:'2',status:{type:{state:'post',shortDetail:'Final'}},competitions:[{competitors:[
    {homeAway:'away',score:'10',team:{abbreviation:'WAS'}},
    {homeAway:'home',score:'20',team:{abbreviation:'DAL'}}
  ]}]};
  assert.equal(normalizeEspnScoreboard({content:{sbData:{events:[event]}}})[0].teams[0],'WSH');
  assert.equal(normalizeEspnScoreboard({sports:[{leagues:[{events:[event]}]}]})[0].scores.home,20);
});

test('merges live scores into the trusted nflverse schedule without inventing games',()=>{
  const schedule=[{id:'2026_01_CHI_CAR',kickoffAt:'2026-09-13T17:00:00Z',state:'pre',teams:['CHI','CAR'],week:1}];
  const scoreboard=[{id:'401',state:'in',status:'3rd 08:21',teams:['CHI','CAR'],scores:{away:17,home:14},provider:'ESPN'}];
  assert.deepEqual(mergeScheduleWithScoreboard(schedule,scoreboard),[{
    id:'2026_01_CHI_CAR',kickoffAt:'2026-09-13T17:00:00Z',state:'in',teams:['CHI','CAR'],week:1,
    status:'3rd 08:21',scores:{away:17,home:14},scoreProvider:'ESPN'
  }]);
});
