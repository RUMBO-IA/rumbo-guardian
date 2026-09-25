const base = process.env.RUMBO_GUARDIAN_MCP_BASE_URL?.replace(/\/$/, '');
if (!base) {
  console.error('RUMBO_GUARDIAN_MCP_BASE_URL is required');
  process.exit(2);
}

const endpoint = `${base}/mcp`;
const headers = {
  origin: 'https://chatgpt.com',
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
};

async function expectStatus(name, response, expected) {
  if (response.status !== expected) {
    const body = await response.text().catch(() => '');
    throw new Error(`${name}: expected ${expected}, got ${response.status}: ${body.slice(0, 500)}`);
  }
  console.log(`PASS ${name} ${expected}`);
}

const init = await fetch(endpoint, {
  method: 'POST', headers,
  body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2025-06-18', capabilities:{}, clientInfo:{ name:'rumbo-guardian-hosted-verifier', version:'1.0.0' } } }),
});
await expectStatus('initialize', init, 200);
const initJson = await init.json();
if (initJson?.result?.protocolVersion !== '2025-06-18') throw new Error('protocolVersion mismatch');

const toolsRes = await fetch(endpoint, { method:'POST', headers, body: JSON.stringify({ jsonrpc:'2.0', id:2, method:'tools/list', params:{} }) });
await expectStatus('tools/list', toolsRes, 200);
const toolsJson = await toolsRes.json();
const names = toolsJson?.result?.tools?.map((tool) => tool.name) ?? [];
const expected = ['analyze_url','analyze_text','verify_ledger','explain_signal'];
if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error(`tool catalog mismatch: ${JSON.stringify(names)}`);
if (!toolsJson.result.tools.every((tool) => tool.annotations?.readOnlyHint === true && tool.annotations?.openWorldHint === false && tool.annotations?.destructiveHint === false)) throw new Error('unsafe tool annotation drift');

const notification = await fetch(endpoint, { method:'POST', headers, body: JSON.stringify({ jsonrpc:'2.0', method:'notifications/initialized', params:{} }) });
if (![200,202].includes(notification.status)) throw new Error(`initialized notification status ${notification.status}`);
if ((await notification.text()).length !== 0) throw new Error('initialized notification must not return a JSON-RPC body');

console.log('RUMBO_GUARDIAN_HOSTED_MCP_CONFORMANCE_PASS');
