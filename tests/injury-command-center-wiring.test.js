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

test('NFL data payload preserves nflverse scheduled game kickoff and team abbreviations',()=>{
 const api=read('api/nfl-data.js');
 const schedule=read('api/nfl-schedule.js');
 assert.match(api,/parseNflverseSchedule/);
 assert.match(api,/gameSchedule/);
 assert.match(schedule,/kickoffAt/);
 assert.match(schedule,/away_team/);
 assert.match(schedule,/home_team/);
});

test('live refresh publishes team kickoff context for the Command Center',()=>{
 const live=read('live-refresh.js');
 assert.match(live,/__FFM_KICKOFF_CONTEXT__/);
 assert.match(live,/kickoffsByTeam/);
 assert.match(live,/gameSchedule/);
 assert.match(live,/scheduleFeed/);
});

test('ABL-30 wiring leaves shared version authority and deployment lock intact',()=>{
 const app=read('api/app.js');
 assert.match(app,/const VERSION=require\(['"]\.\.\/version['"]\)/);
 assert.equal(read('VERSION').trim(),'1.7.4');
 assert.match(read('vercel.json'),/"deploymentEnabled"\s*:\s*false/);
});


test('post-draft runtime cannot render draft-only Decision Matrix and branding uses shared version',()=>{
 const fs=require('node:fs');const path=require('node:path');
 const dm=fs.readFileSync(path.join(__dirname,'../decision-matrix.js'),'utf8');
 const brand=fs.readFileSync(path.join(__dirname,'../brand-integration.js'),'utf8');
 assert.match(dm,/ffmCanonicalDraftState\?\.status==='completed'/);
 assert.match(dm,/host\.replaceChildren\(\)/);
 assert.match(dm,/window\.__FFM_VERSION__/);
 assert.match(brand,/window\.__FFM_VERSION__/);
 assert.doesNotMatch(brand,/const VERSION\s*=\s*['"]\d+\.\d+\.\d+['"]/);
 assert.doesNotMatch(dm,/const VERSION\s*=\s*['"]\d+\.\d+\.\d+['"]/);
});


test('legacy feature modules cannot rewrite visible app version',()=>{
 const fs=require('node:fs');const path=require('node:path');
 for(const file of ['te-fix.js','fast-draft.js','special-teams.js','vorp.js','tier-cliffs.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert.doesNotMatch(source,/querySelectorAll\(['"]\.brand small['"]\)/,file+' must not rewrite brand version');
  assert.doesNotMatch(source,/footer[^\n]*innerHTML[^\n]*replace\(\/v\\d/,file+' must not rewrite footer version');
 }
});


test('server runtime version and release VERSION cannot diverge',()=>{
 const fs=require('node:fs');const path=require('node:path');
 const release=fs.readFileSync(path.join(__dirname,'../VERSION'),'utf8').trim();
 delete require.cache[require.resolve('../version')];
 const runtime=require('../version');
 assert.equal(runtime,release);
 assert.equal(runtime,'1.7.4');
});
