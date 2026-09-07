(() => {
  'use strict';
  const ROSTER_KEY='ffm-fast-my-roster';
  const BENCH_KEY='ffm-fast-bench';
  const LINEUP_KEY='ffm-roster-lineup';
  const PROFILE_KEY='ffm-league-profile-v2';
  const PROFILE=Object.freeze({QB:1,RB:2,WR:2,TE:1,FLEX:2,K:1,DST:1,BENCH:5});
  const FLEX=new Set(['RB','WR','TE']);

  function json(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch(_){return fallback}}
  function installProfile(){
    if(localStorage.getItem(PROFILE_KEY)==='game-of-throws-15')return;
    localStorage.setItem(LINEUP_KEY,JSON.stringify({QB:1,RB:2,WR:2,TE:1,FLEX:2,K:1,DST:1}));
    localStorage.setItem(PROFILE_KEY,'game-of-throws-15');
  }
  function snapshot(){
    const mine=new Set(json(ROSTER_KEY,[]));
    const bench=new Set(json(BENCH_KEY,[]));
    const players=(typeof state!=='undefined'&&Array.isArray(state.players))?state.players:[];
    const counts={QB:0,RB:0,WR:0,TE:0,K:0,DST:0};
    for(const p of players)if(mine.has(p.id)&&!bench.has(p.id)&&counts[p.position]!==undefined)counts[p.position]++;
    const coreFilled={};
    for(const pos of ['QB','RB','WR','TE','K','DST'])coreFilled[pos]=Math.min(counts[pos],PROFILE[pos]);
    const flexSurplus=['RB','WR','TE'].reduce((n,pos)=>n+Math.max(0,counts[pos]-PROFILE[pos]),0);
    const flexFilled=Math.min(PROFILE.FLEX,flexSurplus);
    return {mine,bench,counts,coreFilled,flexFilled,benchFilled:Math.min(PROFILE.BENCH,bench.size)};
  }
  function openFor(player,s){
    if(!player)return false;
    if(['QB','RB','WR','TE','K','DST'].includes(player.position)&&s.coreFilled[player.position]<PROFILE[player.position])return true;
    return FLEX.has(player.position)&&s.flexFilled<PROFILE.FLEX;
  }
  function remainingStarterSlots(s){
    return ['QB','RB','WR','TE','K','DST'].reduce((n,p)=>n+PROFILE[p]-s.coreFilled[p],0)+(PROFILE.FLEX-s.flexFilled);
  }
  function installScoreGuard(){
    if(window.__FFM_GAME_OF_THROWS_PROFILE__||typeof matrixScore!=='function')return;
    window.__FFM_GAME_OF_THROWS_PROFILE__=true;
    const base=matrixScore;
    matrixScore=function gameOfThrowsScore(player,round=Number(document.getElementById('round')?.value||1),includeScarcity=true){
      let score=base(player,round,includeScarcity);
      if(!includeScarcity||!player)return score;
      const s=snapshot(), r=Number(round||1), starterOpen=remainingStarterSlots(s);
      if(openFor(player,s)){
        if(['RB','WR','TE'].includes(player.position)&&s.flexFilled<PROFILE.FLEX)score+=4;
        if(player.position==='K'||player.position==='DST'){
          if(r>=9)score+=12;
          if(r>=12||starterOpen<=2)score+=18;
        }
      }else if(starterOpen>0&&s.bench.size<PROFILE.BENCH){
        score-=6;
      }
      return Math.max(1,Math.round(score));
    };
  }
  function renderProfile(){
    const chips=document.getElementById('rosterNeedChips');
    const summary=document.getElementById('rosterNeedSummary');
    if(!chips||!summary)return;
    const s=snapshot();
    const parts=[
      ['QB',s.coreFilled.QB,1],['RB',s.coreFilled.RB,2],['WR',s.coreFilled.WR,2],['TE',s.coreFilled.TE,1],
      ['FLEX',s.flexFilled,2],['K',s.coreFilled.K,1],['DEF',s.coreFilled.DST,1],['BENCH',s.benchFilled,5]
    ];
    chips.innerHTML=parts.map(([p,n,t])=>`<span class="need-chip ${n<t?'open':'done'}">${p} ${n}/${t}</span>`).join('');
    const open=remainingStarterSlots(s)+(PROFILE.BENCH-s.benchFilled);
    summary.textContent=open?`${open} of 15 roster slots open`:'All 15 roster slots filled';
  }
  function decorate(){
    renderProfile();
    const pick=typeof bestDraftPlayer==='function'?bestDraftPlayer():null;
    const why=document.querySelector('#draftPick .why');
    if(!pick||!why)return;
    why.querySelectorAll('.game-profile-note').forEach(n=>n.remove());
    const s=snapshot();
    let text='';
    if(openFor(pick,s)) text=`Fills an open Game of Throws starter/FLEX need. ${remainingStarterSlots(s)} starter slot${remainingStarterSlots(s)===1?'':'s'} remain.`;
    else if(s.benchFilled<PROFILE.BENCH) text=`Starter needs are protected; build bench depth ${s.benchFilled}/5.`;
    if(text)why.insertAdjacentHTML('beforeend',`<span class="game-profile-note" style="display:block;margin-top:6px;color:var(--accent)"><strong>League fit:</strong> ${text}</span>`);
  }
  function init(){
    installProfile();
    installScoreGuard();
    const style=document.createElement('style');
    style.textContent='.league-profile-badge{font-size:10px;color:var(--muted);margin-top:5px}.league-profile-badge strong{color:var(--accent)}';
    document.head.appendChild(style);
    const panel=document.getElementById('rosterNeeds');
    if(panel&&!panel.querySelector('.league-profile-badge'))panel.insertAdjacentHTML('beforeend','<div class="league-profile-badge"><strong>Game of Throws:</strong> QB 1 · RB 2 · WR 2 · TE 1 · W/R/T 2 · K 1 · DEF 1 · Bench 5</div>');
    decorate();
    const observer=new MutationObserver(()=>requestAnimationFrame(decorate));
    const draft=document.getElementById('draft');
    if(draft)observer.observe(draft,{childList:true,subtree:true});
    document.addEventListener('click',()=>setTimeout(decorate,0),true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else setTimeout(init,0);
})();
