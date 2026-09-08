const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');

test('app shell loads legal links runtime',()=>{
  const app=fs.readFileSync(path.join(root,'api','app.js'),'utf8');
  assert.match(app,/legal-links\.js/);
});

test('legal links runtime exposes Terms and Privacy in footer and settings',()=>{
  const file=path.join(root,'legal-links.js');
  assert.equal(fs.existsSync(file),true,'legal-links.js must exist');
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/Terms of Use/);
  assert.match(source,/Privacy Policy/);
  assert.match(source,/\/docs\/legal\/TERMS_OF_USE\.md/);
  assert.match(source,/\/docs\/legal\/PRIVACY_POLICY\.md/);
  assert.match(source,/footer/);
  assert.match(source,/settingsBtn/);
});

test('legal documents remain present at the linked paths',()=>{
  assert.equal(fs.existsSync(path.join(root,'docs','legal','TERMS_OF_USE.md')),true);
  assert.equal(fs.existsSync(path.join(root,'docs','legal','PRIVACY_POLICY.md')),true);
});
