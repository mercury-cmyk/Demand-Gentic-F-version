import { Router, Request, Response } from "express";
import { db } from "../db";
import { verificationUploadJobs, verificationCampaigns } from "@shared/schema";
import { eq } from "drizzle-orm";
import { processUpload } from "../services/upload-processor";
import { requireAuth } from "../auth";

const router = Router();

router.post("/api/verification-upload-jobs", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId, csvData, fieldMappings, updateMode } = req.body;

    if (!csvData) {
      return res.status(400).json({ error: "csvData is required" });
    }

    if (!campaignId) {
      return res.status(400).json({ error: "campaignId is required" });
    }

    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const userId = (req as any).user?.id || (req as any).user?.userId || null;

    const [uploadJob] = await db
      .insert(verificationUploadJobs)
      .values({
        campaignId,
        jobType: 'contacts', // Correct enum value from schema
        csvData,
        fieldMappings: fieldMappings || null,
        updateMode: updateMode || false,
        status: 'pending',
        totalRows: 0,
        processedRows: 0,
        successCount: 0,
        errorCount: 0,
        errors: [],
        createdBy: userId,
      })
      .returning();

    setImmediate(() => {
      processUpload(uploadJob.id).catch(error => {
        console.error(`[Upload Job] Failed to process upload job ${uploadJob.id}:`, error);
      });
    });

    return res.json({
      jobId: uploadJob.id,
      status: uploadJob.status,
    });
  } catch (error: any) {
    console.error("Error creating upload job:", error);
    return res.status(500).json({
      error: "Failed to create upload job",
      details: error.message,
    });
  }
});

router.get("/api/verification-upload-jobs/:jobId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const [uploadJob] = await db
      .select()
      .from(verificationUploadJobs)
      .where(eq(verificationUploadJobs.id, jobId));

    if (!uploadJob) {
      return res.status(404).json({ error: "Upload job not found" });
    }

    const progress = uploadJob.totalRows > 0
      ? Math.floor((uploadJob.processedRows / uploadJob.totalRows) * 100)
      : 0;

    return res.json({
      id: uploadJob.id,
      campaignId: uploadJob.campaignId,
      status: uploadJob.status,
      totalRows: uploadJob.totalRows,
      processedRows: uploadJob.processedRows,
      successCount: uploadJob.successCount,
      errorCount: uploadJob.errorCount,
      errors: uploadJob.errors || [],
      progress,
      startedAt: uploadJob.startedAt,
      finishedAt: uploadJob.finishedAt,
      createdAt: uploadJob.createdAt,
    });
  } catch (error: any) {
    console.error("Error fetching upload job:", error);
    return res.status(500).json({
      error: "Failed to fetch upload job",
      details: error.message,
    });
  }
});

export default router;
