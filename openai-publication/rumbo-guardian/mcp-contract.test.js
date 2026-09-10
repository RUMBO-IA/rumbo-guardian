'use strict';

const assert = require('node:assert/strict');
const { tools, handleMcpRequest, PROTOCOL_VERSION } = require('./mcp-contract.js');

function assertClosedShape(schema, value) {
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  const keys = Object.keys(value);
  for (const required of schema.required || []) assert.ok(Object.hasOwn(value, required), `missing required output key: ${required}`);
  for (const key of keys) assert.ok(Object.hasOwn(schema.properties || {}, key), `unexpected output key: ${key}`);
}

(async () => {
  assert.deepEqual(tools.map((tool) => tool.name), ['analyze_url','analyze_text','verify_ledger','explain_signal']);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.openWorldHint, false);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.outputSchema.type, 'object');
  }

  const initRequest = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1' } } };
  const init = await handleMcpRequest(initRequest);
  assert.equal(init.result.protocolVersion, PROTOCOL_VERSION);
  assert.equal(init.result.serverInfo.name, 'rumbo-guardian');

  const missing = await handleMcpRequest({ jsonrpc: '2.0', id: 11, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION } });
  assert.equal(missing.error.code, -32602);
  assert.equal(missing.error.data.supportedProtocolVersion, PROTOCOL_VERSION);

  const unsupported = await handleMcpRequest({ ...initRequest, id: 12, params: { ...initRequest.params, protocolVersion: '2025-03-26' } });
  assert.equal(unsupported.error.code, -32602);
  assert.equal(unsupported.error.data.supportedProtocolVersion, PROTOCOL_VERSION);

  const list = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.equal(list.result.tools.length, 4);
  const byName = Object.fromEntries(list.result.tools.map((tool) => [tool.name, tool]));

  const text = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'analyze_text', arguments: { text: 'Urgent: verify your payroll password now https://example.com/login' } } });
  assert.equal(text.result.isError, false);
  assertClosedShape(byName.analyze_text.outputSchema, text.result.structuredContent);
  for (const linkResult of text.result.structuredContent.linkResults) assertClosedShape(byName.analyze_url.outputSchema, linkResult);

  const validUrl = await handleMcpRequest({ jsonrpc: '2.0', id: 31, method: 'tools/call', params: { name: 'analyze_url', arguments: { url: 'https://example.com/login?next=https%3A%2F%2Fevil.test%2F' } } });
  assert.equal(validUrl.result.isError, false);
  assertClosedShape(byName.analyze_url.outputSchema, validUrl.result.structuredContent);

  const invalidUrl = await handleMcpRequest({ jsonrpc: '2.0', id: 32, method: 'tools/call', params: { name: 'analyze_url', arguments: { url: 'not a valid url' } } });
  assert.equal(invalidUrl.result.isError, false);
  assert.equal(invalidUrl.result.structuredContent.level, 'neutral');
  assertClosedShape(byName.analyze_url.outputSchema, invalidUrl.result.structuredContent);

  const explain = await handleMcpRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'explain_signal', arguments: { code: 'active_content_scheme' } } });
  assert.equal(explain.result.structuredContent.supported, true);
  assertClosedShape(byName.explain_signal.outputSchema, explain.result.structuredContent);

  const unknown = await handleMcpRequest({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'scan_target', arguments: {} } });
  assert.equal(unknown.result.isError, true);

  assert.equal(await handleMcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  console.log('OPENAI_GUARDIAN_MCP_CONTRACT_PASS');
})().catch((error) => { console.error(error); process.exit(1); });
