import {
  HermesError,
  HermesHttpError,
  HermesNetworkError,
  HermesProtocolError,
  HermesTimeoutError,
  authRequired,
  configurationError,
  invalidRequest,
} from "./errors.js";
import {
  parseCapabilities,
  parseApprovalResponse,
  parseHealth,
  parseRun,
  parseSse,
  parseStopResponse,
  parseStartRun,
  isApprovalChoice,
  isTerminalEvent,
  type ParsedCapabilities,
  type ParsedControlResponse,
  type ParsedHealth,
  type ParsedRun,
  type ParsedSseEvent,
  type ParsedStartRun,
} from "./protocol.js";
import type {
  ApprovalRequest,
  JsonObject,
  StartRunRequest,
} from "./types.js";
import type { HermesHttpClientOptions, HermesRuntimeAuth } from "./hermes-types.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_UPSTREAM_BODY_BYTES = 1_048_576;

interface PendingResponse {
  readonly response: Response;
  readonly controller: AbortController;
  readonly clearHeaderTimeout: () => void;
  readonly cleanup: () => void;
}

function requireApiKey(auth: HermesRuntimeAuth): string {
  if (!auth || typeof auth.apiKey !== "string" || auth.apiKey.trim().length === 0) {
    throw authRequired();
  }
  return auth.apiKey;
}

function validateRunId(runId: string): void {
  if (
    typeof runId !== "string" ||
    runId.trim().length === 0 ||
    runId !== runId.trim() ||
    /[\u0000-\u001f\u007f]/.test(runId)
  ) {
    throw invalidRequest("runId must be a non-empty string");
  }
}

function optionalRequestIdentifier(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw invalidRequest(`${name} must be a non-empty string`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw invalidRequest(`${name} must not contain control characters`);
  }
  return value;
}

