const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePlayerStatus, statusRisk } = require('../season-core/player-status');

const cases = [
  ['IR', 'IR', false, 1],
  ['Injured Reserve', 'IR', false, 1],
  ['PUP', 'PUP', false, 1],
  ['Physically Unable to Perform', 'PUP', false, 1],
  ['Questionable', 'QUESTIONABLE', true, 0.45],
  ['Doubtful', 'DOUBTFUL', true, 0.75],
  ['Out', 'OUT', false, 1],
  ['Active', 'ACTIVE', true, 0.05],
  ['Healthy', 'ACTIVE', true, 0.05],
  ['', 'UNKNOWN', true, 0.55]
];

for (const [raw, category, available, severity] of cases) {
  test(`normalizes ${raw || 'blank'} status`, () => {
    const status = normalizePlayerStatus({ raw });
    assert.equal(status.category, category);
    assert.equal(status.available, available);
    assert.equal(status.severity, severity);
  });
}

test('stale status data reduces confidence and never upgrades player health', () => {
  const fresh = statusRisk(normalizePlayerStatus({ raw:'Questionable' }), { status:'fresh' });
  const stale = statusRisk(normalizePlayerStatus({ raw:'Questionable' }), { status:'stale' });
  assert.equal(fresh.risk, 0.45);
  assert.ok(stale.risk >= fresh.risk);
  assert.ok(stale.confidenceMultiplier < fresh.confidenceMultiplier);
  assert.equal(stale.stale, true);
});

test('unknown and disconnected status data stays explicitly uncertain', () => {
  const result = statusRisk(normalizePlayerStatus({}), { status:'disconnected' });
  assert.equal(result.category, 'UNKNOWN');
  assert.ok(result.risk >= 0.55);
  assert.ok(result.confidenceMultiplier <= 0.4);
  assert.equal(result.shouldMonitor, true);
});
