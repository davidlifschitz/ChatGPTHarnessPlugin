'use strict';

const { randomUUID } = require('node:crypto');

const SERVICE = 'chatgpt-harness-plugin';
const MILESTONE = 'M1';
const STATUS = 'ready';
const VERSION = 'm1-canary-v1';

function toolResult(structuredContent) {
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function logCanaryReceipt(receiptId, label) {
  console.log(JSON.stringify({
    event: 'm1_canary_action',
    receipt_id: receiptId,
    label_length: label.length,
  }));
}

let nodeHandlerPromise;

async function buildNodeHandler() {
  const [{ McpServer, createMcpHandler }, { toNodeHandler }, z] = await Promise.all([
    import('@modelcontextprotocol/server'),
    import('@modelcontextprotocol/node'),
    import('zod/v4'),
  ]);

  const handler = createMcpHandler(() => {
    const server = new McpServer({
      name: SERVICE,
      version: VERSION,
    });

    server.registerTool(
      'get_m1_status',
      {
        title: 'Get M1 status',
        description: 'Return the fixed M1 canary service status. This tool is read-only, uses no user data, and does not call external services.',
        inputSchema: z.object({}).strict(),
        outputSchema: z.object({
          service: z.literal(SERVICE),
          milestone: z.literal(MILESTONE),
          status: z.literal(STATUS),
          version: z.literal(VERSION),
        }).strict(),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => toolResult({
        service: SERVICE,
        milestone: MILESTONE,
        status: STATUS,
        version: VERSION,
      }),
    );

    server.registerTool(
      'run_m1_canary_action',
      {
        title: 'Run M1 canary action',
        description: 'Create one diagnostic receipt for a short non-sensitive label. The only side effect is a sanitized server log entry containing the receipt; this tool does not touch Hermes, files, accounts, email, user data, or external services.',
        inputSchema: z.object({
          label: z.string().trim().min(1).max(80).describe('Short non-sensitive label for this canary invocation.'),
        }).strict(),
        outputSchema: z.object({
          success: z.literal(true),
          receipt_id: z.string().min(1),
          label: z.string().min(1).max(80),
        }).strict(),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ label }) => {
        const receiptId = `m1_${randomUUID()}`;
        logCanaryReceipt(receiptId, label);
        return toolResult({
          success: true,
          receipt_id: receiptId,
          label,
        });
      },
    );

    return server;
  }, {
    responseMode: 'json',
  });

  return toNodeHandler(handler, {
    onerror() {
      console.error(JSON.stringify({
        event: 'mcp_transport_error',
        message: 'MCP transport error.',
      }));
    },
  });
}

function getMcpNodeHandler() {
  if (!nodeHandlerPromise) {
    nodeHandlerPromise = buildNodeHandler();
  }
  return nodeHandlerPromise;
}

module.exports = {
  SERVICE,
  MILESTONE,
  STATUS,
  VERSION,
  getMcpNodeHandler,
};
