const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeLeagueSnapshot}=require('../season-core/contracts');
const {findTradeOpportunities}=require('../season-core/trade-hunter');

const slots=[
 {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
 {id:'RB',type:'RB',count:2,eligiblePositions:['RB'],isBench:false,isReserve:false},
 {id:'WR',type:'WR',count:2,eligiblePositions:['WR'],isBench:false,isReserve:false},
 {id:'TE',type:'TE',count:1,eligiblePositions:['TE'],isBench:false,isReserve:false},
 {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
 {id:'BN',type:'BN',count:5,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
];

test('canonical season rosters preserve Sleeper owner and team labels',()=>{
 const s=normalizeLeagueSnapshot({league:{leagueId:'L',platform:'sleeper',season:2026,teams:2,rosterSlots:slots},rosters:[{rosterId:'1',ownerId:'U1',ownerName:'Brett',teamName:'Cactus Crushers',playerIds:[]},{rosterId:'3',ownerId:'U3',ownerName:'WestStep',teamName:'WestStep',playerIds:[]}],playerPool:[],freshness:{status:'fresh'}});
 const other=s.rosters.find(r=>r.rosterId==='3');
 assert.equal(other.ownerName,'WestStep');
 assert.equal(other.teamName,'WestStep');
});

test('trade recommendation uses counterpart team label instead of raw roster number',()=>{
 const rosters=[{rosterId:'1',ownerName:'Brett',teamName:'Cactus Crushers',playerIds:['Q1','R1','R2','W1','W2','W3','W4','T1']},{rosterId:'3',ownerName:'WestStep',teamName:'WestStep',playerIds:['Q2','R3','R4','R5','W5','W6','T2']}];
 const s=normalizeLeagueSnapshot({league:{leagueId:'L',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},rosterSlots:slots},week:2,myRosterId:'1',rosters,playerPool:rosters.flatMap(r=>r.playerIds).map(id=>({id})),freshness:{status:'fresh'}});
 const v={Q1:{name:'Kirk Cousins',position:'QB',value:75,projection:18},R1:{position:'RB',value:48,projection:9},R2:{position:'RB',value:46,projection:8},W1:{position:'WR',value:92,projection:18},W2:{position:'WR',value:88,projection:17},W3:{position:'WR',value:83,projection:15},W4:{position:'WR',value:78,projection:14},T1:{position:'TE',value:70,projection:11},Q2:{position:'QB',value:74,projection:17},R3:{name:'David Montgomery',position:'RB',value:88,projection:17},R4:{position:'RB',value:82,projection:15},R5:{position:'RB',value:76,projection:13},W5:{position:'WR',value:48,projection:8},W6:{position:'WR',value:44,projection:7},T2:{position:'TE',value:69,projection:10}};
 const trades=findTradeOpportunities(s,'1',v);
 assert.ok(trades.length>0);
 assert.equal(trades[0].counterpartLabel,'WestStep');
 assert.match(trades[0].reason,/WestStep/);
 assert.doesNotMatch(trades[0].reason,/from roster 3/i);
});

test('Season Intelligence says TRADE FOR instead of GET for recommendations',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','season-intelligence.js'),'utf8');
 assert.match(src,/→ TRADE FOR/);
 assert.match(src,/→ Trade for/);
});
