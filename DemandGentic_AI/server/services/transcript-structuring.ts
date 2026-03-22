export type TranscriptSpeakerRole = "agent" | "contact";

export interface StructuredTranscriptTurn {
  role: TranscriptSpeakerRole;
  text: string;
  timestamp?: string;
  timeOffsetSec?: number;
  startSec?: number;
  endSec?: number;
  channelTag?: number;
  rawSpeaker?: string;
}

function parseNumericTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsedNumber = Number(trimmed);
    if (Number.isFinite(parsedNumber)) {
      return parsedNumber > 1_000_000_000_000 ? parsedNumber : parsedNumber * 1000;
    }

    const parsedDate = Date.parse(trimmed);
    if (!Number.isNaN(parsedDate)) {
      return parsedDate;
    }
  }

  return null;
}

function normalizeSpeakerRole(rawRole: unknown): TranscriptSpeakerRole | null {
  if (typeof rawRole !== "string") {
    return null;
  }

  const normalized = rawRole.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["agent", "assistant", "ai", "bot", "rep", "sales_rep"].includes(normalized)) {
    return "agent";
  }

  if (["contact", "user", "customer", "prospect", "caller", "human", "lead"].includes(normalized)) {
    return "contact";
  }

  if (normalized.startsWith("agent") || normalized.startsWith("assistant")) {
    return "agent";
  }

  if (
    normalized.startsWith("contact") ||
    normalized.startsWith("customer") ||
    normalized.startsWith("prospect") ||
    normalized.startsWith("caller")
  ) {
    return "contact";
  }

  if (normalized === "speaker 1" || normalized === "speaker1" || normalized === "channel 1") {
    return "contact";
  }

  if (normalized === "speaker 2" || normalized === "speaker2" || normalized === "channel 2") {
    return "agent";
  }

  return null;
}

function normalizeTurnText(rawText: unknown): string {
  if (typeof rawText !== "string") {
    return "";
  }

  return rawText.replace(/\s+/g, " ").trim();
}

function splitLabeledTranscriptLine(line: string): StructuredTranscriptTurn | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(Agent|AI|Assistant|Bot|Contact|Customer|Prospect|User|Caller)\s*:\s*(.+)$/i);
  if (!match) return null;

  const role = normalizeSpeakerRole(match[1]);
  const text = normalizeTurnText(match[2]);
  if (!role || !text) return null;

  return { role, text };
}

function computeJaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }

  const intersection = new Set([...setA].filter((word) => setB.has(word)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

export function mergeTranscriptTurns(turns: StructuredTranscriptTurn[]): StructuredTranscriptTurn[] {
  if (turns.length = 0.8) {
      if (normalizedTurn.text.length > previous.text.length) {
        previous.text = normalizedTurn.text;
      }
      previous.timestamp = previous.timestamp || normalizedTurn.timestamp;
      previous.timeOffsetSec = previous.timeOffsetSec ?? normalizedTurn.timeOffsetSec;
      previous.startSec = previous.startSec ?? normalizedTurn.startSec;
      previous.endSec = normalizedTurn.endSec ?? previous.endSec;
      previous.channelTag = previous.channelTag ?? normalizedTurn.channelTag;
      previous.rawSpeaker = previous.rawSpeaker || normalizedTurn.rawSpeaker;
      continue;
    }

    previous.text = `${previous.text} ${normalizedTurn.text}`.trim();
    previous.endSec = normalizedTurn.endSec ?? previous.endSec;
    previous.timeOffsetSec = previous.timeOffsetSec ?? normalizedTurn.timeOffsetSec;
    previous.channelTag = previous.channelTag ?? normalizedTurn.channelTag;
    previous.rawSpeaker = previous.rawSpeaker || normalizedTurn.rawSpeaker;
  }

  return merged;
}

export function normalizeTranscriptTurns(raw: unknown): StructuredTranscriptTurn[] {
  if (Array.isArray(raw)) {
    const turns = raw
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const source = entry as Record;
        const rawSpeaker = typeof source.speaker === "string"
          ? source.speaker
          : typeof source.role === "string"
            ? source.role
            : typeof source.channel === "string"
              ? source.channel
              : undefined;

        const role = normalizeSpeakerRole(source.role ?? source.speaker ?? source.channel);
        const text = normalizeTurnText(source.text ?? source.message ?? source.content ?? source.transcript);
        if (!role || !text) {
          return null;
        }

        const timestampMs = parseNumericTimestamp(source.timestamp ?? source.timestampMs ?? source.timestamp_ms);
        const timeOffsetRaw = source.timeOffsetSec ?? source.time_offset_sec ?? source.timeOffset ?? source.offsetSec;
        const startSecRaw = source.startSec ?? source.start_sec ?? source.start;
        const endSecRaw = source.endSec ?? source.end_sec ?? source.end;

        const timeOffsetSec = typeof timeOffsetRaw === "number" && Number.isFinite(timeOffsetRaw)
          ? timeOffsetRaw
          : typeof timeOffsetRaw === "string" && Number.isFinite(Number(timeOffsetRaw))
            ? Number(timeOffsetRaw)
            : undefined;
        const startSec = typeof startSecRaw === "number" && Number.isFinite(startSecRaw)
          ? startSecRaw
          : typeof startSecRaw === "string" && Number.isFinite(Number(startSecRaw))
            ? Number(startSecRaw)
            : undefined;
        const endSec = typeof endSecRaw === "number" && Number.isFinite(endSecRaw)
          ? endSecRaw
          : typeof endSecRaw === "string" && Number.isFinite(Number(endSecRaw))
            ? Number(endSecRaw)
            : undefined;

        return {
          role,
          text,
          timestamp: timestampMs ? new Date(timestampMs).toISOString() : undefined,
          timeOffsetSec,
          startSec,
          endSec,
          channelTag: typeof source.channelTag === "number" ? source.channelTag : undefined,
          rawSpeaker,
        } satisfies StructuredTranscriptTurn;
      })
      .filter((turn): turn is StructuredTranscriptTurn => !!turn);

    return mergeTranscriptTurns(turns);
  }

  if (typeof raw === "string") {
    const turns = raw
      .split(/\r?\n/)
      .map(splitLabeledTranscriptLine)
      .filter((turn): turn is StructuredTranscriptTurn => !!turn);

    return mergeTranscriptTurns(turns);
  }

  return [];
}

export function formatTranscriptTurns(turns: StructuredTranscriptTurn[]): string {
  return turns
    .map((turn) => `${turn.role === "agent" ? "Agent" : "Contact"}: ${turn.text}`)
    .join("\n")
    .trim();
}