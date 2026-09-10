const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeLeagueSnapshot } = require('../season-core/contracts');
const { findTradeOpportunities } = require('../season-core/trade-hunter');

const root=path.join(__dirname,'..');
const slots=[
  {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
  {id:'RB',type:'RB',count:2,eligiblePositions:['RB'],isBench:false,isReserve:false},
  {id:'WR',type:'WR',count:2,eligiblePositions:['WR'],isBench:false,isReserve:false},
  {id:'TE',type:'TE',count:1,eligiblePositions:['TE'],isBench:false,isReserve:false},
  {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
  {id:'BN',type:'BN',count:5,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
];

function fixture(){
  const rosters=[
    {rosterId:'1',playerIds:['Q1','R1','R2','W1','W2','W3','W4','T1']},
    {rosterId:'2',playerIds:['Q2','R3','R4','R5','W5','W6','T2']}
  ];
  const snapshot=normalizeLeagueSnapshot({
    league:{leagueId:'L1',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},rosterSlots:slots},week:7,myRosterId:'1',opponentRosterId:'2',rosters,
    playerPool:rosters.flatMap(r=>r.playerIds).map(id=>({id})),playerStatuses:{},freshness:{status:'fresh',asOf:'2026-09-10T18:00:00.000Z',source:'sleeper'}
  });
  const values={
    Q1:{position:'QB',value:75,projection:18},R1:{position:'RB',value:48,projection:9},R2:{position:'RB',value:46,projection:8},
    W1:{position:'WR',value:92,projection:18},W2:{position:'WR',value:88,projection:17},W3:{position:'WR',value:83,projection:15},W4:{position:'WR',value:78,projection:14},T1:{position:'TE',value:70,projection:11},
    Q2:{position:'QB',value:74,projection:17},R3:{position:'RB',value:88,projection:17},R4:{position:'RB',value:82,projection:15},R5:{position:'RB',value:76,projection:13},
    W5:{position:'WR',value:48,projection:8},W6:{position:'WR',value:44,projection:7},T2:{position:'TE',value:69,projection:10}
  };
  return{snapshot,values};
}

test('Trade Hunter delegates final opportunities to Trade Analyzer and never returns HURTS_TEAM',()=>{
  const {snapshot,values}=fixture();
  const trades=findTradeOpportunities(snapshot,'1',values);
  assert.ok(trades.length>0);
  for(const trade of trades){
    assert.equal(trade.analysis.valid,true);
    assert.ok(trade.analysis.fairness);
    assert.ok(trade.analysis.rosterBenefit);
    assert.notEqual(trade.analysis.rosterBenefit.label,'HURTS_TEAM');
    assert.deepEqual(trade.fairness,trade.analysis.fairness);
    assert.deepEqual(trade.rosterBenefit,trade.analysis.rosterBenefit);
    assert.deepEqual(trade.deltas,trade.analysis.deltas);
  }
});

test('Trade Hunter ranks accepted deals by roster-benefit composite edge before confidence',()=>{
  const {snapshot,values}=fixture();
  const trades=findTradeOpportunities(snapshot,'1',values);
  for(let i=1;i<trades.length;i+=1){
    const previous=trades[i-1];
    const current=trades[i];
    assert.ok(previous.rosterBenefit.compositeEdge>=current.rosterBenefit.compositeEdge || previous.confidence>=current.confidence);
  }
});

test('Trade Hunter source depends on the pure Trade Analyzer rather than duplicating before-after scoring',()=>{
  const source=fs.readFileSync(path.join(root,'season-core/trade-hunter.js'),'utf8');
  assert.match(source,/require\('\.\/trade-analyzer'\)/);
  assert.match(source,/tradeAnalyzer\.analyzeTrade/);
  assert.match(source,/HURTS_TEAM/);
});
