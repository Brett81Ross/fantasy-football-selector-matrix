(function (root, factory) {
  const playerStatus = typeof module === 'object' && module.exports
    ? require('./player-status')
    : root.FFMPlayerStatus;
  const api = factory(playerStatus);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMRosterDoctor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (playerStatus) {
  'use strict';

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
  }

  function round(value, digits = 1) {
    const p = 10 ** digits;
    return Math.round((Number(value) || 0) * p) / p;
  }

  function canonicalPosition(value) {
    const position = text(value).toUpperCase();
    return position === 'DEF' ? 'DST' : position;
  }

  function normalizeValueMap(playerValues) {
    if (Array.isArray(playerValues)) {
      return new Map(playerValues.map(player => [text(player?.id || player?.playerId), player]).filter(([id]) => id));
    }
    if (playerValues && typeof playerValues === 'object') return new Map(Object.entries(playerValues));
    return new Map();
  }

  function positionDemand(rosterSlots) {
    const fixed = {};
    const flexible = [];
    let flexibleStarterSlots = 0;
    let totalStarterSlots = 0;

    for (const slot of Array.isArray(rosterSlots) ? rosterSlots : []) {
      if (slot?.isBench || slot?.isReserve) continue;
      const count = Math.max(0, Number(slot?.count) || 0);
      if (!count) continue;
      totalStarterSlots += count;
      const eligible = [...new Set((Array.isArray(slot?.eligiblePositions) ? slot.eligiblePositions : [])
        .map(canonicalPosition).filter(Boolean))];
      const type = canonicalPosition(slot?.type);
      const isFlexible = eligible.length > 1;
      if (isFlexible) {
        flexibleStarterSlots += count;
        flexible.push({ type, count, eligiblePositions:eligible });
      } else {
        const position = eligible[0] || type;
        if (position) fixed[position] = (fixed[position] || 0) + count;
      }
    }

    const positionWeights = { ...fixed };
    for (const slot of flexible) {
      const share = slot.eligiblePositions.length ? slot.count / slot.eligiblePositions.length : 0;
      for (const position of slot.eligiblePositions) {
        positionWeights[position] = (positionWeights[position] || 0) + share;
      }
    }

    return { fixed, flexible, flexibleStarterSlots, totalStarterSlots, positionWeights };
  }

  function evaluateRoster(snapshot, rosterId, playerValues) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('Roster Doctor requires a LeagueSnapshot');
    const id = text(rosterId);
    const roster = (Array.isArray(snapshot.rosters) ? snapshot.rosters : []).find(item => text(item?.rosterId) === id);
    if (!roster) throw new Error(`Roster Doctor could not find roster ${id || '(blank)'}`);

    const values = normalizeValueMap(playerValues);
    const demand = positionDemand(snapshot?.league?.rosterSlots);
    const reserve = new Set(Array.isArray(roster.reservePlayerIds) ? roster.reservePlayerIds : []);
    const rosterPlayerIds = [...new Set(Array.isArray(roster.playerIds) ? roster.playerIds.map(text).filter(Boolean) : [])];
    const groups = new Map();
    const flaggedPlayerIds = [];
    const unknownStatusPlayerIds = [];
    let knownRiskTotal = 0;
    let knownRiskCount = 0;

    for (const playerId of rosterPlayerIds) {
      const data = values.get(playerId) || {};
      const position = canonicalPosition(data?.position);
      if (!position) continue;
      const baseValue = clamp(data?.value ?? data?.projection ?? 0);
      const rawStatus = snapshot?.playerStatuses?.[playerId];
      const normalizedStatus = playerStatus?.normalizePlayerStatus
        ? playerStatus.normalizePlayerStatus(rawStatus || {})
        : { category:'UNKNOWN', severity:0.55, available:true };
      const risk = playerStatus?.statusRisk
        ? playerStatus.statusRisk(normalizedStatus, snapshot.freshness || {})
        : { risk:normalizedStatus.severity || 0, confidenceMultiplier:1 };
      const known = normalizedStatus.category !== 'UNKNOWN';
      if (known) {
        knownRiskTotal += risk.risk;
        knownRiskCount += 1;
        if (normalizedStatus.category !== 'ACTIVE') flaggedPlayerIds.push(playerId);
      } else {
        unknownStatusPlayerIds.push(playerId);
      }
      const healthPenalty = known ? risk.risk * 0.4 : 0;
      const adjustedValue = clamp(baseValue * (1 - healthPenalty));
      if (!groups.has(position)) groups.set(position, []);
      groups.get(position).push({
        playerId,
        position,
        value:baseValue,
        adjustedValue,
        byeWeek:Number(data?.byeWeek) || null,
        reserve:reserve.has(playerId),
        status:normalizedStatus.category
      });
    }

    const positions = [...new Set([...Object.keys(demand.positionWeights), ...groups.keys()])];
    const positionalGrades = {};
    const details = [];

    for (const position of positions) {
      const players = (groups.get(position) || []).slice().sort((a,b)=>b.adjustedValue-a.adjustedValue);
      const weight = Number(demand.positionWeights[position]) || 0;
      const target = Math.max(1, Math.ceil(weight));
      const starterValues = players.slice(0, target).map(player => player.adjustedValue);
      while (starterValues.length < target) starterValues.push(0);
      const starterGrade = starterValues.reduce((sum,value)=>sum+value,0) / target;
      const depthPlayers = players.slice(target).filter(player=>!player.reserve);
      const depthBonus = Math.min(8, depthPlayers.reduce((sum,player)=>sum + Math.max(0, player.adjustedValue - 50) / 15, 0));
      const grade = round(clamp(starterGrade + depthBonus), 1);
      positionalGrades[position] = grade;
      details.push({
        position,
        grade,
        playerCount:players.length,
        starterTarget:target,
        demandWeight:round(weight,2),
        bestPlayerId:players[0]?.playerId || null
      });
    }

    const weighted = details.filter(item=>item.demandWeight > 0);
    const totalWeight = weighted.reduce((sum,item)=>sum+item.demandWeight,0);
    const overallGrade = round(totalWeight
      ? weighted.reduce((sum,item)=>sum + item.grade * item.demandWeight,0) / totalWeight
      : (details.length ? details.reduce((sum,item)=>sum+item.grade,0)/details.length : 0), 1);

    const weaknesses = details
      .filter(item=>item.demandWeight > 0 && item.grade < 70)
      .sort((a,b)=>a.grade-b.grade)
      .map(item=>({ position:item.position, grade:item.grade, need:round(100-item.grade,1), reason:`${item.position} grades ${item.grade}/100 against this league's starter demand.` }));
    const strengths = details
      .filter(item=>item.grade >= 80)
      .sort((a,b)=>b.grade-a.grade)
      .map(item=>({ position:item.position, grade:item.grade, reason:`${item.position} is a roster strength at ${item.grade}/100.` }));

    const surplus = [];
    for (const item of details) {
      const players = groups.get(item.position) || [];
      const flexibleCoverage = demand.flexible.some(slot=>slot.eligiblePositions.includes(item.position)) ? 1 : 0;
      const keepTarget = (demand.fixed[item.position] || 0) + flexibleCoverage;
      const excess = Math.max(0, players.length - Math.max(1, keepTarget));
      if (excess > 0) surplus.push({ position:item.position, count:excess, playerCount:players.length, keepTarget:Math.max(1,keepTarget) });
    }
    surplus.sort((a,b)=>b.count-a.count || a.position.localeCompare(b.position));

    const nonReserveCount = rosterPlayerIds.filter(playerId=>!reserve.has(playerId)).length;
    const benchDepthCount = Math.max(0, nonReserveCount - demand.totalStarterSlots);
    const benchDepth = {
      count:benchDepthCount,
      score:round(clamp(demand.totalStarterSlots ? (benchDepthCount / Math.max(1,demand.totalStarterSlots)) * 100 : 0),1)
    };

    const byeCounts = new Map();
    for (const players of groups.values()) {
      for (const player of players) {
        if (player.byeWeek) byeCounts.set(player.byeWeek, (byeCounts.get(player.byeWeek)||0)+1);
      }
    }
    const byeWeeks = [...byeCounts.entries()]
      .map(([week,count])=>({week:Number(week),count}))
      .sort((a,b)=>b.count-a.count || a.week-b.week);
    const peak = byeWeeks[0] || null;
    const byeRisk = {
      score:round(clamp(peak && rosterPlayerIds.length ? (peak.count / rosterPlayerIds.length) * 100 : 0),1),
      peakWeek:peak?.week || null,
      weeks:byeWeeks
    };

    const healthRisk = {
      score:round(clamp(knownRiskCount ? (knownRiskTotal / knownRiskCount) * 100 : 0),1),
      flaggedPlayerIds:Object.freeze([...new Set(flaggedPlayerIds)]),
      unknownStatusPlayerIds:Object.freeze([...new Set(unknownStatusPlayerIds)]),
      statusCoverage:round(rosterPlayerIds.length ? ((rosterPlayerIds.length-unknownStatusPlayerIds.length)/rosterPlayerIds.length)*100 : 0,1)
    };

    return Object.freeze({
      rosterId:id,
      overallGrade,
      positionalGrades:Object.freeze(positionalGrades),
      weaknesses:Object.freeze(weaknesses),
      strengths:Object.freeze(strengths),
      surplus:Object.freeze(surplus),
      benchDepth:Object.freeze(benchDepth),
      healthRisk:Object.freeze(healthRisk),
      byeRisk:Object.freeze(byeRisk),
      demand:Object.freeze({
        fixed:Object.freeze({...demand.fixed}),
        flexible:Object.freeze(demand.flexible.map(slot=>Object.freeze({...slot, eligiblePositions:Object.freeze([...slot.eligiblePositions])}))),
        flexibleStarterSlots:demand.flexibleStarterSlots,
        totalStarterSlots:demand.totalStarterSlots,
        positionWeights:Object.freeze({...demand.positionWeights})
      })
    });
  }

  return { evaluateRoster, positionDemand };
});
