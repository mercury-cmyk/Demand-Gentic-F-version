import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
import { storage } from "../storage";
import { getTelnyxAiBridge, TelnyxCallEvent } from "../services/telnyx-ai-bridge";
import { AiAgentSettings, CallContext } from "../services/ai-voice-agent";
import { isVoiceVariablePreflightError } from "../services/voice-variable-contract";
import { validatePreflight, generatePreflightErrorResponse } from "../services/preflight-validator";
import { z } from "zod";
import { db } from "../db";
import { leads, suppressionPhones, campaignSuppressionAccounts, campaignQueue, contacts, virtualAgents, campaigns } from "@shared/schema";
import { eq, sql, inArray, and } from "drizzle-orm";
// OpenAI is loaded lazily to avoid startup failures when not configured
import { isWithinBusinessHours, getNextAvailableTime, BusinessHoursConfig, ContactTimezoneInfo, DEFAULT_BUSINESS_HOURS, US_FEDERAL_HOLIDAYS_2024_2025 } from "../utils/business-hours";
import { checkSuppressionBulk, getSuppressionReason } from "../lib/suppression.service";
import { getBestPhoneForContact } from "../lib/phone-utils";

const router = Router();

const generateScriptsSchema = z.object({
  campaignBrief: z.string().min(20, "Campaign brief must be at least 20 characters"),
  companyName: z.string().optional(),
  agentName: z.string().optional(),
  agentRole: z.string().optional(),
  industry: z.string().optional(),
});

