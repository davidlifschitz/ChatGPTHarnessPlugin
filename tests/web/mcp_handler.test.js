const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');

const mcpApiHandler = require('../../api/mcp');

let server;
let mcpUrl;

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.url !== '/mcp') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    await mcpApiHandler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  mcpUrl = `http://127.0.0.1:${port}/mcp`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function connectClient(options) {
  const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client');
  const client = new Client(
    { name: 'm2-test-client', version: '1.0.0' },
    options,
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
  return client;
}

function byName(tools, name) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `expected tool ${name}`);
  return tool;
}

async function rawRequest(method, body, extraHeaders = {}) {
  const response = await fetch(mcpUrl, {
    method,
    headers: {
      accept: 'application/json, text/event-stream',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body }),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    body: await response.text(),
  };
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function withHermesServer(handler, fn) {
  const hermesServer = http.createServer(handler);
  await new Promise((resolve) => hermesServer.listen(0, '127.0.0.1', resolve));
  const {port} = hermesServer.address();
  const oldBase = process.env.HERMES_BASE_URL;
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.HERMES_API_KEY = 'mcp-test-secret';
  try {
    await fn();
  } finally {
    if (oldBase === undefined) delete process.env.HERMES_BASE_URL; else process.env.HERMES_BASE_URL = oldBase;
    if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey;
    await new Promise((resolve, reject) => hermesServer.close((error) => error ? reject(error) : resolve()));
  }
}

function json(res, status, body) {
  res.writeHead(status, {'content-type': 'application/json'});
  res.end(JSON.stringify(body));
}

const EXPECTED_TOOLS = [
  'get_m1_status',
  'run_m1_canary_action',
  'start_hermes_session',
  'send_hermes_task',
  'get_hermes_session',
];

test('legacy initialization advertises M1 regression tools plus the three M2 Hermes tools', async () => {
  const client = await connectClient();
  try {
    assert.equal(client.getProtocolEra(), 'legacy');
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), EXPECTED_TOOLS);
  } finally {
    await client.close();
  }
});

test('modern discovery exposes exact M2 schemas and safety annotations', async () => {
  const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
  try {
    assert.equal(client.getProtocolEra(), 'modern');
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), EXPECTED_TOOLS);

    const status = byName(tools, 'get_m1_status');
    assert.deepEqual(status.annotations, {
      readOnlyHint: true, destructiveHint: false,
      idempotentHint: true, openWorldHint: false,
    });
    assert.equal(status.inputSchema.type, 'object');
    assert.deepEqual(status.inputSchema.required || [], []);
    assert.deepEqual(status.inputSchema.properties, {});
    assert.equal(status.inputSchema.additionalProperties, false);

    const action = byName(tools, 'run_m1_canary_action');
    assert.deepEqual(action.annotations, {
      readOnlyHint: false, destructiveHint: false,
      idempotentHint: false, openWorldHint: false,
    });
    assert.equal(action.inputSchema.type, 'object');
    assert.deepEqual(action.inputSchema.required, ['label']);
    assert.equal(action.inputSchema.properties.label.type, 'string');
    assert.equal(action.inputSchema.properties.label.minLength, 1);
    assert.equal(action.inputSchema.properties.label.maxLength, 80);
    assert.equal(action.inputSchema.additionalProperties, false);

    const start = byName(tools, 'start_hermes_session');
    assert.deepEqual(start.annotations, {
      readOnlyHint: false, destructiveHint: false,
      idempotentHint: false, openWorldHint: false,
    });
    assert.equal(start.inputSchema.additionalProperties, false);
    assert.deepEqual(start.inputSchema.required || [], []);
    assert.equal(start.inputSchema.properties.title.maxLength, 120);

    const send = byName(tools, 'send_hermes_task');
    assert.deepEqual(send.annotations, {
      readOnlyHint: false, destructiveHint: true,
      idempotentHint: false, openWorldHint: true,
    });
    assert.deepEqual(send.inputSchema.required, ['session_id', 'task']);
    assert.equal(send.inputSchema.properties.session_id.maxLength, 200);
    assert.equal(send.inputSchema.properties.task.maxLength, 12000);
    assert.equal(send.inputSchema.additionalProperties, false);

    const inspect = byName(tools, 'get_hermes_session');
    assert.deepEqual(inspect.annotations, {
      readOnlyHint: true, destructiveHint: false,
      idempotentHint: true, openWorldHint: false,
    });
    assert.deepEqual(inspect.inputSchema.required, ['session_id']);
    assert.equal(inspect.inputSchema.additionalProperties, false);
  } finally {
    await client.close();
  }
});

