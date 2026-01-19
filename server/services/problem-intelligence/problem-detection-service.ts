/**
 * Problem Detection Service
 *
 * Extracts signals from existing account data and matches them against
 * problem definitions to detect relevant problems for target accounts.
 * Uses only existing data - no live research.
 */

import { db } from "../../db";
import {
  accounts,
  contacts,
  problemDefinitions,
  pipelineOpportunities,
  callAttempts,
  type ProblemDefinition as ProblemDefinitionDB,
  type Account,
} from "@shared/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import type {
  AccountSignals,
  DetectionRules,
  DetectedProblem,
  DetectionSignal,
  GapAnalysis,
  CapabilityGap,
  ProblemSymptom,
  MessagingAngle,
  ProblemDefinitionFull,
  ServiceDefinition,
} from "@shared/types/problem-intelligence";
import { getServiceCatalog } from "./service-catalog-service";

// ==================== SIGNAL EXTRACTION ====================

/**
 * Extract all signals from an account's existing data
 * Uses only data already in the accounts table - no external API calls
 */
export async function detectAccountSignals(accountId: string): Promise<AccountSignals | null> {
  // Get account data
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    console.warn(`[ProblemDetection] Account not found: ${accountId}`);
    return null;
  }

  // Get contact stats
  const [contactStats] = await db
    .select({
      total: count(),
      lastUpdatedAt: sql<Date>`MAX(${contacts.updatedAt})`,
    })
    .from(contacts)
    .where(eq(contacts.accountId, accountId));

  // Get pipeline status
  const [pipelineStatus] = await db
    .select({
      status: pipelineOpportunities.status,
      updatedAt: pipelineOpportunities.updatedAt,
    })
    .from(pipelineOpportunities)
    .where(eq(pipelineOpportunities.accountId, accountId))
    .orderBy(desc(pipelineOpportunities.updatedAt))
    .limit(1);

  // Get last touch (most recent call attempt for any contact at this account)
  // Note: callAttempts doesn't have accountId directly - join through contacts
  const [lastTouch] = await db
    .select({ lastTouchAt: callAttempts.createdAt })
    .from(callAttempts)
    .innerJoin(contacts, eq(callAttempts.contactId, contacts.id))
    .where(eq(contacts.accountId, accountId))
    .orderBy(desc(callAttempts.createdAt))
    .limit(1);

  // Calculate engagement level based on recent activity
  const engagementLevel = calculateEngagementLevel(
    lastTouch?.lastTouchAt,
    contactStats?.total || 0,
    pipelineStatus?.status
  );

  // Parse tech stack from account data
  const techStack = parseTechStack(account);

  return {
    firmographic: {
      industry: account.industryStandardized || account.industryRaw || null,
      subIndustry: account.industryAiSuggested || null,
      revenue: parseRevenue(account.annualRevenue, account.revenueRange),
      employees: parseEmployees(account.staffCount, account.employeesSizeRange),
      region: extractRegion(account),
      yearFounded: parseYearFounded(account),
    },
    techStack: {
      technologies: techStack.technologies,
      categories: techStack.categories,
    },
    intentSignals: (account.intentTopics as string[]) || [],
    behavioralSignals: {
      lastTouchAt: lastTouch?.lastTouchAt || null,
      pipelineStatus: pipelineStatus?.status || null,
      engagementLevel,
    },
  };
}

// ==================== PROBLEM MATCHING ====================

/**
 * Load all active problem definitions
 */
export async function loadProblemDefinitions(): Promise<ProblemDefinitionFull[]> {
  const problems = await db
    .select()
    .from(problemDefinitions)
    .where(eq(problemDefinitions.isActive, true));

  return problems.map(parseProblemDefinition);
}

/**
 * Match account signals against problem definitions
 * Returns problems ranked by confidence
 */
