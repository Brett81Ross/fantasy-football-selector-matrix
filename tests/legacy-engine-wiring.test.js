const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('pure evaluator module has no browser or I/O side effects', () => {
  const source = read('draft-core/evaluators.js');
  for (const forbidden of ['document.', 'localStorage', 'fetch(', 'setInterval(', 'setTimeout(', 'serviceWorker']) {
    assert.equal(source.includes(forbidden), false, `unexpected side effect reference: ${forbidden}`);
  }
});

test('VORP browser module delegates to pure evaluator when available and keeps compatibility export', () => {
  const source = read('vorp.js');
  assert.match(source, /FFMDraftEvaluators/);
  assert.match(source, /PURE\?\.playerQuality/);
  assert.match(source, /PURE\?\.evaluateVorpWait/);
  assert.match(source, /window\.ffmVorp/);
});

test('roster-needs browser module delegates to pure evaluator and keeps storage keys', () => {
  const source = read('roster-needs.js');
  assert.match(source, /FFMDraftEvaluators/);
  assert.match(source, /PURE\?\.buildLegacyRosterSnapshot/);
  assert.match(source, /PURE\?\.evaluateRosterNeed/);
  assert.match(source, /ffm-fast-my-roster/);
  assert.match(source, /ffm-roster-lineup/);
});

test('tier-cliffs browser module delegates to pure classifier and keeps compatibility export', () => {
  const source = read('tier-cliffs.js');
  assert.match(source, /FFMDraftEvaluators/);
  assert.match(source, /PURE\?\.classifyTierValues/);
  assert.match(source, /window\.ffmTiers/);
});