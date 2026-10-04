const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Weekly Attack Plan never promotes vague opponent attack language as an action',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../season-core/weekly-attack-plan.js'),'utf8');
 assert.match(source,/opponentAction\.type!=='ATTACK_WEAK_POSITION'/);
 assert.doesNotMatch(source,/type:'OPPONENT'[^\n]+reason:opponent\.actions\[0\]\.reason/);
});

test('Weekly Attack Plan has an explicit no-move state instead of filler',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../season-core/weekly-attack-plan.js'),'utf8');
 assert.match(source,/type:'NO_MOVE'/);
 assert.match(source,/No specific roster move is supported/);
});
