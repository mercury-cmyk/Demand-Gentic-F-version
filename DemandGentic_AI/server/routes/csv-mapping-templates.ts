import { Router } from "express";
import { db } from "../db";
import { csvMappingTemplates, insertCsvMappingTemplateSchema, updateCsvMappingTemplateSchema } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../auth";

const router = Router();

/**
 * GET /api/csv-mapping-templates
 * Get all mapping templates for current user
 */
router.get("/api/csv-mapping-templates", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    
    const templates = await db
      .select()
      .from(csvMappingTemplates)
      .where(eq(csvMappingTemplates.userId, userId))
      .orderBy(desc(csvMappingTemplates.lastUsedAt), desc(csvMappingTemplates.createdAt));
    
    res.json(templates);
  } catch (error: any) {
    console.error("[CSV Templates] Error fetching templates:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/csv-mapping-templates
 * Create a new mapping template
 */
router.post("/api/csv-mapping-templates", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    
    // Extract only the fields that exist in the schema (ignore entityType and other extra fields)
    const { name, description, csvHeaders, mappings } = req.body;
    
    const validatedData = insertCsvMappingTemplateSchema.parse({
      name,
      description,
      csvHeaders,
      mappings,
      userId,
    });
    
    const [template] = await db
      .insert(csvMappingTemplates)
      .values([validatedData])
      .returning();
    
    res.json(template);
  } catch (error: any) {
    console.error("[CSV Templates] Error creating template:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/csv-mapping-templates/:id
 * Update a mapping template (only name, description, and mappings are editable)
 */
router.put("/api/csv-mapping-templates/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    
    // Validate and whitelist only editable fields
    const validatedData = updateCsvMappingTemplateSchema.parse(req.body);
    
    // Verify ownership
    const [existing] = await db
      .select()
      .from(csvMappingTemplates)
      .where(and(
        eq(csvMappingTemplates.id, id),
        eq(csvMappingTemplates.userId, userId)
      ))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    // Update only whitelisted fields, enforce userId ownership
    const [updated] = await db
      .update(csvMappingTemplates)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(and(
        eq(csvMappingTemplates.id, id),
        eq(csvMappingTemplates.userId, userId) // Enforce ownership in WHERE clause
      ))
      .returning();
    
    res.json(updated);
  } catch (error: any) {
    console.error("[CSV Templates] Error updating template:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/csv-mapping-templates/:id
 * Delete a mapping template
 */
router.delete("/api/csv-mapping-templates/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    
    // Verify ownership
    const [existing] = await db
      .select()
      .from(csvMappingTemplates)
      .where(and(
        eq(csvMappingTemplates.id, id),
        eq(csvMappingTemplates.userId, userId)
      ))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    await db
      .delete(csvMappingTemplates)
      .where(eq(csvMappingTemplates.id, id));
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[CSV Templates] Error deleting template:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/csv-mapping-templates/:id/use
 * Record usage of a template (increments use count and updates last used timestamp)
 */
router.post("/api/csv-mapping-templates/:id/use", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    
    // Verify ownership
    const [existing] = await db
      .select()
      .from(csvMappingTemplates)
      .where(and(
        eq(csvMappingTemplates.id, id),
        eq(csvMappingTemplates.userId, userId)
      ))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    const [updated] = await db
      .update(csvMappingTemplates)
      .set({
        useCount: sql`${csvMappingTemplates.useCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(csvMappingTemplates.id, id))
      .returning();
    
    res.json(updated);
  } catch (error: any) {
    console.error("[CSV Templates] Error recording template usage:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/csv-mapping-templates/find-best-match
 * Find the best matching template for given CSV headers
 */
router.post("/api/csv-mapping-templates/find-best-match", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { csvHeaders } = req.body;
    
    if (!csvHeaders || !Array.isArray(csvHeaders)) {
      return res.status(400).json({ error: "csvHeaders array is required" });
    }
    
    // Get all user templates
    const templates = await db
      .select()
      .from(csvMappingTemplates)
      .where(eq(csvMappingTemplates.userId, userId));
    
    if (templates.length === 0) {
      return res.json({ template: null, matchScore: 0 });
    }
    
    // Calculate match score for each template
    const scoredTemplates = templates.map(template => {
      const templateHeaders = template.csvHeaders as string[];
      const csvHeadersLower = csvHeaders.map(h => h.toLowerCase().trim());
      const templateHeadersLower = templateHeaders.map(h => h.toLowerCase().trim());
      
      // Exact match score (headers in same order)
      const exactMatches = csvHeadersLower.filter((h, i) => h === templateHeadersLower[i]).length;
      
      // Partial match score (headers exist but different order)
      const partialMatches = csvHeadersLower.filter(h => templateHeadersLower.includes(h)).length;
      
      // Calculate similarity score (0-100)
      const totalPossibleMatches = Math.max(csvHeaders.length, templateHeaders.length);
      const matchScore = ((exactMatches * 2 + partialMatches) / (totalPossibleMatches * 2)) * 100;
      
      return {
        template,
        matchScore: Math.round(matchScore),
      };
    });
    
    // Get best match
    const bestMatch = scoredTemplates.reduce((best, current) => 
      current.matchScore > best.matchScore ? current : best
    );
    
    // Only return if match score is above threshold (e.g., 50%)
    if (bestMatch.matchScore >= 50) {
      res.json(bestMatch);
    } else {
      res.json({ template: null, matchScore: 0 });
    }
  } catch (error: any) {
    console.error("[CSV Templates] Error finding best match:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;