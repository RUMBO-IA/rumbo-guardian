'use strict';

const Adapter = require('./runtime-adapter.js');

const tools = [
  {
    name: 'analyze_url',
    title: 'Analyze suspicious URL',
    description: 'Analyzes one user-supplied URL locally for defensive phishing and navigation indicators without opening or fetching the destination.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', minLength: 1, maxLength: 16384 } }, required: ['url'], additionalProperties: false },
    outputSchema: { type: 'object', additionalProperties: true },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: 'analyze_text',
    title: 'Analyze suspicious text',
    description: 'Analyzes user-supplied text for defensive phishing, fraud, impersonation, credential-request, and urgency indicators without external actions.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 16384 } }, required: ['text'], additionalProperties: false },
    outputSchema: { type: 'object', additionalProperties: true },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: 'verify_ledger',
    title: 'Verify Evidence Ledger',
    description: 'Verifies the supplied Evidence Ledger hash-chain structure locally and returns integrity results without modifying the ledger.',
    inputSchema: { type: 'object', properties: { ledger: { type: 'object' } }, required: ['ledger'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { valid: { type: 'boolean' }, entries: { type: 'integer' }, brokenAt: {}, reason: {}, rootHash: { type: 'string' } }, required: ['valid','entries'], additionalProperties: true },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: 'explain_signal',
    title: 'Explain Guardian signal',
    description: 'Explains one Guardian signal code and its limitation without making an accusation or taking an external action.',
    inputSchema: { type: 'object', properties: { code: { type: 'string', minLength: 1, maxLength: 256 } }, required: ['code'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { code: { type: 'string' }, explanation: { type: 'string' }, supported: { type: 'boolean' } }, required: ['code','explanation','supported'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  }
];

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }

async function handleMcpRequest(request) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return rpcError(request?.id, -32600, 'Invalid Request');
  if (request.method === 'initialize') return rpcResult(request.id, { protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'rumbo-guardian', version: '0.1.0-bounded' }, instructions: 'Defensive read-only analysis of user-supplied URLs, text, Guardian signals, and Evidence Ledgers. No autonomous browsing or external actions.' });
  if (request.method === 'notifications/initialized') return null;
  if (request.method === 'ping') return rpcResult(request.id, {});
  if (request.method === 'tools/list') return rpcResult(request.id, { tools });
  if (request.method === 'tools/call') {
    const name = request.params?.name;
    const args = request.params?.arguments ?? {};
    try {
      const structuredContent = await Adapter.call(name, args);
      return rpcResult(request.id, { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent, isError: false });
    } catch (error) {
      return rpcResult(request.id, { content: [{ type: 'text', text: `Guardian tool error: ${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}` }], isError: true });
    }
  }
  return rpcError(request.id, -32601, 'Method not found');
}

module.exports = { tools, handleMcpRequest };
