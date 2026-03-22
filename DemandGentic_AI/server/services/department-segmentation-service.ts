/**
 * Department Segmentation Service
 *
 * Creates pre-built dynamic segments per department and auto-classifies
 * contacts into departments based on job titles using keyword matching
 * and job-role-taxonomy fallback.
 */

import { db } from "../db";
import {
  segments,
  contacts,
  contactIntelligence,
  jobRoleTaxonomy,
} from "@shared/schema";
import { eq, isNull, isNotNull, sql, and, or, inArray } from "drizzle-orm";
import { classifyDepartment, JOB_FUNCTION_TO_DEPARTMENT } from "./data-quality-engine";

// ==================== DEPARTMENT DEFINITIONS ====================

const DEPARTMENT_SEGMENTS = [
  {
    name: "IT / Engineering",
    description: "Contacts in IT, Engineering, DevOps, and Infrastructure roles",
  },
  {
    name: "Finance",
    description: "Contacts in Finance, Accounting, and Treasury roles",
  },
  {
    name: "Human Resources",
    description: "Contacts in HR, Talent Acquisition, and People Operations",
  },
  {
    name: "Marketing",
    description: "Contacts in Marketing, Brand, Content, and Demand Gen roles",
  },
  {
    name: "Operations",
    description: "Contacts in Operations, Supply Chain, and Logistics roles",
  },
  {
    name: "Sales",
    description: "Contacts in Sales, Business Development, and Revenue roles",
  },
  {
    name: "Legal",
    description: "Contacts in Legal, Compliance, and Regulatory roles",
  },
  {
    name: "Product",
    description: "Contacts in Product Management and Product Design roles",
  },
  {
    name: "Customer Success",
    description: "Contacts in Customer Success, Support, and Client Services",
  },
  {
    name: "Executive",
    description: "Contacts in Executive and General Management roles",
  },
];

// ==================== SEED DEPARTMENT SEGMENTS ====================

/**
 * Creates one dynamic segment per department (if it doesn't already exist).
 * Each segment filters contacts where department = .
 */
export async function seedDepartmentSegments(ownerId: string): Promise;
}> {
  const created: string[] = [];
  const existing: string[] = [];
  const result: Array = [];

  // Find existing department-tagged segments
  const existingSegments = await db
    .select({ id: segments.id, name: segments.name, tags: segments.tags })
    .from(segments)
    .where(sql`'department' = ANY(${segments.tags})`);

  const existingDeptNames = new Set(
    existingSegments.map((s) => s.name.replace("Dept: ", ""))
  );

  for (const dept of DEPARTMENT_SEGMENTS) {
    // Skip if segment already exists
    if (existingDeptNames.has(dept.name)) {
      const match = existingSegments.find(
        (s) => s.name === `Dept: ${dept.name}`
      );
      if (match) {
        existing.push(dept.name);
        result.push({ id: match.id, name: match.name, department: dept.name });
      }
      continue;
    }

    // Create segment with filter on contacts.department
    const definitionJson = {
      logic: "AND",
      conditions: [
        {
          id: `dept-${dept.name.toLowerCase().replace(/[^a-z]/g, "-")}`,
          field: "department",
          operator: "equals",
          values: [dept.name],
        },
      ],
    };

    const [segment] = await db
      .insert(segments)
      .values({
        name: `Dept: ${dept.name}`,
        description: dept.description,
        entityType: "contact",
        definitionJson,
        ownerId,
        tags: ["department", "auto-generated"],
        visibilityScope: "global",
        isActive: true,
      })
      .returning({ id: segments.id, name: segments.name });

    created.push(dept.name);
    result.push({ id: segment.id, name: segment.name, department: dept.name });
  }

  // Refresh counts on all department segments
  await refreshSegmentCounts();

  return { created, existing, segments: result };
}

// ==================== AUTO-CLASSIFY CONTACTS ====================

