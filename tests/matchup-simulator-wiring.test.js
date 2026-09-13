const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('browser runtime loads Matchup Simulator after confidence and lineup dependencies',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','api','app.js'),'utf8');
 const confidence=app.indexOf("season-core/data-confidence.js");
 const lineup=app.indexOf("season-core/lineup-optimizer.js");
 const simulator=app.indexOf("season-core/matchup-simulator.js");
 const seasonUi=app.indexOf("season-intelligence.js");
 assert.ok(confidence>=0,'Data Confidence Matrix must be loaded');
 assert.ok(lineup>=0,'Lineup Optimizer must be loaded');
 assert.ok(simulator>=0,'Matchup Simulator must be loaded');
 assert.ok(confidence<simulator,'confidence must load before Matchup Simulator');
 assert.ok(lineup<simulator,'lineup optimizer must load before Matchup Simulator');
 assert.ok(simulator<seasonUi,'Matchup Simulator must load before Season Intelligence UI');
});

test('Matchup Simulator wiring preserves shared version authority and deployment policy',()=>{
 const root=path.join(__dirname,'..');
 const app=fs.readFileSync(path.join(root,'api','app.js'),'utf8');
 const vercel=fs.readFileSync(path.join(root,'vercel.json'),'utf8');
 assert.match(app,/const VERSION=require\(['"]\.\.\/version['"]\)/);
 assert.equal(fs.readFileSync(path.join(root,'VERSION'),'utf8').trim(),'1.6.1');
 assert.match(vercel,/"deploymentEnabled"\s*:\s*false/);
});
