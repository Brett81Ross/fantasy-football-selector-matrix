const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'api','app.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));

test('web runtime does not add a second custom splash after the platform launch splash',()=>{
  assert.equal(app.includes('/splash.js'),false,'api/app.js must not inject splash.js');
  assert.equal(index.includes('/splash.js'),false,'index.html must not load splash.js');
});

test('standalone app launch behavior and deployment guardrails remain intact',()=>{
  assert.equal(manifest.display,'standalone');
  assert.equal(vercel.git.deploymentEnabled,false);
});
