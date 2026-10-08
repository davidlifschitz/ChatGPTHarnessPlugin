const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { WebSocketServer } = require('ws');

const mcpApiHandler = require('../../api/mcp');
const oauthApiHandler = require('../../api/oauth');
const operatorApiHandler = require('../../api/operator');
const { MemoryStateStore, setStateStoreForTests } = require('../../lib/state-store');
const { persistCredentials } = require('../../lib/hermes-cloud-auth');
const { setMcpAuthDependenciesForTests } = require('../../lib/mcp-auth');

let server;
let mcpUrl;
const ORIGINAL_ENV = Object.fromEntries([
  'M2_PUBLIC_ORIGIN', 'M2_OPERATOR_TOKEN', 'HERMES_CLOUD_ORIGIN',
  'HERMES_BASE_URL', 'HERMES_API_KEY',
].map((key) => [key, process.env[key]]));

before(async () => {
  for (const key of ['M2_PUBLIC_ORIGIN', 'M2_OPERATOR_TOKEN', 'HERMES_CLOUD_ORIGIN', 'HERMES_BASE_URL', 'HERMES_API_KEY']) {
    delete process.env[key];
  }
  setMcpAuthDependenciesForTests(null);
  setStateStoreForTests(null);
  server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname === '/mcp') return mcpApiHandler(req, res);
    if (pathname.startsWith('/api/oauth')) return oauthApiHandler(req, res);
    if (pathname.startsWith('/api/operator')) return operatorApiHandler(req, res);
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  mcpUrl = `http://127.0.0.1:${port}/mcp`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  setMcpAuthDependenciesForTests(null);
  setStateStoreForTests(null);
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function connectClient(options, accessToken = null) {
  const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client');
  const client = new Client(
    { name: 'm2-test-client', version: '1.0.0' },
    options,
  );
  const transportOptions = accessToken
    ? { requestInit: { headers: { authorization: 'Bearer ' + accessToken } } }
    : undefined;
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl), transportOptions));
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
    wwwAuthenticate: response.headers.get('www-authenticate') || '',
    body: await response.text(),
  };
}

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {'content-type': 'application/json', 'content-length': data.length});
  res.end(data);
}

async function apiRequest(apiOrigin, route, method, body, headers = {}, redirect = 'follow') {
  const response = await fetch(apiOrigin + route, {
    method,
    headers: {
      ...(body === undefined ? {} : {'content-type': 'application/json'}),
      ...headers,
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    redirect,
  });
  const text = await response.text();
  let payload = {};
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    try { payload = JSON.parse(text); } catch { payload = {}; }
  }
  return {response, text, payload};
}

