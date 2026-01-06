
import { Router } from "express";
import { db } from "../db";
import { 
  pipelines, 
  pipelineOpportunities, 
  accounts, 
  contacts,
  users, 
  insertPipelineSchema,
  pipelineBulkImportSchema,
  type PipelineImportRow
} from "@shared/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { fromZodError } from "zod-validation-error";
import crypto from "crypto";
import { normalizeName } from "../normalization";

const router = Router();

// List pipelines
router.get("/api/pipelines", requireAuth, async (req, res) => {
  try {
    const results = await db.select().from(pipelines).orderBy(pipelines.createdAt);
    res.json(results);
  } catch (error: any) {
    console.error("[Pipelines] Error listing:", error);
    res.status(500).json({ error: "Failed to list pipelines" });
  }
});

// Get single pipeline
router.get("/api/pipelines/:id", requireAuth, async (req, res) => {
  try {
    const [pipeline] = await db
      .select()
      .from(pipelines)
      .where(eq(pipelines.id, req.params.id))
      .limit(1);

    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }

    res.json(pipeline);
  } catch (error: any) {
    console.error("[Pipelines] Error getting:", error);
    res.status(500).json({ error: "Failed to get pipeline" });
  }
});

// Create pipeline
router.post("/api/pipelines", requireAuth, async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    console.log("[Pipelines] Received request body:", JSON.stringify(req.body, null, 2));
    console.log("[Pipelines] User ID from token:", req.user.userId);
    
    // Server-side: Set ownership and tenant from authenticated user context
    // SECURITY: Never trust client-provided ownerId - always use req.user
    const pipelineData = {
      ...req.body,
      ownerId: req.user.userId,    // SECURITY: Set from authenticated user
      tenantId: 'default-tenant', // Default tenant for all users
    };
    
    console.log("[Pipelines] Data to validate:", JSON.stringify(pipelineData, null, 2));
    
    // Validate pipeline data (insertPipelineSchema omits id, createdAt, updatedAt)
    const validationResult = insertPipelineSchema.safeParse(pipelineData);
    
    if (!validationResult.success) {
      const validationError = fromZodError(validationResult.error);
      console.error("[Pipelines] Validation failed:", validationError.message);
      console.error("[Pipelines] Validation errors:", JSON.stringify(validationResult.error.errors, null, 2));
      return res.status(400).json({ 
        message: "Validation failed",
        errors: validationResult.error.errors 
      });
    }
    
    // Add ID after validation (schema omits it)
    const insertData = {
      ...validationResult.data,
      id: crypto.randomUUID(), // Generate ID server-side
    };
    
    const [pipeline] = await db.insert(pipelines).values(insertData as any).returning();
    res.json(pipeline);
  } catch (error: any) {
    console.error("[Pipelines] Error creating:", error);
    res.status(500).json({ error: "Failed to create pipeline" });
  }
});

// Update pipeline
router.put("/api/pipelines/:id", requireAuth, async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    // SECURITY: Strip ownership fields from update - users cannot change ownership
    const { id, ownerId, tenantId, ...updateData } = req.body;
    
    const [pipeline] = await db
      .update(pipelines)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(pipelines.id, req.params.id))
      .returning();

    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }

    res.json(pipeline);
  } catch (error: any) {
    console.error("[Pipelines] Error updating:", error);
    res.status(500).json({ error: "Failed to update pipeline" });
  }
});

