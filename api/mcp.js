'use strict';

const { getMcpNodeHandler } = require('../lib/mcp');
const { authenticateMcpRequest, getMcpAuthChallenge, isM2Configured } = require('../lib/mcp-auth');
const { readJson } = require('../lib/http');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (isM2Configured() && !await authenticateMcpRequest(req)) {
      const challenge = getMcpAuthChallenge();
      if (challenge) res.setHeader('WWW-Authenticate', challenge);
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Authorization required.' }));
    }
    let parsedBody;
    if (req.method === 'POST') {
      try {
        parsedBody = await readJson(req, 64 * 1024);
      } catch (error) {
        const status = [408, 413].includes(error.statusCode) ? error.statusCode : 400;
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          jsonrpc: '2.0', id: null,
          error: { code: -32700, message: status === 413 ? 'Request body too large.'
            : status === 408 ? 'Request body deadline exceeded.' : 'Invalid JSON request.' },
        }));
      }
    }
    const mcpHandler = await getMcpNodeHandler();
    return await mcpHandler(req, res, parsedBody);
  } catch {
    console.error(JSON.stringify({
      event: 'mcp_handler_error',
      message: 'MCP handler failed.',
    }));

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal MCP server error.',
        },
      }));
    }

    if (!res.writableEnded) {
      res.end();
    }
    return undefined;
  }
};
