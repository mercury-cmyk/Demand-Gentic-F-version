/**
 * Problem Definition Service
 *
 * CRUD operations for managing problem definitions in the problem framework.
 * Problem definitions are templates that describe common problems and how to detect them.
 */

import { db } from "../../db";
import {
  problemDefinitions,
  type ProblemDefinition,
  type InsertProblemDefinition,
} from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import type { ProblemDefinitionFull } from "@shared/types/problem-intelligence";

/**
 * Get all problem definitions for an organization
 */
export async function getProblemDefinitions(organizationId?: string): Promise {
  let query = db
    .select()
    .from(problemDefinitions)
    .where(eq(problemDefinitions.isActive, true));

  if (organizationId) {
    query = db
      .select()
      .from(problemDefinitions)
      .where(
        and(
          eq(problemDefinitions.isActive, true),
          eq(problemDefinitions.organizationId, organizationId)
        )
      );
  }

  const definitions = await query;
  return definitions.map(parseProblemDefinition);
}

/**
 * Get a single problem definition by ID
 */
export async function getProblemDefinitionById(id: number): Promise {
  const [definition] = await db
    .select()
    .from(problemDefinitions)
    .where(eq(problemDefinitions.id, id))
    .limit(1);

  if (!definition) return null;
  return parseProblemDefinition(definition);
}

/**
 * Create a new problem definition
 */
export async function createProblemDefinition(
  definition: Omit,
  userId?: string
): Promise {
  const [inserted] = await db
    .insert(problemDefinitions)
    .values({
      ...definition,
      createdBy: userId,
    })
    .returning();

  return parseProblemDefinition(inserted);
}

/**
 * Update an existing problem definition
 */
export async function updateProblemDefinition(
  id: number,
  updates: Partial>
): Promise {
  const [updated] = await db
    .update(problemDefinitions)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(problemDefinitions.id, id))
    .returning();

  if (!updated) return null;
  return parseProblemDefinition(updated);
}

/**
 * Soft delete a problem definition (set isActive = false)
 */
export async function deleteProblemDefinition(id: number): Promise {
  const [updated] = await db
    .update(problemDefinitions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(problemDefinitions.id, id))
    .returning();

  return !!updated;
}

/**
 * Parse database record to typed interface
 */
function parseProblemDefinition(record: ProblemDefinition): ProblemDefinitionFull {
  return {
    id: record.id,
    organizationId: record.organizationId || undefined,
    problemStatement: record.problemStatement,
    problemCategory: record.problemCategory || 'efficiency',
    symptoms: (record.symptoms as any) || [],
    impactAreas: (record.impactAreas as any) || [],
    serviceIds: record.serviceIds || [],
    messagingAngles: (record.messagingAngles as any) || [],
    detectionRules: (record.detectionRules as any) || {},
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}