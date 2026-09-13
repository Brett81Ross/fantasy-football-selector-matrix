const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('keeps the branded CactusByte splash as the web splash',()=>{
  const app=read('api/app.js');
  assert.match(app,/\/splash\.js\?v=\$\{VERSION\}/);
});

test('Android system launch frame blends into the branded splash without changing standalone mode',()=>{
  const manifest=JSON.parse(read('manifest.json'));
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.background_color,'#040a06');
  assert.equal(manifest.theme_color,'#040a06');
  assert.match(read('splash.js'),/#040a06/);
});
