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

test('Android installed runtime does not add a second web splash',()=>{
  assert.equal(app.includes('/splash.js'),false,'api/app.js must not inject a second web splash');
  assert.equal(index.includes('/splash.js'),false,'index.html must not load splash.js');
});

test('standalone Android launch frame blends into the branded splash and deployment guardrails remain intact',()=>{
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.background_color,'#040a06');
  assert.equal(manifest.theme_color,'#040a06');
  assert.match(splash,/#040a06/);
  assert.equal(vercel.git.deploymentEnabled,false);
});
