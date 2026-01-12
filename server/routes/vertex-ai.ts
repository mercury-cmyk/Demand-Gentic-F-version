/**
 * Vertex AI API Routes
 *
 * Exposes Vertex AI capabilities via REST API endpoints.
 */

import { Router, Request, Response } from "express";
import {
  initializeVertexAI,
  getVertexStatus,
  healthCheck,
  generateText,
  generateJSON,
  chat,
  reason,
  generateVertexMasterPrompt,
  determineDisposition,
  summarizeCall,
  handleObjection,
  getAgenticOperator,
  indexAccounts,
  indexContacts,
  indexCallTranscripts,
  findSimilarAccounts,
  findSimilarContacts,
  searchCallPatterns,
  searchKnowledge,
  addKnowledge,
  getVectorStats,
  type VertexAgentCreationInput,
  type ChatMessage,
} from "../services/vertex-ai";
import { getOrganizationBrain } from "../services/agent-brain-service";

const router = Router();

// ==================== HEALTH & STATUS ====================

/**
 * GET /api/vertex-ai/health
 * Check Vertex AI service health
 */
router.get("/health", async (req: Request, res: Response) => {
  try {
    const health = await healthCheck();
    res.json(health);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/vertex-ai/status
 * Get comprehensive service status
 */
router.get("/status", async (req: Request, res: Response) => {
  try {
    const status = await getVertexStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/initialize
 * Initialize Vertex AI services
 */
router.post("/initialize", async (req: Request, res: Response) => {
  try {
    const { indexData, startOperator } = req.body;
    const result = await initializeVertexAI({ indexData, startOperator });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== GENERATION ====================

/**
 * POST /api/vertex-ai/generate
 * Generate text completion
 */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { prompt, options } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const result = await generateText(prompt, options || {});
    res.json({ result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/generate-json
 * Generate structured JSON output
 */
router.post("/generate-json", async (req: Request, res: Response) => {
  try {
    const { prompt, options } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const result = await generateJSON(prompt, options || {});
    res.json({ result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/chat
 * Multi-turn chat completion
 */
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { systemPrompt, messages, options } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    const result = await chat(systemPrompt || "", messages, options || {});
    res.json({ result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/reason
 * Complex reasoning with thinking model
 */
router.post("/reason", async (req: Request, res: Response) => {
  try {
    const { prompt, options } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const result = await reason(prompt, options || {});
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== AGENT BRAIN ====================

/**
 * POST /api/vertex-ai/agent/generate-prompt
 * Generate master agent prompt
 */
router.post("/agent/generate-prompt", async (req: Request, res: Response) => {
  try {
    const input: VertexAgentCreationInput = req.body;

    if (!input.taskDescription || !input.firstMessage) {
      return res.status(400).json({
        error: "taskDescription and firstMessage are required",
      });
    }

    const result = await generateVertexMasterPrompt(input);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/agent/determine-disposition
 * Determine call disposition from transcript
 */
router.post("/agent/determine-disposition", async (req: Request, res: Response) => {
  try {
    const { transcript, contactName, companyName } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: "Transcript is required" });
    }

    const result = await determineDisposition(transcript, {
      contactName: contactName || "Unknown",
      companyName: companyName || "Unknown",
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/agent/summarize-call
 * Generate call summary
 */
router.post("/agent/summarize-call", async (req: Request, res: Response) => {
  try {
    const { transcript, contactName, companyName, disposition } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: "Transcript is required" });
    }

    const result = await summarizeCall(transcript, {
      contactName: contactName || "Unknown",
      companyName: companyName || "Unknown",
      disposition: disposition || "unknown",
    });
    res.json({ summary: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/agent/handle-objection
 * Generate objection response
 */
router.post("/agent/handle-objection", async (req: Request, res: Response) => {
  try {
    const { objection, contactName, companyName, conversationHistory } = req.body;

    if (!objection) {
      return res.status(400).json({ error: "Objection is required" });
    }

    const orgBrain = await getOrganizationBrain();

    const result = await handleObjection(objection, {
      contactName: contactName || "Unknown",
      companyName: companyName || "Unknown",
      conversationHistory: conversationHistory || [],
      orgBrain,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== AGENTIC OPERATOR ====================

/**
 * POST /api/vertex-ai/operator/enqueue
 * Enqueue a task for the agentic operator
 */
router.post("/operator/enqueue", async (req: Request, res: Response) => {
  try {
    const { type, priority, accountId, contactId, campaignId, input } = req.body;

    if (!type || !accountId) {
      return res.status(400).json({ error: "type and accountId are required" });
    }

    const operator = getAgenticOperator();
    const taskId = await operator.enqueueTask({
      type,
      priority: priority || "medium",
      accountId,
      contactId,
      campaignId,
      input: input || {},
    });

    res.json({ taskId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/vertex-ai/operator/task/:taskId
 * Get task status
 */
router.get("/operator/task/:taskId", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const operator = getAgenticOperator();
    const task = operator.getTask(taskId);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/vertex-ai/operator/tasks
 * Get all tasks
 */
router.get("/operator/tasks", async (req: Request, res: Response) => {
  try {
    const operator = getAgenticOperator();
    const tasks = operator.getAllTasks();
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/operator/workflow
 * Run full demand generation workflow
 */
router.post("/operator/workflow", async (req: Request, res: Response) => {
  try {
    const { accountId, campaignId, skipIntel, contactIds, sequenceType } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const operator = getAgenticOperator();
    const result = await operator.runDemandWorkflow(accountId, {
      campaignId,
      skipIntel,
      contactIds,
      sequenceType,
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/operator/start
 * Start the operator
 */
router.post("/operator/start", async (req: Request, res: Response) => {
  try {
    const operator = getAgenticOperator();
    operator.startProcessing();
    res.json({ status: "started" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/operator/stop
 * Stop the operator
 */
router.post("/operator/stop", async (req: Request, res: Response) => {
  try {
    const operator = getAgenticOperator();
    operator.stop();
    res.json({ status: "stopped" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== VECTOR SEARCH ====================

/**
 * POST /api/vertex-ai/vector/index
 * Index data for vector search
 */
router.post("/vector/index", async (req: Request, res: Response) => {
  try {
    const { type, ids, limit } = req.body;

    let count = 0;
    switch (type) {
      case "accounts":
        count = await indexAccounts(ids);
        break;
      case "contacts":
        count = await indexContacts(ids);
        break;
      case "calls":
        count = await indexCallTranscripts(limit || 100);
        break;
      default:
        return res.status(400).json({ error: "Invalid type. Use: accounts, contacts, or calls" });
    }

    res.json({ indexed: count, type });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/vector/search
 * Search vectors
 */
router.post("/vector/search", async (req: Request, res: Response) => {
  try {
    const { type, query, limit, filter } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    let results;
    switch (type) {
      case "accounts":
        results = await findSimilarAccounts(query, { limit, industryFilter: filter?.industry });
        break;
      case "contacts":
        results = await findSimilarContacts(query, { limit, accountId: filter?.accountId });
        break;
      case "calls":
        results = await searchCallPatterns(query, { limit, dispositionFilter: filter?.disposition });
        break;
      case "knowledge":
        results = await searchKnowledge(query, { limit });
        break;
      default:
        return res.status(400).json({ error: "Invalid type. Use: accounts, contacts, calls, or knowledge" });
    }

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vertex-ai/vector/knowledge
 * Add knowledge document
 */
router.post("/vector/knowledge", async (req: Request, res: Response) => {
  try {
    const { id, content, metadata } = req.body;

    if (!id || !content) {
      return res.status(400).json({ error: "id and content are required" });
    }

    const doc = await addKnowledge(id, content, metadata || {});
    res.json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/vertex-ai/vector/stats
 * Get vector index stats
 */
router.get("/vector/stats", async (req: Request, res: Response) => {
  try {
    const stats = getVectorStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
