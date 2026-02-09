
import { db } from "../server/db";
import { campaigns, campaignChannelVariants, users } from "../shared/schema";
import { eq } from "drizzle-orm";

/**
 * Seed script: Creates a DemandGentic multi-channel campaign (Email + Phone)
 * based on public pages content (case studies, whitepapers, ebooks).
 *
 * Run with: npx tsx scripts/seed-campaign.ts
 */

async function seed() {
  console.log("Starting DemandGentic campaign seeding...\n");

  // 1. Get an owner ID (first user)
  const allUsers = await db.select().from(users).limit(1);
  if (allUsers.length === 0) {
    console.error("No users found. Please create a user first.");
    process.exit(1);
  }
  const ownerId = allUsers[0].id;
  console.log(`Using owner ID: ${ownerId}`);

  // 2. Check if campaign already exists (idempotent)
  const campaignName = "DemandGentic – Agentic ABM Content Syndication (Email + Phone)";
  const existing = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.name, campaignName))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Campaign "${campaignName}" already exists (id: ${existing[0].id}). Skipping.`);
    process.exit(0);
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. Create the main campaign record
  // ──────────────────────────────────────────────────────────────────
  const [campaign] = await db.insert(campaigns).values({
    name: campaignName,
    type: "content_syndication",
    status: "draft",
    approvalStatus: "draft",
    ownerId,
    dialMode: "ai_agent",
    creationMode: "manual",

    // Multi-channel: both email and voice
    enabledChannels: ["email", "voice"],
    channelGenerationStatus: {
      email: "draft",
      voice: "draft",
    },

    // ── Campaign context (drawn from public pages content) ──
    campaignObjective:
      "Drive awareness and qualified meetings for DemandGentic's Agentic ABM platform by syndicating our published thought-leadership content (case studies, whitepapers, ebooks) to ICP-aligned B2B marketing and revenue leaders.",

    productServiceInfo: `DemandGentic is the world's first Agentic ABM Demand Reasoning platform. Key capabilities:
