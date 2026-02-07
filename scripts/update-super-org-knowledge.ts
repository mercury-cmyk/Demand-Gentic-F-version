
import { db } from "../server/db";
import { updateSuperOrganization } from "../server/services/super-organization-service";

async function main() {
  console.log("Updating Super Organization with data from Landing Page...");

  const privacyPolicy = "We respect your privacy. Data is verified, inferred, or unknown with full source attribution.";

  const identity = {
    legalName: { value: 'Pivotal B2B LLC', confidence: 1.0 },
    brandName: { value: 'DemandGentic.ai', confidence: 1.0 },
    description: { value: 'Precision B2B demand generation powered by account-aware intelligence. Expert strategists + autonomous AI agents + 70M+ verified contacts.', confidence: 1.0 },
    industry: { value: 'B2B Demand Generation / AI Technology', confidence: 1.0 },
    foundingStory: { value: 'Built by Pivotal B2B, a team with 10+ years in global B2B demand generation. Founded by Zahid Mohammadi.', confidence: 1.0 },
    mission: { value: 'To end algorithmic noise and usher in the era of agentic reasoning in B2B demand generation.', confidence: 1.0 }
  };

  const offerings = {
    coreProducts: { value: 'AI-Led Account-Based Marketing, Content-Led Demand Generation, AI SDR-as-a-Service, Qualified Appointment Generation, Market & Account Intelligence, B2B Data & Enrichment', confidence: 1.0 },
    useCases: { value: 'Lead generation, appointment setting, market research, GTM strategy, database enrichment', confidence: 1.0 },
    differentiators: { 
      value: [
        'Expert Services: Dedicated strategists design and monitor campaigns.',
        'Agentic Intelligence: Purpose-built AI agents for research, voice, email, and compliance.',
        'Precision Data: 70M+ verified contacts, 98% accuracy, weekly refresh.'
      ], 
      confidence: 1.0 
    }
  };

  const icp = {
    industries: { value: 'Enterprise & mid-market B2B companies', confidence: 1.0 },
    personas: { value: 'Revenue Teams, Sales Leaders, Marketing Directors, GTM Strategists', confidence: 1.0 },
    painPoints: { 
        value: [
            'The Noise: Volume over intent, automated spam eroding trust.',
            'The Waste: Dirty data, hollow metrics, data decay.',
            'The Loss: Solutions missing their audience due to lack of context.'
        ], 
        confidence: 1.0 
    }
  };

  const positioning = {
    oneLiner: { value: 'The End of Algorithmic Noise. The Era of Agentic Reasoning.', confidence: 1.0 },
    valueProposition: { value: 'Services + Intelligence + Data = Demand That Converts.', confidence: 1.0 },
    tagline: { value: 'Human Led Intelligence, AI led Execution of modern demand', confidence: 1.0 }
  };

  const outreach = {
    principles: {
        value: [
            'Permission is Earned: Every touchpoint must prove value.',
            'Context Over Content: Business context prioritized above all.',
            'Data is Evidence: Reasoning through conflicting signals to find truth.',
            'Judgment at Scale: Automating judgment to scale demand without noise.'
        ],
        confidence: 1.0
    },
    process: {
        value: [
            'Discovery & Strategy: Map solutions to buyer problems.',
            'Intelligence Activation: Agentic research and verification.',
            'Precision Content: Personalized emails, scripts, and responses.',
            'Agentic Execution: Gemini Live voice, intelligent email sequences.',
            'Optimization & Handoff: Real-time analysis and qualified lead delivery.'
        ],
        confidence: 1.0
    },
    channels: { value: 'Email, Voice (Gemini Live), Content Assets, Digital', confidence: 1.0 }
  };

  const compiledOrgContext = `
# DemandGentic.ai (Pivotal B2B) - Super Org Context

## Mission
To end algorithmic noise and usher in the era of agentic reasoning. We replace spam with intelligence-driven, account-aware engagement.

## Core Value Proposition
DemandGentic.ai combines three pillars for precision demand generation:
1. **Human Expertise**: Strategists design and monitor campaigns.
2. **AI Agents**: Autonomous agents for research, voice, email, and compliance.
3. **Global Data**: 70M+ verified contacts with 98% accuracy.

## The Problem We Solve
- **The Noise**: Buyers are overwhelmed by volume-based spam.
- **The Waste**: 30% of B2B data decays yearly; decisions are made on vanity metrics.
- **The Loss**: Real solutions fail to reach the right audience due to lack of context.

## Services
- **AI-Led ABM**: Cross-channel orchestration and buying committee mapping.
- **Content Demand**: Asset distribution with high-intent qualification.
- **AI SDR**: Autonomous first-touch outreach and meeting booking.
- **Appointments**: BANT-qualified sales appointments.
- **Intelligence**: Deep research and GTM strategy support.
- **Data**: Verification and enrichment services.

## Outreach Philosophy (The Four Principles)
1. **Permission is Earned**: Prove value in every interaction.
2. **Context Over Content**: Relevancy and timing matter more than just "good copy".
3. **Data is Evidence**: We verify facts and attribute sources; no hallucinations.
4. **Judgment at Scale**: AI that thinks and reasons, not just automates tasks.

## Operational Process
1. **Discovery & Strategy**: Define ICP and campaign architecture.
2. **Intelligence Activation**: AI agents research and verify targets.
3. **Precision Content**: Generate context-aware messaging.
4. **Agentic Execution**: Deploy Voice (Gemini Live) and Email agents.
5. **Optimization & Handoff**: Continuous improvement and lead delivery.

## Corporate Identity
- **Founder**: Zahid Mohammadi
- **History**: 10+ years in B2B, started in 2017.
- **Scale**: 2M+ leads generated, 500+ enterprise clients.
- **Tagline**: Human Led Intelligence, AI led Execution of modern demand.
`;

  try {
    await updateSuperOrganization({
      identity,
      offerings,
      icp,
      positioning,
      outreach,
      compiledOrgContext
    });
    console.log("Super Organization updated successfully.");
  } catch (error) {
    console.error("Failed to update Super Organization:", error);
    process.exit(1);
  }
}

main().catch(console.error).finally(() => process.exit(0));
