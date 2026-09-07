(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMRosterAssignment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function expandSlots(rosterSlots) {
    const expanded = [];
    for (const raw of Array.isArray(rosterSlots) ? rosterSlots : []) {
      const count = Math.max(0, Math.floor(Number(raw?.count) || 0));
      for (let index = 0; index < count; index += 1) {
        expanded.push({
          slotId: count === 1 ? text(raw.id) : `${text(raw.id)}:${index + 1}`,
          type: text(raw.type),
          eligiblePositions: Array.isArray(raw?.eligiblePositions)
            ? [...new Set(raw.eligiblePositions.map(text).filter(Boolean))]
            : [],
          isBench: raw?.isBench === true,
          isReserve: raw?.isReserve === true,
          order: expanded.length
        });
      }
    }
    return expanded;
  }

  function eligible(player, slot) {
    const position = text(player?.position);
    return !!position && slot.eligiblePositions.includes(position);
  }

  function assignRoster({ players = [], rosterSlots = [] }) {
    const cleanPlayers = (Array.isArray(players) ? players : [])
      .filter(player => text(player?.id) && text(player?.position))
      .map((player, index) => ({ ...player, _draftOrder: index }));
    const slots = expandSlots(rosterSlots);
    const starterSlots = slots
      .filter(slot => !slot.isBench && !slot.isReserve)
      .sort((a, b) => a.eligiblePositions.length - b.eligiblePositions.length || a.order - b.order);
    const benchSlots = slots
      .filter(slot => slot.isBench)
      .sort((a, b) => a.order - b.order);
    const reserveSlots = slots
      .filter(slot => slot.isReserve)
      .sort((a, b) => a.order - b.order);

    const assignedPlayers = new Set();
    const assignmentByPlayer = new Map();
    const filledSlots = new Set();

    function fill(slotsToFill) {
      for (const slot of slotsToFill) {
        const player = cleanPlayers.find(candidate => !assignedPlayers.has(candidate.id) && eligible(candidate, slot));
        if (!player) continue;
        assignedPlayers.add(player.id);
        filledSlots.add(slot.slotId);
        assignmentByPlayer.set(player.id, {
          playerId: text(player.id),
          slotId: slot.slotId,
          position: text(player.position)
        });
      }
    }

    fill(starterSlots);
    fill(benchSlots);
    fill(reserveSlots);

    const assignments = cleanPlayers
      .filter(player => assignmentByPlayer.has(player.id))
      .sort((a, b) => a._draftOrder - b._draftOrder)
      .map(player => assignmentByPlayer.get(player.id));

    return {
      assignments,
      openStarterSlots: starterSlots.filter(slot => !filledSlots.has(slot.slotId)).map(slot => slot.slotId),
      openBenchSlots: benchSlots.filter(slot => !filledSlots.has(slot.slotId)).map(slot => slot.slotId),
      openReserveSlots: reserveSlots.filter(slot => !filledSlots.has(slot.slotId)).map(slot => slot.slotId),
      unassignedPlayerIds: cleanPlayers.filter(player => !assignedPlayers.has(player.id)).map(player => text(player.id))
    };
  }

  return { expandSlots, assignRoster };
});