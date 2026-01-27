/**
 * Prompt Management Service
 *
 * CENTRALIZED MANAGEMENT for ALL AI prompts in the system.
 *
 * This service provides:
 * - CRUD operations for prompts with automatic version tracking
 * - Runtime prompt retrieval with optional Redis caching
 * - Sync functionality to import prompts from codebase
 * - Version history and rollback capabilities
 *
 * All prompt updates are tracked with full audit trail including:
 * - Who made the change
 * - When it was made
 * - What changed (diff statistics)
 * - Change description
 */

import { db } from "../db";
import { promptRegistry, promptVersions, users } from "@shared/schema";
import type { PromptRegistry, InsertPromptRegistry, PromptVersion, InsertPromptVersion } from "@shared/schema";
import { desc, eq, and, ilike, or, sql, asc } from "drizzle-orm";
import { isRedisConfigured, getRedisUrl } from "../lib/redis-config";
import Redis from "ioredis";

const LOG_PREFIX = '[PromptManagement]';

// ==================== REDIS CACHING ====================

const PROMPT_CACHE_PREFIX = 'prompt:';
const PROMPT_CACHE_TTL = 300; // 5 minutes

let redisClient: Redis | null = null;

/**
 * Get Redis client for caching (lazy initialization)
 */
function getRedisClient(): Redis | null {
  if (!isRedisConfigured()) {
    return null;
  }

  if (!redisClient) {
    const url = getRedisUrl();
    if (url) {
      try {
        redisClient = new Redis(url, {
          maxRetriesPerRequest: 1,
          retryStrategy: () => null, // Don't retry, just fail fast
          connectTimeout: 2000,
        });
        redisClient.on('error', () => {
          // Silently handle errors - Redis is optional
        });
      } catch {
        redisClient = null;
      }
    }
  }
  return redisClient;
}

// ==================== TYPES ====================

export type PromptCategory = 'voice' | 'email' | 'intelligence' | 'compliance' | 'system';

export interface PromptListItem {
  id: string;
  promptKey: string;
  name: string;
  description: string | null;
  promptType: string;
  promptScope: string;
  agentType: string | null;
  category: string | null;
  isActive: boolean;
  version: number;
  updatedAt: Date;
  updatedByName: string | null;
}

export interface PromptDetail extends PromptListItem {
  content: string;
  defaultContent: string;
  isLocked: boolean;
  priority: number;
  tags: string[];
  sourceFile: string | null;
  sourceLine: number | null;
  sourceExport: string | null;
  createdAt: Date;
  createdByName: string | null;
}

export interface PromptVersionItem {
  id: string;
  version: number;
  changeDescription: string;
  changedAt: Date;
  changedByName: string | null;
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
}

export interface PromptVersionDetail extends PromptVersionItem {
  content: string;
  previousContent: string | null;
}

// ==================== PROMPT CRUD OPERATIONS ====================

/**
 * Get all prompts with optional filtering
 */
