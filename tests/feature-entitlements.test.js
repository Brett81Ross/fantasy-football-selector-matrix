const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Pro candidate feature IDs are exact stable and unique',()=>{
  const {FEATURE_IDS,PRO_CANDIDATES}=require('../season-core/feature-entitlements');
  assert.deepEqual(FEATURE_IDS.PRO,{
    MATCHUP_SIMULATOR_ADVANCED:'ffm.matchup_simulator.advanced',
    FAAB_BID_OPTIMIZER:'ffm.waiver.faab_bid_optimizer',
    WHAT_IF_MATRIX:'ffm.what_if_matrix',
    TRADE_ANALYZER_ADVANCED:'ffm.trade_analyzer.advanced',
    PLAYOFF_PATH:'ffm.playoff_path'
  });
  const ids=PRO_CANDIDATES.map(item=>item.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual(ids,Object.values(FEATURE_IDS.PRO));
});

test('safety-critical and foundational features stay explicitly core and ungated',()=>{
  const {FEATURE_IDS,CORE_UNGATED,PRO_CANDIDATES}=require('../season-core/feature-entitlements');
  assert.deepEqual(FEATURE_IDS.CORE,{
    LIVE_DATA:'ffm.live_data',
    OWNERSHIP_SYNC:'ffm.ownership_sync',
    BASIC_RANKINGS:'ffm.basic_rankings',
    DATA_HEALTH:'ffm.data_health',
    INJURY_COMMAND_CENTER:'ffm.injury_command_center',
    LINEUP_SAFETY:'ffm.lineup_safety'
  });
  const coreIds=CORE_UNGATED.map(item=>item.id);
  assert.deepEqual(coreIds,Object.values(FEATURE_IDS.CORE));
  const proIds=new Set(PRO_CANDIDATES.map(item=>item.id));
  for(const id of coreIds)assert.equal(proIds.has(id),false,`${id} must never be a Pro candidate`);
});

test('feature registry and descriptors are immutable metadata',()=>{
  const registry=require('../season-core/feature-entitlements');
  assert.equal(Object.isFrozen(registry.FEATURE_IDS),true);
  assert.equal(Object.isFrozen(registry.FEATURE_IDS.PRO),true);
  assert.equal(Object.isFrozen(registry.PRO_CANDIDATES),true);
  assert.equal(Object.isFrozen(registry.CORE_UNGATED),true);
  for(const item of [...registry.PRO_CANDIDATES,...registry.CORE_UNGATED])assert.equal(Object.isFrozen(item),true);
  const descriptor=registry.getFeatureDescriptor('ffm.what_if_matrix');
  assert.deepEqual(descriptor,{id:'ffm.what_if_matrix',name:'What-If Matrix™',tier:'pro-candidate',enforced:false});
  assert.equal(registry.getFeatureDescriptor('missing.feature'),null);
});

test('registry defines no checkout billing entitlement enforcement or external I/O',()=>{
  const src=fs.readFileSync('season-core/feature-entitlements.js','utf8');
  assert.doesNotMatch(src,/fetch\s*\(|stripe|checkout|payment|billing|subscription|price_id|customer_id/i);
  assert.doesNotMatch(src,/isEntitled|requireEntitlement|canAccess|locked\s*:\s*true/i);
  assert.match(src,/enforced\s*:\s*false/);
});

test('every known feature descriptor is deterministic across repeated lookups',()=>{
  const registry=require('../season-core/feature-entitlements');
  for(const item of [...registry.CORE_UNGATED,...registry.PRO_CANDIDATES]){
    assert.deepEqual(registry.getFeatureDescriptor(item.id),registry.getFeatureDescriptor(item.id));
  }
});
