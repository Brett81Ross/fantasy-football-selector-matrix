(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMUIPerformance=api;
  if(root&&root.document){
    api.installDraftScoreCache(root);
    api.installRenderFastPath(root);
    root.__FFM_UI_PERF_READY__=api.installSeasonFastPath(root);
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,num(value,min)));
  const text=value=>value==null?'':String(value).trim();
  const round=(value,digits=1)=>{const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p;};

  function appState(root){
    if(root&&root.state)return root.state;
    try{if(typeof state!=='undefined')return state;}catch(_){}
    return null;
  }

  function installDraftScoreCache(root){
    if(!root||root.__FFM_DRAFT_SCORE_CACHE__)return root?.__FFM_DRAFT_SCORE_CACHE__||{installed:false,stats:{scarcityBuilds:0,matrixComputations:0}};
    const stats={scarcityBuilds:0,matrixComputations:0};
    let playersRef=null,draftedRef=null,draftedSize=-1,teams=null,risk=null;
    let scarcityReady=false;
    const scarcityScores=new Map();
    const positionCounts=new Map();
    const matrixScores=new Map();

    function current(){
      const s=appState(root);
      if(!s||!Array.isArray(s.players))return null;
      const size=s.drafted instanceof Set?s.drafted.size:0;
      if(s.players!==playersRef||s.drafted!==draftedRef||size!==draftedSize||num(s.teams,12)!==teams||text(s.risk)!==risk){
        playersRef=s.players;draftedRef=s.drafted;draftedSize=size;teams=num(s.teams,12);risk=text(s.risk);
        scarcityReady=false;scarcityScores.clear();positionCounts.clear();matrixScores.clear();
      }
      return s;
    }

    function buildScarcity(){
      const s=current();if(!s)return;
      const groups=new Map();
      for(const player of s.players){
        if(s.drafted instanceof Set&&s.drafted.has(player.id))continue;
        const position=text(player.position).toUpperCase();
        if(!groups.has(position))groups.set(position,[]);
        groups.get(position).push(player);
      }
      const quality=player=>num(player?.metrics?.production)*.55+num(player?.metrics?.opportunity)*.25+num(player?.metrics?.ceiling)*.2;
      for(const [position,list] of groups){
        list.sort((a,b)=>quality(b)-quality(a));
        positionCounts.set(position,list.length);
        const replacement=position==='QB'||position==='TE'?Math.max(1,num(s.teams,12)):Math.max(1,num(s.teams,12)*2);
        list.forEach((player,index)=>scarcityScores.set(player.id,clamp(100-(index/replacement)*55)));
      }
      scarcityReady=true;stats.scarcityBuilds++;
    }

    function scarcityScore(player){
      current();if(!scarcityReady)buildScarcity();
      const position=text(player?.position).toUpperCase();
      if(!positionCounts.get(position))return 50;
      return scarcityScores.has(player?.id)?scarcityScores.get(player.id):100;
    }

    function matrixScore(player,roundValue,includeScarcity=true){
      const s=current();
      if(!s||!player)return 0;
      const roundNumber=Number.isFinite(Number(roundValue))?Number(roundValue):num(root.document?.getElementById?.('round')?.value,1);
      const key=`${text(player.id)}|${roundNumber}|${includeScarcity!==false?'1':'0'}`;
      if(matrixScores.has(key))return matrixScores.get(key);
      const m=player.metrics||{};
      const w=typeof root.weightsFor==='function'?root.weightsFor(roundNumber):{production:.25,opportunity:.20,consistency:.12,ceiling:.17,trend:.10,scarcity:.10,availability:.06};
      const scarcity=includeScarcity!==false?scarcityScore(player):50;
      let score=num(m.production)*num(w.production)+num(m.opportunity)*num(w.opportunity)+num(m.consistency)*num(w.consistency)+num(m.ceiling)*num(w.ceiling)+num(m.trend)*num(w.trend)+scarcity*num(w.scarcity)+num(m.availability)*num(w.availability);
      if(player.rookie&&num(player.games)===0)score=Math.max(score,num(player.draftBase));
      if(player.status&&player.status!=='ACT')score-=String(player.status).toUpperCase()==='PUP'?6:3;
      const result=Math.round(clamp(score));
      matrixScores.set(key,result);stats.matrixComputations++;
      return result;
    }

    root.scarcityScore=scarcityScore;
    root.matrixScore=matrixScore;
    const installed={installed:true,stats,invalidate(){playersRef=null;current();}};
    root.__FFM_DRAFT_SCORE_CACHE__=installed;
    return installed;
  }

  function installRenderFastPath(root){
    if(!root)return{installed:false,stats:{partialRenders:0,staticRenders:0}};
    if(root.__FFM_RENDER_FAST_PATH__)return root.__FFM_RENDER_FAST_PATH__;
    if(typeof root.renderAll!=='function')return{installed:false,stats:{partialRenders:0,staticRenders:0}};

    const stats={partialRenders:0,staticRenders:0};
    const initial=appState(root);
    let playersRef=Array.isArray(initial?.players)?initial.players:null;

    function renderAll(){
      const s=appState(root);
      const datasetChanged=Array.isArray(s?.players)&&s.players!==playersRef;
      if(typeof root.renderDraftPick==='function')root.renderDraftPick();
      if(typeof root.renderDraftList==='function')root.renderDraftList();
      if(typeof root.renderCompareTray==='function')root.renderCompareTray();
      if(datasetChanged){
        playersRef=s.players;
        if(typeof root.renderWaivers==='function')root.renderWaivers();
        if(typeof root.populateSelects==='function')root.populateSelects();
        stats.staticRenders++;
      }
      stats.partialRenders++;
    }

    root.renderAll=renderAll;
    const installed={installed:true,stats,invalidateStatic(){playersRef=null;}};
    root.__FFM_RENDER_FAST_PATH__=installed;
    return installed;
  }

  function installSeasonFastPath(root){
    const weekly=root?.FFMWeeklyAttackPlan;
    if(!weekly?.buildWeeklyAttackPlan)return false;
    if(weekly.__uiPerformanceWrapped)return true;
    const original=weekly.buildWeeklyAttackPlan.bind(weekly);
    let snapshotRef=null,stamp='',rosterKey='',cache={};

    function activeTab(){return text(root.document?.querySelector?.('.season-tab.active')?.dataset?.seasonTab);}
    function dataStamp(snapshot){
      const s=appState(root);
      return text(s?.dataMeta?.generatedAt||root.__FFM_LAST_LIVE_UPDATE__||snapshot?.freshness?.asOf||snapshot?.generatedAt||snapshot?.week);
    }
    function context(snapshot,rosterId){
      const nextStamp=dataStamp(snapshot),nextRoster=text(rosterId||snapshot?.myRosterId);
      if(snapshot!==snapshotRef||nextStamp!==stamp||nextRoster!==rosterKey){snapshotRef=snapshot;stamp=nextStamp;rosterKey=nextRoster;cache={};}
      return cache;
    }
    function roster(snapshot,rosterId){const id=text(rosterId||snapshot?.myRosterId);return(snapshot?.rosters||[]).find(r=>text(r?.rosterId)===id)||null;}
    function alerts(snapshot,rosterId){
      const c=context(snapshot,rosterId);if(c.alerts)return c.alerts;
      const stale=text(snapshot?.freshness?.status).toLowerCase()!=='fresh',out=[];
      for(const id of roster(snapshot,rosterId)?.playerIds||[]){
        if(!root.FFMPlayerStatus?.normalizePlayerStatus||!root.FFMPlayerStatus?.statusRisk)break;
        const status=root.FFMPlayerStatus.normalizePlayerStatus(snapshot?.playerStatuses?.[id]||{});
        if(['ACTIVE','UNKNOWN'].includes(status.category))continue;
        const risk=root.FFMPlayerStatus.statusRisk(status,snapshot?.freshness||{});
        out.push({playerId:text(id),status:status.category,label:status.label,stale:risk.stale||stale,risk:risk.risk,confidence:round(num(risk.confidenceMultiplier,1)*100)});
      }
      out.sort((a,b)=>num(b.risk)-num(a.risk)||a.playerId.localeCompare(b.playerId));
      return c.alerts=out;
    }
    function base(snapshot,rosterId){
      const c=context(snapshot,rosterId);if(c.base)return c.base;
      const urgent=alerts(snapshot,rosterId),freshness={...(snapshot?.freshness||{status:'unknown',asOf:null,source:null})};
      const stale=text(freshness.status).toLowerCase()!=='fresh';
      const confidence=round(Math.max(25,Math.min(100,95-(stale?30:0)-urgent.filter(a=>a.stale).length*4)));
      const risk=round(Math.min(1,(stale?.4:.12)+(urgent.length*.04)),2);
      return c.base={week:num(snapshot?.week),rosterId:text(rosterId||snapshot?.myRosterId),rosterGrade:null,biggestWeakness:null,lineup:null,waiverMove:null,tradeOpportunity:null,opponent:null,urgentStatusAlerts:urgent,actions:[],freshness,confidence,risk};
    }
    function report(snapshot,rosterId,values){
      const c=context(snapshot,rosterId);if(c.report)return c.report;
      return c.report=root.FFMRosterDoctor?.evaluateRoster?root.FFMRosterDoctor.evaluateRoster(snapshot,text(rosterId||snapshot?.myRosterId),values):null;
    }
    function lineup(snapshot,rosterId,values){
      const c=context(snapshot,rosterId);if(c.lineup)return c.lineup;
      return c.lineup=root.FFMLineupOptimizer?.optimizeLineup?root.FFMLineupOptimizer.optimizeLineup(snapshot,text(rosterId||snapshot?.myRosterId),values):null;
    }
    function lightPlan(snapshot,rosterId,values,tab){
      const c=context(snapshot,rosterId);
      if(c.full)return c.full;
      const plan={...base(snapshot,rosterId)};
      if(tab==='Command Center'||tab==='Playoff Path'||tab==='What-If Matrix')return plan;
      if(tab==='Roster Doctor'){
        const r=report(snapshot,rosterId,values),l=lineup(snapshot,rosterId,values);
        return {...plan,rosterGrade:r?.overallGrade??null,biggestWeakness:r?.weaknesses?.[0]||null,lineup:l};
      }
      if(tab==='Waiver Assassin'){
        const r=report(snapshot,rosterId,values),l=lineup(snapshot,rosterId,values);
        if(!Object.prototype.hasOwnProperty.call(c,'waivers'))c.waivers=root.FFMWaiverAssassin?.rankWaiverMoves?root.FFMWaiverAssassin.rankWaiverMoves(snapshot,text(rosterId||snapshot?.myRosterId),values,{rosterReport:r,lineup:l}):[];
        return {...plan,rosterGrade:r?.overallGrade??null,biggestWeakness:r?.weaknesses?.[0]||null,lineup:l,waiverMove:c.waivers?.[0]||null};
      }
      if(tab==='Trade Hunter'){
        if(!Object.prototype.hasOwnProperty.call(c,'trades'))c.trades=root.FFMTradeHunter?.findTradeOpportunities?root.FFMTradeHunter.findTradeOpportunities(snapshot,text(rosterId||snapshot?.myRosterId),values):[];
        return {...plan,tradeOpportunity:c.trades?.[0]||null};
      }
      if(tab==='Opponent Exploiter'){
        if(!Object.prototype.hasOwnProperty.call(c,'opponent')){try{c.opponent=root.FFMOpponentExploiter?.analyzeOpponent?root.FFMOpponentExploiter.analyzeOpponent(snapshot,text(rosterId||snapshot?.myRosterId),values):null;}catch(_){c.opponent=null;}}
        return {...plan,opponent:c.opponent};
      }
      if(tab==='Player Status')return plan;
      return null;
    }

    function wrapped(snapshot,rosterId,values){
      const tab=activeTab();
      const lightweight=new Set(['Command Center','Roster Doctor','Waiver Assassin','Trade Hunter','What-If Matrix','Playoff Path','Opponent Exploiter','Player Status']);
      if(lightweight.has(tab))return lightPlan(snapshot,rosterId,values,tab);
      const c=context(snapshot,rosterId);
      if(!c.full)c.full=original(snapshot,rosterId,values);
      return c.full;
    }
    Object.defineProperty(wrapped,'__uiPerformanceWrapped',{value:true});
    root.FFMWeeklyAttackPlan={...weekly,buildWeeklyAttackPlan:wrapped,__uiPerformanceWrapped:true};
    return true;
  }

  return{installDraftScoreCache,installRenderFastPath,installSeasonFastPath};
});