router.post("/generate-scripts", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { campaignBrief, companyName, agentName, agentRole, industry } = generateScriptsSchema.parse(req.body);
    
    const systemPrompt = `You are an expert B2B telemarketing script writer. Your scripts are natural, conversational, and highly effective at qualifying leads and booking meetings.

Guidelines:
- Write scripts that sound natural when spoken aloud, not robotic
- Use conversational language, contractions, and natural pauses
- Include placeholder variables: {{firstName}}, {{lastName}}, {{companyName}}
- Keep responses concise - these are spoken scripts, not essays
- Focus on value proposition and pain points
- Be professional but warm and personable
- Avoid overly salesy or pushy language
- Include strategic pauses with "..." where appropriate

You must return a JSON object with exactly these fields:
- opening: The initial greeting and introduction (2-3 sentences)
- gatekeeper: How to professionally navigate past gatekeepers (2-3 responses)
- pitch: The main value proposition and call to action (3-5 sentences)
- objections: Common objection responses as a paragraph with multiple objection handles
- closing: How to book the meeting or next step (2-3 sentences)`;

    const userPrompt = `Generate optimized telemarketing scripts for the following campaign:

Campaign Brief: ${campaignBrief}
${companyName ? `Company: ${companyName}` : ''}
${agentName ? `Agent Name: ${agentName}` : ''}
${agentRole ? `Agent Role: ${agentRole}` : ''}
${industry ? `Target Industry: ${industry}` : ''}

Generate professional, natural-sounding scripts that will be used by an AI voice agent. Return ONLY a valid JSON object with these exact keys: opening, gatekeeper, pitch, objections, closing`;

    const hasOpenAI = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
    if (!hasOpenAI) {
      return res.status(503).json({
        success: false,
        message: "OpenAI is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY to enable script generation."
      });
    }
    const openai = await import("../lib/" + "openai").then(m => m.default);
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const scripts = JSON.parse(content);
    
    if (!scripts.opening || !scripts.gatekeeper || !scripts.pitch || !scripts.objections || !scripts.closing) {
      throw new Error("Invalid script structure returned");
    }

    res.json({
      success: true,
      scripts: {
        opening: scripts.opening,
        gatekeeper: scripts.gatekeeper,
        pitch: scripts.pitch,
        objections: scripts.objections,
        closing: scripts.closing,
      },
    });
  } catch (error) {
    console.error("[AI Calls] Error generating scripts:", error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    
    res.status(500).json({ 
      message: "Failed to generate scripts", 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

const initiateAiCallSchema = z.object({
  campaignId: z.string(),
  queueItemId: z.string(),
  contactId: z.string(),
});

router.post("/initiate", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { campaignId, queueItemId, contactId } = initiateAiCallSchema.parse(req.body);

    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    if (campaign.dialMode !== "ai_agent") {
      return res.status(400).json({ message: "Campaign is not configured for AI agent mode" });
    }

    const aiSettings = campaign.aiAgentSettings as AiAgentSettings;
    if (!aiSettings) {
      return res.status(400).json({ message: "AI agent settings not configured for this campaign" });
    }

    const contact = await storage.getContact(contactId);
    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }

    const account = contact.accountId ? await storage.getAccount(contact.accountId) : null;

    // ============================================================================
    // PREFLIGHT VALIDATION: Check for required variables BEFORE initiating call
    // ============================================================================
    const preflightData = {
      agent: {
        name: (aiSettings as any).agentName || campaign.name || "Assistant",
      },
      org: {
        name: account?.name || campaign.name || "Unknown Org",
      },
      contact: {
        full_name: contact.fullName || contact.firstName || "Unknown",
        first_name: contact.firstName || contact.fullName?.split(" ")[0] || "Unknown",
        job_title: (contact as any).jobTitle || (contact as any).title || "Unknown",
        email: contact.email,
      },
      account: {
        name: account?.name || "Unknown Account",
      },
      system: {
        caller_id: (aiSettings as any).callerId || campaign.name || "1234567890",
        called_number: (contact as any).phone || (contact as any).cavTel || (contact as any).mobilePhone || "Unknown",
        time_utc: new Date().toISOString(),
      },
      callContext: {
        followUpEnabled: (aiSettings as any).followUpEnabled || false,
      },
    };

    const preflightValidation = validatePreflight(preflightData);
    if (!preflightValidation.isValid) {
      const errorResponse = generatePreflightErrorResponse(preflightValidation);
      return res.status(errorResponse.statusCode).json(errorResponse.body);
    }

    // Check business hours before initiating call
    const businessHoursSettings = (aiSettings as any).businessHours;
    if (businessHoursSettings?.enabled !== false) {
      const businessHoursConfig: BusinessHoursConfig = {
        enabled: true,
        timezone: businessHoursSettings?.timezone || DEFAULT_BUSINESS_HOURS.timezone,
        operatingDays: businessHoursSettings?.operatingDays || DEFAULT_BUSINESS_HOURS.operatingDays,
        startTime: businessHoursSettings?.startTime || DEFAULT_BUSINESS_HOURS.startTime,
        endTime: businessHoursSettings?.endTime || DEFAULT_BUSINESS_HOURS.endTime,
        respectContactTimezone: businessHoursSettings?.respectContactTimezone ?? true,
        excludedDates: US_FEDERAL_HOLIDAYS_2024_2025,
      };

      const contactTimezoneInfo: ContactTimezoneInfo = {
        timezone: (contact as any).timezone,
        city: (contact as any).city || (contact as any).contactCity,
        state: (contact as any).state || (contact as any).contactState,
        country: (contact as any).country,
      };

      if (!isWithinBusinessHours(businessHoursConfig, contactTimezoneInfo)) {
        const nextAvailable = getNextAvailableTime(businessHoursConfig, contactTimezoneInfo);
        return res.status(400).json({
          message: "Outside business hours for contact's timezone",
          outsideBusinessHours: true,
          nextAvailableTime: nextAvailable ? nextAvailable.toISOString() : null,
          contactTimezone: contactTimezoneInfo.state || contactTimezoneInfo.country || 'Unknown',
          suggestion: "This contact will be called when business hours resume in their local timezone.",
        });
      }
    }

    const phoneNumber = (contact as any).phone || (contact as any).cavTel || (contact as any).mobilePhone;
    if (!phoneNumber) {
      return res.status(400).json({ message: "Contact has no phone number" });
    }

      const context: CallContext = {
        contactFirstName: contact.firstName || "there",
        contactLastName: contact.lastName || "",
        contactTitle: (contact as any).title || (contact as any).jobTitle || "Decision Maker",
        contactEmail: contact.email || "",
        companyName: account?.name || (contact as any).companyNameOverride || "your company",
        phoneNumber,
        campaignId,
        queueItemId,
        agentFullName: aiSettings.persona?.name || "your representative",
      };

    const bridge = getTelnyxAiBridge();
    
    const fromNumber = process.env.TELNYX_FROM_NUMBER || "";
    if (!fromNumber) {
      return res.status(500).json({ message: "Outbound phone number not configured" });
    }

    // PRE-LOCK if queueItemId is present
    if (queueItemId && queueItemId !== 'test-queue-item') {
      await db.execute(sql`
        UPDATE campaign_queue 
        SET status = 'in_progress', updated_at = NOW()
        WHERE id = ${queueItemId}
      `);
    }

    try {
      const { callId, callControlId } = await bridge.initiateAiCall(
        phoneNumber,
        fromNumber,
        aiSettings,
        context
      );

      res.json({
        success: true,
        callId,
        callControlId,
        message: "AI call initiated successfully",
      });
    } catch (error) {
      // Revert lock on failure
      if (queueItemId && queueItemId !== 'test-queue-item') {
        const isWhitelistError = error instanceof Error && error.message.includes('Whitelist Error');
        if (isWhitelistError) {
          await db.execute(sql`
            UPDATE campaign_queue 
            SET status = 'removed', removed_reason = 'country_not_whitelisted', updated_at = NOW()
            WHERE id = ${queueItemId}
          `);
        } else {
          // CRITICAL FIX: Add cooldown to prevent immediate retry (back-to-back calls)
          await db.execute(sql`
            UPDATE campaign_queue
            SET status = 'queued',
                next_attempt_at = NOW() + INTERVAL '5 minutes',
                updated_at = NOW()
            WHERE id = ${queueItemId}
          `);
        }
      }
      throw error;
    }
  } catch (error) {
    console.error("[AI Calls] Error initiating call:", error);
    if (isVoiceVariablePreflightError(error)) {
      return res.status(422).json({
        message: "Voice variable preflight failed",
        missingKeys: error.result.missingKeys,
        invalidKeys: error.result.invalidKeys,
        contractVersion: error.result.contractVersion,
      });
    }
    res.status(500).json({ message: "Failed to initiate AI call", error: String(error) });
  }
});

// Batch call endpoint - start multiple AI calls from a campaign
const batchCallSchema = z.object({
  campaignId: z.string(),
  limit: z.number().min(1).max(50).default(10),
  delayBetweenCalls: z.number().min(1000).max(30000).default(3000),
});

router.post("/batch-start", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { campaignId, limit, delayBetweenCalls } = batchCallSchema.parse(req.body);

    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    if (campaign.dialMode !== "ai_agent") {
      return res.status(400).json({ message: "Campaign is not configured for AI agent mode" });
    }

    const aiSettings = campaign.aiAgentSettings as AiAgentSettings;
    if (!aiSettings) {
      return res.status(400).json({ message: "AI agent settings not configured" });
    }

    const fromNumber = process.env.TELNYX_FROM_NUMBER || "";
    if (!fromNumber) {
      return res.status(500).json({ message: "Outbound phone number not configured" });
    }

    const bridge = getTelnyxAiBridge();
    const queueStatus = bridge.getQueueStatus();
    
    console.log(`[AI Batch] Starting batch calls for campaign ${campaignId}, limit: ${limit}`);
    console.log(`[AI Batch] Current queue status: ${JSON.stringify(queueStatus)}`);

    const results: Array<{
      contactId: string;
      queueItemId: string;
      status: string;
      callId?: string;
      error?: string;
      skipReason?: string;
      missingKeys?: string[];
      invalidKeys?: string[];
    }> = [];
    let callsInitiated = 0;
    let skippedDnc = 0;
    let skippedSuppression = 0;
    let skippedAccountCap = 0;
    let skippedNoPhone = 0;

    const queueItems = await storage.getCampaignQueue(campaignId, "queued");
    const now = new Date();
    
    // Pre-filter items with phones and respect scheduled retry times
    const itemsWithPhones = queueItems.filter((item: any) => {
      const phone = item.phone || item.phoneNumber || item.contact?.phoneNumber;
      if (!phone || item.status !== "queued") return false;
      
      // Check if contact has a scheduled retry time that hasn't arrived yet
      if (item.nextAttemptAt) {
        const nextAttempt = new Date(item.nextAttemptAt);
        if (nextAttempt > now) {
          return false; // Skip - retry time not yet reached
        }
      }
      
      return true;
    });
    
    console.log(`[AI Batch] Found ${itemsWithPhones.length} queue items with phones out of ${queueItems.length} total`);
    
    // ==================== COMPLIANCE CHECKS (Same as manual campaigns) ====================
    
    // 1. Get all contact IDs for bulk suppression check
    const contactIds = itemsWithPhones
      .filter((item: any) => item.contactId)
      .map((item: any) => item.contactId);
    
    // 2. Bulk check global suppression list (email + name/company hash)
    const suppressionResults = contactIds.length > 0 
      ? await checkSuppressionBulk(contactIds) 
      : new Map<string, string | null>();
    
    // 3. Bulk check global phone DNC list
    const uniquePhones = new Set<string>();
    const phoneToItemMap = new Map<string, Set<string>>(); // phone -> Set of queueItemIds
    
    for (const item of itemsWithPhones) {
      const phone = item.phone || item.phoneNumber || item.contact?.phoneNumber;
      if (phone) {
        // Normalize phone for DNC check
        const normalizedPhone = phone.replace(/[^\d+]/g, '');
        const e164Phone = normalizedPhone.startsWith('+') ? normalizedPhone : '+' + normalizedPhone.replace(/^0+/, '');
        uniquePhones.add(e164Phone);
        if (!phoneToItemMap.has(e164Phone)) {
          phoneToItemMap.set(e164Phone, new Set());
        }
        phoneToItemMap.get(e164Phone)!.add(item.id);
      }
    }
    
    // Check phones against DNC list
    const dncPhones = new Set<string>();
    if (uniquePhones.size > 0) {
      const phonesArray = Array.from(uniquePhones);
      const batchSize = 500;
      for (let i = 0; i < phonesArray.length; i += batchSize) {
        const batch = phonesArray.slice(i, i + batchSize);
        const suppressedPhones = await db.select({ phoneE164: suppressionPhones.phoneE164 })
          .from(suppressionPhones)
          .where(inArray(suppressionPhones.phoneE164, batch));
        for (const row of suppressedPhones) {
          dncPhones.add(row.phoneE164);
        }
      }
    }
    console.log(`[AI Batch] DNC check: ${dncPhones.size} phones on Do Not Call list`);
    
    // 4. Check account-level suppression for this campaign
    const suppressedAccountIds = new Set<string>();
    const accountIds = [...new Set(itemsWithPhones.filter((item: any) => item.accountId).map((item: any) => item.accountId))];
    if (accountIds.length > 0) {
      const suppressedAccounts = await db.select({ accountId: campaignSuppressionAccounts.accountId })
        .from(campaignSuppressionAccounts)
        .where(and(
          eq(campaignSuppressionAccounts.campaignId, campaignId),
          inArray(campaignSuppressionAccounts.accountId, accountIds)
        ));
      for (const row of suppressedAccounts) {
        suppressedAccountIds.add(row.accountId);
      }
    }
    console.log(`[AI Batch] Account suppression: ${suppressedAccountIds.size} accounts suppressed for this campaign`);
    
    // 5. Batch-fetch contact data for phone country validation (avoid N+1 queries)
    const contactIdsToFetch = itemsWithPhones
      .filter((item: any) => item.contactId)
      .map((item: any) => item.contactId);
    
    const contactsMap = new Map<string, any>();
    if (contactIdsToFetch.length > 0) {
      // Batch fetch contacts using Drizzle's inArray for safe parameterized queries
      const batchSize = 100;
      for (let i = 0; i < contactIdsToFetch.length; i += batchSize) {
        const batch = contactIdsToFetch.slice(i, i + batchSize);
        const contactsResult = await db.select({
          id: contacts.id,
          directPhone: contacts.directPhone,
          directPhoneE164: contacts.directPhoneE164,
          mobilePhone: contacts.mobilePhone,
          mobilePhoneE164: contacts.mobilePhoneE164,
          country: contacts.country,
        }).from(contacts).where(inArray(contacts.id, batch));
        for (const contact of contactsResult) {
          contactsMap.set(contact.id, {
            directPhone: contact.directPhone,
            directPhoneE164: contact.directPhoneE164,
            mobilePhone: contact.mobilePhone,
            mobilePhoneE164: contact.mobilePhoneE164,
            country: contact.country,
          });
        }
      }
    }
    console.log(`[AI Batch] Batch-fetched ${contactsMap.size} contacts for phone validation`);
    
    // 6. Filter eligible items with all compliance checks
    const eligibleItems: any[] = [];
    for (const item of itemsWithPhones) {
      const phone = item.phone || item.phoneNumber || item.contact?.phoneNumber;
      const normalizedPhone = phone.replace(/[^\d+]/g, '');
      const e164Phone = normalizedPhone.startsWith('+') ? normalizedPhone : '+' + normalizedPhone.replace(/^0+/, '');
      
      // Check global suppression
      if (item.contactId && suppressionResults.get(item.contactId)) {
        const reason = `suppressed:${suppressionResults.get(item.contactId)}`;
        console.log(`[AI Batch] Skipping ${item.id}: contact suppressed (${suppressionResults.get(item.contactId)})`);
        skippedSuppression++;
        results.push({ contactId: item.contactId, queueItemId: item.id, status: "skipped", skipReason: reason });
        // Mark as removed from queue with reason (same as manual campaigns)
        await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = ${reason}, updated_at = NOW() WHERE id = ${item.id}`);
        continue;
      }
      
      // Check phone DNC
      if (dncPhones.has(e164Phone)) {
        const reason = 'dnc:global_phone_list';
        console.log(`[AI Batch] Skipping ${item.id}: phone on DNC list`);
        skippedDnc++;
        results.push({ contactId: item.contactId || item.id, queueItemId: item.id, status: "skipped", skipReason: "dnc" });
        await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = ${reason}, updated_at = NOW() WHERE id = ${item.id}`);
        continue;
      }
      
      // Check account suppression
      if (item.accountId && suppressedAccountIds.has(item.accountId)) {
        const reason = 'account_cap:campaign_suppressed';
        console.log(`[AI Batch] Skipping ${item.id}: account suppressed for this campaign`);
        skippedAccountCap++;
        results.push({ contactId: item.contactId || item.id, queueItemId: item.id, status: "skipped", skipReason: "account_cap" });
        await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = ${reason}, updated_at = NOW() WHERE id = ${item.id}`);
        continue;
      }
      
      // Phone country matching validation (same as manual campaigns)
      // Use batch-fetched contact data to avoid N+1 queries
      if (item.contactId && contactsMap.has(item.contactId)) {
        const contact = contactsMap.get(item.contactId);
        const bestPhone = getBestPhoneForContact(contact);
        
        if (!bestPhone.phone) {
          console.log(`[AI Batch] Skipping ${item.id}: no valid phone matching contact's country`);
          skippedNoPhone++;
          results.push({ contactId: item.contactId, queueItemId: item.id, status: "skipped", skipReason: "phone_country_mismatch" });
          continue; // Don't remove from queue - might get valid phone later via enrichment
        }
      }
      
      eligibleItems.push(item);
      if (eligibleItems.length >= limit) break;
    }

    console.log(`[AI Batch] After compliance checks: ${eligibleItems.length} eligible (skipped: ${skippedSuppression} suppressed, ${skippedDnc} DNC, ${skippedAccountCap} account cap, ${skippedNoPhone} phone mismatch)`);

    console.log(`[AI Batch] Found ${eligibleItems.length} eligible queue items out of ${queueItems.length} total`);

    for (const item of eligibleItems) {
      try {
        const phoneNumber = item.phone || item.phoneNumber || item.contact?.phoneNumber;
        const contactId = item.contactId;
        const contact = contactId ? await storage.getContact(contactId) : null;
        const account = contact?.accountId ? await storage.getAccount(contact.accountId) : null;

          const context: CallContext = {
            contactFirstName: item.firstName || contact?.firstName || "there",
            contactLastName: item.lastName || contact?.lastName || "",
            contactTitle: item.title || (contact as any)?.title || (contact as any)?.jobTitle || "Decision Maker",
            contactEmail: item.email || contact?.email || "",
            companyName: item.companyName || account?.name || "your company",
            phoneNumber,
            campaignId,
            contactId: contactId || undefined,
            queueItemId: item.id,
            agentFullName: aiSettings.persona?.name || "your representative",
            virtualAgentId: (item as any).virtualAgentId || undefined,
          };

        // PRE-LOCK: Lock the queue item before initiating the call to prevent race conditions
        // where the call is answered and tries to connect to WebSocket before we update status.
        await db.execute(sql`
          UPDATE campaign_queue 
          SET status = 'in_progress', 
              updated_at = NOW(),
              enqueued_reason = COALESCE(enqueued_reason, '') || '|locking:' || to_char(NOW(), 'HH24:MI:SS')
          WHERE id = ${item.id}
        `);

        try {
          const { callId } = await bridge.initiateAiCall(phoneNumber, fromNumber, aiSettings, context);
          
          results.push({ contactId: contactId || item.id, queueItemId: item.id, status: "initiated", callId });
          callsInitiated++;
          
          console.log(`[AI Batch] Call ${callsInitiated}/${limit} initiated for queue item ${item.id}`);

          if (callsInitiated < eligibleItems.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
          }
        } catch (initiateError: any) {
          // If initiation failed, we MUST release the lock or mark as permanently failed
          const isWhitelistError = initiateError.message?.includes('Whitelist Error');
          
          if (isWhitelistError) {
            console.error(`[AI Batch] Permanent failure for ${item.id}: ${initiateError.message}`);
            await db.execute(sql`
              UPDATE campaign_queue 
              SET status = 'removed', 
                  removed_reason = 'country_not_whitelisted',
                  updated_at = NOW()
              WHERE id = ${item.id}
            `);
            results.push({ contactId: contactId || item.id, queueItemId: item.id, status: "failed_whitelist", error: initiateError.message });
          } else {
            // Revert to queued for transient errors
            // CRITICAL FIX: Add cooldown to prevent immediate retry (back-to-back calls)
            await db.execute(sql`
              UPDATE campaign_queue
              SET status = 'queued',
                  next_attempt_at = NOW() + INTERVAL '5 minutes',
                  updated_at = NOW()
              WHERE id = ${item.id}
            `);
            throw initiateError; // Let the outer catch handle and log it
          }
        }
      } catch (error) {
        if (isVoiceVariablePreflightError(error)) {
          const missing = error.result.missingKeys.join(",");
          const invalid = error.result.invalidKeys.join(",");
          console.warn(`[AI Batch] Preflight failed for ${item.id}: missing=${missing || "none"}, invalid=${invalid || "none"}`);

          try {
            await db.execute(sql`
              UPDATE campaign_queue
              SET status = 'queued',
                  next_attempt_at = NOW() + INTERVAL '7 days',
                  enqueued_reason = COALESCE(enqueued_reason, '') || '|missing_fields:' || ${missing || "none"} || '|invalid_fields:' || ${invalid || "none"},
                  updated_at = NOW()
              WHERE id = ${item.id}
            `);
          } catch (updateError) {
            console.error(`[AI Batch] Failed to mark missing-field hold for ${item.id}:`, updateError);
          }

          results.push({
            contactId: item.contactId || item.id,
            queueItemId: item.id,
            status: "blocked_missing_fields",
            missingKeys: error.result.missingKeys,
            invalidKeys: error.result.invalidKeys,
          });
          continue;
        }

        console.error(`[AI Batch] Failed to call queue item ${item.id}:`, error);
        results.push({ contactId: item.contactId || item.id, queueItemId: item.id, status: "failed", error: String(error) });
      }
    }

    res.json({
      success: true,
      message: `Batch calling started: ${callsInitiated} calls initiated`,
      totalQueueItems: queueItems.length,
      itemsWithPhones: itemsWithPhones.length,
      eligibleItems: eligibleItems.length,
      callsInitiated,
      complianceSkipped: {
        dnc: skippedDnc,
        suppression: skippedSuppression,
        accountCap: skippedAccountCap,
        phoneCountryMismatch: skippedNoPhone,
        total: skippedDnc + skippedSuppression + skippedAccountCap + skippedNoPhone,
      },
      results,
    });
  } catch (error) {
    console.error("[AI Calls] Batch start error:", error);
    res.status(500).json({ message: "Failed to start batch calls", error: String(error) });
  }
});

