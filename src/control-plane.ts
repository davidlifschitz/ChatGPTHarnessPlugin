import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { configurationError, HermesError, toRuntimeErrorInfo } from "./errors.js";
import type { LifecycleAdapter } from "./lifecycle.js";
import type {
  JsonObject,
  RuntimeAdapter,
  RuntimeAuth,
  RunHandle,
  RunResult,
  RunSnapshot,
  StartRunRequest,
} from "./types.js";

export const CONTROL_PLANE_MCP_PATH = "/mcp";
export const CONTROL_PLANE_MCP_PROTOCOL_VERSION = "2026-07-28";

export interface ControlPlaneOptions {
  readonly adapter: RuntimeAdapter;
  readonly lifecycle: LifecycleAdapter;
  /** Opaque runtime auth. This value is never read, serialized, or accepted from a tool call. */
  readonly runtimeAuth: RuntimeAuth;
  /** Private control-plane bearer secret. Keep it in deployment secret storage. */
  readonly bearerToken: string;
  /** Exact Origin values accepted by this HTTP endpoint. */
  readonly allowedOrigins: readonly string[];
  readonly path?: string;
  readonly maxBodyBytes?: number;
  readonly requestTimeoutMs?: number;
}

export interface ControlPlaneListenOptions {
  readonly host?: string;
  readonly port: number;
}

interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: string | number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

interface ProtocolValidationError {
  readonly code: number;
  readonly message: string;
}

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}

interface ToolSuccess {
  readonly structuredContent: JsonObject;
  readonly content: readonly [{ readonly type: "text"; readonly text: string }];
}

interface ToolFailure {
  readonly isError: true;
  readonly content: readonly [{ readonly type: "text"; readonly text: string }];
}

type ToolResult = ToolSuccess | ToolFailure;

const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "runtime_health",
    description: "Check the availability of one configured Hermes runtime.",
    inputSchema: objectSchema({ runtimeId: stringSchema("Configured runtime identifier") }),
  },
  {
    name: "runtime_capabilities",
    description: "Read the verified capabilities of one configured Hermes runtime.",
    inputSchema: objectSchema({ runtimeId: stringSchema("Configured runtime identifier") }),
  },
  {
    name: "start_run",
    description: "Submit a task to a configured Hermes runtime and return stable run identifiers.",
    inputSchema: objectSchema({
      runtimeId: stringSchema("Configured runtime identifier"),
      input: stringSchema("Prompt or task input"),
      sessionId: optionalStringSchema("Optional caller-chosen session correlation identifier"),
    }, ["runtimeId", "input"]),
  },
  {
    name: "get_run",
    description: "Inspect the normalized state of a previously submitted run.",
    inputSchema: objectSchema({
      runtimeId: stringSchema("Configured runtime identifier"),
      runId: stringSchema("Stable run identifier"),
      sessionId: optionalStringSchema("Optional session correlation identifier"),
    }, ["runtimeId", "runId"]),
  },
  {
    name: "get_result",
    description: "Retrieve the normalized result of a previously submitted run.",
    inputSchema: objectSchema({
      runtimeId: stringSchema("Configured runtime identifier"),
      runId: stringSchema("Stable run identifier"),
      sessionId: optionalStringSchema("Optional session correlation identifier"),
    }, ["runtimeId", "runId"]),
  },
];

const TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));
const SERVER_INFO = { "io.modelcontextprotocol/serverInfo": { name: "chatgpt-harness-hermes", version: "0.1.0" } };
const PRIVATE_CACHE_HINTS = { ttlMs: 0, cacheScope: "private" };
const MAX_RESPONSE_BYTES = 262_144;
const MAX_OUTPUT_CHARS = 64_000;
const MAX_BODY_BYTES = 1_048_576;

export function createControlPlaneServer(options: ControlPlaneOptions): Server {
  const config = validateOptions(options);
  return createServer((request, response) => {
    const timeout = setTimeout(() => {
      if (!response.writableEnded) sendHttpError(response, 504, "The control-plane request timed out");
    }, config.requestTimeoutMs);
    void handleRequest(request, response, config)
      .catch(() => {
        if (!response.headersSent) sendHttpError(response, 500, "The control plane could not complete the request");
        else if (!response.writableEnded) response.destroy();
      })
      .finally(() => clearTimeout(timeout));
  });
}

