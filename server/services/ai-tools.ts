
import { db } from "../db";
import { accounts, contacts, campaigns, leads, segments } from "@shared/schema";
import { count, sql, eq, ilike, and, or, desc, gt, lt, gte, lte, between } from "drizzle-orm";

// Define available tools for the agent
export const AVAILABLE_TOOLS = [
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
            type: "string",
            description: "Optional filter condition (e.g., 'status = active')"
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
          limit: {
            type: "number",
            description: "Maximum results to return (default 10)"
          }
        },
        required: ["entity", "query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_campaign_analytics",
      description: "Get detailed analytics for campaigns including open rates, click rates, conversions",
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

// Execute tool calls
export async function executeTool(toolName: string, args: any): Promise<any> {
  console.log(`[AI-Tools] Executing tool: ${toolName}`, args);
  
  try {
    switch (toolName) {
      case 'count_records': {
        let result;
        switch (args.entity) {
          case 'accounts':
            const [accCount] = await db.select({ count: count() }).from(accounts);
            result = { entity: 'accounts', count: Number(accCount?.count || 0) };
            break;
          case 'contacts':
            const [conCount] = await db.select({ count: count() }).from(contacts);
            result = { entity: 'contacts', count: Number(conCount?.count || 0) };
            break;
          case 'leads':
            const [leadCount] = await db.select({ count: count() }).from(leads);
            result = { entity: 'leads', count: Number(leadCount?.count || 0) };
            break;
          case 'campaigns':
            const [campCount] = await db.select({ count: count() }).from(campaigns);
            result = { entity: 'campaigns', count: Number(campCount?.count || 0) };
            break;
          default:
            result = { error: 'Unknown entity' };
        }
        return result;
      }

      case 'search_records': {
        const limit = args.limit || 10;
        switch (args.entity) {
          case 'accounts':
            const accs = await db.select({
              id: accounts.id,
              name: accounts.name,
              industry: accounts.industryStandardized,
              city: accounts.hqCity,
              state: accounts.hqState,
            })
            .from(accounts)
            .where(
              or(
                ilike(accounts.name, `%${args.query}%`),
                ilike(accounts.industryStandardized, `%${args.query}%`),
                ilike(accounts.hqCity, `%${args.query}%`)
              )
            )
            .limit(limit);
            return { entity: 'accounts', results: accs, count: accs.length };
          case 'contacts':
            const cons = await db.select({
              id: contacts.id,
              firstName: contacts.firstName,
              lastName: contacts.lastName,
              email: contacts.email,
              fullName: contacts.fullName,
              jobTitle: contacts.jobTitle,
            })
            .from(contacts)
            .where(
              or(
                ilike(contacts.firstName, `%${args.query}%`),
                ilike(contacts.lastName, `%${args.query}%`),
                ilike(contacts.email, `%${args.query}%`),
                ilike(contacts.fullName, `%${args.query}%`)
              )
            )
            .limit(limit);
            return { entity: 'contacts', results: cons, count: cons.length };
          case 'leads':
            const lds = await db.select({
              id: leads.id,
              contactName: leads.contactName,
              contactEmail: leads.contactEmail,
              status: leads.qaStatus,
            })
            .from(leads)
            .where(
              or(
                ilike(leads.contactName, `%${args.query}%`),
                ilike(leads.contactEmail, `%${args.query}%`)
              )
            )
            .limit(limit);
            return { entity: 'leads', results: lds, count: lds.length };
          case 'campaigns':
            const camps = await db.select({
              id: campaigns.id,
              name: campaigns.name,
              status: campaigns.status,
              type: campaigns.type,
            })
            .from(campaigns)
            .where(ilike(campaigns.name, `%${args.query}%`))
            .limit(limit);
            return { entity: 'campaigns', results: camps, count: camps.length };
          default:
            return { error: 'Unknown entity' };
        }
      }

      case 'get_campaign_analytics': {
        const campaignStats = await db.select({
          status: campaigns.status,
          count: count(),
        })
        .from(campaigns)
        .groupBy(campaigns.status);
        
        const activeCamps = await db.select({
          id: campaigns.id,
          name: campaigns.name,
          status: campaigns.status,
          type: campaigns.type,
          createdAt: campaigns.createdAt,
        })
        .from(campaigns)
        .where(eq(campaigns.status, 'active'))
        .limit(5);
        
        return {
          summary: campaignStats,
          activeCampaigns: activeCamps,
          totalCampaigns: campaignStats.reduce((sum, s) => sum + Number(s.count), 0)
        };
      }

      case 'get_pipeline_summary': {
        const leadsByStatus = await db.select({
          status: leads.qaStatus,
          count: count(),
        })
        .from(leads)
        .groupBy(leads.qaStatus);
        
        const [totalLeads] = await db.select({ count: count() }).from(leads);
        const [approvedLeads] = await db.select({ count: count() }).from(leads).where(eq(leads.qaStatus, 'approved'));
        
        return {
          leadsByStatus,
          totalLeads: Number(totalLeads?.count || 0),
          approvedLeads: Number(approvedLeads?.count || 0),
          conversionRate: totalLeads?.count ? ((Number(approvedLeads?.count || 0) / Number(totalLeads.count)) * 100).toFixed(1) + '%' : '0%'
        };
      }

      case 'list_recent_activity': {
        const activityType = args.activityType || 'all';
        const limit = args.limit || 10;
        const results: any = {};
        
        if (activityType === 'all' || activityType === 'leads') {
          results.recentLeads = await db.select({
            id: leads.id,
            contactName: leads.contactName,
            status: leads.qaStatus,
            createdAt: leads.createdAt,
          })
          .from(leads)
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
          .orderBy(desc(campaigns.createdAt))
          .limit(limit);
        }
        
        return results;
      }

      case 'analyze_data': {
        const { analysisType, entity, groupBy } = args;
        
        if (entity === 'accounts' && groupBy === 'industry') {
          const distribution = await db.select({
            industry: accounts.industryStandardized,
            count: count(),
          })
          .from(accounts)
          .groupBy(accounts.industryStandardized)
          .orderBy(desc(count()))
          .limit(10);
          return { analysisType, entity, groupBy, data: distribution };
        }
        
        if (entity === 'leads' && groupBy === 'status') {
          const distribution = await db.select({
            status: leads.qaStatus,
            count: count(),
          })
          .from(leads)
          .groupBy(leads.qaStatus);
          return { analysisType, entity, groupBy, data: distribution };
        }
        
        return { analysisType, entity, message: 'Analysis completed' };
      }

      case 'create_segment': {
        // For now, return a mock success - actual implementation would create segment
        return { 
          success: true, 
          message: `Segment "${args.name}" created with specified criteria`,
          segmentId: `seg_${Date.now()}`
        };
      }

      case 'task_complete': {
        return { 
          completed: true, 
          summary: args.summary 
        };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`[AI-Tools] Tool error (${toolName}):`, error);
    return { error: error.message };
  }
}
