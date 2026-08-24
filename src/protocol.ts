import { HermesProtocolError, protocolObject } from "./errors.js";
import type {
  CapabilityFlags,
  JsonObject,
  JsonValue,
  RunStatus,
  TokenUsage,
} from "./types.js";

const MAX_SSE_BUFFER_CHARS = 1_048_576;
const MAX_SSE_BLOCK_CHARS = 262_144;

export interface ParsedStartRun {
  readonly runId: string;
  readonly status: RunStatus;
  readonly sessionId?: string;
  readonly raw: JsonObject;
}

export interface ParsedRun {
  readonly runId: string;
  readonly status: RunStatus;
  readonly sessionId?: string;
  readonly output?: string;
  readonly error?: string;
  readonly model?: string;
  readonly usage?: TokenUsage;
  readonly raw: JsonObject;
}

export interface ParsedCapabilities {
  readonly platform?: string;
  readonly model?: string;
  readonly features: CapabilityFlags;
  readonly raw: JsonObject;
}

export interface ParsedHealth {
  readonly available: boolean;
  readonly status: "available" | "degraded" | "unavailable";
  readonly raw: JsonObject;
}

export interface ParsedControlResponse {
  readonly runId: string;
  readonly status: string;
  readonly raw: JsonObject;
}

export interface ParsedSseEvent {
  readonly event?: string;
  readonly id?: string;
  readonly data: JsonValue | string;
  readonly rawData: string;
}

function optionalString(object: JsonObject, key: string, context: string): string | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new HermesProtocolError(`${context}.${key} must be a string when present`);
  }
  return value;
}

function optionalIdentifier(object: JsonObject, key: string, context: string): string | undefined {
  const value = optionalString(object, key, context);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new HermesProtocolError(`${context}.${key} must not contain control characters`);
  }
  return trimmed;
}

function runId(object: JsonObject, context: string): string {
  const explicitRunId = optionalIdentifier(object, "run_id", context);
  if (explicitRunId !== undefined) return explicitRunId;
  const fallback = optionalIdentifier(object, "id", context);
  if (fallback !== undefined) return fallback;
  throw new HermesProtocolError(`${context}.run_id is required`);
}

function normalizeStatus(value: string): RunStatus {
  const normalized = value.trim().toLowerCase().replace(/[ -]/g, "_");
  switch (normalized) {
    case "queued":
    case "pending":
      return "queued";
    case "started":
      return "started";
    case "running":
    case "in_progress":
      return "running";
    case "waiting_for_approval":
    case "awaiting_approval":
    case "approval_required":
      return "waiting_for_approval";
    case "stopping":
      return "stopping";
    case "completed":
    case "succeeded":
    case "success":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function status(object: JsonObject, context: string, fallback?: string): RunStatus {
  const value = optionalString(object, "status", context) ?? fallback;
  if (!value) throw new HermesProtocolError(`${context}.status is required`);
  return normalizeStatus(value);
}

function usage(object: JsonObject, context: string): TokenUsage | undefined {
  const value = object.usage;
  if (value === undefined || value === null) return undefined;
  const usageObject = protocolObject(value, `${context}.usage`);
  const inputTokens = numberField(usageObject, "input_tokens", `${context}.usage`);
  const outputTokens = numberField(usageObject, "output_tokens", `${context}.usage`);
  const totalTokens = numberField(usageObject, "total_tokens", `${context}.usage`);
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
}

function numberField(object: JsonObject, key: string, context: string): number | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HermesProtocolError(`${context}.${key} must be a finite number when present`);
  }
  return value;
}

function errorMessage(object: JsonObject, context: string): string | undefined {
  const value = object.error;
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    const message = (value as JsonObject).message;
    if (typeof message === "string") return message;
  }
  throw new HermesProtocolError(`${context}.error must be a string or object with a message`);
}

export function parseStartRun(value: unknown, requestedSessionId?: string): ParsedStartRun {
  const raw = protocolObject(value, "POST /v1/runs response");
  const parsed: ParsedStartRun = {
    runId: runId(raw, "POST /v1/runs response"),
    status: status(raw, "POST /v1/runs response"),
    raw,
  };
  const requested = requestedSessionId?.trim();
  const sessionId =
    optionalIdentifier(raw, "session_id", "POST /v1/runs response") ??
    (requested && requested.length > 0 ? requested : undefined);
  if (sessionId !== undefined) return { ...parsed, sessionId };
  return parsed;
}

