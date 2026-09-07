const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../draft-core/platform-commercial-policy');

test('Sleeper remains commercially blocked until licensing is documented', () => {
  const status = P.platformCommercialStatus('sleeper');
  assert.equal(status.allowed, false);
  assert.equal(status.state, 'pending_license');
});

test('manual provider is commercially usable because it has no external API dependency', () => {
  const status = P.platformCommercialStatus('manual');
  assert.equal(status.allowed, true);
  assert.equal(status.state, 'internal');
});

test('explicit documented Sleeper license can unlock the commercial gate', () => {
  const status = P.platformCommercialStatus('sleeper', { sleeperLicenseApproved:true, evidenceRef:'legal/sleeper-license' });
  assert.equal(status.allowed, true);
  assert.equal(status.state, 'licensed');
  assert.equal(status.evidenceRef, 'legal/sleeper-license');
});

test('a boolean without evidence cannot unlock Sleeper commercial use', () => {
  const status = P.platformCommercialStatus('sleeper', { sleeperLicenseApproved:true });
  assert.equal(status.allowed, false);
  assert.equal(status.state, 'pending_license');
});