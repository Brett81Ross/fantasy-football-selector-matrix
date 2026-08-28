(() => {
  'use strict';
  const VERSION='1.5.2';

  function addPositionOptions(){
    const select=document.getElementById('position');
    if(!select)return;
    for(const pos of ['K','DST']){
      if(![...select.options].some(o=>o.value===pos||o.textContent===pos)){
        const option=document.createElement('option');option.value=pos;option.textContent=pos;select.appendChild(option);
      }
    }
  }

  function addFastChips(){
    const tools=document.getElementById('fastTools');
    if(!tools)return;
    for(const pos of ['K','DST']){
      if(tools.querySelector(`[data-fast-pos="${pos}"]`))continue;
      const btn=document.createElement('button');btn.className='fast-chip';btn.dataset.fastPos=pos;btn.textContent=pos;tools.appendChild(btn);
    }
  }

  function strategyLabel(player,round){
    if(!player||!['K','DST'].includes(player.position))return'';
    const r=Number(round||1);
    if(r<=4)return'LATE-ROUND TARGET';
    if(r<=6)return'WAIT IF VALUE REMAINS';
    return'ACTIVE TARGET';
  }

  function installScoringGuard(){
    if(window.__FFM_SPECIAL_TEAMS_SCORE_GUARD__||typeof matrixScore!=='function')return;
    window.__FFM_SPECIAL_TEAMS_SCORE_GUARD__=true;
    const base=matrixScore;
    matrixScore=function specialTeamsAwareScore(player,round=Number(document.getElementById('round')?.value||1),includeScarcity=true){
      let score=base(player,round,includeScarcity);
      if(player&&['K','DST'].includes(player.position)){
        const r=Number(round||1);
        const penalty=r<=3?32:r===4?24:r<=6?13:0;
        score=Math.max(1,Math.round(score-penalty));
      }
      return score;
    };
  }

  function decoratePick(){
    const pick=typeof bestDraftPlayer==='function'?bestDraftPlayer():null;
    const why=document.querySelector('#draftPick .why');
    if(!pick||!why||!['K','DST'].includes(pick.position))return;
    if(why.querySelector('.special-team-note'))return;
    const label=strategyLabel(pick,document.getElementById('round')?.value);
    why.insertAdjacentHTML('beforeend',`<span class="special-team-note" style="display:block;margin-top:6px;color:var(--accent)"><strong>${pick.position} strategy:</strong> ${label}. The Matrix protects early-round value by pushing kicker and team defense toward the later rounds.</span>`);
  }

  function sync(){addPositionOptions();addFastChips();decoratePick();}
  function init(){
    addPositionOptions();
    installScoringGuard();
    const timer=setInterval(()=>{sync();if(document.getElementById('fastTools'))clearInterval(timer)},120);
    setTimeout(sync,0);setTimeout(sync,600);
    const previous=window.renderAll;
    if(typeof previous==='function')window.renderAll=function(){const result=previous.apply(this,arguments);requestAnimationFrame(sync);return result};
    document.querySelectorAll('.brand small').forEach(el=>el.textContent=el.textContent.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
