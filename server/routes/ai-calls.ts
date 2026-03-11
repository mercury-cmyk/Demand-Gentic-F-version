import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
import { storage } from "../storage";
import { getTelnyxAiBridge, TelnyxCallEvent } from "../services/telnyx-ai-bridge";
import * as sipDialer from "../services/sip";
import { agentDefaults } from "@shared/schema";
import { AiAgentSettings, CallContext } from "../services/ai-voice-agent";
import { isVoiceVariablePreflightError } from "../services/voice-variable-contract";
import { validatePreflight, generatePreflightErrorResponse } from "../services/preflight-validator";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db";
import { leads, suppressionPhones, campaignSuppressionAccounts, campaignQueue, contacts, virtualAgents, campaigns, callSessions, callQualityRecords, globalDnc } from "@shared/schema";
import { eq, sql, inArray, and } from "drizzle-orm";
// Gemini is used for script generation; OpenAI runtime is disabled
import { isWithinBusinessHours, getNextAvailableTime, BusinessHoursConfig, ContactTimezoneInfo, DEFAULT_BUSINESS_HOURS, US_FEDERAL_HOLIDAYS_2024_2025, getBusinessHoursForCountry } from "../utils/business-hours";
import { checkSuppressionBulk, getSuppressionReason } from "../lib/suppression.service";
import { getBestPhoneForContact } from "../lib/phone-utils";
import { getCallerIdForCall, releaseNumberWithoutOutcome, sleep as numberPoolSleep } from "../services/number-pool-integration";
import { resolveAgentAssignment } from "../services/unified-call-context";

const GEMINI_VOICE_PREFERENCES = [
  "Juniper",
  "Ember",
  "Lyra",
  "Orion",
  "Bamboo",
  "Jade",
  "Pumice",
];

function normalizeGeminiVoice(voice?: string) {
  if (voice?.trim()) {
    const match = GEMINI_VOICE_PREFERENCES.find(
      (v) => v.toLowerCase() === voice.trim().toLowerCase()
    );
    if (match) return match;
    console.warn(`[AI Calls] Unknown Gemini voice "${voice}" - falling back to ${GEMINI_VOICE_PREFERENCES[0]}`);
  }
  return GEMINI_VOICE_PREFERENCES[0];
}

const router = Router();

