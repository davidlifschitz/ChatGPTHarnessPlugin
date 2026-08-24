import type { JsonObject, JsonValue, RuntimeErrorInfo } from "./types.js";

export type HermesErrorCode =
  | "CONFIGURATION_ERROR"
  | "AUTH_REQUIRED"
  | "INVALID_REQUEST"
  | "RUNTIME_UNAVAILABLE"
  | "RUNTIME_NOT_FOUND"
  | "RUNTIME_PROTOCOL_ERROR"
  | "RUN_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "RUNTIME_ERROR"
  | "UNSUPPORTED_CAPABILITY"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "RUNTIME_MISMATCH";

export interface HermesErrorOptions {
  readonly statusCode?: number;
  readonly method?: string;
  readonly path?: string;
  readonly details?: JsonValue;
}

export class HermesError extends Error {
  readonly code: HermesErrorCode;
  readonly statusCode?: number;
  readonly method?: string;
  readonly path?: string;
  readonly details?: JsonValue;

  constructor(code: HermesErrorCode, message: string, options: HermesErrorOptions = {}) {
    super(message);
    this.name = "HermesError";
    this.code = code;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
    if (options.method !== undefined) this.method = options.method;
    if (options.path !== undefined) this.path = options.path;
    if (options.details !== undefined) this.details = options.details;
  }
}

export class HermesHttpError extends HermesError {
  constructor(
    method: string,
    path: string,
    statusCode: number,
    statusText: string,
    details?: JsonValue,
  ) {
    const suffix = statusText.trim() ? ` ${statusText.trim()}` : "";
    const baseOptions: HermesErrorOptions = {
      statusCode,
      method,
      path,
    };
    const options: HermesErrorOptions = details === undefined ? baseOptions : { ...baseOptions, details };
    super(normalizedHttpErrorCode(statusCode, path), `${method} ${path} failed with HTTP ${statusCode}${suffix}`, options);
    this.name = "HermesHttpError";
  }
}

export class HermesProtocolError extends HermesError {
  constructor(message: string, options: HermesErrorOptions = {}) {
    super("RUNTIME_PROTOCOL_ERROR", message, options);
    this.name = "HermesProtocolError";
  }
}

export class HermesTimeoutError extends HermesError {
  constructor(method: string, path: string, timeoutMs: number) {
    super("TIMEOUT", `${method} ${path} timed out after ${timeoutMs}ms`, {
      method,
      path,
    });
    this.name = "HermesTimeoutError";
  }
}

export class HermesNetworkError extends HermesError {
  constructor(method: string, path: string, details?: JsonValue) {
    super(
      "RUNTIME_UNAVAILABLE",
      `${method} ${path} failed because the Hermes runtime could not be reached`,
      details === undefined ? { method, path } : { method, path, details },
    );
    this.name = "HermesNetworkError";
  }
}

export class UnsupportedOperationError extends HermesError {
  readonly operation: string;
  readonly requiredFeature?: string;

  constructor(operation: string, requiredFeature?: string) {
    const featureText = requiredFeature ? ` (requires advertised feature ${requiredFeature})` : "";
    super("UNSUPPORTED_CAPABILITY", `Hermes operation ${operation} is not supported${featureText}`);
    this.name = "UnsupportedOperationError";
    this.operation = operation;
    if (requiredFeature !== undefined) this.requiredFeature = requiredFeature;
  }
}

export class RuntimeMismatchError extends HermesError {
  constructor(expectedRuntimeId: string, actualRuntimeId: string) {
    super(
      "RUNTIME_MISMATCH",
      `Run handle belongs to runtime ${actualRuntimeId}, not ${expectedRuntimeId}`,
    );
    this.name = "RuntimeMismatchError";
  }
}

export function configurationError(message: string): HermesError {
  return new HermesError("CONFIGURATION_ERROR", message);
}

export function authRequired(): HermesError {
  return new HermesError("AUTH_REQUIRED", "A runtime API key is required for this Hermes request");
}

export function invalidRequest(message: string): HermesError {
  return new HermesError("INVALID_REQUEST", message);
}

function normalizedHttpErrorCode(statusCode: number, path: string): HermesErrorCode {
  if (statusCode === 401 || statusCode === 403) return "AUTH_REQUIRED";
  if (statusCode === 400 || statusCode === 422) return "INVALID_REQUEST";
  if (statusCode === 404) {
    if (/\/runs\//.test(path)) return "RUN_NOT_FOUND";
    if (/\/sessions\//.test(path)) return "SESSION_NOT_FOUND";
    return "RUNTIME_UNAVAILABLE";
  }
  if (statusCode === 408 || statusCode === 504) return "TIMEOUT";
  if (statusCode >= 500) return "RUNTIME_ERROR";
  return "HTTP_ERROR";
}

export function toRuntimeErrorInfo(error: unknown): RuntimeErrorInfo {
  if (error instanceof HermesError) {
    const info: RuntimeErrorInfo = {
      code: error.code,
      message: error.message,
    };
    if (error.statusCode !== undefined) {
      return {
        ...info,
        statusCode: error.statusCode,
        ...(error.details === undefined ? {} : { details: error.details }),
      };
    }
    return {
      ...info,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "The Hermes runtime returned an unknown error",
  };
}

export function protocolObject(value: unknown, context: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HermesProtocolError(`${context} must be a JSON object`);
  }
  return value as JsonObject;
}
