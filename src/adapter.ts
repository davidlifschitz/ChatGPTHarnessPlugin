import {
  HermesProtocolError,
  RuntimeMismatchError,
  UnsupportedOperationError,
  invalidRequest,
  toRuntimeErrorInfo,
} from "./errors.js";
import { HermesHttpClient } from "./client.js";
import { isTerminalStatus } from "./protocol.js";
import type {
  ApprovalRequest,
  ContinueSessionRequest,
  RunControlResponse,
  RunHandle,
  RunResult,
  RunSnapshot,
  RuntimeAdapter,
  RuntimeAuth,
  RuntimeCapabilities,
  RuntimeEvent,
  RuntimeHealth,
  RuntimeRef,
  SessionRef,
  StartRunRequest,
} from "./types.js";
import type { HermesAdapterOptions } from "./hermes-types.js";

export class HermesAdapter implements RuntimeAdapter {
  readonly runtimeId: string;
  private readonly client: HermesHttpClient;

  constructor(options: HermesAdapterOptions) {
    if (
      typeof options.runtimeId !== "string" ||
      options.runtimeId.trim().length === 0 ||
      options.runtimeId !== options.runtimeId.trim() ||
      /[\u0000-\u001f\u007f]/.test(options.runtimeId)
    ) {
      throw invalidRequest("runtimeId must be a non-empty string");
    }
    this.runtimeId = options.runtimeId.trim();
    this.client = new HermesHttpClient(options);
  }

  async capabilities(auth: RuntimeAuth): Promise<RuntimeCapabilities> {
    const capabilities = await this.client.getCapabilities(auth);
    return {
      runtimeId: this.runtimeId,
      ...(capabilities.platform === undefined ? {} : { platform: capabilities.platform }),
      ...(capabilities.model === undefined ? {} : { model: capabilities.model }),
      features: capabilities.features,
      raw: capabilities.raw,
    };
  }

  async health(auth: RuntimeAuth): Promise<RuntimeHealth> {
    try {
      const health = await this.client.getHealth(auth);
      return {
        runtimeId: this.runtimeId,
        available: health.available,
        status: health.status,
        raw: health.raw,
      };
    } catch (error) {
      return {
        runtimeId: this.runtimeId,
        available: false,
        status: "unavailable",
        error: toRuntimeErrorInfo(error),
      };
    }
  }

  availability(auth: RuntimeAuth): Promise<RuntimeHealth> {
    return this.health(auth);
  }

  async startRun(request: StartRunRequest, auth: RuntimeAuth): Promise<RunHandle> {
    await this.requireCapability(auth, "runSubmission", "startRun", "run_submission");
    const started = await this.client.startRun(request, auth);
    return this.handle(started.runId, started.sessionId ?? request.sessionId);
  }

  async getRun(handle: RunHandle, auth: RuntimeAuth): Promise<RunSnapshot> {
    this.assertRunHandle(handle);
    await this.requireCapability(auth, "runStatus", "getRun", "run_status");
    const run = await this.client.getRun(handle.runId, auth);
    if (run.runId !== handle.runId) {
      throw new HermesProtocolError(
        `GET /v1/runs/{id} returned run_id ${run.runId} for requested run ${handle.runId}`,
      );
    }
    const sessionId = run.sessionId ?? handle.sessionId;
    return {
      ...this.handle(run.runId, sessionId),
      status: run.status,
      ...(run.output === undefined ? {} : { output: run.output }),
      ...(run.error === undefined ? {} : { error: run.error }),
      ...(run.model === undefined ? {} : { model: run.model }),
      ...(run.usage === undefined ? {} : { usage: run.usage }),
      raw: run.raw,
    };
  }

  async getResult(handle: RunHandle, auth: RuntimeAuth): Promise<RunResult> {
    const snapshot = await this.getRun(handle, auth);
    return {
      handle: {
        runtimeId: snapshot.runtimeId,
        runId: snapshot.runId,
        ...(snapshot.sessionId === undefined ? {} : { sessionId: snapshot.sessionId }),
      },
      status: snapshot.status,
      complete: isTerminalStatus(snapshot.status),
      output: snapshot.output ?? null,
      ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
      ...(snapshot.model === undefined ? {} : { model: snapshot.model }),
      ...(snapshot.usage === undefined ? {} : { usage: snapshot.usage }),
      raw: snapshot.raw,
    };
  }

