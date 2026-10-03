const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Team Command gives dedicated injury card authority over duplicate STATUS action',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../season-intelligence.js'),'utf8');
 assert.match(source,/const injuryPlayerIds=new Set/);
 assert.match(source,/a\.type!=='STATUS'\|\|!injuryPlayerIds\.has/);
 assert.match(source,/\.slice\(0,3\)/);
});

test('Team Command keeps newly dropped and waiver decisions eligible for top-three attention',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../season-intelligence.js'),'utf8');
 assert.match(source,/\['NEWLY_DROPPED','WAIVER','LINEUP','STATUS','NO_MOVE'\]/);
 assert.match(source,/NEWLY AVAILABLE · SLEEPER/);
});