router.post("/webhook", async (req, res) => {
  try {
    // Always respond immediately to Telnyx
    res.status(200).send("OK");

    const event = req.body as TelnyxCallEvent;
    
    // DEBUG: Log the complete webhook payload to understand structure
    console.log(`[AI Webhook] COMPLETE PAYLOAD:`, JSON.stringify(req.body, null, 2).substring(0, 500));
    
    // Extract event data - handle different Telnyx payload formats
    const eventData: any = event.data || event;
    const eventType = eventData.event_type || event.event_type;
    const payload = eventData.payload || eventData;
    
    console.log(`[AI Webhook] Received event: ${eventType}`, JSON.stringify({
      call_control_id: payload?.call_control_id,
      state: payload?.state,
      direction: payload?.direction,
    }));
    
    // Check if this is an OpenAI Realtime call by looking at client_state
    let clientState: any = null;
    if (payload?.client_state) {
      try {
        clientState = JSON.parse(Buffer.from(payload.client_state, 'base64').toString('utf-8'));
      } catch (e) {
        // Not base64 encoded or invalid JSON
      }
    }
    
    // TeXML calls handle streaming automatically via <Stream bidirectionalMode="rtp" />
    // No need to call streaming_start - just log the event for debugging
    if (clientState?.provider === 'openai_realtime' && eventType === 'call.answered') {
      console.log(`[AI Webhook] OpenAI Realtime TeXML call answered: ${payload?.call_control_id}`);
      console.log(`[AI Webhook] Streaming handled automatically by TeXML <Stream> verb`);
      return; // TeXML handles everything, don't pass to bridge
    }

    const bridge = getTelnyxAiBridge();
    await bridge.handleWebhookEvent(event);
  } catch (error) {
    console.error("[AI Calls] Webhook error:", error);
  }
});

