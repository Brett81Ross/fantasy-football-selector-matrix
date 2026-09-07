(function (root, factory) {
  const reconcile = typeof module === 'object' && module.exports ? require('./reconcile') : root.FFMDraftReconcile;
  const api = factory(reconcile);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMDraftReplayHarness = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (reconcile) {
  'use strict';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function replayDraft({ initialState, authoritativePicks, playerPool, assertSnapshot }) {
    if (!initialState || typeof initialState !== 'object') throw new TypeError('initialState is required');
    if (!Array.isArray(authoritativePicks)) throw new TypeError('authoritativePicks must be an array');
    if (!Array.isArray(playerPool)) throw new TypeError('playerPool must be an array');
    if (!reconcile?.reconcileDraftState) throw new Error('reconcileDraftState is required');

    let current = clone(initialState);
    const snapshots = [];
    const ordered = [...authoritativePicks].sort((a,b) => Number(a.overall || 0) - Number(b.overall || 0));

    for (let index = 0; index < ordered.length; index += 1) {
      const history = ordered.slice(0, index + 1);
      current = reconcile.reconcileDraftState({
        previousState: current,
        authoritativePicks: history,
        playerPool,
        now: `replay:${index + 1}`
      });
      const snapshot = clone(current);
      snapshots.push(snapshot);
      if (typeof assertSnapshot === 'function') assertSnapshot(snapshot, index);
    }

    return { snapshots, finalState: clone(current) };
  }

  return { replayDraft };
});