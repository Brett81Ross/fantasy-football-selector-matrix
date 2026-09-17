const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function runtimeJavaScriptFiles(dir = repoRoot) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'tests') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...runtimeJavaScriptFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

test('Install App stays inside the Share sheet instead of floating over app controls', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'native-install.js'), 'utf8');
  assert.match(source, /getElementById\(['"]shareModal['"]\)/, 'install entry point must mount in Share');
  assert.match(source, /shareInstallApp/, 'Share install button must keep its stable id');
  assert.doesNotMatch(source, /Object\.assign\(b\.style,\{[^}]*position\s*:\s*['"]fixed['"]/s, 'install CTA must not become a fixed overlay again');
  assert.doesNotMatch(source, /zIndex\s*:\s*['"]?2147483000['"]?/, 'legacy floating install overlay must stay removed');
});

test('runtime code does not hard-code a private league identity or roster profile', () => {
  const forbidden = [
    ['game-of-throws-15', 'private league profile id'],
    ['Game of Throws:', 'private league display identity']
  ];
  for (const file of runtimeJavaScriptFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    for (const [signature, label] of forbidden) {
      assert.equal(source.includes(signature), false, `${path.relative(repoRoot, file)} contains ${label}`);
    }
  }
});
