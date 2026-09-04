const assert = require('node:assert/strict');
const appCore = require('../guardian-core.js');
const extensionCore = require('../extension/core.js');

const finalRisk = 'https://openai.com.evil.example/login';
const middle = `https://relay.example/redirect?next=${encodeURIComponent(finalRisk)}`;
const outer = `https://trusted.example/redirect?url=${encodeURIComponent(middle)}`;
const sameFinal = 'https://trusted.example/account';
const sameMiddle = `https://trusted.example/redirect?next=${encodeURIComponent(sameFinal)}`;
const sameOuter = `https://trusted.example/start?url=${encodeURIComponent(sameMiddle)}`;

const app = appCore.analyzeUrl(outer);
const ext = extensionCore.analyzeUrl(outer);
assert.deepEqual(ext, app, 'app/extension core drift on redirect chain');
assert.equal(app.redirectTargets[0].domain, 'relay.example');
assert.equal(app.redirectTargets[0].chain.length, 2, 'debe conservar dos saltos de redirección');
assert.equal(app.redirectTargets[0].chain.at(-1).domain, 'openai.com.evil.example');
assert.ok(app.redirectTargets[0].chain.at(-1).score >= 20, 'debe conservar riesgo del destino final');
assert.ok(app.reasons.some(r => r.code === 'nested_target_risk'), 'debe heredar riesgo a través de la cadena');

const same = appCore.analyzeUrl(sameOuter);
assert.ok(!same.reasons.some(r => r.code === 'external_redirect_target'), 'cadena same-site no debe penalizarse como externa');
assert.equal(same.redirectTargets[0].chain.at(-1).domain, 'trusted.example');

console.log('RUMBO Guardian redirect chain analysis: PASS');