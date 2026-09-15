from pathlib import Path
import re


def replace_exact(path, old, new, expected=1):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrences, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new))


# Android supplies the installed-PWA launch splash. Remove the second web splash and seed startup state early.
replace_exact(
    'api/app.js',
    "    const runtimeVersion=`<script>window.__FFM_VERSION__=${JSON.stringify(VERSION)};</script>`;\n    const swRetirement=`<script>(function(){try{const retire=async()=>{if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.allSettled(regs.map(r=>r.unregister()));}if('caches' in window){const keys=await caches.keys();await Promise.allSettled(keys.filter(k=>k.startsWith('ff-matrix-')||k.startsWith('fantasy-football-')).map(k=>caches.delete(k)));}};retire().catch(()=>{});}catch(_){}})();</script>`;\n    html=html.replace('<head>',`<head>\\n${runtimeVersion}\\n${swRetirement}`);",
    "    const runtimeVersion=`<script>window.__FFM_VERSION__=${JSON.stringify(VERSION)};</script>`;\n    const swRetirement=`<script>(function(){try{const retire=async()=>{if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.allSettled(regs.map(r=>r.unregister()));}if('caches' in window){const keys=await caches.keys();await Promise.allSettled(keys.filter(k=>k.startsWith('ff-matrix-')||k.startsWith('fantasy-football-')).map(k=>caches.delete(k)));}};retire().catch(()=>{});}catch(_){}})();</script>`;\n    const startupState=`<script>(function(){try{const hasUsername=Boolean(localStorage.getItem('ffm-sleeper-username'));const hasLeague=Boolean(localStorage.getItem('ffm-sleeper-league'));window.__FFM_SLEEPER_RESTORE_PENDING__=hasUsername&&hasLeague;}catch(_){window.__FFM_SLEEPER_RESTORE_PENDING__=false;}})();</script>`;\n    html=html.replace('<head>',`<head>\\n${runtimeVersion}\\n${swRetirement}\\n${startupState}`);"
)
replace_exact(
    'api/app.js',
    "    if(!html.includes('/splash.js'))html=html.replace('<body>',`<body>\\n<script src=\"/splash.js?v=${VERSION}\"></script>`);\n",
    ""
)

# Initial NFL data seeds the player pool Sleeper needs, but it must not paint generic recommendations during restore.
p = Path('index.html')
text = p.read_text()
pattern = r"    async function loadData\(\)\{.*?\n    function applySettingsLabels\(\)"
matches = re.findall(pattern, text, flags=re.S)
if len(matches) != 1:
    raise SystemExit(f"index.html: expected 1 loadData block, found {len(matches)}")
new_block = r'''    async function loadData(){
      const status=$('dataStatus');
      const restoring=window.__FFM_SLEEPER_RESTORE_PENDING__===true;
      status.innerHTML=restoring
        ? '<span><i class="live-dot loading"></i><strong>Restoring Sleeper league…</strong></span><span>Sleeper</span>'
        : '<span><i class="live-dot loading"></i><strong>Loading football data…</strong></span><span>nflverse</span>';
      try{
        const res=await fetch(`/api/nfl-data?scoring=${encodeURIComponent(state.scoring)}`,{cache:'no-store'});
        if(!res.ok)throw new Error('Data request failed');
        const data=await res.json();
        state.players=data.players||[];
        state.dataMeta=data;
        if(window.__FFM_SLEEPER_RESTORE_PENDING__===true){
          $('dataSeason').textContent='Sleeper';
          status.innerHTML='<span><i class="live-dot loading"></i><strong>Restoring Sleeper league…</strong></span><span>Sleeper</span>';
          $('draftSourceNote').textContent='Restoring your saved Sleeper league before showing recommendations.';
          return;
        }
        $('dataSeason').textContent=data.source?.note||`${data.statsSeason} data`;
        status.innerHTML=`<span><i class="live-dot"></i><strong>Data engine online</strong></span><span>${esc(data.source?.note||'nflverse')}</span>`;
        $('draftSourceNote').textContent=`Data source: ${data.source?.note}. Matrix scores are calculated by this app from player production, opportunity, trend, consistency, ceiling, availability, positional scarcity, draft round, and your risk setting.`;
        renderAll();
      }catch(err){
        console.error(err);
        state.players=[];
        if(window.__FFM_SLEEPER_RESTORE_PENDING__===true){
          window.__FFM_SLEEPER_RESTORE_PENDING__=false;
          window.dispatchEvent(new CustomEvent('ffm:sleeper-restore-complete',{detail:{restored:false,reason:'nfl-data-unavailable'}}));
        }
        status.innerHTML='<span><i class="live-dot error"></i><strong>Football data unavailable</strong></span><span>Retry later</span>';
        $('draftPick').innerHTML='<div class="empty">The live data source could not be reached. No demo score is being substituted.</div>';
        $('draftList').innerHTML='<div class="empty">No live player data available.</div>';
      }
    }
    function applySettingsLabels()'''
