const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('completed drafts continue low-frequency in-season refresh instead of stopping',()=>{const src=fs.readFileSync('sleeper-live-sync.js','utf8');assert.match(src,/SEASON_POLL_MS=300000/);assert.match(src,/draftStatus==='completed'\)return SEASON_POLL_MS/);assert.doesNotMatch(src,/draftStatus==='completed'\)return 0/);});
test('completed-draft refresh also updates the canonical LeagueSnapshot',()=>{const src=fs.readFileSync('sleeper-live-sync.js','utf8');assert.match(src,/refreshSeason/);assert.match(src,/ffmLeagueSnapshot/);assert.match(src,/ffm:league-snapshot/);assert.match(src,/FFMSeasonProviderSession/);});
test('app shell loads season contracts before Sleeper provider and season session before live sync',()=>{const src=fs.readFileSync('api/app.js','utf8');const contracts=src.indexOf("'season-core/contracts.js'");const sleeper=src.indexOf("'draft-core/sleeper-provider.js'");const seasonSession=src.indexOf("'season-core/provider-session.js'");const live=src.indexOf("'sleeper-live-sync.js'");assert.ok(contracts>=0&&contracts<sleeper);assert.ok(seasonSession>=0&&seasonSession<live);});
