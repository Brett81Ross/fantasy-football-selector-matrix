const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');

test('browser loads FAAB optimizer before Waiver Assassin and Season Intelligence',()=>{
 const app=read('api/app.js');
 const faab=app.indexOf("'season-core/faab-optimizer.js'");
 const waiver=app.indexOf("'season-core/waiver-assassin.js'");
 const ui=app.indexOf("'season-intelligence.js'");
 assert.ok(faab>=0,'FAAB optimizer must be loaded');
 assert.ok(waiver>=0&&faab<waiver,'FAAB optimizer must load before Waiver Assassin');
 assert.ok(ui>=0&&waiver<ui,'Waiver Assassin must load before Season Intelligence');
});

test('Waiver Assassin delegates dollar bidding to the pure FAAB optimizer',()=>{
 const waiver=read('season-core/waiver-assassin.js');
 assert.match(waiver,/require\('\.\/faab-optimizer'\)/);
 assert.match(waiver,/FFMFaabOptimizer/);
 assert.match(waiver,/optimizeFaabBid/);
 assert.match(waiver,/faab/);
});

test('Season Intelligence shows FAAB target and range only from available optimizer output',()=>{
 const ui=read('season-intelligence.js');
 assert.match(ui,/w\.faab\?\.available/);
 assert.match(ui,/FAAB/);
 assert.match(ui,/recommendedBid/);
 assert.match(ui,/minBid/);
 assert.match(ui,/maxBid/);
});

test('unknown canonical FAAB total remains null instead of becoming zero',()=>{
 const contracts=read('season-core/contracts.js');
 const {normalizeLeagueSnapshot}=require('../season-core/contracts');
 const snapshot=normalizeLeagueSnapshot({
  league:{leagueId:'NO-BUDGET',platform:'manual',season:2026,teams:8,rosterSlots:[{id:'BN',type:'BN',count:1,eligiblePositions:['RB'],isBench:true,isReserve:false}]},
  week:1,rosters:[{rosterId:'1',playerIds:[]}],playerPool:[],freshness:{status:'fresh'}
 });
 assert.equal(snapshot.league.waiverBudgetTotal,null);
 assert.equal(snapshot.rosters[0].waiverBudgetRemaining,null);
 assert.match(contracts,/waiverBudgetTotal/);
});

test('ABL-31 wiring preserves shared version deployment lock and no service-worker registration',()=>{
 const app=read('api/app.js');
 const ui=read('season-intelligence.js');
 const vercel=read('vercel.json');
 assert.match(app,/const VERSION=require\(['"]\.\.\/version['"]\)/);
 assert.equal(read('VERSION').trim(),'1.6.1');
 assert.match(vercel,/"deploymentEnabled"\s*:\s*false/);
 assert.doesNotMatch(ui,/serviceWorker\.register|Notification\.requestPermission/);
});
