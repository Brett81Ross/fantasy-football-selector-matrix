const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBridge() {
  const source = fs.readFileSync(path.resolve(__dirname, '../draft-state-render-bridge.js'), 'utf8');
  let listener = null;
  let renders = 0;
  const storage = new Map();
  const context = {
    state: { drafted: new Set(['OLD']), picksUntilNext: 9 },
    localStorage: { setItem(key,value){ storage.set(key,value); } },
    requestAnimationFrame(fn){ fn(); },
    window: {
      addEventListener(name,fn){ if(name==='ffm:draft-state') listener=fn; },
      renderAll(){ renders += 1; }
    }
  };
  vm.runInNewContext(source, context);
  return { context, storage, emit(detail){ listener({detail}); }, renders:()=>renders };
}

test('canonical draft event synchronizes legacy drafted roster and pick distance before rendering', () => {
  const h = loadBridge();
  h.emit({
    draftedPlayerIds:['A','B'],
    myRoster:[{playerId:'A'},{playerId:'C'}],
    picksUntilMyNext:2
  });
  assert.deepEqual([...h.context.state.drafted], ['A','B']);
  assert.equal(h.context.state.picksUntilNext, 2);
  assert.deepEqual(JSON.parse(h.storage.get('ffm-fast-drafted')), ['A','B']);
  assert.deepEqual(JSON.parse(h.storage.get('ffm-fast-my-roster')), ['A','C']);
  assert.equal(h.renders(), 1);
});

test('null canonical event does not erase manual draft state', () => {
  const h = loadBridge();
  h.emit(null);
  assert.deepEqual([...h.context.state.drafted], ['OLD']);
  assert.equal(h.context.state.picksUntilNext, 9);
  assert.equal(h.renders(), 1);
});