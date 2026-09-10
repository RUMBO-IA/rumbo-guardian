'use strict';

const assert = require('node:assert/strict');
const { tools, handleMcpRequest } = require('./mcp-contract.js');

(async () => {
  assert.deepEqual(tools.map((tool) => tool.name), ['analyze_url','analyze_text','verify_ledger','explain_signal']);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.openWorldHint, false);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.outputSchema.type, 'object');
  }

  const init = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'rumbo-guardian');

  const list = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.equal(list.result.tools.length, 4);

  const text = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'analyze_text', arguments: { text: 'Urgent: verify your payroll password now' } } });
  assert.equal(text.result.isError, false);
  assert.ok(text.result.structuredContent);

  const explain = await handleMcpRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'explain_signal', arguments: { code: 'active_content_scheme' } } });
  assert.equal(explain.result.structuredContent.supported, true);

  const unknown = await handleMcpRequest({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'scan_target', arguments: {} } });
  assert.equal(unknown.result.isError, true);

  assert.equal(await handleMcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  console.log('OPENAI_GUARDIAN_MCP_CONTRACT_PASS');
})().catch((error) => { console.error(error); process.exit(1); });
