const test = require('node:test');
const assert = require('node:assert/strict');
const { assertDraftStateProvider } = require('../draft-core/provider-contract');

function validProvider() {
  return {
    platform: 'manual',
    async connect() {},
    async listLeagues() { return []; },
    async loadLeague() { return {}; },
    async loadDraft() { return {}; },
    async loadPicks() { return []; }
  };
}

test('accepts the minimal platform-independent provider boundary', () => {
  assert.equal(assertDraftStateProvider(validProvider()), true);
});

test('rejects a provider missing loadPicks', () => {
  const provider = validProvider();
  delete provider.loadPicks;
  assert.throws(() => assertDraftStateProvider(provider), /loadPicks/);
});

test('rejects a provider with no platform identity', () => {
  const provider = validProvider();
  provider.platform = '';
  assert.throws(() => assertDraftStateProvider(provider), /platform/);
});