// Audio serving endpoint for OpenAI TTS audio files
router.get("/audio/:audioId", (req, res) => {
  const { audioId } = req.params;
  const bridge = getTelnyxAiBridge();
  const audio = bridge.getAudio(audioId);
  
  if (!audio) {
    console.log(`[AI Audio] Audio not found: ${audioId}`);
    return res.status(404).send("Audio not found");
  }
  
  console.log(`[AI Audio] Serving audio: ${audioId} (${audio.length} bytes)`);
  res.set({
    "Content-Type": "audio/mpeg",
    "Content-Length": audio.length.toString(),
    "Cache-Control": "no-cache",
  });
  res.send(audio);
});

// Test call endpoint - for testing AI agent scripts without a full campaign
const testCallSchema = z.object({
  phoneNumber: z.string().min(10, "Valid phone number required"),
  contactFirstName: z.string().optional().default("Test"),
  contactLastName: z.string().optional().default("User"),
  contactTitle: z.string().optional().default("Decision Maker"),
  companyName: z.string().optional().default("Test Company"),
  campaignId: z.string().optional(), // Optional - will use campaign settings if provided
});

router.post("/test-call", requireAuth, requireRole("admin", "campaign_manager"), async (req, res) => {
  try {
    const { phoneNumber, contactFirstName, contactLastName, contactTitle, companyName, campaignId } = testCallSchema.parse(req.body);
    
    const fromNumber = process.env.TELNYX_FROM_NUMBER || "";
    if (!fromNumber) {
      return res.status(500).json({ message: "Outbound phone number (TELNYX_FROM_NUMBER) not configured" });
    }

    let aiSettings: AiAgentSettings;
    
    if (campaignId) {
      // Use campaign's AI settings
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      if (!campaign.aiAgentSettings) {
        return res.status(400).json({ message: "Campaign has no AI agent settings" });
      }
      aiSettings = campaign.aiAgentSettings as AiAgentSettings;
    } else {
      // Default test settings
      aiSettings = {
        persona: {
          name: "Sarah",
          companyName: "Pivotal B2B",
          role: "Business Development Representative",
          voice: "alloy",
        },
        scripts: {
          opening: `Hi, this is Sarah from Pivotal B2B. I'm reaching out to speak with ${contactFirstName} regarding a quick business opportunity. Is this a good time?`,
          gatekeeper: "I'm calling about a business matter for the decision maker. Could you help me reach them, or take a message?",
          pitch: "We help companies like yours improve their sales efficiency through AI-powered solutions. I'd love to schedule a brief 15-minute call to show you how we've helped similar businesses increase their qualified leads by 40%.",
          objections: "I completely understand if now isn't the right time. Many of our best clients initially felt the same way. Would it make sense to schedule a brief call for next week instead?",
          closing: "Great! What day works best for a quick 15-minute call - would Tuesday or Wednesday be better for you?",
        },
        handoff: {
          enabled: false,
          triggers: [],
          transferNumber: "",
        },
        gatekeeperLogic: {
          maxAttempts: 2,
        },
      };
    }

    const context: CallContext = {
      contactFirstName,
      contactLastName,
      contactTitle: contactTitle || "Decision Maker",
      companyName,
      phoneNumber,
      campaignId: campaignId || "test-call",
      queueItemId: "test-queue-item",
      agentFullName: aiSettings.persona?.name || "Sarah",
    };

    console.log("[AI Test Call] Initiating test call to:", phoneNumber);
    console.log("[AI Test Call] Using from number:", fromNumber);
    console.log("[AI Test Call] AI Settings:", JSON.stringify(aiSettings.persona, null, 2));

    const bridge = getTelnyxAiBridge();
    const { callId, callControlId } = await bridge.initiateAiCall(
      phoneNumber,
      fromNumber,
      aiSettings,
      context,
      'openai_realtime'
    );

    res.json({
      success: true,
      callId,
      callControlId,
      message: "Test call initiated - your phone should ring shortly!",
      fromNumber,
      toNumber: phoneNumber,
    });
  } catch (error) {
    console.error("[AI Test Call] Error:", error);
    res.status(500).json({ 
      message: "Failed to initiate test call", 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

router.get("/active", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const bridge = getTelnyxAiBridge();
    const count = bridge.getActiveCallsCount();
    
    res.json({
      activeCallsCount: count,
    });
  } catch (error) {
    console.error("[AI Calls] Error getting active calls:", error);
    res.status(500).json({ message: "Failed to get active calls" });
  }
});

router.get("/campaign/:campaignId/stats", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    if (campaign.dialMode !== "ai_agent") {
      return res.status(400).json({ message: "Campaign is not in AI agent mode" });
    }

    const campaignLeads = await db.select().from(leads).where(eq(leads.campaignId, campaignId));
    
    const aiLeads = campaignLeads.filter((l) => {
      const notes = l.notes || "";
      const customFields = l.customFields as Record<string, any> | null;
      return notes.includes("[AI Agent Call]") || customFields?.aiCallId;
    });

    const stats = {
      totalAiCalls: aiLeads.length,
      qualified: aiLeads.filter((l) => l.qaStatus === "approved").length,
      handoffs: aiLeads.filter((l) => {
        const cf = l.customFields as Record<string, any> | null;
        return cf?.aiHandoff === true;
      }).length,
      gatekeeperNavigations: aiLeads.filter((l) => {
        const cf = l.customFields as Record<string, any> | null;
        return cf?.aiPhase === "gatekeeper" || (cf?.aiGatekeeperAttempts && cf.aiGatekeeperAttempts > 0);
      }).length,
      voicemails: aiLeads.filter((l) => {
        const cf = l.customFields as Record<string, any> | null;
        return cf?.aiDisposition === "voicemail";
      }).length,
      noAnswer: aiLeads.filter((l) => {
        const cf = l.customFields as Record<string, any> | null;
        return cf?.aiDisposition === "no-answer";
      }).length,
      connected: aiLeads.filter((l) => {
        const cf = l.customFields as Record<string, any> | null;
        return cf?.aiDisposition === "connected" || cf?.aiPhase === "pitch" || cf?.aiPhase === "closing";
      }).length,
    };

    res.json(stats);
  } catch (error) {
    console.error("[AI Calls] Error getting campaign stats:", error);
    res.status(500).json({ message: "Failed to get campaign stats" });
  }
});

router.post("/test-voice", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { voice, text } = req.body;
    
    if (!voice || !text) {
      return res.status(400).json({ message: "Voice and text are required" });
    }

    res.json({
      success: true,
      message: "Voice test endpoint ready - requires OpenAI TTS integration",
      voice,
      textLength: text.length,
    });
  } catch (error) {
    console.error("[AI Calls] Error testing voice:", error);
    res.status(500).json({ message: "Failed to test voice" });
  }
});

