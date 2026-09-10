'use strict';

const base = process.env.RUMBO_GUARDIAN_MCP_BASE || 'https://rumbo-guardian-mcp.val.run';
const expectedSha = process.env.RUMBO_GUARDIAN_SOURCE_SHA || '89cbd20685604a01be8b17a09584a1e7364b4fb0';
const expectedTools = ['analyze_url', 'analyze_text', 'verify_ledger', 'explain_signal'];

function parsePayload(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const data = text.split(/\r?\n/).find(line => line.startsWith('data: '));
  if (!data) return null;
  try { return JSON.parse(data.slice(6)); } catch { return null; }
}

async function request(path, body, extraHeaders = {}) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  return { path, status: response.status, contentType: response.headers.get('content-type'), source: response.headers.get('x-rumbo-source-sha'), text, json: parsePayload(text) };
}

async function callTool(path, id, name, args) {
  const result = await request(path, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  if (result.status !== 200) throw new Error(`${name.toUpperCase()}_HTTP_FAIL:${result.status}`);
  return result.json?.result?.structuredContent;
}

(async () => {
  const initBody = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'github-actions-independent-verifier', version: '1.0.0' } } };
  const candidates = [];
  for (const path of ['', '/mcp', '/api/mcp']) candidates.push(await request(path, initBody));
  console.log('PUBLIC_ROUTE_PROBE', JSON.stringify(candidates.map(x => ({ path:x.path || '/', status:x.status, contentType:x.contentType, source:x.source, bodyPrefix:x.text.slice(0,120) }))));

  const selected = candidates.find(x => x.status === 200 && x.json?.result?.protocolVersion === '2025-06-18');
  if (!selected) throw new Error('PUBLIC_MCP_ENDPOINT_NOT_EXPOSED');
  if (selected.source !== expectedSha) throw new Error(`SOURCE_SHA_MISMATCH:${selected.source}`);
  const path = selected.path;

  const tools = await request(path, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const descriptors = tools.json?.result?.tools || [];
  const names = descriptors.map(tool => tool.name);
  if (JSON.stringify(names) !== JSON.stringify(expectedTools)) throw new Error(`TOOLS_MISMATCH:${JSON.stringify(names)}`);
  if (!descriptors.every(tool => tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false && tool.annotations?.openWorldHint === false)) throw new Error('TOOL_ANNOTATIONS_MISMATCH');
  if (!descriptors.every(tool => Array.isArray(tool.securitySchemes) && tool.securitySchemes.length === 1 && tool.securitySchemes[0]?.type === 'noauth')) throw new Error('TOOL_SECURITY_SCHEMES_NOAUTH_MISMATCH');
  if (!descriptors.every(tool => tool.outputSchema?.type === 'object')) throw new Error('TOOL_OUTPUT_SCHEMA_MISSING');

  const unknown = await request(path, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'definitely_not_a_tool', arguments: {} } });
  const unknownBlocked = unknown.status === 200 && (unknown.json?.result?.isError === true || typeof unknown.json?.error?.code === 'number');
  if (!unknownBlocked) throw new Error(`UNKNOWN_TOOL_GUARD_FAIL:${unknown.status}`);

  const notification = await request(path, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  if (notification.status !== 202 || notification.text !== '') throw new Error(`NOTIFICATION_202_FAIL:${notification.status}:${notification.text}`);

  const hostileOrigin = await request(path, { jsonrpc: '2.0', id: 4, method: 'ping', params: {} }, { origin: 'https://evil.invalid' });
  if (hostileOrigin.status !== 403 || hostileOrigin.json?.error?.message !== 'Invalid Origin') throw new Error(`ORIGIN_VALIDATION_FAIL:${hostileOrigin.status}`);

  const urlAnalysis = await callTool(path, 10, 'analyze_url', { url: 'javascript:alert(1)' });
  if (urlAnalysis?.level !== 'danger' || !urlAnalysis?.reasons?.some(reason => reason.code === 'active_content_scheme')) throw new Error('ANALYZE_URL_PARITY_FAIL');

  const textAnalysis = await callTool(path, 11, 'analyze_text', { text: 'URGENTE: verificá tu cuenta ahora mismo y enviá tu password para evitar el bloqueo.' });
  const textCodes = textAnalysis?.reasons?.map(reason => reason.code) || [];
  if (!(textAnalysis?.score > 0) || !textCodes.includes('urgency') || !textCodes.includes('credentials')) throw new Error('ANALYZE_TEXT_PARITY_FAIL');

  const signal = await callTool(path, 12, 'explain_signal', { code: 'active_content_scheme' });
  if (signal?.supported !== true || signal?.code !== 'active_content_scheme') throw new Error('EXPLAIN_SIGNAL_PARITY_FAIL');

  const ledger = await callTool(path, 13, 'verify_ledger', { ledger: {} });
  if (ledger?.valid !== false || ledger?.reason !== 'missing_history') throw new Error('VERIFY_LEDGER_PARITY_FAIL');

  const challenge = await fetch(`${base}/.well-known/openai-apps-challenge`, { redirect: 'error' });
  const challengeText = await challenge.text();
  if (challenge.status !== 404 || challengeText !== '') throw new Error(`DOMAIN_CHALLENGE_FAIL_CLOSED_MISMATCH:${challenge.status}:${challengeText.slice(0,80)}`);

  console.log(JSON.stringify({ hostedCoreConformance:'PASS', hostedFunctionalParitySmoke:'PASS', publicPath:path || '/', sourceSha:selected.source, protocol:selected.json.result.protocolVersion, tools:names, annotations:'PASS', securitySchemesNoauth:'PASS', outputSchemas:'PASS', unknownToolGuard:'PASS', notification202:'PASS', originValidation:'PASS', analyzeUrl:'PASS', analyzeText:'PASS', explainSignal:'PASS', verifyLedgerNegative:'PASS', domainChallengeWithoutToken:'PASS_404_EMPTY' }));
})();
