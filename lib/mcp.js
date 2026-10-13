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
const LOGGED_CANARY_LABEL = 'm2-regression';

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
  const labelFields = label === LOGGED_CANARY_LABEL
    ? {label}
    : {label_length: label.length};
  console.log(JSON.stringify({
    event: 'm1_canary_action',
    receipt_id: receiptId,
    ...labelFields,
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
  const securitySchemes = process.env.M2_PUBLIC_ORIGIN || process.env.HERMES_CLOUD_ORIGIN
    ? [{ type: 'oauth2', scopes: ['mcp:tools'] }]
    : [{ type: 'noauth' }];

  const handler = createMcpHandler(() => {
    const server = new McpServer({
      name: SERVICE,
      version: MCP_VERSION,
    });

    server.registerTool(
      'get_m1_status',
      {
        title: 'Get M1 status',
        _meta: { securitySchemes },
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
        _meta: { securitySchemes },
        description: 'Create one diagnostic receipt for a short non-sensitive label. The sanitized server log includes the receipt and the fixed m2-regression label used by the M2 acceptance check; other supplied labels are not logged. This tool does not touch Hermes, files, accounts, email, user data, or external services.',
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
        _meta: { securitySchemes },
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
        _meta: { securitySchemes },
        description: 'Submit a task to an existing Hermes session using a stable request_id. Reuse the same request_id when retrying the same logical task; use a new request_id for a new task. A successful result means Hermes completed the task, not merely accepted it. Hermes may use tools configured in its runtime; no raw Hermes credential or HTTP endpoint is exposed.',
        inputSchema: z.object({
          session_id: sessionIdSchema,
          task: z.string().trim().min(1).max(12000)
            .describe('The task or follow-up message for Hermes.'),
          request_id: z.string().min(1).max(120)
            .regex(/^[A-Za-z0-9_-]{1,120}$/)
            .describe('Stable idempotency key for one logical task. Reuse it on retries of that task; choose a new key for a different task.'),
        }).strict(),
        outputSchema: z.object({
          success: z.boolean(),
          request_id: z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]{1,120}$/),
          session_id: sessionIdSchema,
          status: z.enum(['submitted', 'running', 'completed', 'failed', 'interrupted', 'timed_out']),
          outcome_unknown: z.boolean(),
          message: z.string().max(12000).nullable(),
          truncated: z.boolean(),
          model: z.string().max(120).nullable(),
          provider: z.string().max(80).nullable(),
          tool_call_count: z.number().int().nonnegative(),
          tool_names: z.array(z.string().min(1).max(120)).max(20),
        }).strict(),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async ({ session_id: sessionId, task, request_id: requestId }) => runHermesTool(async () => {
        const result = await sendHermesSessionMessage(sessionId, task, { requestId });
        console.log(JSON.stringify({
          event: 'm2_hermes_turn',
          request_id: requestId,
          session_id_length: result.session_id.length,
        }));
        return toolResult({
          success: result.status === 'completed',
          request_id: result.request_id,
          session_id: result.session_id,
          status: result.status,
          outcome_unknown: result.outcome_unknown,
          message: result.message,
          truncated: result.truncated,
          model: result.model,
          provider: result.provider,
          tool_call_count: result.tool_call_count,
          tool_names: result.tool_names,
        });
      }),
    );

    server.registerTool(
      'get_hermes_session',
      {
        title: 'Inspect Hermes session',
        _meta: { securitySchemes },
        description: 'Read safe metadata for an existing Hermes session, including observed tool names and the latest assistant text. Optionally provide the request_id of one logical task to inspect its durable execution status. Tool arguments, tool outputs, credentials, task text, and server configuration are not returned.',
        inputSchema: z.object({
          session_id: sessionIdSchema,
          request_id: z.string().min(1).max(120)
            .regex(/^[A-Za-z0-9_-]{1,120}$/)
            .optional()
            .describe('Optional stable request_id for the task whose execution status should be inspected.'),
        }).strict(),
        outputSchema: z.object({
          session_id: sessionIdSchema,
          title: z.string().max(120).nullable(),
          model: z.string().max(120).nullable(),
          message_count: z.number().int().nonnegative(),
          tool_call_count: z.number().int().nonnegative(),
          tool_names: z.array(z.string().min(1).max(120)).max(20),
          last_assistant_message: z.string().max(4000).nullable(),
          execution: z.object({
            request_id: z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]{1,120}$/),
            status: z.enum(['submitted', 'running', 'completed', 'failed', 'interrupted', 'timed_out']),
            outcome_unknown: z.boolean(),
            message: z.string().max(12000).nullable(),
            truncated: z.boolean(),
            tool_call_count: z.number().int().nonnegative(),
            tool_names: z.array(z.string().min(1).max(120)).max(20),
          }).strict().nullable(),
        }).strict(),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ session_id: sessionId, request_id: requestId }) => runHermesTool(async () => (
        toolResult(await getHermesSession(sessionId, {requestId}))
      )),
    );

    return server;
  }, {
    responseMode: 'json',
    maxRequestBodySize: 64 * 1024,
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
