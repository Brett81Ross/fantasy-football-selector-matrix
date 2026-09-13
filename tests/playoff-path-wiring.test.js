const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('browser loads Playoff Path after roster and lineup dependencies and before Season Intelligence',()=>{
  const app=read('api/app.js');
  const playoff=app.indexOf("season-core/playoff-path.js");
  const roster=app.indexOf("season-core/roster-doctor.js");
  const lineup=app.indexOf("season-core/lineup-optimizer.js");
  const seasonUi=app.indexOf("season-intelligence.js");
  assert.ok(playoff>=0,'Playoff Path runtime must be loaded');
  assert.ok(playoff>roster,'Playoff Path must load after Roster Doctor');
  assert.ok(playoff>lineup,'Playoff Path must load after Lineup Optimizer');
  assert.ok(playoff<seasonUi,'Playoff Path must load before Season Intelligence UI');
});

test('Season Intelligence exposes Playoff Path with probability and explicit readiness degradation',()=>{
  const ui=read('season-intelligence.js');
  assert.match(ui,/Playoff Path/);
  assert.match(ui,/FFMPlayoffPath/);
  assert.match(ui,/buildPlayoffPath/);
  assert.match(ui,/PLAYOFF PROBABILITY/);
  assert.match(ui,/PLAYOFF READINESS/);
  assert.match(ui,/SCHEDULE DIFFICULTY/);
  assert.match(ui,/BIGGEST PLAYOFF RISK/);
  assert.match(ui,/IMPROVEMENT TARGET/);
  assert.match(ui,/MUST-WIN|HIGH LEVERAGE/);
  assert.match(ui,/playoffProbability\s*!==\s*null|mode\s*===\s*['"]PROBABILITY['"]/,'probability label must be conditional on available probability data');
  assert.match(ui,/probability withheld|readiness mode/i,'degraded mode must clearly explain why probability is unavailable');
});

test('ABL-34 wiring preserves release guardrails and recommendation-only behavior',()=>{
  const app=read('api/app.js');
  const vercel=read('vercel.json');
  const ui=read('season-intelligence.js');
  assert.match(app,/const VERSION=require\(['"]\.\.\/version['"]\)/);
  assert.equal(read('VERSION').trim(),'1.6.1');
  assert.match(vercel,/"deploymentEnabled"\s*:\s*false/);
  assert.doesNotMatch(ui,/navigator\.serviceWorker\.register/);
  assert.doesNotMatch(ui,/api\.sleeper\.app.*(?:POST|PUT|DELETE)/i);
  assert.doesNotMatch(ui,/submitTrade|executeTrade|addRosterPlayer|dropRosterPlayer/i);
});
