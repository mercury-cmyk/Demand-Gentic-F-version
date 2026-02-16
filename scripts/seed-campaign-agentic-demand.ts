
import { db } from "../server/db";
import { campaigns, campaignChannelVariants, users } from "../shared/schema";
import { eq } from "drizzle-orm";

/**
 * Seed script: Creates an Agentic B2B Demand Generation voice campaign
 * focused on Problem Intelligence & Solution Mapping.
 *
 * Target: Marketing Leaders, B2B Demand Gen & Growth Marketing Leaders
 *         at B2B Vendors and SaaS companies.
 *
 * Run with: npx tsx scripts/seed-campaign-agentic-demand.ts
 */

async function seed() {
  console.log("Starting Agentic B2B Demand campaign seeding...\n");

  // 1. Get an owner ID (first user)
  const allUsers = await db.select().from(users).limit(1);
  if (allUsers.length === 0) {
    console.error("No users found. Please create a user first.");
    process.exit(1);
  }
  const ownerId = allUsers[0].id;
  console.log(`Using owner ID: ${ownerId}`);

  // 2. Check if campaign already exists (idempotent)
  const campaignName =
    "Agentic B2B Demand â€“ Problem Intelligence & Solution Mapping (Voice)";
  const existing = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.name, campaignName))
    .limit(1);

  if (existing.length > 0) {
    console.log(
      `Campaign "${campaignName}" already exists (id: ${existing[0].id}). Skipping.`
    );
    process.exit(0);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 3. Create the main campaign record
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [campaign] = await db
    .insert(campaigns)
    .values({
      name: campaignName,
      type: "lead_qualification",
      status: "draft",
      approvalStatus: "draft",
      ownerId,
      dialMode: "ai_agent",
      creationMode: "manual",

      // Voice-only campaign
      enabledChannels: ["voice"],
      channelGenerationStatus: {
        voice: "draft",
      },

      // â”€â”€ Campaign Objective â”€â”€
      campaignObjective: `Build awareness and qualify interest among B2B marketing and demand generation leaders for DemandGentic's Agentic Demand Generation platform â€“ specifically our Problem Intelligence engine and Solution Mapping framework.

The campaign goal is twofold:
1. AWARENESS: Introduce the concept of "Agentic B2B Demand" â€“ AI agents that reason about prospect problems before outreach, replacing spray-and-pray tactics with intelligence-led engagement.
2. QUALIFICATION: Identify leaders who recognise the limitations of traditional demand gen (low conversion, poor targeting, wasted budget) and are open to evaluating an agentic, problem-first approach.

Success = qualified interest confirmed: the prospect acknowledges a gap in their current demand gen approach and agrees to a deeper discovery conversation.`,

      // â”€â”€ Product / Service Info â”€â”€
      productServiceInfo: `DemandGentic is the world's first Agentic ABM Demand Reasoning platform. The two flagship capabilities we're introducing in this campaign:

**1. Problem Intelligence Engine**
â€¢ AI-powered research that maps each target account's real business challenges, competitive pressures, and strategic priorities BEFORE any outreach happens.
â€¢ Sources include public filings, earnings calls, news, job postings, tech stack signals, and intent data.
â€¢ Produces a structured "Problem Map" per account â€“ not generic firmographics, but actual pain points.
â€¢ Enables agents to open conversations with genuine relevance: "We noticed you're expanding into EMEA while consolidating your MarTech stack â€“ that creates a unique pipeline challenge."

**2. Solution Mapping Framework**
â€¢ Automatically aligns DemandGentic's (or the client's) capabilities to each account's detected problems.
â€¢ Generates a "Solution Fit Score" and a tailored messaging package: which problems to lead with, which proof points to cite, which objections to pre-empt.
â€¢ Ensures every conversation is grounded in the prospect's reality, not a generic pitch.
â€¢ Closes the gap between "we know their pain" and "here's exactly how we help."

**Platform proof points:**
â€¢ 2M+ qualified leads generated across 500+ enterprise clients
â€¢ 40% average lift in conversion rates vs. traditional outreach
â€¢ 85% reduction in manual research and outreach effort
â€¢ 40+ industries served globally
â€¢ Compliance-first architecture (GDPR, CCPA, global privacy standards)
â€¢ "Human Led Intelligence, AI Led Execution" philosophy`,

      // â”€â”€ Talking Points â”€â”€
      talkingPoints: [
        "Most B2B demand gen still relies on static lists, generic messaging, and volume-based outreach â€“ conversion rates are declining industry-wide. Problem Intelligence changes the equation by understanding each account's real challenges before a single call is made.",
        "We've seen that when agents lead with a prospect's actual business problem rather than a product pitch, connection-to-meeting rates increase by 3-4x. That's the power of Solution Mapping.",
        "DemandGentic's AI agents don't just dial and pitch â€“ they reason. They research the account, identify the top 3 problems, map our solution fit, and craft a conversation strategy. Every call is a discovery call, not a cold call.",
        "Traditional intent data tells you WHO is searching. Problem Intelligence tells you WHY they're searching and WHAT specific challenge they're trying to solve. That's the difference between a lead and a conversation.",
        "We're not replacing your team â€“ we're giving them superpowers. Problem Intelligence feeds your AEs with account-level insight packages so they walk into every meeting fully prepared.",
        "Our compliance-first architecture means zero brand risk. Every interaction respects GDPR, CCPA, and local privacy regulations by design.",
        "We recently helped a mid-market SaaS company increase their qualified pipeline by 60% in 90 days using Problem Intelligence to prioritise accounts showing real buying signals â€“ not just intent scores.",
      ],

      // â”€â”€ Target Audience Description â”€â”€
      targetAudienceDescription: `**Primary Targets:**
â€¢ VP of Demand Generation / Head of Demand Gen
â€¢ VP of Growth Marketing / Head of Growth
â€¢ Director of B2B Marketing / Senior Director of Marketing
â€¢ Head of Pipeline Generation / Revenue Marketing
â€¢ CMO / VP Marketing (at companies where they own demand gen directly)

**Company Profile:**
â€¢ B2B software vendors, SaaS companies, and technology-led B2B service providers
â€¢ Company size: 200â€“10,000 employees (mid-market to enterprise)
â€¢ Industries: SaaS, Cloud Infrastructure, Cybersecurity, FinTech, MarTech, HRTech, DevTools, Data/Analytics, AI/ML platforms
â€¢ Geography: US, UK, EMEA â€“ English-speaking markets
â€¢ Revenue stage: Series B+ / $20M+ ARR (companies with established demand gen functions)

**Psychographic Indicators:**
â€¢ Frustrated with declining outbound conversion rates
â€¢ Under pressure to deliver more pipeline with the same or fewer resources
â€¢ Evaluating or curious about AI in their demand gen stack
â€¢ Likely running ABM programmes but struggling with personalisation at scale
â€¢ May have tested generic AI tools (ChatGPT for copy, etc.) but haven't seen pipeline impact`,

      // â”€â”€ Objection Handling â”€â”€
      campaignObjections: [
        {
          objection: "We already have a demand gen team / agency handling this.",
          response:
            "That's great â€“ most of our clients do too. Problem Intelligence isn't a replacement for your team or agency; it's the research layer they've never had. Imagine if your AEs walked into every call already knowing the prospect's top 3 business challenges and exactly how your solution maps to them. That's what we enable. Our clients typically see a 40% lift in conversion when they layer this on top of their existing programmes.",
        },
        {
          objection:
            "We've tried AI tools for outreach and they felt generic / robotic.",
          response:
            "I hear that a lot, and honestly, most AI outreach IS generic â€“ it's just rewriting templates faster. What we do is fundamentally different. Before any outreach happens, our Problem Intelligence engine researches the account: their business challenges, competitive pressures, strategic initiatives. So when our agent calls, they're opening with the prospect's actual situation, not a canned pitch. It's the difference between 'Hey, want to learn about our product?' and 'We noticed you're scaling your EMEA pipeline while consolidating vendors â€“ that creates a unique challenge we've helped others solve.'",
        },
        {
          objection: "We're not looking at new vendors right now / no budget.",
          response:
            "Completely understand â€“ this isn't a sales call in that sense. We're reaching out because we're seeing a shift in how the best B2B demand gen teams are operating, and I thought it would be worth a quick conversation to share what's working. Even if the timing isn't right for a formal evaluation, the Problem Intelligence approach is something your team can learn from. Would a 15-minute briefing be useful?",
        },
        {
          objection: "How is this different from intent data providers like Bombora / 6sense?",
          response:
            "Great question. Intent data tells you WHO is researching topics. Problem Intelligence tells you WHY â€“ what specific business challenge is driving that research, and exactly how your solution maps to it. Intent data says 'this account is surging on demand generation.' Problem Intelligence says 'this account is struggling with 12% outbound conversion rates, expanding into EMEA without localised content, and their CMO just committed to 40% pipeline growth.' That depth is what makes conversations convert.",
        },
        {
          objection: "Just send me an email / some information.",
          response:
            "Absolutely â€“ I'll send you a short overview of Problem Intelligence along with a case study showing how a B2B SaaS company increased qualified pipeline by 60% in 90 days using this approach. What email address works best? And if the content resonates, would you be open to a 15-minute call to explore how it could apply to your team?",
        },
        {
          objection: "We're focused on inbound / product-led growth, not outbound.",
          response:
            "That makes sense â€“ and actually, Problem Intelligence is equally powerful for inbound. When an inbound lead comes in, our engine instantly maps their account's business challenges and provides your SDR or AE with a tailored conversation package. So instead of a generic 'thanks for downloading our ebook' follow-up, your team opens with insight. We've seen inbound-to-meeting conversion rates jump 50% with this approach.",
        },
      ],

      // â”€â”€ Success Criteria â”€â”€
      successCriteria:
        "Qualified interest confirmed: (1) Prospect acknowledges a limitation or gap in their current demand gen / outbound approach, (2) Prospect expresses interest in learning more about Problem Intelligence or Solution Mapping, and (3) A concrete next step is agreed â€“ either a 15-minute discovery call booked, or explicit permission to send a detailed briefing with a follow-up date. Secondary success: Prospect requests content/case study â€“ counts as warm interest for nurture sequence.",

      // â”€â”€ Campaign Context Brief â”€â”€
      campaignContextBrief: `Voice-first awareness and qualification campaign introducing DemandGentic's Agentic B2B Demand platform to marketing and demand generation leaders at B2B SaaS companies.

The campaign positions Problem Intelligence (AI-driven account research that maps real business challenges) and Solution Mapping (automated alignment of capabilities to detected problems) as the next evolution beyond intent data and traditional ABM.

The conversational approach is consultative and insight-led: agents open by demonstrating knowledge of the prospect's market context, share the Problem Intelligence concept as a category shift, and qualify by exploring the prospect's current demand gen challenges.

This is NOT a hard-sell campaign. The goal is to spark curiosity, establish thought leadership, and qualify genuine interest for deeper sales engagement.`,

      // â”€â”€ Voice Call Script (AI Agent) â”€â”€
      callScript: `OPENING:
"May I speak with {{fullName}}?"

IF IDENTITY CONFIRMED:
"This is [Agent Name] from DemandGentic. Quick reason for my call: we help B2B demand gen leaders replace spray-and-pray outreach using Problem Intelligence and Solution Mapping. Do you have 30 seconds for a quick overview?"

IF YES â€“ PROBLEM INTELLIGENCE INTRODUCTION:
"Thank you. So here's what we're seeing: most B2B demand gen teams are sitting on a massive blind spot. They have intent data that tells them WHO is searching, but they don't know WHY. What specific business problem is driving that search? What's the competitive pressure? What initiative did their leadership just commit to?

At DemandGentic, we built something called Problem Intelligence â€“ it's an AI engine that researches every target account and maps their actual business challenges before any outreach happens. Not firmographics or technographics â€“ real problems.

Then our Solution Mapping framework automatically connects those problems to how our client's product or service can help. So when a call happens, the agent already knows the prospect's top 3 challenges and exactly which proof points to lead with."

BRIDGE TO QUALIFICATION:
"The reason I'm calling is that we've seen this approach completely change conversion rates for B2B SaaS companies like {{companyName}}. One recent client went from 8% connection-to-meeting to over 30% in the first quarter.

I'm curious â€“ {{firstName}}, how is your team currently approaching outbound? Are you finding that your conversion rates are where you'd like them to be, or is there a gap?"

DISCOVERY QUESTIONS (conversational, not interrogation):
1. "What's your current approach to researching accounts before outreach â€“ is it mostly manual, or are you using any tools for that?"
2. "When your SDRs or agents get on a call, how much do they typically know about the prospect's specific business challenges?"
3. "Where do you see the biggest drop-off in your demand gen funnel right now â€“ is it at the top of funnel, in conversion, or downstream qualification?"
4. "Have you explored any AI-driven approaches for demand gen, beyond basic email copy or chatbots?"
5. "If you could solve one thing about your pipeline generation this quarter, what would it be?"

VALUE REINFORCEMENT (use based on prospect's answers):
- If they mention low conversion: "That's exactly the pattern we see. Problem Intelligence typically lifts conversion 3-4x because every conversation starts with relevance, not a cold pitch."
- If they mention manual research: "That's where 80% of SDR time goes â€“ and it's usually surface-level. Our engine does deep research in seconds and produces account-level insight packages your team can use immediately."
- If they mention ABM struggles: "ABM without problem-level intelligence is really just targeted spray-and-pray. When you know the actual problem, you can map your solution to it â€“ that's when ABM actually works."
- If they mention AI curiosity: "Most AI tools in demand gen focus on efficiency â€“ doing the same thing faster. Problem Intelligence is about effectiveness â€“ doing fundamentally different, smarter outreach."

CLOSE:
"{{firstName}}, based on what you've shared, I think there's a real opportunity for Problem Intelligence to [reference specific gap they mentioned]. What I'd suggest is a 15-minute briefing where we walk through how the engine works with a real example from your industry â€“ no commitment, just insight.

Would [day] at [time] work, or is later in the week better?"

ALTERNATIVE CLOSE (if not ready for a meeting):
"I understand you might want to think about it. Let me send you a short case study showing how a B2B SaaS company increased qualified pipeline 60% in 90 days using Problem Intelligence. If it resonates, we can find time for a quick call. What email works best?"

IF GATEKEEPER:
"Hi, this is [Agent Name] from DemandGentic. I'm reaching out to {{firstName}} regarding how B2B marketing teams are using Problem Intelligence to improve demand generation performance. We work with several companies in your space. Could you connect me, or would it be better to reach them at a specific time?"

VOICEMAIL:
"Hi {{firstName}}, this is [Agent Name] from DemandGentic. I'm calling because we've been helping B2B SaaS companies dramatically improve their demand gen conversion rates using something called Problem Intelligence â€“ it maps each target account's real business challenges before outreach happens. One client went from 8% to 30% connection-to-meeting rates. I'd love to share a quick overview. I'll send a brief note to your email as well. Thanks, {{firstName}}."`,

      // â”€â”€ Qualification Questions (structured) â”€â”€
      qualificationQuestions: [
        "What is your current approach to B2B demand generation and outbound â€“ in-house team, agency, or both?",
        "How do you currently research and prioritise target accounts before outreach?",
        "What conversion rate are you seeing from initial outreach to booked meetings?",
        "Have you evaluated or implemented any AI tools in your demand generation workflow?",
        "What's your biggest pipeline generation challenge this quarter?",
        "Who else on your team would be involved in evaluating a new approach to demand gen?",
      ],

      // â”€â”€ Call Flow State Machine â”€â”€
      callFlow: {
        steps: [
          {
            id: "opening",
            name: "Opening & Hook",
            description:
              "Introduce self, reference the shift in B2B demand gen, ask for 2 minutes. Establish credibility without pitching.",
            exitConditions: [
              "Prospect agrees to continue",
              "Prospect asks what it's about",
            ],
            nextSteps: ["problem_intelligence_intro"],
          },
          {
            id: "problem_intelligence_intro",
            name: "Problem Intelligence Introduction",
            description:
              "Explain the Problem Intelligence concept: AI that maps real business challenges before outreach. Contrast with intent data. Introduce Solution Mapping as the bridge from insight to action.",
            exitConditions: [
              "Prospect shows interest or curiosity",
              "Prospect asks how it works",
              "Prospect raises objection",
            ],
            nextSteps: ["qualification_discovery", "objection_handling"],
          },
          {
            id: "qualification_discovery",
            name: "Qualification & Discovery",
            description:
              "Explore prospect's current demand gen approach, conversion rates, pain points, and AI readiness. Use conversational discovery questions â€“ not an interrogation. Listen for buying signals: frustration with conversion rates, manual research burden, ABM struggles.",
            exitConditions: [
              "Qualification criteria gathered",
              "Prospect shares specific pain point",
              "Prospect wants to hear more",
            ],
            nextSteps: ["value_reinforcement"],
          },
          {
            id: "value_reinforcement",
            name: "Value Reinforcement",
            description:
              "Connect Problem Intelligence and Solution Mapping directly to the prospect's stated challenges. Use relevant proof points and stats. Make it specific to their situation.",
            exitConditions: [
              "Prospect acknowledges fit",
              "Prospect asks about next steps",
              "Prospect raises objection",
            ],
            nextSteps: ["close", "objection_handling"],
          },
          {
            id: "objection_handling",
            name: "Objection Handling",
            description:
              "Address concerns using problem-intelligence-specific rebuttals. Key objections: already have tools, AI feels generic, no budget, how different from intent data. Always return to the value of knowing WHY not just WHO.",
            exitConditions: [
              "Objection resolved",
              "Prospect requests email/content",
              "Prospect agrees to continue",
            ],
            nextSteps: [
              "qualification_discovery",
              "value_reinforcement",
              "close",
            ],
          },
          {
            id: "close",
            name: "Close & Next Steps",
            description:
              "Propose a 15-minute Problem Intelligence briefing with a real industry example. If not ready, offer case study via email with follow-up date. Always secure a concrete next step.",
            exitConditions: [
              "Meeting booked",
              "Content delivery confirmed with follow-up date",
              "Prospect declines â€“ thank and close gracefully",
            ],
            nextSteps: [],
          },
        ],
        defaultBehavior:
          "Always lead with insight and curiosity, never product features. If the prospect is busy, offer to send a 2-minute case study summary via email. Reference Problem Intelligence and Solution Mapping as category concepts, not product names. The goal is to spark recognition of a gap in their current approach.",
      },

      // â”€â”€ AI Agent Settings â”€â”€
      aiAgentSettings: {
        persona: {
          name: "Jordan",
          companyName: "DemandGentic",
          role: "Demand Intelligence Advisor",
          voice: "professional_friendly",
        },
        scripts: {
          opening:
            "May I speak with {{fullName}}?",
          gatekeeper:
            "Hi, this is Jordan from DemandGentic. I'm reaching out to {{firstName}} regarding how B2B marketing teams are using Problem Intelligence to improve demand generation performance. Could you connect me?",
          pitch:
            "Most B2B teams have intent data telling them WHO is searching â€“ but not WHY. Problem Intelligence changes that. It maps each account's real business challenges before any outreach happens, and our Solution Mapping framework connects those problems directly to how your product helps. One client went from 8% to 30% connection-to-meeting rates.",
          objections:
            "Use problem-intelligence-specific rebuttals. Always contrast with the status quo: intent data shows topics, Problem Intelligence shows root causes. AI outreach that's generic is doing automation, not intelligence. We're additive to existing teams, not replacement.",
          closing:
            "What I'd suggest is a 15-minute briefing where we walk through Problem Intelligence with a real example from your industry. Would [day] at [time] work, or is later in the week better?",
        },
        handoff: {
          enabled: true,
          triggers: ["meeting_booked", "decision_maker_engaged"],
          transferNumber: "",
        },
        gatekeeperLogic: {
          responses: {
            who_is_calling:
              "This is Jordan from DemandGentic â€“ we help B2B marketing teams improve demand gen performance using Problem Intelligence.",
            what_is_this_about:
              "We've been working with B2B SaaS companies on a new approach to demand generation that's significantly improving conversion rates. I wanted to share a quick insight with {{firstName}}.",
            they_are_busy:
              "I completely understand. When would be a better time to reach them? I'll make sure to call back then.",
          },
          maxAttempts: 2,
        },
      },

      // â”€â”€ Business Hours â”€â”€
      timezone: "America/New_York",
      businessHoursConfig: {
        enabled: true,
        timezone: "America/New_York",
        operatingDays: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
        ],
        startTime: "09:00",
        endTime: "17:30",
        respectContactTimezone: true,
        excludedDates: [],
      },

      // â”€â”€ Retry Rules â”€â”€
      retryRules: {
        voicemail: { maxAttempts: 2, delayHours: 48 },
        no_answer: { maxAttempts: 3, delayHours: 6 },
        backoff: "linear",
        business_hours: true,
        respect_local_tz: true,
      },

      // â”€â”€ Max Call Duration â”€â”€
      maxCallDurationSeconds: 420, // 7 minutes â€“ awareness calls need breathing room

      // â”€â”€ Campaign Goals â”€â”€
      targetQualifiedLeads: 150,
      startDate: "2026-02-17", // Monday start
      endDate: "2026-04-18", // ~9 week campaign

      // â”€â”€ QA Parameters â”€â”€
      qaParameters: {
        weights: {
          opening_quality: 10,
          problem_intelligence_explanation: 20,
          discovery_depth: 25,
          value_reinforcement_relevance: 20,
          objection_handling: 10,
          close_effectiveness: 10,
          compliance: 5,
        },
        minimumPassScore: 72,
      },

      // â”€â”€ Custom QA Rules (natural language) â”€â”€
      customQaRules: `Lead is QUALIFIED if ALL of the following are met:
(1) Prospect holds a VP, Director, Head of, or C-level title in Marketing, Demand Generation, Growth, or Revenue.
(2) Company is a B2B vendor, SaaS company, or technology-led B2B service provider with 200+ employees.
(3) Prospect acknowledged a limitation, gap, or frustration with their current demand gen or outbound approach.
(4) Prospect expressed interest in learning more about Problem Intelligence, Solution Mapping, or the agentic approach.
(5) A concrete next step was agreed: meeting booked, or explicit permission to send case study with follow-up date.

Lead is WARM (nurture) if:
- Prospect meets criteria 1-2 but asked for email/content without committing to a call.
- Prospect expressed general curiosity but timing isn't right.

Lead is DISQUALIFIED if:
- Prospect is an individual contributor, intern, or non-marketing role.
- Company is sub-100 employees or not a B2B vendor/SaaS.
- Prospect explicitly said "do not contact" or "not interested, remove me."
- Prospect is at a direct competitor.`,
    })
    .returning();

  console.log(`\nCreated campaign: "${campaign.name}" (id: ${campaign.id})`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 4. Create voice channel variant
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const [voiceVariant] = await db
    .insert(campaignChannelVariants)
    .values({
      campaignId: campaign.id,
      channelType: "voice",
      status: "draft",
      generatedFlow: {
        type: "call_flow",
        steps: [
          {
            id: "opening",
            name: "Opening & Hook",
            description:
              "Warm introduction referencing the shift in B2B demand gen. Ask for 2 minutes. No product pitch.",
            duration_seconds: 30,
          },
          {
            id: "problem_intelligence_intro",
            name: "Problem Intelligence Introduction",
            description:
              "Explain PI concept: AI maps real business challenges before outreach. Contrast with intent data. Introduce Solution Mapping.",
            duration_seconds: 60,
          },
          {
            id: "qualification_discovery",
            name: "Qualification & Discovery",
            description:
              "Explore current demand gen approach, conversion rates, pain points, AI readiness. Conversational, not interrogation.",
            duration_seconds: 120,
          },
          {
            id: "value_reinforcement",
            name: "Value Reinforcement",
            description:
              "Connect Problem Intelligence directly to prospect's stated challenges. Use relevant proof points (60% pipeline lift, 3-4x conversion).",
            duration_seconds: 60,
          },
          {
            id: "close",
            name: "Close & Next Steps",
            description:
              "Propose 15-min PI briefing with industry example. Fallback: case study via email with follow-up date.",
            duration_seconds: 30,
          },
        ],
      },
      channelSettings: {
        persona: {
          name: "Jordan",
          companyName: "DemandGentic",
          role: "Demand Intelligence Advisor",
          voice: "professional_friendly",
        },
        provider: "google",
        maxDurationSeconds: 420,
        conversationStyle: "consultative_insight_led",
      },
      executionPrompt: `You are Jordan, a Demand Intelligence Advisor at DemandGentic. You are calling B2B marketing and demand generation leaders at SaaS and B2B technology companies.

YOUR MISSION:
Build awareness of Agentic B2B Demand Generation â€“ specifically Problem Intelligence and Solution Mapping â€“ and qualify genuine interest for a deeper discovery conversation.

WHAT YOU'RE INTRODUCING:
1. **Problem Intelligence** â€“ An AI engine that researches each target account and maps their REAL business challenges (not just firmographics or intent signals) before any outreach. Sources: public filings, earnings, news, job postings, tech stack, intent data. Output: a structured "Problem Map" per account.

2. **Solution Mapping** â€“ Automatically aligns capabilities to each account's detected problems. Produces a tailored messaging package: which problems to lead with, which proof points to cite, which objections to pre-empt. Every conversation grounded in the prospect's reality.

KEY STATS & PROOF POINTS:
â€¢ 2M+ qualified leads across 500+ enterprise clients
â€¢ One SaaS client: 8% â†’ 30% connection-to-meeting rate in first quarter
â€¢ 60% qualified pipeline increase in 90 days for a mid-market SaaS company
â€¢ 40% average lift in conversion rates vs. traditional outreach
â€¢ 85% reduction in manual research effort
â€¢ 40+ industries served globally

CONVERSATIONAL APPROACH:
- Lead with INSIGHT, not product. You're sharing a paradigm shift, not selling software.
- Be genuinely curious about their current approach. Listen more than you talk.
- Use their answers to tailor your value statements. Never give a generic pitch.
- Contrast Problem Intelligence with the status quo: "intent data tells you WHO, PI tells you WHY."
- Position yourself as a peer sharing what's working, not a salesperson.
- If they're not ready for a meeting, offer the case study â€“ but always aim for a follow-up date.

TONE: Professional, consultative, energetic but not pushy. Think "trusted advisor sharing a breakthrough" not "SDR running a script."

NEVER:
- Hard-sell or pressure for a meeting
- Claim to know specifics about their company you don't actually know
- Badmouth their current tools or agency
- Rush through discovery â€“ this is an awareness call, take time to listen`,
    })
    .returning();

  console.log(`  Created voice channel variant (id: ${voiceVariant.id})`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Summary
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log(`
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  Campaign seeded successfully!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  Campaign:    ${campaign.name}
  ID:          ${campaign.id}
  Type:        lead_qualification (awareness + qualification)
  Channel:     voice
  Dial Mode:   ai_agent
  Status:      draft

  Voice Variant ID:  ${voiceVariant.id}

  Target:      Marketing Leaders, Demand Gen & Growth Marketing
               Leaders at B2B Vendors and SaaS (200-10K employees)

  Goals:       ${campaign.targetQualifiedLeads} qualified leads
  Timeline:    ${campaign.startDate} â†’ ${campaign.endDate} (~9 weeks)

  AI Agent:    Jordan â€“ Demand Intelligence Advisor
  Max Call:    7 minutes
  Hours:       Mon-Fri 09:00-17:30 (respect contact timezone)

  Next steps:
  1. Assign audience (contacts/accounts matching ICP) in the UI
  2. Link Problem Intelligence org for account-level research
  3. Assign phone number pool for caller ID rotation
  4. Review and approve voice channel variant
  5. Run test calls to validate agent performance
  6. Activate the campaign
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
`);

  process.exit(0);
}

seed().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
