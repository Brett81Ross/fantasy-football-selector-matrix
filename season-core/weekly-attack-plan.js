(function(root,factory){
  const rosterDoctor=typeof module==='object'&&module.exports?require('./roster-doctor'):root.FFMRosterDoctor;
  const lineupOptimizer=typeof module==='object'&&module.exports?require('./lineup-optimizer'):root.FFMLineupOptimizer;
  const waiverAssassin=typeof module==='object'&&module.exports?require('./waiver-assassin'):root.FFMWaiverAssassin;
  const tradeHunter=typeof module==='object'&&module.exports?require('./trade-hunter'):root.FFMTradeHunter;
  const opponentExploiter=typeof module==='object'&&module.exports?require('./opponent-exploiter'):root.FFMOpponentExploiter;
  const playerStatus=typeof module==='object'&&module.exports?require('./player-status'):root.FFMPlayerStatus;
  const api=factory(rosterDoctor,lineupOptimizer,waiverAssassin,tradeHunter,opponentExploiter,playerStatus);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMWeeklyAttackPlan=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(rosterDoctor,lineupOptimizer,waiverAssassin,tradeHunter,opponentExploiter,playerStatus){
'use strict';
const text=v=>v==null?'':String(v).trim();
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const round=(v,d=1)=>{const p=10**d;return Math.round((num(v)+Number.EPSILON)*p)/p;};
function urgentStatuses(snapshot,roster){const stale=text(snapshot?.freshness?.status).toLowerCase()!=='fresh';const alerts=[];for(const id of roster?.playerIds||[]){const s=playerStatus.normalizePlayerStatus(snapshot?.playerStatuses?.[id]||{});if(['ACTIVE','UNKNOWN'].includes(s.category))continue;const r=playerStatus.statusRisk(s,snapshot?.freshness||{});alerts.push(Object.freeze({playerId:text(id),status:s.category,label:s.label,stale:r.stale||stale,risk:r.risk,confidence:round(r.confidenceMultiplier*100)}));}return alerts.sort((a,b)=>b.risk-a.risk||a.playerId.localeCompare(b.playerId));}
function buildWeeklyAttackPlan(snapshot,rosterId,playerValues){
  const id=text(rosterId||snapshot?.myRosterId);const roster=(snapshot?.rosters||[]).find(r=>text(r.rosterId)===id);if(!roster)throw new Error(`Weekly Attack Plan could not find roster ${id||'(blank)'}`);
  const rosterReport=rosterDoctor.evaluateRoster(snapshot,id,playerValues);
  const lineup=lineupOptimizer.optimizeLineup(snapshot,id,playerValues);
  const waivers=waiverAssassin.rankWaiverMoves(snapshot,id,playerValues,{rosterReport,lineup});
  const trades=tradeHunter.findTradeOpportunities(snapshot,id,playerValues);
  let opponent=null;try{opponent=opponentExploiter.analyzeOpponent(snapshot,id,playerValues);}catch(_){opponent=null;}
  const alerts=urgentStatuses(snapshot,roster);const weakness=rosterReport.weaknesses?.[0]||null;const waiverMove=waivers[0]||null;const tradeOpportunity=trades[0]||null;
  const freshness=text(snapshot?.freshness?.status).toLowerCase()||'unknown';const stale=freshness!=='fresh';const confidence=round(Math.max(25,Math.min(100,95-(stale?30:0)-alerts.filter(a=>a.stale).length*4)));const baseRisk=stale?0.4:0.12;
  const actions=[];
  const lineupChanges=lineup.decisions.filter(d=>d.action==='START'&&d.expectedEdge>0).sort((a,b)=>b.expectedEdge-a.expectedEdge);
  if(lineupChanges[0])actions.push(Object.freeze({type:'LINEUP',priority:100,confidence:Math.min(confidence,num(lineupChanges[0].confidence,confidence)),risk:round(Math.max(baseRisk,num(lineupChanges[0].risk)),2),reason:lineupChanges[0].reason,playerId:lineupChanges[0].playerId}));
  if(waiverMove)actions.push(Object.freeze({type:'WAIVER',priority:round(90+Math.min(10,waiverMove.priority)),confidence:Math.min(confidence,num(waiverMove.confidence,confidence)),risk:round(Math.max(baseRisk,num(waiverMove.risk)),2),reason:waiverMove.reason,addPlayerId:waiverMove.addPlayerId,dropPlayerId:waiverMove.dropPlayerId}));
  if(opponent?.actions?.[0])actions.push(Object.freeze({type:'OPPONENT',priority:85,confidence:Math.min(confidence,num(opponent.actions[0].confidence,confidence)),risk:round(Math.max(baseRisk,num(opponent.actions[0].risk)),2),reason:opponent.actions[0].reason,position:opponent.actions[0].position}));
  if(tradeOpportunity)actions.push(Object.freeze({type:'TRADE',priority:75,confidence:Math.min(confidence,num(tradeOpportunity.confidence,confidence)),risk:round(Math.max(baseRisk,num(tradeOpportunity.risk)),2),reason:tradeOpportunity.reason,givePlayerIds:tradeOpportunity.givePlayerIds,getPlayerIds:tradeOpportunity.getPlayerIds}));
  for(const alert of alerts.slice(0,3))actions.push(Object.freeze({type:'STATUS',priority:alert.status==='OUT'||alert.status==='IR'||alert.status==='PUP'?98:88,confidence:Math.min(confidence,alert.confidence),risk:round(Math.max(baseRisk,alert.risk),2),reason:`${alert.playerId} is ${alert.label}; verify availability before lineup lock and keep the best legal fallback ready.`,playerId:alert.playerId,status:alert.status}));
  actions.sort((a,b)=>b.priority-a.priority||b.confidence-a.confidence);
  return Object.freeze({week:num(snapshot?.week),rosterId:id,rosterGrade:rosterReport.overallGrade,biggestWeakness:weakness,lineup,waiverMove,tradeOpportunity,opponent,urgentStatusAlerts:Object.freeze(alerts),actions:Object.freeze(actions),freshness:Object.freeze({...snapshot.freshness}),confidence,risk:round(Math.min(1,baseRisk+(alerts.length*0.04)),2)});
}
return{buildWeeklyAttackPlan};
});
