const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'api','app.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const splash=fs.readFileSync(path.join(root,'splash.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));

test('branded CactusByte splash is restored as the visible app splash',()=>{
  assert.equal(app.includes('/splash.js?v=${VERSION}'),true,'api/app.js must inject the branded splash once');
  assert.equal(index.includes('/splash.js'),false,'index.html must not separately load splash.js');
});

test('Android launch frame visually hands off into the branded splash and deployment stays locked',()=>{
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.background_color,'#040a06');
  assert.equal(manifest.theme_color,'#040a06');
  assert.match(splash,/#040a06/);
  assert.equal(vercel.git.deploymentEnabled,false);
});
