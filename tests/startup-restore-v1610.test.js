const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Android standalone launch hands off into the fully branded splash exactly once',()=>{
  const app=read('api/app.js');
  const index=read('index.html');
  const splash=read('splash.js');
  const manifest=JSON.parse(read('manifest.json'));

  assert.equal(app.includes('/splash.js?v=${VERSION}'),true,'api/app.js must inject the fully branded splash once');
  assert.equal(index.includes('/splash.js'),false,'static shell must not separately load splash.js');
  assert.match(splash,/cactus-byte-studios\.svg/,'branded splash must include the CactusByte Studios lockup');
  assert.match(splash,/ffm-user-logo\.svg/,'branded splash must include the Fantasy Football Matrix shield');
  assert.match(splash,/FANTASY FOOTBALL <span>MATRIX™<\/span>/,'branded splash must include the full app name');
  assert.equal(manifest.background_color,'#040a06','Android platform splash must blend into branded splash background');
  assert.equal(manifest.theme_color,'#040a06','Android theme must match branded splash background');
});

test('saved Sleeper league blocks generic NFL paint until restore finishes',()=>{
  const app=read('api/app.js');
  const index=read('index.html');
  const live=read('live-refresh.js');
  const sleeper=read('sleeper-live-sync.js');

  assert.match(app,/__FFM_SLEEPER_RESTORE_PENDING__/,'app shell must seed saved-Sleeper startup state before the body scripts run');
  assert.match(index,/__FFM_SLEEPER_RESTORE_PENDING__===true/,'initial NFL payload must detect a pending Sleeper restore');
  assert.match(index,/Restoring Sleeper league/,'cold launch must show restore state instead of generic NFL recommendations');
  assert.match(live,/function sleeperRestorePending\(\)/,'live NFL refresh must understand the Sleeper startup gate');
  assert.match(live,/sleeperRestorePending\(\)/,'live refresh must not win the cold-start render race');
  assert.match(sleeper,/__FFM_SLEEPER_RESTORE_PENDING__=false/,'Sleeper restore must always release the startup gate');
  assert.match(sleeper,/ffm:sleeper-restore-complete/,'Sleeper restore completion must be explicitly signaled');
});
