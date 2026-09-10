const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('deployment remains locked',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.equal(config.git?.deploymentEnabled,false);
});

test('version authority remains v1.6.0 in app shell',()=>{
  const app=fs.readFileSync(path.join(root,'api/app.js'),'utf8');
  assert.match(app,/const VERSION='1\.6\.0'/);
});

test('universal provider runtime is loaded and hard-coded league profile is not',()=>{
  const app=fs.readFileSync(path.join(root,'api/app.js'),'utf8');
  assert.match(app,/draft-core\/sleeper-provider\.js/);
  assert.match(app,/draft-core\/provider-session\.js/);
  assert.match(app,/draft-state-render-bridge\.js/);
  assert.match(app,/sleeper-live-sync\.js/);
  assert.doesNotMatch(app,/['"]league-profile\.js['"]/);
});
