const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const productPath = path.join(root, 'packaging', 'product.json');
const releasePath = path.join(root, 'packaging', 'release.json');
const extensionPath = path.join(root, 'extension', 'manifest.json');
const validatorPath = path.join(root, 'tools', 'validate-release.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runValidator() {
  return spawnSync(process.execPath, [
    validatorPath,
    '--product', productPath,
    '--release', releasePath,
    '--extension', extensionPath,
  ], { cwd: root, encoding: 'utf8' });
}

function testProductContract() {
  const product = readJson(productPath);
  assert.equal(product.schema, 'rumbo.product/v1');
  assert.equal(product.id, 'rumbo-guardian');
  assert.equal(product.version, '1.0.0');
  assert.deepEqual(product.browser.permissions.slice().sort(), [
    'activeTab', 'contextMenus', 'scripting', 'storage',
  ]);
  assert.deepEqual(product.browser.host_permissions, []);
  assert.equal(product.trust.sbom, 'required');
  assert.equal(product.trust.provenance, 'required');
  assert.equal(product.trust.artifact_sha256, 'required');
}

function testValidDraftRelease() {
  const result = runValidator();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'VERIFIED');
  assert.equal(payload.product, 'rumbo-guardian');
  assert.equal(payload.release, '1.0.0');
}

function testVersionMismatchFails() {
  const tempRelease = path.join(root, '.tmp-release-mismatch.json');
  const release = readJson(releasePath);
  release.version = '9.9.9';
  fs.writeFileSync(tempRelease, `${JSON.stringify(release, null, 2)}\n`);
  const result = spawnSync(process.execPath, [validatorPath, '--product', productPath, '--release', tempRelease, '--extension', extensionPath], { cwd: root, encoding: 'utf8' });
  fs.rmSync(tempRelease, { force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /version_mismatch/);
}

function testBroadHostPermissionsFail() {
  const tempProduct = path.join(root, '.tmp-product-permissions.json');
  const product = readJson(productPath);
  product.browser.host_permissions = ['<all_urls>'];
  fs.writeFileSync(tempProduct, `${JSON.stringify(product, null, 2)}\n`);
  const result = spawnSync(process.execPath, [validatorPath, '--product', tempProduct, '--release', releasePath, '--extension', extensionPath], { cwd: root, encoding: 'utf8' });
  fs.rmSync(tempProduct, { force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /host_permissions_not_allowed/);
}

function testStableRequiresTrust() {
  const tempRelease = path.join(root, '.tmp-release-stable.json');
  const release = readJson(releasePath);
  release.state = 'STABLE';
  release.trust = { sbom: false, provenance: false, signature: false };
  fs.writeFileSync(tempRelease, `${JSON.stringify(release, null, 2)}\n`);
  const result = spawnSync(process.execPath, [validatorPath, '--product', productPath, '--release', tempRelease, '--extension', extensionPath], { cwd: root, encoding: 'utf8' });
  fs.rmSync(tempRelease, { force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /stable_trust_incomplete/);
}

testProductContract();
testValidDraftRelease();
testVersionMismatchFails();
testBroadHostPermissionsFail();
testStableRequiresTrust();
console.log('release-foundation tests: PASS');
