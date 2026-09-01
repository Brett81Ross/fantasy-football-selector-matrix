(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.FantasyDraftRecovery=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const APP="Fantasy Football Matrix";
  const SCHEMA="fantasy-draft-backup-v1";
  const VERSION=1;
  const DRAFTED_KEY="ffm-fast-drafted";
  const ROSTER_KEY="ffm-fast-my-roster";
  const GAP_KEY="ffm-fast-gap";
  const MAX_FILE_BYTES=5*1024*1024;
  const MAX_INPUT_IDS=1000;
  const MAX_STORED_IDS=500;

  function id(value){return typeof value==="string"?value.trim().slice(0,180):""}
  function ids(values){
    if(!Array.isArray(values))throw new Error("Draft IDs must be an array.");
    if(values.length>MAX_INPUT_IDS)throw new Error("Backup contains too many draft IDs.");
    const out=[],seen=new Set();
    for(const value of values){const clean=id(value);if(clean&&!seen.has(clean)){seen.add(clean);out.push(clean);if(out.length>=MAX_STORED_IDS)break}}
    return out;
  }
  function gap(value){const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=100?n:null}
  function mergeIds(currentValues,backupValues){
    const current=ids(Array.isArray(currentValues)?currentValues:[]),backup=ids(Array.isArray(backupValues)?backupValues:[]),seen=new Set(current),out=[...current];
    for(const value of backup){if(out.length>=MAX_STORED_IDS)break;if(!seen.has(value)){seen.add(value);out.push(value)}}
    return out;
  }
  function createBackup(drafted,roster,picksUntilNext){
    const cleanRoster=ids(Array.isArray(roster)?roster:[]);
    const cleanDrafted=mergeIds(drafted,cleanRoster);
    return{app:APP,schema:SCHEMA,version:VERSION,created:new Date().toISOString(),draft:{drafted:cleanDrafted,roster:cleanRoster,picksUntilNext:gap(picksUntilNext)}};
  }
  function parseBackupObject(payload){
    if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new Error("Backup must be a JSON object.");
    if(payload.app!==APP)throw new Error("This backup belongs to a different app.");
    if(payload.schema!==SCHEMA)throw new Error("Unsupported Fantasy draft backup schema.");
    if(Number(payload.version)!==VERSION)throw new Error("Unsupported Fantasy draft backup version.");
    const draft=payload.draft;
    if(!draft||typeof draft!=="object"||Array.isArray(draft))throw new Error("Backup draft state is missing.");
    const roster=ids(draft.roster||[]),drafted=mergeIds(draft.drafted||[],roster);
    return{drafted,roster,picksUntilNext:gap(draft.picksUntilNext)};
  }
  function parseBackupText(raw){
    if(typeof raw!=="string")throw new Error("Backup must be text.");
    if(new TextEncoder().encode(raw).length>MAX_FILE_BYTES)throw new Error("Backup file is larger than 5 MB.");
    let payload;try{payload=JSON.parse(raw)}catch{throw new Error("Backup is not valid JSON.")}
    return parseBackupObject(payload);
  }
  function readArray(storage,key){const raw=storage.getItem(key);if(raw===null)return{raw:null,value:[]};try{const value=JSON.parse(raw);return{raw,value:Array.isArray(value)?value:[]}}catch{return{raw,value:[]}}}
  function restore(storage,backup){
    if(!storage||typeof storage.getItem!=="function"||typeof storage.setItem!=="function")throw new Error("Storage is unavailable.");
    const parsed=backup&&Array.isArray(backup.drafted)?{drafted:ids(backup.drafted),roster:ids(backup.roster||[]),picksUntilNext:gap(backup.picksUntilNext)}:parseBackupObject(backup);
    const oldDrafted=readArray(storage,DRAFTED_KEY),oldRoster=readArray(storage,ROSTER_KEY),oldGap=storage.getItem(GAP_KEY);
    const mergedRoster=mergeIds(oldRoster.value,parsed.roster),mergedDrafted=mergeIds(mergeIds(oldDrafted.value,parsed.drafted),mergedRoster);
    const nextGap=oldGap!==null&&gap(oldGap)!==null?gap(oldGap):parsed.picksUntilNext;
    try{
      storage.setItem(DRAFTED_KEY,JSON.stringify(mergedDrafted));
      storage.setItem(ROSTER_KEY,JSON.stringify(mergedRoster));
      if(nextGap!==null)storage.setItem(GAP_KEY,String(nextGap));
    }catch(error){
      try{
        for(const [key,raw] of [[DRAFTED_KEY,oldDrafted.raw],[ROSTER_KEY,oldRoster.raw],[GAP_KEY,oldGap]]){if(raw===null&&typeof storage.removeItem==="function")storage.removeItem(key);else storage.setItem(key,raw)}
      }catch{}
      throw error;
    }
    return{drafted:mergedDrafted,roster:mergedRoster,picksUntilNext:nextGap};
  }
  return{APP,SCHEMA,VERSION,DRAFTED_KEY,ROSTER_KEY,GAP_KEY,MAX_FILE_BYTES,MAX_INPUT_IDS,MAX_STORED_IDS,ids,gap,mergeIds,createBackup,parseBackupObject,parseBackupText,restore};
});
