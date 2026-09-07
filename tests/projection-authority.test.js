const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../draft-core/projection-authority');

test('uses Matrix Forecast as the phase-one forward-looking authority', () => {
  assert.equal(P.PRIMARY_AUTHORITY.id, 'matrix-forecast');
  assert.equal(P.PRIMARY_AUTHORITY.forwardLooking, true);
  assert.equal(P.PRIMARY_AUTHORITY.requiresCommercialLicense, false);
});

test('does not classify raw historical nflverse stats as a forward projection', () => {
  assert.equal(P.HISTORICAL_BASELINE.id, 'nflverse-historical');
  assert.equal(P.HISTORICAL_BASELINE.forwardLooking, false);
});

test('keeps FantasyPros and Sleeper projection feeds behind commercial licensing gates', () => {
  assert.equal(P.EXTERNAL_AUTHORITIES.fantasypros.requiresCommercialLicense, true);
  assert.equal(P.EXTERNAL_AUTHORITIES.sleeper.requiresCommercialLicense, true);
});

test('selectProjectionAuthority prefers licensed external data, then Matrix Forecast, then historical baseline', () => {
  assert.equal(P.selectProjectionAuthority({ licensedExternal: 'fantasypros', matrixForecastReady: true }).id, 'fantasypros');
  assert.equal(P.selectProjectionAuthority({ licensedExternal: null, matrixForecastReady: true }).id, 'matrix-forecast');
  assert.equal(P.selectProjectionAuthority({ licensedExternal: null, matrixForecastReady: false }).id, 'nflverse-historical');
});

test('freshnessState distinguishes fresh, stale, and unavailable data', () => {
  const now = Date.parse('2026-09-07T20:00:00.000Z');
  assert.equal(P.freshnessState({ generatedAt: '2026-09-07T18:30:00.000Z', nowMs: now, maxAgeMs: 3 * 60 * 60 * 1000 }), 'fresh');
  assert.equal(P.freshnessState({ generatedAt: '2026-09-07T10:00:00.000Z', nowMs: now, maxAgeMs: 3 * 60 * 60 * 1000 }), 'stale');
  assert.equal(P.freshnessState({ generatedAt: null, nowMs: now, maxAgeMs: 3 * 60 * 60 * 1000 }), 'unavailable');
});

test('presentationLabel never calls the historical baseline a projection', () => {
  assert.equal(P.presentationLabel(P.HISTORICAL_BASELINE, 'fresh'), 'Historical baseline');
  assert.equal(P.presentationLabel(P.PRIMARY_AUTHORITY, 'fresh'), 'Matrix Forecast');
  assert.equal(P.presentationLabel(P.PRIMARY_AUTHORITY, 'stale'), 'Matrix Forecast · STALE');
});