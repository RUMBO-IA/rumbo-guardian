'use strict';

const assert = require('node:assert/strict');
const { PROTOCOL_VERSION } = require('../openai-publication/rumbo-guardian/mcp-contract.js');
const handler = require('../api/mcp.js');

const ACCEPT = 'application/json, text/event-stream';

function makeReq(method, body, headers = {}, url = '/mcp') {
  const listeners = {};
  return {
    method,
    body,
    headers,
    url,
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

function parseJsonIfPossible(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

async function run(method, body, headers = {}, url = '/mcp') {
  const req = makeReq(method, body, headers, url);
  const res = makeRes();
  await handler(req, res);
  return { req, res, json: parseJsonIfPossible(res.body) };
}

(async () => {
  const commonHeaders = { 'content-type': 'application/json', accept: ACCEPT, 'mcp-protocol-version': PROTOCOL_VERSION, host: 'guardian.example.test' };

  {
    const { res } = await run('OPTIONS', undefined, { host: 'guardian.example.test', origin: 'https://guardian.example.test' });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['MCP-Protocol-Version'], PROTOCOL_VERSION);
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://guardian.example.test');
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 0, method: 'ping' }, { ...commonHeaders, origin: 'https://evil.invalid' });
    assert.equal(res.statusCode, 403);
    assert.equal(json.error.message, 'Invalid Origin');
    assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  }

  {
    const previous = process.env.OPENAI_APPS_CHALLENGE;
    delete process.env.OPENAI_APPS_CHALLENGE;
    const { res } = await run('GET', undefined, { host: 'guardian.example.test' }, '/.well-known/openai-apps-challenge');
    assert.equal(res.statusCode, 404);
    assert.equal(res.body, '');
    if (previous === undefined) delete process.env.OPENAI_APPS_CHALLENGE;
    else process.env.OPENAI_APPS_CHALLENGE = previous;
  }

  {
    const previous = process.env.OPENAI_APPS_CHALLENGE;
    process.env.OPENAI_APPS_CHALLENGE = 'openai-domain-token-example';
    const { res } = await run('GET', undefined, { host: 'guardian.example.test' }, '/.well-known/openai-apps-challenge');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, 'openai-domain-token-example');
    assert.equal(res.headers['Content-Type'], 'text/plain; charset=utf-8');
    assert.equal(res.headers['Cache-Control'], 'no-store');
    if (previous === undefined) delete process.env.OPENAI_APPS_CHALLENGE;
    else process.env.OPENAI_APPS_CHALLENGE = previous;
  }

  {
    const { res, json } = await run('GET', undefined, { host: 'guardian.example.test' });
    assert.equal(res.statusCode, 405);
    assert.equal(json.error, 'METHOD_NOT_ALLOWED');
  }

  {
    const { res, json } = await run('POST', {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } }
    }, { 'content-type': 'application/json', accept: ACCEPT, host: 'guardian.example.test' });
    assert.equal(res.statusCode, 200);
    assert.equal(json.result.protocolVersion, PROTOCOL_VERSION);
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 2, method: 'ping' }, {
      'content-type': 'application/json', accept: ACCEPT, host: 'guardian.example.test'
    });
    assert.equal(res.statusCode, 400);
    assert.equal(json.error.message, 'Missing or invalid MCP-Protocol-Version');
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 3, method: 'ping' }, commonHeaders);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(json.result, {});
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 4, method: 'tools/list' }, commonHeaders);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(json.result.tools.map(tool => tool.name), ['analyze_url', 'analyze_text', 'verify_ledger', 'explain_signal']);
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', method: 'notifications/initialized' }, commonHeaders);
    assert.equal(res.statusCode, 202);
    assert.equal(json, null);
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 6, method: 'notifications/initialized' }, commonHeaders);
    assert.equal(res.statusCode, 400);
    assert.equal(json.error.message, 'Notifications MUST NOT include an id');
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 7, method: 'ping' }, {
      'content-type': 'text/plain', accept: ACCEPT, 'mcp-protocol-version': PROTOCOL_VERSION, host: 'guardian.example.test'
    });
    assert.equal(res.statusCode, 415);
    assert.equal(json.error.message, 'Unsupported Content-Type');
  }

  {
    const { res, json } = await run('POST', { jsonrpc: '2.0', id: 8, method: 'ping' }, {
      'content-type': 'application/json', accept: 'application/json', 'mcp-protocol-version': PROTOCOL_VERSION, host: 'guardian.example.test'
    });
    assert.equal(res.statusCode, 406);
    assert.equal(json.error.message, 'Accept must include application/json and text/event-stream');
  }

  console.log('RUMBO_GUARDIAN_MCP_HTTP_ADAPTER_PASS');
})();
