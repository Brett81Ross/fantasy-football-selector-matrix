(() => {
  'use strict';

  let whatIfResult=null;
  let whatIfType='START_SIT';
  let whatIfPartner='';

  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
  function round(v,d=1){const p=10**d;return Math.round((num(v)+Number.EPSILON)*p)/p}
  function toneForRisk(risk){return num(risk)>=.7?'danger':num(risk)>=.4?'warn':'good'}
  function toneForSeverity(severity){return severity==='CRITICAL'?'danger':severity==='HIGH'||severity==='WATCH'?'warn':'good'}

  function playerValues(){
    const list=(typeof state!=='undefined'&&Array.isArray(state.players))?state.players:[];
    const values={};
    for(const p of list){
      const m=p.metrics||{};
      const value=round(num(m.production)*.34+num(m.opportunity)*.26+num(m.ceiling)*.16+num(m.consistency)*.10+num(m.availability)*.08+num(m.trend)*.06,1);
      const baseline=num(p.avgPoints);
      const trendAdj=(num(m.trend,50)-50)/250;
      const forecast=baseline>0?Math.max(0,baseline*(1+trendAdj)+(num(p.ceiling)-baseline)*.12):Math.max(0,value/6);
      values[p.id]={
        id:p.id,name:p.name,position:p.position,team:p.team,status:p.status,
        value,projection:round(forecast,1),marketValue:value,restOfSeasonValue:value,
        byeWeek:p.byeWeek||null,games:p.games,floor:p.floor,ceiling:p.ceiling,
        yearsExp:p.yearsExp,rookie:p.rookie,metrics:p.metrics||{}
      };
    }
    return values;
  }

  function getPlayerName(id,values){return values?.[id]?.name||id||'—'}
  function activeTab(){return document.querySelector('.season-tab.active')?.dataset.seasonTab||'Weekly Attack Plan'}
  function optionList(ids,values,placeholder='Choose player…'){
    const unique=[...new Set((ids||[]).filter(Boolean))];
    return `<option value="">${esc(placeholder)}</option>`+unique.map(id=>`<option value="${esc(id)}">${esc(getPlayerName(id,values))}${values?.[id]?.position?` · ${esc(values[id].position)}`:''}</option>`).join('');
  }
  function signed(value,digits=1){if(value===null||value===undefined)return'—';const n=round(value,digits);return`${n>0?'+':''}${n}`}

  function mount(){
    if(document.getElementById('seasonIntel'))return;
    const wrap=document.createElement('section');
    wrap.id='seasonIntel';
    wrap.className='season-intel';
    wrap.innerHTML=`<style>
      .season-intel{margin:18px 0 24px;border:1px solid rgba(57,255,20,.26);border-radius:18px;background:linear-gradient(180deg,#08130d,#07100b);overflow:hidden;box-shadow:0 18px 46px rgba(0,0,0,.25)}
      .season-intel-head{padding:16px 16px 10px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.season-intel-head h3{margin:0;font-size:17px}.season-intel-head p{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.45}.season-badge{font-size:9px;font-weight:950;letter-spacing:.08em;border:1px solid var(--line);border-radius:999px;padding:6px 9px;white-space:nowrap}.season-badge[data-tone="good"]{color:var(--accent);border-color:rgba(57,255,20,.35)}.season-badge[data-tone="warn"]{color:#ffd166}.season-badge[data-tone="danger"]{color:#ff6b6b}
      .season-tabs{display:flex;gap:7px;overflow-x:auto;padding:0 14px 12px;scrollbar-width:none}.season-tabs::-webkit-scrollbar{display:none}.season-tab{flex:0 0 auto;border:1px solid var(--line);background:#0b1710;color:var(--muted);height:34px;padding:0 12px;border-radius:999px;font-size:10px;font-weight:900}.season-tab.active{background:var(--accent);color:#041008;border-color:var(--accent)}
      .season-panel{padding:0 14px 16px}.season-card{border:1px solid var(--line);background:#0a1510;border-radius:14px;padding:12px;margin-top:9px}.season-kicker{font-size:9px;color:var(--accent);font-weight:950;letter-spacing:.12em}.season-title{font-size:14px;font-weight:950;margin-top:3px}.season-meta{font-size:10px;color:var(--muted);line-height:1.45;margin-top:5px}.season-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.season-stat{border:1px solid var(--line);border-radius:12px;padding:10px;background:#08120d}.season-stat b{display:block;font-size:16px}.season-stat span{font-size:9px;color:var(--muted)}.season-action{border-left:3px solid var(--accent);padding-left:10px}.season-action[data-tone="warn"]{border-color:#ffd166}.season-action[data-tone="danger"]{border-color:#ff6b6b}.season-empty{padding:18px 14px;color:var(--muted);font-size:11px}.season-list{display:grid;gap:8px}.season-pill{display:inline-block;font-size:9px;border:1px solid var(--line);border-radius:999px;padding:4px 7px;margin-right:5px;margin-top:6px;color:var(--muted)}
      .whatif-controls{display:grid;gap:9px}.whatif-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.whatif-field{display:grid;gap:5px}.whatif-field label{font-size:9px;font-weight:900;color:var(--muted);letter-spacing:.06em}.whatif-field select{width:100%;min-height:46px;border:1px solid var(--line);border-radius:11px;background:#07110b;color:var(--text);padding:0 10px;font-size:12px}.whatif-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.whatif-actions button{min-height:46px;border-radius:11px;border:1px solid var(--line);background:#102017;color:var(--text);font-weight:950}.whatif-actions .primary{background:var(--accent);color:#041008;border-color:var(--accent)}
      @media(max-width:560px){.season-grid,.whatif-row{grid-template-columns:1fr}.season-intel-head{align-items:flex-start}.whatif-actions{grid-template-columns:1fr 1fr}}
    </style><div class="season-intel-head"><div><h3>Season Intelligence</h3><p>Maximum Edge mode · recommendations only · no automatic roster moves</p></div><span id="seasonFreshness" class="season-badge">WAITING</span></div><div class="season-tabs" id="seasonTabs"></div><div class="season-panel" id="seasonPanel"><div class="season-empty">Connect a supported fantasy league to build your Weekly Attack Plan.</div></div>`;
    const footer=document.querySelector('footer');
    if(footer?.parentNode)footer.parentNode.insertBefore(wrap,footer);else document.body.appendChild(wrap);
    const tabs=['Weekly Attack Plan','Command Center','Roster Doctor','Waiver Assassin','Trade Hunter','What-If Matrix','Playoff Path','Opponent Exploiter','Player Status'];
    document.getElementById('seasonTabs').innerHTML=tabs.map((t,i)=>`<button class="season-tab${i===0?' active':''}" data-season-tab="${esc(t)}">${esc(t)}</button>`).join('');
    document.getElementById('seasonTabs').addEventListener('click',e=>{const b=e.target.closest('[data-season-tab]');if(!b)return;document.querySelectorAll('.season-tab').forEach(x=>x.classList.toggle('active',x===b));render(window.ffmLeagueSnapshot,b.dataset.seasonTab)});
  }

  function render(snapshot,tab='Weekly Attack Plan'){
    mount();
    const panel=document.getElementById('seasonPanel');
    const badge=document.getElementById('seasonFreshness');
    if(!snapshot){badge.textContent='WAITING';badge.dataset.tone='warn';panel.innerHTML='<div class="season-empty">Connect a supported fantasy league to build your Weekly Attack Plan.</div>';return}
    const values=playerValues();
    if(tab==='What-If Matrix'){
      const freshness=String(snapshot.freshness?.status||'unknown').toUpperCase();
      badge.textContent=`${freshness} · SIMULATION`;
      badge.dataset.tone=snapshot.freshness?.status==='fresh'?'good':snapshot.freshness?.status==='stale'?'warn':'danger';
      return renderWhatIf(panel,snapshot,values);
    }
    let plan;
    try{plan=window.FFMWeeklyAttackPlan.buildWeeklyAttackPlan(snapshot,snapshot.myRosterId,values)}catch(error){badge.textContent='NEEDS DATA';badge.dataset.tone='warn';panel.innerHTML=`<div class="season-empty">Season Intelligence needs more league/player data: ${esc(error?.message||error)}</div>`;return}
    const freshness=String(plan.freshness?.status||'unknown').toUpperCase();
    badge.textContent=`${freshness} · ${plan.confidence}% CONF`;
    badge.dataset.tone=plan.freshness?.status==='fresh'?'good':plan.freshness?.status==='stale'?'warn':'danger';
    if(tab==='Weekly Attack Plan')return renderWeekly(panel,plan,values);
    if(tab==='Command Center')return renderCommandCenter(panel,snapshot,values);
    if(tab==='Roster Doctor')return renderRoster(panel,plan);
    if(tab==='Waiver Assassin')return renderWaiver(panel,plan,values);
    if(tab==='Trade Hunter')return renderTrade(panel,plan,values);
    if(tab==='Playoff Path')return renderPlayoffPath(panel,snapshot,values);
    if(tab==='Opponent Exploiter')return renderOpponent(panel,plan);
    return renderStatus(panel,plan,values);
  }

  function renderWeekly(panel,plan,values){
    const weakness=plan.biggestWeakness;
    panel.innerHTML=`<div class="season-grid"><div class="season-stat"><b>${esc(plan.rosterGrade)}</b><span>ROSTER GRADE</span></div><div class="season-stat"><b>${esc(plan.opponent?.projectedMargin??'—')}</b><span>PROJECTED MARGIN</span></div></div><div class="season-card"><div class="season-kicker">BIGGEST WEAKNESS</div><div class="season-title">${esc(weakness?`${weakness.position} · ${weakness.grade}/100`:'No major weakness detected')}</div><div class="season-meta">${esc(weakness?.reason||'Roster balance is currently acceptable relative to league demand.')}</div></div><div class="season-list">${plan.actions.slice(0,8).map(a=>`<div class="season-card season-action" data-tone="${toneForRisk(a.risk)}"><div class="season-kicker">${esc(a.type)} · ${esc(a.confidence)}% CONF · RISK ${esc(round(a.risk*100))}%</div><div class="season-title">${actionHeadline(a,values)}</div><div class="season-meta">${esc(a.reason)}</div></div>`).join('')}</div>`;
  }

  function actionHeadline(a,values){if(a.type==='WAIVER')return `ADD ${getPlayerName(a.addPlayerId,values)} → DROP ${getPlayerName(a.dropPlayerId,values)}`;if(a.type==='TRADE')return `GIVE ${(a.givePlayerIds||[]).map(id=>getPlayerName(id,values)).join(', ')} → GET ${(a.getPlayerIds||[]).map(id=>getPlayerName(id,values)).join(', ')}`;if(a.type==='STATUS')return `${getPlayerName(a.playerId,values)} · ${a.status}`;if(a.type==='LINEUP')return `START ${getPlayerName(a.playerId,values)}`;return a.position?`ATTACK ${a.position}`:a.type;}

  function renderCommandCenter(panel,snapshot,values){
    if(!window.FFMInjuryCommandCenter?.buildCommandCenter){panel.innerHTML='<div class="season-empty">Command Center is initializing.</div>';return}
    const kickoff=window.__FFM_KICKOFF_CONTEXT__||{};
    let command;
    try{command=window.FFMInjuryCommandCenter.buildCommandCenter(snapshot,snapshot.myRosterId,values,{...kickoff,now:new Date().toISOString()})}
    catch(error){panel.innerHTML=`<div class="season-empty">Command Center needs more lineup data: ${esc(error?.message||error)}</div>`;return}
    if(!command.alerts.length){panel.innerHTML='<div class="season-empty">No starter injury, bye-week, or lock issues need attention right now.</div>';return}
    panel.innerHTML=`<div class="season-grid"><div class="season-stat"><b>${esc(command.criticalCount)}</b><span>CRITICAL</span></div><div class="season-stat"><b>${esc(command.highCount)}</b><span>HIGH PRIORITY</span></div></div><div class="season-list">${command.alerts.map(a=>`<div class="season-card season-action" data-tone="${toneForSeverity(a.severity)}"><div class="season-kicker">${esc(a.severity)} · ${esc(a.status)} · ${esc(a.lockState)}</div><div class="season-title">${esc(a.name)}${a.actionable&&a.replacementName?` → ${esc(a.replacementName)}`:''}</div><div class="season-meta">${esc(a.reason)}</div><span class="season-pill">${esc(a.confidence)}% confidence</span><span class="season-pill">Risk ${esc(round(a.risk*100))}%</span>${a.kickoffAt?`<span class="season-pill">Kickoff ${esc(new Date(a.kickoffAt).toLocaleString())}</span>`:''}</div>`).join('')}</div>`;
  }

  function renderRoster(panel,plan){const r=plan.lineup;const weakness=plan.biggestWeakness;panel.innerHTML=`<div class="season-card"><div class="season-kicker">ROSTER DOCTOR</div><div class="season-title">Grade ${esc(plan.rosterGrade)}/100</div><div class="season-meta">Biggest weakness: ${esc(weakness?`${weakness.position} (${weakness.grade}/100)`:'none flagged')}.</div></div><div class="season-card"><div class="season-kicker">OPTIMIZED LINEUP</div><div class="season-meta">${r.starters.map(s=>`${esc(s.slotType)}: <b>${esc(s.name)}</b> · ${esc(s.expectedPoints)} expected`).join('<br>')}</div></div>`;}

  function renderWaiver(panel,plan,values){
    const w=plan.waiverMove;
    if(!w){panel.innerHTML='<div class="season-empty">No waiver move currently clears the Maximum Edge threshold.</div>';return}
    const faab=w.faab?.available
      ? `<div class="season-card"><div class="season-kicker">FAAB BID OPTIMIZER · ${esc(w.faab.aggressiveness)}</div><div class="season-title">Target $${esc(w.faab.recommendedBid)} · Range $${esc(w.faab.minBid)}–$${esc(w.faab.maxBid)}</div><div class="season-meta">${esc(w.faab.reason)}</div><span class="season-pill">$${esc(w.faab.budgetRemaining)} remaining</span><span class="season-pill">${esc(w.faab.budgetShare)}% of original budget</span><span class="season-pill">${esc(w.faab.confidence)}% bid confidence</span><span class="season-pill">Risk ${esc(round(w.faab.risk*100))}%</span></div>`
      : '';
    panel.innerHTML=`<div class="season-card season-action" data-tone="${toneForRisk(w.risk)}"><div class="season-kicker">WAIVER ASSASSIN · PRIORITY ${esc(w.priority)}</div><div class="season-title">ADD ${esc(getPlayerName(w.addPlayerId,values))} → DROP ${esc(getPlayerName(w.dropPlayerId,values))}</div><div class="season-meta">${esc(w.reason)}</div><span class="season-pill">${esc(w.classification)}</span><span class="season-pill">${esc(w.confidence)}% confidence</span></div>${faab}`;
  }

  function renderTrade(panel,plan,values){
    const t=plan.tradeOpportunity;
    if(!t){panel.innerHTML='<div class="season-empty">No trade currently improves your roster enough to clear the Trade Analyzer threshold.</div>';return}
    const analysis=t.analysis||t;
    const fairness=t.fairness||analysis.fairness||{};
    const benefit=t.rosterBenefit||analysis.rosterBenefit||{};
    const before=t.before||analysis.before||{};
    const after=t.after||analysis.after||{};
    const deltas=t.deltas||analysis.deltas||{};
    const tradeSigned=(value,digits=1)=>{const n=round(value,digits);return `${n>0?'+':''}${n}`};
    const playoff=deltas.playoffOutlook===null
      ? ''
      : `<div class="season-stat"><b>${esc(before.playoffOutlook??'—')} → ${esc(after.playoffOutlook??'—')}</b><span>PLAYOFF ${esc(tradeSigned(deltas.playoffOutlook))}</span></div>`;
    panel.innerHTML=`<div class="season-card season-action" data-tone="${toneForRisk(t.risk)}"><div class="season-kicker">TRADE ANALYZER · RECOMMENDATION ONLY</div><div class="season-title">Give ${(t.givePlayerIds||[]).map(id=>esc(getPlayerName(id,values))).join(', ')} → Get ${(t.getPlayerIds||[]).map(id=>esc(getPlayerName(id,values))).join(', ')}</div><div class="season-meta">${esc(t.reason)}</div><div class="season-grid" style="margin-top:10px"><div class="season-stat"><b>${esc(fairness.label||'UNKNOWN')}</b><span>FAIRNESS</span></div><div class="season-stat"><b>${esc(benefit.label||'UNKNOWN')}</b><span>ROSTER BENEFIT</span></div></div><div class="season-grid" style="margin-top:8px"><div class="season-stat"><b>${esc(before.lineupPoints??'—')} → ${esc(after.lineupPoints??'—')}</b><span>LINEUP ${esc(tradeSigned(deltas.lineupPoints))}</span></div><div class="season-stat"><b>${esc(before.restOfSeasonValue??'—')} → ${esc(after.restOfSeasonValue??'—')}</b><span>ROS VALUE ${esc(tradeSigned(deltas.restOfSeasonValue))}</span></div><div class="season-stat"><b>${esc(before.depthResilience??'—')} → ${esc(after.depthResilience??'—')}</b><span>DEPTH ${esc(tradeSigned(deltas.depthResilience))}</span></div>${playoff}</div><span class="season-pill">${esc(t.confidence)}% confidence</span><span class="season-pill">Risk ${esc(round(t.risk*100))}%</span><span class="season-pill">Roster edge ${esc(tradeSigned(benefit.compositeEdge))}</span></div>`;
  }

  function renderWhatIf(panel,snapshot,values){
    if(!window.FFMWhatIfMatrix?.simulateScenario){panel.innerHTML='<div class="season-empty">What-If Matrix is initializing.</div>';return}
    const mine=(snapshot.rosters||[]).find(r=>String(r.rosterId)===String(snapshot.myRosterId));
    if(!mine){panel.innerHTML='<div class="season-empty">What-If Matrix needs your synced roster identity.</div>';return}
    const starters=new Set(mine.starterPlayerIds||[]);
    const bench=(mine.playerIds||[]).filter(id=>!starters.has(id));
    const others=(snapshot.rosters||[]).filter(r=>String(r.rosterId)!==String(snapshot.myRosterId));
    if(!whatIfPartner||!others.some(r=>String(r.rosterId)===String(whatIfPartner)))whatIfPartner=String(others[0]?.rosterId||'');
    const partner=others.find(r=>String(r.rosterId)===String(whatIfPartner));
    const typeOptions=`<option value="START_SIT"${whatIfType==='START_SIT'?' selected':''}>START/SIT</option><option value="ADD_DROP"${whatIfType==='ADD_DROP'?' selected':''}>ADD/DROP</option><option value="TRADE"${whatIfType==='TRADE'?' selected':''}>TRADE</option>`;
    let fields='';
    if(whatIfType==='START_SIT')fields=`<div class="whatif-row"><div class="whatif-field"><label>START</label><select id="whatIfStart">${optionList(bench,values,'Choose bench player…')}</select></div><div class="whatif-field"><label>SIT</label><select id="whatIfSit">${optionList(mine.starterPlayerIds,values,'Choose current starter…')}</select></div></div>`;
    if(whatIfType==='ADD_DROP')fields=`<div class="whatif-row"><div class="whatif-field"><label>ADD</label><select id="whatIfAdd">${optionList(snapshot.freeAgentPlayerIds,values,'Choose free agent…')}</select></div><div class="whatif-field"><label>DROP</label><select id="whatIfDrop">${optionList(mine.playerIds,values,'Choose roster player…')}</select></div></div>`;
    if(whatIfType==='TRADE')fields=`<div class="whatif-field"><label>TRADE PARTNER</label><select id="whatIfPartner">${others.map(r=>`<option value="${esc(r.rosterId)}"${String(r.rosterId)===whatIfPartner?' selected':''}>Roster ${esc(r.rosterId)}</option>`).join('')}</select></div><div class="whatif-row"><div class="whatif-field"><label>GIVE</label><select id="whatIfGive">${optionList(mine.playerIds,values,'Choose your player…')}</select></div><div class="whatif-field"><label>GET</label><select id="whatIfGet">${optionList(partner?.playerIds||[],values,'Choose their player…')}</select></div></div>`;
    const result=whatIfResult;
    let resultHtml='';
    if(result){
      if(!result.valid){resultHtml=`<div class="season-card season-action" data-tone="danger"><div class="season-kicker">SIMULATION REJECTED</div><div class="season-title">No league state was changed</div><div class="season-meta">${(result.errors||[]).map(esc).join('<br>')}</div></div>`;}
      else{
        const d=result.deltas||{},before=result.before||{},after=result.after||{};
        const tone=result.recommendation==='HURTS TEAM'?'danger':result.recommendation==='IMPROVES TEAM'?'good':'warn';
        const matchup=d.matchupWinProbability===null?'—':`${signed(d.matchupWinProbability)} pts`;
        resultHtml=`<div class="season-card season-action" data-tone="${tone}"><div class="season-kicker">WHAT-IF RESULT · RECOMMENDATION ONLY</div><div class="season-title">${esc(result.recommendation)}</div><div class="season-meta">Results are labeled IMPROVES TEAM, NEUTRAL, or HURTS TEAM. This simulation never changes your synced league.</div><div class="season-grid" style="margin-top:10px"><div class="season-stat"><b>${esc(before.lineupPoints??'—')} → ${esc(after.lineupPoints??'—')}</b><span>LINEUP EDGE ${esc(signed(d.lineupEdge))}</span></div><div class="season-stat"><b>${esc(before.rosterValue??'—')} → ${esc(after.rosterValue??'—')}</b><span>ROSTER VALUE ${esc(signed(d.rosterValue))}</span></div><div class="season-stat"><b>${esc(before.positionalDepth??'—')} → ${esc(after.positionalDepth??'—')}</b><span>POSITIONAL DEPTH ${esc(signed(d.positionalDepth))}</span></div><div class="season-stat"><b>${before.matchupWinProbability===null?'—':`${esc(before.matchupWinProbability)}%`} → ${after.matchupWinProbability===null?'—':`${esc(after.matchupWinProbability)}%`}</b><span>MATCHUP WIN PROBABILITY ${esc(matchup)}</span></div></div><span class="season-pill">${esc(result.confidence)}% confidence</span><span class="season-pill">Risk ${esc(round(result.risk*100))}%</span></div>`;
      }
    }
    panel.innerHTML=`<div class="season-card"><div class="season-kicker">WHAT-IF MATRIX · SAFE SIMULATION</div><div class="season-title">Test the move before you make it</div><div class="season-meta">The Matrix clones your current synced state in memory. Nothing is sent to Sleeper and Reset Simulation returns immediately to the canonical roster.</div><div class="whatif-controls" style="margin-top:10px"><div class="whatif-field"><label>SCENARIO</label><select id="whatIfType">${typeOptions}</select></div>${fields}<div class="whatif-actions"><button class="primary" id="whatIfRun" type="button">Run Simulation</button><button id="whatIfReset" type="button">Reset Simulation</button></div></div></div>${resultHtml}`;
    document.getElementById('whatIfType')?.addEventListener('change',e=>{whatIfType=e.target.value;whatIfResult=null;render(snapshot,'What-If Matrix')});
    document.getElementById('whatIfPartner')?.addEventListener('change',e=>{whatIfPartner=e.target.value;whatIfResult=null;render(snapshot,'What-If Matrix')});
    document.getElementById('whatIfRun')?.addEventListener('click',()=>{
      let scenario;
      if(whatIfType==='START_SIT')scenario={type:'START_SIT',startPlayerId:document.getElementById('whatIfStart')?.value||'',sitPlayerId:document.getElementById('whatIfSit')?.value||''};
      else if(whatIfType==='ADD_DROP')scenario={type:'ADD_DROP',addPlayerId:document.getElementById('whatIfAdd')?.value||'',dropPlayerId:document.getElementById('whatIfDrop')?.value||''};
      else scenario={type:'TRADE',counterpartRosterId:whatIfPartner,givePlayerIds:[document.getElementById('whatIfGive')?.value||''],getPlayerIds:[document.getElementById('whatIfGet')?.value||'']};
      whatIfResult=window.FFMWhatIfMatrix.simulateScenario(snapshot,snapshot.myRosterId,values,scenario,{seed:`ui-what-if:${snapshot.league?.leagueId||'league'}:${snapshot.week||0}`});
      render(snapshot,'What-If Matrix');
    });
    document.getElementById('whatIfReset')?.addEventListener('click',()=>{whatIfResult=null;render(window.ffmLeagueSnapshot,'What-If Matrix')});
  }

  function renderPlayoffPath(panel,snapshot,values){
    if(!window.FFMPlayoffPath?.buildPlayoffPath){panel.innerHTML='<div class="season-empty">Playoff Path is initializing.</div>';return}
    let path;
    try{path=window.FFMPlayoffPath.buildPlayoffPath(snapshot,snapshot.myRosterId,values)}
    catch(error){panel.innerHTML=`<div class="season-empty">Playoff Path needs more league data: ${esc(error?.message||error)}</div>`;return}
    const top=path.leverageWeeks?.[0]||null;
    const primary=path.playoffProbability!==null
      ? `<div class="season-stat"><b>${esc(path.playoffProbability)}%</b><span>PLAYOFF PROBABILITY</span></div>`
      : `<div class="season-stat"><b>${esc(path.readinessScore)}/100</b><span>PLAYOFF READINESS</span></div>`;
    const degraded=path.playoffProbability===null
      ? `<div class="season-meta">Readiness mode · probability withheld until standings, playoff settings, and remaining schedule are complete.</div>`
      : '';
    const target=path.improvementTarget;
    const weakness=path.biggestWeakness;
    const leverageTone=top?.label==='MUST-WIN'?'danger':top?.label==='HIGH LEVERAGE'?'warn':'good';
    const leverage=top?`<div class="season-card season-action" data-tone="${leverageTone}"><div class="season-kicker">${esc(top.label)} · WEEK ${esc(top.week)}</div><div class="season-title">vs roster ${esc(top.opponentRosterId)} · ${esc(top.probabilitySwing)} point playoff swing</div><div class="season-meta">Win path ${esc(top.winPathProbability)}% · loss path ${esc(top.lossPathProbability)}% · matchup win estimate ${esc(top.matchupWinProbability)}%.</div></div>`:'';
    panel.innerHTML=`<div class="season-card season-action" data-tone="${toneForRisk(path.risk)}"><div class="season-kicker">IMPROVEMENT TARGET</div><div class="season-title">${esc(target?.action||'Protect current roster strengths')}</div><div class="season-meta">${esc(target?.reason||'No major demanded-position weakness is currently flagged.')}</div></div><div class="season-grid" style="margin-top:9px">${primary}<div class="season-stat"><b>${esc(path.scheduleDifficulty?.label||'UNKNOWN')}</b><span>SCHEDULE DIFFICULTY${path.scheduleDifficulty?.score!==null?` · ${esc(path.scheduleDifficulty.score)}/100`:''}</span></div></div><div class="season-card"><div class="season-kicker">BIGGEST PLAYOFF RISK</div><div class="season-title">${esc(weakness?`${weakness.position} · ${weakness.grade}/100`:'No demanded-position weakness flagged')}</div><div class="season-meta">${esc(weakness?.reason||path.reasons?.[0]||'No major roster weakness is currently flagged.')}</div>${degraded}</div>${leverage}<span class="season-pill">${esc(path.confidence)}% confidence</span><span class="season-pill">Risk ${esc(round(path.risk*100))}%</span>${path.currentSeedEstimate?`<span class="season-pill">Current seed #${esc(path.currentSeedEstimate)}</span>`:''}`;
  }

  function renderOpponent(panel,plan){const o=plan.opponent;if(!o){panel.innerHTML='<div class="season-empty">Current-week opponent data is not available yet.</div>';return}panel.innerHTML=`<div class="season-card"><div class="season-kicker">OPPONENT EXPLOITER · WEEK ${esc(o.week)}</div><div class="season-title">Primary vulnerability: ${esc(o.primaryVulnerability?.position||'—')}</div><div class="season-meta">${esc(o.primaryVulnerability?.reason||'No clear vulnerability detected.')}</div></div><div class="season-card"><div class="season-kicker">POSITION EDGES</div><div class="season-meta">${o.positionEdges.map(e=>`${esc(e.position)}: ${e.edge>=0?'+':''}${esc(e.edge)}`).join(' · ')}</div></div>`;}

  function renderStatus(panel,plan,values){const alerts=plan.urgentStatusAlerts||[];if(!alerts.length){panel.innerHTML='<div class="season-empty">No IR, PUP, Questionable, Doubtful, or Out alerts on your roster.</div>';return}panel.innerHTML=`<div class="season-list">${alerts.map(a=>`<div class="season-card season-action" data-tone="${toneForRisk(a.risk)}"><div class="season-kicker">PLAYER STATUS · ${esc(a.status)}</div><div class="season-title">${esc(getPlayerName(a.playerId,values))}</div><div class="season-meta">Confidence ${esc(a.confidence)}% · Risk ${esc(round(a.risk*100))}%${a.stale?' · status data is stale':''}</div></div>`).join('')}</div>`;}

  function init(){
    mount();
    window.addEventListener('ffm:league-snapshot',e=>{whatIfResult=null;render(e.detail,activeTab())});
    window.addEventListener('ffm:kickoff-context',()=>{if(window.ffmLeagueSnapshot&&activeTab()==='Command Center')render(window.ffmLeagueSnapshot,'Command Center')});
    if(window.ffmLeagueSnapshot)render(window.ffmLeagueSnapshot);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();