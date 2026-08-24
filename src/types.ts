export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type RunStatus =
  | "queued"
  | "started"
  | "running"
  | "waiting_for_approval"
  | "stopping"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

/** Opaque caller-supplied authentication context; a runtime adapter owns its shape. */
export type RuntimeAuth = unknown;

export interface RuntimeRef {
  readonly runtimeId: string;
}

export interface SessionRef extends RuntimeRef {
  readonly sessionId: string;
}

export interface RunHandle extends RuntimeRef {
  readonly runId: string;
  readonly sessionId?: string;
}

export interface ConversationMessage {
  readonly role: "system" | "developer" | "user" | "assistant" | "tool";
  readonly content: JsonValue;
  readonly name?: string;
}

export interface StartRunRequest {
  readonly input: string;
  readonly sessionId?: string;
  readonly instructions?: string;
  readonly conversationHistory?: readonly ConversationMessage[];
  readonly previousResponseId?: string;
  readonly model?: string;
  readonly provider?: string;
  readonly modelOptions?: JsonObject;
  readonly metadata?: JsonObject;
}

export type ContinueSessionRequest = Omit<StartRunRequest, "sessionId">;

export type ApprovalChoice = "once" | "session" | "always" | "deny";

export interface ApprovalRequest {
  readonly choice: ApprovalChoice;
  readonly all?: boolean;
}

export interface TokenUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface RunSnapshot extends RunHandle {
  readonly status: RunStatus;
  readonly output?: string;
  readonly error?: string;
  readonly model?: string;
  readonly usage?: TokenUsage;
  readonly raw: JsonObject;
}

export interface RunResult {
  readonly handle: RunHandle;
  readonly status: RunStatus;
  readonly complete: boolean;
  readonly output: string | null;
  readonly error?: string;
  readonly model?: string;
  readonly usage?: TokenUsage;
  readonly raw: JsonObject;
}

export interface RuntimeEvent {
  readonly runtimeId: string;
  readonly runId: string;
  readonly event?: string;
  readonly id?: string;
  readonly data: JsonValue | string;
  readonly rawData: string;
}

export interface CapabilityFlags {
  readonly runSubmission: boolean;
  readonly runStatus: boolean;
  readonly runEventsSse: boolean;
  readonly runStop: boolean;
  readonly runApproval: boolean;
  readonly sessionContinuity: boolean;
}

export interface RuntimeCapabilities extends RuntimeRef {
  readonly platform?: string;
  readonly model?: string;
  readonly features: CapabilityFlags;
  readonly raw: JsonObject;
}

export type RuntimeHealthStatus = "available" | "degraded" | "unavailable";

export interface RuntimeErrorInfo {
  readonly code: string;
  readonly message: string;
  readonly statusCode?: number;
}

export interface RuntimeHealth extends RuntimeRef {
  readonly available: boolean;
  readonly status: RuntimeHealthStatus;
  readonly raw?: JsonObject;
  readonly error?: RuntimeErrorInfo;
}

export interface RunControlResponse {
  readonly handle: RunHandle;
  readonly status: string;
  readonly raw: JsonObject;
}

export interface RuntimeAdapter {
  capabilities(auth: RuntimeAuth): Promise<RuntimeCapabilities>;
  health(auth: RuntimeAuth): Promise<RuntimeHealth>;
  availability(auth: RuntimeAuth): Promise<RuntimeHealth>;
  startRun(request: StartRunRequest, auth: RuntimeAuth): Promise<RunHandle>;
  getRun(handle: RunHandle, auth: RuntimeAuth): Promise<RunSnapshot>;
  getResult(handle: RunHandle, auth: RuntimeAuth): Promise<RunResult>;
  continueSession(
    session: SessionRef,
    request: ContinueSessionRequest,
    auth: RuntimeAuth,
  ): Promise<RunHandle>;
  streamEvents(handle: RunHandle, auth: RuntimeAuth): AsyncIterable<RuntimeEvent>;
  cancelRun(handle: RunHandle, auth: RuntimeAuth): Promise<RunControlResponse>;
  approveRun(
    handle: RunHandle,
    request: ApprovalRequest,
    auth: RuntimeAuth,
  ): Promise<RunControlResponse>;
  stopRuntime(runtime: RuntimeRef, auth: RuntimeAuth): Promise<never>;
}