async function issueMcpAccessToken(apiOrigin) {
  const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const registration = await apiRequest(apiOrigin, '/api/oauth/register', 'POST', {
    client_name: 'M2 native integration test',
    redirect_uris: [redirectUri],
  });
  assert.equal(registration.response.status, 201);
  const clientId = registration.payload.client_id;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(24).toString('base64url');
  const resource = process.env.M2_PUBLIC_ORIGIN + '/mcp';
  const parameters = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'mcp:tools',
    resource,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  const authorization = await fetch(apiOrigin + '/api/oauth/authorize?' + parameters);
  assert.equal(authorization.status, 200);
  const consent = await authorization.text();
  const requestMatch = /const requestId=("[A-Za-z0-9_-]{22}")/.exec(consent);
  assert.ok(requestMatch);
  const requestId = JSON.parse(requestMatch[1]);
  const cookie = (authorization.headers.get('set-cookie') || '').split(';', 1)[0];
  assert.ok(cookie);

  const operatorAuthorization = {authorization: 'Bearer ' + process.env.M2_OPERATOR_TOKEN};
  const details = await apiRequest(
    apiOrigin,
    '/api/operator/requests?request_id=' + encodeURIComponent(requestId),
    'GET',
    undefined,
    operatorAuthorization,
  );
  assert.equal(details.response.status, 200);
  assert.equal(details.payload.request.status, 'pending');
  const approval = await apiRequest(
    apiOrigin,
    '/api/operator/approve',
    'POST',
    {request_id: requestId},
    operatorAuthorization,
  );
  assert.equal(approval.response.status, 200);
  assert.equal(approval.payload.status, 'approved');

  const completed = await fetch(
    apiOrigin + '/api/oauth/complete?request_id=' + encodeURIComponent(requestId),
    {headers: {cookie}, redirect: 'manual'},
  );
  assert.equal(completed.status, 302);
  const callback = new URL(completed.headers.get('location'));
  assert.equal(callback.searchParams.get('state'), state);
  assert.equal(callback.searchParams.get('iss'), process.env.M2_PUBLIC_ORIGIN);
  const code = callback.searchParams.get('code');
  assert.ok(code);

  const tokenResponse = await fetch(apiOrigin + '/api/oauth/token', {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource,
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const token = await tokenResponse.json();
  assert.equal(token.scope, 'mcp:tools');
  assert.equal(token.resource, resource);
  assert.ok(token.access_token);
  return token.access_token;
}

async function withNativeGateway(fn) {
  const envKeys = [
    'M2_PUBLIC_ORIGIN',
    'M2_OPERATOR_TOKEN',
    'HERMES_CLOUD_ORIGIN',
    'HERMES_BASE_URL',
    'HERMES_API_KEY',
    'HERMES_TURN_TIMEOUT_MS',
    'HERMES_REQUEST_TIMEOUT_MS',
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const store = new MemoryStateStore();
  const sessions = new Map();
  const tickets = new Set();
  const consumedTickets = new Set();
  const acceptedProtocols = [];
  const websocketRequests = [];
  const rpcMethods = [];
  let nextSession = 0;
  let nextRow = 1;

  setStateStoreForTests(store);
  setMcpAuthDependenciesForTests({store, env: process.env});
  process.env.M2_PUBLIC_ORIGIN = 'https://m2-preview.example.test';
  process.env.M2_OPERATOR_TOKEN = 'mcp-test-operator-token-with-32-or-more-bytes';
  delete process.env.HERMES_BASE_URL;
  delete process.env.HERMES_API_KEY;

  function completeTurn(ws, session, userRowId) {
    const toolCallId = 'call-' + userRowId;
    const assistantText = '391 read_file is a fake mention';
    const toolCall = {
      id: toolCallId,
      type: 'function',
      function: {
        name: 'read_file',
        arguments: JSON.stringify({path: '/private/sentinel', secret: 'native-tool-argument-sentinel'}),
      },
    };
    session.messages.push({
      role: 'assistant',
      row_id: nextRow++,
      text: '',
      tool_calls: [toolCall],
    });
    session.messages.push({
      role: 'tool',
      row_id: nextRow++,
      name: 'read_file',
      tool_call_id: toolCallId,
      content: 'native-tool-result-sentinel',
    });
    const finalAssistantRowId = nextRow++;
    session.messages.push({
      role: 'assistant',
      row_id: finalAssistantRowId,
      text: assistantText,
    });
    session.completedTurn = {userRowId, assistantText};
    session.messages.push({
      role: 'user',
      row_id: nextRow++,
      text: 'Unrelated later question',
    });
    session.messages.push({
      role: 'assistant',
      row_id: nextRow++,
      text: 'Later unrelated answer must not be returned for the submitted task',
    });
    session.running = false;
    session.seq += 1;
    const terminalEvent = {
      jsonrpc: '2.0',
      method: 'event',
      params: {
        type: 'message.complete', session_id: session.runtimeId, seq: session.seq,
        payload: {status: 'complete', persisted_turn: {user_row_id: userRowId, final_assistant_row_id: finalAssistantRowId}},
      },
    };
    session.events.push(terminalEvent.params);
    ws.send(JSON.stringify(terminalEvent) + '\n');
  }

  const hermesServer = http.createServer(async (req, res) => {
    if (req.url === '/api/status' && req.method === 'GET') {
      return json(res, 200, {
        version: '0.21.5',
        auth_required: true,
        auth_flows: ['native_pkce', 'cookie'],
        config: 'private',
      });
    }
    if (req.url === '/api/auth/ws-ticket' && req.method === 'POST') {
      if (req.headers.authorization !== 'Bearer native-access-sentinel') {
        return json(res, 401, {error: 'unauthorized'});
      }
      const ticket = crypto.randomBytes(24).toString('base64url');
      tickets.add(ticket);
      return json(res, 200, {ticket, ttl_seconds: 30});
    }
    return json(res, 404, {error: 'not_found'});
  });
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols(protocols) {
      return protocols.has('hermes-gateway-v1') ? 'hermes-gateway-v1' : false;
    },
  });

  function rpc(ws, frame) {
    const {id, method, params = {}} = frame;
    rpcMethods.push(method);
    const respond = (result) => ws.send(JSON.stringify({jsonrpc: '2.0', id, result}) + '\n');
    const fail = (code, message = 'error') => ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: {code, message},
    }) + '\n');

    if (method === 'session.create') {
      nextSession += 1;
      const runtimeId = 'runtime-' + nextSession;
      const storedId = 'stored-' + nextSession;
      const session = {
        runtimeId,
        storedId,
        title: '',
        running: false,
        messages: [
          {role: 'user', row_id: nextRow++, text: 'Earlier unrelated question'},
          {role: 'assistant', row_id: nextRow++, text: 'Earlier answer must not be returned'},
          {
            role: 'tool',
            row_id: nextRow++,
            name: 'orphaned_tool',
            tool_call_id: 'orphan-call-without-assistant-record',
            content: 'orphan result is not a tool call proof',
          },
        ],
        seq: 0,
        events: [],
      };
      sessions.set(storedId, session);
      respond({session_id: runtimeId, stored_session_id: storedId});
      return;
    }
    const session = [...sessions.values()].find((candidate) =>
      candidate.runtimeId === params.session_id || candidate.storedId === params.session_id);
    if (!session) return fail(4007, 'not found');
    if (method === 'session.title') {
      if (typeof params.title === 'string') session.title = params.title;
      respond({title: session.title, pending: !session.title});
      return;
    }
    if (method === 'session.resume') {
      respond({
        session_id: session.runtimeId,
        stored_session_id: session.storedId,
        running: session.running,
        info: {model: 'test-model', provider: 'test-provider', api_key: 'must-not-escape'},
      });
      return;
    }
    if (method === 'session.events.since') {
      const lastSeen = Number.isSafeInteger(params.last_seen) ? params.last_seen : 0;
      respond({
        events: session.events.filter((event) => event.seq > lastSeen),
        latest_seq: session.seq,
        truncated: false,
        count: 0,
        epoch: 'epoch-native',
        open_requests: [],
      });
      return;
    }
    if (method === 'session.history') {
      respond({messages: session.messages, count: session.messages.length});
      return;
    }
    if (method === 'prompt.submit') {
      const userRowId = nextRow++;
      session.messages.push({role: 'user', row_id: userRowId, text: params.text});
      session.submittedUserRowId = userRowId;
      session.running = true;
      respond({status: 'streaming', user_row_id: userRowId});
      setImmediate(() => completeTurn(ws, session, userRowId));
      return;
    }
    return fail(-32601, 'unknown method');
  }

  wss.on('connection', (ws, req) => {
    websocketRequests.push({url: req.url, protocols: req.headers['sec-websocket-protocol'] || ''});
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'event',
      params: {type: 'gateway.ready', payload: {replay_epoch: 'epoch-native'}},
    }) + '\n');
    ws.on('message', (data) => {
      for (const line of Buffer.from(data).toString('utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        let frame;
        try { frame = JSON.parse(line); } catch { return; }
        rpc(ws, frame);
      }
    });
  });
  hermesServer.on('upgrade', (req, socket, head) => {
    const protocols = String(req.headers['sec-websocket-protocol'] || '').split(/\s*,\s*/);
    const ticketProtocol = protocols.find((value) => value.startsWith('hermes-gateway-ticket.'));
    const ticket = ticketProtocol?.slice('hermes-gateway-ticket.'.length);
    if (req.url !== '/api/ws' || !protocols.includes('hermes-gateway-v1')
        || !ticket || !tickets.has(ticket) || consumedTickets.has(ticket)) {
      socket.destroy();
      return;
    }
    consumedTickets.add(ticket);
    acceptedProtocols.push(protocols);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  await new Promise((resolve) => hermesServer.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + hermesServer.address().port;
  process.env.HERMES_CLOUD_ORIGIN = origin;

  try {
    await persistCredentials({
      cloud_origin: origin,
      access_token: 'native-access-sentinel',
      refresh_token: 'native-refresh-sentinel',
      token_type: 'Bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      provider: 'test-provider',
      user_id: 'test-user',
    });
    const accessToken = await issueMcpAccessToken(new URL(mcpUrl).origin);
    await fn({
      accessToken,
      origin,
      sessions,
      acceptedProtocols,
      consumedTickets,
      websocketRequests,
      rpcMethods,
    });
  } finally {
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve, reject) => hermesServer.close((error) => error ? reject(error) : resolve()));
    setMcpAuthDependenciesForTests(null);
    setStateStoreForTests(null);
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
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
      idempotentHint: true, openWorldHint: true,
    });
    assert.deepEqual(send.inputSchema.required, ['session_id', 'task', 'request_id']);
    assert.equal(send.inputSchema.properties.session_id.maxLength, 200);
    assert.equal(send.inputSchema.properties.task.maxLength, 12000);
    assert.equal(send.inputSchema.properties.request_id.type, 'string');
    assert.equal(send.inputSchema.properties.request_id.minLength, 1);
    assert.equal(send.inputSchema.properties.request_id.maxLength, 120);
    assert.equal(send.inputSchema.properties.request_id.pattern, '^[A-Za-z0-9_-]{1,120}$');
    assert.equal(send.inputSchema.additionalProperties, false);
    assert.match(send.description, /reuse the same request_id.*retry/i);
    assert.match(send.description, /new request_id.*new task/i);
    assert.deepEqual(send.outputSchema.required, [
      'success', 'request_id', 'session_id', 'status', 'outcome_unknown', 'message',
      'truncated', 'model', 'provider', 'tool_call_count', 'tool_names',
    ]);
    assert.deepEqual(send.outputSchema.properties.status.enum, [
      'submitted', 'running', 'completed', 'failed', 'interrupted', 'timed_out',
    ]);
    assert.equal(send.outputSchema.properties.message.anyOf?.some((option) => option.type === 'null'), true);

    const inspect = byName(tools, 'get_hermes_session');
    assert.deepEqual(inspect.annotations, {
      readOnlyHint: true, destructiveHint: false,
      idempotentHint: true, openWorldHint: false,
    });
    assert.deepEqual(inspect.inputSchema.required, ['session_id']);
    assert.equal(inspect.inputSchema.properties.request_id.minLength, 1);
    assert.equal(inspect.inputSchema.properties.request_id.maxLength, 120);
    assert.equal(inspect.inputSchema.properties.request_id.pattern, '^[A-Za-z0-9_-]{1,120}$');
    assert.ok(inspect.outputSchema.required.includes('execution'));
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

