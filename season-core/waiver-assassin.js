(function (root, factory) {
  const rosterDoctor = typeof module === 'object' && module.exports ? require('./roster-doctor') : root.FFMRosterDoctor;
  const lineupOptimizer = typeof module === 'object' && module.exports ? require('./lineup-optimizer') : root.FFMLineupOptimizer;
  const playerStatus = typeof module === 'object' && module.exports ? require('./player-status') : root.FFMPlayerStatus;
  const api = factory(rosterDoctor, lineupOptimizer, playerStatus);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMWaiverAssassin = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rosterDoctor, lineupOptimizer, playerStatus) {
  'use strict';

  const text = value => value == null ? '' : String(value).trim();
  const num = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const round = (value, digits=2) => { const p=10**digits; return Math.round((num(value)+Number.EPSILON)*p)/p; };
  const pos = value => { const p=text(value).toUpperCase(); return p==='DEF'?'DST':p; };

  function mapValues(values) {
    if (Array.isArray(values)) return new Map(values.map(v=>[text(v?.id||v?.playerId),v]).filter(([id])=>id));
    return new Map(Object.entries(values && typeof values==='object' ? values : {}));
  }

  function playerRecord(id, values, snapshot) {
    const raw=values.get(id)||{};
    const normalized=playerStatus.normalizePlayerStatus(snapshot?.playerStatuses?.[id]||{});
    const risk=playerStatus.statusRisk(normalized,snapshot?.freshness||{});
    return {
      id,
      name:text(raw.name)||id,
      position:pos(raw.position),
      value:num(raw.value,num(raw.projection)),
      projection:num(raw.projection,num(raw.value)),
      status:normalized.category,
      statusLabel:normalized.label,
      available:normalized.available,
      risk:risk.risk,
      confidence:round(risk.confidenceMultiplier*100,1)
    };
  }

  function classification(player) {
    if (['IR','PUP'].includes(player.status)) return 'STASH';
    if (['K','DST'].includes(player.position)) return 'STREAMER';
    return 'IMMEDIATE';
  }

  function snapshotAfterSwap(snapshot, rosterId, dropId, addId) {
    return {
      ...snapshot,
      rosters:(snapshot.rosters||[]).map(roster => text(roster.rosterId)!==rosterId ? roster : {
        ...roster,
        playerIds:[...(roster.playerIds||[]).filter(id=>text(id)!==dropId), addId],
        starterPlayerIds:(roster.starterPlayerIds||[]).filter(id=>text(id)!==dropId),
        reservePlayerIds:(roster.reservePlayerIds||[]).filter(id=>text(id)!==dropId)
      })
    };
  }

  function chooseDrop(snapshot, rosterId, add, rosterPlayers, lineup, playerValues, cls) {
    let best=null;
    for (const drop of rosterPlayers) {
      if (drop.id===add.id) continue;
      if (cls==='STASH') {
        const score=-(drop.value+drop.projection*2);
        if (!best || score>best.score) best={drop,score,lineupDelta:0};
        continue;
      }
      const simulated=snapshotAfterSwap(snapshot,rosterId,drop.id,add.id);
      let next;
      try { next=lineupOptimizer.optimizeLineup(simulated,rosterId,playerValues); }
      catch (_) { continue; }
      if (next.filledStarterSlots < lineup.filledStarterSlots) continue;
      const lineupDelta=round(next.expectedTotal-lineup.expectedTotal,2);
      const seasonDelta=add.value-drop.value;
      const score=round(lineupDelta*2 + seasonDelta*0.45,2);
      if (!best || score>best.score || (score===best.score && drop.value<best.drop.value)) {
        best={drop,score,lineupDelta};
      }
    }
    return best;
  }

  function rankWaiverMoves(snapshot, rosterId, playerValues, context={}) {
    const id=text(rosterId);
    const roster=(snapshot?.rosters||[]).find(r=>text(r.rosterId)===id);
    if (!roster) throw new Error(`Waiver Assassin could not find roster ${id||'(blank)'}`);
    const values=mapValues(playerValues);
    const report=context.rosterReport || rosterDoctor.evaluateRoster(snapshot,id,playerValues);
    const lineup=context.lineup || lineupOptimizer.optimizeLineup(snapshot,id,playerValues);
    const weaknessGrade=new Map((report.weaknesses||[]).map(w=>[w.position,num(w.grade,100)]));
    const rosterPlayers=(roster.playerIds||[]).map(text).filter(Boolean).map(pid=>playerRecord(pid,values,snapshot));
    const freeAgentSet=new Set(snapshot?.freeAgentPlayerIds||[]);
    const candidates=[...freeAgentSet].map(pid=>playerRecord(pid,values,snapshot)).filter(p=>p.position);
    const moves=[];

    for (const add of candidates) {
      const cls=classification(add);
      const choice=chooseDrop(snapshot,id,add,rosterPlayers,lineup,playerValues,cls);
      if (!choice) continue;
      const drop=choice.drop;
      const seasonDelta=add.value-drop.value;
      const weeklyDelta=add.projection-drop.projection;
      const grade=weaknessGrade.has(add.position) ? weaknessGrade.get(add.position) : num(report.positionalGrades?.[add.position],75);
      const needBonus=Math.max(0,70-grade)*0.55;
      const statusPenalty=add.risk*24 + (cls==='STASH'?12:0);
      const expectedImprovement=round(seasonDelta*0.45 + choice.lineupDelta*2 + needBonus - statusPenalty,2);
      if (expectedImprovement <= -8 && cls!=='STASH') continue;
      const confidence=round(Math.max(0,Math.min(100,add.confidence)),1);
      const priority=round(expectedImprovement + confidence*0.08 - add.risk*10,2);
      moves.push(Object.freeze({
        addPlayerId:add.id,
        dropPlayerId:drop.id,
        targetPosition:add.position,
        classification:cls,
        aggressiveness:'MAXIMUM_EDGE',
        priority,
        expectedImprovement,
        risk:round(add.risk),
        confidence,
        reason:cls==='STASH'
          ? `Stash ${add.name} (${add.statusLabel}) only for future upside; drop ${drop.name} if reserve capacity and roster strategy justify the wait.`
          : `Add ${add.name} and drop ${drop.name}: the swap improves the optimized weekly lineup by ${round(choice.lineupDelta,1)} points and changes season value by ${round(seasonDelta,1)}.`
      }));
    }

    return Object.freeze(moves.sort((a,b)=>b.priority-a.priority || b.expectedImprovement-a.expectedImprovement || a.addPlayerId.localeCompare(b.addPlayerId)));
  }

  return { rankWaiverMoves };
});
