(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMDraftEvaluators = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function playerQuality(player, clampFn) {
    if (!player) return 0;
    const m = player.metrics || {};
    let quality =
      Number(m.production || 0) * 0.34 +
      Number(m.opportunity || 0) * 0.22 +
      Number(m.consistency || 0) * 0.14 +
      Number(m.ceiling || 0) * 0.15 +
      Number(m.trend || 0) * 0.09 +
      Number(m.availability || 0) * 0.06;
    if (player.rookie && Number(player.games || 0) === 0) {
      quality = Math.max(quality, Number(player.draftBase || 0));
    }
    if (player.status && player.status !== 'ACT') quality -= player.status === 'PUP' ? 6 : 3;
    return typeof clampFn === 'function' ? clampFn(quality) : clamp(quality);
  }

  function zeroVorpResult() {
    return {
      vorp: 0,
      waitCost: 0,
      scoreBoost: 0,
      replacement: null,
      replacementRank: 0,
      expectedTaken: 0,
      remainingDemand: 0,
      rosterFactor: 0,
      quality: 0
    };
  }

  function evaluateVorpWait(input) {
    const source = input && typeof input === 'object' ? input : {};
    const player = source.player;
    const position = player && player.position;
    const groups = source.groups && typeof source.groups === 'object' ? source.groups : {};
    const group = Array.isArray(groups[position]) ? groups[position] : null;
    if (!player || !position || !group || !group.length) return zeroVorpResult();

    const qualityFn = typeof source.playerQuality === 'function' ? source.playerQuality : playerQuality;
    const quality = qualityFn(player);
    const openDemand = source.openDemand && typeof source.openDemand === 'object' ? source.openDemand : {};
    const remainingDemand = Math.max(1, Number(openDemand[position] || 0));
    const replacementIndex = Math.min(
      Math.max(0, group.length - 1),
      Math.max(0, Math.ceil(remainingDemand) - 1)
    );
    const replacement = group[replacementIndex] || group[group.length - 1] || null;
    const replacementQuality = replacement ? qualityFn(replacement) : quality;
    const vorp = quality - replacementQuality;

    const totalOpenDemand = Math.max(1, Number(source.totalOpenDemand || 0));
    const positionShare = Math.max(0, Number(openDemand[position] || 0)) / totalOpenDemand;
    const picksAway = Math.max(1, Number(source.picksAway || 1));
    const expectedTaken = Math.max(0, Math.round(picksAway * positionShare));
    const foundIndex = group.findIndex(candidate => candidate && candidate.id === player.id);
    const currentIndex = Math.max(0, foundIndex);
    let waitCost = 0;
    if (currentIndex < expectedTaken && group.length) {
      const nextIndex = Math.min(group.length - 1, Math.max(expectedTaken, currentIndex + 1));
      waitCost = Math.max(0, quality - qualityFn(group[nextIndex]));
    }

    const rosterNeed = source.rosterNeed && typeof source.rosterNeed === 'object' ? source.rosterNeed : {};
    const open = rosterNeed.open && typeof rosterNeed.open === 'object' ? rosterNeed.open : {};
    const flexPositions = Array.isArray(source.flexPositions) ? source.flexPositions : [];
    let rosterFactor = 0.65;
    if (Number(open[position] || 0) > 0) rosterFactor = 1.08;
    else if (Number(rosterNeed.flexOpen || 0) > 0 && flexPositions.includes(position)) rosterFactor = 0.92;

    const scoreBoost = Math.max(-2, Math.min(7, (vorp * 0.13 + waitCost * 0.18) * rosterFactor));
    return {
      quality,
      vorp,
      waitCost,
      scoreBoost,
      replacement,
      replacementRank: replacementIndex + 1,
      expectedTaken,
      remainingDemand,
      rosterFactor
    };
  }

  function buildLegacyRosterSnapshot(input) {
    const source = input && typeof input === 'object' ? input : {};
    const lineup = source.lineup && typeof source.lineup === 'object' ? source.lineup : {};
    const players = Array.isArray(source.players) ? source.players : [];
    const roster = new Set(Array.isArray(source.rosterIds) ? source.rosterIds : []);
    const positions = Array.isArray(source.positions) ? source.positions : [];
    const flexPositions = Array.isArray(source.flexPositions) ? source.flexPositions : [];
    const counts = Object.fromEntries(positions.map(position => [position, 0]));

    for (const player of players) {
      if (player && roster.has(player.id) && Object.prototype.hasOwnProperty.call(counts, player.position)) {
        counts[player.position] += 1;
      }
    }

    const filled = {};
    const open = {};
    for (const position of positions) {
      const target = Math.max(0, Number(lineup[position] || 0));
      filled[position] = Math.min(counts[position] || 0, target);
      open[position] = Math.max(0, target - (counts[position] || 0));
    }

    const flexTarget = Math.max(0, Number(lineup.FLEX || 0));
    const flexSurplus = flexPositions.reduce(
      (sum, position) => sum + Math.max(0, Number(counts[position] || 0) - Number(lineup[position] || 0)),
      0
    );
    const flexFilled = Math.min(flexTarget, flexSurplus);
    const flexOpen = Math.max(0, flexTarget - flexFilled);
    const totalStarters = positions.reduce((sum, position) => sum + Math.max(0, Number(lineup[position] || 0)), 0) + flexTarget;
    const filledStarters = positions.reduce((sum, position) => sum + Number(filled[position] || 0), 0) + flexFilled;

    return { roster, counts, filled, open, flexFilled, flexOpen, totalStarters, filledStarters };
  }

  function evaluateRosterNeed(input) {
    const source = input && typeof input === 'object' ? input : {};
    const player = source.player;
    const snapshot = source.snapshot;
    const positions = Array.isArray(source.positions) ? source.positions : [];
    const flexPositions = Array.isArray(source.flexPositions) ? source.flexPositions : [];
    if (!player || !positions.includes(player.position) || !snapshot) return 0;

    const round = Number(source.round || 1);
    const total = Math.max(1, Number(snapshot.totalStarters || 0));
    const fillPressure = Number(snapshot.filledStarters || 0) / total;
    const roundPressure = Math.max(0, Math.min(1, (round - 1) / 6));
    const urgency = Math.max(fillPressure, roundPressure * 0.8);

    if (Number(snapshot.open && snapshot.open[player.position] || 0) > 0) {
      const singleStarter = player.position === 'QB' || player.position === 'TE';
      let boost = singleStarter ? 1.5 : 4;
      boost += urgency * (singleStarter ? 8 : 7);
      if (singleStarter && round >= 5) boost += 2;
      if (Number(snapshot.open[player.position] || 0) >= 2) boost += 1;
      return boost;
    }

    if (Number(snapshot.flexOpen || 0) > 0 && flexPositions.includes(player.position)) return 2 + urgency * 5;
    return 0;
  }

  function median(values) {
    const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!nums.length) return 0;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

  function classifyTierValues(inputItems) {
    const source = Array.isArray(inputItems) ? inputItems : [];
    if (!source.length) return { items: [], cliffThreshold: 3, normalGap: 0.8 };

    const items = source.map(item => ({ player: item.player, value: Number(item.value || 0) }));
    const gaps = [];
    for (let i = 0; i < items.length - 1; i += 1) {
      gaps.push(Math.max(0, items[i].value - items[i + 1].value));
    }
    const normalGap = Math.max(0.8, median(gaps.slice(0, Math.min(30, gaps.length))));
    const cliffThreshold = Math.max(3.0, normalGap * 2.2);
    const tierThreshold = Math.max(4.2, normalGap * 3.0);

    let tier = 1;
    let anchor = items[0] ? items[0].value : 0;
    for (let i = 0; i < items.length; i += 1) {
      if (i > 0) {
        const priorGap = Math.max(0, items[i - 1].value - items[i].value);
        const drift = Math.max(0, anchor - items[i].value);
        if (priorGap >= cliffThreshold || drift >= tierThreshold) {
          tier += 1;
          anchor = items[i].value;
        }
      }
      items[i].tier = tier;
      items[i].gapAfter = i < items.length - 1 ? Math.max(0, items[i].value - items[i + 1].value) : 0;
      items[i].cliffAfter = items[i].gapAfter >= cliffThreshold;
    }

    return { items, cliffThreshold, normalGap };
  }

  return {
    playerQuality,
    evaluateVorpWait,
    buildLegacyRosterSnapshot,
    evaluateRosterNeed,
    classifyTierValues
  };
});