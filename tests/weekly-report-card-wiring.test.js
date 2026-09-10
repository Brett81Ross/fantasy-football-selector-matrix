const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('browser loads entitlement metadata and Weekly Team Report Card before Season Intelligence',()=>{
  const app=read('api/app.js');
  const attack=app.indexOf('season-core/weekly-attack-plan.js');
  const entitlements=app.indexOf('season-core/feature-entitlements.js');
  const report=app.indexOf('season-core/weekly-report-card.js');
  const ui=app.indexOf('season-intelligence.js');
  assert.ok(entitlements>=0,'feature-entitlements runtime must be loaded');
  assert.ok(report>=0,'Weekly Team Report Card runtime must be loaded');
  assert.ok(report>attack,'Report Card must load after Weekly Attack Plan');
  assert.ok(entitlements<ui&&report<ui,'metadata and Report Card must load before Season Intelligence');
});

test('Season Intelligence makes Weekly Team Report Card the first view and visibly exposes every required grade and summary',()=>{
  const ui=read('season-intelligence.js');
  assert.match(ui,/Weekly Team Report Card/);
  assert.match(ui,/FFMWeeklyReportCard/);
  assert.match(ui,/buildWeeklyReportCard/);
  for(const label of ['QB','RB','WR','TE','FLEX','BENCH','OVERALL'])assert.match(ui,new RegExp(label));
  for(const label of ['BEST MOVE','BIGGEST RISK','BIGGEST OPPORTUNITY','PLAYER TO SELL','PLAYER TO BUY','WAIVER PRIORITY','NEXT ACTION'])assert.match(ui,new RegExp(label));
  assert.match(ui,/const tabs=\['Weekly Team Report Card'/,'Report Card must be the first Season Intelligence tab');
  assert.match(ui,/activeTab\(\).*Weekly Team Report Card|Weekly Team Report Card.*activeTab/s,'Report Card must be the default active view');
});

test('Report Card UI reuses the supplied Weekly Attack Plan and keeps confidence freshness and optional signals explicit',()=>{
  const ui=read('season-intelligence.js');
  assert.match(ui,/attackPlan\s*:\s*plan/,'Report Card must consume the already-built attack plan');
  assert.match(ui,/report\.confidence/);
  assert.match(ui,/report\.freshness/);
  assert.match(ui,/playerToSell/);
  assert.match(ui,/playerToBuy/);
  assert.doesNotMatch(ui,/localStorage\.(?:setItem|removeItem)/,'Report Card must not persist derived output');
});

test('ABL-36 keeps release payment service-worker and transaction guardrails intact',()=>{
  const app=read('api/app.js');
  const vercel=read('vercel.json');
  const registry=read('season-core/feature-entitlements.js');
  const report=read('season-core/weekly-report-card.js');
  const ui=read('season-intelligence.js');
  assert.match(app,/const VERSION='1\.5\.5'/);
  assert.match(vercel,/"deploymentEnabled"\s*:\s*false/);
  assert.doesNotMatch(registry,/enforced\s*:\s*true/);
  assert.doesNotMatch(registry,/stripe|checkout|payment|billing/i);
  assert.doesNotMatch(report,/fetch\s*\(/);
  assert.doesNotMatch(ui,/navigator\.serviceWorker\.register/);
  assert.doesNotMatch(ui,/submitTrade|executeTrade|addRosterPlayer|dropRosterPlayer/i);
});
