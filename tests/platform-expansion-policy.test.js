const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../draft-core/platform-expansion-policy');

test('expansion stays closed until Sleeper active-draft verification is complete', () => {
  const gate = P.evaluateExpansionGate({ sleeperActiveDraftVerified:false, yahooTermsReviewed:false, fleaflickerTermsReviewed:false });
  assert.equal(gate.open, false);
  assert.equal(gate.nextPlatform, null);
});

test('Yahoo is the product-priority candidate after active Sleeper proof and Yahoo terms review', () => {
  const gate = P.evaluateExpansionGate({ sleeperActiveDraftVerified:true, yahooTermsReviewed:true, fleaflickerTermsReviewed:false });
  assert.equal(gate.open, true);
  assert.equal(gate.nextPlatform, 'yahoo');
});

test('Fleaflicker is the fallback candidate when its terms are reviewed but Yahoo is not ready', () => {
  const gate = P.evaluateExpansionGate({ sleeperActiveDraftVerified:true, yahooTermsReviewed:false, fleaflickerTermsReviewed:true });
  assert.equal(gate.open, true);
  assert.equal(gate.nextPlatform, 'fleaflicker');
});

test('unsupported platforms remain outside the first expansion gate', () => {
  assert.deepEqual(P.CANDIDATE_ORDER, ['yahoo','fleaflicker']);
});