export async function matchProblemsToAccount(
  accountId: string,
  signals: AccountSignals,
  problemDefs?: ProblemDefinitionFull[]
): Promise<DetectedProblem[]> {
  // Load problem definitions if not provided
  const problems = problemDefs || (await loadProblemDefinitions());

  const detectedProblems: DetectedProblem[] = [];

  for (const problem of problems) {
    const matchResult = matchProblemToSignals(problem, signals);

    if (matchResult.confidence > 0.3) {
      // Minimum confidence threshold
      detectedProblems.push({
        problemId: problem.id,
        problemStatement: problem.problemStatement,
        confidence: matchResult.confidence,
        detectionSignals: matchResult.signals,
        relevantServices: problem.serviceIds || [],
        messagingAngles: problem.messagingAngles,
      });
    }
  }

  // Sort by confidence descending
  return detectedProblems.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Match a single problem definition against account signals
 */
function matchProblemToSignals(
  problem: ProblemDefinitionFull,
  signals: AccountSignals
): { confidence: number; signals: DetectionSignal[] } {
  const detectionSignals: DetectionSignal[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  const rules = problem.detectionRules;

  // Industry matching (weight: 0.25)
  if (rules.industries && rules.industries.length > 0) {
    totalWeight += 0.25;
    const industryMatch = matchIndustry(signals.firmographic.industry, rules.industries);
    if (industryMatch.matched) {
      matchedWeight += 0.25 * industryMatch.score;
      detectionSignals.push({
        signalType: "industry",
        signalValue: signals.firmographic.industry || "unknown",
        matchedRule: `Matches target industry: ${industryMatch.matchedValue}`,
        contribution: 0.25 * industryMatch.score,
      });
    }
  }

  // Tech stack matching (weight: 0.25)
  if (rules.techStack) {
    const techMatch = matchTechStack(signals.techStack.technologies, rules.techStack);
    if (techMatch.weight > 0) {
      totalWeight += techMatch.weight;
      matchedWeight += techMatch.matchedWeight;
      detectionSignals.push(...techMatch.signals);
    }
  }

  // Firmographic matching (weight: 0.2)
  if (rules.firmographics) {
    const firmMatch = matchFirmographics(signals.firmographic, rules.firmographics);
    if (firmMatch.weight > 0) {
      totalWeight += firmMatch.weight;
      matchedWeight += firmMatch.matchedWeight;
      detectionSignals.push(...firmMatch.signals);
    }
  }

  // Intent signals matching (weight: 0.2)
  if (rules.intentSignals && rules.intentSignals.length > 0) {
    totalWeight += 0.2;
    const intentMatch = matchIntentSignals(signals.intentSignals, rules.intentSignals);
    if (intentMatch.matched) {
      matchedWeight += 0.2 * intentMatch.score;
      detectionSignals.push({
        signalType: "intent",
        signalValue: intentMatch.matchedValues.join(", "),
        matchedRule: `Intent signals match: ${intentMatch.matchedValues.join(", ")}`,
        contribution: 0.2 * intentMatch.score,
      });
    }
  }

  // Symptom matching (weight: 0.1 per symptom)
  for (const symptom of problem.symptoms) {
    const symptomMatch = matchSymptom(symptom, signals);
    if (symptomMatch.matched) {
      totalWeight += 0.1;
      matchedWeight += 0.1 * symptomMatch.score;
      detectionSignals.push({
        signalType: symptom.dataSource,
        signalValue: symptomMatch.signalValue,
        matchedRule: symptom.symptomDescription,
        contribution: 0.1 * symptomMatch.score,
      });
    }
  }

  // Calculate confidence
  const confidence = totalWeight > 0 ? matchedWeight / totalWeight : 0;

  return { confidence, signals: detectionSignals };
}

// ==================== GAP ANALYSIS ====================

/**
 * Analyze capability gaps for an account
 * Compares account signals against service capabilities
 */
export async function analyzeCapabilityGaps(
  accountId: string,
  signals: AccountSignals,
  serviceCatalog?: ServiceDefinition[]
): Promise<GapAnalysis> {
  const services = serviceCatalog || (await getServiceCatalog());
  const capabilities: CapabilityGap[] = [];

  for (const service of services) {
    for (const problem of service.problemsSolved) {
      // Check if account shows symptoms of this problem
      const hasSymptoms = problem.symptoms.some(
        (symptom) => matchSymptom(symptom, signals).matched
      );

      if (hasSymptoms) {
        capabilities.push({
          capability: service.serviceName,
          accountGap: problem.problemStatement,
          ourSolution: service.serviceDescription || `${service.serviceName} addresses this gap`,
          confidence: calculateGapConfidence(problem, signals),
        });
      }
    }
  }

  // Sort by confidence and deduplicate
  const sorted = capabilities.sort((a, b) => b.confidence - a.confidence);
  const unique = deduplicateGaps(sorted);

  return {
    capabilities: unique.slice(0, 5), // Top 5 gaps
    prioritizedGaps: unique.slice(0, 3).map((g) => g.accountGap),
  };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Parse tech stack from account data
 */
function parseTechStack(account: Account): {
  technologies: string[];
  categories: Record<string, string[]>;
} {
  const technologies: string[] = [];
  const categories: Record<string, string[]> = {};

  // Tech stack from direct field
  if (account.techStack && Array.isArray(account.techStack)) {
    technologies.push(...(account.techStack as string[]));
  }

  // Web technologies
  if (account.webTechnologies && Array.isArray(account.webTechnologies)) {
    const webTech = account.webTechnologies as string[];
    technologies.push(...webTech);
    categories["Web"] = webTech;
  }

  // AI enrichment data often contains tech info
  if (account.aiEnrichmentData && typeof account.aiEnrichmentData === "object") {
    const enrichment = account.aiEnrichmentData as Record<string, any>;
    if (enrichment.technologies && Array.isArray(enrichment.technologies)) {
      technologies.push(...enrichment.technologies);
    }
  }

  return {
    technologies: [...new Set(technologies)], // Deduplicate
    categories,
  };
}

/**
 * Parse revenue from various account fields
 */
function parseRevenue(annualRevenue: string | null, revenueRange: string | null): number | null {
  if (annualRevenue) {
    // Try to parse as number
    const cleaned = annualRevenue.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) return parsed;
  }

  if (revenueRange) {
    // Parse ranges like "$1M-$5M", "10-50M"
    const match = revenueRange.match(/(\d+(?:\.\d+)?)\s*[Mm]?/);
    if (match) {
      const value = parseFloat(match[1]);
      if (revenueRange.toLowerCase().includes("m")) {
        return value * 1_000_000;
      }
      if (revenueRange.toLowerCase().includes("b")) {
        return value * 1_000_000_000;
      }
      return value;
    }
  }

  return null;
}

/**
 * Parse employees from various account fields
 */
function parseEmployees(staffCount: number | null, employees: string | null): number | null {
  if (staffCount) return staffCount;

  if (employees) {
    // Try to parse ranges like "50-100", "1000+"
    const match = employees.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Extract region from account address fields
 */
function extractRegion(account: Account): string | null {
  // Priority: country > state > city
  if (account.hqCountry) return account.hqCountry;
  if (account.hqState) return account.hqState;
  if (account.hqCity) return account.hqCity;

  // Try normalized address
  if (account.hqAddress) {
    const parts = account.hqAddress.split(",");
    return parts[parts.length - 1]?.trim() || null;
  }

  return null;
}

/**
 * Parse year founded from account data
 */
function parseYearFounded(account: Account): number | null {
  // This field might exist in AI enrichment data
  if (account.aiEnrichmentData && typeof account.aiEnrichmentData === "object") {
    const enrichment = account.aiEnrichmentData as Record<string, any>;
    if (enrichment.foundedYear) return enrichment.foundedYear;
    if (enrichment.founded) return enrichment.founded;
  }
  return null;
}

/**
 * Calculate engagement level based on activity
 */
function calculateEngagementLevel(
  lastTouchAt: Date | null | undefined,
  contactCount: number,
  pipelineStatus: string | null | undefined
): "high" | "medium" | "low" | "none" {
  if (!lastTouchAt && contactCount === 0) return "none";

  const daysSinceTouch = lastTouchAt
    ? Math.floor((Date.now() - new Date(lastTouchAt).getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;

  if (pipelineStatus === "active" || pipelineStatus === "engaged") return "high";
  if (daysSinceTouch <= 7) return "high";
  if (daysSinceTouch <= 30) return "medium";
  if (daysSinceTouch <= 90 || contactCount > 5) return "low";
  return "none";
}

/**
 * Match industry against target industries
 */
function matchIndustry(
  accountIndustry: string | null,
  targetIndustries: string[]
): { matched: boolean; score: number; matchedValue: string } {
  if (!accountIndustry) {
    return { matched: false, score: 0, matchedValue: "" };
  }

  const normalizedAccount = accountIndustry.toLowerCase().trim();

  for (const target of targetIndustries) {
    const normalizedTarget = target.toLowerCase().trim();

    // Exact match
    if (normalizedAccount === normalizedTarget) {
      return { matched: true, score: 1.0, matchedValue: target };
    }

    // Partial match
    if (
      normalizedAccount.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedAccount)
    ) {
      return { matched: true, score: 0.7, matchedValue: target };
    }
  }

  return { matched: false, score: 0, matchedValue: "" };
}

/**
 * Match tech stack against rules
 */
function matchTechStack(
  accountTech: string[],
  rules: { required?: string[]; absent?: string[] }
): { weight: number; matchedWeight: number; signals: DetectionSignal[] } {
  const signals: DetectionSignal[] = [];
  let weight = 0;
  let matchedWeight = 0;

  const normalizedAccountTech = accountTech.map((t) => t.toLowerCase().trim());

  // Check required technologies
  if (rules.required && rules.required.length > 0) {
    weight += 0.15;
    const matches: string[] = [];

    for (const req of rules.required) {
      const normalizedReq = req.toLowerCase().trim();
      if (normalizedAccountTech.some((t) => t.includes(normalizedReq) || normalizedReq.includes(t))) {
        matches.push(req);
      }
    }

    if (matches.length > 0) {
      const score = matches.length / rules.required.length;
      matchedWeight += 0.15 * score;
      signals.push({
        signalType: "tech_stack",
        signalValue: matches.join(", "),
        matchedRule: `Has required tech: ${matches.join(", ")}`,
        contribution: 0.15 * score,
      });
    }
  }

  // Check absent technologies (negative signal)
  if (rules.absent && rules.absent.length > 0) {
    weight += 0.1;
    const missing: string[] = [];

    for (const absent of rules.absent) {
      const normalizedAbsent = absent.toLowerCase().trim();
      if (!normalizedAccountTech.some((t) => t.includes(normalizedAbsent))) {
        missing.push(absent);
      }
    }

    if (missing.length === rules.absent.length) {
      matchedWeight += 0.1;
      signals.push({
        signalType: "tech_stack",
        signalValue: `Missing: ${missing.join(", ")}`,
        matchedRule: `Lacks competing/alternative tech`,
        contribution: 0.1,
      });
    }
  }

  return { weight, matchedWeight, signals };
}

/**
 * Match firmographic data against rules
 */
function matchFirmographics(
  firmographic: AccountSignals["firmographic"],
  rules: NonNullable<DetectionRules["firmographics"]>
): { weight: number; matchedWeight: number; signals: DetectionSignal[] } {
  const signals: DetectionSignal[] = [];
  let weight = 0;
  let matchedWeight = 0;

  // Revenue range check
  if (rules.minRevenue !== undefined || rules.maxRevenue !== undefined) {
    weight += 0.1;
    if (typeof firmographic.revenue === 'number') {
      const revenue = firmographic.revenue;
      const inRange =
        (rules.minRevenue === undefined || revenue >= rules.minRevenue) &&
        (rules.maxRevenue === undefined || revenue <= rules.maxRevenue);

      if (inRange) {
        matchedWeight += 0.1;
        signals.push({
          signalType: "firmographic",
          signalValue: `Revenue: $${(revenue / 1_000_000).toFixed(1)}M`,
          matchedRule: "Revenue in target range",
          contribution: 0.1,
        });
      }
    }
  }

  // Employee range check
  if (rules.minEmployees !== undefined || rules.maxEmployees !== undefined) {
    weight += 0.1;
    if (typeof firmographic.employees === 'number') {
      const employees = firmographic.employees;
      const inRange =
        (rules.minEmployees === undefined || employees >= rules.minEmployees) &&
        (rules.maxEmployees === undefined || employees <= rules.maxEmployees);

      if (inRange) {
        matchedWeight += 0.1;
        signals.push({
          signalType: "firmographic",
          signalValue: `Employees: ${employees}`,
          matchedRule: "Company size in target range",
          contribution: 0.1,
        });
      }
    }
  }

  // Region check
  if (rules.regions && rules.regions.length > 0 && firmographic.region) {
    weight += 0.05;
    const normalizedRegion = firmographic.region.toLowerCase();
    const regionMatch = rules.regions.some((r) =>
      normalizedRegion.includes(r.toLowerCase()) || r.toLowerCase().includes(normalizedRegion)
    );

    if (regionMatch) {
      matchedWeight += 0.05;
      signals.push({
        signalType: "firmographic",
        signalValue: firmographic.region,
        matchedRule: "In target region",
        contribution: 0.05,
      });
    }
  }

  return { weight, matchedWeight, signals };
}

/**
 * Match intent signals
 */
function matchIntentSignals(
  accountIntents: string[],
  targetIntents: string[]
): { matched: boolean; score: number; matchedValues: string[] } {
  if (accountIntents.length === 0) {
    return { matched: false, score: 0, matchedValues: [] };
  }

  const normalizedAccount = accountIntents.map((i) => i.toLowerCase().trim());
  const matchedValues: string[] = [];

  for (const target of targetIntents) {
    const normalizedTarget = target.toLowerCase().trim();
    if (
      normalizedAccount.some(
        (i) => i.includes(normalizedTarget) || normalizedTarget.includes(i)
      )
    ) {
      matchedValues.push(target);
    }
  }

  if (matchedValues.length > 0) {
    return {
      matched: true,
      score: matchedValues.length / targetIntents.length,
      matchedValues,
    };
  }

  return { matched: false, score: 0, matchedValues: [] };
}

/**
 * Match a specific symptom against account signals
 */
function matchSymptom(
  symptom: ProblemSymptom,
  signals: AccountSignals
): { matched: boolean; score: number; signalValue: string } {
  const dataSource = symptom.dataSource;

  switch (dataSource) {
    case "firmographic":
      // Check if firmographic data suggests the symptom
      if (signals.firmographic.industry) {
        // Simple keyword matching in symptom description vs industry
        const descLower = symptom.symptomDescription.toLowerCase();
        const industryLower = signals.firmographic.industry.toLowerCase();
        if (
          descLower.includes(industryLower) ||
          industryLower.split(/\s+/).some((w) => descLower.includes(w))
        ) {
          return { matched: true, score: 0.6, signalValue: signals.firmographic.industry };
        }
      }
      break;

    case "tech_stack":
      // Check if tech stack suggests the symptom
      const techKeywords = extractKeywords(symptom.symptomDescription);
      const matchedTech = signals.techStack.technologies.filter((t) =>
        techKeywords.some((k) => t.toLowerCase().includes(k.toLowerCase()))
      );
      if (matchedTech.length > 0) {
        return { matched: true, score: 0.7, signalValue: matchedTech.join(", ") };
      }
      // Also check for absence (e.g., "lacks CRM")
      if (symptom.symptomDescription.toLowerCase().includes("lack") ||
          symptom.symptomDescription.toLowerCase().includes("no ") ||
          symptom.symptomDescription.toLowerCase().includes("without")) {
        const missingTech = extractKeywords(symptom.symptomDescription);
        const isMissing = !signals.techStack.technologies.some((t) =>
          missingTech.some((m) => t.toLowerCase().includes(m.toLowerCase()))
        );
        if (isMissing) {
          return { matched: true, score: 0.5, signalValue: `Missing: ${missingTech.join(", ")}` };
        }
      }
      break;

    case "intent":
      // Check if intent signals match
      const intentKeywords = extractKeywords(symptom.symptomDescription);
      const matchedIntent = signals.intentSignals.filter((i) =>
        intentKeywords.some((k) => i.toLowerCase().includes(k.toLowerCase()))
      );
      if (matchedIntent.length > 0) {
        return { matched: true, score: 0.8, signalValue: matchedIntent.join(", ") };
      }
      break;

    case "behavioral":
      // Check behavioral signals
      if (symptom.symptomDescription.toLowerCase().includes("engagement")) {
        if (signals.behavioralSignals.engagementLevel === "low" ||
            signals.behavioralSignals.engagementLevel === "none") {
          return { matched: true, score: 0.6, signalValue: `Engagement: ${signals.behavioralSignals.engagementLevel}` };
        }
      }
      break;

    case "industry":
      // Direct industry match
      if (signals.firmographic.industry) {
        const industryKeywords = extractKeywords(symptom.symptomDescription);
        if (industryKeywords.some((k) =>
          signals.firmographic.industry!.toLowerCase().includes(k.toLowerCase())
        )) {
          return { matched: true, score: 0.7, signalValue: signals.firmographic.industry };
        }
      }
      break;
  }

  return { matched: false, score: 0, signalValue: "" };
}

/**
 * Extract keywords from a description
 */
function extractKeywords(text: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were",
    "has", "have", "had", "does", "do", "did", "will", "would", "could",
    "should", "may", "might", "must", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "their", "they", "this", "that",
    "which", "who", "whom", "it", "its", "be", "been", "being"
  ]);

  const words = text.toLowerCase().split(/\W+/);
  return words.filter(
    (w) => w.length > 2 && !stopWords.has(w)
  );
}

/**
 * Calculate gap confidence based on symptom matches
 */
function calculateGapConfidence(
  problem: { symptoms: ProblemSymptom[] },
  signals: AccountSignals
): number {
  let matchCount = 0;
  for (const symptom of problem.symptoms) {
    if (matchSymptom(symptom, signals).matched) {
      matchCount++;
    }
  }
  return problem.symptoms.length > 0 ? matchCount / problem.symptoms.length : 0.5;
}

/**
 * Deduplicate gaps by problem statement
 */
function deduplicateGaps(gaps: CapabilityGap[]): CapabilityGap[] {
  const seen = new Set<string>();
  return gaps.filter((gap) => {
    const key = gap.accountGap.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Parse a problem definition from database
 */
function parseProblemDefinition(entry: ProblemDefinitionDB): ProblemDefinitionFull {
  return {
    id: entry.id,
    problemStatement: entry.problemStatement,
    problemCategory: entry.problemCategory || "efficiency",
    symptoms: (entry.symptoms as ProblemSymptom[]) || [],
    impactAreas: (entry.impactAreas as any[]) || [],
    serviceIds: entry.serviceIds,
    messagingAngles: (entry.messagingAngles as MessagingAngle[]) || [],
    detectionRules: (entry.detectionRules as DetectionRules) || {},
    isActive: entry.isActive,
  };
}
