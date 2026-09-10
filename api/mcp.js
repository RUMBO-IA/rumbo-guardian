'use strict';

const { handleMcpRequest, PROTOCOL_VERSION } = require('../openai-publication/rumbo-guardian/mcp-contract.js');

const MAX_BODY_BYTES = 1024 * 1024;
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const REQUIRED_ACCEPT_TYPES = ['application/json', 'text/event-stream'];

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
    'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version',
    'Access-Control-Expose-Headers': 'MCP-Protocol-Version',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
    'Cache-Control': 'no-store'
  };
}

function contentTypeIsJson(value) {
  return typeof value === 'string' && value.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

function acceptsRequiredTypes(value) {
  if (typeof value !== 'string') return false;
  const accepted = value.split(',').map(part => part.split(';', 1)[0].trim().toLowerCase());
  return REQUIRED_ACCEPT_TYPES.every(type => accepted.includes(type));
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

  const contentType = req.headers?.['content-type'];
  if (!contentTypeIsJson(contentType)) {
    return sendJson(res, 415, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Unsupported Content-Type' } }, headers);
  }

  const accept = req.headers?.accept;
  if (!acceptsRequiredTypes(accept)) {
    return sendJson(res, 406, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Accept must include application/json and text/event-stream' } }, headers);
  }

  const protocolHeader = req.headers?.['mcp-protocol-version'];
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

  if (body.method !== 'initialize' && protocolHeader !== PROTOCOL_VERSION) {
    return sendJson(res, 400, { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32600, message: 'Missing or invalid MCP-Protocol-Version' } }, headers);
  }

  if (protocolHeader && body.method === 'initialize' && protocolHeader !== PROTOCOL_VERSION) {
    return sendJson(res, 400, { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32600, message: 'Invalid MCP-Protocol-Version' } }, headers);
  }

  if (body.method?.startsWith('notifications/') && Object.prototype.hasOwnProperty.call(body, 'id')) {
    return sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Notifications MUST NOT include an id' } }, headers);
  }

  const result = await handleMcpRequest(body);
  if (result === null) return sendJson(res, 202, null, headers);
  return sendJson(res, 200, result, headers);
};