// Delete pipeline
router.delete("/api/pipelines/:id", requireAuth, async (req, res) => {
  try {
    await db.delete(pipelines).where(eq(pipelines.id, req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Pipelines] Error deleting:", error);
    res.status(500).json({ error: "Failed to delete pipeline" });
  }
});

// List opportunities for pipeline
router.get("/api/pipelines/:id/opportunities", requireAuth, async (req, res) => {
  try {
    console.log(`[Pipeline] Fetching opportunities for pipeline: ${req.params.id}`);
    const opportunities = await db
      .select({
        id: pipelineOpportunities.id,
        pipelineId: pipelineOpportunities.pipelineId,
        accountId: pipelineOpportunities.accountId,
        accountName: accounts.name,
        contactId: pipelineOpportunities.contactId,
        ownerId: pipelineOpportunities.ownerId,
        ownerName: users.firstName,
        name: pipelineOpportunities.name,
        stage: pipelineOpportunities.stage,
        status: pipelineOpportunities.status,
        amount: pipelineOpportunities.amount,
        currency: pipelineOpportunities.currency,
        probability: pipelineOpportunities.probability,
        closeDate: pipelineOpportunities.closeDate,
        forecastCategory: pipelineOpportunities.forecastCategory,
        flaggedForSla: pipelineOpportunities.flaggedForSla,
        reason: pipelineOpportunities.reason,
        createdAt: pipelineOpportunities.createdAt,
        updatedAt: pipelineOpportunities.updatedAt,
      })
      .from(pipelineOpportunities)
      .leftJoin(accounts, eq(pipelineOpportunities.accountId, accounts.id))
      .leftJoin(users, eq(pipelineOpportunities.ownerId, users.id))
      .where(eq(pipelineOpportunities.pipelineId, req.params.id))
      .orderBy(pipelineOpportunities.createdAt);

    console.log(`[Pipeline] Found ${opportunities.length} opportunities for pipeline ${req.params.id}`);
    res.json(opportunities);
  } catch (error: any) {
    console.error("[Opportunities] Error listing:", error);
    res.status(500).json({ error: "Failed to list opportunities" });
  }
});

// Create opportunity
router.post("/api/opportunities", requireAuth, async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    // Server-side: Set ownership from authenticated user context
    // SECURITY: Never trust client-provided id/ownerId - always use req.user
    const opportunityData = {
      ...req.body,
      ownerId: req.user.userId,    // SECURITY: Set from authenticated user
      tenantId: 'default-tenant', // Default tenant for all users
    };
    
    // Add ID (insertOpportunitySchema omits it)
    const insertData = {
      ...opportunityData,
      id: crypto.randomUUID(), // Generate ID server-side
    };
    
    const [opportunity] = await db
      .insert(pipelineOpportunities)
      .values(insertData)
      .returning();
    res.json(opportunity);
  } catch (error: any) {
    console.error("[Opportunities] Error creating:", error);
    res.status(500).json({ error: "Failed to create opportunity" });
  }
});

// Update opportunity
router.put("/api/opportunities/:id", requireAuth, async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    // SECURITY: Strip ownership fields from update - users cannot change ownership
    const { id, ownerId, tenantId, ...updateData } = req.body;
    
    const [opportunity] = await db
      .update(pipelineOpportunities)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(pipelineOpportunities.id, req.params.id))
      .returning();

    if (!opportunity) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    res.json(opportunity);
  } catch (error: any) {
    console.error("[Opportunities] Error updating:", error);
    res.status(500).json({ error: "Failed to update opportunity" });
  }
});

// Move opportunity stage
router.post("/api/opportunities/:id/move", requireAuth, async (req, res) => {
  try {
    const { stage } = req.body;
    const [opportunity] = await db
      .update(pipelineOpportunities)
      .set({ stage, updatedAt: new Date() })
      .where(eq(pipelineOpportunities.id, req.params.id))
      .returning();

    if (!opportunity) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    res.json(opportunity);
  } catch (error: any) {
    console.error("[Opportunities] Error moving stage:", error);
    res.status(500).json({ error: "Failed to move opportunity" });
  }
});

// Generate AI Account Brief
router.post("/api/accounts/:id/ai-brief", requireAuth, async (req, res) => {
  try {
    const { generateAccountBrief } = await import("../services/ai-account-enrichment");
    const brief = await generateAccountBrief(req.params.id);
    
    if (!brief) {
      return res.status(404).json({ error: "Failed to generate brief" });
    }

    res.json(brief);
  } catch (error: any) {
    console.error("[AI-Brief] Error:", error);
    res.status(500).json({ error: "Failed to generate AI brief" });
  }
});

