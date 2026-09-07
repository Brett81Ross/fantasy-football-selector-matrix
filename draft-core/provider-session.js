(function (root, factory) {
  const reliability = typeof module === 'object' && module.exports ? require('./reliability') : root.FFMDraftReliability;
  const api = factory(reliability);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMProviderSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (defaultReliability) {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function createProviderSession(options = {}) {
    const provider = options.provider;
    const reliability = options.reliability || defaultReliability;
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    const onState = typeof options.onState === 'function' ? options.onState : () => {};
    let current = null;
    let lastKnownGood = null;
    let draftId = '';

    if (!provider || typeof provider.loadDraft !== 'function') throw new TypeError('provider.loadDraft is required');
    if (!reliability?.recordSuccess || !reliability?.recordFailure || !reliability?.enterManualMode) throw new TypeError('draft reliability coordinator is required');

    function publish(state) {
      current = clone(state);
      onState(clone(current));
      return clone(current);
    }

    async function refresh(id = draftId) {
      draftId = String(id || draftId || '').trim();
      if (!draftId) throw new Error('draftId is required');
      try {
        const incoming = await provider.loadDraft(draftId);
        const result = reliability.recordSuccess({ current, incoming, nowIso:now() });
        current = result.state;
        lastKnownGood = result.lastKnownGood;
        publish(current);
        return { ok:true, state:clone(current), recovered:result.shouldFullReconcile === true };
      } catch (error) {
        if (!current && !lastKnownGood) throw error;
        const result = reliability.recordFailure({ current, lastKnownGood, nowIso:now() });
        current = result.state;
        lastKnownGood = result.lastKnownGood;
        publish(current);
        return { ok:false, state:clone(current), retryAfterMs:result.retryAfterMs, error:String(error?.message || error) };
      }
    }

    function enterManual() {
      if (!current) return null;
      return publish(reliability.enterManualMode(current));
    }

    function getState() {
      return clone(current);
    }

    return { refresh, enterManual, getState };
  }

  return { createProviderSession };
});