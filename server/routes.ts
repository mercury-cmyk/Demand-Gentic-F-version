import type { Express } from "express";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import CryptoJS from "crypto-js";
import { eq, and, or, inArray, isNotNull, isNull, lte, sql, desc } from "drizzle-orm";
import { storage } from "./storage";
import { comparePassword, generateToken, requireAuth, requireRole, hashPassword } from "./auth";
import { getBestPhoneForContact } from "./lib/phone-utils";
import { buildFilterQuery } from "./filter-builder";
import { generateTotpSecret, verifyTotpToken, verifyBackupCode, generateBackupCodes } from "./totp-mfa";
import webhooksRouter from "./routes/webhooks";
import queueRouter from "./routes/queue-routes";
import filterOptionsRouter from "./routes/filter-options-routes";
import reportingRoutes from './routes/reporting-routes';
import campaignSuppressionRouter from './routes/campaign-suppression-routes';
import verificationCampaignsRouter from './routes/verification-campaigns';
import verificationContactsRouter from './routes/verification-contacts';
import verificationSubmissionsRouter from './routes/verification-submissions';
import verificationSuppressionRouter from './routes/verification-suppression';
import verificationUploadRouter from './routes/verification-upload';
import verificationUploadJobsRouter from './routes/verification-upload-jobs';
import verificationEnrichmentRouter from './routes/verification-enrichment';
import enrichmentJobsRouter from './routes/enrichment-jobs';
import verificationJobRecoveryRouter from './routes/verification-job-recovery';
import verificationAccountCapsRouter from './routes/verification-account-caps';
import verificationPriorityConfigRouter from './routes/verification-priority-config';
import suppressionRouter from './routes/suppression-routes';
import s3FilesRouter from './routes/s3-files';
import csvImportJobsRouter from './routes/csv-import-jobs';
import contactsCSVImportRouter from './routes/contacts-csv-import';
import emailValidationTestRouter from './routes/email-validation-test';
import verificationExportRouter from './routes/verification-export';
import exportTemplatesRouter from './routes/export-templates';
import csvMappingTemplatesRouter from './routes/csv-mapping-templates';
import aiCsvMappingRouter from './routes/ai-csv-mapping';
import linkedinVerificationRouter from './routes/linkedin-verification';
import agentReportsRouter from './routes/agent-reports';
import leadFormsRouter from './routes/lead-forms-routes';
import pipelineRouter from './routes/pipeline-routes';
import pipelineIntelligenceRouter from './routes/pipeline-intelligence-routes';
import aiProjectRouter from './routes/ai-project-routes';
import inboxRouter from './routes/inbox-routes';
import emailAiRouter from './routes/email-ai-routes';
import deepseekAiRouter from './routes/deepseek-ai-routes';
import emailCampaignStatsRouter from './routes/email-campaign-stats-routes';
import signatureRouter from './routes/signature-routes';
import emailTrackingRouter from './routes/email-tracking-routes';
import campaignEmailRouter from './routes/campaign-email-routes';
import { mergeTagsRouter } from './routes/merge-tags-routes';
import campaignSendRouter from './routes/campaign-send-routes';
import clientPortalRouter from './routes/client-portal';
import telemarketingSuppressionRouter from './routes/telemarketing-suppression-routes';
import aiCallsRouter from './routes/ai-calls';
import texmlRouter from './routes/texml';
import openaiSipRouter from './routes/openai-sip';
import openaiWebrtcRouter from './routes/openai-webrtc';
import telnyxWebrtcRouter from './routes/telnyx-webrtc';
import virtualAgentsRouter from './routes/virtual-agents';
import voiceProviderRouter from './routes/voice-provider-routes';
import agentDefaultsRouter from './routes/agent-defaults';
import hybridCampaignAgentsRouter from './routes/hybrid-campaign-agents';
import unifiedAgentConsoleRouter from './routes/unified-agent-console';
import dialerRunsRouter from './routes/dialer-runs';
import aiOperatorRouter from './routes/ai-operator';
import agentCommandRouter from './routes/agent-command-routes';
import orgIntelligenceRouter from './routes/org-intelligence-routes';
import orgIntelligenceInjectionRouter from './routes/org-intelligence-injection-routes';
import problemIntelligenceRouter from './routes/problem-intelligence-routes';
import campaignTestCallsRouter from './routes/campaign-test-calls';
import previewStudioRouter from './routes/preview-studio';
import simulationsRouter from './routes/simulations';
import healthRouter from './routes/health';
import vertexAiRouter from './routes/vertex-ai';
import knowledgeBlocksRouter from './routes/knowledge-blocks';
import agentPromptVisibilityRouter from './routes/agent-prompt-visibility-routes';
import superOrganizationRouter from './routes/super-organization-routes';
import promptVariantsRouter from './routes/prompt-variants';
import cloudLogsRouter from './routes/cloud-logs-routes';
import campaignIngestionRouter from './routes/campaign-ingestion-routes';
import { z } from "zod";
import {
  apiLimiter,
  authLimiter,
  writeLimiter,
  expensiveOperationLimiter,
  validate
} from "./middleware/security";
import {
  loginSchema,
  createUserSchema,
  updateUserSchema,
  assignRoleSchema,
  uuidParamSchema,
  userIdSchema,
  leadIntakeSchema
} from "./validation/schemas";
import { db } from "./db";
import { normalizeName } from "./normalization";
import multer from "multer";
import { uploadToS3 } from "./lib/s3";
import { customFieldDefinitions, accounts as accountsTable, contacts as contactsTable, domainSetItems, users, campaignAgentAssignments, campaignQueue, agentQueue, campaigns, contacts, accounts, lists, segments, leads, leadVerifications, verificationCampaigns, verificationContacts, verificationLeadSubmissions, suppressionPhones, campaignSuppressionContacts, campaignSuppressionAccounts, campaignSuppressionEmails, campaignSuppressionDomains, callJobs, callSessions, callAttempts, calls, callDispositions, dispositions, activityLog, industryReference, campaignTestCalls, virtualAgents, emailSends, type InsertMailboxAccount } from "@shared/schema";
import {
  insertAccountSchema,
  insertContactSchema,
  insertCustomFieldDefinitionSchema,
  updateCustomFieldDefinitionSchema,
  insertCampaignSchema,
  insertLeadSchema,
  insertCallSchema,
  insertSuppressionEmailSchema,
  insertSuppressionPhoneSchema,
  insertCampaignOrderSchema,
  insertOrderCampaignLinkSchema,
  insertBulkImportSchema,
  insertSegmentSchema,
  insertListSchema,
  insertDomainSetSchema,
  insertUserSchema,
  insertSavedFilterSchema,
  insertSelectionContextSchema,
  updateAccountIndustrySchema,
  reviewAccountIndustryAISchema,
  insertSenderProfileSchema,
  insertEmailTemplateSchema,
  insertCallScriptSchema,
  insertEmailSendSchema,
  insertCallAttemptSchema,
  insertEmailSequenceSchema,
  insertSequenceStepSchema,
  insertSequenceEnrollmentSchema,
  insertSoftphoneProfileSchema,
  insertCallRecordingAccessLogSchema,
  pipelineBulkImportSchema,
  insertSipTrunkConfigSchema,
  insertAgentStatusSchema,
  insertAutoDialerQueueSchema,
  insertContentAssetSchema,
  insertSocialPostSchema,
  insertAIContentGenerationSchema,
  insertEventSchema,
  insertResourceSchema,
  insertNewsSchema,
  insertActivityLogSchema,
  insertSpeakerSchema,
  insertOrganizerSchema,
  insertSponsorSchema,
  insertDomainAuthSchema
} from "@shared/schema";
import { normalizePhoneE164 } from "./normalization"; // Import normalization utility
import { encryptJson, decryptJson } from "./lib/encryption";
import type { FilterValues } from "@shared/filterConfig";
import type { FilterGroup, FilterCondition } from "@shared/filter-types";
import { getOAuthStateStore, hasRedisConfigured as hasRedisForOAuth } from "./lib/oauth-state-store";

// Configure multer for memory storage (file uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size for screenshots
  },
});

// Get Redis-backed OAuth state store if Redis is available (graceful degradation)
let oauthStateStore: ReturnType<typeof getOAuthStateStore> | null = null;
if (hasRedisForOAuth()) {
  oauthStateStore = getOAuthStateStore();
}

function base64URLEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(48));
}

function generateState() {
  return base64URLEncode(crypto.randomBytes(24));
}

// Helper to convert new FilterValues format to legacy FilterGroup format
function convertFilterValuesToFilterGroup(filterValues: FilterValues): FilterGroup | undefined {
  const conditions: FilterCondition[] = [];
  let conditionIndex = 0;

  // Map filter fields to standardized database columns (matching filter-builder FIELD_MAPPINGS)
  const fieldMapping: Record<string, { column: string; operator: string }> = {
    industries: { column: 'industryStandardized', operator: 'in' },
    industryStandardized: { column: 'industryStandardized', operator: 'in' },
    companySizes: { column: 'employeesSizeRange', operator: 'in' },
    employeesSizeRange: { column: 'employeesSizeRange', operator: 'in' },
    companyRevenue: { column: 'annualRevenue', operator: 'in' },
    annualRevenue: { column: 'annualRevenue', operator: 'in' },
    revenueRange: { column: 'revenueRange', operator: 'in' },
    seniorityLevels: { column: 'seniorityLevel', operator: 'in' },
    seniorityLevel: { column: 'seniorityLevel', operator: 'in' },
    jobFunctions: { column: 'department', operator: 'in' },
    departments: { column: 'department', operator: 'in' },
    department: { column: 'department', operator: 'in' },
    technologies: { column: 'techStack', operator: 'arrayContains' },
    techStack: { column: 'techStack', operator: 'arrayContains' },
    countries: { column: 'hqCountry', operator: 'in' },
    hqCountry: { column: 'hqCountry', operator: 'in' },
    states: { column: 'hqState', operator: 'in' },
    hqState: { column: 'hqState', operator: 'in' },
    cities: { column: 'hqCity', operator: 'in' },
    hqCity: { column: 'hqCity', operator: 'in' },
    accountOwners: { column: 'ownerId', operator: 'in' },
    ownerId: { column: 'ownerId', operator: 'in' }
  };

  // Process each filter value
  Object.entries(filterValues).forEach(([key, value]) => {
    if (!value) return;

    // Handle array filters (multi-select and typeahead)
    if (Array.isArray(value) && value.length > 0) {
      const mapping = fieldMapping[key];
      if (mapping) {
        conditions.push({
          id: `condition-${conditionIndex++}`,
          field: mapping.column,
          operator: mapping.operator as any,
          values: value as (string | number)[]
        });
      }
    }
    // Handle date range filters
    else if (typeof value === 'object' && ('from' in value || 'to' in value)) {
      const dateRange = value as { from?: string; to?: string };
      if (dateRange.from) {
        conditions.push({
          id: `condition-${conditionIndex++}`,
          field: key,
          operator: 'gte',
          value: dateRange.from,
          values: [dateRange.from]
        });
      }
      if (dateRange.to) {
        conditions.push({
          id: `condition-${conditionIndex++}`,
          field: key,
          operator: 'lte',
          value: dateRange.to,
          values: [dateRange.to]
        });
      }
    }
    // Handle text search
    else if (typeof value === 'string' && value.trim()) {
      conditions.push({
        id: `condition-${conditionIndex++}`,
        field: key,
        operator: 'contains',
        value: value.trim(),
        values: [value.trim()]
      });
    }
  });

  if (conditions.length === 0) {
    return undefined;
  }

  return {
    logic: 'AND',
    combinator: 'and',
    conditions
  };
}

const M365_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? process.env.MSFT_OAUTH_CLIENT_ID ?? process.env.M365_CLIENT_ID ?? "";
const M365_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? process.env.MSFT_OAUTH_CLIENT_SECRET ?? process.env.M365_CLIENT_SECRET ?? "";
const M365_TENANT_ID = process.env.MICROSOFT_TENANT_ID ?? process.env.MSFT_OAUTH_TENANT_ID ?? process.env.M365_TENANT_ID ?? "common";
const M365_SCOPES =
  process.env.MSFT_OAUTH_SCOPES ?? "offline_access Mail.Read Mail.ReadBasic Mail.ReadWrite Mail.Send";
// Use published domain for stable OAuth redirects (works in both dev and production)
const APP_BASE_URL = process.env.APP_BASE_URL ?? process.env.MSFT_OAUTH_APP_URL ?? "https://beta-platform.pivotal-b2b.com";
const M365_REDIRECT_URI =
  process.env.MSFT_OAUTH_REDIRECT_URI ?? `${APP_BASE_URL.replace(/\/$/, "")}/api/oauth/microsoft/callback`;
const MAILBOX_ENCRYPTION_KEY =
  process.env.MAILBOX_ENCRYPTION_KEY ??
  process.env.MSFT_OAUTH_CLIENT_SECRET ??
  process.env.M365_CLIENT_SECRET ??
  M365_CLIENT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? process.env.GMAIL_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GMAIL_CLIENT_SECRET ?? "";
const GOOGLE_SCOPES =
  process.env.GOOGLE_OAUTH_SCOPES ??
  "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${APP_BASE_URL.replace(/\/$/, "")}/api/oauth/google/callback`;

type MicrosoftTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const MAILBOX_PROVIDER = "o365";
const GOOGLE_MAILBOX_PROVIDER = "google";

function deriveOpportunityStatus(stage: string, requested?: string | null): "open" | "won" | "lost" | "on_hold" {
  const normalized = requested?.toLowerCase();
  if (normalized && ["open", "won", "lost", "on_hold"].includes(normalized)) {
    return normalized as "open" | "won" | "lost" | "on_hold";
  }

  const stageLabel = stage.toLowerCase();
  if (stageLabel.includes("closed") && stageLabel.includes("won")) {
    return "won";
  }
  if (stageLabel.includes("closed") && stageLabel.includes("lost")) {
    return "lost";
  }
  if (stageLabel.includes("hold")) {
    return "on_hold";
  }
  return "open";
}

function deriveForecastCategory(stage: string): "Commit" | "Best Case" | "Pipeline" {
  const label = stage.toLowerCase();
  if (label.includes("commit") || label.includes("closed won")) {
    return "Commit";
  }
  if (label.includes("proposal") || label.includes("negotiation")) {
    return "Best Case";
  }
  return "Pipeline";
}

function coerceCurrency(value: string | undefined): string {
  return (value ?? "USD").toUpperCase();
}

function coerceProbability(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.min(100, Math.max(0, Math.round(parsed)));
  }
  return fallback;
}

function parseOptionalDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const pipelineCreateSchema = z.object({
  name: z.string().min(1, "Pipeline name is required"),
  description: z.string().max(2000).optional(),
  category: z.enum(["media_partnership", "direct_sales"]).default("direct_sales"),
  defaultCurrency: z.string().length(3).optional(),
  stageOrder: z.array(z.string().min(1)).min(1, "At least one stage is required"),
  slaPolicy: z
    .object({
      response: z.string().min(1).optional(),
      followUp: z.string().min(1).optional(),
      quietHours: z.string().min(1).optional(),
    })
    .partial()
    .optional(),
  type: z.enum(["revenue", "expansion", "agency"]).optional(),
  active: z.boolean().optional(),
  ownerId: z.string().optional(),
});

const pipelineUpdateSchema = pipelineCreateSchema.partial();

const opportunityCreateSchema = z.object({
  name: z.string().min(1, "Opportunity name is required"),
  stage: z.string().min(1, "Stage is required"),
  amount: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  probability: z.coerce.number().min(0).max(100).optional(),
  closeDate: z.union([z.string(), z.date()]).optional(),
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  ownerId: z.string().optional(),
  status: z.enum(["open", "won", "lost", "on_hold"]).optional(),
  reason: z.string().optional(),
  flaggedForSla: z.boolean().optional(),
  
  // Media & Data Partnership Fields
  partnerName: z.string().optional(),
  partnershipType: z.enum(["publisher", "data_provider", "syndication_network", "media_buyer"]).optional(),
  pricingModel: z.enum(["cpl", "cpc", "hybrid", "flat_fee"]).optional(),
  costPerLead: z.coerce.number().min(0).optional(),
  costPerContact: z.coerce.number().min(0).optional(),
  leadVolumeGoal: z.coerce.number().min(0).optional(),
  qualityTier: z.enum(["verified", "unverified", "data_append", "premium"]).optional(),
  partnerAccountManager: z.string().optional(),
  deliveryMethod: z.enum(["api", "csv", "realtime_push", "sftp", "email"]).optional(),
  associatedCampaignIds: z.array(z.string()).optional(),
  
  // Direct Sales Fields
  contractType: z.enum(["retainer", "one_time", "subscription", "per_project"]).optional(),
  estimatedDealValue: z.coerce.number().min(0).optional(),
  intentScore: z.coerce.number().min(0).max(100).optional(),
  leadSource: z.string().optional(),
  decisionMakers: z.array(z.object({
    name: z.string(),
    role: z.string(),
    email: z.string().email().optional(),
  })).optional(),
  touchpointLog: z.array(z.object({
    date: z.string(),
    type: z.string(),
    notes: z.string(),
  })).optional(),
});

const opportunityUpdateSchema = opportunityCreateSchema.partial();

async function exchangeAuthorizationCodeForTokens(code: string, codeVerifier: string) {
  const params = new URLSearchParams({
    client_id: M365_CLIENT_ID,
    scope: M365_SCOPES,
    code,
    redirect_uri: M365_REDIRECT_URI,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  if (M365_CLIENT_SECRET) {
    params.set("client_secret", M365_CLIENT_SECRET);
  }

  const response = await fetch(`https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to exchange authorization code");
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    id_token?: string;
    scope?: string;
    token_type: string;
  };
}

async function refreshMicrosoftAccessToken(refreshToken: string) {
  const params = new URLSearchParams({
    client_id: M365_CLIENT_ID,
    scope: M365_SCOPES,
    refresh_token: refreshToken,
    redirect_uri: M365_REDIRECT_URI,
    grant_type: "refresh_token",
  });

  if (M365_CLIENT_SECRET) {
    params.set("client_secret", M365_CLIENT_SECRET);
  }

  const response = await fetch(`https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to refresh Microsoft 365 token");
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

async function fetchMicrosoftProfile(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to fetch Microsoft profile");
  }

  return (await response.json()) as {
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  };
}

async function fetchMicrosoftMessages(accessToken: string) {
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me/mailFolders('Inbox')/messages?$top=25&$orderby=receivedDateTime desc",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to fetch Microsoft 365 messages");
  }

  const payload = (await response.json()) as {
    value: Array<{
      id: string;
      subject: string;
      bodyPreview: string;
      isRead: boolean;
      receivedDateTime: string;
      lastModifiedDateTime?: string;
      conversationId?: string;
      webLink?: string;
      from?: { emailAddress?: { name?: string; address?: string } };
      toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
    }>;
  };

  return payload.value.map((message) => ({
    id: message.id,
    subject: message.subject,
    bodyPreview: message.bodyPreview,
    isRead: message.isRead,
    receivedDateTime: message.receivedDateTime,
    lastModifiedDateTime: message.lastModifiedDateTime,
    conversationId: message.conversationId,
    webLink: message.webLink,
    from: message.from?.emailAddress ?? null,
    toRecipients: (message.toRecipients ?? []).map((recipient) => recipient.emailAddress ?? null).filter(Boolean),
  }));
}

async function exchangeGoogleAuthorizationCodeForTokens(code: string, codeVerifier: string) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to exchange Google authorization code");
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
    scope?: string;
    token_type: string;
  };
}

async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to fetch Google profile");
  }

  return (await response.json()) as {
    email?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
  };
}

async function ensureMailboxTokens(userId: string) {
  if (!MAILBOX_ENCRYPTION_KEY) {
    throw new Error("Mailbox encryption key is not configured");
  }

  const mailbox = await storage.getMailboxAccount(userId, MAILBOX_PROVIDER);
  if (!mailbox || !mailbox.encryptedTokens) {
    return null;
  }

  let tokens = decryptJson<MicrosoftTokenSet>(mailbox.encryptedTokens, MAILBOX_ENCRYPTION_KEY);
  const expiresBufferMs = 5 * 60 * 1000;

  if (tokens.expiresAt - expiresBufferMs <= Date.now()) {
    const refreshed = await refreshMicrosoftAccessToken(tokens.refreshToken);
    tokens = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + Number(refreshed.expires_in ?? 3600) * 1000,
    };

    const encrypted = encryptJson(tokens, MAILBOX_ENCRYPTION_KEY);
    await storage.updateMailboxAccount(mailbox.id, {
      encryptedTokens: encrypted,
      tokenExpiresAt: new Date(tokens.expiresAt),
      status: "connected",
    });
  }

  return { mailbox, tokens } as const;
}

export function registerRoutes(app: Express) {
  // Apply general rate limiting to all API routes (100 req/15min)
  app.use('/api/', apiLimiter);

  // Health Check Endpoint
  app.use('/api', healthRouter);

  // Vertex AI Agentic CRM Operator
  app.use('/api/vertex-ai', vertexAiRouter);

  // Cloud Logging Dashboard
  app.use('/api/cloud-logs', requireAuth, cloudLogsRouter);

  // ==================== PUBLIC ENDPOINTS (No Auth Required) ====================
  // These must come BEFORE any wildcard/catch-all routes
  
  // Note: The public audio endpoint is defined in ai-calls.ts router at /audio/:audioId

  // ==================== AUTH ====================

  // ==================== USERS (Admin Only) ====================

  // Get all users or find by email
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const { email } = req.query;

      if (email) {
        // Find user by email
        const user = await db.select().from(users).where(eq(users.email, email as string)).limit(1);
        if (user.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }
        const { password, ...userWithoutPassword } = user[0];
        return res.json(userWithoutPassword);
      }

      // Admin only for listing all users
      const userRoles = req.user?.roles || [req.user?.role]; // Support both new and legacy format
      if (!userRoles.includes('admin')) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const allUsers = await storage.getUsers();
      // Return sanitized user data (exclude password) and include roles
      const sanitizedUsersWithRoles = await Promise.all(
        allUsers.map(async (user) => {
          const { password, ...userWithoutPassword } = user;
          const roles = await storage.getUserRoles(user.id);
          return { ...userWithoutPassword, roles };
        })
      );
      res.json(sanitizedUsersWithRoles);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Apply write rate limiting to user creation (30 req/10min)
  app.post("/api/users", requireAuth, requireRole('admin'), writeLimiter, validate({ body: createUserSchema }), async (req, res) => {
    try {
      const validated = req.body;

      // Hash password before storing
      const hashedPassword = await hashPassword(validated.password);

      const user = await storage.createUser({
        ...validated,
        password: hashedPassword
      });

      // Return user without password
      const { password: _, ...userWithoutPassword } = user;

      res.status(201).json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Update user details
  app.put("/api/users/:userId", requireAuth, requireRole('admin'), writeLimiter, validate({ params: userIdSchema, body: updateUserSchema }), async (req, res) => {
    try {
      const { userId } = req.params;
      const { username, email, firstName, lastName, password } = req.body;

      const updateData: any = {};
      if (username !== undefined) updateData.username = username;
      if (email !== undefined) updateData.email = email;
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;

      // If password is provided, hash it before updating
      if (password) {
        updateData.password = await hashPassword(password);
      }

      const updatedUser = await storage.updateUser(userId, updateData);

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Return user without password
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update user" });
    }
  });

  // Delete user
  app.delete("/api/users/:userId", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { userId } = req.params;

      // Prevent deleting yourself
      if (userId === req.user!.userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Note: This will cascade delete all related data (user_roles, etc.)
      await db.delete(users).where(eq(users.id, userId));

      res.json({ message: "User deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete user" });
    }
  });

  // ==================== USER TELEPHONY SETTINGS ====================

  // Get current user's telephony settings
  app.get("/api/users/me/telephony", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [user] = await db
        .select({
          callbackPhone: users.callbackPhone,
          sipExtension: users.sipExtension,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        callbackPhone: user.callbackPhone || null,
        sipExtension: user.sipExtension || null,
      });
    } catch (error: any) {
      console.error("[USER TELEPHONY GET] Error:", error);
      res.status(500).json({ message: error.message || "Failed to get telephony settings" });
    }
  });

  // Update current user's telephony settings
  app.put("/api/users/me/telephony", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { callbackPhone, sipExtension } = req.body as {
        callbackPhone?: string | null;
        sipExtension?: string | null;
      };

      // Validate phone number format if provided
      if (callbackPhone && callbackPhone.trim()) {
        // Basic E.164 validation
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        if (!phoneRegex.test(callbackPhone.replace(/\s/g, ''))) {
          return res.status(400).json({
            message: "Invalid phone number format. Please use E.164 format (e.g., +14155551234)"
          });
        }
      }

      const [updated] = await db
        .update(users)
        .set({
          callbackPhone: callbackPhone?.trim() || null,
          sipExtension: sipExtension?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({
          callbackPhone: users.callbackPhone,
          sipExtension: users.sipExtension,
        });

      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`[USER TELEPHONY] Updated for user ${userId}: callback=${updated.callbackPhone}`);

      res.json({
        success: true,
        callbackPhone: updated.callbackPhone,
        sipExtension: updated.sipExtension,
      });
    } catch (error: any) {
      console.error("[USER TELEPHONY UPDATE] Error:", error);
      res.status(500).json({ message: error.message || "Failed to update telephony settings" });
    }
  });

  // ==================== USER ROLES (Admin Only) ====================

  // Get roles for a specific user
  app.get("/api/users/:userId/roles", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { userId } = req.params;
      const roles = await storage.getUserRoles(userId);
      res.json({ roles });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update all roles for a user (bulk update)
  app.put("/api/users/:userId/roles", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { userId } = req.params;
      const { roles } = req.body;

      if (!Array.isArray(roles)) {
        return res.status(400).json({ message: "Roles must be an array" });
      }

      await storage.updateUserRoles(userId, roles, req.user!.userId);
      res.json({ message: "Roles updated successfully", roles });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Assign a single role to a user
  app.post("/api/users/:userId/roles", requireAuth, requireRole('admin'), writeLimiter, validate({ params: userIdSchema, body: assignRoleSchema }), async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      await storage.assignUserRole(userId, role, req.user!.userId);
      const roles = await storage.getUserRoles(userId);
      res.json({ message: "Role assigned successfully", roles });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Remove a role from a user
  app.delete("/api/users/:userId/roles/:role", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { userId, role } = req.params;
      await storage.removeUserRole(userId, role);
      const roles = await storage.getUserRoles(userId);
      res.json({ message: "Role removed successfully", roles });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Migrate existing users to multi-role system (one-time migration)
  app.post("/api/users/migrate-roles", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const allUsers = await storage.getUsers();
      let migrated = 0;
      let skipped = 0;

      for (const user of allUsers) {
        const existingRoles = await storage.getUserRoles(user.id);

        // Only migrate if user has no roles in the junction table
        if (existingRoles.length === 0) {
          await storage.assignUserRole(user.id, user.role, req.user!.userId);
          migrated++;
        } else {
          skipped++;
        }
      }

      res.json({
        message: "Migration completed successfully",
        migrated,
        skipped,
        total: allUsers.length
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== AUTH ====================

  // ONE-TIME SETUP: Create or reset admin user (REMOVE THIS ENDPOINT AFTER SETUP!)
  const setupAdminHandler = async (req: any, res: any) => {
    try {
      const hashedPassword = await hashPassword("admin123");

      // Check if admin user exists
      const existingUser = await storage.getUserByUsername("admin");

      if (existingUser) {
        // Reset password for existing admin
        await storage.updateUser(existingUser.id, { password: hashedPassword });

        return res.json({
          message: "Admin password reset successfully",
          username: "admin",
          password: "admin123",
          warning: "Change this password immediately after login!"
        });
      }

      // Create new admin user
      const adminUser = await storage.createUser({
        username: "admin",
        email: "admin@crm.local",
        password: hashedPassword,
        role: "admin",
        firstName: "Admin",
        lastName: "User"
      });

      // Assign admin role
      await storage.assignRole(adminUser.id, 'admin');

      res.json({
        message: "Admin user created successfully",
        username: "admin",
        password: "admin123",
        warning: "Change this password immediately after login!"
      });
    } catch (error: any) {
      console.error('[SETUP] Error with admin user:', error);
      res.status(500).json({ message: error.message || "Failed to create/reset admin user" });
    }
  };

  app.post("/api/setup/create-admin", setupAdminHandler);
  app.get("/api/setup/create-admin", setupAdminHandler);

  // Apply strict rate limiting to login endpoint (5 attempts per 15 minutes)
  app.post("/api/auth/login", authLimiter, validate({ body: loginSchema }), async (req, res) => {
    try {
      const { username, password } = req.body;
      console.log('[LOGIN DEBUG] Received username:', username);

      const user = await storage.getUserByUsername(username);
      console.log('[LOGIN DEBUG] User found:', user ? 'YES' : 'NO');
      console.log('[LOGIN DEBUG] User details:', user ? { id: user.id, username: user.username, email: user.email } : null);

      if (!user) {
        console.log('[LOGIN DEBUG] User not found, returning 401');
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Verify password
      console.log('[LOGIN DEBUG] Comparing password...');
      const isValid = await comparePassword(password, user.password);
      console.log('[LOGIN DEBUG] Password valid:', isValid);
      if (!isValid) {
        console.log('[LOGIN DEBUG] Invalid password, returning 401');
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check if user has TOTP MFA enabled
      if (user.mfaEnabled && user.totpSecret) {
        console.log('[LOGIN DEBUG] TOTP MFA enabled for user');
        return res.json({
          requiresMFA: true,
          mfaType: 'totp',
          message: "Please enter your authentication code"
        });
      }

      // Fetch user roles (multi-role support)
      let userRoles = await storage.getUserRoles(user.id);

      // Bootstrap check: If user has no roles and no admin users exist in the system,
      // automatically assign admin role to this user (first user setup)
      if (userRoles.length === 0) {
        const allUsersWithRoles = await storage.getAllUsersWithRoles();
        const hasAdmin = allUsersWithRoles.some(u => u.roles.includes('admin'));

        if (!hasAdmin) {
          // This is the first user - give them admin role
          await storage.assignUserRole(user.id, 'admin', user.id);
          userRoles = ['admin'];
        } else {
          // Use legacy role as fallback - ensure it's always in an array
          userRoles = [user.role || 'agent'];
        }
      }

      // Ensure userRoles is always an array
      if (!Array.isArray(userRoles)) {
        userRoles = [userRoles];
      }

      // Generate JWT token with roles
      const token = generateToken(user, userRoles);

      // Return token and user info without password, including roles
      const { password: _, ...userWithoutPassword } = user;
      res.json({
        token,
        user: { ...userWithoutPassword, roles: userRoles }
      });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  // TOTP MFA Verification Endpoint
  app.post("/api/auth/mfa/verify", authLimiter, async (req, res) => {
    try {
      const { username, password, token, useBackupCode } = req.body;

      if (!username || !password || !token) {
        return res.status(400).json({ message: "Username, password, and token required" });
      }

      // Verify user credentials first
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check if MFA is enabled
      if (!user.mfaEnabled || !user.totpSecret) {
        return res.status(400).json({ message: "MFA is not enabled for this account" });
      }

      let isValidToken = false;

      if (useBackupCode) {
        // Verify backup code
        const usedCodes = (user.usedBackupCodes as string[]) || [];
        const backupCodes = (user.backupCodes as string[]) || [];
        isValidToken = verifyBackupCode(usedCodes, backupCodes, token);

        if (isValidToken) {
          // Mark backup code as used
          await storage.updateUser(user.id, {
            usedBackupCodes: [...usedCodes, token.toUpperCase().trim()],
          });
        }
      } else {
        // Verify TOTP token
        isValidToken = verifyTotpToken(user.totpSecret, token);
      }

      if (!isValidToken) {
        return res.status(401).json({ message: "Invalid authentication code" });
      }

      // Fetch user roles
      let userRoles = await storage.getUserRoles(user.id);

      if (userRoles.length === 0) {
        const allUsersWithRoles = await storage.getAllUsersWithRoles();
        const hasAdmin = allUsersWithRoles.some(u => u.roles.includes('admin'));

        if (!hasAdmin) {
          await storage.assignUserRole(user.id, 'admin', user.id);
          userRoles = ['admin'];
        } else {
          userRoles = [user.role || 'agent'];
        }
      }

      if (!Array.isArray(userRoles)) {
        userRoles = [userRoles];
      }

      // Generate JWT token
      const jwtToken = generateToken(user, userRoles);

      const { password: _, totpSecret: __, backupCodes: ___, usedBackupCodes: ____, ...userWithoutSensitive } = user;
      res.json({
        token: jwtToken,
        user: { ...userWithoutSensitive, roles: userRoles }
      });
    } catch (error) {
      console.error('[MFA VERIFY] Error:', error);
      res.status(500).json({ message: "MFA verification failed" });
    }
  });

  // Enroll in TOTP MFA
  app.post("/api/auth/mfa/enroll", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.mfaEnabled) {
        return res.status(400).json({ message: "MFA is already enabled" });
      }

      // Generate TOTP secret and QR code
      const { secret, qrCode, backupCodes } = await generateTotpSecret(user.username);

      // Store encrypted secret (in production, encrypt this!)
      await storage.updateUser(userId, {
        totpSecret: secret,
        backupCodes: backupCodes,
        usedBackupCodes: [],
      });

      res.json({
        qrCode,
        secret,
        backupCodes,
        message: "Scan the QR code with Google Authenticator or enter the secret manually"
      });
    } catch (error) {
      console.error('[MFA ENROLL] Error:', error);
      res.status(500).json({ message: "Failed to enroll in MFA" });
    }
  });

  // Confirm TOTP MFA enrollment
  app.post("/api/auth/mfa/confirm", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ message: "Verification token required" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.totpSecret) {
        return res.status(400).json({ message: "MFA enrollment not initiated" });
      }

      // Verify the token
      const isValid = verifyTotpToken(user.totpSecret, token);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid verification code" });
      }

      // Enable MFA
      await storage.updateUser(userId, {
        mfaEnabled: true,
        mfaEnrolledAt: new Date(),
      });

      res.json({ message: "MFA enabled successfully" });
    } catch (error) {
      console.error('[MFA CONFIRM] Error:', error);
      res.status(500).json({ message: "Failed to confirm MFA enrollment" });
    }
  });

  // Disable TOTP MFA
  app.post("/api/auth/mfa/disable", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Password required to disable MFA" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify password
      const isValid = await comparePassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid password" });
      }

      // Disable MFA
      await storage.updateUser(userId, {
        mfaEnabled: false,
        totpSecret: null,
        backupCodes: null,
        usedBackupCodes: null,
        mfaEnrolledAt: null,
      });

      res.json({ message: "MFA disabled successfully" });
    } catch (error) {
      console.error('[MFA DISABLE] Error:', error);
      res.status(500).json({ message: "Failed to disable MFA" });
    }
  });

  // Regenerate backup codes
  app.post("/api/auth/mfa/regenerate-codes", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Password required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.mfaEnabled) {
        return res.status(400).json({ message: "MFA is not enabled" });
      }

      // Verify password
      const isValid = await comparePassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid password" });
      }

      // Generate new backup codes
      const newBackupCodes = generateBackupCodes();

      await storage.updateUser(userId, {
        backupCodes: newBackupCodes,
        usedBackupCodes: [],
      });

      res.json({ 
        backupCodes: newBackupCodes,
        message: "Backup codes regenerated successfully"
      });
    } catch (error) {
      console.error('[MFA REGENERATE] Error:', error);
      res.status(500).json({ message: "Failed to regenerate backup codes" });
    }
  });

  // Get MFA status
  app.get("/api/auth/mfa/status", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        mfaEnabled: user.mfaEnabled || false,
        mfaEnrolledAt: user.mfaEnrolledAt,
        hasBackupCodes: !!(user.backupCodes && Array.isArray(user.backupCodes) && user.backupCodes.length > 0),
      });
    } catch (error) {
      console.error('[MFA STATUS] Error:', error);
      res.status(500).json({ message: "Failed to get MFA status" });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      // Get user from database
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isValid = await comparePassword(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Hash new password and update
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(userId, { password: hashedPassword });

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.post("/api/mailboxes/o365/connect", requireAuth, async (req, res) => {
    const clientId = process.env.MSFT_OAUTH_CLIENT_ID;
    const redirectUri = process.env.MSFT_OAUTH_REDIRECT_URI;
    const tenantId = process.env.MSFT_OAUTH_TENANT_ID || "common";
    const scopes = process.env.MSFT_OAUTH_SCOPES || "offline_access Mail.Read Mail.Send";

    if (!clientId || !redirectUri) {
      return res.status(500).json({
        message: "Microsoft OAuth is not configured. Set MSFT_OAUTH_CLIENT_ID and MSFT_OAUTH_REDIRECT_URI.",
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = base64URLEncode(crypto.createHash("sha256").update(codeVerifier).digest());

    await oauthStateStore.set(state, { codeVerifier, userId });

    // Redis TTL automatically handles cleanup of stale entries

    const authorizationUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_mode", "query");
    authorizationUrl.searchParams.set("scope", scopes);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");

    res.json({ authorizationUrl: authorizationUrl.toString(), state });
  });

  // ==================== ACCOUNTS ====================

  app.get("/api/accounts", requireAuth, async (req, res) => {
    try {
      let filters = undefined;
      if (req.query.filters) {
        try {
          filters = JSON.parse(req.query.filters as string);
        } catch (e) {
          return res.status(400).json({ message: "Invalid filters format" });
        }
      }
      // Add default limit of 1000 to prevent loading all accounts at once
      // Can be overridden with ?limit=5000 or ?limit=0 for no limit
      let limit: number | undefined = 1000; // Default to 1000 records
      if (req.query.limit !== undefined) {
        if (req.query.limit === '0') {
          limit = undefined; // No limit for exports
        } else {
          const parsedLimit = parseInt(req.query.limit as string);
          if (isNaN(parsedLimit) || parsedLimit < 0) {
            return res.status(400).json({ message: "Invalid limit parameter. Must be a positive number or 0." });
          }
          limit = parsedLimit;
        }
      }

      const accounts = await storage.getAccounts(filters, limit);
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  app.get("/api/accounts/:id", requireAuth, async (req, res) => {
    try {
      const account = await storage.getAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch account" });
    }
  });

  // ==================== PIPELINES ====================

  app.get("/api/pipelines", requireAuth, async (_req, res) => {
    try {
      const pipelineRecords = await storage.listPipelines();
      const ownerIds = Array.from(new Set(pipelineRecords.map((pipeline) => pipeline.ownerId)));
      const owners = ownerIds.length ? await storage.getUsers() : [];
      const ownerDirectory = new Map(
        owners.filter((owner) => ownerIds.includes(owner.id)).map((owner) => [owner.id, owner]),
      );

      const enriched = pipelineRecords.map((pipeline) => {
        const owner = ownerDirectory.get(pipeline.ownerId);
        return {
          ...pipeline,
          owner: owner
            ? {
                id: owner.id,
                name: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.username,
                email: owner.email ?? null,
              }
            : null,
        };
      });

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to load pipelines" });
    }
  });

  app.post("/api/pipelines", requireAuth, async (req, res) => {
    try {
      const parsed = pipelineCreateSchema.parse(req.body);
      
      // SECURITY: Extract ownerId from authenticated session, not from request body
      const ownerId = req.user!.userId;
      const owner = await storage.getUser(ownerId);
      if (!owner) {
        return res.status(400).json({ message: "Pipeline owner does not exist" });
      }

      const pipeline = await storage.createPipeline({
        ...parsed,
        ownerId, // Use authenticated user's ID
        defaultCurrency: coerceCurrency(parsed.defaultCurrency),
        stageOrder: parsed.stageOrder,
        slaPolicy: parsed.slaPolicy ?? {},
        type: parsed.type ?? "revenue",
        active: parsed.active ?? true,
      });

      res.status(201).json(pipeline);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create pipeline" });
    }
  });

  app.get("/api/pipelines/:id", requireAuth, async (req, res) => {
    try {
      const pipeline = await storage.getPipeline(req.params.id);
      if (!pipeline) {
        return res.status(404).json({ message: "Pipeline not found" });
      }

      res.json(pipeline);
    } catch (error) {
      res.status(500).json({ message: "Failed to load pipeline" });
    }
  });

  app.patch("/api/pipelines/:id", requireAuth, async (req, res) => {
    try {
      const parsed = pipelineUpdateSchema.parse(req.body);
      const pipeline = await storage.getPipeline(req.params.id);
      if (!pipeline) {
        return res.status(404).json({ message: "Pipeline not found" });
      }

      if (parsed.ownerId) {
        const owner = await storage.getUser(parsed.ownerId);
        if (!owner) {
          return res.status(400).json({ message: "Pipeline owner does not exist" });
        }
      }

      const updated = await storage.updatePipeline(req.params.id, {
        ...parsed,
        defaultCurrency: parsed.defaultCurrency ? coerceCurrency(parsed.defaultCurrency) : undefined,
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update pipeline" });
    }
  });

  app.delete("/api/pipelines/:id", requireAuth, async (req, res) => {
    try {
      const pipeline = await storage.getPipeline(req.params.id);
      if (!pipeline) {
        return res.status(404).json({ message: "Pipeline not found" });
      }

      await storage.deletePipeline(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete pipeline" });
    }
  });

  app.post("/api/pipelines/import", requireAuth, async (req, res) => {
    try {
      const parsed = pipelineBulkImportSchema.parse(req.body);
      
      // Verify pipeline exists
      const pipeline = await storage.getPipeline(parsed.pipelineId);
      if (!pipeline) {
        return res.status(404).json({ message: "Pipeline not found" });
      }

      const results = {
        opportunitiesCreated: 0,
        accountsCreated: 0,
        contactsCreated: 0,
        errors: [] as Array<{ row: number; message: string }>,
      };

      // Process each row
      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        try {
          // 1. Find or create account
          let accountId: string | null = null;
          if (row.companyName) {
            const normalizedCompanyName = normalizeName(row.companyName);
            const existingAccounts = await db
              .select()
              .from(accounts)
              .where(eq(accounts.nameNormalized, normalizedCompanyName))
              .limit(1);
            
            if (existingAccounts.length > 0) {
              accountId = existingAccounts[0].id;
            } else if (parsed.createMissingAccounts) {
              const account = await storage.createAccount({
                name: row.companyName,
                nameNormalized: normalizedCompanyName,
                industry: row.industry || null,
                description: row.companyDescription || null,
                hqLocation: row.hqLocation || null,
              });
              accountId = account.id;
              results.accountsCreated++;
            }
          }

          // 2. Find or create contact
          let contactId: string | null = null;
          if (row.email) {
            const existingContacts = await storage.getContactsByEmails([row.email]);
            
            if (existingContacts.length > 0) {
              contactId = existingContacts[0].id;
            } else if (parsed.createMissingContacts) {
              const contact = await storage.createContact({
                fullName: row.leadName,
                firstName: row.leadName.split(' ')[0] || null,
                lastName: row.leadName.split(' ').slice(1).join(' ') || null,
                email: row.email,
                emailNormalized: row.email.toLowerCase(),
                jobTitle: row.jobTitle || null,
                accountId,
              });
              contactId = contact.id;
              results.contactsCreated++;
            }
          }

          // 3. Create opportunity
          const opportunityName = row.opportunityName || `${row.leadName} - ${row.companyName}`;
          const amountStr = row.amount ? String(parseFloat(row.amount.replace(/[^0-9.-]+/g, ''))) : undefined;
          
          await storage.createPipelineOpportunity({
            pipelineId: parsed.pipelineId,
            name: opportunityName,
            stage: parsed.stage,
            accountId,
            contactId,
            amount: amountStr,
            probability: row.probability || 0,
            currency: pipeline.defaultCurrency,
            ownerId: pipeline.ownerId,
            status: "open",
            sourceAsset: row.sourceAsset || null,
            dateCaptured: row.dateCaptured || null,
          });
          results.opportunitiesCreated++;

        } catch (error) {
          results.errors.push({
            row: i + 1,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      res.json({ results });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: error.errors 
        });
      }
      console.error("[PipelineImport] Error:", error);
      res.status(500).json({ message: "Failed to import opportunities" });
    }
  });

  app.get("/api/pipelines/:id/opportunities", requireAuth, async (req, res) => {
    try {
      const pipeline = await storage.getPipeline(req.params.id);
      if (!pipeline) {
        return res.status(404).json({ message: "Pipeline not found" });
      }

      const opportunities = await storage.listPipelineOpportunities(req.params.id);
      res.json(opportunities);
    } catch (error) {
      res.status(500).json({ message: "Failed to load opportunities" });
    }
  });

  app.post("/api/pipelines/:id/opportunities", requireAuth, async (req, res) => {
    try {
      const pipeline = await storage.getPipeline(req.params.id);
      if (!pipeline) {
        return res.status(404).json({ message: "Pipeline not found" });
      }

      const parsed = opportunityCreateSchema.parse(req.body);

      if (parsed.accountId) {
        const account = await storage.getAccount(parsed.accountId);
        if (!account) {
          return res.status(400).json({ message: "Account not found" });
        }
      }

      if (parsed.contactId) {
        const contact = await storage.getContact(parsed.contactId);
        if (!contact) {
          return res.status(400).json({ message: "Contact not found" });
        }
        if (parsed.accountId && contact.accountId !== parsed.accountId) {
          return res.status(400).json({ message: "Contact does not belong to the selected account" });
        }
      }

      let ownerId = parsed.ownerId ?? pipeline.ownerId;
      if (ownerId) {
        const owner = await storage.getUser(ownerId);
        if (!owner) {
          return res.status(400).json({ message: "Opportunity owner does not exist" });
        }
      }

      const status = deriveOpportunityStatus(parsed.stage, parsed.status);
      const probability =
        parsed.probability !== undefined ? coerceProbability(parsed.probability) : status === "won" ? 100 : status === "lost" ? 0 : 0;
      const closeDate = parseOptionalDate(parsed.closeDate);

      const opportunity = await storage.createPipelineOpportunity({
        pipelineId: req.params.id,
        name: parsed.name,
        stage: parsed.stage,
        amount: String(parsed.amount ?? 0),
        currency: coerceCurrency(parsed.currency ?? pipeline.defaultCurrency),
        probability,
        closeDate: closeDate ?? undefined,
        accountId: parsed.accountId,
        contactId: parsed.contactId,
        ownerId,
        status,
        reason: parsed.reason,
        flaggedForSla: status === "open" || status === "on_hold" ? parsed.flaggedForSla ?? false : false,
        forecastCategory: deriveForecastCategory(parsed.stage),
      });

      res.status(201).json(opportunity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create opportunity" });
    }
  });

  app.patch("/api/pipelines/:pipelineId/opportunities/:opportunityId", requireAuth, async (req, res) => {
    try {
      const pipeline = await storage.getPipeline(req.params.pipelineId);
      if (!pipeline) {
        return res.status(404).json({ message: "Pipeline not found" });
      }

      const existing = await storage.getPipelineOpportunity(req.params.opportunityId);
      if (!existing || existing.pipelineId !== pipeline.id) {
        return res.status(404).json({ message: "Opportunity not found" });
      }

      const parsed = opportunityUpdateSchema.parse(req.body);

      if (parsed.accountId) {
        const account = await storage.getAccount(parsed.accountId);
        if (!account) {
          return res.status(400).json({ message: "Account not found" });
        }
      }

      if (parsed.contactId) {
        const contact = await storage.getContact(parsed.contactId);
        if (!contact) {
          return res.status(400).json({ message: "Contact not found" });
        }
        const accountToCheck = parsed.accountId ?? existing.accountId;
        if (accountToCheck && contact.accountId !== accountToCheck) {
          return res.status(400).json({ message: "Contact does not belong to the selected account" });
        }
      }

      let ownerId = parsed.ownerId ?? existing.ownerId;
      if (ownerId) {
        const owner = await storage.getUser(ownerId);
        if (!owner) {
          return res.status(400).json({ message: "Opportunity owner does not exist" });
        }
      }

      const stage = parsed.stage ?? existing.stage;
      const status = deriveOpportunityStatus(stage, parsed.status ?? existing.status);
      const probability =
        parsed.probability !== undefined
          ? coerceProbability(parsed.probability)
          : status === "won"
            ? 100
            : status === "lost"
              ? 0
              : existing.probability;
      const closeDate = parseOptionalDate(parsed.closeDate) ?? existing.closeDate ?? undefined;

      const updated = await storage.updatePipelineOpportunity(req.params.opportunityId, {
        name: parsed.name ?? existing.name,
        stage,
        amount: parsed.amount !== undefined ? String(parsed.amount) : existing.amount,
        currency: parsed.currency ? coerceCurrency(parsed.currency) : existing.currency,
        probability,
        closeDate,
        accountId: parsed.accountId ?? existing.accountId,
        contactId: parsed.contactId ?? existing.contactId,
        ownerId,
        status,
        reason: parsed.reason ?? existing.reason,
        flaggedForSla: status === "open" || status === "on_hold"
          ? parsed.flaggedForSla ?? existing.flaggedForSla
          : false,
        forecastCategory: deriveForecastCategory(stage),
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update opportunity" });
    }
  });

  app.delete("/api/pipelines/:pipelineId/opportunities/:opportunityId", requireAuth, async (req, res) => {
    try {
      const pipeline = await storage.getPipeline(req.params.pipelineId);
      if (!pipeline) {
        return res.status(404).json({ message: "Pipeline not found" });
      }

      const existing = await storage.getPipelineOpportunity(req.params.opportunityId);
      if (!existing || existing.pipelineId !== pipeline.id) {
        return res.status(404).json({ message: "Opportunity not found" });
      }

      await storage.deletePipelineOpportunity(req.params.opportunityId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete opportunity" });
    }
  });

  // Get single opportunity with enriched data
  app.get("/api/opportunities/:id", requireAuth, async (req, res) => {
    try {
      const opportunity = await storage.getPipelineOpportunity(req.params.id);
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunity not found" });
      }

      // Enrich with pipeline name
      const pipeline = await storage.getPipeline(opportunity.pipelineId);
      
      // Enrich with owner name
      const owner = opportunity.ownerId ? await storage.getUser(opportunity.ownerId) : null;
      
      // Enrich with account name
      const account = opportunity.accountId ? await storage.getAccount(opportunity.accountId) : null;
      
      // Enrich with contact name
      const contact = opportunity.contactId ? await storage.getContact(opportunity.contactId) : null;

      res.json({
        ...opportunity,
        pipelineName: pipeline?.name,
        ownerName: owner ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() : null,
        accountName: account?.name,
        contactName: contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch opportunity" });
    }
  });

  // Get activities for an opportunity (email, calls, meetings)
  app.get("/api/opportunities/:id/activities", requireAuth, async (req, res) => {
    try {
      const opportunity = await storage.getPipelineOpportunity(req.params.id);
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunity not found" });
      }

      // Get all mailbox accounts to fetch activities from
      const mailboxAccounts = await storage.getAllMailboxAccounts();
      
      const allActivities = [];
      
      // Fetch activities from all mailbox accounts
      for (const mailbox of mailboxAccounts) {
        const activities = await storage.getM365Activities(mailbox.id, {
          accountId: opportunity.accountId || undefined,
          contactId: opportunity.contactId || undefined,
          limit: 100,
        });
        allActivities.push(...activities);
      }

      // Sort by most recent first
      allActivities.sort((a, b) => 
        new Date(b.receivedDateTime || b.createdAt).getTime() - new Date(a.receivedDateTime || a.createdAt).getTime()
      );

      res.json(allActivities.slice(0, 50)); // Return top 50
    } catch (error) {
      console.error("Failed to fetch opportunity activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  app.get("/api/accounts/:id/opportunities", requireAuth, async (req, res) => {
    try {
      const account = await storage.getAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      const opportunities = await storage.getOpportunitiesByAccountId(req.params.id);
      res.json(opportunities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch account opportunities" });
    }
  });

  app.get("/api/contacts/:id/opportunities", requireAuth, async (req, res) => {
    try {
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const opportunities = await storage.getOpportunitiesByContactId(req.params.id);
      res.json(opportunities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contact opportunities" });
    }
  });

  // ==================== MAILBOX & EMAIL ACTIVITIES ====================

  // Get all mailbox accounts
  app.get("/api/mailbox-accounts", requireAuth, async (req, res) => {
    try {
      const mailboxes = await storage.getAllMailboxAccounts();
      res.json(mailboxes);
    } catch (error) {
      console.error("Failed to fetch mailbox accounts:", error);
      res.status(500).json({ message: "Failed to fetch mailbox accounts" });
    }
  });

  // Get M365 activities for a mailbox
  app.get("/api/m365-activities/:mailboxId", requireAuth, async (req, res) => {
    try {
      const activities = await storage.getM365Activities(req.params.mailboxId, {
        limit: parseInt(req.query.limit as string) || 100,
      });
      res.json(activities);
    } catch (error) {
      console.error("Failed to fetch M365 activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // Send email via M365
  app.post("/api/emails/send", requireAuth, async (req, res) => {
    try {
      const { to, cc, subject, body, mailboxAccountId } = req.body;

      if (!to || !subject || !body || !mailboxAccountId) {
        return res.status(400).json({ message: "Missing required fields: to, subject, body, mailboxAccountId" });
      }

      const mailboxAccount = await storage.getMailboxAccountById(mailboxAccountId);
      if (!mailboxAccount) {
        return res.status(404).json({ message: "Mailbox account not found" });
      }

      if (mailboxAccount.provider === GOOGLE_MAILBOX_PROVIDER) {
        const { gmailSyncService } = await import('./services/gmail-sync-service');
        await gmailSyncService.sendEmail(mailboxAccountId, { to, cc, subject, body });
      } else {
        const { m365SyncService } = await import('./services/m365-sync-service');
        await m365SyncService.sendEmail(mailboxAccountId, { to, cc, subject, body });
      }

      res.json({ message: "Email sent successfully" });
    } catch (error: any) {
      console.error("Failed to send email:", error);
      res.status(500).json({ message: "Failed to send email", error: error.message });
    }
  });

  // Manually trigger M365 email sync
  app.post("/api/m365-sync", requireAuth, async (req, res) => {
    try {
      const { mailboxAccountId } = req.body;

      if (!mailboxAccountId) {
        return res.status(400).json({ message: "Missing mailboxAccountId" });
      }

      // Import M365 sync service
      const { m365SyncService } = await import('./services/m365-sync-service');
      
      const result = await m365SyncService.syncEmails(mailboxAccountId, { limit: 50 });

      res.json({ 
        message: "Email sync completed successfully",
        ...result
      });
    } catch (error: any) {
      console.error("Failed to sync emails:", error);
      res.status(500).json({ message: "Failed to sync emails", error: error.message });
    }
  });

  // Manually trigger Gmail email sync
  app.post("/api/gmail-sync", requireAuth, async (req, res) => {
    try {
      const { mailboxAccountId } = req.body;

      if (!mailboxAccountId) {
        return res.status(400).json({ message: "Missing mailboxAccountId" });
      }

      const { gmailSyncService } = await import('./services/gmail-sync-service');
      const result = await gmailSyncService.syncEmails(mailboxAccountId, { limit: 50 });

      res.json({
        message: "Gmail sync completed successfully",
        ...result
      });
    } catch (error: any) {
      console.error("Failed to sync Gmail emails:", error);
      res.status(500).json({ message: "Failed to sync Gmail emails", error: error.message });
    }
  });

  // Backfill inbox with existing M365 activities
  app.post("/api/m365-inbox/backfill", requireAuth, async (req, res) => {
    try {
      const { mailboxAccountId } = req.body;

      if (!mailboxAccountId) {
        return res.status(400).json({ message: "Missing mailboxAccountId" });
      }

      const { m365SyncService } = await import('./services/m365-sync-service');
      
      const result = await m365SyncService.backfillInboxFromActivities(mailboxAccountId);

      res.json({ 
        message: "Inbox backfill completed successfully",
        ...result
      });
    } catch (error: any) {
      console.error("Failed to backfill inbox:", error);
      res.status(500).json({ message: "Failed to backfill inbox", error: error.message });
    }
  });

  // ==================== OPPORTUNITY EMAIL COMMUNICATION ====================
  
  // Send email from opportunity (auto-links to deal conversations)
  app.post("/api/opportunities/:opportunityId/emails/send", requireAuth, async (req, res) => {
    try {
      const { opportunityId } = req.params;
      const { to, cc, subject, body, mailboxAccountId, threadId } = req.body;

      if (!to || !Array.isArray(to) || to.length === 0) {
        return res.status(400).json({ message: "To field is required and must be an array of email addresses" });
      }

      if (!subject || !body || !mailboxAccountId) {
        return res.status(400).json({ message: "Missing required fields: subject, body, mailboxAccountId" });
      }

      const opportunity = await storage.getPipelineOpportunity(opportunityId);
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunity not found" });
      }

      const { dealConversationService } = await import('./services/deal-conversation-service');
      const mailboxAccount = await storage.getMailboxAccountById(mailboxAccountId);

      if (!mailboxAccount) {
        return res.status(404).json({ message: "Mailbox account not found" });
      }

      const toAddresses = Array.isArray(to) ? to.join(", ") : to;
      const ccAddresses = cc && Array.isArray(cc) ? cc.join(", ") : cc;

      let externalMessageId = crypto.randomUUID();

      if (mailboxAccount.provider === GOOGLE_MAILBOX_PROVIDER) {
        const { gmailSyncService } = await import('./services/gmail-sync-service');
        const sentMessage = await gmailSyncService.sendEmail(mailboxAccountId, {
          to: toAddresses,
          cc: ccAddresses,
          subject,
          body,
        });
        externalMessageId = gmailSyncService.buildExternalMessageId(mailboxAccountId, sentMessage.messageId);
      } else {
        const { m365SyncService } = await import('./services/m365-sync-service');
        await m365SyncService.sendEmail(mailboxAccountId, {
          to: toAddresses,
          cc: ccAddresses,
          subject,
          body,
        });
      }

      const result = await dealConversationService.sendEmailFromOpportunity({
        opportunityId,
        mailboxAccountId,
        to,
        cc: cc || [],
        subject,
        body,
        m365MessageId: externalMessageId,
        threadId: threadId || undefined
      });

      res.json({ 
        message: "Email sent successfully",
        conversationId: result.conversationId,
        messageId: result.messageId
      });
    } catch (error: any) {
      console.error("Failed to send opportunity email:", error);
      res.status(500).json({ message: "Failed to send email", error: error.message });
    }
  });

  // Get opportunity email conversations
  app.get("/api/opportunities/:opportunityId/conversations", requireAuth, async (req, res) => {
    try {
      const { opportunityId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const { dealConversationService } = await import('./services/deal-conversation-service');
      
      const conversations = await dealConversationService.getOpportunityConversations(
        opportunityId,
        { limit }
      );

      res.json(conversations);
    } catch (error: any) {
      console.error("Failed to fetch conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations", error: error.message });
    }
  });

  // Get conversation messages
  app.get("/api/conversations/:conversationId/messages", requireAuth, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;

      const messages = await storage.getDealMessages(conversationId, { limit });

      res.json(messages);
    } catch (error: any) {
      console.error("Failed to fetch messages:", error);
      res.status(500).json({ message: "Failed to fetch messages", error: error.message });
    }
  });

  // Get opportunity contacts for email pre-fill
  app.get("/api/opportunities/:opportunityId/contacts", requireAuth, async (req, res) => {
    try {
      const { opportunityId } = req.params;

      const opportunity = await storage.getPipelineOpportunity(opportunityId);
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunity not found" });
      }

      if (!opportunity.contactId) {
        return res.json([]);
      }

      const contacts = await storage.getContactsByIds([opportunity.contactId]);

      res.json(contacts.map(c => ({
        id: c.id,
        fullName: c.fullName,
        email: c.email,
        jobTitle: c.jobTitle
      })));
    } catch (error: any) {
      console.error("Failed to fetch opportunity contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts", error: error.message });
    }
  });

  // ==================== MICROSOFT 365 OAUTH ====================

  // Initiate Microsoft 365 OAuth flow
  app.get("/api/oauth/microsoft/authorize", requireAuth, async (req, res) => {
    try {
      console.log('[M365 OAuth] Authorize endpoint called');
      console.log('[M365 OAuth] Environment variables:', {
        clientId: M365_CLIENT_ID ? 'SET' : 'NOT SET',
        clientSecret: M365_CLIENT_SECRET ? 'SET' : 'NOT SET',
        tenantId: M365_TENANT_ID,
        scopes: M365_SCOPES
      });

      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      // Store state and code_verifier in Redis (persists across server restarts)
      await oauthStateStore.set(state, { codeVerifier, userId: req.user!.userId });

      // Redis TTL automatically handles cleanup of stale entries

      console.log('[M365 OAuth] Redirect URI:', M365_REDIRECT_URI);

      const authUrl = new URL(`https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/authorize`);
      authUrl.searchParams.set('client_id', M365_CLIENT_ID);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', M365_REDIRECT_URI);
      authUrl.searchParams.set('response_mode', 'query');
      authUrl.searchParams.set('scope', M365_SCOPES);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      const finalUrl = authUrl.toString();
      console.log('[M365 OAuth] Generated auth URL:', finalUrl);
      console.log('[M365 OAuth] Returning JSON response');

      res.json({ authUrl: finalUrl });
    } catch (error) {
      console.error('OAuth authorize error:', error);
      res.status(500).json({ message: "Failed to initiate OAuth flow" });
    }
  });

  // OAuth callback handler (no auth required as this is the callback URL)
  app.get("/api/oauth/microsoft/callback", async (req, res) => {
    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        console.error('OAuth error:', error, error_description);
        return res.redirect(`/?error=${encodeURIComponent(error_description as string || 'OAuth failed')}`);
      }

      if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
        return res.redirect('/?error=missing_code_or_state');
      }

      // Verify state and retrieve code_verifier from Redis
      const pending = await oauthStateStore.get(state);
      if (!pending) {
        console.error('[M365 OAuth] Invalid or expired state:', state);
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>OAuth Failed</title>
            </head>
            <body>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'oauth-error', provider: 'microsoft', error: 'Invalid or expired authorization request. Please try again.' }, '*');
                  window.close();
                } else {
                  window.location.href = '/?error=invalid_or_expired_state';
                }
              </script>
              <p>Invalid or expired authorization request. This window should close automatically...</p>
            </body>
          </html>
        `);
      }

      // Clean up the pending authorization from Redis
      await oauthStateStore.delete(state);

      const { codeVerifier, userId } = pending;

      // Exchange code for tokens
      const tokenData = await exchangeAuthorizationCodeForTokens(code, codeVerifier);

      // Fetch user profile
      const profile = await fetchMicrosoftProfile(tokenData.access_token);

      // Encrypt tokens separately using CryptoJS (same as M365SyncService)
      const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.MAILBOX_ENCRYPTION_KEY || "default-encryption-key-change-in-production";
      const encryptedAccessToken = CryptoJS.AES.encrypt(tokenData.access_token, ENCRYPTION_KEY).toString();
      const encryptedRefreshToken = CryptoJS.AES.encrypt(tokenData.refresh_token, ENCRYPTION_KEY).toString();
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      // Check if mailbox already exists
      const existing = await storage.getMailboxAccount(userId, MAILBOX_PROVIDER);

      if (existing) {
        await storage.updateMailboxAccount(existing.id, {
          mailboxEmail: profile.mail || profile.userPrincipalName || null,
          displayName: profile.displayName || null,
          connectedAt: new Date(),
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          status: 'connected',
        });
      } else {
        await storage.createMailboxAccount({
          userId,
          provider: MAILBOX_PROVIDER,
          mailboxEmail: profile.mail || profile.userPrincipalName || null,
          displayName: profile.displayName || null,
          connectedAt: new Date(),
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          status: 'connected',
        });
      }

      // Return HTML that closes the popup and notifies the parent window
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Success</title>
          </head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth-success', provider: 'microsoft' }, '*');
                window.close();
              } else {
                window.location.href = '/?oauth=success';
              }
            </script>
            <p>Authentication successful! This window should close automatically...</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Failed</title>
          </head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth-error', provider: 'microsoft', error: 'OAuth callback failed' }, '*');
                window.close();
              } else {
                window.location.href = '/?error=${encodeURIComponent('OAuth callback failed')}';
              }
            </script>
            <p>Authentication failed. This window should close automatically...</p>
          </body>
        </html>
      `);
    }
  });

  // Get mailbox connection status
  app.get("/api/oauth/microsoft/status", requireAuth, async (req, res) => {
    try {
      const mailbox = await storage.getMailboxAccount(req.user!.userId, MAILBOX_PROVIDER);

      if (!mailbox) {
        return res.json({ connected: false });
      }

      res.json({
        connected: mailbox.status === 'connected',
        mailboxEmail: mailbox.mailboxEmail,
        displayName: mailbox.displayName,
        connectedAt: mailbox.connectedAt,
        lastSyncAt: mailbox.lastSyncAt,
      });
    } catch (error) {
      console.error('Get mailbox status error:', error);
      res.status(500).json({ message: "Failed to get mailbox status" });
    }
  });

  // Disconnect mailbox
  app.post("/api/oauth/microsoft/disconnect", requireAuth, async (req, res) => {
    try {
      const mailbox = await storage.getMailboxAccount(req.user!.userId, MAILBOX_PROVIDER);

      if (!mailbox) {
        return res.status(404).json({ message: "No mailbox connected" });
      }

      await storage.updateMailboxAccount(mailbox.id, {
        status: 'disconnected',
        encryptedTokens: null,
        tokenExpiresAt: null,
      });

      res.json({ message: "Mailbox disconnected successfully" });
    } catch (error) {
      console.error('Disconnect mailbox error:', error);
      res.status(500).json({ message: "Failed to disconnect mailbox" });
    }
  });

  // Get recent emails (for testing)
  app.get("/api/oauth/microsoft/messages", requireAuth, async (req, res) => {
    try {
      const result = await ensureMailboxTokens(req.user!.userId);

      if (!result) {
        return res.status(404).json({ message: "Mailbox not connected" });
      }

      const messages = await fetchMicrosoftMessages(result.tokens.accessToken);
      res.json(messages);
    } catch (error) {
      console.error('Fetch messages error:', error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Sync M365 emails to CRM
  app.post("/api/oauth/microsoft/sync", requireAuth, async (req, res) => {
    try {
      const { m365SyncService } = await import("./services/m365-sync-service");
      const userId = req.user!.userId;
      const mailboxAccount = await storage.getMailboxAccount(userId, "microsoft365");

      if (!mailboxAccount) {
        return res.status(404).json({ error: "No connected Microsoft 365 account found" });
      }

      const result = await m365SyncService.syncEmails(mailboxAccount.id, { limit: 50 });
      res.json(result);
    } catch (error: any) {
      console.error("[M365Sync] Error:", error);
      res.status(500).json({ error: error.message || "Failed to sync emails" });
    }
  });

  // Get synced M365 activities
  app.get("/api/oauth/microsoft/activities", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const mailboxAccount = await storage.getMailboxAccount(userId, "microsoft365");

      if (!mailboxAccount) {
        return res.status(404).json({ error: "No connected Microsoft 365 account found" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const activities = await storage.getM365Activities(mailboxAccount.id, { limit });
      res.json(activities);
    } catch (error: any) {
      console.error("[M365Activities] Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch activities" });
    }
  });

  // ==================== GOOGLE OAUTH ====================

  // Initiate Google OAuth flow
  app.get("/api/oauth/google/authorize", requireAuth, async (req, res) => {
    try {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({
          message: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        });
      }

      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      await oauthStateStore.set(state, { codeVerifier, userId: req.user!.userId });

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
      authUrl.searchParams.set("scope", GOOGLE_SCOPES);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("include_granted_scopes", "true");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      res.json({ authUrl: authUrl.toString() });
    } catch (error) {
      console.error("Google OAuth authorize error:", error);
      res.status(500).json({ message: "Failed to initiate Google OAuth flow" });
    }
  });

  // OAuth callback handler for Google
  app.get("/api/oauth/google/callback", async (req, res) => {
    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        console.error("Google OAuth error:", error, error_description);
        return res.redirect(`/?error=${encodeURIComponent(error_description as string || 'Google OAuth failed')}`);
      }

      if (!code || typeof code !== "string" || !state || typeof state !== "string") {
        return res.redirect("/?error=missing_code_or_state");
      }

      const pending = await oauthStateStore.get(state);
      if (!pending) {
        console.error("[Google OAuth] Invalid or expired state:", state);
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>OAuth Failed</title>
            </head>
            <body>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'oauth-error', provider: 'google', error: 'Invalid or expired authorization request. Please try again.' }, '*');
                  window.close();
                } else {
                  window.location.href = '/?error=invalid_or_expired_state';
                }
              </script>
              <p>Invalid or expired authorization request. This window should close automatically...</p>
            </body>
          </html>
        `);
      }

      await oauthStateStore.delete(state);

      const { codeVerifier, userId } = pending;
      const tokenData = await exchangeGoogleAuthorizationCodeForTokens(code, codeVerifier);
      const profile = await fetchGoogleProfile(tokenData.access_token);

      const encryptionKey =
        process.env.ENCRYPTION_KEY ||
        process.env.MAILBOX_ENCRYPTION_KEY ||
        "default-encryption-key-change-in-production";
      const encryptedAccessToken = CryptoJS.AES.encrypt(tokenData.access_token, encryptionKey).toString();
      const encryptedRefreshToken = tokenData.refresh_token
        ? CryptoJS.AES.encrypt(tokenData.refresh_token, encryptionKey).toString()
        : null;
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      const existing = await storage.getMailboxAccount(userId, GOOGLE_MAILBOX_PROVIDER);

      if (existing) {
        await storage.updateMailboxAccount(existing.id, {
          mailboxEmail: profile.email || existing.mailboxEmail || null,
          displayName: profile.name || existing.displayName || null,
          connectedAt: new Date(),
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken || existing.refreshToken,
          tokenExpiresAt: expiresAt,
          status: "connected",
        });
      } else {
        await storage.createMailboxAccount({
          userId,
          provider: GOOGLE_MAILBOX_PROVIDER,
          mailboxEmail: profile.email || null,
          displayName: profile.name || null,
          connectedAt: new Date(),
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          status: "connected",
        });
      }

      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Success</title>
          </head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth-success', provider: 'google' }, '*');
                window.close();
              } else {
                window.location.href = '/?oauth=success';
              }
            </script>
            <p>Authentication successful! This window should close automatically...</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Failed</title>
          </head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth-error', provider: 'google', error: 'OAuth callback failed' }, '*');
                window.close();
              } else {
                window.location.href = '/?error=${encodeURIComponent('OAuth callback failed')}';
              }
            </script>
            <p>Authentication failed. This window should close automatically...</p>
          </body>
        </html>
      `);
    }
  });

  // Get Google mailbox connection status
  app.get("/api/oauth/google/status", requireAuth, async (req, res) => {
    try {
      const mailbox = await storage.getMailboxAccount(req.user!.userId, GOOGLE_MAILBOX_PROVIDER);

      if (!mailbox) {
        return res.json({ connected: false });
      }

      res.json({
        connected: mailbox.status === "connected",
        mailboxEmail: mailbox.mailboxEmail,
        displayName: mailbox.displayName,
        connectedAt: mailbox.connectedAt,
        lastSyncAt: mailbox.lastSyncAt,
      });
    } catch (error) {
      console.error("Get Google mailbox status error:", error);
      res.status(500).json({ message: "Failed to get Google mailbox status" });
    }
  });

  // Disconnect Google mailbox
  app.post("/api/oauth/google/disconnect", requireAuth, async (req, res) => {
    try {
      const mailbox = await storage.getMailboxAccount(req.user!.userId, GOOGLE_MAILBOX_PROVIDER);

      if (!mailbox) {
        return res.status(404).json({ message: "No Google mailbox connected" });
      }

      await storage.updateMailboxAccount(mailbox.id, {
        status: "disconnected",
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
      });

      res.json({ message: "Google mailbox disconnected successfully" });
    } catch (error) {
      console.error("Disconnect Google mailbox error:", error);
      res.status(500).json({ message: "Failed to disconnect Google mailbox" });
    }
  });

  // Sync Gmail emails to CRM
  app.post("/api/oauth/google/sync", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const mailboxAccount = await storage.getMailboxAccount(userId, GOOGLE_MAILBOX_PROVIDER);

      if (!mailboxAccount) {
        return res.status(404).json({ error: "No connected Google account found" });
      }

      const { gmailSyncService } = await import("./services/gmail-sync-service");
      const result = await gmailSyncService.syncEmails(mailboxAccount.id, { limit: 50 });
      res.json(result);
    } catch (error: any) {
      console.error("[GmailSync] Error:", error);
      res.status(500).json({ error: error.message || "Failed to sync Gmail emails" });
    }
  });

  app.post("/api/accounts", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const validated = insertAccountSchema.parse(req.body);
      const account = await storage.createAccount(validated);
      invalidateDashboardCache();
      res.status(201).json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  // Batch import: Process multiple accounts in one request
  app.post("/api/accounts/batch-import", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const { accounts: accountsData } = req.body;

      if (!Array.isArray(accountsData)) {
        return res.status(400).json({ message: "Accounts must be an array" });
      }

      const results = {
        success: 0,
        created: 0,
        updated: 0,
        failed: 0,
        errors: [] as Array<{ index: number; error: string }>,
      };

      // Step 1: Validate all accounts and collect domains
      const accountsToProcess: Array<{ validated: any; originalIndex: number }> = [];

      for (let i = 0; i < accountsData.length; i++) {
        try {
          const validated = insertAccountSchema.parse(accountsData[i]);
          accountsToProcess.push({ validated, originalIndex: i });
        } catch (error) {
          results.failed++;
          results.errors.push({
            index: i,
            error: error instanceof Error ? error.message : "Validation failed"
          });
        }
      }

      // Step 2: Check for existing accounts by domain and separate create vs update
      const domainsToCheck = accountsToProcess
        .filter(a => a.validated.domain)
        .map(a => a.validated.domain.toLowerCase().trim());

      const existingAccounts = await storage.getAccountsByDomains(domainsToCheck);
      const accountsByDomain = new Map(existingAccounts.map(a => [a.domain!.toLowerCase().trim(), a]));

      const accountsToCreate: any[] = [];
      const accountsToUpdate: Array<{ id: string; data: any; originalIndex: number }> = [];

      for (const { validated, originalIndex } of accountsToProcess) {
        if (validated.domain) {
          const normalizedDomain = validated.domain.toLowerCase().trim();
          const existingAccount = accountsByDomain.get(normalizedDomain);

          if (existingAccount) {
            // Account exists - update it
            accountsToUpdate.push({ id: existingAccount.id, data: validated, originalIndex });
          } else {
            // Account doesn't exist - create it
            accountsToCreate.push({ account: validated, originalIndex });
          }
        } else {
          // No domain - always create
          accountsToCreate.push({ account: validated, originalIndex });
        }
      }

      // Step 3: Create new accounts in bulk
      let createdCount = 0;
      let updatedCount = 0;

      if (accountsToCreate.length > 0) {
        try {
          await storage.createAccountsBulk(accountsToCreate.map(a => a.account));
          createdCount = accountsToCreate.length;
        } catch (error) {
          // If bulk insert fails, fall back to individual inserts to identify specific failures
          for (const { account, originalIndex } of accountsToCreate) {
            try {
              await storage.createAccount(account);
              createdCount++;
            } catch (err) {
              results.failed++;
              results.errors.push({
                index: originalIndex,
                error: err instanceof Error ? err.message : "Unknown error"
              });
            }
          }
        }
      }

      // Step 4: Update existing accounts individually
      for (const { id, data, originalIndex } of accountsToUpdate) {
        try {
          await storage.updateAccount(id, data);
          updatedCount++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            index: originalIndex,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      results.success = createdCount + updatedCount;
      results.created = createdCount;
      results.updated = updatedCount;

      invalidateDashboardCache();
      res.status(200).json(results);
    } catch (error) {
      console.error("Batch import error:", error);
      res.status(500).json({ message: "Failed to process batch import" });
    }
  });

  app.patch("/api/accounts/:id", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const account = await storage.updateAccount(req.params.id, req.body);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      invalidateDashboardCache();
      res.json(account);
    } catch (error) {
      res.status(500).json({ message: "Failed to update account" });
    }
  });

  // Dual-Industry Management (Phase 8)
  app.patch("/api/accounts/:id/industry", requireAuth, requireRole('admin', 'data_ops', 'campaign_manager'), async (req, res) => {
    try {
      const validatedData = updateAccountIndustrySchema.parse(req.body);
      const account = await storage.updateAccountIndustry(req.params.id, validatedData);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update account industry" });
    }
  });

  app.post("/api/accounts/:id/industry/ai-review", requireAuth, requireRole('admin', 'data_ops', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const validatedReview = reviewAccountIndustryAISchema.parse(req.body);
      const account = await storage.reviewAccountIndustryAI(req.params.id, userId, validatedReview);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to review AI suggestions" });
    }
  });

  app.get("/api/accounts/ai-review/pending", requireAuth, requireRole('admin', 'data_ops', 'campaign_manager'), async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const accounts = await storage.getAccountsNeedingReview(limit);
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch accounts needing review" });
    }
  });

  app.delete("/api/accounts/:id", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      await storage.deleteAccount(req.params.id);
      invalidateDashboardCache();
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // ==================== UNIFIED CONTACTS & ACCOUNTS ====================

  app.get("/api/contacts-unified", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      let filterGroup: FilterGroup | undefined;

      if (req.query.filterValues) {
        const filterValues = JSON.parse(req.query.filterValues as string);
        filterGroup = convertFilterValuesToFilterGroup(filterValues, 'contacts');
      }

      const queryBuilder = db
        .select({ contact: contactsTable, account: accountsTable })
        .from(contactsTable)
        .leftJoin(accountsTable, eq(contactsTable.accountId, accountsTable.id));

      if (filterGroup) {
        const filterCondition = buildFilterQuery(filterGroup, 'contacts');
        if (filterCondition) queryBuilder.where(filterCondition);
      }

      const [contactResults, countResult] = await Promise.all([
        queryBuilder.limit(limit).offset(offset).orderBy(desc(contactsTable.createdAt)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(contactsTable)
          .where(filterGroup ? buildFilterQuery(filterGroup, 'contacts') : undefined),
      ]);

      const { toUnifiedContactRecord } = await import('@shared/unified-records');
      const unifiedContacts = contactResults.map(({ contact, account }) =>
        toUnifiedContactRecord(contact, account)
      );

      res.json({
        data: unifiedContacts,
        pagination: {
          total: Number(countResult[0]?.count || 0),
          limit,
          offset,
          hasMore: offset + limit < Number(countResult[0]?.count || 0),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch contacts" });
    }
  });

  app.get("/api/accounts-unified", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      let filterGroup: FilterGroup | undefined;

      if (req.query.filterValues) {
        const filterValues = JSON.parse(req.query.filterValues as string);
        filterGroup = convertFilterValuesToFilterGroup(filterValues, 'accounts');
      }

      const queryBuilder = db
        .select({
          account: accountsTable,
          contactCount: sql<number>`count(distinct ${contactsTable.id})`,
        })
        .from(accountsTable)
        .leftJoin(contactsTable, eq(accountsTable.id, contactsTable.accountId))
        .groupBy(accountsTable.id);

      if (filterGroup) {
        const filterCondition = buildFilterQuery(filterGroup, 'accounts');
        if (filterCondition) queryBuilder.where(filterCondition);
      }

      const [accountResults, countResult] = await Promise.all([
        queryBuilder.limit(limit).offset(offset).orderBy(desc(accountsTable.createdAt)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(accountsTable)
          .where(filterGroup ? buildFilterQuery(filterGroup, 'accounts') : undefined),
      ]);

      const { toUnifiedAccountRecord } = await import('@shared/unified-records');
      const unifiedAccounts = accountResults.map(({ account, contactCount }) =>
        toUnifiedAccountRecord(account, { contactCount: Number(contactCount) })
      );

      res.json({
        data: unifiedAccounts,
        pagination: {
          total: Number(countResult[0]?.count || 0),
          limit,
          offset,
          hasMore: offset + limit < Number(countResult[0]?.count || 0),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch accounts" });
    }
  });

  // ==================== CONTACTS ====================

  app.get("/api/contacts", requireAuth, async (req, res) => {
    try {
      let filters = undefined;

      // Support new FilterValues format
      if (req.query.filterValues) {
        try {
          const filterValues = JSON.parse(req.query.filterValues as string);
          // Convert FilterValues to FilterGroup format for backward compatibility
          filters = convertFilterValuesToFilterGroup(filterValues);
        } catch (e) {
          return res.status(400).json({ message: "Invalid filterValues format" });
        }
      }
      // Fallback to legacy filter format
      else if (req.query.filters) {
        try {
          filters = JSON.parse(req.query.filters as string);
        } catch (e) {
          return res.status(400).json({ message: "Invalid filters format" });
        }
      }

      // Add default limit of 1000 to prevent loading all contacts at once
      // Can be overridden with ?limit=5000 or ?limit=0 for no limit
      let limit: number | undefined = 1000; // Default to 1000 records
      if (req.query.limit !== undefined) {
        if (req.query.limit === '0') {
          limit = undefined; // No limit for exports
        } else {
          const parsedLimit = parseInt(req.query.limit as string);
          if (isNaN(parsedLimit) || parsedLimit < 0) {
            return res.status(400).json({ message: "Invalid limit parameter. Must be a positive number or 0." });
          }
          limit = parsedLimit;
        }
      }

      const contacts = await storage.getContacts(filters, limit);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.get("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contact" });
    }
  });

  // Batch import: Process multiple contacts with accounts in one request (for large file optimization)
  app.post("/api/contacts/batch-import", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const { records, listId } = req.body; // Array of { contact, account } objects + optional list ID

      if (!Array.isArray(records)) {
        return res.status(400).json({ message: "Records must be an array" });
      }

      const results = {
        success: 0,
        created: 0,
        updated: 0,
        failed: 0,
        errors: [] as Array<{ index: number; error: string }>,
      };

      // Step 1: Collect all unique domains and normalize them
      const domainMap = new Map<string, any>();
      records.forEach(record => {
        if (record.account?.domain) {
          const normalizedDomain = record.account.domain.trim().toLowerCase();
          if (!domainMap.has(normalizedDomain)) {
            domainMap.set(normalizedDomain, { ...record.account, domain: normalizedDomain });
          }
        }
      });

      // Step 2: Fetch all existing accounts by domains in one query
      const domains = Array.from(domainMap.keys());
      const existingAccounts = await storage.getAccountsByDomains(domains);
      const accountsByDomain = new Map(existingAccounts.map(acc => [acc.domain!, acc]));

      // Step 3: Create new accounts in bulk for domains that don't exist
      const newAccountsToCreate: any[] = [];
      for (const [domain, accountData] of domainMap) {
        if (!accountsByDomain.has(domain) && (accountData.name || accountData.domain)) {
          try {
            const validatedAccount = insertAccountSchema.parse(accountData);
            newAccountsToCreate.push(validatedAccount);
          } catch (error) {
            // Skip invalid account data
          }
        }
      }

      let newAccounts: any[] = [];
      if (newAccountsToCreate.length > 0) {
        newAccounts = await storage.createAccountsBulk(newAccountsToCreate);
        newAccounts.forEach(acc => accountsByDomain.set(acc.domain!, acc));
      }

      // Step 4: Collect all emails and phones for bulk suppression checks
      const emails = records.map(r => r.contact?.email).filter(Boolean);
      const phones = records.map(r => r.contact?.directPhone || r.contact?.mobilePhone).filter(Boolean)
        .map(phone => normalizePhoneE164(phone)).filter(Boolean);

      const suppressedEmails = await storage.checkEmailSuppressionBulk(emails);
      const suppressedPhones = await storage.checkPhoneSuppressionBulk(phones as string[]);

      // Step 5: Fetch existing contacts by emails for deduplication
      const contactsToProcess: any[] = [];
      for (let i = 0; i < records.length; i++) {
        try {
          const { contact: contactData, account: accountData } = records[i];

          // Validate contact data
          const validatedContact = insertContactSchema.parse(contactData);

          // Normalize phone numbers
          if (validatedContact.directPhone) {
            const normalized = normalizePhoneE164(validatedContact.directPhone, validatedContact.country || undefined);
            validatedContact.directPhoneE164 = normalized;
          }
          if (validatedContact.mobilePhone) {
            const normalized = normalizePhoneE164(validatedContact.mobilePhone, validatedContact.country || undefined);
            validatedContact.mobilePhoneE164 = normalized;
          }

          // Check email suppression
          if (validatedContact.email && suppressedEmails.has(validatedContact.email.toLowerCase())) {
            results.failed++;
            results.errors.push({ index: i, error: "Email is on suppression list" });
            continue;
          }

          // Check phone suppression if provided
          if (validatedContact.directPhoneE164 && suppressedPhones.has(validatedContact.directPhoneE164)) {
            results.failed++;
            results.errors.push({ index: i, error: "Phone is on DNC list" });
            continue;
          }

          // Link contact to account if domain exists
          if (accountData?.domain) {
            const normalizedDomain = accountData.domain.trim().toLowerCase();
            const account = accountsByDomain.get(normalizedDomain);
            if (account) {
              validatedContact.accountId = account.id;
            }
          }

          contactsToProcess.push({ validated: validatedContact, originalIndex: i });
        } catch (error) {
          results.failed++;
          results.errors.push({
            index: i,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      // Step 6: Check for existing contacts by email and separate create vs update
      const emailsToCheck = contactsToProcess.map(c => c.validated.email);
      const existingContacts = await storage.getContactsByEmails(emailsToCheck);
      const contactsByEmail = new Map(existingContacts.map(c => [c.emailNormalized!, c]));

      const contactsToCreate: any[] = [];
      const contactsToUpdate: Array<{ id: string; data: any; originalIndex: number }> = [];

      for (const { validated, originalIndex } of contactsToProcess) {
        const normalizedEmail = validated.email.toLowerCase().trim();

        // CRITICAL: Populate emailNormalized field for deduplication
        validated.emailNormalized = normalizedEmail;

        const existingContact = contactsByEmail.get(normalizedEmail);

        if (existingContact) {
          // Contact exists - update it
          contactsToUpdate.push({ id: existingContact.id, data: validated, originalIndex });
        } else {
          // Contact doesn't exist - create it
          contactsToCreate.push({ contact: validated, originalIndex });
        }
      }

      // Step 7: Create new contacts in bulk
      let createdCount = 0;
      let updatedCount = 0;

      if (contactsToCreate.length > 0) {
        try {
          await storage.createContactsBulk(contactsToCreate.map(c => c.contact));
          createdCount = contactsToCreate.length;
        } catch (error) {
          // If bulk insert fails, fall back to individual inserts to identify specific failures
          for (const { contact, originalIndex } of contactsToCreate) {
            try {
              await storage.createContact(contact);
              createdCount++;
            } catch (err) {
              results.failed++;
              results.errors.push({
                index: originalIndex,
                error: err instanceof Error ? err.message : "Unknown error"
              });
            }
          }
        }
      }

      // Step 8: Update existing contacts individually
      for (const { id, data, originalIndex } of contactsToUpdate) {
        try {
          await storage.updateContact(id, data);
          updatedCount++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            index: originalIndex,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      results.success = createdCount + updatedCount;
      results.created = createdCount;
      results.updated = updatedCount;

      // Step 9: Add contacts to list if listId is provided
      if (listId && results.success > 0) {
        try {
          // Collect all contact IDs (newly created and updated)
          const allProcessedEmails = contactsToProcess.map(c => c.validated.email.toLowerCase().trim());
          const processedContacts = await storage.getContactsByEmails(allProcessedEmails);
          const contactIds = processedContacts.map(c => c.id);

          if (contactIds.length > 0) {
            // Get the current list and add contacts to it
            const list = await storage.getList(listId);
            if (list) {
              const existingIds = new Set(list.recordIds || []);
              const newIds = contactIds.filter((id: string) => !existingIds.has(id));
              
              if (newIds.length > 0) {
                const updatedRecordIds = [...(list.recordIds || []), ...newIds];
                await storage.updateList(listId, { recordIds: updatedRecordIds });
                console.log(`[Batch Import] Added ${newIds.length} contacts to list ${listId}`);
              }
            }
          }
        } catch (listError) {
          console.error('Failed to add contacts to list:', listError);
          // Don't fail the import if list update fails
        }
      }

      invalidateDashboardCache();
      res.status(200).json(results);
    } catch (error) {
      console.error("Batch import error:", error);
      res.status(500).json({ message: "Failed to process batch import" });
    }
  });

  // Unified import: Contact + Account in one request
  app.post("/api/contacts/import-with-account", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const { contact: contactData, account: accountData } = req.body;

      // Validate contact data
      const validatedContact = insertContactSchema.parse(contactData);

      // Normalize phone numbers
      if (validatedContact.directPhone) {
        const normalized = normalizePhoneE164(validatedContact.directPhone, validatedContact.country || undefined);
        validatedContact.directPhoneE164 = normalized;
      }
      if (validatedContact.mobilePhone) {
        const normalized = normalizePhoneE164(validatedContact.mobilePhone, validatedContact.country || undefined);
        validatedContact.mobilePhoneE164 = normalized;
      }

      // Check email suppression
      if (await storage.isEmailSuppressed(validatedContact.email)) {
        return res.status(400).json({ message: "Email is on suppression list" });
      }

      // Check phone suppression if provided
      if (validatedContact.directPhoneE164 && await storage.isPhoneSuppressed(validatedContact.directPhoneE164)) {
        return res.status(400).json({ message: "Phone is on DNC list" });
      }

      let account;
      let accountCreated = false;

      // Normalize domain (trim and lowercase) to prevent duplicates from casing
      if (accountData.domain) {
        accountData.domain = accountData.domain.trim().toLowerCase();
      }

      // Try to find existing account by domain first
      if (accountData.domain) {
        account = await storage.getAccountByDomain(accountData.domain);
      }

      // If not found and we have account data, create new account
      if (!account && (accountData.name || accountData.domain)) {
        const validatedAccount = insertAccountSchema.parse(accountData);
        account = await storage.createAccount(validatedAccount);
        accountCreated = true;
      }

      // Link contact to account if found/created
      if (account) {
        validatedContact.accountId = account.id;
      }

      // Create contact
      const contact = await storage.createContact(validatedContact);

      invalidateDashboardCache();
      res.status(201).json({
        contact,
        account,
        accountCreated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error("Unified import error:", error);
      res.status(500).json({ message: "Failed to import contact with account" });
    }
  });

  // Create contact
  app.post('/api/contacts', requireAuth, async (req, res) => {

    try {
      const contactData = insertContactSchema.parse(req.body);

      // Normalize email for deduplication
      if (contactData.email) {
        contactData.emailNormalized = contactData.email.toLowerCase().trim();
      }

      // Normalize phone numbers
      if (contactData.directPhone) {
        const normalized = normalizePhoneE164(contactData.directPhone, contactData.country || undefined);
        contactData.directPhoneE164 = normalized;
      }
      if (contactData.mobilePhone) {
        const normalized = normalizePhoneE164(contactData.mobilePhone, contactData.country || undefined);
        contactData.mobilePhoneE164 = normalized;
      }

      // Check email suppression
      if (contactData.email && await storage.isEmailSuppressed(contactData.email)) {
        return res.status(400).json({ message: "Email is on suppression list" });
      }

      // Check phone suppression if provided
      if (contactData.directPhoneE164 && await storage.isPhoneSuppressed(contactData.directPhoneE164)) {
        return res.status(400).json({ message: "Phone is on DNC list" });
      }

      const newContact = await storage.createContact(contactData);
      invalidateDashboardCache();
      res.json(newContact);
    } catch (error: any) {
      console.error('Error creating contact:', error);
      res.status(400).send(error.message);
    }
  });

  // Update contact
  app.patch('/api/contacts/:id', requireAuth, async (req, res) => {

    try {
      const { id } = req.params;
      const updateData = req.body;

      // Normalize phone numbers if provided
      if (updateData.directPhone) {
        const contact = await storage.getContact(id);
        const normalized = normalizePhoneE164(updateData.directPhone, contact?.country || undefined);
        updateData.directPhoneE164 = normalized;
      }
      if (updateData.mobilePhone) {
        const contact = await storage.getContact(id);
        const normalized = normalizePhoneE164(updateData.mobilePhone, contact?.country || undefined);
        updateData.mobilePhoneE164 = normalized;
      }

      const updatedContact = await storage.updateContact(id, updateData);
      if (!updatedContact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json(updatedContact);
    } catch (error: any) {
      console.error('Error updating contact:', error);
      res.status(400).send(error.message);
    }
  });

  app.delete("/api/contacts/:id", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      await storage.deleteContact(req.params.id);
      invalidateDashboardCache();
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // ==================== CUSTOM FIELD DEFINITIONS ====================

  // Get all custom field definitions
  app.get('/api/custom-fields', async (req, res) => {
    try {
      const fields = await db.select()
        .from(customFieldDefinitions)
        .where(eq(customFieldDefinitions.active, true))
        .orderBy(customFieldDefinitions.displayOrder);

      res.json(fields);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create custom field definition
  app.post('/api/custom-fields', async (req, res) => {
    try {
      const data = insertCustomFieldDefinitionSchema.parse(req.body);

      // Check if field key already exists for this entity type
      const existing = await db.select()
        .from(customFieldDefinitions)
        .where(
          and(
            eq(customFieldDefinitions.entityType, data.entityType),
            eq(customFieldDefinitions.fieldKey, data.fieldKey)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return res.status(400).json({ error: 'Field key already exists for this entity type' });
      }

      const [field] = await db.insert(customFieldDefinitions)
        .values({
          ...data,
          createdBy: req.user?.userId,
        })
        .returning();

      res.json(field);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update custom field definition
  app.patch('/api/custom-fields/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const data = updateCustomFieldDefinitionSchema.parse(req.body);

      const [field] = await db.update(customFieldDefinitions)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(customFieldDefinitions.id, id))
        .returning();

      if (!field) {
        return res.status(404).json({ error: 'Custom field not found' });
      }

      res.json(field);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete (deactivate) custom field definition
  app.delete('/api/custom-fields/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const [field] = await db.update(customFieldDefinitions)
        .set({
          active: false,
          updatedAt: new Date(),
        })
        .where(eq(customFieldDefinitions.id, id))
        .returning();

      if (!field) {
        return res.status(404).json({ error: 'Custom field not found' });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-register custom fields from CSV upload
  app.post('/api/custom-fields/auto-register', async (req, res) => {
    try {
      const { entityType, fieldKeys } = req.body;

      if (!entityType || !fieldKeys || !Array.isArray(fieldKeys)) {
        return res.status(400).json({ error: 'entityType and fieldKeys array are required' });
      }

      if (!['account', 'contact'].includes(entityType)) {
        return res.status(400).json({ error: 'entityType must be "account" or "contact"' });
      }

      // Get existing field definitions for this entity type
      const existing = await db.select()
        .from(customFieldDefinitions)
        .where(eq(customFieldDefinitions.entityType, entityType as 'account' | 'contact'));

      const existingKeys = new Set(existing.map(f => f.fieldKey));
      const newFields = fieldKeys.filter((key: string) => !existingKeys.has(key));

      // Create definitions for new fields
      const created = [];
      for (const fieldKey of newFields) {
        const [field] = await db.insert(customFieldDefinitions)
          .values({
            entityType: entityType as 'account' | 'contact',
            fieldKey,
            displayLabel: fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Convert snake_case to Title Case
            fieldType: 'text', // Default to text, can be changed later
            description: `Auto-discovered custom field from CSV upload`,
            placeholder: null,
            displayOrder: 999 + created.length, // Put new fields at the end
            active: true,
            createdBy: req.user?.userId || null,
          })
          .returning();

        created.push(field);
      }

      res.json({
        registered: created.length,
        skipped: fieldKeys.length - created.length,
        fields: created
      });
    } catch (error: any) {
      console.error('Error auto-registering custom fields:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-linking endpoints
  app.get("/api/accounts/:id/contacts", requireAuth, async (req, res) => {
    try {
      const contacts = await storage.getContactsByAccountId(req.params.id);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch account contacts" });
    }
  });

  app.post("/api/contacts/auto-link", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      // Get all contacts without account_id
      const contacts = await storage.getContacts();
      const unlinkedContacts = contacts.filter(c => !c.accountId);

      let linkedCount = 0;
      let failedCount = 0;

      for (const contact of unlinkedContacts) {
        try {
          // Extract domain from email
          const emailDomain = contact.email.split('@')[1]?.toLowerCase();
          if (!emailDomain) continue;

          // Find matching account by domain
          const accounts = await storage.getAccounts();
          const matchingAccount = accounts.find(a =>
            a.domain?.toLowerCase() === emailDomain
          );

          if (matchingAccount) {
            await storage.updateContact(contact.id, { accountId: matchingAccount.id });
            linkedCount++;
          }
        } catch (err) {
          failedCount++;
        }
      }

      res.json({
        message: "Auto-linking complete",
        totalProcessed: unlinkedContacts.length,
        linked: linkedCount,
        failed: failedCount
      });
    } catch (error) {
      res.status(500).json({ message: "Auto-linking failed" });
    }
  });

  app.post("/api/contacts/:id/link-account", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const { accountId } = req.body;
      if (!accountId) {
        return res.status(400).json({ message: "accountId is required" });
      }

      const contact = await storage.updateContact(req.params.id, { accountId });
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      res.json(contact);
    } catch (error) {
      res.status(500).json({ message: "Failed to link contact to account" });
    }
  });

  // Upsert endpoints for deduplication
  app.post("/api/contacts/upsert", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const { email, title, sourceSystem, sourceRecordId, sourceUpdatedAt, ...contactData } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required for upsert" });
      }

      // Check email suppression
      if (await storage.isEmailSuppressed(email)) {
        return res.status(400).json({ message: "Email is on suppression list" });
      }

      // Normalize phone numbers
      if (contactData.directPhone) {
        const normalized = normalizePhoneE164(contactData.directPhone, contactData.country || undefined);
        contactData.directPhoneE164 = normalized;
      }
      if (contactData.mobilePhone) {
        const normalized = normalizePhoneE164(contactData.mobilePhone, contactData.country || undefined);
        contactData.mobilePhoneE164 = normalized;
      }

      // Check phone suppression if provided
      if (contactData.directPhoneE164 && await storage.isPhoneSuppressed(contactData.directPhoneE164)) {
        return res.status(400).json({ message: "Phone is on DNC list" });
      }

      // Map 'title' to 'jobTitle' for database compatibility
      if (title !== undefined) {
        contactData.jobTitle = title;
      }

      const result = await storage.upsertContact(
        { email, ...contactData },
        {
          sourceSystem,
          sourceRecordId,
          sourceUpdatedAt: sourceUpdatedAt ? new Date(sourceUpdatedAt) : undefined,
          actorId: req.user!.userId
        }
      );

      res.status(result.action === 'created' ? 201 : 200).json({
        entity: result.contact,
        action: result.action
      });
    } catch (error) {
      console.error('Upsert contact error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to upsert contact", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/accounts/upsert", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const { name, revenue, sourceSystem, sourceRecordId, sourceUpdatedAt, ...accountData } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Name is required for upsert" });
      }

      // Normalize phone number
      if (accountData.mainPhone) {
        const normalized = normalizePhoneE164(accountData.mainPhone, accountData.hqCountry || undefined);
        accountData.mainPhoneE164 = normalized;
      }

      // Map 'revenue' to 'annualRevenue' for database compatibility
      if (revenue !== undefined) {
        accountData.annualRevenue = revenue;
      }

      const result = await storage.upsertAccount(
        { name, ...accountData },
        {
          sourceSystem,
          sourceRecordId,
          sourceUpdatedAt: sourceUpdatedAt ? new Date(sourceUpdatedAt) : undefined,
          actorId: req.user!.userId
        }
      );

      res.status(result.action === 'created' ? 201 : 200).json({
        entity: result.account,
        action: result.action
      });
    } catch (error) {
      console.error('Upsert account error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to upsert account", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Detect duplicate contacts by email
  app.get("/api/contacts/duplicates", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const contacts = await storage.getContacts();
      const emailGroups = new Map<string, any[]>();

      // Group contacts by normalized email
      contacts.forEach(contact => {
        if (contact.emailNormalized) {
          const email = contact.emailNormalized.toLowerCase();
          if (!emailGroups.has(email)) {
            emailGroups.set(email, []);
          }
          emailGroups.get(email)!.push(contact);
        }
      });

      // Find groups with duplicates
      const duplicates = Array.from(emailGroups.entries())
        .filter(([_, group]) => group.length > 1)
        .map(([email, group]) => ({
          email,
          count: group.length,
          contacts: group.sort((a, b) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
          )
        }));

      res.json({
        totalDuplicateGroups: duplicates.length,
        totalDuplicateContacts: duplicates.reduce((sum, d) => sum + d.count - 1, 0),
        duplicates
      });
    } catch (error) {
      console.error('Error detecting duplicate contacts:', error);
      res.status(500).json({ message: "Failed to detect duplicate contacts" });
    }
  });

  // Batch reformat all phone numbers to fix inconsistent E.164 formatting
  app.post("/api/admin/reformat-all-phones", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      console.log('[BATCH REFORMAT] Starting phone number reformatting for all contacts and accounts...');

      let contactsUpdated = 0;
      let accountsUpdated = 0;
      const batchSize = 500;
      let offset = 0;

      // Process contacts in batches
      console.log('[BATCH REFORMAT] Processing contacts...');
      while (true) {
        const contacts = await db.select().from(contactsTable).limit(batchSize).offset(offset);
        if (contacts.length === 0) break;

        for (const contact of contacts) {
          let needsUpdate = false;
          const updates: any = {};

          // Reformat directPhone if exists
          if (contact.directPhone) {
            const reformatted = normalizePhoneE164(contact.directPhone, contact.country || undefined);
            if (reformatted && reformatted !== contact.directPhoneE164) {
              updates.directPhoneE164 = reformatted;
              needsUpdate = true;
            }
          }

          // Reformat mobilePhone if exists
          if (contact.mobilePhone) {
            const reformatted = normalizePhoneE164(contact.mobilePhone, contact.country || undefined);
            if (reformatted && reformatted !== contact.mobilePhoneE164) {
              updates.mobilePhoneE164 = reformatted;
              needsUpdate = true;
            }
          }

          // Update if needed
          if (needsUpdate) {
            await db.update(contactsTable)
              .set(updates)
              .where(eq(contactsTable.id, contact.id));
            contactsUpdated++;
          }
        }

        offset += batchSize;
        console.log(`[BATCH REFORMAT] Processed ${offset} contacts, updated ${contactsUpdated} so far...`);
      }

      // Process accounts in batches
      console.log('[BATCH REFORMAT] Processing accounts...');
      offset = 0;
      while (true) {
        const accounts = await db.select().from(accountsTable).limit(batchSize).offset(offset);
        if (accounts.length === 0) break;

        for (const account of accounts) {
          let needsUpdate = false;
          const updates: any = {};

          // Reformat mainPhone if exists
          if (account.mainPhone) {
            const reformatted = normalizePhoneE164(account.mainPhone, account.hqCountry || undefined);
            if (reformatted && reformatted !== account.mainPhoneE164) {
              updates.mainPhoneE164 = reformatted;
              needsUpdate = true;
            }
          }

          // Update if needed
          if (needsUpdate) {
            await db.update(accountsTable)
              .set(updates)
              .where(eq(accountsTable.id, account.id));
            accountsUpdated++;
          }
        }

        offset += batchSize;
        console.log(`[BATCH REFORMAT] Processed ${offset} accounts, updated ${accountsUpdated} so far...`);
      }

      console.log(`[BATCH REFORMAT] ✅ Complete! Updated ${contactsUpdated} contacts and ${accountsUpdated} accounts`);

      res.json({
        success: true,
        contactsUpdated,
        accountsUpdated,
        message: `Successfully reformatted ${contactsUpdated} contact phone numbers and ${accountsUpdated} account phone numbers`
      });
    } catch (error) {
      console.error('[BATCH REFORMAT] Error:', error);
      res.status(500).json({ message: "Failed to reformat phone numbers", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Detect duplicate accounts by domain
  app.get("/api/accounts/duplicates", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const accounts = await storage.getAccounts();
      const domainGroups = new Map<string, any[]>();

      // Group accounts by normalized domain
      accounts.forEach(account => {
        if (account.domainNormalized) {
          const domain = account.domainNormalized.toLowerCase();
          if (!domainGroups.has(domain)) {
            domainGroups.set(domain, []);
          }
          domainGroups.get(domain)!.push(account);
        }
      });

      // Find groups with duplicates
      const duplicates = Array.from(domainGroups.entries())
        .filter(([_, group]) => group.length > 1)
        .map(([domain, group]) => ({
          domain,
          count: group.length,
          accounts: group.sort((a, b) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
          )
        }));

      res.json({
        totalDuplicateGroups: duplicates.length,
        totalDuplicateAccounts: duplicates.reduce((sum, d) => sum + d.count - 1, 0),
        duplicates
      });
    } catch (error) {
      console.error('Error detecting duplicate accounts:', error);
      res.status(500).json({ message: "Failed to detect duplicate accounts" });
    }
  });

  // Data completeness diagnostics for accounts
  app.get("/api/accounts/data-completeness", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const accounts = await storage.getAccounts();

      if (accounts.length === 0) {
        return res.json({
          totalAccounts: 0,
          message: "No accounts to analyze"
        });
      }

      // Define key fields to analyze
      const keyFields = [
        'domain', 'industryStandardized', 'employeesSizeRange', 'annualRevenue',
        'hqCity', 'hqState', 'hqPostalCode', 'hqCountry', 'hqStreet1',
        'mainPhone', 'yearFounded', 'description', 'linkedinUrl',
        'companyLocation', 'sicCode', 'naicsCode'
      ];

      const fieldStats: Record<string, { populated: number; blank: number; percentage: number }> = {};

      // Calculate completeness for each field
      keyFields.forEach(field => {
        const populated = accounts.filter(account => {
          const value = (account as any)[field];
          return value !== null && value !== undefined && value !== '';
        }).length;

        const blank = accounts.length - populated;
        const percentage = (populated / accounts.length) * 100;

        fieldStats[field] = {
          populated,
          blank,
          percentage: Math.round(percentage * 10) / 10
        };
      });

      // Sort fields by completeness (least complete first)
      const sortedFields = Object.entries(fieldStats)
        .sort(([, a], [, b]) => a.percentage - b.percentage)
        .map(([field, stats]) => ({ field, ...stats }));

      // Overall completeness score
      const totalFields = keyFields.length;
      const overallCompleteness = sortedFields.reduce((sum, { percentage }) => sum + percentage, 0) / totalFields;

      // Find accounts with most/least complete data
      const accountCompleteness = accounts.map(account => {
        const fieldsPopulated = keyFields.filter(field => {
          const value = (account as any)[field];
          return value !== null && value !== undefined && value !== '';
        }).length;

        return {
          id: account.id,
          name: account.name,
          domain: account.domain,
          fieldsPopulated,
          totalFields,
          completenessPercentage: Math.round((fieldsPopulated / totalFields) * 100)
        };
      }).sort((a, b) => b.completenessPercentage - a.completenessPercentage);

      res.json({
        totalAccounts: accounts.length,
        overallCompleteness: Math.round(overallCompleteness * 10) / 10,
        fieldStats: sortedFields,
        mostCompleteAccounts: accountCompleteness.slice(0, 10),
        leastCompleteAccounts: accountCompleteness.slice(-10).reverse()
      });
    } catch (error) {
      console.error('Error analyzing account data completeness:', error);
      res.status(500).json({ message: "Failed to analyze data completeness" });
    }
  });

  // Data completeness diagnostics for contacts
  app.get("/api/contacts/data-completeness", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const contacts = await storage.getContacts();

      if (contacts.length === 0) {
        return res.json({
          totalContacts: 0,
          message: "No contacts to analyze"
        });
      }

      // Define key fields to analyze
      const keyFields = [
        'firstName', 'lastName', 'jobTitle', 'department', 'seniorityLevel',
        'directPhone', 'mobilePhone', 'city', 'state', 'postalCode', 'country',
        'linkedinUrl', 'accountId', 'address', 'timezone'
      ];

      const fieldStats: Record<string, { populated: number; blank: number; percentage: number }> = {};

      // Calculate completeness for each field
      keyFields.forEach(field => {
        const populated = contacts.filter(contact => {
          const value = (contact as any)[field];
          return value !== null && value !== undefined && value !== '';
        }).length;

        const blank = contacts.length - populated;
        const percentage = (populated / contacts.length) * 100;

        fieldStats[field] = {
          populated,
          blank,
          percentage: Math.round(percentage * 10) / 10
        };
      });

      // Sort fields by completeness (least complete first)
      const sortedFields = Object.entries(fieldStats)
        .sort(([, a], [, b]) => a.percentage - b.percentage)
        .map(([field, stats]) => ({ field, ...stats }));

      // Overall completeness score
      const totalFields = keyFields.length;
      const overallCompleteness = sortedFields.reduce((sum, { percentage }) => sum + percentage, 0) / totalFields;

      // Find contacts with most/least complete data
      const contactCompleteness = contacts.map(contact => {
        const fieldsPopulated = keyFields.filter(field => {
          const value = (contact as any)[field];
          return value !== null && value !== undefined && value !== '';
        }).length;

        const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();

        return {
          id: contact.id,
          name: fullName || 'No name',
          email: contact.email,
          fieldsPopulated,
          totalFields,
          completenessPercentage: Math.round((fieldsPopulated / totalFields) * 100)
        };
      }).sort((a, b) => b.completenessPercentage - a.completenessPercentage);

      res.json({
        totalContacts: contacts.length,
        overallCompleteness: Math.round(overallCompleteness * 10) / 10,
        fieldStats: sortedFields,
        mostCompleteContacts: contactCompleteness.slice(0, 10),
        leastCompleteContacts: contactCompleteness.slice(-10).reverse()
      });
    } catch (error) {
      console.error('Error analyzing contact data completeness:', error);
      res.status(500).json({ message: "Failed to analyze data completeness" });
    }
  });

  // ==================== SEGMENTS ====================

  app.get("/api/segments", requireAuth, async (req, res) => {
    try {
      const segments = await storage.getSegments();
      res.json(segments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch segments" });
    }
  });

  app.get("/api/segments/:id", requireAuth, async (req, res) => {
    try {
      const segment = await storage.getSegment(req.params.id);
      if (!segment) {
        return res.status(404).json({ message: "Segment not found" });
      }
      res.json(segment);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch segment" });
    }
  });

  // Get membership info for a contact or account
  app.get("/api/:entityType/:id/membership", requireAuth, async (req, res) => {
    try {
      const { entityType, id } = req.params;

      if (entityType !== 'contacts' && entityType !== 'accounts') {
        return res.status(400).json({ message: "Invalid entity type" });
      }

      const normalizedEntityType = entityType === 'contacts' ? 'contact' : 'account';

      // Get all lists for this entity type that contain this ID
      const allLists = await storage.getLists();
      const listsContainingEntity = allLists.filter(list =>
        list.entityType === normalizedEntityType &&
        list.recordIds &&
        list.recordIds.includes(id)
      );

      // Get all segments for this entity type
      const allSegments = await storage.getSegments();
      const relevantSegments = allSegments.filter(seg =>
        seg.entityType === normalizedEntityType &&
        seg.isActive
      );

      // Check which segments this entity matches
      const segmentsContainingEntity = [];
      for (const segment of relevantSegments) {
        if (segment.definitionJson) {
          const preview = await storage.previewSegment(
            normalizedEntityType,
            segment.definitionJson
          );
          if (preview.sampleIds.includes(id)) {
            segmentsContainingEntity.push({
              id: segment.id,
              name: segment.name,
              isActive: segment.isActive || false
            });
          }
        }
      }

      res.json({
        lists: listsContainingEntity.map(list => ({
          id: list.id,
          name: list.name,
          sourceType: list.sourceType || 'manual_upload'
        })),
        segments: segmentsContainingEntity
      });
    } catch (error) {
      console.error('Get membership error:', error);
      res.status(500).json({ message: "Failed to fetch membership info" });
    }
  });

  app.post("/api/segments", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      const validated = insertSegmentSchema.parse(req.body);
      const segment = await storage.createSegment(validated);

      // Calculate and update record count
      if (segment.definitionJson) {
        const preview = await storage.previewSegment(
          segment.entityType || 'contact',
          segment.definitionJson
        );
        await storage.updateSegment(segment.id, {
          recordCountCache: preview.count,
          lastRefreshedAt: new Date()
        });
        segment.recordCountCache = preview.count;
        segment.lastRefreshedAt = new Date();
      }

      res.status(201).json(segment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create segment" });
    }
  });

  // Added endpoint to get segment members
  app.get("/api/segments/:id/members", requireAuth, async (req, res) => {
    try {
      const members = await storage.getSegmentMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error('Get segment members error:', error);
      res.status(500).json({ message: "Failed to get segment members" });
    }
  });

  app.delete("/api/segments/:id", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      await storage.deleteSegment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete segment" });
    }
  });

  app.post("/api/segments/preview", requireAuth, async (req, res) => {
    try {
      const { entityType, definitionJson } = req.body;
      if (!entityType || !definitionJson) {
        return res.status(400).json({ message: "Missing entityType or definitionJson" });
      }
      const result = await storage.previewSegment(entityType, definitionJson);
      res.json(result);
    } catch (error) {
      console.error('Segment preview error:', error);
      res.status(500).json({ message: "Failed to preview segment", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/segments/:id/convert-to-list", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ message: "List name is required" });
      }
      const list = await storage.convertSegmentToList(req.params.id, name, description);
      res.status(201).json(list);
    } catch (error) {
      console.error('Convert segment to list error:', error);
      res.status(500).json({ message: "Failed to convert segment to list", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ==================== LISTS ====================

  app.get("/api/lists", requireAuth, async (req, res) => {
    try {
      const lists = await storage.getLists();
      res.json(lists);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch lists" });
    }
  });

  // Added endpoint to get a specific list by ID
  app.get("/api/lists/:id", requireAuth, async (req, res) => {
    try {
      const list = await storage.getListById(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "List not found" });
      }
      res.json(list);
    } catch (error) {
      console.error('Get list error:', error);
      res.status(500).json({ message: "Failed to get list" });
    }
  });

  // Added endpoint to get list members
  app.get("/api/lists/:id/members", requireAuth, async (req, res) => {
    try {
      const members = await storage.getListMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error('Get list members error:', error);
      res.status(500).json({ message: "Failed to get list members" });
    }
  });

  app.post("/api/lists", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      const validated = insertListSchema.parse(req.body);
      const list = await storage.createList(validated);
      res.status(201).json(list);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create list" });
    }
  });

  app.delete("/api/lists/:id", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      await storage.deleteList(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Delete list error:', error);
      res.status(500).json({ message: "Failed to delete list" });
    }
  });

  // Add contacts to list (direct - for small batches)
  app.post("/api/lists/:id/contacts", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      const { contactIds } = req.body;
      if (!Array.isArray(contactIds)) {
        return res.status(400).json({ message: "contactIds must be an array" });
      }

      const list = await storage.getList(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "List not found" });
      }

      if (list.entityType !== 'contact') {
        return res.status(400).json({ message: "This list is not for contacts" });
      }

      // Merge with existing IDs and deduplicate
      const existingIds = list.recordIds || [];
      const updatedIds = Array.from(new Set([...existingIds, ...contactIds]));
      const updated = await storage.updateList(req.params.id, { recordIds: updatedIds });

      res.json(updated);
    } catch (error) {
      console.error('Add contacts to list error:', error);
      res.status(500).json({ message: "Failed to add contacts to list" });
    }
  });

  // Add contacts to list in bulk using filter criteria (background job for large datasets)
  app.post("/api/lists/:id/contacts/bulk", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      const { filterCriteria } = req.body;

      if (!filterCriteria) {
        return res.status(400).json({ message: "filterCriteria is required" });
      }

      const list = await storage.getList(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "List not found" });
      }

      if (list.entityType !== 'contact') {
        return res.status(400).json({ message: "This list is not for contacts" });
      }

      // Import bulk list queue functions
      const { addBulkListJob, bulkListQueue } = await import('./lib/bulk-list-queue');

      // Check if queue is available - if not, process directly for small datasets
      if (!bulkListQueue) {
        console.warn('[Bulk List] Queue not available - processing directly');

        // Build where clause and count
        const { buildWhereClauseForFilters } = await import('./workers/bulk-list-worker');
        const whereClause = buildWhereClauseForFilters(filterCriteria);

        // Get count first
        const countQuery = db.select({ count: sql<number>`count(*)` })
          .from(contacts);

        if (whereClause) {
          countQuery.where(whereClause);
        }

        const [{ count }] = await countQuery;

        if (count > 5000) {
          return res.status(503).json({
            message: "Background job queue not available and dataset too large. Please contact support or try with smaller selection."
          });
        }

        // Process directly for small datasets
        const matchedContacts = await db.select({ id: contacts.id })
          .from(contacts)
          .where(whereClause || sql`1=1`)
          .limit(5000);

        const contactIds = matchedContacts.map(c => c.id);
        const existingIds = list.recordIds || [];
        const mergedIds = Array.from(new Set([...existingIds, ...contactIds]));
        const addedCount = mergedIds.length - existingIds.length;

        await storage.updateList(req.params.id, { recordIds: mergedIds });

        return res.json({
          useBackgroundJob: false,
          message: "Contacts added successfully",
          totalAdded: addedCount,
          totalProcessed: contactIds.length
        });
      }

      // Add job to queue for large datasets
      const jobId = await addBulkListJob({
        listId: req.params.id,
        entityType: 'contact',
        filterCriteria,
        userId: req.user!.userId,
      });

      res.json({
        jobId,
        useBackgroundJob: true,
        message: "Bulk operation started - this may take a few moments",
        status: "processing"
      });
    } catch (error) {
      console.error('Bulk add contacts to list error:', error);
      res.status(500).json({ message: "Failed to start bulk operation" });
    }
  });

  // Add accounts to list
  app.post("/api/lists/:id/accounts", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      const { accountIds } = req.body;
      if (!Array.isArray(accountIds)) {
        return res.status(400).json({ message: "accountIds must be an array" });
      }

      const list = await storage.getList(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "List not found" });
      }

      if (list.entityType !== 'account') {
        return res.status(400).json({ message: "This list is not for accounts" });
      }

      // Merge with existing IDs and deduplicate
      const existingIds = list.recordIds || [];
      const updatedIds = Array.from(new Set([...existingIds, ...accountIds]));
      const updated = await storage.updateList(req.params.id, { recordIds: updatedIds });

      res.json(updated);
    } catch (error) {
      console.error('Add accounts to list error:', error);
      res.status(500).json({ message: "Failed to add accounts to list" });
    }
  });

  app.post("/api/lists/:id/export", requireAuth, requireRole('admin', 'campaign_manager', 'quality_analyst'), async (req, res) => {
    try {
      const { format = 'csv' } = req.body;
      if (!['csv', 'json'].includes(format)) {
        return res.status(400).json({ message: "Invalid format. Use 'csv' or 'json'" });
      }

      const result = await storage.exportList(req.params.id, format);

      // Set appropriate content type and headers
      const contentType = format === 'csv' ? 'text/csv' : 'application/json';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.data);
    } catch (error) {
      console.error('Export list error:', error);
      res.status(500).json({ message: "Failed to export list", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ==================== DOMAIN SETS (Phase 21) ====================

  app.get("/api/domain-sets", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const domainSets = await storage.getDomainSets(userId);
      res.json(domainSets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch domain sets" });
    }
  });

  app.get("/api/domain-sets/:id", requireAuth, async (req, res) => {
    try {
      const domainSet = await storage.getDomainSet(req.params.id);
      if (!domainSet) {
        return res.status(404).json({ message: "Domain set not found" });
      }
      res.json(domainSet);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch domain set" });
    }
  });

  app.post("/api/domain-sets", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      const { parseDomainsFromCSV, deduplicateDomains, normalizeDomain, fixCommonDomainTypos } = await import('@shared/domain-utils');
      const userId = (req as any).user?.id;

      const { name, description, csvContent, tags } = req.body;

      if (!name || !csvContent) {
        return res.status(400).json({ message: "Name and CSV content are required" });
      }

      // Parse domains from CSV (supports domain, domain,account_name, domain,account_name,notes)
      const parsed = parseDomainsFromCSV(csvContent);

      // Fix typos and normalize
      const fixedDomains = parsed.map(p => ({
        ...p,
        domain: fixCommonDomainTypos(p.domain)
      }));

      // Deduplicate by domain, keeping first occurrence (which includes account name)
      const uniqueDomainMap = new Map<string, typeof fixedDomains[0]>();
      const duplicates: string[] = [];

      for (const item of fixedDomains) {
        const normalizedDomain = normalizeDomain(item.domain);
        if (!uniqueDomainMap.has(normalizedDomain)) {
          uniqueDomainMap.set(normalizedDomain, item);
        } else {
          duplicates.push(item.domain);
        }
      }

      const uniqueItems = Array.from(uniqueDomainMap.values());

      // Create domain set
      const domainSet = await storage.createDomainSet({
        name,
        description,
        totalUploaded: parsed.length,
        duplicatesRemoved: duplicates.length,
        status: 'processing',
        ownerId: userId,
        tags: tags || [],
      });

      // Create domain items with account names
      const items = uniqueItems.map(item => ({
        domainSetId: domainSet.id,
        domain: item.domain,
        normalizedDomain: normalizeDomain(item.domain),
        accountName: item.accountName || null,
        notes: item.notes || null,
      }));

      await storage.createDomainSetItemsBulk(items);

      // Trigger matching in background (in a real app, this would be a job queue)
      storage.processDomainSetMatching(domainSet.id).catch(console.error);

      res.status(201).json(domainSet);
    } catch (error) {
      console.error('Create domain set error:', error);
      res.status(500).json({ message: "Failed to create domain set" });
    }
  });

  app.get("/api/domain-sets/:id/items", requireAuth, async (req, res) => {
    try {
      const items = await storage.getDomainSetItems(req.params.id);

      // Batch fetch account names for efficiency (deduplicate accountIds)
      const accountIds = [...new Set(items
        .map(item => item.accountId)
        .filter((id): id is string => id !== null && id !== undefined))];

      const accountMap = new Map<string, string>();
      if (accountIds.length > 0) {
        // Batch to avoid PostgreSQL parameter limits (max ~1000)
        const batchSize = 500;
        for (let i = 0; i < accountIds.length; i += batchSize) {
          const batch = accountIds.slice(i, i + batchSize);
          const accounts = await db
            .select({ id: accountsTable.id, name: accountsTable.name })
            .from(accountsTable)
            .where(inArray(accountsTable.id, batch));

          accounts.forEach(acc => accountMap.set(acc.id, acc.name));
        }
      }

      // Enrich items with account names from the batch fetch
      const enrichedItems = items.map(item => ({
        ...item,
        accountName: item.accountId ? (accountMap.get(item.accountId) || null) : null
      }));

      res.json(enrichedItems);
    } catch (error) {
      console.error('Get domain set items error:', error);
      res.status(500).json({ message: "Failed to get domain set items" });
    }
  });

  // Get accounts matched by a domain set
  app.get('/api/domain-sets/:id/accounts', requireAuth, async (req, res) => {
    try {
      const domainSetId = req.params.id;

      // Get all domain set items with matched accounts
      const matchedItems = await db
        .selectDistinct({ accountId: domainSetItems.accountId })
        .from(domainSetItems)
        .where(
          and(
            eq(domainSetItems.domainSetId, domainSetId),
            isNotNull(domainSetItems.accountId)
          )
        );

      if (matchedItems.length === 0) {
        return res.json([]);
      }

      // Extract account IDs (already filtered for non-null by query)
      const accountIds = matchedItems
        .map(item => item.accountId)
        .filter((id): id is string => id !== null && id !== undefined);

      if (accountIds.length === 0) {
        return res.json([]);
      }

      // Get the actual account records (batch to avoid PostgreSQL parameter limits)
      const allAccounts: any[] = [];
      const batchSize = 500;
      for (let i = 0; i < accountIds.length; i += batchSize) {
        const batch = accountIds.slice(i, i + batchSize);
        const accounts = await db
          .select()
          .from(accountsTable)
          .where(inArray(accountsTable.id, batch));
        allAccounts.push(...accounts);
      }

      res.json(allAccounts);
    } catch (error: any) {
      console.error('Error fetching domain set accounts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get contacts matched by a domain set
  app.get('/api/domain-sets/:id/contacts', requireAuth, async (req, res) => {
    try {
      const domainSetId = req.params.id;

      // Get all accounts that were matched by this domain set
      const matchedAccountIds = await db
        .selectDistinct({ accountId: domainSetItems.accountId })
        .from(domainSetItems)
        .where(
          and(
            eq(domainSetItems.domainSetId, domainSetId),
            isNotNull(domainSetItems.accountId)
          )
        );

      if (matchedAccountIds.length === 0) {
        return res.json([]);
      }

      // Extract account IDs (already filtered for non-null by query)
      const accountIds = matchedAccountIds
        .map(m => m.accountId)
        .filter((id): id is string => id !== null && id !== undefined);

      if (accountIds.length === 0) {
        return res.json([]);
      }

      // Get all contacts from those accounts
      const contacts = await db
        .select()
        .from(contactsTable)
        .where(inArray(contactsTable.accountId, accountIds));

      res.json(contacts);
    } catch (error: any) {
      console.error('Error fetching domain set contacts:', error);
      res.status(500).json({ error: error.message });
    }
  });


  app.post("/api/domain-sets/:id/process", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      await storage.processDomainSetMatching(req.params.id);
      const updated = await storage.getDomainSet(req.params.id);
      res.json(updated);
    } catch (error) {
      console.error('Process domain set error:', error);
      res.status(500).json({ message: "Failed to process domain set" });
    }
  });

  app.post("/api/domain-sets/:id/expand", requireAuth, async (req, res) => {
    try {
      const { filters } = req.body;
      const contacts = await storage.expandDomainSetToContacts(req.params.id, filters);
      res.json({ contacts, count: contacts.length });
    } catch (error) {
      console.error('Expand domain set error:', error);
      res.status(500).json({ message: "Failed to expand domain set" });
    }
  });

  app.post("/api/domain-sets/:id/convert-to-list", requireAuth, requireRole('admin', 'campaign_manager', 'data_ops'), async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const { listName } = req.body;

      if (!listName) {
        return res.status(400).json({ message: "List name is required" });
      }

      const list = await storage.convertDomainSetToList(req.params.id, listName, userId);
      res.status(201).json(list);
    } catch (error) {
      console.error('Convert domain set to list error:', error);
      res.status(500).json({ message: "Failed to convert domain set to list" });
    }
  });

  app.delete("/api/domain-sets/:id", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      await storage.deleteDomainSet(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete domain set" });
    }
  });

  // ==================== CAMPAIGNS ====================

  app.get("/api/campaigns", requireAuth, async (req, res) => {
    try {
      const typeFilter = req.query.type as string | undefined;
      let campaigns = await storage.getCampaigns();

      console.log(`[GET /api/campaigns] Found ${campaigns.length} campaigns in database${typeFilter ? ` (filtering by type: ${typeFilter})` : ''}`);

      // Filter by type if specified
      if (typeFilter) {
        campaigns = campaigns.filter(c => c.type === typeFilter);
        console.log(`[GET /api/campaigns] After filter: ${campaigns.length} campaigns`);
      }

      res.json(campaigns);
    } catch (error) {
      console.error('[GET /api/campaigns] ERROR:', error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // Get campaigns assigned to the current agent (or all campaigns for admin)
  // MUST come BEFORE /api/campaigns/:id to avoid route collision
  app.get("/api/campaigns/agent-assignments", requireAuth, async (req, res) => {
    try {
      const agentId = req.user?.userId;
      if (!agentId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check if user is admin
      const userRoles = req.user?.roles || [req.user?.role];
      const isAdmin = userRoles.includes('admin') || userRoles.includes('campaign_manager');

      console.log(`[AGENT ASSIGNMENTS] User ${agentId} - isAdmin: ${isAdmin}, roles:`, userRoles);

      if (isAdmin) {
        // Admins see all call campaigns (active or not)
        const allCampaigns = await db
          .select({
            campaignId: campaigns.id,
            campaignName: campaigns.name,
            dialMode: campaigns.dialMode,
          })
          .from(campaigns)
          .where(eq(campaigns.type, 'call'));

        console.log(`[AGENT ASSIGNMENTS] Admin user ${agentId} - found ${allCampaigns.length} call campaigns:`, allCampaigns.map(c => ({ id: c.campaignId, name: c.campaignName, dialMode: c.dialMode })));

        return res.status(200).json(allCampaigns);
      }

      // Agents see only their assigned campaigns
      const assignments = await db
        .select({
          campaignId: campaignAgentAssignments.campaignId,
          campaignName: campaigns.name,
          dialMode: campaigns.dialMode,
        })
        .from(campaignAgentAssignments)
        .innerJoin(campaigns, eq(campaignAgentAssignments.campaignId, campaigns.id))
        .where(
          and(
            eq(campaignAgentAssignments.agentId, agentId),
            eq(campaignAgentAssignments.isActive, true)
          )
        );

      console.log(`[AGENT ASSIGNMENTS] Agent user ${agentId} - returning ${assignments.length} assigned campaigns`);

      return res.status(200).json(assignments);
    } catch (error) {
      console.error('[AGENT ASSIGNMENTS] Error:', error);
      return res.status(500).json({ message: "Failed to fetch agent assignments" });
    }
  });

  app.get("/api/campaigns/:id", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  // Get email campaign metrics
  app.get("/api/campaigns/:id/email-metrics", requireAuth, async (req, res) => {
    try {
      const campaignId = req.params.id;
      
      // Get all email events for this campaign
      const events = await db.select()
        .from(schema.emailEvents)
        .where(eq(schema.emailEvents.campaignId, campaignId));

      // Calculate metrics by grouping events
      const metrics = {
        totalRecipients: new Set(events.map(e => e.recipient)).size,
        sent: events.filter(e => e.type === 'accepted' || e.type === 'delivered').length,
        delivered: events.filter(e => e.type === 'delivered').length,
        opened: events.filter(e => e.type === 'opened').length,
        clicked: events.filter(e => e.type === 'clicked').length,
        bounced: events.filter(e => e.type === 'bounced').length,
        hardBounced: events.filter(e => e.type === 'bounced' && e.bounceType === 'hard').length,
        softBounced: events.filter(e => e.type === 'bounced' && e.bounceType === 'soft').length,
        complained: events.filter(e => e.type === 'complained').length,
        unsubscribed: events.filter(e => e.type === 'unsubscribed').length,
        failed: events.filter(e => e.type === 'failed').length,
      };

      // Calculate rates
      const deliveredCount = metrics.delivered || 1; // Avoid division by zero
      const sentCount = metrics.sent || 1;

      const rates = {
        deliveryRate: ((metrics.delivered / sentCount) * 100).toFixed(2),
        openRate: ((metrics.opened / deliveredCount) * 100).toFixed(2),
        clickRate: ((metrics.clicked / deliveredCount) * 100).toFixed(2),
        clickToOpenRate: metrics.opened > 0 ? ((metrics.clicked / metrics.opened) * 100).toFixed(2) : '0.00',
        bounceRate: ((metrics.bounced / sentCount) * 100).toFixed(2),
        complaintRate: ((metrics.complained / deliveredCount) * 100).toFixed(2),
        unsubscribeRate: ((metrics.unsubscribed / deliveredCount) * 100).toFixed(2),
      };

      res.json({
        metrics,
        rates,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Email Metrics] Error:', error);
      res.status(500).json({ message: "Failed to fetch email metrics" });
    }
  });

  // Get call campaign snapshot stats
  app.get("/api/campaigns/:id/call-stats", requireAuth, async (req, res) => {
    try {
      const campaignId = req.params.id;
      const queueStats = await storage.getCampaignQueueStats(campaignId);
      const connectedDispositions = [
        'connected',
        'qualified',
        'callback-requested',
        'not_interested',
        'dnc-request',
      ];
      const [callStats] = await db
        .select({
          callsMade: sql<number>`COUNT(*)::int`,
          callsConnected: sql<number>`COUNT(CASE WHEN ${calls.disposition} IN (${sql.join(
            connectedDispositions.map((value) => sql`${value}`),
            sql`, `
          )}) THEN 1 END)::int`,
          leadsQualified: sql<number>`COUNT(CASE WHEN ${calls.disposition} = 'qualified' THEN 1 END)::int`,
          dncRequests: sql<number>`COUNT(CASE WHEN ${calls.disposition} = 'dnc-request' THEN 1 END)::int`,
          notInterested: sql<number>`COUNT(CASE WHEN ${calls.disposition} = 'not_interested' THEN 1 END)::int`,
        })
        .from(calls)
        .where(eq(calls.campaignId, campaignId));

      res.json({
        campaignId,
        contactsInQueue: queueStats.queued,
        callsMade: callStats?.callsMade || 0,
        callsConnected: callStats?.callsConnected || 0,
        leadsQualified: callStats?.leadsQualified || 0,
        dncRequests: callStats?.dncRequests || 0,
        notInterested: callStats?.notInterested || 0,
      });
    } catch (error) {
      console.error('[CALL STATS] Error:', error);
      res.status(500).json({ message: "Failed to fetch call stats" });
    }
  });

  // Get email campaign events (contact-level log)
  app.get("/api/campaigns/:id/email-events", requireAuth, async (req, res) => {
    try {
      const campaignId = req.params.id;
      const { page = '1', limit = '50', eventType } = req.query;
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      let query = db.select({
        id: schema.emailEvents.id,
        recipient: schema.emailEvents.recipient,
        type: schema.emailEvents.type,
        bounceType: schema.emailEvents.bounceType,
        createdAt: schema.emailEvents.createdAt,
        contactId: schema.emailEvents.contactId,
        messageId: schema.emailEvents.messageId,
      })
      .from(schema.emailEvents)
      .where(eq(schema.emailEvents.campaignId, campaignId))
      .orderBy(desc(schema.emailEvents.createdAt))
      .limit(limitNum)
      .offset(offset);

      // Optional filter by event type
      if (eventType && typeof eventType === 'string') {
        query = db.select({
          id: schema.emailEvents.id,
          recipient: schema.emailEvents.recipient,
          type: schema.emailEvents.type,
          bounceType: schema.emailEvents.bounceType,
          createdAt: schema.emailEvents.createdAt,
          contactId: schema.emailEvents.contactId,
          messageId: schema.emailEvents.messageId,
        })
        .from(schema.emailEvents)
        .where(and(
          eq(schema.emailEvents.campaignId, campaignId),
          eq(schema.emailEvents.type, eventType)
        ))
        .orderBy(desc(schema.emailEvents.createdAt))
        .limit(limitNum)
        .offset(offset);
      }

      const events = await query;

      // Get total count
      const countResult = await db.select({ count: sql<number>`count(*)::int` })
        .from(schema.emailEvents)
        .where(eq(schema.emailEvents.campaignId, campaignId));
      
      const totalCount = countResult[0]?.count || 0;

      res.json({
        events,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
        }
      });
    } catch (error) {
      console.error('[Email Events] Error:', error);
      res.status(500).json({ message: "Failed to fetch email events" });
    }
  });

  app.post("/api/campaigns", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { assignedAgents, ...campaignData } = req.body;
      
      // Parse natural language rules once on save (performance optimization)
      // Treat falsy, whitespace-only, or empty strings as "no rules" to avoid cache sync issues
      const hasRules = campaignData.customQaRules && typeof campaignData.customQaRules === 'string' && campaignData.customQaRules.trim().length > 0;
      
      if (hasRules) {
        const { parseNaturalLanguageRules } = await import('./services/natural-language-rule-parser');
        campaignData.parsedQaRules = await parseNaturalLanguageRules(campaignData.customQaRules);
        console.log('[Campaign Create] Parsed custom QA rules and cached result');
      } else {
        // Explicitly null the cache when rules are empty, whitespace-only, or missing
        campaignData.parsedQaRules = null;
      }
      
      const campaign = await storage.createCampaign(campaignData);

      // AUTO-CONFIGURE AGENTS based on Campaign Type
      try {
        const { configureCampaignAgents } = await import('./services/campaign-configuration');
        // Cast type to string as it comes from DB/API and might match the enum
        await configureCampaignAgents(campaign.id, campaign.type);
      } catch (err) {
        console.error('[Campaign Creation] Failed to auto-configure agents:', err);
      }
      
      // Return campaign immediately - queue population happens in background
      invalidateDashboardCache();
      res.status(201).json({ ...campaign, queuePopulationStatus: 'pending' });

      // ASYNC: Auto-populate queue from audience if defined (runs in background)
      if (campaign.audienceRefs && campaign.type === 'call') {
        const startTime = Date.now();
        console.log(`[Campaign Creation] Starting async queue population for campaign ${campaign.id}`);
        
        // Run queue population in background (don't await)
        (async () => {
          try {
            const audienceRefs = campaign.audienceRefs as any;
            let contacts: any[] = [];

            // Resolve contacts from filterGroup (Advanced Filters)
            if (audienceRefs.filterGroup) {
              console.log(`[Campaign Creation] Resolving contacts from filterGroup for campaign ${campaign.id}`);
              const filterContacts = await storage.getContacts(audienceRefs.filterGroup);
              contacts.push(...filterContacts);
              console.log(`[Campaign Creation] Found ${filterContacts.length} contacts from filterGroup`);
            }

            // Resolve contacts from segments
            if (audienceRefs.selectedSegments && Array.isArray(audienceRefs.selectedSegments)) {
              for (const segmentId of audienceRefs.selectedSegments) {
                const segment = await storage.getSegment(segmentId);
                if (segment && segment.definitionJson) {
                  const segmentContacts = await storage.getContacts(segment.definitionJson as any);
                  contacts.push(...segmentContacts);
                }
              }
            }

            // Resolve contacts from lists (with batching for large lists)
            const listIds = audienceRefs.lists || audienceRefs.selectedLists || [];
            if (Array.isArray(listIds) && listIds.length > 0) {
              for (const listId of listIds) {
                const list = await storage.getList(listId);
                if (list && list.recordIds && list.recordIds.length > 0) {
                  // Batch large lists to avoid SQL query limits
                  const batchSize = 1000;
                  for (let i = 0; i < list.recordIds.length; i += batchSize) {
                    const batch = list.recordIds.slice(i, i + batchSize);
                    const listContacts = await storage.getContactsByIds(batch);
                    contacts.push(...listContacts);
                  }
                }
              }
            }

            // Remove duplicates and log all contacts from lists
            const uniqueContacts = Array.from(
              new Map(contacts.map(c => [c.id, c])).values()
            );
            
            console.log(`[Campaign Creation] Total unique contacts from lists/segments: ${uniqueContacts.length}`);
            
            // Separate contacts with and without accounts
            const contactsWithAccount = uniqueContacts.filter(c => c.accountId);
            const contactsWithoutAccount = uniqueContacts.filter(c => !c.accountId);
            
            if (contactsWithoutAccount.length > 0) {
              console.log(`[Campaign Creation] ⚠️ ${contactsWithoutAccount.length} contacts have no accountId - they will be skipped (DB constraint requires accountId)`);
              // Log first 5 for debugging
              const sample = contactsWithoutAccount.slice(0, 5);
              for (const c of sample) {
                console.log(`  - ${c.firstName} ${c.lastName} (${c.email}) - no account linked`);
              }
            }

            // PHONE VALIDATION: Filter contacts with callable phone numbers
            // Fetch full contact data with account/HQ phone info if not already present
            const contactIds = contactsWithAccount.map(c => c.id);
            if (contactIds.length === 0) {
              console.log(`[Campaign Creation] No contacts with account found for campaign ${campaign.id}`);
            } else {
              // Batch to avoid PostgreSQL parameter limits
              const fullContacts: any[] = [];
              const batchSize = 500;
              for (let i = 0; i < contactIds.length; i += batchSize) {
                const batch = contactIds.slice(i, i + batchSize);
                const batchResults = await db
                  .select()
                  .from(contactsTable)
                  .leftJoin(accountsTable, eq(contactsTable.accountId, accountsTable.id))
                  .where(inArray(contactsTable.id, batch));
                fullContacts.push(...batchResults);
              }

              const contactsWithCallablePhones = fullContacts.filter(row => {
                const contact = row.contacts;
                const account = row.accounts;

                const bestPhone = getBestPhoneForContact({
                  directPhone: contact.directPhone,
                  directPhoneE164: contact.directPhoneE164,
                  mobilePhone: contact.mobilePhone,
                  mobilePhoneE164: contact.mobilePhoneE164,
                  country: contact.country,
                  hqPhone: account?.mainPhone,
                  hqPhoneE164: account?.mainPhoneE164,
                  hqCountry: account?.hqCountry,
                });

                return bestPhone.phone !== null;
              });

              const skippedNoPhone = fullContacts.length - contactsWithCallablePhones.length;
              console.log(`[Campaign Creation] Phone validation: ${contactsWithCallablePhones.length}/${contactIds.length} contacts have callable phones`);
              if (skippedNoPhone > 0) {
                console.log(`[Campaign Creation] ⚠️ ${skippedNoPhone} contacts have no callable phone and will be skipped`);
              }

              // Bulk enqueue all contacts with callable phones
              const contactsToEnqueue = contactsWithCallablePhones.map(row => ({
                contactId: row.contacts.id,
                accountId: row.contacts.accountId!,
                priority: 0
              }));

              const { enqueued } = await storage.bulkEnqueueContacts(campaign.id, contactsToEnqueue);
              const elapsed = Date.now() - startTime;
              console.log(`[Campaign Creation] ✅ Async queue population complete: ${enqueued} contacts in ${elapsed}ms for campaign ${campaign.id}`);
            }
          } catch (bgError) {
            console.error(`[Campaign Creation] ❌ Background queue population failed for campaign ${campaign.id}:`, bgError);
          }
        })();
      }
    } catch (error) {
      console.error('Campaign creation error:', error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create campaign" });
    }
  });

  app.patch("/api/campaigns/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const updateData = { ...req.body };
      
      // Parse natural language rules once on update (performance optimization)
      if ('customQaRules' in updateData) {
        // Treat falsy, whitespace-only, or empty strings as "no rules" to avoid cache sync issues
        const hasRules = updateData.customQaRules && typeof updateData.customQaRules === 'string' && updateData.customQaRules.trim().length > 0;
        
        if (hasRules) {
          const { parseNaturalLanguageRules } = await import('./services/natural-language-rule-parser');
          updateData.parsedQaRules = await parseNaturalLanguageRules(updateData.customQaRules);
          console.log('[Campaign Update] Parsed custom QA rules and cached result');
        } else {
          // Explicitly null the cache when rules are empty, whitespace-only, null, or missing
          updateData.parsedQaRules = null;
          console.log('[Campaign Update] Cleared cached QA rules');
        }
      }
      
      const campaign = await storage.updateCampaign(req.params.id, updateData);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      invalidateDashboardCache();
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  app.delete("/api/campaigns/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const campaignId = req.params.id;

      // Check if campaign exists
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Delete related data first (cascading delete)
      // 1. Release all agent assignments
      await db.delete(campaignAgentAssignments)
        .where(eq(campaignAgentAssignments.campaignId, campaignId));

      // 2. Clear agent queues
      await db.delete(agentQueue)
        .where(eq(agentQueue.campaignId, campaignId));

      // 3. Clear campaign queue
      await db.delete(campaignQueue)
        .where(eq(campaignQueue.campaignId, campaignId));

      // 4. Delete campaign suppressions
      await db.delete(campaignSuppressionContacts)
        .where(eq(campaignSuppressionContacts.campaignId, campaignId));
      await db.delete(campaignSuppressionAccounts)
        .where(eq(campaignSuppressionAccounts.campaignId, campaignId));
      await db.delete(campaignSuppressionEmails)
        .where(eq(campaignSuppressionEmails.campaignId, campaignId));
      await db.delete(campaignSuppressionDomains)
        .where(eq(campaignSuppressionDomains.campaignId, campaignId));

      // 5. Delete the campaign itself
      await db.delete(campaigns)
        .where(eq(campaigns.id, campaignId));

      invalidateDashboardCache();
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // Clone/Requeue campaign - creates a new draft copy of an existing campaign
  // Supports optional body params: { name?: string, organizationId?: string }
  app.post("/api/campaigns/:id/clone", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const campaignId = req.params.id;
      const { name: customName, organizationId: newOrganizationId } = req.body || {};

      // Get the original campaign
      const originalCampaign = await storage.getCampaign(campaignId);
      if (!originalCampaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Create a new campaign based on the original with ALL important fields
      const newCampaign = await db.insert(campaigns)
        .values({
          // Basic info
          name: customName || `${originalCampaign.name} (Copy)`,
          type: originalCampaign.type,
          status: 'draft', // Always create as draft

          // Organization - use new one if provided, otherwise copy from original
          problemIntelligenceOrgId: newOrganizationId || originalCampaign.problemIntelligenceOrgId,

          // Audience & Email
          audienceRefs: originalCampaign.audienceRefs,
          emailSubject: originalCampaign.emailSubject,
          emailHtmlContent: originalCampaign.emailHtmlContent,
          emailPreheader: originalCampaign.emailPreheader,
          senderProfileId: originalCampaign.senderProfileId,

          // Call Scripts & Qualification
          callScript: originalCampaign.callScript,
          scriptId: originalCampaign.scriptId,
          qualificationQuestions: originalCampaign.qualificationQuestions,

          // AI Agent Settings
          dialMode: originalCampaign.dialMode,
          aiAgentSettings: originalCampaign.aiAgentSettings,
          voiceProvider: originalCampaign.voiceProvider,
          voiceProviderFallback: originalCampaign.voiceProviderFallback,
          maxCallDurationSeconds: originalCampaign.maxCallDurationSeconds,

          // Campaign Context (Foundation + Campaign Layer)
          campaignObjective: originalCampaign.campaignObjective,
          productServiceInfo: originalCampaign.productServiceInfo,
          talkingPoints: originalCampaign.talkingPoints,
          targetAudienceDescription: originalCampaign.targetAudienceDescription,
          campaignObjections: originalCampaign.campaignObjections,
          successCriteria: originalCampaign.successCriteria,
          campaignContextBrief: originalCampaign.campaignContextBrief,

          // Power Dialer & Retry Settings
          powerSettings: originalCampaign.powerSettings,
          retryRules: originalCampaign.retryRules,
          timezone: originalCampaign.timezone,
          businessHoursConfig: originalCampaign.businessHoursConfig,

          // QA Settings
          qaParameters: originalCampaign.qaParameters,
          customQaFields: originalCampaign.customQaFields,
          customQaRules: originalCampaign.customQaRules,
          parsedQaRules: originalCampaign.parsedQaRules,
          clientSubmissionConfig: originalCampaign.clientSubmissionConfig,
          recordingAutoSyncEnabled: originalCampaign.recordingAutoSyncEnabled,
          companiesHouseValidation: originalCampaign.companiesHouseValidation,
          deliveryTemplateId: originalCampaign.deliveryTemplateId,

          // Account Cap Settings
          accountCapEnabled: originalCampaign.accountCapEnabled,
          accountCapValue: originalCampaign.accountCapValue,
          accountCapMode: originalCampaign.accountCapMode,

          // Goals (but clear schedule for requeue)
          targetQualifiedLeads: originalCampaign.targetQualifiedLeads,
          costPerLead: originalCampaign.costPerLead,
          scheduleJson: null, // Clear schedule for requeue
          startDate: null, // Clear dates for requeue
          endDate: null,

          // Owner
          ownerId: originalCampaign.ownerId,
          brandId: originalCampaign.brandId,
          mode: originalCampaign.mode,
          throttlingConfig: originalCampaign.throttlingConfig,
          assignedTeams: originalCampaign.assignedTeams,
        })
        .returning();

      console.log(`[CLONE CAMPAIGN] Created new campaign ${newCampaign[0].id} from ${campaignId}`, {
        newOrganizationId: newOrganizationId || 'same as original',
        originalOrgId: originalCampaign.problemIntelligenceOrgId,
      });

      invalidateDashboardCache();
      res.status(201).json(newCampaign[0]);
    } catch (error) {
      console.error('Error cloning campaign:', error);
      res.status(500).json({ message: "Failed to clone campaign" });
    }
  });

  app.post("/api/campaigns/:id/launch", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      console.log(`[LAUNCH CAMPAIGN] Starting launch for campaign ${req.params.id}`);

      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        console.log(`[LAUNCH CAMPAIGN] Campaign not found: ${req.params.id}`);
        return res.status(404).json({ message: "Campaign not found" });
      }

      console.log(`[LAUNCH CAMPAIGN] Found campaign: ${campaign.name}, type: ${campaign.type}`);

      // TODO: Add pre-launch guards (audience validation, suppression checks, etc.)

      console.log(`[LAUNCH CAMPAIGN] Updating campaign status to active...`);

      // Update status and launchedAt using direct database query
      const [updated] = await db
        .update(campaigns)
        .set({
          status: 'active',
          launchedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, req.params.id))
        .returning();

      if (!updated) {
        throw new Error('Failed to update campaign');
      }

      console.log(`[LAUNCH CAMPAIGN] Successfully launched campaign ${req.params.id}`);
      invalidateDashboardCache();
      res.json(updated);
    } catch (error) {
      console.error(`[LAUNCH CAMPAIGN] Error launching campaign ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to launch campaign", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ==================== CAMPAIGN AGENT ASSIGNMENTS ====================

  // List all agents with their current assignment status
  app.get("/api/agents", requireAuth, async (req, res) => {
    try {
      const agents = await storage.listAgents();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch agents" });
    }
  });

  // Assign agents to a campaign (with automatic reassignment)
  app.post("/api/campaigns/:id/agents", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { agentIds } = req.body;

      if (!Array.isArray(agentIds) || agentIds.length === 0) {
        return res.status(400).json({ message: "agentIds array is required" });
      }

      const userId = req.user!.userId;

      // Release agents from their current campaigns first
      for (const agentId of agentIds) {
        const existingAssignments = await db
          .select()
          .from(campaignAgentAssignments)
          .where(
            and(
              eq(campaignAgentAssignments.agentId, agentId),
              eq(campaignAgentAssignments.isActive, true)
            )
          );

        for (const assignment of existingAssignments) {
          if (assignment.campaignId !== req.params.id) {
            await storage.releaseAgentAssignment(assignment.campaignId, agentId);
          }
        }
      }

      // Now assign agents to the new campaign (atomic transaction with queue redistribution)
      await storage.assignAgentsToCampaign(req.params.id, agentIds, userId);

      // Automatically populate queue from campaign audience if not already populated
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, req.params.id))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Default to 'manual' if dialMode is not set
      const dialMode = campaign.dialMode || 'manual';

      // Check if campaign has audience defined
      let campaignContacts: any[] = [];
      if (campaign.audienceRefs) {
        const audienceRefs = campaign.audienceRefs as any;
        const uniqueContactIds = new Set<string>();

        // Resolve from filterGroup (advanced filters)
        if (audienceRefs.filterGroup) {
          console.log(`[Campaign Creation] Resolving contacts from filterGroup for campaign ${campaign.id}`);
          const filterSQL = buildFilterQuery(audienceRefs.filterGroup as FilterGroup, contactsTable);
          if (filterSQL) {
            const audienceContacts = await db.select()
              .from(contactsTable)
              .where(filterSQL);
            audienceContacts.forEach(c => uniqueContactIds.add(c.id));
          }
        }

        // Resolve from lists
        if (audienceRefs.lists && Array.isArray(audienceRefs.lists)) {
          for (const listId of audienceRefs.lists) {
            const [list] = await db.select()
              .from(lists)
              .where(eq(lists.id, listId))
              .limit(1);

            if (list && list.recordIds && list.recordIds.length > 0) {
              list.recordIds.forEach((id: string) => uniqueContactIds.add(id));
            }
          }
        }

        // Resolve from selectedLists (alternate field name)
        if (audienceRefs.selectedLists && Array.isArray(audienceRefs.selectedLists)) {
          for (const listId of audienceRefs.selectedLists) {
            const [list] = await db.select()
              .from(lists)
              .where(eq(lists.id, listId))
              .limit(1);

            if (list && list.recordIds && list.recordIds.length > 0) {
              list.recordIds.forEach((id: string) => uniqueContactIds.add(id));
            }
          }
        }

        // Resolve from segments
        if (audienceRefs.segments && Array.isArray(audienceRefs.segments)) {
          for (const segmentId of audienceRefs.segments) {
            const [segment] = await db.select()
              .from(segments)
              .where(eq(segments.id, segmentId))
              .limit(1);

            if (segment && segment.definitionJson) {
              const filterSQL = buildFilterQuery(segment.definitionJson as FilterGroup, contactsTable);
              if (filterSQL) {
                const segmentContacts = await db.select()
                  .from(contactsTable)
                  .where(filterSQL);
                segmentContacts.forEach(c => uniqueContactIds.add(c.id));
              }
            }
          }
        }

        // Convert contact IDs to full contact objects (with batching for large datasets)
        if (uniqueContactIds.size > 0) {
          const contactIdsArray = Array.from(uniqueContactIds);
          const batchSize = 500; // Batch to avoid PostgreSQL parameter limits

          for (let i = 0; i < contactIdsArray.length; i += batchSize) {
            const batch = contactIdsArray.slice(i, i + batchSize);
            const batchContacts = await db.select()
              .from(contactsTable)
              .where(inArray(contactsTable.id, batch));
            campaignContacts.push(...batchContacts);
          }
        }

        // Remove duplicates and filter valid contacts
        const uniqueContacts = Array.from(
          new Map(campaignContacts.map(c => [c.id, c])).values()
        );
        const validContacts = uniqueContacts.filter(c => c.accountId);

        console.log(`[ASSIGN AGENTS] Campaign has audienceRefs: ${!!campaign.audienceRefs}, Valid contacts: ${validContacts.length}, Dial mode: ${dialMode}`);

        if (campaign.audienceRefs && validContacts.length > 0) {
          // DUAL QUEUE STRATEGY: Different behavior for manual vs power dial
          if (dialMode === 'manual') {
            console.log(`[ASSIGN AGENTS] MANUAL mode - populating agent queues with ${validContacts.length} contacts for ${agentIds.length} agents`);

            // ==================== INTELLIGENT SUPPRESSION FILTERING ====================
            // Filter out contacts that are on global suppression lists using BULK operations
            const { checkSuppressionBulk } = await import('./lib/suppression.service');

            // Bulk check global suppression list (email + name/company hash)
            const contactIds = validContacts.map(c => c.id);
            const suppressionResults = await checkSuppressionBulk(contactIds);
            const suppressedContactIds = new Set<string>();

            // checkSuppressionBulk returns a Map, iterate properly
            for (const [contactId, reason] of suppressionResults.entries()) {
              if (reason !== null) {
                suppressedContactIds.add(contactId);
              }
            }

            console.log(`[ASSIGN AGENTS] Global suppression check: ${suppressedContactIds.size} contacts suppressed out of ${validContacts.length}`);

            // Bulk check global phone DNC list
            const uniquePhones = new Set<string>();
            const contactPhoneMap = new Map<string, Set<string>>(); // phone -> Set of contactIds

            for (const contact of validContacts) {
              if (contact.directPhoneE164) {
                uniquePhones.add(contact.directPhoneE164);
                if (!contactPhoneMap.has(contact.directPhoneE164)) {
                  contactPhoneMap.set(contact.directPhoneE164, new Set());
                }
                contactPhoneMap.get(contact.directPhoneE164)!.add(contact.id);
              }
              if (contact.mobilePhoneE164) {
                uniquePhones.add(contact.mobilePhoneE164);
                if (!contactPhoneMap.has(contact.mobilePhoneE164)) {
                  contactPhoneMap.set(contact.mobilePhoneE164, new Set());
                }
                contactPhoneMap.get(contact.mobilePhoneE164)!.add(contact.id);
              }
            }

            const dncContactIds = new Set<string>();
            if (uniquePhones.size > 0) {
              const phonesArray = Array.from(uniquePhones);
              const batchSize = 500; // Batch to avoid PostgreSQL parameter limits

              for (let i = 0; i < phonesArray.length; i += batchSize) {
                const batch = phonesArray.slice(i, i + batchSize);
                const suppressedPhones = await db.select({ phoneE164: suppressionPhones.phoneE164 })
                  .from(suppressionPhones)
                  .where(inArray(suppressionPhones.phoneE164, batch));

                for (const row of suppressedPhones) {
                  const contactIds = contactPhoneMap.get(row.phoneE164);
                  if (contactIds) {
                    for (const contactId of contactIds) {
                      dncContactIds.add(contactId);
                    }
                  }
                }
              }

              console.log(`[ASSIGN AGENTS] Phone DNC check: ${dncContactIds.size} contacts have phones on DNC list`);
            }

            // Combine both suppression sets
            const allSuppressedIds = new Set([...suppressedContactIds, ...dncContactIds]);

            // Filter to non-suppressed contacts
            const nonSuppressedContacts = validContacts.filter(c => !allSuppressedIds.has(c.id));
            const suppressedCount = allSuppressedIds.size;

            console.log(`[ASSIGN AGENTS] Suppression check: ${nonSuppressedContacts.length}/${validContacts.length} contacts not suppressed`);

            // PHONE VALIDATION: Filter contacts with callable phone numbers
            const nonSuppressedContactIds = nonSuppressedContacts.map(c => c.id);

            // Batch large arrays to avoid PostgreSQL parameter limits (max ~500)
            const fullContactsForPhoneCheck: any[] = [];
            const batchSize = 500;

            for (let i = 0; i < nonSuppressedContactIds.length; i += batchSize) {
              const batch = nonSuppressedContactIds.slice(i, i + batchSize);
              const batchResults = await db
                .select()
                .from(contactsTable)
                .leftJoin(accountsTable, eq(contactsTable.accountId, accountsTable.id))
                .where(inArray(contactsTable.id, batch));
              fullContactsForPhoneCheck.push(...batchResults);
            }

            // Create a map of contactId -> dialedNumber for queue insertion
            const contactDialedNumberMap = new Map<string, string | null>();

            const contactsWithCallablePhones = fullContactsForPhoneCheck.filter(row => {
              const contact = row.contacts;
              const account = row.accounts;

              const bestPhone = getBestPhoneForContact({
                directPhone: contact.directPhone,
                directPhoneE164: contact.directPhoneE164,
                mobilePhone: contact.mobilePhone,
                mobilePhoneE164: contact.mobilePhoneE164,
                country: contact.country,
                hqPhone: account?.mainPhone,
                hqPhoneE164: account?.mainPhoneE164,
                hqCountry: account?.hqCountry,
              });

              if (bestPhone.phone !== null) {
                contactDialedNumberMap.set(contact.id, bestPhone.phone || null);
                return true;
              }
              return false;
            });

            const eligibleContacts = contactsWithCallablePhones.map(row => row.contacts);
            const noPhoneCount = nonSuppressedContacts.length - eligibleContacts.length;

            console.log(`[ASSIGN AGENTS] Phone validation: ${eligibleContacts.length}/${nonSuppressedContacts.length} contacts have callable phones`);
            console.log(`[ASSIGN AGENTS] Final: ${eligibleContacts.length} eligible, ${suppressedCount} suppressed, ${noPhoneCount} no phone`);

            // MANUAL DIAL: Populate agent_queue with eligible campaign contacts for each agent
            // CRITICAL: Clear existing queue items for all agents first to avoid duplicates
            await db.delete(agentQueue).where(
              and(
                inArray(agentQueue.agentId, agentIds),
                eq(agentQueue.campaignId, req.params.id)
              )
            );
            console.log(`[ASSIGN AGENTS] Cleared existing queue items for ${agentIds.length} agents`);

            // Build all queue items for bulk insert (much faster than individual inserts)
            const queueItems: any[] = [];
            const now = new Date();

            for (const agentId of agentIds) {
              for (const contact of eligibleContacts) {
                queueItems.push({
                  id: sql`gen_random_uuid()`,
                  agentId,
                  campaignId: req.params.id,
                  contactId: contact.id,
                  accountId: contact.accountId!,
                  dialedNumber: contactDialedNumberMap.get(contact.id) || null, // CRITICAL: Store exact dialed number for Telnyx recording sync
                  queueState: 'queued',
                  priority: 0,
                  createdAt: now,
                  updatedAt: now,
                });
              }
            }

            console.log(`[ASSIGN AGENTS] Prepared ${queueItems.length} queue items for bulk insert`);
            // Bulk insert in batches with conflict handling
            let totalAdded = 0;
            const insertBatchSize = 500; // Smaller batches for stability

            for (let i = 0; i < queueItems.length; i += insertBatchSize) {
              const batch = queueItems.slice(i, i + insertBatchSize);
              try {
                const result = await db.insert(agentQueue).values(batch).returning({ id: agentQueue.id });
                totalAdded += result.length;
                console.log(`[Manual Queue] Batch ${Math.floor(i / insertBatchSize) + 1}: ${result.length} items inserted`);
              } catch (error) {
                console.error(`Error inserting batch ${Math.floor(i / insertBatchSize) + 1}:`, error);
              }
            }

            res.status(201).json({
              message: "Agents assigned to manual dial campaign. Eligible contacts added to each agent's queue.",
              agentsAssigned: agentIds.length,
              contactsPerAgent: eligibleContacts.length,
              suppressedContacts: suppressedCount,
              totalQueueItemsCreated: totalAdded,
              mode: 'manual'
            });
          } else {
            // POWER DIAL: Populate campaign_queue and assign to agents via round-robin

            // PHONE VALIDATION: Filter contacts with callable phone numbers (batch to avoid parameter limits)
            const contactIds = validContacts.map(c => c.id);
            const fullContacts: any[] = [];
            const batchSize = 500;
            for (let i = 0; i < contactIds.length; i += batchSize) {
              const batch = contactIds.slice(i, i + batchSize);
              const batchResults = await db
                .select()
                .from(contactsTable)
                .leftJoin(accountsTable, eq(contactsTable.accountId, accountsTable.id))
                .where(inArray(contactsTable.id, batch));
              fullContacts.push(...batchResults);
            }

            const contactsWithCallablePhones = fullContacts.filter(row => {
              const contact = row.contacts;
              const account = row.accounts;

              const bestPhone = getBestPhoneForContact({
                directPhone: contact.directPhone,
                directPhoneE164: contact.directPhoneE164,
                mobilePhone: contact.mobilePhone,
                mobilePhoneE164: contact.mobilePhoneE164,
                country: contact.country,
                hqPhone: account?.mainPhone,
                hqPhoneE164: account?.mainPhoneE164,
                hqCountry: account?.hqCountry,
              });

              return bestPhone.phone !== null;
            });

            console.log(`[POWER DIAL] Phone validation: ${contactsWithCallablePhones.length}/${validContacts.length} contacts have callable phones`);

            let enqueuedCount = 0;
            for (const row of contactsWithCallablePhones) {
              try {
                await storage.enqueueContact(
                  req.params.id,
                  row.contacts.id,
                  row.contacts.accountId!,
                  0
                );
                enqueuedCount++;
              } catch (error) {
                // Skip contacts that can't be enqueued (e.g., already in queue)
              }
            }

            // Assign queue items to the newly assigned agents
            const assignResult = await storage.assignQueueToAgents(req.params.id, agentIds, 'round_robin');

            res.status(201).json({
              message: "Agents assigned to power dial campaign and queue populated successfully",
              queueItemsAssigned: assignResult.assigned,
              contactsEnqueued: enqueuedCount,
              totalContactsProcessed: validContacts.length,
              contactsWithCallablePhones: contactsWithCallablePhones.length,
              mode: 'power'
            });
          }
        } else {
          // No audience defined, just assign agents
          const assignResult = await storage.assignQueueToAgents(req.params.id, agentIds, 'round_robin');
          res.status(201).json({
            message: "Agents assigned successfully",
            queueItemsAssigned: assignResult.assigned,
            note: "Campaign has no audience defined. Please configure audience first."
          });
        }
      } else {
        // No audience defined, just assign agents
        const assignResult = await storage.assignQueueToAgents(req.params.id, agentIds, 'round_robin');
        res.status(201).json({
          message: "Agents assigned successfully",
          queueItemsAssigned: assignResult.assigned,
          note: "Campaign has no audience defined. Please configure audience first."
        });
      }
    } catch (error: any) {
      console.error('[ASSIGN AGENTS] ERROR:', error);
      console.error('[ASSIGN AGENTS] Error stack:', error?.stack);
      res.status(400).json({
        message: error instanceof Error ? error.message : "Failed to assign agents",
        error: error?.message || String(error),
        details: error?.stack
      });
    }
  });

  // Get agents assigned to a campaign
  app.get("/api/campaigns/:id/agents", requireAuth, async (req, res) => {
    try {
      console.log(`[GET CAMPAIGN AGENTS] Fetching agents for campaign ${req.params.id}`);
      const agents = await storage.getCampaignAgents(req.params.id);
      console.log(`[GET CAMPAIGN AGENTS] Returning ${agents.length} agents:`, agents.map(a => ({
        id: a.agentId,
        name: a.agent?.firstName + ' ' + a.agent?.lastName
      })));
      res.json(agents);
    } catch (error) {
      console.error('[GET CAMPAIGN AGENTS] Error:', error);
      res.status(500).json({ message: "Failed to fetch campaign agents" });
    }
  });

  // Release an agent from a campaign
  app.delete("/api/campaigns/:id/agents/:agentId", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      await storage.releaseAgentAssignment(req.params.id, req.params.agentId);
      res.json({ message: "Agent released successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to release agent" });
    }
  });

  // ==================== CAMPAIGN QUEUE (ACCOUNT LEAD CAP) ====================

  // Get campaign queue stats (lightweight - just counts, no full data)
  app.get("/api/campaigns/:id/queue/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getCampaignQueueStats(req.params.id);
      console.log(`[QUEUE STATS] Campaign ${req.params.id} stats:`, stats);
      
      // Disable caching to ensure fresh data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(stats);
    } catch (error) {
      console.error('[QUEUE STATS] Error:', error);
      res.status(500).json({ message: "Failed to fetch campaign queue stats" });
    }
  });

  app.get("/api/campaigns/:id/queue", requireAuth, async (req, res) => {
    try {
      const { status } = req.query;
      const queue = await storage.getCampaignQueue(
        req.params.id,
        status as string | undefined
      );
      res.json(queue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch campaign queue" });
    }
  });

  app.post("/api/campaigns/:id/queue/enqueue", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { contactId, accountId, priority = 0 } = req.body;

      if (!contactId || !accountId) {
        return res.status(400).json({ message: "contactId and accountId required" });
      }

      const queueItem = await storage.enqueueContact(
        req.params.id,
        contactId,
        accountId,
        priority
      );
      res.status(201).json(queueItem);
    } catch (error) {
      res.status(500).json({ message: "Failed to enqueue contact" });
    }
  });

  // Populate queue from campaign audience (segments/lists)
  app.post("/api/campaigns/:id/queue/populate", requireAuth, requireRole('admin', 'campaign_manager', 'agent'), async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Get audience refs from campaign
      const audienceRefs = campaign.audienceRefs as any;
      if (!audienceRefs) {
        return res.status(400).json({ message: "Campaign has no audience defined" });
      }

      let contacts: any[] = [];

      // Resolve contacts from segments
      if (audienceRefs.segments && Array.isArray(audienceRefs.segments)) {
        for (const segmentId of audienceRefs.segments) {
          const segment = await storage.getSegment(segmentId);
          if (segment && segment.definitionJson) {
            const segmentContacts = await storage.getContacts(segment.definitionJson as any);
            contacts.push(...segmentContacts);
          }
        }
      }

      // Resolve contacts from lists
      if (audienceRefs.lists && Array.isArray(audienceRefs.lists)) {
        for (const listId of audienceRefs.lists) {
          const list = await storage.getList(listId);
          if (list && list.recordIds) {
            const listContacts = await storage.getContactsByIds(list.recordIds);
            contacts.push(...listContacts);
          }
        }
      }

      // Remove duplicates
      const uniqueContacts = Array.from(
        new Map(contacts.map(c => [c.id, c])).values()
      );

      if (uniqueContacts.length === 0) {
        return res.status(400).json({ message: "No contacts found in campaign audience" });
      }

      // Filter out contacts without accountId
      const contactsWithAccount = uniqueContacts.filter(c => c.accountId);
      const skippedNoAccount = uniqueContacts.length - contactsWithAccount.length;

      if (contactsWithAccount.length === 0) {
        return res.status(400).json({
          message: "No contacts with account IDs found. All contacts must be associated with an account."
        });
      }

      // PHONE VALIDATION: Filter contacts with callable phone numbers (batch to avoid parameter limits)
      const contactIds = contactsWithAccount.map(c => c.id);
      const fullContacts: any[] = [];
      const batchSize = 500;
      for (let i = 0; i < contactIds.length; i += batchSize) {
        const batch = contactIds.slice(i, i + batchSize);
        const batchResults = await db
          .select()
          .from(contactsTable)
          .leftJoin(accountsTable, eq(contactsTable.accountId, accountsTable.id))
          .where(inArray(contactsTable.id, batch));
        fullContacts.push(...batchResults);
      }

      const contactsWithCallablePhones = fullContacts.filter(row => {
        const contact = row.contacts;
        const account = row.accounts;

        const bestPhone = getBestPhoneForContact({
          directPhone: contact.directPhone,
          directPhoneE164: contact.directPhoneE164,
          mobilePhone: contact.mobilePhone,
          mobilePhoneE164: contact.mobilePhoneE164,
          country: contact.country,
          hqPhone: account?.mainPhone,
          hqPhoneE164: account?.mainPhoneE164,
          hqCountry: account?.hqCountry,
        });

        return bestPhone.phone !== null;
      });

      const skippedNoPhone = contactsWithAccount.length - contactsWithCallablePhones.length;
      console.log(`[Queue Populate] Phone validation: ${contactsWithCallablePhones.length}/${contactsWithAccount.length} contacts have callable phones`);

      // Enqueue contacts with callable phones only
      const enqueued = [];
      let alreadyQueued = 0;
      for (const row of contactsWithCallablePhones) {
        try {
          const queueItem = await storage.enqueueContact(
            req.params.id,
            row.contacts.id,
            row.contacts.accountId!,
            100 // HIGH priority for fresh contacts (voicemail retries get 0-50)
          );
          enqueued.push(queueItem);
        } catch (error) {
          // Count contacts already in queue
          alreadyQueued++;
        }
      }

      // Get agents assigned to this campaign
      const campaignAgents = await storage.getCampaignAgents(req.params.id);
      const agentIds = campaignAgents.map(a => a.agentId);

      // Automatically assign queue items to agents if agents are assigned
      let assignResult = { assigned: 0 };
      if (agentIds.length > 0 && enqueued.length > 0) {
        assignResult = await storage.assignQueueToAgents(req.params.id, agentIds, 'round_robin');
      }

      res.json({
        message: `Successfully enqueued ${enqueued.length} contacts${skippedNoAccount > 0 ? ` (${skippedNoAccount} skipped without account)` : ''}${alreadyQueued > 0 ? ` (${alreadyQueued} already in queue)` : ''}`,
        enqueuedCount: enqueued.length,
        totalContacts: uniqueContacts.length,
        skippedCount: skippedNoAccount,
        alreadyQueued,
        queueItemsAssigned: assignResult.assigned,
      });
    } catch (error) {
      console.error('Queue population error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to populate queue"
      });
    }
  });

  app.patch("/api/campaigns/queue/:queueId/status", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { status, removedReason, isPositiveDisposition } = req.body;

      if (!status) {
        return res.status(400).json({ message: "status required" });
      }

      const updated = await storage.updateQueueStatus(
        req.params.queueId,
        status,
        removedReason,
        isPositiveDisposition
      );

      if (!updated) {
        return res.status(404).json({ message: "Queue item not found or status already changed" });
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update queue status" });
    }
  });

  app.delete("/api/campaigns/:id/queue/:queueId", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { reason = "Manual removal" } = req.body;

      await storage.removeFromQueueById(req.params.id, req.params.queueId, reason);
      res.status(204).send();
    } catch (error: any) {
      if (error?.message?.includes("not found") || error?.message?.includes("does not belong")) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to remove from queue" });
    }
  });

  // ==================== DUAL-DIALER (MANUAL & HYBRID) ====================

  // Set campaign dial mode
  app.post("/api/campaigns/:id/dial-mode", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { dialMode } = req.body;

      if (!['manual', 'hybrid', 'ai_agent'].includes(dialMode)) {
        return res.status(400).json({ message: "Invalid dial mode. Must be 'manual', 'hybrid', or 'ai_agent'" });
      }

      const campaign = await storage.updateCampaign(req.params.id, { dialMode });

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to update dial mode" });
    }
  });

  // Add contacts to manual queue (with filters)
  app.post("/api/campaigns/:id/manual/queue/add", requireAuth, requireRole('admin', 'campaign_manager', 'agent'), async (req, res) => {
    try {
      const { agentId, filters, contactIds, limit = 1000 } = req.body;

      if (!agentId) {
        return res.status(400).json({ message: "agentId is required" });
      }

      // Use ManualQueueService
      const { ManualQueueService } = await import('./services/manual-queue');
      const manualQueueService = new ManualQueueService();

      let actualFilters: any;

      if (contactIds && Array.isArray(contactIds) && contactIds.length > 0) {
        // Convert contact IDs to a filter
        actualFilters = {
          contactIds,
          industries: [],
          regions: [],
          accountTypes: []
        };
      } else if (filters) {
        // Use provided filters directly
        actualFilters = filters;
      } else {
        return res.status(400).json({ message: "Either contactIds or filters must be provided" });
      }

      const result = await manualQueueService.addContactsToAgentQueue(
        agentId,
        req.params.id,
        actualFilters,
        limit
      );

      console.log('[Manual Queue API] Result to send:', JSON.stringify(result));
      res.json(result);
    } catch (error) {
      console.error('Manual queue add error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to add to manual queue" });
    }
  });

  // Configure power dial settings (AMD + voicemail)
  app.post("/api/campaigns/:id/power/settings", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const powerSettings = req.body;

      const campaign = await storage.updateCampaign(req.params.id, {
        powerSettings: powerSettings
      } as any);

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to update power settings" });
    }
  });

  // Get manual queue for agent
  app.get("/api/campaigns/:id/manual/queue/:agentId", requireAuth, async (req, res) => {
    try {
      const { ManualQueueService } = await import('./services/manual-queue');
      const manualQueueService = new ManualQueueService();

      const queue = await manualQueueService.getAgentQueue(req.params.id, req.params.agentId);
      res.json(queue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch manual queue" });
    }
  });

  // Pull next contact from manual queue
  app.post("/api/campaigns/:id/manual/queue/pull", requireAuth, requireRole('agent', 'admin', 'campaign_manager'), async (req, res) => {
    try {
      const { agentId } = req.body;

      if (!agentId) {
        return res.status(400).json({ message: "agentId is required" });
      }

      const { ManualQueueService } = await import('./services/manual-queue');
      const manualQueueService = new ManualQueueService();

      const contact = await manualQueueService.pullNextContact(req.params.id, agentId);

      if (!contact) {
        return res.status(404).json({ message: "No contacts available in queue" });
      }

      res.json(contact);
    } catch (error) {
      console.error('Manual queue pull error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to pull contact from queue" });
    }
  });

  // Process AMD webhook from Telnyx
  app.post("/api/telephony/events/amd", requireAuth, async (req, res) => {
    try {
      const { callAttemptId, result, confidence } = req.body;

      if (!callAttemptId || !result) {
        return res.status(400).json({ message: "callAttemptId and result are required" });
      }

      const { powerDialerEngine } = await import('./services/auto-dialer');

      await powerDialerEngine.processAMDResult(callAttemptId, {
        result,
        confidence: confidence || 0.0
      });

      res.json({ message: "AMD result processed successfully" });
    } catch (error) {
      console.error('AMD processing error:', error);
      res.status(500).json({ message: "Failed to process AMD result" });
    }
  });

  // Get pacing metrics for campaign
  app.get("/api/campaigns/:id/pacing-metrics", requireAuth, async (req, res) => {
    try {
      const { powerDialerEngine } = await import('./services/auto-dialer');

      const metrics = powerDialerEngine.getPacingMetrics(req.params.id);

      if (!metrics) {
        return res.json({
          callsInitiated: 0,
          callsAnswered: 0,
          callsAbandoned: 0,
          abandonRate: 0,
          targetAbandonRate: 0.03,
          currentDialRatio: 1.0
        });
      }

      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pacing metrics" });
    }
  });

  app.get("/api/campaigns/:id/account-stats", requireAuth, async (req, res) => {
    try {
      const { accountId } = req.query;
      const stats = await storage.getCampaignAccountStats(
        req.params.id,
        accountId as string | undefined
      );
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch account stats" });
    }
  });

  app.post("/api/campaigns/:id/enforce-cap", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const result = await storage.enforceAccountCap(req.params.id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to enforce account cap" });
    }
  });

  // ==================== AGENT ASSIGNMENT & QUEUE ====================

  // Get all agents
  app.get("/api/agents", requireAuth, async (req, res) => {
    try {
      const agents = await storage.getAgents();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch agents" });
    }
  });

  // Assign or re-assign queue items to agents
  app.post("/api/campaigns/:id/queue/assign", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { agentIds, mode = 'round_robin', reassignAll = false } = req.body;

      if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
        return res.status(400).json({ message: "agentIds array is required" });
      }

      // If reassignAll is true, first clear all agent assignments for this campaign
      if (reassignAll) {
        await db
          .update(campaignQueue)
          .set({ agentId: null, updatedAt: new Date() })
          .where(
            and(
              eq(campaignQueue.campaignId, req.params.id),
              eq(campaignQueue.status, 'queued')
            )
          );
      }

      const result = await storage.assignQueueToAgents(req.params.id, agentIds, mode);
      res.json({
        ...result,
        message: reassignAll
          ? `Re-assigned all queue items to ${agentIds.length} agent(s)`
          : `Assigned unassigned queue items to ${agentIds.length} agent(s)`
      });
    } catch (error) {
      console.error('Queue assignment error:', error);
      res.status(500).json({ message: "Failed to assign queue to agents" });
    }
  });

  // Get queue for logged-in agent (mode-aware: campaign_queue for power, agent_queue for manual)
  app.get("/api/agents/me/queue", requireAuth, requireRole('agent'), async (req, res) => {
    try {
      const agentId = req.user?.userId;
      if (!agentId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let { campaignId, status } = req.query;

      console.log(`[AGENT QUEUE] Fetching queue for agent ${agentId}, campaign: ${campaignId}, status: ${status}`);

      // If no campaignId specified, automatically detect agent's active campaign assignment
      if (!campaignId) {
        const activeAssignment = await db
          .select({ campaignId: campaignAgentAssignments.campaignId })
          .from(campaignAgentAssignments)
          .where(
            and(
              eq(campaignAgentAssignments.agentId, agentId),
              eq(campaignAgentAssignments.isActive, true)
            )
          )
          .limit(1);

        if (activeAssignment[0]) {
          campaignId = activeAssignment[0].campaignId;
          console.log(`[AGENT QUEUE] Auto-detected active campaign: ${campaignId}`);
        } else {
          console.log(`[AGENT QUEUE] No active campaign assignment found for agent ${agentId}`);
          return res.json([]);
        }
      }

      // If campaignId is specified (or auto-detected), check dial mode to determine which queue to use
      if (campaignId) {
        const campaign = await storage.getCampaign(campaignId as string);

        if (!campaign) {
          return res.status(404).json({ message: "Campaign not found" });
        }

        console.log(`[AGENT QUEUE] Campaign ${campaignId} dial mode: ${campaign.dialMode}`);

        if (campaign?.dialMode === 'manual' || campaign?.dialMode === 'ai_agent') {
          // Manual dial or AI Agent: query agent_queue (manual pull queue)
          const manualQueue = await db
            .select({
              id: agentQueue.id,
              campaignId: agentQueue.campaignId,
              campaignName: campaigns.name,
              contactId: agentQueue.contactId,
              contactName: sql<string>`COALESCE(${contacts.fullName}, CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}))`.as('contactName'),
              contactEmail: contacts.email,
              // Get all phone fields to determine best phone
              contactDirectPhone: contacts.directPhone,
              contactDirectPhoneE164: contacts.directPhoneE164,
              contactMobilePhone: contacts.mobilePhone,
              contactMobilePhoneE164: contacts.mobilePhoneE164,
              contactCountry: contacts.country,
              accountId: agentQueue.accountId,
              accountName: accounts.name,
              accountHqPhone: accounts.mainPhone,
              accountHqPhoneE164: accounts.mainPhoneE164,
              accountHqCountry: accounts.hqCountry,
              priority: agentQueue.priority,
              status: agentQueue.queueState,
              createdAt: agentQueue.createdAt,
              updatedAt: agentQueue.updatedAt,
            })
            .from(agentQueue)
            .leftJoin(contacts, eq(agentQueue.contactId, contacts.id))
            .leftJoin(accounts, eq(agentQueue.accountId, accounts.id))
            .leftJoin(campaigns, eq(agentQueue.campaignId, campaigns.id))
            .where(
              and(
                eq(agentQueue.agentId, agentId),
                eq(agentQueue.campaignId, campaignId as string),
                status ? eq(agentQueue.queueState, status as any) : eq(agentQueue.queueState, 'queued'),
                // CRITICAL FIX: Only return items that are ready to be worked (scheduled date has passed or no schedule)
                or(
                  isNull(agentQueue.scheduledFor),
                  lte(agentQueue.scheduledFor, new Date())
                )
              )
            )
            .orderBy(desc(agentQueue.priority), agentQueue.createdAt);

          console.log('[AGENT QUEUE] Raw manualQueue from DB:', JSON.stringify(manualQueue, null, 2));

          // Process each queue item to get best phone
          const processedQueue = manualQueue.map(item => {
            const bestPhone = getBestPhoneForContact({
              directPhone: item.contactDirectPhone,
              directPhoneE164: item.contactDirectPhoneE164,
              mobilePhone: item.contactMobilePhone,
              mobilePhoneE164: item.contactMobilePhoneE164,
              country: item.contactCountry,
              hqPhone: item.accountHqPhone,
              hqPhoneE164: item.accountHqPhoneE164,
              hqCountry: item.accountHqCountry,
            });

            return {
              id: item.id,
              campaignId: item.campaignId,
              campaignName: item.campaignName,
              contactId: item.contactId,
              contactName: item.contactName,
              contactEmail: item.contactEmail,
              contactPhone: bestPhone.phone,
              phoneType: bestPhone.type,
              accountId: item.accountId,
              accountName: item.accountName,
              priority: item.priority,
              status: item.status,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            };
          });

          console.log(`[AGENT QUEUE] Manual queue returned ${processedQueue.length} items`);
          return res.json(processedQueue);
        } else if (campaign?.dialMode === 'hybrid' || campaign?.dialMode === 'ai_agent') {
          // HYBRID MODE (humans + AI share queue) or AI_AGENT MODE: query campaign_queue (auto-assigned queue)
          const sharedQueue = await db
            .select({
              id: campaignQueue.id,
              campaignId: campaignQueue.campaignId,
              campaignName: campaigns.name,
              contactId: campaignQueue.contactId,
              contactName: sql<string>`COALESCE(${contacts.fullName}, CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}))`.as('contactName'),
              contactEmail: contacts.email,
              // Get all phone fields to determine best phone
              contactDirectPhone: contacts.directPhone,
              contactDirectPhoneE164: contacts.directPhoneE164,
              contactMobilePhone: contacts.mobilePhone,
              contactMobilePhoneE164: contacts.mobilePhoneE164,
              contactCountry: contacts.country,
              accountId: campaignQueue.accountId,
              accountName: accounts.name,
              accountHqPhone: accounts.mainPhone,
              accountHqPhoneE164: accounts.mainPhoneE164,
              accountHqCountry: accounts.hqCountry,
              priority: campaignQueue.priority,
              status: campaignQueue.status,
              createdAt: campaignQueue.createdAt,
              updatedAt: campaignQueue.updatedAt,
            })
            .from(campaignQueue)
            .leftJoin(contacts, eq(campaignQueue.contactId, contacts.id))
            .leftJoin(accounts, eq(campaignQueue.accountId, accounts.id))
            .leftJoin(campaigns, eq(campaignQueue.campaignId, campaigns.id))
            .where(
              and(
                eq(campaignQueue.agentId, agentId),
                eq(campaignQueue.campaignId, campaignId as string),
                status ? eq(campaignQueue.status, status as any) : eq(campaignQueue.status, 'queued')
              )
            )
            .orderBy(desc(campaignQueue.priority), campaignQueue.createdAt);

          console.log('[AGENT QUEUE] Raw sharedQueue from DB:', JSON.stringify(sharedQueue, null, 2));

          // Process each queue item to get best phone
          const processedQueue = sharedQueue.map(item => {
            const bestPhone = getBestPhoneForContact({
              directPhone: item.contactDirectPhone,
              directPhoneE164: item.contactDirectPhoneE164,
              mobilePhone: item.contactMobilePhone,
              mobilePhoneE164: item.contactMobilePhoneE164,
              country: item.contactCountry,
              hqPhone: item.accountHqPhone,
              hqPhoneE164: item.accountHqPhoneE164,
              hqCountry: item.accountHqCountry,
            });

            return {
              id: item.id,
              campaignId: item.campaignId,
              campaignName: item.campaignName,
              contactId: item.contactId,
              contactName: item.contactName,
              contactEmail: item.contactEmail,
              contactPhone: bestPhone.phone,
              phoneType: bestPhone.type,
              accountId: item.accountId,
              accountName: item.accountName,
              priority: item.priority,
              status: item.status,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            };
          });

          console.log(`[AGENT QUEUE] ${campaign?.dialMode === 'hybrid' ? 'Hybrid' : 'AI'} queue returned ${processedQueue.length} items`);
          return res.json(processedQueue);
        }
      }

      // Fallback: no campaign specified, return empty array
      console.log(`[AGENT QUEUE] No campaign specified, returning empty array`);
      res.json([]);
    } catch (error) {
      console.error('Agent queue fetch error:', error);
      res.status(500).json({ message: "Failed to fetch agent queue" });
    }
  });

  // Get agent's active campaign assignment
  app.get("/api/agents/me/active-campaign", requireAuth, requireRole('agent'), async (req, res) => {
    try {
      const agentId = req.user?.userId;
      if (!agentId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const activeAssignment = await db
        .select({
          campaignId: campaignAgentAssignments.campaignId,
          campaignName: campaigns.name,
          assignedAt: campaignAgentAssignments.assignedAt,
        })
        .from(campaignAgentAssignments)
        .leftJoin(campaigns, eq(campaignAgentAssignments.campaignId, campaigns.id))
        .where(
          and(
            eq(campaignAgentAssignments.agentId, agentId),
            eq(campaignAgentAssignments.isActive, true)
          )
        )
        .limit(1);

      if (activeAssignment[0]) {
        console.log(`[ACTIVE CAMPAIGN] Agent ${agentId} is assigned to campaign ${activeAssignment[0].campaignId}`);
        return res.json(activeAssignment[0]);
      } else {
        console.log(`[ACTIVE CAMPAIGN] No active campaign assignment found for agent ${agentId}`);
        return res.json(null);
      }
    } catch (error) {
      console.error('Active campaign fetch error:', error);
      res.status(500).json({ message: "Failed to fetch active campaign" });
    }
  });

  // ==================== CALL ATTEMPTS ====================

  // In-memory store for active human agent calls (tracks call bridging state)
  const activeHumanCalls = new Map<string, {
    agentCallId: string;
    prospectCallId?: string;
    agentId: string;
    prospectNumber: string;
    status: 'calling_agent' | 'agent_connected' | 'calling_prospect' | 'bridged' | 'ended';
    startedAt: Date;
    campaignId?: string;
    contactId?: string;
    queueItemId?: string;
  }>();

  // Start a human-agent call via Telnyx Call Control (click-to-call flow)
  // Flow: 1) Call agent's callback phone, 2) When answered, bridge to prospect
  app.post("/api/calls/start", requireAuth, async (req, res) => {
    try {
      const { to, campaignId, contactId, queueItemId, mode = 'callback' } = req.body as {
        to?: string;
        campaignId?: string;
        contactId?: string;
        queueItemId?: string;
        mode?: 'callback' | 'direct'; // callback = call agent first, direct = legacy behavior
      };

      if (!to || typeof to !== "string") {
        return res.status(400).json({ message: "Missing required field: to" });
      }

      const agentId = req.user?.userId;
      if (!agentId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const telnyxApiKey = process.env.TELNYX_API_KEY;
      if (!telnyxApiKey) {
        return res.status(500).json({ message: "TELNYX_API_KEY not configured" });
      }

      const connectionId =
        process.env.TELNYX_CALL_CONTROL_APP_ID ||
        process.env.TELNYX_CONNECTION_ID;
      // Use dedicated human agent from number, fall back to default
      const fromNumber = process.env.TELNYX_HUMAN_AGENT_FROM_NUMBER || process.env.TELNYX_FROM_NUMBER;

      if (!connectionId) {
        return res.status(500).json({ message: "TELNYX connection ID not configured" });
      }
      if (!fromNumber) {
        return res.status(500).json({ message: "TELNYX_HUMAN_AGENT_FROM_NUMBER or TELNYX_FROM_NUMBER not configured" });
      }

      // Get agent's callback phone for click-to-call mode
      let agentCallbackPhone: string | null = null;
      if (mode === 'callback') {
        const [agent] = await db
          .select({ callbackPhone: users.callbackPhone })
          .from(users)
          .where(eq(users.id, agentId))
          .limit(1);

        agentCallbackPhone = agent?.callbackPhone || null;

        if (!agentCallbackPhone) {
          return res.status(400).json({
            message: "No callback phone configured. Please set your callback phone in Settings > Telephony.",
            code: "NO_CALLBACK_PHONE"
          });
        }
      }

      // For callback mode: Call the agent first
      if (mode === 'callback' && agentCallbackPhone) {
        console.log(`[CALL START] ========================================`);
        console.log(`[CALL START] Callback mode - calling agent`);
        console.log(`[CALL START] Agent Callback Phone: ${agentCallbackPhone}`);
        console.log(`[CALL START] Prospect Number: ${to}`);

        // Debug: Log webhook URL construction
        const webhookUrl = `${process.env.PUBLIC_WEBHOOK_HOST ? 'https://' + process.env.PUBLIC_WEBHOOK_HOST : ''}/api/webhooks/human-call`;
        console.log(`[CALL START] Webhook URL: ${webhookUrl}`);
        console.log(`[CALL START] PUBLIC_WEBHOOK_HOST: ${process.env.PUBLIC_WEBHOOK_HOST || 'NOT SET'}`);
        console.log(`[CALL START] Connection ID: ${connectionId}`);
        console.log(`[CALL START] From Number: ${fromNumber}`);
        console.log(`[CALL START] ========================================`);

        // Create client_state to track the call context
        const clientState = Buffer.from(JSON.stringify({
          type: 'human_agent_callback',
          agentId,
          prospectNumber: to,
          campaignId,
          contactId,
          queueItemId,
        })).toString('base64');

        const response = await fetch("https://api.telnyx.com/v2/calls", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${telnyxApiKey}`,
          },
          body: JSON.stringify({
            connection_id: connectionId,
            to: agentCallbackPhone,
            from: fromNumber,
            client_state: clientState,
            webhook_url: webhookUrl,
            answering_machine_detection: "disabled", // No AMD for agent leg
          }),
        });

        const responseText = await response.text();
        console.log(`[CALL START] Telnyx API Response Status: ${response.status}`);
        console.log(`[CALL START] Telnyx API Response: ${responseText}`);

        if (!response.ok) {
          console.error(`[CALL START] Telnyx API error: ${response.status} - ${responseText}`);
          return res.status(502).json({
            message: "Failed to call agent phone",
            status: response.status,
            details: responseText,
          });
        }

        const result = JSON.parse(responseText);
        const agentCallControlId = result.data?.call_control_id;

        if (!agentCallControlId) {
          return res.status(502).json({ message: "Telnyx call_control_id missing from response" });
        }

        // Track this call session
        activeHumanCalls.set(agentCallControlId, {
          agentCallId: agentCallControlId,
          agentId,
          prospectNumber: to,
          status: 'calling_agent',
          startedAt: new Date(),
          campaignId,
          contactId,
          queueItemId,
        });

        console.log(`[CALL START] Agent call initiated: ${agentCallControlId}, will bridge to ${to} when answered`);

        res.json({
          success: true,
          callControlId: agentCallControlId,
          mode: 'callback',
          status: 'calling_agent',
          from: fromNumber,
          agentPhone: agentCallbackPhone,
          prospectPhone: to,
        });

      } else {
        // Direct mode - call prospect directly (audio via ngrok WebSocket streaming)
        console.log(`[CALL START] ========================================`);
        console.log(`[CALL START] Direct mode - calling prospect at ${to}`);
        console.log(`[CALL START] From: ${fromNumber}`);
        console.log(`[CALL START] Connection ID: ${connectionId}`);

        // Debug: Log webhook URL construction for direct mode
        const webhookUrl = `${process.env.PUBLIC_WEBHOOK_HOST ? 'https://' + process.env.PUBLIC_WEBHOOK_HOST : ''}/api/webhooks/human-call`;
        console.log(`[CALL START] Webhook URL: ${webhookUrl}`);
        console.log(`[CALL START] ========================================`);

        // Create client_state to track the direct call context
        const clientState = Buffer.from(JSON.stringify({
          type: 'human_agent_direct',
          agentId,
          prospectNumber: to,
          campaignId,
          contactId,
          queueItemId,
        })).toString('base64');

        const response = await fetch("https://api.telnyx.com/v2/calls", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${telnyxApiKey}`,
          },
          body: JSON.stringify({
            connection_id: connectionId,
            to,
            from: fromNumber,
            client_state: clientState,
            webhook_url: webhookUrl,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[CALL START] Telnyx API error: ${response.status} - ${errorText}`);
          return res.status(502).json({
            message: "Failed to initiate Telnyx call",
            status: response.status,
          });
        }

        const result = await response.json();
        const callControlId = result.data?.call_control_id;

        if (!callControlId) {
          return res.status(502).json({ message: "Telnyx call_control_id missing from response" });
        }

        // Track this direct call session for status polling
        activeHumanCalls.set(callControlId, {
          agentCallId: callControlId,
          agentId,
          prospectNumber: to,
          status: 'calling_prospect',
          startedAt: new Date(),
          campaignId,
          contactId,
          queueItemId,
        });

        console.log(`[CALL START] Direct call initiated: ${callControlId} to ${to}`);

        res.json({
          success: true,
          callControlId,
          mode: 'direct',
          from: fromNumber,
          to,
        });
      }
    } catch (error) {
      console.error("[CALL START] Error:", error);
      res.status(500).json({
        message: "Failed to start call",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Bridge agent call to prospect (called when agent answers callback)
  app.post("/api/calls/bridge", requireAuth, async (req, res) => {
    try {
      const { agentCallControlId } = req.body as { agentCallControlId?: string };

      if (!agentCallControlId) {
        return res.status(400).json({ message: "Missing agentCallControlId" });
      }

      const callSession = activeHumanCalls.get(agentCallControlId);
      if (!callSession) {
        return res.status(404).json({ message: "Call session not found" });
      }

      const telnyxApiKey = process.env.TELNYX_API_KEY;
      const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID || process.env.TELNYX_CONNECTION_ID;
      const fromNumber = process.env.TELNYX_HUMAN_AGENT_FROM_NUMBER || process.env.TELNYX_FROM_NUMBER;

      // Call the prospect
      callSession.status = 'calling_prospect';

      const response = await fetch("https://api.telnyx.com/v2/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({
          connection_id: connectionId,
          to: callSession.prospectNumber,
          from: fromNumber,
          answering_machine_detection: "detect_words",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CALL BRIDGE] Failed to call prospect: ${errorText}`);
        return res.status(502).json({ message: "Failed to call prospect" });
      }

      const result = await response.json();
      const prospectCallId = result.data?.call_control_id;

      callSession.prospectCallId = prospectCallId;

      // Bridge the two calls together
      const bridgeResponse = await fetch(`https://api.telnyx.com/v2/calls/${agentCallControlId}/actions/bridge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({
          call_control_id: prospectCallId,
        }),
      });

      if (!bridgeResponse.ok) {
        const errorText = await bridgeResponse.text();
        console.error(`[CALL BRIDGE] Failed to bridge calls: ${errorText}`);
        return res.status(502).json({ message: "Failed to bridge calls" });
      }

      callSession.status = 'bridged';
      console.log(`[CALL BRIDGE] Calls bridged: agent=${agentCallControlId}, prospect=${prospectCallId}`);

      res.json({
        success: true,
        agentCallId: agentCallControlId,
        prospectCallId,
        status: 'bridged',
      });
    } catch (error) {
      console.error("[CALL BRIDGE] Error:", error);
      res.status(500).json({
        message: "Failed to bridge call",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get call session status
  app.get("/api/calls/:callControlId/status", requireAuth, async (req, res) => {
    const { callControlId } = req.params;
    const session = activeHumanCalls.get(callControlId);

    if (!session) {
      return res.status(404).json({ message: "Call session not found" });
    }

    res.json({
      ...session,
      duration: Math.floor((Date.now() - session.startedAt.getTime()) / 1000),
    });
  });

  // Transfer call to another number
  app.post("/api/calls/transfer", requireAuth, async (req, res) => {
    try {
      const { callControlId, transferTo } = req.body as { callControlId?: string; transferTo?: string };

      if (!callControlId || !transferTo) {
        return res.status(400).json({ message: "Missing callControlId or transferTo" });
      }

      const telnyxApiKey = process.env.TELNYX_API_KEY;
      if (!telnyxApiKey) {
        return res.status(500).json({ message: "TELNYX_API_KEY not configured" });
      }

      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({
          to: transferTo,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CALL TRANSFER] Telnyx API error: ${response.status} - ${errorText}`);
        return res.status(502).json({
          message: "Failed to transfer call",
          status: response.status,
        });
      }

      console.log(`[CALL TRANSFER] Call ${callControlId} transferred to ${transferTo}`);
      res.json({ success: true, transferredTo: transferTo });
    } catch (error) {
      console.error("[CALL TRANSFER] Error:", error);
      res.status(500).json({
        message: "Failed to transfer call",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Hold call
  app.post("/api/calls/hold", requireAuth, async (req, res) => {
    try {
      const { callControlId } = req.body as { callControlId?: string };

      if (!callControlId) {
        return res.status(400).json({ message: "Missing callControlId" });
      }

      const telnyxApiKey = process.env.TELNYX_API_KEY;
      if (!telnyxApiKey) {
        return res.status(500).json({ message: "TELNYX_API_KEY not configured" });
      }

      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hold`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CALL HOLD] Telnyx API error: ${response.status} - ${errorText}`);
        return res.status(502).json({
          message: "Failed to hold call",
          status: response.status,
        });
      }

      console.log(`[CALL HOLD] Call ${callControlId} put on hold`);
      res.json({ success: true, held: true });
    } catch (error) {
      console.error("[CALL HOLD] Error:", error);
      res.status(500).json({
        message: "Failed to hold call",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Unhold (resume) call
  app.post("/api/calls/unhold", requireAuth, async (req, res) => {
    try {
      const { callControlId } = req.body as { callControlId?: string };

      if (!callControlId) {
        return res.status(400).json({ message: "Missing callControlId" });
      }

      const telnyxApiKey = process.env.TELNYX_API_KEY;
      if (!telnyxApiKey) {
        return res.status(500).json({ message: "TELNYX_API_KEY not configured" });
      }

      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/unhold`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CALL UNHOLD] Telnyx API error: ${response.status} - ${errorText}`);
        return res.status(502).json({
          message: "Failed to resume call",
          status: response.status,
        });
      }

      console.log(`[CALL UNHOLD] Call ${callControlId} resumed`);
      res.json({ success: true, held: false });
    } catch (error) {
      console.error("[CALL UNHOLD] Error:", error);
      res.status(500).json({
        message: "Failed to resume call",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Hang up a manual call via Telnyx Call Control (server-side)
  app.post("/api/calls/hangup", requireAuth, async (req, res) => {
    try {
      const { callControlId } = req.body as { callControlId?: string };
      if (!callControlId || typeof callControlId !== "string") {
        return res.status(400).json({ message: "Missing required field: callControlId" });
      }

      const telnyxApiKey = process.env.TELNYX_API_KEY;
      if (!telnyxApiKey) {
        return res.status(500).json({ message: "TELNYX_API_KEY not configured" });
      }

      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CALL HANGUP] Telnyx API error: ${response.status} - ${errorText}`);
        return res.status(502).json({
          message: "Failed to hang up Telnyx call",
          status: response.status,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[CALL HANGUP] Error:", error);
      res.status(500).json({
        message: "Failed to hang up call",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Send DTMF tones during a call via Telnyx Call Control
  app.post("/api/calls/dtmf", requireAuth, async (req, res) => {
    try {
      const { callControlId, digit } = req.body as { callControlId?: string; digit?: string };
      if (!callControlId || typeof callControlId !== "string") {
        return res.status(400).json({ message: "Missing required field: callControlId" });
      }
      if (!digit || typeof digit !== "string" || !/^[0-9*#]+$/.test(digit)) {
        return res.status(400).json({ message: "Invalid DTMF digit(s)" });
      }

      const telnyxApiKey = process.env.TELNYX_API_KEY;
      if (!telnyxApiKey) {
        return res.status(500).json({ message: "TELNYX_API_KEY not configured" });
      }

      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/send_dtmf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({ digits: digit }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CALL DTMF] Telnyx API error: ${response.status} - ${errorText}`);
        return res.status(502).json({
          message: "Failed to send DTMF",
          status: response.status,
        });
      }

      res.json({ success: true, digit });
    } catch (error) {
      console.error("[CALL DTMF] Error:", error);
      res.status(500).json({
        message: "Failed to send DTMF",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Mute call via Telnyx Call Control
  app.post("/api/calls/mute", requireAuth, async (req, res) => {
    try {
      const { callControlId } = req.body as { callControlId?: string };
      if (!callControlId || typeof callControlId !== "string") {
        return res.status(400).json({ message: "Missing required field: callControlId" });
      }

      const telnyxApiKey = process.env.TELNYX_API_KEY;
      if (!telnyxApiKey) {
        return res.status(500).json({ message: "TELNYX_API_KEY not configured" });
      }

      // Telnyx uses client_mute_on action to mute the agent's microphone
      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/client_mute_on`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CALL MUTE] Telnyx API error: ${response.status} - ${errorText}`);
        return res.status(502).json({
          message: "Failed to mute call",
          status: response.status,
        });
      }

      res.json({ success: true, muted: true });
    } catch (error) {
      console.error("[CALL MUTE] Error:", error);
      res.status(500).json({
        message: "Failed to mute call",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Unmute call via Telnyx Call Control
  app.post("/api/calls/unmute", requireAuth, async (req, res) => {
    try {
      const { callControlId } = req.body as { callControlId?: string };
      if (!callControlId || typeof callControlId !== "string") {
        return res.status(400).json({ message: "Missing required field: callControlId" });
      }

      const telnyxApiKey = process.env.TELNYX_API_KEY;
      if (!telnyxApiKey) {
        return res.status(500).json({ message: "TELNYX_API_KEY not configured" });
      }

      // Telnyx uses client_mute_off action to unmute the agent's microphone
      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/client_mute_off`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CALL UNMUTE] Telnyx API error: ${response.status} - ${errorText}`);
        return res.status(502).json({
          message: "Failed to unmute call",
          status: response.status,
        });
      }

      res.json({ success: true, muted: false });
    } catch (error) {
      console.error("[CALL UNMUTE] Error:", error);
      res.status(500).json({
        message: "Failed to unmute call",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Create call attempt when call connects (before disposition)
  app.post("/api/call-attempts/start", requireAuth, async (req, res) => {
    try {
      // Accept either telnyxCallId or callControlId (callControlId is the new name)
      const { campaignId, contactId, telnyxCallId, callControlId, dialedNumber } = req.body;
      const actualCallId = telnyxCallId || callControlId; // Support both names
      const agentId = req.user?.userId;

      if (!agentId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!campaignId || !contactId || !actualCallId) {
        return res.status(400).json({
          message: "Missing required fields: campaignId, contactId, telnyxCallId/callControlId"
        });
      }

      const { callAttempts } = await import('@shared/schema');

      // Create call attempt record
      const [attempt] = await db
        .insert(callAttempts)
        .values({
          campaignId,
          contactId,
          agentId,
          telnyxCallId: actualCallId,
          startedAt: new Date(),
        })
        .returning();

      console.log('[CALL-ATTEMPT] Created call attempt:', attempt.id);

      res.json({
        success: true,
        attemptId: attempt.id,
      });
    } catch (error) {
      console.error('[CALL-ATTEMPT] Error creating call attempt:', error);
      res.status(500).json({ 
        message: "Failed to create call attempt",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ==================== CONTACT SWITCHING (WRONG PERSON ANSWERED) ====================

  // Switch contact during active call (wrong person answered scenario)
  app.post("/api/call-attempts/:attemptId/contact-switch", requireAuth, async (req, res) => {
    try {
      const { attemptId } = req.params;
      const { newContactId, createContact } = req.body;
      const agentId = req.user?.userId;

      if (!agentId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Validate input: must provide either newContactId or createContact
      if (!newContactId && !createContact) {
        return res.status(400).json({ 
          message: "Must provide either newContactId or createContact data" 
        });
      }

      const { callAttempts } = await import('@shared/schema');

      // Get the call attempt
      const [attempt] = await db
        .select()
        .from(callAttempts)
        .where(eq(callAttempts.id, attemptId))
        .limit(1);

      if (!attempt) {
        return res.status(404).json({ message: "Call attempt not found" });
      }

      // Verify ownership (agent must be assigned to this call)
      const isAdmin = req.user?.roles?.includes('admin') || req.user?.role === 'admin';
      if (attempt.agentId !== agentId && !isAdmin) {
        return res.status(403).json({ 
          message: "Not authorized to modify this call attempt" 
        });
      }

      let actualContactId = newContactId;

      // If creating a new contact
      if (createContact) {
        const { firstName, lastName, title, email, directPhone, accountId } = createContact;

        if (!firstName || !lastName || !email || !accountId) {
          return res.status(400).json({ 
            message: "Missing required fields for creating contact" 
          });
        }

        // Check if contact already exists with this email
        const existingContact = await db
          .select()
          .from(contactsTable)
          .where(
            and(
              eq(contactsTable.accountId, accountId),
              eq(contactsTable.email, email.toLowerCase())
            )
          )
          .limit(1);

        if (existingContact.length > 0) {
          // Use existing contact
          actualContactId = existingContact[0].id;
          console.log('[CONTACT-SWITCH] Using existing contact:', actualContactId);
        } else {
          // Create new contact
          const [newContact] = await db
            .insert(contactsTable)
            .values({
              firstName: normalizeName(firstName),
              lastName: normalizeName(lastName),
              fullName: normalizeName(`${firstName} ${lastName}`),
              email: email.toLowerCase(),
              jobTitle: title || null,
              directPhone: directPhone ? normalizePhoneE164(directPhone) : null,
              accountId,
              ownerId: agentId,
            })
            .returning();

          actualContactId = newContact.id;
          console.log('[CONTACT-SWITCH] Created new contact:', actualContactId);
        }
      }

      // Update call attempt with contact switch tracking
      const originalContactId = attempt.originalContactId || attempt.contactId;

      const [updatedAttempt] = await db
        .update(callAttempts)
        .set({
          originalContactId, // Preserve who was originally dialed
          actualContactId,   // Set who actually answered
          contactId: actualContactId, // Update main contactId to actual person
          wrongPersonAnswered: true,
        })
        .where(eq(callAttempts.id, attemptId))
        .returning();

      console.log('[CONTACT-SWITCH] Updated call attempt:', {
        attemptId,
        originalContactId,
        actualContactId,
        wrongPersonAnswered: true,
      });

      res.json({
        success: true,
        attempt: updatedAttempt,
        message: "Contact switched successfully",
      });
    } catch (error) {
      console.error('[CONTACT-SWITCH] Error switching contact:', error);
      res.status(500).json({ 
        message: "Failed to switch contact",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ==================== CALL DISPOSITIONS ====================

  // Create call disposition (agent saves disposition after call)
  app.post("/api/calls/disposition", requireAuth, async (req, res) => {
    try {
      const agentId = req.user?.userId;
      if (!agentId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      console.log('[DISPOSITION] Received disposition request:', {
        disposition: req.body.disposition,
        contactId: req.body.contactId,
        campaignId: req.body.campaignId,
        queueItemId: req.body.queueItemId
      });

      // Check if user is admin
      const userRoles = req.user?.roles || [req.user?.role];
      const isAdmin = userRoles.includes('admin');

      // STRICT: Verify queue item ownership before allowing disposition (unless admin)
      if (req.body.queueItemId) {
        const queueItem = await storage.getQueueItemById(req.body.queueItemId);
        if (!queueItem) {
          return res.status(404).json({ message: "Queue item not found" });
        }

        // STRICT: Only allow disposition if the queue item is assigned to this agent (or admin)
        if (!isAdmin && queueItem.agentId !== agentId) {
          return res.status(403).json({ message: "You can only create dispositions for queue items assigned to you" });
        }
      }

      // Build the call data object manually to avoid schema validation issues
      const callData = {
        agentId,
        campaignId: req.body.campaignId,
        contactId: req.body.contactId,
        queueItemId: req.body.queueItemId,
        disposition: req.body.disposition,
        duration: req.body.duration || 0,
        notes: req.body.notes || null,
        qualificationData: req.body.qualificationData || null,
        callbackRequested: req.body.callbackRequested || false,
        telnyxCallId: req.body.telnyxCallId || null,
        dialedNumber: req.body.dialedNumber || null, // Capture dialed phone number from frontend
      };

      const call = await storage.createCallDisposition(callData);

      // ==================== INTELLIGENT DISPOSITION HANDLING ====================
      // Check for specific dispositions and perform associated actions

      const disposition = req.body.disposition;
      const contactId = req.body.contactId;
      const campaignId = req.body.campaignId;

      // Get contact details for suppression actions
      let contact = null;
      let account = null;
      if (contactId) {
        try {
          contact = await storage.getContact(contactId);
          // Also fetch account to get company main phone
          if (contact && contact.accountId) {
            account = await storage.getAccount(contact.accountId);
          }
        } catch (error) {
          console.error('[DISPOSITION] Error fetching contact:', error);
        }
      }

      // 1. DNC REQUEST - Add CONTACT to global Do Not Call list
      // NOTE: We add the CONTACT to DNC, not the phone numbers, because multiple contacts
      // may share the same company phone. We don't want to block everyone at that company.
      if (disposition === 'dnc-request' && contact && contactId) {
        try {
          console.log(`[DISPOSITION] DNC request for contact ${contactId}`);
          console.log(`[DISPOSITION] Contact: ${contact.firstName} ${contact.lastName} (${contact.email})`);
          console.log(`[DISPOSITION] Company: ${account?.name || 'N/A'}`);

          // Add CONTACT to global DNC list (not phone numbers!)
          const { globalDnc } = await import('@shared/schema');

          await db.insert(globalDnc)
            .values({
              contactId: contactId,
              phoneE164: contact.directPhoneE164 || contact.mobilePhoneE164 || account?.mainPhoneE164 || null,
              reason: 'DNC request from agent',
              source: `Agent Console - ${agentId}`,
              createdBy: agentId,
            })
            .onConflictDoNothing(); // Ignore if already in DNC

          console.log(`[DISPOSITION] ✅ Contact ${contactId} added to global DNC - will NEVER be called again`);
        } catch (error) {
          console.error('[DISPOSITION] ❌ Error adding contact to DNC:', error);
        }
      }

      // 2. NOT INTERESTED - Add to campaign-specific suppression (not global)
      if (disposition === 'not_interested') {
        if (contact && contactId && campaignId) {
          try {
            console.log(`[DISPOSITION] Not Interested - adding to campaign suppression for contact ${contactId} in campaign ${campaignId}`);

            // Add contact to THIS campaign's suppression list (prevents re-calling in this campaign only)
            const { campaignSuppressionContacts } = await import('@shared/schema');

            await db.insert(campaignSuppressionContacts)
              .values({
                campaignId,
                contactId,
                reason: 'Not Interested',
                addedBy: agentId,
              })
              .onConflictDoNothing(); // Ignore if already suppressed

            console.log(`[DISPOSITION] ✅ Contact added to campaign suppression - will not be called again in THIS campaign`);
          } catch (error) {
            console.error('[DISPOSITION] Error adding Not Interested to campaign suppression:', error);
          }
        } else {
          console.error(`[DISPOSITION] ⚠️ Cannot add to campaign suppression - Missing required data: contactId=${contactId}, campaignId=${campaignId}, contact=${!!contact}`);
        }
      }

      // 3. QUALIFIED/LEAD DISPOSITION - Add to campaign-level suppression
      // Check if this disposition represents a qualified lead (by name or system action)
      const qualifyingDispositions = ['qualified', 'lead'];
      let isQualified = qualifyingDispositions.includes(disposition);

      // Also check if disposition has systemAction === 'converted_qualified'
      if (!isQualified) {
        try {
          const { dispositions: dispositionsTable } = await import('@shared/schema');
          const [dispositionRecord] = await db
            .select({ systemAction: dispositionsTable.systemAction })
            .from(dispositionsTable)
            .where(eq(dispositionsTable.label, disposition))
            .limit(1);

          if (dispositionRecord?.systemAction === 'converted_qualified') {
            isQualified = true;
          }
        } catch (error) {
          console.error('[DISPOSITION] Error checking disposition system action:', error);
        }
      }

      if (isQualified && contact && contactId && campaignId) {
        try {
          console.log(`[DISPOSITION] Qualified/Lead call - adding to campaign suppression for contact ${contactId}`);

          // Add contact to campaign suppression list (prevents re-calling in this campaign)
          const { campaignSuppressionContacts } = await import('@shared/schema');

          await db.insert(campaignSuppressionContacts)
            .values({
              campaignId,
              contactId,
              reason: `Qualified - ${disposition}`,
              addedBy: agentId,
            })
            .onConflictDoNothing(); // Ignore if already suppressed

          console.log(`[DISPOSITION] Contact added to campaign suppression list`);

          // Check per-account cap and auto-suppress if reached
          if (contact.accountId) {
            const [campaign] = await db
              .select({
                accountCapEnabled: campaigns.accountCapEnabled,
                accountCapValue: campaigns.accountCapValue,
                accountCapMode: campaigns.accountCapMode,
              })
              .from(campaigns)
              .where(eq(campaigns.id, campaignId))
              .limit(1);

            if (campaign?.accountCapEnabled && campaign.accountCapValue) {
              console.log(`[DISPOSITION] Checking per-account cap for account ${contact.accountId} (mode: ${campaign.accountCapMode}, cap: ${campaign.accountCapValue})`);

              // Use the new batch account cap checking logic
              const { batchCheckAccountCaps } = await import('./lib/campaign-suppression');
              const capResults = await batchCheckAccountCaps(campaignId, [contact.accountId]);
              const capStatus = capResults.get(contact.accountId);

              // Log current status
              console.log(`[DISPOSITION] Account has ${capStatus?.currentCount || 0} counted items (mode: ${campaign.accountCapMode}), cap is ${campaign.accountCapValue}`);

              // Check if this disposition pushes the account over the cap
              const qualifiedCount = (capStatus?.currentCount || 0) + 1; // Include this current call
              const reachedCap = qualifiedCount >= campaign.accountCapValue;

              // If cap is reached or exceeded, auto-suppress the entire account from this campaign
              if (reachedCap) {
                console.log(`[DISPOSITION] ⚠️ Account cap reached! Auto-suppressing account ${contact.accountId} from campaign ${campaignId}`);

                const { campaignSuppressionAccounts } = await import('@shared/schema');

                await db.insert(campaignSuppressionAccounts)
                  .values({
                    campaignId,
                    accountId: contact.accountId,
                    reason: `Account cap reached (${qualifiedCount}/${campaign.accountCapValue} qualified calls)`,
                    addedBy: agentId,
                  })
                  .onConflictDoNothing(); // Ignore if already suppressed

                // Remove all contacts from this account from ALL agents' queues in this campaign
                const removedFromQueues = await db.delete(agentQueue)
                  .where(
                    and(
                      eq(agentQueue.campaignId, campaignId),
                      eq(agentQueue.accountId, contact.accountId)
                    )
                  )
                  .returning({ contactId: agentQueue.contactId });

                console.log(`[DISPOSITION] ✅ Account suppressed. Removed ${removedFromQueues.length} contacts from queues`);
              }
            }
          }
        } catch (error) {
          console.error('[DISPOSITION] Error handling qualified disposition suppression:', error);
        }
      }

      // 4. QUEUE MANAGEMENT - Intelligent next actions based on disposition
      // CRITICAL: Queue cleanup must succeed or whole request fails
      if (contactId && campaignId) {
        // Define final dispositions (contact should be removed from campaign immediately)
        const finalDispositions = ['qualified', 'lead', 'not_interested', 'dnc-request', 'callback-requested'];

        // Define retry dispositions (contact should be requeued after delay for ALL agents)
        // IMPORTANT: Voicemail contacts get LOW priority (0) to ensure fresh contacts are dialed first
        const retryDispositions = ['no-answer', 'busy', 'voicemail'];

        // Define invalid dispositions (contact should be marked invalid and removed)
        const invalidDispositions = ['wrong_number', 'invalid_data'];

        if (finalDispositions.includes(disposition)) {
          // Remove from ALL agents' queues (final disposition - contact is done)
          console.log(`[DISPOSITION] Final disposition "${disposition}" - removing contact ${contactId} from ALL queues in campaign ${campaignId}`);

          const removed = await db.delete(agentQueue)
            .where(
              and(
                eq(agentQueue.contactId, contactId),
                eq(agentQueue.campaignId, campaignId)
              )
            )
            .returning({ agentId: agentQueue.agentId, queueState: agentQueue.queueState });

          if (removed.length > 0) {
            console.log(`[DISPOSITION] ✅ Successfully removed from ${removed.length} agents' queues`);
          }
        } else if (retryDispositions.includes(disposition)) {
          // Requeue with appropriate delay for ALL agents
          // Voicemail: 7 days (1 week), No-answer/Busy: 3 days
          const retryDays = disposition === 'voicemail' ? 7 : 3;
          console.log(`[DISPOSITION] Retry disposition "${disposition}" - requeuing contact ${contactId} with ${retryDays}-day delay for ALL agents`);

          const retryDate = new Date();
          retryDate.setDate(retryDate.getDate() + retryDays);

          // FIRST-PASS PRIORITY LOGIC: Voicemail gets priority=0 (lowest), other retries get priority=50
          // This ensures fresh contacts (priority=100) are always dialed before voicemail retries
          const retryPriority = disposition === 'voicemail' ? 0 : 50;

          // Update queue items for ALL agents (remove agentId filter to prevent reappearing to other agents)
          const updated = await db.update(agentQueue)
            .set({
              queueState: 'queued',
              scheduledFor: retryDate,
              priority: retryPriority, // Set low priority for retries, especially voicemail
              lockedBy: null,
              lockedAt: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(agentQueue.contactId, contactId),
                eq(agentQueue.campaignId, campaignId)
                // REMOVED: eq(agentQueue.agentId, agentId) - This was causing contacts to reappear to other agents!
              )
            )
            .returning({ agentId: agentQueue.agentId });

          console.log(`[DISPOSITION] ✅ Contact requeued for ${updated.length} agents at ${retryDate.toISOString()} (${retryDays} days) with priority ${retryPriority}`);
        } else if (invalidDispositions.includes(disposition)) {
          // Mark contact as invalid and remove from campaign
          console.log(`[DISPOSITION] Invalid disposition "${disposition}" - marking contact ${contactId} as invalid`);

          // Mark contact as invalid
          if (contact) {
            await db.update(contactsTable)
              .set({
                isInvalid: true,
                invalidReason: `Agent marked as ${disposition}`,
                invalidatedAt: new Date(),
                invalidatedBy: agentId,
              })
              .where(eq(contactsTable.id, contactId));
          }

          // Remove from ALL queues
          await db.delete(agentQueue)
            .where(
              and(
                eq(agentQueue.contactId, contactId),
                eq(agentQueue.campaignId, campaignId)
              )
            );

          console.log(`[DISPOSITION] ✅ Contact marked invalid and removed from campaign`);
        } else {
          // Default behavior for other dispositions - remove from current agent's queue only
          console.log(`[DISPOSITION] Standard disposition "${disposition}" - removing from current agent's queue`);

          await db.delete(agentQueue)
            .where(
              and(
                eq(agentQueue.contactId, contactId),
                eq(agentQueue.campaignId, campaignId),
                eq(agentQueue.agentId, agentId)
              )
            );

          console.log(`[DISPOSITION] ✅ Removed from queue`);
        }
      }

      res.status(201).json(call);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('[DISPOSITION VALIDATION ERROR]', error.errors);
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error('[DISPOSITION ERROR]', error);
      console.error('[DISPOSITION ERROR] Stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('[DISPOSITION ERROR] Request body:', req.body);
      res.status(500).json({ message: "Failed to create call disposition", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get calls for a specific queue item
  app.get("/api/calls/queue/:queueItemId", requireAuth, async (req, res) => {
    try {
      const agentId = req.user?.userId;
      if (!agentId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check if user is admin
      const userRoles = req.user?.roles || [req.user?.role];
      const isAdmin = userRoles.includes('admin');

      // STRICT: Verify queue item ownership (unless admin)
      const queueItem = await storage.getQueueItemById(req.params.queueItemId);
      if (!queueItem) {
        return res.status(404).json({ message: "Queue item not found" });
      }

      if (!isAdmin && queueItem.agentId !== agentId) {
        return res.status(403).json({ message: "You can only view calls for queue items assigned to you" });
      }

      const calls = await storage.getCallsByQueueItem(req.params.queueItemId);
      res.json(calls);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch calls" });
    }
  });

  // Get call history for a contact
  app.get("/api/calls/contact/:contactId", requireAuth, async (req, res) => {
    try {
      const calls = await storage.getCallsByContact(req.params.contactId);
      res.json(calls);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch call history" });
    }
  });

  // ==================== SIP TRUNK CONFIGURATION ====================

  // Get all SIP trunk configurations
  app.get("/api/sip-trunks", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const configs = await storage.getSipTrunkConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch SIP trunk configurations" });
    }
  });

  // Get default SIP trunk config (for agents)
  // Returns WebRTC Credential Connection credentials for browser-based calling
  // PRIORITY: Database config first, then environment variables as fallback
  app.get("/api/sip-trunks/default", requireAuth, async (req, res) => {
    try {
      // First, try to get config from database
      const config = await storage.getDefaultSipTrunkConfig();
      if (config) {
        console.log('[SIP-TRUNK] Using database config:', config.name, '| Username:', config.sipUsername, '| Domain:', config.sipDomain);
        return res.json(config);
      }

      // If no default is set, try to get any active trunk from database
      const allConfigs = await storage.getSipTrunkConfigs();
      const activeConfig = allConfigs.find(c => c.isActive);

      if (activeConfig) {
        console.log('[SIP-TRUNK] Using active database config:', activeConfig.name);
        return res.json(activeConfig);
      }

      // FALLBACK: Use environment variables if no database config exists
      const envProvider = process.env.SIP_TRUNK_PROVIDER || "telnyx";
      const envUsername =
        process.env.SIP_TRUNK_USERNAME ||
        process.env.TELNYX_WEBRTC_USERNAME ||
        process.env.TELNYX_SIP_USERNAME;
      const envPassword =
        process.env.SIP_TRUNK_PASSWORD ||
        process.env.TELNYX_WEBRTC_PASSWORD ||
        process.env.TELNYX_SIP_PASSWORD;
      const envDomain =
        process.env.SIP_TRUNK_DOMAIN ||
        process.env.TELNYX_SIP_DOMAIN ||
        (envProvider.toLowerCase() === "telnyx" ? "sip.telnyx.com" : "");
      const envCallerId =
        process.env.SIP_TRUNK_CALLER_ID ||
        process.env.TELNYX_FROM_NUMBER ||
        "";
      const envConnectionId =
        process.env.SIP_TRUNK_CONNECTION_ID ||
        process.env.TELNYX_SIP_CONNECTION_ID ||
        process.env.TELNYX_CONNECTION_ID ||
        process.env.TELNYX_CALL_CONTROL_APP_ID ||
        "";

      if (envUsername && envPassword) {
        console.log('[SIP-TRUNK] No database config, using environment variables');
        return res.json({
          id: 'env-default',
          name: `${envProvider} (Environment)`,
          provider: envProvider,
          sipUsername: envUsername,
          sipPassword: envPassword,
          sipDomain: envDomain,
          connectionId: envConnectionId || null,
          callerIdNumber: envCallerId,
          isActive: true,
          isDefault: true,
        });
      }

      return res.status(404).json({ message: "No SIP trunk configured. Add one in Telephony Settings or set environment variables." });
    } catch (error) {
      console.error('[SIP-TRUNK] Error:', error);
      res.status(500).json({ message: "Failed to fetch default SIP trunk" });
    }
  });

  // Test/verify SIP trunk credentials
  // This endpoint helps diagnose WebRTC connection issues
  app.get("/api/sip-trunks/test", requireAuth, async (req, res) => {
    try {
      const config = await storage.getDefaultSipTrunkConfig();
      if (!config) {
        return res.json({
          success: false,
          message: "No SIP trunk configured",
          recommendation: "Go to Telephony Settings and add your SIP credentials"
        });
      }

      // Check if credentials look valid
      const issues: string[] = [];

      if (!config.sipUsername || config.sipUsername.length < 5) {
        issues.push("SIP username appears invalid (too short)");
      }

      if (!config.sipPassword || config.sipPassword.length < 8) {
        issues.push("SIP password appears invalid (too short)");
      }

      // Check basic username format
      if (config.sipUsername && !config.sipUsername.match(/^[a-zA-Z0-9@._-]+$/)) {
        issues.push("SIP username contains unexpected characters");
      }

      console.log('[SIP-TRUNK-TEST] Config:', {
        id: config.id,
        name: config.name,
        sipUsername: config.sipUsername,
        sipDomain: config.sipDomain,
        connectionId: config.connectionId,
        hasPassword: !!config.sipPassword,
        passwordLength: config.sipPassword?.length,
        issues: issues.length > 0 ? issues : 'None'
      });

      res.json({
        success: issues.length === 0,
        config: {
          id: config.id,
          name: config.name,
          provider: config.provider,
          sipUsername: config.sipUsername,
          sipDomain: config.sipDomain,
          connectionId: config.connectionId,
          hasPassword: !!config.sipPassword,
          passwordLength: config.sipPassword?.length,
          isActive: config.isActive,
          isDefault: config.isDefault,
        },
        issues,
        recommendation: issues.length > 0
          ? "Please verify your SIP credentials with your provider"
          : "Credentials look valid. If WebRTC still fails, check browser console for socket errors."
      });
    } catch (error) {
      console.error('[SIP-TRUNK-TEST] Error:', error);
      res.status(500).json({ success: false, message: "Test failed", error: String(error) });
    }
  });

  // Get specific SIP trunk config
  app.get("/api/sip-trunks/:id", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const config = await storage.getSipTrunkConfig(req.params.id);
      if (!config) {
        return res.status(404).json({ message: "SIP trunk configuration not found" });
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch SIP trunk configuration" });
    }
  });

  // Create SIP trunk config
  app.post("/api/sip-trunks", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const validated = insertSipTrunkConfigSchema.parse(req.body);
      const config = await storage.createSipTrunkConfig(validated);
      res.status(201).json(config);
    } catch (error) {
      console.error('[SIP-TRUNK] Error creating SIP trunk:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      } res.status(500).json({ message: "Failed to create SIP trunk configuration", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Import Telnyx SIP trunk from environment variables
  app.post("/api/sip-trunks/import-env", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const existing = await storage.getSipTrunkConfigs();
      const telnyxUsername = process.env.TELNYX_WEBRTC_USERNAME || process.env.TELNYX_SIP_USERNAME;
      const telnyxPassword = process.env.TELNYX_WEBRTC_PASSWORD || process.env.TELNYX_SIP_PASSWORD;
      const telnyxDomain = process.env.TELNYX_SIP_DOMAIN || "sip.telnyx.com";
      const telnyxConnectionId = process.env.TELNYX_SIP_CONNECTION_ID || process.env.TELNYX_CONNECTION_ID || process.env.TELNYX_CALL_CONTROL_APP_ID;
      const telnyxCallerId = process.env.TELNYX_FROM_NUMBER || "";

      if (!telnyxUsername || !telnyxPassword) {
        return res.status(400).json({ message: "TELNYX_SIP_USERNAME and TELNYX_SIP_PASSWORD are required" });
      }

      const duplicate = existing.find((config) =>
        config.provider === "telnyx" && config.sipUsername === telnyxUsername
      );
      if (duplicate) {
        return res.json(duplicate);
      }

      const created = await storage.createSipTrunkConfig({
        name: "Telnyx (Environment)",
        provider: "telnyx",
        sipUsername: telnyxUsername,
        sipPassword: telnyxPassword,
        sipDomain: telnyxDomain,
        connectionId: telnyxConnectionId,
        callerIdNumber: telnyxCallerId,
        isActive: true,
        isDefault: existing.length === 0,
      });

      res.json(created);
    } catch (error) {
      console.error('[SIP-TRUNK] Error importing env config:', error);
      res.status(500).json({ message: "Failed to import SIP trunk configuration" });
    }
  });

  // Update SIP trunk config
  app.patch("/api/sip-trunks/:id", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const config = await storage.updateSipTrunkConfig(req.params.id, req.body);
      if (!config) {
        return res.status(404).json({ message: "SIP trunk configuration not found" });
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to update SIP trunk configuration" });
    }
  });

  // Delete SIP trunk config
  app.delete("/api/sip-trunks/:id", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      await storage.deleteSipTrunkConfig(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete SIP trunk configuration" });
    }
  });

  // Set default SIP trunk
  app.post("/api/sip-trunks/:id/set-default", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      await storage.setDefaultSipTrunk(req.params.id);
      res.json({ message: "Default SIP trunk updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to set default SIP trunk" });
    }
  });

  // ==================== TELNYX WebRTC JWT TOKEN ====================

  // Generate JWT token for Telnyx WebRTC authentication
  // This uses the Telnyx API to create a temporary token from telephony credentials
  app.get("/api/telnyx/webrtc-token", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.TELNYX_API_KEY;
      if (!apiKey) {
        console.error('[TELNYX-TOKEN] TELNYX_API_KEY not configured');
        return res.status(500).json({ message: "Telnyx API key not configured" });
      }

      // PRIORITY 1: Check database for credential connection ID
      const dbConfig = await storage.getDefaultSipTrunkConfig();
      if (dbConfig?.connectionId) {
        console.log('[TELNYX-TOKEN] Using database connection ID:', dbConfig.connectionId);
        return await generateAndReturnToken(apiKey, dbConfig.connectionId, res);
      }

      // PRIORITY 2: Check if we have a pre-configured credential ID in environment
      const preConfiguredCredentialId = process.env.TELNYX_WEBRTC_CREDENTIAL_ID;
      if (preConfiguredCredentialId) {
        console.log('[TELNYX-TOKEN] Using env TELNYX_WEBRTC_CREDENTIAL_ID:', preConfiguredCredentialId);
        return await generateAndReturnToken(apiKey, preConfiguredCredentialId, res);
      }

      console.log('[TELNYX-TOKEN] No connection ID in database or env, fetching telephony credentials...');

      // Step 1: List telephony credentials to find an active one
      const credentialsResponse = await fetch('https://api.telnyx.com/v2/telephony_credentials', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!credentialsResponse.ok) {
        const errorText = await credentialsResponse.text();
        console.error('[TELNYX-TOKEN] Failed to list credentials:', credentialsResponse.status, errorText);

        // If credentials list fails, try to use SIP Connection ID from environment
        const sipConnectionId = process.env.TELNYX_SIP_CONNECTION_ID;
        if (sipConnectionId) {
          console.log('[TELNYX-TOKEN] Falling back to SIP_CONNECTION_ID for credential creation');
          return await createAndUseCredential(apiKey, sipConnectionId, res);
        }

        return res.status(500).json({
          message: "Failed to list Telnyx credentials",
          error: errorText
        });
      }

      const credentialsData = await credentialsResponse.json();
      const credentials = credentialsData.data || [];

      console.log('[TELNYX-TOKEN] Found credentials:', credentials.length);
      if (credentials.length > 0) {
        console.log('[TELNYX-TOKEN] Credentials:', credentials.map((c: any) => ({
          id: c.id,
          name: c.name,
          expired: c.expired,
          connection_id: c.connection_id
        })));
      }

      // Find first non-expired credential
      const activeCredential = credentials.find((c: any) => !c.expired);

      if (!activeCredential) {
        console.log('[TELNYX-TOKEN] No active credentials found, will need to create one');

        // Try environment variable first
        const sipConnectionId = process.env.TELNYX_SIP_CONNECTION_ID;
        if (sipConnectionId) {
          console.log('[TELNYX-TOKEN] Using SIP_CONNECTION_ID from environment:', sipConnectionId);
          return await createAndUseCredential(apiKey, sipConnectionId, res);
        }

        // Need to get connection ID from SIP Connection
        // First, try to get it from environment or fetch connections
        const connectionsResponse = await fetch('https://api.telnyx.com/v2/credential_connections', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (!connectionsResponse.ok) {
          const errorText = await connectionsResponse.text();
          console.error('[TELNYX-TOKEN] Failed to list connections:', connectionsResponse.status, errorText);
          return res.status(500).json({
            message: "No active telephony credentials and cannot list connections. Set TELNYX_SIP_CONNECTION_ID or TELNYX_WEBRTC_CREDENTIAL_ID in environment.",
            error: errorText
          });
        }

        const connectionsData = await connectionsResponse.json();
        const connections = connectionsData.data || [];

        console.log('[TELNYX-TOKEN] Found credential connections:', connections.length);
        if (connections.length > 0) {
          console.log('[TELNYX-TOKEN] Connections:', connections.map((c: any) => ({
            id: c.id,
            name: c.connection_name,
            active: c.active
          })));
        }

        if (connections.length === 0) {
          return res.status(500).json({
            message: "No Telnyx credential connections found. Please set up a Credential Connection in Telnyx portal, or set TELNYX_SIP_CONNECTION_ID environment variable."
          });
        }

        // Use first active connection to create a credential
        const activeConnection = connections.find((c: any) => c.active) || connections[0];
        return await createAndUseCredential(apiKey, activeConnection.id, res);
      }

      console.log('[TELNYX-TOKEN] Using existing credential:', activeCredential.id);
      return await generateAndReturnToken(apiKey, activeCredential.id, res);

    } catch (error) {
      console.error('[TELNYX-TOKEN] Error:', error);
      res.status(500).json({
        message: "Failed to generate WebRTC token",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Helper function to create a credential and generate token
  async function createAndUseCredential(apiKey: string, connectionId: string, res: any) {
    console.log('[TELNYX-TOKEN] Creating credential on connection:', connectionId);

    const createCredResponse = await fetch('https://api.telnyx.com/v2/telephony_credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_id: connectionId,
        name: `webrtc-${Date.now()}`,
      }),
    });

    if (!createCredResponse.ok) {
      const errorText = await createCredResponse.text();
      console.error('[TELNYX-TOKEN] Failed to create credential:', createCredResponse.status, errorText);
      return res.status(500).json({
        message: "Failed to create telephony credential",
        error: errorText
      });
    }

    const newCredData = await createCredResponse.json();
    const newCredential = newCredData.data;
    console.log('[TELNYX-TOKEN] Created new credential:', newCredential.id);

    // Generate token from new credential
    return await generateAndReturnToken(apiKey, newCredential.id, res);
  }

  // Helper function to generate JWT token from credential ID
  async function generateAndReturnToken(apiKey: string, credentialId: string, res: any) {
    console.log('[TELNYX-TOKEN] Generating token for credential:', credentialId);

    const tokenResponse = await fetch(`https://api.telnyx.com/v2/telephony_credentials/${credentialId}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[TELNYX-TOKEN] Failed to generate token:', tokenResponse.status, errorText);
      return res.status(500).json({
        message: "Failed to generate JWT token",
        error: errorText
      });
    }

    const tokenData = await tokenResponse.json();
    console.log('[TELNYX-TOKEN] Token generated successfully');

    return res.json({
      token: tokenData.data,
      credentialId: credentialId,
      expiresIn: 86400, // 24 hours
    });
  }

  // ==================== AGENT STATUS (AUTO-DIALER) ====================

  // Get agent status for a specific agent or current user
  app.get("/api/agent-status/:agentId?", requireAuth, async (req, res) => {
    try {
      const agentId = req.params.agentId || req.user?.userId;
      if (!agentId) {
        return res.status(400).json({ message: "Agent ID required" });
      }
      const status = await storage.getAgentStatus(agentId);
      if (!status) {
        return res.status(404).json({ message: "Agent status not found" });
      }
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch agent status" });
    }
  });

  // Get all agent statuses (optionally filtered by campaign)
  app.get("/api/agent-statuses", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const statuses = await storage.getAllAgentStatuses(campaignId);
      res.json(statuses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch agent statuses" });
    }
  });

  // Get available agents (optionally filtered by campaign)
  app.get("/api/agent-statuses/available", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const agents = await storage.getAvailableAgents(campaignId);
      res.json(agents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch available agents" });
    }
  });

  // Update agent status (for the current user or specified agent)
  app.patch("/api/agent-status/:agentId?", requireAuth, async (req, res) => {
    try {
      const agentId = req.params.agentId || req.user?.userId;
      if (!agentId) {
        return res.status(400).json({ message: "Agent ID required" });
      }

      // Agents can only update their own status unless they're admin
      const userRoles = req.user?.roles || [];
      if (agentId !== req.user?.userId && !userRoles.includes('admin')) {
        return res.status(403).json({ message: "Not authorized to update other agent statuses" });
      }

      const validated = insertAgentStatusSchema.partial().parse(req.body);
      const status = await storage.updateAgentStatus(agentId, validated);
      if (!status) {
        // If status doesn't exist, create it
        const newStatus = await storage.upsertAgentStatus({
          agentId,
          ...validated,
        } as any);
        return res.status(201).json(newStatus);
      }
      res.json(status);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update agent status" });
    }
  });

  // Upsert agent status (create or update)
  app.post("/api/agent-status", requireAuth, async (req, res) => {
    try {
      const agentId = req.user?.userId;
      if (!agentId) {
        return res.status(400).json({ message: "Agent ID required" });
      }

      const validated = insertAgentStatusSchema.parse({
        ...req.body,
        agentId,
      });
      const status = await storage.upsertAgentStatus(validated);
      res.status(201).json(status);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to upsert agent status" });
    }
  });

  // ==================== AUTO-DIALER QUEUE ====================

  // Get auto-dialer queue for a campaign
  app.get("/api/auto-dialer-queue/:campaignId", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const queue = await storage.getAutoDialerQueue(req.params.campaignId);
      if (!queue) {
        return res.status(404).json({ message: "Auto-dialer queue not found" });
      }
      res.json(queue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch auto-dialer queue" });
    }
  });

  // Get all auto-dialer queues
  app.get("/api/auto-dialer-queues", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const activeOnly = req.query.activeOnly === 'true';
      const queues = await storage.getAllAutoDialerQueues(activeOnly);
      res.json(queues);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch auto-dialer queues" });
    }
  });

  // Get all agent statuses
  app.get("/api/agent-statuses", requireAuth, requireRole('admin', 'campaign_manager', 'agent'), async (req, res) => {
    try {
      const { agentStatus } = await import('@shared/schema');
      const statuses = await db.select().from(agentStatus);
      res.json(statuses);
    } catch (error) {
      console.error('Failed to fetch agent statuses:', error);
      res.status(500).json({ message: "Failed to fetch agent statuses" });
    }
  });

  // Create auto-dialer queue
  app.post("/api/auto-dialer-queue", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertAutoDialerQueueSchema.parse(req.body);
      const queue = await storage.createAutoDialerQueue(validated);
      res.status(201).json(queue);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create auto-dialer queue" });
    }
  });

  // Update auto-dialer queue
  app.patch("/api/auto-dialer-queue/:campaignId", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const queue = await storage.updateAutoDialerQueue(req.params.campaignId, req.body);
      if (!queue) {
        return res.status(404).json({ message: "Auto-dialer queue not found" });
      }
      res.json(queue);
    } catch (error) {
      res.status(500).json({ message: "Failed to update auto-dialer queue" });
    }
  });

  // Toggle auto-dialer queue (start/stop)
  app.post("/api/auto-dialer-queue/:campaignId/toggle", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }
      const queue = await storage.toggleAutoDialerQueue(req.params.campaignId, isActive);
      if (!queue) {
        return res.status(404).json({ message: "Auto-dialer queue not found" });
      }
      res.json(queue);
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle auto-dialer queue" });
    }
  });

  // ==================== SENDER PROFILES ====================

  app.get("/api/sender-profiles", requireAuth, async (req, res) => {
    try {
      const profiles = await storage.getSenderProfiles();
      res.json(profiles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sender profiles" });
    }
  });

  app.post("/api/sender-profiles", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const validated = insertSenderProfileSchema.parse(req.body);
      const profile = await storage.createSenderProfile({ ...validated, createdBy: userId });
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create sender profile" });
    }
  });

  app.get("/api/sender-profiles/:id", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getSenderProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({ message: "Sender profile not found" });
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sender profile" });
    }
  });

  app.put("/api/sender-profiles/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertSenderProfileSchema.partial().parse(req.body);
      const profile = await storage.updateSenderProfile(req.params.id, validated);
      if (!profile) {
        return res.status(404).json({ message: "Sender profile not found" });
      }
      res.json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update sender profile" });
    }
  });

  app.delete("/api/sender-profiles/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      await storage.deleteSenderProfile(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete sender profile" });
    }
  });

  // Manually verify a sender profile (for when domain is already verified in ESP)
  app.post("/api/sender-profiles/:id/verify", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const profile = await storage.getSenderProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({ message: "Sender profile not found" });
      }
      
      const updated = await storage.updateSenderProfile(req.params.id, { isVerified: true });
      console.log(`[Sender Profile] Manually verified sender profile ${profile.fromEmail}`);
      res.json(updated);
    } catch (error) {
      console.error("[Sender Profile] Failed to verify:", error);
      res.status(500).json({ message: "Failed to verify sender profile" });
    }
  });

  // ==================== DOMAIN AUTHENTICATION ====================

  app.get("/api/domain-auth", requireAuth, async (req, res) => {
    console.log("HIT GET /api/domain-auth");
    try {
      const domains = await storage.getDomainAuths();
      console.log("GET /api/domain-auth returning:", JSON.stringify(domains, null, 2));
      res.json(domains);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch domains" });
    }
  });

  app.post("/api/domain-auth", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    console.log("HIT POST /api/domain-auth");
    try {
      // Ensure defaults are present for validation
      const data = {
        spfStatus: 'pending',
        dkimStatus: 'pending',
        dmarcStatus: 'pending',
        trackingDomainStatus: 'pending',
        bimiStatus: 'pending',
        ...req.body
      };

      const validated = insertDomainAuthSchema.parse(data);
      const domain = await storage.createDomainAuth(validated);
      res.status(201).json(domain);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      // Handle unique constraint violation
      if (error.code === '23505' || error.message?.includes('unique')) {
        return res.status(409).json({ message: "Domain already exists" });
      }
      res.status(500).json({ message: "Failed to create domain" });
    }
  });

  app.delete("/api/domain-auth/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    console.log("HIT DELETE /api/domain-auth/:id", req.params.id);
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid domain id" });
      }

      await storage.deleteDomainAuth(id);
      return res.status(204).send();
    } catch (error) {
      console.error("Failed to delete domain auth", error);
      return res.status(500).json({ message: "Failed to delete domain" });
    }
  });

  app.get("/api/domain-auth/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      
      const domain = await storage.getDomainAuth(id);
      if (!domain) {
        return res.status(404).json({ message: "Domain not found" });
      }
      res.json(domain);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch domain" });
    }
  });

  app.post("/api/domain-auth/:id/verify", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const domain = await storage.getDomainAuth(id);
      if (!domain) {
        return res.status(404).json({ message: "Domain not found" });
      }

      // Try Mailgun API sync first (if configured)
      const { mailgunSync } = await import("./services/mailgun-sync-service");
      const mailgunSynced = await mailgunSync.syncDomain(id);

      if (mailgunSynced) {
        const updated = await storage.getDomainAuth(id);
        return res.json(updated);
      }

      // Fallback to DNS verification if Mailgun not configured
      let spfStatus = 'failed';
      let dkimStatus = 'failed';
      let dmarcStatus = 'failed';

      try {
        // 1. Verify MX Records (Mailgun requires mxa.mailgun.org and mxb.mailgun.org)
        const mxRecords = await dns.resolveMx(domain.domain);
        const hasMailgunMx = mxRecords.some(r => r.exchange.includes('mailgun.org'));
        
        // 2. Verify SPF (v=spf1 include:mailgun.org ~all)
        const txtRecords = await dns.resolveTxt(domain.domain);
        const flatTxt = txtRecords.flat();
        const spfRecord = flatTxt.find(r => r.startsWith('v=spf1'));
        const hasMailgunSpf = spfRecord && spfRecord.includes('include:mailgun.org');
        
        if (hasMailgunSpf) spfStatus = 'verified';
        
        // 3. Verify DKIM (selector._domainkey.domain.com)
        // Check common Mailgun selectors since we don't store the specific one
        const selectors = ['pic', 'mailo', 'k1', 'smtp', 'default', 'mg'];
        for (const selector of selectors) {
            try {
                const dkimTxt = await dns.resolveTxt(`${selector}._domainkey.${domain.domain}`);
                if (dkimTxt.flat().some(r => r.includes('k=rsa'))) {
                    dkimStatus = 'verified';
                    break;
                }
            } catch (e) {
                // ignore selector not found
            }
        }

        // 4. Verify DMARC (_dmarc.domain.com)
        try {
            const dmarcTxt = await dns.resolveTxt(`_dmarc.${domain.domain}`);
            if (dmarcTxt.flat().some(r => r.startsWith('v=DMARC1'))) {
                dmarcStatus = 'verified';
            }
        } catch (e) {
            // ignore dmarc not found
        }

      } catch (e) {
        console.error(`DNS verification failed for ${domain.domain}:`, e);
      }

      const updated = await storage.updateDomainAuth(id, {
        spfStatus: spfStatus as any,
        dkimStatus: dkimStatus as any,
        dmarcStatus: dmarcStatus as any,
        lastCheckedAt: new Date()
      });

      // Update sender profiles for this domain
      const isVerified = spfStatus === 'verified' && dkimStatus === 'verified';
      const profiles = await storage.getSenderProfiles();
      const profilesToUpdate = profiles.filter(p => p.domainAuthId === id);
      for (const profile of profilesToUpdate) {
        await storage.updateSenderProfile(profile.id, { isVerified });
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to verify domain" });
    }
  });

  // Send test email
  app.post("/api/sender-profiles/:id/test-email", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const profileId = req.params.id;
      const { to, subject, html } = req.body;

      if (!to || !subject || !html) {
        return res.status(400).json({ message: "Missing required fields: to, subject, html" });
      }

      const profile = await storage.getSenderProfile(profileId);
      if (!profile) {
        return res.status(404).json({ message: "Sender profile not found" });
      }

      const { sendTestEmail } = await import("./services/bulk-email-service");
      const result = await sendTestEmail({
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        from: profile.fromEmail,
        fromName: profile.fromName,
        replyTo: profile.replyTo || profile.replyToEmail || profile.fromEmail
      });

      res.json({
        success: result.success,
        sent: result.sent,
        message: `Test email sent to ${result.sent} recipient(s)`
      });
    } catch (error: any) {
      console.error("Failed to send test email:", error);
      res.status(500).json({ message: error.message || "Failed to send test email" });
    }
  });

  // Mailgun webhook endpoint (no auth required - verified by signature)
  app.post("/api/mailgun/webhooks", async (req, res) => {
    try {
      console.log("[Mailgun Webhook] Received event:", req.body['event-data']?.event);
      
      const eventData = req.body['event-data'];
      if (!eventData) {
        return res.status(400).json({ message: "Invalid webhook payload" });
      }

      const eventType = eventData.event; // delivered, opened, clicked, bounced, complained, unsubscribed
      const messageId = eventData.message?.headers?.['message-id'];
      const recipient = eventData.recipient;
      const timestamp = new Date(eventData.timestamp * 1000);
      const campaignIdHeader = eventData.message?.headers?.['x-campaign-id'];
      const bounceType = eventData.severity; // 'temporary' or 'permanent'

      console.log(`[Mailgun Webhook] ${eventType} - ${recipient} - Campaign: ${campaignIdHeader}`);

      // Find contact by email
      const contact = await db.select().from(schema.contacts)
        .where(eq(schema.contacts.emailNormalized, recipient.toLowerCase()))
        .limit(1);
      const contactId = contact[0]?.id;

      // Store event in email_events table
      await db.insert(schema.emailEvents).values({
        messageId,
        campaignId: campaignIdHeader || null,
        contactId: contactId || null,
        recipient,
        type: eventType,
        bounceType: bounceType === 'permanent' ? 'hard' : bounceType === 'temporary' ? 'soft' : null,
        metadata: eventData,
        createdAt: timestamp,
      });

      // Handle automatic suppression for hard bounces, unsubscribes, and spam complaints
      const shouldSuppress = 
        (eventType === 'bounced' && bounceType === 'permanent') ||
        eventType === 'unsubscribed' ||
        eventType === 'complained';

      if (shouldSuppress && recipient) {
        const suppressionReason = 
          eventType === 'bounced' ? 'hard_bounce' :
          eventType === 'unsubscribed' ? 'unsubscribe' :
          eventType === 'complained' ? 'spam_complaint' : 'manual';

        // Check if already suppressed
        const existing = await db.select().from(schema.emailSuppressionList)
          .where(eq(schema.emailSuppressionList.emailNormalized, recipient.toLowerCase()))
          .limit(1);

        if (existing.length === 0) {
          // Add to suppression list
          await db.insert(schema.emailSuppressionList).values({
            email: recipient,
            emailNormalized: recipient.toLowerCase(),
            reason: suppressionReason,
            campaignId: campaignIdHeader || null,
            contactId: contactId || null,
            metadata: { event: eventType, timestamp },
          });

          console.log(`[Mailgun Webhook] Added ${recipient} to suppression list (${suppressionReason})`);

          // Update contact record
          if (contactId) {
            const updateData: any = {};
            if (eventType === 'bounced') {
              updateData.emailStatus = 'bounced';
              updateData.isInvalid = true;
              updateData.invalidReason = 'Hard bounce from email campaign';
              updateData.invalidatedAt = new Date();
            } else if (eventType === 'unsubscribed') {
              updateData.emailStatus = 'unsubscribed';
            } else if (eventType === 'complained') {
              updateData.emailStatus = 'spam_complaint';
              updateData.isInvalid = true;
              updateData.invalidReason = 'Spam complaint';
              updateData.invalidatedAt = new Date();
            }

            await db.update(schema.contacts)
              .set(updateData)
              .where(eq(schema.contacts.id, contactId));
          }
        }
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("[Mailgun Webhook] Error processing webhook:", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // Sync all domains from Mailgun
  app.post("/api/domain-auth/sync-all", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { mailgunSync } = await import("./services/mailgun-sync-service");
      
      if (!mailgunSync.isConfigured()) {
        return res.status(400).json({ message: "Mailgun API not configured. Set MAILGUN_API_KEY environment variable." });
      }

      const result = await mailgunSync.syncAllDomains();
      res.json({
        message: "Domain sync completed",
        synced: result.synced,
        errors: result.errors
      });
    } catch (error: any) {
      console.error("Failed to sync domains:", error);
      res.status(500).json({ message: error.message || "Failed to sync domains" });
    }
  });

  // ==================== TEST EMAIL SEND (for Simple Campaign Builder) ====================
  
  // Send test email from campaign builder
  app.post("/api/email/send-test", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { to, subject, html, senderProfileId } = req.body;

      if (!to || !subject || !html) {
        return res.status(400).json({ message: "Missing required fields: to, subject, html" });
      }

      // Validate email addresses
      const toEmails = Array.isArray(to) ? to : [to];
      if (toEmails.length === 0) {
        return res.status(400).json({ message: "No recipient email addresses provided" });
      }

      // Get sender profile if provided, otherwise use default
      let from = process.env.DEFAULT_FROM_EMAIL || process.env.MAILGUN_FROM_EMAIL;
      let fromName: string | undefined;
      let replyTo: string | undefined;

      if (senderProfileId) {
        const profile = await storage.getSenderProfile(senderProfileId);
        if (profile) {
          from = profile.fromEmail;
          fromName = profile.fromName || undefined;
          replyTo = profile.replyToEmail || profile.fromEmail;
        }
      }

      // Fallback to mailgun domain if no from address configured
      if (!from && process.env.MAILGUN_DOMAIN) {
        from = `noreply@${process.env.MAILGUN_DOMAIN}`;
      }

      if (!from) {
        return res.status(400).json({ 
          message: "No sender email configured. Please set DEFAULT_FROM_EMAIL or configure a sender profile." 
        });
      }

      const { sendTestEmail } = await import("./services/bulk-email-service");
      const result = await sendTestEmail({
        to: toEmails,
        subject,
        html,
        from,
        fromName,
        replyTo
      });

      console.log(`[Test Email] Sent to ${toEmails.join(", ")} - Success: ${result.success}, Sent: ${result.sent}`);

      res.json({
        success: result.success,
        sent: result.sent,
        message: result.success 
          ? `Test email sent to ${result.sent} recipient(s)` 
          : "Failed to send test email"
      });
    } catch (error: any) {
      console.error("[Test Email] Failed to send:", error);
      res.status(500).json({ message: error.message || "Failed to send test email" });
    }
  });

  // ==================== EMAIL TEMPLATES ====================

  app.get("/api/email-templates", requireAuth, async (req, res) => {
    try {
      const templates = await storage.getEmailTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email templates" });
    }
  });

  app.get("/api/email-templates/:id", requireAuth, async (req, res) => {
    try {
      const template = await storage.getEmailTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email template" });
    }
  });

  app.post("/api/email-templates", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertEmailTemplateSchema.parse(req.body);
      const template = await storage.createEmailTemplate(validated);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create email template" });
    }
  });

  app.patch("/api/email-templates/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const template = await storage.updateEmailTemplate(req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ message: "Failed to update email template" });
    }
  });

  app.post("/api/email-templates/:id/approve", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const template = await storage.approveEmailTemplate(req.params.id, userId);
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ message: "Failed to approve email template" });
    }
  });

  app.delete("/api/email-templates/:id", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      await storage.deleteEmailTemplate(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete email template" });
    }
  });

  // ==================== EMAIL SEQUENCES ====================

  app.get("/api/email-sequences", requireAuth, async (_req, res) => {
    try {
      const sequences = await storage.getEmailSequences();
      res.json(sequences);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email sequences" });
    }
  });

  app.get("/api/email-sequences/:id", requireAuth, async (req, res) => {
    try {
      const sequence = await storage.getEmailSequence(req.params.id);
      if (!sequence) {
        return res.status(404).json({ message: "Email sequence not found" });
      }
      res.json(sequence);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email sequence" });
    }
  });

  app.post("/api/email-sequences", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertEmailSequenceSchema.parse(req.body);
      const sequence = await storage.createEmailSequence(validated);
      res.status(201).json(sequence);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create email sequence" });
    }
  });

  app.patch("/api/email-sequences/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const sequence = await storage.updateEmailSequence(req.params.id, req.body);
      if (!sequence) {
        return res.status(404).json({ message: "Email sequence not found" });
      }
      res.json(sequence);
    } catch (error) {
      res.status(500).json({ message: "Failed to update email sequence" });
    }
  });

  app.delete("/api/email-sequences/:id", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      await storage.deleteEmailSequence(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete email sequence" });
    }
  });

  // ==================== SEQUENCE STEPS ====================

  app.get("/api/email-sequences/:sequenceId/steps", requireAuth, async (req, res) => {
    try {
      const steps = await storage.getSequenceSteps(req.params.sequenceId);
      res.json(steps);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sequence steps" });
    }
  });

  app.post("/api/email-sequences/:sequenceId/steps", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertSequenceStepSchema.parse({
        ...req.body,
        sequenceId: req.params.sequenceId,
      });
      const step = await storage.createSequenceStep(validated);
      res.status(201).json(step);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create sequence step" });
    }
  });

  app.patch("/api/sequence-steps/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const step = await storage.updateSequenceStep(req.params.id, req.body);
      if (!step) {
        return res.status(404).json({ message: "Sequence step not found" });
      }
      res.json(step);
    } catch (error) {
      res.status(500).json({ message: "Failed to update sequence step" });
    }
  });

  app.delete("/api/sequence-steps/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      await storage.deleteSequenceStep(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete sequence step" });
    }
  });

  // ==================== SEQUENCE ENROLLMENTS ====================

  app.get("/api/sequence-enrollments", requireAuth, async (req, res) => {
    try {
      const { sequenceId, contactId } = req.query;
      const enrollments = await storage.getSequenceEnrollments(
        sequenceId as string | undefined,
        contactId as string | undefined
      );
      res.json(enrollments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sequence enrollments" });
    }
  });

  app.post("/api/sequence-enrollments", requireAuth, requireRole('admin', 'campaign_manager', 'sales'), async (req, res) => {
    try {
      const validated = insertSequenceEnrollmentSchema.parse(req.body);

      // Check for active enrollment
      const activeEnrollment = await storage.getActiveEnrollmentForContact(
        validated.sequenceId,
        validated.contactId
      );

      if (activeEnrollment) {
        return res.status(400).json({ message: "Contact is already enrolled in this sequence" });
      }

      const enrollment = await storage.createSequenceEnrollment(validated);
      res.status(201).json(enrollment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create sequence enrollment" });
    }
  });

  app.patch("/api/sequence-enrollments/:id", requireAuth, async (req, res) => {
    try {
      const enrollment = await storage.updateSequenceEnrollment(req.params.id, req.body);
      if (!enrollment) {
        return res.status(404).json({ message: "Sequence enrollment not found" });
      }
      res.json(enrollment);
    } catch (error) {
      res.status(500).json({ message: "Failed to update sequence enrollment" });
    }
  });

  app.post("/api/sequence-enrollments/:id/stop", requireAuth, async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Stop reason is required" });
      }

      const enrollment = await storage.stopSequenceEnrollment(req.params.id, reason);
      if (!enrollment) {
        return res.status(404).json({ message: "Sequence enrollment not found" });
      }
      res.json(enrollment);
    } catch (error) {
      res.status(500).json({ message: "Failed to stop sequence enrollment" });
    }
  });

  // ==================== CALL SCRIPTS ====================

  app.get("/api/call-scripts", requireAuth, async (req, res) => {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const scripts = await storage.getCallScripts(campaignId);
      res.json(scripts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch call scripts" });
    }
  });

  app.get("/api/call-scripts/:id", requireAuth, async (req, res) => {
    try {
      const script = await storage.getCallScript(req.params.id);
      if (!script) {
        return res.status(404).json({ message: "Call script not found" });
      }
      res.json(script);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch call script" });
    }
  });

  app.post("/api/call-scripts", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertCallScriptSchema.parse(req.body);
      const script = await storage.createCallScript(validated);
      res.status(201).json(script);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create call script" });
    }
  });

  app.patch("/api/call-scripts/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const script = await storage.updateCallScript(req.params.id, req.body);
      if (!script) {
        return res.status(404).json({ message: "Call script not found" });
      }
      res.json(script);
    } catch (error) {
      res.status(500).json({ message: "Failed to update call script" });
    }
  });

  app.delete("/api/call-scripts/:id", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      await storage.deleteCallScript(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete call script" });
    }
  });

  // ==================== LEADS & QA ====================

  // Unified QA Conversations endpoint - fetches ALL interactions (calls, test calls, emails)
  app.get("/api/qa/conversations", requireAuth, async (req, res) => {
    try {
      console.log(`[QA] GET /api/qa/conversations query:`, req.query);
      const { campaignId, type, status, search, limit = '100', offset = '0' } = req.query;
      const limitNum = Math.min(parseInt(limit as string) || 100, 500);
      const offsetNum = parseInt(offset as string) || 0;

      const conversations: any[] = [];

      // 1. Fetch Call Sessions with transcripts
      let callSessionsQuery = db
        .select({
          id: callSessions.id,
          campaignId: callSessions.campaignId,
          contactId: callSessions.contactId,
          status: callSessions.status,
          agentType: callSessions.agentType,
          startedAt: callSessions.startedAt,
          endedAt: callSessions.endedAt,
          durationSec: callSessions.durationSec,
          aiTranscript: callSessions.aiTranscript,
          aiAnalysis: callSessions.aiAnalysis,
          aiDisposition: callSessions.aiDisposition,
          recordingUrl: callSessions.recordingUrl,
          createdAt: callSessions.createdAt,
          campaignName: campaigns.name,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          contactEmail: contacts.email,
          companyName: accounts.name,
        })
        .from(callSessions)
        .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
        .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .orderBy(desc(callSessions.createdAt))
        .limit(limitNum);

      if (campaignId && campaignId !== 'all') {
        callSessionsQuery = callSessionsQuery.where(eq(callSessions.campaignId, campaignId as string)) as any;
      }

      const callSessionsData = await callSessionsQuery;
      console.log(`[QA] Found ${callSessionsData.length} call sessions in DB`);

      for (const session of callSessionsData) {
        conversations.push({
          id: session.id,
          type: 'call',
          source: 'call_session',
          campaignId: session.campaignId,
          campaignName: session.campaignName || 'Unknown Campaign',
          contactId: session.contactId,
          contactName: `${session.contactFirstName || ''} ${session.contactLastName || ''}`.trim() || 'Unknown',
          companyName: session.companyName || 'Unknown',
          status: session.status,
          disposition: session.aiDisposition,
          agentType: session.agentType,
          duration: session.durationSec,
          transcript: session.aiTranscript,
          analysis: session.aiAnalysis,
          recordingUrl: session.recordingUrl,
          createdAt: session.createdAt,
          isTestCall: false,
        });
      }

      // 2. Fetch Test Calls with transcripts
      let testCallsQuery = db
        .select({
          id: campaignTestCalls.id,
          campaignId: campaignTestCalls.campaignId,
          virtualAgentId: campaignTestCalls.virtualAgentId,
          testPhoneNumber: campaignTestCalls.testPhoneNumber,
          testContactName: campaignTestCalls.testContactName,
          testCompanyName: campaignTestCalls.testCompanyName,
          status: campaignTestCalls.status,
          disposition: campaignTestCalls.disposition,
          durationSeconds: campaignTestCalls.durationSeconds,
          fullTranscript: campaignTestCalls.fullTranscript,
          transcriptTurns: campaignTestCalls.transcriptTurns,
          aiPerformanceMetrics: campaignTestCalls.aiPerformanceMetrics,
          detectedIssues: campaignTestCalls.detectedIssues,
          callSummary: campaignTestCalls.callSummary,
          testResult: campaignTestCalls.testResult,
          recordingUrl: campaignTestCalls.recordingUrl,
          createdAt: campaignTestCalls.createdAt,
          campaignName: campaigns.name,
          agentName: virtualAgents.name,
        })
        .from(campaignTestCalls)
        .leftJoin(campaigns, eq(campaignTestCalls.campaignId, campaigns.id))
        .leftJoin(virtualAgents, eq(campaignTestCalls.virtualAgentId, virtualAgents.id))
        .orderBy(desc(campaignTestCalls.createdAt))
        .limit(limitNum);

      if (campaignId && campaignId !== 'all') {
        testCallsQuery = testCallsQuery.where(eq(campaignTestCalls.campaignId, campaignId as string)) as any;
      }

      const testCallsData = await testCallsQuery;

      for (const testCall of testCallsData) {
        conversations.push({
          id: testCall.id,
          type: 'call',
          source: 'test_call',
          campaignId: testCall.campaignId,
          campaignName: testCall.campaignName || 'Unknown Campaign',
          contactName: testCall.testContactName || 'Test Contact',
          companyName: testCall.testCompanyName || 'Test Company',
          status: testCall.status,
          disposition: testCall.disposition,
          agentType: 'ai',
          agentName: testCall.agentName,
          duration: testCall.durationSeconds,
          transcript: testCall.fullTranscript,
          transcriptTurns: testCall.transcriptTurns,
          analysis: testCall.aiPerformanceMetrics,
          detectedIssues: testCall.detectedIssues,
          callSummary: testCall.callSummary,
          testResult: testCall.testResult,
          recordingUrl: testCall.recordingUrl,
          createdAt: testCall.createdAt,
          isTestCall: true,
        });
      }

      // 3. Fetch Email Sends (for email interactions)
      if (!type || type === 'all' || type === 'email') {
        let emailsQuery = db
          .select({
            id: emailSends.id,
            campaignId: emailSends.campaignId,
            contactId: emailSends.contactId,
            status: emailSends.status,
            sentAt: emailSends.sentAt,
            createdAt: emailSends.createdAt,
            campaignName: campaigns.name,
            contactFirstName: contacts.firstName,
            contactLastName: contacts.lastName,
            contactEmail: contacts.email,
            companyName: accounts.name,
          })
          .from(emailSends)
          .leftJoin(campaigns, eq(emailSends.campaignId, campaigns.id))
          .leftJoin(contacts, eq(emailSends.contactId, contacts.id))
          .leftJoin(accounts, eq(contacts.accountId, accounts.id))
          .orderBy(desc(emailSends.createdAt))
          .limit(limitNum);

        if (campaignId && campaignId !== 'all') {
          emailsQuery = emailsQuery.where(eq(emailSends.campaignId, campaignId as string)) as any;
        }

        const emailsData = await emailsQuery;

        for (const email of emailsData) {
          conversations.push({
            id: email.id,
            type: 'email',
            source: 'email_send',
            campaignId: email.campaignId,
            campaignName: email.campaignName || 'Unknown Campaign',
            contactId: email.contactId,
            contactName: `${email.contactFirstName || ''} ${email.contactLastName || ''}`.trim() || 'Unknown',
            contactEmail: email.contactEmail,
            companyName: email.companyName || 'Unknown',
            status: email.status,
            createdAt: email.createdAt,
            sentAt: email.sentAt,
            isTestCall: false,
          });
        }
      }

      // Sort all conversations by createdAt descending
      conversations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Apply search filter if provided
      let filtered = conversations;
      if (search) {
        const searchLower = (search as string).toLowerCase();
        filtered = conversations.filter(c =>
          c.contactName?.toLowerCase().includes(searchLower) ||
          c.companyName?.toLowerCase().includes(searchLower) ||
          c.campaignName?.toLowerCase().includes(searchLower)
        );
      }

      // Apply type filter
      if (type && type !== 'all') {
        filtered = filtered.filter(c => c.type === type);
      }

      // Apply pagination
      const paginated = filtered.slice(offsetNum, offsetNum + limitNum);

      // Calculate stats
      const stats = {
        total: filtered.length,
        calls: filtered.filter(c => c.type === 'call').length,
        emails: filtered.filter(c => c.type === 'email').length,
        testCalls: filtered.filter(c => c.isTestCall).length,
        withTranscripts: filtered.filter(c => c.transcript || c.transcriptTurns).length,
      };

      res.json({
        conversations: paginated,
        stats,
        total: filtered.length,
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      console.error('[QA Conversations] Error:', error);
      res.status(500).json({ message: 'Failed to fetch QA conversations' });
    }
  });

  app.get("/api/leads", requireAuth, async (req, res) => {
    // Disable HTTP caching to ensure fresh data for all users
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    try {
      // Get user roles (support both legacy single role and new multi-role system)
      const userRoles = (req.user as any)?.roles || [req.user?.role || ''];
      const userId = req.user!.userId;
      
      // Check if user is agent-only (has agent role but no elevated roles)
      const isAgentOnly = userRoles.includes('agent') && 
                          !userRoles.includes('admin') && 
                          !userRoles.includes('campaign_manager') && 
                          !userRoles.includes('quality_analyst');
      
      let allLeads = await storage.getLeads();
      
      // Apply filters from query parameters
      const { agentId, campaignId, qaStatus, deliveryStatus, industry, company, search, dateFrom, dateTo } = req.query;
      
      // CRITICAL SECURITY: Apply role-based scoping FIRST before any other filters
      // Agent-only users can ONLY see their own leads - scope dataset immediately
      let filtered: typeof allLeads;
      if (isAgentOnly) {
        // Force filter to authenticated agent's ID - completely ignore client-supplied agentId
        filtered = allLeads.filter(l => l.agentId === userId);
      } else {
        // Elevated users start with full dataset
        filtered = allLeads;
        // Elevated users can optionally filter by specific agent
        if (agentId && agentId !== "") {
          filtered = filtered.filter(l => l.agentId === agentId);
        }
      }
      
      if (campaignId && campaignId !== "") {
        filtered = filtered.filter(l => l.campaignId === campaignId);
      }
      
      if (qaStatus && qaStatus !== "") {
        filtered = filtered.filter(l => l.qaStatus === qaStatus);
      }
      
      if (deliveryStatus === "pending") {
        filtered = filtered.filter(l => !l.deliveredAt);
      } else if (deliveryStatus === "submitted") {
        filtered = filtered.filter(l => l.deliveredAt);
      }
      
      if (industry && industry !== "") {
        filtered = filtered.filter(l => l.accountIndustry === industry);
      }
      
      if (company && company !== "") {
        filtered = filtered.filter(l => 
          l.accountName?.toLowerCase().includes((company as string).toLowerCase())
        );
      }
      
      if (search && search !== "") {
        const searchLower = (search as string).toLowerCase();
        filtered = filtered.filter(l =>
          l.contactName?.toLowerCase().includes(searchLower) ||
          l.contactEmail?.toLowerCase().includes(searchLower) ||
          l.accountName?.toLowerCase().includes(searchLower)
        );
      }
      
      // Date range filtering
      if (dateFrom && dateFrom !== "") {
        const fromDate = new Date(dateFrom as string);
        filtered = filtered.filter(l => l.createdAt && new Date(l.createdAt) >= fromDate);
      }
      
      if (dateTo && dateTo !== "") {
        const toDate = new Date(dateTo as string);
        toDate.setHours(23, 59, 59, 999); // Include the entire end date
        filtered = filtered.filter(l => l.createdAt && new Date(l.createdAt) <= toDate);
      }
      
      res.json(filtered);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  // Get deleted leads (admin only) - MUST be before /api/leads/:id to avoid route conflict
  app.get("/api/leads/deleted", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const deletedLeads = await storage.getDeletedLeads();
      res.json(deletedLeads);
    } catch (error) {
      console.error('[LEADS-DELETED] Error fetching deleted leads:', error);
      res.status(500).json({ message: "Failed to fetch deleted leads" });
    }
  });

  app.get("/api/leads/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      
      // Get user roles (support both legacy single role and new multi-role system)
      const userRoles = (req.user as any)?.roles || [req.user?.role || ''];
      
      // Check if user is agent-only (has agent role but no elevated roles)
      const isAgentOnly = userRoles.includes('agent') && 
                          !userRoles.includes('admin') && 
                          !userRoles.includes('campaign_manager') && 
                          !userRoles.includes('quality_analyst');
      
      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, id),
        with: {
          contact: {
            columns: {
              id: true,
              fullName: true,
              firstName: true,
              lastName: true,
              email: true,
              directPhone: true,
              mobilePhone: true,
              jobTitle: true,
              city: true,
              state: true,
              country: true,
              linkedinUrl: true,
              seniorityLevel: true,
            },
            with: {
              account: {
                columns: {
                  id: true,
                  name: true,
                  domain: true,
                  industryStandardized: true,
                  staffCount: true,
                  employeesSizeRange: true,
                  annualRevenue: true,
                  revenueRange: true,
                  hqCity: true,
                  hqState: true,
                  hqCountry: true,
                  mainPhone: true,
                  linkedinUrl: true,
                },
              },
            },
          },
          campaign: true,
          agent: true,
          approvedBy: true,
        },
      });

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      // SECURITY: Agent-only users can only view their own leads
      if (isAgentOnly && lead.agentId !== userId) {
        return res.status(403).json({ message: "Access denied. You can only view your own leads." });
      }

      // Flatten account data to match expected structure
      const responseData = {
        ...lead,
        account: lead.contact?.account || null,
      };

      res.json(responseData);
    } catch (error) {
      console.error('Lead fetch error:', error);
      res.status(500).json({ message: "Failed to fetch lead" });
    }
  });

  app.post("/api/leads", requireAuth, async (req, res) => {
    try {
      const validated = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(validated);
      invalidateDashboardCache();
      
      // Auto-trigger Companies House validation if enabled for campaign
      if (validated.campaignId) {
        const campaign = await storage.getCampaign(validated.campaignId);
        const chConfig = campaign?.companiesHouseValidation as any;
        
        if (chConfig?.enabled && chConfig?.autoValidateOnLeadCreation) {
          // Fire-and-forget: validate in background without blocking response
          setImmediate(async () => {
            try {
              const { validateLeadCompany } = await import('./services/companies-house-validator');
              await validateLeadCompany(lead.id);
              console.log(`[CompaniesHouse] Auto-validated lead ${lead.id}`);
            } catch (error) {
              console.error(`[CompaniesHouse] Auto-validation failed for lead ${lead.id}:`, error);
            }
          });
        }
      }
      
      res.status(201).json(lead);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create lead" });
    }
  });

  app.post("/api/leads/:id/approve", requireAuth, requireRole('admin', 'quality_analyst'), async (req, res) => {
    try {
      const { approvedById } = req.body;
      if (!approvedById) {
        return res.status(400).json({ message: "approvedById is required" });
      }

      const lead = await storage.approveLead(req.params.id, approvedById);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      // Trigger lead delivery in background (fire-and-forget)
      setImmediate(async () => {
        try {
          const { triggerLeadDelivery } = await import('./services/lead-delivery');
          const deliveryResult = await triggerLeadDelivery(req.params.id);
          
          if (deliveryResult.success) {
            console.log(`[LEAD-APPROVE] Lead ${req.params.id} delivered to ${deliveryResult.destination}`);
          } else if (deliveryResult.error !== 'Lead not approved' && deliveryResult.error !== 'No campaign order linked to this campaign') {
            console.warn(`[LEAD-APPROVE] Lead delivery warning for ${req.params.id}: ${deliveryResult.error}`);
          }
        } catch (error) {
          console.error(`[LEAD-APPROVE] Lead delivery failed for ${req.params.id}:`, error);
        }
      });

      res.json(lead);
    } catch (error) {
      console.error('[LEAD-APPROVE] Error approving lead:', error);
      res.status(500).json({ message: "Failed to approve lead", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/leads/:id/reject", requireAuth, requireRole('admin', 'quality_analyst'), async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const rejectedById = req.user!.userId;
      const lead = await storage.rejectLead(req.params.id, reason, rejectedById);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      res.json(lead);
    } catch (error) {
      res.status(500).json({ message: "Failed to reject lead" });
    }
  });

  // Delete lead (admin only) - soft delete
  app.delete("/api/leads/:id", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      await storage.deleteLead(req.params.id, req.user!.id);
      res.json({ message: "Lead deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete lead" });
    }
  });

  // Restore a single deleted lead (admin only)
  app.post("/api/leads/:id/restore", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const lead = await storage.restoreLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      res.json({ message: "Lead restored successfully", lead });
    } catch (error) {
      console.error('[LEAD-RESTORE] Error restoring lead:', error);
      res.status(500).json({ message: "Failed to restore lead" });
    }
  });

  // Bulk restore leads (admin only)
  app.post("/api/leads/bulk-restore", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { leadIds } = req.body as { leadIds: string[] };
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ message: "leadIds array is required" });
      }
      const restoredCount = await storage.bulkRestoreLeads(leadIds);
      res.json({ message: `Restored ${restoredCount} leads`, restoredCount });
    } catch (error) {
      console.error('[LEADS-BULK-RESTORE] Error restoring leads:', error);
      res.status(500).json({ message: "Failed to bulk restore leads" });
    }
  });

  // Lead Tags CRUD
  app.get("/api/lead-tags", requireAuth, async (req, res) => {
    try {
      const tags = await storage.getLeadTags();
      res.json(tags);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch lead tags" });
    }
  });

  app.post("/api/lead-tags", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const { name, color, description } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Tag name is required" });
      }
      const tag = await storage.createLeadTag({ name, color: color || '#6366f1', description });
      res.status(201).json(tag);
    } catch (error) {
      res.status(500).json({ message: "Failed to create lead tag" });
    }
  });

  app.patch("/api/lead-tags/:id", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const { name, color, description } = req.body;
      const tag = await storage.updateLeadTag(req.params.id, { name, color, description });
      if (!tag) {
        return res.status(404).json({ message: "Tag not found" });
      }
      res.json(tag);
    } catch (error) {
      res.status(500).json({ message: "Failed to update lead tag" });
    }
  });

  app.delete("/api/lead-tags/:id", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      await storage.deleteLeadTag(req.params.id);
      res.json({ message: "Tag deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete lead tag" });
    }
  });

  // Get tags for a specific lead
  app.get("/api/leads/:id/tags", requireAuth, async (req, res) => {
    try {
      const tags = await storage.getTagsForLead(req.params.id);
      res.json(tags);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch lead tags" });
    }
  });

  // Add tag to a lead
  app.post("/api/leads/:id/tags/:tagId", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      await storage.addTagToLead(req.params.id, req.params.tagId, userId);
      res.json({ message: "Tag added successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to add tag to lead" });
    }
  });

  // Remove tag from a lead
  app.delete("/api/leads/:id/tags/:tagId", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      await storage.removeTagFromLead(req.params.id, req.params.tagId);
      res.json({ message: "Tag removed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove tag from lead" });
    }
  });

  // Bulk tag operations - add tag to multiple leads
  app.post("/api/leads/bulk-tag", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const { leadIds, tagId } = req.body;
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ message: "Lead IDs are required" });
      }
      if (!tagId) {
        return res.status(400).json({ message: "Tag ID is required" });
      }
      const userId = req.user!.userId;
      await storage.addTagToLeads(leadIds, tagId, userId);
      res.json({ message: `Tag added to ${leadIds.length} leads` });
    } catch (error) {
      res.status(500).json({ message: "Failed to bulk add tags" });
    }
  });

  // Bulk tag operations - remove tag from multiple leads
  app.post("/api/leads/bulk-untag", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const { leadIds, tagId } = req.body;
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ message: "Lead IDs are required" });
      }
      if (!tagId) {
        return res.status(400).json({ message: "Tag ID is required" });
      }
      await storage.removeTagFromLeads(leadIds, tagId);
      res.json({ message: `Tag removed from ${leadIds.length} leads` });
    } catch (error) {
      res.status(500).json({ message: "Failed to bulk remove tags" });
    }
  });

  // Mark lead as delivered to client
  app.post("/api/leads/:id/mark-delivered", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { notes } = req.body;

      // Get the lead first
      const [lead] = await db.select()
        .from(leads)
        .where(eq(leads.id, req.params.id))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      // Verify lead is approved
      if (lead.qaStatus !== 'approved') {
        return res.status(400).json({ message: "Only approved leads can be marked as delivered" });
      }

      // Update lead with delivery info
      const [updatedLead] = await db.update(leads)
        .set({
          deliveredAt: new Date(),
          deliveredById: userId,
          deliverySource: 'manual',
          deliveryNotes: notes || null,
          submittedToClient: true,
          submittedAt: new Date(),
        })
        .where(eq(leads.id, req.params.id))
        .returning();

      res.json(updatedLead);
    } catch (error) {
      console.error('[LEAD-DELIVERY] Error marking lead as delivered:', error);
      res.status(500).json({ message: "Failed to mark lead as delivered", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Bulk mark leads as delivered
  app.post("/api/leads/mark-delivered-bulk", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { leadIds, notes } = req.body as { leadIds: string[], notes?: string };

      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ message: "leadIds array is required" });
      }

      // Update all leads at once
      const updatedLeads = await db.update(leads)
        .set({
          deliveredAt: new Date(),
          deliveredById: userId,
          deliverySource: 'manual',
          deliveryNotes: notes || null,
          submittedToClient: true,
          submittedAt: new Date(),
        })
        .where(and(
          inArray(leads.id, leadIds),
          eq(leads.qaStatus, 'approved') // Only mark approved leads
        ))
        .returning();

      res.json({
        success: true,
        count: updatedLeads.length,
        leads: updatedLeads
      });
    } catch (error) {
      console.error('[LEAD-DELIVERY] Error bulk marking leads as delivered:', error);
      res.status(500).json({ message: "Failed to bulk mark leads as delivered", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Submit lead to client landing page (UKEF)
  app.post("/api/leads/:id/submit-to-client", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const leadId = req.params.id;

      // Get lead with account data (leads -> contacts -> accounts)
      const [lead] = await db.select()
        .from(leads)
        .leftJoin(contacts, eq(leads.contactId, contacts.id))
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(eq(leads.id, leadId))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const leadData = lead.leads;
      const contactData = lead.contacts;
      const accountData = lead.accounts;

      // Validate lead is approved
      if (leadData.qaStatus !== 'approved') {
        return res.status(400).json({ message: "Only approved leads can be submitted to client" });
      }

      // Validate lead has required data
      const { validateLeadForUKEFSubmission, prepareUKEFSubmissionData, submitLeadToUKEF } = await import('./services/ukef-form-submitter');
      
      const validation = validateLeadForUKEFSubmission(leadData, contactData, accountData);
      if (!validation.valid) {
        return res.status(400).json({ 
          message: "Lead validation failed", 
          errors: validation.errors 
        });
      }

      // Prepare and submit data
      const submissionData = prepareUKEFSubmissionData(leadData, contactData!, accountData!);
      const result = await submitLeadToUKEF(submissionData);

      if (!result.success) {
        return res.status(500).json({ 
          message: "Form submission failed", 
          error: result.error,
          statusCode: result.statusCode
        });
      }

      // Update lead with submission info
      const [updatedLead] = await db.update(leads)
        .set({
          submittedToClient: true,
          submittedAt: new Date(),
          submissionResponse: {
            statusCode: result.statusCode,
            submittedAt: new Date().toISOString(),
            submittedBy: userId,
            url: result.submissionUrl
          }
        })
        .where(eq(leads.id, leadId))
        .returning();

      res.json({
        success: true,
        lead: updatedLead,
        submission: result
      });
    } catch (error) {
      console.error('[UKEF-SUBMIT] Error submitting lead to client:', error);
      res.status(500).json({ 
        message: "Failed to submit lead to client", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Bulk submit leads to client landing page
  app.post("/api/leads/submit-to-client-bulk", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { leadIds } = req.body as { leadIds: string[] };

      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ message: "leadIds array is required" });
      }

      // Get all leads with accounts (leads -> contacts -> accounts)
      const leadsWithAccounts = await db.select()
        .from(leads)
        .leftJoin(contacts, eq(leads.contactId, contacts.id))
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(and(
          inArray(leads.id, leadIds),
          eq(leads.qaStatus, 'approved')
        ));

      const { validateLeadForUKEFSubmission, prepareUKEFSubmissionData, submitLeadToUKEF } = await import('./services/ukef-form-submitter');

      // Track all requested leads
      const foundLeadIds = leadsWithAccounts.map(item => item.leads.id);
      const notFoundLeadIds = leadIds.filter(id => !foundLeadIds.includes(id));

      const results = {
        successful: [] as string[],
        failed: [] as { leadId: string; errors: string[] }[],
        skipped: notFoundLeadIds.map(id => ({
          leadId: id,
          errors: ['Lead not found or not approved']
        }))
      };

      // Process each lead
      for (const item of leadsWithAccounts) {
        const leadData = item.leads;
        const contactData = item.contacts;
        const accountData = item.accounts;

        // Validate
        const validation = validateLeadForUKEFSubmission(leadData, contactData, accountData);
        if (!validation.valid) {
          results.failed.push({
            leadId: leadData.id,
            errors: validation.errors
          });
          continue;
        }

        // Submit
        try {
          const submissionData = prepareUKEFSubmissionData(leadData, contactData!, accountData!);
          const result = await submitLeadToUKEF(submissionData);

          if (result.success) {
            // Update lead
            await db.update(leads)
              .set({
                submittedToClient: true,
                submittedAt: new Date(),
                submissionResponse: {
                  statusCode: result.statusCode,
                  submittedAt: new Date().toISOString(),
                  submittedBy: userId,
                  url: result.submissionUrl
                }
              })
              .where(eq(leads.id, leadData.id));

            results.successful.push(leadData.id);
          } else {
            results.failed.push({
              leadId: leadData.id,
              errors: [result.error || `HTTP ${result.statusCode}`]
            });
          }
        } catch (error) {
          results.failed.push({
            leadId: leadData.id,
            errors: [error instanceof Error ? error.message : 'Unknown error']
          });
        }
      }

      res.json({
        success: true,
        total: leadIds.length,
        successCount: results.successful.length,
        failureCount: results.failed.length,
        skippedCount: results.skipped.length,
        results
      });
    } catch (error) {
      console.error('[UKEF-SUBMIT] Error bulk submitting leads:', error);
      res.status(500).json({ 
        message: "Failed to bulk submit leads to client", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.post("/api/leads/:id/validate-company", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const { force = false } = req.body;
      const { validateLeadCompany } = await import('./services/companies-house-validator');
      const result = await validateLeadCompany(req.params.id, force);
      res.json(result);
    } catch (error) {
      console.error('Failed to validate lead company:', error);
      res.status(500).json({ message: "Failed to validate company" });
    }
  });

  app.post("/api/leads/:id/validate-email", requireAuth, async (req, res) => {
    try {
      const leadId = req.params.id;

      // Get lead with contact data
      const [lead] = await db.select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      if (!lead.contactId) {
        return res.status(400).json({ message: "Lead has no associated contact" });
      }

      // Get contact
      const [contact] = await db.select()
        .from(contacts)
        .where(eq(contacts.id, lead.contactId))
        .limit(1);

      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      if (!contact.email) {
        return res.status(400).json({ message: "Contact has no email address" });
      }

      // Import 3-layer email validation service
      const { validate3LayerEmail, summarize3LayerValidation, isDeepVerificationAvailable } = await import('./services/email-validation');

      // Check if Kickbox is available
      const kickboxAvailable = isDeepVerificationAvailable();
      console.log(`[EMAIL-VALIDATION] Manual trigger for lead ${leadId}, contact ${contact.id}, email: ${contact.email}, Kickbox: ${kickboxAvailable ? 'enabled' : 'disabled'}`);
      
      // Run 3-layer Kickbox validation (without storing - leads store results in qaData)
      const validation = await validate3LayerEmail(contact.email, {
        skipSmtp: true, // Kickbox handles SMTP internally
        useCache: false, // Force fresh validation
      });

      // Get summary for business logic
      const summary = summarize3LayerValidation(validation);

      // Update contact's email verification status using the unified 4-status system
      await db.update(contacts)
        .set({ 
          emailVerificationStatus: validation.status, // valid, acceptable, unknown, invalid
          emailStatus: validation.status, // Keep legacy field in sync
        })
        .where(eq(contacts.id, contact.id));

      // Update lead's QA data to mark email validation as complete
      const currentQaData = (lead.qaData as Record<string, any>) || {};
      
      // Determine if deliverable based on unified 4-status system
      // VALID and ACCEPTABLE are deliverable, UNKNOWN passes but uncertain, INVALID fails
      const isDeliverable = validation.status === 'valid' || validation.status === 'acceptable';
      const isUnknown = validation.status === 'unknown';
      
      const updatedQaData = {
        ...currentQaData,
        emailValidation: {
          status: validation.status,
          isDeliverable,
          isUnknown,
          validatedAt: new Date().toISOString(),
          confidence: validation.confidence,
          provider: 'kickbox',
          riskLevel: summary.riskLevel,
          isCatchAll: summary.isCatchAll,
          isDisposable: summary.isDisposable,
          isFree: summary.isFree,
          isRole: summary.isRole,
          eligibilityReason: summary.eligibilityReason,
          layer1: validation.layer1,
          layer2: validation.layer2 ? {
            result: validation.layer2.kickboxResult,
            reason: validation.layer2.kickboxReason,
            score: validation.layer2.kickboxScore,
          } : null,
        },
      };

      await db.update(leads)
        .set({ qaData: updatedQaData })
        .where(eq(leads.id, leadId));

      console.log(`[EMAIL-VALIDATION] Completed for ${contact.email}:`, {
        status: validation.status,
        confidence: validation.confidence,
        riskLevel: summary.riskLevel,
        provider: 'kickbox'
      });

      res.json({
        success: true,
        validation: {
          status: validation.status,
          confidence: validation.confidence,
          isDeliverable,
          isUnknown,
          riskLevel: summary.riskLevel,
          isCatchAll: summary.isCatchAll,
          isDisposable: summary.isDisposable,
          isFree: summary.isFree,
          isRole: summary.isRole,
          eligibilityReason: summary.eligibilityReason,
          provider: 'kickbox',
          kickboxAvailable,
        },
        contact: {
          id: contact.id,
          email: contact.email,
          emailVerificationStatus: validation.status,
        }
      });
    } catch (error: any) {
      console.error('[EMAIL-VALIDATION] Error:', error);
      res.status(500).json({ 
        message: "Failed to validate email",
        error: error.message 
      });
    }
  });

  // ==================== LEAD VERIFICATION ENDPOINTS ====================

  /**
   * POST /api/leads/:id/verify-linkedin
   * LinkedIn screenshot verification with AI validation
   */
  app.post("/api/leads/:id/verify-linkedin", requireAuth, upload.single('screenshot'), async (req, res) => {
    try {
      const leadId = req.params.id;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "Screenshot file is required" });
      }

      // Get lead with related data
      const [lead] = await db.select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      // Get contact and account data for validation (with fallbacks)
      let contactName = lead.contactName || '';
      let companyName = '';
      let jobTitle = '';

      if (lead.contactId) {
        const [contact] = await db.select()
          .from(contacts)
          .where(eq(contacts.id, lead.contactId))
          .limit(1);
        
        if (contact) {
          contactName = contact.fullName || contactName; // Use contact fullName if available
          jobTitle = contact.jobTitle || ''; // Fixed: use jobTitle instead of title

          if (contact.accountId) {
            const [account] = await db.select()
              .from(accounts)
              .where(eq(accounts.id, contact.accountId))
              .limit(1);
            
            if (account) {
              companyName = account.name || '';
            }
          }
        }
      }
      
      // Fallback: if we still don't have company name, try to get it from lead's campaign or account
      if (!companyName && lead.contactId) {
        const [contact] = await db.select()
          .from(contacts)
          .where(eq(contacts.id, lead.contactId))
          .limit(1);
        
        if (contact?.accountId) {
          const [account] = await db.select()
            .from(accounts)
            .where(eq(accounts.id, contact.accountId))
            .limit(1);
          
          if (account) {
            companyName = account.name || '';
          }
        }
      }

      // Upload screenshot to S3
      const s3Key = `lead-verifications/${leadId}/${Date.now()}-${file.originalname}`;
      const s3Result = await uploadToS3(s3Key, file.buffer, file.mimetype);

      console.log('[Lead Verification] Screenshot uploaded to S3:', s3Key);

      // Create verification record
      const [verification] = await db.insert(leadVerifications)
        .values({
          leadId,
          verificationType: 'linkedin_verified',
          verificationStatus: 'pending_ai',
          agentId: req.user!.userId,
          screenshotUrl: s3Result.url,
          screenshotS3Key: s3Key,
          metadata: {
            originalFilename: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
          }
        })
        .returning();

      console.log('[Lead Verification] Created verification record:', verification.id);

      // Trigger AI validation
      const { validateLinkedInScreenshot } = await import('./services/linkedin-screenshot-validator');
      const aiResult = await validateLinkedInScreenshot(
        s3Result.url,
        lead,
        contactName,
        companyName,
        jobTitle
      );

      // Map AI status to DB status
      let dbStatus: 'ai_verified' | 'flagged_review' | 'rejected';
      if (aiResult.status === 'AI Verified') {
        dbStatus = 'ai_verified';
      } else if (aiResult.status === 'Flagged for QA Review') {
        dbStatus = 'flagged_review';
      } else {
        dbStatus = 'rejected';
      }

      // Update verification with AI results
      const [updatedVerification] = await db.update(leadVerifications)
        .set({
          verificationStatus: dbStatus,
          aiValidationResult: aiResult as any,
          validationConfidence: aiResult.validation_confidence.toString(),
          extractedData: aiResult.extracted_data,
          updatedAt: new Date(),
        })
        .where(eq(leadVerifications.id, verification.id))
        .returning();

      // Update lead with verification reference
      await db.update(leads)
        .set({
          verificationId: verification.id,
          verificationStatus: dbStatus,
          qaDecision: aiResult.comments,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));

      console.log('[Lead Verification] AI validation completed:', dbStatus, 'Confidence:', aiResult.validation_confidence);

      res.json({
        success: true,
        verification: updatedVerification,
        aiValidation: aiResult,
      });

    } catch (error) {
      console.error('[Lead Verification] Error:', error);
      res.status(500).json({ 
        message: "Failed to process verification",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/leads/:id/verify-oncall
   * On-call verification with new contact creation
   */
  app.post("/api/leads/:id/verify-oncall", requireAuth, async (req, res) => {
    try {
      const leadId = req.params.id;
      const { 
        newContactFirstName, 
        newContactLastName, 
        newContactEmail,
        newContactPhone, 
        newContactJobTitle, 
        callNotes,
        linkedinUrl 
      } = req.body;

      // Validate required fields
      if (!newContactFirstName || !newContactLastName || !newContactEmail) {
        return res.status(400).json({ 
          ok: false,
          error: "Missing required fields: first name, last name, email" 
        });
      }

      // Validate LinkedIn URL if provided
      if (linkedinUrl) {
        try {
          const urlObj = new URL(linkedinUrl);
          const allowedHostnames = ['linkedin.com', 'www.linkedin.com', 'linkedin.cn', 'www.linkedin.cn'];
          if (!allowedHostnames.includes(urlObj.hostname.toLowerCase())) {
            return res.status(400).json({
              ok: false,
              error: 'Invalid LinkedIn URL - must be from linkedin.com or linkedin.cn',
            });
          }
        } catch (error) {
          return res.status(400).json({
            ok: false,
            error: 'Invalid URL format',
          });
        }
      }

      // Get lead
      const [lead] = await db.select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      // Get account ID from contact
      let accountId: string | null = null;
      if (lead.contactId) {
        const [contact] = await db.select()
          .from(contacts)
          .where(eq(contacts.id, lead.contactId))
          .limit(1);
        
        if (contact) {
          accountId = contact.accountId;
        }
      }

      // Create new contact
      const [newContact] = await db.insert(contacts)
        .values({
          firstName: newContactFirstName,
          lastName: newContactLastName,
          fullName: `${newContactFirstName} ${newContactLastName}`,
          jobTitle: newContactJobTitle || null,
          email: newContactEmail,
          phone: newContactPhone || null,
          linkedinUrl: linkedinUrl || null,
          accountId: accountId,
        })
        .returning();

      console.log('[Lead Verification] Created new contact:', newContact.id);

      // Create verification record (no screenshot required)
      const [verification] = await db.insert(leadVerifications)
        .values({
          leadId,
          verificationType: 'oncall_confirmed',
          verificationStatus: 'pending', // Awaiting QA review
          agentId: req.user!.userId,
          verifiedContactId: newContact.id,
          callRecordingId: lead.callAttemptId,
          metadata: {
            newContactCreated: true,
            callNotes: callNotes || null,
          }
        })
        .returning();

      // Update lead with verification reference and LinkedIn URL
      await db.update(leads)
        .set({
          verificationId: verification.id,
          verificationStatus: 'pending',
          linkedinUrl: linkedinUrl || null,
          qaDecision: `On-call verification: New contact created for ${newContactFirstName} ${newContactLastName}${newContactJobTitle ? ` at ${newContactJobTitle}` : ''}`,
          actualContactId: newContact.id,
          wrongPersonAnswered: true, // Flag that different person answered
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));

      console.log('[Lead Verification] On-call verification completed');

      res.json({
        ok: true,
        verification,
        newContact,
      });

    } catch (error) {
      console.error('[Lead Verification] Error:', error);
      res.status(500).json({ 
        message: "Failed to process on-call verification",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/verifications/:id
   * Get verification details with AI analysis
   */
  app.get("/api/verifications/:id", requireAuth, async (req, res) => {
    try {
      const [verification] = await db.select()
        .from(leadVerifications)
        .where(eq(leadVerifications.id, req.params.id))
        .limit(1);

      if (!verification) {
        return res.status(404).json({ message: "Verification not found" });
      }

      // Get related lead
      const [lead] = await db.select()
        .from(leads)
        .where(eq(leads.id, verification.leadId))
        .limit(1);

      // Get agent info
      const [agent] = await db.select()
        .from(users)
        .where(eq(users.id, verification.agentId))
        .limit(1);

      res.json({
        verification,
        lead,
        agent,
      });

    } catch (error) {
      console.error('[Verification] Error fetching verification:', error);
      res.status(500).json({ message: "Failed to fetch verification" });
    }
  });

  app.get("/api/leads/export/approved", requireAuth, async (req, res) => {
    try {
      // Get all approved leads with proper filter
      const qaStatusFilter: FilterGroup = {
        logic: 'AND',
        combinator: 'and',
        conditions: [{
          id: 'qa-status-filter',
          field: 'qaStatus',
          operator: 'equals',
          value: 'approved',
          values: ['approved']
        }]
      };
      const leadsData = await storage.getLeads(qaStatusFilter);
      
      // Import S3 utilities to generate fresh presigned URLs for recordings
      const { getPresignedDownloadUrl, s3ObjectExists } = await import('./lib/s3');

      // Generate fresh presigned URLs for recordings stored in S3 (7-day validity)
      const csvData = await Promise.all(leadsData.map(async (lead) => {
        let recordingUrl = lead.recordingUrl || '';
        
        // If recording is stored in S3, generate a fresh 7-day presigned URL
        if (lead.recordingS3Key) {
          try {
            const exists = await s3ObjectExists(lead.recordingS3Key);
            if (exists) {
              recordingUrl = await getPresignedDownloadUrl(lead.recordingS3Key, 7 * 24 * 60 * 60);
            }
          } catch (s3Error) {
            console.error(`[Export] Failed to generate presigned URL for lead ${lead.id}:`, s3Error);
          }
        }
        
        // Build agent name from first/last name fields
        const agentName = [lead.agentFirstName, lead.agentLastName].filter(Boolean).join(' ') || '';
        
        return {
          'Lead ID': lead.id,
          'Contact Name': lead.contactName || '',
          'Contact Email': lead.contactEmail || '',
          'Job Title': lead.contactTitle || '',
          'Company': lead.accountName || '',
          'Industry': lead.accountIndustry || '',
          'Phone': lead.dialedNumber || '',
          'Dialed Number': lead.dialedNumber || '',
          'Agent': agentName,
          'Agent Email': lead.agentEmail || '',
          'Call Duration (sec)': lead.callDuration || '',
          'Recording URL': recordingUrl,
          'Notes': lead.notes || '',
          'AI Score': lead.aiScore || '',
          'AI Qualification': lead.aiQualificationStatus || '',
          'Created At': lead.createdAt ? new Date(lead.createdAt).toISOString() : '',
          'Approved At': lead.approvedAt ? new Date(lead.approvedAt).toISOString() : '',
        };
      }));

      // Convert to CSV
      const PapaModule = await import('papaparse');
      const Papa = PapaModule.default;
      const csv = Papa.unparse(csvData);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `approved-leads-${timestamp}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error('Failed to export leads:', error);
      res.status(500).json({ message: "Failed to export leads" });
    }
  });

  // Get agents for filter dropdown
  app.get("/api/users/agents", requireAuth, async (req, res) => {
    try {
      const agents = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      }).from(users);

      res.json(agents);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      res.status(500).json({ message: "Failed to fetch agents" });
    }
  });

  // Get industries for filter dropdown
  app.get("/api/industries", requireAuth, async (req, res) => {
    try {
      const industries = await db.select({
        id: industryReference.id,
        name: industryReference.name,
      }).from(industryReference).where(eq(industryReference.isActive, true));

      res.json(industries);
    } catch (error) {
      console.error('Failed to fetch industries:', error);
      res.status(500).json({ message: "Failed to fetch industries" });
    }
  });

  // Bulk export filtered leads
  app.post("/api/leads/bulk-export", requireAuth, async (req, res) => {
    try {
      const { leadIds } = req.body as { leadIds: string[] };

      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ message: "leadIds array is required" });
      }

      // Filter out any null/undefined values and ensure all are valid strings
      const validLeadIds = leadIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
      
      if (validLeadIds.length === 0) {
        return res.status(400).json({ message: "No valid lead IDs provided" });
      }

      // Get all requested leads with full details (join contacts and accounts for company info)
      const leadsData = await db.select({
        id: leads.id,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        contactTitle: contacts.jobTitle,
        accountName: accounts.name,
        accountIndustry: accounts.industryStandardized,
        campaignId: leads.campaignId,
        qaStatus: leads.qaStatus,
        deliveredAt: leads.deliveredAt,
        submittedAt: leads.submittedAt,
        submittedToClient: leads.submittedToClient,
        dialedNumber: leads.dialedNumber,
        callDuration: leads.callDuration,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
        notes: leads.notes,
        createdAt: leads.createdAt,
        approvedAt: leads.approvedAt,
        aiScore: leads.aiScore,
        aiQualificationStatus: leads.aiQualificationStatus,
        agentFirstName: users.firstName,
        agentLastName: users.lastName,
        agentEmail: users.email,
        campaignName: campaigns.name,
      })
        .from(leads)
        .leftJoin(contacts, eq(leads.contactId, contacts.id))
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .leftJoin(users, eq(leads.agentId, users.id))
        .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
        .where(inArray(leads.id, validLeadIds));

      // Import S3 utilities for fresh presigned URLs
      const { getPresignedDownloadUrl, s3ObjectExists } = await import('./lib/s3');
      
      // Convert to CSV format with fresh presigned URLs for recordings
      const PapaModule = await import('papaparse');
      const Papa = PapaModule.default;
      const csvData = await Promise.all(leadsData.map(async (lead) => {
        let recordingUrl = lead.recordingUrl || '';
        
        // If recording is stored in S3, generate a fresh 7-day presigned URL
        if (lead.recordingS3Key) {
          try {
            const exists = await s3ObjectExists(lead.recordingS3Key);
            if (exists) {
              recordingUrl = await getPresignedDownloadUrl(lead.recordingS3Key, 7 * 24 * 60 * 60);
            }
          } catch (s3Error) {
            console.error(`[Export] Failed to generate presigned URL for lead ${lead.id}:`, s3Error);
          }
        }
        
        return {
          'Lead ID': lead.id || '',
          'Contact Name': lead.contactName || '',
          'Contact Email': lead.contactEmail || '',
          'Job Title': lead.contactTitle || '',
          'Company': lead.accountName || '',
          'Industry': lead.accountIndustry || '',
          'Campaign': lead.campaignName || '',
          'QA Status': lead.qaStatus || '',
          'AI Score': lead.aiScore || '',
          'AI Qualification': lead.aiQualificationStatus || '',
          'Delivery Status': lead.deliveredAt ? 'Delivered' : 'Pending',
          'Submitted to Client': lead.submittedToClient ? 'Yes' : 'No',
          'Agent': `${lead.agentFirstName || ''} ${lead.agentLastName || ''}`.trim() || 'N/A',
          'Agent Email': lead.agentEmail || '',
          'Dialed Number': lead.dialedNumber || '',
          'Call Duration (seconds)': lead.callDuration || '',
          'Recording URL': recordingUrl,
          'Notes': lead.notes || '',
          'Created At': lead.createdAt ? new Date(lead.createdAt).toISOString() : '',
          'Approved At': lead.approvedAt ? new Date(lead.approvedAt).toISOString() : '',
          'Delivered At': lead.deliveredAt ? new Date(lead.deliveredAt).toISOString() : '',
          'Submitted At': lead.submittedAt ? new Date(lead.submittedAt).toISOString() : '',
        };
      }));

      const csv = Papa.unparse(csvData);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `leads-export-${timestamp}.csv`;

      res.json({
        success: true,
        csv: csv,
        filename: filename,
        count: leadsData.length
      });
    } catch (error) {
      console.error('Failed to bulk export leads:', error);
      res.status(500).json({ message: "Failed to export leads" });
    }
  });

  // Bulk delete leads (soft delete)
  app.post("/api/leads/bulk-delete", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { leadIds } = req.body as { leadIds: string[] };

      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ message: "leadIds array is required" });
      }

      // Soft delete all specified leads
      let deletedCount = 0;
      for (const leadId of leadIds) {
        try {
          await storage.deleteLead(leadId, req.user!.id);
          deletedCount++;
        } catch (err) {
          console.error(`Failed to delete lead ${leadId}:`, err);
        }
      }

      // Log the bulk delete action
      await storage.createActivityLog({
        userId: req.user!.userId,
        action: 'bulk_delete_leads',
        resource: 'leads',
        resourceId: null,
        details: {
          leadIds,
          deletedCount,
        },
      });

      res.json({
        success: true,
        deletedCount,
        message: `Successfully deleted ${deletedCount} leads`,
      });
    } catch (error) {
      console.error('Failed to bulk delete leads:', error);
      res.status(500).json({ message: "Failed to delete leads" });
    }
  });

  // Bulk update leads
  app.post("/api/leads/bulk-update", requireAuth, requireRole('admin', 'campaign_manager', 'quality_analyst'), async (req, res) => {
    try {
      const { leadIds, updates } = req.body as { 
        leadIds: string[]; 
        updates: { 
          qaStatus?: string;
          agentId?: string;
        };
      };

      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ message: "leadIds array is required" });
      }

      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "updates object is required" });
      }

      // Build the update object with only allowed fields
      const updateData: any = {};
      if (updates.qaStatus) {
        updateData.qaStatus = updates.qaStatus;
        if (updates.qaStatus === 'approved') {
          updateData.approvedAt = new Date();
          updateData.approvedById = req.user!.userId;
        } else if (updates.qaStatus === 'rejected') {
          updateData.rejectedAt = new Date();
          updateData.rejectedById = req.user!.userId;
        }
      }
      if (updates.agentId) {
        updateData.agentId = updates.agentId;
      }

      // Update all specified leads
      let updatedCount = 0;
      for (const leadId of leadIds) {
        try {
          await db.update(leads).set(updateData).where(eq(leads.id, leadId));
          updatedCount++;
        } catch (err) {
          console.error(`Failed to update lead ${leadId}:`, err);
        }
      }

      // Log the bulk update action
      await storage.createActivityLog({
        userId: req.user!.userId,
        action: 'bulk_update_leads',
        resource: 'leads',
        resourceId: null,
        details: {
          leadIds,
          updates,
          updatedCount,
        },
      });

      res.json({
        success: true,
        updatedCount,
        message: `Successfully updated ${updatedCount} leads`,
      });
    } catch (error) {
      console.error('Failed to bulk update leads:', error);
      res.status(500).json({ message: "Failed to update leads" });
    }
  });

  // ==================== LEAD INTAKE API ====================

  app.post("/api/intake/lead", apiLimiter, async (req, res) => {
    try {
      const validated = leadIntakeSchema.parse(req.body);

      // Extract domain from email if not provided
      const emailDomain = validated.email.split('@')[1].toLowerCase();
      const companyDomain = validated.companyDomain || emailDomain;

      // Prepare account data
      const accountData: Partial<Parameters<typeof storage.upsertAccount>[0]> = {
        name: validated.company || emailDomain,
        domain: companyDomain,
        tags: validated.tags,
      };

      // Upsert account (find or create)
      const { account, action: accountAction } = await storage.upsertAccount(
        accountData as any,
        {
          sourceSystem: validated.source || 'Lead Intake API',
          sourceRecordId: validated.email,
          sourceUpdatedAt: new Date(),
        }
      );

      // Prepare contact data
      const contactData: Partial<Parameters<typeof storage.upsertContact>[0]> = {
        email: validated.email,
        firstName: validated.firstName,
        lastName: validated.lastName,
        jobTitle: validated.jobTitle,
        department: validated.department,
        directPhone: validated.phone,
        accountId: account.id,
        tags: validated.tags,
        customFields: validated.customFields,
        consentBasis: validated.consentBasis,
        consentSource: validated.consentSource,
      };

      // Upsert contact (find or create)
      const { contact, action: contactAction } = await storage.upsertContact(
        contactData as any,
        {
          sourceSystem: validated.source || 'Lead Intake API',
          sourceRecordId: validated.email,
          sourceUpdatedAt: new Date(),
        }
      );

      invalidateDashboardCache();

      res.status(201).json({
        success: true,
        message: `Lead processed successfully`,
        data: {
          contact: {
            id: contact.id,
            email: contact.email,
            fullName: contact.fullName,
            action: contactAction,
          },
          account: {
            id: account.id,
            name: account.name,
            domain: account.domain,
            action: accountAction,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: error.errors
        });
      }

      console.error('Lead intake error:', error);
      res.status(500).json({
        success: false,
        message: "Failed to process lead"
      });
    }
  });

  // ==================== SUPPRESSIONS ====================

  app.get("/api/suppressions/email", requireAuth, async (req, res) => {
    try {
      const suppressions = await storage.getEmailSuppressions();
      res.json(suppressions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email suppressions" });
    }
  });

  app.post("/api/suppressions/email", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const validated = insertSuppressionEmailSchema.parse(req.body);
      const suppression = await storage.addEmailSuppression(validated);
      res.status(201).json(suppression);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add email suppression" });
    }
  });

  app.get("/api/suppressions/phone", requireAuth, async (req, res) => {
    try {
      const suppressions = await storage.getPhoneSuppressions();
      res.json(suppressions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch phone suppressions" });
    }
  });

  app.post("/api/suppressions/phone", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const validated = insertSuppressionPhoneSchema.parse(req.body);
      const suppression = await storage.addPhoneSuppression(validated);
      res.status(201).json(suppression);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add phone suppression" });
    }
  });

  app.delete("/api/suppressions/email/:id", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteEmailSuppression(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete email suppression" });
    }
  });

  app.delete("/api/suppressions/phone/:id", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePhoneSuppression(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete phone suppression" });
    }
  });

  // ==================== CAMPAIGN ORDERS (Client Portal) ====================

  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getCampaignOrders();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const order = await storage.getCampaignOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  app.post("/api/orders", requireAuth, requireRole('admin', 'client_user'), async (req, res) => {
    try {
      const validated = insertCampaignOrderSchema.parse(req.body);
      const order = await storage.createCampaignOrder(validated);
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  app.patch("/api/orders/:id", requireAuth, requireRole('admin', 'client_user'), async (req, res) => {
    try {
      const order = await storage.updateCampaignOrder(req.params.id, req.body);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  app.post("/api/orders/:id/submit", requireAuth, requireRole('admin', 'client_user'), async (req, res) => {
    try {
      const order = await storage.updateCampaignOrder(req.params.id, {
        status: 'submitted',
        submittedAt: new Date()
      });

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to submit order" });
    }
  });

  // ==================== ORDER-CAMPAIGN LINKS (Bridge Model) ====================

  app.get("/api/orders/:orderId/campaign-links", requireAuth, async (req, res) => {
    try {
      const links = await storage.getOrderCampaignLinks(req.params.orderId);
      res.json(links);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch campaign links" });
    }
  });

  app.post("/api/orders/:orderId/campaign-links", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertOrderCampaignLinkSchema.parse({
        ...req.body,
        orderId: req.params.orderId
      });

      const link = await storage.createOrderCampaignLink(validated);
      res.status(201).json(link);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to link campaign" });
    }
  });

  app.delete("/api/orders/:orderId/campaign-links/:linkId", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      await storage.deleteOrderCampaignLink(req.params.linkId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to unlink campaign" });
    }
  });

  // ==================== DASHBOARD STATS ====================

  let dashboardStatsCache: { data: any; timestamp: number } | null = null;
  const CACHE_TTL_MS = 5 * 60 * 1000;

  function invalidateDashboardCache() {
    dashboardStatsCache = null;
  }

  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const now = Date.now();

      if (dashboardStatsCache && (now - dashboardStatsCache.timestamp) < CACHE_TTL_MS) {
        return res.json(dashboardStatsCache.data);
      }

      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      const [
        totalAccounts,
        totalContacts,
        allCampaigns,
        leadsThisMonthResult
      ] = await Promise.all([
        storage.getAccountsCount(),
        storage.getContactsCount(),
        db.select({ id: campaigns.id, type: campaigns.type, status: campaigns.status }).from(campaigns),
        db.select({ count: sql<number>`count(*)::int` })
          .from(leads)
          .where(sql`${leads.createdAt} >= ${thisMonth}`)
      ]);

      const activeCampaigns = allCampaigns.filter(c => c.status === 'active');
      const emailCampaigns = activeCampaigns.filter(c => c.type === 'email').length;
      const callCampaigns = activeCampaigns.filter(c => c.type === 'call').length;

      const statsData = {
        totalAccounts,
        totalContacts,
        activeCampaigns: activeCampaigns.length,
        activeCampaignsBreakdown: {
          email: emailCampaigns,
          telemarketing: callCampaigns
        },
        leadsThisMonth: leadsThisMonthResult[0]?.count || 0
      };

      dashboardStatsCache = { data: statsData, timestamp: now };

      res.json(statsData);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({
        message: "Failed to fetch dashboard stats",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Agent-specific dashboard stats
  // UNIFIED: Combines legacy callSessions and new dialerCallAttempts for accurate stats
  app.get("/api/dashboard/agent-stats", requireAuth, async (req, res) => {
    try {
      const agentId = req.user!.userId;
      const { dialerCallAttempts: dca, dialerRuns } = await import('@shared/schema');

      // Get today and this month dates for filtering
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      // ========== DIALER CALL ATTEMPTS (Primary source for new calls) ==========
      const dialerCallsToday = await db
        .select({
          count: sql<number>`COUNT(*)::int`,
          connected: sql<number>`COUNT(CASE WHEN ${dca.connected} = true THEN 1 END)::int`,
          qualified: sql<number>`COUNT(CASE WHEN ${dca.disposition} = 'qualified_lead' THEN 1 END)::int`,
          totalDuration: sql<number>`SUM(COALESCE(${dca.callDurationSeconds}, 0))::int`,
        })
        .from(dca)
        .where(and(
          eq(dca.humanAgentId, agentId),
          gte(dca.createdAt, today)
        ));

      const dialerCallsThisMonth = await db
        .select({
          count: sql<number>`COUNT(*)::int`,
          connected: sql<number>`COUNT(CASE WHEN ${dca.connected} = true THEN 1 END)::int`,
          qualified: sql<number>`COUNT(CASE WHEN ${dca.disposition} = 'qualified_lead' THEN 1 END)::int`,
          totalDuration: sql<number>`SUM(COALESCE(${dca.callDurationSeconds}, 0))::int`,
        })
        .from(dca)
        .where(and(
          eq(dca.humanAgentId, agentId),
          gte(dca.createdAt, thisMonth)
        ));

      const dialerCallsTotal = await db
        .select({
          count: sql<number>`COUNT(*)::int`,
          connected: sql<number>`COUNT(CASE WHEN ${dca.connected} = true THEN 1 END)::int`,
          qualified: sql<number>`COUNT(CASE WHEN ${dca.disposition} = 'qualified_lead' THEN 1 END)::int`,
          totalDuration: sql<number>`SUM(COALESCE(${dca.callDurationSeconds}, 0))::int`,
        })
        .from(dca)
        .where(eq(dca.humanAgentId, agentId));

      // ========== LEGACY CALL SESSIONS (For backwards compatibility) ==========
      const legacyStats = await db
        .select({
          todayCount: sql<number>`COUNT(CASE WHEN ${callSessions.startedAt} >= ${today} THEN 1 END)::int`,
          monthCount: sql<number>`COUNT(CASE WHEN ${callSessions.startedAt} >= ${thisMonth} THEN 1 END)::int`,
          totalCount: sql<number>`COUNT(*)::int`,
          totalDuration: sql<number>`SUM(COALESCE(${callSessions.durationSec}, 0))::int`,
        })
        .from(callSessions)
        .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
        .where(eq(callJobs.agentId, agentId));

      // Legacy qualified count
      const legacyQualified = await db
        .select({
          count: sql<number>`COUNT(*)::int`,
        })
        .from(callDispositions)
        .innerJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
        .innerJoin(callSessions, eq(callDispositions.callSessionId, callSessions.id))
        .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
        .where(and(
          eq(callJobs.agentId, agentId),
          eq(dispositions.systemAction, 'converted_qualified')
        ));

      // ========== MERGE STATS ==========
      const todayDialer = dialerCallsToday[0] || { count: 0, connected: 0, qualified: 0, totalDuration: 0 };
      const monthDialer = dialerCallsThisMonth[0] || { count: 0, connected: 0, qualified: 0, totalDuration: 0 };
      const totalDialer = dialerCallsTotal[0] || { count: 0, connected: 0, qualified: 0, totalDuration: 0 };
      const legacy = legacyStats[0] || { todayCount: 0, monthCount: 0, totalCount: 0, totalDuration: 0 };
      const legacyQual = legacyQualified[0]?.count || 0;

      const callsToday = todayDialer.count + legacy.todayCount;
      const callsThisMonth = monthDialer.count + legacy.monthCount;
      const totalCalls = totalDialer.count + legacy.totalCount;
      const totalDuration = totalDialer.totalDuration + legacy.totalDuration;
      const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
      const qualifiedCount = totalDialer.qualified + legacyQual;

      // Get leads created by this agent
      const agentLeads = await db
        .select()
        .from(leads)
        .where(eq(leads.agentId, agentId));

      const approvedLeads = agentLeads.filter(l => l.qaStatus === 'approved').length;
      const pendingLeads = agentLeads.filter(l =>
        l.qaStatus === 'new' || l.qaStatus === 'under_review'
      ).length;

      // Get active campaigns assigned to this agent
      const agentAssignments = await db
        .select()
        .from(campaignAgentAssignments)
        .where(
          and(
            eq(campaignAgentAssignments.agentId, agentId),
            eq(campaignAgentAssignments.isActive, true)
          )
        );

      res.json({
        callsToday,
        callsThisMonth,
        totalCalls,
        avgDuration,
        qualified: qualifiedCount,
        leadsApproved: approvedLeads,
        leadsPending: pendingLeads,
        activeCampaigns: agentAssignments.length,
      });
    } catch (error) {
      console.error("Agent dashboard stats error:", error);
      res.status(500).json({
        message: "Failed to fetch agent dashboard stats",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ==================== SAVED FILTERS ====================

  app.get("/api/saved-filters", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const entityType = req.query.entityType as string | undefined;
      const filters = await storage.getSavedFilters(userId, entityType);
      res.json(filters);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch saved filters" });
    }
  });

  app.post("/api/saved-filters", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const validated = insertSavedFilterSchema.parse(req.body);
      const savedFilter = await storage.createSavedFilter({ ...validated, userId });
      res.status(201).json(savedFilter);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create saved filter" });
    }
  });

  app.patch("/api/saved-filters/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const filter = await storage.updateSavedFilter(req.params.id, userId, req.body);
      if (!filter) {
        return res.status(404).json({ message: "Saved filter not found" });
      }
      res.json(filter);
    } catch (error) {
      res.status(500).json({ message: "Failed to update saved filter" });
    }
  });

  app.delete("/api/saved-filters/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const deleted = await storage.deleteSavedFilter(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Saved filter not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete saved filter" });
    }
  });

  // ==================== FILTER FIELDS REGISTRY ====================

  // Filter field metadata is public (no auth required) - only exposes schema/configuration
  app.get("/api/filters/fields", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const fields = await storage.getFilterFields(category);

      // Group by category for easier UI consumption
      const grouped = fields.reduce((acc: any, field) => {
        if (!acc[field.category]) {
          acc[field.category] = [];
        }
        acc[field.category].push(field);
        return acc;
      }, {});

      res.json({
        fields,
        grouped,
        categories: Object.keys(grouped)
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch filter fields" });
    }
  });

  // Get filter fields by entity type (contact, account, lead, campaign, etc.)
  app.get("/api/filters/fields/entity/:entity", async (req, res) => {
    try {
      const entity = req.params.entity;
      const includeRelated = req.query.includeRelated === 'true';

      const validEntities = ['contact', 'account', 'lead', 'campaign', 'segment', 'list', 'order', 'suppression'];
      if (!validEntities.includes(entity)) {
        return res.status(400).json({ message: `Invalid entity type. Must be one of: ${validEntities.join(', ')}` });
      }

      let dbFields = await storage.getFilterFieldsByEntity(entity);

      // If includeRelated is true and entity is contact, also include account fields
      if (includeRelated && entity === 'contact') {
        const accountFields = await storage.getFilterFieldsByEntity('account');
        // Deduplicate by key - contact fields take precedence
        const existingKeys = new Set(dbFields.map(f => f.key));
        const uniqueAccountFields = accountFields.filter(f => !existingKeys.has(f.key));
        dbFields = [...dbFields, ...uniqueAccountFields];
      }

      // If database is empty, fall back to hardcoded fields from shared/filter-types
      let mappedFields: { key: string; label: string; type: string; operators: string[]; category: string; typeAhead?: boolean; typeAheadSource?: string }[] = [];
      
      if (dbFields.length > 0) {
        // Map database fields to the expected format
        mappedFields = dbFields.map(field => ({
          key: field.key,
          label: field.label,
          type: field.type,
          operators: Array.isArray(field.operators) ? field.operators : [],
          category: field.category
        }));
      } else {
        // Fall back to hardcoded fields from shared/filter-types.ts
        const { filterFieldsByEntity, accountFilterFields, contactFilterFields } = await import('@shared/filter-types');
        
        const getFieldsFromConfig = (fieldConfigs: Record<string, any>, entityType: string) => {
          return Object.entries(fieldConfigs).map(([key, config]) => ({
            key,
            label: config.label,
            type: config.type || 'text',
            operators: config.applicableOperators || ['equals', 'not_equals', 'contains', 'is_empty', 'has_any_value'],
            category: config.category || 'Other',
            typeAhead: config.typeAhead,
            typeAheadSource: config.typeAheadSource
          }));
        };
        
        // Get fields based on entity type
        const entityFilterFields = filterFieldsByEntity[entity as keyof typeof filterFieldsByEntity];
        if (entityFilterFields) {
          mappedFields = getFieldsFromConfig(entityFilterFields, entity);
        }
        
        // For contacts, optionally include account fields (with deduplication)
        if (entity === 'contact' && includeRelated) {
          const accountMapped = getFieldsFromConfig(accountFilterFields, 'account');
          // Deduplicate by key - contact fields take precedence
          const existingKeys = new Set(mappedFields.map(f => f.key));
          const uniqueAccountFields = accountMapped.filter(f => !existingKeys.has(f.key));
          mappedFields = [...mappedFields, ...uniqueAccountFields];
        }
      }

      // Group by category for easier UI consumption
      const grouped = mappedFields.reduce((acc: any, field) => {
        if (!acc[field.category]) {
          acc[field.category] = [];
        }
        acc[field.category].push(field);
        return acc;
      }, {});

      res.json({
        fields: mappedFields,
        grouped,
        categories: Object.keys(grouped)
      });
    } catch (error) {
      console.error('Error fetching filter fields:', error);
      res.status(500).json({ message: "Failed to fetch filter fields for entity" });
    }
  });

  // Get count of records matching filter criteria (with optional audience scope)
  app.post("/api/filters/count/:entity", async (req, res) => {
    try {
      const entity = req.params.entity;
      const { filterGroup, audienceScope } = req.body;
      
      // Debug logging
      console.log('[FilterCount] Entity:', entity);
      console.log('[FilterCount] FilterGroup received:', JSON.stringify(filterGroup, null, 2));
      console.log('[FilterCount] Has conditions:', filterGroup?.conditions?.length || 0);

      const validEntities = ['contact', 'account', 'lead', 'campaign', 'segment', 'list', 'order', 'suppression'];
      if (!validEntities.includes(entity)) {
        return res.status(400).json({ message: `Invalid entity type. Must be one of: ${validEntities.join(', ')}` });
      }

      let count = 0;
      if (entity === 'contact') {
        // Use efficient count query when no audience scope
        if (!audienceScope && filterGroup) {
          count = await storage.getContactsCount(filterGroup);
          console.log('[FilterCount] Using efficient count query, result:', count);
        } else if (!audienceScope && !filterGroup) {
          // No filter, get total count
          count = await storage.getContactsCount();
          console.log('[FilterCount] No filter, total count:', count);
        } else {
          // Legacy path with audience scope - needs full contact list
          let contacts = await storage.getContacts(filterGroup);
        
          // Apply audience scope if provided (filter to only contacts in specified lists/segments)
          if (audienceScope) {
            const { listIds, segmentIds, campaignId } = audienceScope;
            
            // Get contact IDs from audience scope
            let audienceContactIds: Set<string> | null = null;
            
            if (listIds && listIds.length > 0) {
              audienceContactIds = new Set<string>();
              for (const listId of listIds) {
                const list = await storage.getList(listId);
                if (list?.recordIds) {
                  list.recordIds.forEach(id => audienceContactIds!.add(id));
                }
              }
            }
            
            if (segmentIds && segmentIds.length > 0) {
              if (!audienceContactIds) audienceContactIds = new Set<string>();
              for (const segmentId of segmentIds) {
                const segmentContacts = await storage.getContactsBySegmentId(segmentId);
                segmentContacts.forEach(c => audienceContactIds!.add(c.id));
              }
            }
            
            if (campaignId) {
              // Get campaign audience
              const campaign = await storage.getCampaign(campaignId);
              if (campaign?.audienceListIds?.length) {
                if (!audienceContactIds) audienceContactIds = new Set<string>();
                for (const listId of campaign.audienceListIds) {
                  const list = await storage.getList(listId);
                  if (list?.recordIds) {
                    list.recordIds.forEach(id => audienceContactIds!.add(id));
                  }
                }
              }
            }
            
            // Filter contacts to only those in the audience
            if (audienceContactIds && audienceContactIds.size > 0) {
              contacts = contacts.filter(c => audienceContactIds!.has(c.id));
            } else if (audienceScope.listIds?.length || audienceScope.segmentIds?.length || audienceScope.campaignId) {
              // Audience scope was specified but no contacts found - return 0
              contacts = [];
            }
          }
          
          count = contacts.length;
        }
      } else if (entity === 'account') {
        const accounts = await storage.getAccounts(filterGroup);
        count = accounts.length;
      } else if (entity === 'lead') {
        // For leads, return basic count - full filtering would require more implementation
        const leads = await storage.getLeads();
        count = leads.length;
      } else if (entity === 'campaign') {
        const campaigns = await storage.getCampaigns();
        count = campaigns.length;
      } else if (entity === 'segment' || entity === 'list') {
        const segments = await storage.getSegments();
        const lists = await storage.getLists();
        count = entity === 'segment' ? segments.length : lists.length;
      }

      res.json({ count });
    } catch (error) {
      console.error('Error getting filter count:', error);
      res.status(500).json({ message: "Failed to get filter count" });
    }
  });

  // ==================== INDUSTRY REFERENCE ====================

  // Get all standardized industries
  app.get("/api/industries", async (req, res) => {
    try {
      const industries = await storage.getIndustries();
      res.json(industries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch industries" });
    }
  });

  // Search industries by name (with autocomplete)
  app.get("/api/industries/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      if (!query) {
        return res.status(400).json({ message: "Search query 'q' is required" });
      }

      const industries = await storage.searchIndustries(query, limit);
      res.json(industries);
    } catch (error) {
      res.status(500).json({ message: "Failed to search industries" });
    }
  });

  // ==================== COMPANY SIZE REFERENCE ====================

  // Get all standardized company size ranges (sorted by employee count)
  app.get("/api/company-sizes", async (req, res) => {
    try {
      const sizes = await storage.getCompanySizes();
      res.json(sizes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch company sizes" });
    }
  });

  // Get company size by code (A-I)
  app.get("/api/company-sizes/:code", async (req, res) => {
    try {
      const size = await storage.getCompanySizeByCode(req.params.code);
      if (!size) {
        return res.status(404).json({ message: "Company size not found" });
      }
      res.json(size);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch company size" });
    }
  });

  // ==================== REVENUE RANGE REFERENCE ====================

  // Get all standardized revenue ranges (sorted by revenue)
  app.get("/api/revenue-ranges", async (req, res) => {
    try {
      const ranges = await storage.getRevenueRanges();
      res.json(ranges);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch revenue ranges" });
    }
  });

  // Get revenue range by label
  app.get("/api/revenue-ranges/:label", async (req, res) => {
    try {
      const range = await storage.getRevenueRangeByLabel(decodeURIComponent(req.params.label));
      if (!range) {
        return res.status(404).json({ message: "Revenue range not found" });
      }
      res.json(range);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch revenue range" });
    }
  });

  // ==================== SELECTION CONTEXTS (Bulk Operations) ====================

  app.get("/api/selection-contexts/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;

      // Opportunistic cleanup of expired contexts
      await storage.deleteExpiredSelectionContexts().catch(() => { });

      const context = await storage.getSelectionContext(req.params.id, userId);
      if (!context) {
        return res.status(404).json({ message: "Selection context not found or expired" });
      }
      res.json(context);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch selection context" });
    }
  });

  app.post("/api/selection-contexts", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;

      // Opportunistic cleanup of expired contexts
      await storage.deleteExpiredSelectionContexts().catch(() => { });

      // Validate client payload (omit server-managed fields)
      const clientSchema = insertSelectionContextSchema.omit({ userId: true, expiresAt: true });
      const validated = clientSchema.parse(req.body);

      // Set expiration to 15 minutes from now
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const context = await storage.createSelectionContext({
        ...validated,
        userId,
        expiresAt
      });

      res.status(201).json(context);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create selection context" });
    }
  });

  app.delete("/api/selection-contexts/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const deleted = await storage.deleteSelectionContext(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Selection context not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete selection context" });
    }
  });

  // ==================== BULK IMPORTS ====================

  app.get("/api/imports", requireAuth, async (req, res) => {
    try {
      const imports = await storage.getBulkImports();
      res.json(imports);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch imports" });
    }
  });

  app.post("/api/imports", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const validated = insertBulkImportSchema.parse(req.body);
      const bulkImport = await storage.createBulkImport(validated);

      // TODO: Queue bulk import job for processing

      res.status(201).json(bulkImport);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create import" });
    }
  });

  app.get("/api/imports/:id", requireAuth, async (req, res) => {
    try {
      const bulkImport = await storage.getBulkImport(req.params.id);
      if (!bulkImport) {
        return res.status(404).json({ message: "Import not found" });
      }
      res.json(bulkImport);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch import" });
    }
  });

  // ==================== CONTENT STUDIO ====================

  app.get("/api/content-assets", requireAuth, async (req, res) => {
    try {
      const assets = await storage.getContentAssets();
      res.json(assets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch content assets" });
    }
  });

  app.post("/api/content-assets", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      console.log("Creating content asset for user:", userId);
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      const validated = insertContentAssetSchema.parse(req.body);
      console.log("Validated data:", JSON.stringify(validated, null, 2));

      // Clean up validated data - remove undefined values to let DB defaults work
      const cleanData = Object.fromEntries(
        Object.entries(validated).filter(([_, v]) => v !== undefined)
      );

      const asset = await storage.createContentAsset({ ...cleanData, ownerId: userId });
      console.log("Asset created:", asset.id);
      res.status(201).json(asset);
    } catch (error) {
      console.error("Error creating content asset:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create content asset", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/content-assets/:id", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getContentAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ message: "Content asset not found" });
      }
      res.json(asset);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch content asset" });
    }
  });

  app.put("/api/content-assets/:id", requireAuth, async (req, res) => {
    try {
      const asset = await storage.updateContentAsset(req.params.id, req.body);
      if (!asset) {
        return res.status(404).json({ message: "Content asset not found" });
      }
      res.json(asset);
    } catch (error) {
      res.status(500).json({ message: "Failed to update content asset" });
    }
  });

  app.delete("/api/content-assets/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const deleted = await storage.deleteContentAsset(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Content asset not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete content asset" });
    }
  });

  // ==================== CONTENT PUSH TO RESOURCES CENTER ====================

  app.post("/api/content-assets/:id/push", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { id } = req.params;
      const { targetUrl } = req.body;

      // Get the asset
      const asset = await storage.getContentAsset(id);
      if (!asset) {
        return res.status(404).json({ message: "Content asset not found" });
      }

      // Create push record
      const pushRecord = await storage.createContentPush({
        assetId: id,
        targetUrl: targetUrl || process.env.RESOURCES_CENTER_URL || '',
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 3,
        pushedBy: req.user!.userId,
      });

      // Update push to in_progress
      await storage.updateContentPush(pushRecord.id, { status: 'in_progress', attemptCount: 1 });

      // Attempt push using push service
      const { pushContentToResourcesCenter } = await import('./push-service');
      const result = await pushContentToResourcesCenter(asset, targetUrl);

      if (result.success) {
        // Update push record with success
        await storage.updateContentPush(pushRecord.id, {
          status: 'success',
          externalId: result.externalId,
          responsePayload: result.responsePayload,
        });

        res.json({
          message: "Content pushed successfully",
          pushId: pushRecord.id,
          externalId: result.externalId,
        });
      } else {
        // Update push record with failure
        await storage.updateContentPush(pushRecord.id, {
          status: 'failed',
          errorMessage: result.error,
          responsePayload: result.responsePayload,
        });

        res.status(500).json({
          message: "Push failed",
          error: result.error,
          pushId: pushRecord.id,
        });
      }
    } catch (error) {
      console.error("Error pushing content:", error);
      res.status(500).json({
        message: "Failed to push content",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/content-assets/:id/pushes", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const pushes = await storage.getContentPushes(id);
      res.json(pushes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch push history" });
    }
  });

  app.post("/api/content-pushes/:id/retry", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { id } = req.params;

      // Get push record
      const pushRecord = await storage.getContentPush(id);
      if (!pushRecord) {
        return res.status(404).json({ message: "Push record not found" });
      }

      // Enforce max attempts limit BEFORE updating or retrying
      if (pushRecord.attemptCount >= pushRecord.maxAttempts) {
        return res.status(400).json({
          message: "Max retry attempts reached",
          attemptCount: pushRecord.attemptCount,
          maxAttempts: pushRecord.maxAttempts
        });
      }

      // Get the asset
      const asset = await storage.getContentAsset(pushRecord.assetId);
      if (!asset) {
        return res.status(404).json({ message: "Content asset not found" });
      }

      // Calculate new attempt count and verify it doesn't exceed max
      const newAttemptCount = pushRecord.attemptCount + 1;
      if (newAttemptCount > pushRecord.maxAttempts) {
        return res.status(400).json({
          message: "Cannot retry: would exceed max attempts",
          attemptCount: pushRecord.attemptCount,
          maxAttempts: pushRecord.maxAttempts
        });
      }

      // Update attempt count and status atomically
      await storage.updateContentPush(id, {
        status: 'retrying',
        attemptCount: newAttemptCount
      });

      // Retry push
      const { pushContentToResourcesCenter } = await import('./push-service');
      const result = await pushContentToResourcesCenter(asset, pushRecord.targetUrl);

      if (result.success) {
        await storage.updateContentPush(id, {
          status: 'success',
          externalId: result.externalId,
          responsePayload: result.responsePayload,
        });

        res.json({
          message: "Retry successful",
          pushId: id,
          externalId: result.externalId,
        });
      } else {
        await storage.updateContentPush(id, {
          status: 'failed',
          errorMessage: result.error,
          responsePayload: result.responsePayload,
        });

        res.status(500).json({
          message: "Retry failed",
          error: result.error,
          pushId: id,
        });
      }
    } catch (error) {
      console.error("Error retrying push:", error);
      res.status(500).json({
        message: "Failed to retry push",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ==================== SOCIAL MEDIA POSTS ====================

  app.get("/api/social-posts", requireAuth, async (req, res) => {
    try {
      const posts = await storage.getSocialPosts();
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch social posts" });
    }
  });

  app.post("/api/social-posts", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const validated = insertSocialPostSchema.parse(req.body);
      const post = await storage.createSocialPost({ ...validated, ownerId: userId });
      res.status(201).json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create social post" });
    }
  });

  app.get("/api/social-posts/:id", requireAuth, async (req, res) => {
    try {
      const post = await storage.getSocialPost(req.params.id);
      if (!post) {
        return res.status(404).json({ message: "Social post not found" });
      }
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch social post" });
    }
  });

  // ==================== AI CONTENT GENERATION ====================

  app.post("/api/ai-content", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { prompt, contentType, targetAudience, tone, ctaGoal } = req.body;

      // TODO: Integrate with OpenAI/Anthropic API for real generation
      // For now, return mock generated content
      const mockContent = `Generated ${contentType} content for ${targetAudience}`;

      const generation = await storage.createAIContentGeneration({
        prompt: prompt || "Generate content",
        contentType,
        targetAudience,
        tone,
        ctaGoal,
        generatedContent: mockContent,
        model: "gpt-4",
        tokensUsed: 500,
        userId,
      });

      res.status(201).json(generation);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate content" });
    }
  });

  // ==================== EVENTS ====================

  app.get("/api/events", requireAuth, async (req, res) => {
    try {
      const events = await storage.getEvents();
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.post("/api/events", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const validated = insertEventSchema.parse(req.body);
      const event = await storage.createEvent({ ...validated, createdBy: userId });
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  app.get("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  app.put("/api/events/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertEventSchema.partial().parse(req.body);
      const event = await storage.updateEvent(req.params.id, validated);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.delete("/api/events/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const deleted = await storage.deleteEvent(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // ==================== RESOURCES ====================

  app.get("/api/resources", requireAuth, async (req, res) => {
    try {
      const resources = await storage.getResources();
      res.json(resources);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch resources" });
    }
  });

  app.post("/api/resources", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const validated = insertResourceSchema.parse(req.body);
      const resource = await storage.createResource({ ...validated, createdBy: userId });
      res.status(201).json(resource);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create resource" });
    }
  });

  app.get("/api/resources/:id", requireAuth, async (req, res) => {
    try {
      const resource = await storage.getResource(req.params.id);
      if (!resource) {
        return res.status(404).json({ message: "Resource not found" });
      }
      res.json(resource);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch resource" });
    }
  });

  app.put("/api/resources/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertResourceSchema.partial().parse(req.body);
      const resource = await storage.updateResource(req.params.id, validated);
      if (!resource) {
        return res.status(404).json({ message: "Resource not found" });
      }
      res.json(resource);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update resource" });
    }
  });

  app.delete("/api/resources/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const deleted = await storage.deleteResource(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Resource not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete resource" });
    }
  });

  // ==================== NEWS ====================

  app.get("/api/news", requireAuth, async (req, res) => {
    try {
      const news = await storage.getNews();
      res.json(news);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch news" });
    }
  });

  app.post("/api/news", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const validated = insertNewsSchema.parse(req.body);
      const newsItem = await storage.createNews({ ...validated, createdBy: userId });
      res.status(201).json(newsItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create news" });
    }
  });

  app.get("/api/news/:id", requireAuth, async (req, res) => {
    try {
      const newsItem = await storage.getNewsItem(req.params.id);
      if (!newsItem) {
        return res.status(404).json({ message: "News not found" });
      }
      res.json(newsItem);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch news" });
    }
  });

  app.put("/api/news/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertNewsSchema.partial().parse(req.body);
      const newsItem = await storage.updateNews(req.params.id, validated);
      if (!newsItem) {
        return res.status(404).json({ message: "News not found" });
      }
      res.json(newsItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update news" });
    }
  });

  app.delete("/api/news/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const deleted = await storage.deleteNews(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "News not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete news" });
    }
  });

  // ==================== SPEAKERS, ORGANIZERS, SPONSORS ====================

  app.get("/api/speakers", requireAuth, async (req, res) => {
    try {
      const speakers = await storage.getSpeakers();
      res.json(speakers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch speakers" });
    }
  });

  app.post("/api/speakers", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const validated = insertSpeakerSchema.parse(req.body);
      const speaker = await storage.createSpeaker(validated);
      res.status(201).json(speaker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create speaker" });
    }
  });

  app.put("/api/speakers/:id", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const validated = insertSpeakerSchema.partial().parse(req.body);
      const speaker = await storage.updateSpeaker(parseInt(req.params.id), validated);
      if (!speaker) {
        return res.status(404).json({ message: "Speaker not found" });
      }
      res.json(speaker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update speaker" });
    }
  });

  app.delete("/api/speakers/:id", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      await storage.deleteSpeaker(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete speaker" });
    }
  });

  app.get("/api/organizers", requireAuth, async (req, res) => {
    try {
      const organizers = await storage.getOrganizers();
      res.json(organizers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organizers" });
    }
  });

  app.post("/api/organizers", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const validated = insertOrganizerSchema.parse(req.body);
      const organizer = await storage.createOrganizer(validated);
      res.status(201).json(organizer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create organizer" });
    }
  });

  app.put("/api/organizers/:id", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const validated = insertOrganizerSchema.partial().parse(req.body);
      const organizer = await storage.updateOrganizer(parseInt(req.params.id), validated);
      if (!organizer) {
        return res.status(404).json({ message: "Organizer not found" });
      }
      res.json(organizer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update organizer" });
    }
  });

  app.delete("/api/organizers/:id", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      await storage.deleteOrganizer(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete organizer" });
    }
  });

  app.get("/api/sponsors", requireAuth, async (req, res) => {
    try {
      const sponsors = await storage.getSponsors();
      res.json(sponsors);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sponsors" });
    }
  });

  app.post("/api/sponsors", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const validated = insertSponsorSchema.parse(req.body);
      const sponsor = await storage.createSponsor(validated);
      res.status(201).json(sponsor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create sponsor" });
    }
  });

  app.put("/api/sponsors/:id", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const validated = insertSponsorSchema.partial().parse(req.body);
      const sponsor = await storage.updateSponsor(parseInt(req.params.id), validated);
      if (!sponsor) {
        return res.status(404).json({ message: "Sponsor not found" });
      }
      res.json(sponsor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update sponsor" });
    }
  });

  app.delete("/api/sponsors/:id", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      await storage.deleteSponsor(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete sponsor" });
    }
  });

  // ==================== RESOURCES CENTRE SYNC ====================

  app.post("/api/sync/resources-centre", requireAuth, requireRole('admin', 'data_ops'), async (req, res) => {
    try {
      const { resourcesCentreSync } = await import("./services/resourcesCentreSync");
      const result = await resourcesCentreSync.syncAll();

      if (result.success) {
        res.json({
          message: "Sync completed successfully",
          ...result
        });
      } else {
        res.status(207).json({
          message: "Sync completed with errors",
          ...result
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('environment variable')) {
          return res.status(400).json({
            message: "Configuration error",
            error: error.message
          });
        }
        if (error.message.includes('API key')) {
          return res.status(401).json({
            message: "Authentication failed with Resources Centre",
            error: error.message
          });
        }
      }
      res.status(500).json({
        message: "Sync failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ==================== EMAIL INFRASTRUCTURE (Phase 26) ====================

  // Sender Profiles
  app.get("/api/sender-profiles", requireAuth, async (req, res) => {
    try {
      const profiles = await storage.getSenderProfiles();
      res.json(profiles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sender profiles" });
    }
  });

  app.post("/api/sender-profiles", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const validated = insertSenderProfileSchema.parse(req.body);
      const profile = await storage.createSenderProfile({ ...validated, createdBy: userId });
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create sender profile" });
    }
  });

  app.get("/api/sender-profiles/:id", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getSenderProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({ message: "Sender profile not found" });
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sender profile" });
    }
  });

  app.put("/api/sender-profiles/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const validated = insertSenderProfileSchema.partial().parse(req.body);
      const profile = await storage.updateSenderProfile(req.params.id, validated);
      if (!profile) {
        return res.status(404).json({ message: "Sender profile not found" });
      }
      res.json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update sender profile" });
    }
  });

  app.delete("/api/sender-profiles/:id", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      await storage.deleteSenderProfile(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete sender profile" });
    }
  });

  // ==================== PHASE 27: TELEPHONY - SOFTPHONE & CALL RECORDING ====================

  // Softphone Profile Routes
  app.get("/api/softphone/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const profile = await storage.getSoftphoneProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Softphone profile not found" });
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch softphone profile" });
    }
  });

  app.put("/api/softphone/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.userId;
      const validated = insertSoftphoneProfileSchema.parse(req.body);
      const profile = await storage.upsertSoftphoneProfile({ ...validated, userId });
      res.json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to save softphone profile" });
    }
  });

  // Call Recording Access Routes
  app.post("/api/calls/:attemptId/recording/access", requireAuth, requireRole('admin', 'qa_specialist'), async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { attemptId } = req.params;
      const { action } = req.body; // 'play' or 'download'

      if (!action || !['play', 'download'].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Must be 'play' or 'download'" });
      }

      // Get the call attempt to verify it exists
      const attempt = await storage.getCallAttempt(attemptId);
      if (!attempt) {
        return res.status(404).json({ message: "Call attempt not found" });
      }

      // Log the access
      const accessLog = await storage.createCallRecordingAccessLog({
        callAttemptId: attemptId,
        userId,
        action,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      // Try to get recording URL from call attempt first
      let recordingUrl = attempt.recordingUrl;

      // If no recording URL but we have a Telnyx call ID, try to fetch it
      if (!recordingUrl && attempt.telnyxCallId) {
        const { fetchTelnyxRecording } = await import("./services/telnyx-recordings");
        recordingUrl = await fetchTelnyxRecording(attempt.telnyxCallId);

        // Update the call attempt with the fetched URL for future use
        if (recordingUrl) {
          await storage.updateCallAttempt(attemptId, {
            recordingUrl,
          });
        }
      }

      if (!recordingUrl) {
        return res.status(404).json({
          message: "Recording not available yet. Recordings may take a few minutes to process after the call ends."
        });
      }

      res.json({
        accessLog,
        recordingUrl,
        expiresIn: 3600, // Telnyx signed URLs expire in 1 hour
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to access recording" });
    }
  });

  app.get("/api/calls/:attemptId/recording/access-logs", requireAuth, requireRole('admin', 'qa_specialist'), async (req, res) => {
    try {
      const { attemptId } = req.params;

      // Verify call attempt exists
      const attempt = await storage.getCallAttempt(attemptId);
      if (!attempt) {
        return res.status(404).json({ message: "Call attempt not found" });
      }

      const logs = await storage.getCallRecordingAccessLogs(attemptId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch access logs" });
    }
  });

  // ==================== TELNYX WEBHOOKS ====================
  // Telnyx webhook endpoint for call events (used for Telephony Credential configuration)
  app.post("/api/telnyx/webhook", async (req, res) => {
    try {
      console.log("[Telnyx Webhook] Event received:", JSON.stringify(req.body, null, 2));

      // Acknowledge receipt immediately (Telnyx requires 2xx response within 10 seconds)
      res.status(200).json({ received: true });

      // Process webhook event types asynchronously
      const eventType = req.body?.data?.event_type;
      const payload = req.body?.data?.payload;

      if (!eventType) {
        console.log("[Telnyx Webhook] No event type found");
        return;
      }

      console.log(`[Telnyx Webhook] Processing: ${eventType}`);

      // Handle specific event types
      switch (eventType) {
        case 'call.initiated':
          console.log(`[Telnyx Webhook] Call initiated:`, {
            callControlId: payload?.call_control_id,
            from: payload?.from,
            to: payload?.to,
          });
          break;

        case 'call.answered':
          console.log(`[Telnyx Webhook] Call answered:`, {
            callControlId: payload?.call_control_id,
            state: payload?.state,
          });
          break;

        case 'call.hangup':
          console.log(`[Telnyx Webhook] Call ended:`, {
            callControlId: payload?.call_control_id,
            hangup_cause: payload?.hangup_cause,
            hangup_source: payload?.hangup_source,
          });
          break;

        case 'call.recording.saved':
          // Recording is ready for download
          const callControlId = payload?.call_control_id;
          const recordingId = payload?.recording_id;

          console.log(`[Telnyx Webhook] Recording saved:`, {
            callControlId,
            recordingId,
            recordingUrl: payload?.public_recording_url,
          });

          // Find call records by Telnyx call ID and update with recording URL
          if (callControlId) {
            try {
              const { fetchTelnyxRecording } = await import("./services/telnyx-recordings");

              // Get the recording URL from Telnyx
              const recordingUrl = await fetchTelnyxRecording(callControlId);

              if (recordingUrl) {
                // 1. Update call_attempts table (power dialer)
                const attempts = await storage.getCallAttemptsByTelnyxId(callControlId);

                if (attempts && attempts.length > 0) {
                  for (const attempt of attempts) {
                    // Update call attempt with recording URL
                    await storage.updateCallAttempt(attempt.id, {
                      recordingUrl,
                    });

                    console.log(`[Telnyx Webhook] ✅ Updated call attempt ${attempt.id} with recording URL`);

                    // If this attempt has an associated lead, update it too
                    const lead = await storage.getLeadByCallAttemptId(attempt.id);
                    if (lead) {
                      await storage.updateLead(lead.id, {
                        recordingUrl,
                      });
                      console.log(`[Telnyx Webhook] ✅ Updated lead ${lead.id} with recording URL`);
                    }
                  }
                }

                // 2. Update calls table (Agent Console manual calls)
                const { calls } = await import('@shared/schema');
                const { eq } = await import('drizzle-orm');
                const manualCalls = await db.select().from(calls).where(eq(calls.telnyxCallId, callControlId));

                if (manualCalls && manualCalls.length > 0) {
                  for (const call of manualCalls) {
                    // Update call record with recording URL
                    await db.update(calls).set({ recordingUrl }).where(eq(calls.id, call.id));

                    console.log(`[Telnyx Webhook] ✅ Updated manual call ${call.id} with recording URL`);

                    // If this call has an associated lead, update it too
                    const { leads } = await import('@shared/schema');
                    const leadsForCall = await db.select().from(leads).where(eq(leads.telnyxCallId, callControlId));

                    if (leadsForCall && leadsForCall.length > 0) {
                      for (const lead of leadsForCall) {
                        await db.update(leads).set({ recordingUrl }).where(eq(leads.id, lead.id));
                        console.log(`[Telnyx Webhook] ✅ Updated lead ${lead.id} with recording URL`);
                      }
                    }
                  }
                }
              }
            } catch (error) {
              console.error("[Telnyx Webhook] Error updating recording:", error);
            }
          }
          break;

        default:
          console.log(`[Telnyx Webhook] Unhandled event: ${eventType}`);
      }
    } catch (error: any) {
      console.error("[Telnyx Webhook] Error:", error.message);
      // Don't return error to Telnyx - we already acknowledged with 200
    }
  });

  // ==================== HUMAN AGENT CALL WEBHOOK ====================
  // Handles call events for human-initiated calls from Agent Console
  // This is separate from AI/TeXML webhooks - uses Programmable Voice App ID: 2853482451592807572
  app.post("/api/webhooks/human-call", async (req, res) => {
    try {
      // Acknowledge immediately
      res.status(200).json({ received: true });

      const eventType = req.body?.data?.event_type;
      const payload = req.body?.data?.payload;
      const callControlId = payload?.call_control_id;

      // Enhanced debug logging
      console.log(`[Human-Call Webhook] ========================================`);
      console.log(`[Human-Call Webhook] Received webhook event`);
      console.log(`[Human-Call Webhook] Event Type: ${eventType}`);
      console.log(`[Human-Call Webhook] Call Control ID: ${callControlId}`);
      console.log(`[Human-Call Webhook] Full payload:`, JSON.stringify(payload, null, 2));

      if (!eventType || !callControlId) {
        console.log("[Human-Call Webhook] Missing event_type or call_control_id");
        return;
      }

      // Check if this is a tracked human agent call
      const callSession = activeHumanCalls.get(callControlId);
      console.log(`[Human-Call Webhook] Active calls count: ${activeHumanCalls.size}`);
      console.log(`[Human-Call Webhook] Session found: ${!!callSession}`);
      if (callSession) {
        console.log(`[Human-Call Webhook] Session status: ${callSession.status}`);
        console.log(`[Human-Call Webhook] Prospect number: ${callSession.prospectNumber}`);
      }

      switch (eventType) {
        case 'call.answered':
          console.log(`[Human-Call Webhook] Call answered: ${callControlId}`);

          if (callSession && callSession.status === 'calling_agent') {
            // Agent answered their phone - now bridge to prospect
            console.log(`[Human-Call Webhook] *** AGENT ANSWERED ***`);
            console.log(`[Human-Call Webhook] Agent answered, bridging to prospect: ${callSession.prospectNumber}`);
            callSession.status = 'agent_connected';

            // Automatically bridge to prospect
            const telnyxApiKey = process.env.TELNYX_API_KEY;
            const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID || process.env.TELNYX_CONNECTION_ID;
            const fromNumber = process.env.TELNYX_HUMAN_AGENT_FROM_NUMBER || process.env.TELNYX_FROM_NUMBER;
            const webhookUrl = `${process.env.PUBLIC_WEBHOOK_HOST ? 'https://' + process.env.PUBLIC_WEBHOOK_HOST : ''}/api/webhooks/human-call`;

            console.log(`[Human-Call Webhook] Using Connection ID: ${connectionId}`);
            console.log(`[Human-Call Webhook] Using From Number: ${fromNumber}`);
            console.log(`[Human-Call Webhook] Prospect Webhook URL: ${webhookUrl}`);

            try {
              // Play announcement to agent
              console.log(`[Human-Call Webhook] Playing announcement to agent...`);
              const speakResponse = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${telnyxApiKey}`,
                },
                body: JSON.stringify({
                  payload: "Connecting you to the prospect now.",
                  voice: "female",
                  language: "en-US",
                }),
              });
              console.log(`[Human-Call Webhook] Speak response: ${speakResponse.status}`);

              // Call the prospect
              console.log(`[Human-Call Webhook] Calling prospect at ${callSession.prospectNumber}...`);
              const prospectResponse = await fetch("https://api.telnyx.com/v2/calls", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${telnyxApiKey}`,
                },
                body: JSON.stringify({
                  connection_id: connectionId,
                  to: callSession.prospectNumber,
                  from: fromNumber,
                  answering_machine_detection: "detect_words",
                  client_state: Buffer.from(JSON.stringify({
                    type: 'human_agent_prospect_leg',
                    agentCallId: callControlId,
                  })).toString('base64'),
                  webhook_url: webhookUrl,
                }),
              });

              if (prospectResponse.ok) {
                const prospectResult = await prospectResponse.json();
                callSession.prospectCallId = prospectResult.data?.call_control_id;
                callSession.status = 'calling_prospect';
                console.log(`[Human-Call Webhook] Calling prospect: ${callSession.prospectCallId}`);
              } else {
                console.error(`[Human-Call Webhook] Failed to call prospect: ${await prospectResponse.text()}`);
              }
            } catch (err) {
              console.error(`[Human-Call Webhook] Error bridging call:`, err);
            }
          } else if (payload.client_state) {
            // Has client_state - could be callback prospect leg or direct mode
            console.log(`[Human-Call Webhook] *** CALL ANSWERED (has client_state) ***`);
            console.log(`[Human-Call Webhook] Raw client_state: ${payload.client_state}`);
            try {
              const clientState = JSON.parse(Buffer.from(payload.client_state, 'base64').toString());
              console.log(`[Human-Call Webhook] Decoded client_state:`, JSON.stringify(clientState));

              if (clientState.type === 'human_agent_direct') {
                // Direct mode - prospect answered the call
                console.log(`[Human-Call Webhook] *** DIRECT MODE: PROSPECT ANSWERED ***`);
                if (callSession) {
                  callSession.status = 'active';
                  console.log(`[Human-Call Webhook] Direct call now active with prospect`);
                }
              } else if (clientState.type === 'human_agent_prospect_leg' && clientState.agentCallId) {
                // Callback mode - prospect answered, need to bridge
                const agentSession = activeHumanCalls.get(clientState.agentCallId);
                console.log(`[Human-Call Webhook] Looking for agent session with ID: ${clientState.agentCallId}`);
                console.log(`[Human-Call Webhook] Agent session found: ${!!agentSession}`);
                if (agentSession) {
                  console.log(`[Human-Call Webhook] Prospect answered, bridging calls`);
                  console.log(`[Human-Call Webhook] Agent Call ID: ${clientState.agentCallId}`);
                  console.log(`[Human-Call Webhook] Prospect Call ID: ${callControlId}`);

                  const telnyxApiKey = process.env.TELNYX_API_KEY;

                  // Bridge agent to prospect
                  console.log(`[Human-Call Webhook] Sending bridge command...`);
                  const bridgeResponse = await fetch(`https://api.telnyx.com/v2/calls/${clientState.agentCallId}/actions/bridge`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${telnyxApiKey}`,
                    },
                    body: JSON.stringify({
                      call_control_id: callControlId,
                    }),
                  });

                  if (bridgeResponse.ok) {
                    agentSession.status = 'bridged';
                    console.log(`[Human-Call Webhook] *** CALLS BRIDGED SUCCESSFULLY ***`);
                  } else {
                    const errText = await bridgeResponse.text();
                    console.error(`[Human-Call Webhook] Bridge failed: ${bridgeResponse.status} - ${errText}`);
                  }
                } else {
                  console.log(`[Human-Call Webhook] Agent session not found! Available sessions:`, Array.from(activeHumanCalls.keys()));
                }
              } else {
                console.log(`[Human-Call Webhook] client_state type not recognized:`, clientState.type);
              }
            } catch (err) {
              console.error(`[Human-Call Webhook] Error parsing client_state:`, err);
            }
          } else if (callSession && callSession.status === 'calling_prospect') {
            // Direct mode: prospect answered
            console.log(`[Human-Call Webhook] *** PROSPECT ANSWERED (Direct mode) ***`);
            callSession.status = 'active';
            console.log(`[Human-Call Webhook] Direct call now active with prospect`);
          } else {
            console.log(`[Human-Call Webhook] call.answered but no session or client_state - might be a different call type`);
          }
          break;

        case 'call.hangup':
          console.log(`[Human-Call Webhook] Call hangup: ${callControlId}, cause: ${payload?.hangup_cause}`);

          if (callSession) {
            callSession.status = 'ended';

            // If agent leg hung up, also hang up prospect
            if (callSession.prospectCallId && callControlId === callSession.agentCallId) {
              try {
                const telnyxApiKey = process.env.TELNYX_API_KEY;
                await fetch(`https://api.telnyx.com/v2/calls/${callSession.prospectCallId}/actions/hangup`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${telnyxApiKey}`,
                  },
                  body: JSON.stringify({ cause: "normal_clearing" }),
                });
                console.log(`[Human-Call Webhook] Hung up prospect leg`);
              } catch (err) {
                console.error(`[Human-Call Webhook] Error hanging up prospect:`, err);
              }
            }

            // Cleanup after a delay
            setTimeout(() => {
              activeHumanCalls.delete(callControlId);
            }, 5000);
          }
          break;

        case 'call.machine.detection.ended':
          const amdResult = payload?.result;
          console.log(`[Human-Call Webhook] AMD result: ${amdResult} for ${callControlId}`);

          if (amdResult === 'machine' || amdResult === 'fax') {
            // Hang up on machines/voicemail
            try {
              const telnyxApiKey = process.env.TELNYX_API_KEY;
              await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${telnyxApiKey}`,
                },
                body: JSON.stringify({ cause: "normal_clearing" }),
              });
              console.log(`[Human-Call Webhook] Hung up machine-detected call`);
            } catch (err) {
              console.error(`[Human-Call Webhook] Error hanging up machine call:`, err);
            }
          }
          break;

        default:
          console.log(`[Human-Call Webhook] Unhandled event: ${eventType}`);
      }
    } catch (error: any) {
      console.error("[Human-Call Webhook] Error:", error.message);
    }
  });

  // ==================== WEBHOOKS (Resources Centre Reverse Webhook) ====================
  app.use("/api/webhooks", webhooksRouter);

  // Alias for Telnyx AI voice webhooks without auth (Call Control can post here)
  app.use("/api/telemarketing/webhooks", webhooksRouter);

  // ==================== CAMPAIGN CONTENT LINKS (Resources Centre Integration) ====================

  // Get linked content for a campaign
  app.get("/api/campaigns/:campaignId/content-links", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;

      // Verify campaign exists
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const links = await storage.getCampaignContentLinks(campaignId);
      res.json(links);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch content links" });
    }
  });

  // Link content to campaign
  app.post("/api/campaigns/:campaignId/content-links", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { campaignId } = req.params;
      const userId = (req.user as any).userId;

      // Verify campaign exists
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const validated = z.object({
        contentType: z.enum(['event', 'resource']),
        contentId: z.string(),
        contentSlug: z.string(),
        contentTitle: z.string(),
        contentUrl: z.string().url(),
        formId: z.string().optional(),
        metadata: z.any().optional()
      }).parse(req.body);

      const link = await storage.createCampaignContentLink({
        campaignId,
        contentType: validated.contentType,
        contentId: validated.contentId,
        contentSlug: validated.contentSlug,
        contentTitle: validated.contentTitle,
        contentUrl: validated.contentUrl,
        formId: validated.formId || null,
        metadata: validated.metadata || null,
        createdBy: userId
      });

      res.status(201).json(link);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create content link" });
    }
  });

  // Delete content link
  app.delete("/api/campaigns/:campaignId/content-links/:linkId", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const { linkId } = req.params;

      await storage.deleteCampaignContentLink(Number(linkId));
      res.json({ message: "Content link deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete content link" });
    }
  });

  // Generate tracking URL for a single contact
  app.post("/api/campaigns/:campaignId/content-links/:linkId/tracking-url", requireAuth, async (req, res) => {
    try {
      const { campaignId, linkId } = req.params;

      // Get campaign
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Get content link
      const link = await storage.getCampaignContentLink(Number(linkId));
      if (!link) {
        return res.status(404).json({ message: "Content link not found" });
      }

      const validated = z.object({
        contactId: z.string().optional(),
        email: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        company: z.string().optional(),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmCampaign: z.string().optional()
      }).parse(req.body);

      // Import the URL generator
      const { generateTrackingUrl } = await import("./lib/urlGenerator");

      const trackingUrl = generateTrackingUrl(link.contentUrl, {
        ...validated,
        campaignId,
        campaignName: campaign.name
      });

      res.json({ trackingUrl });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to generate tracking URL" });
    }
  });

  // Generate bulk tracking URLs for multiple contacts
  app.post("/api/campaigns/:campaignId/content-links/:linkId/bulk-tracking-urls", requireAuth, async (req, res) => {
    try {
      const { campaignId, linkId } = req.params;

      // Get campaign
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Get content link
      const link = await storage.getCampaignContentLink(Number(linkId));
      if (!link) {
        return res.status(404).json({ message: "Content link not found" });
      }

      const validated = z.object({
        contactIds: z.array(z.string()),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmCampaign: z.string().optional()
      }).parse(req.body);

      // Get contacts
      const contacts = await Promise.all(
        validated.contactIds.map(id => storage.getContact(id))
      );

      const validContacts = contacts.filter(c => c !== undefined) as any[];

      // Import the URL generator
      const { generateBulkTrackingUrls } = await import("./lib/urlGenerator");

      const trackingUrls = generateBulkTrackingUrls(
        link.contentUrl,
        validContacts.map(c => ({
          id: c.id,
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          company: c.company
        })),
        {
          campaignId,
          campaignName: campaign.name,
          utmSource: validated.utmSource,
          utmMedium: validated.utmMedium,
          utmCampaign: validated.utmCampaign
        }
      );

      res.json({ trackingUrls });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to generate bulk tracking URLs" });
    }
  });

  // ==================== ANALYTICS ====================

  app.get("/api/analytics/engagement", requireAuth, async (req, res) => {
    try {
      const { from, to, campaign } = req.query;

      // This is a comprehensive analytics aggregation
      // You'll want to optimize this with materialized views in production

      const analytics = {
        email: {
          total: 0,
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
        },
        calls: {
          total: 0,
          attempted: 0,
          connected: 0,
          qualified: 0,
          avgDuration: 0,
        },
        leads: {
          total: 0,
          qualified: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
        },
        timeline: [],
        channelBreakdown: [
          { name: 'Email', value: 0 },
          { name: 'Phone', value: 0 },
          { name: 'Other', value: 0 },
        ],
        dispositions: [],
        campaignLeads: {},
      };

      // Aggregate email stats
      const emailCampaigns = await storage.getCampaigns();
      analytics.email.total = emailCampaigns.filter(c => c.type === 'email').length;

      // Aggregate call stats
      const callCampaigns = emailCampaigns.filter(c => c.type === 'call');
      analytics.calls.total = callCampaigns.length;

      // Aggregate leads
      const allLeads = await storage.getLeads();
      analytics.leads.total = allLeads.length;
      analytics.leads.approved = allLeads.filter(l => l.qaStatus === 'approved').length;
      analytics.leads.pending = allLeads.filter(l => l.qaStatus === 'new' || l.qaStatus === 'under_review').length;
      analytics.leads.rejected = allLeads.filter(l => l.qaStatus === 'rejected').length;

      // Channel breakdown
      analytics.channelBreakdown = [
        { name: 'Email', value: emailCampaigns.filter(c => c.type === 'email').length },
        { name: 'Phone', value: callCampaigns.length },
      ];

      // Campaign leads mapping
      for (const campaign of emailCampaigns) {
        const campaignLeads = allLeads.filter(l => l.campaignId === campaign.id);
        analytics.campaignLeads[campaign.id] = campaignLeads.length;
      }

      res.json(analytics);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ==================== AI-POWERED QA SYSTEM ====================

  // Trigger transcription for a lead (async - returns immediately)
  app.post("/api/leads/:id/transcribe", requireAuth, async (req, res) => {
    try {
      const { transcribeLeadCall } = await import('./services/assemblyai-transcription');
      const { leads } = await import('@shared/schema');

      // Update status to pending
      await db.update(leads)
        .set({ transcriptionStatus: 'pending' })
        .where(eq(leads.id, req.params.id));

      // Start transcription in background (don't wait)
      transcribeLeadCall(req.params.id).catch(err => {
        console.error('Background transcription error:', err);
      });

      // Return immediately
      res.status(202).json({ message: "Transcription started - check status later" });
    } catch (error) {
      console.error('Transcription error:', error);
      res.status(500).json({ message: "Failed to start transcription" });
    }
  });

  // Analyze lead with AI
  app.post("/api/leads/:id/analyze", requireAuth, async (req, res) => {
    try {
      const { analyzeLeadQualification } = await import('./services/ai-qa-analyzer');
      const analysis = await analyzeLeadQualification(req.params.id);

      if (analysis) {
        res.json(analysis);
      } else {
        res.status(400).json({ message: "Analysis failed - check transcript availability" });
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      res.status(500).json({ message: "Failed to analyze lead" });
    }
  });

  // Fetch recording from Telnyx manually
  app.post("/api/leads/:id/fetch-recording", requireAuth, async (req, res) => {
    try {
      const { updateLeadRecording } = await import('./services/telnyx-recordings');
      const { leads, callAttempts } = await import('@shared/schema');

      // Get lead with call attempt details
      const [lead] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      if (!lead.callAttemptId) {
        return res.status(400).json({ message: "No call attempt associated with this lead" });
      }

      // Get the call attempt to find Telnyx call ID
      const [callAttempt] = await db.select().from(callAttempts).where(eq(callAttempts.id, lead.callAttemptId)).limit(1);

      if (!callAttempt || !callAttempt.telnyxCallId) {
        return res.status(400).json({ message: "No Telnyx call ID found for this lead" });
      }

      // Fetch recording in background
      updateLeadRecording(lead.id, callAttempt.telnyxCallId).catch(err => {
        console.error('Background recording fetch error:', err);
      });

      res.status(202).json({ message: "Recording fetch started - check back in a moment" });
    } catch (error) {
      console.error('Recording fetch error:', error);
      res.status(500).json({ message: "Failed to fetch recording" });
    }
  });

  // Sync recording for a specific lead (smart search using multiple strategies)
  app.post("/api/leads/:id/sync-recording", requireAuth, requireRole('admin', 'quality_analyst', 'campaign_manager'), async (req, res) => {
    try {
      const { syncRecordingForLead } = await import('./services/telnyx-recordings');
      
      const success = await syncRecordingForLead(req.params.id);
      
      if (success) {
        res.json({ 
          success: true, 
          message: "Recording synced successfully. Transcription will start automatically." 
        });
      } else {
        res.json({ 
          success: false, 
          message: "No recording found for this lead in Telnyx." 
        });
      }
    } catch (error: any) {
      console.error('Sync recording error:', error);
      if (error.message?.includes('Lead not found')) {
        return res.status(404).json({ message: "Lead not found" });
      }
      res.status(500).json({ message: "Failed to sync recording" });
    }
  });

  // Get fresh recording URL for a lead (serves from S3 with 7-day presigned URLs)
  app.get("/api/leads/:id/recording-url", requireAuth, async (req, res) => {
    try {
      const { leads } = await import('@shared/schema');
      const { getRecordingUrl, isRecordingStorageEnabled } = await import('./services/recording-storage');
      const { getPresignedDownloadUrl, s3ObjectExists } = await import('./lib/s3');
      
      const [lead] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);
      
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      // Check if recording exists in S3 first (permanent storage)
      if (lead.recordingS3Key) {
        try {
          const exists = await s3ObjectExists(lead.recordingS3Key);
          if (exists) {
            // Generate 7-day presigned URL for S3 recording
            const url = await getPresignedDownloadUrl(lead.recordingS3Key, 7 * 24 * 60 * 60);
            console.log(`[Recording URL] Serving from S3: ${lead.recordingS3Key}`);
            return res.json({ url, source: 'local', expiresIn: '7 days' });
          }
        } catch (s3Error) {
          console.error(`[Recording URL] S3 check failed for lead ${lead.id}:`, s3Error);
        }
      }
      
      // No S3 recording - try to use the recording storage service
      if (lead.recordingUrl && isRecordingStorageEnabled()) {
        console.log(`[Recording URL] Attempting to store recording in S3 for lead ${lead.id}...`);
        const result = await getRecordingUrl(lead.id, lead.recordingUrl);
        
        if (result.url && result.source === 'local') {
          console.log(`[Recording URL] Successfully stored and serving from S3 for lead ${lead.id}`);
          return res.json({ url: result.url, source: 'local', expiresIn: '7 days' });
        }
      }
      
      // Fall back to original Telnyx URL if S3 storage failed or not configured
      if (!lead.recordingUrl) {
        return res.status(404).json({ message: "No recording URL available for this lead" });
      }
      
      // Check if Telnyx URL has expired
      const isUrlExpired = (url: string): boolean => {
        try {
          const urlObj = new URL(url);
          const amzDate = urlObj.searchParams.get('X-Amz-Date');
          const amzExpires = urlObj.searchParams.get('X-Amz-Expires');
          
          if (!amzDate || !amzExpires) return false;
          
          const year = parseInt(amzDate.substring(0, 4));
          const month = parseInt(amzDate.substring(4, 6)) - 1;
          const day = parseInt(amzDate.substring(6, 8));
          const hour = parseInt(amzDate.substring(9, 11));
          const minute = parseInt(amzDate.substring(11, 13));
          const second = parseInt(amzDate.substring(13, 15));
          
          const signedAt = new Date(Date.UTC(year, month, day, hour, minute, second));
          const expiresAt = new Date(signedAt.getTime() + parseInt(amzExpires) * 1000);
          
          return new Date() > expiresAt;
        } catch {
          return false;
        }
      };
      
      if (isUrlExpired(lead.recordingUrl)) {
        console.log(`[Recording URL] Telnyx URL expired for lead ${lead.id}, attempting to refresh...`);
        
        try {
          const { syncRecordingForLead } = await import('./services/telnyx-recordings');
          const refreshed = await syncRecordingForLead(req.params.id);
          
          if (refreshed) {
            const [updatedLead] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);
            if (updatedLead?.recordingUrl) {
              // Try to store the refreshed URL in S3 for permanent access
              if (isRecordingStorageEnabled()) {
                const result = await getRecordingUrl(lead.id, updatedLead.recordingUrl);
                if (result.url && result.source === 'local') {
                  return res.json({ url: result.url, source: 'local', expiresIn: '7 days' });
                }
              }
              return res.json({ url: updatedLead.recordingUrl, source: 'telnyx' });
            }
          }
          
          return res.status(410).json({ 
            message: "Recording URL has expired and could not be refreshed",
            expired: true
          });
        } catch (refreshError) {
          console.error(`[Recording URL] Refresh failed for lead ${lead.id}:`, refreshError);
          return res.status(410).json({ 
            message: "Recording URL has expired and refresh failed",
            expired: true
          });
        }
      }
      
      // Telnyx URL is still valid - return it but try to store in S3 in background
      res.json({ url: lead.recordingUrl, source: 'telnyx', warning: 'URL expires in ~10 minutes' });
    } catch (error) {
      console.error('Get recording URL error:', error);
      res.status(500).json({ message: "Failed to get recording URL" });
    }
  });

  // Update lead notes (QA notes)
  app.patch("/api/leads/:id", requireAuth, requireRole('admin', 'quality_analyst', 'agent'), async (req, res) => {
    try {
      const { leads } = await import('@shared/schema');
      const { notes } = req.body;

      if (notes === undefined) {
        return res.status(400).json({ message: "Notes field is required" });
      }

      await db.update(leads)
        .set({
          notes,
          updatedAt: new Date()
        })
        .where(eq(leads.id, req.params.id));

      const [updatedLead] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);
      res.json(updatedLead);
    } catch (error) {
      console.error('Update lead notes error:', error);
      res.status(500).json({ message: "Failed to update lead notes" });
    }
  });

  // Enrich account data with AI
  app.post("/api/accounts/:id/enrich", requireAuth, async (req, res) => {
    try {
      const { enrichAccountData } = await import('./services/ai-account-enrichment');
      const enrichmentResult = await enrichAccountData(req.params.id);

      if (enrichmentResult) {
        res.json(enrichmentResult);
      } else {
        res.status(400).json({ message: "Enrichment failed" });
      }
    } catch (error) {
      console.error('Account enrichment error:', error);
      res.status(500).json({ message: "Failed to enrich account" });
    }
  });

  // Verify account against client criteria
  app.post("/api/accounts/:id/verify", requireAuth, async (req, res) => {
    try {
      const { verifyAccountAgainstCriteria } = await import('./services/ai-account-enrichment');
      const { client_criteria } = req.body;

      const verification = await verifyAccountAgainstCriteria(req.params.id, client_criteria);
      res.json(verification);
    } catch (error) {
      console.error('Account verification error:', error);
      res.status(500).json({ message: "Failed to verify account" });
    }
  });

  // Batch enrich accounts for a campaign
  app.post("/api/campaigns/:id/enrich-accounts", requireAuth, async (req, res) => {
    try {
      const { enrichCampaignAccounts } = await import('./services/ai-account-enrichment');

      // Start enrichment in background (don't wait)
      enrichCampaignAccounts(req.params.id).catch(err => {
        console.error('Background enrichment error:', err);
      });

      res.json({ message: "Account enrichment started in background" });
    } catch (error) {
      console.error('Campaign enrichment error:', error);
      res.status(500).json({ message: "Failed to start account enrichment" });
    }
  });

  // Re-evaluate all QA pending leads for a campaign (when AI criteria updated)
  app.post("/api/campaigns/:id/reevaluate-qa", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const campaignId = req.params.id;
      
      // Verify campaign exists
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      console.log(`[API] Starting background QA re-evaluation for campaign ${campaignId}`);

      // Start re-evaluation in background (non-blocking)
      const { reEvaluateCampaignLeads } = await import('./services/ai-qa-analyzer');
      
      // Fire and forget - process in background
      reEvaluateCampaignLeads(campaignId)
        .then((result) => {
          console.log(`[API] Re-evaluation complete for campaign ${campaignId}:`, result);
        })
        .catch((error) => {
          console.error(`[API] Re-evaluation failed for campaign ${campaignId}:`, error);
        });

      // Return immediately with 202 Accepted
      res.status(202).json({
        message: "QA re-evaluation started in background",
        status: "processing",
        campaignId,
        note: "Refresh the leads page in a few minutes to see updated results"
      });
    } catch (error) {
      console.error('Campaign QA re-evaluation error:', error);
      res.status(500).json({ 
        message: "Failed to start re-evaluation",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Consolidated lead processing: All validations + Auto-approve
  app.post("/api/campaigns/:id/process-all", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const campaignId = req.params.id;
      
      // Verify campaign exists
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      console.log(`[API] Starting consolidated processing for campaign ${campaignId}`);

      // Import all required services
      const { reEvaluateCampaignLeads } = await import('./services/ai-qa-analyzer');
      const { validateCampaignCompanies } = await import('./services/companies-house-validator');
      const { syncRecordingForLead } = await import('./services/telnyx-recordings');
      const { validateEmailBatch } = await import('./services/email-validation');
      
      // Start consolidated processing in background
      (async () => {
        const results = {
          step1_recordings: 'pending',
          step2_emailValidation: 'pending',
          step3_companiesHouse: 'pending',
          step4_aiAnalysis: 'pending',
          approvedCount: 0,
          rejectedCount: 0,
          reviewCount: 0,
          errors: [] as string[]
        };
        
        console.log(`[ConsolidatedProcessing] Campaign ${campaignId}: Starting all validation steps in correct order`);
        
        // Step 1: Sync recordings and trigger transcription (MUST BE FIRST)
        try {
          const leads = await storage.getLeads({ 
            campaignId, 
            qaStatus: 'new' 
          });
          
          console.log(`[ConsolidatedProcessing] Step 1/4: Syncing ${leads.length} call recordings`);
          let syncedCount = 0;
          for (const lead of leads) {
            if (lead.callAttemptId) {
              try {
                await syncRecordingForLead(lead.id);
                syncedCount++;
              } catch (error) {
                console.error(`[ConsolidatedProcessing] Recording sync failed for lead ${lead.id}:`, error);
              }
            }
          }
          results.step1_recordings = 'success';
          console.log(`[ConsolidatedProcessing] Step 1/4: ✓ Recording sync completed (${syncedCount} recordings synced)`);
        } catch (error) {
          results.step1_recordings = 'failed';
          results.errors.push(`Step 1 (Recording Sync): ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error(`[ConsolidatedProcessing] Step 1/4: ✗ Recording sync failed:`, error);
        }
        
        // Step 2: Email validation (BEFORE AI analysis)
        try {
          console.log(`[ConsolidatedProcessing] Step 2/4: Validating contact emails`);
          
          // Get all contacts for this campaign
          const leads = await storage.getLeads({ campaignId });
          const contactIds = leads
            .map(l => l.contactId)
            .filter((id): id is string => id != null);
          
          if (contactIds.length > 0) {
            const uniqueContactIds = Array.from(new Set(contactIds));
            await validateEmailBatch(uniqueContactIds);
            results.step2_emailValidation = 'success';
            console.log(`[ConsolidatedProcessing] Step 2/4: ✓ Email validation completed (${uniqueContactIds.length} contacts)`);
          } else {
            results.step2_emailValidation = 'skipped';
            console.log(`[ConsolidatedProcessing] Step 2/4: ⊘ Email validation skipped (no contacts)`);
          }
        } catch (error) {
          results.step2_emailValidation = 'failed';
          results.errors.push(`Step 2 (Email Validation): ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error(`[ConsolidatedProcessing] Step 2/4: ✗ Email validation failed:`, error);
        }
        
        // Step 3: Validate Companies House
        try {
          console.log(`[ConsolidatedProcessing] Step 3/4: Validating companies via Companies House`);
          await validateCampaignCompanies(campaignId);
          results.step3_companiesHouse = 'success';
          console.log(`[ConsolidatedProcessing] Step 3/4: ✓ Companies House validation completed`);
        } catch (error) {
          results.step3_companiesHouse = 'failed';
          results.errors.push(`Step 3 (Companies House): ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error(`[ConsolidatedProcessing] Step 3/4: ✗ Companies House validation failed:`, error);
        }
        
        // Step 4: AI Analysis with auto-approval (AFTER email validation & recordings)
        try {
          console.log(`[ConsolidatedProcessing] Step 4/4: Running AI QA analysis with auto-approval`);
          await reEvaluateCampaignLeads(campaignId);
          
          // Count final statuses (AI analyzer now sets qaStatus automatically)
          const finalLeads = await storage.getLeads({ campaignId });
          results.approvedCount = finalLeads.filter(l => l.qaStatus === 'approved').length;
          results.rejectedCount = finalLeads.filter(l => l.qaStatus === 'rejected').length;
          results.reviewCount = finalLeads.filter(l => l.qaStatus === 'under_review').length;
          
          results.step4_aiAnalysis = 'success';
          console.log(`[ConsolidatedProcessing] Step 4/4: ✓ AI analysis completed. Approved: ${results.approvedCount}, Rejected: ${results.rejectedCount}, Need Review: ${results.reviewCount}`);
        } catch (error) {
          results.step4_aiAnalysis = 'failed';
          results.errors.push(`Step 4 (AI Analysis): ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error(`[ConsolidatedProcessing] Step 4/4: ✗ AI analysis failed:`, error);
        }
        
        // Final summary
        console.log(`[ConsolidatedProcessing] Campaign ${campaignId} processing complete:`, {
          recordings: results.step1_recordings,
          emailValidation: results.step2_emailValidation,
          companiesHouse: results.step3_companiesHouse,
          aiAnalysis: results.step4_aiAnalysis,
          approved: results.approvedCount,
          rejected: results.rejectedCount,
          needsReview: results.reviewCount,
          errors: results.errors
        });
      })();

      // Return immediately with 202 Accepted
      res.status(202).json({
        message: "Consolidated processing started in background",
        status: "processing",
        campaignId,
        steps: [
          "Step 1: Recording Sync & Transcription",
          "Step 2: Email Validation",
          "Step 3: Companies House Validation",
          "Step 4: AI QA Analysis & Auto-Decision"
        ],
        note: "Processing follows the correct workflow sequence. AI will auto-approve qualified leads (score ≥ 70), auto-reject unqualified leads (score < 40), and flag borderline cases for review with clear reasons. Refresh the leads page to see results."
      });
    } catch (error) {
      console.error('Consolidated processing error:', error);
      res.status(500).json({ 
        message: "Failed to start consolidated processing",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Validate companies via Companies House for a campaign
  app.post("/api/campaigns/:id/validate-companies", requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
    try {
      const campaignId = req.params.id;
      
      // Verify campaign exists
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const { force = false } = req.body;
      console.log(`[API] Starting Companies House validation for campaign ${campaignId} (force: ${force})`);

      // Start validation in background (non-blocking)
      const { validateCampaignCompanies } = await import('./services/companies-house-validator');
      
      // Fire and forget - process in background with force parameter
      validateCampaignCompanies(campaignId, force)
        .then((result) => {
          console.log(`[API] Companies House validation complete for campaign ${campaignId}:`, result);
        })
        .catch((error) => {
          console.error(`[API] Companies House validation failed for campaign ${campaignId}:`, error);
        });

      // Return immediately with 202 Accepted
      res.status(202).json({
        message: force 
          ? "Companies House validation started (forcing refresh)"
          : "Companies House validation started (using cache where available)",
        status: "processing",
        campaignId,
        note: force 
          ? "Force refresh will make fresh API calls even for recently validated companies. This will take several minutes due to API rate limits."
          : "Validation uses cached data for companies validated within the last year. Only companies requiring validation will make API calls. Refresh the campaign page to see progress."
      });
    } catch (error) {
      console.error('Companies House validation error:', error);
      res.status(500).json({ 
        message: "Failed to start validation",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get Companies House validation summary for a campaign
  app.get("/api/campaigns/:id/validation-summary", requireAuth, async (req, res) => {
    try {
      const { getCampaignValidationSummary } = await import('./services/companies-house-validator');
      const summary = await getCampaignValidationSummary(req.params.id);
      res.json(summary);
    } catch (error) {
      console.error('Validation summary error:', error);
      res.status(500).json({ message: "Failed to get validation summary" });
    }
  });

  // Get account brief (from customFields)
  app.get("/api/accounts/:id/brief", requireAuth, async (req, res) => {
    try {
      const account = await storage.getAccountById(req.params.id);

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      const customFields = account.customFields as any || {};
      const brief = customFields.aiAccountBrief;

      if (!brief) {
        return res.status(404).json({
          message: "Account brief not found",
          suggestion: "Generate a brief using POST /api/accounts/:id/brief"
        });
      }

      res.json({
        ...brief,
        generatedAt: customFields.briefGeneratedAt,
      });
    } catch (error) {
      console.error('Account brief retrieval error:', error);
      res.status(500).json({ message: "Failed to retrieve account brief" });
    }
  });

  // Generate new account brief
  app.post("/api/accounts/:id/brief", requireAuth, async (req, res) => {
    try {
      const { generateAccountBrief } = await import('./services/ai-account-enrichment');
      const brief = await generateAccountBrief(req.params.id);

      if (brief) {
        res.json(brief);
      } else {
        res.status(400).json({ message: "Brief generation failed" });
      }
    } catch (error) {
      console.error('Account brief generation error:', error);
      res.status(500).json({ message: "Failed to generate account brief" });
    }
  });

  // Get comprehensive AI insights for account (engagement, recommendations, analysis)
  app.get("/api/accounts/:id/insights", requireAuth, async (req, res) => {
    try {
      const accountId = req.params.id;
      const account = await storage.getAccountById(accountId);

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Get account brief from customFields
      const customFields = (account.customFields as any) || {};
      const accountBrief = customFields.aiAccountBrief || null;

      // Calculate engagement score based on activities and opportunities
      const { m365Activities, opportunities: opportunitiesTable } = await import('@shared/schema');

      // Get M365 email activities
      const emailActivities = await db
        .select()
        .from(m365Activities)
        .where(eq(m365Activities.accountId, accountId))
        .limit(100);

      // Get opportunities for this account
      const opportunities = await db
        .select()
        .from(opportunitiesTable)
        .where(eq(opportunitiesTable.accountId, accountId));

      // Calculate engagement metrics
      const recentEmails = emailActivities.filter(a => {
        const activityDate = new Date(a.receivedAt);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return activityDate >= thirtyDaysAgo;
      });

      const inboundEmails = recentEmails.filter(e => e.direction === 'inbound').length;
      const outboundEmails = recentEmails.filter(e => e.direction === 'outbound').length;

      const engagementScore = Math.min(100,
        (inboundEmails * 10) +
        (outboundEmails * 5) +
        (opportunities.length * 15)
      );

      const engagementLevel =
        engagementScore >= 70 ? 'high' :
        engagementScore >= 40 ? 'medium' :
        'low';

      // Generate AI recommendations if OpenAI is available
      let recommendations = null;
      let nextBestActions = null;

      try {
        const openai = await import('./lib/' + 'openai').then(m => m.default);

        const recommendationPrompt = `Analyze this B2B account and provide strategic recommendations:

Account: ${account.name}
Industry: ${account.industryStandardized || 'Unknown'}
Engagement Score: ${engagementScore}/100 (${engagementLevel})
Recent Emails (30 days): ${inboundEmails} inbound, ${outboundEmails} outbound
Active Opportunities: ${opportunities.length}
Total Opportunity Value: $${opportunities.reduce((sum, opp) => sum + Number(opp.amount || 0), 0).toLocaleString()}

Provide JSON response with:
{
  "recommendations": [
    {"title": "...", "description": "...", "priority": "high|medium|low", "impact": "..."}
  ],
  "nextBestActions": [
    {"action": "...", "timing": "...", "expectedOutcome": "..."}
  ],
  "riskFactors": ["..."],
  "opportunities": ["..."]
}`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a B2B sales strategist providing actionable recommendations based on account data and engagement patterns.'
            },
            {
              role: 'user',
              content: recommendationPrompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        });

        const aiResponse = JSON.parse(completion.choices[0]?.message?.content || '{}');
        recommendations = aiResponse.recommendations || [];
        nextBestActions = aiResponse.nextBestActions || [];

      } catch (aiError) {
        console.error('[AI Insights] Error generating recommendations:', aiError);
        // Continue without AI recommendations
      }

      res.json({
        accountId,
        accountName: account.name,
        accountBrief,
        engagement: {
          score: engagementScore,
          level: engagementLevel,
          metrics: {
            recentEmails: recentEmails.length,
            inboundEmails,
            outboundEmails,
            activeOpportunities: opportunities.length,
            totalOpportunityValue: opportunities.reduce((sum, opp) => sum + Number(opp.amount || 0), 0),
          },
        },
        recommendations: recommendations || [],
        nextBestActions: nextBestActions || [],
        generatedAt: new Date().toISOString(),
      });

    } catch (error) {
      console.error('AI Insights error:', error);
      res.status(500).json({ message: "Failed to generate insights" });
    }
  });

  // Update campaign QA parameters
  app.patch("/api/campaigns/:id/qa-parameters", requireAuth, async (req, res) => {
    try {
      const { qaParameters, clientSubmissionConfig } = req.body;

      await storage.updateCampaign(req.params.id, {
        qaParameters,
        clientSubmissionConfig,
      });

      res.json({ message: "QA parameters updated successfully" });
    } catch (error) {
      console.error('QA parameters update error:', error);
      res.status(500).json({ message: "Failed to update QA parameters" });
    }
  });

  // Submit lead to client
  app.post("/api/leads/:id/submit-to-client", requireAuth, async (req, res) => {
    try {
      const { leads } = await import('@shared/schema');

      // Get lead and campaign
      const [lead] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      if (!lead.campaignId) {
        return res.status(400).json({ message: "Lead has no associated campaign" });
      }

      const campaign = await storage.getCampaign(lead.campaignId);
      if (!campaign?.clientSubmissionConfig) {
        return res.status(400).json({ message: "Campaign has no client submission configuration" });
      }

      const submissionConfig = campaign.clientSubmissionConfig as any;

      // Get contact and account data
      const [contact] = lead.contactId ? await db.select().from(contactsTable).where(eq(contactsTable.id, lead.contactId)).limit(1) : [null];
      const [account] = contact?.accountId ? await db.select().from(accountsTable).where(eq(accountsTable.id, contact.accountId)).limit(1) : [null];

      // Prepare submission data
      const submissionData: any = {};

      if (submissionConfig.fieldMappings) {
        for (const [clientField, crmField] of Object.entries(submissionConfig.fieldMappings)) {
          if (crmField === 'contact.email') submissionData[clientField] = contact?.email;
          else if (crmField === 'contact.fullName') submissionData[clientField] = contact?.fullName;
          else if (crmField === 'contact.phone') submissionData[clientField] = contact?.directPhone;
          else if (crmField === 'account.name') submissionData[clientField] = account?.name;
          else if (crmField === 'account.domain') submissionData[clientField] = account?.domain;
          // Add more mappings as needed
        }
      }

      // Submit to client endpoint
      const response = await fetch(submissionConfig.endpoint, {
        method: submissionConfig.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(submissionConfig.headers || {}),
        },
        body: JSON.stringify(submissionData),
      });

      const responseData = await response.json();

      // Update lead with submission status
      await db.update(leads)
        .set({
          submittedToClient: true,
          submittedAt: new Date(),
          submissionResponse: responseData,
        })
        .where(eq(leads.id, req.params.id));

      res.json({
        success: response.ok,
        response: responseData,
      });
    } catch (error) {
      console.error('Client submission error:', error);
      res.status(500).json({ message: "Failed to submit lead to client" });
    }
  });

  // ==================== ACTIVITY LOGS ====================

  // Get activity logs for an entity
  app.get("/api/activity-log/:entityType/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { entityType, entityId } = req.params;
      const limitParam = req.query.limit as string | undefined;

      // Validate params
      const paramsSchema = z.object({
        entityType: z.enum(['contact', 'account', 'campaign', 'call_job', 'call_session', 'lead', 'user', 'email_message']),
        entityId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      });

      const validatedParams = paramsSchema.parse({
        entityType,
        entityId,
        limit: limitParam ? parseInt(limitParam) : 50,
      });

      const logs = await storage.getActivityLogs(
        validatedParams.entityType,
        validatedParams.entityId,
        validatedParams.limit
      );
      res.json(logs);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid parameters", errors: error.errors });
      }
      console.error('Error fetching activity logs:', error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // Create activity log (for manual logging)
  app.post("/api/activity-log", requireAuth, async (req: Request, res: Response) => {
    try {
      const validatedData = insertActivityLogSchema.omit({ createdBy: true }).parse(req.body);

      const log = await storage.createActivityLog({
        ...validatedData,
        createdBy: req.user!.userId, // Always use authenticated user - cannot be spoofed
      });
      res.json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid activity log data", errors: error.errors });
      }
      console.error('Error creating activity log:', error);
      res.status(500).json({ message: "Failed to create activity log" });
    }
  });

  // ==================== WEBHOOKS ====================

  app.use("/api/webhooks", webhooksRouter);

  // ==================== AI VOICE AGENT CALLS ====================

  app.use("/api/ai-calls", aiCallsRouter);
  app.use("/api/texml", texmlRouter);

  // ==================== OPENAI SIP REALTIME (Inbound) ====================

  app.use("/api/openai/sip", openaiSipRouter);

  // ==================== OPENAI WEBRTC REALTIME ====================

  app.use("/api/openai/webrtc", openaiWebrtcRouter);

  // ==================== TELNYX WEBRTC ====================

  app.use("/api/telnyx/webrtc", telnyxWebrtcRouter);

  // ==================== CAMPAIGN TEST CALLS (AI Agent Testing) ====================

  app.use("/api/campaigns", campaignTestCallsRouter);
  app.use("/api/campaign-test-calls", campaignTestCallsRouter);

  // ==================== VIRTUAL AGENTS (AI Personas) ====================

  app.use("/api/virtual-agents", virtualAgentsRouter);

  // ==================== VOICE PROVIDERS (Dynamic Voice Discovery + Preview) ====================

  app.use("/api/voice-providers", voiceProviderRouter);

  // ==================== AGENT DEFAULTS (Global Agent Configuration) ====================

  app.use("/api/agent-defaults", agentDefaultsRouter);

  // ==================== HYBRID CAMPAIGN AGENTS ====================

  app.use("/api/campaigns", hybridCampaignAgentsRouter);

  // ==================== UNIFIED AI/HUMAN AGENT CONSOLE ====================

  app.use("/api/unified-console", unifiedAgentConsoleRouter);

  // ==================== AI CRM OPERATOR ====================

  app.use("/api/ai-operator", aiOperatorRouter);
  app.use("/api/agent", agentCommandRouter);

  // ==================== ORGANIZATION INTELLIGENCE ====================

  app.use("/api/org-intelligence", orgIntelligenceRouter);
  
  // ==================== ORGANIZATION INTELLIGENCE INJECTION MODEL ====================
  // Voice Agent OI Modes: use_existing | fresh_research | none
  app.use("/api/org-intelligence-injection", orgIntelligenceInjectionRouter);

  // ==================== PROBLEM INTELLIGENCE SYSTEM ====================
  // Service Catalog, Problem Framework, Campaign Problem Intelligence
  app.use("/api", problemIntelligenceRouter);

  // ==================== DIALER RUNS (Manual/PowerDialer) ====================

  app.use("/api/dialer-runs", dialerRunsRouter);

  // ==================== PREVIEW STUDIO ====================
  // Preview and test campaign content (emails, call plans, live simulation)
  app.use("/api/preview-studio", previewStudioRouter);

  // ==================== SIMULATIONS ====================
  // TRUE telephony-free simulation - NO dialer, NO phone, NO SIP
  // call_mode: "SIMULATION" enforced - completely decoupled from telephony
  app.use("/api/simulations", simulationsRouter);

  // ==================== KNOWLEDGE BLOCKS ====================
  // Modular, versioned agent knowledge management
  app.use("/api/knowledge-blocks", knowledgeBlocksRouter);
  app.use("/api/agent-prompts", agentPromptVisibilityRouter);

  // ==================== PROMPT VARIANTS ====================
  // A/B testing and multi-perspective prompt generation
  app.use("/api", promptVariantsRouter);

  // ==================== SUPER ORGANIZATION ====================
  // Platform owner organization (Pivotal B2B) management
  // Only accessible by organization owners
  app.use("/api/super-org", superOrganizationRouter);

  // ==================== QUEUE MANAGEMENT ====================

  app.use("/api", queueRouter);

  // ==================== FILTER OPTIONS ====================

  app.use("/api/filters/options", filterOptionsRouter);

  // ==================== CALL CAMPAIGN REPORTING ROUTES ====================
  app.use('/api/reports/calls', reportingRoutes);

  // ==================== ENGAGEMENT ANALYTICS ENDPOINT ====================
  app.get('/api/analytics/engagement', requireAuth, async (req, res) => {
    try {
      // Validate query params with date validation
      const paramsSchema = z.object({
        from: z.string()
          .transform(str => new Date(str))
          .refine(date => !isNaN(date.getTime()), { message: "Invalid 'from' date" }),
        to: z.string()
          .transform(str => new Date(str))
          .refine(date => !isNaN(date.getTime()), { message: "Invalid 'to' date" }),
        campaign: z.string().optional(),
      });

      const params = paramsSchema.parse(req.query);

      // Normalize date range to include full days (start-of-day to end-of-day)
      const fromDate = new Date(params.from);
      fromDate.setHours(0, 0, 0, 0);
      
      const toDate = new Date(params.to);
      toDate.setHours(23, 59, 59, 999);

      // Campaign filter condition
      const campaignFilter = params.campaign && params.campaign !== 'all' ? params.campaign : null;

      // 1. EMAIL METRICS
      const emailMetrics = await db.execute(sql`
        SELECT
          COUNT(*)::int as total_sent,
          COUNT(CASE WHEN status IN ('delivered', 'opened', 'clicked') THEN 1 END)::int as delivered,
          COUNT(CASE WHEN status IN ('opened', 'clicked') THEN 1 END)::int as opened,
          COUNT(CASE WHEN status = 'clicked' THEN 1 END)::int as clicked
        FROM email_sends
        WHERE sent_at >= ${fromDate}
          AND sent_at <= ${toDate}
          ${campaignFilter ? sql`AND campaign_id = ${campaignFilter}` : sql``}
      `);

      const emailStats = emailMetrics.rows[0] || { total_sent: 0, delivered: 0, opened: 0, clicked: 0 };

      // 2. CALL METRICS (using calls table which has disposition data)
      const callMetrics = await db.execute(sql`
        SELECT
          COUNT(*)::int as total_calls,
          COUNT(CASE WHEN disposition IN ('qualified', 'interested', 'callback_scheduled') THEN 1 END)::int as qualified,
          COUNT(CASE WHEN disposition IN ('no_answer', 'voicemail', 'busy') THEN 1 END)::int as attempted,
          COUNT(CASE WHEN disposition IN ('qualified', 'interested', 'not_interested', 'callback_scheduled', 'dnc') THEN 1 END)::int as connected
        FROM calls
        WHERE created_at >= ${fromDate}
          AND created_at <= ${toDate}
          ${campaignFilter ? sql`AND campaign_id = ${campaignFilter}` : sql``}
      `);

      const callStats = callMetrics.rows[0] || { total_calls: 0, qualified: 0, attempted: 0, connected: 0 };

      // 3. LEAD METRICS
      const leadMetrics = await db.execute(sql`
        SELECT
          COUNT(*)::int as total_leads,
          COUNT(CASE WHEN qa_status = 'approved' THEN 1 END)::int as approved,
          COUNT(CASE WHEN qa_status IN ('new', 'in_review') THEN 1 END)::int as pending,
          COUNT(CASE WHEN qa_status = 'rejected' THEN 1 END)::int as rejected,
          COUNT(CASE WHEN ai_qualification_status = 'qualified' THEN 1 END)::int as qualified
        FROM leads
        WHERE created_at >= ${fromDate}
          AND created_at <= ${toDate}
          ${campaignFilter ? sql`AND campaign_id = ${campaignFilter}` : sql``}
      `);

      const leadStats = leadMetrics.rows[0] || { total_leads: 0, approved: 0, pending: 0, rejected: 0, qualified: 0 };

      // 4. TIMELINE DATA (daily aggregation) - use normalized dates for inclusive range
      const timelineData = await db.execute(sql`
        WITH date_series AS (
          SELECT generate_series(
            date_trunc('day', ${fromDate}::timestamp),
            date_trunc('day', ${toDate}::timestamp),
            '1 day'::interval
          )::date as date
        ),
        daily_emails AS (
          SELECT
            date_trunc('day', sent_at)::date as date,
            COUNT(*)::int as count
          FROM email_sends
          WHERE sent_at >= ${fromDate} AND sent_at <= ${toDate}
            ${campaignFilter ? sql`AND campaign_id = ${campaignFilter}` : sql``}
          GROUP BY date_trunc('day', sent_at)::date
        ),
        daily_calls AS (
          SELECT
            date_trunc('day', created_at)::date as date,
            COUNT(*)::int as count
          FROM calls
          WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
            ${campaignFilter ? sql`AND campaign_id = ${campaignFilter}` : sql``}
          GROUP BY date_trunc('day', created_at)::date
        ),
        daily_leads AS (
          SELECT
            date_trunc('day', created_at)::date as date,
            COUNT(*)::int as count
          FROM leads
          WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
            ${campaignFilter ? sql`AND campaign_id = ${campaignFilter}` : sql``}
          GROUP BY date_trunc('day', created_at)::date
        )
        SELECT
          to_char(ds.date, 'YYYY-MM-DD') as date,
          COALESCE(de.count, 0)::int as emails,
          COALESCE(dc.count, 0)::int as calls,
          COALESCE(dl.count, 0)::int as leads
        FROM date_series ds
        LEFT JOIN daily_emails de ON ds.date = de.date
        LEFT JOIN daily_calls dc ON ds.date = dc.date
        LEFT JOIN daily_leads dl ON ds.date = dl.date
        ORDER BY ds.date
      `);

      // 5. DISPOSITION BREAKDOWN (for calls)
      const dispositionData = await db.execute(sql`
        SELECT
          disposition as name,
          COUNT(*)::int as value
        FROM calls
        WHERE created_at >= ${fromDate}
          AND created_at <= ${toDate}
          ${campaignFilter ? sql`AND campaign_id = ${campaignFilter}` : sql``}
          AND disposition IS NOT NULL
        GROUP BY disposition
        ORDER BY value DESC
      `);

      // 6. CHANNEL BREAKDOWN
      const channelBreakdown = [
        { name: 'Email', value: emailStats.total_sent },
        { name: 'Phone', value: callStats.total_calls }
      ];

      // 7. CAMPAIGN LEADS BREAKDOWN
      const campaignLeadsData = await db.execute(sql`
        SELECT
          campaign_id,
          COUNT(*)::int as lead_count
        FROM leads
        WHERE created_at >= ${fromDate}
          AND created_at <= ${toDate}
          ${campaignFilter ? sql`AND campaign_id = ${campaignFilter}` : sql``}
        GROUP BY campaign_id
      `);

      const campaignLeads: Record<string, number> = {};
      campaignLeadsData.rows.forEach((row: any) => {
        if (row.campaign_id) {
          campaignLeads[row.campaign_id] = row.lead_count;
        }
      });

      // Build response
      res.json({
        email: {
          total: emailStats.total_sent,
          sent: emailStats.total_sent,
          delivered: emailStats.delivered,
          opened: emailStats.opened,
          clicked: emailStats.clicked,
        },
        calls: {
          total: callStats.total_calls,
          attempted: callStats.attempted,
          connected: callStats.connected,
          qualified: callStats.qualified,
        },
        leads: {
          total: leadStats.total_leads,
          qualified: leadStats.qualified,
          approved: leadStats.approved,
          pending: leadStats.pending,
          rejected: leadStats.rejected,
        },
        timeline: timelineData.rows,
        channelBreakdown,
        dispositions: dispositionData.rows,
        campaignLeads,
      });
    } catch (error: any) {
      console.error('[Analytics] Error fetching engagement analytics:', error);
      res.status(500).json({ message: 'Failed to fetch analytics', error: error.message });
    }
  });

  // ==================== CLIENT PORTAL (Must be before catch-all /api routes) ====================
  app.use('/api/client-portal', clientPortalRouter);

  // ==================== CAMPAIGN SUPPRESSION LISTS ====================
  app.use('/api/campaigns', requireAuth, campaignSuppressionRouter);
  app.use('/api/campaigns', requireAuth, campaignEmailRouter);
  app.use('/api/campaigns', requireAuth, campaignSendRouter);

  // ==================== CAMPAIGN INGESTION (AI Auto-Generate) ====================
  app.use('/api/campaigns', requireAuth, campaignIngestionRouter);

  app.use(verificationCampaignsRouter);
  app.use(verificationContactsRouter);
  app.use(verificationSubmissionsRouter);
  app.use(verificationSuppressionRouter);
  app.use(verificationUploadRouter);
  app.use(verificationUploadJobsRouter);
  app.use(verificationEnrichmentRouter);
  app.use('/api', requireAuth, enrichmentJobsRouter);
  app.use(verificationJobRecoveryRouter);
  app.use(verificationAccountCapsRouter);
  app.use(verificationPriorityConfigRouter);

  // ==================== GENERAL SUPPRESSION (CONTACTS) ====================
  app.use('/api/suppression', requireAuth, suppressionRouter);

  // ==================== TELEMARKETING SUPPRESSION LISTS ====================
  app.use('/api/telemarketing/suppressions', requireAuth, telemarketingSuppressionRouter);

  // ==================== S3 FILE OPERATIONS ====================
  app.use(s3FilesRouter);

  // ==================== CSV IMPORT JOBS (BullMQ) ====================
  app.use(csvImportJobsRouter);
  app.use(contactsCSVImportRouter);

  // ==================== EMAIL VALIDATION TESTING ====================
  app.use(emailValidationTestRouter);

  // ==================== VERIFICATION CAMPAIGN EXPORT ====================
  app.use(verificationExportRouter);

  // ==================== EXPORT TEMPLATES ====================
  app.use('/api/export-templates', requireAuth, exportTemplatesRouter);
  
  // CSV Mapping Templates
  app.use(csvMappingTemplatesRouter);
  
  // AI-Powered CSV Mapping
  app.use(aiCsvMappingRouter);
  
  // ==================== LINKEDIN VERIFICATION ====================
  app.use('/api/linkedin-verification', linkedinVerificationRouter);

  // ==================== AGENT PERFORMANCE & REPORTING ====================
  app.use('/api', agentReportsRouter);
  
  // Lead Forms & Pipeline Management
  app.use(leadFormsRouter);
  app.use(pipelineRouter);
  app.use(pipelineIntelligenceRouter);

  // AI Project Creation
  app.use('/api/ai', aiProjectRouter);

  // ==================== EMAIL INBOX ====================
  app.use('/api/inbox', inboxRouter);

  // ==================== EMAIL AI ANALYSIS ====================
  app.use('/api/email-ai', emailAiRouter);

  // ==================== DEEPSEEK AI EMAIL GENERATION ====================
  app.use('/api/email-ai/deepseek', deepseekAiRouter);

  // ==================== EMAIL CAMPAIGN STATS ====================
  app.use('/api/campaigns', requireAuth, emailCampaignStatsRouter);

  // ==================== EMAIL SIGNATURES ====================
  app.use('/api', signatureRouter);

  // ==================== EMAIL TRACKING ====================
  app.use('/api/track', emailTrackingRouter);

  // ==================== MERGE TAGS ====================
  app.use('/api/merge-tags', requireAuth, mergeTagsRouter);

  // ==================== ADMIN DATA MANAGEMENT ====================

  // Delete verification campaigns
  app.delete("/api/admin/data/verification_campaigns", requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const result = await db.delete(verificationCampaigns);

      // Log the action
      await storage.createActivityLog({
        entityType: 'campaign',
        entityId: req.user!.userId,
        eventType: 'campaign_deleted',
        payload: { action: 'admin_delete_verification_campaigns', description: 'Admin deleted all verification campaigns' },
        createdBy: req.user!.userId,
      });

      res.json({ message: "All verification campaigns deleted", deletedCount: result.rowCount || 0 });
    } catch (error) {
      console.error('Error deleting verification campaigns:', error);
      res.status(500).json({ message: "Failed to delete verification campaigns" });
    }
  });

  // Delete verification contacts
  app.delete("/api/admin/data/verification_contacts", requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const result = await db.delete(verificationContacts);

      await storage.createActivityLog({
        entityType: 'contact',
        entityId: req.user!.userId,
        eventType: 'contact_deleted',
        payload: { action: 'admin_delete_verification_contacts', description: 'Admin deleted all verification contacts' },
        createdBy: req.user!.userId,
      });

      res.json({ message: "All verification contacts deleted", deletedCount: result.rowCount || 0 });
    } catch (error) {
      console.error('Error deleting verification contacts:', error);
      res.status(500).json({ message: "Failed to deleteverification contacts" });
    }
  });

  // Delete regular campaigns
  app.delete("/api/admin/data/campaigns", requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const result = await db.delete(campaigns);

      await storage.createActivityLog({
        entityType: 'campaign',
        entityId: req.user!.userId,
        eventType: 'campaign_deleted',
        payload: { action: 'admin_delete_campaigns', description: 'Admin deleted all regular campaigns' },
        createdBy: req.user!.userId,
      });

      res.json({ message: "All campaigns deleted", deletedCount: result.rowCount || 0 });
    } catch (error) {
      console.error('Error deleting campaigns:', error);
      res.status(500).json({ message: "Failed to delete campaigns" });
    }
  });

  // Delete contacts
  app.delete("/api/admin/data/contacts", requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const result = await db.delete(contacts);

      await storage.createActivityLog({
        entityType: 'contact',
        entityId: req.user!.userId,
        action: 'admin_delete_contacts',
        description: `Admin deleted all contacts`,
        createdBy: req.user!.userId,
      });

      res.json({ message: "All contacts deleted", deletedCount: result.rowCount || 0 });
    } catch (error) {
      console.error('Error deleting contacts:', error);
      res.status(500).json({ message: "Failed to delete contacts" });
    }
  });

  // Delete accounts
  app.delete("/api/admin/data/accounts", requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const result = await db.delete(accounts);

      await storage.createActivityLog({
        entityType: 'account',
        entityId: req.user!.userId,
        action: 'admin_delete_accounts',
        description: `Admin deleted all accounts`,
        createdBy: req.user!.userId,
      });

      res.json({ message: "All accounts deleted", deletedCount: result.rowCount || 0 });
    } catch (error) {
      console.error('Error deleting accounts:', error);
      res.status(500).json({ message: "Failed to delete accounts" });
    }
  });

  // Delete leads
  app.delete("/api/admin/data/leads", requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const result = await db.delete(leads);

      await storage.createActivityLog({
        entityType: 'lead',
        entityId: req.user!.userId,
        action: 'admin_delete_leads',
        description: `Admin deleted all leads`,
        createdBy: req.user!.userId,
      });

      res.json({ message: "All leads deleted", deletedCount: result.rowCount || 0 });
    } catch (error) {
      console.error('Error deleting leads:', error);
      res.status(500).json({ message: "Failed to delete leads" });
    }
  });

  // Delete ALL business data
  app.delete("/api/admin/data/all", requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      // Delete in order to respect foreign key constraints
      await db.delete(leads);
      await db.delete(campaignQueue);
      await db.delete(agentQueue);
      await db.delete(campaignAgentAssignments);
      await db.delete(verificationLeadSubmissions);
      await db.delete(verificationContacts);
      await db.delete(verificationCampaigns);
      await db.delete(campaigns);
      await db.delete(contacts);
      await db.delete(accounts);

      await storage.createActivityLog({
        entityType: 'user',
        entityId: req.user!.userId,
        action: 'admin_delete_all_data',
        description: `Admin deleted ALL business data`,
        createdBy: req.user!.userId,
      });

      res.json({ message: "All business data deleted successfully" });
    } catch (error) {
      console.error('Error deleting all data:', error);
      res.status(500).json({ message: "Failed to delete all data" });
    }
  });

  // ==================== PHONE BULK EDITOR ROUTES ====================

  // Search for contacts and accounts with phone pattern matching
  app.post("/api/phone-bulk/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const { searchType, phonePattern, contactFilters: contactFilterConditions, accountFilters: accountFilterConditions, listId } = req.body;

      if (!searchType || !phonePattern) {
        return res.status(400).json({ message: "searchType and phonePattern are required" });
      }

      const results: any[] = [];

      // Helper function to check if phone matches pattern
      const matchesPattern = (phone: string | null, pattern: string): boolean => {
        if (!phone) return false;
        // Remove all non-digit characters for comparison
        const cleanPhone = phone.replace(/[^0-9+]/g, '');
        const cleanPattern = pattern.replace(/[^0-9+]/g, '');
        return cleanPhone.includes(cleanPattern);
      };

      if (searchType === 'contacts' || searchType === 'both') {
        // Build filter for contacts
        const contactFilters: FilterGroup | undefined = contactFilterConditions ? {
          operator: 'and',
          conditions: contactFilterConditions
        } : undefined;

        let allContacts = await storage.getContacts(contactFilters);

        // If list filtering is specified, filter by list membership
        if (listId) {
          const listContacts = await storage.getListContacts(listId);
          const listContactIds = new Set(listContacts.map(lc => lc.contactId));
          allContacts = allContacts.filter(c => listContactIds.has(c.id));
        }

        // Filter by phone pattern
        const matchingContacts = allContacts.filter(contact =>
          matchesPattern(contact.phone, phonePattern) ||
          matchesPattern(contact.mobile, phonePattern) ||
          matchesPattern(contact.tel, phonePattern)
        );

        // Map to result format
        results.push(...matchingContacts.map(contact => ({
          id: contact.id,
          type: 'contact',
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          email: contact.email,
          phone: contact.phone,
          mobile: contact.mobile,
          tel: contact.tel,
          company: contact.companyName,
          accountId: contact.accountId,
          title: contact.title,
          department: contact.department,
          city: contact.city,
          state: contact.state,
          country: contact.country,
          seniorityLevel: contact.seniorityLevel,
          jobFunction: contact.jobFunction
        })));
      }

      if (searchType === 'accounts' || searchType === 'both') {
        // Build filter for accounts
        const accountFilters: FilterGroup | undefined = accountFilterConditions ? {
          operator: 'and',
          conditions: accountFilterConditions
        } : undefined;

        let allAccounts = await storage.getAccounts(accountFilters);

        // If list filtering is specified, filter by list membership
        if (listId) {
          const listAccounts = await storage.getListAccounts(listId);
          const listAccountIds = new Set(listAccounts.map(la => la.accountId));
          allAccounts = allAccounts.filter(a => listAccountIds.has(a.id));
        }

        // Filter by phone pattern
        const matchingAccounts = allAccounts.filter(account =>
          matchesPattern(account.hqPhone, phonePattern)
        );

        // Map to result format
        results.push(...matchingAccounts.map(account => ({
          id: account.id,
          type: 'account',
          name: account.companyName,
          email: null,
          phone: account.hqPhone,
          mobile: null,
          tel: null,
          company: account.companyName,
          accountId: account.id,
          website: account.website,
          industry: account.industry,
          companySize: account.companySize,
          revenue: account.revenue,
          hqCity: account.hqCity,
          hqState: account.hqState,
          hqCountry: account.hqCountry,
          hqAddress: account.hqAddress
        })));
      }

      res.json({
        results,
        total: results.length,
        searchType,
        phonePattern
      });

    } catch (error) {
      console.error('Phone bulk search error:', error);
      res.status(500).json({ message: "Failed to search phone numbers" });
    }
  });

  // Bulk update phone numbers
  app.post("/api/phone-bulk/update", requireAuth, async (req: Request, res: Response) => {
    try {
      const { updates } = req.body;

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: "updates array is required" });
      }

      let contactsUpdated = 0;
      let accountsUpdated = 0;

      for (const update of updates) {
        const { id, type, fieldUpdates } = update;

        if (!id || !type || !fieldUpdates) {
          continue;
        }

        if (type === 'contact') {
          // Update contact phone fields
          const updateData: any = {};
          if (fieldUpdates.phone !== undefined) updateData.phone = fieldUpdates.phone;
          if (fieldUpdates.mobile !== undefined) updateData.mobile = fieldUpdates.mobile;
          if (fieldUpdates.tel !== undefined) updateData.tel = fieldUpdates.tel;

          if (Object.keys(updateData).length > 0) {
            await db.update(contacts)
              .set(updateData)
              .where(eq(contacts.id, id));
            contactsUpdated++;
          }
        } else if (type === 'account') {
          // Update account phone fields
          const updateData: any = {};
          if (fieldUpdates.phone !== undefined) updateData.hqPhone = fieldUpdates.phone;

          if (Object.keys(updateData).length > 0) {
            await db.update(accounts)
              .set(updateData)
              .where(eq(accounts.id, id));
            accountsUpdated++;
          }
        }
      }

      // Log the bulk update
      await storage.createActivityLog({
        entityType: 'user',
        entityId: req.user!.userId,
        action: 'phone_bulk_update',
        description: `Bulk updated ${contactsUpdated} contacts and ${accountsUpdated} accounts`,
        createdBy: req.user!.userId,
      });

      res.json({
        message: "Phone numbers updated successfully",
        contactsUpdated,
        accountsUpdated,
        totalUpdated: contactsUpdated + accountsUpdated
      });

    } catch (error) {
      console.error('Phone bulk update error:', error);
      res.status(500).json({ message: "Failed to update phone numbers" });
    }
  });

  // =============================================================================
  // MANUAL JOB TRIGGERS
  // =============================================================================

  // Manually trigger email validation job
  app.post("/api/jobs/trigger/email-validation", requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      const { triggerEmailValidation } = await import('./jobs/email-validation-job');
      const result = await triggerEmailValidation();

      if (result.success) {
        res.json({ message: result.message, stats: result.stats });
      } else {
        res.status(500).json({ message: result.message });
      }
    } catch (error: any) {
      console.error('Error triggering email validation:', error);
      res.status(500).json({ message: error.message || "Failed to trigger email validation" });
    }
  });

  // Manually trigger AI enrichment job
  app.post("/api/jobs/trigger/ai-enrichment", requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      const { triggerAiEnrichment } = await import('./jobs/ai-enrichment-job');
      const result = await triggerAiEnrichment();

      if (result.success) {
        res.json({ message: result.message, stats: result.stats });
      } else {
        res.status(500).json({ message: result.message });
      }
    } catch (error: any) {
      console.error('Error triggering AI enrichment:', error);
      res.status(500).json({ message: error.message || "Failed to trigger AI enrichment" });
    }
  });

  // Get bulk list job status
  app.get("/api/jobs/bulk-list/:jobId", requireAuth, async (req, res) => {
    try {
      const { getBulkListJobStatus } = await import('./lib/bulk-list-queue');
      const status = await getBulkListJobStatus(req.params.jobId);

      if (!status) {
        return res.status(404).json({ message: "Job not found" });
      }

      res.json(status);
    } catch (error) {
      console.error('Get bulk list job status error:', error);
      res.status(500).json({ message: "Failed to get job status" });
    }
  });

  // Get background job status
  app.get("/api/jobs/status", requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      const ENABLE_EMAIL_VALIDATION = process.env.ENABLE_EMAIL_VALIDATION !== 'false';
      const ENABLE_AI_ENRICHMENT = process.env.ENABLE_AI_ENRICHMENT !== 'false';

      res.json({
        emailValidation: {
          enabled: ENABLE_EMAIL_VALIDATION,
          mode: ENABLE_EMAIL_VALIDATION ? 'automatic' : 'manual'
        },
        aiEnrichment: {
          enabled: ENABLE_AI_ENRICHMENT,
          mode: ENABLE_AI_ENRICHMENT ? 'automatic' : 'manual'
        }
      });
    } catch (error: any) {
      console.error('Error getting job status:', error);
      res.status(500).json({ message: "Failed to get job status" });
    }
  });

  // ==================== CALL ANALYTICS ====================

  // Get comprehensive call analytics (overall, per-campaign, per-agent)
  // UNIFIED: Combines legacy callAttempts and new dialerCallAttempts for accurate stats
  app.get("/api/analytics/call-stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const { callAttempts, dispositions, campaigns: campaignsTable, users, dialerCallAttempts, virtualAgents } = await import('@shared/schema');

      // ========== LEGACY CALL ATTEMPTS STATS ==========
      const qualifiedDisps = await db
        .select({ label: dispositions.label })
        .from(dispositions)
        .where(eq(dispositions.systemAction, 'converted_qualified'));

      const qualifiedLabels = qualifiedDisps.map(d => d.label);

      const [legacyOverall] = await db
        .select({
          attempted: sql<number>`COUNT(*)::int`,
          connected: sql<number>`COUNT(CASE WHEN ${callAttempts.disposition} IS NOT NULL OR ${callAttempts.duration} > 0 THEN 1 END)::int`,
          qualified: qualifiedLabels.length > 0
            ? sql<number>`COUNT(CASE WHEN ${callAttempts.disposition} IN (${sql.join(qualifiedLabels.map(l => sql`${l}`), sql`, `)}) THEN 1 END)::int`
            : sql<number>`0::int`,
        })
        .from(callAttempts);

      // ========== NEW DIALER CALL ATTEMPTS STATS ==========
      const [dialerOverall] = await db
        .select({
          attempted: sql<number>`COUNT(*)::int`,
          connected: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 END)::int`,
          qualified: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'qualified_lead' THEN 1 END)::int`,
          voicemail: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.voicemailDetected} = true THEN 1 END)::int`,
          noAnswer: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'no_answer' THEN 1 END)::int`,
          notInterested: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'not_interested' THEN 1 END)::int`,
          dnc: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'do_not_call' THEN 1 END)::int`,
          avgDuration: sql<number>`AVG(COALESCE(${dialerCallAttempts.callDurationSeconds}, 0))::int`,
        })
        .from(dialerCallAttempts);

      // Merge overall stats
      const legacy = legacyOverall || { attempted: 0, connected: 0, qualified: 0 };
      const dialer = dialerOverall || { attempted: 0, connected: 0, qualified: 0, voicemail: 0, noAnswer: 0, notInterested: 0, dnc: 0, avgDuration: 0 };

      const overallStats = {
        attempted: legacy.attempted + dialer.attempted,
        connected: legacy.connected + dialer.connected,
        qualified: legacy.qualified + dialer.qualified,
        voicemail: dialer.voicemail,
        noAnswer: dialer.noAnswer,
        notInterested: dialer.notInterested,
        dnc: dialer.dnc,
        avgDuration: dialer.avgDuration
      };

      // ========== PER-CAMPAIGN STATS (UNIFIED) ==========
      const legacyCampaignStats = await db
        .select({
          campaignId: callAttempts.campaignId,
          campaignName: campaignsTable.name,
          attempted: sql<number>`COUNT(*)::int`,
          connected: sql<number>`COUNT(CASE WHEN ${callAttempts.disposition} IS NOT NULL OR ${callAttempts.duration} > 0 THEN 1 END)::int`,
          qualified: qualifiedLabels.length > 0
            ? sql<number>`COUNT(CASE WHEN ${callAttempts.disposition} IN (${sql.join(qualifiedLabels.map(l => sql`${l}`), sql`, `)}) THEN 1 END)::int`
            : sql<number>`0::int`,
        })
        .from(callAttempts)
        .leftJoin(campaignsTable, eq(callAttempts.campaignId, campaignsTable.id))
        .groupBy(callAttempts.campaignId, campaignsTable.name);

      const dialerCampaignStats = await db
        .select({
          campaignId: dialerCallAttempts.campaignId,
          campaignName: campaignsTable.name,
          attempted: sql<number>`COUNT(*)::int`,
          connected: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 END)::int`,
          qualified: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'qualified_lead' THEN 1 END)::int`,
        })
        .from(dialerCallAttempts)
        .leftJoin(campaignsTable, eq(dialerCallAttempts.campaignId, campaignsTable.id))
        .groupBy(dialerCallAttempts.campaignId, campaignsTable.name);

      // Merge campaign stats
      const campaignMap = new Map<string, { id: string; name: string; attempted: number; connected: number; qualified: number }>();
      for (const stat of legacyCampaignStats) {
        campaignMap.set(stat.campaignId, {
          id: stat.campaignId,
          name: stat.campaignName || 'Unknown',
          attempted: stat.attempted,
          connected: stat.connected,
          qualified: stat.qualified
        });
      }
      for (const stat of dialerCampaignStats) {
        const existing = campaignMap.get(stat.campaignId);
        if (existing) {
          existing.attempted += stat.attempted;
          existing.connected += stat.connected;
          existing.qualified += stat.qualified;
        } else {
          campaignMap.set(stat.campaignId, {
            id: stat.campaignId,
            name: stat.campaignName || 'Unknown',
            attempted: stat.attempted,
            connected: stat.connected,
            qualified: stat.qualified
          });
        }
      }
      const campaignStats = Array.from(campaignMap.values()).map(c => ({
        campaignId: c.id,
        campaignName: c.name,
        attempted: c.attempted,
        connected: c.connected,
        qualified: c.qualified
      }));

      // ========== PER-AGENT STATS (UNIFIED) ==========
      const legacyAgentStats = await db
        .select({
          agentId: callAttempts.agentId,
          agentName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
          attempted: sql<number>`COUNT(*)::int`,
          connected: sql<number>`COUNT(CASE WHEN ${callAttempts.disposition} IS NOT NULL OR ${callAttempts.duration} > 0 THEN 1 END)::int`,
          qualified: qualifiedLabels.length > 0
            ? sql<number>`COUNT(CASE WHEN ${callAttempts.disposition} IN (${sql.join(qualifiedLabels.map(l => sql`${l}`), sql`, `)}) THEN 1 END)::int`
            : sql<number>`0::int`,
        })
        .from(callAttempts)
        .leftJoin(users, eq(callAttempts.agentId, users.id))
        .groupBy(callAttempts.agentId, users.firstName, users.lastName);

      const dialerHumanAgentStats = await db
        .select({
          agentId: dialerCallAttempts.humanAgentId,
          agentName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
          attempted: sql<number>`COUNT(*)::int`,
          connected: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 END)::int`,
          qualified: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'qualified_lead' THEN 1 END)::int`,
        })
        .from(dialerCallAttempts)
        .innerJoin(users, eq(dialerCallAttempts.humanAgentId, users.id))
        .where(isNotNull(dialerCallAttempts.humanAgentId))
        .groupBy(dialerCallAttempts.humanAgentId, users.firstName, users.lastName);

      const dialerAIAgentStats = await db
        .select({
          agentId: dialerCallAttempts.virtualAgentId,
          agentName: virtualAgents.name,
          attempted: sql<number>`COUNT(*)::int`,
          connected: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 END)::int`,
          qualified: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'qualified_lead' THEN 1 END)::int`,
        })
        .from(dialerCallAttempts)
        .innerJoin(virtualAgents, eq(dialerCallAttempts.virtualAgentId, virtualAgents.id))
        .where(isNotNull(dialerCallAttempts.virtualAgentId))
        .groupBy(dialerCallAttempts.virtualAgentId, virtualAgents.name);

      // Merge agent stats
      const agentMap = new Map<string, { id: string; name: string; type: string; attempted: number; connected: number; qualified: number }>();
      for (const stat of legacyAgentStats) {
        if (!stat.agentId) continue;
        agentMap.set(stat.agentId, {
          id: stat.agentId,
          name: stat.agentName || 'Unknown',
          type: 'human',
          attempted: stat.attempted,
          connected: stat.connected,
          qualified: stat.qualified
        });
      }
      for (const stat of dialerHumanAgentStats) {
        if (!stat.agentId) continue;
        const existing = agentMap.get(stat.agentId);
        if (existing) {
          existing.attempted += stat.attempted;
          existing.connected += stat.connected;
          existing.qualified += stat.qualified;
        } else {
          agentMap.set(stat.agentId, {
            id: stat.agentId,
            name: stat.agentName || 'Unknown',
            type: 'human',
            attempted: stat.attempted,
            connected: stat.connected,
            qualified: stat.qualified
          });
        }
      }
      for (const stat of dialerAIAgentStats) {
        if (!stat.agentId) continue;
        agentMap.set(`ai_${stat.agentId}`, {
          id: stat.agentId,
          name: `🤖 ${stat.agentName}`,
          type: 'ai',
          attempted: stat.attempted,
          connected: stat.connected,
          qualified: stat.qualified
        });
      }
      const agentStats = Array.from(agentMap.values()).map(a => ({
        agentId: a.id,
        agentName: a.name,
        agentType: a.type,
        attempted: a.attempted,
        connected: a.connected,
        qualified: a.qualified
      }));

      res.json({
        overall: overallStats,
        byCampaign: campaignStats,
        byAgent: agentStats,
      });
    } catch (error: any) {
      console.error('Error fetching call analytics:', error);
      res.status(500).json({ message: "Failed to fetch call analytics" });
    }
  });

  // Get queue status analytics (total, queued, in progress, completed, skipped, removed)
  app.get("/api/analytics/queue-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agentQueue, campaigns: campaignsTable } = await import('@shared/schema');
      const campaignId = req.query.campaignId as string | undefined;

      // Build aggregation query with optional campaign filter
      const whereCondition = campaignId ? eq(agentQueue.campaignId, campaignId) : undefined;

      // Calculate status breakdown using SQL aggregation
      const [stats] = await db
        .select({
          total: sql<number>`COUNT(*)::int`,
          queued: sql<number>`COUNT(CASE WHEN ${agentQueue.queueState} = 'queued' THEN 1 END)::int`,
          inProgress: sql<number>`COUNT(CASE WHEN ${agentQueue.queueState} = 'in_progress' THEN 1 END)::int`,
          completed: sql<number>`COUNT(CASE WHEN ${agentQueue.queueState} = 'completed' THEN 1 END)::int`,
          skipped: sql<number>`COUNT(CASE WHEN ${agentQueue.queueState} = 'skipped' THEN 1 END)::int`,
          removed: sql<number>`COUNT(CASE WHEN ${agentQueue.queueState} = 'removed' THEN 1 END)::int`,
        })
        .from(agentQueue)
        .where(whereCondition);

      // If filtering by campaign, get campaign name
      let campaignName: string | undefined;
      if (campaignId) {
        const [campaign] = await db
          .select({ name: campaignsTable.name })
          .from(campaignsTable)
          .where(eq(campaignsTable.id, campaignId))
          .limit(1);
        campaignName = campaign?.name;
      }

      res.json({
        campaignId,
        campaignName,
        total: stats?.total || 0,
        queued: stats?.queued || 0,
        inProgress: stats?.inProgress || 0,
        completed: stats?.completed || 0,
        skipped: stats?.skipped || 0,
        removed: stats?.removed || 0,
      });
    } catch (error: any) {
      console.error('Error fetching queue status:', error);
      res.status(500).json({ message: "Failed to fetch queue status" });
    }
  });

  // ==================== MANUAL BACKGROUND JOB TRIGGERS ====================
  // Performance optimization: Trigger intensive jobs on-demand instead of continuous running

  /**
   * Manual Email Validation Trigger
   * Validates emails for specific campaigns or all pending contacts
   * POST /api/jobs/trigger/email-validation
   */
  app.post("/api/jobs/trigger/email-validation", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { campaignId, limit } = req.body;

      console.log(`[Manual Trigger] Email validation requested by ${req.user.username}`, { campaignId, limit });

      // Import and run email validation job
      const { processEmailValidation } = await import('./jobs/email-validation-job');
      const result = await processEmailValidation({ campaignId, limit });

      res.json({
        message: "Email validation job triggered successfully",
        ...result
      });
    } catch (error: any) {
      console.error('[Manual Trigger] Email validation error:', error);
      res.status(500).json({ message: "Failed to trigger email validation", error: error.message });
    }
  });

  /**
   * Manual AI Enrichment Trigger
   * Enriches contacts/accounts with AI-powered data
   * POST /api/jobs/trigger/ai-enrichment
   */
  app.post("/api/jobs/trigger/ai-enrichment", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { accountIds, contactIds, campaignId } = req.body;

      console.log(`[Manual Trigger] AI enrichment requested by ${req.user.username}`, {
        accountIds: accountIds?.length,
        contactIds: contactIds?.length,
        campaignId
      });

      // Import and run AI enrichment job
      const { processAiEnrichment } = await import('./jobs/ai-enrichment-job');
      const result = await processAiEnrichment({ accountIds, contactIds, campaignId });

      res.json({
        message: "AI enrichment job triggered successfully",
        ...result
      });
    } catch (error: any) {
      console.error('[Manual Trigger] AI enrichment error:', error);
      res.status(500).json({ message: "Failed to trigger AI enrichment", error: error.message });
    }
  });

  /**
   * Manual M365 Email Sync Trigger
   * Syncs emails from Microsoft 365 for specific mailboxes or all active
   * POST /api/jobs/trigger/m365-sync
   */
  app.post("/api/jobs/trigger/m365-sync", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { mailboxIds } = req.body;

      console.log(`[Manual Trigger] M365 email sync requested by ${req.user.username}`, {
        mailboxIds: mailboxIds?.length || 'all active'
      });

      // Import and run M365 sync job
      const { syncM365Emails } = await import('./jobs/m365-sync-job');
      const result = await syncM365Emails({ mailboxIds });

      res.json({
        message: "M365 email sync job triggered successfully",
        ...result
      });
    } catch (error: any) {
      console.error('[Manual Trigger] M365 sync error:', error);
      res.status(500).json({ message: "Failed to trigger M365 sync", error: error.message });
    }
  });

  /**
   * Manual Telnyx Recording Sync Trigger
   * Fetches call recordings from Telnyx for leads missing recordings
   * Searches by dialed number and call timestamps
   * POST /api/jobs/trigger/telnyx-recordings
   */
  app.post("/api/jobs/trigger/telnyx-recordings", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { limit } = req.body;

      console.log(`[Manual Trigger] Telnyx recording sync requested by ${req.user.username}`, {
        limit: limit || 50
      });

      // Import and run Telnyx recording sync
      const { syncMissingLeadRecordings } = await import('./services/telnyx-recordings');
      const result = await syncMissingLeadRecordings(limit || 50);

      res.json({
        message: "Telnyx recording sync job triggered successfully",
        ...result
      });
    } catch (error: any) {
      console.error('[Manual Trigger] Telnyx recording sync error:', error);
      res.status(500).json({ message: "Failed to trigger Telnyx recording sync", error: error.message });
    }
  });

  /**
   * Get Background Jobs Status
   * Returns current status of all background jobs
   * GET /api/jobs/status
   */
  app.get("/api/jobs/status", requireAuth, async (req, res) => {
    try {
      const status = {
        aiQualityJobs: {
          transcription: {
            enabled: process.env.ENABLE_TRANSCRIPTION_JOB !== 'false',
            frequency: 'every 60s',
            type: 'continuous'
          },
          aiAnalysis: {
            enabled: process.env.ENABLE_AI_ANALYSIS_JOB !== 'false',
            frequency: 'every 90s',
            type: 'continuous'
          }
        },
        systemMaintenance: {
          lockSweeper: {
            enabled: process.env.ENABLE_LOCK_SWEEPER !== 'false',
            frequency: 'every 10min',
            type: 'continuous'
          }
        },
        onDemandJobs: {
          emailValidation: {
            autoRun: process.env.ENABLE_EMAIL_VALIDATION === 'true',
            frequency: 'manual trigger (or every 2min if auto-run enabled)',
            triggerEndpoint: 'POST /api/jobs/trigger/email-validation'
          },
          aiEnrichment: {
            autoRun: process.env.ENABLE_AI_ENRICHMENT === 'true',
            frequency: 'manual trigger (or every 15min if auto-run enabled)',
            triggerEndpoint: 'POST /api/jobs/trigger/ai-enrichment'
          },
          m365Sync: {
            autoRun: process.env.ENABLE_M365_SYNC === 'true',
            frequency: 'manual trigger (or every 6hrs if auto-run enabled)',
            triggerEndpoint: 'POST /api/jobs/trigger/m365-sync'
          },
          gmailSync: {
            autoRun: process.env.ENABLE_GMAIL_SYNC === 'true',
            frequency: 'manual trigger (or every 5min if auto-run enabled)',
            triggerEndpoint: 'POST /api/gmail-sync'
          },
          telnyxRecordings: {
            autoRun: false,
            frequency: 'manual trigger only',
            triggerEndpoint: 'POST /api/jobs/trigger/telnyx-recordings',
            description: 'Syncs call recordings from Telnyx by searching dialed numbers'
          }
        }
      };

      res.json(status);
    } catch (error: any) {
      console.error('[Jobs Status] Error fetching status:', error);
      res.status(500).json({ message: "Failed to fetch jobs status" });
    }
  });

  // MIGRATION: Retroactively add past DNC requests to global_dnc table
  app.post("/api/migration/migrate-dnc-contacts", requireAuth, requireRole('admin'), async (req, res) => {
    try {
      console.log('[DNC Migration] Starting migration of past DNC requests...');

      // Get all contacts who requested DNC
      const dncCalls = await db
        .select({
          contactId: calls.contactId,
          createdAt: calls.createdAt,
          agentId: calls.agentId,
        })
        .from(calls)
        .where(eq(calls.disposition, 'dnc-request'))
        .orderBy(calls.createdAt);

      console.log(`[DNC Migration] Found ${dncCalls.length} DNC requests to migrate`);

      let added = 0;
      let skipped = 0;

      for (const call of dncCalls) {
        if (!call.contactId) {
          skipped++;
          continue;
        }

        try {
          // Get contact and account details
          const contact = await storage.getContact(call.contactId);
          let account = null;
          if (contact?.accountId) {
            account = await storage.getAccount(contact.accountId);
          }

          // Add to global DNC
          const { globalDnc } = await import('@shared/schema');
          await db.insert(globalDnc)
            .values({
              contactId: call.contactId,
              phoneE164: contact?.directPhoneE164 || contact?.mobilePhoneE164 || account?.mainPhoneE164 || null,
              reason: 'DNC request from agent',
              source: `Migration - Agent Console - ${call.agentId || 'unknown'}`,
              createdBy: call.agentId || null,
            })
            .onConflictDoNothing();

          added++;
          console.log(`[DNC Migration] ✅ Added contact ${call.contactId} to global DNC`);
        } catch (error: any) {
          if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
            skipped++;
            console.log(`[DNC Migration] ℹ️ Contact ${call.contactId} already in DNC (skipping)`);
          } else {
            console.error(`[DNC Migration] ❌ Error adding contact ${call.contactId}:`, error);
            skipped++;
          }
        }
      }

      console.log(`[DNC Migration] Complete - Added: ${added}, Skipped: ${skipped}`);
      res.json({
        success: true,
        message: `Migration complete`,
        added,
        skipped,
        total: dncCalls.length
      });
    } catch (error: any) {
      console.error('[DNC Migration] Error:', error);
      res.status(500).json({ message: "Migration failed", error: error.message });
    }
  });

  // =============================================================================
  // OTHER ROUTES
  // =============================================================================

  // Note: No catch-all 404 route here - Vite handles frontend routing in dev mode
  // and static serving handles it in production mode

  // Global error handler
  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("Global error handler:", error.stack);

    // Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors,
      });
    }

    // Handle specific errors (e.g., authentication, authorization)
    if (error.message === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (error.message === "Forbidden") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Default to 500 Internal Server Error
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message, // Be careful about exposing sensitive error messages
    });
  });
}
