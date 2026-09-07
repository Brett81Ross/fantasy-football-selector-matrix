(() => {
  'use strict';
  const VERSION='1.5.5';
  const BENCH_KEY='ffm-fast-bench';
  const BENCH_LIMIT=5;
  const BENCH_POSITIONS=new Set(['QB','RB','WR','TE']);
  let bench=new Set();
  let boardWrapped=false;

  function safeJson(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch(_){return fallback}
  }

  function saveBench(){
    try{localStorage.setItem(BENCH_KEY,JSON.stringify([...bench]))}catch(_){}
  }

  function pruneBench(){
    if(typeof state==='undefined')return;
    const valid=new Set((state.players||[]).map(p=>p.id));
    bench=new Set([...bench].filter(id=>valid.has(id)&&state.drafted.has(id)));
    saveBench();
  }

  function addPositionOptions(){
    const select=document.getElementById('position');
    if(!select)return;
    for(const pos of ['K','DST','BENCH']){
      if(![...select.options].some(o=>o.value===pos||o.textContent===pos)){
        const option=document.createElement('option');
        option.value=pos;
        option.textContent=pos==='DST'?'DEF / DST':pos;
        select.appendChild(option);
      }
    }
  }

  function addFastChips(){
    const tools=document.getElementById('fastTools');
    if(!tools)return;
    for(const pos of ['K','DST','BENCH']){
      let btn=tools.querySelector(`[data-fast-pos="${pos}"]`);
      if(!btn){
        btn=document.createElement('button');
        btn.className='fast-chip';
        btn.dataset.fastPos=pos;
        tools.appendChild(btn);
      }
      btn.textContent=pos==='DST'?'DEF':pos==='BENCH'?`BENCH ${bench.size}/${BENCH_LIMIT}`:pos;
    }
  }

  function wrapBoardFilter(){
    if(boardWrapped||typeof getBoardPlayers!=='function')return;
    boardWrapped=true;
    const base=getBoardPlayers;
    getBoardPlayers=function(position,search){
      if(position!=='BENCH')return base(position,search);
      return base('ALL',search).filter(p=>BENCH_POSITIONS.has(p.position));
    };
  }

  function addBenchButton(){
    const dock=document.getElementById('fastDock');
    if(!dock||document.getElementById('fastBench'))return;
    const mine=document.getElementById('fastMine');
    if(!mine)return;
    const btn=document.createElement('button');
    btn.className='fast-action';
    btn.id='fastBench';
    btn.type='button';
    mine.insertAdjacentElement('afterend',btn);
    const style=document.createElement('style');
    style.textContent='.fast-dock{grid-template-columns:minmax(0,1fr) auto auto auto!important}.fast-action.bench-full{opacity:.45}@media(max-width:560px){.fast-dock{grid-template-columns:minmax(0,1fr) 66px 58px 66px!important}.fast-action{font-size:10px!important;padding:0 5px!important}}';
    document.head.appendChild(style);
    btn.addEventListener('click',()=>{
      pruneBench();
      if(bench.size>=BENCH_LIMIT){alert('Your five bench slots are already filled.');return}
      const id=document.getElementById('fastMine')?.dataset.id;
      const player=typeof state!=='undefined'?state.players.find(p=>p.id===id):null;
      if(!id||!player)return;
      document.getElementById('fastMine').click();
      if(typeof state!=='undefined'&&state.drafted.has(id)){
        bench.add(id);
        saveBench();
        sync();
      }
    });
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
    why.insertAdjacentHTML('beforeend',`<span class="special-team-note" style="display:block;margin-top:6px;color:var(--accent)"><strong>${pick.position==='DST'?'DEF/DST':pick.position} strategy:</strong> ${label}. The Matrix protects early-round value by pushing kicker and team defense toward the later rounds.</span>`);
  }

  function syncBenchUI(){
    pruneBench();
    const benchBtn=document.getElementById('fastBench');
    if(benchBtn){
      benchBtn.textContent=`Bench ${bench.size}/${BENCH_LIMIT}`;
      benchBtn.classList.toggle('bench-full',bench.size>=BENCH_LIMIT);
      benchBtn.disabled=bench.size>=BENCH_LIMIT;
    }
    const select=document.getElementById('position');
    const kicker=document.querySelector('#fastDock .fast-kicker');
    if(kicker){
      kicker.textContent=select?.value==='BENCH'?`BEST BENCH PICK · ${bench.size}/${BENCH_LIMIT}`:'BEST PICK RIGHT NOW';
    }
    addFastChips();
  }

  function sync(){
    addPositionOptions();
    addFastChips();
    addBenchButton();
    syncBenchUI();
    decoratePick();
  }

  function init(){
    bench=new Set(safeJson(BENCH_KEY,[]));
    addPositionOptions();
    wrapBoardFilter();
    installScoringGuard();
    const timer=setInterval(()=>{sync();if(document.getElementById('fastTools')&&document.getElementById('fastBench'))clearInterval(timer)},120);
    setTimeout(sync,0);setTimeout(sync,600);
    const previous=window.renderAll;
    if(typeof previous==='function')window.renderAll=function(){const result=previous.apply(this,arguments);requestAnimationFrame(sync);return result};
    document.getElementById('resetDraft')?.addEventListener('click',()=>{bench.clear();localStorage.removeItem(BENCH_KEY);setTimeout(sync,0)});
    document.getElementById('fastUndo')?.addEventListener('click',()=>setTimeout(()=>{pruneBench();sync()},0));
    document.querySelectorAll('.brand small').forEach(el=>el.textContent=el.textContent.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