export function parseRun(value: unknown): ParsedRun {
  const raw = protocolObject(value, "GET /v1/runs/{id} response");
  const parsed: ParsedRun = {
    runId: runId(raw, "GET /v1/runs/{id} response"),
    status: status(raw, "GET /v1/runs/{id} response"),
    raw,
  };
  const sessionId = optionalIdentifier(raw, "session_id", "GET /v1/runs/{id} response");
  const outputValue = raw.output;
  if (outputValue !== undefined && outputValue !== null && typeof outputValue !== "string") {
    throw new HermesProtocolError("GET /v1/runs/{id} response.output must be a string when present");
  }
  const output = typeof outputValue === "string" ? outputValue : undefined;
  const error = errorMessage(raw, "GET /v1/runs/{id} response");
  const model = optionalString(raw, "model", "GET /v1/runs/{id} response");
  const parsedUsage = usage(raw, "GET /v1/runs/{id} response");
  return {
    ...parsed,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(output === undefined ? {} : { output }),
    ...(error === undefined ? {} : { error }),
    ...(model === undefined ? {} : { model }),
    ...(parsedUsage === undefined ? {} : { usage: parsedUsage }),
  };
}

export function parseCapabilities(value: unknown): ParsedCapabilities {
  const raw = protocolObject(value, "GET /v1/capabilities response");
  const featureValue = raw.features;
  const features =
    featureValue === undefined || featureValue === null
      ? {}
      : protocolObject(featureValue, "GET /v1/capabilities response.features");
  const parsedFeatures: CapabilityFlags = {
    runSubmission: features.run_submission === true,
    runStatus: features.run_status === true,
    runEventsSse: features.run_events_sse === true,
    runStop: features.run_stop === true,
    runApproval: features.run_approval_response === true,
    sessionContinuity: features.session_continuity_header === "X-Hermes-Session-Id",
  };
  const platform = optionalString(raw, "platform", "GET /v1/capabilities response");
  const model = optionalString(raw, "model", "GET /v1/capabilities response");
  return {
    ...(platform === undefined ? {} : { platform }),
    ...(model === undefined ? {} : { model }),
    features: parsedFeatures,
    raw,
  };
}

export function parseHealth(value: unknown): ParsedHealth {
  const raw = protocolObject(value, "GET /health response");
  const statusValue = optionalString(raw, "status", "GET /health response");
  if (statusValue !== undefined && statusValue.trim().length === 0) {
    throw new HermesProtocolError("GET /health response.status must not be empty");
  }
  const rawStatus = statusValue?.trim().toLowerCase();
  for (const key of ["ok", "healthy"] as const) {
    const auxiliary = raw[key];
    if (auxiliary !== undefined && typeof auxiliary !== "boolean") {
      throw new HermesProtocolError(`GET /health response.${key} must be boolean when present`);
    }
  }
  if (typeof raw.ok === "boolean" && typeof raw.healthy === "boolean" && raw.ok !== raw.healthy) {
    throw new HermesProtocolError("GET /health response.ok and healthy disagree");
  }
  const ok = raw.ok ?? raw.healthy;
  if (typeof ok !== "boolean" && rawStatus === undefined) {
    throw new HermesProtocolError("GET /health response must include status, ok, or healthy");
  }
  let available: boolean;
  let status: ParsedHealth["status"];
  if (rawStatus !== undefined) {
    if (["ok", "healthy", "available", "ready"].includes(rawStatus)) {
      available = true;
      status = "available";
    } else if (["degraded", "warning"].includes(rawStatus)) {
      available = true;
      status = "degraded";
    } else if (["error", "unavailable", "down", "not_ready"].includes(rawStatus)) {
      available = false;
      status = "unavailable";
    } else {
      throw new HermesProtocolError(`GET /health response.status ${rawStatus} is not recognized`);
    }
  } else {
    available = ok as boolean;
    status = available ? "available" : "unavailable";
  }
  if (typeof ok === "boolean" && rawStatus !== undefined && available !== ok) {
    throw new HermesProtocolError("GET /health response status and availability disagree");
  }
  return { available, status, raw };
}

const STOP_STATUSES = new Set([
  "stopping",
  "stopped",
  "cancelled",
  "failed",
]);
const APPROVAL_CHOICES = new Set(["once", "session", "always", "deny"]);

export function isApprovalChoice(value: unknown): value is "once" | "session" | "always" | "deny" {
  return typeof value === "string" && APPROVAL_CHOICES.has(value);
}

function requiredControlRunId(raw: JsonObject, context: string): string {
  const value = optionalIdentifier(raw, "run_id", context);
  if (value === undefined) throw new HermesProtocolError(`${context}.run_id is required`);
  return value;
}

export function parseStopResponse(value: unknown): ParsedControlResponse {
  const context = "POST /v1/runs/{id}/stop response";
  const raw = protocolObject(value, context);
  const runId = requiredControlRunId(raw, context);
  const responseStatus = optionalString(raw, "status", context);
  if (responseStatus === undefined || responseStatus.trim().length === 0) {
    throw new HermesProtocolError(`${context}.status is required`);
  }
  const status = responseStatus.trim().toLowerCase();
  if (!STOP_STATUSES.has(status)) {
    throw new HermesProtocolError(`${context}.status ${status} is not recognized`);
  }
  return { runId, status, raw };
}

