import { Router } from "express";
import { analyzeSpamRisk } from "../utils/spam-analysis";
import { requireAuth } from "../auth";

const router = Router();

/**
 * @route POST /api/campaigns/analyze-spam
 * @desc Run heuristic spam analysis on email copy
 */
router.post("/analyze-spam", requireAuth, async (req, res) => {
  try {
    const { subject, html } = req.body;

    if (!subject && !html) {
      return res.status(400).json({ message: "Missing content to analyze" });
    }

    const analysis = analyzeSpamRisk(subject || "", html || "");
    res.json(analysis);
  } catch (error: any) {
    console.error("[Campaigns] Spam analysis error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;