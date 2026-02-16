/**
 * Unified Prompt Management Service
 * 
 * Consolidates ALL prompt management operations:
 * - Foundational prompts (voice, email, compliance, data-management, research)
 * - Role-based agent prompts
 * - Prompt variants for A/B testing
 * - Version history and governance
 * - Outcome tracking and analytics
 * - Learning from outcomes
 */

import { db } from '../db';
import { eq, and, desc, asc, sql, isNull, or, gte, lte, inArray, count } from 'drizzle-orm';
import {
  promptRegistry,
  promptVersions,
  promptDependencyMap,
  agentPrompts,
  agentPromptHistory,
  promptVariants,
  promptVariantTests,
  variantSelectionHistory,
  callAttempts,
  users,
  campaigns,
  type PromptRegistry,
  type PromptVersion,
  type PromptDependencyMap,
  type AgentPrompt,
} from '@shared/schema';
import { createHash } from 'crypto';

// Import foundational prompts from agents
import { 
  FOUNDATIONAL_PROMPTS, 
  getFoundationalPrompt,
  VOICE_AGENT_FOUNDATIONAL_PROMPT,
  EMAIL_AGENT_FOUNDATIONAL_PROMPT,
  COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT,
  DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT,
  RESEARCH_ANALYSIS_FOUNDATIONAL_PROMPT,
} from './agents';

// ==================== Types ====================

export type PromptSource = 'registry' | 'role_based' | 'variant' | 'foundational';
export type PromptCategory = 'voice' | 'email' | 'intelligence' | 'compliance' | 'system';
export type AgentType = 'voice' | 'email' | 'compliance' | 'data_management' | 'research_analysis';