/**
 * Helper to generate a public WebSocket URL for Telnyx media streaming.
 * This fixes the issue where Telnyx cannot reach 'localhost'.
 */
function getPublicWsUrl(req: any, path: string): string {
  let host = req.get('X-Public-Host') || req.get('host') || 'localhost:5000';
  
  if (process.env.PUBLIC_WEBSOCKET_URL) {
    try {
      const url = new URL(process.env.PUBLIC_WEBSOCKET_URL);
      host = url.host;
    } catch {
      // Fallback if the env var is just a hostname/domain
      host = process.env.PUBLIC_WEBSOCKET_URL.replace(/^wss?:\/\//, '').split('/')[0];
    }
  }

  const protocol = host.includes('localhost') ? 'ws' : 'wss';
  
  if (host.includes('localhost')) {
    console.warn(`[AI Calls] ⚠️  CRITICAL: Using localhost for ${path}. Telnyx cannot reach this! Use ngrok and set PUBLIC_WEBSOCKET_URL.`);
  }
  
  return `${protocol}://${host}${path}`;
}

/**
 * Test endpoint for Voice Dialer calls (Gemini/OpenAI)
 * POST /api/ai/test-openai-realtime
 * 
 * This initiates a test call using the Voice Dialer (supports Gemini Live or OpenAI Realtime)
 * by making a Telnyx call with media streaming to the /voice-dialer WebSocket
 */
const testOpenAIRealtimeSchema = z.object({
  phoneNumber: z.string().min(10, "Phone number required"),
  virtualAgentId: z.string().optional(),
  campaignId: z.string().optional(),
  systemPrompt: z.string().optional(),
  firstMessage: z.string().optional(),
  voice: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

router.post("/test-openai-realtime", requireAuth, requireRole("admin", "campaign_manager"), async (req, res) => {
  try {
    const {
      phoneNumber,
      virtualAgentId,
      campaignId,
      systemPrompt: systemPromptOverride,
      firstMessage: firstMessageOverride,
      voice: voiceOverride,
      settings: settingsOverride,
    } = testOpenAIRealtimeSchema.parse(req.body);

    // Load SIP trunk config from UI (default trunk), fallback to env vars
    const sipConfig = await storage.getDefaultSipTrunkConfig();
    const sipProvider = (sipConfig?.provider || process.env.SIP_TRUNK_PROVIDER || "telnyx").toLowerCase();

    if (sipProvider !== "telnyx") {
      return res.status(400).json({
        message: "AI Call Test currently supports Telnyx call control only.",
        recommendation: "Set the default SIP trunk provider to telnyx or use TELNYX_* environment variables."
      });
    }

    // Check required environment variables
    const telnyxApiKey = process.env.TELNYX_API_KEY;
    const fromNumber = sipConfig?.callerIdNumber || process.env.TELNYX_FROM_NUMBER;
    const openaiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const connectionId =
      process.env.TELNYX_TEXML_APP_ID ||
      sipConfig?.connectionId ||
      process.env.TELNYX_CALL_CONTROL_APP_ID ||
      process.env.TELNYX_CONNECTION_ID;

    if (!telnyxApiKey) {
      return res.status(500).json({ message: "TELNYX_API_KEY not configured" });
    }
    if (!fromNumber) {
      return res.status(500).json({ message: "Caller ID not configured (set in SIP trunk or TELNYX_FROM_NUMBER)" });
    }
    if (!openaiApiKey) {
      return res.status(500).json({ message: "OPENAI_API_KEY not configured" });
    }
    if (!connectionId) {
      return res.status(500).json({ message: "TELNYX call control connection ID not configured" });
    }

    // Get virtual agent settings if provided
    let systemPrompt = "You are a professional sales representative calling on behalf of UK Export Finance. Introduce yourself, offer the Leading with Finance whitepaper, and ask if you can send it to their email.";
    let agentName = "UK Export Finance Representative";
    let firstMessage: string | null = null;
    let voice = "";
    
    if (virtualAgentId) {
      const [agent] = await db.select().from(virtualAgents).where(eq(virtualAgents.id, virtualAgentId)).limit(1);
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
        const settings = agent.settings as any;
        agentName = settings?.persona?.name || agent.name || agentName;
        firstMessage = agent.firstMessage || null;
        voice = agent.voice || "";
      }
    }

    if (systemPromptOverride?.trim()) {
      systemPrompt = systemPromptOverride.trim();
    }

    if (firstMessageOverride?.trim()) {
      firstMessage = firstMessageOverride.trim();
    }

    if (voiceOverride?.trim()) {
      voice = voiceOverride.trim();
    }

    // Normalize phone to E.164
    let normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
    if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = '+' + normalizedPhone.replace(/^0+/, '');
    }

    // Build the WebSocket URL for Voice Dialer
    // Priority: PUBLIC_WEBSOCKET_URL env var > X-Public-Host header > request host
    // This is critical for Telnyx to reach the endpoint (Telnyx can't reach localhost)
    let wsUrl = process.env.PUBLIC_WEBSOCKET_URL;
    
    if (!wsUrl) {
      const publicHost = req.get('X-Public-Host') || req.get('host') || 'localhost:5000';
      const protocol = publicHost.includes('localhost') ? 'ws' : 'wss';
      wsUrl = `${protocol}://${publicHost}/voice-dialer`;
      
      // WARN if localhost is being used (Telnyx won't be able to reach it)
      if (publicHost.includes('localhost')) {
        console.warn(`[Voice Dialer Test] ⚠️  CRITICAL: Using localhost WebSocket URL ${wsUrl}`);
        console.warn(`[Voice Dialer Test] ⚠️  Telnyx CANNOT reach localhost! Audio will NOT flow.`);
        console.warn(`[Voice Dialer Test] ⚠️  Set PUBLIC_WEBSOCKET_URL env var or pass X-Public-Host header`);
        console.warn(`[Voice Dialer Test] ⚠️  Example: PUBLIC_WEBSOCKET_URL=wss://1234-56-789.ngrok.io/voice-dialer`);
      }
    }

    // Generate unique call identifiers
    const callId = `openai-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const callAttemptId = `attempt-${Date.now()}`;
    const queueItemId = `queue-test-${Date.now()}`;
    const runId = `run-test-${Date.now()}`;
    const contactId = `contact-test-${Date.now()}`;

    console.log(`[OpenAI Realtime Test] Initiating test call:
  - To: ${normalizedPhone}
  - From: ${fromNumber}
  - WebSocket URL: ${wsUrl}
  - Call ID: ${callId}
  - Virtual Agent: ${virtualAgentId || 'default'}
  - Connection ID: ${connectionId}`);

    // Create the Telnyx call with media streaming to OpenAI Realtime WebSocket
    // CRITICAL: Use base stream_url WITHOUT query params, pass all data via client_state instead
    // Telnyx Media Streaming validates the stream_url and may reject URLs with complex query strings
    
    const customParams = {
      call_id: callId,
      run_id: runId,
      campaign_id: campaignId || 'test-campaign',
      queue_item_id: queueItemId,
      call_attempt_id: callAttemptId,
      contact_id: contactId,
      called_number: normalizedPhone, // Required for database tracking
      virtual_agent_id: virtualAgentId || 'test-agent',
      system_prompt: systemPrompt,
      first_message: firstMessage,
      voice,
      agent_settings: settingsOverride,
      agent_name: agentName,
      provider: 'openai_realtime', // Mark this as OpenAI Realtime call
    };

    // Encode custom parameters as base64 in client_state
    // This avoids complex query strings that might trigger Telnyx validation
    const clientStateStr = JSON.stringify(customParams);
    const clientStateB64 = Buffer.from(clientStateStr).toString('base64');

    console.log(`[OpenAI Realtime Test] Stream URL (clean, no query params): ${wsUrl}`);
    console.log(`[OpenAI Realtime Test] Custom parameters in client_state:`, customParams);

    // Use the same host (public if provided) for Telnyx webhook callbacks
    // Resolve webhook host robustly to avoid localhost in production
    let webhookHost = process.env.PUBLIC_WEBHOOK_HOST || req.get('X-Public-Host') || req.get('host') || '';
    if (!webhookHost && process.env.TELNYX_WEBHOOK_URL) {
      try {
        const u = new URL((process.env.TELNYX_WEBHOOK_URL || "").trim());
        webhookHost = u.host;
      } catch {}
    }
    webhookHost = webhookHost || 'localhost:5000';
    const webhookProtocol = webhookHost.includes('localhost') ? 'http' : 'https';
    const texmlUrl = `${webhookProtocol}://${webhookHost}/api/texml/ai-call`;

    console.log(`[OpenAI Realtime Test] Initiating TeXML call to: ${normalizedPhone}`);
    console.log(`[OpenAI Realtime Test] TeXML URL: ${texmlUrl}`);

    const response = await fetch("https://api.telnyx.com/v2/texml_calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${telnyxApiKey}`,
      },
      body: JSON.stringify({
        texml_application_id: connectionId, // Correct parameter for texml_calls endpoint
        to: normalizedPhone,
        from: fromNumber,
        url: texmlUrl, // Point to our TeXML endpoint
        client_state: clientStateB64, // Pass parameters via client_state
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OpenAI Realtime Test] Telnyx API error: ${response.status} - ${errorText}`);
      return res.status(500).json({ 
        message: "Failed to initiate Telnyx call", 
        error: errorText,
        status: response.status
      });
    }

    const result = await response.json();
    const callControlId = result.data?.call_control_id;

    console.log(`[OpenAI Realtime Test] Call initiated successfully:
  - Call Control ID: ${callControlId}
  - Call ID: ${callId}`);

    res.json({
      success: true,
      message: "OpenAI Realtime test call initiated - your phone should ring shortly",
      callId,
      callControlId,
      // Include snake_case keys for the diagnostic script expectations
      call_id: callId,
      call_control_id: callControlId,
      phoneNumber: normalizedPhone,
      provider: "openai-realtime",
      wsUrl,
      ws_url: wsUrl,
    });
  } catch (error) {
    console.error("[AI Calls] Error initiating OpenAI Realtime test call:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to initiate test call", error: String(error) });
  }
});

/**
 * Test endpoint for Google Gemini Multimodal Live API calls
 * POST /api/ai/test-gemini-live
 * 
 * This initiates a test call using the Gemini Multimodal Live API.
 * Voices are handled dynamically to ensure automatic synchronization with Google's updates.
 */
const testGeminiLiveSchema = z.object({
  phoneNumber: z.string().min(10, "Phone number required"),
  virtualAgentId: z.string().optional(),
  campaignId: z.string().optional(),
  systemPrompt: z.string().optional(),
  voice: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
  // Contact context for proper placeholder substitution
  contactName: z.string().optional(),
  contactFirstName: z.string().optional(),
  contactJobTitle: z.string().optional(),
  accountName: z.string().optional(),
  organizationName: z.string().optional(),
});

router.post("/test-gemini-live", requireAuth, requireRole("admin", "campaign_manager"), async (req, res) => {
  try {
    const {
      phoneNumber,
      virtualAgentId,
      campaignId,
      systemPrompt: systemPromptOverride,
      voice: voiceOverride,
      settings: settingsOverride,
      contactName,
      contactFirstName,
      contactJobTitle,
      accountName,
      organizationName,
    } = testGeminiLiveSchema.parse(req.body);

    const sipConfig = await storage.getDefaultSipTrunkConfig();
    const sipProvider = (sipConfig?.provider || process.env.SIP_TRUNK_PROVIDER || "telnyx").toLowerCase();

    if (sipProvider !== "telnyx") {
      return res.status(400).json({
        message: "Gemini Live Test currently supports Telnyx call control only.",
      });
    }

    const telnyxApiKey = process.env.TELNYX_API_KEY;
    const fromNumber = sipConfig?.callerIdNumber || process.env.TELNYX_FROM_NUMBER;
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    const connectionId = process.env.TELNYX_TEXML_APP_ID || sipConfig?.connectionId;

    if (!telnyxApiKey || !fromNumber || !geminiApiKey || !connectionId) {
      return res.status(500).json({ message: "Missing required configuration (Telnyx, Gemini, or Connection ID)" });
    }

    let systemPrompt = "You are a professional AI assistant.";
    let voice = "Pumice"; // Default Gemini Live voice
    let campaignOrgName = organizationName;
    
    // Load campaign info if campaignId provided
    if (campaignId) {
      try {
        const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
        if (campaign && !campaignOrgName) {
          // Get organization name from campaign if available
          campaignOrgName = (campaign as any).organizationName || (campaign as any).organization_name;
        }
      } catch (e) {
        console.warn("[AI Calls] Failed to load campaign for org name:", e);
      }
    }
    
    if (virtualAgentId) {
      const [agent] = await db.select().from(virtualAgents).where(eq(virtualAgents.id, virtualAgentId)).limit(1);
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
        voice = agent.voice || voice;
      }
    }

    if (systemPromptOverride?.trim()) systemPrompt = systemPromptOverride.trim();
    if (voiceOverride?.trim()) voice = voiceOverride.trim();

    let normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone.replace(/^0+/, '');

    const wsUrl = getPublicWsUrl(req, '/gemini-live-dialer');
    const callId = `gemini-test-${Date.now()}`;
    
    // Include contact context for proper placeholder substitution
    const customParams = {
      call_id: callId,
      campaign_id: campaignId || 'test-campaign',
      called_number: normalizedPhone, // Required for database tracking
      virtual_agent_id: virtualAgentId || 'test-agent',
      system_prompt: systemPrompt,
      voice, // Dynamic voice selection for automatic synchronization
      agent_settings: settingsOverride,
      provider: 'gemini_live',
      // Contact context for DemandGentic.ai By Pivotal B2B identity
      contact_name: contactName,
      contact_first_name: contactFirstName,
      contact_job_title: contactJobTitle,
      account_name: accountName,
      organization_name: campaignOrgName,
    };

    const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');
    // Resolve webhook host robustly to avoid localhost in production
    let webhookHost = process.env.PUBLIC_WEBHOOK_HOST || req.get('X-Public-Host') || req.get('host') || '';
    if (!webhookHost && process.env.TELNYX_WEBHOOK_URL) {
      try {
        const u = new URL((process.env.TELNYX_WEBHOOK_URL || "").trim());
        webhookHost = u.host;
      } catch {}
    }
    webhookHost = webhookHost || 'localhost:5000';
    const webhookProtocol = webhookHost.includes('localhost') ? 'http' : 'https';
    const texmlUrl = `${webhookProtocol}://${webhookHost}/api/texml/ai-call`;

    // Prefer path-based TeXML endpoint to avoid app defaults; include StatusCallback explicitly
    const response = await fetch(`https://api.telnyx.com/v2/texml/calls/${connectionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${telnyxApiKey}`,
      },
      body: JSON.stringify({
        To: normalizedPhone,
        From: fromNumber,
        Url: texmlUrl,
        ClientState: clientStateB64,
        StatusCallback: (process.env.TELNYX_WEBHOOK_URL || "").trim() || `${webhookProtocol}://${webhookHost}/api/webhooks/telnyx`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ message: "Failed to initiate Telnyx call", error: errorText });
    }

    const result = await response.json();
    res.json({ success: true, callId, callControlId: result.data?.call_control_id, voice, wsUrl });
  } catch (error) {
    console.error("[AI Calls] Error initiating Gemini Live test call:", error);
    res.status(500).json({ message: "Failed to initiate test call", error: String(error) });
  }
});

/**
 * GET /api/ai-calls/gemini-voices
 * Returns the list of available Google Gemini Live voices.
 * This ensures the UI is synchronized with the latest available options.
 */
router.get("/gemini-voices", requireAuth, (req, res) => {
  // These are the current Gemini Live voices as of the latest documentation.
  // The backend uses a pass-through string in the dialer, so any voice name
  // provided by the UI will be sent to the API.
  res.json([
    { id: "Pumice", name: "Pumice", description: "Soft and breathy" },
    { id: "Juniper", name: "Juniper", description: "Energetic and bright" },
    { id: "Bamboo", name: "Bamboo", description: "Calm and grounded" },
    { id: "Ember", name: "Ember", description: "Warm and rich" },
    { id: "Lyra", name: "Lyra", description: "Clear and professional" },
    { id: "Orion", name: "Orion", description: "Deep and authoritative" },
    { id: "Jade", name: "Jade", description: "New experimental voice" }
  ]);
});

export default router;
