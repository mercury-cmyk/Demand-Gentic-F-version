import { createHash } from "crypto";

export type TelemetryActor = "agent" | "prospect" | "system";

export type RealtimeTelemetryEvent =
  | "call.started"
  | "media.connected"
  | "vad.prospect.speech_start"
  | "vad.prospect.speech_end"
  | "stt.partial"
  | "stt.final"
  | "llm.requested"
  | "llm.completed"
  | "tts.started"
  | "tts.chunk_sent"
  | "tts.stopped"
  | "playback.started"
  | "playback.ended"
  | "playback.canceled"
  | "barge_in.detected"
  | "barge_in.tts_cancel_sent"
  | "turn.closed"
  | "call.ended"
  | "guard.intro_blocked"
  | "guard.duplicate_llm_dropped"
  | "guard.repeat_utterance_blocked"
  | "watchdog.dead_air_recovery_prompted"
  | "watchdog.dead_air_hangup"
  | "audio.quality_gate_failed"
  | "audio.quality_degraded"
  | "audio.excessive_interruptions"
  | "audio.dead_exchange_abort"
  | "audio.quality_final";

export interface RealtimeTelemetryEnvelope {
  ts: string;
  callId: string;
  sessionId: string;
  turnId: number;
  seq: number;
  event: RealtimeTelemetryEvent;
  actor: TelemetryActor;
  payload: Record<string, unknown>;
}

const TELEMETRY_LOG_PREFIX = "[RealtimeCallTelemetry]";

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export class RealtimeCallTelemetry {
  private seq = 0;
  private currentTurnId = 0;
  private readonly completionHashesByTurn = new Map<number, Set<string>>();
  private lastAgentUtteranceHash: string | null = null;
  private lastAgentUtteranceAt = 0;

  constructor(
    private readonly callId: string,
    private readonly sessionId: string,
  ) {}

  get turnId(): number {
    return this.currentTurnId;
  }

  nextTurn(): number {
    this.currentTurnId += 1;
    return this.currentTurnId;
  }

  emit(event: RealtimeTelemetryEvent, actor: TelemetryActor, payload: Record<string, unknown> = {}, turnId?: number): void {
    const envelope: RealtimeTelemetryEnvelope = {
      ts: new Date().toISOString(),
      callId: this.callId,
      sessionId: this.sessionId,
      turnId: turnId ?? this.currentTurnId,
      seq: ++this.seq,
      event,
      actor,
      payload,
    };

    console.log(`${TELEMETRY_LOG_PREFIX} ${JSON.stringify(envelope)}`);
  }

  isDuplicateCompletionForTurn(turnId: number, responseHash: string): boolean {
    const existing = this.completionHashesByTurn.get(turnId) ?? new Set<string>();
    if (existing.has(responseHash)) {
      return true;
    }
    existing.add(responseHash);
    this.completionHashesByTurn.set(turnId, existing);
    return false;
  }

  detectRepeatUtterance(responseHash: string, windowMs = 20_000): { repeated: boolean; deltaMs: number } {
    const now = Date.now();
    if (!this.lastAgentUtteranceHash) {
      this.lastAgentUtteranceHash = responseHash;
      this.lastAgentUtteranceAt = now;
      return { repeated: false, deltaMs: 0 };
    }

    const deltaMs = now - this.lastAgentUtteranceAt;
    const repeated = this.lastAgentUtteranceHash === responseHash && deltaMs <= windowMs;
    this.lastAgentUtteranceHash = responseHash;
    this.lastAgentUtteranceAt = now;

    return { repeated, deltaMs };
  }
}