test('M1 status remains byte-for-byte compatible at the structured result level', async () => {
  const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
  try {
    const result = await client.callTool({name: 'get_m1_status', arguments: {}});
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, {
      service: 'chatgpt-harness-plugin',
      milestone: 'M1',
      status: 'ready',
      version: 'm1-canary-v1',
    });
  } finally {
    await client.close();
  }
});

test('M1 canary action still returns unique receipts and does not log the label', async () => {
  const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.map(String).join(' '));
  try {
    const first = await client.callTool({
      name: 'run_m1_canary_action', arguments: {label: 'david-manual-test'},
    });
    const second = await client.callTool({
      name: 'run_m1_canary_action', arguments: {label: 'david-manual-test'},
    });
    assert.equal(first.isError, undefined);
    assert.equal(second.isError, undefined);
    assert.equal(first.structuredContent.success, true);
    assert.equal(first.structuredContent.label, 'david-manual-test');
    assert.equal(second.structuredContent.success, true);
    assert.equal(second.structuredContent.label, 'david-manual-test');
    assert.match(first.structuredContent.receipt_id, /^m1_[0-9a-f-]{36}$/);
    assert.match(second.structuredContent.receipt_id, /^m1_[0-9a-f-]{36}$/);
    assert.notEqual(first.structuredContent.receipt_id, second.structuredContent.receipt_id);
    const joined = logs.join('\n');
    assert.equal(joined.includes('david-manual-test'), false);
    assert.match(joined, /m1_canary_action/);
  } finally {
    console.log = originalLog;
    await client.close();
  }
});

test('M2 tools create, run, and inspect the same Hermes session without leaking raw tool data', async () => {
  const requests = [];
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.map(String).join(' '));
  try {
    await withHermesServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (req.url === '/api/sessions' && req.method === 'POST') {
      readJson(req).then(() => json(res, 201, {
        object: 'hermes.session',
        session: {id: 'api_m2_123', title: 'M2 proof'},
      }));
      return;
    }
    if (req.url === '/api/sessions/api_m2_123/chat' && req.method === 'POST') {
      readJson(req).then((body) => {
        assert.deepEqual(body, {input: 'What is 17 × 23?'});
        json(res, 200, {
          object: 'hermes.session.chat.completion',
          session_id: 'api_m2_123',
          message: {role: 'assistant', content: '391'},
          runtime: {model: 'test-model', provider: 'test-provider'},
        });
      });
      return;
    }
    if (req.url === '/api/sessions/api_m2_123') {
      return json(res, 200, {
        object: 'hermes.session',
        session: {id: 'api_m2_123', title: 'M2 proof', model: 'test-model', message_count: 4, tool_call_count: 1},
      });
    }
    if (req.url === '/api/sessions/api_m2_123/messages?limit=200&offset=0&order=latest') {
      return json(res, 200, {
        object: 'list',
        data: [
          {role: 'assistant', content: '', tool_calls: [{function: {name: 'web_search', arguments: '{"secret":"do-not-return"}'}}]},
          {role: 'tool', tool_name: 'web_search', content: 'raw tool output'},
          {role: 'assistant', content: '391'},
        ],
      });
    }
    return json(res, 404, {});
  }, async () => {
    const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
    try {
      const start = await client.callTool({
        name: 'start_hermes_session', arguments: {title: 'M2 proof'},
      });
      assert.equal(start.isError, undefined);
      assert.equal(start.structuredContent.session_id, 'api_m2_123');

      const send = await client.callTool({
        name: 'send_hermes_task',
        arguments: {session_id: start.structuredContent.session_id, task: 'What is 17 × 23?'},
      });
      assert.equal(send.isError, undefined);
      assert.equal(send.structuredContent.message, '391');
      assert.equal(send.structuredContent.session_id, 'api_m2_123');
      assert.match(send.structuredContent.request_id, /^m2_[0-9a-f-]{36}$/);

      const inspect = await client.callTool({
        name: 'get_hermes_session',
        arguments: {session_id: start.structuredContent.session_id},
      });
      assert.equal(inspect.isError, undefined);
      assert.deepEqual(inspect.structuredContent.tool_names, ['web_search']);
      assert.equal(inspect.structuredContent.last_assistant_message, '391');
      const serialized = JSON.stringify(inspect);
      assert.equal(serialized.includes('do-not-return'), false);
      assert.equal(serialized.includes('raw tool output'), false);
    } finally {
      await client.close();
    }
  });
    assert.deepEqual(requests, [
      'POST /api/sessions',
      'POST /api/sessions/api_m2_123/chat',
      'GET /api/sessions/api_m2_123',
      'GET /api/sessions/api_m2_123/messages?limit=200&offset=0&order=latest',
    ]);
    const joinedLogs = logs.join('\n');
    assert.match(joinedLogs, /m2_hermes_session_started/);
    assert.match(joinedLogs, /m2_hermes_turn/);
    assert.equal(joinedLogs.includes('api_m2_123'), false);
  } finally {
    console.log = originalLog;
  }
});

