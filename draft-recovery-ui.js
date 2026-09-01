(()=>{'use strict';
const R=window.FantasyDraftRecovery;if(!R)return;
function readArray(key){try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
function currentBackup(){return R.createBackup(readArray(R.DRAFTED_KEY),readArray(R.ROSTER_KEY),localStorage.getItem(R.GAP_KEY))}
function download(payload,name){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function mount(){
 if(document.getElementById('ffm-draft-recovery'))return;
 const draft=document.getElementById('draft');if(!draft)return;
 const filters=draft.querySelector('.filters');if(!filters)return;
 const box=document.createElement('div');box.id='ffm-draft-recovery';box.style.cssText='margin:9px 0 2px;padding:10px;border:1px solid var(--line);border-radius:12px;background:#09120d;display:grid;gap:8px';box.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div><div style="font-size:9px;font-weight:950;letter-spacing:.12em;color:var(--accent)">SIGNING MIGRATION</div><div style="font-size:12px;font-weight:900;margin-top:2px">Active Draft Backup</div></div><div id="ffm-draft-backup-status" style="font-size:9px;color:var(--muted);text-align:right"></div></div><div style="font-size:10px;color:var(--muted);line-height:1.45">Preserves drafted players, your roster picks, and picks-until-next. Live player/feed caches are intentionally excluded and refresh normally.</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px"><button id="ffm-export-draft" class="fast-action" type="button">Export Draft</button><button id="ffm-restore-draft" class="fast-action mine" type="button">Restore / Merge</button></div><input id="ffm-draft-backup-file" type="file" accept="application/json,.json" hidden>`;
 filters.insertAdjacentElement('afterend',box);
 const file=box.querySelector('#ffm-draft-backup-file'),status=box.querySelector('#ffm-draft-backup-status');
 const say=(m,bad=false)=>{status.textContent=m;status.style.color=bad?'#ff8c8c':'var(--muted)'};
 box.querySelector('#ffm-export-draft').addEventListener('click',()=>{const backup=currentBackup();download(backup,'fantasy-matrix-active-draft-backup.json');say(`${backup.draft.drafted.length} drafted · ${backup.draft.roster.length} mine`)});
 box.querySelector('#ffm-restore-draft').addEventListener('click',()=>file.click());
 file.addEventListener('change',async e=>{const selected=e.target.files&&e.target.files[0];if(!selected)return;try{if(selected.size>R.MAX_FILE_BYTES)throw new Error('Backup file is larger than 5 MB.');say('Validating…');const parsed=R.parseBackupText(await selected.text());download(currentBackup(),'fantasy-matrix-pre-import-draft-backup.json');const restored=R.restore(localStorage,parsed);say(`${restored.drafted.length} drafted · ${restored.roster.length} mine`);setTimeout(()=>location.reload(),650)}catch(err){say(err instanceof Error?err.message:String(err),true)}finally{file.value=''}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
