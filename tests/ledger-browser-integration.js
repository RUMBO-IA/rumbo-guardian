const assert = require('assert');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function rpc(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl), id = 1;
    ws.onopen = () => ws.send(JSON.stringify({ id, method, params }));
    ws.onerror = reject;
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== id) return;
      ws.close();
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    };
  });
}
async function evalIn(wsUrl, expression) {
  const result = await rpc(wsUrl, 'Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  return result.result.value;
}
(async () => {
  const base = process.env.GUARDIAN_CDP_URL;
  assert(base, 'GUARDIAN_CDP_URL requerido');
  const page = await fetch(base + '/json/new?' + encodeURIComponent('http://127.0.0.1:8766/'), {method:'PUT'}).then(r=>r.json());
  await delay(700);
  const ws = page.webSocketDebuggerUrl;
  await evalIn(ws, "localStorage.clear(); location.reload(); 'reload'");
  await delay(700);
  const first = await evalIn(ws, `(async()=>{document.querySelector('#input').value='URGENTE verificá tu cuenta y contraseña';document.querySelector('#analyzeBtn').click();await new Promise(r=>setTimeout(r,300));return document.querySelector('#ledgerIntegrity').textContent;})()`);
  assert(/Integridad verificada/.test(first), 'el primer evento no quedó verificado');
  const second = await evalIn(ws, `(async()=>{document.querySelector('#input').value='https://example.com/';document.querySelector('#analyzeBtn').click();await new Promise(r=>setTimeout(r,300));const h=JSON.parse(localStorage.getItem('rumboGuardianHistory'));const v=await RumboGuardianEvidenceChain.verifyChain(h);return {badge:document.querySelector('#ledgerIntegrity').textContent,length:h.length,valid:v.valid};})()`);
  console.log('LEDGER_VALID', JSON.stringify(second));
  assert.equal(second.length,2);
  assert.equal(second.valid,true);
  assert(/2/.test(second.badge));

  const tampered = await evalIn(ws, `(async()=>{const h=JSON.parse(localStorage.getItem('rumboGuardianHistory'));h[0].score=99;localStorage.setItem('rumboGuardianHistory',JSON.stringify(h));await drawHistory();return {badge:document.querySelector('#ledgerIntegrity').textContent,history:document.querySelector('#history').innerText};})()`);
  console.log('LEDGER_TAMPER', JSON.stringify(tampered));
  assert(/comprometida/i.test(tampered.badge), 'la manipulación no fue señalada');
  console.log('RUMBO Guardian ledger browser integration: PASS');
})().catch(err => {
  console.error('RUMBO Guardian ledger browser integration: FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});