test('controlled invalid Hermes session fails model-readably with no stack or secret leakage', async () => {
  await withHermesServer((req, res) => {
    if (req.url === '/api/sessions/missing_session/chat') {
      return json(res, 404, {error: 'session missing; credential mcp-test-secret'});
    }
    return json(res, 404, {});
  }, async () => {
    const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
    try {
      const result = await client.callTool({
        name: 'send_hermes_task',
        arguments: {session_id: 'missing_session', task: 'hello'},
      });
      assert.equal(result.isError, true);
      const serialized = JSON.stringify(result);
      assert.match(serialized, /not found/i);
      assert.equal(serialized.includes('mcp-test-secret'), false);
      assert.equal(/stack|node_modules|process\.env|HERMES_API_KEY/i.test(serialized), false);
    } finally {
      await client.close();
    }
  });
});

test('invalid M1 and M2 input is rejected by schema before handlers run', async () => {
  const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.map(String).join(' '));
  try {
    const m1 = await client.callTool({
      name: 'run_m1_canary_action', arguments: {label: ''},
    });
    const m2 = await client.callTool({
      name: 'send_hermes_task', arguments: {session_id: '../bad', task: ''},
    });
    assert.equal(m1.isError, true);
    assert.equal(m2.isError, true);
    assert.equal(logs.some((line) => line.includes('m1_canary_action')), false);
    assert.equal(logs.some((line) => line.includes('m2_hermes_turn')), false);
  } finally {
    console.log = originalLog;
    await client.close();
  }
});

test('unsupported HTTP method and malformed protocol input fail cleanly', async () => {
  const method = await rawRequest('PUT');
  assert.ok(method.status >= 400 && method.status < 500);
  assert.equal(/stack|node_modules|process\.env/i.test(method.body), false);

  const malformed = await rawRequest('POST', '{');
  assert.ok(malformed.status >= 400 && malformed.status < 500);
  assert.equal(/stack|node_modules|process\.env/i.test(malformed.body), false);

  const unknown = await rawRequest('POST', JSON.stringify({
    jsonrpc: '2.0', id: 99, method: 'not/a-real-mcp-method', params: {},
  }));
  assert.ok(unknown.status >= 200 && unknown.status < 500);
  assert.equal(/stack|node_modules|process\.env/i.test(unknown.body), false);
  assert.equal(unknown.body.includes('"result"'), false);
});

test('tool and protocol results never expose environment sentinels or deployment configuration', async () => {
  const oldSentinel = process.env.M2_SENTINEL_SECRET;
  process.env.M2_SENTINEL_SECRET = 'm2-secret-must-not-leak-0ca7';
  const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
  try {
    const status = await client.callTool({name: 'get_m1_status', arguments: {}});
    const malformed = await rawRequest('POST', '{');
    const combined = [JSON.stringify(status), malformed.body].join('\n');
    assert.equal(combined.includes(process.env.M2_SENTINEL_SECRET), false);
    assert.equal(/HERMES_API_KEY|HERMES_BASE_URL|VERCEL_TOKEN|M2_SENTINEL_SECRET|process\.env/i.test(combined), false);
    assert.equal(/\/var\/task|node_modules|at .*\(.+\.js:\d+:\d+\)/i.test(combined), false);
  } finally {
    await client.close();
    if (oldSentinel === undefined) delete process.env.M2_SENTINEL_SECRET;
    else process.env.M2_SENTINEL_SECRET = oldSentinel;
  }
});

test('Vercel keeps security headers and rewrites /mcp to /api/mcp', () => {
  const config = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../vercel.json'),
    'utf8',
  ));
  assert.deepEqual(config.rewrites, [{source: '/mcp', destination: '/api/mcp'}]);
  const allHeaders = config.headers.flatMap((entry) => entry.headers || []);
  assert.ok(allHeaders.some((header) => header.key === 'X-Content-Type-Options' && header.value === 'nosniff'));
  assert.ok(allHeaders.some((header) => header.key === 'Referrer-Policy' && header.value === 'no-referrer'));
  assert.ok(allHeaders.some((header) => header.key === 'Permissions-Policy'));
});
