'use strict';

const assert = require('node:assert/strict');
const { PROTOCOL_VERSION } = require('../openai-publication/rumbo-guardian/mcp-contract.js');
const handler = require('../api/mcp.js');

function makeReq(method, body, headers = {}) {
  const listeners = {};
  return {
    method,
    body,
    headers,
    on(event, callback) { listeners[event] = callback; },
    destroy() {}
  };
}

function makeRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    body: undefined,
    setHeader(name, value) { headers[name] = value; },
    end(value = '') { this.body = value; }
  };
}

async function run(method, body, headers = {}) {
  const req = makeReq(method, body, headers);
  const res = makeRes();
  await handler(req, res);
  return { req, res, json: res.body ? JSON.parse(res.body) : null };
}

(async () => {
  {
    const { res } = await run('OPTIONS', undefined);
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['MCP-Protocol-Version'], PROTOCOL_VERSION);
  }

  {
    const { res, json } = await run('GET', undefined);
    assert.equal(res.statusCode, 405);
    assert.equal(json.error, 'METHOD_NOT_ALLOWED');
  }

  {
    const { res, json } = await run('POST', {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } }
    }, { 'content-type': 'application/json' });
    assert.equal(res.statusCode, 200);
    assert.equal(json.result.protocolVersion, PROTOCOL_VERSION);
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 2, method: 'ping' }, { 'content-type': 'application/json' });
    assert.equal(res.statusCode, 400);
    assert.equal(json.error.message, 'Missing or invalid MCP-Protocol-Version');
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 3, method: 'ping' }, {
      'content-type': 'application/json', 'mcp-protocol-version': PROTOCOL_VERSION
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(json.result, {});
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 4, method: 'tools/list' }, {
      'content-type': 'application/json', 'mcp-protocol-version': PROTOCOL_VERSION
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(json.result.tools.map(tool => tool.name), ['analyze_url', 'analyze_text', 'verify_ledger', 'explain_signal']);
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 5, method: 'notifications/initialized' }, {
      'content-type': 'application/json', 'mcp-protocol-version': PROTOCOL_VERSION
    });
    assert.equal(res.statusCode, 204);
    assert.equal(json, null);
  }

  console.log('RUMBO_GUARDIAN_MCP_HTTP_ADAPTER_PASS');
})();