export interface UnifiedPrompt {
  id: string;
  source: PromptSource;
  key: string;
  name: string;
  description?: string;
  category?: PromptCategory;
  agentType?: string;
  content: string;
  defaultContent?: string;
  version: number;
  versionHash: string;
  isActive: boolean;
  isLocked: boolean;
  priority: number;
  tags: string[];
  metadata: {
    sourceFile?: string;
    sourceLine?: number;
    sourceExport?: string;
    userRole?: string;
    iamRoleId?: string;
    isClientPortal?: boolean;
    promptType?: string;
    capabilities?: string[];
    restrictions?: string[];
  };
  stats?: {
    usageCount: number;
    successRate: number;
    avgEngagementScore: number;
    lastUsed?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface PromptOutcome {
  promptId: string;
  promptVersion: number;
  callAttemptId?: string;
  disposition?: string;
  duration?: number;
  engagementScore?: number;
  successful: boolean;
  outcomeAt: Date;
}

export interface PromptAnalytics {
  promptId: string;
  promptKey: string;
  totalCalls: number;
  successfulCalls: number;
  successRate: number;
  avgDuration: number;
  avgEngagementScore: number;
  dispositionBreakdown: Record<string, number>;
  versionPerformance: Array<{
    version: number;
    calls: number;
    successRate: number;
    avgEngagement: number;
  }>;
  trendData: Array<{
    date: string;
    calls: number;
    successRate: number;
  }>;
}

export interface PromptLearning {
  promptId: string;
  insights: string[];
  suggestedChanges: string[];
  topPerformingPhrases: string[];
  underperformingPatterns: string[];
  recommendedAction: 'keep' | 'optimize' | 'retire' | 'test_variant';
  confidenceScore: number;
}

// ==================== Helpers ====================

/**
 * Map agent channel to prompt category
 * Agent channels: 'email', 'voice', 'governance', 'data', 'research'
 * Prompt categories: 'voice', 'email', 'intelligence', 'compliance', 'system'
 */
function mapChannelToCategory(channel: string): PromptCategory {
  const mapping: Record<string, PromptCategory> = {
    'email': 'email',
    'voice': 'voice',
    'governance': 'compliance',
    'data': 'system',
    'research': 'intelligence',
  };
  return mapping[channel] ?? 'system';
}

function generateVersionHash(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 8);
}

function mapRegistryToUnified(p: PromptRegistry): UnifiedPrompt {
  return {
    id: p.id,
    source: 'registry',
    key: p.promptKey,
    name: p.name,
    description: p.description ?? undefined,
    category: p.category as PromptCategory | undefined,
    agentType: p.agentType ?? undefined,
    content: p.content,
    defaultContent: p.defaultContent,
    version: p.version,
    versionHash: generateVersionHash(p.content),
    isActive: p.isActive,
    isLocked: p.isLocked,
    priority: p.priority,
    tags: (p.tags as string[]) ?? [],
    metadata: {
      sourceFile: p.sourceFile ?? undefined,
      sourceLine: p.sourceLine ?? undefined,
      sourceExport: p.sourceExport ?? undefined,
    },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdBy: p.createdBy ?? undefined,
    updatedBy: p.updatedBy ?? undefined,
  };
}

function mapAgentPromptToUnified(p: typeof agentPrompts.$inferSelect): UnifiedPrompt {
  return {
    id: p.id,
    source: 'role_based',
    key: `role.${p.userRole ?? 'custom'}.${p.id.slice(0, 8)}`,
    name: p.name,
    description: p.description ?? undefined,
    category: 'system',
    content: p.promptContent,
    version: p.version,
    versionHash: generateVersionHash(p.promptContent),
    isActive: p.isActive,
    isLocked: false,
    priority: p.priority,
    tags: [],
    metadata: {
      userRole: p.userRole ?? undefined,
      iamRoleId: p.iamRoleId ?? undefined,
      isClientPortal: p.isClientPortal,
      promptType: p.promptType,
      capabilities: (p.capabilities as string[]) ?? undefined,
      restrictions: (p.restrictions as string[]) ?? undefined,
    },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdBy: p.createdBy ?? undefined,
    updatedBy: p.updatedBy ?? undefined,
  };
}

function mapFoundationalToUnified(agentId: string, prompt: typeof FOUNDATIONAL_PROMPTS[keyof typeof FOUNDATIONAL_PROMPTS]): UnifiedPrompt {
  const category = mapChannelToCategory(prompt.channel);
  return {
    id: `foundational_${agentId}`,
    source: 'foundational',
    key: `foundational.${agentId}`,
    name: prompt.name,
    description: `Foundational prompt for ${prompt.channel} agent`,
    category,
    agentType: agentId,
    content: prompt.prompt,
    defaultContent: prompt.prompt,
    version: parseInt(prompt.version.replace('v', '').split('.')[0]) || 1,
    versionHash: generateVersionHash(prompt.prompt),
    isActive: true,
    isLocked: false, // Foundational prompts are editable via registry-backed revisions
    priority: 100,
    tags: ['foundational', prompt.channel, category],
    metadata: {
      sourceFile: `server/services/agents/core-${agentId.replace('_', '-')}-agent.ts`,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ==================== Service Class ====================

class UnifiedPromptService {
  // ==================== List & Query ====================

  /**
   * List all prompts across all sources with unified interface
   */
  async listAll(options: {
    source?: PromptSource;
    category?: PromptCategory;
    agentType?: string;
    isActive?: boolean;
    search?: string;
    tags?: string[];
    department?: string;
    promptFunction?: string;
    purpose?: string;
    aiModel?: string;
    status?: string;
    owner?: string;
    entity?: string;
    limit?: number;
    offset?: number;
    orderBy?: 'name' | 'priority' | 'updatedAt' | 'version';
    orderDir?: 'asc' | 'desc';
  } = {}): Promise<{ prompts: UnifiedPrompt[]; total: number }> {
    const prompts: UnifiedPrompt[] = [];
    const registryByKey = new Map<string, PromptRegistry>();
    const { source, category, agentType, isActive, search, tags, department, promptFunction, purpose, aiModel, status, owner, entity, limit = 50, offset = 0, orderBy = 'priority', orderDir = 'desc' } = options;

    // 1. Fetch from prompt_registry
    if (!source || source === 'registry') {
      const conditions: any[] = [];
      if (category) conditions.push(eq(promptRegistry.category, category));
      if (agentType) conditions.push(eq(promptRegistry.agentType, agentType));
      if (isActive !== undefined) conditions.push(eq(promptRegistry.isActive, isActive));
      if (search) conditions.push(sql`${promptRegistry.name} ILIKE ${'%' + search + '%'} OR ${promptRegistry.content} ILIKE ${'%' + search + '%'}`);
      // Enhanced filters
      if (department) conditions.push(eq(promptRegistry.department, department as any));
      if (promptFunction) conditions.push(eq(promptRegistry.promptFunction, promptFunction as any));
      if (purpose) conditions.push(eq(promptRegistry.purpose, purpose as any));
      if (aiModel) conditions.push(eq(promptRegistry.aiModel, aiModel));
      if (status) conditions.push(eq(promptRegistry.status, status as any));
      if (owner) conditions.push(eq(promptRegistry.ownerId, owner));
      if (entity) conditions.push(sql`${promptRegistry.invocationPoint}->>'entity' = ${entity}`);

      const registryPrompts = await db.select()
        .from(promptRegistry)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderDir === 'desc' ? desc(promptRegistry[orderBy] as any) : asc(promptRegistry[orderBy] as any));

      registryPrompts.forEach((p) => registryByKey.set(p.promptKey, p));

      prompts.push(...registryPrompts.map(mapRegistryToUnified));
    }

    // 2. Fetch from agent_prompts (role-based)
    if (!source || source === 'role_based') {
      const conditions: any[] = [];
      if (isActive !== undefined) conditions.push(eq(agentPrompts.isActive, isActive));
      if (search) conditions.push(sql`${agentPrompts.name} ILIKE ${'%' + search + '%'} OR ${agentPrompts.promptContent} ILIKE ${'%' + search + '%'}`);

      const rolePrompts = await db.select()
        .from(agentPrompts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(agentPrompts.priority));

      prompts.push(...rolePrompts.map(mapAgentPromptToUnified));
    }

    // 3. Fetch foundational prompts (from code)
    if (!source || source === 'foundational') {
      for (const [agentId, prompt] of Object.entries(FOUNDATIONAL_PROMPTS)) {
        const foundationalKey = `foundational.${agentId}`;
        if (registryByKey.has(foundationalKey)) {
          continue; // Prefer editable registry-backed foundational prompt and avoid duplicates
        }

        const unified = mapFoundationalToUnified(agentId, prompt);
        if (category && unified.category !== category) continue;
        if (agentType && unified.agentType !== agentType) continue;
        if (search && !unified.content.toLowerCase().includes(search.toLowerCase()) && !unified.name.toLowerCase().includes(search.toLowerCase())) continue;
        prompts.push(unified);
      }
    }

    // Filter by tags if specified
    let filtered = prompts;
    if (tags && tags.length > 0) {
      filtered = prompts.filter(p => tags.some(t => p.tags.includes(t)));
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = a[orderBy] ?? 0;
      const bVal = b[orderBy] ?? 0;
      if (orderDir === 'desc') return bVal > aVal ? 1 : -1;
      return aVal > bVal ? 1 : -1;
    });

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return { prompts: paginated, total };
  }

  /**
   * Get a single prompt by ID (handles all sources)
   */
  async getById(id: string): Promise<UnifiedPrompt | null> {
    // Check if it's a foundational prompt
    if (id.startsWith('foundational_')) {
      const agentId = id.replace('foundational_', '');
      const foundationalKey = `foundational.${agentId}`;

      const [registryPrompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.promptKey, foundationalKey)).limit(1);
      if (registryPrompt) return mapRegistryToUnified(registryPrompt);

      const prompt = FOUNDATIONAL_PROMPTS[agentId as keyof typeof FOUNDATIONAL_PROMPTS];
      if (prompt) return mapFoundationalToUnified(agentId, prompt);
    }

    // Try prompt_registry
    const [registryPrompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.id, id)).limit(1);
    if (registryPrompt) return mapRegistryToUnified(registryPrompt);

    // Try agent_prompts
    const [agentPrompt] = await db.select().from(agentPrompts).where(eq(agentPrompts.id, id)).limit(1);
    if (agentPrompt) return mapAgentPromptToUnified(agentPrompt);

    return null;
  }

