/**
 * Knowledge Blocks API Routes
 *
 * Endpoints for managing modular, versioned agent knowledge blocks.
 * Provides runtime visibility into what agents actually know.
 * ⚠️ DEPRECATION NOTICE: Knowledge Blocks system is being phased out.
 * Primary knowledge source is now Unified Knowledge Hub (/api/knowledge-hub).
 * These endpoints remain for backward compatibility and prompt inspector UI.
 * 
 * For runtime agent prompts, use assembleProviderPrompt which prioritizes
 * Unified Knowledge Hub as the single source of truth.
 */

import { Router } from "express";
import { requireAuth } from "../auth";
import {
  getKnowledgeBlocks,
  getKnowledgeBlockById,
  getKnowledgeBlockBySlug,
  createKnowledgeBlock,
  updateKnowledgeBlock,
  deleteKnowledgeBlock,
  getKnowledgeBlockHistory,
  restoreKnowledgeBlockVersion,
  getAgentKnowledgeConfig,
  setAgentKnowledgeConfig,
  seedDefaultKnowledgeBlocks,
  areKnowledgeBlocksInitialized,
} from "../services/knowledge-block-service";
import {
  assembleAgentDefaultKnowledge,
  assembleFullEffectivePrompt,
  assembledKnowledgeToPrompt,
  generateAnnotatedPromptPreview,
  getEnvironment,
} from "../services/knowledge-assembly-service";
import {
  assembleProviderPrompt,
  getCampaignKnowledgeConfigs,
  setCampaignKnowledgeConfig,
  previewCampaignPrompt,
} from "../services/provider-prompt-assembly";
import { db } from "../db";
import { contacts, accounts, campaigns, dialerCallAttempts, campaignQueue, lists } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";
import type { KnowledgeBlockCategory, KnowledgeBlockLayer, VoiceProvider } from "@shared/schema";

const router = Router();

// ==================== KNOWLEDGE BLOCKS CRUD ====================

/**
 * GET /api/knowledge-blocks
 * List all knowledge blocks with optional filters
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { category, layer, activeOnly } = req.query;

    const blocks = await getKnowledgeBlocks({
      category: category as KnowledgeBlockCategory | undefined,
      layer: layer as KnowledgeBlockLayer | undefined,
      activeOnly: activeOnly !== "false",
    });

    res.json({
      success: true,
      blocks,
      count: blocks.length,
      environment: getEnvironment(),
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET / error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/knowledge-blocks/:id
 * Get a specific knowledge block by ID
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: "Invalid block ID" });
    }

    const block = await getKnowledgeBlockById(id);
    if (!block) {
      return res.status(404).json({ success: false, error: "Block not found" });
    }

    res.json({ success: true, block });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /:id error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/knowledge-blocks
 * Create a new knowledge block
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, slug, description, category, layer, content, isActive } = req.body;

    if (!name || !slug || !category || !layer || !content) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, slug, category, layer, content",
      });
    }

    const block = await createKnowledgeBlock(
      { name, slug, description, category, layer, content, isActive },
      req.user?.userId
    );

    res.status(201).json({ success: true, block });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] POST / error:", error);
    if (error.message?.includes("unique constraint")) {
      return res.status(409).json({ success: false, error: "Block with this slug already exists" });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/knowledge-blocks/:id
 * Update a knowledge block (creates new version if content changes)
 */
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: "Invalid block ID" });
    }

    const { name, description, content, isActive, changeReason } = req.body;

    const block = await updateKnowledgeBlock(
      id,
      { name, description, content, isActive },
      req.user?.userId,
      changeReason
    );

    if (!block) {
      return res.status(404).json({ success: false, error: "Block not found" });
    }

    res.json({ success: true, block });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] PUT /:id error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/knowledge-blocks/:id
 * Soft-delete a knowledge block (system blocks cannot be deleted)
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: "Invalid block ID" });
    }

    const deleted = await deleteKnowledgeBlock(id);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: "Block not found or is a system block that cannot be deleted",
      });
    }

    res.json({ success: true, message: "Block deleted" });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] DELETE /:id error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== VERSION HISTORY ====================

