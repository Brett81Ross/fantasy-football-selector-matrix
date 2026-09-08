(() => {
  'use strict';

  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
  function round(v,d=1){const p=10**d;return Math.round((num(v)+Number.EPSILON)*p)/p}
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
      values[p.id]={id:p.id,name:p.name,position:p.position,team:p.team,value,projection:round(forecast,1),marketValue:value,restOfSeasonValue:value,byeWeek:p.byeWeek||null};
    }
    return values;
  }

  function getPlayerName(id,values){return values?.[id]?.name||id||'—'}

  function mount(){
    if(document.getElementById('seasonIntel'))return;
    const wrap=document.createElement('section');
    wrap.id='seasonIntel';
    wrap.className='season-intel';
    wrap.innerHTML=`<style>
      .season-intel{margin:18px 0 24px;border:1px solid rgba(57,255,20,.26);border-radius:18px;background:linear-gradient(180deg,#08130d,#07100b);overflow:hidden;box-shadow:0 18px 46px rgba(0,0,0,.25)}
      .season-intel-head{padding:16px 16px 10px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.season-intel-head h3{margin:0;font-size:17px}.season-intel-head p{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.45}.season-badge{font-size:9px;font-weight:950;letter-spacing:.08em;border:1px solid var(--line);border-radius:999px;padding:6px 9px;white-space:nowrap}.season-badge[data-tone="good"]{color:var(--accent);border-color:rgba(57,255,20,.35)}.season-badge[data-tone="warn"]{color:#ffd166}.season-badge[data-tone="danger"]{color:#ff6b6b}
      .season-tabs{display:flex;gap:7px;overflow-x:auto;padding:0 14px 12px;scrollbar-width:none}.season-tabs::-webkit-scrollbar{display:none}.season-tab{flex:0 0 auto;border:1px solid var(--line);background:#0b1710;color:var(--muted);height:34px;padding:0 12px;border-radius:999px;font-size:10px;font-weight:900}.season-tab.active{background:var(--accent);color:#041008;border-color:var(--accent)}
      .season-panel{padding:0 14px 16px}.season-card{border:1px solid var(--line);background:#0a1510;border-radius:14px;padding:12px;margin-top:9px}.season-kicker{font-size:9px;color:var(--accent);font-weight:950;letter-spacing:.12em}.season-title{font-size:14px;font-weight:950;margin-top:3px}.season-meta{font-size:10px;color:var(--muted);line-height:1.45;margin-top:5px}.season-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.season-stat{border:1px solid var(--line);border-radius:12px;padding:10px;background:#08120d}.season-stat b{display:block;font-size:16px}.season-stat span{font-size:9px;color:var(--muted)}.season-action{border-left:3px solid var(--accent);padding-left:10px}.season-action[data-tone="warn"]{border-color:#ffd166}.season-action[data-tone="danger"]{border-color:#ff6b6b}.season-empty{padding:18px 14px;color:var(--muted);font-size:11px}.season-list{display:grid;gap:8px}.season-pill{display:inline-block;font-size:9px;border:1px solid var(--line);border-radius:999px;padding:4px 7px;margin-right:5px;color:var(--muted)}
      @media(max-width:560px){.season-grid{grid-template-columns:1fr}.season-intel-head{align-items:flex-start}}
    </style><div class="season-intel-head"><div><h3>Season Intelligence</h3><p>Maximum Edge mode · recommendations only · no automatic roster moves</p></div><span id="seasonFreshness" class="season-badge">WAITING</span></div><div class="season-tabs" id="seasonTabs"></div><div class="season-panel" id="seasonPanel"><div class="season-empty">Connect a supported fantasy league to build your Weekly Attack Plan.</div></div>`;
    const footer=document.querySelector('footer');
    if(footer?.parentNode)footer.parentNode.insertBefore(wrap,footer);else document.body.appendChild(wrap);
    const tabs=['Weekly Attack Plan','Roster Doctor','Waiver Assassin','Trade Hunter','Opponent Exploiter','Player Status'];
    document.getElementById('seasonTabs').innerHTML=tabs.map((t,i)=>`<button class="season-tab${i===0?' active':''}" data-season-tab="${esc(t)}">${esc(t)}</button>`).join('');
    document.getElementById('seasonTabs').addEventListener('click',e=>{const b=e.target.closest('[data-season-tab]');if(!b)return;document.querySelectorAll('.season-tab').forEach(x=>x.classList.toggle('active',x===b));render(window.ffmLeagueSnapshot,b.dataset.seasonTab)});
  }

  function render(snapshot,tab='Weekly Attack Plan'){
    mount();
    const panel=document.getElementById('seasonPanel');
    const badge=document.getElementById('seasonFreshness');
    if(!snapshot){badge.textContent='WAITING';badge.dataset.tone='warn';panel.innerHTML='<div class="season-empty">Connect a supported fantasy league to build your Weekly Attack Plan.</div>';return}
    const values=playerValues();
    let plan;
    try{plan=window.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,snapshot.myRosterId,values)}catch(error){badge.textContent='NEEDS DATA';badge.dataset.tone='warn';panel.innerHTML=`<div class="season-empty">Season Intelligence needs more league/player data: ${esc(error?.message||error)}</div>`;return}
    const freshness=String(plan.freshness?.status||'unknown').toUpperCase();
    badge.textContent=`${freshness} · ${plan.confidence}% CONF`;
    badge.dataset.tone=plan.freshness?.status==='fresh'?'good':plan.freshness?.status==='stale'?'warn':'danger';
    if(tab==='Weekly Attack Plan')return renderWeekly(panel,plan,values);
    if(tab==='Roster Doctor')return renderRoster(panel,plan);
    if(tab==='Waiver Assassin')return renderWaiver(panel,plan,values);
    if(tab==='Trade Hunter')return renderTrade(panel,plan,values);
    if(tab==='Opponent Exploiter')return renderOpponent(panel,plan);
    return renderStatus(panel,plan,values);
  }

  function renderWeekly(panel,plan,values){
    const weakness=plan.biggestWeakness;
    panel.innerHTML=`<div class="season-grid"><div class="season-stat"><b>${esc(plan.rosterGrade)}</b><span>ROSTER GRADE</span></div><div class="season-stat"><b>${esc(plan.opponent?.projectedMargin??'—')}</b><span>PROJECTED MARGIN</span></div></div><div class="season-card"><div class="season-kicker">BIGGEST WEAKNESS</div><div class="season-title">${esc(weakness?`${weakness.position} · ${weakness.grade}/100`:'No major weakness detected')}</div><div class="season-meta">${esc(weakness?.reason||'Roster balance is currently acceptable relative to league demand.')}</div></div><div class="season-list">${plan.actions.slice(0,8).map(a=>`<div class="season-card season-action" data-tone="${toneForRisk(a.risk)}"><div class="season-kicker">${esc(a.type)} · ${esc(a.confidence)}% CONF · RISK ${esc(round(a.risk*100))}%</div><div class="season-title">${actionHeadline(a,values)}</div><div class="season-meta">${esc(a.reason)}</div></div>`).join('')}</div>`;
  }
  function actionHeadline(a,values){if(a.type==='WAIVER')return `ADD ${getPlayerName(a.addPlayerId,values)} → DROP ${getPlayerName(a.dropPlayerId,values)}`;if(a.type==='TRADE')return `GIVE ${(a.givePlayerIds||[]).map(id=>getPlayerName(id,values)).join(', ')} → GET ${(a.getPlayerIds||[]).map(id=>getPlayerName(id,values)).join(', ')}`;if(a.type==='STATUS')return `${getPlayerName(a.playerId,values)} · ${a.status}`;if(a.type==='LINEUP')return `START ${getPlayerName(a.playerId,values)}`;return a.position?`ATTACK ${a.position}`:a.type;}
  function renderRoster(panel,plan){const r=plan.lineup;const weakness=plan.biggestWeakness;panel.innerHTML=`<div class="season-card"><div class="season-kicker">ROSTER DOCTOR</div><div class="season-title">Grade ${esc(plan.rosterGrade)}/100</div><div class="season-meta">Biggest weakness: ${esc(weakness?`${weakness.position} (${weakness.grade}/100)`:'none flagged')}.</div></div><div class="season-card"><div class="season-kicker">OPTIMIZED LINEUP</div><div class="season-meta">${r.starters.map(s=>`${esc(s.slotType)}: <b>${esc(s.name)}</b> · ${esc(s.expectedPoints)} expected`).join('<br>')}</div></div>`;}
  function renderWaiver(panel,plan,values){const w=plan.waiverMove;if(!w){panel.innerHTML='<div class="season-empty">No waiver move currently clears the Maximum Edge threshold.</div>';return}panel.innerHTML=`<div class="season-card season-action" data-tone="${toneForRisk(w.risk)}"><div class="season-kicker">WAIVER ASSASSIN · PRIORITY ${esc(w.priority)}</div><div class="season-title">ADD ${esc(getPlayerName(w.addPlayerId,values))} → DROP ${esc(getPlayerName(w.dropPlayerId,values))}</div><div class="season-meta">${esc(w.reason)}</div><span class="season-pill">${esc(w.classification)}</span><span class="season-pill">${esc(w.confidence)}% confidence</span></div>`;}
  function renderTrade(panel,plan,values){const t=plan.tradeOpportunity;if(!t){panel.innerHTML='<div class="season-empty">No trade currently clears the complementary-needs threshold.</div>';return}panel.innerHTML=`<div class="season-card"><div class="season-kicker">TRADE HUNTER</div><div class="season-title">Give ${(t.givePlayerIds||[]).map(id=>esc(getPlayerName(id,values))).join(', ')} → Get ${(t.getPlayerIds||[]).map(id=>esc(getPlayerName(id,values))).join(', ')}</div><div class="season-meta">${esc(t.reason)}</div><span class="season-pill">+${esc(t.expectedImprovement)} expected improvement</span><span class="season-pill">${esc(t.confidence)}% confidence</span></div>`;}
  function renderOpponent(panel,plan){const o=plan.opponent;if(!o){panel.innerHTML='<div class="season-empty">Current-week opponent data is not available yet.</div>';return}panel.innerHTML=`<div class="season-card"><div class="season-kicker">OPPONENT EXPLOITER · WEEK ${esc(o.week)}</div><div class="season-title">Primary vulnerability: ${esc(o.primaryVulnerability?.position||'—')}</div><div class="season-meta">${esc(o.primaryVulnerability?.reason||'No clear vulnerability detected.')}</div></div><div class="season-card"><div class="season-kicker">POSITION EDGES</div><div class="season-meta">${o.positionEdges.map(e=>`${esc(e.position)}: ${e.edge>=0?'+':''}${esc(e.edge)}`).join(' · ')}</div></div>`;}
  function renderStatus(panel,plan,values){const alerts=plan.urgentStatusAlerts||[];if(!alerts.length){panel.innerHTML='<div class="season-empty">No IR, PUP, Questionable, Doubtful, or Out alerts on your roster.</div>';return}panel.innerHTML=`<div class="season-list">${alerts.map(a=>`<div class="season-card season-action" data-tone="${toneForRisk(a.risk)}"><div class="season-kicker">PLAYER STATUS · ${esc(a.status)}</div><div class="season-title">${esc(getPlayerName(a.playerId,values))}</div><div class="season-meta">Confidence ${esc(a.confidence)}% · Risk ${esc(round(a.risk*100))}%${a.stale?' · status data is stale':''}</div></div>`).join('')}</div>`;}

  function init(){mount();window.addEventListener('ffm:league-snapshot',e=>render(e.detail));if(window.ffmLeagueSnapshot)render(window.ffmLeagueSnapshot)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();