import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import {
  ConfiguredRuntimeResolver,
  createControlPlaneServer,
  HermesAdapter,
  listenControlPlaneServer,
} from "../src/index.js";
import type { JsonObject } from "../src/types.js";

const enabled = process.env.HERMES_PRIVATE_E2E === "1";
const origin = "http://127.0.0.1:4310";

test("private MCP path submits a real Hermes task and retrieves its result", {
  skip: !enabled,
}, async () => {
  const apiKey = process.env.HERMES_API_KEY;
  const bearerToken = process.env.CONTROL_PLANE_TOKEN;
  if (!apiKey) throw new Error("HERMES_API_KEY is required when HERMES_PRIVATE_E2E=1");
  if (!bearerToken) throw new Error("CONTROL_PLANE_TOKEN is required when HERMES_PRIVATE_E2E=1");

  const runtimeId = process.env.HERMES_RUNTIME_ID ?? "hermes-private-e2e";
  const baseUrl = process.env.HERMES_BASE_URL ?? "http://127.0.0.1:8642/v1";
  if (!isLoopbackHermesUrl(baseUrl)) throw new Error("HERMES_BASE_URL must target a loopback Hermes API server for the private local E2E");
  const adapter = new HermesAdapter({
    baseUrl,
    runtimeId,
    timeoutMs: 30_000,
  });
  const server = createControlPlaneServer({
    adapter,
    lifecycle: new ConfiguredRuntimeResolver([{ runtimeId }]),
    runtimeAuth: { apiKey },
    bearerToken,
    allowedOrigins: [origin],
  });
  await listenControlPlaneServer(server, { port: 0 });

  try {
    const listed = await callTool(server, bearerToken, origin, "tools/list", undefined, 1);
    assert.ok(Array.isArray((listed.result as JsonObject).tools));

    const started = await callTool(
      server,
      bearerToken,
      origin,
      "start_run",
      { runtimeId, input: "Reply with exactly: HERMES_PRIVATE_MCP_OK" },
      2,
    );
    const handle = extractStructuredContent(started);
    assert.equal(handle.runtime_id, runtimeId);
    assert.equal(typeof handle.run_id, "string");

    const deadline = Date.now() + 120_000;
    let result = await callTool(server, bearerToken, origin, "get_result", {
      runtimeId,
      runId: requiredString(handle, "run_id"),
      ...(typeof handle.session_id === "string" ? { sessionId: handle.session_id } : {}),
    }, 3);
    let structured = extractStructuredContent(result);
    while (structured.complete !== true && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      result = await callTool(server, bearerToken, origin, "get_result", {
        runtimeId,
        runId: requiredString(handle, "run_id"),
        ...(typeof handle.session_id === "string" ? { sessionId: handle.session_id } : {}),
      }, 4);
      structured = extractStructuredContent(result);
    }

    assert.equal(structured.complete, true);
    assert.equal(structured.state, "completed");
    assert.equal(structured.output, "HERMES_PRIVATE_MCP_OK");
    assert.equal(structured.runtime_id, runtimeId);
    assert.equal(structured.run_id, handle.run_id);
  } finally {
    await closeServer(server);
  }
});

async function callTool(
  server: ReturnType<typeof createControlPlaneServer>,
  bearerToken: string,
  requestOrigin: string,
  toolName: string,
  args: JsonObject | undefined,
  id: number,
): Promise<JsonObject> {
  const address = server.address() as AddressInfo;
  const method = toolName === "tools/list" ? "tools/list" : "tools/call";
  const body: JsonObject = toolName === "tools/list"
    ? { jsonrpc: "2.0", id, method, params: { _meta: mcpMeta() } }
    : { jsonrpc: "2.0", id, method, params: { name: toolName, arguments: args ?? {}, _meta: mcpMeta() } };
  const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      origin: requestOrigin,
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
      ...(method === "tools/call" ? { "Mcp-Name": toolName } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as JsonObject;
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.jsonrpc, "2.0");
  assert.equal(payload.id, id);
  assert.equal(payload.error, undefined, JSON.stringify(payload));
  return payload;
}

function isLoopbackHermesUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return hostname === "::1" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

function mcpMeta(): JsonObject {
  return {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "private-e2e-client", version: "1.0.0" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

function extractStructuredContent(response: JsonObject): JsonObject {
  const result = response.result;
  assert.ok(result !== null && typeof result === "object" && !Array.isArray(result));
  const structuredContent = (result as JsonObject).structuredContent;
  assert.ok(structuredContent !== null && typeof structuredContent === "object" && !Array.isArray(structuredContent));
  return structuredContent as JsonObject;
}

function requiredString(value: JsonObject, key: string): string {
  const result = value[key];
  assert.equal(typeof result, "string");
  return result as string;
}

async function closeServer(server: ReturnType<typeof createControlPlaneServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}
