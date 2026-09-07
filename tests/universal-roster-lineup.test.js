const test=require('node:test');
const assert=require('node:assert/strict');

function normalizeLineup(value){
  const DEFAULT={QB:1,RB:2,WR:2,TE:1,FLEX:1};
  const source=value&&typeof value==='object'?value:{};
  const clean={};
  for(const [pos,fallback] of Object.entries(DEFAULT)){
    const n=Number(source[pos]);
    clean[pos]=Number.isFinite(n)?Math.max(0,Math.min(4,Math.round(n))):fallback;
  }
  return Object.values(clean).some(Boolean)?clean:{...DEFAULT};
}
function lineupFromDraftState(next){
  const FLEX_POSITIONS=['RB','WR','TE'];
  const slots=Array.isArray(next?.league?.rosterSlots)?next.league.rosterSlots:[];
  if(!slots.length)return null;
  const out={QB:0,RB:0,WR:0,TE:0,FLEX:0};
  for(const slot of slots){
    const type=String(slot?.type||'').toUpperCase();
    const count=Math.max(0,Number(slot?.count)||0);
    if(Object.prototype.hasOwnProperty.call(out,type))out[type]+=count;
    else if(type==='DEF'||type==='DST'||type==='K'||type==='BN'||type==='IR')continue;
    else{
      const eligible=Array.isArray(slot?.eligiblePositions)?slot.eligiblePositions.map(v=>String(v).toUpperCase()):[];
      if(eligible.length&&eligible.every(pos=>FLEX_POSITIONS.includes(pos)))out.FLEX+=count;
    }
  }
  return normalizeLineup(out);
}

test('Game of Throws canonical settings become 1QB 2RB 2WR 1TE 2FLEX',()=>{
  const next={league:{rosterSlots:[
    {type:'QB',count:1},{type:'RB',count:2},{type:'WR',count:2},{type:'TE',count:1},
    {type:'FLEX',count:2,eligiblePositions:['RB','WR','TE']},{type:'K',count:1},{type:'DST',count:1},{type:'BN',count:5}
  ]}};
  assert.deepEqual(lineupFromDraftState(next),{QB:1,RB:2,WR:2,TE:1,FLEX:2});
});

test('non-Game-of-Throws league uses its own roster counts',()=>{
  const next={league:{rosterSlots:[
    {type:'QB',count:1},{type:'RB',count:1},{type:'WR',count:3},{type:'TE',count:1},
    {type:'FLEX',count:1,eligiblePositions:['RB','WR','TE']},{type:'BN',count:6}
  ]}};
  assert.deepEqual(lineupFromDraftState(next),{QB:1,RB:1,WR:3,TE:1,FLEX:1});
});
