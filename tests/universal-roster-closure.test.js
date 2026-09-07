const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'api/app.js'),'utf8');
const roster=fs.readFileSync(path.join(root,'roster-needs.js'),'utf8');

test('app shell no longer executes the hard-coded Game of Throws profile',()=>{
  const runtimeMatch=app.match(/const runtime=\[(.*?)\];/s);
  assert.ok(runtimeMatch,'runtime list should exist');
  assert.doesNotMatch(runtimeMatch[1],/league-profile\.js/);
});

test('roster needs accepts canonical league roster slots from provider state',()=>{
  assert.match(roster,/function lineupFromDraftState\(next\)/);
  assert.match(roster,/next\?\.league\?\.rosterSlots/);
  assert.match(roster,/window\.addEventListener\('ffm:draft-state'/);
  assert.match(roster,/applyCanonical\(event\.detail\)/);
});

test('legacy roster-need scoring is disabled while canonical provider state is authoritative',()=>{
  assert.match(roster,/function canonicalActive\(\)/);
  assert.match(roster,/if\(canonicalActive\(\)\|\|!player/);
  assert.match(roster,/if\(canonicalActive\(\)\)return;/);
});

test('manual lineup controls remain editable only when canonical sync is not active',()=>{
  assert.match(roster,/input\.disabled=locked/);
  assert.match(roster,/Switch to Manual Draft to edit it/);
  assert.match(roster,/if\(canonicalActive\(\)\)return;const next=\{\}/);
});
