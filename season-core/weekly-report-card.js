(function(root,factory){
  const rosterDoctor=typeof module==='object'&&module.exports?require('./roster-doctor'):root.FFMRosterDoctor;
  const weeklyAttackPlan=typeof module==='object'&&module.exports?require('./weekly-attack-plan'):root.FFMWeeklyAttackPlan;
  const api=factory(rosterDoctor,weeklyAttackPlan);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMWeeklyReportCard=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(rosterDoctor,weeklyAttackPlan){
'use strict';

const text=value=>value==null?'':String(value).trim();
const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,num(value,min)));
const round=(value,digits=1)=>{const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p;};
const freshnessOf=snapshot=>text(snapshot?.freshness?.status||'unknown').toUpperCase();

function valueMap(playerValues){
  if(Array.isArray(playerValues))return new Map(playerValues.map(player=>[text(player?.id||player?.playerId),player]).filter(([id])=>id));
  return new Map(Object.entries(playerValues&&typeof playerValues==='object'?playerValues:{}));
}

function flexGrade(report){
  const slots=Array.isArray(report?.demand?.flexible)?report.demand.flexible:[];
  let weighted=0,total=0;
  for(const slot of slots){
    const count=Math.max(0,num(slot?.count));
    const grades=(slot?.eligiblePositions||[]).map(position=>report?.positionalGrades?.[position]).filter(Number.isFinite);
    if(!count||!grades.length)continue;
    weighted+=(grades.reduce((sum,grade)=>sum+grade,0)/grades.length)*count;
    total+=count;
  }
  return total?round(clamp(weighted/total),1):null;
}

function playerName(id,values){return text(values.get(text(id))?.name)||text(id)||'Unknown player';}

function card(base,freshness,defaultConfidence,defaultRisk){
  if(!base)return null;
  return Object.freeze({
    ...base,
    confidence:round(clamp(base.confidence??defaultConfidence),1),
    risk:round(Math.max(0,Math.min(1,num(base.risk,defaultRisk))),2),
    freshness
  });
}

function actionCard(action,label,values,freshness,defaultConfidence,defaultRisk){
  if(!action)return null;
  const type=text(action.type||action.actionType||'ACTION').toUpperCase();
  let headline=type;
  if(type==='WAIVER')headline=`Add ${playerName(action.addPlayerId,values)}${action.dropPlayerId?` · drop ${playerName(action.dropPlayerId,values)}`:''}`;
  else if(type==='TRADE')headline=`Trade ${(action.givePlayerIds||[]).map(id=>playerName(id,values)).join(', ')} for ${(action.getPlayerIds||[]).map(id=>playerName(id,values)).join(', ')}`;
  else if(type==='STATUS')headline=`${playerName(action.playerId,values)} · ${text(action.status)||'status risk'}`;
  else if(type==='LINEUP')headline=`Start ${playerName(action.playerId,values)}`;
  else if(action.position)headline=`Attack ${text(action.position).toUpperCase()}`;
  return card({
    type,label,headline,summary:text(action.reason)||headline,
    priority:round(action.priority,1),expectedEdge:Number.isFinite(Number(action.expectedEdge))?round(action.expectedEdge,2):null,
    playerId:text(action.playerId)||null,addPlayerId:text(action.addPlayerId)||null,dropPlayerId:text(action.dropPlayerId)||null,
    givePlayerIds:Object.freeze([...(action.givePlayerIds||[])]),getPlayerIds:Object.freeze([...(action.getPlayerIds||[])]),
    affectedPlayerIds:Object.freeze([action.playerId,action.addPlayerId,action.dropPlayerId,...(action.givePlayerIds||[]),...(action.getPlayerIds||[])].map(text).filter(Boolean)),
    reasons:Object.freeze(text(action.reason)?[text(action.reason)]:[]),risks:Object.freeze([]),confidence:action.confidence,risk:action.risk
  },freshness,defaultConfidence,defaultRisk);
}

function waiverCard(move,values,freshness,defaultConfidence,defaultRisk){
  if(!move)return null;
  return card({
    type:'WAIVER',label:'Waiver Priority',headline:`Add ${playerName(move.addPlayerId,values)}${move.dropPlayerId?` · drop ${playerName(move.dropPlayerId,values)}`:''}`,
    summary:text(move.reason)||'Best available waiver improvement.',priority:round(move.priority,1),
    addPlayerId:text(move.addPlayerId)||null,dropPlayerId:text(move.dropPlayerId)||null,
    affectedPlayerIds:Object.freeze([move.addPlayerId,move.dropPlayerId].map(text).filter(Boolean)),
    reasons:Object.freeze(text(move.reason)?[text(move.reason)]:[]),risks:Object.freeze([]),
    confidence:move.confidence,risk:move.risk,faab:move.faab?Object.freeze({...move.faab}):null
  },freshness,defaultConfidence,defaultRisk);
}

function tradeSignalCard(opportunity,signal,side,values,freshness,defaultConfidence,defaultRisk){
  if(!opportunity||!(opportunity.signals||[]).includes(signal))return null;
  const ids=side==='sell'?(opportunity.givePlayerIds||[]):(opportunity.getPlayerIds||[]);
  const playerId=text(ids[0]);
  if(!playerId)return null;
  const label=side==='sell'?'Player to Sell':'Player to Buy';
  return card({
    type:signal,label,headline:playerName(playerId,values),summary:text(opportunity.reason)||`${label} signal from Trade Hunter.`,
    playerId,expectedEdge:Number.isFinite(Number(opportunity.expectedImprovement))?round(opportunity.expectedImprovement,2):null,
    affectedPlayerIds:Object.freeze([playerId]),reasons:Object.freeze(text(opportunity.reason)?[text(opportunity.reason)]:[]),risks:Object.freeze([]),
    confidence:opportunity.confidence,risk:opportunity.risk
  },freshness,defaultConfidence,defaultRisk);
}

function fallbackRisk(report,values,freshness,defaultConfidence,defaultRisk){
  const weakness=report?.weaknesses?.[0]||null;
  const healthIds=report?.healthRisk?.flaggedPlayerIds||[];
  if(healthIds.length){
    const playerId=text(healthIds[0]);
    return card({type:'ROSTER_HEALTH',label:'Biggest Risk',headline:`Health risk · ${playerName(playerId,values)}`,summary:'Roster Doctor detected a health-related roster risk.',playerId,affectedPlayerIds:Object.freeze([playerId]),reasons:Object.freeze(['Roster Doctor detected a flagged player status.']),risks:Object.freeze(['Player availability may reduce lineup strength.']),risk:Math.max(defaultRisk,num(report.healthRisk?.score)/100)},freshness,defaultConfidence,defaultRisk);
  }
  if(weakness)return card({type:'ROSTER',label:'Biggest Risk',headline:`${weakness.position} · ${weakness.grade}/100`,summary:text(weakness.reason),position:weakness.position,affectedPlayerIds:Object.freeze([]),reasons:Object.freeze([text(weakness.reason)]),risks:Object.freeze([`${weakness.position} is the roster's weakest graded position.`]),risk:Math.max(defaultRisk,(100-num(weakness.grade))/100)},freshness,defaultConfidence,defaultRisk);
  return card({type:'ROSTER',label:'Biggest Risk',headline:'No major roster weakness detected',summary:'Keep monitoring health, byes, and lineup locks.',affectedPlayerIds:Object.freeze([]),reasons:Object.freeze(['Roster Doctor found no sub-70 positional weakness.']),risks:Object.freeze([]),risk:defaultRisk},freshness,defaultConfidence,defaultRisk);
}

function buildWeeklyReportCard(snapshot,rosterId,playerValues,options={}){
  if(!snapshot||typeof snapshot!=='object')throw new Error('Weekly Team Report Card requires a LeagueSnapshot');
  const id=text(rosterId||snapshot.myRosterId);
  const values=valueMap(playerValues);
  const report=rosterDoctor.evaluateRoster(snapshot,id,playerValues);
  let plan=options.attackPlan||null;
  const missingSources=[];
  if(!plan&&!options.disableAttackPlan&&weeklyAttackPlan?.buildWeeklyAttackPlan){
    try{plan=weeklyAttackPlan.buildWeeklyAttackPlan(snapshot,id,playerValues);}catch(_){plan=null;}
  }
  if(!plan)missingSources.push('weekly-attack-plan');

  const freshness=freshnessOf(snapshot);
  const planFreshness=text(plan?.freshness?.status).toUpperCase();
  const effectiveFreshness=planFreshness&&planFreshness!=='UNKNOWN'?planFreshness:freshness;
  const stale=effectiveFreshness!=='FRESH';
  const baseConfidence=round(clamp(plan?.confidence??(stale?60:88))-(stale?20:0),1);
  const baseRisk=round(Math.max(num(plan?.risk,0),num(report.healthRisk?.score)/100,num(report.byeRisk?.score)/100,stale?.35:.1),2);

  const positional=report.positionalGrades||{};
  const grades=Object.freeze({
    QB:Number.isFinite(positional.QB)?round(clamp(positional.QB),1):null,
    RB:Number.isFinite(positional.RB)?round(clamp(positional.RB),1):null,
    WR:Number.isFinite(positional.WR)?round(clamp(positional.WR),1):null,
    TE:Number.isFinite(positional.TE)?round(clamp(positional.TE),1):null,
    FLEX:flexGrade(report),
    BENCH:round(clamp(report?.benchDepth?.score),1),
    OVERALL:round(clamp(report.overallGrade),1)
  });

  const actions=(plan?.actions||[]).slice().sort((a,b)=>num(b.priority)-num(a.priority)||num(b.confidence)-num(a.confidence));
  const statusActions=actions.filter(action=>text(action.type).toUpperCase()==='STATUS').sort((a,b)=>num(b.priority)-num(a.priority)||num(b.risk)-num(a.risk));
  const next=statusActions[0]||actions[0]||null;
  const best=actions[0]||null;
  const riskAction=statusActions[0]||actions.slice().sort((a,b)=>num(b.risk)-num(a.risk)||num(b.priority)-num(a.priority))[0]||null;
  const waiver=waiverCard(plan?.waiverMove,values,effectiveFreshness,baseConfidence,baseRisk);
  const trade=plan?.tradeOpportunity||null;

  const cards=Object.freeze({
    bestMove:best?actionCard(best,'Best Move',values,effectiveFreshness,baseConfidence,baseRisk):fallbackRisk(report,values,effectiveFreshness,baseConfidence,baseRisk),
    biggestRisk:riskAction?actionCard(riskAction,'Biggest Risk',values,effectiveFreshness,baseConfidence,baseRisk):fallbackRisk(report,values,effectiveFreshness,baseConfidence,baseRisk),
    biggestOpportunity:waiver||trade? (waiver||actionCard({...trade,type:'TRADE'},'Biggest Opportunity',values,effectiveFreshness,baseConfidence,baseRisk)) : null,
    playerToSell:tradeSignalCard(trade,'SELL_HIGH','sell',values,effectiveFreshness,baseConfidence,baseRisk),
    playerToBuy:tradeSignalCard(trade,'BUY_LOW','buy',values,effectiveFreshness,baseConfidence,baseRisk),
    waiverPriority:waiver,
    nextAction:next?actionCard(next,'Next Action',values,effectiveFreshness,baseConfidence,baseRisk):fallbackRisk(report,values,effectiveFreshness,baseConfidence,baseRisk)
  });

  return Object.freeze({
    week:num(snapshot.week),rosterId:id,grades,cards,
    confidence:baseConfidence,risk:baseRisk,freshness:effectiveFreshness,
    degraded:missingSources.length>0||effectiveFreshness!=='FRESH',
    missingSources:Object.freeze(missingSources),
    source:'weekly-team-report-card'
  });
}

return{buildWeeklyReportCard};
});