  continueSession(
    session: SessionRef,
    request: ContinueSessionRequest,
    auth: RuntimeAuth,
  ): Promise<RunHandle> {
    this.assertSessionRef(session);
    if (request.previousResponseId === undefined && request.conversationHistory === undefined) {
      throw new UnsupportedOperationError(
        "continueSession",
        "previous_response_id_or_conversation_history",
      );
    }
    return this.startRun({ ...request, sessionId: session.sessionId }, auth);
  }

  async *streamEvents(handle: RunHandle, auth: RuntimeAuth): AsyncGenerator<RuntimeEvent, void, undefined> {
    this.assertRunHandle(handle);
    await this.requireCapability(auth, "runEventsSse", "streamEvents", "run_events_sse");
    for await (const event of this.client.streamRunEvents(handle.runId, auth)) {
      yield {
        runtimeId: this.runtimeId,
        runId: handle.runId,
        ...(event.event === undefined ? {} : { event: event.event }),
        ...(event.id === undefined ? {} : { id: event.id }),
        data: event.data,
        rawData: event.rawData,
      };
    }
  }

  events(handle: RunHandle, auth: RuntimeAuth): AsyncIterable<RuntimeEvent> {
    return this.streamEvents(handle, auth);
  }

  async cancelRun(handle: RunHandle, auth: RuntimeAuth): Promise<RunControlResponse> {
    this.assertRunHandle(handle);
    const capabilities = await this.capabilities(auth);
    if (!capabilities.features.runStop) {
      throw new UnsupportedOperationError("cancelRun", "run_stop");
    }
    const response = await this.client.stopRun(handle.runId, auth);
    return {
      handle,
      status: response.status,
      raw: response.raw,
    };
  }

  async approveRun(
    handle: RunHandle,
    request: ApprovalRequest,
    auth: RuntimeAuth,
  ): Promise<RunControlResponse> {
    this.assertRunHandle(handle);
    const capabilities = await this.capabilities(auth);
    if (!capabilities.features.runApproval) {
      throw new UnsupportedOperationError("approveRun", "run_approval_response");
    }
    const response = await this.client.approveRun(handle.runId, request, auth);
    return {
      handle,
      status: response.status,
      raw: response.raw,
    };
  }

  stopRuntime(runtime: RuntimeRef, _auth: RuntimeAuth): Promise<never> {
    void runtime;
    return Promise.reject(new UnsupportedOperationError("stopRuntime"));
  }

  private handle(runId: string, sessionId?: string): RunHandle {
    const handle: RunHandle = { runtimeId: this.runtimeId, runId };
    if (sessionId !== undefined) return { ...handle, sessionId };
    return handle;
  }

  private assertRunHandle(handle: RunHandle): void {
    if (handle.runtimeId !== this.runtimeId) {
      throw new RuntimeMismatchError(this.runtimeId, handle.runtimeId);
    }
    if (
      typeof handle.runId !== "string" ||
      handle.runId.trim().length === 0 ||
      handle.runId !== handle.runId.trim() ||
      /[\u0000-\u001f\u007f]/.test(handle.runId)
    ) {
      throw invalidRequest("runId must be a non-empty string");
    }
  }

  private assertSessionRef(session: SessionRef): void {
    if (session.runtimeId !== this.runtimeId) {
      throw new RuntimeMismatchError(this.runtimeId, session.runtimeId);
    }
    if (
      typeof session.sessionId !== "string" ||
      session.sessionId.trim().length === 0 ||
      session.sessionId !== session.sessionId.trim() ||
      /[\u0000-\u001f\u007f]/.test(session.sessionId)
    ) {
      throw invalidRequest("sessionId must be a non-empty string");
    }
  }

  private async requireCapability(
    auth: RuntimeAuth,
    capability: keyof RuntimeCapabilities["features"],
    operation: string,
    featureName: string,
  ): Promise<void> {
    const capabilities = await this.capabilities(auth);
    if (!capabilities.features[capability]) {
      throw new UnsupportedOperationError(operation, featureName);
    }
  }
}
