import { Router, Request, Response } from "express";
import { db } from "../db";
import { verificationCampaigns, insertVerificationCampaignSchema, verificationLeadSubmissions, verificationContacts, accounts, exportTemplates, verificationCampaignWorkflows } from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { formatPhoneWithCountryCode } from "../lib/phone-formatter";
import { requireAuth } from "../auth";
import { requireDataExportAuthority } from "../middleware/auth";

const router = Router();

router.get("/api/verification-campaigns", async (req, res) => {
  try {
    const campaigns = await db.select().from(verificationCampaigns);
    res.json(campaigns);
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

router.get("/api/verification-campaigns/:id", async (req, res) => {
  try {
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, req.params.id));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    res.json(campaign);
  } catch (error) {
    console.error("Error fetching campaign:", error);
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

router.post("/api/verification-campaigns", async (req, res) => {
  try {
    const validatedData = insertVerificationCampaignSchema.parse(req.body) as typeof verificationCampaigns.$inferInsert;
    
    const [campaign] = await db
      .insert(verificationCampaigns)
      .values([validatedData])
      .returning();
    
    res.status(201).json(campaign);
  } catch (error) {
    console.error("Error creating campaign:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.put("/api/verification-campaigns/:id", async (req, res) => {
  try {
    const updateSchema = insertVerificationCampaignSchema.partial();
    const validatedData = updateSchema.parse(req.body) as Partial;
    
    const [campaign] = await db
      .update(verificationCampaigns)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(verificationCampaigns.id, req.params.id))
      .returning();
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    res.json(campaign);
  } catch (error) {
    console.error("Error updating campaign:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.delete("/api/verification-campaigns/:id", requireAuth, async (req, res) => {
  try {
    const result = await db
      .delete(verificationCampaigns)
      .where(eq(verificationCampaigns.id, req.params.id));
    
    res.json({ message: "Campaign deleted successfully", deletedCount: result.rowCount || 0 });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

router.get("/api/verification-campaigns/:campaignId/stats", async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Get all counts in a single query for efficiency
    // Note: eligibleCount now shows contacts with reserved_slot=true (selected for delivery after cap enforcement)
    const stats = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE deleted = FALSE) as total_contacts,
        COUNT(*) FILTER (WHERE deleted = FALSE AND suppressed = TRUE) as suppressed_count,
        COUNT(*) FILTER (WHERE deleted = FALSE AND suppressed = FALSE) as active_count,
        COUNT(*) FILTER (WHERE deleted = FALSE AND suppressed = FALSE AND eligibility_status = 'Eligible' AND reserved_slot = TRUE) as eligible_count,
        COUNT(*) FILTER (WHERE deleted = FALSE AND suppressed = FALSE AND eligibility_status = 'Eligible' AND reserved_slot = TRUE AND verification_status = 'Validated') as validated_count,
        COUNT(*) FILTER (WHERE deleted = FALSE AND suppressed = FALSE AND eligibility_status = 'Eligible' AND reserved_slot = TRUE AND verification_status = 'Validated' AND email_status::text IN ('valid', 'acceptable')) as ok_email_count,
        COUNT(*) FILTER (WHERE deleted = FALSE AND suppressed = FALSE AND eligibility_status = 'Eligible' AND verification_status = 'Invalid') as invalid_email_count,
        COUNT(*) FILTER (WHERE in_submission_buffer = TRUE) as in_buffer_count
      FROM verification_contacts
      WHERE campaign_id = ${campaignId}
    `);
    
    // Get submitted count separately
    const [submittedResult] = await db
      .select({ count: sql`count(*)` })
      .from(verificationLeadSubmissions)
      .where(eq(verificationLeadSubmissions.campaignId, campaignId));
    
    const row = stats.rows[0] as any;
    
    res.json({
      totalContacts: Number(row.total_contacts || 0),
      suppressedCount: Number(row.suppressed_count || 0),
      activeCount: Number(row.active_count || 0),
      eligibleCount: Number(row.eligible_count || 0),
      validatedCount: Number(row.validated_count || 0),
      okEmailCount: Number(row.ok_email_count || 0),
      invalidEmailCount: Number(row.invalid_email_count || 0),
      submittedCount: Number(submittedResult?.count || 0),
      inBufferCount: Number(row.in_buffer_count || 0),
    });
  } catch (error) {
    console.error("Error fetching campaign stats:", error);
    res.status(500).json({ error: "Failed to fetch campaign stats" });
  }
});

router.get("/api/verification-campaigns/:campaignId/account-caps", async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Get campaign to retrieve lead cap setting
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const leadCap = campaign.leadCapPerAccount;
    
    // If no cap is configured, return empty array (uncapped campaign)
    if (!leadCap || leadCap  {
      const contactCount = Number(row.contact_count);
      const remaining = Math.max(0, leadCap - contactCount);
      const percentUsed = Math.round((contactCount / leadCap) * 100);
      
      return {
        accountId: row.account_id,
        accountName: row.account_name,
        domain: row.domain,
        contactCount,
        leadCap,
        remaining,
        percentUsed,
        isAtCap: contactCount >= leadCap,
      };
    });
    
    res.json(results);
  } catch (error) {
    console.error("Error fetching account cap stats:", error);
    res.status(500).json({ error: "Failed to fetch account cap stats" });
  }
});

router.get("/api/verification-campaigns/:campaignId/contacts", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const filter = req.query.filter as string;
    
    if (!filter) {
      return res.status(400).json({ error: "filter query parameter is required" });
    }
    
    let filterCondition = sql`1=1`;
    
    switch (filter) {
      case 'all':
        filterCondition = sql`c.deleted = FALSE`;
        break;
      case 'eligible':
        filterCondition = sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.eligibility_status = 'Eligible'`;
        break;
      case 'suppressed':
        filterCondition = sql`c.deleted = FALSE AND c.suppressed = TRUE`;
        break;
      case 'validated':
        filterCondition = sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.verification_status = 'Validated'`;
        break;
      case 'ok_email':
        filterCondition = sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.email_status::text IN ('valid', 'acceptable')`;
        break;
      case 'invalid_email':
        filterCondition = sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.verification_status = 'Invalid'`;
        break;
      case 'submitted':
        // Get submitted lead contact IDs
        const submittedLeads = await db
          .select({ contactId: verificationLeadSubmissions.contactId })
          .from(verificationLeadSubmissions)
          .where(eq(verificationLeadSubmissions.campaignId, campaignId));
        
        const submittedIds = submittedLeads.map(l => l.contactId).filter(Boolean);
        
        if (submittedIds.length === 0) {
          return res.json([]);
        }
        
        filterCondition = sql`c.id IN (${sql.join(submittedIds.map(id => sql`${id}`), sql`, `)})`;
        break;
      default:
        return res.status(400).json({ error: "Invalid filter" });
    }
    
    const contacts = await db.execute(sql`
      SELECT 
        c.id,
        c.full_name as "fullName",
        c.email,
        c.title,
        c.verification_status as "verificationStatus",
        c.email_status as "emailStatus",
        c.suppressed,
        c.eligibility_status as "eligibilityStatus",
        c.eligibility_reason as "eligibilityReason",
        a.name as "accountName"
      FROM verification_contacts c
      LEFT JOIN accounts a ON a.id = c.account_id
      WHERE c.campaign_id = ${campaignId}
        AND ${filterCondition}
      ORDER BY c.updated_at DESC
      LIMIT 500
    `);
    
    res.json(contacts.rows);
  } catch (error) {
    console.error("Error fetching filtered contacts:", error);
    res.status(500).json({ error: "Failed to fetch filtered contacts" });
  }
});

router.get("/api/verification-campaigns/:campaignId/accounts/:accountName/cap", async (req, res) => {
  try {
    const { campaignId, accountName } = req.params;
    
    // Resolve accountId by case-insensitive name
    const [acct] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(sql`LOWER(${accounts.name}) = LOWER(${accountName})`)
      .limit(1);

    if (!acct) {
      return res.json({ accountName, submitted: 0 });
    }

    const [result] = await db
      .select({ submitted: sql`count(*)` })
      .from(verificationLeadSubmissions)
      .where(and(
        eq(verificationLeadSubmissions.campaignId, campaignId),
        eq(verificationLeadSubmissions.accountId, acct.id)
      ));
    
    res.json({
      accountName,
      submitted: Number(result?.submitted || 0)
    });
  } catch (error) {
    console.error("Error fetching account cap:", error);
    res.status(500).json({ error: "Failed to fetch account cap" });
  }
});

router.get("/api/verification-campaigns/:campaignId/export", requireAuth, requireDataExportAuthority, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { 
      filter,
      fullName, 
      email, 
      title, 
      phone, 
      accountName,
      city,
      state,
      country,
      eligibilityStatus, 
      verificationStatus, 
      emailStatus, 
      qaStatus,
      suppressed,
      customFields 
    } = req.query;

    // Build filter conditions
    const conditions: any[] = [sql`c.campaign_id = ${campaignId}`];
    
    // Preset filter (all, eligible, suppressed, submitted, etc.)
    if (filter) {
      switch (filter) {
        case 'all':
          conditions.push(sql`c.deleted = FALSE`);
          break;
        case 'eligible':
          conditions.push(sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.eligibility_status = 'Eligible'`);
          break;
        case 'suppressed':
          conditions.push(sql`c.deleted = FALSE AND c.suppressed = TRUE`);
          break;
        case 'validated':
          conditions.push(sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.verification_status = 'Validated'`);
          break;
        case 'ok_email':
          conditions.push(sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.email_status::text IN ('valid', 'acceptable')`);
          break;
        case 'invalid_email':
          conditions.push(sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.verification_status = 'Invalid'`);
          break;
        case 'submitted':
          const submittedLeads = await db
            .select({ contactId: verificationLeadSubmissions.contactId })
            .from(verificationLeadSubmissions)
            .where(eq(verificationLeadSubmissions.campaignId, campaignId));
          
          const submittedIds = submittedLeads.map(l => l.contactId).filter(Boolean);
          
          if (submittedIds.length === 0) {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="verification-contacts-${campaignId}-${new Date().toISOString()}.csv"`);
            return res.send('No contacts found');
          }
          
          conditions.push(sql`c.id IN (${sql.join(submittedIds.map(id => sql`${id}`), sql`, `)})`);
          break;
      }
    } else {
      conditions.push(sql`c.deleted = FALSE`);
    }

    // Advanced filters
    if (fullName) {
      conditions.push(sql`c.full_name ILIKE ${`%${fullName}%`}`);
    }
    if (email) {
      conditions.push(sql`c.email ILIKE ${`%${email}%`}`);
    }
    if (title) {
      conditions.push(sql`c.title ILIKE ${`%${title}%`}`);
    }
    if (phone) {
      conditions.push(sql`(c.phone ILIKE ${`%${phone}%`} OR c.mobile ILIKE ${`%${phone}%`})`);
    }
    if (accountName) {
      conditions.push(sql`a.name ILIKE ${`%${accountName}%`}`);
    }
    if (city) {
      conditions.push(sql`c.contact_city ILIKE ${`%${city}%`}`);
    }
    if (state) {
      conditions.push(sql`c.contact_state ILIKE ${`%${state}%`}`);
    }
    if (country) {
      conditions.push(sql`c.contact_country ILIKE ${`%${country}%`}`);
    }
    if (eligibilityStatus) {
      conditions.push(sql`c.eligibility_status = ${eligibilityStatus}`);
    }
    if (verificationStatus) {
      conditions.push(sql`c.verification_status = ${verificationStatus}`);
    }
    if (emailStatus) {
      conditions.push(sql`c.email_status::text = ${emailStatus}`);
    }
    if (qaStatus) {
      conditions.push(sql`c.qa_status = ${qaStatus}`);
    }
    if (suppressed !== undefined && suppressed !== 'all') {
      conditions.push(sql`c.suppressed = ${suppressed === 'true'}`);
    }

    // Custom fields filtering
    if (customFields && typeof customFields === 'string') {
      try {
        const customFieldsObj = JSON.parse(customFields);
        for (const [key, value] of Object.entries(customFieldsObj)) {
          if (value && typeof value === 'string') {
            const [entityType, fieldKey] = key.split('.');
            if (entityType === 'contact') {
              conditions.push(sql`c.custom_fields->>${fieldKey} ILIKE ${`%${value}%`}`);
            } else if (entityType === 'account') {
              conditions.push(sql`a.custom_fields->>${fieldKey} ILIKE ${`%${value}%`}`);
            }
          }
        }
      } catch (e) {
        console.error('Error parsing custom fields:', e);
      }
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    // Fetch all contacts matching the filters
    const result = await db.execute(sql`
      SELECT 
        c.id,
        c.full_name,
        c.first_name,
        c.last_name,
        c.title,
        c.email,
        c.email_lower,
        c.phone,
        c.mobile,
        c.linkedin_url,
        c.cav_id,
        c.cav_user_id,
        c.former_position,
        c.time_in_current_position,
        c.time_in_current_position_months,
        c.time_in_current_company,
        c.time_in_current_company_months,
        c.contact_address1,
        c.contact_address2,
        c.contact_address3,
        c.contact_city,
        c.contact_state,
        c.contact_country,
        c.contact_postal,
        c.hq_address_1,
        c.hq_address_2,
        c.hq_address_3,
        c.hq_city,
        c.hq_state,
        c.hq_country,
        c.hq_postal,
        c.hq_phone,
        c.eligibility_status,
        c.eligibility_reason,
        c.verification_status,
        c.qa_status,
        c.email_status,
        c.suppressed,
        c.source_type,
        c.priority_score,
        c.in_submission_buffer,
        c.assignee_id,
        c.address_enrichment_status,
        c.phone_enrichment_status,
        c.custom_fields,
        c.created_at,
        c.updated_at,
        a.name as account_name,
        a.domain as account_domain,
        a.industry_standardized as account_industry,
        a.employees_size_range as account_size,
        a.revenue_range as account_revenue,
        a.main_phone as account_phone,
        a.hq_street_1 as account_hq_street1,
        a.hq_street_2 as account_hq_street2,
        a.hq_city as account_city,
        a.hq_state as account_state,
        a.hq_country as account_country,
        a.hq_postal_code as account_postal,
        a.custom_fields as account_custom_fields
      FROM verification_contacts c
      LEFT JOIN accounts a ON a.id = c.account_id
      ${whereClause}
      ORDER BY c.updated_at DESC
    `);

    const contacts = result.rows as any[];

    // Collect all unique custom field keys from contacts and accounts
    const contactCustomFieldKeys = new Set();
    const accountCustomFieldKeys = new Set();
    
    contacts.forEach(contact => {
      if (contact.custom_fields && typeof contact.custom_fields === 'object') {
        Object.keys(contact.custom_fields).forEach(key => contactCustomFieldKeys.add(key));
      }
      if (contact.account_custom_fields && typeof contact.account_custom_fields === 'object') {
        Object.keys(contact.account_custom_fields).forEach(key => accountCustomFieldKeys.add(key));
      }
    });

    // Generate CSV
    const csvRows: string[] = [];
    
    // Header row
    const headers = [
      'ID',
      'Full Name',
      'First Name',
      'Last Name',
      'Title',
      'Email',
      'Email Lower',
      'Phone',
      'Mobile',
      'LinkedIn URL',
      'CAV ID',
      'CAV User ID',
      'Former Position',
      'Time in Current Position',
      'Time in Current Position (Months)',
      'Time in Current Company',
      'Time in Current Company (Months)',
      'Contact Address 1',
      'Contact Address 2',
      'Contact Address 3',
      'Contact City',
      'Contact State',
      'Contact Country',
      'Contact Postal Code',
      'HQ Address 1',
      'HQ Address 2',
      'HQ Address 3',
      'HQ City',
      'HQ State',
      'HQ Country',
      'HQ Postal Code',
      'HQ Phone',
      'Eligibility Status',
      'Eligibility Reason',
      'Verification Status',
      'QA Status',
      'Email Status',
      'Suppressed',
      'Source Type',
      'Priority Score',
      'In Submission Buffer',
      'Assignee ID',
      'Address Enrichment Status',
      'Phone Enrichment Status',
      'Created At',
      'Updated At',
      'Account Name',
      'Account Domain',
      'Account Industry',
      'Account Size',
      'Account Revenue',
      'Account Phone',
      'Account HQ Street 1',
      'Account HQ Street 2',
      'Account City',
      'Account State',
      'Account Country',
      'Account Postal Code',
    ];
    
    // Add contact custom field headers
    const sortedContactCustomFieldKeys = Array.from(contactCustomFieldKeys).sort();
    sortedContactCustomFieldKeys.forEach(key => {
      headers.push(`Contact Custom: ${key}`);
    });
    
    // Add account custom field headers
    const sortedAccountCustomFieldKeys = Array.from(accountCustomFieldKeys).sort();
    sortedAccountCustomFieldKeys.forEach(key => {
      headers.push(`Account Custom: ${key}`);
    });
    
    csvRows.push(headers.join(','));

    // Data rows
    for (const contact of contacts) {
      const escapeCSV = (val: any) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        return `"${str.replace(/"/g, '""')}"`;
      };

      const row = [
        contact.id,
        escapeCSV(contact.full_name),
        escapeCSV(contact.first_name),
        escapeCSV(contact.last_name),
        escapeCSV(contact.title),
        contact.email || '',
        contact.email_lower || '',
        formatPhoneWithCountryCode(contact.phone, contact.contact_country),
        formatPhoneWithCountryCode(contact.mobile, contact.contact_country),
        contact.linkedin_url || '',
        contact.cav_id || '',
        contact.cav_user_id || '',
        escapeCSV(contact.former_position),
        contact.time_in_current_position || '',
        contact.time_in_current_position_months || '',
        contact.time_in_current_company || '',
        contact.time_in_current_company_months || '',
        escapeCSV(contact.contact_address1),
        escapeCSV(contact.contact_address2),
        escapeCSV(contact.contact_address3),
        escapeCSV(contact.contact_city),
        escapeCSV(contact.contact_state),
        escapeCSV(contact.contact_country),
        contact.contact_postal || '',
        escapeCSV(contact.hq_address_1),
        escapeCSV(contact.hq_address_2),
        escapeCSV(contact.hq_address_3),
        escapeCSV(contact.hq_city),
        escapeCSV(contact.hq_state),
        escapeCSV(contact.hq_country),
        contact.hq_postal || '',
        formatPhoneWithCountryCode(contact.hq_phone, contact.hq_country),
        contact.eligibility_status || '',
        escapeCSV(contact.eligibility_reason),
        contact.verification_status || '',
        contact.qa_status || '',
        contact.email_status || '',
        contact.suppressed ? 'Yes' : 'No',
        contact.source_type || '',
        contact.priority_score || '',
        contact.in_submission_buffer ? 'Yes' : 'No',
        contact.assignee_id || '',
        contact.address_enrichment_status || '',
        contact.phone_enrichment_status || '',
        contact.created_at || '',
        contact.updated_at || '',
        escapeCSV(contact.account_name),
        contact.account_domain || '',
        escapeCSV(contact.account_industry),
        contact.account_size || '',
        contact.account_revenue || '',
        formatPhoneWithCountryCode(contact.account_phone, contact.account_country),
        escapeCSV(contact.account_hq_street1),
        escapeCSV(contact.account_hq_street2),
        escapeCSV(contact.account_city),
        escapeCSV(contact.account_state),
        escapeCSV(contact.account_country),
        contact.account_postal || '',
      ];
      
      // Add contact custom fields
      sortedContactCustomFieldKeys.forEach(key => {
        const customFieldValue = contact.custom_fields?.[key] || '';
        // Format phone numbers for any phone-related custom field
        const isPhoneField = /phone|tel|mobile|fax/i.test(key);
        if (isPhoneField && customFieldValue) {
          row.push(formatPhoneWithCountryCode(customFieldValue, contact.contact_country));
        } else {
          row.push(escapeCSV(customFieldValue));
        }
      });
      
      // Add account custom fields
      sortedAccountCustomFieldKeys.forEach(key => {
        const customFieldValue = contact.account_custom_fields?.[key] || '';
        row.push(escapeCSV(customFieldValue));
      });
      
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="verification-contacts-${campaignId}-${new Date().toISOString()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("Error exporting contacts:", error);
    res.status(500).json({ error: "Failed to export contacts" });
  }
});

// Smart Template Export - Intelligently selects best phone and address from multiple sources
// Exports ALL eligible contacts (regardless of address completeness)
// Quality metrics are still tracked for reporting purposes
router.get("/api/verification-campaigns/:id/export-smart", requireAuth, requireDataExportAuthority, async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { templateId, markAsSubmitted } = req.query;
    
    // Import the smart data selection utility
    const { selectBestVerificationContactData } = await import("../lib/verification-best-data");
    const { 
      applyExportTemplate, 
      getDefaultSmartExportMapping, 
      contactToFieldMap 
    } = await import("../lib/apply-export-template");
    const { analyzeContactCompleteness } = await import("../lib/contact-completeness");
    const { verificationLeadSubmissions } = await import("@shared/schema");
    
    // Verify campaign exists
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    // Fetch template if provided
    let template = null;
    if (templateId && typeof templateId === 'string') {
      const [fetchedTemplate] = await db
        .select()
        .from(exportTemplates)
        .where(eq(exportTemplates.id, templateId))
        .limit(1);
      
      if (!fetchedTemplate) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      template = fetchedTemplate;
    }
    
    // Build filters from query params (mirror regular export logic)
    const {
      filter,
      fullName,
      email,
      title,
      phone,
      accountName,
      city,
      state,
      country,
      eligibilityStatus,
      verificationStatus,
      emailStatus,
      qaStatus,
      suppressed,
      customFields 
    } = req.query;

    // Build filter conditions
    const conditions: any[] = [sql`c.campaign_id = ${campaignId}`];
    
    // Preset filter (all, eligible, suppressed, submitted, client_ready)
    if (filter) {
      switch (filter) {
        case 'all':
          conditions.push(sql`c.deleted = FALSE`);
          break;
        case 'eligible':
          // ELIGIBLE FILTER: Only export cap-enforced contacts (reservedSlot = true)
          conditions.push(sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.eligibility_status = 'Eligible' AND c.reserved_slot = TRUE`);
          break;
        case 'suppressed':
          conditions.push(sql`c.deleted = FALSE AND c.suppressed = TRUE`);
          break;
        case 'validated':
          conditions.push(sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.verification_status = 'Validated'`);
          break;
        case 'ok_email':
          conditions.push(sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.email_status::text IN ('valid', 'acceptable')`);
          break;
        case 'invalid_email':
          conditions.push(sql`c.deleted = FALSE AND c.suppressed = FALSE AND c.verification_status = 'Invalid'`);
          break;
        case 'client_ready':
          // CLIENT-READY FILTER: Only export fully validated, eligible contacts with valid emails + Cap enforced (reservedSlot = true)
          // This enforces: Validated + Eligible + Valid email + Not suppressed + Cap enforced (excludes contacts beyond account caps)
          conditions.push(sql`c.deleted = FALSE 
            AND c.suppressed = FALSE 
            AND c.eligibility_status = 'Eligible' 
            AND c.reserved_slot = TRUE
            AND c.verification_status = 'Validated' 
            AND c.email_status::text IN ('valid', 'acceptable')`);
          break;
        case 'submitted':
          const submittedLeads = await db
            .select({ contactId: verificationLeadSubmissions.contactId })
            .from(verificationLeadSubmissions)
            .where(eq(verificationLeadSubmissions.campaignId, campaignId));
          
          const submittedIds = submittedLeads.map(l => l.contactId).filter(Boolean);
          
          if (submittedIds.length === 0) {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="verification-smart-template-${campaignId}-${new Date().toISOString()}.csv"`);
            return res.send('No contacts found');
          }
          
          conditions.push(sql`c.id IN (${sql.join(submittedIds.map(id => sql`${id}`), sql`, `)})`);
          break;
      }
    } else {
      // DEFAULT: Export cap-enforced Eligible + Validated contacts (reservedSlot = true)
      // Allow empty email_status (not yet validated) or valid emails, but exclude explicitly invalid
      conditions.push(sql`c.deleted = FALSE 
        AND c.suppressed = FALSE 
        AND c.eligibility_status = 'Eligible' 
        AND c.reserved_slot = TRUE
        AND c.verification_status = 'Validated' 
        AND (c.email_status::text IS NULL OR c.email_status::text = '' OR c.email_status::text IN ('valid', 'acceptable', 'unknown'))`);
    }

    // Advanced filters
    if (fullName) {
      conditions.push(sql`c.full_name ILIKE ${`%${fullName}%`}`);
    }
    if (email) {
      conditions.push(sql`c.email ILIKE ${`%${email}%`}`);
    }
    if (title) {
      conditions.push(sql`c.title ILIKE ${`%${title}%`}`);
    }
    if (phone) {
      conditions.push(sql`(c.phone ILIKE ${`%${phone}%`} OR c.mobile ILIKE ${`%${phone}%`})`);
    }
    if (accountName) {
      conditions.push(sql`a.name ILIKE ${`%${accountName}%`}`);
    }
    if (city) {
      conditions.push(sql`c.contact_city ILIKE ${`%${city}%`}`);
    }
    if (state) {
      conditions.push(sql`c.contact_state ILIKE ${`%${state}%`}`);
    }
    if (country) {
      conditions.push(sql`c.contact_country ILIKE ${`%${country}%`}`);
    }
    if (eligibilityStatus) {
      conditions.push(sql`c.eligibility_status = ${eligibilityStatus}`);
    }
    if (verificationStatus) {
      conditions.push(sql`c.verification_status = ${verificationStatus}`);
    }
    if (emailStatus) {
      conditions.push(sql`c.email_status::text = ${emailStatus}`);
    }
    if (qaStatus) {
      conditions.push(sql`c.qa_status = ${qaStatus}`);
    }
    if (suppressed !== undefined && suppressed !== 'all') {
      conditions.push(sql`c.suppressed = ${suppressed === 'true'}`);
    }

    // Custom fields filtering
    if (customFields && typeof customFields === 'string') {
      try {
        const customFieldsObj = JSON.parse(customFields);
        for (const [key, value] of Object.entries(customFieldsObj)) {
          if (value && typeof value === 'string') {
            const [entityType, fieldKey] = key.split('.');
            if (entityType === 'contact') {
              conditions.push(sql`c.custom_fields->>${fieldKey} ILIKE ${`%${value}%`}`);
            } else if (entityType === 'account') {
              conditions.push(sql`a.custom_fields->>${fieldKey} ILIKE ${`%${value}%`}`);
            }
          }
        }
      } catch (e) {
        console.error('Error parsing custom fields:', e);
      }
    }
    
    const whereClause = conditions.length > 0 
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;
    
    // Fetch all contacts with account data
    const result = await db.execute(sql`
      SELECT 
        c.id,
        c.account_id,
        c.full_name,
        c.first_name,
        c.last_name,
        c.title,
        c.email,
        c.phone,
        c.mobile,
        c.linkedin_url,
        c.cav_id,
        c.cav_user_id,
        c.contact_address1,
        c.contact_address2,
        c.contact_address3,
        c.contact_city,
        c.contact_state,
        c.contact_country,
        c.contact_postal,
        c.hq_address_1,
        c.hq_address_2,
        c.hq_address_3,
        c.hq_city,
        c.hq_state,
        c.hq_country,
        c.hq_postal,
        c.hq_phone,
        c.ai_enriched_address1,
        c.ai_enriched_address2,
        c.ai_enriched_address3,
        c.ai_enriched_city,
        c.ai_enriched_state,
        c.ai_enriched_country,
        c.ai_enriched_postal,
        c.ai_enriched_phone,
        c.eligibility_status,
        c.verification_status,
        c.email_status::text as email_status,
        c.suppressed,
        c.custom_fields,
        c.created_at,
        a.name as account_name,
        a.domain as account_domain,
        a.industry_standardized as account_industry,
        a.custom_fields as account_custom_fields
      FROM verification_contacts c
      LEFT JOIN accounts a ON a.id = c.account_id
      ${whereClause}
      ORDER BY c.updated_at DESC
    `);
    
    const contactsRaw = result.rows as any[];
    
    // Process all contacts and calculate quality metrics
    // All contacts pass through regardless of completeness
    const contactsToExport: any[] = [];
    const incompleteContacts: any[] = []; // For logging/reporting only
    
    for (const contact of contactsRaw) {
      // Pre-process smart data to check completeness
      const smartData = selectBestVerificationContactData({
        phone: contact.phone,
        mobile: contact.mobile,
        contactAddress1: contact.contact_address1,
        contactAddress2: contact.contact_address2,
        contactAddress3: contact.contact_address3,
        contactCity: contact.contact_city,
        contactState: contact.contact_state,
        contactCountry: contact.contact_country,
        contactPostal: contact.contact_postal,
        hqPhone: contact.hq_phone,
        hqAddress1: contact.hq_address_1,
        hqAddress2: contact.hq_address_2,
        hqAddress3: contact.hq_address_3,
        hqCity: contact.hq_city,
        hqState: contact.hq_state,
        hqCountry: contact.hq_country,
        hqPostal: contact.hq_postal,
        aiEnrichedPhone: contact.ai_enriched_phone,
        aiEnrichedAddress1: contact.ai_enriched_address1,
        aiEnrichedAddress2: contact.ai_enriched_address2,
        aiEnrichedAddress3: contact.ai_enriched_address3,
        aiEnrichedCity: contact.ai_enriched_city,
        aiEnrichedState: contact.ai_enriched_state,
        aiEnrichedCountry: contact.ai_enriched_country,
        aiEnrichedPostal: contact.ai_enriched_postal,
        customFields: contact.custom_fields,
      });
      
      const completeness = analyzeContactCompleteness(smartData);
      
      // Add ALL contacts to export (isClientReady is now always true)
      contactsToExport.push({ 
        ...contact, 
        _smartData: smartData,
        _qualityScore: completeness.qualityScore,
        _blankFields: completeness.blankFieldCount,
      });
      
      // Track incomplete contacts for reporting only (not for filtering)
      if (!completeness.isClientReady) {
        incompleteContacts.push({ 
          id: contact.id, 
          email: contact.email,
          missingFields: completeness.missingFields,
          blankFieldCount: completeness.blankFieldCount,
          qualityScore: completeness.qualityScore,
        });
      }
    }
    
    // Calculate quality metrics
    const avgQualityScore = contactsToExport.length > 0
      ? Math.round(contactsToExport.reduce((sum, c) => sum + (c._qualityScore || 0), 0) / contactsToExport.length)
      : 0;
    
    const perfectContacts = contactsToExport.filter(c => c._blankFields === 0).length;
    const goodContacts = contactsToExport.filter(c => c._blankFields === 1).length;
    const acceptableContacts = contactsToExport.filter(c => c._blankFields >= 2 && c._blankFields  0) {
      const contactIds = contactsToExport.map(c => c.id);
      
      // Insert submission records
      const submissionValues = contactsToExport.map(c => ({
        contactId: c.id,
        accountId: c.account_id,
        campaignId,
      }));
      
      try {
        await db.insert(verificationLeadSubmissions)
          .values(submissionValues)
          .onConflictDoNothing(); // Skip if already submitted
        
        console.log(`[SMART EXPORT] Marked ${contactsToExport.length} contacts as submitted`);
      } catch (error) {
        console.error('[SMART EXPORT] Error marking as submitted:', error);
        // Continue with export even if submission tracking fails
      }
    }
    
    // Generate Smart Template CSV
    const csvRows: string[] = [];
    
    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };
    
    // Get headers - use template if provided, otherwise use default
    let headers: string[];
    if (template) {
      // Template will be applied per-row, but we need headers first
      // Extract headers from template mappings
      const { columnOrder, fieldMappings } = template;
      const orderedKeys = columnOrder && columnOrder.length > 0 
        ? columnOrder 
        : Object.keys(fieldMappings);
      
      headers = orderedKeys
        .filter(key => key in fieldMappings)
        .map(key => fieldMappings[key]);
    } else {
      // Use default headers
      const defaultMapping = getDefaultSmartExportMapping();
      headers = defaultMapping.headers;
    }
    
    csvRows.push(headers.join(','));
    
    // Data rows with smart data selection (ONLY complete contacts)
    for (const contact of contactsToExport) {
      // Use cached smart data from completeness check
      const smartData = contact._smartData;
      
      let row: any[];
      
      if (template) {
        // Use template mapping
        const fieldMap = contactToFieldMap(contact, smartData, escapeCSV);
        const templateResult = applyExportTemplate(fieldMap, template);
        row = templateResult.row;
      } else {
        // Use default row format
        row = [
          contact.id,
          escapeCSV(contact.full_name),
          escapeCSV(contact.first_name),
          escapeCSV(contact.last_name),
          escapeCSV(contact.title),
          contact.email || '',
          contact.linkedin_url || '',
          contact.cav_id || '',
          contact.cav_user_id || '',
          // Smart selected fields
          smartData.phone.phoneFormatted || '',
          smartData.phone.source,
          escapeCSV(smartData.address.address.line1),
          escapeCSV(smartData.address.address.line2),
          escapeCSV(smartData.address.address.line3),
          escapeCSV(smartData.address.address.city),
          escapeCSV(smartData.address.address.state),
          escapeCSV(smartData.address.address.country),
          smartData.address.address.postal || '',
          smartData.address.source,
          // Account info
          escapeCSV(contact.account_name),
          contact.account_domain || '',
          escapeCSV(contact.account_industry),
          // Status
          contact.eligibility_status || '',
          contact.verification_status || '',
          contact.email_status || '',
          contact.suppressed ? 'Yes' : 'No',
          contact.created_at || '',
        ];
      }
      
      csvRows.push(row.join(','));
    }
    
    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="verification-smart-template-${campaignId}-${new Date().toISOString()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("Error exporting smart template:", error);
    res.status(500).json({ error: "Failed to export smart template" });
  }
});

