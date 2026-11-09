'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const cfg = JSON.parse(read('turbo.json'));
const ci = read('.github/workflows/ci.yml');
assert.equal(pkg.version, '1.0.0');
assert.equal(pkg.devDependencies?.turbo, '2.11.10');
assert.equal(pkg.packageManager, 'npm@10.9.2');
assert.equal(lock.lockfileVersion, 3);
assert.equal(lock.packages?.['']?.devDependencies?.turbo, '2.11.10');
assert.equal(lock.packages?.['node_modules/turbo']?.version, '2.11.10');
for (const name of ['check','test:unit']) {
  assert.deepEqual(cfg.tasks?.[name]?.outputs, []);
  assert.equal(cfg.tasks?.[name]?.cache, false, 'local CI tasks cannot be skipped by a cache');
  assert.ok(!cfg.tasks?.[name]?.tags?.includes('ci'), 'Vercel CI activation tags are not authorized');
}
for (const required of [
  'pull_request:', 'branches: [main]', 'contents: read',
  'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
  'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  'persist-credentials: false',
  'npm ci --ignore-scripts --no-audit --no-fund',
  'TURBO_TELEMETRY_DISABLED=1 npx --no-install turbo run check',
  'node tests/github-actions-supply-chain.test.js', 'npm test'
]) assert.ok(ci.includes(required), 'missing Guardian CI requirement: '+required);
assert.doesNotMatch(ci, /pull_request_target:|continue-on-error:\\s*true|contents:\\s*write|id-token:\\s*write|vercel ci enable|TURBO_TOKEN|TURBO_TEAM|force:\\s*true/);
console.log('GUARDIAN_PORTABLE_TURBO_FALLBACK_POLICY_PASS');
