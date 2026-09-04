const assert = require('node:assert/strict');
const appCore = require('../guardian-core.js');
const extensionCore = require('../extension/core.js');

const cases = [
  'https://openai.com.evil.example/login',
  'https://openai.com@evil.example/login',
  'https://openai.com/login'
];

for (const url of cases) {
  const app = appCore.analyzeUrl(url);
  const ext = extensionCore.analyzeUrl(url);
  assert.deepEqual(ext, app, `app/extension core drift for ${url}`);
}

const shadow = appCore.analyzeUrl(cases[0]);
assert.ok(shadow.reasons.some(r => r.code === 'brand_shadow'), 'debe detectar dominio oficial usado como señuelo dentro de otro host');
assert.ok(shadow.score >= 30, 'el señuelo de dominio debe elevar el riesgo al menos a medio');

const authority = appCore.analyzeUrl(cases[1]);
assert.ok(authority.reasons.some(r => r.code === 'authority_confusion'), 'debe detectar host aparente antes de @');
assert.ok(authority.score >= 40, 'la confusión de autoridad debe producir señal material');

const official = appCore.analyzeUrl(cases[2]);
assert.ok(!official.reasons.some(r => ['brand_shadow','authority_confusion'].includes(r.code)), 'dominio oficial no debe generar señal de suplantación estructural');

console.log('RUMBO Guardian URL deception detection: PASS');