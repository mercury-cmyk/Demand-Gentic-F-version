/**
 * Seed Super Organization Services Catalog & Problem Framework
 * 
 * Populates the service catalog and problem framework for Pivotal B2B (super organization)
 * Based on the programs/services we offer and the problems they solve
 */

import { getSuperOrganization } from "../server/services/super-organization-service";
import { createService } from "../server/services/problem-intelligence/service-catalog-service";
import { createProblemDefinition } from "../server/services/problem-intelligence";
import { randomUUID } from 'crypto';

async function main() {
  console.log("🎯 Seeding Super Organization Services Catalog & Problem Framework...\n");

  // Get super organization
  const superOrg = await getSuperOrganization();
  if (!superOrg) {
    throw new Error("Super Organization not found. Please run seed-super-org first.");
  }

  console.log(`✓ Found Super Organization: ${superOrg.name} (${superOrg.id})\n`);

  // ==================== SERVICES CATALOG ====================
  console.log("📦 Creating Services Catalog...\n");

  const services = [
    {
      serviceName: "AI Voice Agents",
      serviceCategory: "platform" as const,
      serviceDescription: "Real-time autonomous outbound calling with Gemini Live & OpenAI Realtime APIs. Natural conversations, live objection handling, gatekeeper navigation, real-time BANT qualification, and mid-call meeting booking. 24/7 operation without headcount.",
      targetIndustries: ["Technology & SaaS", "Professional Services", "Healthcare", "Financial Services", "Manufacturing"],
      targetPersonas: ["VP Sales", "Chief Revenue Officer", "Sales Operations Director", "Head of Sales Development"],
      displayOrder: 1,
      problemsSolved: [
        {
          id: randomUUID(),
          problemStatement: "SDR headcount costs are unsustainable with 35% annual turnover and long ramp times",
          symptoms: [
            {
              id: randomUUID(),
              description: "High cost per SDR (salary + benefits + training + tools)",
              dataSource: "firmographic" as const,
              detectionLogic: "Company has sales team > 10, technology stack includes CRM"
            },
            {
              id: randomUUID(),
              description: "Long hiring and onboarding cycles (90+ days to full productivity)",
              dataSource: "industry" as const,
              detectionLogic: "B2B company with outbound sales model"
            },
            {
              id: randomUUID(),
              description: "Inconsistent call quality and performance variability across reps",
              dataSource: "behavioral" as const,
              detectionLogic: "Sales operations role exists, indicating need for performance management"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Cost", description: "Direct cost reduction vs. full SDR team", severity: "high" as const },
            { id: randomUUID(), area: "Efficiency", description: "24/7 operation without breaks or PTO", severity: "high" as const },
            { id: randomUUID(), area: "Growth", description: "Scale calling capacity instantly without hiring", severity: "medium" as const }
          ],
          severity: "high" as const
        },
        {
          id: randomUUID(),
          problemStatement: "Manual outbound calling is slow, inconsistent, and doesn't scale",
          symptoms: [
            {
              id: randomUUID(),
              description: "Low call volume per rep (typically 50-80 dials/day)",
              dataSource: "behavioral" as const,
              detectionLogic: "Outbound sales team exists"
            },
            {
              id: randomUUID(),
              description: "No calling outside business hours or across timezones",
              dataSource: "firmographic" as const,
              detectionLogic: "Global customer base or multiple regions"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Efficiency", description: "10x call volume with AI agents", severity: "high" as const },
            { id: randomUUID(), area: "Growth", description: "Reach more prospects faster", severity: "high" as const }
          ],
          severity: "high" as const
        }
      ],
      differentiators: [
        {
          id: randomUUID(),
          claim: "Gemini Live + OpenAI Realtime dual-model approach",
          proof: "Only platform using both Google and OpenAI's most advanced voice APIs",
          competitorGap: "Competitors use single-model or text-to-speech systems, not native voice AI"
        },
        {
          id: randomUUID(),
          claim: "Real-time BANT qualification during live conversation",
          proof: "AI agents assess Budget, Authority, Need, Timeline while talking",
          competitorGap: "Most voice AI just books meetings without qualification"
        },
        {
          id: randomUUID(),
          claim: "Mid-call calendar sync and instant meeting booking",
          proof: "Agents can book meetings while on the call via calendar integration",
          competitorGap: "Others require post-call follow-up for scheduling"
        }
      ],
      valuePropositions: [
        {
          id: randomUUID(),
          headline: "Replace or augment SDR team at 1/10th the cost",
          description: "AI Voice Agents work 24/7, never take PTO, and scale instantly without hiring",
          targetPersona: "Chief Revenue Officer",
          quantifiedValue: "90% cost reduction vs. full SDR team"
        },
        {
          id: randomUUID(),
          headline: "10x your outbound call volume immediately",
          description: "From 80 dials/day per rep to 800+ dials/day with AI agents",
          targetPersona: "VP Sales",
          quantifiedValue: "10x increase in prospect conversations"
        },
        {
          id: randomUUID(),
          headline: "Only pay for qualified meetings booked, not headcount",
          description: "Performance-based pricing aligned with your results",
          targetPersona: "Sales Operations Director",
          quantifiedValue: "ROI-positive from day one"
        }
      ]
    },
    {
      serviceName: "Intelligent Email Marketing",
      serviceCategory: "platform" as const,
      serviceDescription: "AI-crafted persona-specific email sequences with smart send-time optimization, reply sentiment analysis, A/B testing, multi-touch nurture campaigns, and merge tag personalization. Every email reasoned before it's sent.",
      targetIndustries: ["Technology & SaaS", "Professional Services", "Marketing Agencies", "E-commerce"],
      targetPersonas: ["CMO", "VP Marketing", "Demand Generation Manager", "Marketing Operations"],
      displayOrder: 2,
      problemsSolved: [
        {
          id: randomUUID(),
          problemStatement: "91% of B2B emails are ignored - generic automation destroys response rates",
          symptoms: [
            {
              id: randomUUID(),
              description: "Open rates below 15%, reply rates below 1%",
              dataSource: "behavioral" as const,
              detectionLogic: "Email marketing tools in tech stack"
            },
            {
              id: randomUUID(),
              description: "Generic templates that don't speak to recipient context",
              dataSource: "intent" as const,
              detectionLogic: "Marketing automation tools present"
            },
            {
              id: randomUUID(),
              description: "High spam complaint rates and domain reputation issues",
              dataSource: "behavioral" as const,
              detectionLogic: "Email sending volume > 10K/month"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Growth", description: "Increased email engagement and pipeline generation", severity: "high" as const },
            { id: randomUUID(), area: "Risk", description: "Reduced spam complaints and domain blacklisting", severity: "medium" as const }
          ],
          severity: "high" as const
        },
        {
          id: randomUUID(),
          problemStatement: "Email campaigns lack personalization and context awareness",
          symptoms: [
            {
              id: randomUUID(),
              description: "Same message sent to all recipients regardless of persona",
              dataSource: "behavioral" as const,
              detectionLogic: "Marketing automation platform exists"
            },
            {
              id: randomUUID(),
              description: "No dynamic content based on industry, role, or company stage",
              dataSource: "tech_stack" as const,
              detectionLogic: "CDP or marketing automation tool present"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Growth", description: "Higher conversion with personalized messaging", severity: "high" as const },
            { id: randomUUID(), area: "Efficiency", description: "Better targeting reduces wasted sends", severity: "medium" as const }
          ],
          severity: "medium" as const
        }
      ],
      differentiators: [
        {
          id: randomUUID(),
          claim: "Reasoning-first email generation with context awareness",
          proof: "AI analyzes recipient profile, company context, and timing before crafting each email",
          competitorGap: "Others use static templates or generic AI without reasoning layer"
        },
        {
          id: randomUUID(),
          claim: "Reply sentiment analysis with intelligent follow-up",
          proof: "Automatically detects interest, objections, or timing issues in replies",
          competitorGap: "Competitors require manual reply review and follow-up"
        },
        {
          id: randomUUID(),
          claim: "Organization Intelligence integration for brand-aligned messaging",
          proof: "Every email reflects your brand voice, positioning, and problem framework",
          competitorGap: "Generic AI tools don't maintain brand consistency"
        }
      ],
      valuePropositions: [
        {
          id: randomUUID(),
          headline: "3-5x higher reply rates with reasoning-first personalization",
          description: "AI understands context and crafts relevant messages, not generic spam",
          targetPersona: "Demand Generation Manager",
          quantifiedValue: "3-5x increase in email reply rates"
        },
        {
          id: randomUUID(),
          headline: "Set it and forget it - AI manages follow-ups intelligently",
          description: "Automatic sentiment detection and smart sequencing without manual intervention",
          targetPersona: "Marketing Operations",
          quantifiedValue: "80% reduction in manual email management"
        }
      ]
    },
    {
      serviceName: "Generative Content Studio",
      serviceCategory: "platform" as const,
      serviceDescription: "7-module AI content creation hub: Landing Pages (one-click publish with lead capture), Email Templates, Blog Posts (SEO-optimized), eBooks (gated lead magnets), Solution Briefs, AI Chat Assistant, and Image Generation. All generated in your brand voice.",
      targetIndustries: ["Technology & SaaS", "Professional Services", "Marketing Agencies", "Healthcare"],
      targetPersonas: ["CMO", "Content Marketing Manager", "VP Marketing", "Marketing Director"],
      displayOrder: 3,
      problemsSolved: [
        {
          id: randomUUID(),
          problemStatement: "Content creation is slow, expensive, and bottlenecks campaign launches",
          symptoms: [
            {
              id: randomUUID(),
              description: "Campaign launches delayed by weeks waiting for content",
              dataSource: "behavioral" as const,
              detectionLogic: "Marketing team with content creation needs"
            },
            {
              id: randomUUID(),
              description: "High cost for agencies, freelancers, or in-house content teams",
              dataSource: "firmographic" as const,
              detectionLogic: "Marketing budget constraints, content marketing roles"
            },
            {
              id: randomUUID(),
              description: "Inconsistent quality and brand voice across content pieces",
              dataSource: "intent" as const,
              detectionLogic: "Multiple content creators or agencies used"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Efficiency", description: "10x faster content creation", severity: "high" as const },
            { id: randomUUID(), area: "Cost", description: "90% reduction in content creation costs", severity: "high" as const },
            { id: randomUUID(), area: "Growth", description: "Launch campaigns faster, capture opportunities", severity: "medium" as const }
          ],
          severity: "high" as const
        },
        {
          id: randomUUID(),
          problemStatement: "Lack of integrated content-to-campaign workflow",
          symptoms: [
            {
              id: randomUUID(),
              description: "Content created in silos, disconnected from campaigns",
              dataSource: "tech_stack" as const,
              detectionLogic: "Separate CMS, landing page builder, email tool"
            },
            {
              id: randomUUID(),
              description: "Manual publishing and distribution processes",
              dataSource: "behavioral" as const,
              detectionLogic: "Marketing operations role exists"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Efficiency", description: "Seamless content-to-campaign workflow", severity: "medium" as const },
            { id: randomUUID(), area: "Growth", description: "Faster time-to-market", severity: "medium" as const }
          ],
          severity: "medium" as const
        }
      ],
      differentiators: [
        {
          id: randomUUID(),
          claim: "7 content engines in one unified studio",
          proof: "Landing pages, emails, blogs, eBooks, briefs, chat, and images - all in one platform",
          competitorGap: "Competitors require 3-5 separate tools for this breadth"
        },
        {
          id: randomUUID(),
          claim: "Organization Intelligence ensures brand-aligned content",
          proof: "Every piece reflects your brand voice, positioning, and problem framework automatically",
          competitorGap: "Generic AI tools produce off-brand content requiring heavy editing"
        },
        {
          id: randomUUID(),
          claim: "One-click publish with lead capture and analytics",
          proof: "Landing pages go live instantly with form integration and tracking",
          competitorGap: "Others require manual export, hosting, and setup"
        }
      ],
      valuePropositions: [
        {
          id: randomUUID(),
          headline: "Create complete campaign content suites in minutes, not months",
          description: "Landing pages, emails, blogs, eBooks - all generated and ready to publish",
          targetPersona: "Content Marketing Manager",
          quantifiedValue: "10x faster content production"
        },
        {
          id: randomUUID(),
          headline: "Eliminate content creation costs - no agencies or freelancers needed",
          description: "In-platform AI generates professional, on-brand content at scale",
          targetPersona: "CMO",
          quantifiedValue: "90% reduction in content costs"
        },
        {
          id: randomUUID(),
          headline: "SEO-optimized content that ranks and converts",
          description: "AI-powered content optimized for search engines and lead generation",
          targetPersona: "Marketing Director",
          quantifiedValue: "3x improvement in organic lead generation"
        }
      ]
    },
    {
      serviceName: "AI-Led Account-Based Marketing",
      serviceCategory: "platform" as const,
      serviceDescription: "Cross-channel ABM orchestration with buying committee mapping, account-level reasoning, and intelligence-driven engagement across email, voice, and content.",
      targetIndustries: ["Technology & SaaS", "Enterprise Software", "Professional Services", "Financial Services"],
      targetPersonas: ["VP Sales", "Chief Revenue Officer", "ABM Manager", "Revenue Operations"],
      displayOrder: 4,
      problemsSolved: [
        {
          id: randomUUID(),
          problemStatement: "ABM requires complex orchestration across multiple tools and channels",
          symptoms: [
            {
              id: randomUUID(),
              description: "Disconnected experiences across email, phone, content, and ads",
              dataSource: "tech_stack" as const,
              detectionLogic: "Multiple marketing/sales tools for different channels"
            },
            {
              id: randomUUID(),
              description: "Manual coordination required between SDRs, marketing, and content teams",
              dataSource: "firmographic" as const,
              detectionLogic: "ABM or enterprise sales model"
            },
            {
              id: randomUUID(),
              description: "Lack of account-level intelligence and buying committee visibility",
              dataSource: "behavioral" as const,
              detectionLogic: "Sales team > 20, enterprise customer base"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Efficiency", description: "Unified ABM orchestration", severity: "high" as const },
            { id: randomUUID(), area: "Growth", description: "Higher close rates with coordinated account engagement", severity: "high" as const }
          ],
          severity: "high" as const
        },
        {
          id: randomUUID(),
          problemStatement: "Targeting the entire buying committee is manual and time-consuming",
          symptoms: [
            {
              id: randomUUID(),
              description: "Single-threaded deals that stall when champion leaves",
              dataSource: "behavioral" as const,
              detectionLogic: "Enterprise sales cycle > 3 months"
            },
            {
              id: randomUUID(),
              description: "Manual research to identify decision-makers and influencers",
              dataSource: "firmographic" as const,
              detectionLogic: "Complex B2B sales with multiple stakeholders"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Growth", description: "Multi-threaded deals reduce risk", severity: "high" as const },
            { id: randomUUID(), area: "Efficiency", description: "Automated buying committee mapping", severity: "medium" as const }
          ],
          severity: "high" as const
        }
      ],
      differentiators: [
        {
          id: randomUUID(),
          claim: "Account-level reasoning engine with cumulative memory",
          proof: "AI remembers every interaction across all contacts at an account and reasons at account level",
          competitorGap: "ABM platforms treat each contact interaction independently"
        },
        {
          id: randomUUID(),
          claim: "Cross-channel orchestration (voice + email + content) from one platform",
          proof: "Unified campaign execution across all channels with consistent messaging",
          competitorGap: "Competitors require separate tools for each channel"
        },
        {
          id: randomUUID(),
          claim: "Automated buying committee identification and mapping",
          proof: "AI identifies decision-makers, influencers, and champions automatically",
          competitorGap: "Manual research required in other platforms"
        }
      ],
      valuePropositions: [
        {
          id: randomUUID(),
          headline: "Orchestrate multi-channel ABM campaigns from one platform",
          description: "Voice, email, and content unified with account-level intelligence",
          targetPersona: "Chief Revenue Officer",
          quantifiedValue: "50% reduction in tool sprawl and complexity"
        },
        {
          id: randomUUID(),
          headline: "Automatically map and engage entire buying committees",
          description: "AI identifies stakeholders and personalizes outreach to each role",
          targetPersona: "ABM Manager",
          quantifiedValue: "3x increase in multi-threaded deals"
        }
      ]
    },
    {
      serviceName: "Market & Account Intelligence",
      serviceCategory: "platform" as const,
      serviceDescription: "Deep multi-model research (Gemini + OpenAI + Anthropic + DeepSeek), ICP refinement, competitive landscape mapping, buying signal detection, and account enrichment.",
      targetIndustries: ["Technology & SaaS", "Professional Services", "Financial Services", "Healthcare"],
      targetPersonas: ["VP Sales", "Revenue Operations", "Sales Operations", "Chief Revenue Officer"],
      displayOrder: 5,
      problemsSolved: [
        {
          id: randomUUID(),
          problemStatement: "B2B data decays by 30% yearly leading to bad targeting and wasted outreach",
          symptoms: [
            {
              id: randomUUID(),
              description: "High bounce rates on email campaigns (> 5%)",
              dataSource: "behavioral" as const,
              detectionLogic: "Email marketing programs with deliverability issues"
            },
            {
              id: randomUUID(),
              description: "Calls to disconnected numbers or wrong contacts",
              dataSource: "behavioral" as const,
              detectionLogic: "Outbound calling programs with low connect rates"
            },
            {
              id: randomUUID(),
              description: "Outreach to contacts who have changed jobs or companies",
              dataSource: "behavioral" as const,
              detectionLogic: "CRM data > 6 months old"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Efficiency", description: "Eliminate wasted outreach efforts", severity: "high" as const },
            { id: randomUUID(), area: "Cost", description: "Reduce cost per qualified lead", severity: "high" as const },
            { id: randomUUID(), area: "Risk", description: "Protect domain reputation and deliverability", severity: "medium" as const }
          ],
          severity: "high" as const
        },
        {
          id: randomUUID(),
          problemStatement: "Manual account research is time-consuming and inconsistent",
          symptoms: [
            {
              id: randomUUID(),
              description: "SDRs spend 30-50% of time researching accounts",
              dataSource: "behavioral" as const,
              detectionLogic: "Outbound SDR team exists"
            },
            {
              id: randomUUID(),
              description: "Inconsistent research quality across team members",
              dataSource: "firmographic" as const,
              detectionLogic: "Sales development team > 5 reps"
            },
            {
              id: randomUUID(),
              description: "Lack of standardized account intelligence framework",
              dataSource: "behavioral" as const,
              detectionLogic: "No sales enablement or intelligence tools in tech stack"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Efficiency", description: "Automate account research", severity: "high" as const },
            { id: randomUUID(), area: "Growth", description: "More time for actual selling", severity: "high" as const }
          ],
          severity: "high" as const
        }
      ],
      differentiators: [
        {
          id: randomUUID(),
          claim: "70M+ verified contacts with 98% email accuracy",
          proof: "Largest verified B2B database with weekly refresh and multi-source verification",
          competitorGap: "Most data providers have 70-80% accuracy with annual updates"
        },
        {
          id: randomUUID(),
          claim: "Multi-model AI research (4 models: Gemini, OpenAI, Anthropic, DeepSeek)",
          proof: "AI agents synthesize intelligence from multiple AI models for higher accuracy",
          competitorGap: "Competitors use single-model or no AI enrichment"
        },
        {
          id: randomUUID(),
          claim: "195+ countries with localized data and timezone intelligence",
          proof: "Global coverage with local data sources and validation",
          competitorGap: "Most providers focus on US/EU only"
        }
      ],
      valuePropositions: [
        {
          id: randomUUID(),
          headline: "98% email accuracy eliminates wasted outreach",
          description: "Weekly refreshed data with multi-source verification across 70M+ contacts",
          targetPersona: "Revenue Operations",
          quantifiedValue: "50% reduction in bounced emails and bad data"
        },
        {
          id: randomUUID(),
          headline: "AI-powered account research reduces SDR research time by 80%",
          description: "Multi-model intelligence agents research accounts automatically",
          targetPersona: "VP Sales",
          quantifiedValue: "80% reduction in manual research time"
        },
        {
          id: randomUUID(),
          headline: "Global coverage across 195+ countries",
          description: "Run campaigns anywhere with localized, verified data",
          targetPersona: "Chief Revenue Officer",
          quantifiedValue: "Unlock global markets with confidence"
        }
      ]
    },
    {
      serviceName: "AI SDR-as-a-Service",
      serviceCategory: "managed_service" as const,
      serviceDescription: "Autonomous AI agents conduct first-touch outreach, qualification, follow-ups, and meeting booking across voice and email. Human strategist oversight with intelligent escalation.",
      targetIndustries: ["Technology & SaaS", "Professional Services", "Healthcare", "Financial Services"],
      targetPersonas: ["VP Sales", "Chief Revenue Officer", "Head of Sales Development"],
      displayOrder: 6,
      problemsSolved: [
        {
          id: randomUUID(),
          problemStatement: "Building and managing SDR teams is expensive, slow, and high-turnover",
          symptoms: [
            {
              id: randomUUID(),
              description: "35%+ annual SDR turnover requiring constant hiring and training",
              dataSource: "firmographic" as const,
              detectionLogic: "Sales development team with > 5 reps"
            },
            {
              id: randomUUID(),
              description: "$80K-$120K fully-loaded cost per SDR including salary, benefits, tools",
              dataSource: "firmographic" as const,
              detectionLogic: "B2B company with outbound SDR function"
            },{
              id: randomUUID(),
              description: "90+ day ramp time for new SDRs to reach full productivity",
              dataSource: "behavioral" as const,
              detectionLogic: "Outbound sales team with onboarding program"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Cost", description: "Eliminate SDR hiring, training, and turnover costs", severity: "high" as const },
            { id: randomUUID(), area: "Efficiency", description: "Instant deployment, no ramp time", severity: "high" as const },
            { id: randomUUID(), area: "Growth", description: "Scale capacity without hiring", severity: "medium" as const }
          ],
          severity: "high" as const
        }
      ],
      differentiators: [
        {
          id: randomUUID(),
          claim: "Human-in-the-loop model: AI executes, humans strategize",
          proof: "Expert strategists design campaigns and monitor AI agent performance",
          competitorGap: "Fully automated solutions lack strategic oversight"
        },
        {
          id: randomUUID(),
          claim: "Multi-channel engagement (voice + email) from single AI agent",
          proof: "AI SDRs conduct phone conversations and email sequences seamlessly",
          competitorGap: "Most AI SDRs are email-only or require separate voice tools"
        },
        {
          id: randomUUID(),
          claim: "Pay for meetings booked, not headcount",
          proof: "Performance-based pricing aligned with results",
          competitorGap: "Traditional SDRs require salary regardless of output"
        }
      ],
      valuePropositions: [
        {
          id: randomUUID(),
          headline: "Replace 5-10 SDRs with AI at 1/10th the cost",
          description: "AI SDR-as-a-Service delivers SDR output without headcount",
          targetPersona: "Chief Revenue Officer",
          quantifiedValue: "90% cost reduction vs. traditional SDR team"
        },
        {
          id: randomUUID(),
          headline: "Launch outbound programs in days, not months",
          description: "No hiring, training, or onboarding required - start generating pipeline immediately",
          targetPersona: "VP Sales",
          quantifiedValue: "Go from zero to pipeline in < 7 days"
        }
      ]
    },
    {
      serviceName: "Qualified Appointment Generation",
      serviceCategory: "managed_service" as const,
      serviceDescription: "BANT-qualified sales appointments delivered directly to your team's calendar through multi-channel outreach with full top-of-funnel management and no-show follow-up.",
      targetIndustries: ["Technology & SaaS", "Professional Services", "Healthcare", "Financial Services", "Manufacturing"],
      targetPersonas: ["VP Sales", "Chief Revenue Officer", "Sales Director"],
      displayOrder: 7,
      problemsSolved: [
        {
          id: randomUUID(),
          problemStatement: "Top-of-funnel pipeline generation is inconsistent and unpredictable",
          symptoms: [
            {
              id: randomUUID(),
              description: "Feast-or-famine pipeline with unpredictable meeting flow",
              dataSource: "behavioral" as const,
              detectionLogic: "Inconsistent pipeline coverage, sales team complaints about lead flow"
            },
            {
              id: randomUUID(),
              description: "Sales team spending time on unqualified leads and cold calling",
              dataSource: "firmographic" as const,
              detectionLogic: "AE or sales team without dedicated SDR support"
            },
            {
              id: randomUUID(),
              description: "High no-show rates on appointments due to poor qualification",
              dataSource: "behavioral" as const,
              detectionLogic: "Meeting show rates < 60%"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Growth", description: "Predictable pipeline generation", severity: "high" as const },
            { id: randomUUID(), area: "Efficiency", description: "Sales team focuses on closing, not prospecting", severity: "high" as const }
          ],
          severity: "high" as const
        }
      ],
      differentiators: [
        {
          id: randomUUID(),
          claim: "BANT-qualified appointments, not just meeting bookings",
          proof: "AI agents qualify Budget, Authority, Need, Timeline before booking",
          competitorGap: "Lead gen firms book unqualified meetings to hit quotas"
        },
        {
          id: randomUUID(),
          claim: "Full top-of-funnel management including no-show follow-up",
          proof: "We handle sourcing, outreach, qualification, booking, and rescheduling",
          competitorGap: "Most appointment setters hand off after initial booking"
        },
        {
          id: randomUUID(),
          claim: "Multi-channel engagement (voice + email) for higher show rates",
          proof: "Combined phone and email outreach with meeting reminders",
          competitorGap: "Email-only appointment setters have lower show rates"
        }
      ],
      valuePropositions: [
        {
          id: randomUUID(),
          headline: "Predictable pipeline: X qualified meetings per month, guaranteed",
          description: "Service-level agreements with minimum meeting commitments",
          targetPersona: "Chief Revenue Officer",
          quantifiedValue: "Guaranteed monthly meeting volume"
        },
        {
          id: randomUUID(),
          headline: "80%+ show rates with BANT-qualified prospects",
          description: "AI qualification ensures prospects are serious and ready to buy",
          targetPersona: "VP Sales",
          quantifiedValue: "80%+ meeting show rates"
        }
      ]
    },
    {
      serviceName: "Pipeline Intelligence & Management",
      serviceCategory: "platform" as const,
      serviceDescription: "AI-powered top-of-funnel with Kanban board, buyer journey staging, automated AE assignment, account intelligence scoring, and revenue forecasting.",
      targetIndustries: ["Technology & SaaS", "Professional Services", "Financial Services"],
      targetPersonas: ["Chief Revenue Officer", "Revenue Operations", "VP Sales", "Sales Operations"],
      displayOrder: 8,
      problemsSolved: [
        {
          id: randomUUID(),
          problemStatement: "Pipeline visibility and forecasting is manual and inaccurate",
          symptoms: [
            {
              id: randomUUID(),
              description: "Spreadsheet-based pipeline tracking with no real-time visibility",
              dataSource: "tech_stack" as const,
              detectionLogic: "CRM exists but limited pipeline management features"
            },
            {
              id: randomUUID(),
              description: "Revenue forecasts consistently miss by 20%+ due to poor pipeline intelligence",
              dataSource: "behavioral" as const,
              detectionLogic: "Revenue operations or finance team exists"
            },
            {
              id: randomUUID(),
              description: "Manual AE assignment leads to uneven workload and cherry-picking",
              dataSource: "firmographic" as const,
              detectionLogic: "Sales team > 10 with multiple AEs"
            }
          ],
          impactAreas: [
            { id: randomUUID(), area: "Efficiency", description: "Real-time pipeline visibility and automated workflows", severity: "high" as const },
            { id: randomUUID(), area: "Growth", description: "Accurate forecasting enables better planning", severity: "medium" as const }
          ],
          severity: "medium" as const
        }
      ],
      differentiators: [
        {
          id: randomUUID(),
          claim: "AI-powered buyer journey staging with automatic progression",
          proof: "Machine learning models stage accounts based on engagement and intent signals",
          competitorGap: "Manual stage management in traditional CRMs"
        },
        {
          id: randomUUID(),
          claim: "Intelligent AE assignment based on skills, capacity, and fit",
          proof: "AI matches accounts to best-fit AE considering territory, expertise, and workload",
          competitorGap: "Round-robin or manual assignment in other platforms"
        },
        {
          id: randomUUID(),
          claim: "Unified view of intelligence, engagement, and pipeline in one platform",
          proof: "From first touch to closed-won in single interface",
          competitorGap: "Fragmented views across multiple tools"
        }
      ],
      valuePropositions: [
        {
          id: randomUUID(),
          headline: "Real-time pipeline visibility from first touch to close",
          description: "Unified Kanban board with AI-powered staging and forecasting",
          targetPersona: "Revenue Operations",
          quantifiedValue: "50% improvement in forecast accuracy"
        },
        {
          id: randomUUID(),
          headline: "Eliminate pipeline chaos with intelligent automation",
          description: "AI handles account staging, AE assignment, and opportunity progression",
          targetPersona: "VP Sales",
          quantifiedValue: "10+ hours/week saved on pipeline management"
        }
      ]
    }
  ];

  let createdCount = 0;
  for (const service of services) {
    try {
      const created = await createService({
        organizationId: superOrg.id,
        serviceName: service.serviceName,
        serviceCategory: service.serviceCategory,
        serviceDescription: service.serviceDescription,
        problemsSolved: service.problemsSolved,
        differentiators: service.differentiators,
        valuePropositions: service.valuePropositions,
        targetIndustries: service.targetIndustries,
        targetPersonas: service.targetPersonas,
        displayOrder: service.displayOrder,
        isActive: true,
      });
      console.log(`  ✓ Created service: ${service.serviceName}`);
      createdCount++;
    } catch (error: any) {
      console.error(`  ✗ Failed to create service ${service.serviceName}:`, error.message);
    }
  }

  console.log(`\n✅ Services Catalog created: ${createdCount}/${services.length} services\n`);

  // ==================== PROBLEM FRAMEWORK ====================
  console.log("🧩 Creating Problem Framework...\n");

  const problemDefinitions = [
    {
      problemStatement: "Generic outbound automation destroys brand trust and response rates",
      problemCategory: "efficiency" as const,
      symptoms: [
        {
          id: randomUUID(),
          symptomDescription: "Email open rates below 15%, reply rates below 1%",
          dataSource: "behavioral" as const,
          detectionLogic: "Email marketing with poor engagement metrics"
        },
        {
          id: randomUUID(),
          symptomDescription: "High spam complaint rates damaging domain reputation",
          dataSource: "behavioral" as const,
          detectionLogic: "Email sending volume > 10K/month with deliverability issues"
        },
        {
          id: randomUUID(),
          symptomDescription: "Prospects report receiving irrelevant or generic messages",
          dataSource: "intent" as const,
          detectionLogic: "Marketing automation tools with template-based sequences"
        }
      ],
      impactAreas: [
        {
          id: randomUUID(),
          area: "Revenue",
          description: "Lost opportunities due to ignored outreach",
          severity: "high" as const
        },
        {
          id: randomUUID(),
          area: "Risk",
          description: "Brand reputation damage from spam-like communications",
          severity: "high" as const
        },
        {
          id: randomUUID(),
          area: "Cost",
          description: "Wasted marketing spend on ineffective campaigns",
          severity: "medium" as const
        }
      ],
      messagingAngles: [
        {
          id: randomUUID(),
          angle: "The Noise Problem",
          openingLine: "91% of B2B emails are ignored because automated spam has trained buyers to delete without reading. Your message is likely drowning in the noise.",
          followUp: "What if every interaction was reasoned before it was sent - with real context, not generic templates?",
          persona: "CMO"
        },
        {
          id: randomUUID(),
          angle: "Trust Erosion",
          openingLine: "Generic automation doesn't just fail - it actively damages your brand. Every irrelevant email makes the next one harder.",
          followUp: "We help you restore trust by replacing volume with intelligence.",
          persona: "VP Marketing"
        }
      ],
      detectionRules: {
        industries: ["Technology & SaaS", "Professional Services", "B2B Services"],
        techStack: {
          required: ["Email marketing platform", "Marketing automation"],
          absent: ["Advanced personalization engine"]
        },
        firmographics: {
          minEmployees: 20,
          minRevenue: 1000000,
          regions: []
        },
        intentSignals: ["low email engagement", "high bounce rates", "deliverability issues"]
      }
    },
    {
      problemStatement: "B2B data decay leads to wasted outreach and damaged sender reputation",
      problemCategory: "efficiency" as const,
      symptoms: [
        {
          id: randomUUID(),
          symptomDescription: "Email bounce rates above 5%",
          dataSource: "behavioral" as const,
          detectionLogic: "Email campaigns with high bounce rates"
        },
        {
          id: randomUUID(),
          symptomDescription: "Outreach to contacts who have changed roles or companies",
          dataSource: "behavioral" as const,
          detectionLogic: "CRM data older than 6 months"
        },
        {
          id: randomUUID(),
          symptomDescription: "Low connect rates on phone outreach",
          dataSource: "behavioral" as const,
          detectionLogic: "Outbound calling program with < 20% connect rate"
        }
      ],
      impactAreas: [
        {
          id: randomUUID(),
          area: "Cost",
          description: "Wasted effort on bad data",
          severity: "high" as const
        },
        {
          id: randomUUID(),
          area: "Risk",
          description: "Domain blacklisting and sender reputation damage",
          severity: "high" as const
        },
        {
          id: randomUUID(),
          area: "Efficiency",
          description: "SDR time wasted on disconnected contacts",
          severity: "medium" as const
        }
      ],
      messagingAngles: [
        {
          id: randomUUID(),
          angle: "Data Decay Reality",
          openingLine: "30% of your B2B data decays every year. Those bounce rates aren't just metrics - they're killing your domain reputation.",
          followUp: "Our 70M+ contacts refresh weekly with 98% email accuracy. Stop fighting bad data.",
          persona: "Revenue Operations"
        }
      ],
      detectionRules: {
        industries: ["Technology & SaaS", "Professional Services", "B2B Services", "Financial Services"],
        techStack: {
          required: ["CRM"],
          absent: ["Data enrichment platform"]
        },
        firmographics: {
          minEmployees: 10,
          regions: []
        },
        intentSignals: ["high bounce rates", "low connect rates","data quality issues"]
      }
    },
    {
      problemStatement: "SDR headcount costs are unsustainable with high turnover and long ramp times",
      problemCategory: "cost" as const,
      symptoms: [
        {
          id: randomUUID(),
          symptomDescription: "35%+ annual SDR turnover requiring constant hiring",
          dataSource: "firmographic" as const,
          detectionLogic: "Sales development team with > 5 reps"
        },
        {
          id: randomUUID(),
          symptomDescription: "90+ day ramp time for new SDRs",
          dataSource: "behavioral" as const,
          detectionLogic: "Outbound sales team with onboarding program"
        },
        {
          id: randomUUID(),
          symptomDescription: "$80K-$120K fully-loaded cost per SDR",
          dataSource: "firmographic" as const,
          detectionLogic: "B2B company with outbound SDR function"
        }
      ],
      impactAreas: [
        {
          id: randomUUID(),
          area: "Cost",
          description: "Direct cost reduction vs. SDR team",
          severity: "high" as const
        },
        {
          id: randomUUID(),
          area: "Efficiency",
          description: "Eliminate hiring, training, and onboarding overhead",
          severity: "high" as const
        },
        {
          id: randomUUID(),
          area: "Growth",
          description: "Scale pipeline generation without headcount",
          severity: "medium" as const
        }
      ],
      messagingAngles: [
        {
          id: randomUUID(),
          angle: "The Headcount Trap",
          openingLine: "Your SDR team costs $120K per head, takes 90 days to ramp, and turns over every 18 months. What if you could replace that with AI that works 24/7 at 1/10th the cost?",
          followUp: "AI Voice Agents + AI SDR-as-a-Service = SDR output without SDR headcount.",
          persona: "Chief Revenue Officer"
        },
        {
          id: randomUUID(),
          angle: "Scale Without Hiring",
          openingLine: "You need to double pipeline, but hiring SDRs takes months and costs a fortune. AI SDRs deploy in days, not quarters.",
          followUp: "Focus your budget on closers, not prospectors.",
          persona: "VP Sales"
        }
      ],
      detectionRules: {
        industries: ["Technology & SaaS", "Professional Services", "B2B Services"],
        techStack: {
          required: ["CRM", "Sales engagement platform"],
          absent: []
        },
        firmographics: {
          minEmployees: 50,
          minRevenue: 5000000,
          regions: []
        },
        intentSignals: ["SDR hiring", "sales team scaling", "pipeline generation challenges"]
      }
    },
    {
      problemStatement: "Content creation bottlenecks delay campaign launches and limit marketing velocity",
      problemCategory: "efficiency" as const,
      symptoms: [
        {
          id: randomUUID(),
          symptomDescription: "Campaign launches delayed by weeks waiting for content",
          dataSource: "behavioral" as const,
          detectionLogic: "Marketing team with content dependencies"
        },
        {
          id: randomUUID(),
          symptomDescription: "High agency or freelancer costs for content production",
          dataSource: "firmographic" as const,
          detectionLogic: "Marketing budget with content line items"
        },
        {
          id: randomUUID(),
          symptomDescription: "Inconsistent brand voice across content pieces",
          dataSource: "behavioral" as const,
          detectionLogic: "Multiple content creators or agencies"
        }
      ],
      impactAreas: [
        {
          id: randomUUID(),
          area: "Efficiency",
          description: "10x faster content production",
          severity: "high" as const
        },
        {
          id: randomUUID(),
          area: "Cost",
          description: "Eliminate agency and freelancer costs",
          severity: "high" as const
        },
        {
          id: randomUUID(),
          area: "Growth",
          description: "Launch campaigns faster, capture opportunities",
          severity: "medium" as const
        }
      ],
      messagingAngles: [
        {
          id: randomUUID(),
          angle: "The Content Bottleneck",
          openingLine: "Your campaigns are ready to launch, but you're waiting on content. Landing pages in design, emails in review, blogs in the backlog.",
          followUp: "Our Generative Content Studio creates complete campaign suites in minutes - landing pages, emails, blogs, eBooks - all in your brand voice.",
          persona: "Content Marketing Manager"
        },
        {
          id: randomUUID(),
          angle: "Content Cost Crisis",
          openingLine: "You're spending $5K-$10K per month on agencies and freelancers for content that takes weeks to produce.",
          followUp: "What if you could generate professional, on-brand content instantly at 1/10th the cost?",
          persona: "CMO"
        }
      ],
      detectionRules: {
        industries: ["Technology & SaaS", "Professional Services", "Marketing Agencies"],
        techStack: {
          required: ["CMS", "Marketing automation"],
          absent: ["AI content generation platform"]
        },
        firmographics: {
          minEmployees: 20,
          regions: []
        },
        intentSignals: ["content marketing", "demand generation", "campaign velocity challenges"]
      }
    },
    {
      problemStatement: "Fragmented martech stack creates data silos and kills operational efficiency",
      problemCategory: "efficiency" as const,
      symptoms: [
        {
          id: randomUUID(),
          symptomDescription: "Using 5-7 separate tools for voice, email, content, CRM, and analytics",
          dataSource: "tech_stack" as const,
          detectionLogic: "Multiple marketing and sales tools without integration"
        },
        {
          id: randomUUID(),
          symptomDescription: "Manual data transfer between systems",
          dataSource: "behavioral" as const,
          detectionLogic: "Marketing operations or RevOps role exists"
        },
        {
          id: randomUUID(),
          symptomDescription: "Inconsistent reporting and attribution across channels",
          dataSource: "tech_stack" as const,
          detectionLogic: "Multiple analytics tools with conflicting data"
        }
      ],
      impactAreas: [
        {
          id: randomUUID(),
          area: "Efficiency",
          description: "Unified platform eliminates tool sprawl",
          severity: "high" as const
        },
        {
          id: randomUUID(),
          area: "Cost",
          description: "Reduce total cost of ownership across martech stack",
          severity: "medium" as const
        }
      ],
      messagingAngles: [
        {
          id: randomUUID(),
          angle: "Tool Sprawl Tax",
          openingLine: "You're paying for 7 tools that don't talk to each other. Data lives in silos. Reporting is a nightmare.",
          followUp: "DemandGentic unifies voice, email, content, pipeline, data, and analytics in one platform.",
          persona: "Revenue Operations"
        }
      ],
      detectionRules: {
        industries: ["Technology & SaaS", "Professional Services"],
        techStack: {
          required: ["CRM", "Email marketing", "Sales engagement platform"],
          absent: ["Unified demand generation platform"]
        },
        firmographics: {
          minEmployees: 50,
          regions: []
        },
        intentSignals: ["tool consolidation", "integration challenges", "data silos"]
      }
    }
  ];

  let problemsCreatedCount = 0;
  for (const problem of problemDefinitions) {
    try {
      const created = await createProblemDefinition({
        organizationId: superOrg.id,
        problemStatement: problem.problemStatement,
        problemCategory: problem.problemCategory,
        symptoms: problem.symptoms,
        impactAreas: problem.impactAreas,
        serviceIds: [], // Will be linked via service problemsSolved
        messagingAngles: problem.messagingAngles,
        detectionRules: problem.detectionRules,
        isActive: true,
      });
      console.log(`  ✓ Created problem: ${problem.problemStatement.substring(0, 60)}...`);
      problemsCreatedCount++;
    } catch (error: any) {
      console.error(`  ✗ Failed to create problem:`, error.message);
    }
  }

  console.log(`\n✅ Problem Framework created: ${problemsCreatedCount}/${problemDefinitions.length} problems\n`);

  console.log("🎉 Super Organization Services Catalog & Problem Framework seeding complete!\n");
  console.log("📊 Summary:");
  console.log(`   • Services Catalog: ${createdCount} services created`);
  console.log(`   • Problem Framework: ${problemsCreatedCount} problem definitions created`);
  console.log("");
  console.log("🚀 Ready to use Problem Intelligence for campaigns!");
}

main().catch(console.error).finally(() => process.exit(0));