/**
 * GET /api/knowledge-blocks/:id/history
 * Get version history for a knowledge block
 */
router.get("/:id/history", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: "Invalid block ID" });
    }

    const history = await getKnowledgeBlockHistory(id);
    res.json({ success: true, history });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /:id/history error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/knowledge-blocks/:id/restore/:version
 * Restore a knowledge block to a previous version
 */
router.post("/:id/restore/:version", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const version = parseInt(req.params.version);

    if (isNaN(id) || isNaN(version)) {
      return res.status(400).json({ success: false, error: "Invalid block ID or version" });
    }

    const block = await restoreKnowledgeBlockVersion(id, version, req.user?.userId);
    if (!block) {
      return res.status(404).json({ success: false, error: "Block or version not found" });
    }

    res.json({ success: true, block });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] POST /:id/restore/:version error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== AGENT KNOWLEDGE CONFIG ====================

/**
 * GET /api/virtual-agents/:id/knowledge-blocks
 * Get knowledge block configuration for an agent
 */
router.get("/agents/:agentId/config", requireAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const configs = await getAgentKnowledgeConfig(agentId);

    res.json({
      success: true,
      configs: configs.map(({ config, block }) => ({
        blockId: config.blockId,
        blockName: block.name,
        blockSlug: block.slug,
        blockCategory: block.category,
        blockLayer: block.layer,
        isEnabled: config.isEnabled,
        hasOverride: !!config.overrideContent,
        priority: config.priority,
      })),
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /agents/:agentId/config error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/knowledge-blocks/agents/:agentId/config/:blockId
 * Set knowledge block configuration for an agent
 */
router.put("/agents/:agentId/config/:blockId", requireAuth, async (req, res) => {
  try {
    const { agentId, blockId } = req.params;
    const { isEnabled, overrideContent, priority } = req.body;

    await setAgentKnowledgeConfig(agentId, parseInt(blockId), {
      isEnabled,
      overrideContent,
      priority,
    });

    res.json({ success: true, message: "Configuration updated" });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] PUT /agents/:agentId/config/:blockId error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== RUNTIME KNOWLEDGE ASSEMBLY ====================

/**
 * GET /api/virtual-agents/:id/effective-knowledge
 * Get the effective default knowledge for an agent (pre-campaign view)
 * Shows Layer 1 (Universal) blocks with any agent-specific overrides
 */
router.get("/agents/:agentId/effective-knowledge", requireAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const knowledge = await assembleAgentDefaultKnowledge(agentId);

    res.json({
      success: true,
      knowledge,
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /agents/:agentId/effective-knowledge error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/virtual-agents/:id/effective-prompt
 * Get the full effective prompt for an agent with campaign context
 * Shows all 3 layers: Universal + Organization + Campaign
 */
router.get("/agents/:agentId/effective-prompt", requireAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { campaignId, format } = req.query;

    const knowledge = await assembleFullEffectivePrompt(
      agentId,
      campaignId as string | undefined
    );

    // Return different formats based on query param
    if (format === "text") {
      res.type("text/plain").send(assembledKnowledgeToPrompt(knowledge));
      return;
    }

    if (format === "annotated") {
      res.type("text/plain").send(generateAnnotatedPromptPreview(knowledge));
      return;
    }

    res.json({
      success: true,
      knowledge,
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /agents/:agentId/effective-prompt error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CAMPAIGN KNOWLEDGE CONFIG ====================

/**
 * GET /api/knowledge-blocks/campaigns/:campaignId/config
 * Get knowledge block configuration for a campaign
 */
router.get("/campaigns/:campaignId/config", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const configs = await getCampaignKnowledgeConfigs(campaignId);

    res.json({
      success: true,
      configs: configs.map(({ config, block }) => ({
        config: {
          blockId: config.blockId,
          isEnabled: config.isEnabled,
          overrideContent: config.overrideContent,
          openaiOverride: config.openaiOverride,
          googleOverride: config.googleOverride,
          priority: config.priority,
        },
        block: {
          id: block.id,
          name: block.name,
          slug: block.slug,
          layer: block.layer,
          category: block.category,
          content: block.content,
          tokenEstimate: block.tokenEstimate,
          version: block.version,
        },
      })),
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /campaigns/:campaignId/config error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/knowledge-blocks/campaigns/:campaignId/config/:blockId
 * Set knowledge block configuration for a campaign
 */
router.put("/campaigns/:campaignId/config/:blockId", requireAuth, async (req, res) => {
  try {
    const { campaignId, blockId } = req.params;
    const { isEnabled, overrideContent, openaiOverride, googleOverride, priority } = req.body;

    await setCampaignKnowledgeConfig(campaignId, parseInt(blockId), {
      isEnabled,
      overrideContent,
      openaiOverride,
      googleOverride,
      priority,
    });

    res.json({ success: true, message: "Campaign knowledge configuration updated" });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] PUT /campaigns/:campaignId/config/:blockId error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/knowledge-blocks/campaigns/:campaignId/preview-prompt
 * Preview assembled prompt for a campaign with specific provider
 */
router.get("/campaigns/:campaignId/preview-prompt", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { provider = "openai" } = req.query;

    const assembled = await assembleProviderPrompt({
      provider: provider as VoiceProvider,
      campaignId,
      useCondensedPrompt: true,
    });

    res.json({
      success: true,
      assembled,
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /campaigns/:campaignId/preview-prompt error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/knowledge-blocks/campaigns/:campaignId/runtime-prompt
 * Get the full runtime prompt for a specific account/contact
 * This shows exactly what will be sent to the AI model at call time
 */
router.get("/campaigns/:campaignId/runtime-prompt", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { accountId, contactId, provider = "openai" } = req.query;

    // Get campaign info
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    // Get contact info if provided
    let contactInfo: any = null;
    let accountInfo: any = null;

    if (contactId) {
      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId as string))
        .limit(1);

      if (contact) {
        contactInfo = {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          fullName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          email: contact.email,
          jobTitle: contact.jobTitle,
          accountId: contact.accountId,
        };
      }
    }

    // Get account info if provided or from contact
    const effectiveAccountId = (accountId as string) || contactInfo?.accountId;
    if (effectiveAccountId) {
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, effectiveAccountId))
        .limit(1);

      if (account) {
        accountInfo = {
          id: account.id,
          name: account.name,
          domain: account.domain,
          industry: account.industryStandardized,
          employeeCount: account.staffCount,
        };
      }
    }

    // Assemble the provider-specific prompt
    const assembled = await assembleProviderPrompt({
      provider: provider as VoiceProvider,
      campaignId,
      useCondensedPrompt: true,
    });

    // Build the contact context section (same as runtime)
    let contactContextSection = "";
    if (contactInfo) {
      contactContextSection = `
---

# Contact Context (Per-Call Personalization)

**Contact Name:** ${contactInfo.fullName || "Unknown"}
**Job Title:** ${contactInfo.jobTitle || "Unknown"}
**Email:** ${contactInfo.email || "Unknown"}
**Company:** ${accountInfo?.name || "Unknown"}
`;
    }

    // Build the account context section
    let accountContextSection = "";
    if (accountInfo) {
      accountContextSection = `
---

# Account Context

**Account Name:** ${accountInfo.name || "Unknown"}
**Domain:** ${accountInfo.domain || "Unknown"}
**Industry:** ${accountInfo.industry || "Unknown"}
**Employee Count:** ${accountInfo.employeeCount || "Unknown"}
`;
    }

    // Combine all layers into final prompt
    const finalPrompt = [
      assembled.prompt,
      accountContextSection,
      contactContextSection,
    ].filter(Boolean).join("\n");

    // Estimate token count
    const tokenEstimate = Math.ceil(finalPrompt.length / 4);

    res.json({
      success: true,
      runtime: {
        prompt: finalPrompt,
        totalTokens: tokenEstimate,
        provider: provider,
        source: assembled.source,
        assembledAt: new Date().toISOString(),
        promptHash: assembled.promptHash,
        layers: {
          knowledge: {
            tokens: assembled.totalTokens,
            source: assembled.source,
          },
          account: accountInfo ? {
            id: accountInfo.id,
            name: accountInfo.name,
            domain: accountInfo.domain,
          } : null,
          contact: contactInfo ? {
            id: contactInfo.id,
            name: contactInfo.fullName,
            email: contactInfo.email,
          } : null,
        },
        campaign: {
          id: campaign.id,
          name: campaign.name,
        },
      },
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /campaigns/:campaignId/runtime-prompt error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/knowledge-blocks/campaigns/:campaignId/accounts
 * Get accounts associated with a campaign - always returns at least 20 accounts
 * relevant to the campaign's audience criteria
 */
router.get("/campaigns/:campaignId/accounts", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const MIN_ACCOUNTS = 20;

    // Get campaign details for audience criteria
    const [campaign] = await db
      .select({
        audienceRefs: campaigns.audienceRefs,
        targetAudienceDescription: campaigns.targetAudienceDescription,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    const accountIdSet = new Set();

    // Source 1: Get accounts from campaign queue
    const queueEntries = await db
      .select({ accountId: campaignQueue.accountId })
      .from(campaignQueue)
      .where(eq(campaignQueue.campaignId, campaignId))
      .groupBy(campaignQueue.accountId);

    queueEntries.forEach(e => e.accountId && accountIdSet.add(e.accountId));

    // Source 2: Get accounts from dialer call attempts
    if (accountIdSet.size  e.contactId).filter(Boolean) as string[];
      if (contactIds.length > 0) {
        const contactAccounts = await db
          .select({ accountId: contacts.accountId })
          .from(contacts)
          .where(inArray(contacts.id, contactIds))
          .groupBy(contacts.accountId);

        contactAccounts.forEach(e => e.accountId && accountIdSet.add(e.accountId));
      }
    }

    // Source 3: Get accounts from campaign audience lists
    if (accountIdSet.size  0) {
        const contactListData = await db
          .select({ recordIds: lists.recordIds })
          .from(lists)
          .where(inArray(lists.id, listIds));

        const listContactIds = new Set();
        for (const list of contactListData) {
          if (list.recordIds && Array.isArray(list.recordIds)) {
            list.recordIds.forEach((id: string) => listContactIds.add(id));
          }
        }

        if (listContactIds.size > 0) {
          const contactIdsArray = Array.from(listContactIds).slice(0, 500);
          const contactAccounts = await db
            .select({ accountId: contacts.accountId })
            .from(contacts)
            .where(inArray(contacts.id, contactIdsArray))
            .groupBy(contacts.accountId);

          contactAccounts.forEach(e => e.accountId && accountIdSet.add(e.accountId));
        }
      }
    }

    // Source 4: If still below minimum, get accounts with contacts that have relevant criteria
    // This ensures Preview Studio always has data to work with
    if (accountIdSet.size  e.accountId && accountIdSet.add(e.accountId));
    }

    // Get account details (limit to 20 accounts)
    const accountIds = Array.from(accountIdSet).slice(0, MIN_ACCOUNTS);

    if (accountIds.length === 0) {
      return res.json({ success: true, accounts: [] });
    }

    const accountList = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        domain: accounts.domain,
        industry: accounts.industryStandardized,
      })
      .from(accounts)
      .where(inArray(accounts.id, accountIds))
      .orderBy(accounts.name);

    res.json({
      success: true,
      accounts: accountList,
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /campaigns/:campaignId/accounts error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/knowledge-blocks/accounts/:accountId/contacts
 * Get contacts for a specific account - returns up to 100 contacts
 * Prioritizes contacts with phone numbers for voice preview
 */
router.get("/accounts/:accountId/contacts", requireAuth, async (req, res) => {
  try {
    const { accountId } = req.params;

    // Get contacts, prioritizing those with phone numbers
    const contactList = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        jobTitle: contacts.jobTitle,
        accountId: contacts.accountId,
        hasPhone: sql`(${contacts.directPhoneE164} IS NOT NULL OR ${contacts.mobilePhoneE164} IS NOT NULL)`,
      })
      .from(contacts)
      .where(eq(contacts.accountId, accountId))
      .orderBy(
        sql`CASE WHEN ${contacts.directPhoneE164} IS NOT NULL OR ${contacts.mobilePhoneE164} IS NOT NULL THEN 0 ELSE 1 END`,
        contacts.lastName,
        contacts.firstName
      )
      .limit(100);

    res.json({
      success: true,
      contacts: contactList.map(c => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        jobTitle: c.jobTitle,
        accountId: c.accountId,
      })),
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /accounts/:accountId/contacts error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/knowledge-blocks/call-attempts/:attemptId/prompt
 * Get the prompt that was used for a specific call attempt
 */
router.get("/call-attempts/:attemptId/prompt", requireAuth, async (req, res) => {
  try {
    const { attemptId } = req.params;

    // Get the call attempt with its logged prompt
    const [attempt] = await db
      .select()
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, attemptId))
      .limit(1);

    if (!attempt) {
      return res.status(404).json({ success: false, error: "Call attempt not found" });
    }

    // Check if we have the logged prompt
    const promptLog = (attempt as any).systemPromptUsed || (attempt as any).promptLog;

    if (!promptLog) {
      // If no logged prompt, try to reconstruct it
      const { provider = "openai" } = req.query;

      const assembled = await assembleProviderPrompt({
        provider: provider as VoiceProvider,
        campaignId: attempt.campaignId || undefined,
        useCondensedPrompt: true,
      });

      return res.json({
        success: true,
        prompt: {
          content: assembled.prompt,
          source: "reconstructed",
          note: "This prompt was reconstructed from current knowledge blocks. It may differ from the actual prompt used at call time.",
          totalTokens: assembled.totalTokens,
          provider: provider,
        },
        attempt: {
          id: attempt.id,
          campaignId: attempt.campaignId,
          contactId: attempt.contactId,
          startedAt: attempt.callStartedAt,
          disposition: attempt.disposition,
        },
      });
    }

    res.json({
      success: true,
      prompt: {
        content: promptLog.prompt || promptLog,
        source: "logged",
        totalTokens: promptLog.totalTokens,
        provider: promptLog.provider,
        promptHash: promptLog.promptHash,
        assembledAt: promptLog.assembledAt,
      },
      attempt: {
        id: attempt.id,
        campaignId: attempt.campaignId,
        contactId: attempt.contactId,
        startedAt: attempt.callStartedAt,
        disposition: attempt.disposition,
      },
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /call-attempts/:attemptId/prompt error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== INITIALIZATION ====================

/**
 * POST /api/knowledge-blocks/seed
 * Seed default knowledge blocks (admin only)
 */
router.post("/seed", requireAuth, async (req, res) => {
  try {
    const result = await seedDefaultKnowledgeBlocks();
    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] POST /seed error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/knowledge-blocks/status
 * Check if knowledge blocks are initialized
 */
router.get("/status", requireAuth, async (req, res) => {
  try {
    const initialized = await areKnowledgeBlocksInitialized();
    res.json({
      success: true,
      initialized,
      environment: getEnvironment(),
    });
  } catch (error: any) {
    console.error("[KnowledgeBlocks] GET /status error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;