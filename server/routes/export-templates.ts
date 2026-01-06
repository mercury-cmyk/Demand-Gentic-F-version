import { Router } from "express";
import { db } from "../db";
import { exportTemplates, insertExportTemplateSchema } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import type { Request, Response } from "express";

const router = Router();

// Get all export templates
router.get("/", async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    
    let templates;
    if (type && typeof type === 'string') {
      templates = await db
        .select()
        .from(exportTemplates)
        .where(eq(exportTemplates.templateType, type))
        .orderBy(desc(exportTemplates.createdAt));
    } else {
      templates = await db
        .select()
        .from(exportTemplates)
        .orderBy(desc(exportTemplates.createdAt));
    }
    
    res.json(templates);
  } catch (error) {
    console.error("Error fetching export templates:", error);
    res.status(500).json({ error: "Failed to fetch export templates" });
  }
});

// Get single export template
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const template = await db
      .select()
      .from(exportTemplates)
      .where(eq(exportTemplates.id, id))
      .limit(1);
    
    if (!template.length) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    res.json(template[0]);
  } catch (error) {
    console.error("Error fetching export template:", error);
    res.status(500).json({ error: "Failed to fetch export template" });
  }
});

// Create export template
router.post("/", async (req: Request, res: Response) => {
  try {
    const validatedData = insertExportTemplateSchema.parse({
      ...req.body,
      createdBy: req.user?.userId || null,
    });
    
    const [template] = await db
      .insert(exportTemplates)
      .values(validatedData as any)
      .returning();
    
    res.status(201).json(template);
  } catch (error) {
    console.error("Error creating export template:", error);
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to create export template" });
    }
  }
});

// Update export template
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Verify template exists
    const existing = await db
      .select()
      .from(exportTemplates)
      .where(eq(exportTemplates.id, id))
      .limit(1);
    
    if (!existing.length) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    const validatedData = insertExportTemplateSchema.partial().parse(req.body);
    
    const [updated] = await db
      .update(exportTemplates)
      .set({
        ...validatedData as any,
        updatedAt: new Date(),
      })
      .where(eq(exportTemplates.id, id))
      .returning();
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating export template:", error);
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to update export template" });
    }
  }
});

// Delete export template
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const deleted = await db
      .delete(exportTemplates)
      .where(eq(exportTemplates.id, id))
      .returning();
    
    if (!deleted.length) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    res.json({ success: true, message: "Template deleted" });
  } catch (error) {
    console.error("Error deleting export template:", error);
    res.status(500).json({ error: "Failed to delete export template" });
  }
});