export function listenControlPlaneServer(
  server: Server,
  options: ControlPlaneListenOptions,
): Promise<Server> {
  const host = options.host ?? "127.0.0.1";
  if (!isLoopbackHost(host)) {
    throw configurationError("The private control plane only supports loopback listeners; use a TLS-terminating private proxy for remote access");
  }
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve(server);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host, port: options.port });
  });
}

interface ValidatedOptions {
  readonly adapter: RuntimeAdapter;
  readonly lifecycle: LifecycleAdapter;
  readonly runtimeAuth: RuntimeAuth;
  readonly bearerToken: string;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly path: string;
  readonly maxBodyBytes: number;
  readonly requestTimeoutMs: number;
}

function validateOptions(options: ControlPlaneOptions): ValidatedOptions {
  if (!options || typeof options !== "object") throw configurationError("Control-plane options are required");
  if (typeof options.bearerToken !== "string" || options.bearerToken.length < 16) {
    throw configurationError("A control-plane bearer token of at least 16 characters is required");
  }
  if (!Array.isArray(options.allowedOrigins) || options.allowedOrigins.length === 0) {
    throw configurationError("At least one allowed control-plane Origin is required");
  }
  const origins = new Set<string>();
  for (const origin of options.allowedOrigins) {
    if (typeof origin !== "string" || origin.length === 0 || origin === "null") {
      throw configurationError("Allowed control-plane Origins must be non-empty exact origins");
    }
    origins.add(origin);
  }
  const path = options.path ?? CONTROL_PLANE_MCP_PATH;
  if (!path.startsWith("/") || path.includes("?")) throw configurationError("Control-plane path must be an absolute URL path");
  const maxBodyBytes = options.maxBodyBytes ?? 1_048_576;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > MAX_BODY_BYTES) {
    throw configurationError(`maxBodyBytes must be between 1 and ${MAX_BODY_BYTES}`);
  }
  const requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1) throw configurationError("requestTimeoutMs must be a positive safe integer");
  return {
    adapter: options.adapter,
    lifecycle: options.lifecycle,
    runtimeAuth: options.runtimeAuth,
    bearerToken: options.bearerToken,
    allowedOrigins: origins,
    path,
    maxBodyBytes,
    requestTimeoutMs,
  };
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, options: ValidatedOptions): Promise<void> {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !options.allowedOrigins.has(origin)) {
    sendHttpError(response, 403, "Origin is not allowed");
    return;
  }
  if (!isAuthorized(request, options.bearerToken)) {
    sendHttpError(response, 401, "Authentication required");
    return;
  }
  const url = new URL(request.url ?? "/", "http://control-plane.invalid");
  if (url.pathname !== options.path) {
    sendHttpError(response, 404, "Not found");
    return;
  }
  if (request.method === "GET") {
    response.setHeader("Allow", "POST");
    sendHttpError(response, 405, "This control plane does not provide a standalone event stream");
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendHttpError(response, 405, "Method not allowed");
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(request, options.maxBodyBytes);
  } catch (error) {
    if (error instanceof HermesError && error.code === "INVALID_REQUEST") {
      sendHttpError(response, 413, "Request body is too large");
      return;
    }
    throw error;
  }
  const rpc = parseJsonRpcRequest(body);
  if ("error" in rpc) {
    sendJson(response, 400, rpc.error);
    return;
  }
  const headerError = validateMcpHeaders(request, rpc.request);
  if (headerError !== undefined) {
    sendJson(response, 400, rpcError(rpc.request.id, headerError.code, headerError.message));
    return;
  }
  if (rpc.request.method === "server/discover") {
    sendJson(response, 200, rpcResult(rpc.request.id, {
      supportedVersions: [CONTROL_PLANE_MCP_PROTOCOL_VERSION],
      capabilities: { tools: {} },
      instructions: "Use these private Hermes tools only for configured runtime task control.",
      ...PRIVATE_CACHE_HINTS,
    }));
    return;
  }
  if (rpc.request.method === "tools/list") {
    sendJson(response, 200, rpcResult(rpc.request.id, { tools: TOOL_DEFINITIONS, ...PRIVATE_CACHE_HINTS }));
    return;
  }
  if (rpc.request.method !== "tools/call") {
    sendJson(response, 404, rpcError(rpc.request.id, -32601, "Method not found"));
    return;
  }
  const params = rpc.request.params;
  const toolName = params?.name;
  if (typeof toolName !== "string" || !TOOL_NAMES.has(toolName)) {
    sendJson(response, 200, rpcError(rpc.request.id, -32602, "Requested tool is not available"));
    return;
  }
  const toolResult = await dispatchTool(toolName, params?.arguments, options);
  sendJson(response, 200, rpcResult(rpc.request.id, toolResult));
}