export async function getPrompts(options: {
  category?: string;
  type?: string;
  scope?: string;
  agentType?: string;
  search?: string;
  activeOnly?: boolean;
} = {}): Promise<PromptListItem[]> {
  try {
    const conditions = [];

    if (options.category) {
      conditions.push(eq(promptRegistry.category, options.category));
    }
    if (options.type) {
      conditions.push(eq(promptRegistry.promptType, options.type as any));
    }
    if (options.scope) {
      conditions.push(eq(promptRegistry.promptScope, options.scope as any));
    }
    if (options.agentType) {
      conditions.push(eq(promptRegistry.agentType, options.agentType as any));
    }
    if (options.activeOnly !== false) {
      conditions.push(eq(promptRegistry.isActive, true));
    }
    if (options.search) {
      conditions.push(
        or(
          ilike(promptRegistry.name, `%${options.search}%`),
          ilike(promptRegistry.promptKey, `%${options.search}%`),
          ilike(promptRegistry.description, `%${options.search}%`)
        )
      );
    }

    const query = db
      .select({
        id: promptRegistry.id,
        promptKey: promptRegistry.promptKey,
        name: promptRegistry.name,
        description: promptRegistry.description,
        promptType: promptRegistry.promptType,
        promptScope: promptRegistry.promptScope,
        agentType: promptRegistry.agentType,
        category: promptRegistry.category,
        isActive: promptRegistry.isActive,
        version: promptRegistry.version,
        updatedAt: promptRegistry.updatedAt,
        updatedByName: users.username,
      })
      .from(promptRegistry)
      .leftJoin(users, eq(promptRegistry.updatedBy, users.id))
      .orderBy(asc(promptRegistry.category), asc(promptRegistry.priority), asc(promptRegistry.name));

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }

    return await query;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching prompts:`, error);
    throw error;
  }
}

/**
 * Get a single prompt by ID with full details
 */
export async function getPromptById(id: string): Promise<PromptDetail | null> {
  try {
    const [prompt] = await db
      .select({
        id: promptRegistry.id,
        promptKey: promptRegistry.promptKey,
        name: promptRegistry.name,
        description: promptRegistry.description,
        promptType: promptRegistry.promptType,
        promptScope: promptRegistry.promptScope,
        agentType: promptRegistry.agentType,
        category: promptRegistry.category,
        content: promptRegistry.content,
        defaultContent: promptRegistry.defaultContent,
        isActive: promptRegistry.isActive,
        isLocked: promptRegistry.isLocked,
        priority: promptRegistry.priority,
        tags: promptRegistry.tags,
        sourceFile: promptRegistry.sourceFile,
        sourceLine: promptRegistry.sourceLine,
        sourceExport: promptRegistry.sourceExport,
        version: promptRegistry.version,
        createdAt: promptRegistry.createdAt,
        updatedAt: promptRegistry.updatedAt,
        updatedByName: users.username,
      })
      .from(promptRegistry)
      .leftJoin(users, eq(promptRegistry.updatedBy, users.id))
      .where(eq(promptRegistry.id, id))
      .limit(1);

    if (!prompt) return null;

    // Get created by name separately
    let createdByName: string | null = null;
    if (prompt) {
      const [creator] = await db
        .select({ username: users.username })
        .from(promptRegistry)
        .leftJoin(users, eq(promptRegistry.createdBy, users.id))
        .where(eq(promptRegistry.id, id))
        .limit(1);
      createdByName = creator?.username || null;
    }

    return {
      ...prompt,
      tags: (prompt.tags as string[]) || [],
      createdByName,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching prompt ${id}:`, error);
    throw error;
  }
}

/**
 * Get a prompt by its unique key (for runtime loading)
 */
export async function getPromptByKey(promptKey: string): Promise<string | null> {
  try {
    // Check cache first
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(`${PROMPT_CACHE_PREFIX}${promptKey}`);
        if (cached) {
          console.log(`${LOG_PREFIX} Cache hit for ${promptKey}`);
          return cached;
        }
      } catch {
        // Cache miss or error, continue to database
      }
    }

    const [prompt] = await db
      .select({ content: promptRegistry.content })
      .from(promptRegistry)
      .where(and(
        eq(promptRegistry.promptKey, promptKey),
        eq(promptRegistry.isActive, true)
      ))
      .limit(1);

    if (!prompt) return null;

    // Cache the result
    if (redis) {
      try {
        await redis.setex(`${PROMPT_CACHE_PREFIX}${promptKey}`, PROMPT_CACHE_TTL, prompt.content);
      } catch {
        // Caching failed, but we have the result
      }
    }

    return prompt.content;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching prompt by key ${promptKey}:`, error);
    return null;
  }
}

/**
 * Calculate diff statistics between two strings
 */
function calculateDiffStats(oldContent: string, newContent: string): { added: number; removed: number; modified: number } {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let added = 0;
  let removed = 0;

  for (const line of newLines) {
    if (!oldSet.has(line)) added++;
  }

  for (const line of oldLines) {
    if (!newSet.has(line)) removed++;
  }

  // Modified is approximate - lines that changed but weren't purely added/removed
  const modified = Math.min(added, removed);

  return { added, removed, modified };
}

/**
 * Update a prompt with automatic version tracking
 */
export async function updatePrompt(
  id: string,
  content: string,
  changeDescription: string,
  userId: string | null,
  options: {
    name?: string;
    description?: string;
    priority?: number;
    tags?: string[];
    isActive?: boolean;
  } = {}
): Promise<PromptDetail> {
  try {
    // Get current prompt
    const current = await getPromptById(id);
    if (!current) {
      throw new Error(`Prompt not found: ${id}`);
    }

    if (current.isLocked) {
      throw new Error(`Prompt is locked and cannot be edited: ${current.promptKey}`);
    }

    const newVersion = current.version + 1;
    const diffStats = calculateDiffStats(current.content, content);

    // Create version record
    await db.insert(promptVersions).values({
      promptId: id,
      version: newVersion,
      content: content,
      previousContent: current.content,
      changeDescription,
      changedBy: userId,
      addedLines: diffStats.added,
      removedLines: diffStats.removed,
      modifiedLines: diffStats.modified,
    });

    // Update main record
    const updateData: Partial<InsertPromptRegistry> = {
      content,
      version: newVersion,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    if (options.name !== undefined) updateData.name = options.name;
    if (options.description !== undefined) updateData.description = options.description;
    if (options.priority !== undefined) updateData.priority = options.priority;
    if (options.tags !== undefined) updateData.tags = options.tags;
    if (options.isActive !== undefined) updateData.isActive = options.isActive;

    await db
      .update(promptRegistry)
      .set(updateData)
      .where(eq(promptRegistry.id, id));

    // Invalidate cache
    await invalidatePromptCache(current.promptKey);

    console.log(`${LOG_PREFIX} Updated prompt ${current.promptKey} to version ${newVersion}`);

    return (await getPromptById(id))!;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating prompt ${id}:`, error);
    throw error;
  }
}