/**
 * Classifies contacts into departments based on jobTitle.
 * Phase 1: keyword matching via classifyDepartment()
 * Phase 2: role taxonomy fallback via contactIntelligence → jobRoleTaxonomy
 */
export async function autoClassifyContacts(options?: {
  batchSize?: number;
}): Promise;
}> {
  const batchSize = options?.batchSize ?? 500;
  const byDepartment: Record = {};
  let classified = 0;
  let unclassifiable = 0;

  // Count already-classified contacts
  const [alreadyCount] = await db
    .select({ count: sql`count(*)::int` })
    .from(contacts)
    .where(
      and(isNotNull(contacts.department), sql`${contacts.department} != ''`)
    );
  const alreadyClassified = alreadyCount?.count ?? 0;

  // ---- PHASE 1: Keyword classification ----
  // Get contacts with jobTitle but no department
  const unclassifiedContacts = await db
    .select({
      id: contacts.id,
      jobTitle: contacts.jobTitle,
    })
    .from(contacts)
    .where(
      and(
        isNotNull(contacts.jobTitle),
        sql`${contacts.jobTitle} != ''`,
        or(isNull(contacts.department), sql`${contacts.department} = ''`)
      )
    );

  // Classify in batches
  const updates: Array = [];
  const remainingIds: string[] = [];

  for (const contact of unclassifiedContacts) {
    const dept = classifyDepartment(contact.jobTitle!);
    if (dept) {
      updates.push({ id: contact.id, department: dept });
      byDepartment[dept] = (byDepartment[dept] || 0) + 1;
    } else {
      remainingIds.push(contact.id);
    }
  }

  // Batch update phase 1 results
  for (let i = 0; i  0) {
    // Process in chunks to avoid SQL parameter limits
    const chunkSize = 1000;
    for (let i = 0; i  JOB_FUNCTION_TO_DEPARTMENT[m.jobFunction]
      ).length;
      unclassifiable += chunk.length - classifiedInChunk;
    }
  }

  return { classified, alreadyClassified, unclassifiable, byDepartment };
}

// ==================== REFRESH SEGMENT COUNTS ====================

/**
 * Refreshes recordCountCache on all department-tagged segments.
 */
export async function refreshSegmentCounts(): Promise
> {
  const deptSegments = await db
    .select({
      id: segments.id,
      name: segments.name,
      definitionJson: segments.definitionJson,
      entityType: segments.entityType,
    })
    .from(segments)
    .where(sql`'department' = ANY(${segments.tags})`);

  const results: Array = [];

  for (const seg of deptSegments) {
    // Count contacts matching this segment's department filter
    const def = seg.definitionJson as any;
    const deptCondition = def?.conditions?.find(
      (c: any) => c.field === "department"
    );
    const deptValue = deptCondition?.values?.[0];

    let count = 0;
    if (deptValue) {
      const [row] = await db
        .select({ count: sql`count(*)::int` })
        .from(contacts)
        .where(eq(contacts.department, deptValue));
      count = row?.count ?? 0;
    }

    await db
      .update(segments)
      .set({
        recordCountCache: count,
        lastRefreshedAt: new Date(),
      })
      .where(eq(segments.id, seg.id));

    results.push({ id: seg.id, name: seg.name, count });
  }

  return results;
}

// ==================== GET DEPARTMENT SEGMENTS ====================

/**
 * Returns all segments tagged with "department" including member counts.
 */
export async function getDepartmentSegments(): Promise
> {
  const deptSegments = await db
    .select({
      id: segments.id,
      name: segments.name,
      description: segments.description,
      recordCountCache: segments.recordCountCache,
      createdAt: segments.createdAt,
    })
    .from(segments)
    .where(sql`'department' = ANY(${segments.tags})`)
    .orderBy(segments.name);

  return deptSegments.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    department: s.name.replace("Dept: ", ""),
    memberCount: s.recordCountCache ?? 0,
    createdAt: s.createdAt,
  }));
}