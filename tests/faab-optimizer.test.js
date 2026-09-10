const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeLeagueSnapshot}=require('../season-core/contracts');

function snapshot({budget=100,used=20,teams=12,freshness='fresh',waiverType='faab',free=['ADD','ALT1','ALT2']}={}){
 const mine=['KEEP','DROP'];
 const otherOwned=[];
 const rosters=[{rosterId:'1',playerIds:mine,starterPlayerIds:['KEEP'],waiverBudgetUsed:used,waiverPosition:5}];
 for(let i=2;i<=teams;i++)rosters.push({rosterId:String(i),playerIds:[],starterPlayerIds:[],waiverBudgetUsed:0,waiverPosition:i});
 return normalizeLeagueSnapshot({
  league:{leagueId:'F',platform:'sleeper',season:2026,teams,scoring:{rec:1},rosterSlots:[{id:'RB',type:'RB',count:1,eligiblePositions:['RB'],isBench:false,isReserve:false},{id:'BN',type:'BN',count:4,eligiblePositions:['RB','WR'],isBench:true,isReserve:false}],waiverBudgetTotal:budget,waiverType},
  week:7,myRosterId:'1',rosters,playerPool:[...mine,...otherOwned,...free].map(id=>({id})),playerStatuses:{},freshness:{status:freshness,asOf:'2026-09-10T13:00:00.000Z'}
 });
}

const values={
 KEEP:{id:'KEEP',name:'Starter',position:'RB',value:70,projection:16,games:8,metrics:{consistency:80}},
 DROP:{id:'DROP',name:'Drop',position:'RB',value:38,projection:7,games:8,metrics:{consistency:68}},
 ADD:{id:'ADD',name:'Breakout Back',position:'RB',value:78,projection:18,games:8,metrics:{consistency:76}},
 ALT1:{id:'ALT1',name:'Replacement One',position:'RB',value:52,projection:11,games:8,metrics:{consistency:72}},
 ALT2:{id:'ALT2',name:'Replacement Two',position:'RB',value:46,projection:9,games:8,metrics:{consistency:70}}
};

const strongMove={addPlayerId:'ADD',dropPlayerId:'DROP',targetPosition:'RB',classification:'IMMEDIATE',priority:34,expectedImprovement:18,risk:.15,confidence:88};

function engine(){return require('../season-core/faab-optimizer');}

test('stronger roster need and player edge produce a larger recommended bid',()=>{
 const {optimizeFaabBid}=engine();
 const strong=optimizeFaabBid(snapshot(),'1',strongMove,values,{rosterReport:{positionalGrades:{RB:42}}});
 const weak=optimizeFaabBid(snapshot(),'1',{...strongMove,expectedImprovement:5,priority:12},values,{rosterReport:{positionalGrades:{RB:78}}});
 assert.equal(strong.available,true);
 assert.ok(strong.recommendedBid>weak.recommendedBid,`${strong.recommendedBid} !> ${weak.recommendedBid}`);
 assert.ok(strong.factors.need>weak.factors.need);
 assert.ok(strong.factors.valueEdge>=weak.factors.valueEdge);
});

test('scarcer waiver position raises the bid when the target is otherwise identical',()=>{
 const {optimizeFaabBid}=engine();
 const scarce=optimizeFaabBid(snapshot({free:['ADD','ALT1','ALT2']}),'1',strongMove,values,{rosterReport:{positionalGrades:{RB:55}}});
 const deepValues={...values,ALT1:{...values.ALT1,value:76,projection:17},ALT2:{...values.ALT2,value:74,projection:16}};
 const deep=optimizeFaabBid(snapshot({free:['ADD','ALT1','ALT2']}),'1',strongMove,deepValues,{rosterReport:{positionalGrades:{RB:55}}});
 assert.ok(scarce.factors.scarcity>deep.factors.scarcity);
 assert.ok(scarce.recommendedBid>deep.recommendedBid);
});

test('larger leagues create more bidding pressure than otherwise identical smaller leagues',()=>{
 const {optimizeFaabBid}=engine();
 const twelve=optimizeFaabBid(snapshot({teams:12}),'1',strongMove,values,{});
 const eight=optimizeFaabBid(snapshot({teams:8}),'1',strongMove,values,{});
 assert.ok(twelve.factors.leaguePressure>eight.factors.leaguePressure);
 assert.ok(twelve.recommendedBid>=eight.recommendedBid);
});

test('remaining budget is a hard cap and bid range is internally consistent',()=>{
 const {optimizeFaabBid}=engine();
 const result=optimizeFaabBid(snapshot({budget:100,used:93}),'1',strongMove,values,{rosterReport:{positionalGrades:{RB:35}}});
 assert.equal(result.budgetRemaining,7);
 assert.ok(result.recommendedBid<=7);
 assert.ok(result.minBid<=result.recommendedBid);
 assert.ok(result.maxBid>=result.recommendedBid);
 assert.ok(result.maxBid<=7);
});

test('unknown or non-FAAB budgets never fabricate a dollar recommendation',()=>{
 const {optimizeFaabBid}=engine();
 const unknown=optimizeFaabBid(snapshot({budget:null,waiverType:'unknown'}),'1',strongMove,values,{});
 const rolling=optimizeFaabBid(snapshot({budget:100,waiverType:'rolling'}),'1',strongMove,values,{});
 for(const result of [unknown,rolling]){
  assert.equal(result.available,false);
  assert.equal(result.recommendedBid,null);
  assert.equal(result.minBid,null);
  assert.equal(result.maxBid,null);
 }
});

test('stale league data lowers confidence without silently changing the budget',()=>{
 const {optimizeFaabBid}=engine();
 const fresh=optimizeFaabBid(snapshot({freshness:'fresh'}),'1',strongMove,values,{});
 const stale=optimizeFaabBid(snapshot({freshness:'stale'}),'1',strongMove,values,{});
 assert.ok(stale.confidence<fresh.confidence);
 assert.equal(stale.budgetRemaining,fresh.budgetRemaining);
});

test('output explains the factors and never mutates snapshot move values or context',()=>{
 const {optimizeFaabBid}=engine();
 const s=snapshot(),move=structuredClone(strongMove),v=structuredClone(values),context={rosterReport:{positionalGrades:{RB:48}}};
 const before=[JSON.stringify(s),JSON.stringify(move),JSON.stringify(v),JSON.stringify(context)];
 const result=optimizeFaabBid(s,'1',move,v,context);
 assert.equal(typeof result.budgetShare,'number');
 assert.ok(['CONSERVATIVE','BALANCED','AGGRESSIVE','MAXIMUM_EDGE'].includes(result.aggressiveness));
 assert.equal(typeof result.risk,'number');
 assert.ok(result.reason.length>40);
 assert.deepEqual([JSON.stringify(s),JSON.stringify(move),JSON.stringify(v),JSON.stringify(context)],before);
});
