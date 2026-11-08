'use strict';

const assert = require('node:assert/strict');
const Adapter = require('./runtime-adapter.js');

(async () => {
  assert.deepEqual(Adapter.tools, ['analyze_url', 'analyze_text', 'verify_ledger', 'explain_signal']);

  const url = await Adapter.call('analyze_url', { url: 'javascript:alert(1)' });
  assert.equal(url.reasons.some(r => r.code === 'active_content_scheme'), true);

  const text = await Adapter.call('analyze_text', { text: 'Urgente: verifica tu password ahora mismo' });
  assert.equal(text.reasons.some(r => r.code === 'credentials'), true);
  assert.equal(text.reasons.some(r => r.code === 'urgency'), true);

  const missing = await Adapter.call('verify_ledger', { ledger: {} });
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, 'missing_history');

  const explanation = await Adapter.call('explain_signal', { code: 'active_content_scheme' });
  assert.equal(explanation.supported, true);

  await assert.rejects(() => Adapter.call('unknown', {}), /UNKNOWN_TOOL/);
  await assert.rejects(() => Adapter.call('analyze_url', { url: '' }), /URL_REQUIRED/);

  console.log('OPENAI_GUARDIAN_RUNTIME_ADAPTER_PASS');
})().catch(error => { console.error(error); process.exit(1); });
