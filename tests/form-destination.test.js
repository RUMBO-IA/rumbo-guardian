const assert = require('node:assert/strict');
const appCore = require('../guardian-core.js');
const extensionCore = require('../extension/core.js');

const page = 'https://portal.example.test/login';
const cases = [
  { action: 'https://collector.invalid/submit', method: 'post', passwordFields: 1 },
  { action: 'https://portal.example.test/session', method: 'post', passwordFields: 1 },
  { action: '', method: 'post', passwordFields: 1 }
];

for (const form of cases) {
  const app = appCore.analyzeFormDestination(page, form);
  const ext = extensionCore.analyzeFormDestination(page, form);
  assert.deepEqual(ext, app, 'app/extension form-analysis drift');
}

const external = appCore.analyzeFormDestination(page, cases[0]);
assert.ok(external.reasons.some(r => r.code === 'cross_origin_form'));
assert.ok(external.reasons.some(r => r.code === 'external_password_form'));
assert.ok(external.score >= 40, 'external password form must be material risk');

const sameSite = appCore.analyzeFormDestination(page, cases[1]);
assert.ok(!sameSite.reasons.some(r => r.code === 'cross_origin_form'));
const self = appCore.analyzeFormDestination(page, cases[2]);
assert.equal(self.score, 0);
console.log('RUMBO Guardian form destination integrity: PASS');