function redactSecrets(value: string, apiKey: string): string {
  return value
    .replaceAll(apiKey, "[REDACTED]")
    .replace(/Bearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]")
    .replace(
      /(\"?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|cookie|authorization|secret)\"?\s*[:=]\s*\")([^\"\n]*)/gi,
      "$1[REDACTED]",
    )
    .replace(
      /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|cookie|authorization|secret)\b\s*[:=]\s*[^\s"',}&]+/gi,
      (match) => match.replace(/([^:=\s]+\s*[:=]\s*)[^\s"',}&]+$/i, "$1[REDACTED]"),
    );
}

function errorDetails(body: string, apiKey: string): JsonObject | undefined {
  const sanitized = redactSecrets(body, apiKey).trim();
  if (!sanitized) return undefined;
  return { body: sanitized.slice(0, 1_024) };
}

function safeCauseDetails(error: unknown, apiKey: string): JsonObject | undefined {
  const summary =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : undefined;
  return summary === undefined ? undefined : errorDetails(summary, apiKey);
}

function parseJsonBody(text: string, path: string, apiKey: string): unknown {
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const details = errorDetails(text, apiKey);
    throw new HermesProtocolError(
      `${path} returned invalid JSON`,
      details === undefined ? {} : { details },
    );
  }
}

export class HermesHttpClient {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HermesHttpClientOptions) {
    let baseUrl: URL;
    try {
      baseUrl = new URL(options.baseUrl);
    } catch {
      throw configurationError("Hermes baseUrl must be an absolute HTTP(S) URL");
    }
    if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
      throw configurationError("Hermes baseUrl must use HTTP or HTTPS");
    }
    if (baseUrl.protocol === "http:" && !isLoopbackHostname(baseUrl.hostname)) {
      throw configurationError("Hermes HTTP baseUrl must be loopback; use HTTPS for remote runtimes");
    }
    if (baseUrl.username || baseUrl.password) {
      throw configurationError("Hermes baseUrl must not contain URL credentials");
    }
    if (baseUrl.search || baseUrl.hash) {
      throw configurationError("Hermes baseUrl must not contain a query or fragment");
    }
    baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, "") || "/";
    this.baseUrl = baseUrl;

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
      throw configurationError(`Hermes timeoutMs must be between 1 and ${MAX_TIMEOUT_MS}`);
    }
    this.timeoutMs = timeoutMs;

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw configurationError("A global fetch implementation is required");
    }
    this.fetchImpl = fetchImpl;
  }

  async getCapabilities(auth: HermesRuntimeAuth): Promise<ParsedCapabilities> {
    const value = await this.requestJson("GET", "/v1/capabilities", auth);
    return parseCapabilities(value);
  }

  async getHealth(auth: HermesRuntimeAuth): Promise<ParsedHealth> {
    const value = await this.requestJson("GET", "/health", auth);
    return parseHealth(value);
  }

  async startRun(request: StartRunRequest, auth: HermesRuntimeAuth): Promise<ParsedStartRun> {
    if (typeof request.input !== "string" || request.input.trim().length === 0) {
      throw invalidRequest("startRun input must be a non-empty string");
    }
    const body: Record<string, unknown> = { input: request.input };
    const sessionId = optionalRequestIdentifier(request.sessionId, "sessionId");
    const previousResponseId = optionalRequestIdentifier(request.previousResponseId, "previousResponseId");
    if (sessionId !== undefined) body.session_id = sessionId;
    if (request.instructions !== undefined) body.instructions = request.instructions;
    if (request.conversationHistory !== undefined) body.conversation_history = request.conversationHistory;
    if (previousResponseId !== undefined) body.previous_response_id = previousResponseId;
    if (request.model !== undefined) body.model = request.model;
    if (request.provider !== undefined) body.provider = request.provider;
    if (request.modelOptions !== undefined) body.model_options = request.modelOptions;
    if (request.metadata !== undefined) body.metadata = request.metadata;

    const value = await this.requestJson("POST", "/v1/runs", auth, body);
    return parseStartRun(value, request.sessionId);
  }

  async getRun(runId: string, auth: HermesRuntimeAuth): Promise<ParsedRun> {
    validateRunId(runId);
    const value = await this.requestJson("GET", this.runPath(runId), auth);
    return parseRun(value);
  }

  async stopRun(runId: string, auth: HermesRuntimeAuth): Promise<ParsedControlResponse> {
    validateRunId(runId);
    const value = await this.requestJson("POST", `${this.runPath(runId)}/stop`, auth, {});
    return parseStopResponse(value);
  }

  async approveRun(
    runId: string,
    request: ApprovalRequest,
    auth: HermesRuntimeAuth,
  ): Promise<ParsedControlResponse> {
    validateRunId(runId);
    if (!isApprovalChoice(request.choice)) {
      throw invalidRequest("approval choice must be once, session, always, or deny");
    }
    if (request.all !== undefined && typeof request.all !== "boolean") {
      throw invalidRequest("approval all must be boolean when present");
    }
    const value = await this.requestJson("POST", `${this.runPath(runId)}/approval`, auth, { ...request });
    return parseApprovalResponse(value);
  }

  async *streamRunEvents(runId: string, auth: HermesRuntimeAuth): AsyncGenerator<ParsedSseEvent, void, undefined> {
    validateRunId(runId);
    const method = "GET";
    const path = `${this.runPath(runId)}/events`;
    const pending = await this.openRequest(method, path, auth, "text/event-stream");
    try {
      if (!pending.response.ok) {
        const body = await readBoundedResponseText(pending.response, path);
        throw new HermesHttpError(
          method,
          path,
          pending.response.status,
          redactSecrets(pending.response.statusText, requireApiKey(auth)).slice(0, 256),
          errorDetails(body, requireApiKey(auth)),
        );
      }
      if (!pending.response.body) {
        throw new HermesProtocolError(`${path} did not return an SSE body`);
      }
      pending.clearHeaderTimeout();

      const reader = pending.response.body.getReader();
      const idleTimeoutMs = Math.max(this.timeoutMs, 30_000);
      const chunks = async function* (): AsyncGenerator<Uint8Array, void, undefined> {
        try {
          while (true) {
            const next = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
              const idleTimer = setTimeout(() => {
                pending.controller.abort();
                reject(new HermesTimeoutError(method, path, idleTimeoutMs));
              }, idleTimeoutMs);
              void reader.read().then(resolve, reject).finally(() => clearTimeout(idleTimer));
            });
            if (next.done) return;
            yield next.value;
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      };

      let terminalEventSeen = false;
      for await (const event of parseSse(chunks())) {
        if (
          isTerminalEvent(event) &&
          typeof event.data === "object" &&
          event.data !== null &&
          !Array.isArray(event.data) &&
          event.data.run_id === runId
        ) {
          terminalEventSeen = true;
        }
        yield event;
      }
      if (!terminalEventSeen) {
        throw new HermesProtocolError(`${path} ended before a terminal run event was received`);
      }
    } catch (error) {
      if (error instanceof HermesError) throw error;
      if (pending.controller.signal.aborted) {
        throw new HermesTimeoutError(method, path, this.timeoutMs);
      }
      throw new HermesNetworkError(method, path, safeCauseDetails(error, requireApiKey(auth)));
    } finally {
      pending.cleanup();
    }
  }

  private runPath(runId: string): string {
    return `/v1/runs/${encodeURIComponent(runId)}`;
  }

  private url(path: string): string {
    const url = new URL(this.baseUrl.toString());
    const basePath = url.pathname.replace(/\/+$/, "") || "/";
    const hasV1Suffix = basePath === "/v1" || basePath.endsWith("/v1");
    let rootPath = basePath;
    let endpointPath = path;

    if (path.startsWith("/v1/") && hasV1Suffix) {
      endpointPath = path.slice("/v1".length);
    } else if (path === "/health" && hasV1Suffix) {
      rootPath = basePath.slice(0, -"/v1".length) || "/";
    }

    const joined = `${rootPath === "/" ? "" : rootPath}/${endpointPath.replace(/^\/+/, "")}`;
    url.pathname = joined || "/";
    return url.toString();
  }

  private async requestJson(
    method: string,
    path: string,
    auth: HermesRuntimeAuth,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.withResponse(method, path, auth, "application/json", body, async (response) => {
      return parseJsonBody(await readBoundedResponseText(response, path), path, requireApiKey(auth));
    });
  }

  private async openRequest(
    method: string,
    path: string,
    auth: HermesRuntimeAuth,
    accept: string,
    body?: Record<string, unknown>,
  ): Promise<PendingResponse> {
    const apiKey = requireApiKey(auth);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => controller.abort(), this.timeoutMs);
    const clearHeaderTimeout = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
    const cleanup = (): void => clearHeaderTimeout();
    const headers = new Headers({
      Accept: accept,
      Authorization: `Bearer ${apiKey}`,
    });
    if (body !== undefined) headers.set("Content-Type", "application/json");

    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    try {
      const response = await this.fetchImpl(this.url(path), init);
      return { response, controller, clearHeaderTimeout, cleanup };
    } catch (error) {
      cleanup();
      if (controller.signal.aborted) throw new HermesTimeoutError(method, path, this.timeoutMs);
      throw new HermesNetworkError(method, path, safeCauseDetails(error, apiKey));
    }
  }

  private async withResponse<T>(
    method: string,
    path: string,
    auth: HermesRuntimeAuth,
    accept: string,
    body: Record<string, unknown> | undefined,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    const pending = await this.openRequest(method, path, auth, accept, body);
    try {
      if (!pending.response.ok) {
        const bodyText = await readBoundedResponseText(pending.response, path);
        throw new HermesHttpError(
          method,
          path,
          pending.response.status,
          redactSecrets(pending.response.statusText, requireApiKey(auth)).slice(0, 256),
          errorDetails(bodyText, requireApiKey(auth)),
        );
      }
      return await consume(pending.response);
    } catch (error) {
      if (error instanceof HermesError) throw error;
      if (pending.controller.signal.aborted) {
        throw new HermesTimeoutError(method, path, this.timeoutMs);
      }
      throw new HermesNetworkError(method, path, safeCauseDetails(error, requireApiKey(auth)));
    } finally {
      pending.cleanup();
    }
  }
}

async function readBoundedResponseText(response: Response, path: string): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isSafeInteger(length) && length > MAX_UPSTREAM_BODY_BYTES) {
      throw new HermesProtocolError(`${path} returned a response body that is too large`);
    }
  }
  if (response.body === null) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_UPSTREAM_BODY_BYTES) {
      throw new HermesProtocolError(`${path} returned a response body that is too large`);
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      total += chunk.length;
      if (total > MAX_UPSTREAM_BODY_BYTES) {
        await reader.cancel();
        throw new HermesProtocolError(`${path} returned a response body that is too large`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "::1" || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}
