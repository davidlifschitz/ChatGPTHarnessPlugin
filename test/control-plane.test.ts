import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import {
  createControlPlaneServer,
  listenControlPlaneServer,
} from "../src/control-plane.js";
import { HermesError } from "../src/errors.js";
import type { LifecycleAdapter } from "../src/lifecycle.js";
import type {
  RuntimeAdapter,
  RuntimeAuth,
  RunHandle,
  RunResult,
  RunSnapshot,
} from "../src/types.js";

const BEARER_TOKEN = "private-control-plane-token";
const ORIGIN = "http://127.0.0.1:4310";
const RUNTIME_AUTH: RuntimeAuth = { apiKey: "runtime-api-key" };
const MCP_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "fixture-client", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};
const HANDLE: RunHandle = {
  runtimeId: "runtime-1",
  sessionId: "session-1",
  runId: "run-1",
};

interface RpcResponse {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
}

interface Fixture {
  readonly adapter: RuntimeAdapter;
  readonly lifecycle: LifecycleAdapter;
  readonly calls: {
    readonly adapterAuth: RuntimeAuth[];
    readonly resolvedRuntimeIds: string[];
    startRequests: unknown[];
  };
}

function recordAuth(auth: RuntimeAuth, calls: Fixture["calls"]): void {
  calls.adapterAuth.push(auth);
  assert.strictEqual(auth, RUNTIME_AUTH);
}

function makeFixture(): Fixture {
  const calls: Fixture["calls"] = {
    adapterAuth: [],
    resolvedRuntimeIds: [],
    startRequests: [],
  };

  const adapter: RuntimeAdapter = {
    async capabilities(auth) {
      recordAuth(auth, calls);
      return {
        runtimeId: HANDLE.runtimeId,
        platform: "fixture",
        model: "fixture-model",
        features: {
          runSubmission: true,
          runStatus: true,
          runEventsSse: false,
          runStop: false,
          runApproval: false,
          sessionContinuity: true,
        },
        raw: { hermes_secret: BEARER_TOKEN },
      };
    },
    async health(auth) {
      recordAuth(auth, calls);
      return {
        runtimeId: HANDLE.runtimeId,
        available: true,
        status: "available",
        raw: { hermes_secret: BEARER_TOKEN },
      };
    },
    async availability(auth) {
      return this.health(auth);
    },
    async startRun(request, auth) {
      recordAuth(auth, calls);
      calls.startRequests.push(request);
      return HANDLE;
    },
    async getRun(handle, auth): Promise<RunSnapshot> {
      recordAuth(auth, calls);
      assert.deepEqual(handle, HANDLE);
      return {
        ...HANDLE,
        status: "running",
        output: "fixture output",
        model: "fixture-model",
        usage: { totalTokens: 3 },
        raw: { hermes_secret: BEARER_TOKEN, nested: { payload: "raw" } },
      };
    },
    async getResult(handle, auth): Promise<RunResult> {
      recordAuth(auth, calls);
      assert.deepEqual(handle, HANDLE);
      return {
        handle: HANDLE,
        status: "completed",
        complete: true,
        output: "fixture result",
        model: "fixture-model",
        usage: { totalTokens: 5 },
        raw: { hermes_secret: BEARER_TOKEN },
      };
    },
    async *streamEvents() {
      // This private control plane intentionally does not expose event streaming.
    },
    async continueSession() {
      throw new Error("unused");
    },
    async cancelRun() {
      throw new Error("unused");
    },
    async approveRun() {
      throw new Error("unused");
    },
    async stopRuntime() {
      throw new Error("unused");
    },
  };

  const lifecycle: LifecycleAdapter = {
    async resolveRuntime(runtimeId) {
      calls.resolvedRuntimeIds.push(runtimeId);
      return { runtimeId };
    },
  };

  return { adapter, lifecycle, calls };
}

async function openServer(fixture: Fixture): Promise<ReturnType<typeof createControlPlaneServer>> {
  const server = createControlPlaneServer({
    adapter: fixture.adapter,
    lifecycle: fixture.lifecycle,
    runtimeAuth: RUNTIME_AUTH,
    bearerToken: BEARER_TOKEN,
    allowedOrigins: [ORIGIN],
  });
  await listenControlPlaneServer(server, { port: 0 });
  return server;
}

