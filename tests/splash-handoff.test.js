const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('served app shell does not load the branded web splash',()=>{
  const app=read('api/app.js');
  const index=read('index.html');
  assert.equal(app.includes('/splash.js?v=${VERSION}'),false);
  assert.equal(index.includes('/splash.js'),false);
});

test('Android system launch frame keeps the dark standalone handoff',()=>{
  const manifest=JSON.parse(read('manifest.json'));
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.background_color,'#040a06');
  assert.equal(manifest.theme_color,'#040a06');
  assert.match(read('splash.js'),/#040a06/);
});
