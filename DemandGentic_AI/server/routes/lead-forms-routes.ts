import { Router } from "express";
import { db } from "../db";
import { 
  leadForms,
  leadFormSubmissions,
  pipelineOpportunities,
  pipelines,
  accounts,
  contacts,
  users,
  insertLeadFormSchema,
  insertLeadFormSubmissionSchema,
  type LeadForm,
  type LeadFormSubmission
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../auth";
import { fromZodError } from "zod-validation-error";
import crypto from "crypto";
import { z } from "zod";

const router = Router();

// ==================== Lead Forms Routes ====================

// List all lead forms
router.get("/api/lead-forms", requireAuth, async (req, res) => {
  try {
    const forms = await db
      .select({
        id: leadForms.id,
        name: leadForms.name,
        formType: leadForms.formType,
        pipelineId: leadForms.pipelineId,
        pipelineName: pipelines.name,
        initialStage: leadForms.initialStage,
        isActive: leadForms.isActive,
        assetUrl: leadForms.assetUrl,
        autoAssignToUserId: leadForms.autoAssignToUserId,
        webhookUrl: leadForms.webhookUrl,
        formConfig: leadForms.formConfig,
        createdAt: leadForms.createdAt,
        updatedAt: leadForms.updatedAt,
      })
      .from(leadForms)
      .leftJoin(pipelines, eq(leadForms.pipelineId, pipelines.id))
      .orderBy(desc(leadForms.createdAt));

    res.json(forms);
  } catch (error: any) {
    console.error("[Lead Forms] Error listing:", error);
    res.status(500).json({ error: "Failed to list lead forms" });
  }
});

// Get single lead form
router.get("/api/lead-forms/:id", requireAuth, async (req, res) => {
  try {
    const [form] = await db
      .select({
        id: leadForms.id,
        name: leadForms.name,
        formType: leadForms.formType,
        pipelineId: leadForms.pipelineId,
        pipelineName: pipelines.name,
        initialStage: leadForms.initialStage,
        isActive: leadForms.isActive,
        assetUrl: leadForms.assetUrl,
        autoAssignToUserId: leadForms.autoAssignToUserId,
        webhookUrl: leadForms.webhookUrl,
        thankYouMessage: leadForms.thankYouMessage,
        formConfig: leadForms.formConfig,
        createdAt: leadForms.createdAt,
        updatedAt: leadForms.updatedAt,
      })
      .from(leadForms)
      .leftJoin(pipelines, eq(leadForms.pipelineId, pipelines.id))
      .where(eq(leadForms.id, req.params.id))
      .limit(1);

    if (!form) {
      return res.status(404).json({ error: "Lead form not found" });
    }

    res.json(form);
  } catch (error: any) {
    console.error("[Lead Forms] Error getting form:", error);
    res.status(500).json({ error: "Failed to get lead form" });
  }
});

// Create lead form
router.post("/api/lead-forms", requireAuth, async (req, res) => {
  try {
    const validationResult = insertLeadFormSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      const validationError = fromZodError(validationResult.error);
      return res.status(400).json({ 
        message: "Validation failed",
        errors: validationResult.error.errors 
      });
    }

    // Verify pipeline exists
    const [pipeline] = await db
      .select()
      .from(pipelines)
      .where(eq(pipelines.id, validationResult.data.pipelineId))
      .limit(1);

    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }

    // Verify initial stage exists in pipeline
    if (!pipeline.stageOrder.includes(validationResult.data.initialStage)) {
      return res.status(400).json({ 
        error: `Stage "${validationResult.data.initialStage}" not found in pipeline. Available stages: ${pipeline.stageOrder.join(', ')}` 
      });
    }

    const [form] = await db
      .insert(leadForms)
      .values(validationResult.data as any)
      .returning();

    res.json(form);
  } catch (error: any) {
    console.error("[Lead Forms] Error creating:", error);
    res.status(500).json({ error: "Failed to create lead form" });
  }
});

// Update lead form
router.put("/api/lead-forms/:id", requireAuth, async (req, res) => {
  try {
    const { id, createdAt, updatedAt, ...updateData } = req.body;

    // If pipelineId is being updated, verify it exists
    if (updateData.pipelineId) {
      const [pipeline] = await db
        .select()
        .from(pipelines)
        .where(eq(pipelines.id, updateData.pipelineId))
        .limit(1);

      if (!pipeline) {
        return res.status(404).json({ error: "Pipeline not found" });
      }

      // Verify initial stage if provided
      if (updateData.initialStage && !pipeline.stageOrder.includes(updateData.initialStage)) {
        return res.status(400).json({ 
          error: `Stage "${updateData.initialStage}" not found in pipeline` 
        });
      }
    }

    const [form] = await db
      .update(leadForms)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(leadForms.id, req.params.id))
      .returning();

    if (!form) {
      return res.status(404).json({ error: "Lead form not found" });
    }

    res.json(form);
  } catch (error: any) {
    console.error("[Lead Forms] Error updating:", error);
    res.status(500).json({ error: "Failed to update lead form" });
  }
});