function isAuthorized(request: IncomingMessage, expectedToken: string): boolean {
  const header = request.headers.authorization;
  const expected = Buffer.from(`Bearer ${expectedToken}`, "utf8");
  if (typeof header !== "string") return false;
  const actual = Buffer.from(header, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function validateMcpHeaders(request: IncomingMessage, rpc: JsonRpcRequest): ProtocolValidationError | undefined {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return { code: -32020, message: "Content-Type must be application/json" };
  }
  const accept = request.headers.accept;
  if (typeof accept !== "string" || !hasMediaType(accept, "application/json") || !hasMediaType(accept, "text/event-stream")) {
    return { code: -32020, message: "Accept must include application/json and text/event-stream" };
  }
  const protocolVersion = request.headers["mcp-protocol-version"];
  if (protocolVersion === undefined) return { code: -32020, message: "MCP-Protocol-Version is required" };
  if (protocolVersion !== CONTROL_PLANE_MCP_PROTOCOL_VERSION) {
    return { code: -32022, message: `Unsupported MCP protocol version; supported: ${CONTROL_PLANE_MCP_PROTOCOL_VERSION}` };
  }
  const params = rpc.params;
  if (params === undefined) return { code: -32602, message: "Request params with MCP metadata are required" };
  const meta = params._meta;
  if (!isRecord(meta)) return { code: -32602, message: "Request _meta is required" };
  const bodyProtocolVersion = meta["io.modelcontextprotocol/protocolVersion"];
  if (typeof bodyProtocolVersion !== "string") return { code: -32602, message: "Request MCP protocol metadata is invalid" };
  if (!isRecord(meta["io.modelcontextprotocol/clientCapabilities"])) {
    return { code: -32602, message: "Request client capabilities metadata is required" };
  }
  const clientInfo = meta["io.modelcontextprotocol/clientInfo"];
  if (clientInfo !== undefined && (!isRecord(clientInfo) || typeof clientInfo.name !== "string" || typeof clientInfo.version !== "string")) {
    return { code: -32602, message: "Request client info metadata is invalid" };
  }
  if (bodyProtocolVersion !== protocolVersion) return { code: -32020, message: "MCP-Protocol-Version does not match request metadata" };
  const transportMethod = request.headers["mcp-method"];
  if (transportMethod !== rpc.method) return { code: -32020, message: "Mcp-Method does not match the JSON-RPC method" };
  const transportName = request.headers["mcp-name"];
  if (rpc.method === "tools/call") {
    const name = rpc.params?.name;
    if (typeof name !== "string" || transportName !== name) return { code: -32020, message: "Mcp-Name does not match the tool name" };
  } else if (transportName !== undefined) {
    return { code: -32020, message: "Mcp-Name is not valid for this method" };
  }
  return undefined;
}

function hasMediaType(value: string, mediaType: string): boolean {
  return value.split(",").some((part) => {
    const segments = part.trim().split(";");
    if (segments[0]?.trim().toLowerCase() !== mediaType) return false;
    const quality = segments.slice(1).find((parameter) => parameter.trim().toLowerCase().startsWith("q="));
    if (quality === undefined) return true;
    const value = Number(quality.trim().slice(2));
    return Number.isFinite(value) && value > 0;
  });
}

async function dispatchTool(name: string, rawArguments: unknown, options: ValidatedOptions): Promise<ToolResult> {
  try {
    const args = recordArguments(rawArguments);
    const runtimeId = requiredString(args, "runtimeId");
    const input = name === "start_run" ? requiredString(args, "input") : undefined;
    const sessionId = optionalString(args, "sessionId");
    if (name === "get_run" || name === "get_result") requiredString(args, "runId");
    await options.lifecycle.resolveRuntime(runtimeId);
    if (name === "runtime_health") {
      const health = await options.adapter.health(options.runtimeAuth);
      return success({
        runtime_id: health.runtimeId,
        available: health.available,
        status: health.status,
        ...(health.error === undefined ? {} : { error: safeErrorInfo(health.error) }),
      });
    }
    if (name === "runtime_capabilities") {
      const capabilities = await options.adapter.capabilities(options.runtimeAuth);
      return success({
        runtime_id: capabilities.runtimeId,
        ...(capabilities.platform === undefined ? {} : { platform: capabilities.platform }),
        ...(capabilities.model === undefined ? {} : { model: capabilities.model }),
        features: {
          run_submission: capabilities.features.runSubmission,
          run_status: capabilities.features.runStatus,
          run_events_sse: capabilities.features.runEventsSse,
          run_stop: capabilities.features.runStop,
          run_approval: capabilities.features.runApproval,
          session_continuity: capabilities.features.sessionContinuity,
        },
      });
    }
    if (name === "start_run") {
      if (input === undefined) throw new HermesError("INVALID_REQUEST", "The input argument is required");
      const request: StartRunRequest = sessionId === undefined ? { input } : { input, sessionId };
      const handle = await options.adapter.startRun(request, options.runtimeAuth);
      return success(handleOutput(handle, { state: "started" }));
    }
    const handle = parseHandle(args, runtimeId);
    if (name === "get_run") {
      const snapshot = await options.adapter.getRun(handle, options.runtimeAuth);
      return success(snapshotOutput(snapshot));
    }
    const result = await options.adapter.getResult(handle, options.runtimeAuth);
    return success(resultOutput(result));
  } catch (error) {
    return failure(safeErrorInfo(error));
  }
}

function parseJsonRpcRequest(value: unknown): { readonly request: JsonRpcRequest } | { readonly error: JsonObject } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { error: rpcError(null, -32600, "Invalid JSON-RPC request") };
  }
  const record = value as Record<string, unknown>;
  if (record.jsonrpc !== "2.0" || !isRpcId(record.id) || typeof record.method !== "string") {
    return { error: rpcError(isRpcId(record.id) ? record.id : null, -32600, "Invalid JSON-RPC request") };
  }
  if (record.params !== undefined && (record.params === null || typeof record.params !== "object" || Array.isArray(record.params))) {
    return { error: rpcError(record.id, -32602, "JSON-RPC params must be an object") };
  }
  return {
    request: {
      jsonrpc: "2.0",
      id: record.id,
      method: record.method,
      ...(record.params === undefined ? {} : { params: record.params as Record<string, unknown> }),
    },
  };
}

