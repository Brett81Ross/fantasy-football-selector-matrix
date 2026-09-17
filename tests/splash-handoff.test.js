const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Android launch hands off into the branded CactusByte splash exactly once',()=>{
  const app=read('api/app.js');
  const index=read('index.html');
  assert.equal(app.includes('/splash.js?v=${VERSION}'),true);
  assert.equal(index.includes('/splash.js'),false);
});

test('Android system launch frame and branded splash use the same FFM shield and background',()=>{
  const manifest=JSON.parse(read('manifest.json'));
  const splash=read('splash.js');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.background_color,'#040a06');
  assert.equal(manifest.theme_color,'#040a06');
  assert.deepEqual(manifest.icons,[{
    src:'/icons/ffm-user-logo.svg',
    sizes:'any',
    type:'image/svg+xml',
    purpose:'any maskable'
  }]);
  assert.match(splash,/const APP='\/icons\/ffm-user-logo\.svg'/);
  assert.match(splash,/#040a06/);
});
