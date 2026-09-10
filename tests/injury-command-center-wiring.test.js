const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');

test('browser loads Injury Command Center after its dependencies and before Season Intelligence',()=>{
 const app=read('api/app.js');
 const command=app.indexOf("'season-core/injury-command-center.js'");
 const ui=app.indexOf("'season-intelligence.js'");
 assert.ok(command>=0,'Injury Command Center must be loaded');
 for(const file of ['season-core/player-status.js','season-core/data-confidence.js','season-core/lineup-optimizer.js']){
  const i=app.indexOf(`'${file}'`);
  assert.ok(i>=0&&i<command,`${file} must load before Injury Command Center`);
 }
 assert.ok(command<ui,'Injury Command Center must load before Season Intelligence');
});

test('Season Intelligence exposes an in-app Command Center and passes kickoff context to the engine',()=>{
 const ui=read('season-intelligence.js');
 assert.match(ui,/Command Center/);
 assert.match(ui,/FFMInjuryCommandCenter\.buildCommandCenter/);
 assert.match(ui,/__FFM_KICKOFF_CONTEXT__/);
 assert.doesNotMatch(ui,/Notification\.requestPermission|serviceWorker\.register/);
});

test('NFL data payload preserves scheduled game kickoff and team abbreviations',()=>{
 const api=read('api/nfl-data.js');
 assert.match(api,/gameSchedule/);
 assert.match(api,/kickoffAt/);
 assert.match(api,/competitors/);
 assert.match(api,/abbreviation/);
});

test('live refresh publishes team kickoff context for the Command Center',()=>{
 const live=read('live-refresh.js');
 assert.match(live,/__FFM_KICKOFF_CONTEXT__/);
 assert.match(live,/kickoffsByTeam/);
 assert.match(live,/gameSchedule/);
});

test('ABL-30 wiring leaves version authority and deployment lock unchanged',()=>{
 assert.match(read('api/app.js'),/const VERSION='1\.5\.5'/);
 assert.match(read('vercel.json'),/"deploymentEnabled"\s*:\s*false/);
});