// Submission Exclusion - Enforce 2-year exclusion for submitted contacts
router.post("/api/verification-campaigns/:id/enforce-submission-exclusion", async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // Verify campaign exists
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const { enforceSubmissionExclusion } = await import("../lib/submission-exclusion");
    const stats = await enforceSubmissionExclusion(campaignId);
    
    res.json({
      success: true,
      message: `Submission exclusion enforced`,
      stats,
    });
  } catch (error) {
    console.error("Error enforcing submission exclusion:", error);
    res.status(500).json({ error: "Failed to enforce submission exclusion" });
  }
});

// Continuous Enrichment - Identify and queue incomplete contacts for AI enrichment
router.post("/api/verification-campaigns/:id/identify-for-enrichment", async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { autoQueue = true } = req.body; // Auto-queue by default
    
    // Verify campaign exists
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const { identifyContactsForEnrichment, queueForEnrichment } = await import("../lib/continuous-enrichment");
    const result = await identifyContactsForEnrichment(campaignId);
    
    // Auto-queue for enrichment if requested (only contacts missing BOTH fields)
    let queuedCount = 0;
    if (autoQueue) {
      queuedCount = await queueForEnrichment(result.needsBothEnrichment);
    }
    
    res.json({
      success: true,
      message: autoQueue 
        ? `Queued ${queuedCount} contacts for enrichment (missing BOTH phone and address)`
        : `Identified ${result.stats.queued} contacts needing enrichment`,
      stats: result.stats,
      queued: result.needsBothEnrichment.length,
      queuedCount: autoQueue ? queuedCount : undefined,
    });
  } catch (error) {
    console.error("Error identifying contacts for enrichment:", error);
    res.status(500).json({ error: "Failed to identify contacts for enrichment" });
  }
});

