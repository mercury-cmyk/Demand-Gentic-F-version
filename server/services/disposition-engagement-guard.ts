import type { CanonicalDisposition } from "@shared/schema";

type TranscriptTurn = {
  role: "user" | "assistant";
  text: string;
  timestamp?: Date;
};

type ProspectEngagementAssessment = {
  userTurns: number;
  userWords: number;
  meaningfulTurns: number;
  hasScreenerSignals: boolean;
  hasContextualSignals: boolean;
};

export function assessProspectEngagement(
  transcripts: TranscriptTurn[]
): ProspectEngagementAssessment {
  const userTurnsRaw = transcripts.filter(
    (t) => t.role === "user" && typeof t.text === "string" && t.text.trim().length > 0
  );

  const screenerPattern =
    /record your name|reason for call|reason for calling|stay on the line|this person is available|call screening|call assist|before I try to connect|google recording|cannot take your call|who i'm speaking to|what you're calling about/i;
  const contextualSignalPattern =
    /interested|pricing|budget|timeline|demo|meeting|next step|send (it|info|information)|email|challenge|problem|solution|follow[\s-]?up|call me back|callback|availability/i;
  const lowSignalTurnPattern =
    /^(yes|yeah|yep|hello|hi|speaking|this is [a-z]+|thanks|thank you|one moment|hold on|stay on the line|sorry(,\s*|\s+).*)$/i;

  const userWords = userTurnsRaw.reduce((sum, t) => {
    const words = t.text.trim().split(/\s+/).filter(Boolean).length;
    return sum + words;
  }, 0);

  const meaningfulTurns = userTurnsRaw.filter((t) => {
    const text = t.text.trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    return words >= 4 && !lowSignalTurnPattern.test(text);
  }).length;

  return {
    userTurns: userTurnsRaw.length,
    userWords,
    meaningfulTurns,
    hasScreenerSignals: userTurnsRaw.some((t) => screenerPattern.test(t.text)),
    hasContextualSignals: userTurnsRaw.some((t) => contextualSignalPattern.test(t.text)),
  };
}

export function guardQualifiedLeadDisposition(
  disposition: CanonicalDisposition,
  transcripts: TranscriptTurn[]
): {
  disposition: CanonicalDisposition;
  reason: "unchanged" | "screener_without_context" | "insufficient_contextual_engagement";
} {
  if (disposition !== "qualified_lead") {
    return { disposition, reason: "unchanged" };
  }

  const engagement = assessProspectEngagement(transcripts);

  if (engagement.hasScreenerSignals && !engagement.hasContextualSignals) {
    return { disposition: "no_answer", reason: "screener_without_context" };
  }

  if (!engagement.hasContextualSignals && (engagement.meaningfulTurns < 2 || engagement.userTurns < 2)) {
    return { disposition: "needs_review", reason: "insufficient_contextual_engagement" };
  }

  return { disposition, reason: "unchanged" };
}
