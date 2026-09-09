(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.FFMSeasonProviderSession=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function createSeasonProviderSession(options={}){
 const provider=options.provider;const onState=typeof options.onState==='function'?options.onState:()=>{};const now=typeof options.now==='function'?options.now:()=>new Date().toISOString();if(!provider||typeof provider.loadSeasonSnapshot!=='function')throw new TypeError('provider.loadSeasonSnapshot is required');
 let current=null,lastKnownGood=null,leagueId='',failures=0;
 function publish(state){current=clone(state);onState(clone(current));return clone(current)}
 function staleCopy(base){const next=clone(base);next.freshness={...(next.freshness||{}),status:'stale',asOf:next.freshness?.asOf||now()};return next}
 async function refresh(id=leagueId){leagueId=String(id||leagueId||'').trim();if(!leagueId)throw new Error('leagueId is required');try{const incoming=await provider.loadSeasonSnapshot(leagueId);const recovered=failures>0;failures=0;lastKnownGood=clone(incoming);publish(incoming);return{ok:true,state:clone(current),recovered};}catch(error){if(!current&&!lastKnownGood)throw error;failures+=1;const base=lastKnownGood||current;publish(staleCopy(base));const retryAfterMs=Math.min(15*60*1000,60000*(2**Math.min(failures-1,3)));return{ok:false,state:clone(current),retryAfterMs,error:String(error?.message||error)};}}
 function getState(){return clone(current)}
 return{refresh,getState};
}
return{createSeasonProviderSession};});
