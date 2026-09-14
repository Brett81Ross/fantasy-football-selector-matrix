const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('season tab taps reuse derived player values until the NFL player dataset changes',()=>{
  const source=read('season-intelligence.js');
  assert.match(source,/playerValuesCacheRef/,'season UI should cache the derived player-value map by player dataset reference');
  assert.match(source,/if\(list===playerValuesCacheRef\)return playerValuesCache/,'unchanged player data should skip rebuilding every derived player object on each tab tap');
});

test('re-tapping the already active season tab is a no-op',()=>{
  const source=read('season-intelligence.js');
  assert.match(source,/if\(b\.classList\.contains\('active'\)\)return/,'active season tab should not rerun the render path');
});

test('draft board tap handlers are delegated once instead of rebound after every render',()=>{
  const source=read('index.html');
  assert.doesNotMatch(source,/querySelectorAll\('\.compare-btn'\)\.forEach\(btn=>btn\.addEventListener/,'compare buttons should not be rebound after every board render');
  assert.doesNotMatch(source,/querySelectorAll\('\.drafted-btn'\)\.forEach\(btn=>btn\.addEventListener/,'drafted buttons should not be rebound after every board render');
  assert.match(source,/\$\('draftList'\)\.addEventListener\('click'/,'draft board should use one delegated click listener');
});

test('compare taps patch the affected row instead of rebuilding the entire 60-row board',()=>{
  const source=read('index.html');
  const start=source.indexOf('function toggleCompare');
  const end=source.indexOf('function renderCompareTray',start);
  assert.ok(start>=0&&end>start,'toggleCompare function should exist before renderCompareTray');
  const body=source.slice(start,end);
  assert.doesNotMatch(body,/renderDraftList\(\)/,'compare toggle should not rebuild the full draft board');
  assert.match(body,/syncDraftRowCompare\(id\)/,'compare toggle should patch only the affected row');
});