// Bulk Import Pipeline Opportunities
router.post("/api/pipelines/import", requireAuth, async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // SECURITY: Role-based authorization - only admin, campaign_manager, and data_ops can import
    const userRoles = (req.user as any)?.roles || [req.user?.role || ''];
    const allowedRoles = ['admin', 'campaign_manager', 'data_ops'];
    const hasPermission = userRoles.some((role: string) => allowedRoles.includes(role));
    
    if (!hasPermission) {
      console.warn(`[Pipeline Import] Unauthorized access attempt by user ${req.user.userId} with roles: ${userRoles.join(', ')}`);
      return res.status(403).json({ 
        error: "Access denied. Only admin, campaign_manager, and data_ops roles can import pipeline opportunities." 
      });
    }

    console.log("[Pipeline Import] Starting bulk import...");
    
    // Validate request
    const validationResult = pipelineBulkImportSchema.safeParse(req.body);
    if (!validationResult.success) {
      const validationError = fromZodError(validationResult.error);
      console.error("[Pipeline Import] Validation failed:", validationError.message);
      return res.status(400).json({ 
        message: "Validation failed",
        errors: validationResult.error.errors 
      });
    }

    const { pipelineId, stage, rows, createMissingAccounts, createMissingContacts } = validationResult.data;
    const tenantId = 'default-tenant'; // All users in this system use default tenant

    // Verify pipeline exists
    const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, pipelineId)).limit(1);
    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }

    // Verify stage exists in pipeline
    if (!pipeline.stageOrder.includes(stage)) {
      return res.status(400).json({ 
        error: `Stage "${stage}" not found in pipeline. Available stages: ${pipeline.stageOrder.join(', ')}` 
      });
    }

    const results = {
      accountsCreated: 0,
      accountsFound: 0,
      contactsCreated: 0,
      contactsFound: 0,
      opportunitiesCreated: 0,
      errors: [] as Array<{ row: number; error: string; data: PipelineImportRow }>,
    };

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // 1. Find or create account
        let accountId: string | undefined;
        const normalizedName = normalizeName(row.companyName);
        
        // Find existing account by normalized name
        const [existingAccount] = await db
          .select()
          .from(accounts)
          .where(eq(accounts.nameNormalized, normalizedName))
          .limit(1);

        if (existingAccount) {
          accountId = existingAccount.id;
          results.accountsFound++;
          console.log(`[Pipeline Import] Row ${i + 1}: Found existing account "${row.companyName}"`);
        } else if (createMissingAccounts) {
          // Create new account (no tenantId - accounts table doesn't support multi-tenancy)
          const [newAccount] = await db.insert(accounts).values({
            name: row.companyName,
            nameNormalized: normalizedName,
            industryStandardized: row.industry || null,
            description: row.companyDescription || null,
            companyLocation: row.hqLocation || null,
          } as any).returning();
          
          accountId = newAccount.id;
          results.accountsCreated++;
          console.log(`[Pipeline Import] Row ${i + 1}: Created new account "${row.companyName}"`);
        } else {
          results.errors.push({
            row: i + 1,
            error: `Account "${row.companyName}" not found and createMissingAccounts is false`,
            data: row,
          });
          continue;
        }

        // 2. Find or create contact
        let contactId: string | undefined;
        const emailNormalized = row.email.toLowerCase().trim();
        
        // Find existing contact by email (and optionally account)
        const contactConditions = [eq(contacts.emailNormalized, emailNormalized)];
        if (accountId) {
          contactConditions.push(eq(contacts.accountId, accountId));
        }
        
        const [existingContact] = await db
          .select()
          .from(contacts)
          .where(and(...contactConditions))
          .limit(1);

        if (existingContact) {
          contactId = existingContact.id;
          results.contactsFound++;
          console.log(`[Pipeline Import] Row ${i + 1}: Found existing contact "${row.email}"`);
        } else if (createMissingContacts) {
          // Create new contact (no tenantId - contacts table doesn't support multi-tenancy)
          const [newContact] = await db.insert(contacts).values({
            accountId: accountId || null,
            fullName: row.leadName,
            email: row.email,
            emailNormalized,
            jobTitle: row.jobTitle || null,
            emailVerificationStatus: 'unknown',
          } as any).returning();
          
          contactId = newContact.id;
          results.contactsCreated++;
          console.log(`[Pipeline Import] Row ${i + 1}: Created new contact "${row.leadName}"`);
        } else {
          results.errors.push({
            row: i + 1,
            error: `Contact "${row.email}" not found and createMissingContacts is false`,
            data: row,
          });
          continue;
        }

        // 3. Create opportunity
        const opportunityName = row.opportunityName || `${row.companyName} - ${row.leadName}`;
        const amount = row.amount ? parseFloat(row.amount) : 0;
        const probability = row.probability || 25; // Default 25% for qualification stage
        
        const opportunityId = crypto.randomUUID();
        await db.insert(pipelineOpportunities).values({
          id: opportunityId,
          tenantId: 'default-tenant',
          pipelineId,
          accountId: accountId || null,
          contactId: contactId || null,
          ownerId: req.user.userId,
          name: opportunityName,
          stage,
          status: 'open',
          amount: amount.toFixed(2),
          currency: pipeline.defaultCurrency,
          probability,
          reason: row.sourceAsset || null,
        });

        results.opportunitiesCreated++;
        console.log(`[Pipeline Import] Row ${i + 1}: Created opportunity "${opportunityName}"`);
      } catch (rowError: any) {
        console.error(`[Pipeline Import] Error processing row ${i + 1}:`, rowError);
        results.errors.push({
          row: i + 1,
          error: rowError.message || "Unknown error",
          data: row,
        });
      }
    }

    console.log("[Pipeline Import] Completed:", results);
    res.json({
      success: true,
      results,
      message: `Import completed: ${results.opportunitiesCreated} opportunities created`,
    });
  } catch (error: any) {
    console.error("[Pipeline Import] Error:", error);
    res.status(500).json({ error: "Failed to import pipeline opportunities" });
  }
});

export default router;
