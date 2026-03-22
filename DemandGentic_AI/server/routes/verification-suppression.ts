import { Router } from "express";
import { db } from "../db";
import { verificationSuppressionList, insertVerificationSuppressionListSchema } from "@shared/schema";
import { eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { addToSuppressionList } from "../lib/verification-suppression";
import Papa from "papaparse";

const router = Router();

interface SuppressionCSVRow {
  email?: string;
  cavId?: string;
  cavUserId?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  companyKey?: string;
}

router.get("/api/verification-campaigns/:campaignId/suppression", async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const items = await db
      .select()
      .from(verificationSuppressionList)
      .where(
        or(
          eq(verificationSuppressionList.campaignId, campaignId),
          sql`${verificationSuppressionList.campaignId} IS NULL`
        )
      );
    
    res.json(items);
  } catch (error) {
    console.error("Error fetching suppression list:", error);
    res.status(500).json({ error: "Failed to fetch suppression list" });
  }
});

router.post("/api/verification-campaigns/:campaignId/suppression", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { entries } = req.body;
    
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "entries must be a non-empty array" });
    }
    
    await addToSuppressionList(campaignId, entries);
    
    res.status(201).json({ added: entries.length });
  } catch (error) {
    console.error("Error adding to suppression list:", error);
    res.status(500).json({ error: "Failed to add to suppression list" });
  }
});

router.post("/api/verification-suppression/global", async (req, res) => {
  try {
    const { entries } = req.body;
    
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "entries must be a non-empty array" });
    }
    
    await addToSuppressionList(null, entries);
    
    res.status(201).json({ added: entries.length });
  } catch (error) {
    console.error("Error adding to global suppression list:", error);
    res.status(500).json({ error: "Failed to add to global suppression list" });
  }
});

router.post("/api/verification-campaigns/:campaignId/suppression/upload", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { csvData } = req.body;

    if (!csvData) {
      return res.status(400).json({ error: "csvData is required" });
    }

    // Import CSV utilities
    const { parseCSVWithAutoDelimiter, normalizeCSVHeader, processCSVRows } = await import('../lib/csv-utils');

    // Parse CSV with automatic delimiter detection
    const parseResult = parseCSVWithAutoDelimiter(csvData, {
      headers: true,
      transformHeader: normalizeCSVHeader,
    });

    if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
      console.error("CSV parsing failed:", parseResult.errors);
      return res.status(400).json({
        error: "CSV parsing failed",
        details: parseResult.errors.map(e => e.message),
      });
    }

    // Process rows with validation
    const { results: entries, errors, skipped } = await processCSVRows(
      parseResult.data,
      (row, index) => {
        const hasStrongId = row.email || row.cavId || row.cavUserId;
        const hasFullNameCompany = row.firstName && row.lastName && row.companyName;
        
        if (!hasStrongId && !hasFullNameCompany) {
          throw new Error('Must have email, CAV ID, CAV User ID, or complete Name+Company');
        }

        return {
          email: row.email?.toLowerCase().trim() || undefined,
          cavId: row.cavId?.trim() || undefined,
          cavUserId: row.cavUserId?.trim() || undefined,
          firstName: row.firstName?.trim() || undefined,
          lastName: row.lastName?.trim() || undefined,
          companyKey: row.companyName?.toLowerCase().trim().replace(/\s+/g, ' ') || undefined,
        };
      },
      { collectErrors: true, skipInvalid: true }
    );

    if (entries.length > 0) {
      await addToSuppressionList(campaignId, entries);
    }

    res.json({
      total: parseResult.data.length,
      added: entries.length,
      skipped,
      errors,
    });
  } catch (error) {
    const { createCSVErrorResponse } = await import('../lib/csv-utils');
    console.error("Error uploading suppression file:", error);
    res.status(500).json(createCSVErrorResponse(error, 'Suppression file upload'));
  }
});

router.post("/api/verification-suppression/global/upload", async (req, res) => {
  try {
    const { csvData } = req.body;

    if (!csvData) {
      return res.status(400).json({ error: "csvData is required" });
    }

    // Import CSV utilities
    const { parseCSVWithAutoDelimiter, normalizeCSVHeader, processCSVRows } = await import('../lib/csv-utils');

    // Parse CSV with automatic delimiter detection
    const parseResult = parseCSVWithAutoDelimiter(csvData, {
      headers: true,
      transformHeader: normalizeCSVHeader,
    });

    if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
      console.error("CSV parsing failed:", parseResult.errors);
      return res.status(400).json({
        error: "CSV parsing failed",
        details: parseResult.errors.map(e => e.message),
      });
    }

    // Process rows with validation
    const { results: entries, errors, skipped } = await processCSVRows(
      parseResult.data,
      (row, index) => {
        const hasStrongId = row.email || row.cavId || row.cavUserId;
        const hasFullNameCompany = row.firstName && row.lastName && row.companyName;
        
        if (!hasStrongId && !hasFullNameCompany) {
          throw new Error('Must have email, CAV ID, CAV User ID, or complete Name+Company');
        }

        return {
          email: row.email?.toLowerCase().trim() || undefined,
          cavId: row.cavId?.trim() || undefined,
          cavUserId: row.cavUserId?.trim() || undefined,
          firstName: row.firstName?.trim() || undefined,
          lastName: row.lastName?.trim() || undefined,
          companyKey: row.companyName?.toLowerCase().trim().replace(/\s+/g, ' ') || undefined,
        };
      },
      { collectErrors: true, skipInvalid: true }
    );

    if (entries.length > 0) {
      await addToSuppressionList(null, entries);
    }

    res.json({
      total: parseResult.data.length,
      added: entries.length,
      skipped,
      errors,
    });
  } catch (error) {
    const { createCSVErrorResponse } = await import('../lib/csv-utils');
    console.error("Error uploading global suppression file:", error);
    res.status(500).json(createCSVErrorResponse(error, 'Global suppression file upload'));
  }
});

export default router;