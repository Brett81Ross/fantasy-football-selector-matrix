from pathlib import Path

app=Path('api/app.js')
text=app.read_text(encoding='utf-8')
original=text
old="const runtime=['fast-draft.js','special-teams.js','roster-needs.js','vorp.js','tier-cliffs.js','brand-integration.js','live-refresh.js','te-fix.js','decision-matrix.js','version-lock.js','cactusbyte-demo.js','native-install.js'];"
new="const runtime=['fast-draft.js','fantasy-draft-recovery.js','draft-recovery-ui.js','special-teams.js','roster-needs.js','vorp.js','tier-cliffs.js','brand-integration.js','live-refresh.js','te-fix.js','decision-matrix.js','version-lock.js','cactusbyte-demo.js','native-install.js'];"
if new not in text:
    if old not in text: raise SystemExit('api/app.js runtime anchor changed unexpectedly')
    text=text.replace(old,new,1)
if "const VERSION='1.5.5';" not in text: raise SystemExit('Fantasy app shell version is no longer v1.5.5')
if 'swRetirement' not in text or 'getRegistrations()' not in text: raise SystemExit('Fantasy service-worker retirement contract changed unexpectedly')
app.write_text(text,encoding='utf-8')

fast=Path('fast-draft.js').read_text(encoding='utf-8')
for marker in ["const DRAFTED_KEY = 'ffm-fast-drafted';","const ROSTER_KEY = 'ffm-fast-my-roster';","const GAP_KEY = 'ffm-fast-gap';","const CACHE_PREFIX = 'ffm-fast-data:';"]:
    if marker not in fast: raise SystemExit(f'fast-draft storage marker missing: {marker}')
engine=Path('fantasy-draft-recovery.js').read_text(encoding='utf-8')
if 'ffm-fast-data:' in engine: raise SystemExit('Recovery engine must exclude disposable Fantasy feed cache')
print('api/app.js: '+('patched' if text!=original else 'already deterministic'))
