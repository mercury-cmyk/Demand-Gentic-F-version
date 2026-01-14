/**
 * Call Analysis Types
 * Extracted from Virtual Agents for unified Preview Studio use
 */

// Conversation stage progression
export type ConversationStage = 'opening' | 'discovery' | 'qualification' | 'objection-handling' | 'closing' | 'exit';

// Turn states for conversation flow
export type TurnState = 'agent' | 'user' | 'thinking';

// User intent classification
export type UserIntent = 'interested' | 'neutral' | 'busy' | 'objecting' | 'confused' | 'disengaged';

// Issue categorization for feedback
export type IssueType = 'tone' | 'compliance' | 'clarity' | 'question' | 'objection' | 'pacing';
export type IssueSeverity = 'low' | 'medium' | 'high';

// Timeline turn tags for highlights
export type TurnTag = 'good-move' | 'missed-opportunity' | 'risk' | 'unclear';

// Preview message structure
export interface PreviewMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  stage?: ConversationStage;
  turnDuration?: number;
  intent?: UserIntent;
  tag?: TurnTag;
  feedback?: string;
}

// Session Memory - Structured conversation tracking
export interface SessionMemory {
  userGoal: string;
  prospectSignals: string[];
  agentClaims: string[];
  questionsAsked: string[];
  objectionsDetected: { objection: string; handling: string; quality: 'good' | 'weak' | 'missed' }[];
  commitments: string[];
  complianceSignals: { type: 'pressure' | 'consent' | 'dnc' | 'assumption'; message: string }[];
  unresolvedItems: string[];
}

// Operational Reasoning Panel
export interface ReasoningPanel {
  understanding: {
    currentObjective: string;
    prospectCareAbout: string;
    confidence: 'low' | 'medium' | 'high';
  };
  strategy: {
    chosenApproach: string;
    nextBestMove: string;
  };
  riskCompliance: {
    flags: ('too-pushy' | 'assumed-too-much' | 'needs-consent' | 'length-risk')[];
    toneCheck: 'executive-grade' | 'borderline' | 'needs-revision';
  };
  evidence: string[];
}

// Evaluation Report Scorecard (135-point system)
export interface EvaluationScorecard {
  clarity: number;          // 0-20
  authority: number;        // 0-20
  brevity: number;          // 0-15
  questionQuality: number;  // 0-15
  objectionHandling: number;// 0-15
  compliance: number;       // 0-15
  humanity: number;         // 0-20 - Gratitude, warmth, professional etiquette
  intelligence: number;     // 0-15 - Conversational intelligence, acknowledgement
  total: number;            // 0-135
}

// Timeline Highlight for report
export interface TimelineHighlight {
  turn: number;
  role: 'user' | 'assistant';
  summary: string;
  tag: TurnTag;
}

// Prompt improvement suggestion
export interface PromptImprovement {
  originalLine: string;
  replacement: string;
  reason: string;
}

// Full Evaluation Report
export interface EvaluationReport {
  executiveSummary: {
    whatWentWell: string[];
    whatHurtConversation: string[];
    verdict: 'approve' | 'needs-edits' | 'reject';
  };
  scorecard: EvaluationScorecard;
  timelineHighlights: TimelineHighlight[];
  objectionReview: {
    detected: string[];
    responseQuality: string;
    betterAlternatives: string[];
  };
  promptImprovements: PromptImprovement[];
  recommendedPrompt: string;
  learningNotes: string[];
  // Voicemail Discipline - CRITICAL
  voicemailDiscipline: {
    passed: boolean;
    violations: string[];
  };
  // Humanity & Professionalism Check
  humanityReport: {
    score: number;
    maxScore: number;
    passed: boolean;
    issues: string[];
  };
  // General Intelligence Check
  intelligenceReport: {
    score: number;
    maxScore: number;
    passed: boolean;
    issues: string[];
  };
}

// Conversation Analysis for real-time feedback
export interface ConversationAnalysis {
  stage: ConversationStage;
  turnGoal: string;
  confidence: number;
  userIntent: UserIntent;
  issues: string[];
  suggestions: string[];
}

// Learning Entry - Saved coaching notes
export interface LearningEntry {
  id: string;
  agentId: string;
  sessionId: string;
  issueType: IssueType;
  feedback: string;
  recommendedFix: string;
  severity: IssueSeverity;
  status: 'proposed' | 'accepted' | 'applied';
  createdAt: Date;
}
