/**
 * Call Analysis Module
 * 135-point evaluation system for call/simulation analysis
 * Extracted from Virtual Agents for unified Preview Studio use
 */

import type {
  PreviewMessage,
  SessionMemory,
  EvaluationReport,
  TimelineHighlight,
  TurnTag,
  ConversationStage,
  ReasoningPanel,
  ConversationAnalysis,
  UserIntent,
} from '@/types/call-analysis';

/**
 * Create initial empty session memory
 */
export function createInitialSessionMemory(): SessionMemory {
  return {
    userGoal: '',
    prospectSignals: [],
    agentClaims: [],
    questionsAsked: [],
    objectionsDetected: [],
    commitments: [],
    complianceSignals: [],
    unresolvedItems: [],
  };
}

/**
 * Create initial reasoning panel
 */
export function createInitialReasoningPanel(): ReasoningPanel {
  return {
    understanding: {
      currentObjective: 'Confirm prospect identity and establish rapport',
      prospectCareAbout: 'Unknown - needs discovery',
      confidence: 'medium',
    },
    strategy: {
      chosenApproach: 'Professional, consultative opening',
      nextBestMove: 'Ask an open-ended question about their current challenges',
    },
    riskCompliance: {
      flags: [],
      toneCheck: 'executive-grade',
    },
    evidence: [],
  };
}

/**
 * Create initial conversation analysis
 */
export function createInitialConversationAnalysis(): ConversationAnalysis {
  return {
    stage: 'opening',
    turnGoal: 'Greet prospect and confirm identity',
    confidence: 100,
    userIntent: 'neutral',
    issues: [],
    suggestions: [],
  };
}

/**
 * Update session memory based on new message
 */
export function updateSessionMemory(
  currentMemory: SessionMemory,
  message: PreviewMessage
): SessionMemory {
  const newMemory = { ...currentMemory };
  const content = message.content.toLowerCase();

  if (message.role === 'user') {
    // Detect objections
    const objectionKeywords = ['not interested', 'no time', 'busy', 'call back', 'not a good time', 'don\'t need'];
    for (const keyword of objectionKeywords) {
      if (content.includes(keyword)) {
        newMemory.objectionsDetected.push({
          objection: keyword,
          handling: '',
          quality: 'missed'
        });
        break;
      }
    }

    // Detect interest signals
    const interestKeywords = ['tell me more', 'interested', 'sounds good', 'how does', 'what do you'];
    for (const keyword of interestKeywords) {
      if (content.includes(keyword)) {
        newMemory.prospectSignals.push(`Interest: "${message.content.slice(0, 50)}..."`);
        break;
      }
    }
  } else if (message.role === 'assistant') {
    // Track questions asked
    const questionCount = (message.content.match(/\?/g) || []).length;
    if (questionCount > 0) {
      newMemory.questionsAsked.push(message.content.slice(0, 100));
    }

    // Detect claims made
    const claimKeywords = ['we help', 'we\'ve helped', 'our clients', 'we can', 'we offer'];
    for (const keyword of claimKeywords) {
      if (content.includes(keyword)) {
        newMemory.agentClaims.push(message.content.slice(0, 100));
        break;
      }
    }

    // Detect compliance signals
    const pressureKeywords = ['real quick', 'just a second', 'won\'t take long', 'hurry'];
    for (const keyword of pressureKeywords) {
      if (content.includes(keyword)) {
        newMemory.complianceSignals.push({
          type: 'pressure',
          message: `Pressure language: "${keyword}"`
        });
        break;
      }
    }

    // Update objection handling quality
    if (newMemory.objectionsDetected.length > 0) {
      const lastObjection = newMemory.objectionsDetected[newMemory.objectionsDetected.length - 1];
      if (lastObjection.quality === 'missed') {
        const acknowledgePhrases = ['understand', 'appreciate', 'hear you', 'respect'];
        const hasAcknowledge = acknowledgePhrases.some(p => content.includes(p));
        lastObjection.handling = message.content.slice(0, 100);
        lastObjection.quality = hasAcknowledge ? 'good' : 'weak';
      }
    }
  }

  return newMemory;
}