// Delete lead form
router.delete("/api/lead-forms/:id", requireAuth, async (req, res) => {
  try {
    const [form] = await db
      .delete(leadForms)
      .where(eq(leadForms.id, req.params.id))
      .returning();

    if (!form) {
      return res.status(404).json({ error: "Lead form not found" });
    }

    res.json({ success: true, message: "Lead form deleted successfully" });
  } catch (error: any) {
    console.error("[Lead Forms] Error deleting:", error);
    res.status(500).json({ error: "Failed to delete lead form" });
  }
});

// Get submissions for a specific lead form
router.get("/api/lead-forms/:id/submissions", requireAuth, async (req, res) => {
  try {
    const submissions = await db
      .select({
        id: leadFormSubmissions.id,
        formId: leadFormSubmissions.formId,
        opportunityId: leadFormSubmissions.opportunityId,
        opportunityName: pipelineOpportunities.name,
        submitterEmail: leadFormSubmissions.submitterEmail,
        submitterName: leadFormSubmissions.submitterName,
        companyName: leadFormSubmissions.companyName,
        jobTitle: leadFormSubmissions.jobTitle,
        formData: leadFormSubmissions.formData,
        processed: leadFormSubmissions.processed,
        createdAt: leadFormSubmissions.createdAt,
      })
      .from(leadFormSubmissions)
      .leftJoin(pipelineOpportunities, eq(leadFormSubmissions.opportunityId, pipelineOpportunities.id))
      .where(eq(leadFormSubmissions.formId, req.params.id))
      .orderBy(desc(leadFormSubmissions.createdAt));

    res.json(submissions);
  } catch (error: any) {
    console.error("[Lead Forms] Error listing submissions:", error);
    res.status(500).json({ error: "Failed to list submissions" });
  }
});

// ==================== Lead Form Submissions Routes ====================

// Public form submission endpoint (no auth required)
router.post("/api/public/lead-forms/:id/submit", async (req, res) => {
  try {
    // Get form and verify it's active
    const [form] = await db
      .select()
      .from(leadForms)
      .where(eq(leadForms.id, req.params.id))
      .limit(1);

    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    if (!form.isActive) {
      return res.status(403).json({ error: "This form is no longer accepting submissions" });
    }

    // Validate required fields from formConfig
    const submissionData = req.body;
    const requiredFields = form.formConfig?.fields?.filter(f => f.required) || [];
    
    for (const field of requiredFields) {
      if (!submissionData[field.name]) {
        return res.status(400).json({ 
          error: `Missing required field: ${field.name}` 
        });
      }
    }

    // Extract common fields
    const submitterEmail = submissionData.email || submissionData.submitterEmail;
    const submitterName = submissionData.name || submissionData.submitterName;
    const companyName = submissionData.company || submissionData.companyName;
    const jobTitle = submissionData.jobTitle || submissionData.title;

    if (!submitterEmail) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Create submission record
    const [submission] = await db
      .insert(leadFormSubmissions)
      .values({
        formId: form.id,
        submitterEmail,
        submitterName: submitterName || null,
        companyName: companyName || null,
        jobTitle: jobTitle || null,
        formData: submissionData,
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
        sourceUrl: submissionData.sourceUrl || req.headers.referer || null,
        processed: false, // Background worker will process and create opportunity
      } as any)
      .returning();

    // Return thank you message
    res.json({
      success: true,
      message: form.thankYouMessage || "Thank you for your submission! We'll be in touch soon.",
      assetUrl: form.assetUrl, // For lead magnets (ebooks, whitepapers, etc.)
      submissionId: submission.id,
    });
  } catch (error: any) {
    console.error("[Lead Forms] Error submitting form:", error);
    res.status(500).json({ error: "Failed to submit form" });
  }
});

// Get submissions for a specific opportunity
router.get("/api/opportunities/:id/submissions", requireAuth, async (req, res) => {
  try {
    const submissions = await db
      .select({
        id: leadFormSubmissions.id,
        formId: leadFormSubmissions.formId,
        formName: leadForms.name,
        submitterEmail: leadFormSubmissions.submitterEmail,
        submitterName: leadFormSubmissions.submitterName,
        companyName: leadFormSubmissions.companyName,
        jobTitle: leadFormSubmissions.jobTitle,
        formData: leadFormSubmissions.formData,
        processed: leadFormSubmissions.processed,
        createdAt: leadFormSubmissions.createdAt,
      })
      .from(leadFormSubmissions)
      .leftJoin(leadForms, eq(leadFormSubmissions.formId, leadForms.id))
      .where(eq(leadFormSubmissions.opportunityId, req.params.id))
      .orderBy(desc(leadFormSubmissions.createdAt));

    res.json(submissions);
  } catch (error: any) {
    console.error("[Lead Forms] Error getting opportunity submissions:", error);
    res.status(500).json({ error: "Failed to get submissions" });
  }
});

export default router;