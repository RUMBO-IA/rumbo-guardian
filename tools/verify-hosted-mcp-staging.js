'use strict';

const base = process.env.RUMBO_GUARDIAN_MCP_BASE || 'https://rumbo-guardian-mcp-aaqycs.v2.appdeploy.ai';
const expectedSha = '5720a1c752b80f08abf8ac69e908738ec3e4ee31';
const expectedTools = ['analyze_url', 'analyze_text', 'verify_ledger', 'explain_signal'];

async function post(body, extraHeaders = {}) {
  const response = await fetch(`${base}/mcp`, {
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
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { response, text, json };
}

(async () => {
  const healthResponse = await fetch(`${base}/api/_healthcheck`, { headers: { accept: 'application/json' } });
  const health = await healthResponse.json();
  if (healthResponse.status !== 200 || health?.sourceSha !== expectedSha) throw new Error(`HEALTH_RECEIPT_MISMATCH:${healthResponse.status}:${health?.sourceSha}`);

  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'github-actions-independent-verifier', version: '1.0.0' } } });
  if (init.response.status !== 200 || init.json?.result?.protocolVersion !== '2025-06-18') throw new Error(`INITIALIZE_FAIL:${init.response.status}`);

  const tools = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const names = tools.json?.result?.tools?.map(tool => tool.name) || [];
  if (JSON.stringify(names) !== JSON.stringify(expectedTools)) throw new Error(`TOOLS_MISMATCH:${JSON.stringify(names)}`);

  const unknown = await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'definitely_not_a_tool', arguments: {} } });
  if (unknown.response.status !== 200 || unknown.json?.result?.isError !== true) throw new Error(`UNKNOWN_TOOL_GUARD_FAIL:${unknown.response.status}`);

  const notification = await post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  if (notification.response.status !== 202 || notification.text !== '') throw new Error(`NOTIFICATION_202_FAIL:${notification.response.status}:${notification.text}`);

  const hostileOrigin = await post({ jsonrpc: '2.0', id: 4, method: 'ping', params: {} }, { origin: 'https://evil.invalid' });
  const originProtected = hostileOrigin.response.status === 403;

  console.log(JSON.stringify({
    hostedCoreConformance: 'PASS',
    healthSourceSha: health.sourceSha,
    protocol: init.json.result.protocolVersion,
    tools: names,
    unknownToolGuard: 'PASS',
    notification202: 'PASS',
    hostileOriginStatus: hostileOrigin.response.status,
    originValidation: originProtected ? 'PASS' : 'FAIL'
  }));

  if (!originProtected) throw new Error(`ORIGIN_VALIDATION_FAIL:expected_403_got_${hostileOrigin.response.status}`);
})();
