/**
 * Vertex AI Agentic CRM Operator
 *
 * The orchestration layer for the demand generation system.
 * Coordinates between:
 * - Demand Intel Agent (research & buying signals)
 * - Demand Qual Agent (voice qualification)
 * - Demand Engage Agent (email engagement)
 *
 * Built fully on Vertex AI with:
 * - Gemini for reasoning and decisions
 * - Function calling for agent actions
 * - Vector search for knowledge retrieval
 * - Learning loop for continuous improvement
 */

import { EventEmitter } from "events";
import {
  chat,
  generateJSON,
  reason,
  generateWithFunctions,
  generateEmbedding,
  type ChatMessage,
  type FunctionDeclaration,
} from "./vertex-client";
import {
  generateVertexMasterPrompt,
  analyzeCallOutcome,
  type VertexAgentCreationInput,
} from "./vertex-agent-brain";
import { db } from "../../db";
import { accounts, contacts, campaigns, campaignQueue } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";

// ==================== TYPES ====================

export interface AgentTask {
  id: string;
  type: "intel" | "qual" | "engage";
  status: "pending" | "running" | "completed" | "failed";
  priority: "low" | "medium" | "high" | "urgent";
  accountId: string;
  contactId?: string;
  campaignId?: string;
  input: Record<string, any>;
  output?: Record<string, any>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface AccountIntelligence {
  accountId: string;
  companyName: string;
  industry: string;
  size: string;
  buyingSignals: BuyingSignal[];
  painHypotheses: PainHypothesis[];
  stakeholderMap: Stakeholder[];
  recommendedApproach: string;
  confidenceScore: number;
  lastUpdated: Date;
}

export interface BuyingSignal {
  type: "leadership_change" | "funding" | "expansion" | "product_launch" | "regulatory" | "competitive" | "tech_stack";
  signal: string;
  source: string;
  confidence: number;
  detectedAt: Date;
}

export interface PainHypothesis {
  pain: string;
  evidence: string[];
  relevance: number;
  approach: string;
}

export interface Stakeholder {
  contactId?: string;
  name: string;
  title: string;
  role: "decision_maker" | "influencer" | "champion" | "blocker" | "user";
  engagementStatus: "not_contacted" | "contacted" | "engaged" | "qualified" | "disqualified";
}

export interface QualificationResult {
  contactId: string;
  accountId: string;
  bantScores: {
    budget: number;
    authority: number;
    need: number;
    timeframe: number;
  };
  overallScore: number;
  isQualified: boolean;
  disposition: string;
  nextAction: string;
  notes: string;
}

export interface EngagementPlan {
  contactId: string;
  accountId: string;
  sequenceType: "cold" | "warm" | "reengagement";
  personalizationLevel: 1 | 2 | 3;
  emails: EmailTouch[];
  startDate: Date;
  status: "draft" | "scheduled" | "active" | "completed" | "paused";
}

export interface EmailTouch {
  order: number;
  subject: string;
  body: string;
  sendDelay: number; // days after previous
  personalizationTokens: string[];
}

// ==================== AGENTIC OPERATOR CLASS ====================

export class VertexAgenticOperator extends EventEmitter {
  private taskQueue: AgentTask[] = [];
  private isRunning: boolean = false;
  private concurrency: number = 5;
  private activeTasks: Map<string, Promise<void>> = new Map();

  constructor(options?: { concurrency?: number }) {
    super();
    this.concurrency = options?.concurrency || 5;
  }

  // ==================== TASK MANAGEMENT ====================

  /**
   * Add a task to the queue
   */
  async enqueueTask(task: Omit<AgentTask, "id" | "status" | "createdAt">): Promise<string> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullTask: AgentTask = {
      ...task,
      id: taskId,
      status: "pending",
      createdAt: new Date(),
    };

    this.taskQueue.push(fullTask);
    this.emit("task:enqueued", fullTask);

    // Auto-start processing if not already running
    if (!this.isRunning) {
      this.startProcessing();
    }

    return taskId;
  }