// Get available fields for smart export template
router.get("/fields/smart-export", async (req: Request, res: Response) => {
  try {
    // Define all available fields for smart export (matches contactToFieldMap in apply-export-template.ts)
    const availableFields = [
      // Contact basic fields
      { key: "id", label: "Contact ID", category: "Contact" },
      { key: "full_name", label: "Full Name", category: "Contact" },
      { key: "first_name", label: "First Name", category: "Contact" },
      { key: "last_name", label: "Last Name", category: "Contact" },
      { key: "title", label: "Job Title", category: "Contact" },
      { key: "email", label: "Email", category: "Contact" },
      { key: "linkedin_url", label: "LinkedIn URL", category: "Contact" },
      { key: "cav_id", label: "CAV ID", category: "Contact" },
      { key: "cav_user_id", label: "CAV User ID", category: "Contact" },
      
      // Smart selection fields
      { key: "best_phone", label: "Best Phone", category: "Smart Selection" },
      { key: "best_phone_source", label: "Best Phone Source", category: "Smart Selection" },
      { key: "best_address_line1", label: "Best Address Line 1", category: "Smart Selection" },
      { key: "best_address_line2", label: "Best Address Line 2", category: "Smart Selection" },
      { key: "best_address_line3", label: "Best Address Line 3", category: "Smart Selection" },
      { key: "best_city", label: "Best City", category: "Smart Selection" },
      { key: "best_state", label: "Best State/Province", category: "Smart Selection" },
      { key: "best_country", label: "Best Country", category: "Smart Selection" },
      { key: "best_postal", label: "Best Postal Code", category: "Smart Selection" },
      { key: "best_address_source", label: "Best Address Source", category: "Smart Selection" },
      
      // Company fields
      { key: "account_name", label: "Company Name", category: "Company" },
      { key: "account_domain", label: "Company Domain", category: "Company" },
      { key: "account_website", label: "Company Website", category: "Company" },
      { key: "account_industry", label: "Industry", category: "Company" },
      { key: "account_revenue", label: "Revenue", category: "Company" },
      { key: "account_employee_count", label: "Employee Count", category: "Company" },
      
      // Status fields
      { key: "eligibility_status", label: "Eligibility Status", category: "Status" },
      { key: "verification_status", label: "Verification Status", category: "Status" },
      { key: "email_status", label: "Email Status", category: "Status" },
      { key: "qa_status", label: "QA Status", category: "Status" },
      { key: "suppressed", label: "Suppressed (Yes/No)", category: "Status" },
      
      // Original phone/address fields
      { key: "mobile", label: "Mobile Phone (Original)", category: "Contact - Original" },
      { key: "phone", label: "Phone (Original)", category: "Contact - Original" },
      { key: "contact_address1", label: "Contact Address 1 (Original)", category: "Contact - Original" },
      { key: "contact_city", label: "Contact City (Original)", category: "Contact - Original" },
      { key: "contact_state", label: "Contact State (Original)", category: "Contact - Original" },
      { key: "contact_country", label: "Contact Country (Original)", category: "Contact - Original" },
      { key: "contact_postal", label: "Contact Postal (Original)", category: "Contact - Original" },
      
      // Timestamps
      { key: "created_at", label: "Created At", category: "Metadata" },
      { key: "updated_at", label: "Updated At", category: "Metadata" },
    ];
    
    res.json(availableFields);
  } catch (error) {
    console.error("Error fetching available fields:", error);
    res.status(500).json({ error: "Failed to fetch available fields" });
  }
});