/**
 * Detect conversation stage based on messages
 */
export function detectConversationStage(messages: PreviewMessage[]): ConversationStage {
  if (messages.length  m.content.toLowerCase()).join(' ');

  if (lastContent.includes('not interested') || lastContent.includes('no thank')) {
    return 'objection-handling';
  }
  if (lastContent.includes('meeting') || lastContent.includes('schedule') || lastContent.includes('calendar')) {
    return 'closing';
  }
  if (lastContent.includes('goodbye') || lastContent.includes('thank you for your time')) {
    return 'exit';
  }
  if (lastContent.includes('what') || lastContent.includes('how') || lastContent.includes('challenge')) {
    return 'discovery';
  }
  if (lastContent.includes('budget') || lastContent.includes('timeline') || lastContent.includes('decision')) {
    return 'qualification';
  }

  return 'discovery';
}

/**
 * Detect user intent from message
 */
export function detectUserIntent(content: string): UserIntent {
  const lower = content.toLowerCase();

  if (lower.includes('interested') || lower.includes('tell me more') || lower.includes('sounds good')) {
    return 'interested';
  }
  if (lower.includes('busy') || lower.includes('no time') || lower.includes('in a meeting')) {
    return 'busy';
  }
  if (lower.includes('not interested') || lower.includes('no thank') || lower.includes('don\'t need')) {
    return 'objecting';
  }
  if (lower.includes('what') || lower.includes('confused') || lower.includes('don\'t understand')) {
    return 'confused';
  }
  if (lower.includes('okay') || lower.includes('sure') || lower.includes('maybe')) {
    return 'neutral';
  }

  return 'neutral';
}

/**
 * Generate 135-point evaluation report from conversation
 * This is the core analysis engine
 */
