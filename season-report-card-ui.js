(() => {
  'use strict';

  const TAB='Weekly Team Report Card';

  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function num(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback}
  function round(value,digits=1){const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p}
  function toneForRisk(risk){return num(risk)>=.7?'danger':num(risk)>=.4?'warn':'good'}

  function playerValues(){
    const list=(typeof state!=='undefined'&&Array.isArray(state.players))?state.players:[];
    const values={};
    for(const p of list){
      const m=p.metrics||{};
      const value=round(num(m.production)*.34+num(m.opportunity)*.26+num(m.ceiling)*.16+num(m.consistency)*.10+num(m.availability)*.08+num(m.trend)*.06,1);
      const baseline=num(p.avgPoints);
      const trendAdj=(num(m.trend,50)-50)/250;
      const forecast=baseline>0?Math.max(0,baseline*(1+trendAdj)+(num(p.ceiling)-baseline)*.12):Math.max(0,value/6);
      values[p.id]={id:p.id,name:p.name,position:p.position,team:p.team,status:p.status,value,projection:round(forecast,1),marketValue:value,restOfSeasonValue:value,byeWeek:p.byeWeek||null,games:p.games,floor:p.floor,ceiling:p.ceiling,yearsExp:p.yearsExp,rookie:p.rookie,metrics:p.metrics||{}};
    }
    return values;
  }

  function ensureStyles(){
    if(document.getElementById('weeklyReportCardStyles'))return;
    const style=document.createElement('style');
    style.id='weeklyReportCardStyles';
    style.textContent=`
      .report-grade-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .report-grade{border:1px solid var(--line);border-radius:12px;padding:10px;background:#08120d;min-width:0}
      .report-grade b{display:block;font-size:17px}.report-grade span{font-size:9px;color:var(--muted);font-weight:900;letter-spacing:.06em}
      .report-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:9px}
      .report-summary-grid .season-card{margin-top:0}
      @media(max-width:700px){.report-grade-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.report-summary-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function gradeHtml(label,value){
    return `<div class="report-grade"><b>${value===null||value===undefined?'—':esc(value)}</b><span>${esc(label)}</span></div>`;
  }

  function summaryHtml(label,card){
    if(!card)return'';
    return `<div class="season-card season-action" data-tone="${toneForRisk(card.risk)}"><div class="season-kicker">${esc(label)}</div><div class="season-title">${esc(card.headline||card.label||label)}</div><div class="season-meta">${esc(card.summary||'No additional detail available.')}</div><span class="season-pill">${esc(card.confidence)}% confidence</span><span class="season-pill">Risk ${esc(round(num(card.risk)*100))}%</span><span class="season-pill">${esc(card.freshness||'UNKNOWN')} data</span></div>`;
  }

  function renderReport(snapshot){
    const panel=document.getElementById('seasonPanel');
    const badge=document.getElementById('seasonFreshness');
    if(!panel||!badge)return;
    if(!snapshot){
      badge.textContent='WAITING';
      badge.dataset.tone='warn';
      panel.innerHTML='<div class="season-empty">Connect a supported fantasy league to build your Weekly Team Report Card.</div>';
      return;
    }
    if(!window.FFMWeeklyReportCard?.buildWeeklyReportCard||!window.FFMWeeklyAttackPlan?.buildWeeklyAttackPlan){
      badge.textContent='INITIALIZING';
      badge.dataset.tone='warn';
      panel.innerHTML='<div class="season-empty">Weekly Team Report Card is initializing.</div>';
      return;
    }
    const values=playerValues();
    let plan,report;
    try{
      plan=window.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,snapshot.myRosterId,values);
      report=window.FFMWeeklyReportCard.buildWeeklyReportCard(snapshot,snapshot.myRosterId,values,{attackPlan:plan});
    }catch(error){
      badge.textContent='NEEDS DATA';
      badge.dataset.tone='warn';
      panel.innerHTML=`<div class="season-empty">Weekly Team Report Card needs more league/player data: ${esc(error?.message||error)}</div>`;
      return;
    }

    badge.textContent=`${report.freshness} · ${report.confidence}% CONF`;
    badge.dataset.tone=report.freshness==='FRESH'?'good':report.freshness==='STALE'?'warn':'danger';

    const grades=report.grades||{};
    const cards=report.cards||{};
    const playerToSell=cards.playerToSell;
    const playerToBuy=cards.playerToBuy;
    const summaries=[
      ['BEST MOVE',cards.bestMove],
      ['BIGGEST RISK',cards.biggestRisk],
      ['BIGGEST OPPORTUNITY',cards.biggestOpportunity],
      ['PLAYER TO SELL',playerToSell],
      ['PLAYER TO BUY',playerToBuy],
      ['WAIVER PRIORITY',cards.waiverPriority],
      ['NEXT ACTION',cards.nextAction]
    ].map(([label,card])=>summaryHtml(label,card)).filter(Boolean).join('');

    panel.innerHTML=`<div class="season-card"><div class="season-kicker">WEEKLY TEAM REPORT CARD · WEEK ${esc(report.week)}</div><div class="season-title">Overall ${esc(grades.OVERALL??'—')}/100</div><div class="season-meta">One decision view built from your synced roster, Weekly Attack Plan, health, waiver, trade and lineup intelligence. Recommendations only.</div><div class="report-grade-grid" style="margin-top:10px">${gradeHtml('QB',grades.QB)}${gradeHtml('RB',grades.RB)}${gradeHtml('WR',grades.WR)}${gradeHtml('TE',grades.TE)}${gradeHtml('FLEX',grades.FLEX)}${gradeHtml('BENCH',grades.BENCH)}${gradeHtml('OVERALL',grades.OVERALL)}</div><span class="season-pill">${esc(report.confidence)}% confidence</span><span class="season-pill">Risk ${esc(round(report.risk*100))}%</span><span class="season-pill">${esc(report.freshness)} freshness</span></div><div class="report-summary-grid">${summaries}</div>`;
  }

  function selectReportTab(){
    const tabs=document.getElementById('seasonTabs');
    if(!tabs)return false;
    let button=tabs.querySelector(`[data-season-tab="${TAB}"]`);
    if(!button){
      button=document.createElement('button');
      button.className='season-tab';
      button.dataset.seasonTab=TAB;
      button.textContent=TAB;
      tabs.prepend(button);
    }
    tabs.querySelectorAll('.season-tab').forEach(tab=>tab.classList.toggle('active',tab===button));
    return true;
  }

  function install(){
    ensureStyles();
    const tabs=document.getElementById('seasonTabs');
    if(!tabs)return;
    selectReportTab();
    tabs.addEventListener('click',event=>{
      const button=event.target.closest('[data-season-tab]');
      if(!button||button.dataset.seasonTab!==TAB)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      tabs.querySelectorAll('.season-tab').forEach(tab=>tab.classList.toggle('active',tab===button));
      renderReport(window.ffmLeagueSnapshot);
    },true);
    renderReport(window.ffmLeagueSnapshot);
  }

  window.addEventListener('ffm:league-snapshot',event=>{
    const active=document.querySelector('.season-tab.active')?.dataset.seasonTab;
    if(active===TAB)renderReport(event.detail);
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();