// Get available fields for campaign delivery template
router.get("/fields/campaign-delivery", async (req: Request, res: Response) => {
  try {
    // Define all available fields for campaign delivery templates
    const availableFields = [
      // Contact basic fields
      { key: "id", label: "Contact ID", category: "Contact" },
      { key: "fullName", label: "Full Name", category: "Contact" },
      { key: "firstName", label: "First Name", category: "Contact" },
      { key: "lastName", label: "Last Name", category: "Contact" },
      { key: "title", label: "Job Title", category: "Contact" },
      { key: "email", label: "Email", category: "Contact" },
      { key: "phone", label: "Phone", category: "Contact" },
      { key: "mobile", label: "Mobile", category: "Contact" },
      { key: "directPhone", label: "Direct Phone", category: "Contact" },
      { key: "addressLine1", label: "Address Line 1", category: "Contact" },
      { key: "addressLine2", label: "Address Line 2", category: "Contact" },
      { key: "city", label: "City", category: "Contact" },
      { key: "state", label: "State/Province", category: "Contact" },
      { key: "country", label: "Country", category: "Contact" },
      { key: "postalCode", label: "Postal Code", category: "Contact" },
      { key: "linkedinUrl", label: "LinkedIn URL", category: "Contact" },
      
      // Account/Company fields
      { key: "account.id", label: "Account ID", category: "Account" },
      { key: "account.name", label: "Company Name", category: "Account" },
      { key: "account.domain", label: "Company Domain", category: "Account" },
      { key: "account.website", label: "Company Website", category: "Account" },
      { key: "account.industryStandardized", label: "Industry", category: "Account" },
      { key: "account.annualRevenue", label: "Annual Revenue", category: "Account" },
      { key: "account.revenueRange", label: "Revenue Range", category: "Account" },
      { key: "account.staffCount", label: "Staff Count", category: "Account" },
      { key: "account.employeesSizeRange", label: "Employee Size Range", category: "Account" },
      { key: "account.hqCity", label: "HQ City", category: "Account" },
      { key: "account.hqState", label: "HQ State", category: "Account" },
      { key: "account.hqCountry", label: "HQ Country", category: "Account" },
      { key: "account.hqPostalCode", label: "HQ Postal Code", category: "Account" },
      { key: "account.mainPhone", label: "HQ Main Phone", category: "Account" },
      { key: "account.linkedinUrl", label: "Company LinkedIn URL", category: "Account" },
      
      // Lead fields
      { key: "leadStatus", label: "Lead Status", category: "Lead" },
      { key: "callDisposition", label: "Call Disposition", category: "Lead" },
      { key: "qaStatus", label: "QA Status", category: "Lead" },
      { key: "notes", label: "Notes", category: "Lead" },
      { key: "source", label: "Source", category: "Lead" },
      { key: "priority", label: "Priority", category: "Lead" },
      { key: "callAttempts", label: "Call Attempts", category: "Lead" },
      { key: "lastContactedAt", label: "Last Contacted At", category: "Lead" },
      { key: "qualificationScore", label: "Qualification Score", category: "Lead" },
      
      // QA Data fields (from qaData JSONB)
      { key: "qaData.budget", label: "Budget (QA)", category: "QA Data" },
      { key: "qaData.authority", label: "Authority (QA)", category: "QA Data" },
      { key: "qaData.need", label: "Need (QA)", category: "QA Data" },
      { key: "qaData.timeline", label: "Timeline (QA)", category: "QA Data" },
      { key: "qaData.painPoints", label: "Pain Points (QA)", category: "QA Data" },
      { key: "qaData.competitorMentioned", label: "Competitor Mentioned (QA)", category: "QA Data" },
      { key: "qaData.aiAnalysis", label: "AI Analysis (QA)", category: "QA Data" },
      { key: "qaData.transcriptSummary", label: "Transcript Summary (QA)", category: "QA Data" },
      { key: "qaData.qualificationStatus", label: "Qualification Status (QA)", category: "QA Data" },
      
      // Companies House UK Validation (QA Data)
      { key: "qaData.ch_legal_name", label: "CH Legal Name", category: "QA Data - Companies House" },
      { key: "qaData.ch_company_number", label: "CH Company Number", category: "QA Data - Companies House" },
      { key: "qaData.ch_status", label: "CH Status", category: "QA Data - Companies House" },
      { key: "qaData.ch_address", label: "CH Registered Address", category: "QA Data - Companies House" },
      { key: "qaData.ch_date_of_creation", label: "CH Date of Creation", category: "QA Data - Companies House" },
      
      // Email Validation (QA Data)
      { key: "qaData.emailValidationStatus", label: "Email Validation Status", category: "QA Data - Email" },
      { key: "qaData.emailValidationDetails", label: "Email Validation Details", category: "QA Data - Email" },
      
      // Campaign fields
      { key: "campaign.id", label: "Campaign ID", category: "Campaign" },
      { key: "campaign.name", label: "Campaign Name", category: "Campaign" },
      { key: "campaign.type", label: "Campaign Type", category: "Campaign" },
      
      // Agent fields
      { key: "agent.firstName", label: "Agent First Name", category: "Agent" },
      { key: "agent.lastName", label: "Agent Last Name", category: "Agent" },
      { key: "agent.email", label: "Agent Email", category: "Agent" },
      
      // Timestamps
      { key: "createdAt", label: "Lead Created At", category: "Metadata" },
      { key: "updatedAt", label: "Lead Updated At", category: "Metadata" },
      { key: "approvedAt", label: "Approved At", category: "Metadata" },
      { key: "publishedAt", label: "Published At", category: "Metadata" },
    ];
    
    res.json(availableFields);
  } catch (error) {
    console.error("Error fetching campaign delivery fields:", error);
    res.status(500).json({ error: "Failed to fetch campaign delivery fields" });
  }
});

export default router;
