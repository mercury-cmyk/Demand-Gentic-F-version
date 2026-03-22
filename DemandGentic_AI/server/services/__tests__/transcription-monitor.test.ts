import { describe, expect, it } from "vitest";
import {
  clearMetrics,
  getTranscriptionHealthMetrics,
  recordTranscriptionResult,
} from "../transcription-monitor";

describe("transcription-monitor", () => {
  it("upgrades metric source per call instead of duplicating entries", () => {
    clearMetrics();
    recordTranscriptionResult("call-1", "none");
    recordTranscriptionResult("call-1", "fallback");

    const metrics = getTranscriptionHealthMetrics();
    expect(metrics.totalCalls).toBe(1);
    expect(metrics.callsWithFallbackTranscript).toBe(1);
    expect(metrics.callsWithNoTranscript).toBe(0);
  });

  it("counts realtime_native as realtime success", () => {
    clearMetrics();
    recordTranscriptionResult("call-2", "realtime_native");

    const metrics = getTranscriptionHealthMetrics();
    expect(metrics.callsWithRealtimeTranscript).toBe(1);
    expect(metrics.realtimeSuccessRate).toBe(1);
  });

  it("does not downgrade a successful call back to none", () => {
    clearMetrics();
    recordTranscriptionResult("call-3", "realtime");
    recordTranscriptionResult("call-3", "none");

    const metrics = getTranscriptionHealthMetrics();
    expect(metrics.totalCalls).toBe(1);
    expect(metrics.callsWithRealtimeTranscript).toBe(1);
    expect(metrics.callsWithNoTranscript).toBe(0);
  });
});