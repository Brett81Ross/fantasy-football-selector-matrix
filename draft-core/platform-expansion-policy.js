(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMPlatformExpansionPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CANDIDATE_ORDER = Object.freeze(['yahoo','fleaflicker']);

  function evaluateExpansionGate(input = {}) {
    if (input.sleeperActiveDraftVerified !== true) {
      return {
        open:false,
        nextPlatform:null,
        reason:'Complete active Sleeper draft verification before adding another external platform.'
      };
    }
    if (input.yahooTermsReviewed === true) {
      return {
        open:true,
        nextPlatform:'yahoo',
        reason:'Yahoo is the product-priority candidate and has an official Fantasy Sports API; terms review is complete.'
      };
    }
    if (input.fleaflickerTermsReviewed === true) {
      return {
        open:true,
        nextPlatform:'fleaflicker',
        reason:'Fleaflicker exposes an official draft-board/rules API and is the fallback candidate while Yahoo is not ready.'
      };
    }
    return {
      open:false,
      nextPlatform:null,
      reason:'Candidate API access exists, but commercial/usage terms must be reviewed before implementation starts.'
    };
  }

  return { CANDIDATE_ORDER, evaluateExpansionGate };
});