(function (root, factory) {
  const playerStatus = typeof module === 'object' && module.exports
    ? require('./player-status')
    : root.FFMPlayerStatus;
  const api = factory(playerStatus);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMLineupOptimizer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (playerStatus) {
  'use strict';

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function canonicalPosition(value) {
    const position = text(value).toUpperCase();
    return position === 'DEF' ? 'DST' : position;
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function round(value, digits = 2) {
    const p = 10 ** digits;
    return Math.round((num(value) + Number.EPSILON) * p) / p;
  }

  function valueMap(playerValues) {
    if (Array.isArray(playerValues)) {
      return new Map(playerValues.map(player => [text(player?.id || player?.playerId), player]).filter(([id]) => id));
    }
    return new Map(Object.entries(playerValues && typeof playerValues === 'object' ? playerValues : {}));
  }

  function expandStarterSlots(rosterSlots) {
    const expanded = [];
    for (const slot of Array.isArray(rosterSlots) ? rosterSlots : []) {
      if (slot?.isBench || slot?.isReserve) continue;
      const count = Math.max(0, Math.trunc(num(slot?.count)));
      const eligible = [...new Set((Array.isArray(slot?.eligiblePositions) ? slot.eligiblePositions : [slot?.type])
        .map(canonicalPosition).filter(Boolean))];
      for (let i = 0; i < count; i += 1) {
        expanded.push({
          slotId:`${text(slot?.id || slot?.type)}:${i + 1}`,
          slotType:canonicalPosition(slot?.type || slot?.id),
          eligiblePositions:eligible
        });
      }
    }
    return expanded.sort((a,b)=>a.eligiblePositions.length-b.eligiblePositions.length || a.slotId.localeCompare(b.slotId));
  }

  function buildPlayer(playerId, raw, snapshot) {
    const position = canonicalPosition(raw?.position);
    const projection = num(raw?.projection, num(raw?.value, 0));
    const normalizedStatus = playerStatus?.normalizePlayerStatus
      ? playerStatus.normalizePlayerStatus(snapshot?.playerStatuses?.[playerId] || {})
      : { category:'UNKNOWN', label:'Unknown', available:true, severity:0.55 };
    const risk = playerStatus?.statusRisk
      ? playerStatus.statusRisk(normalizedStatus, snapshot?.freshness || {})
      : { risk:num(normalizedStatus.severity), confidenceMultiplier:1, available:normalizedStatus.available !== false };
    const known = normalizedStatus.category !== 'UNKNOWN';
    const availability = normalizedStatus.available !== false;
    const scorePenalty = known ? risk.risk * 0.25 : 0;
    return {
      playerId,
      name:text(raw?.name) || playerId,
      position,
      projection:round(projection),
      lineupScore:round(projection * (1 - scorePenalty)),
      status:normalizedStatus.category,
      statusLabel:normalizedStatus.label || normalizedStatus.category,
      available:availability,
      risk:round(risk.risk),
      confidence:round(100 * num(risk.confidenceMultiplier, 0.5), 1)
    };
  }

  function optimizeLineup(snapshot, rosterId, playerValues) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('Lineup Optimizer requires a LeagueSnapshot');
    const id = text(rosterId);
    const roster = (Array.isArray(snapshot.rosters) ? snapshot.rosters : []).find(item=>text(item?.rosterId)===id);
    if (!roster) throw new Error(`Lineup Optimizer could not find roster ${id || '(blank)'}`);

    const values = valueMap(playerValues);
    const players = (Array.isArray(roster.playerIds) ? roster.playerIds : [])
      .map(text).filter(Boolean)
      .map(playerId=>buildPlayer(playerId, values.get(playerId) || {}, snapshot))
      .filter(player=>player.position)
      .sort((a,b)=>b.lineupScore-a.lineupScore || b.projection-a.projection || a.playerId.localeCompare(b.playerId));

    const starterSlots = expandStarterSlots(snapshot?.league?.rosterSlots);
    const used = new Set();
    const starters = [];

    for (const slot of starterSlots) {
      const candidate = players.find(player => !used.has(player.playerId) && player.available && slot.eligiblePositions.includes(player.position));
      if (!candidate) continue;
      used.add(candidate.playerId);
      starters.push(Object.freeze({
        slotId:slot.slotId,
        slotType:slot.slotType,
        eligiblePositions:Object.freeze([...slot.eligiblePositions]),
        playerId:candidate.playerId,
        name:candidate.name,
        position:candidate.position,
        expectedPoints:candidate.projection,
        lineupScore:candidate.lineupScore,
        status:candidate.status,
        risk:candidate.risk,
        confidence:candidate.confidence
      }));
    }

    const bench = players
      .filter(player=>!used.has(player.playerId))
      .map(player=>Object.freeze({
        playerId:player.playerId,
        name:player.name,
        position:player.position,
        expectedPoints:player.projection,
        lineupScore:player.lineupScore,
        status:player.status,
        risk:player.risk,
        confidence:player.confidence,
        available:player.available
      }));

    const decisions = [];
    for (const starter of starters) {
      const bestAlternative = bench
        .filter(player=>player.available && starter.eligiblePositions.includes(player.position))
        .sort((a,b)=>b.lineupScore-a.lineupScore || b.expectedPoints-a.expectedPoints)[0];
      const edge = round(starter.expectedPoints - num(bestAlternative?.expectedPoints, 0));
      decisions.push(Object.freeze({
        action:'START',
        playerId:starter.playerId,
        slotType:starter.slotType,
        expectedEdge:edge,
        confidence:starter.confidence,
        risk:starter.risk,
        reason:`Start ${starter.name} in ${starter.slotType}: ${starter.expectedPoints} expected points${bestAlternative ? ` versus ${bestAlternative.expectedPoints} for the best bench alternative` : ''}.`
      }));
    }
    for (const player of bench) {
      const samePositionStarter = starters
        .filter(starter=>starter.eligiblePositions.includes(player.position))
        .sort((a,b)=>a.expectedPoints-b.expectedPoints)[0];
      decisions.push(Object.freeze({
        action:'BENCH',
        playerId:player.playerId,
        expectedEdge:round(num(player.expectedPoints)-num(samePositionStarter?.expectedPoints)),
        confidence:player.confidence,
        risk:player.risk,
        reason:player.available
          ? `Bench ${player.name}: the optimized legal lineup has a stronger expected option for the eligible starter slots.`
          : `Bench ${player.name}: ${player.status} status makes the player unavailable for the active lineup.`
      }));
    }

    const contingencies = [];
    for (const starter of starters) {
      if (!['QUESTIONABLE','DOUBTFUL'].includes(starter.status)) continue;
      const backup = bench
        .filter(player=>player.available && starter.eligiblePositions.includes(player.position))
        .sort((a,b)=>b.lineupScore-a.lineupScore || b.expectedPoints-a.expectedPoints)[0];
      if (!backup) continue;
      contingencies.push(Object.freeze({
        starterPlayerId:starter.playerId,
        backupPlayerId:backup.playerId,
        status:starter.status,
        trigger:`If ${starter.name} is ruled inactive or materially downgraded before lock`,
        reason:`${starter.name} is ${starter.statusLabel}; ${backup.name} is the best legal fallback at ${backup.expectedPoints} expected points.`
      }));
    }

    return Object.freeze({
      rosterId:id,
      starters:Object.freeze(starters),
      bench:Object.freeze(bench),
      decisions:Object.freeze(decisions),
      contingencies:Object.freeze(contingencies),
      expectedTotal:round(starters.reduce((sum,starter)=>sum+starter.expectedPoints,0)),
      filledStarterSlots:starters.length,
      requiredStarterSlots:starterSlots.length,
      legal:starters.length === starterSlots.length
    });
  }

  return { optimizeLineup, expandStarterSlots };
});