  /**
   * Start processing the task queue
   */
  async startProcessing(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit("operator:started");

    while (this.isRunning && this.taskQueue.length > 0) {
      // Get available slots
      const availableSlots = this.concurrency - this.activeTasks.size;
      if (availableSlots <= 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // Get next tasks by priority
      const pendingTasks = this.taskQueue
        .filter(t => t.status === "pending")
        .sort((a, b) => {
          const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        })
        .slice(0, availableSlots);

      for (const task of pendingTasks) {
        const taskPromise = this.executeTask(task);
        this.activeTasks.set(task.id, taskPromise);

        taskPromise.finally(() => {
          this.activeTasks.delete(task.id);
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isRunning = false;
    this.emit("operator:stopped");
  }

  /**
   * Stop processing
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: AgentTask): Promise<void> {
    task.status = "running";
    task.startedAt = new Date();
    this.emit("task:started", task);

    try {
      let output: Record<string, any>;

      switch (task.type) {
        case "intel":
          output = await this.runIntelAgent(task);
          break;
        case "qual":
          output = await this.runQualAgent(task);
          break;
        case "engage":
          output = await this.runEngageAgent(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      task.status = "completed";
      task.output = output;
      task.completedAt = new Date();
      this.emit("task:completed", task);
    } catch (error: any) {
      task.status = "failed";
      task.error = error.message;
      task.completedAt = new Date();
      this.emit("task:failed", task, error);
    }
  }

  // ==================== INTEL AGENT ====================

  /**
   * Run the Intel Agent for account research
   */
  private async runIntelAgent(task: AgentTask): Promise<AccountIntelligence> {
    const { accountId, input } = task;

    // Fetch account data
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const prompt = `You are a B2B demand intelligence analyst. Research this account and identify buying signals.

ACCOUNT INFORMATION:
- Company: ${account.name}
- Domain: ${account.domain || "Unknown"}
- Industry: ${account.industry || "Unknown"}
- Size: ${account.employeeCount || "Unknown"} employees
- Revenue: ${account.revenueRange || "Unknown"}
- Location: ${account.hqCity || ""}, ${account.hqCountry || "Unknown"}

${input.researchContext ? `RESEARCH CONTEXT:\n${input.researchContext}\n` : ""}

ANALYSIS TASKS:
1. Identify buying signals from available information
2. Develop pain hypotheses based on industry and company profile
3. Map potential stakeholders by role
4. Recommend engagement approach
5. Provide confidence score for findings

Return JSON:
{
  "buyingSignals": [
    {
      "type": "leadership_change|funding|expansion|product_launch|regulatory|competitive|tech_stack",
      "signal": "description of the signal",
      "source": "where this was detected",
      "confidence": 0.0 to 1.0
    }
  ],
  "painHypotheses": [
    {
      "pain": "the pain point",
      "evidence": ["supporting evidence"],
      "relevance": 0.0 to 1.0,
      "approach": "how to position our solution"
    }
  ],
  "stakeholderMap": [
    {
      "name": "if known",
      "title": "typical title for this role",
      "role": "decision_maker|influencer|champion|blocker|user"
    }
  ],
  "recommendedApproach": "overall recommendation for engaging this account",
  "confidenceScore": 0.0 to 1.0
}`;

    // Use reasoning model for complex analysis
    const { thinking, answer } = await reason(prompt);

    try {
      const result = JSON.parse(answer);

      return {
        accountId,
        companyName: account.name,
        industry: account.industry || "Unknown",
        size: account.employeeCount?.toString() || "Unknown",
        buyingSignals: result.buyingSignals.map((s: any) => ({
          ...s,
          detectedAt: new Date(),
        })),
        painHypotheses: result.painHypotheses,
        stakeholderMap: result.stakeholderMap.map((s: any) => ({
          ...s,
          engagementStatus: "not_contacted",
        })),
        recommendedApproach: result.recommendedApproach,
        confidenceScore: result.confidenceScore,
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error("[IntelAgent] Failed to parse result:", error);
      throw new Error("Failed to analyze account intelligence");
    }
  }

  // ==================== QUAL AGENT ====================

  /**
   * Run the Qual Agent for lead qualification
   */
  private async runQualAgent(task: AgentTask): Promise<QualificationResult> {
    const { accountId, contactId, input } = task;

    if (!contactId) {
      throw new Error("Contact ID required for qualification");
    }

    // Fetch contact and account data
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!contact || !account) {
      throw new Error("Contact or account not found");
    }

    // Generate qualification prompt
    const prompt = `You are a B2B sales qualification specialist. Analyze this contact for BANT qualification.

CONTACT INFORMATION:
- Name: ${contact.firstName} ${contact.lastName}
- Title: ${contact.title || "Unknown"}
- Company: ${account.name}
- Industry: ${account.industry || "Unknown"}

${input.callTranscript ? `CALL TRANSCRIPT:\n${input.callTranscript}\n` : ""}
${input.conversationNotes ? `NOTES:\n${input.conversationNotes}\n` : ""}
${input.intelligence ? `ACCOUNT INTELLIGENCE:\n${JSON.stringify(input.intelligence, null, 2)}\n` : ""}

QUALIFICATION FRAMEWORK (BANT):
- Budget: Does the prospect have budget for this solution?
- Authority: Is this the decision maker or can they influence the decision?
- Need: Is there a clear business need that our solution addresses?
- Timeframe: Is there urgency or a defined timeline for implementation?

Score each dimension 0-100 and qualify if 3/4 dimensions score >= 60.

Return JSON:
{
  "bantScores": {
    "budget": 0-100,
    "authority": 0-100,
    "need": 0-100,
    "timeframe": 0-100
  },
  "overallScore": 0-100,
  "isQualified": true/false,
  "disposition": "qualified_lead|not_interested|callback_requested|nurture|disqualified",
  "nextAction": "recommended next step",
  "notes": "qualification notes and reasoning"
}`;

    const result = await generateJSON<{
      bantScores: { budget: number; authority: number; need: number; timeframe: number };
      overallScore: number;
      isQualified: boolean;
      disposition: string;
      nextAction: string;
      notes: string;
    }>(prompt, { temperature: 0.2 });

    return {
      contactId,
      accountId,
      ...result,
    };
  }

  // ==================== ENGAGE AGENT ====================

  /**
   * Run the Engage Agent for email sequence generation
   */
  private async runEngageAgent(task: AgentTask): Promise<EngagementPlan> {
    const { accountId, contactId, input } = task;

    if (!contactId) {
      throw new Error("Contact ID required for engagement");
    }

    // Fetch contact and account data
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!contact || !account) {
      throw new Error("Contact or account not found");
    }

    const sequenceType = input.sequenceType || "cold";
    const personalizationLevel = input.personalizationLevel || 2;
    const touchCount = sequenceType === "cold" ? 7 : sequenceType === "warm" ? 5 : 4;

    const prompt = `You are a B2B email engagement specialist. Create a personalized email sequence.

CONTACT INFORMATION:
- Name: ${contact.firstName} ${contact.lastName}
- Title: ${contact.title || "Unknown"}
- Company: ${account.name}
- Industry: ${account.industry || "Unknown"}

${input.intelligence ? `ACCOUNT INTELLIGENCE:\n${JSON.stringify(input.intelligence, null, 2)}\n` : ""}
${input.orgContext ? `OUR COMPANY CONTEXT:\n${input.orgContext}\n` : ""}

SEQUENCE PARAMETERS:
- Type: ${sequenceType}
- Personalization Level: ${personalizationLevel} (1=basic, 2=contextual, 3=deep)
- Number of Touches: ${touchCount}

EMAIL BEST PRACTICES:
- Subject lines: 40-60 chars, lowercase start, no spam triggers
- Body: 50-125 words, short paragraphs, one clear CTA
- Vary angles across the sequence
- Each email should stand alone but build on previous
- Include personalization tokens for runtime interpolation

Return JSON:
{
  "emails": [
    {
      "order": 1,
      "subject": "subject line with {{tokens}}",
      "body": "email body with {{firstName}}, {{companyName}} tokens",
      "sendDelay": 0 (days after previous, 0 for first email),
      "personalizationTokens": ["tokens used in this email"]
    }
  ]
}`;

    const result = await generateJSON<{
      emails: EmailTouch[];
    }>(prompt, { temperature: 0.6 });

    return {
      contactId,
      accountId,
      sequenceType: sequenceType as "cold" | "warm" | "reengagement",
      personalizationLevel: personalizationLevel as 1 | 2 | 3,
      emails: result.emails,
      startDate: new Date(),
      status: "draft",
    };
  }

  // ==================== ORCHESTRATION ====================

  /**
   * Run full demand generation workflow for an account
   */
  async runDemandWorkflow(
    accountId: string,
    options: {
      campaignId?: string;
      skipIntel?: boolean;
      contactIds?: string[];
      sequenceType?: "cold" | "warm" | "reengagement";
    } = {}
  ): Promise<{
    intelTask?: AgentTask;
    qualTasks: AgentTask[];
    engageTasks: AgentTask[];
  }> {
    const results: {
      intelTask?: AgentTask;
      qualTasks: AgentTask[];
      engageTasks: AgentTask[];
    } = {
      qualTasks: [],
      engageTasks: [],
    };

    // Step 1: Run Intel Agent (unless skipped)
    let intelligence: AccountIntelligence | undefined;
    if (!options.skipIntel) {
      const intelTaskId = await this.enqueueTask({
        type: "intel",
        priority: "high",
        accountId,
        campaignId: options.campaignId,
        input: {},
      });

      // Wait for intel task
      const intelTask = await this.waitForTask(intelTaskId);
      results.intelTask = intelTask;

      if (intelTask.status === "completed") {
        intelligence = intelTask.output as AccountIntelligence;
      }
    }

    // Step 2: Get contacts to process
    let contactIds = options.contactIds;
    if (!contactIds || contactIds.length === 0) {
      const accountContacts = await db
        .select()
        .from(contacts)
        .where(eq(contacts.accountId, accountId))
        .limit(10);
      contactIds = accountContacts.map(c => c.id);
    }

    // Step 3: Queue Qual and Engage tasks for each contact
    for (const contactId of contactIds) {
      // Qual task
      const qualTaskId = await this.enqueueTask({
        type: "qual",
        priority: "medium",
        accountId,
        contactId,
        campaignId: options.campaignId,
        input: {
          intelligence,
        },
      });

      // Engage task
      const engageTaskId = await this.enqueueTask({
        type: "engage",
        priority: "low",
        accountId,
        contactId,
        campaignId: options.campaignId,
        input: {
          intelligence,
          sequenceType: options.sequenceType || "cold",
          personalizationLevel: 2,
        },
      });

      // Track tasks
      const qualTask = this.taskQueue.find(t => t.id === qualTaskId);
      const engageTask = this.taskQueue.find(t => t.id === engageTaskId);

      if (qualTask) results.qualTasks.push(qualTask);
      if (engageTask) results.engageTasks.push(engageTask);
    }

    return results;
  }

  /**
   * Wait for a task to complete
   */
  async waitForTask(taskId: string, timeoutMs: number = 60000): Promise<AgentTask> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const task = this.taskQueue.find(t => t.id === taskId);

      if (task && (task.status === "completed" || task.status === "failed")) {
        return task;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Task ${taskId} timed out`);
  }

  /**
   * Get task status
   */
  getTask(taskId: string): AgentTask | undefined {
    return this.taskQueue.find(t => t.id === taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): AgentTask[] {
    return [...this.taskQueue];
  }

  /**
   * Get pending task count
   */
  getPendingCount(): number {
    return this.taskQueue.filter(t => t.status === "pending").length;
  }

  /**
   * Clear completed tasks
   */
  clearCompleted(): void {
    this.taskQueue = this.taskQueue.filter(t => t.status !== "completed" && t.status !== "failed");
  }
}

// ==================== SINGLETON INSTANCE ====================

let operatorInstance: VertexAgenticOperator | null = null;

export function getAgenticOperator(options?: { concurrency?: number }): VertexAgenticOperator {
  if (!operatorInstance) {
    operatorInstance = new VertexAgenticOperator(options);
  }
  return operatorInstance;
}

export default {
  VertexAgenticOperator,
  getAgenticOperator,
};
