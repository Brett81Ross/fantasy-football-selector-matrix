const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Season Intelligence UI exposes the Weekly Attack Plan and all drill-down views',()=>{const src=fs.readFileSync('season-intelligence.js','utf8');for(const label of ['Weekly Attack Plan','Roster Doctor','Waiver Assassin','Trade Hunter','Opponent Exploiter','Player Status'])assert.match(src,new RegExp(label));});
test('Season Intelligence reacts to canonical league snapshots and never submits roster transactions',()=>{const src=fs.readFileSync('season-intelligence.js','utf8');assert.match(src,/ffm:league-snapshot/);assert.match(src,/buildWeeklyAttackPlan/);assert.doesNotMatch(src,/fetch\([^\n]*(waiver|transaction|trade|lineup)/i);});
test('app shell loads every Season Intelligence engine before its UI runtime',()=>{const src=fs.readFileSync('api/app.js','utf8');const ui=src.indexOf("'season-intelligence.js'");for(const file of ['season-core/player-status.js','season-core/roster-doctor.js','season-core/lineup-optimizer.js','season-core/waiver-assassin.js','season-core/trade-hunter.js','season-core/opponent-exploiter.js','season-core/weekly-attack-plan.js']){const i=src.indexOf(`'${file}'`);assert.ok(i>=0&&i<ui,`${file} must load before season-intelligence.js`);}});
test('UI visibly labels data freshness and risk/confidence',()=>{const src=fs.readFileSync('season-intelligence.js','utf8');assert.match(src,/freshness/i);assert.match(src,/confidence/i);assert.match(src,/risk/i);});