export function generateEvaluationReport(
  messages: PreviewMessage[],
  sessionMemory: SessionMemory
): EvaluationReport {
  const agentMessages = messages.filter(m => m.role === 'assistant');
  const userMessages = messages.filter(m => m.role === 'user');

  // VOICEMAIL DISCIPLINE CHECK - CRITICAL
  const voicemailViolations: string[] = [];
  const voicemailKeywords = ['voicemail', 'leave a message', 'leave message', 'record', 'after the beep', 'after the tone'];
  const correctVoicemailResponse = ["try again later", "no problem", "that's okay"];

  for (let i = 0; i  msgLower.includes(kw))) {
      // Check if next agent response is appropriate
      const nextAgentMsg = messages.slice(i + 1).find(m => m.role === 'assistant');
      if (nextAgentMsg) {
        const agentLower = nextAgentMsg.content.toLowerCase();
        const hasCorrectResponse = correctVoicemailResponse.some(r => agentLower.includes(r));
        const isBrief = nextAgentMsg.content.length  msgLower.includes(p))) {
      gratitudeCount++;
    }

    // Check for apology at start (first 2 agent messages)
    if (i  msgLower.includes(p))) {
      apologyAtStart = true;
    }

    // Check for warm closing (last agent message)
    if (i === agentMessages.length - 1) {
      warmClosing = warmClosingPhrases.some(p => msgLower.includes(p));
      // Check for abrupt ending (short, no gratitude)
      if (agentMessages[i].content.length  msgLower.includes(p))) {
        abruptEnding = true;
      }
    }

    // Check for rushed/salesy tone
    if (rushedPhrases.some(p => msgLower.includes(p))) {
      rushedTone = true;
    }
    if (salesyPhrases.some(p => msgLower.includes(p))) {
      salesyTone = true;
    }
  }

  // Check if gratitude was expressed after user gave permission
  const permissionPhrases = ['okay', 'sure', 'go ahead', 'yes', 'fine', 'alright', 'seconds', 'minute', 'briefly'];
  for (let i = 0; i  userLower.includes(p))) {
      // Find next agent message
      const msgIndex = messages.indexOf(userMessages[i]);
      const nextAgentMsg = messages.slice(msgIndex + 1).find(m => m.role === 'assistant');
      if (nextAgentMsg && !gratitudePhrases.some(p => nextAgentMsg.content.toLowerCase().includes(p))) {
        humanityIssues.push(`Turn ${msgIndex + 2}: No gratitude after permission granted (HIGH SEVERITY)`);
      }
    }
  }

  if (abruptEnding) {
    humanityIssues.push('Call ended abruptly without graceful closing (HIGH SEVERITY)');
  }
  if (!apologyAtStart && messages.length > 2) {
    humanityIssues.push('No polite acknowledgment of interruption at call start (MEDIUM)');
  }
  if (rushedTone) {
    humanityIssues.push('Rushed/minimizing language detected (MEDIUM)');
  }
  if (salesyTone) {
    humanityIssues.push('Overly salesy/cheerful language detected (MEDIUM)');
  }
  if (gratitudeCount === 0 && agentMessages.length > 2) {
    humanityIssues.push('No gratitude expressed throughout conversation (HIGH SEVERITY)');
  }

  // Calculate humanity score (0-20)
  let humanityScore = 20;
  if (abruptEnding) humanityScore -= 6; // High severity
  if (gratitudeCount === 0) humanityScore -= 6; // High severity
  if (!apologyAtStart) humanityScore -= 3; // Medium
  if (rushedTone) humanityScore -= 3; // Medium
  if (salesyTone) humanityScore -= 3; // Medium
  if (!warmClosing) humanityScore -= 2;
  // Bonus for good gratitude usage
  if (gratitudeCount >= 2) humanityScore = Math.min(20, humanityScore + 2);
  humanityScore = Math.max(0, humanityScore);

  // GENERAL INTELLIGENCE CHECK
  const intelligenceIssues: string[] = [];
  const acknowledgementPhrases = ['understood', 'i see', 'got it', 'that makes sense', 'i understand', 'okay', 'right'];
  const stackedIntentPhrases = ['but also', 'and also', 'plus', 'additionally', 'furthermore', 'moreover'];

  let acknowledgementCount = 0;
  let lastAcknowledgement = '';
  let repeatedAcknowledgement = false;
  let stackedIntents = false;
  let ignoredInput = false;
  let jumpedAhead = false;

  for (let i = 0; i  msgLower.includes(p));
    if (foundAck) {
      acknowledgementCount++;
      if (foundAck === lastAcknowledgement) {
        repeatedAcknowledgement = true;
      }
      lastAcknowledgement = foundAck;
    }

    // Check for stacked intents (multiple questions or topics in one response)
    if (questionCount > 2) {
      stackedIntents = true;
      intelligenceIssues.push(`Turn ${i + 1}: Multiple questions stacked in one response (avoid overwhelming)`);
    }
    if (stackedIntentPhrases.some(p => msgLower.includes(p)) && questionCount > 1) {
      stackedIntents = true;
    }

    // Check for jumping ahead without acknowledging user input
    if (i > 0) {
      const prevUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0];
      if (prevUserMsg) {
        const userMsgIndex = messages.indexOf(prevUserMsg);
        const agentMsgIndex = messages.indexOf(agentMessages[i]);
        // If agent message immediately follows user message without acknowledgement
        if (agentMsgIndex === userMsgIndex + 1 && !acknowledgementPhrases.some(p => msgLower.startsWith(p))) {
          // Check if user asked a question or made a statement that needs acknowledgement
          const userMadeStatement = prevUserMsg.content.length > 20 && !prevUserMsg.content.includes('?');
          if (userMadeStatement && !gratitudePhrases.some(p => msgLower.includes(p))) {
            jumpedAhead = true;
          }
        }
      }
    }
  }

  // Check for ignoring user input (no acknowledgement after user speaks)
  for (let i = 0; i  userContent.includes(p))) {
        // Agent should slow down/acknowledge
        const slowDownPhrases = ['understand', 'no problem', 'take your time', 'no rush', 'that\'s okay'];
        if (!slowDownPhrases.some(p => agentContent.includes(p))) {
          intelligenceIssues.push(`Turn ${i + 2}: User hesitated but agent didn't acknowledge or slow down`);
          ignoredInput = true;
        }
      }

      // User expressed confusion
      const confusionPhrases = ['what do you mean', 'confused', 'don\'t understand', 'what?', 'huh?'];
      if (confusionPhrases.some(p => userContent.includes(p))) {
        const clarifyPhrases = ['let me clarify', 'sorry', 'what i mean', 'to explain', 'in other words'];
        if (!clarifyPhrases.some(p => agentContent.includes(p))) {
          intelligenceIssues.push(`Turn ${i + 2}: User was confused but agent didn't clarify`);
          ignoredInput = true;
        }
      }
    }
  }

  if (repeatedAcknowledgement) {
    intelligenceIssues.push('Same acknowledgement phrase repeated consecutively (sounds robotic)');
  }
  if (acknowledgementCount === 0 && agentMessages.length > 2) {
    intelligenceIssues.push('No acknowledgement phrases used throughout conversation (lacks attentiveness)');
  }
  if (jumpedAhead) {
    intelligenceIssues.push('Agent jumped ahead without acknowledging user input (MEDIUM)');
  }

  // Calculate intelligence score (0-15)
  let intelligenceScore = 15;
  if (repeatedAcknowledgement) intelligenceScore -= 3;
  if (acknowledgementCount === 0 && agentMessages.length > 2) intelligenceScore -= 4;
  if (stackedIntents) intelligenceScore -= 3;
  if (ignoredInput) intelligenceScore -= 4;
  if (jumpedAhead) intelligenceScore -= 2;
  // Bonus for good acknowledgement rotation
  if (acknowledgementCount >= 3 && !repeatedAcknowledgement) intelligenceScore = Math.min(15, intelligenceScore + 2);
  intelligenceScore = Math.max(0, intelligenceScore);

  // Calculate scorecard
  const avgResponseLength = agentMessages.reduce((sum, m) => sum + m.content.length, 0) / (agentMessages.length || 1);
  const totalQuestions = agentMessages.reduce((sum, m) => sum + (m.content.match(/\?/g) || []).length, 0);
  const questionStacking = agentMessages.filter(m => (m.content.match(/\?/g) || []).length > 2).length;
  const objectionHandledWell = sessionMemory.objectionsDetected.filter(o => o.quality === 'good').length;
  const totalObjections = sessionMemory.objectionsDetected.length;

  // Score calculations (heuristic-based)
  const clarityScore = Math.min(20, Math.max(0, 20 - Math.floor((avgResponseLength - 150) / 30)));
  const authorityScore = agentMessages.some(m => m.content.toLowerCase().includes('we help') || m.content.toLowerCase().includes('our clients')) ? 18 : 12;
  const brevityScore = Math.min(15, Math.max(0, 15 - Math.floor((avgResponseLength - 100) / 40)));
  const questionQualityScore = Math.min(15, Math.max(0, Math.floor(totalQuestions / (agentMessages.length || 1) * 5) - questionStacking * 3));
  const objectionHandlingScore = totalObjections > 0
    ? Math.round((objectionHandledWell / totalObjections) * 15)
    : 15;
  // Voicemail violations severely impact compliance score
  const complianceScore = Math.max(0, 15 - sessionMemory.complianceSignals.length * 3 - voicemailViolations.length * 5);
  const totalScore = clarityScore + authorityScore + brevityScore + questionQualityScore + objectionHandlingScore + complianceScore + humanityScore + intelligenceScore;

  // Executive summary
  const whatWentWell: string[] = [];
  const whatHurt: string[] = [];

  if (voicemailDisciplinePassed) whatWentWell.push('Voicemail discipline maintained');
  else whatHurt.push('CRITICAL: Voicemail policy violated');

  if (humanityScore >= 16) whatWentWell.push('Warm, professional, human tone');
  else if (humanityScore = 12) whatWentWell.push('Good conversational intelligence and acknowledgement');
  else if (intelligenceScore = 15) whatWentWell.push('Clear and concise responses');
  else whatHurt.push('Responses were too verbose');

  if (questionQualityScore >= 10) whatWentWell.push('Good use of questions');
  else whatHurt.push('Question stacking or lack of discovery');

  if (objectionHandlingScore >= 10) whatWentWell.push('Effective objection handling');
  else if (totalObjections > 0) whatHurt.push('Missed or weak objection responses');

  if (complianceScore >= 12) whatWentWell.push('Professional, compliant tone');
  else whatHurt.push('Pressure tactics or assumptions detected');

  // Timeline highlights
  const timelineHighlights: TimelineHighlight[] = messages.slice(0, 10).map((m, i) => {
    let tag: TurnTag = 'good-move';
    if (m.role === 'assistant') {
      if (m.content.length > 300) tag = 'risk';
      else if ((m.content.match(/\?/g) || []).length > 2) tag = 'risk';
      else if (m.content.toLowerCase().includes('understand') && m.stage === 'objection-handling') tag = 'good-move';
      // Voicemail violation is a critical risk
      if (m.content.toLowerCase().includes('voicemail') || m.content.toLowerCase().includes('leave a message')) tag = 'risk';
    } else {
      if (m.intent === 'objecting') tag = 'risk';
      else if (m.intent === 'interested') tag = 'good-move';
      else if (m.intent === 'disengaged') tag = 'missed-opportunity';
    }

    return {
      turn: i + 1,
      role: m.role,
      summary: m.content.slice(0, 60) + (m.content.length > 60 ? '...' : ''),
      tag,
    };
  });

  // Objection review
  const detectedObjections = sessionMemory.objectionsDetected.map(o => o.objection);
  const goodHandlings = sessionMemory.objectionsDetected.filter(o => o.quality === 'good');
  const responseQuality = totalObjections > 0
    ? `${goodHandlings.length}/${totalObjections} objections handled effectively`
    : 'No objections detected';

  // Prompt improvements (heuristic suggestions)
  const promptImprovements: EvaluationReport['promptImprovements'] = [];

  // Add voicemail violation fixes first (highest priority)
  if (!voicemailDisciplinePassed) {
    promptImprovements.push({
      originalLine: 'Agent left or attempted to leave voicemail',
      replacement: 'Add instruction: "NEVER leave voicemail. If voicemail is offered, say: That\'s okay — I\'ll try again later. Thank you. Then END CALL immediately."',
      reason: 'CRITICAL: Voicemail policy must be enforced',
    });
  }

  if (avgResponseLength > 250) {
    promptImprovements.push({
      originalLine: 'Current response style is verbose',
      replacement: 'Add instruction: "Keep responses under 3 sentences. Use bullet points for lists."',
      reason: 'Improve brevity for executive-level prospects',
    });
  }
  if (questionStacking > 0) {
    promptImprovements.push({
      originalLine: 'Multiple questions per turn detected',
      replacement: 'Add instruction: "Ask ONE question per turn. Wait for answer before asking more."',
      reason: 'Prevent overwhelming the prospect',
    });
  }
  if (sessionMemory.complianceSignals.some(s => s.type === 'pressure')) {
    promptImprovements.push({
      originalLine: 'Pressure language detected',
      replacement: 'Add instruction: "Never minimize or rush. Respect their time by being direct about value."',
      reason: 'Maintain executive-grade professionalism',
    });
  }

  // Humanity improvements
  if (humanityIssues.some(i => i.includes('No gratitude after permission'))) {
    promptImprovements.push({
      originalLine: 'No gratitude when permission granted',
      replacement: 'Add instruction: "When prospect gives time or permission, always acknowledge: Thank you — I appreciate that."',
      reason: 'HUMANITY: Gratitude is mandatory after permission',
    });
  }
  if (abruptEnding) {
    promptImprovements.push({
      originalLine: 'Call ended without graceful closing',
      replacement: 'Add instruction: "End every call gracefully: Thank you for your time — I appreciate it. or Thanks again, have a great rest of your day."',
      reason: 'HUMANITY: Every call must end kindly',
    });
  }
  if (rushedTone) {
    promptImprovements.push({
      originalLine: 'Rushed/minimizing language used',
      replacement: 'Add instruction: "Never sound rushed. Avoid phrases like real quick, just a second. Be calm and respectful."',
      reason: 'HUMANITY: Sound calm, never rushed',
    });
  }
  if (salesyTone) {
    promptImprovements.push({
      originalLine: 'Overly salesy language detected',
      replacement: 'Add instruction: "Never sound overly cheerful or salesy. Be warm but professional. Avoid amazing, incredible, fantastic."',
      reason: 'HUMANITY: Professional, not salesy',
    });
  }

  // Intelligence improvements
  if (repeatedAcknowledgement) {
    promptImprovements.push({
      originalLine: 'Same acknowledgement phrase repeated',
      replacement: 'Add instruction: "Rotate acknowledgement phrases. Use variety: Understood, I see, Got it, That makes sense, Thank you."',
      reason: 'INTELLIGENCE: Acknowledgement rotation for naturalness',
    });
  }
  if (ignoredInput) {
    promptImprovements.push({
      originalLine: 'User input not acknowledged',
      replacement: 'Add instruction: "Always acknowledge user input before responding. If they hesitate, slow down. If confused, clarify."',
      reason: 'INTELLIGENCE: Never ignore what the user says',
    });
  }
  if (stackedIntents) {
    promptImprovements.push({
      originalLine: 'Multiple intents stacked in response',
      replacement: 'Add instruction: "Never stack multiple questions or topics. One intent per response. Wait for acknowledgement."',
      reason: 'INTELLIGENCE: Avoid overwhelming the user',
    });
  }
  if (acknowledgementCount === 0 && agentMessages.length > 2) {
    promptImprovements.push({
      originalLine: 'No acknowledgement phrases used',
      replacement: 'Add instruction: "Use acknowledgement fillers when appropriate: Understood, I see, Got it, That makes sense."',
      reason: 'INTELLIGENCE: Show attentiveness and presence',
    });
  }

  // Verdict - voicemail violations are automatic failure, humanity and intelligence issues affect verdict
  let verdict: 'approve' | 'needs-edits' | 'reject' = 'approve';
  if (!voicemailDisciplinePassed) verdict = 'reject'; // CRITICAL: Voicemail violation = automatic reject
  else if (humanityScore  1 || humanityScore  o.quality !== 'good')
        .map(o => `For "${o.objection}": Acknowledge first, then pivot to value`),
    },
    promptImprovements,
    recommendedPrompt: promptImprovements.length > 0
      ? `Consider adding these instructions to your prompt:\n${promptImprovements.map(p => `- ${p.replacement}`).join('\n')}`
      : 'Prompt looks good! No major changes recommended.',
    learningNotes: [
      ...whatHurt.map(h => `Improvement: ${h}`),
      ...promptImprovements.map(p => p.reason),
      ...humanityIssues,
      ...intelligenceIssues,
    ],
    voicemailDiscipline: {
      passed: voicemailDisciplinePassed,
      violations: voicemailViolations,
    },
    humanityReport: {
      score: humanityScore,
      maxScore: 20,
      passed: humanityScore >= 14,
      issues: humanityIssues,
    },
    intelligenceReport: {
      score: intelligenceScore,
      maxScore: 15,
      passed: intelligenceScore >= 10,
      issues: intelligenceIssues,
    },
  };
}

/**
 * Convert phone call transcripts to PreviewMessage format for analysis
 */
export function convertTranscriptsToMessages(
  transcripts: Array
): PreviewMessage[] {
  return transcripts.map(t => ({
    role: t.role as 'user' | 'assistant',
    content: t.content,
    timestamp: t.timestamp ? new Date(t.timestamp) : new Date(),
  }));
}

/**
 * Build session memory from transcripts (for analyzing completed calls)
 */
export function buildSessionMemoryFromTranscripts(
  transcripts: Array
): SessionMemory {
  let memory = createInitialSessionMemory();

  for (const transcript of transcripts) {
    memory = updateSessionMemory(memory, {
      role: transcript.role as 'user' | 'assistant',
      content: transcript.content,
      timestamp: new Date(),
    });
  }

  return memory;
}