export function parseApprovalResponse(value: unknown): ParsedControlResponse {
  const context = "POST /v1/runs/{id}/approval response";
  const raw = protocolObject(value, context);
  const runId = requiredControlRunId(raw, context);
  if (!isApprovalChoice(raw.choice)) {
    throw new HermesProtocolError(`${context}.choice is invalid`);
  }
  if (typeof raw.resolved !== "number" || !Number.isInteger(raw.resolved) || raw.resolved <= 0) {
    throw new HermesProtocolError(`${context}.resolved must be a positive integer`);
  }
  return { runId, status: "approved", raw };
}

function parseSsePayload(rawData: string): JsonValue | string {
  if (rawData.length === 0) return rawData;
  try {
    return JSON.parse(rawData) as JsonValue;
  } catch {
    return rawData;
  }
}

function parseSseBlock(block: string): ParsedSseEvent | undefined {
  let event: string | undefined;
  let id: string | undefined;
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "id") id = value;
    else if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0) return undefined;
  const rawData = dataLines.join("\n");
  const parsedData = parseSsePayload(rawData);
  let embeddedEvent: string | undefined;
  if (typeof parsedData === "object" && parsedData !== null && !Array.isArray(parsedData)) {
    if (parsedData.event !== undefined) {
      if (typeof parsedData.event !== "string" || parsedData.event.length === 0) {
        throw new HermesProtocolError("Hermes SSE data.event must be a non-empty string when present");
      }
      embeddedEvent = parsedData.event;
    }
  }
  if (event !== undefined && embeddedEvent !== undefined && event !== embeddedEvent) {
    throw new HermesProtocolError("Hermes SSE event envelope conflicts with data.event");
  }
  return {
    ...(event === undefined || event.length === 0
      ? embeddedEvent === undefined
        ? {}
        : { event: embeddedEvent }
      : { event }),
    ...(id === undefined || id.length === 0 ? {} : { id }),
    data: parsedData,
    rawData,
  };
}

export async function* parseSse(
  chunks: AsyncIterable<Uint8Array>,
): AsyncGenerator<ParsedSseEvent, void, undefined> {
  const decoder = new TextDecoder();
  let buffer = "";
  let trailingCarriageReturn = false;

  const appendDecoded = (decoded: string): void => {
    const combined = `${trailingCarriageReturn ? "\r" : ""}${decoded}`;
    trailingCarriageReturn = combined.endsWith("\r");
    const complete = trailingCarriageReturn ? combined.slice(0, -1) : combined;
    buffer += complete.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  };

  const dispatch = function* (final: boolean): Generator<ParsedSseEvent> {
    while (true) {
      const separator = buffer.indexOf("\n\n");
      if (separator === -1) break;
      const block = buffer.slice(0, separator);
      if (block.length > MAX_SSE_BLOCK_CHARS) throw new HermesProtocolError("Hermes SSE event is too large");
      buffer = buffer.slice(separator + 2);
      const parsed = parseSseBlock(block);
      if (parsed !== undefined) yield parsed;
    }
    if (final && buffer.length > 0) {
      throw new HermesProtocolError("Hermes SSE stream ended with an incomplete event");
    }
  };

  for await (const chunk of chunks) {
    appendDecoded(decoder.decode(chunk, { stream: true }));
    if (buffer.length > MAX_SSE_BUFFER_CHARS) throw new HermesProtocolError("Hermes SSE buffer is too large");
    yield* dispatch(false);
  }
  appendDecoded(decoder.decode());
  if (trailingCarriageReturn) {
    buffer += "\n";
    trailingCarriageReturn = false;
  }
  yield* dispatch(true);
}

export function isTerminalStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function isTerminalEvent(event: ParsedSseEvent): boolean {
  const expected =
    event.event === "run.completed"
      ? "completed"
      : event.event === "run.failed"
        ? "failed"
        : event.event === "run.cancelled"
          ? "cancelled"
          : undefined;
  if (expected === undefined || typeof event.data !== "object" || event.data === null || Array.isArray(event.data)) {
    return false;
  }
  const eventRunId = event.data.run_id;
  if (
    typeof eventRunId !== "string" ||
    eventRunId.trim().length === 0 ||
    /[\u0000-\u001f\u007f]/.test(eventRunId)
  ) {
    return false;
  }
  const eventStatus = event.data.status;
  return eventStatus === undefined || (typeof eventStatus === "string" && normalizeStatus(eventStatus) === expected);
}
