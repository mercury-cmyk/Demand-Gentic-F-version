/**
 * AI CRM Operator API Routes
 * 
 * Provides an AGENTIC AI interface for CRM operations with autonomous task execution
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type JWTPayload } from "../auth";
import { db } from "../db";
import { accounts, contacts, campaigns, leads, segments } from "@shared/schema";
import { count, eq, ilike, and, or, desc, gte, lte, inArray, asc, type SQL } from "drizzle-orm";
import { buildFilterQuery } from "../filter-builder";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";

const router = Router();

type SortDirection = "asc" | "desc";
type EntityType = "accounts" | "contacts" | "leads" | "campaigns";

const SORT_DIRECTIONS: SortDirection[] = ["asc", "desc"];

const ENTITY_COLUMNS = {
  accounts: {
    id: accounts.id,
    name: accounts.name,
    industry: accounts.industryStandardized,
    industryStandardized: accounts.industryStandardized,
    city: accounts.hqCity,
    state: accounts.hqState,
    createdAt: accounts.createdAt,
    updatedAt: accounts.updatedAt,
  },
  contacts: {
    id: contacts.id,
    firstName: contacts.firstName,
    lastName: contacts.lastName,
    email: contacts.email,
    fullName: contacts.fullName,
    jobTitle: contacts.jobTitle,
    createdAt: contacts.createdAt,
    updatedAt: contacts.updatedAt,
  },
  leads: {
    id: leads.id,
    contactName: leads.contactName,
    contactEmail: leads.contactEmail,
    status: leads.qaStatus,
    campaignId: leads.campaignId,
    createdAt: leads.createdAt,
    updatedAt: leads.updatedAt,
  },
  campaigns: {
    id: campaigns.id,
    name: campaigns.name,
    status: campaigns.status,
    type: campaigns.type,
    ownerId: campaigns.ownerId,
    createdAt: campaigns.createdAt,
    updatedAt: campaigns.updatedAt,
  }
} as const;

const ANALYSIS_GROUP_BY = {
  accounts: ["industryStandardized", "industry", "hqState", "hqCountry", "staffCount", "revenueRange"],
  contacts: ["jobTitle", "department", "seniorityLevel", "city", "state", "country"],
  leads: ["qaStatus", "status", "campaignId", "agentId"],
  campaigns: ["status", "type", "ownerId"]
} as const;

const GROUP_BY_ALIASES: Record<string, Record<string, string>> = {
  accounts: { industry: "industryStandardized" },
  leads: { status: "qaStatus" },
};

const FILTER_GROUP_SCHEMA = z.object({
  logic: z.enum(["AND", "OR"]).default("AND"),
  conditions: z.array(z.object({
    field: z.string().min(1),
    operator: z.string().min(1),
    values: z.array(z.union([z.string(), z.number()])).optional(),
    value: z.union([z.string(), z.number()]).optional(),
  })).min(1),
});

const TOOL_SCHEMAS = {
  count_records: z.object({
    entity: z.enum(["accounts", "contacts", "leads", "campaigns"]),
    filter: z.union([FILTER_GROUP_SCHEMA, z.string()]).optional(),
  }),
  search_records: z.object({
    entity: z.enum(["accounts", "contacts", "leads", "campaigns"]),
    query: z.string().min(1),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
    sortBy: z.string().optional(),
    sortDir: z.enum(SORT_DIRECTIONS).optional(),
    filter: z.union([FILTER_GROUP_SCHEMA, z.string()]).optional(),
  }),
  get_record_by_id: z.object({
    entity: z.enum(["accounts", "contacts", "leads", "campaigns"]),
    id: z.string().min(1),
  }),
  get_campaign_analytics: z.object({
    campaignId: z.string().optional(),
    timeRange: z.enum(["today", "week", "month", "quarter", "all"]).optional(),
  }),
  get_pipeline_summary: z.object({
    includeForecasts: z.boolean().optional(),
  }),
  list_recent_activity: z.object({
    activityType: z.enum(["leads", "campaigns", "contacts", "all"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  create_segment: z.object({
    name: z.string().min(1),
    criteria: z.record(z.any()),
    description: z.string().optional(),
    entityType: z.enum(["contact", "account", "lead"]).optional(),
  }),
  analyze_data: z.object({
    analysisType: z.enum(["distribution", "trend", "comparison", "summary"]),
    entity: z.enum(["accounts", "contacts", "leads", "campaigns"]),
    groupBy: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    filter: z.union([FILTER_GROUP_SCHEMA, z.string()]).optional(),
  }),
  task_complete: z.object({
    summary: z.string().min(1),
  }),
} as const;

type ToolName = keyof typeof TOOL_SCHEMAS;

// Define available tools for the agent
const AVAILABLE_TOOLS = [
  {
    type: "function",
    function: {
      name: "count_records",
      description: "Count records in a CRM entity (accounts, contacts, leads, campaigns)",
      parameters: {
        type: "object",
        properties: {
          entity: {
            type: "string",
            enum: ["accounts", "contacts", "leads", "campaigns"],
            description: "The entity to count"
          },
          filter: {
            anyOf: [
              { type: "string" },
              { type: "object" }
            ],
            description: "Optional filter group (FilterBuilder JSON) or JSON string"
          }
        },
        required: ["entity"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_records",
      description: "Search for records in the CRM by name, email, industry, or other fields",
      parameters: {
        type: "object",
        properties: {
          entity: {
            type: "string",
            enum: ["accounts", "contacts", "leads", "campaigns"],
            description: "The entity to search"
          },
          query: {
            type: "string",
            description: "Search query (name, email, industry, etc.)"
          },
          offset: {
            type: "number",
            description: "Offset for pagination (default 0)"
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default 10)"
          },
          sortBy: {
            type: "string",
            description: "Field to sort by"
          },
          sortDir: {
            type: "string",
            enum: ["asc", "desc"],
            description: "Sort direction (default desc)"
          },
          filter: {
            anyOf: [
              { type: "string" },
              { type: "object" }
            ],
            description: "Optional filter group (FilterBuilder JSON) or JSON string"
          }
        },
        required: ["entity", "query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_record_by_id",
      description: "Fetch a single CRM record by ID",
      parameters: {
        type: "object",
        properties: {
          entity: {
            type: "string",
            enum: ["accounts", "contacts", "leads", "campaigns"],
            description: "The entity to fetch"
          },
          id: {
            type: "string",
            description: "Record ID"
          }
        },
        required: ["entity", "id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_campaign_analytics",
      description: "Get campaign analytics summary (status counts, active campaigns, time range)",
      parameters: {
        type: "object",
        properties: {
          campaignId: {
            type: "string",
            description: "Specific campaign ID (optional, shows all if omitted)"
          },
          timeRange: {
            type: "string",
            enum: ["today", "week", "month", "quarter", "all"],
            description: "Time range for analytics"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "get_pipeline_summary",
      description: "Get sales pipeline summary with lead stages, conversion rates, and forecasts",
      parameters: {
        type: "object",
        properties: {
          includeForecasts: {
            type: "boolean",
            description: "Include pipeline forecasts"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_recent_activity",
      description: "List recent CRM activity (new leads, campaign updates, etc.)",
      parameters: {
        type: "object",
        properties: {
          activityType: {
            type: "string",
            enum: ["leads", "campaigns", "contacts", "all"],
            description: "Type of activity to list"
          },
          limit: {
            type: "number",
            description: "Maximum results (default 10)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_segment",
      description: "Create a new contact segment based on criteria",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Segment name"
          },
          criteria: {
            type: "object",
            description: "Filter criteria for the segment"
          },
          description: {
            type: "string",
            description: "Optional segment description"
          },
          entityType: {
            type: "string",
            enum: ["contact", "account", "lead"],
            description: "Entity type for the segment (default contact)"
          }
        },
        required: ["name", "criteria"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_data",
      description: "Perform data analysis on CRM data with custom queries",
      parameters: {
        type: "object",
        properties: {
          analysisType: {
            type: "string",
            enum: ["distribution", "trend", "comparison", "summary"],
            description: "Type of analysis"
          },
          entity: {
            type: "string",
            description: "Entity to analyze"
          },
          groupBy: {
            type: "string",
            description: "Field to group by"
          },
          limit: {
            type: "number",
            description: "Maximum groups to return (default 10)"
          },
          filter: {
            anyOf: [
              { type: "string" },
              { type: "object" }
            ],
            description: "Optional filter group (FilterBuilder JSON) or JSON string"
          }
        },
        required: ["analysisType", "entity"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "task_complete",
      description: "Signal that the current task is complete and no more actions are needed",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Summary of what was accomplished"
          }
        },
        required: ["summary"]
      }
    }
  }
];

// System prompt for the AGENTIC CRM Operator
const BASE_PROMPT = `You are an AUTONOMOUS Agentic CRM Operator for Pivotal Marketing Platform. You work continuously to complete user tasks.

## YOUR CAPABILITIES
You have access to tools that let you query and analyze CRM data:
- count_records: Count entities (accounts, contacts, leads, campaigns)
- search_records: Search for specific records
- get_record_by_id: Fetch a record by ID
- get_campaign_analytics: Get campaign performance metrics
- get_pipeline_summary: Get sales pipeline overview
- list_recent_activity: See recent CRM activity
- create_segment: Create contact segments
- analyze_data: Perform custom data analysis
- task_complete: Signal when you've finished the task

## AGENTIC BEHAVIOR RULES
1. **Use tools when data is required** - never guess or make up numbers
2. **Chain multiple tools** when needed to complete complex tasks
3. **Think step by step** - break down complex requests into smaller actions
4. **Continue working** until the task is fully complete
5. When you have gathered all needed information and answered the user's question, call task_complete

## RESPONSE FORMAT
When presenting results, use this structure:
- Summary
- Findings (data-backed)
- Recommendations (actionable)
- Sources (tools and entities used)

## EXAMPLE WORKFLOWS
User: "Give me a full CRM overview"
→ Call count_records for accounts
→ Call count_records for contacts  
→ Call count_records for leads
→ Call get_campaign_analytics
→ Call get_pipeline_summary
→ Synthesize all data into comprehensive report
→ Call task_complete

User: "Find accounts in healthcare and analyze them"
→ Call search_records for healthcare accounts
→ Call analyze_data to understand distribution
→ Provide insights
→ Call task_complete

## IMPORTANT
- You MUST call tools to get real data - the tools return live CRM data
- After each tool call, analyze the results and decide what to do next
- Keep working until task_complete is called
- Be proactive - if user asks for analysis, gather relevant data automatically`;

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

type ToolExecutionContext = {
  user?: JWTPayload;
  isAdmin: boolean;
  allowedCampaignIds?: string[];
};

function sanitizeForLog(input: any): any {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map(item => sanitizeForLog(item));
  if (typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => {
        if (typeof value === "string") {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes("email")) return [key, "[redacted-email]"];
          if (lowerKey.includes("phone")) return [key, "[redacted-phone]"];
          if (lowerKey.includes("token")) return [key, "[redacted-token]"];
        }
        return [key, sanitizeForLog(value)];
      })
    );
  }
  return input;
}

function parseFilterGroup(raw: unknown) {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return FILTER_GROUP_SCHEMA.parse(parsed);
    } catch (error) {
      return { error: "Invalid filter JSON" };
    }
  }
  const parsed = FILTER_GROUP_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    return { error: "Invalid filter object" };
  }
  return parsed.data;
}

function getTimeRangeBounds(timeRange?: string) {
  if (!timeRange || timeRange === "all") return undefined;
  const now = new Date();
  let start: Date;

  switch (timeRange) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week": {
      const day = now.getDay();
      const diff = (day + 6) % 7;
      start = new Date(now);
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "quarter": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), quarterStartMonth, 1);
      break;
    }
    default:
      return undefined;
  }

  return { start, end: now };
}

function buildOrderBy(entity: EntityType, sortBy?: string, sortDir?: SortDirection) {
  const columns = ENTITY_COLUMNS[entity];
  const column = sortBy && (columns as any)[sortBy];
  if (!column) {
    return desc(columns.createdAt);
  }
  return sortDir === "asc" ? asc(column) : desc(column);
}

function resolveGroupBy(entity: EntityType, groupBy: string) {
  const alias = GROUP_BY_ALIASES[entity]?.[groupBy];
  return alias || groupBy;
}

function normalizeToolArgs<T extends ToolName>(toolName: T, rawArgs: any) {
  const schema = TOOL_SCHEMAS[toolName];
  if (!schema) {
    return { error: "unknown_tool", details: `No schema for tool ${toolName}` };
  }
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    return { error: "invalid_args", details: parsed.error.flatten() };
  }
  return parsed.data;
}

function buildScopedCampaignFilter(context: ToolExecutionContext) {
  if (context.isAdmin || !context.allowedCampaignIds || context.allowedCampaignIds.length === 0) {
    return undefined;
  }
  return inArray(campaigns.id, context.allowedCampaignIds);
}

function isAllowedCampaign(context: ToolExecutionContext, campaignId?: string) {
  if (!campaignId) return true;
  if (context.isAdmin) return true;
  return context.allowedCampaignIds?.includes(campaignId) ?? false;
}

function combineFilters(...filters: Array<SQL | undefined>) {
  const defined = filters.filter(Boolean) as SQL[];
  return defined.length ? and(...defined) : undefined;
}

// Execute tool calls
async function executeTool(toolName: string, args: any, context: ToolExecutionContext): Promise<any> {
  console.log(`[AI-Operator] Executing tool: ${toolName}`, sanitizeForLog(args));
  
  try {
    const normalized = normalizeToolArgs(toolName as ToolName, args);
    if ((normalized as any).error) {
      return normalized;
    }

    switch (toolName) {
      case 'count_records': {
        const parsedArgs = normalized as z.infer<typeof TOOL_SCHEMAS.count_records>;
        const filterGroup = parseFilterGroup(parsedArgs.filter);
        if (filterGroup && (filterGroup as any).error) {
          return { error: "invalid_filter", details: (filterGroup as any).error };
        }

        let result;
        switch (parsedArgs.entity) {
          case 'accounts':
            const accountFilter = filterGroup ? buildFilterQuery(filterGroup, accounts) : undefined;
            const [accCount] = await db.select({ count: count() })
              .from(accounts)
              .where(accountFilter);
            result = { entity: 'accounts', count: Number(accCount?.count || 0) };
            break;
          case 'contacts':
            const contactFilter = filterGroup ? buildFilterQuery(filterGroup, contacts) : undefined;
            const [conCount] = await db.select({ count: count() })
              .from(contacts)
              .where(contactFilter);
            result = { entity: 'contacts', count: Number(conCount?.count || 0) };
            break;
          case 'leads':
            const leadFilter = filterGroup ? buildFilterQuery(filterGroup, leads) : undefined;
            const scopedLeadFilter = context.isAdmin || !context.allowedCampaignIds
              ? leadFilter
              : combineFilters(leadFilter, inArray(leads.campaignId, context.allowedCampaignIds));
            const [leadCount] = await db.select({ count: count() })
              .from(leads)
              .where(scopedLeadFilter);
            result = { entity: 'leads', count: Number(leadCount?.count || 0) };
            break;
          case 'campaigns':
            const campaignFilter = filterGroup ? buildFilterQuery(filterGroup, campaigns) : undefined;
            const scopedCampaignFilter = context.isAdmin
              ? campaignFilter
              : combineFilters(campaignFilter, eq(campaigns.ownerId, context.user?.userId || ''));
            const [campCount] = await db.select({ count: count() })
              .from(campaigns)
              .where(scopedCampaignFilter);
            result = { entity: 'campaigns', count: Number(campCount?.count || 0) };
            break;
          default:
            result = { error: 'Unknown entity' };
        }
        return result;
      }

      case 'search_records': {
        const parsedArgs = normalized as z.infer<typeof TOOL_SCHEMAS.search_records>;
        const limit = parsedArgs.limit || 10;
        const offset = parsedArgs.offset || 0;
        const orderBy = buildOrderBy(parsedArgs.entity, parsedArgs.sortBy, parsedArgs.sortDir);
        const filterGroup = parseFilterGroup(parsedArgs.filter);
        if (filterGroup && (filterGroup as any).error) {
          return { error: "invalid_filter", details: (filterGroup as any).error };
        }

        switch (parsedArgs.entity) {
          case 'accounts': {
            const accountFilter = filterGroup ? buildFilterQuery(filterGroup, accounts) : undefined;
            const searchFilter = or(
              ilike(accounts.name, `%${parsedArgs.query}%`),
              ilike(accounts.industryStandardized, `%${parsedArgs.query}%`),
              ilike(accounts.hqCity, `%${parsedArgs.query}%`)
            );
            const accs = await db.select({
              id: accounts.id,
              name: accounts.name,
              industry: accounts.industryStandardized,
              city: accounts.hqCity,
              state: accounts.hqState,
            })
            .from(accounts)
            .where(combineFilters(searchFilter, accountFilter))
            .orderBy(orderBy)
            .limit(limit)
            .offset(offset);
            return { entity: 'accounts', results: accs, count: accs.length };
          }
          case 'contacts': {
            const contactFilter = filterGroup ? buildFilterQuery(filterGroup, contacts) : undefined;
            const searchFilter = or(
              ilike(contacts.firstName, `%${parsedArgs.query}%`),
              ilike(contacts.lastName, `%${parsedArgs.query}%`),
              ilike(contacts.email, `%${parsedArgs.query}%`),
              ilike(contacts.fullName, `%${parsedArgs.query}%`)
            );
            const cons = await db.select({
              id: contacts.id,
              firstName: contacts.firstName,
              lastName: contacts.lastName,
              email: contacts.email,
              fullName: contacts.fullName,
              jobTitle: contacts.jobTitle,
            })
            .from(contacts)
            .where(combineFilters(searchFilter, contactFilter))
            .orderBy(orderBy)
            .limit(limit)
            .offset(offset);
            return { entity: 'contacts', results: cons, count: cons.length };
          }
          case 'leads': {
            const leadFilter = filterGroup ? buildFilterQuery(filterGroup, leads) : undefined;
            const scopedLeadFilter = context.isAdmin || !context.allowedCampaignIds
              ? leadFilter
              : combineFilters(leadFilter, inArray(leads.campaignId, context.allowedCampaignIds));
            const searchFilter = or(
              ilike(leads.contactName, `%${parsedArgs.query}%`),
              ilike(leads.contactEmail, `%${parsedArgs.query}%`)
            );
            const lds = await db.select({
              id: leads.id,
              contactName: leads.contactName,
              contactEmail: leads.contactEmail,
              status: leads.qaStatus,
            })
            .from(leads)
            .where(combineFilters(searchFilter, scopedLeadFilter))
            .orderBy(orderBy)
            .limit(limit)
            .offset(offset);
            return { entity: 'leads', results: lds, count: lds.length };
          }
          case 'campaigns': {
            const campaignFilter = filterGroup ? buildFilterQuery(filterGroup, campaigns) : undefined;
            const scopedCampaignFilter = context.isAdmin
              ? campaignFilter
              : combineFilters(campaignFilter, eq(campaigns.ownerId, context.user?.userId || ''));
            const searchFilter = ilike(campaigns.name, `%${parsedArgs.query}%`);
            const camps = await db.select({
              id: campaigns.id,
              name: campaigns.name,
              status: campaigns.status,
              type: campaigns.type,
            })
            .from(campaigns)
            .where(combineFilters(searchFilter, scopedCampaignFilter))
            .orderBy(orderBy)
            .limit(limit)
            .offset(offset);
            return { entity: 'campaigns', results: camps, count: camps.length };
          }
          default:
            return { error: 'Unknown entity' };
        }
      }

      case 'get_record_by_id': {
        const parsedArgs = normalized as z.infer<typeof TOOL_SCHEMAS.get_record_by_id>;
        if (parsedArgs.entity === 'campaigns' && !isAllowedCampaign(context, parsedArgs.id)) {
          return { error: "forbidden", message: "Campaign access denied" };
        }

        switch (parsedArgs.entity) {
          case 'accounts': {
            const [record] = await db.select({
              id: accounts.id,
              name: accounts.name,
              industry: accounts.industryStandardized,
              domain: accounts.domain,
              hqCity: accounts.hqCity,
              hqState: accounts.hqState,
            })
            .from(accounts)
            .where(eq(accounts.id, parsedArgs.id));
            return { entity: 'accounts', record: record || null };
          }
          case 'contacts': {
            const [record] = await db.select({
              id: contacts.id,
              firstName: contacts.firstName,
              lastName: contacts.lastName,
              email: contacts.email,
              fullName: contacts.fullName,
              jobTitle: contacts.jobTitle,
            })
            .from(contacts)
            .where(eq(contacts.id, parsedArgs.id));
            return { entity: 'contacts', record: record || null };
          }
          case 'leads': {
            const leadScope = context.isAdmin || !context.allowedCampaignIds
              ? eq(leads.id, parsedArgs.id)
              : and(eq(leads.id, parsedArgs.id), inArray(leads.campaignId, context.allowedCampaignIds));
            const [record] = await db.select({
              id: leads.id,
              contactName: leads.contactName,
              contactEmail: leads.contactEmail,
              status: leads.qaStatus,
              campaignId: leads.campaignId,
              createdAt: leads.createdAt,
            })
            .from(leads)
            .where(leadScope);
            return { entity: 'leads', record: record || null };
          }
          case 'campaigns': {
            const [record] = await db.select({
              id: campaigns.id,
              name: campaigns.name,
              status: campaigns.status,
              type: campaigns.type,
              ownerId: campaigns.ownerId,
              createdAt: campaigns.createdAt,
            })
            .from(campaigns)
            .where(eq(campaigns.id, parsedArgs.id));
            return { entity: 'campaigns', record: record || null };
          }
          default:
            return { error: 'Unknown entity' };
        }
      }

      case 'get_campaign_analytics': {
        const parsedArgs = normalized as z.infer<typeof TOOL_SCHEMAS.get_campaign_analytics>;
        if (parsedArgs.campaignId && !isAllowedCampaign(context, parsedArgs.campaignId)) {
          return { error: "forbidden", message: "Campaign access denied" };
        }

        const bounds = getTimeRangeBounds(parsedArgs.timeRange);
        const scopeFilter = buildScopedCampaignFilter(context);
        const timeFilter = bounds ? and(
          gte(campaigns.createdAt, bounds.start),
          lte(campaigns.createdAt, bounds.end)
        ) : undefined;
        const campaignFilter = parsedArgs.campaignId ? eq(campaigns.id, parsedArgs.campaignId) : undefined;
        const whereClause = combineFilters(scopeFilter, timeFilter, campaignFilter);

        const campaignStats = await db.select({
          status: campaigns.status,
          count: count(),
        })
        .from(campaigns)
        .where(whereClause)
        .groupBy(campaigns.status);
        
        const activeCamps = await db.select({
          id: campaigns.id,
          name: campaigns.name,
          status: campaigns.status,
          type: campaigns.type,
          createdAt: campaigns.createdAt,
        })
        .from(campaigns)
        .where(combineFilters(eq(campaigns.status, 'active'), whereClause))
        .limit(5);
        
        return {
          summary: campaignStats,
          activeCampaigns: activeCamps,
          totalCampaigns: campaignStats.reduce((sum, s) => sum + Number(s.count), 0)
        };
      }

      case 'get_pipeline_summary': {
        const parsedArgs = normalized as z.infer<typeof TOOL_SCHEMAS.get_pipeline_summary>;
        const leadScope = context.isAdmin || !context.allowedCampaignIds
          ? undefined
          : inArray(leads.campaignId, context.allowedCampaignIds);

        const leadsByStatus = await db.select({
          status: leads.qaStatus,
          count: count(),
        })
        .from(leads)
        .where(leadScope)
        .groupBy(leads.qaStatus);
        
        const [totalLeads] = await db.select({ count: count() }).from(leads).where(leadScope);
        const [approvedLeads] = await db.select({ count: count() })
          .from(leads)
          .where(combineFilters(eq(leads.qaStatus, 'approved'), leadScope));
        
        return {
          leadsByStatus,
          totalLeads: Number(totalLeads?.count || 0),
          approvedLeads: Number(approvedLeads?.count || 0),
          conversionRate: totalLeads?.count ? ((Number(approvedLeads?.count || 0) / Number(totalLeads.count)) * 100).toFixed(1) + '%' : '0%',
          forecasts: parsedArgs.includeForecasts ? { message: "Forecasts not available in current dataset." } : undefined
        };
      }

      case 'list_recent_activity': {
        const parsedArgs = normalized as z.infer<typeof TOOL_SCHEMAS.list_recent_activity>;
        const activityType = parsedArgs.activityType || 'all';
        const limit = parsedArgs.limit || 10;
        const results: any = {};
        const campaignScope = buildScopedCampaignFilter(context);
        const leadScope = context.isAdmin || !context.allowedCampaignIds
          ? undefined
          : inArray(leads.campaignId, context.allowedCampaignIds);
        
        if (activityType === 'all' || activityType === 'leads') {
          results.recentLeads = await db.select({
            id: leads.id,
            contactName: leads.contactName,
            status: leads.qaStatus,
            createdAt: leads.createdAt,
          })
          .from(leads)
          .where(leadScope)
          .orderBy(desc(leads.createdAt))
          .limit(limit);
        }
        
        if (activityType === 'all' || activityType === 'campaigns') {
          results.recentCampaigns = await db.select({
            id: campaigns.id,
            name: campaigns.name,
            status: campaigns.status,
            createdAt: campaigns.createdAt,
          })
          .from(campaigns)
          .where(campaignScope)
          .orderBy(desc(campaigns.createdAt))
          .limit(limit);
        }

        if (activityType === 'all' || activityType === 'contacts') {
          results.recentContacts = await db.select({
            id: contacts.id,
            fullName: contacts.fullName,
            email: contacts.email,
            createdAt: contacts.createdAt,
          })
          .from(contacts)
          .orderBy(desc(contacts.createdAt))
          .limit(limit);
        }
        
        return results;
      }

      case 'analyze_data': {
        const parsedArgs = normalized as z.infer<typeof TOOL_SCHEMAS.analyze_data>;
        const { analysisType, entity, groupBy } = parsedArgs;
        const limit = parsedArgs.limit || 10;
        const filterGroup = parseFilterGroup(parsedArgs.filter);
        if (filterGroup && (filterGroup as any).error) {
          return { error: "invalid_filter", details: (filterGroup as any).error };
        }

        const allowedGroupBy = (ANALYSIS_GROUP_BY as any)[entity] as string[] | undefined;
        if (!groupBy || !allowedGroupBy?.includes(groupBy)) {
          return { error: "invalid_group_by", message: "Unsupported groupBy for entity", allowedGroupBy };
        }

        const resolvedGroupBy = resolveGroupBy(entity, groupBy);
        let data: any[] = [];
        if (entity === 'accounts') {
          const filter = filterGroup ? buildFilterQuery(filterGroup, accounts) : undefined;
          const column = (accounts as any)[resolvedGroupBy];
          data = await db.select({
            group: column,
            count: count(),
          })
          .from(accounts)
          .where(filter)
          .groupBy(column)
          .orderBy(desc(count()))
          .limit(limit);
        } else if (entity === 'contacts') {
          const filter = filterGroup ? buildFilterQuery(filterGroup, contacts) : undefined;
          const column = (contacts as any)[resolvedGroupBy];
          data = await db.select({
            group: column,
            count: count(),
          })
          .from(contacts)
          .where(filter)
          .groupBy(column)
          .orderBy(desc(count()))
          .limit(limit);
        } else if (entity === 'leads') {
          const filter = filterGroup ? buildFilterQuery(filterGroup, leads) : undefined;
          const scopedFilter = context.isAdmin || !context.allowedCampaignIds
            ? filter
            : combineFilters(filter, inArray(leads.campaignId, context.allowedCampaignIds));
          const column = (leads as any)[resolvedGroupBy];
          data = await db.select({
            group: column,
            count: count(),
          })
          .from(leads)
          .where(scopedFilter)
          .groupBy(column)
          .orderBy(desc(count()))
          .limit(limit);
        } else if (entity === 'campaigns') {
          const filter = filterGroup ? buildFilterQuery(filterGroup, campaigns) : undefined;
          const scopedFilter = context.isAdmin
            ? filter
            : combineFilters(filter, eq(campaigns.ownerId, context.user?.userId || ''));
          const column = (campaigns as any)[resolvedGroupBy];
          data = await db.select({
            group: column,
            count: count(),
          })
          .from(campaigns)
          .where(scopedFilter)
          .groupBy(column)
          .orderBy(desc(count()))
          .limit(limit);
        }

        return { analysisType, entity, groupBy, data };
      }

      case 'create_segment': {
        const parsedArgs = normalized as z.infer<typeof TOOL_SCHEMAS.create_segment>;
        const [segment] = await db.insert(segments)
          .values({
            name: parsedArgs.name,
            description: parsedArgs.description,
            entityType: parsedArgs.entityType || 'contact',
            definitionJson: parsedArgs.criteria,
            ownerId: context.user?.userId,
          })
          .returning({ id: segments.id, name: segments.name });

        return {
          success: true,
          message: `Segment "${parsedArgs.name}" created.`,
          segmentId: segment?.id || null
        };
      }

      case 'task_complete': {
        const parsedArgs = normalized as z.infer<typeof TOOL_SCHEMAS.task_complete>;
        return { 
          completed: true, 
          summary: parsedArgs.summary 
        };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`[AI-Operator] Tool error (${toolName}):`, error);
    return { error: error.message };
  }
}

/**
 * POST /api/ai-operator/chat
 * Main agentic chat endpoint - runs in a loop until task_complete
 */
