(function (root, factory) {
  const roster = typeof module === 'object' && module.exports
    ? require('./roster-assignment')
    : root.FFMRosterAssignment;
  const position = typeof module === 'object' && module.exports
    ? require('./position-intelligence')
    : root.FFMPositionIntelligence;
  const api = factory(roster, position);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMFlexIntelligence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (roster, position) {
  'use strict';

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function chooseFlexRecommendation({ currentRosterPlayers = [], rosterSlots = [], candidates = [] }) {
    if (!roster?.expandSlots || !roster?.assignRoster || !position?.scoreCandidate) {
      throw new Error('FLEX intelligence dependencies are unavailable');
    }

    const current = roster.assignRoster({ players: currentRosterPlayers, rosterSlots });
    const filled = new Set(current.assignments.map(assignment => assignment.slotId));
    const openFlexibleSlots = roster.expandSlots(rosterSlots)
      .filter(slot => !slot.isBench && !slot.isReserve && slot.eligiblePositions.length > 1 && !filled.has(slot.slotId));

    if (!openFlexibleSlots.length) return null;

    const eligible = (Array.isArray(candidates) ? candidates : [])
      .filter(candidate => candidate && candidate.available !== false && text(candidate.playerId) && text(candidate.position))
      .map(candidate => {
        const slot = openFlexibleSlots.find(item => item.eligiblePositions.includes(text(candidate.position)));
        if (!slot) return null;
        return {
          ...candidate,
          slotId: slot.slotId,
          score: position.scoreCandidate(candidate.components)
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || Number(b.components?.playerValue || 0) - Number(a.components?.playerValue || 0) || text(a.playerId).localeCompare(text(b.playerId)));

    const best = eligible[0];
    if (!best) return null;

    const positionResult = position.rankPositionOptions(eligible);
    const explanation = positionResult.best?.playerId === best.playerId
      ? positionResult.best.explanation
      : `${best.position} is the best FLEX position now.`;

    return {
      playerId: text(best.playerId),
      position: text(best.position),
      slotId: best.slotId,
      score: best.score,
      components: { ...(best.components || {}) },
      headline: `BEST FLEX: ${text(best.position)} — ${text(best.playerId)}`,
      explanation
    };
  }

  return { chooseFlexRecommendation };
});