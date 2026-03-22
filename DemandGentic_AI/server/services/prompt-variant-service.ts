/**
 * Prompt Variant Service
 * Manages creation, retrieval, testing, and comparison of multiple prompt variants
 * Supports both agent-level (template) and campaign-level (specific) variants
 */

import { db } from "../db";
import {
  promptVariants,
  promptVariantTests,
  variantSelectionHistory,
  virtualAgents,
  campaigns,
  callAttempts,
} from "../../shared/schema";
import { eq, and, desc, inArray, or } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

interface PromptVariantInput {
  variantName: string;
  perspective: "consultative" | "direct_value" | "pain_point" | "social_proof" | "educational" | "urgent" | "relationship";
  systemPrompt: string;
  firstMessage?: string;
  context?: Record;
  isDefault?: boolean;
  variantScope?: "account" | "campaign" | "agent";
}

interface VariantTestResult {
  variantId: string;
  campaignId: string;
  callAttemptId?: string;
  disposition?: string;
  duration?: number;
  engagementScore?: number;
  successful?: boolean;
  notes?: string;
}

interface VariantComparison {
  variantId: string;
  variantName: string;
  perspective: string;
  testCount: number;
  successRate: number;
  avgDuration: number;
  avgEngagementScore: number;
}

/**
 * Create a new prompt variant at account, campaign, or agent level
 */
export async function createPromptVariant(
  input: PromptVariantInput & { accountId?: string; campaignId?: string; agentId?: string },
  userId?: string
): Promise {
  const { accountId, campaignId, agentId, ...variantInput } = input;

  if (!accountId && !campaignId && !agentId) {
    throw new Error("At least one of accountId, campaignId, or agentId is required");
  }

  // Determine variant scope based on provided IDs
  const scope = campaignId ? "campaign" : agentId ? "agent" : "account";

  const [variant] = await db
    .insert(promptVariants)
    .values({
      accountId: accountId || null,
      campaignId: campaignId || null,
      virtualAgentId: agentId || null,
      variantName: variantInput.variantName,
      perspective: variantInput.perspective,
      systemPrompt: variantInput.systemPrompt,
      firstMessage: variantInput.firstMessage,
      context: variantInput.context,
      isDefault: variantInput.isDefault || false,
      variantScope: scope,
      createdBy: userId,
    })
    .returning();

  return variant;
}

/**
 * Get all variants for a campaign or agent
 */
export async function getCampaignVariants(campaignId: string) {
  const variants = await db
    .select()
    .from(promptVariants)
    .where(eq(promptVariants.campaignId, campaignId));

  return variants;
}

/**
 * Get all account-level variants
 */
export async function getAccountVariants(accountId: string) {
  const variants = await db
    .select()
    .from(promptVariants)
    .where(eq(promptVariants.accountId, accountId));

  return variants;
}

/**
 * Get agent-level variants (templates) that can be used as fallback
 */
export async function getAgentVariants(agentId: string) {
  const variants = await db
    .select()
    .from(promptVariants)
    .where(eq(promptVariants.virtualAgentId, agentId));

  return variants;
}

/**
 * Get active variant with hierarchical fallback: campaign > account > agent
 */
export async function getActiveVariantForCampaign(
  campaignId: string,
  accountId?: string,
  agentId?: string
): Promise {
  // First, try campaign-level default
  const campaignVariant = await db
    .select()
    .from(promptVariants)
    .where(
      and(
        eq(promptVariants.campaignId, campaignId),
        eq(promptVariants.isDefault, true),
        eq(promptVariants.isActive, true)
      )
    )
    .then((rows) => rows[0]);

  if (campaignVariant) return campaignVariant;

  // Fallback to account-level default if provided
  if (accountId) {
    const accountVariant = await db
      .select()
      .from(promptVariants)
      .where(
        and(
          eq(promptVariants.accountId, accountId),
          eq(promptVariants.isDefault, true),
          eq(promptVariants.isActive, true)
        )
      )
      .then((rows) => rows[0]);

    if (accountVariant) return accountVariant;
  }

  // Fallback to agent-level default if provided
  if (agentId) {
    const agentVariant = await db
      .select()
      .from(promptVariants)
      .where(
        and(
          eq(promptVariants.virtualAgentId, agentId),
          eq(promptVariants.isDefault, true),
          eq(promptVariants.isActive, true)
        )
      )
      .then((rows) => rows[0]);

    if (agentVariant) return agentVariant;
  }

  return null;
}

/**
 * Get a specific variant with its test results
 */
export async function getVariantWithTests(variantId: string) {
  const variant = await db
    .select()
    .from(promptVariants)
    .where(eq(promptVariants.id, variantId))
    .then((rows) => rows[0]);

  if (!variant) return null;

  const tests = await db
    .select()
    .from(promptVariantTests)
    .where(eq(promptVariantTests.variantId, variantId));

  // Calculate aggregate metrics
  const successfulTests = tests.filter((t) => t.successful);
  const successRate = tests.length > 0 ? (successfulTests.length / tests.length) * 100 : 0;
  const avgDuration =
    tests.length > 0
      ? tests.reduce((sum, t) => sum + (t.duration || 0), 0) / tests.filter((t) => t.duration).length
      : 0;
  const avgEngagementScore =
    tests.length > 0
      ? tests.reduce((sum, t) => sum + (t.engagementScore || 0), 0) / tests.filter((t) => t.engagementScore !== null).length
      : 0;

  return {
    variant,
    tests,
    metrics: {
      testCount: tests.length,
      successRate,
      avgDuration,
      avgEngagementScore,
    },
  };
}

/**
 * Record a test result for a variant (after a call)
 */