function getTelnyxWhitelistRemovalReason(errorMessage: string | undefined): 'country_not_whitelisted' | 'invalid_lrn' {
  const msg = (errorMessage || '').toLowerCase();
  if (msg.includes('d50') || msg.includes('valid lrn')) {
    return 'invalid_lrn';
  }
  return 'country_not_whitelisted';
}

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
- opening: The initial greeting, introduction, and brief acknowledgment of their role/company (2-3 sentences)
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

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!geminiApiKey) {
      return res.status(503).json({
        success: false,
        message: "Gemini is not configured. Set GEMINI_API_KEY or GOOGLE_AI_API_KEY to enable script generation."
      });
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001", systemInstruction: systemPrompt });
    const response = await model.generateContent(userPrompt);

    const content = response.response.text();
    if (!content) {
      throw new Error("No response from AI");
    }

    let jsonText = content.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```json/i, "```").replace(/^```/, "").replace(/```$/, "").trim();
    }
    const scripts = JSON.parse(jsonText);
    
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
      // Get country-specific business hours (handles Middle East Sun-Thu work week)
      const contactCountry = (contact as any).country;
      const countryHours = getBusinessHoursForCountry(contactCountry);
      
      const businessHoursConfig: BusinessHoursConfig = {
        enabled: true,
        timezone: businessHoursSettings?.timezone || DEFAULT_BUSINESS_HOURS.timezone,
        // Use country-specific operating days (e.g., Sun-Thu for Middle East)
        // Campaign-level override takes precedence if explicitly set
        operatingDays: businessHoursSettings?.operatingDays || countryHours.operatingDays,
        startTime: businessHoursSettings?.startTime || countryHours.startTime,
        endTime: businessHoursSettings?.endTime || countryHours.endTime,
        respectContactTimezone: businessHoursSettings?.respectContactTimezone ?? true,
        excludedDates: US_FEDERAL_HOLIDAYS_2024_2025,
      };

      const contactTimezoneInfo: ContactTimezoneInfo = {
        timezone: (contact as any).timezone,
        city: (contact as any).city || (contact as any).contactCity,
        state: (contact as any).state || (contact as any).contactState,
        country: contactCountry,
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

    // DNC compliance check — block calls to numbers on Global DNC or phone suppression list
    {
      let normalizedInitiatePhone = phoneNumber.replace(/[^\d+]/g, '');
      if (!normalizedInitiatePhone.startsWith('+')) normalizedInitiatePhone = '+' + normalizedInitiatePhone.replace(/^0+/, '');

      const [dncHit] = await db
        .select({ id: globalDnc.id })
        .from(globalDnc)
        .where(eq(globalDnc.phoneE164, normalizedInitiatePhone))
        .limit(1);

      if (dncHit) {
        console.warn(`[AI Calls] BLOCKED initiate: phone ${normalizedInitiatePhone} is on Global DNC list`);
        if (queueItemId) {
          await db.execute(sql`
            UPDATE campaign_queue SET status = 'removed', removed_reason = 'global_dnc', updated_at = NOW()
            WHERE id = ${queueItemId}
          `);
        }
        return res.status(403).json({
          message: "Cannot place call: contact's phone number is on the Global Do Not Call list",
          dncBlocked: true,
        });
      }

      const [phoneSuppressionHit] = await db
        .select({ id: suppressionPhones.id })
        .from(suppressionPhones)
        .where(eq(suppressionPhones.phoneE164, normalizedInitiatePhone))
        .limit(1);

      if (phoneSuppressionHit) {
        console.warn(`[AI Calls] BLOCKED initiate: phone ${normalizedInitiatePhone} is on phone suppression list`);
        if (queueItemId) {
          await db.execute(sql`
            UPDATE campaign_queue SET status = 'removed', removed_reason = 'phone_suppressed', updated_at = NOW()
            WHERE id = ${queueItemId}
          `);
        }
        return res.status(403).json({
          message: "Cannot place call: contact's phone number is on the suppression list",
          dncBlocked: true,
        });
      }
    }

      // Build agent name with proper fallback chain (avoid placeholder values)
      const resolvedAgentName = aiSettings.persona?.name 
        || (aiSettings as any).agentName 
        || campaign.name 
        || "Sarah Mitchell";

      const numberPoolConfig = campaign.numberPoolConfig as { enabled?: boolean; maxCallsPerNumber?: number; rotationStrategy?: string; cooldownHours?: number } | null;
      let fromNumber = "";
      let callerNumberId: string | null = null;
      let callerNumberDecisionId: string | null = null;

      try {
        const callerIdResult = await getCallerIdForCall({
          campaignId,
          prospectNumber: phoneNumber,
          callType: 'ai_calls_initiate',
          numberPoolConfig: numberPoolConfig ? {
            enabled: numberPoolConfig.enabled ?? true,
            maxCallsPerNumber: numberPoolConfig.maxCallsPerNumber,
            rotationStrategy: numberPoolConfig.rotationStrategy as 'round_robin' | 'reputation_based' | 'region_match' | undefined,
            cooldownHours: numberPoolConfig.cooldownHours,
          } : undefined,
        });
        fromNumber = callerIdResult.callerId;
        callerNumberId = callerIdResult.numberId;
        callerNumberDecisionId = callerIdResult.decisionId;

        if (callerIdResult.jitterDelayMs > 0) {
          await numberPoolSleep(callerIdResult.jitterDelayMs);
        }
      } catch (poolError) {
        console.warn("[AI Calls] Number pool selection failed, using legacy caller ID:", poolError);
        fromNumber = process.env.TELNYX_FROM_NUMBER || "";
      }

      if (!fromNumber) {
        return res.status(500).json({ message: "Outbound phone number not configured" });
      }

      const context: CallContext = {
        contactFirstName: contact.firstName || "there",
        contactLastName: contact.lastName || "",
        contactTitle: (contact as any).title || (contact as any).jobTitle || "Decision Maker",
        contactJobTitle: (contact as any).title || (contact as any).jobTitle || "Decision Maker",
        contactEmail: contact.email || "",
        companyName: account?.name || (contact as any).companyNameOverride || "your company",
        accountName: account?.name || (contact as any).companyNameOverride || "your company",
        phoneNumber,
        campaignId,
        queueItemId,
        campaignName: campaign.name,
        campaignType: (campaign as any).type || (campaign as any).campaignType,
        organizationName: aiSettings.persona?.companyName || "DemandGentic.ai By Pivotal B2B",
        campaignObjective: (campaign as any).campaignObjective,
        successCriteria: (campaign as any).successCriteria,
        targetAudienceDescription: (campaign as any).targetAudienceDescription,
        productServiceInfo: (campaign as any).productServiceInfo,
        talkingPoints: (campaign as any).talkingPoints || [],
        campaignContextBrief: (campaign as any).campaignContextBrief,
        callFlow: (campaign as any).callFlow,
        maxCallDurationSeconds: (campaign as any).maxCallDurationSeconds ?? null,
        agentFullName: resolvedAgentName,
        callerNumberId,
        callerNumberDecisionId,
      };

    // Determine call engine from agent defaults
    const [defaults] = await db.select({ defaultCallEngine: agentDefaults.defaultCallEngine }).from(agentDefaults).limit(1);
    const callEngine = defaults?.defaultCallEngine || 'texml';
    console.log(`[AI Calls] Call engine from DB: "${defaults?.defaultCallEngine}" → using: "${callEngine}"`);

    const bridge = getTelnyxAiBridge();

    // PRE-LOCK if queueItemId is present
    if (queueItemId && queueItemId !== 'test-queue-item') {
      await db.execute(sql`
        UPDATE campaign_queue
        SET status = 'in_progress', updated_at = NOW()
        WHERE id = ${queueItemId}
      `);
    }

    try {
      let callId: string | undefined;
      let callControlId: string | undefined;
      let usedEngine: 'sip' | 'texml' = 'texml';
      let sipFallbackReason: string | undefined;

      // UNIFIED AGENT RESOLUTION: Use the same resolveAgentAssignment() that test calls use
      // This ensures systemPrompt, voice (with rotation), firstMessage, and agentName
      // are identical between test calls and production calls.
      const unifiedAgent = await resolveAgentAssignment(campaignId);

      if (callEngine === 'sip') {
        if (!sipDialer.isReady()) {
          sipFallbackReason = 'SIP engine not ready';
          console.warn(`[AI Calls] SIP engine selected but not ready - falling back to TeXML`);
        } else {
          // Direct SIP path: Drachtio SIP trunk → RTP → Gemini Live
          // CRITICAL: Use unified agent resolution (same as test calls) for systemPrompt,
          // voice (with rotation), and firstMessage to ensure zero drift.
          console.log(`[AI Calls] Using Direct SIP engine for call to ${phoneNumber}`);
          const result = await sipDialer.initiateAiCall({
            toNumber: phoneNumber,
            fromNumber,
            campaignId,
            contactId: contactId!,
            queueItemId: queueItemId || '',
            voiceName: unifiedAgent?.voice || aiSettings.persona?.voice || 'Puck',
            systemPrompt: unifiedAgent?.systemPrompt || aiSettings.scripts?.systemPrompt || (aiSettings as any).systemPrompt,
            contactName: [context.contactFirstName, context.contactLastName].filter(Boolean).join(' ').trim() || 'there',
            contactFirstName: context.contactFirstName || 'there',
            contactJobTitle: context.contactJobTitle || context.contactTitle || 'Decision Maker',
            accountName: context.accountName || context.companyName || 'your company',
            organizationName: context.organizationName,
            campaignName: context.campaignName,
            campaignType: context.campaignType || null,
            campaignObjective: context.campaignObjective,
            successCriteria: context.successCriteria,
            targetAudienceDescription: context.targetAudienceDescription,
            productServiceInfo: context.productServiceInfo,
            talkingPoints: context.talkingPoints,
            campaignContextBrief: context.campaignContextBrief,
            callFlow: context.callFlow,
            firstMessage: unifiedAgent?.firstMessage || undefined,
            maxCallDurationSeconds: context.maxCallDurationSeconds ?? undefined,
            callerNumberId,
            callerNumberDecisionId,
          });
          if (!result.success) {
            sipFallbackReason = result.error || 'SIP call initiation failed';
            console.warn(`[AI Calls] SIP call failed (${sipFallbackReason}) - falling back to TeXML`);
          } else {
            callId = result.callId!;
            callControlId = result.callControlId;
            usedEngine = 'sip';
          }
        }
      }

      if (!callId) {
        // TeXML path (default): Telnyx TeXML → Gemini Live WebSocket
        // Also used as fallback when SIP engine is selected but not ready
        const result = await bridge.initiateAiCall(
          phoneNumber,
          fromNumber,
          aiSettings,
          context
        );
        callId = result.callId;
        callControlId = result.callControlId;
        usedEngine = 'texml';
      }

      if (!callId) {
        throw new Error('Failed to initiate call via SIP and TeXML');
      }

      res.json({
        success: true,
        callId,
        callControlId,
        engine: usedEngine,
        fallbackFrom: usedEngine === 'texml' && callEngine === 'sip' ? 'sip' : undefined,
        fallbackReason: usedEngine === 'texml' && callEngine === 'sip' ? sipFallbackReason : undefined,
        message: "AI call initiated successfully",
      });
    } catch (error) {
      releaseNumberWithoutOutcome(callerNumberId);
      // Revert lock on failure
      if (queueItemId && queueItemId !== 'test-queue-item') {
        const isWhitelistError = error instanceof Error && error.message.includes('Whitelist Error');
        if (isWhitelistError) {
          const removedReason = getTelnyxWhitelistRemovalReason(error instanceof Error ? error.message : String(error));
          await db.execute(sql`
            UPDATE campaign_queue 
            SET status = 'removed', removed_reason = ${removedReason}, updated_at = NOW()
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

          // Build agent name with proper fallback chain (avoid placeholder values)
          const resolvedAgentName = aiSettings.persona?.name 
            || (aiSettings as any).agentName 
            || campaign.name 
            || "Sarah Mitchell";

          const context: CallContext = {
            contactFirstName: item.firstName || contact?.firstName || "there",
            contactLastName: item.lastName || contact?.lastName || "",
            contactTitle: item.title || (contact as any)?.title || (contact as any)?.jobTitle || "Decision Maker",
            contactJobTitle: item.title || (contact as any)?.title || (contact as any)?.jobTitle || "Decision Maker",
            contactEmail: item.email || contact?.email || "",
            companyName: item.companyName || account?.name || "your company",
            accountName: item.companyName || account?.name || "your company",
            phoneNumber,
            campaignId,
            contactId: contactId || undefined,
            queueItemId: item.id,
            campaignName: campaign.name,
            campaignType: (campaign as any).type || (campaign as any).campaignType,
            organizationName: aiSettings.persona?.companyName || "DemandGentic.ai By Pivotal B2B",
            campaignObjective: (campaign as any).campaignObjective,
            successCriteria: (campaign as any).successCriteria,
            targetAudienceDescription: (campaign as any).targetAudienceDescription,
            productServiceInfo: (campaign as any).productServiceInfo,
            talkingPoints: (campaign as any).talkingPoints || [],
            campaignContextBrief: (campaign as any).campaignContextBrief,
            callFlow: (campaign as any).callFlow,
            maxCallDurationSeconds: (campaign as any).maxCallDurationSeconds ?? null,
            agentFullName: resolvedAgentName,
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
          const numberPoolConfig = campaign.numberPoolConfig as { enabled?: boolean; maxCallsPerNumber?: number; rotationStrategy?: string; cooldownHours?: number } | null;
          let fromNumber = "";
          let callerNumberId: string | null = null;
          let callerNumberDecisionId: string | null = null;

          try {
            const callerIdResult = await getCallerIdForCall({
              campaignId,
              prospectNumber: phoneNumber,
              virtualAgentId: context.virtualAgentId || undefined,
              callType: 'ai_calls_batch',
              numberPoolConfig: numberPoolConfig ? {
                enabled: numberPoolConfig.enabled ?? true,
                maxCallsPerNumber: numberPoolConfig.maxCallsPerNumber,
                rotationStrategy: numberPoolConfig.rotationStrategy as 'round_robin' | 'reputation_based' | 'region_match' | undefined,
                cooldownHours: numberPoolConfig.cooldownHours,
              } : undefined,
            });
            fromNumber = callerIdResult.callerId;
            callerNumberId = callerIdResult.numberId;
            callerNumberDecisionId = callerIdResult.decisionId;

            if (callerIdResult.jitterDelayMs > 0) {
              await numberPoolSleep(callerIdResult.jitterDelayMs);
            }
          } catch (poolError) {
            console.warn("[AI Batch] Number pool selection failed, using legacy caller ID:", poolError);
            fromNumber = process.env.TELNYX_FROM_NUMBER || "";
          }

          if (!fromNumber) {
            throw new Error("Outbound phone number not configured");
          }

          context.callerNumberId = callerNumberId;
          context.callerNumberDecisionId = callerNumberDecisionId;

          const { callId } = await bridge.initiateAiCall(phoneNumber, fromNumber, aiSettings, context);
          
          results.push({ contactId: contactId || item.id, queueItemId: item.id, status: "initiated", callId });
          callsInitiated++;
          
          console.log(`[AI Batch] Call ${callsInitiated}/${limit} initiated for queue item ${item.id}`);

          if (callsInitiated < eligibleItems.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
          }
        } catch (initiateError: any) {
          releaseNumberWithoutOutcome(context.callerNumberId || null);
          // If initiation failed, we MUST release the lock or mark as permanently failed
          const isWhitelistError = initiateError.message?.includes('Whitelist Error');
          
          if (isWhitelistError) {
            console.error(`[AI Batch] Permanent failure for ${item.id}: ${initiateError.message}`);
            const removedReason = getTelnyxWhitelistRemovalReason(initiateError.message);
            await db.execute(sql`
              UPDATE campaign_queue 
              SET status = 'removed', 
                  removed_reason = ${removedReason},
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

/**
 * DEPRECATED: This webhook endpoint is kept for backwards compatibility.
 * All Telnyx webhooks should use /api/webhooks/telnyx instead.
 * This endpoint now forwards to the main webhook handler.
 */
router.post("/webhook", async (req, res) => {
  try {
    // Always respond immediately to Telnyx
    res.status(200).send("OK");

    console.log(`[AI Webhook] ⚠️ DEPRECATED: Received event on /api/ai-calls/webhook - should use /api/webhooks/telnyx`);

    const event = req.body as TelnyxCallEvent;
    const eventData: any = event.data || event;
    const eventType = eventData.event_type || event.event_type;

    console.log(`[AI Webhook] Forwarding event to main handler: ${eventType}`);

    // Forward to the main AI bridge handler
    const bridge = getTelnyxAiBridge();
    await bridge.handleWebhookEvent(event);
  } catch (error) {
    console.error("[AI Calls] Webhook error:", error);
  }
});

// Audio serving endpoint for legacy TTS audio files
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

    // DNC compliance check — block calls to numbers on Global DNC or phone suppression list
    let normalizedTestPhone = phoneNumber.replace(/[^\d+]/g, '');
    if (!normalizedTestPhone.startsWith('+')) normalizedTestPhone = '+' + normalizedTestPhone.replace(/^0+/, '');

    const [dncMatch] = await db
      .select({ id: globalDnc.id })
      .from(globalDnc)
      .where(eq(globalDnc.phoneE164, normalizedTestPhone))
      .limit(1);

    if (dncMatch) {
      console.warn(`[AI Test Call] BLOCKED: phone ${normalizedTestPhone} is on Global DNC list`);
      return res.status(403).json({
        message: "Cannot place call: this phone number is on the Global Do Not Call list",
        dncBlocked: true,
      });
    }

    const [suppressionMatch] = await db
      .select({ id: suppressionPhones.id })
      .from(suppressionPhones)
      .where(eq(suppressionPhones.phoneE164, normalizedTestPhone))
      .limit(1);

    if (suppressionMatch) {
      console.warn(`[AI Test Call] BLOCKED: phone ${normalizedTestPhone} is on phone suppression list`);
      return res.status(403).json({
        message: "Cannot place call: this phone number is on the suppression list",
        dncBlocked: true,
      });
    }

    let fromNumber = "";
    let callerNumberId: string | null = null;
    let callerNumberDecisionId: string | null = null;
    try {
      const callerIdResult = await getCallerIdForCall({
        campaignId: campaignId || "test-call",
        prospectNumber: phoneNumber,
        callType: 'ai_calls_test',
      });
      fromNumber = callerIdResult.callerId;
      callerNumberId = callerIdResult.numberId;
      callerNumberDecisionId = callerIdResult.decisionId;

      if (callerIdResult.jitterDelayMs > 0) {
        await numberPoolSleep(callerIdResult.jitterDelayMs);
      }
    } catch (poolError) {
      console.warn("[AI Test Call] Number pool selection failed, using legacy caller ID:", poolError);
      fromNumber = process.env.TELNYX_FROM_NUMBER || "";
    }

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
          voice: "Puck",
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
      callerNumberId,
      callerNumberDecisionId,
    };

    // Determine provider - default to Gemini Live (same as production campaigns)
    const provider = 'gemini_live';

    console.log("[AI Test Call] Initiating test call to:", phoneNumber);
    console.log("[AI Test Call] Using from number:", fromNumber);
    console.log("[AI Test Call] Using provider:", provider);
    console.log("[AI Test Call] AI Settings:", JSON.stringify(aiSettings.persona, null, 2));

    const bridge = getTelnyxAiBridge();
    const { callId, callControlId } = await bridge.initiateAiCall(
      phoneNumber,
      fromNumber,
      aiSettings,
      context,
      provider as 'openai_realtime' | 'gemini_live'
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
    // Number release skipped - relevant variable not in scope from inner try
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

    // Query call_sessions with quality records to get identity confirmation status
    // "Connected" should mean RIGHT PARTY connects (identity confirmed), not just any answered call
    const aiCallSessions = await db.select({
      id: callSessions.id,
      status: callSessions.status,
      aiDisposition: callSessions.aiDisposition,
      aiAnalysis: callSessions.aiAnalysis,
      identityConfirmed: callQualityRecords.identityConfirmed,
    }).from(callSessions)
      .leftJoin(callQualityRecords, eq(callSessions.id, callQualityRecords.callSessionId))
      .where(
        and(
          eq(callSessions.campaignId, campaignId),
          eq(callSessions.agentType, 'ai')
        )
      );

    const stats = {
      totalAiCalls: aiCallSessions.length,
      qualified: aiCallSessions.filter((s) => {
        const disposition = s.aiDisposition?.toLowerCase() || '';
        return disposition.includes('qualified') || disposition === 'qualified_lead';
      }).length,
      handoffs: aiCallSessions.filter((s) => {
        const analysis = s.aiAnalysis as Record<string, any> | null;
        return analysis?.handoff === true || analysis?.humanTransfer === true;
      }).length,
      gatekeeperNavigations: aiCallSessions.filter((s) => {
        const analysis = s.aiAnalysis as Record<string, any> | null;
        return analysis?.gatekeeperNavigated === true || analysis?.phase === 'gatekeeper';
      }).length,
      voicemails: aiCallSessions.filter((s) => {
        const disposition = s.aiDisposition?.toLowerCase() || '';
        return disposition.includes('voicemail');
      }).length,
      noAnswer: aiCallSessions.filter((s) => {
        const disposition = s.aiDisposition?.toLowerCase() || '';
        return disposition.includes('no_answer') || disposition.includes('no answer');
      }).length,
      // CRITICAL: "Connected" means RIGHT PARTY connects (identity confirmed)
      // This counts calls where we confirmed we're speaking with the target contact
      connected: aiCallSessions.filter((s) => {
        // Primary: Check identityConfirmed from call quality records
        if (s.identityConfirmed === true) {
          return true;
        }
        // Fallback: Check aiAnalysis for identity confirmation
        const analysis = s.aiAnalysis as Record<string, any> | null;
        if (analysis?.identityConfirmed === true || analysis?.rightPartyContact === true) {
          return true;
        }
        // Also check performanceMetrics if available
        if (analysis?.performanceMetrics?.identityConfirmed === true) {
          return true;
        }
        return false;
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
      message: "Voice test endpoint ready - Gemini-only runtime",
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
 * Test endpoint for Voice Dialer calls (Gemini-only)
 * POST /api/ai/test-openai-realtime
 * 
 * This initiates a test call using the Voice Dialer (Gemini Live only)
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

// OpenAI Realtime endpoint is disabled - use Gemini Live instead
router.post("/test-openai-realtime", requireAuth, requireRole("admin", "campaign_manager"), async (_req, res) => {
  return res.status(410).json({
    message: "OpenAI Realtime test calls are disabled. Use /api/ai-calls/test-gemini-live instead.",
    provider: "gemini_live",
  });
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

    // DNC compliance check — block calls to numbers on Global DNC or phone suppression list
    let normalizedGeminiPhone = phoneNumber.replace(/[^\d+]/g, '');
    if (!normalizedGeminiPhone.startsWith('+')) normalizedGeminiPhone = '+' + normalizedGeminiPhone.replace(/^0+/, '');

    const [geminiDncMatch] = await db
      .select({ id: globalDnc.id })
      .from(globalDnc)
      .where(eq(globalDnc.phoneE164, normalizedGeminiPhone))
      .limit(1);

    if (geminiDncMatch) {
      console.warn(`[AI Gemini Test Call] BLOCKED: phone ${normalizedGeminiPhone} is on Global DNC list`);
      return res.status(403).json({
        message: "Cannot place call: this phone number is on the Global Do Not Call list",
        dncBlocked: true,
      });
    }

    const [geminiSuppressionMatch] = await db
      .select({ id: suppressionPhones.id })
      .from(suppressionPhones)
      .where(eq(suppressionPhones.phoneE164, normalizedGeminiPhone))
      .limit(1);

    if (geminiSuppressionMatch) {
      console.warn(`[AI Gemini Test Call] BLOCKED: phone ${normalizedGeminiPhone} is on phone suppression list`);
      return res.status(403).json({
        message: "Cannot place call: this phone number is on the suppression list",
        dncBlocked: true,
      });
    }

    const telnyxApiKey = process.env.TELNYX_API_KEY;
    let fromNumber = "";
    let callerNumberId: string | null = null;
    let callerNumberDecisionId: string | null = null;
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    const connectionId = process.env.TELNYX_TEXML_APP_ID;

    if (!telnyxApiKey || !geminiApiKey || !connectionId) {
      return res.status(500).json({ message: "Missing required configuration (Telnyx, Gemini, or Connection ID)" });
    }

    try {
      const callerIdResult = await getCallerIdForCall({
        campaignId: campaignId || 'test-campaign',
        prospectNumber: phoneNumber,
        virtualAgentId: virtualAgentId || undefined,
        callType: 'ai_calls_test_gemini',
      });
      fromNumber = callerIdResult.callerId;
      callerNumberId = callerIdResult.numberId;
      callerNumberDecisionId = callerIdResult.decisionId;

      if (callerIdResult.jitterDelayMs > 0) {
        await numberPoolSleep(callerIdResult.jitterDelayMs);
      }
    } catch (poolError) {
      console.warn("[AI Calls] Number pool selection failed, using legacy caller ID:", poolError);
      fromNumber = process.env.TELNYX_FROM_NUMBER || "";
    }

    if (!fromNumber) {
      return res.status(500).json({ message: "Caller ID not configured (set TELNYX_FROM_NUMBER or enable number pool)" });
    }

    let systemPrompt = "You are a professional AI assistant.";
    let voice = normalizeGeminiVoice(); // Default Gemini Live voice (validated)
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
        voice = normalizeGeminiVoice(agent.voice || voice);
      }
    }

    if (systemPromptOverride?.trim()) systemPrompt = systemPromptOverride.trim();
    if (voiceOverride?.trim()) voice = normalizeGeminiVoice(voiceOverride);

    let normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone.replace(/^0+/, '');

    const wsUrl = getPublicWsUrl(req, '/voice-dialer');
    const callId = `gemini-test-${Date.now()}`;
    
    // Include contact context for proper placeholder substitution
    // Build opening message from settings or default
    const firstMessage = settingsOverride?.scripts?.opening
      || `Hello, may I speak with ${contactFirstName || contactName || 'there'} please?`;

    // Keep customParams lean — system_prompt and agent_settings are stored in Redis
    // to prevent TeXML URL length from exceeding limits that break Telnyx fetching.
    const customParams = {
      call_id: callId,
      campaign_id: campaignId || 'test-campaign',
      called_number: normalizedPhone,
      from_number: fromNumber,
      caller_number_id: callerNumberId,
      caller_number_decision_id: callerNumberDecisionId,
      virtual_agent_id: virtualAgentId || 'test-agent',
      voice,
      provider: 'gemini_live',
      contact_name: contactName,
      contact_first_name: contactFirstName,
      contact_job_title: contactJobTitle,
      account_name: accountName,
      organization_name: campaignOrgName,
      is_test_call: true,
      test_call_id: callId,
      first_message: firstMessage,
    };

    // Store session metadata in Redis for voice-dialer retrieval
    try {
      const { callSessionStore } = await import('../services/call-session-store');
      await callSessionStore.setSession(callId, {
        call_id: callId,
        campaign_id: campaignId || 'test-campaign',
        virtual_agent_id: virtualAgentId || 'test-agent',
        is_test_call: true,
        test_call_id: callId,
        first_message: firstMessage,
        voice,
        agent_name: settingsOverride?.persona?.agentName || settingsOverride?.persona?.name || '',
        organization_name: campaignOrgName,
        // system_prompt intentionally omitted — voice-dialer builds the full prompt
        // from campaign config at call time (same as production queue calls).
        // Storing a simplified prompt here would short-circuit the canonical prompt pipeline.
        provider: 'google',
        contact_name: contactName,
        contact_first_name: contactFirstName,
        contact_job_title: contactJobTitle,
        account_name: accountName,
      });
      console.log(`[AI Calls] Stored session ${callId} in Redis`);
    } catch (storeErr) {
      console.warn(`[AI Calls] Failed to store session in Redis:`, storeErr);
    }

    const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');
    // Resolve webhook host robustly to avoid localhost in production
    let webhookHost = process.env.PUBLIC_WEBHOOK_HOST || req.get('X-Public-Host') || req.get('host') || '';
    if (!webhookHost && process.env.TELNYX_WEBHOOK_URL) {
      try {
        const u = new URL((process.env.TELNYX_WEBHOOK_URL || "").trim());
        webhookHost = u.host;
      } catch {}
    }
    // Ensure host doesn't have protocol
    webhookHost = (webhookHost || 'localhost:5000').replace(/^https?:\/\//, '');

    const webhookProtocol = webhookHost.includes('localhost') ? 'http' : 'https';
    // Pass client_state in URL so TeXML endpoint can extract call context and store in pending-call-state
    const texmlUrl = `${webhookProtocol}://${webhookHost}/api/texml/ai-call?client_state=${encodeURIComponent(clientStateB64)}`;

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
      releaseNumberWithoutOutcome(callerNumberId);
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
// Track active continuous calling sessions per campaign
const activeContinuousSessions = new Map<string, { active: boolean; startedAt: Date; callsMade: number; lastActivity: Date }>();

/**
 * POST /api/ai-calls/continuous-start
 * Starts continuous AI calling for a campaign - processes queue one call at a time until empty or stopped
 */
router.post("/continuous-start", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { campaignId, delayBetweenCalls = 5000 } = req.body;

    if (!campaignId) {
      return res.status(400).json({ message: "campaignId is required" });
    }

    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    if (campaign.dialMode !== "ai_agent") {
      return res.status(400).json({ message: "Campaign is not configured for AI agent mode" });
    }

    // Check if already running
    const existingSession = activeContinuousSessions.get(campaignId);
    if (existingSession?.active) {
      return res.status(400).json({
        message: "Continuous calling already active for this campaign",
        startedAt: existingSession.startedAt,
        callsMade: existingSession.callsMade
      });
    }

    // Initialize session
    activeContinuousSessions.set(campaignId, {
      active: true,
      startedAt: new Date(),
      callsMade: 0,
      lastActivity: new Date()
    });

    console.log(`[AI Continuous] Starting continuous calling for campaign ${campaignId}`);

    // Start the continuous calling loop in the background
    processContinuousCalls(campaignId, delayBetweenCalls).catch(err => {
      console.error(`[AI Continuous] Fatal error in continuous calling loop:`, err);
      activeContinuousSessions.delete(campaignId);
    });

    res.json({
      success: true,
      message: "Continuous AI calling started",
      campaignId,
      delayBetweenCalls
    });
  } catch (error) {
    console.error("[AI Continuous] Error starting continuous calls:", error);
    res.status(500).json({ message: "Failed to start continuous calling", error: String(error) });
  }
});

/**
 * POST /api/ai-calls/continuous-stop
 * Stops continuous AI calling for a campaign
 */
router.post("/continuous-stop", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({ message: "campaignId is required" });
    }

    const session = activeContinuousSessions.get(campaignId);
    if (!session?.active) {
      return res.status(400).json({ message: "No active continuous calling session for this campaign" });
    }

    // Mark as inactive - the loop will stop on next iteration
    session.active = false;
    console.log(`[AI Continuous] Stopping continuous calling for campaign ${campaignId} - ${session.callsMade} calls made`);

    res.json({
      success: true,
      message: "Continuous calling stopped",
      callsMade: session.callsMade,
      runDuration: Date.now() - session.startedAt.getTime()
    });
  } catch (error) {
    console.error("[AI Continuous] Error stopping continuous calls:", error);
    res.status(500).json({ message: "Failed to stop continuous calling", error: String(error) });
  }
});

/**
 * GET /api/ai-calls/continuous-status/:campaignId
 * Gets the status of continuous calling for a campaign
 */
router.get("/continuous-status/:campaignId", requireAuth, async (req, res) => {
  const { campaignId } = req.params;
  const session = activeContinuousSessions.get(campaignId);

  if (!session) {
    return res.json({ active: false, campaignId });
  }

  res.json({
    active: session.active,
    campaignId,
    startedAt: session.startedAt,
    callsMade: session.callsMade,
    lastActivity: session.lastActivity,
    runDuration: Date.now() - session.startedAt.getTime()
  });
});

/**
 * Background process that continuously makes AI calls one at a time
 */
async function processContinuousCalls(campaignId: string, delayBetweenCalls: number) {
  const session = activeContinuousSessions.get(campaignId);
  if (!session) return;

  const campaign = await storage.getCampaign(campaignId);
  if (!campaign) {
    console.error(`[AI Continuous] Campaign ${campaignId} not found`);
    activeContinuousSessions.delete(campaignId);
    return;
  }

  const aiSettings = campaign.aiAgentSettings as AiAgentSettings;
  if (!aiSettings) {
    console.error(`[AI Continuous] No AI settings for campaign ${campaignId}`);
    activeContinuousSessions.delete(campaignId);
    return;
  }

  const bridge = getTelnyxAiBridge();

  while (session.active) {
    try {
      // Wait for any active calls to complete before making next call
      let activeCallsCount = bridge.getActiveCallsCount();
      while (activeCallsCount > 0 && session.active) {
        console.log(`[AI Continuous] Waiting for ${activeCallsCount} active call(s) to complete...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        activeCallsCount = bridge.getActiveCallsCount();
      }

      if (!session.active) break;

      // Get next queued item
      const queueItems = await storage.getCampaignQueue(campaignId, "queued");
      const now = new Date();

      // Filter for items ready to be called
      const eligibleItems = queueItems.filter((item: any) => {
        const phone = item.phone || item.phoneNumber || item.contact?.phoneNumber;
        if (!phone || item.status !== "queued") return false;

        // Check scheduled retry time
        if (item.nextAttemptAt) {
          const nextAttempt = new Date(item.nextAttemptAt);
          if (nextAttempt > now) return false;
        }

        return true;
      });

      if (eligibleItems.length === 0) {
        console.log(`[AI Continuous] Queue empty for campaign ${campaignId} - stopping continuous calling`);
        session.active = false;
        break;
      }

      const item = eligibleItems[0];
      const phoneNumber = item.phone || item.phoneNumber || item.contact?.phoneNumber;
      const contactId = item.contactId;

      console.log(`[AI Continuous] Processing queue item ${item.id} (${session.callsMade + 1} calls made so far)`);

      // Compliance checks
      const phonesArray = [phoneNumber.replace(/[^\d+]/g, '')];
      const e164Phone = phonesArray[0].startsWith('+') ? phonesArray[0] : '+' + phonesArray[0].replace(/^0+/, '');

      const suppressedPhones = await db.select({ phoneE164: suppressionPhones.phoneE164 })
        .from(suppressionPhones)
        .where(inArray(suppressionPhones.phoneE164, [e164Phone]));

      if (suppressedPhones.length > 0) {
        console.log(`[AI Continuous] Skipping ${item.id}: phone on DNC list`);
        await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = 'dnc:global_phone_list', updated_at = NOW() WHERE id = ${item.id}`);
        continue;
      }

      // Check suppression for contact
      if (contactId) {
        const suppressionResult = await checkSuppressionBulk([contactId]);
        if (suppressionResult.get(contactId)) {
          console.log(`[AI Continuous] Skipping ${item.id}: contact suppressed`);
          await db.execute(sql`UPDATE campaign_queue SET status = 'removed', removed_reason = 'suppressed', updated_at = NOW() WHERE id = ${item.id}`);
          continue;
        }
      }

      // Get contact and account details
      const contact = contactId ? await storage.getContact(contactId) : null;
      const account = contact?.accountId ? await storage.getAccount(contact.accountId) : null;

      const resolvedAgentName = aiSettings.persona?.name
        || (aiSettings as any).agentName
        || campaign.name
        || "Sarah Mitchell";

      const context: CallContext = {
        contactFirstName: item.firstName || contact?.firstName || "there",
        contactLastName: item.lastName || contact?.lastName || "",
        contactTitle: item.title || (contact as any)?.title || (contact as any)?.jobTitle || "Decision Maker",
        contactJobTitle: item.title || (contact as any)?.title || (contact as any)?.jobTitle || "Decision Maker",
        contactEmail: item.email || contact?.email || "",
        companyName: item.companyName || account?.name || "your company",
        accountName: item.companyName || account?.name || "your company",
        phoneNumber,
        campaignId,
        contactId: contactId || undefined,
        queueItemId: item.id,
        campaignName: campaign.name,
        campaignType: (campaign as any).type || (campaign as any).campaignType,
        organizationName: aiSettings.persona?.companyName || "DemandGentic.ai By Pivotal B2B",
        campaignObjective: (campaign as any).campaignObjective,
        successCriteria: (campaign as any).successCriteria,
        targetAudienceDescription: (campaign as any).targetAudienceDescription,
        productServiceInfo: (campaign as any).productServiceInfo,
        talkingPoints: (campaign as any).talkingPoints || [],
        campaignContextBrief: (campaign as any).campaignContextBrief,
        callFlow: (campaign as any).callFlow,
        maxCallDurationSeconds: (campaign as any).maxCallDurationSeconds ?? null,
        agentFullName: resolvedAgentName,
        virtualAgentId: (item as any).virtualAgentId || undefined,
      };

      // Lock the queue item
      await db.execute(sql`
        UPDATE campaign_queue
        SET status = 'in_progress', updated_at = NOW()
        WHERE id = ${item.id}
      `);

      try {
        // Get caller ID from number pool
        const numberPoolConfig = campaign.numberPoolConfig as { enabled?: boolean; maxCallsPerNumber?: number; rotationStrategy?: string; cooldownHours?: number } | null;
        let fromNumber = "";
        let callerNumberId: string | null = null;
        let callerNumberDecisionId: string | null = null;

        try {
          const callerIdResult = await getCallerIdForCall({
            campaignId,
            prospectNumber: phoneNumber,
            virtualAgentId: context.virtualAgentId || undefined,
            callType: 'ai_calls_continuous',
            numberPoolConfig: numberPoolConfig ? {
              enabled: numberPoolConfig.enabled ?? true,
              maxCallsPerNumber: numberPoolConfig.maxCallsPerNumber,
              rotationStrategy: numberPoolConfig.rotationStrategy as 'round_robin' | 'reputation_based' | 'region_match' | undefined,
              cooldownHours: numberPoolConfig.cooldownHours,
            } : undefined,
          });
          fromNumber = callerIdResult.callerId;
          callerNumberId = callerIdResult.numberId;
          callerNumberDecisionId = callerIdResult.decisionId;

          if (callerIdResult.jitterDelayMs > 0) {
            await numberPoolSleep(callerIdResult.jitterDelayMs);
          }
        } catch (poolError) {
          console.warn("[AI Continuous] Number pool selection failed, using legacy caller ID:", poolError);
          fromNumber = process.env.TELNYX_FROM_NUMBER || "";
        }

        if (!fromNumber) {
          throw new Error("Outbound phone number not configured");
        }

        context.callerNumberId = callerNumberId;
        context.callerNumberDecisionId = callerNumberDecisionId;

        // Initiate the call
        const { callId } = await bridge.initiateAiCall(phoneNumber, fromNumber, aiSettings, context);

        session.callsMade++;
        session.lastActivity = new Date();

        console.log(`[AI Continuous] Call ${session.callsMade} initiated: ${callId} to ${phoneNumber}`);

        // Wait for the call to complete before starting next
        // The bridge tracks active calls, so we wait for count to return to 0
        await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));

      } catch (initiateError: any) {
        releaseNumberWithoutOutcome(context.callerNumberId || null);

        const isWhitelistError = initiateError.message?.includes('Whitelist Error');
        if (isWhitelistError) {
          console.error(`[AI Continuous] Permanent failure for ${item.id}: ${initiateError.message}`);
          const removedReason = getTelnyxWhitelistRemovalReason(initiateError.message);
          await db.execute(sql`
            UPDATE campaign_queue
            SET status = 'removed', removed_reason = ${removedReason}, updated_at = NOW()
            WHERE id = ${item.id}
          `);
        } else {
          // Revert to queued with cooldown
          await db.execute(sql`
            UPDATE campaign_queue
            SET status = 'queued', next_attempt_at = NOW() + INTERVAL '5 minutes', updated_at = NOW()
            WHERE id = ${item.id}
          `);
          console.error(`[AI Continuous] Call failed for ${item.id}:`, initiateError.message);
        }
      }

    } catch (loopError) {
      console.error(`[AI Continuous] Error in continuous loop:`, loopError);
      // Brief pause before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`[AI Continuous] Continuous calling ended for campaign ${campaignId} - Total calls: ${session.callsMade}`);
  activeContinuousSessions.delete(campaignId);
}

router.get("/gemini-voices", requireAuth, (req, res) => {
  // Official Google Gemini Live TTS voices (30 available)
  // Source: https://ai.google.dev/gemini-api/docs/speech-generation
  res.json([
    // Female voices
    { id: "Kore", name: "Kore", gender: "female", description: "Warm, professional voice ideal for executive outreach" },
    { id: "Aoede", name: "Aoede", gender: "female", description: "Bright, engaging voice for mid-market outreach" },
    { id: "Leda", name: "Leda", gender: "female", description: "Youthful, consultative voice for high-value prospects" },
    { id: "Erinome", name: "Erinome", gender: "female", description: "Clear, precise voice for informative content" },
    { id: "Laomedeia", name: "Laomedeia", gender: "female", description: "Upbeat, dynamic voice for engaging presentations" },
    { id: "Pulcherrima", name: "Pulcherrima", gender: "female", description: "Forward, articulate voice for modern business" },
    { id: "Vindemiatrix", name: "Vindemiatrix", gender: "female", description: "Gentle, refined voice for premium experiences" },
    { id: "Achernar", name: "Achernar", gender: "female", description: "Soft, intimate voice for personal connections" },
    // Male voices
    { id: "Puck", name: "Puck", gender: "male", description: "Upbeat, friendly voice for warm outreach" },
    { id: "Charon", name: "Charon", gender: "male", description: "Informative, authoritative voice for technical audiences" },
    { id: "Fenrir", name: "Fenrir", gender: "male", description: "Bold, confident voice for enterprise sales" },
    { id: "Orus", name: "Orus", gender: "male", description: "Firm, confident voice for professional settings" },
    { id: "Zephyr", name: "Zephyr", gender: "male", description: "Bright, optimistic voice for engaging content" },
    { id: "Enceladus", name: "Enceladus", gender: "male", description: "Clear, direct voice for straightforward messaging" },
    { id: "Iapetus", name: "Iapetus", gender: "male", description: "Clear, even voice for balanced communication" },
    { id: "Algenib", name: "Algenib", gender: "male", description: "Raspy, distinctive voice for memorable pitches" },
    { id: "Rasalgethi", name: "Rasalgethi", gender: "male", description: "Informed, mature voice for executive discussions" },
    { id: "Alnilam", name: "Alnilam", gender: "male", description: "Firm, strong voice for authoritative presentations" },
    { id: "Schedar", name: "Schedar", gender: "male", description: "Even, steady voice for professional calls" },
    { id: "Gacrux", name: "Gacrux", gender: "male", description: "Mature, experienced voice for senior audiences" },
    { id: "Achird", name: "Achird", gender: "male", description: "Friendly, approachable voice for relationship building" },
    { id: "Sadachbia", name: "Sadachbia", gender: "male", description: "Lively, energetic voice for dynamic outreach" },
    { id: "Sadaltager", name: "Sadaltager", gender: "male", description: "Knowledgeable, articulate voice for consultative sales" },
    { id: "Sulafat", name: "Sulafat", gender: "male", description: "Warm, engaging voice for nurturing prospects" }
  ]);
});

export default router;