p.write_text(re.sub(pattern, new_block, text, count=1, flags=re.S))

# Background NFL refresh may update the player pool/kickoff context, but cannot win the cold-start render race.
replace_exact(
    'live-refresh.js',
    "  function appReady(){try{return typeof state!=='undefined'&&Array.isArray(state.players)&&typeof renderAll==='function'}catch(_){return false}}\n",
    "  function appReady(){try{return typeof state!=='undefined'&&Array.isArray(state.players)&&typeof renderAll==='function'}catch(_){return false}}\n  function sleeperRestorePending(){return window.__FFM_SLEEPER_RESTORE_PENDING__===true}\n"
)
replace_exact(
    'live-refresh.js',
    "    publishKickoffContext(data,health);\n    renderAll();\n    renderScoreboard(data);\n    return true;",
    "    publishKickoffContext(data,health);\n    if(sleeperRestorePending())return true;\n    renderAll();\n    renderScoreboard(data);\n    return true;"
)
replace_exact(
    'live-refresh.js',
    "      saveLastGood(data);\n      const live=Number(data.liveGames||0),teams=Number(data.health?.teamsLoaded||0),partial=teams<32;",
    "      saveLastGood(data);\n      if(sleeperRestorePending()){\n        status('Restoring Sleeper league…',false,'Sleeper');\n        const note=document.getElementById('draftSourceNote');if(note)note.textContent='Restoring your saved Sleeper league before showing recommendations.';\n        return true;\n      }\n      const live=Number(data.liveGames||0),teams=Number(data.health?.teamsLoaded||0),partial=teams<32;"
)
replace_exact(
    'live-refresh.js',
    "  window.addEventListener('focus',()=>{checkForAppUpdate();refresh()});",
    "  window.addEventListener('ffm:sleeper-restore-complete',e=>{if(!e.detail?.restored)refresh()});\n  window.addEventListener('focus',()=>{checkForAppUpdate();refresh()});"
)

# Sleeper owns and releases the cold-start gate deterministically.
p = Path('sleeper-live-sync.js')
text = p.read_text()
pattern = r"  async function restore\(\)\{.*?\n  \}\n\n  function init\(\)"
matches = re.findall(pattern, text, flags=re.S)
if len(matches) != 1:
    raise SystemExit(f"sleeper-live-sync.js: expected 1 restore block, found {len(matches)}")
new_restore = r'''  function finishRestore(restored,reason=''){
    window.__FFM_SLEEPER_RESTORE_PENDING__=false;
    window.dispatchEvent(new CustomEvent('ffm:sleeper-restore-complete',{detail:{restored:Boolean(restored),reason}}));
  }

  async function restore(){
    const username=safeGet(USERNAME_KEY);
    const savedLeague=safeGet(LEAGUE_KEY);
    if(!username){finishRestore(false,'no-saved-user');return false}
    window.__FFM_SLEEPER_RESTORE_PENDING__=Boolean(savedLeague);
    let restored=false;
    try{
      await connectSleeper({username,autoStart:true});
      restored=Boolean(window.ffmCanonicalDraftState||window.ffmLeagueSnapshot);
      return restored;
    }catch(error){
      setStatus(`Saved Sleeper connection needs attention · ${String(error?.message||error)}`,'warn');
      return false;
    }finally{
      finishRestore(restored,restored?'restored':'not-restored');
    }
  }

  function init()'''
p.write_text(re.sub(pattern, new_restore, text, count=1, flags=re.S))

# Existing splash tests were enforcing the regression. Align them with native-only Android startup.
replace_exact(
    'tests/single-splash.test.js',
    "test('web runtime keeps the preferred branded splash without duplicating it in the static shell',()=>{\n  assert.equal(app.includes('/splash.js'),true,'api/app.js must inject the branded splash');\n  assert.equal(index.includes('/splash.js'),false,'index.html must not separately load splash.js');\n});",
    "test('Android installed runtime does not add a second web splash',()=>{\n  assert.equal(app.includes('/splash.js'),false,'api/app.js must not inject a second web splash');\n  assert.equal(index.includes('/splash.js'),false,'index.html must not load splash.js');\n});"
)
replace_exact(
    'tests/splash-handoff.test.js',
    "test('keeps the branded CactusByte splash as the web splash',()=>{\n  const app=read('api/app.js');\n  assert.match(app,/\\/splash\\.js\\?v=\\$\\{VERSION\\}/);\n});",
    "test('Android launch relies on the installed-PWA splash without a second web splash',()=>{\n  const app=read('api/app.js');\n  assert.equal(app.includes('/splash.js'),false);\n});"
)

# v1.6.10 shared version authority and current-release expectations.
Path('VERSION').write_text('1.6.10\n')
Path('version.js').write_text("'use strict';\nmodule.exports='1.6.10';\n")
for test_file in Path('tests').glob('*.test.js'):
    source = test_file.read_text()
    if '1.6.9' in source:
        test_file.write_text(source.replace('1.6.9', '1.6.10'))