export async function recordVariantTest(result: VariantTestResult): Promise {
  const [test] = await db
    .insert(promptVariantTests)
    .values({
      variantId: result.variantId,
      campaignId: result.campaignId,
      callAttemptId: result.callAttemptId,
      disposition: result.disposition as any,
      duration: result.duration,
      engagementScore: result.engagementScore,
      successful: result.successful,
      notes: result.notes,
    })
    .returning();

  // Update variant's cached test results
  await updateVariantTestResults(result.variantId);

  return test;
}

/**
 * Update variant's aggregated test results cache
 */
async function updateVariantTestResults(variantId: string) {
  const tests = await db
    .select()
    .from(promptVariantTests)
    .where(eq(promptVariantTests.variantId, variantId));

  const successfulTests = tests.filter((t) => t.successful);
  const successRate = tests.length > 0 ? (successfulTests.length / tests.length) * 100 : 0;
  const avgDuration =
    tests.length > 0
      ? tests.reduce((sum, t) => sum + (t.duration || 0), 0) / tests.filter((t) => t.duration).length
      : 0;
  const avgEngagementScore =
    tests.length > 0
      ? tests.reduce((sum, t) => sum + (t.engagementScore || 0), 0) / tests.filter((t) => t.engagementScore !== null).length
      : 0;

  await db
    .update(promptVariants)
    .set({
      testResults: {
        testCount: tests.length,
        successRate,
        avgDuration,
        avgEngagementScore,
        lastUpdated: new Date().toISOString(),
      },
    })
    .where(eq(promptVariants.id, variantId));
}

/**
 * Record which variant was selected for a call (for tracking)
 */
export async function recordVariantSelection(
  callAttemptId: string,
  variantId: string | null,
  perspective: string,
  selectionMethod: "manual" | "ab_test" | "dynamic" | "default"
): Promise {
  const [record] = await db
    .insert(variantSelectionHistory)
    .values({
      callAttemptId,
      variantId,
      perspective: perspective as any,
      selectionMethod,
    })
    .returning();

  return record;
}

/**
 * Compare variants for a campaign - shows performance across all variants
 */
export async function compareCampaignVariants(campaignId: string): Promise {
  const variants = await db
    .select()
    .from(promptVariants)
    .where(eq(promptVariants.campaignId, campaignId));

  const comparisons: VariantComparison[] = await Promise.all(
    variants.map(async (variant) => {
      const tests = await db
        .select()
        .from(promptVariantTests)
        .where(eq(promptVariantTests.variantId, variant.id));

      const successfulTests = tests.filter((t) => t.successful);
      const successRate = tests.length > 0 ? (successfulTests.length / tests.length) * 100 : 0;
      const avgDuration =
        tests.length > 0
          ? tests.reduce((sum, t) => sum + (t.duration || 0), 0) / tests.filter((t) => t.duration).length
          : 0;
      const avgEngagementScore =
        tests.length > 0
          ? tests.reduce((sum, t) => sum + (t.engagementScore || 0), 0) / tests.filter((t) => t.engagementScore !== null).length
          : 0;

      return {
        variantId: variant.id,
        variantName: variant.variantName,
        perspective: variant.perspective,
        testCount: tests.length,
        successRate,
        avgDuration,
        avgEngagementScore,
      };
    })
  );

  // Sort by success rate descending
  return comparisons.sort((a, b) => b.successRate - a.successRate);
}

/**
 * Compare variants for an account - shows performance across all account-level variants
 */
export async function compareAccountVariants(accountId: string): Promise {
  const variants = await db
    .select()
    .from(promptVariants)
    .where(eq(promptVariants.accountId, accountId));

  const comparisons: VariantComparison[] = await Promise.all(
    variants.map(async (variant) => {
      const tests = await db
        .select()
        .from(promptVariantTests)
        .where(eq(promptVariantTests.variantId, variant.id));

      const successfulTests = tests.filter((t) => t.successful);
      const successRate = tests.length > 0 ? (successfulTests.length / tests.length) * 100 : 0;
      const avgDuration =
        tests.length > 0
          ? tests.reduce((sum, t) => sum + (t.duration || 0), 0) / tests.filter((t) => t.duration).length
          : 0;
      const avgEngagementScore =
        tests.length > 0
          ? tests.reduce((sum, t) => sum + (t.engagementScore || 0), 0) / tests.filter((t) => t.engagementScore !== null).length
          : 0;

      return {
        variantId: variant.id,
        variantName: variant.variantName,
        perspective: variant.perspective,
        testCount: tests.length,
        successRate,
        avgDuration,
        avgEngagementScore,
      };
    })
  );

  // Sort by success rate descending
  return comparisons.sort((a, b) => b.successRate - a.successRate);
}

/**
 * Set a variant as the default for a campaign
 */
export async function setDefaultVariant(campaignId: string, variantId: string) {
  // Remove default flag from all other variants for this campaign
  await db
    .update(promptVariants)
    .set({ isDefault: false })
    .where(eq(promptVariants.campaignId, campaignId));

  // Set the new default
  const [updated] = await db
    .update(promptVariants)
    .set({ isDefault: true })
    .where(eq(promptVariants.id, variantId))
    .returning();

  return updated;
}

/**
 * Delete a variant
 */
export async function deleteVariant(variantId: string) {
  const deleted = await db
    .delete(promptVariants)
    .where(eq(promptVariants.id, variantId))
    .returning();

  return deleted;
}

/**
 * Update variant metadata
 */
export async function updateVariant(
  variantId: string,
  updates: Partial> & { context?: Record }
) {
  const [updated] = await db
    .update(promptVariants)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(promptVariants.id, variantId))
    .returning();

  return updated;
}