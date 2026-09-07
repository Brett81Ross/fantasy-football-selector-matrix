const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const special=fs.readFileSync(path.join(root,'special-teams.js'),'utf8');
const install=fs.readFileSync(path.join(root,'native-install.js'),'utf8');
const app=fs.readFileSync(path.join(root,'api/app.js'),'utf8');

test('K DEF and five-slot bench controls remain wired',()=>{
  assert.match(special,/const BENCH_LIMIT=5/);
  assert.match(special,/\['K','DST','BENCH'\]/);
  assert.match(special,/option\.textContent=pos==='DST'\?'DEF \/ DST':pos/);
  assert.match(special,/BENCH_POSITIONS=new Set\(\['QB','RB','WR','TE'\]\)/);
  assert.match(special,/if\(bench\.size>=BENCH_LIMIT\)/);
});

test('K and DST keep late-round protection',()=>{
  assert.match(special,/\['K','DST'\]\.includes\(player\.position\)/);
  assert.match(special,/r<=3\?32:r===4\?24:r<=6\?13:0/);
});

test('Install App remains inside Share modal instead of a floating CTA',()=>{
  assert.match(install,/document\.getElementById\('shareModal'\)/);
  assert.match(install,/b\.id='shareInstallApp'/);
  assert.match(install,/b\.className='secondary'/);
  assert.match(install,/nativeShare\.insertAdjacentElement\('afterend',b\)/);
  assert.doesNotMatch(install,/shareInstallApp[^\n]*position\s*[:=]/);
});

test('app shell still loads special teams and native install runtime',()=>{
  assert.match(app,/'special-teams\.js'/);
  assert.match(app,/'native-install\.js'/);
});
