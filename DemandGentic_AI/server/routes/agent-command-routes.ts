import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import { eq, desc, and } from "drizzle-orm";
import { 
  agentCommandRuns, 
  agentCommandSteps, 
  agentCommandArtifacts, 
  agentCommandInterrupts,
  createAgentRunSchema 
} from "../../shared/agent-command-center-schema";
import { 
  createRun, 
  cancelRun, 
  submitInterruptResponse, 
  getRun, 
  getRunSteps, 
  getRunEvents, 
  getPendingInterrupt,
  agentEventEmitter 
} from "../services/agent-command-runner";

const router = Router();

// Create a new run
router.post("/runs", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = createAgentRunSchema.parse(req.body);
    const result = await createRun(parsed, req.user!.userId);
    
    res.status(201).json(result);
  } catch (error: any) {
    console.error("Failed to create run:", error);
    res.status(400).json({ error: error.message });
  }
});

// Get run details
router.get("/runs/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const run = await getRun(req.params.id);
    if (!run) return res.status(404).json({ error: "Run not found" });
    
    // Check ownership
    if (run.userId !== req.user!.userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    const steps = await getRunSteps(run.id);
    const artifacts = await db.select().from(agentCommandArtifacts).where(eq(agentCommandArtifacts.runId, run.id));
    const pendingInterrupt = await getPendingInterrupt(run.id);
    
    res.json({
      run,
      steps,
      artifacts,
      pendingInterrupt
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// SSE Events
router.get("/runs/:id/events", requireAuth, async (req: Request, res: Response) => {
  const runId = req.params.id;
  const run = await getRun(runId);
  
  if (!run || run.userId !== req.user!.userId) {
    return res.status(404).end();
  }
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  
  // Send initial events if cursor provided
  const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
  if (cursor !== undefined) {
    const events = await getRunEvents(runId, cursor);
    for (const event of events) {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
  
  // Subscribe to new events
  const unsubscribe = agentEventEmitter.subscribe(runId, (event) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  
  // Heartbeat
  const interval = setInterval(() => {
    res.write(`event: run.heartbeat\n`);
    res.write(`data: {}\n\n`);
  }, 15000);
  
  req.on("close", () => {
    clearInterval(interval);
    unsubscribe();
  });
});

// Cancel run
router.post("/runs/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const run = await getRun(req.params.id);
    if (!run || run.userId !== req.user!.userId) {
      return res.status(404).json({ error: "Run not found" });
    }
    
    await cancelRun(run.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Submit interrupt response
router.post("/runs/:id/interrupts/:interruptId", requireAuth, async (req: Request, res: Response) => {
  try {
    const run = await getRun(req.params.id);
    if (!run || run.userId !== req.user!.userId) {
      return res.status(404).json({ error: "Run not found" });
    }
    
    const { response } = req.body;
    await submitInterruptResponse(run.id, req.params.interruptId, response, req.user!.userId);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;