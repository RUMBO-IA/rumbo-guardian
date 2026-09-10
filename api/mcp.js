'use strict';

const { handleMcpRequest, PROTOCOL_VERSION } = require('../openai-publication/rumbo-guardian/mcp-contract.js');

const MAX_BODY_BYTES = 1024 * 1024;
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

function sendJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', JSON_CONTENT_TYPE);
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  res.end(payload === null ? '' : JSON.stringify(payload));
}

function allowHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version',
    'Access-Control-Expose-Headers': 'MCP-Protocol-Version',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
    'Cache-Control': 'no-store'
  };
}

function bodyBytes(req) {
  const length = Number(req.headers?.['content-length']);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return Promise.reject(new Error('BODY_TOO_LARGE'));
  if (req.body !== undefined) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', chunk => {
      total += Buffer.byteLength(chunk);
      if (total > MAX_BODY_BYTES) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function mcp(req, res) {
  const headers = allowHeaders();
  if (req.method === 'OPTIONS') return sendJson(res, 204, null, headers);
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' }, { ...headers, Allow: 'POST, OPTIONS' });

  const protocolHeader = req.headers?.['mcp-protocol-version'];
  const rawBody = req.body;
  let body;
  try {
    body = await bodyBytes(req);
  } catch (error) {
    const status = error.message === 'BODY_TOO_LARGE' ? 413 : 400;
    return sendJson(res, status, { jsonrpc: '2.0', id: null, error: { code: -32700, message: error.message } }, headers);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, headers);
  }

  // The 2025-06-18 handshake establishes the version in the JSON body.
  // Every subsequent request must carry the negotiated MCP-Protocol-Version header.
  if (body.method !== 'initialize' && protocolHeader !== PROTOCOL_VERSION) {
    return sendJson(res, 400, { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32600, message: 'Missing or invalid MCP-Protocol-Version' } }, headers);
  }

  const result = await handleMcpRequest(body);
  if (result === null) return sendJson(res, 204, null, headers);
  return sendJson(res, 200, result, headers);
};
