'use strict';

const { getMcpNodeHandler } = require('../lib/mcp');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const mcpHandler = await getMcpNodeHandler();
    return await mcpHandler(req, res);
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
