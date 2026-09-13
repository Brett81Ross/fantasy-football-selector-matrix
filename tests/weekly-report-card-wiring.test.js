const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('browser loads entitlement metadata and Weekly Team Report Card around Season Intelligence in safe order',()=>{
  const app=read('api/app.js');
  const attack=app.indexOf('season-core/weekly-attack-plan.js');
  const entitlements=app.indexOf('season-core/feature-entitlements.js');
  const report=app.indexOf('season-core/weekly-report-card.js');
  const seasonUi=app.indexOf("'season-intelligence.js'");
  const reportUi=app.indexOf("'season-report-card-ui.js'");
  assert.ok(entitlements>=0,'feature-entitlements runtime must be loaded');
  assert.ok(report>=0,'Weekly Team Report Card runtime must be loaded');
  assert.ok(report>attack,'Report Card must load after Weekly Attack Plan');
  assert.ok(entitlements<seasonUi&&report<seasonUi,'metadata and Report Card engine must load before Season Intelligence');
  assert.ok(reportUi>seasonUi,'Report Card UI extension must load after Season Intelligence so it can prepend the default view without rewriting existing drill-downs');
});

test('Season Intelligence extension makes Weekly Team Report Card the default view and visibly exposes every required grade and summary',()=>{
  const ui=read('season-report-card-ui.js');
  assert.match(ui,/Weekly Team Report Card/);
  assert.match(ui,/FFMWeeklyReportCard/);
  assert.match(ui,/buildWeeklyReportCard/);
  for(const label of ['QB','RB','WR','TE','FLEX','BENCH','OVERALL'])assert.match(ui,new RegExp(label));
  for(const label of ['BEST MOVE','BIGGEST RISK','BIGGEST OPPORTUNITY','PLAYER TO SELL','PLAYER TO BUY','WAIVER PRIORITY','NEXT ACTION'])assert.match(ui,new RegExp(label));
  assert.match(ui,/tabs\.prepend\(button\)/,'Report Card must be prepended ahead of existing Season Intelligence tabs');
  assert.match(ui,/selectReportTab\(\)/,'Report Card must be selected during installation');
  assert.match(ui,/renderReport\(window\.ffmLeagueSnapshot\)/,'Report Card must render immediately from canonical league state');
});

test('Report Card UI reuses the supplied Weekly Attack Plan and keeps confidence freshness and optional signals explicit',()=>{
  const ui=read('season-report-card-ui.js');
  assert.match(ui,/attackPlan\s*:\s*plan/,'Report Card must consume the already-built attack plan');
  assert.match(ui,/report\.confidence/);
  assert.match(ui,/report\.freshness/);
  assert.match(ui,/playerToSell/);
  assert.match(ui,/playerToBuy/);
  assert.match(ui,/ffm:league-snapshot/,'Report Card must react to canonical league snapshots');
  assert.doesNotMatch(ui,/localStorage\.(?:setItem|removeItem)/,'Report Card must not persist derived output');
});

test('Report Card layout remains narrow-phone safe without removing the existing Season Intelligence views',()=>{
  const ui=read('season-report-card-ui.js');
  const season=read('season-intelligence.js');
  assert.match(ui,/report-grade-grid/);
  assert.match(ui,/@media\(max-width:700px\)/);
  assert.match(ui,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  for(const existing of ['Weekly Attack Plan','Command Center','Roster Doctor','Waiver Assassin','Trade Hunter','What-If Matrix','Playoff Path','Opponent Exploiter','Player Status'])assert.match(season,new RegExp(existing));
});

test('ABL-36 keeps release payment service-worker and transaction guardrails intact',()=>{
  const app=read('api/app.js');
  const vercel=read('vercel.json');
  const registry=read('season-core/feature-entitlements.js');
  const report=read('season-core/weekly-report-card.js');
  const ui=read('season-report-card-ui.js');
  assert.match(app,/const VERSION=require\(['"]\.\.\/version['"]\)/);
  assert.equal(read('VERSION').trim(),'1.6.1');
  assert.match(vercel,/"deploymentEnabled"\s*:\s*false/);
  assert.doesNotMatch(registry,/enforced\s*:\s*true/);
  assert.doesNotMatch(registry,/stripe|checkout|payment|billing/i);
  assert.doesNotMatch(report,/fetch\s*\(/);
  assert.doesNotMatch(ui,/navigator\.serviceWorker\.register/);
  assert.doesNotMatch(ui,/submitTrade|executeTrade|addRosterPlayer|dropRosterPlayer/i);
});

test('Report Card tab interception prevents the legacy Season Intelligence handler from overwriting the report',()=>{
  const ui=read('season-report-card-ui.js');
  assert.match(ui,/stopImmediatePropagation\(\)/,'Report Card tab must stop the legacy bubbling handler before it can render the wrong fallback view');
});
