'use strict';

const { handleMcpRequest, PROTOCOL_VERSION } = require('../openai-publication/rumbo-guardian/mcp-contract.js');

const MAX_BODY_BYTES = 1024 * 1024;
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const REQUIRED_ACCEPT_TYPES = ['application/json', 'text/event-stream'];
const OPENAI_CHALLENGE_PATH = '/.well-known/openai-apps-challenge';

function sendJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', JSON_CONTENT_TYPE);
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  res.end(payload === null ? '' : JSON.stringify(payload));
}

function sendText(res, status, value = '') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(value);
}

function requestPath(req) {
  try {
    return new URL(String(req.url || '/'), 'https://guardian.invalid').pathname;
  } catch {
    return '/';
  }
}

function maybeServeOpenAIChallenge(req, res) {
  if (req.method !== 'GET' || requestPath(req) !== OPENAI_CHALLENGE_PATH) return false;
  const token = process.env.OPENAI_APPS_CHALLENGE;
  if (typeof token !== 'string' || !token.trim()) sendText(res, 404, '');
  else sendText(res, 200, token);
  return true;
}

function validatedOrigin(req) {
  const raw = req.headers?.origin;
  if (raw === undefined) return { valid: true, origin: null };
  if (typeof raw !== 'string' || !raw.trim()) return { valid: false, origin: null };
  try {
    const parsed = new URL(raw);
    const host = String(req.headers?.host || '').trim().toLowerCase();
    const valid = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.host.toLowerCase() === host && parsed.pathname === '/' && !parsed.search && !parsed.hash;
    return { valid, origin: valid ? parsed.origin : null };
  } catch {
    return { valid: false, origin: null };
  }
}

function allowHeaders(origin = null) {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
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
  if (maybeServeOpenAIChallenge(req, res)) return;

  const originCheck = validatedOrigin(req);
  if (!originCheck.valid) {
    return sendJson(res, 403, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Origin' } }, allowHeaders());
  }
  const headers = allowHeaders(originCheck.origin);
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
