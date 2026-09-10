'use strict';

const base = process.env.RUMBO_GUARDIAN_MCP_BASE || 'https://rumbo-guardian-mcp.val.run';
const expectedSha = process.env.RUMBO_GUARDIAN_SOURCE_SHA || 'c7e1483dcf5a40c2efa0ee6c45b2b91dc534ddc1';
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
  const names = tools.json?.result?.tools?.map(tool => tool.name) || [];
  if (JSON.stringify(names) !== JSON.stringify(expectedTools)) throw new Error(`TOOLS_MISMATCH:${JSON.stringify(names)}`);
  if (!tools.json.result.tools.every(tool => tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false && tool.annotations?.openWorldHint === false)) throw new Error('TOOL_ANNOTATIONS_MISMATCH');

  const unknown = await request(path, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'definitely_not_a_tool', arguments: {} } });
  const unknownBlocked = unknown.status === 200 && (unknown.json?.result?.isError === true || typeof unknown.json?.error?.code === 'number');
  if (!unknownBlocked) throw new Error(`UNKNOWN_TOOL_GUARD_FAIL:${unknown.status}`);

  const notification = await request(path, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  if (notification.status !== 202 || notification.text !== '') throw new Error(`NOTIFICATION_202_FAIL:${notification.status}:${notification.text}`);

  const hostileOrigin = await request(path, { jsonrpc: '2.0', id: 4, method: 'ping', params: {} }, { origin: 'https://evil.invalid' });
  if (hostileOrigin.status !== 403 || hostileOrigin.json?.error?.message !== 'Invalid Origin') throw new Error(`ORIGIN_VALIDATION_FAIL:${hostileOrigin.status}`);

  console.log(JSON.stringify({ hostedCoreConformance:'PASS', publicPath:path || '/', sourceSha:selected.source, protocol:selected.json.result.protocolVersion, tools:names, annotations:'PASS', unknownToolGuard:'PASS', notification202:'PASS', hostileOriginStatus:hostileOrigin.status, originValidation:'PASS' }));
})();
