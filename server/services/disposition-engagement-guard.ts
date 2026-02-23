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
    /interested|pricing|budget|timeline|demo|meeting|next step|send (it|info|information|that|me)|email|challenge|problem|solution|follow[\s-]?up|call me back|callback|availability|of course|absolutely|sure.*(send|sounds|go ahead)|please.*(send|go ahead)|sounds good|sounds great|that would be|love to|i('d| would) like|yes.*(please|send|sure|love|definitely)|definitely|perfect|go ahead/i;
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

  // Direct contextual signals from prospect
  let hasContextualSignals = userTurnsRaw.some((t) => contextualSignalPattern.test(t.text));

  // Cross-turn analysis: If agent asks about interest/email/send and prospect responds positively,
  // that counts as contextual engagement even if the prospect didn't use specific keywords.
  if (!hasContextualSignals) {
    const agentOfferPattern =
      /interested in|would you like|send (you|it|a copy|over|that)|your email|email address|receive a copy|share (it|this|that)|schedule|book a|set up a/i;
    const positiveReplyPattern =
      /^(yes|yeah|yep|sure|of course|absolutely|definitely|please|ok|okay|go ahead|that works|that('s| is) (fine|good|great|perfect))[.,!?\s]*$/i;

    for (let i = 0; i < transcripts.length; i++) {
      const turn = transcripts[i];
      if (turn.role === "assistant" && agentOfferPattern.test(turn.text)) {
        // Check if the next user turn is a positive reply
        const nextUserTurn = transcripts.slice(i + 1).find((t) => t.role === "user");
        if (nextUserTurn && positiveReplyPattern.test(nextUserTurn.text.trim())) {
          hasContextualSignals = true;
          break;
        }
      }
    }
  }

  return {
    userTurns: userTurnsRaw.length,
    userWords,
    meaningfulTurns,
    hasScreenerSignals: userTurnsRaw.some((t) => screenerPattern.test(t.text)),
    hasContextualSignals,
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
