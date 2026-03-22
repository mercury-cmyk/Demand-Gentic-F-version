import { db } from "../server/db";
import { resources, users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Starting resource seeding...");

  // 1. Get an owner ID (first user)
  const allUsers = await db.select().from(users).limit(1);
  if (allUsers.length === 0) {
    console.error("No users found. Please create a user first.");
    process.exit(1);
  }
  const ownerId = allUsers[0].id;
  console.log(`Using owner ID: ${ownerId}`);

  const newResources = [
    {
      slug: "scaling-enterprise-b2b-lead-gen-agentic-ai",
      title: "Scaling Enterprise B2B Lead Generation with Agentic AI",
      resourceType: "case_study" as const,
      community: "marketing" as const,
      overviewHtml: "How Pivotal B2B leveraged Agentic ABM to generate over 2 million leads for 500+ enterprise clients.",
      bullets: ["2M+ Leads Generated", "40% Increase in conversion rates", "Reduced manual outreach by 85%"],
      bodyHtml: `
        The Challenge
        Traditional demand generation methods were hitting a wall. "Spray and pray" tactics resulted in low engagement and high opt-out rates. Buyers were overwhelmed with irrelevant noise.
        The Solution
        Implementation of "Agentic ABM Demand Reasoning" shifted the focus from volume to value. By utilizing 7 distinct content generation engines, outreach became hyper-personalized and context-aware.
        The Results
        Over 11 years of front-line experience were codified into AI agents, resulting in over 2 million qualified leads generated across 40+ industries.
      `,
      status: "published" as const,
      ownerId: ownerId,
      seo: {
        title: "Scaling Enterprise B2B Lead Generation | Case Study",
        description: "Learn how agentic AI drove 2M+ leads for enterprise clients.",
        keywords: ["AI lead gen", "ABM", "Agentic AI", "B2B marketing"]
      }
    },
    {
      slug: "solving-unintelligent-outreach-crisis",
      title: "Solving the 'Unintelligent Outreach' Crisis",
      resourceType: "case_study" as const,
      community: "marketing" as const,
      overviewHtml: "Moving beyond algorithmic noise to precision-targeted problem intelligence that speaks directly to buyer needs.",
      bullets: ["Problem Intelligence Mapping", "Solution-First Approach", "Trust Restoration"],
      bodyHtml: `
        The Problem
        The world is drowning in unintelligent outreach. Buyers receive thousands of generic emails that fail to address their specific challenges.
        The Approach
        We deployed "Problem Intelligence" agents to map prospective client pain points before a single message was sent. This ensured every interaction was relevant and timely.
        The Outcome
        This approach restored trust in the outreach process, leading to higher open rates and meaningful conversations with decision-makers.
      `,
      status: "published" as const,
      ownerId: ownerId,
      seo: {
        title: "Solving Unintelligent Outreach | Case Study",
        description: "How Problem Intelligence transforms B2B outreach.",
        keywords: ["Problem Intelligence", "Outreach", "B2B Sales"]
      }
    },
    {
      slug: "end-of-algorithmic-noise-agentic-abm",
      title: "The End of Algorithmic Noise: The Era of Agentic ABM",
      resourceType: "white_paper" as const,
      community: "data_ai" as const,
      overviewHtml: "A deep dive into how AI agents are transforming Account-Based Marketing from simple automation to complex reasoning.",
      bullets: ["From Automation to Reasoning", "The 7 Engines of Content", "Future of B2B Demand"],
      bodyHtml: `
        Introduction
        Automation without intelligence creates noise. Agentic ABM introduces reasoning into the loop, allowing campaigns to adapt in real-time.
        The shift
        We explore the transition from static email sequences to dynamic, agent-driven conversations that understand context, nuance, and timing.
        Key Takeaways
        Understanding the role of "Human Led Intelligence, AI Led Execution" in the modern marketing stack.
      `,
      status: "published" as const,
      ownerId: ownerId,
      seo: {
        title: "The End of Algorithmic Noise | Whitepaper",
        description: "Whitepaper on the shift to Agentic ABM.",
        keywords: ["Agentic ABM", "AI Marketing", "Whitepaper"]
      }
    },
    {
      slug: "compliance-first-ai-marketing-guide",
      title: "The C-Suite Guide to Compliance-First AI Marketing",
      resourceType: "ebook" as const,
      community: "ops" as const,
      overviewHtml: "Navigating the complexities of AI outreach while maintaining strict adherence to GDPR and global privacy standards.",
      bullets: ["GDPR & AI", "Data Sovereignty", "Ethical Outreach"],
      bodyHtml: `
        Why Compliance Matters
        In an era of AI, privacy is paramount. This guide outlines how to build AI systems that respect user data and comply with international regulations.
        Strategies
        Implementing "Compliance First" protocols in your demand generation engines to ensure safety and brand reputation.
      `,
      status: "published" as const,
      ownerId: ownerId,
      seo: {
        title: "Compliance-First AI Marketing | Ebook",
        description: "Guide to compliant AI marketing strategies.",
        keywords: ["GDPR", "AI Compliance", "Marketing Ethics"]
      }
    }
  ];

  for (const resource of newResources) {
    try {
      // Check if exists
      const existing = await db.select().from(resources).where(eq(resources.slug, resource.slug));
      if (existing.length > 0) {
        console.log(`Resource ${resource.slug} already exists. Skipping.`);
        continue;
      }
      
      await db.insert(resources).values(resource);
      console.log(`Created resource: ${resource.title}`);
    } catch (e) {
      console.error(`Failed to create resource ${resource.title}:`, e);
    }
  }

  console.log("Seeding completed.");
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});