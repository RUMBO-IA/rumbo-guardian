'use strict';

const http = require('node:http');
const mcpHandler = require('./api/mcp.js');

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function createGuardianServer() {
  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname === '/healthz' && req.method === 'GET') {
      return sendJson(res, 200, { service: 'rumbo-guardian-mcp', status: 'ok' });
    }
    if (pathname === '/mcp') {
      return mcpHandler(req, res);
    }
    return sendJson(res, 404, { error: 'NOT_FOUND' });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 10000);
  const server = createGuardianServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`RUMBO Guardian MCP listening on ${port}`);
  });
}

module.exports = { createGuardianServer };