async function closeServer(server: ReturnType<typeof createControlPlaneServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

function requestHeaders(
  method: string,
  name?: string,
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${BEARER_TOKEN}`,
    origin: ORIGIN,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": method,
  };
  if (name !== undefined) headers["Mcp-Name"] = name;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete headers[key];
    else headers[key] = value;
  }
  return headers;
}

async function postRpc(
  server: ReturnType<typeof createControlPlaneServer>,
  body: unknown,
  headers: Record<string, string>,
  metadata: Record<string, unknown> = MCP_META,
): Promise<{ response: Response; json: RpcResponse; text: string }> {
  const address = server.address() as AddressInfo;
  const record = asRecord(body);
  const params = asRecord(record.params);
  const requestBody = { ...record, params: { ...params, _meta: metadata } };
  const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });
  const text = await response.text();
  const json = JSON.parse(text) as RpcResponse;
  return { response, json, text };
}

function asRecord(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function toolResult(json: RpcResponse): Record<string, unknown> {
  return asRecord(json.result);
}

test("listen helper binds to loopback by default", async (t) => {
  const fixture = makeFixture();
  const server = await openServer(fixture);
  t.after(async () => closeServer(server));

  assert.equal((server.address() as AddressInfo).address, "127.0.0.1");
});

test("keeps control-plane request buffering bounded", () => {
  const fixture = makeFixture();
  assert.throws(
    () => createControlPlaneServer({
      adapter: fixture.adapter,
      lifecycle: fixture.lifecycle,
      runtimeAuth: RUNTIME_AUTH,
      bearerToken: BEARER_TOKEN,
      allowedOrigins: [ORIGIN],
      maxBodyBytes: 1_048_577,
    }),
    /maxBodyBytes must be between 1 and 1048576/,
  );
});

test("rejects missing and wrong bearer authentication before dispatch", async (t) => {
  const fixture = makeFixture();
  const server = await openServer(fixture);
  t.after(async () => closeServer(server));

  const body = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
  const missing = await postRpc(server, body, requestHeaders("tools/list", undefined, {
    authorization: undefined,
  }));
  const wrong = await postRpc(server, body, requestHeaders("tools/list", undefined, {
    authorization: "Bearer wrong-token",
  }));

  assert.equal(missing.response.status, 401);
  assert.equal(wrong.response.status, 401);
  assert.equal(fixture.calls.adapterAuth.length, 0);
  assert.equal(missing.text.includes(BEARER_TOKEN), false);
  assert.equal(wrong.text.includes(BEARER_TOKEN), false);
});

test("requires an allowed Origin before dispatch", async (t) => {
  const fixture = makeFixture();
  const server = await openServer(fixture);
  t.after(async () => closeServer(server));

  const body = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
  const missing = await postRpc(server, body, requestHeaders("tools/list", undefined, {
    origin: undefined,
  }));
  const disallowed = await postRpc(server, body, requestHeaders("tools/list", undefined, {
    origin: "https://attacker.example",
  }));
  const disallowedWrongAuth = await postRpc(server, body, requestHeaders("tools/list", undefined, {
    origin: "https://attacker.example",
    authorization: "Bearer wrong-token",
  }));

  assert.equal(missing.response.status, 403);
  assert.equal(disallowed.response.status, 403);
  assert.equal(disallowedWrongAuth.response.status, 403);
  assert.equal(fixture.calls.adapterAuth.length, 0);
});

test("lists only the private runtime tools", async (t) => {
  const fixture = makeFixture();
  const server = await openServer(fixture);
  t.after(async () => closeServer(server));

  const result = await postRpc(
    server,
    { jsonrpc: "2.0", id: "list-1", method: "tools/list", params: {} },
    requestHeaders("tools/list"),
  );

  assert.equal(result.response.status, 200);
  const listed = asRecord(result.json.result);
  const tools = listed.tools;
  assert.ok(Array.isArray(tools));
  assert.deepEqual(
    tools.map((tool) => asRecord(tool).name),
    ["runtime_health", "runtime_capabilities", "start_run", "get_run", "get_result"],
  );
  assert.equal(fixture.calls.adapterAuth.length, 0);
});

test("supports current stateless MCP server discovery", async (t) => {
  const fixture = makeFixture();
  const server = await openServer(fixture);
  t.after(async () => closeServer(server));

  const result = await postRpc(
    server,
    { jsonrpc: "2.0", id: "discover-1", method: "server/discover", params: {} },
    requestHeaders("server/discover"),
  );

  assert.equal(result.response.status, 200);
  assert.deepEqual(result.json.result, {
    resultType: "complete",
    supportedVersions: ["2026-07-28"],
    capabilities: { tools: {} },
    instructions: "Use these private Hermes tools only for configured runtime task control.",
    _meta: { "io.modelcontextprotocol/serverInfo": { name: "chatgpt-harness-hermes", version: "0.1.0" } },
    ttlMs: 0,
    cacheScope: "private",
  });
});

test("runs start, get_run, and get_result through stable handles", async (t) => {
  const fixture = makeFixture();
  const server = await openServer(fixture);
  t.after(async () => closeServer(server));

  const start = await postRpc(
    server,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "start_run", arguments: { runtimeId: "runtime-1", input: "hello", sessionId: "session-1" } },
    },
    requestHeaders("tools/call", "start_run"),
  );
  const getRun = await postRpc(
    server,
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_run", arguments: { runtimeId: "runtime-1", sessionId: "session-1", runId: "run-1" } },
    },
    requestHeaders("tools/call", "get_run"),
  );
  const getResult = await postRpc(
    server,
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_result", arguments: { runtimeId: "runtime-1", sessionId: "session-1", runId: "run-1" } },
    },
    requestHeaders("tools/call", "get_result"),
  );

  assert.ok(start.json.result, start.text);
  assert.deepEqual(toolResult(start.json).structuredContent, {
    runtime_id: "runtime-1",
    session_id: "session-1",
    run_id: "run-1",
    state: "started",
  });
  assert.deepEqual(toolResult(getRun.json).structuredContent, {
    runtime_id: "runtime-1",
    session_id: "session-1",
    run_id: "run-1",
    state: "running",
    output: "fixture output",
    model: "fixture-model",
    usage: { total_tokens: 3 },
  });
  assert.deepEqual(toolResult(getResult.json).structuredContent, {
    runtime_id: "runtime-1",
    session_id: "session-1",
    run_id: "run-1",
    state: "completed",
    complete: true,
    output: "fixture result",
    model: "fixture-model",
    usage: { total_tokens: 5 },
  });
  assert.deepEqual(fixture.calls.startRequests, [{ input: "hello", sessionId: "session-1" }]);
  assert.deepEqual(fixture.calls.resolvedRuntimeIds, ["runtime-1", "runtime-1", "runtime-1"]);
  assert.equal(fixture.calls.adapterAuth.length, 3);
  assert.equal(start.text.includes(BEARER_TOKEN), false);
  assert.equal(getRun.text.includes(BEARER_TOKEN), false);
  assert.equal(getResult.text.includes(BEARER_TOKEN), false);
});

test("maps header disagreement to a protocol error before tool dispatch", async (t) => {
  const fixture = makeFixture();
  const server = await openServer(fixture);
  t.after(async () => closeServer(server));

  const result = await postRpc(
    server,
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "runtime_health", arguments: { runtimeId: "runtime-1" } } },
    requestHeaders("tools/list", "runtime_health"),
  );

  assert.equal(result.response.status, 400);
  assert.equal(asRecord(result.json.error).code, -32020);
  assert.equal(fixture.calls.adapterAuth.length, 0);
  assert.equal(fixture.calls.resolvedRuntimeIds.length, 0);
});

test("requires current per-request metadata and reports unsupported versions", async (t) => {
  const fixture = makeFixture();
  const server = await openServer(fixture);
  t.after(async () => closeServer(server));

  const missingMetadata = await postRpc(
    server,
    { jsonrpc: "2.0", id: 7, method: "tools/list", params: {} },
    requestHeaders("tools/list"),
    {},
  );
  const unsupportedVersion = await postRpc(
    server,
    { jsonrpc: "2.0", id: 8, method: "tools/list", params: {} },
    requestHeaders("tools/list", undefined, { "MCP-Protocol-Version": "2025-06-18" }),
  );
  const metadataMismatch = await postRpc(
    server,
    { jsonrpc: "2.0", id: 9, method: "tools/list", params: {} },
    requestHeaders("tools/list"),
    { ...MCP_META, "io.modelcontextprotocol/protocolVersion": "2025-06-18" },
  );

  assert.equal(missingMetadata.response.status, 400);
  assert.equal(asRecord(missingMetadata.json.error).code, -32602);
  assert.equal(unsupportedVersion.response.status, 400);
  assert.equal(asRecord(unsupportedVersion.json.error).code, -32022);
  assert.equal(metadataMismatch.response.status, 400);
  assert.equal(asRecord(metadataMismatch.json.error).code, -32020);
  assert.equal(fixture.calls.adapterAuth.length, 0);
});

test("rejects unsafe request ids and unknown methods with protocol HTTP status", async (t) => {
  const fixture = makeFixture();
  const server = await openServer(fixture);
  t.after(async () => closeServer(server));

  const unsafeId = await postRpc(
    server,
    { jsonrpc: "2.0", id: 1.5, method: "tools/list", params: {} },
    requestHeaders("tools/list"),
  );
  const unknownMethod = await postRpc(
    server,
    { jsonrpc: "2.0", id: 9, method: "runtime/unknown", params: {} },
    requestHeaders("runtime/unknown"),
  );

  assert.equal(unsafeId.response.status, 400);
  assert.equal(asRecord(unsafeId.json.error).code, -32600);
  assert.equal(unknownMethod.response.status, 404);
  assert.equal(asRecord(unknownMethod.json.error).code, -32601);
});

test("rejects invalid tool arguments without invoking the adapter", async (t) => {
  const fixture = makeFixture();
  const server = await openServer(fixture);
  t.after(async () => closeServer(server));

  const result = await postRpc(
    server,
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "start_run", arguments: { runtimeId: "runtime-1", input: 42 } },
    },
    requestHeaders("tools/call", "start_run"),
  );

  assert.equal(result.response.status, 200);
  const tool = toolResult(result.json);
  assert.equal(tool.isError, true);
  assert.equal(fixture.calls.adapterAuth.length, 0);
  assert.equal(fixture.calls.resolvedRuntimeIds.length, 0);
  assert.equal(result.text.includes(BEARER_TOKEN), false);
});

test("maps Hermes errors to safe tool errors and omits raw payloads and secrets", async (t) => {
  const fixture = makeFixture();
  const adapter = {
    ...fixture.adapter,
    async getRun(_handle: RunHandle, auth: RuntimeAuth): Promise<RunSnapshot> {
      recordAuth(auth, fixture.calls);
      throw new HermesError("RUNTIME_ERROR", `upstream leaked ${BEARER_TOKEN}`, {
        details: { secret: BEARER_TOKEN },
      });
    },
  } satisfies RuntimeAdapter;
  const server = createControlPlaneServer({
    adapter,
    lifecycle: fixture.lifecycle,
    runtimeAuth: RUNTIME_AUTH,
    bearerToken: BEARER_TOKEN,
    allowedOrigins: [ORIGIN],
  });
  await listenControlPlaneServer(server, { port: 0 });
  t.after(async () => closeServer(server));

  const result = await postRpc(
    server,
    {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "get_run", arguments: { runtimeId: "runtime-1", runId: "run-1" } },
    },
    requestHeaders("tools/call", "get_run"),
  );

  assert.equal(result.response.status, 200);
  const tool = toolResult(result.json);
  assert.equal(tool.isError, true);
  assert.equal(result.text.includes(BEARER_TOKEN), false);
  assert.equal(result.text.includes("upstream leaked"), false);
  assert.equal(result.text.includes("stack"), false);
});

test("sanitizes upstream run error fields in normalized results", async (t) => {
  const fixture = makeFixture();
  const adapter = {
    ...fixture.adapter,
    async getResult(handle: RunHandle, auth: RuntimeAuth): Promise<RunResult> {
      recordAuth(auth, fixture.calls);
      return {
        handle,
        status: "failed",
        complete: true,
        output: null,
        error: `upstream secret ${BEARER_TOKEN}`,
        raw: { leaked: BEARER_TOKEN },
      };
    },
  } satisfies RuntimeAdapter;
  const server = createControlPlaneServer({
    adapter,
    lifecycle: fixture.lifecycle,
    runtimeAuth: RUNTIME_AUTH,
    bearerToken: BEARER_TOKEN,
    allowedOrigins: [ORIGIN],
  });
  await listenControlPlaneServer(server, { port: 0 });
  t.after(async () => closeServer(server));

  const result = await postRpc(
    server,
    {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "get_result", arguments: { runtimeId: "runtime-1", runId: "run-1" } },
    },
    requestHeaders("tools/call", "get_result"),
  );

  const structured = asRecord(toolResult(result.json).structuredContent);
  assert.equal(structured.error, "Hermes runtime reported an error");
  assert.equal(result.text.includes(BEARER_TOKEN), false);
  assert.equal(result.text.includes("upstream secret"), false);
});
