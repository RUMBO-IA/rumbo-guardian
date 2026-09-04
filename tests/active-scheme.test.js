const assert = require('node:assert/strict');
const appCore = require('../guardian-core.js');
const extensionCore = require('../extension/core.js');

const activeCases = [
  'javascript:alert(document.domain)',
  'data:text/html,<script>alert(1)</script>'
];

for (const value of activeCases) {
  const app = appCore.analyzeUrl(value);
  const ext = extensionCore.analyzeUrl(value);
  assert.deepEqual(ext, app, `app/extension core drift for ${value}`);
  assert.ok(app.reasons.some(r => r.code === 'active_content_scheme'), `${value} debe detectar esquema de contenido activo`);
  assert.ok(app.score >= 60, `${value} debe clasificarse como riesgo alto`);
}

const mail = appCore.analyzeUrl('mailto:security@example.com');
assert.ok(!mail.reasons.some(r => r.code === 'active_content_scheme'), 'mailto no debe confundirse con contenido activo');

const https = appCore.analyzeUrl('https://openai.com/');
assert.ok(!https.reasons.some(r => r.code === 'active_content_scheme'), 'HTTPS normal no debe generar señal de esquema activo');

console.log('RUMBO Guardian active-content scheme detection: PASS');
