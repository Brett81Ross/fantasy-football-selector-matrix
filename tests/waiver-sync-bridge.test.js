const test = require('node:test');
const assert = require('node:assert/strict');
const { getSyncedWaiverCandidates } = require('../waiver-sync-bridge');
const players=[
{id:'QB-MINE',name:'My QB',games:10,metrics:{opportunity:80,tov:90,trend:70,ceiling:85}},
{id:'OWNED-OTHER',name:'Owned by opponent',games:10,metrics:{opportunity:80,tov:95,trend:80,ceiling:90}},
{id:'FREE-1',name:'Actual free agent',games:10,metrics:{opportunity:70,tov:75,trend:65,ceiling:80}}
];
const snapshot={myRosterId:'1',rosters:[{rosterId:'1',playerIds:['QB-MINE']},{rosterId:'2',playerIds:['OWNED-OTHER']}],freeAgentPlayerIds:['FREE-1']};
test('synced waiver list includes only canonical free agents',()=>{assert.deepEqual(getSyncedWaiverCandidates(players,snapshot).map(p=>p.id),['FREE-1']);});
test('synced waiver list never includes owned players',()=>{const ids=new Set(getSyncedWaiverCandidates(players,snapshot).map(p=>p.id));assert.equal(ids.has('QB-MINE'),false);assert.equal(ids.has('OWNED-OTHER'),false);});