/**
 * Invalidate cached prompt
 */
export async function invalidatePromptCache(promptKey: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(`${PROMPT_CACHE_PREFIX}${promptKey}`);
      console.log(`${LOG_PREFIX} Cache invalidated for ${promptKey}`);
    } catch {
      // Cache invalidation failed, not critical
    }
  }
}

// ==================== VERSION HISTORY ====================

/**
 * Get version history for a prompt
 */
export async function getPromptVersionHistory(promptId: string, limit: number = 50): Promise<PromptVersionItem[]> {
  try {
    const versions = await db
      .select({
        id: promptVersions.id,
        version: promptVersions.version,
        changeDescription: promptVersions.changeDescription,
        changedAt: promptVersions.changedAt,
        changedByName: users.username,
        addedLines: promptVersions.addedLines,
        removedLines: promptVersions.removedLines,
        modifiedLines: promptVersions.modifiedLines,
      })
      .from(promptVersions)
      .leftJoin(users, eq(promptVersions.changedBy, users.id))
      .where(eq(promptVersions.promptId, promptId))
      .orderBy(desc(promptVersions.version))
      .limit(limit);

    return versions.map(v => ({
      ...v,
      addedLines: v.addedLines || 0,
      removedLines: v.removedLines || 0,
      modifiedLines: v.modifiedLines || 0,
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching version history for ${promptId}:`, error);
    throw error;
  }
}

/**
 * Get a specific version of a prompt
 */
export async function getPromptVersion(promptId: string, version: number): Promise<PromptVersionDetail | null> {
  try {
    const [versionRecord] = await db
      .select({
        id: promptVersions.id,
        version: promptVersions.version,
        content: promptVersions.content,
        previousContent: promptVersions.previousContent,
        changeDescription: promptVersions.changeDescription,
        changedAt: promptVersions.changedAt,
        changedByName: users.username,
        addedLines: promptVersions.addedLines,
        removedLines: promptVersions.removedLines,
        modifiedLines: promptVersions.modifiedLines,
      })
      .from(promptVersions)
      .leftJoin(users, eq(promptVersions.changedBy, users.id))
      .where(and(
        eq(promptVersions.promptId, promptId),
        eq(promptVersions.version, version)
      ))
      .limit(1);

    if (!versionRecord) return null;

    return {
      ...versionRecord,
      addedLines: versionRecord.addedLines || 0,
      removedLines: versionRecord.removedLines || 0,
      modifiedLines: versionRecord.modifiedLines || 0,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching version ${version} for ${promptId}:`, error);
    throw error;
  }
}

/**
 * Revert a prompt to a specific version
 */
export async function revertPromptToVersion(
  promptId: string,
  targetVersion: number,
  userId: string | null
): Promise<PromptDetail> {
  try {
    const versionRecord = await getPromptVersion(promptId, targetVersion);
    if (!versionRecord) {
      throw new Error(`Version ${targetVersion} not found for prompt ${promptId}`);
    }

    return await updatePrompt(
      promptId,
      versionRecord.content,
      `Reverted to version ${targetVersion}`,
      userId
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Error reverting prompt ${promptId} to version ${targetVersion}:`, error);
    throw error;
  }
}

/**
 * Reset a prompt to its default content
 */
export async function resetPromptToDefault(
  promptId: string,
  userId: string | null
): Promise<PromptDetail> {
  try {
    const current = await getPromptById(promptId);
    if (!current) {
      throw new Error(`Prompt not found: ${promptId}`);
    }

    return await updatePrompt(
      promptId,
      current.defaultContent,
      'Reset to default content',
      userId
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Error resetting prompt ${promptId}:`, error);
    throw error;
  }
}

// ==================== PROMPT SYNC FROM CODEBASE ====================

export interface PromptDefinition {
  promptKey: string;
  name: string;
  description: string;
  promptType: 'foundational' | 'knowledge' | 'specialized' | 'compliance' | 'system';
  promptScope: 'global' | 'agent_type' | 'campaign' | 'organization';
  agentType?: 'voice' | 'email' | 'intelligence' | 'compliance' | 'data_management';
  category: string;
  content: string;
  sourceFile: string;
  sourceLine?: number;
  sourceExport: string;
  priority?: number;
  tags?: string[];
}

/**
 * Sync a single prompt definition to the database
 * If prompt exists, updates defaultContent but preserves custom content
 * If prompt doesn't exist, creates it
 */
export async function syncPromptDefinition(
  definition: PromptDefinition,
  userId: string | null
): Promise<{ action: 'created' | 'updated' | 'skipped'; promptKey: string }> {
  try {
    // Check if prompt exists
    const [existing] = await db
      .select()
      .from(promptRegistry)
      .where(eq(promptRegistry.promptKey, definition.promptKey))
      .limit(1);

    if (existing) {
      // Update defaultContent only if it changed
      if (existing.defaultContent !== definition.content) {
        await db
          .update(promptRegistry)
          .set({
            defaultContent: definition.content,
            sourceFile: definition.sourceFile,
            sourceLine: definition.sourceLine,
            sourceExport: definition.sourceExport,
            updatedAt: new Date(),
          })
          .where(eq(promptRegistry.id, existing.id));

        console.log(`${LOG_PREFIX} Updated default content for ${definition.promptKey}`);
        return { action: 'updated', promptKey: definition.promptKey };
      }

      return { action: 'skipped', promptKey: definition.promptKey };
    }

    // Create new prompt
    await db.insert(promptRegistry).values({
      promptKey: definition.promptKey,
      name: definition.name,
      description: definition.description,
      promptType: definition.promptType,
      promptScope: definition.promptScope,
      agentType: definition.agentType,
      category: definition.category,
      content: definition.content,
      defaultContent: definition.content,
      sourceFile: definition.sourceFile,
      sourceLine: definition.sourceLine,
      sourceExport: definition.sourceExport,
      priority: definition.priority || 50,
      tags: definition.tags || [],
      createdBy: userId,
      updatedBy: userId,
    });

    // Create initial version record
    const [newPrompt] = await db
      .select()
      .from(promptRegistry)
      .where(eq(promptRegistry.promptKey, definition.promptKey))
      .limit(1);

    if (newPrompt) {
      await db.insert(promptVersions).values({
        promptId: newPrompt.id,
        version: 1,
        content: definition.content,
        previousContent: null,
        changeDescription: 'Initial sync from codebase',
        changedBy: userId,
        addedLines: definition.content.split('\n').length,
        removedLines: 0,
        modifiedLines: 0,
      });
    }

    console.log(`${LOG_PREFIX} Created new prompt ${definition.promptKey}`);
    return { action: 'created', promptKey: definition.promptKey };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error syncing prompt ${definition.promptKey}:`, error);
    throw error;
  }
}

/**
 * Sync multiple prompt definitions
 */
export async function syncPromptDefinitions(
  definitions: PromptDefinition[],
  userId: string | null
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
  const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

  for (const definition of definitions) {
    try {
      const result = await syncPromptDefinition(definition, userId);
      results[result.action]++;
    } catch (error) {
      results.errors.push(`${definition.promptKey}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log(`${LOG_PREFIX} Sync complete: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.errors.length} errors`);
  return results;
}

// ==================== STATISTICS ====================

/**
 * Get prompt statistics by category
 */
export async function getPromptStats(): Promise<{
  total: number;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
  recentlyUpdated: number;
}> {
  try {
    const allPrompts = await db.select().from(promptRegistry);

    const byCategory: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let recentlyUpdated = 0;

    for (const prompt of allPrompts) {
      // By category
      const cat = prompt.category || 'uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + 1;

      // By type
      const type = prompt.promptType || 'unknown';
      byType[type] = (byType[type] || 0) + 1;

      // Recently updated
      if (prompt.updatedAt > oneDayAgo) {
        recentlyUpdated++;
      }
    }

    return {
      total: allPrompts.length,
      byCategory,
      byType,
      recentlyUpdated,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting prompt stats:`, error);
    throw error;
  }
}