• AI-powered voice and email outreach at scale
• Problem Intelligence mapping that aligns outreach to real buyer pain points
• 7 distinct content generation engines for hyper-personalised messaging
• Full compliance-first architecture (GDPR, global privacy standards)
• 2M+ qualified leads generated across 500+ enterprise clients and 40+ industries
• "Human Led Intelligence, AI Led Execution" philosophy`,

    talkingPoints: [
      "We generated 2M+ qualified leads for 500+ enterprise clients using Agentic AI – here's how.",
      "Traditional 'spray and pray' demand gen is dead. Problem Intelligence replaces noise with precision.",
      "Our compliance-first approach means zero risk to your brand reputation.",
      "DemandGentic's 7-engine content architecture delivers hyper-personalised outreach at scale.",
      "We're sharing our latest case study on scaling enterprise B2B lead gen – would love your take.",
      "Our whitepaper 'The End of Algorithmic Noise' outlines the shift from automation to reasoning.",
    ],

    targetAudienceDescription:
      "VP / Director / Head of Demand Generation, Growth Marketing, Revenue Operations, and ABM at mid-market to enterprise B2B companies (500–10,000 employees). Industries: SaaS, FinTech, Cybersecurity, Cloud Infrastructure, MarTech.",

    campaignObjections: [
      {
        objection: "We already have a demand gen agency.",
        response:
          "Completely understand – many of our clients augment existing agencies with DemandGentic's AI layer. It's additive, not replacement. Our case study shows a 40% lift in conversion rates when layered on top of existing programmes.",
      },
      {
        objection: "AI outreach feels impersonal.",
        response:
          "That's the problem we solve. Unlike generic AI, our Problem Intelligence maps each prospect's real pain points before a single message is sent. Every touchpoint is personalised to their specific challenges.",
      },
      {
        objection: "We don't have budget right now.",
        response:
          "No worries at all. The content we're sharing is completely free – our case study and whitepaper are designed to help you benchmark your current approach. Happy to reconnect next quarter.",
      },
      {
        objection: "Send me an email instead.",
        response:
          "Absolutely – I'll send over our case study on scaling enterprise lead gen with Agentic AI along with a short summary. What email address works best?",
      },
    ],

    successCriteria:
      "Meeting booked with a VP/Director-level decision maker to discuss Agentic ABM capabilities, OR confirmed content download with intent signal.",

    campaignContextBrief:
      "Multi-channel content syndication campaign promoting DemandGentic's published thought-leadership: 'Scaling Enterprise B2B Lead Generation with Agentic AI' (case study), 'The End of Algorithmic Noise' (whitepaper), and 'Compliance-First AI Marketing Guide' (ebook). Goal: generate awareness and qualified meetings.",

    // ── Email content (based on public pages) ──
    emailSubject: "How we generated 2M+ B2B leads with Agentic AI [Case Study]",
    emailHtmlContent: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
  <p>Hi {{firstName}},</p>

  <p>Traditional demand generation is hitting a wall. Buyers are overwhelmed with irrelevant noise, and conversion rates are plummeting.</p>

  <p>At <strong>DemandGentic</strong>, we took a different approach. Instead of "spray and pray," we built <strong>Agentic ABM</strong> – AI agents that reason about each prospect's real challenges before a single message is sent.</p>

  <p>The results speak for themselves:</p>
  <ul>
    <li><strong>2M+ qualified leads</strong> generated across 500+ enterprise clients</li>
    <li><strong>40% increase</strong> in conversion rates vs. traditional outreach</li>
    <li><strong>85% reduction</strong> in manual outreach effort</li>
  </ul>

  <p>I'd love to share three pieces of content that break this down:</p>
  <ol>
    <li><strong>Case Study:</strong> <em>Scaling Enterprise B2B Lead Generation with Agentic AI</em></li>
    <li><strong>Whitepaper:</strong> <em>The End of Algorithmic Noise: The Era of Agentic ABM</em></li>
    <li><strong>eBook:</strong> <em>The C-Suite Guide to Compliance-First AI Marketing</em></li>
  </ol>

  <p>Would it be worth a 15-minute conversation to explore how Agentic ABM could improve {{companyName}}'s demand generation?</p>

  <p>Best regards,<br/>
  <strong>DemandGentic Team</strong><br/>
  <em>Human Led Intelligence. AI Led Execution.</em></p>
</div>`,

    // ── Voice call script (AI agent) ──
    callScript: `OPENING:
"Hi {{firstName}}, this is [Agent Name] from DemandGentic. We're reaching out because we recently published some research on how B2B companies are replacing spray-and-pray demand gen with what we call Agentic ABM. Given your role at {{companyName}}, I thought you might find it relevant. Do you have a quick moment?"

IF YES – PITCH:
"Great. So the short version is: we've helped over 500 enterprise clients generate more than 2 million qualified leads using AI agents that actually reason about each prospect's pain points before any outreach happens. Our latest case study walks through exactly how we achieved a 40% lift in conversion rates.

We also published a whitepaper called 'The End of Algorithmic Noise' that covers the shift from static email sequences to agent-driven outreach – and a compliance-first guide for teams concerned about GDPR and data sovereignty.

I'd love to send these your way. More importantly, would it make sense to block 15 minutes to discuss how this could apply to {{companyName}}'s demand generation strategy?"

IF GATEKEEPER:
"I understand – I'm calling from DemandGentic. We work with B2B marketing and revenue leaders on AI-powered demand generation. We've just published some thought-leadership content that I think would be very relevant for [target name]. Could you help me connect?"

OBJECTION HANDLING:
- "We have an agency" → "Many clients layer our AI on top of existing agencies – it's additive. Our case study shows a 40% lift when combined."
- "Not interested" → "Completely understand. Could I at least send the case study for your reference? No follow-up unless you want one."
- "Send an email" → "Happy to. What's the best email? I'll include our case study and whitepaper."
- "No budget" → "No problem at all – the content is free. I'll send it over and we can reconnect next quarter if it resonates."

CLOSE:
"Would [day] at [time] work for a short call, or would later in the week be better?"`,

    qualificationQuestions: [
      "What is your current approach to demand generation and lead qualification?",
      "Are you using any AI or automation in your outbound today?",
      "What does your ideal qualified lead look like?",
      "What's the biggest bottleneck in your pipeline right now?",
      "Who else is involved in evaluating new demand gen approaches?",
    ],

    // ── Call flow state machine ──
    callFlow: {
      steps: [
        {
          id: "opening",
          name: "Opening",
          description: "Introduce DemandGentic and establish relevance via published content",
          exitConditions: ["Prospect confirms interest", "Prospect asks to continue"],
          nextSteps: ["pitch"],
        },
        {
          id: "pitch",
          name: "Value Proposition",
          description: "Share key results (2M+ leads, 40% conversion lift) and reference published case study, whitepaper, and ebook",
          exitConditions: ["Prospect expresses interest in content or meeting", "Prospect raises objection"],
          nextSteps: ["qualification", "objection_handling"],
        },
        {
          id: "qualification",
          name: "Qualification",
          description: "Ask about current demand gen approach, AI usage, and pipeline bottlenecks",
          exitConditions: ["Qualification questions answered", "Prospect wants to schedule meeting"],
          nextSteps: ["close"],
        },
        {
          id: "objection_handling",
          name: "Objection Handling",
          description: "Address concerns using campaign objection scripts",
          exitConditions: ["Objection resolved", "Prospect requests email follow-up"],
          nextSteps: ["qualification", "close"],
        },
        {
          id: "close",
          name: "Close",
          description: "Propose a 15-minute meeting or confirm content delivery",
          exitConditions: ["Meeting booked", "Content delivery confirmed", "Call ended"],
          nextSteps: [],
        },
      ],
      defaultBehavior: "Always reference published content. If prospect is not available, offer to send the case study via email.",
    },

    // ── Business hours ──
    timezone: "Europe/London",
    businessHoursConfig: {
      enabled: true,
      timezone: "Europe/London",
      operatingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      startTime: "09:00",
      endTime: "17:30",
      respectContactTimezone: true,
      excludedDates: [],
    },

    // ── Retry rules ──
    retryRules: {
      voicemail: { maxAttempts: 2, delayHours: 24 },
      no_answer: { maxAttempts: 3, delayHours: 4 },
      backoff: "linear",
      business_hours: true,
      respect_local_tz: true,
    },

    // ── Throttling ──
    throttlingConfig: {
      maxConcurrentCalls: 5,
      maxCallsPerHour: 30,
      maxEmailsPerHour: 50,
    },

    // ── QA parameters ──
    qaParameters: {
      weights: {
        opening_quality: 15,
        value_proposition_delivery: 20,
        qualification_depth: 25,
        objection_handling: 15,
        close_effectiveness: 15,
        compliance: 10,
      },
      minimumPassScore: 70,
    },

    customQaRules:
      "Lead is qualified if: (1) Prospect is VP/Director level or above, (2) Company has 500+ employees, (3) Prospect confirmed interest in Agentic ABM or content, (4) A next step is agreed (meeting or content delivery). Reject if: prospect is an intern/individual contributor, company is sub-100 employees, or prospect explicitly said 'do not contact again'.",
  }).returning();

  console.log(`\nCreated campaign: "${campaign.name}" (id: ${campaign.id})`);

  // ──────────────────────────────────────────────────────────────────
  // 4. Create channel variants (email + voice)
  // ──────────────────────────────────────────────────────────────────

  // Email channel variant
  const [emailVariant] = await db.insert(campaignChannelVariants).values({
    campaignId: campaign.id,
    channelType: "email",
    status: "draft",
    generatedFlow: {
      type: "email_sequence",
      steps: [
        {
          id: "email_1",
          name: "Initial Outreach",
          delayDays: 0,
          subject: "How we generated 2M+ B2B leads with Agentic AI [Case Study]",
          contentRef: "case_study_scaling_enterprise",
          purpose: "Introduce DemandGentic and share flagship case study",
        },
        {
          id: "email_2",
          name: "Whitepaper Follow-Up",
          delayDays: 3,
          subject: "The End of Algorithmic Noise – our latest whitepaper",
          contentRef: "whitepaper_algorithmic_noise",
          purpose: "Share whitepaper on Agentic ABM for prospects who didn't respond to email 1",
        },
        {
          id: "email_3",
          name: "eBook + Soft CTA",
          delayDays: 7,
          subject: "Free eBook: Compliance-First AI Marketing Guide",
          contentRef: "ebook_compliance_first",
          purpose: "Offer ebook as low-friction content download with meeting CTA",
        },
        {
          id: "email_4",
          name: "Break-Up / Last Touch",
          delayDays: 14,
          subject: "Last one from me – quick question",
          contentRef: null,
          purpose: "Final nudge with a simple yes/no question to drive engagement",
        },
      ],
    },
    channelSettings: {
      tone: "professional_consultative",
      senderName: "DemandGentic Team",
      senderEmail: "outreach@demandgentic.com",
      replyTo: "hello@demandgentic.com",
      unsubscribeEnabled: true,
      trackOpens: true,
      trackClicks: true,
    },
    executionPrompt: `You are an email outreach agent for DemandGentic. Your goal is to share valuable published content (case studies, whitepapers, ebooks) with B2B marketing and revenue leaders.

Tone: Professional, consultative, and value-first. Never pushy.
Goal: Drive content engagement and qualified meeting bookings.
Content to reference:
1. Case Study: "Scaling Enterprise B2B Lead Generation with Agentic AI" – 2M+ leads, 40% conversion lift
2. Whitepaper: "The End of Algorithmic Noise: The Era of Agentic ABM" – from automation to reasoning
3. eBook: "The C-Suite Guide to Compliance-First AI Marketing" – GDPR, data sovereignty, ethical AI outreach

Always personalise based on the prospect's role, company, and industry. Reference specific pain points where possible.`,
  }).returning();

  console.log(`  Created email channel variant (id: ${emailVariant.id})`);

  // Voice channel variant
  const [voiceVariant] = await db.insert(campaignChannelVariants).values({
    campaignId: campaign.id,
    channelType: "voice",
    status: "draft",
    generatedFlow: {
      type: "call_flow",
      steps: [
        {
          id: "opening",
          name: "Opening & Context Setting",
          description: "Introduce self, reference published content, establish relevance",
          duration_seconds: 30,
        },
        {
          id: "value_prop",
          name: "Value Proposition",
          description: "Share 2M+ leads stat, 40% conversion lift, reference case study",
          duration_seconds: 60,
        },
        {
          id: "qualification",
          name: "Discovery & Qualification",
          description: "Ask about current demand gen approach, AI usage, pipeline gaps",
          duration_seconds: 90,
        },
        {
          id: "close",
          name: "Close & Next Steps",
          description: "Propose 15-min meeting or confirm content delivery via email",
          duration_seconds: 30,
        },
      ],
    },
    channelSettings: {
      persona: {
        name: "Alex",
        companyName: "DemandGentic",
        role: "Demand Generation Specialist",
        voice: "professional_friendly",
      },
      provider: "google",
      maxDurationSeconds: 240,
    },
    executionPrompt: `You are Alex, a Demand Generation Specialist at DemandGentic. You are calling B2B marketing and revenue leaders to share DemandGentic's published thought-leadership content and explore whether Agentic ABM could improve their demand generation.

Key content to reference:
1. Case Study: "Scaling Enterprise B2B Lead Generation with Agentic AI" – 2M+ leads for 500+ clients
2. Whitepaper: "The End of Algorithmic Noise" – the shift from static automation to agent-driven reasoning
3. eBook: "Compliance-First AI Marketing" – GDPR and privacy-safe AI outreach

Key stats: 2M+ qualified leads, 40% conversion lift, 85% reduction in manual outreach, 500+ enterprise clients, 40+ industries.

Approach: Consultative and respectful. Lead with value and content. Never hard-sell. If the prospect is busy, offer to send content via email. Always aim for a 15-minute meeting as the primary CTA.`,
  }).returning();

  console.log(`  Created voice channel variant (id: ${voiceVariant.id})`);

  // ──────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────
  console.log(`
════════════════════════════════════════════════════════════════
  Campaign seeded successfully!
════════════════════════════════════════════════════════════════
  Campaign:  ${campaign.name}
  ID:        ${campaign.id}
  Type:      content_syndication
  Channels:  email + voice
  Status:    draft

  Email Variant ID:  ${emailVariant.id}
  Voice Variant ID:  ${voiceVariant.id}

  Next steps:
  1. Assign audience (contacts/accounts) in the UI
  2. Review and approve channel variants
  3. Activate the campaign
════════════════════════════════════════════════════════════════
`);

  process.exit(0);
}

seed().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
