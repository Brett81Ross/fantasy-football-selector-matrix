(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMFeatureEntitlements=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const PRO=Object.freeze({
    MATCHUP_SIMULATOR_ADVANCED:'ffm.matchup_simulator.advanced',
    FAAB_BID_OPTIMIZER:'ffm.waiver.faab_bid_optimizer',
    WHAT_IF_MATRIX:'ffm.what_if_matrix',
    TRADE_ANALYZER_ADVANCED:'ffm.trade_analyzer.advanced',
    PLAYOFF_PATH:'ffm.playoff_path'
  });

  const CORE=Object.freeze({
    LIVE_DATA:'ffm.live_data',
    OWNERSHIP_SYNC:'ffm.ownership_sync',
    BASIC_RANKINGS:'ffm.basic_rankings',
    DATA_HEALTH:'ffm.data_health',
    INJURY_COMMAND_CENTER:'ffm.injury_command_center',
    LINEUP_SAFETY:'ffm.lineup_safety'
  });

  const FEATURE_IDS=Object.freeze({PRO,CORE});

  const PRO_CANDIDATES=Object.freeze([
    Object.freeze({id:PRO.MATCHUP_SIMULATOR_ADVANCED,name:'Matchup Simulator™ Advanced',tier:'pro-candidate',enforced:false}),
    Object.freeze({id:PRO.FAAB_BID_OPTIMIZER,name:'FAAB / Waiver Bid Optimizer',tier:'pro-candidate',enforced:false}),
    Object.freeze({id:PRO.WHAT_IF_MATRIX,name:'What-If Matrix™',tier:'pro-candidate',enforced:false}),
    Object.freeze({id:PRO.TRADE_ANALYZER_ADVANCED,name:'Trade Analyzer™ Advanced',tier:'pro-candidate',enforced:false}),
    Object.freeze({id:PRO.PLAYOFF_PATH,name:'Playoff Path™',tier:'pro-candidate',enforced:false})
  ]);

  const CORE_UNGATED=Object.freeze([
    Object.freeze({id:CORE.LIVE_DATA,name:'Live Data',tier:'core',enforced:false}),
    Object.freeze({id:CORE.OWNERSHIP_SYNC,name:'Ownership Sync',tier:'core',enforced:false}),
    Object.freeze({id:CORE.BASIC_RANKINGS,name:'Basic Rankings',tier:'core',enforced:false}),
    Object.freeze({id:CORE.DATA_HEALTH,name:'Data Health',tier:'core',enforced:false}),
    Object.freeze({id:CORE.INJURY_COMMAND_CENTER,name:'Injury Command Center',tier:'core',enforced:false}),
    Object.freeze({id:CORE.LINEUP_SAFETY,name:'Lineup Safety',tier:'core',enforced:false})
  ]);

  const descriptors=new Map([...CORE_UNGATED,...PRO_CANDIDATES].map(item=>[item.id,item]));
  function getFeatureDescriptor(id){return descriptors.get(String(id||''))||null;}

  return Object.freeze({FEATURE_IDS,PRO_CANDIDATES,CORE_UNGATED,getFeatureDescriptor});
});
