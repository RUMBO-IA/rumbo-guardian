'use strict';

const Adapter = require('./runtime-adapter.js');
const PROTOCOL_VERSION = '2025-06-18';

const reasonSchema = {
  type: 'object',
  properties: {
    points: { type: 'number' },
    title: { type: 'string' },
    detail: { type: 'string' },
    code: { type: 'string' }
  },
  required: ['points', 'title', 'detail', 'code'],
  additionalProperties: false
};

const redirectHopSchema = {
  type: 'object',
  properties: {
    param: { type: 'string' },
    url: { type: 'string' },
    domain: { type: 'string' },
    score: { type: 'number', minimum: 0, maximum: 100 },
    label: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
    decodePasses: { type: 'integer', minimum: 1, maximum: 3 }
  },
  required: ['param', 'url', 'domain', 'score', 'label', 'reasons', 'decodePasses'],
  additionalProperties: false
};

const urlAnalysisSchema = {
  type: 'object',
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100 },
    level: { type: 'string', enum: ['safe', 'caution', 'danger', 'neutral'] },
    label: { type: 'string' },
    verdict: { type: 'string' },
    guide: { type: 'string' },
    domain: { type: 'string' },
    domainStatus: { type: 'string', enum: ['trusted', 'blocked', 'neutral'] },
    url: { type: 'string' },
    reasons: { type: 'array', items: reasonSchema },
    redirectTargets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          param: redirectHopSchema.properties.param,
          url: redirectHopSchema.properties.url,
          domain: redirectHopSchema.properties.domain,
          score: redirectHopSchema.properties.score,
          label: redirectHopSchema.properties.label,
          reasons: redirectHopSchema.properties.reasons,
          decodePasses: redirectHopSchema.properties.decodePasses,
          chain: { type: 'array', items: redirectHopSchema }
        },
        required: ['param', 'url', 'domain', 'score', 'label', 'reasons', 'decodePasses', 'chain'],
        additionalProperties: false
      }
    }
  },
  required: ['score', 'level', 'label', 'domain', 'domainStatus', 'url', 'reasons'],
  additionalProperties: false
};

const textAnalysisSchema = {
  type: 'object',
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100 },
    level: { type: 'string', enum: ['safe', 'caution', 'danger', 'neutral'] },
    label: { type: 'string' },
    verdict: { type: 'string' },
    guide: { type: 'string' },
    reasons: { type: 'array', items: reasonSchema },
    links: { type: 'array', items: { type: 'string' } },
    linkResults: { type: 'array', items: urlAnalysisSchema },
    text: { type: 'string' },
    kind: { type: 'string' }
  },
  required: ['score', 'level', 'label', 'verdict', 'guide', 'reasons', 'links', 'linkResults', 'text', 'kind'],
  additionalProperties: false
};

const noauth = [{ type: 'noauth' }];

const tools = [
  {
    name: 'analyze_url',
    title: 'Analyze suspicious URL',
    description: 'Analyzes one user-supplied URL locally for defensive phishing and navigation indicators without opening or fetching the destination.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', minLength: 1, maxLength: 16384 } }, required: ['url'], additionalProperties: false },
    outputSchema: urlAnalysisSchema,
    securitySchemes: noauth,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: 'analyze_text',
    title: 'Analyze suspicious text',
    description: 'Analyzes user-supplied text for defensive phishing, fraud, impersonation, credential-request, and urgency indicators without external actions.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 16384 } }, required: ['text'], additionalProperties: false },
    outputSchema: textAnalysisSchema,
    securitySchemes: noauth,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: 'verify_ledger',
    title: 'Verify Evidence Ledger',
    description: 'Verifies the supplied Evidence Ledger hash-chain structure locally and returns integrity results without modifying the ledger.',
    inputSchema: { type: 'object', properties: { ledger: { type: 'object' } }, required: ['ledger'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { valid: { type: 'boolean' }, entries: { type: 'integer' }, brokenAt: {}, reason: {}, rootHash: { type: 'string' } }, required: ['valid','entries'], additionalProperties: true },
    securitySchemes: noauth,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: 'explain_signal',
    title: 'Explain Guardian signal',
    description: 'Explains one Guardian signal code and its limitation without making an accusation or taking an external action.',
    inputSchema: { type: 'object', properties: { code: { type: 'string', minLength: 1, maxLength: 256 } }, required: ['code'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { code: { type: 'string' }, explanation: { type: 'string' }, supported: { type: 'boolean' } }, required: ['code','explanation','supported'], additionalProperties: false },
    securitySchemes: noauth,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  }
];

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message, data) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }; }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

async function handleMcpRequest(request) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return rpcError(request?.id, -32600, 'Invalid Request');
  if (request.method === 'initialize') {
    const params = isRecord(request.params) ? request.params : null;
    const clientInfo = params && isRecord(params.clientInfo) ? params.clientInfo : null;
    if (!params || params.protocolVersion !== PROTOCOL_VERSION || !isRecord(params.capabilities) || !clientInfo || typeof clientInfo.name !== 'string' || !clientInfo.name || typeof clientInfo.version !== 'string' || !clientInfo.version) {
      return rpcError(request.id, -32602, 'Invalid initialize parameters', { supportedProtocolVersion: PROTOCOL_VERSION });
    }
    return rpcResult(request.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'rumbo-guardian', version: '0.1.2-bounded' }, instructions: 'Defensive read-only analysis of user-supplied URLs, text, Guardian signals, and Evidence Ledgers. No autonomous browsing or external actions.' });
  }
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

module.exports = { tools, handleMcpRequest, PROTOCOL_VERSION, urlAnalysisSchema, textAnalysisSchema };