function isRpcId(value: unknown): value is string | number {
  return typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordArguments(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new HermesError("INVALID_REQUEST", "Tool arguments must be an object");
  return value as Record<string, unknown>;
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new HermesError("INVALID_REQUEST", `The ${key} argument must be a non-empty string`);
  }
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  return requiredString(args, key);
}

function parseHandle(args: Record<string, unknown>, runtimeId: string): RunHandle {
  const runId = requiredString(args, "runId");
  const sessionId = optionalString(args, "sessionId");
  return {
    runtimeId,
    runId,
    ...(sessionId === undefined ? {} : { sessionId }),
  };
}

function handleOutput(handle: RunHandle, extra: JsonObject): JsonObject {
  return {
    runtime_id: handle.runtimeId,
    ...(handle.sessionId === undefined ? {} : { session_id: handle.sessionId }),
    run_id: handle.runId,
    ...extra,
  };
}

function snapshotOutput(snapshot: RunSnapshot): JsonObject {
  return {
    ...handleOutput(snapshot, { state: snapshot.status }),
    ...(snapshot.output === undefined ? {} : { output: boundedText(snapshot.output) }),
    ...(snapshot.error === undefined ? {} : { error: "Hermes runtime reported an error" }),
    ...(snapshot.model === undefined ? {} : { model: boundedText(snapshot.model, 512) }),
    ...(snapshot.usage === undefined ? {} : { usage: usageOutput(snapshot.usage) }),
  };
}