router.post("/chat", requireAuth, requireRole('admin', 'campaign_manager'), async (req: Request, res: Response) => {
  try {
    const { messages, includeContext = true } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array required" });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return res.status(400).json({ error: "Last message must be from user" });
    }

    // Check for OpenAI API key
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.json({
        message: {
          role: "assistant",
          content: "I'm the Agentic CRM Operator, but I need an OpenAI API key to function. Please set `AI_INTEGRATIONS_OPENAI_API_KEY` or `OPENAI_API_KEY` in your environment.",
        },
        isComplete: true,
        toolsExecuted: [],
      });
    }

    // Initialize OpenAI
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    const model = process.env.AI_OPERATOR_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const userRoles = req.user?.roles || (req.user?.role ? [req.user.role] : []);
    const isAdmin = userRoles.includes('admin');
    const allowedCampaignIds = isAdmin || !req.user?.userId
      ? undefined
      : (await db.select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.ownerId, req.user.userId)))
        .map(row => row.id);

    let basePrompt = BASE_PROMPT;
    if (includeContext) {
      const scopedLeadFilter = isAdmin || !allowedCampaignIds
        ? undefined
        : inArray(leads.campaignId, allowedCampaignIds);
      const scopedCampaignFilter = isAdmin || !req.user?.userId
        ? undefined
        : eq(campaigns.ownerId, req.user.userId);
      const [accountCount] = await db.select({ count: count() }).from(accounts);
      const [contactCount] = await db.select({ count: count() }).from(contacts);
      const [leadCount] = await db.select({ count: count() }).from(leads).where(scopedLeadFilter);
      const [campaignCount] = await db.select({ count: count() }).from(campaigns).where(scopedCampaignFilter);

      basePrompt += `\n\n## CRM Context\n` +
        `Accounts: ${Number(accountCount?.count || 0)}\n` +
        `Contacts: ${Number(contactCount?.count || 0)}\n` +
        `Leads: ${Number(leadCount?.count || 0)}\n` +
        `Campaigns: ${Number(campaignCount?.count || 0)}`;
    }

    const systemPrompt = await buildAgentSystemPrompt(basePrompt);

    // Build initial messages
    const openaiMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-10).map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const toolContext: ToolExecutionContext = {
      user: req.user,
      isAdmin,
      allowedCampaignIds,
    };

    let isComplete = false;
    let iterations = 0;
    const maxIterations = 10; // Safety limit
    const toolsExecuted: any[] = [];
    let finalResponse = '';

    // AGENTIC LOOP - Keep going until task_complete or max iterations
    while (!isComplete && iterations < maxIterations) {
      iterations++;
      console.log(`[AI-Operator] Iteration ${iterations}`);

      const completion = await openai.chat.completions.create({
        model,
        messages: openaiMessages as any,
        tools: AVAILABLE_TOOLS as any,
        tool_choice: iterations === 1 ? "auto" : "auto",
        max_tokens: 1500,
        temperature: 0.7,
      });

      const choice = completion.choices[0];
      const assistantMessage = choice.message;

      // Add assistant message to history
      openaiMessages.push({
        role: "assistant",
        content: assistantMessage.content || '',
        tool_calls: assistantMessage.tool_calls,
      });

      // Check if we have tool calls to execute
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          const tc = toolCall as any;
          const toolName = tc.function.name;
          const toolArgs = JSON.parse(tc.function.arguments);
          
          // Check for task_complete
          if (toolName === 'task_complete') {
            const normalizedArgs = normalizeToolArgs('task_complete', toolArgs);
            if ((normalizedArgs as any).error) {
              const errorResult = normalizedArgs;
              toolsExecuted.push({ tool: toolName, args: toolArgs, result: errorResult });
              openaiMessages.push({
                role: "tool",
                content: JSON.stringify(errorResult),
                tool_call_id: toolCall.id,
              });
              continue;
            }

            isComplete = true;
            finalResponse = assistantMessage.content || normalizedArgs.summary || 'Task completed.';
            toolsExecuted.push({ tool: toolName, args: toolArgs, result: { completed: true } });
            break;
          }
          
          // Execute the tool
          const toolResult = await executeTool(toolName, toolArgs, toolContext);
          toolsExecuted.push({ tool: toolName, args: toolArgs, result: toolResult });
          
          // Add tool result to messages
          openaiMessages.push({
            role: "tool",
            content: JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
          });
        }
      } else {
        // No tool calls - agent has finished reasoning
        finalResponse = assistantMessage.content || '';
        
        // If no tool calls and no explicit task_complete, we might be done
        if (choice.finish_reason === 'stop') {
          isComplete = true;
        }
      }
    }

    // If we hit max iterations, note it
    if (iterations >= maxIterations && !isComplete) {
      finalResponse += '\n\n⚠️ Reached maximum iterations. Task may be incomplete.';
    }

    res.json({
      message: {
        role: "assistant",
        content: finalResponse,
      },
      isComplete,
      iterations,
      toolsExecuted,
      model,
    });

  } catch (error: any) {
    console.error('[AI-Operator] Chat error:', error);
    res.status(500).json({ 
      error: "Failed to process chat request",
      details: error.message 
    });
  }
});

