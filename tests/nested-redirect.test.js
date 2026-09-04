const assert = require('node:assert/strict');
const appCore = require('../guardian-core.js');
const extensionCore = require('../extension/core.js');

const deceptive = 'https://trusted.example/redirect?url=https%3A%2F%2Fopenai.com.evil.example%2Flogin';
const sameSite = 'https://trusted.example/redirect?url=https%3A%2F%2Ftrusted.example%2Faccount';
const unrelatedParam = 'https://trusted.example/share?text=https%3A%2F%2Fevil.example%2F';
const doubleEncoded = 'https://trusted.example/redirect?url=https%253A%252F%252Fopenai.com.evil.example%252Flogin';

for (const url of [deceptive, sameSite, unrelatedParam, doubleEncoded]) {
  assert.deepEqual(extensionCore.analyzeUrl(url), appCore.analyzeUrl(url), `core drift: ${url}`);
}

const risky = appCore.analyzeUrl(deceptive);
assert.ok(risky.reasons.some(r => r.code === 'external_redirect_target'), 'detecta destino externo en parámetro de redirección');
assert.ok(risky.reasons.some(r => r.code === 'nested_target_risk'), 'hereda señal material del destino anidado');
assert.equal(risky.redirectTargets[0].domain, 'openai.com.evil.example');
assert.ok(risky.score >= 45, 'redirección externa riesgosa debe elevar el score');

const doubleRisk = appCore.analyzeUrl(doubleEncoded);
assert.ok(doubleRisk.reasons.some(r => r.code === 'external_redirect_target'), 'detecta destino externo doblemente codificado');
assert.equal(doubleRisk.redirectTargets[0].domain, 'openai.com.evil.example');
assert.ok(doubleRisk.redirectTargets[0].decodePasses >= 2, 'registra decodificación acotada del destino');

const local = appCore.analyzeUrl(sameSite);
assert.ok(!local.reasons.some(r => r.code === 'external_redirect_target'), 'redirección same-site no debe penalizarse como externa');
const noise = appCore.analyzeUrl(unrelatedParam);
assert.ok(!noise.reasons.some(r => r.code === 'external_redirect_target'), 'URLs en parámetros no-redirección no deben generar falso positivo');
console.log('RUMBO Guardian nested redirect detection: PASS');