// CAV Address & Phone Merger endpoint
router.post("/api/verification-campaigns/:id/merge-cav-data", async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // Verify campaign exists
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    // Dynamic import to avoid circular dependencies
    const { mergeCavAddressesForCampaign } = await import("../lib/cav-address-merger");
    
    // Run the merger
    const stats = await mergeCavAddressesForCampaign(campaignId);
    
    res.json({
      success: true,
      message: `CAV data merge complete`,
      stats: {
        processed: stats.processed,
        updated: stats.updated,
        skipped: stats.skipped,
        errors: stats.errors,
      },
      details: stats.details,
    });
  } catch (error) {
    console.error("Error merging CAV data:", error);
    res.status(500).json({ 
      error: "Failed to merge CAV data",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Backfill Account Domains from Contact Emails endpoint
router.post("/api/verification-campaigns/:id/backfill-domains", async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // Verify campaign exists
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    // Dynamic import to avoid circular dependencies
    const { backfillAccountDomainsForCampaign } = await import("../lib/backfill-account-domains");
    
    // Run the backfill
    const stats = await backfillAccountDomainsForCampaign(campaignId);
    
    res.json({
      success: true,
      message: `Domain backfill complete`,
      stats: {
        processed: stats.processed,
        updated: stats.updated,
        skipped: stats.skipped,
        errors: stats.errors,
      },
      details: stats.details,
    });
  } catch (error) {
    console.error("Error backfilling domains:", error);
    res.status(500).json({ 
      error: "Failed to backfill domains",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Smart Lead Cap Enforcement endpoint (BullMQ-based)
router.post("/api/verification-campaigns/:id/enforce-caps", async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // Verify campaign exists
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    // Get cap limit
    const cap = campaign.leadCapPerAccount || 10;
    
    // Import queue functions
    const { capEnforcementQueue, addCapEnforcementJob } = await import("../lib/cap-enforcement-queue");
    
    // Check if queue is available
    if (!capEnforcementQueue) {
      console.warn(`[API] Cap enforcement queue not available - falling back to direct execution`);
      
      // Fallback to direct execution (for development without Redis)
      res.status(202).json({
        success: true,
        message: "Smart cap enforcement started (direct execution - no Redis)",
        campaignId: campaignId,
        cap: cap,
        status: "processing",
      });
      
      const { enforceAccountCapWithPriority } = await import("../lib/verification-utils");
      setImmediate(async () => {
        try {
          const stats = await enforceAccountCapWithPriority(campaignId, cap);
          console.log(`[Cap Enforcement] Direct execution complete for campaign ${campaignId}:`, stats);
        } catch (error) {
          console.error(`[Cap Enforcement] Direct execution error for campaign ${campaignId}:`, error);
        }
      });
      return;
    }
    
    // Add job to BullMQ queue
    const jobId = await addCapEnforcementJob({ campaignId, cap });
    
    if (!jobId) {
      return res.status(500).json({
        error: "Failed to create cap enforcement job",
      });
    }
    
    console.log(`[API] Cap enforcement job ${jobId} queued for campaign ${campaignId} with cap ${cap}`);
    
    res.status(202).json({
      success: true,
      message: "Smart cap enforcement job queued",
      jobId: jobId,
      campaignId: campaignId,
      cap: cap,
      status: "queued",
    });
    
  } catch (error) {
    console.error("Error starting cap enforcement job:", error);
    res.status(500).json({ 
      error: "Failed to start cap enforcement job",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get Cap Enforcement Job Status endpoint
router.get("/api/cap-enforcement-jobs/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const { capEnforcementQueue, getCapEnforcementJobStatus } = await import("../lib/cap-enforcement-queue");
    
    // Check if queue is available
    if (!capEnforcementQueue) {
      return res.status(503).json({
        error: "Cap enforcement queue not available",
      });
    }
    
    // Get job status
    const status = await getCapEnforcementJobStatus(jobId);
    
    if (!status) {
      return res.status(404).json({
        error: "Job not found",
      });
    }
    
    res.json(status);
  } catch (error) {
    console.error("Error getting job status:", error);
    res.status(500).json({
      error: "Failed to get job status",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/verification-campaigns/:id/re-evaluate-eligibility
 * Re-evaluate eligibility for ALL contacts to fix data corruption
 * This checks geo/title requirements and marks non-matching contacts as Out_of_Scope
 */
router.post("/api/verification-campaigns/:id/re-evaluate-eligibility", async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    console.log(`[RE-EVALUATE] Starting eligibility re-evaluation for campaign ${campaignId}`);
    
    // Get campaign
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    // Get all contacts that are currently Eligible or Ineligible_Cap_Reached
    // (these are the ones that might have been incorrectly marked)
    const contacts = await db
      .select()
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.deleted, false),
          inArray(verificationContacts.eligibilityStatus, ['Eligible', 'Ineligible_Cap_Reached'])
        )
      );
    
    console.log(`[RE-EVALUATE] Found ${contacts.length} contacts to re-evaluate`);
    
    const { evaluateEligibility } = await import("../lib/verification-utils");
    
    let markedOutOfScope = 0;
    let remainEligible = 0;
    
    // Re-evaluate each contact
    for (const contact of contacts) {
      const result = evaluateEligibility(
        contact.title,
        contact.contactCountry,
        campaign,
        contact.email
      );
      
      // If contact should be Out_of_Scope, update it
      if (result.status === 'Out_of_Scope') {
        await db
          .update(verificationContacts)
          .set({
            eligibilityStatus: 'Out_of_Scope',
            eligibilityReason: result.reason,
            updatedAt: new Date(),
          })
          .where(eq(verificationContacts.id, contact.id));
        
        markedOutOfScope++;
      } else {
        remainEligible++;
      }
    }
    
    console.log(`[RE-EVALUATE] Complete: ${markedOutOfScope} marked Out_of_Scope, ${remainEligible} remain eligible`);
    
    res.json({
      success: true,
      message: `Re-evaluated ${contacts.length} contacts`,
      markedOutOfScope,
      remainEligible,
      totalProcessed: contacts.length,
    });
    
  } catch (error) {
    console.error("Error re-evaluating eligibility:", error);
    res.status(500).json({ 
      error: "Failed to re-evaluate eligibility",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get(
  "/api/verification-campaigns/:campaignId/workflow-progress",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;

      const [campaign] = await db
        .select()
        .from(verificationCampaigns)
        .where(eq(verificationCampaigns.id, campaignId));

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const [workflow] = await db
        .select()
        .from(verificationCampaignWorkflows)
        .where(eq(verificationCampaignWorkflows.campaignId, campaignId))
        .orderBy(sql`${verificationCampaignWorkflows.createdAt} DESC`)
        .limit(1);

      if (!workflow) {
        return res.json({
          exists: false,
          message: "No workflow has been initiated for this campaign",
        });
      }

      const [stats] = await db
        .select({
          total: sql`COUNT(*)`,
          eligible: sql`SUM(CASE WHEN ${verificationContacts.eligibilityStatus} = 'Eligible' THEN 1 ELSE 0 END)`,
          outOfScope: sql`SUM(CASE WHEN ${verificationContacts.eligibilityStatus} = 'Out_of_Scope' THEN 1 ELSE 0 END)`,
          needsEmailValidation: sql`SUM(CASE WHEN ${verificationContacts.emailStatus} IS NULL OR ${verificationContacts.emailStatus} = 'unknown' THEN 1 ELSE 0 END)`,
          needsAddressEnrichment: sql`SUM(CASE WHEN ${verificationContacts.contactAddress1} IS NULL OR ${verificationContacts.contactCity} IS NULL THEN 1 ELSE 0 END)`,
          needsPhoneEnrichment: sql`SUM(CASE WHEN ${verificationContacts.phone} IS NULL AND ${verificationContacts.mobile} IS NULL THEN 1 ELSE 0 END)`,
        })
        .from(verificationContacts)
        .where(
          and(
            eq(verificationContacts.campaignId, campaignId),
            eq(verificationContacts.deleted, false)
          )
        );

      // Lazy trigger: Auto-enrichment when viewing campaign stats
      let enrichmentTriggered = false;
      try {
        const { autoTriggerEnrichment } = await import('./verification-enrichment');
        const enrichResult = await autoTriggerEnrichment(campaignId);
        enrichmentTriggered = enrichResult.triggered;
        if (enrichResult.triggered) {
          console.log(`[WORKFLOW PROGRESS] Lazy enrichment trigger: ${enrichResult.reason}`);
        }
      } catch (error) {
        console.error(`[WORKFLOW PROGRESS] Auto-enrichment trigger failed:`, error);
      }

      res.json({
        exists: true,
        workflow: {
          id: workflow.id,
          campaignId: workflow.campaignId,
          currentStage: workflow.currentStage,
          status: workflow.status,
          startedAt: workflow.startedAt,
          completedAt: workflow.completedAt,
          updatedAt: workflow.updatedAt,
          eligibilityStats: workflow.eligibilityStats,
          emailValidationStats: workflow.emailValidationStats,
          addressEnrichmentStats: workflow.addressEnrichmentStats,
          phoneEnrichmentStats: workflow.phoneEnrichmentStats,
          errorMessage: workflow.errorMessage,
        },
        stats: {
          total: Number(stats.total) || 0,
          eligible: Number(stats.eligible) || 0,
          outOfScope: Number(stats.outOfScope) || 0,
          needsEmailValidation: Number(stats.needsEmailValidation) || 0,
          needsAddressEnrichment: Number(stats.needsAddressEnrichment) || 0,
          needsPhoneEnrichment: Number(stats.needsPhoneEnrichment) || 0,
        },
        autoEnrichmentTriggered: enrichmentTriggered,
      });
    } catch (error) {
      console.error("Error fetching workflow progress:", error);
      res.status(500).json({
        error: "Failed to fetch workflow progress",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Re-screen campaign eligibility
router.post("/api/verification-campaigns/:id/rescreen-eligibility", async (req, res) => {
  try {
    const campaignId = req.params.id;
    
    // Import the eligibility screening service
    const { screenCampaignEligibility } = await import("../services/eligibility-screening");
    
    console.log(`[Eligibility Rescreen] Starting re-screening for campaign ${campaignId}...`);
    
    const result = await screenCampaignEligibility(campaignId);
    
    console.log(`[Eligibility Rescreen] Complete: ${result.total} contacts, ${result.eligible} eligible, ${result.outOfScope} out of scope`);
    
    res.json({
      success: true,
      result: {
        total: result.total,
        eligible: result.eligible,
        ineligible: result.ineligible,
        suppressed: result.suppressed,
        outOfScope: result.outOfScope,
      },
      message: `Re-screened ${result.total} contacts: ${result.eligible} eligible, ${result.outOfScope} out of scope`
    });
  } catch (error) {
    console.error("Error re-screening eligibility:", error);
    res.status(500).json({ 
      error: "Failed to re-screen eligibility",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;