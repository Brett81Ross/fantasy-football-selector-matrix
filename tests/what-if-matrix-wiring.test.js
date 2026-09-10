const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('browser loads What-If Matrix after its decision dependencies and before Season Intelligence',()=>{
  const app=read('api/app.js');
  const whatIf=app.indexOf('season-core/what-if-matrix.js');
  const contracts=app.indexOf('season-core/contracts.js');
  const lineup=app.indexOf('season-core/lineup-optimizer.js');
  const trade=app.indexOf('season-core/trade-analyzer.js');
  const matchup=app.indexOf('season-core/matchup-simulator.js');
  const ui=app.indexOf('season-intelligence.js');
  assert.ok(whatIf>=0,'What-If Matrix runtime must be loaded');
  assert.ok(whatIf>contracts&&whatIf>lineup&&whatIf>trade&&whatIf>matchup,'What-If Matrix must load after its scoring dependencies');
  assert.ok(whatIf<ui,'What-If Matrix must load before Season Intelligence');
});

test('Season Intelligence exposes start/sit add/drop and trade simulations with an explicit reset',()=>{
  const ui=read('season-intelligence.js');
  assert.match(ui,/What-If Matrix/);
  assert.match(ui,/FFMWhatIfMatrix/);
  assert.match(ui,/simulateScenario/);
  assert.match(ui,/START\/SIT/);
  assert.match(ui,/ADD\/DROP/);
  assert.match(ui,/TRADE/);
  assert.match(ui,/Run Simulation/);
  assert.match(ui,/Reset Simulation/);
  assert.match(ui,/IMPROVES TEAM|HURTS TEAM/);
  assert.match(ui,/LINEUP EDGE/);
  assert.match(ui,/ROSTER VALUE/);
  assert.match(ui,/MATCHUP WIN PROBABILITY/);
});

test('What-If UI never replaces or persists the canonical league snapshot',()=>{
  const ui=read('season-intelligence.js');
  assert.doesNotMatch(ui,/window\.ffmLeagueSnapshot\s*=/,'simulated state must never replace canonical synced state');
  assert.doesNotMatch(ui,/localStorage\.(?:setItem|removeItem)/,'simulation state must not be persisted');
  assert.match(ui,/whatIfResult\s*=\s*null/,'reset must clear only module-local simulation state');
  assert.match(ui,/render\(window\.ffmLeagueSnapshot\s*,\s*['"]What-If Matrix['"]\)/,'reset must immediately render the canonical snapshot');
});

test('ABL-35 preserves deployment version service-worker and transaction guardrails',()=>{
  const app=read('api/app.js');
  const vercel=read('vercel.json');
  const whatIf=read('season-core/what-if-matrix.js');
  const ui=read('season-intelligence.js');
  assert.match(app,/const VERSION='1\.6\.0'/);
  assert.match(vercel,/"deploymentEnabled"\s*:\s*false/);
  assert.doesNotMatch(whatIf,/fetch\s*\(/);
  assert.doesNotMatch(ui,/navigator\.serviceWorker\.register/);
  assert.doesNotMatch(ui,/submitTrade|executeTrade|addRosterPlayer|dropRosterPlayer/i);
});
