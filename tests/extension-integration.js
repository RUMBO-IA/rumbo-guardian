const assert = require('assert');
const path = require('path');
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
  return result.result.value;
}
(async () => {
  const base = process.env.GUARDIAN_CDP_URL || 'http://127.0.0.1:9227';
  const projectRoot = path.resolve(__dirname, '..');
  const extPath = path.join(projectRoot, 'extension');
  const version = await fetch(base + '/json/version').then(r => r.json());
  const loaded = await rpc(version.webSocketDebuggerUrl, 'Extensions.loadUnpacked', { path:extPath });
  const extState = await rpc(version.webSocketDebuggerUrl, 'Extensions.getExtensions');
  const extension = extState.extensions.find(e => e.id === loaded.id);
  assert(extension && extension.enabled, 'RUMBO Guardian no quedó habilitada en la sesión de prueba');
  console.log('EXTENSION_LOADED', extension.id, extension.name, extension.version);  const fixtureUrl = 'http://127.0.0.1:8766/tests/fixture-phish.html';
  const fixture = await fetch(base + '/json/new?' + encodeURIComponent(fixtureUrl), { method:'PUT' }).then(r => r.json());
  await fetch(base + '/json/activate/' + fixture.id);
  await delay(500);
  const tabs = await rpc(version.webSocketDebuggerUrl, 'Target.getTargets', { filter:[{type:'tab',exclude:false}] });
  const tab = tabs.targetInfos.find(t => t.url === fixtureUrl && t.embedderData?.tabActive);
  assert(tab, 'No se encontró el target de pestaña activo para el fixture');
  await rpc(version.webSocketDebuggerUrl, 'Extensions.triggerAction', { id:extension.id, targetId:tab.targetId });
  await delay(700);
  const targets = await fetch(base + '/json/list').then(r => r.json());
  const popup = targets.find(t => t.url === `chrome-extension://${extension.id}/popup.html`);
  assert(popup, 'No apareció el popup de la extensión');
  console.log('POPUP_OPEN', popup.id);
  await evalIn(popup.webSocketDebuggerUrl, "document.querySelector('#scan').click(); 'CLICKED'");
  await delay(1200);
  const snapshot = await evalIn(popup.webSocketDebuggerUrl, `({
    score: document.querySelector('#score')?.textContent,
    label: document.querySelector('#label')?.textContent,
    verdict: document.querySelector('#verdict')?.textContent,
    details: document.querySelector('#details')?.innerText
  })`);
  console.log('SNAPSHOT', JSON.stringify(snapshot));
  const score = Number(snapshot.score);
  assert(Number.isFinite(score) && score >= 60, 'El fixture de alto riesgo no produjo score alto');
  assert(/Alto/i.test(snapshot.label || ''), 'El popup no clasificó riesgo Alto');
  assert(/intervención|alto|riesgo|phishing|estafa/i.test(snapshot.verdict || ''), 'El veredicto de alto riesgo no es explícito');
  assert(/dominio externo|dominio externo/i.test(snapshot.details || ''), 'Popup missing external form destination evidence');
  const debugTargets = await fetch(base + '/json/list').then(r => r.json());
  const worker = debugTargets.find(t => t.type === 'service_worker' && t.url === `chrome-extension://${extension.id}/background.js`);
  assert(worker?.webSocketDebuggerUrl, 'No se encontró el service worker de contexto');
  const tokenExpr = "openAnalysis('url','http://openai.com.evil.test/login').then(()=> 'OPENED')";
  await evalIn(worker.webSocketDebuggerUrl, tokenExpr);
  await delay(900);
  const afterContext = await fetch(base + '/json/list').then(r => r.json());
  const report = afterContext.find(t => t.url.startsWith(`chrome-extension://${extension.id}/report.html?token=`));
  assert(report, 'No se abrió la vista Context Analysis');
  const contextSnapshot = await evalIn(report.webSocketDebuggerUrl, "({score:document.querySelector('#score')?.textContent,label:document.querySelector('#label')?.textContent,subject:document.querySelector('#subject')?.textContent})");
  assert(Number(contextSnapshot.score) >= 30, 'El enlace engañoso no produjo riesgo material');
  assert(/Riesgo/i.test(contextSnapshot.label || ''), 'Context Analysis no mostró clasificación');
  assert(/openai\.com\.evil\.test/i.test(contextSnapshot.subject || ''), 'Context Analysis perdió el enlace analizado');
  console.log('CONTEXT_ANALYSIS', JSON.stringify(contextSnapshot));
  console.log('RUMBO Guardian extension integration: PASS');
})().catch(err => {
  console.error('RUMBO Guardian extension integration: FAIL');  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