  /**
   * Get a prompt by key (e.g., 'email.generation', 'foundational.voice')
   */
  async getByKey(key: string): Promise<UnifiedPrompt | null> {
    // Check if it's a foundational prompt
    if (key.startsWith('foundational.')) {
      const agentId = key.replace('foundational.', '');
      const [registryPrompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.promptKey, key)).limit(1);
      if (registryPrompt) return mapRegistryToUnified(registryPrompt);

      const prompt = FOUNDATIONAL_PROMPTS[agentId as keyof typeof FOUNDATIONAL_PROMPTS];
      if (prompt) return mapFoundationalToUnified(agentId, prompt);
    }

    // Try prompt_registry
    const [registryPrompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.promptKey, key)).limit(1);
    if (registryPrompt) return mapRegistryToUnified(registryPrompt);

    return null;
  }

  // ==================== Create & Update ====================

  /**
   * Create a new prompt in the registry
   */
  async create(data: {
    promptKey: string;
    name: string;
    description?: string;
    promptType?: 'foundational' | 'system' | 'specialized' | 'template';
    promptScope?: 'global' | 'organization' | 'campaign' | 'agent_type';
    agentType?: string;
    category?: PromptCategory;
    content: string;
    defaultContent?: string;
    priority?: number;
    tags?: string[];
    sourceFile?: string;
    sourceLine?: number;
    sourceExport?: string;
    userId?: string;
  }): Promise<UnifiedPrompt> {
    const [created] = await db.insert(promptRegistry).values({
      promptKey: data.promptKey,
      name: data.name,
      description: data.description,
      promptType: data.promptType ?? 'system',
      promptScope: data.promptScope ?? 'agent_type',
      agentType: data.agentType,
      category: data.category,
      content: data.content,
      defaultContent: data.defaultContent ?? data.content,
      priority: data.priority ?? 50,
      tags: data.tags ?? [],
      sourceFile: data.sourceFile,
      sourceLine: data.sourceLine,
      sourceExport: data.sourceExport,
      createdBy: data.userId,
      updatedBy: data.userId,
    }).returning();

    return mapRegistryToUnified(created);
  }

  /**
   * Update an existing prompt (creates version history)
   */
  async update(id: string, data: {
    name?: string;
    description?: string;
    content?: string;
    priority?: number;
    tags?: string[];
    isActive?: boolean;
    changeDescription?: string;
    userId?: string;
  }): Promise<UnifiedPrompt | null> {
    let targetId = id;

    // If caller uses synthetic foundational ID, resolve to registry ID when materialized
    if (id.startsWith('foundational_')) {
      const agentId = id.replace('foundational_', '');
      const foundationalKey = `foundational.${agentId}`;
      const [existingRegistry] = await db.select().from(promptRegistry).where(eq(promptRegistry.promptKey, foundationalKey)).limit(1);
      if (existingRegistry) {
        targetId = existingRegistry.id;
      }
    }

    // Get current prompt
    const current = await this.getById(targetId);
    if (!current) return null;

    // Foundational prompts are materialized into registry so edits get full revision history
    if (current.source === 'foundational') {
      const agentId = targetId.replace('foundational_', '');
      const foundationalKey = `foundational.${agentId}`;
      const foundational = FOUNDATIONAL_PROMPTS[agentId as keyof typeof FOUNDATIONAL_PROMPTS];

      if (!foundational) {
        throw new Error(`Unknown foundational prompt: ${agentId}`);
      }

      let [existingRegistry] = await db.select().from(promptRegistry).where(eq(promptRegistry.promptKey, foundationalKey)).limit(1);

      if (!existingRegistry) {
        const category = mapChannelToCategory(foundational.channel);
        const [createdRegistry] = await db.insert(promptRegistry).values({
          promptKey: foundationalKey,
          name: foundational.name,
          description: `Foundational prompt for ${foundational.channel} agent`,
          promptType: 'foundational',
          promptScope: 'global',
          agentType: agentId,
          category,
          content: foundational.prompt,
          defaultContent: foundational.prompt,
          priority: 100,
          tags: ['foundational', foundational.channel, category, 'core-agent'],
          sourceFile: `server/services/agents/core-${agentId.replace('_', '-')}-agent.ts`,
          sourceExport: `${agentId.toUpperCase()}_FOUNDATIONAL_PROMPT`,
          createdBy: data.userId,
          updatedBy: data.userId,
        }).returning();

        existingRegistry = createdRegistry;
      }

      return await this.update(existingRegistry.id, data);
    }

    if (current.source === 'registry') {
      // Get the full record
      const [existing] = await db.select().from(promptRegistry).where(eq(promptRegistry.id, targetId)).limit(1);
      if (!existing) return null;

      // Check if locked
      if (existing.isLocked) {
        throw new Error('This prompt is locked and cannot be edited.');
      }

      // Create version history if content changed
      if (data.content && data.content !== existing.content) {
        await db.insert(promptVersions).values({
          promptId: targetId,
          version: existing.version,
          content: existing.content,
          previousContent: existing.content,
          changeDescription: data.changeDescription ?? 'Manual update',
          changedBy: data.userId,
        });
      }

      // Update the prompt
      const [updated] = await db.update(promptRegistry)
        .set({
          name: data.name ?? existing.name,
          description: data.description ?? existing.description,
          content: data.content ?? existing.content,
          priority: data.priority ?? existing.priority,
          tags: data.tags ?? existing.tags,
          isActive: data.isActive ?? existing.isActive,
          version: data.content ? existing.version + 1 : existing.version,
          updatedBy: data.userId,
          updatedAt: new Date(),
        })
        .where(eq(promptRegistry.id, targetId))
        .returning();

      return mapRegistryToUnified(updated);
    }

    if (current.source === 'role_based') {
      // Get the full record
      const [existing] = await db.select().from(agentPrompts).where(eq(agentPrompts.id, targetId)).limit(1);
      if (!existing) return null;

      // Create history if content changed
      if (data.content && data.content !== existing.promptContent) {
        await db.insert(agentPromptHistory).values({
          agentPromptId: targetId,
          previousContent: existing.promptContent,
          previousCapabilities: existing.capabilities as string[] | null,
          previousRestrictions: existing.restrictions as string[] | null,
          changeReason: data.changeDescription ?? 'Manual update',
          version: existing.version,
          changedBy: data.userId,
        });
      }

      // Update
      const [updated] = await db.update(agentPrompts)
        .set({
          name: data.name ?? existing.name,
          description: data.description ?? existing.description,
          promptContent: data.content ?? existing.promptContent,
          priority: data.priority ?? existing.priority,
          isActive: data.isActive ?? existing.isActive,
          version: data.content ? existing.version + 1 : existing.version,
          updatedBy: data.userId,
          updatedAt: new Date(),
        })
        .where(eq(agentPrompts.id, targetId))
        .returning();

      return mapAgentPromptToUnified(updated);
    }

    return null;
  }

  /**
   * Lock/unlock a prompt
   */
  async setLocked(id: string, isLocked: boolean, userId?: string): Promise<boolean> {
    const current = await this.getById(id);
    if (!current || current.source !== 'registry') return false;

    await db.update(promptRegistry)
      .set({ isLocked, updatedBy: userId, updatedAt: new Date() })
      .where(eq(promptRegistry.id, id));

    return true;
  }

  /**
   * Soft delete (deactivate) a prompt
   */
  async deactivate(id: string, userId?: string): Promise<boolean> {
    const current = await this.getById(id);
    if (!current) return false;

    if (current.source === 'registry') {
      await db.update(promptRegistry)
        .set({ isActive: false, updatedBy: userId, updatedAt: new Date() })
        .where(eq(promptRegistry.id, id));
      return true;
    }

    if (current.source === 'role_based') {
      await db.update(agentPrompts)
        .set({ isActive: false, updatedBy: userId, updatedAt: new Date() })
        .where(eq(agentPrompts.id, id));
      return true;
    }

    return false;
  }

  // ==================== Version History ====================

  /**
   * Get version history for a prompt
   */
  async getVersionHistory(id: string): Promise<PromptVersion[]> {
    let targetId = id;

    if (id.startsWith('foundational_')) {
      const agentId = id.replace('foundational_', '');
      const foundationalKey = `foundational.${agentId}`;
      const [registryPrompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.promptKey, foundationalKey)).limit(1);
      if (registryPrompt) {
        targetId = registryPrompt.id;
      }
    }

    const current = await this.getById(targetId);
    if (!current) return [];

    if (current.source === 'foundational') {
      const foundationalKey = current.key;
      const [registryPrompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.promptKey, foundationalKey)).limit(1);
      if (!registryPrompt) return [];

      return await db.select()
        .from(promptVersions)
        .where(eq(promptVersions.promptId, registryPrompt.id))
        .orderBy(desc(promptVersions.version));
    }

    if (current.source === 'registry') {
      return await db.select()
        .from(promptVersions)
        .where(eq(promptVersions.promptId, targetId))
        .orderBy(desc(promptVersions.version));
    }

    if (current.source === 'role_based') {
      const history = await db.select()
        .from(agentPromptHistory)
        .where(eq(agentPromptHistory.agentPromptId, targetId))
        .orderBy(desc(agentPromptHistory.version));

      // Map to PromptVersion format
      return history.map(h => ({
        id: h.id,
        promptId: h.agentPromptId,
        version: h.version,
        content: h.previousContent,
        previousContent: h.previousContent,
        changeDescription: h.changeReason,
        changedBy: h.changedBy,
        changedAt: h.changedAt,
        addedLines: null,
        removedLines: null,
        modifiedLines: null,
      }));
    }

    return [];
  }

  /**
   * Restore a prompt to a previous version
   */
  async restoreVersion(id: string, version: number, userId?: string): Promise<UnifiedPrompt | null> {
    const history = await this.getVersionHistory(id);
    const targetVersion = history.find(h => h.version === version);
    if (!targetVersion) return null;

    return await this.update(id, {
      content: targetVersion.content,
      changeDescription: `Restored from version ${version}`,
      userId,
    });
  }

  /**
   * Compare two versions of a prompt
   */
  async compareVersions(id: string, v1: number, v2: number): Promise<{
    version1: { version: number; content: string; changedAt: Date };
    version2: { version: number; content: string; changedAt: Date };
    diff: { added: string[]; removed: string[]; unchanged: string[] };
  } | null> {
    const history = await this.getVersionHistory(id);
    const ver1 = history.find(h => h.version === v1);
    const ver2 = history.find(h => h.version === v2);

    if (!ver1 || !ver2) return null;

    // Simple line-by-line diff
    const lines1 = ver1.content.split('\n');
    const lines2 = ver2.content.split('\n');
    const set1 = new Set(lines1);
    const set2 = new Set(lines2);

    const added = lines2.filter(l => !set1.has(l));
    const removed = lines1.filter(l => !set2.has(l));
    const unchanged = lines1.filter(l => set2.has(l));

    return {
      version1: { version: v1, content: ver1.content, changedAt: ver1.changedAt },
      version2: { version: v2, content: ver2.content, changedAt: ver2.changedAt },
      diff: { added, removed, unchanged },
    };
  }

  // ==================== Variants & A/B Testing ====================

  /**
   * List variants for a prompt or scope
   */
  async listVariants(options: {
    accountId?: string;
    campaignId?: string;
    virtualAgentId?: string;
    isActive?: boolean;
  } = {}): Promise<typeof promptVariants.$inferSelect[]> {
    const conditions: any[] = [];
    if (options.accountId) conditions.push(eq(promptVariants.accountId, options.accountId));
    if (options.campaignId) conditions.push(eq(promptVariants.campaignId, options.campaignId));
    if (options.virtualAgentId) conditions.push(eq(promptVariants.virtualAgentId, options.virtualAgentId));
    if (options.isActive !== undefined) conditions.push(eq(promptVariants.isActive, options.isActive));

    return await db.select()
      .from(promptVariants)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(promptVariants.createdAt));
  }

  /**
   * Create a new variant for A/B testing
   */
  async createVariant(data: {
    accountId?: string;
    campaignId?: string;
    virtualAgentId?: string;
    variantName: string;
    perspective: string;
    systemPrompt: string;
    firstMessage?: string;
    context?: Record<string, any>;
    isDefault?: boolean;
    userId?: string;
  }): Promise<typeof promptVariants.$inferSelect> {
    // Determine scope
    let variantScope = 'campaign';
    if (data.virtualAgentId) variantScope = 'agent';
    else if (data.accountId && !data.campaignId) variantScope = 'account';

    const [created] = await db.insert(promptVariants).values({
      accountId: data.accountId,
      campaignId: data.campaignId,
      virtualAgentId: data.virtualAgentId,
      variantName: data.variantName,
      perspective: data.perspective as any,
      systemPrompt: data.systemPrompt,
      firstMessage: data.firstMessage,
      context: data.context,
      isDefault: data.isDefault ?? false,
      variantScope,
      createdBy: data.userId,
    }).returning();

    return created;
  }

  /**
   * Record a variant test result
   */
  async recordVariantTest(data: {
    variantId: string;
    campaignId: string;
    callAttemptId?: string;
    disposition?: string;
    duration?: number;
    engagementScore?: number;
    successful: boolean;
    notes?: string;
  }): Promise<void> {
    await db.insert(promptVariantTests).values({
      variantId: data.variantId,
      campaignId: data.campaignId,
      callAttemptId: data.callAttemptId,
      disposition: data.disposition as any,
      duration: data.duration,
      engagementScore: data.engagementScore,
      successful: data.successful,
      notes: data.notes,
    });

    // Update variant test results aggregate
    const stats = await this.getVariantStats(data.variantId);
    await db.update(promptVariants)
      .set({
        testResults: stats,
        updatedAt: new Date(),
      })
      .where(eq(promptVariants.id, data.variantId));
  }

  /**
   * Get variant statistics
   */
  async getVariantStats(variantId: string): Promise<{
    successRate: number;
    engagementScore: number;
    callDuration: number;
    sampleSize: number;
  }> {
    const tests = await db.select()
      .from(promptVariantTests)
      .where(eq(promptVariantTests.variantId, variantId));

    if (tests.length === 0) {
      return { successRate: 0, engagementScore: 0, callDuration: 0, sampleSize: 0 };
    }

    const successful = tests.filter(t => t.successful).length;
    const avgEngagement = tests.reduce((sum, t) => sum + (t.engagementScore ?? 0), 0) / tests.length;
    const avgDuration = tests.reduce((sum, t) => sum + (t.duration ?? 0), 0) / tests.length;

    return {
      successRate: successful / tests.length,
      engagementScore: avgEngagement,
      callDuration: avgDuration,
      sampleSize: tests.length,
    };
  }

  // ==================== Outcome Analytics ====================

  /**
   * Get analytics for a specific prompt
   */
  async getPromptAnalytics(promptId: string, options: {
    startDate?: Date;
    endDate?: Date;
    campaignId?: string;
  } = {}): Promise<PromptAnalytics | null> {
    const prompt = await this.getById(promptId);
    if (!prompt) return null;

    // For now, analytics only work with variants that have test data
    // In a full implementation, you'd track which prompt version was used for each call
    const variants = await this.listVariants({ isActive: true });
    const relatedVariant = variants.find(v => 
      v.systemPrompt.includes(prompt.key) || 
      v.variantName.includes(prompt.name)
    );

    if (!relatedVariant) {
      // Return empty analytics
      return {
        promptId,
        promptKey: prompt.key,
        totalCalls: 0,
        successfulCalls: 0,
        successRate: 0,
        avgDuration: 0,
        avgEngagementScore: 0,
        dispositionBreakdown: {},
        versionPerformance: [],
        trendData: [],
      };
    }

    // Get test data
    const conditions: any[] = [eq(promptVariantTests.variantId, relatedVariant.id)];
    if (options.startDate) conditions.push(gte(promptVariantTests.testedAt, options.startDate));
    if (options.endDate) conditions.push(lte(promptVariantTests.testedAt, options.endDate));
    if (options.campaignId) conditions.push(eq(promptVariantTests.campaignId, options.campaignId));

    const tests = await db.select()
      .from(promptVariantTests)
      .where(and(...conditions))
      .orderBy(desc(promptVariantTests.testedAt));

    const totalCalls = tests.length;
    const successfulCalls = tests.filter(t => t.successful).length;

    // Disposition breakdown
    const dispositionBreakdown: Record<string, number> = {};
    tests.forEach(t => {
      if (t.disposition) {
        dispositionBreakdown[t.disposition] = (dispositionBreakdown[t.disposition] || 0) + 1;
      }
    });

    // Trend data (last 30 days)
    const trendData: Array<{ date: string; calls: number; successRate: number }> = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (let i = 0; i < 30; i++) {
      const date = new Date(thirtyDaysAgo);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const dayTests = tests.filter(t => t.testedAt.toISOString().split('T')[0] === dateStr);
      const daySuccess = dayTests.filter(t => t.successful).length;

      trendData.push({
        date: dateStr,
        calls: dayTests.length,
        successRate: dayTests.length > 0 ? daySuccess / dayTests.length : 0,
      });
    }

    return {
      promptId,
      promptKey: prompt.key,
      totalCalls,
      successfulCalls,
      successRate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
      avgDuration: tests.reduce((sum, t) => sum + (t.duration ?? 0), 0) / (totalCalls || 1),
      avgEngagementScore: tests.reduce((sum, t) => sum + (t.engagementScore ?? 0), 0) / (totalCalls || 1),
      dispositionBreakdown,
      versionPerformance: [{
        version: prompt.version,
        calls: totalCalls,
        successRate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
        avgEngagement: tests.reduce((sum, t) => sum + (t.engagementScore ?? 0), 0) / (totalCalls || 1),
      }],
      trendData,
    };
  }

  /**
   * Get aggregate analytics across all prompts
   */
  async getAggregateAnalytics(options: {
    category?: PromptCategory;
    agentType?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    totalPrompts: number;
    activePrompts: number;
    totalVersions: number;
    totalVariants: number;
    totalTests: number;
    overallSuccessRate: number;
    topPerformingPrompts: Array<{ id: string; key: string; successRate: number; calls: number }>;
  }> {
    const { prompts } = await this.listAll({ category: options.category, agentType: options.agentType });
    const activePrompts = prompts.filter(p => p.isActive);

    // Count versions
    const versionCount = await db.select({ count: count() }).from(promptVersions);
    const totalVersions = Number(versionCount[0]?.count ?? 0);

    // Count variants
    const variantCount = await db.select({ count: count() }).from(promptVariants);
    const totalVariants = Number(variantCount[0]?.count ?? 0);

    // Get all tests
    const conditions: any[] = [];
    if (options.startDate) conditions.push(gte(promptVariantTests.testedAt, options.startDate));
    if (options.endDate) conditions.push(lte(promptVariantTests.testedAt, options.endDate));

    const tests = await db.select()
      .from(promptVariantTests)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const totalTests = tests.length;
    const successfulTests = tests.filter(t => t.successful).length;

    return {
      totalPrompts: prompts.length,
      activePrompts: activePrompts.length,
      totalVersions,
      totalVariants,
      totalTests,
      overallSuccessRate: totalTests > 0 ? successfulTests / totalTests : 0,
      topPerformingPrompts: [], // Would need per-prompt tracking to populate
    };
  }

  // ==================== Learning & Optimization ====================

  /**
   * Generate learning insights from outcomes
   */
  async generateLearnings(promptId: string): Promise<PromptLearning | null> {
    const prompt = await this.getById(promptId);
    if (!prompt) return null;

    const analytics = await this.getPromptAnalytics(promptId);
    if (!analytics || analytics.totalCalls < 10) {
      return {
        promptId,
        insights: ['Insufficient data for analysis. Need at least 10 calls.'],
        suggestedChanges: [],
        topPerformingPhrases: [],
        underperformingPatterns: [],
        recommendedAction: 'keep',
        confidenceScore: 0,
      };
    }

    const insights: string[] = [];
    const suggestedChanges: string[] = [];
    let recommendedAction: 'keep' | 'optimize' | 'retire' | 'test_variant' = 'keep';

    // Analyze success rate
    if (analytics.successRate >= 0.7) {
      insights.push(`High success rate (${(analytics.successRate * 100).toFixed(1)}%) indicates effective prompt.`);
      recommendedAction = 'keep';
    } else if (analytics.successRate >= 0.4) {
      insights.push(`Moderate success rate (${(analytics.successRate * 100).toFixed(1)}%) suggests room for optimization.`);
      recommendedAction = 'optimize';
      suggestedChanges.push('Consider A/B testing with alternative approaches.');
    } else {
      insights.push(`Low success rate (${(analytics.successRate * 100).toFixed(1)}%) indicates significant issues.`);
      recommendedAction = analytics.totalCalls > 50 ? 'retire' : 'test_variant';
      suggestedChanges.push('Review and rewrite the prompt with different strategy.');
    }

    // Analyze engagement
    if (analytics.avgEngagementScore < 0.3) {
      insights.push('Low engagement score suggests the prompt may not be capturing interest.');
      suggestedChanges.push('Add more engaging opening or value proposition.');
    }

    // Analyze dispositions
    const topDisposition = Object.entries(analytics.dispositionBreakdown)
      .sort(([, a], [, b]) => b - a)[0];

    if (topDisposition) {
      insights.push(`Most common outcome: ${topDisposition[0]} (${topDisposition[1]} calls)`);
      
      if (topDisposition[0] === 'not_interested' && topDisposition[1] > analytics.totalCalls * 0.5) {
        suggestedChanges.push('High "not interested" rate - consider revising value proposition or targeting.');
      }
    }

    return {
      promptId,
      insights,
      suggestedChanges,
      topPerformingPhrases: [], // Would require NLP analysis of successful calls
      underperformingPatterns: [], // Would require NLP analysis of unsuccessful calls
      recommendedAction,
      confidenceScore: Math.min(analytics.totalCalls / 100, 1), // Higher sample = higher confidence
    };
  }

  // ==================== Sync & Discovery ====================

  /**
   * Sync foundational prompts from code to database
   */
  async syncFoundationalPrompts(userId?: string): Promise<{
    created: number;
    updated: number;
    unchanged: number;
  }> {
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const [agentId, prompt] of Object.entries(FOUNDATIONAL_PROMPTS)) {
      const key = `foundational.${agentId}`;

      // Check if exists in registry
      const [existing] = await db.select()
        .from(promptRegistry)
        .where(eq(promptRegistry.promptKey, key))
        .limit(1);

      if (!existing) {
        // Create new entry
        const category = mapChannelToCategory(prompt.channel);
        await this.create({
          promptKey: key,
          name: prompt.name,
          description: `Foundational prompt for ${prompt.channel} agent`,
          promptType: 'foundational',
          promptScope: 'global',
          agentType: agentId,
          category,
          content: prompt.prompt,
          defaultContent: prompt.prompt,
          priority: 100,
          tags: ['foundational', prompt.channel, category, 'auto-synced'],
          sourceFile: `server/services/agents/core-${agentId.replace('_', '-')}-agent.ts`,
          sourceExport: `${agentId.toUpperCase()}_FOUNDATIONAL_PROMPT`,
          userId,
        });
        created++;
      } else if (existing.defaultContent !== prompt.prompt) {
        // Update default content if code changed
        await db.update(promptRegistry)
          .set({
            defaultContent: prompt.prompt,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(promptRegistry.id, existing.id));
        updated++;
      } else {
        unchanged++;
      }
    }

    return { created, updated, unchanged };
  }

  /**
   * Revert a prompt to its default (from code) content
   */
  async revertToDefault(id: string, userId?: string): Promise<UnifiedPrompt | null> {
    const [prompt] = await db.select()
      .from(promptRegistry)
      .where(eq(promptRegistry.id, id))
      .limit(1);

    if (!prompt || !prompt.defaultContent) return null;

    return await this.update(id, {
      content: prompt.defaultContent,
      changeDescription: 'Reverted to default content',
      userId,
    });
  }

  /**
   * Get prompts that have drifted from their defaults
   */
  async getDriftedPrompts(): Promise<UnifiedPrompt[]> {
    const drifted = await db.select()
      .from(promptRegistry)
      .where(sql`${promptRegistry.content} != ${promptRegistry.defaultContent}`);

    return drifted.map(mapRegistryToUnified);
  }

  // ==================== Categories & Tags ====================

  /**
   * Get all unique tags across all prompts
   */
  async getAllTags(): Promise<string[]> {
    const prompts = await db.select({ tags: promptRegistry.tags }).from(promptRegistry);
    const allTags = new Set<string>();

    prompts.forEach(p => {
      if (p.tags && Array.isArray(p.tags)) {
        (p.tags as string[]).forEach(t => allTags.add(t));
      }
    });

    // Add foundational tags
    Object.values(FOUNDATIONAL_PROMPTS).forEach(p => {
      allTags.add('foundational');
      allTags.add(p.channel);
    });

    return Array.from(allTags).sort();
  }

  /**
   * Get prompts by category with counts
   */
  async getCategoryCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {
      voice: 0,
      email: 0,
      intelligence: 0,
      compliance: 0,
      system: 0,
    };

    // Count registry prompts
    const registryCounts = await db.select({
      category: promptRegistry.category,
      count: count(),
    })
      .from(promptRegistry)
      .where(eq(promptRegistry.isActive, true))
      .groupBy(promptRegistry.category);

    registryCounts.forEach(r => {
      if (r.category) counts[r.category] = Number(r.count);
    });

    // Add foundational prompts
    Object.values(FOUNDATIONAL_PROMPTS).forEach(p => {
      counts[p.channel] = (counts[p.channel] || 0) + 1;
    });

    return counts;
  }

  // ==================== ENHANCED GOVERNANCE METHODS ====================

  /**
   * Get department-level counts for all prompts
   */
  async getDepartmentCounts(): Promise<Record<string, number>> {
    const rows = await db.select({
      department: promptRegistry.department,
      count: count(),
    })
      .from(promptRegistry)
      .where(eq(promptRegistry.isActive, true))
      .groupBy(promptRegistry.department);

    const counts: Record<string, number> = {};
    rows.forEach(r => {
      if (r.department) counts[r.department] = Number(r.count);
    });
    return counts;
  }

  /**
   * Get function-level counts for all prompts
   */
  async getFunctionCounts(): Promise<Record<string, number>> {
    const rows = await db.select({
      fn: promptRegistry.promptFunction,
      count: count(),
    })
      .from(promptRegistry)
      .where(eq(promptRegistry.isActive, true))
      .groupBy(promptRegistry.promptFunction);

    const counts: Record<string, number> = {};
    rows.forEach(r => {
      if (r.fn) counts[r.fn] = Number(r.count);
    });
    return counts;
  }

  /**
   * Get AI model counts
   */
  async getModelCounts(): Promise<Record<string, number>> {
    const rows = await db.select({
      model: promptRegistry.aiModel,
      count: count(),
    })
      .from(promptRegistry)
      .where(eq(promptRegistry.isActive, true))
      .groupBy(promptRegistry.aiModel);

    const counts: Record<string, number> = {};
    rows.forEach(r => {
      if (r.model) counts[r.model] = Number(r.count);
    });
    return counts;
  }

  /**
   * Get dependency graph for a specific prompt
   */
  async getDependencies(promptId: string): Promise<PromptDependencyMap[]> {
    return db.select()
      .from(promptDependencyMap)
      .where(eq(promptDependencyMap.promptId, promptId));
  }

  /**
   * Get full system audit data
   */
  async getSystemAudit(): Promise<{
    totalPrompts: number;
    byDepartment: Record<string, number>;
    byFunction: Record<string, number>;
    byModel: Record<string, number>;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
    byPurpose: Record<string, number>;
    unownedPrompts: number;
    draftPrompts: number;
    totalDependencies: number;
  }> {
    const [totalResult] = await db.select({ count: count() }).from(promptRegistry).where(eq(promptRegistry.isActive, true));
    const byDepartment = await this.getDepartmentCounts();
    const byFunction = await this.getFunctionCounts();
    const byModel = await this.getModelCounts();
    const byCategory = await this.getCategoryCounts();

    // Status counts
    const statusRows = await db.select({
      status: promptRegistry.status,
      count: count(),
    }).from(promptRegistry).groupBy(promptRegistry.status);
    const byStatus: Record<string, number> = {};
    statusRows.forEach(r => { if (r.status) byStatus[r.status] = Number(r.count); });

    // Purpose counts
    const purposeRows = await db.select({
      purpose: promptRegistry.purpose,
      count: count(),
    }).from(promptRegistry).where(eq(promptRegistry.isActive, true)).groupBy(promptRegistry.purpose);
    const byPurpose: Record<string, number> = {};
    purposeRows.forEach(r => { if (r.purpose) byPurpose[r.purpose] = Number(r.count); });

    // Unowned
    const [unownedResult] = await db.select({ count: count() })
      .from(promptRegistry)
      .where(and(eq(promptRegistry.isActive, true), isNull(promptRegistry.ownerId)));

    // Draft
    const [draftResult] = await db.select({ count: count() })
      .from(promptRegistry)
      .where(eq(promptRegistry.status, 'draft'));

    // Dependencies
    const [depResult] = await db.select({ count: count() }).from(promptDependencyMap);

    return {
      totalPrompts: Number(totalResult?.count || 0),
      byDepartment,
      byFunction,
      byModel,
      byCategory,
      byStatus,
      byPurpose,
      unownedPrompts: Number(unownedResult?.count || 0),
      draftPrompts: Number(draftResult?.count || 0),
      totalDependencies: Number(depResult?.count || 0),
    };
  }

  /**
   * Update prompt ownership
   */
  async setOwnership(promptId: string, ownerId: string, ownerDepartment?: string): Promise<void> {
    await db.update(promptRegistry)
      .set({
        ownerId,
        ownerDepartment: ownerDepartment || null,
        updatedAt: new Date(),
      })
      .where(eq(promptRegistry.id, promptId));
  }

  /**
   * Update prompt status (draft/live/archived/deprecated)
   */
  async setStatus(promptId: string, status: 'draft' | 'live' | 'archived' | 'deprecated', userId?: string): Promise<void> {
    await db.update(promptRegistry)
      .set({
        status,
        updatedBy: userId || null,
        updatedAt: new Date(),
      })
      .where(eq(promptRegistry.id, promptId));
  }

  /**
   * Get governance dashboard data
   */
  async getGovernanceData(): Promise<{
    pendingDrafts: Array<{ id: string; name: string; promptKey: string; updatedAt: Date }>;
    recentChanges: Array<{ id: string; promptId: string; version: number; changeDescription: string | null; changedAt: Date; changedByName: string | null }>;
    ownershipGaps: Array<{ id: string; name: string; promptKey: string; department: string | null }>;
    deprecatedPrompts: Array<{ id: string; name: string; promptKey: string }>;
  }> {
    // Pending drafts
    const pendingDrafts = await db.select({
      id: promptRegistry.id,
      name: promptRegistry.name,
      promptKey: promptRegistry.promptKey,
      updatedAt: promptRegistry.updatedAt,
    })
      .from(promptRegistry)
      .where(eq(promptRegistry.status, 'draft'))
      .orderBy(desc(promptRegistry.updatedAt))
      .limit(20);

    // Recent changes (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentChanges = await db.select({
      id: promptVersions.id,
      promptId: promptVersions.promptId,
      version: promptVersions.version,
      changeDescription: promptVersions.changeDescription,
      changedAt: promptVersions.changedAt,
      changedByName: users.fullName,
    })
      .from(promptVersions)
      .leftJoin(users, eq(promptVersions.changedBy, users.id))
      .where(gte(promptVersions.changedAt, thirtyDaysAgo))
      .orderBy(desc(promptVersions.changedAt))
      .limit(50);

    // Ownership gaps
    const ownershipGaps = await db.select({
      id: promptRegistry.id,
      name: promptRegistry.name,
      promptKey: promptRegistry.promptKey,
      department: promptRegistry.department,
    })
      .from(promptRegistry)
      .where(and(eq(promptRegistry.isActive, true), isNull(promptRegistry.ownerId)))
      .orderBy(promptRegistry.name)
      .limit(50);

    // Deprecated prompts
    const deprecatedPrompts = await db.select({
      id: promptRegistry.id,
      name: promptRegistry.name,
      promptKey: promptRegistry.promptKey,
    })
      .from(promptRegistry)
      .where(eq(promptRegistry.status, 'deprecated'))
      .limit(20);

    return { pendingDrafts, recentChanges, ownershipGaps, deprecatedPrompts };
  }

  /**
   * Get intelligence flow map data showing how prompts connect across the system
   */
  async getFlowMap(): Promise<{
    nodes: Array<{ id: string; type: string; name: string; department: string | null; category: string | null }>;
    edges: Array<{ source: string; target: string; type: string; label: string }>;
  }> {
    // Get all active prompts with their dependencies
    const allPrompts = await db.select({
      id: promptRegistry.id,
      name: promptRegistry.name,
      promptKey: promptRegistry.promptKey,
      department: promptRegistry.department,
      category: promptRegistry.category,
    })
      .from(promptRegistry)
      .where(eq(promptRegistry.isActive, true));

    const allDeps = await db.select()
      .from(promptDependencyMap);

    const nodes = allPrompts.map(p => ({
      id: p.id,
      type: 'prompt',
      name: p.name,
      department: p.department,
      category: p.category,
    }));

    // Add service/route nodes from dependencies
    const entityNodes = new Map<string, { id: string; type: string; name: string }>();
    allDeps.forEach(dep => {
      const key = `${dep.entityType}_${dep.entityName}`;
      if (!entityNodes.has(key)) {
        entityNodes.set(key, {
          id: key,
          type: dep.entityType,
          name: dep.entityName,
        });
      }
    });

    entityNodes.forEach(node => {
      nodes.push({ ...node, department: null, category: null });
    });

    const edges = allDeps.map(dep => ({
      source: dep.direction === 'produces' ? `${dep.entityType}_${dep.entityName}` : dep.promptId,
      target: dep.direction === 'produces' ? dep.promptId : `${dep.entityType}_${dep.entityName}`,
      type: dep.direction,
      label: dep.serviceFunction,
    }));

    return { nodes, edges };
  }
}

// Export singleton instance
export const unifiedPromptService = new UnifiedPromptService();
