'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { PROTOCOL_VERSION } = require('../openai-publication/rumbo-guardian/mcp-contract.js');

let createGuardianServer;
try {
  ({ createGuardianServer } = require('../render-server.js'));
} catch (error) {
  assert.fail(`render-server.js must export createGuardianServer: ${error.code || error.message}`);
}

function request(port, { method = 'GET', path = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

(async () => {
  const server = createGuardianServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const health = await request(port, { path: '/healthz' });
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).service, 'rumbo-guardian-mcp');

    const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'render-host-test', version: '1.0.0' } } });
    const response = await request(port, { method: 'POST', path: '/mcp', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'content-length': Buffer.byteLength(init) }, body: init });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).result.protocolVersion, PROTOCOL_VERSION);

    const missing = await request(port, { path: '/not-a-route' });
    assert.equal(missing.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log('RUMBO_GUARDIAN_RENDER_HOST_ADAPTER_PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
