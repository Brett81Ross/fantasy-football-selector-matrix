const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

test('Install App stays inside the Share sheet instead of floating over app controls', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'native-install.js'), 'utf8');
  assert.match(source, /getElementById\(['"]shareModal['"]\)/, 'install entry point must mount in Share');
  assert.match(source, /shareInstallApp/, 'Share install button must keep its stable id');
  assert.doesNotMatch(source, /Object\.assign\(b\.style,\{[^}]*position\s*:\s*['"]fixed['"]/s, 'install CTA must not become a fixed overlay again');
  assert.doesNotMatch(source, /zIndex\s*:\s*['"]?2147483000['"]?/, 'legacy floating install overlay must stay removed');
});

test('dormant private league profile stays out of every app bootstrap path', () => {
  const app = fs.readFileSync(path.join(repoRoot, 'api/app.js'), 'utf8');
  const index = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  assert.doesNotMatch(app, /league-profile\.js/, 'server app shell must not load the private league profile');
  assert.doesNotMatch(index, /league-profile\.js/, 'static app shell must not load the private league profile');
});
