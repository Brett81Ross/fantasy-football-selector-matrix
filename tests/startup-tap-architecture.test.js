const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('app shell disables the legacy automatic nfl-data startup request',()=>{
  const source=read('api/app.js');
  assert.match(source,/replace\([^\n]*applySettingsLabels\(\);loadData\(\)/,'app shell must remove the legacy inline startup loadData call');
});

test('live refresh retries startup while hidden or after an initial failed live fetch',()=>{
  const source=read('live-refresh.js');
  assert.match(source,/document\.hidden[^\n]*setTimeout\(attempt/,'startup must retry instead of abandoning refresh while the app is hidden');
  assert.match(source,/const ok=await refresh\(\)/,'startup must inspect whether the initial live refresh succeeded');
  assert.match(source,/!ok[^\n]*setTimeout\(attempt/,'failed initial live refresh must retry during the startup window');
});

test('live draft recommendation work is deferred until after the tap can paint',()=>{
  const source=read('live-draft-mode.js');
  assert.match(source,/function scheduleRender\(/,'live draft mode must centralize deferred rendering');
  assert.match(source,/requestAnimationFrame\([^\n]*setTimeout\(/,'deferred live-draft work must cross a paint boundary before heavy computation');
  assert.doesNotMatch(source,/requestAnimationFrame\(render\)/,'render must not run directly in requestAnimationFrame before paint');
});

test('live draft tap handlers reuse the rendered recommendation instead of recomputing synchronously',()=>{
  const source=read('live-draft-mode.js');
  const directCalls=[...source.matchAll(/recommendation\(assignmentState\(\)\)/g)].length;
  assert.equal(directCalls,0,'tap handlers must not recompute the recommendation synchronously');
  assert.match(source,/currentRecommendation\s*=\s*recommendation\(assignments\)/,'render must cache the recommendation for tap handlers');
});

test('draft row buttons use one delegated listener instead of rebinding every rendered row',()=>{
  const source=read('fast-draft.js');
  assert.doesNotMatch(source,/querySelectorAll\('\.compare-btn'\)\.forEach/,'compare handlers must not be rebound per row');
  assert.doesNotMatch(source,/querySelectorAll\('\.drafted-btn'\)\.forEach/,'drafted handlers must not be rebound per row');
  assert.match(source,/closest\('\.compare-btn'\)/,'delegated draft-list listener must handle compare buttons');
  assert.match(source,/closest\('\.drafted-btn'\)/,'delegated draft-list listener must handle drafted buttons');
});

test('fast draft recommendation sync is also deferred beyond the first paint',()=>{
  const source=read('fast-draft.js');
  assert.match(source,/function scheduleFastUI\(/,'fast draft must centralize deferred recommendation syncing');
  assert.match(source,/requestAnimationFrame\([^\n]*setTimeout\(/,'fast draft sync must cross a paint boundary');
  assert.doesNotMatch(source,/requestAnimationFrame\(syncFastUI\)/,'fast draft sync must not run directly in requestAnimationFrame');
  assert.doesNotMatch(source,/\n\s*syncFastUI\(\);\n\s*};/,'renderDraftList must not run recommendation sync synchronously before paint');
});
