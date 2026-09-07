(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMDraftProviderContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REQUIRED_PROVIDER_METHODS = Object.freeze([
    'connect',
    'listLeagues',
    'loadLeague',
    'loadDraft',
    'loadPicks'
  ]);

  function assertDraftStateProvider(provider) {
    if (!provider || typeof provider !== 'object') throw new TypeError('provider must be an object');
    if (typeof provider.platform !== 'string' || !provider.platform.trim()) throw new TypeError('provider.platform is required');
    for (const method of REQUIRED_PROVIDER_METHODS) {
      if (typeof provider[method] !== 'function') throw new TypeError(`provider.${method} must be a function`);
    }
    return true;
  }

  return { REQUIRED_PROVIDER_METHODS, assertDraftStateProvider };
});