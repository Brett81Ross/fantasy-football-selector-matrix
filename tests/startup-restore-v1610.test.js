const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Android standalone launch does not add a second branded web splash',()=>{
  const app=read('api/app.js');
  const index=read('index.html');
  assert.equal(app.includes('/splash.js?v=${VERSION}'),false,'api/app.js must not inject the branded web splash');
  assert.equal(index.includes('/splash.js'),false,'static shell must not separately load splash.js');
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
