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
    { name: 'm1-test-client', version: '1.0.0' },
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

test('legacy initialization works and advertises exactly the two M1 tools', async () => {
  const client = await connectClient();
  try {
    assert.equal(client.getProtocolEra(), 'legacy');
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ['get_m1_status', 'run_m1_canary_action'],
    );
  } finally {
    await client.close();
  }
});

test('modern discovery works and schemas plus safety annotations are exact', async () => {
  const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
  try {
    assert.equal(client.getProtocolEra(), 'modern');
    const { tools } = await client.listTools();
    assert.equal(tools.length, 2);

    const status = byName(tools, 'get_m1_status');
    assert.deepEqual(status.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    assert.equal(status.inputSchema.type, 'object');
    assert.deepEqual(status.inputSchema.required || [], []);
    assert.equal(status.inputSchema.additionalProperties, false);

    const action = byName(tools, 'run_m1_canary_action');
    assert.deepEqual(action.annotations, {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
    assert.equal(action.inputSchema.type, 'object');
    assert.deepEqual(action.inputSchema.required, ['label']);
    assert.equal(action.inputSchema.properties.label.type, 'string');
    assert.equal(action.inputSchema.properties.label.minLength, 1);
    assert.equal(action.inputSchema.properties.label.maxLength, 80);
    assert.equal(action.inputSchema.additionalProperties, false);
  } finally {
    await client.close();
  }
});

test('read tool returns fixed structured M1 status and no deployment data', async () => {
  const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
  try {
    const result = await client.callTool({
      name: 'get_m1_status',
      arguments: {},
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, {
      service: 'chatgpt-harness-plugin',
      milestone: 'M1',
      status: 'ready',
      version: 'm1-canary-v1',
    });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('VERCEL'), false);
    assert.equal(serialized.includes('HERMES'), false);
    assert.equal(serialized.includes('process.env'), false);
  } finally {
    await client.close();
  }
});

test('action returns unique receipts and logs only receipt-safe diagnostics', async () => {
  const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.map(String).join(' '));

  try {
    const first = await client.callTool({
      name: 'run_m1_canary_action',
      arguments: { label: 'david-manual-test' },
    });
    const second = await client.callTool({
      name: 'run_m1_canary_action',
      arguments: { label: 'david-manual-test' },
    });

    assert.equal(first.isError, undefined);
    assert.equal(second.isError, undefined);
    assert.equal(first.structuredContent.success, true);
    assert.equal(first.structuredContent.label, 'david-manual-test');
    assert.match(first.structuredContent.receipt_id, /^m1_[0-9a-f-]{36}$/);
    assert.match(second.structuredContent.receipt_id, /^m1_[0-9a-f-]{36}$/);
    assert.notEqual(first.structuredContent.receipt_id, second.structuredContent.receipt_id);

    const joinedLogs = logs.join('\n');
    assert.match(joinedLogs, new RegExp(first.structuredContent.receipt_id));
    assert.match(joinedLogs, new RegExp(second.structuredContent.receipt_id));
    assert.equal(joinedLogs.includes('david-manual-test'), false);
  } finally {
    console.log = originalLog;
    await client.close();
  }
});

test('invalid action input is rejected before the action handler runs', async () => {
  const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.map(String).join(' '));

  try {
    const result = await client.callTool({
      name: 'run_m1_canary_action',
      arguments: { label: '' },
    });
    assert.equal(result.isError, true);
    assert.equal(logs.some((line) => line.includes('m1_canary_action')), false);
    assert.equal(JSON.stringify(result).includes('receipt_id'), false);
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
    jsonrpc: '2.0',
    id: 99,
    method: 'not/a-real-mcp-method',
    params: {},
  }));
  assert.ok(unknown.status >= 200 && unknown.status < 500);
  assert.equal(/stack|node_modules|process\.env/i.test(unknown.body), false);
  assert.equal(unknown.body.includes('"result"'), false);
});

test('tool results and protocol errors do not leak environment secrets', async () => {
  const oldSentinel = process.env.M1_SENTINEL_SECRET;
  process.env.M1_SENTINEL_SECRET = 'm1-secret-must-not-leak-9f2d7';

  const client = await connectClient({ versionNegotiation: { mode: 'auto' } });
  try {
    const status = await client.callTool({
      name: 'get_m1_status',
      arguments: {},
    });
    const action = await client.callTool({
      name: 'run_m1_canary_action',
      arguments: { label: 'secret-leak-check' },
    });
    const malformed = await rawRequest('POST', '{');

    const combined = [
      JSON.stringify(status),
      JSON.stringify(action),
      malformed.body,
    ].join('\n');

    assert.equal(combined.includes(process.env.M1_SENTINEL_SECRET), false);
    assert.equal(/HERMES_API_KEY|VERCEL_TOKEN|M1_SENTINEL_SECRET|process\.env/i.test(combined), false);
    assert.equal(/\/var\/task|node_modules|at .*\(.+\.js:\d+:\d+\)/i.test(combined), false);
  } finally {
    await client.close();
    if (oldSentinel === undefined) delete process.env.M1_SENTINEL_SECRET;
    else process.env.M1_SENTINEL_SECRET = oldSentinel;
  }
});

test('Vercel keeps security headers and rewrites /mcp to /api/mcp', () => {
  const config = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../vercel.json'),
    'utf8',
  ));

  assert.deepEqual(config.rewrites, [
    { source: '/mcp', destination: '/api/mcp' },
  ]);

  const allHeaders = config.headers.flatMap((entry) => entry.headers || []);
  assert.ok(allHeaders.some((header) => header.key === 'X-Content-Type-Options' && header.value === 'nosniff'));
  assert.ok(allHeaders.some((header) => header.key === 'Referrer-Policy' && header.value === 'no-referrer'));
  assert.ok(allHeaders.some((header) => header.key === 'Permissions-Policy'));
});