test('M2 tools use native Hermes Cloud RPC after OAuth and hide raw tool payloads', async () => {
  const logs = [];
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.map(String).join(' '));
  console.error = (...args) => errors.push(args.map(String).join(' '));
  const taskSentinel = 'm2-task-input-' + crypto.randomUUID();
  const task = 'What is 17 × 23? ' + taskSentinel;
  try {
    await withNativeGateway(async ({
      accessToken,
      sessions,
      acceptedProtocols,
      consumedTickets,
      websocketRequests,
      rpcMethods,
    }) => {
      const unauthorized = await rawRequest('POST', JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/list', params: {},
      }));
      assert.equal(unauthorized.status, 401);
      assert.match(unauthorized.wwwAuthenticate, /^Bearer resource_metadata=/);
      assert.equal(websocketRequests.length, 0);

      const client = await connectClient({ versionNegotiation: { mode: 'auto' } }, accessToken);
      try {
      const start = await client.callTool({
        name: 'start_hermes_session', arguments: {title: 'M2 proof'},
      });
      assert.equal(start.isError, undefined);
      assert.equal(start.structuredContent.session_id, 'stored-1');
      assert.equal(sessions.get('stored-1').title, 'M2 proof');

      const send = await client.callTool({
        name: 'send_hermes_task',
        arguments: {session_id: start.structuredContent.session_id, task, request_id: 'native-replay-proof'},
      });
      assert.equal(send.isError, undefined);
      assert.equal(send.structuredContent.message, '391 read_file is a fake mention');
      assert.equal(send.structuredContent.session_id, 'stored-1');
      assert.equal(send.structuredContent.request_id, 'native-replay-proof');
      assert.equal(send.structuredContent.status, 'completed');
      assert.equal(send.structuredContent.outcome_unknown, false);
      const storedSession = sessions.get('stored-1');
      const submittedUser = storedSession.messages.find((message) =>
        message.row_id === storedSession.submittedUserRowId);
      const currentAnswer = storedSession.messages.find((message) =>
        message.role === 'assistant' && message.text === send.structuredContent.message);
      const laterAnswer = storedSession.messages.find((message) =>
        message.role === 'assistant' && message.text.startsWith('Later unrelated answer'));
      assert.equal(submittedUser.role, 'user');
      assert.equal(submittedUser.text, task);
      assert.ok(currentAnswer.row_id > submittedUser.row_id);
      assert.ok(laterAnswer.row_id > currentAnswer.row_id);
      assert.notEqual(laterAnswer.text, send.structuredContent.message);

      const inspect = await client.callTool({
        name: 'get_hermes_session',
        arguments: {session_id: start.structuredContent.session_id, request_id: 'native-replay-proof'},
      });
      assert.equal(inspect.isError, undefined);
      assert.deepEqual(inspect.structuredContent.tool_names, ['read_file']);
      assert.equal(inspect.structuredContent.tool_call_count, 1);
      assert.deepEqual(inspect.structuredContent.execution, {
        request_id: 'native-replay-proof',
        status: 'completed',
        outcome_unknown: false,
        message: '391 read_file is a fake mention',
        truncated: false,
        tool_call_count: 1,
        tool_names: ['read_file'],
      });
      assert.equal(
        inspect.structuredContent.last_assistant_message,
        'Later unrelated answer must not be returned for the submitted task',
      );
      const outputs = {start, send, inspect};
      const allOutputsAndDiagnostics = JSON.stringify({outputs, logs, errors});
      assert.ok(allOutputsAndDiagnostics.includes('391 read_file is a fake mention'));
      for (const sentinel of [
        'native-access-sentinel',
        'native-refresh-sentinel',
        'mcp-test-operator-token-with-32-or-more-bytes',
        taskSentinel,
        'native-tool-argument-sentinel',
        'native-tool-result-sentinel',
        '/private/sentinel',
        'must-not-escape',
      ]) {
        assert.equal(allOutputsAndDiagnostics.includes(sentinel), false, `leaked ${sentinel}`);
      }
      assert.deepEqual(rpcMethods.slice(0, 3), ['session.create', 'session.title', 'session.resume']);
      assert.ok(rpcMethods.includes('prompt.submit'));
      assert.ok(rpcMethods.includes('session.history'));
      assert.equal(storedSession.messages[0].role, 'user');
      assert.equal(storedSession.messages[0].row_id, 1);
      assert.equal(storedSession.messages[0].text, 'Earlier unrelated question');
      assert.equal(storedSession.messages[1].text, 'Earlier answer must not be returned');
      const matchingToolResult = storedSession.messages.find((message) =>
        message.role === 'tool' && message.tool_call_id === 'call-' + storedSession.submittedUserRowId);
      assert.ok(matchingToolResult);
      const matchingAssistantCall = storedSession.messages.find((message) =>
        message.role === 'assistant'
        && message.tool_calls?.some((call) => call.id === matchingToolResult.tool_call_id));
      assert.ok(matchingAssistantCall);
      assert.ok(matchingAssistantCall.row_id > submittedUser.row_id);
      assert.ok(matchingToolResult.row_id > matchingAssistantCall.row_id);
      assert.ok(currentAnswer.row_id > matchingToolResult.row_id);
      assert.ok(storedSession.messages.some((message) =>
        message.role === 'tool' && message.tool_call_id === 'orphan-call-without-assistant-record'));
      assert.equal(websocketRequests.every((request) => request.url === '/api/ws'), true);
      assert.equal(websocketRequests.length, 3);
      assert.equal(consumedTickets.size, 3);
      assert.equal(acceptedProtocols.length, 3);
      assert.equal(acceptedProtocols.every((protocols) =>
        protocols.includes('hermes-gateway-v1')
      && protocols.some((protocol) => protocol.startsWith('hermes-gateway-ticket.'))), true);

      const submitCountBeforeReplay = rpcMethods.filter((method) => method === 'prompt.submit').length;
      const replay = await client.callTool({
        name: 'send_hermes_task',
        arguments: {session_id: start.structuredContent.session_id, task, request_id: 'native-replay-proof'},
      });
      assert.equal(replay.isError, undefined);
      assert.deepEqual(replay.structuredContent, send.structuredContent);
      assert.equal(
        rpcMethods.filter((method) => method === 'prompt.submit').length,
        submitCountBeforeReplay,
        'replaying a completed request_id must not submit the prompt again',
      );
      } finally {
        await client.close();
      }
      const joinedLogs = logs.join('\n');
      assert.match(joinedLogs, /m2_hermes_session_started/);
      assert.match(joinedLogs, /m2_hermes_turn/);
      assert.equal(joinedLogs.includes('stored-1'), false);
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('controlled invalid Hermes session fails model-readably with no stack or secret leakage', async () => {
  await withNativeGateway(async ({accessToken, rpcMethods}) => {
    const client = await connectClient({ versionNegotiation: { mode: 'auto' } }, accessToken);
    try {
      const result = await client.callTool({
        name: 'send_hermes_task',
        arguments: {session_id: 'missing_session', task: 'hello', request_id: 'missing-session-proof'},
      });
      assert.equal(result.isError, true);
      const serialized = JSON.stringify(result);
      assert.match(serialized, /not found/i);
      assert.equal(serialized.includes('native-access-sentinel'), false);
      assert.equal(serialized.includes('native-refresh-sentinel'), false);
      assert.equal(/stack|node_modules|process\.env|HERMES_API_KEY|HERMES_BASE_URL/i.test(serialized), false);
      assert.equal(rpcMethods.includes('prompt.submit'), false);
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
    const missingRequestId = await client.callTool({
      name: 'send_hermes_task', arguments: {session_id: 'valid-session', task: 'valid task'},
    });
    assert.equal(m1.isError, true);
    assert.equal(m2.isError, true);
    assert.equal(missingRequestId.isError, true);
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
    const action = await client.callTool({
      name: 'run_m1_canary_action',
      arguments: {label: 'secret-leak-check'},
    });
    const malformed = await rawRequest('POST', '{');
    const combined = [
      JSON.stringify(status),
      JSON.stringify(action),
      malformed.body,
    ].join('\n');
    assert.equal(combined.includes(process.env.M2_SENTINEL_SECRET), false);
    assert.equal(/HERMES_API_KEY|HERMES_BASE_URL|VERCEL_TOKEN|M2_SENTINEL_SECRET|process\.env/i.test(combined), false);
    assert.equal(/\/var\/task|node_modules|at .*\(.+\.js:\d+:\d+\)/i.test(combined), false);
  } finally {
    await client.close();
    if (oldSentinel === undefined) delete process.env.M2_SENTINEL_SECRET;
    else process.env.M2_SENTINEL_SECRET = oldSentinel;
  }
});

test('Vercel keeps security headers and maps MCP plus required OAuth discovery and routes', () => {
  const config = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../vercel.json'),
    'utf8',
  ));
  assert.deepEqual(
    config.rewrites.filter((entry) => entry.source === '/mcp'),
    [{source: '/mcp', destination: '/api/mcp'}],
  );
  const expectedOAuthRewrites = [
    ['/.well-known/oauth-protected-resource', '/api/oauth?route=/.well-known/oauth-protected-resource'],
    ['/.well-known/oauth-protected-resource/mcp', '/api/oauth?route=/.well-known/oauth-protected-resource/mcp'],
    ['/mcp/.well-known/oauth-protected-resource', '/api/oauth?route=/mcp/.well-known/oauth-protected-resource'],
    ['/.well-known/oauth-authorization-server', '/api/oauth?route=/.well-known/oauth-authorization-server'],
    ['/oauth/:operation', '/api/oauth?route=/oauth/:operation'],
  ];
  for (const [source, destination] of expectedOAuthRewrites) {
    assert.ok(config.rewrites.some((entry) => entry.source === source && entry.destination === destination));
  }
  const allHeaders = config.headers.flatMap((entry) => entry.headers || []);
  assert.ok(allHeaders.some((header) => header.key === 'X-Content-Type-Options' && header.value === 'nosniff'));
  assert.ok(allHeaders.some((header) => header.key === 'Referrer-Policy' && header.value === 'no-referrer'));
  assert.ok(allHeaders.some((header) => header.key === 'Permissions-Policy'));
});
