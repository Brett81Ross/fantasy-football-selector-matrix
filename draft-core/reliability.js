(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMDraftReliability = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function safeFailures(state) {
    const n = Number(state?.sync?.consecutiveFailures || 0);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  }

  function classifyFreshness(state, options = {}) {
    if (state?.sync?.status === 'manual') return 'manual';
    const disconnectAfterFailures = Math.max(1, Number(options.disconnectAfterFailures || 3));
    if (safeFailures(state) >= disconnectAfterFailures) return 'disconnected';
    const stamp = Date.parse(state?.sync?.lastSuccessfulSyncAt || '');
    const nowMs = Number(options.nowMs ?? Date.now());
    const staleAfterMs = Math.max(0, Number(options.staleAfterMs || 15000));
    if (!Number.isFinite(stamp) || !Number.isFinite(nowMs)) return 'stale';
    return nowMs - stamp > staleAfterMs ? 'stale' : 'live';
  }

  function nextBackoffMs(consecutiveFailures, options = {}) {
    const baseMs = Math.max(1, Number(options.baseMs || 1000));
    const capMs = Math.max(baseMs, Number(options.capMs || 30000));
    const failures = Math.max(0, Math.floor(Number(consecutiveFailures || 0)));
    return Math.min(capMs, baseMs * (2 ** failures));
  }

  function recordSuccess({ current, incoming, nowIso }) {
    const hadFailures = safeFailures(current) > 0 || ['stale', 'disconnected'].includes(current?.sync?.status);
    const state = clone(incoming) || {};
    state.sync = {
      ...(state.sync || {}),
      status: 'live',
      lastSuccessfulSyncAt: nowIso || state.sync?.lastSuccessfulSyncAt || new Date().toISOString(),
      lastAttemptAt: nowIso || state.sync?.lastAttemptAt || new Date().toISOString(),
      consecutiveFailures: 0
    };
    return {
      state,
      lastKnownGood: clone(state),
      shouldFullReconcile: hadFailures
    };
  }

  function recordFailure({ current, lastKnownGood, nowIso, disconnectAfterFailures = 3 }) {
    const base = clone(lastKnownGood || current) || {};
    const failures = safeFailures(current) + 1;
    base.sync = {
      ...(base.sync || {}),
      lastSuccessfulSyncAt: lastKnownGood?.sync?.lastSuccessfulSyncAt ?? current?.sync?.lastSuccessfulSyncAt ?? null,
      lastAttemptAt: nowIso || new Date().toISOString(),
      consecutiveFailures: failures,
      status: failures >= Math.max(1, Number(disconnectAfterFailures || 3)) ? 'disconnected' : 'stale'
    };
    return {
      state: base,
      lastKnownGood: clone(lastKnownGood || current),
      retryAfterMs: nextBackoffMs(failures - 1)
    };
  }

  function enterManualMode(state) {
    const next = clone(state) || {};
    next.sync = {
      ...(next.sync || {}),
      status: 'manual'
    };
    return next;
  }

  return {
    classifyFreshness,
    nextBackoffMs,
    recordSuccess,
    recordFailure,
    enterManualMode
  };
});