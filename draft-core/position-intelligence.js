(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMPositionIntelligence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WEIGHTS = Object.freeze({
    playerValue: 1,
    rosterNeed: 1.5,
    positionalDropoff: 1.5,
    tierCliff: 0.75,
    waitCost: 2
  });

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function scoreCandidate(components = {}) {
    return Number((
      finite(components.playerValue) * WEIGHTS.playerValue +
      finite(components.rosterNeed) * WEIGHTS.rosterNeed +
      finite(components.positionalDropoff) * WEIGHTS.positionalDropoff +
      finite(components.tierCliff) * WEIGHTS.tierCliff +
      finite(components.waitCost) * WEIGHTS.waitCost
    ).toFixed(2));
  }

  function explanation(position, components) {
    const c = components || {};
    const reasons = [];
    if (finite(c.rosterNeed) > 0) reasons.push(`roster need ${finite(c.rosterNeed).toFixed(1)}`);
    if (finite(c.positionalDropoff) > 0) reasons.push(`drop-off ${finite(c.positionalDropoff).toFixed(1)}`);
    if (finite(c.tierCliff) > 0) reasons.push(`tier cliff ${finite(c.tierCliff).toFixed(1)}`);
    if (finite(c.waitCost) > 0) reasons.push(`wait cost ${finite(c.waitCost).toFixed(1)}`);
    return `${position} is the best position now. ${reasons.length ? `The edge comes from ${reasons.join(', ')}.` : 'It has the strongest overall value.'}`;
  }

  function rankPositionOptions(candidates = []) {
    const available = (Array.isArray(candidates) ? candidates : [])
      .filter(candidate => candidate && candidate.available !== false && candidate.playerId && candidate.position)
      .map(candidate => ({
        ...candidate,
        score: scoreCandidate(candidate.components)
      }))
      .sort((a, b) => b.score - a.score || finite(b.components?.playerValue) - finite(a.components?.playerValue) || String(a.playerId).localeCompare(String(b.playerId)));

    const byPosition = {};
    for (const candidate of available) {
      if (!byPosition[candidate.position]) byPosition[candidate.position] = candidate;
    }

    const top = available[0] || null;
    const best = top ? {
      ...top,
      explanation: explanation(top.position, top.components)
    } : null;

    return { best, byPosition };
  }

  return { WEIGHTS, scoreCandidate, rankPositionOptions };
});