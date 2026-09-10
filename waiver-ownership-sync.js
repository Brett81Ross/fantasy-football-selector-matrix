(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMWaiverOwnershipSync=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function filterWaiverCandidates(players,snapshot){
  const eligible=(Array.isArray(players)?players:[]).filter(p=>num(p?.games)>=4&&num(p?.metrics?.opportunity)>=45);
  if(!snapshot||!Array.isArray(snapshot.freeAgentPlayerIds))return eligible;
  const free=new Set(snapshot.freeAgentPlayerIds.map(String));
  const owned=new Set([
    ...(Array.isArray(snapshot.ownedPlayerIds)?snapshot.ownedPlayerIds:[]),
    ...(Array.isArray(snapshot.rosters)?snapshot.rosters.flatMap(roster=>Array.isArray(roster?.playerIds)?roster.playerIds:[]):[])
  ].map(String));
  return eligible.filter(p=>{const id=String(p?.id||'');return free.has(id)&&!owned.has(id)});
}
function watchScore(p){const m=p?.metrics||{};return Math.round(Math.max(0,Math.min(100,num(m.tov)*.48+num(m.trend)*.32+num(m.ceiling)*.2)))}
function render(){
  if(!root||typeof document==='undefined'||typeof state==='undefined')return;
  const list=document.getElementById('waiverList');if(!list)return;
  const snapshot=root.ffmLeagueSnapshot||null;
  const candidates=filterWaiverCandidates(state.players,snapshot).map(p=>({p,watch:watchScore(p)})).sort((a,b)=>b.watch-a.watch).slice(0,40);
  const notice=document.querySelector('#waiver .notice');
  if(snapshot){
    const freshness=String(snapshot.freshness?.status||'unknown').toUpperCase();
    if(notice)notice.textContent=`Synced league ownership active · only current free agents are shown · ${freshness}`;
  }else if(notice){notice.textContent='Without a synced league, this is a watchlist—not a claim that every player below is a free agent in your league.'}
  list.innerHTML=candidates.length?candidates.map((x,i)=>`<div class="row"><div class="rank">${i+1}</div><div><div class="rname">${esc(x.p.name)}</div><div class="rmeta">${esc(x.p.position)} · ${esc(x.p.team)} · ${num(x.p.avgPoints).toFixed(1)} FP/g · TOV ${esc(x.p.metrics?.tov??'—')} · MVI ${esc(x.p.metrics?.mvi??'—')}</div></div><div class="rscore">${x.watch}<small>${snapshot?'FREE AGENT':'WATCH'}</small></div></div>`).join(''):'<div class="empty">No current free agents clear the Waiver Watch threshold in this synced league.</div>';
}
function install(){
  if(!root||typeof document==='undefined')return;
  root.renderWaivers=render;
  root.addEventListener('ffm:league-snapshot',render);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
}
if(root&&typeof document!=='undefined')install();
return{filterWaiverCandidates,watchScore,render};
});