/**
 * GET /api/ai-operator/context
 * Get current CRM context/stats
 */
router.get("/context", requireAuth, async (req: Request, res: Response) => {
  try {
    const userRoles = req.user?.roles || (req.user?.role ? [req.user.role] : []);
    const isAdmin = userRoles.includes('admin');
    const allowedCampaignIds = isAdmin || !req.user?.userId
      ? undefined
      : (await db.select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.ownerId, req.user.userId)))
        .map(row => row.id);

    const scopedLeadFilter = isAdmin || !allowedCampaignIds
      ? undefined
      : inArray(leads.campaignId, allowedCampaignIds);
    const scopedCampaignFilter = isAdmin || !req.user?.userId
      ? undefined
      : eq(campaigns.ownerId, req.user.userId);

    const [accountCount] = await db.select({ count: count() }).from(accounts);
    const [contactCount] = await db.select({ count: count() }).from(contacts);
    const [leadCount] = await db.select({ count: count() }).from(leads).where(scopedLeadFilter);
    const [campaignCount] = await db.select({ count: count() }).from(campaigns).where(scopedCampaignFilter);
    
    res.json({
      totalAccounts: Number(accountCount?.count || 0),
      totalContacts: Number(contactCount?.count || 0),
      totalLeads: Number(leadCount?.count || 0),
      totalCampaigns: Number(campaignCount?.count || 0),
    });
  } catch (error: any) {
    console.error('[AI-Operator] Context error:', error);
    res.status(500).json({ error: "Failed to fetch CRM context" });
  }
});

/**
 * GET /api/ai-operator/tools
 * List available tools
 */
router.get("/tools", requireAuth, async (req: Request, res: Response) => {
  res.json({
    tools: AVAILABLE_TOOLS.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
  });
});

export default router;