function resultOutput(result: RunResult): JsonObject {
  return {
    ...handleOutput(result.handle, { state: result.status, complete: result.complete }),
    output: result.output === null ? null : boundedText(result.output),
    ...(result.error === undefined ? {} : { error: "Hermes runtime reported an error" }),
    ...(result.model === undefined ? {} : { model: boundedText(result.model, 512) }),
    ...(result.usage === undefined ? {} : { usage: usageOutput(result.usage) }),
  };
}

function boundedText(value: string, maxChars = MAX_OUTPUT_CHARS): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}…`;
}

function usageOutput(usage: { readonly inputTokens?: number; readonly outputTokens?: number; readonly totalTokens?: number }): JsonObject {
  return {
    ...(usage.inputTokens === undefined ? {} : { input_tokens: usage.inputTokens }),
    ...(usage.outputTokens === undefined ? {} : { output_tokens: usage.outputTokens }),
    ...(usage.totalTokens === undefined ? {} : { total_tokens: usage.totalTokens }),
  };
}

function safeErrorInfo(error: unknown): JsonObject {
  const info = toRuntimeErrorInfo(error);
  const messageByCode: Record<string, string> = {
    AUTH_REQUIRED: "Runtime authentication is required",
    CONFIGURATION_ERROR: "The control-plane configuration is invalid",
    INVALID_REQUEST: "The tool request is invalid",
    RUNTIME_NOT_FOUND: "The configured runtime was not found",
    RUNTIME_UNAVAILABLE: "The runtime is unavailable",
    RUNTIME_PROTOCOL_ERROR: "The runtime returned an invalid response",
    RUN_NOT_FOUND: "The run was not found",
    SESSION_NOT_FOUND: "The session was not found",
    UNSUPPORTED_CAPABILITY: "The runtime does not support this capability",
    TIMEOUT: "The runtime request timed out",
  };
  return {
    code: info.code,
    message: messageByCode[info.code] ?? "The runtime request failed",
    ...(info.statusCode === undefined ? {} : { status_code: info.statusCode }),
  };
}

function success(structuredContent: JsonObject): ToolSuccess {
  return {
    structuredContent,
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
  };
}

function failure(error: JsonObject): ToolFailure {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error }) }],
  };
}

function rpcResult(id: string | number, result: unknown): JsonObject {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      resultType: "complete",
      _meta: SERVER_INFO,
      ...(result as JsonObject),
    },
  };
}

function rpcError(id: string | number | null, code: number, message: string): JsonObject {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) throw new HermesError("INVALID_REQUEST", "Request body is too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function sendHttpError(response: ServerResponse, statusCode: number, message: string): void {
  sendJson(response, statusCode, { error: message });
}

function sendJson(response: ServerResponse, statusCode: number, body: JsonObject): void {
  let payload = JSON.stringify(body);
  if (Buffer.byteLength(payload, "utf8") > MAX_RESPONSE_BYTES) {
    statusCode = 500;
    payload = JSON.stringify({ error: "The control-plane response is too large" });
  }
  if (response.writableEnded || response.destroyed) return;
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(payload);
}

function stringSchema(description: string): JsonObject {
  return { type: "string", description, minLength: 1 };
}

function optionalStringSchema(description: string): JsonObject {
  return stringSchema(description);
}

function objectSchema(properties: Record<string, JsonObject>, required: readonly string[] = ["runtimeId"]): JsonObject {
  return { type: "object", properties, required: [...required], additionalProperties: false };
}
