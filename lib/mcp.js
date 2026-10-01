'use strict';

const { randomUUID } = require('node:crypto');
const {
  HermesError,
  createHermesSession,
  sendHermesSessionMessage,
  getHermesSession,
} = require('./hermes');

const SERVICE = 'chatgpt-harness-plugin';
const MILESTONE = 'M1';
const STATUS = 'ready';
const VERSION = 'm1-canary-v1';
const MCP_VERSION = 'm2-hermes-v1';

function toolResult(structuredContent) {
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function toolError(error) {
  const message = error instanceof HermesError ? error.message : 'Hermes operation failed.';
  const code = error instanceof HermesError ? error.code : 'hermes_operation_failed';
  console.error(JSON.stringify({
    event: 'm2_hermes_error',
    code,
    status_code: error instanceof HermesError ? error.statusCode : 500,
  }));
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

async function runHermesTool(operation) {
  try {
    return await operation();
  } catch (error) {
    return toolError(error);
  }
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

  const sessionIdSchema = z.string().trim().min(1).max(200)
    .regex(/^[A-Za-z0-9._:@-]+$/)
    .describe('Opaque Hermes session identifier returned by start_hermes_session.');

  const handler = createMcpHandler(() => {
    const server = new McpServer({
      name: SERVICE,
      version: MCP_VERSION,
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

    server.registerTool(
      'start_hermes_session',
      {
        title: 'Start Hermes session',
        description: 'Create one real persistent Hermes session on the configured server-side runtime. Hermes credentials remain server-only.',
        inputSchema: z.object({
          title: z.string().trim().min(1).max(120).optional()
            .describe('Optional short label for the Hermes session.'),
        }).strict(),
        outputSchema: z.object({
          session_id: sessionIdSchema,
          title: z.string().max(120).nullable(),
        }).strict(),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ title }) => runHermesTool(async () => {
        const session = await createHermesSession({ title });
        console.log(JSON.stringify({
          event: 'm2_hermes_session_started',
          session_id_length: session.session_id.length,
        }));
        return toolResult(session);
      }),
    );

    server.registerTool(
      'send_hermes_task',
      {
        title: 'Send task to Hermes',
        description: 'Delegate a task to an existing real Hermes session and return Hermes\'s assistant response. Hermes may use tools configured in its runtime; no raw Hermes credential or HTTP endpoint is exposed.',
        inputSchema: z.object({
          session_id: sessionIdSchema,
          task: z.string().trim().min(1).max(12000)
            .describe('The task or follow-up message for Hermes.'),
        }).strict(),
        outputSchema: z.object({
          success: z.literal(true),
          request_id: z.string().min(1),
          session_id: sessionIdSchema,
          message: z.string().max(12000),
          truncated: z.boolean(),
          model: z.string().nullable(),
          provider: z.string().nullable(),
        }).strict(),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async ({ session_id: sessionId, task }) => runHermesTool(async () => {
        const requestId = `m2_${randomUUID()}`;
        const result = await sendHermesSessionMessage(sessionId, task);
        console.log(JSON.stringify({
          event: 'm2_hermes_turn',
          request_id: requestId,
          session_id_length: result.session_id.length,
        }));
        return toolResult({
          success: true,
          request_id: requestId,
          ...result,
        });
      }),
    );

    server.registerTool(
      'get_hermes_session',
      {
        title: 'Inspect Hermes session',
        description: 'Read safe metadata for an existing Hermes session, including observed tool names and the latest assistant text. Tool arguments, tool outputs, credentials, and server configuration are not returned.',
        inputSchema: z.object({
          session_id: sessionIdSchema,
        }).strict(),
        outputSchema: z.object({
          session_id: sessionIdSchema,
          title: z.string().max(120).nullable(),
          model: z.string().nullable(),
          message_count: z.number().int().nonnegative(),
          tool_call_count: z.number().int().nonnegative(),
          tool_names: z.array(z.string().min(1).max(120)).max(20),
          last_assistant_message: z.string().max(4000).nullable(),
        }).strict(),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ session_id: sessionId }) => runHermesTool(async () => (
        toolResult(await getHermesSession(sessionId))
      )),
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
  MCP_VERSION,
  getMcpNodeHandler,
};
