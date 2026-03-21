/**
 * Unified Brand Messaging Framework
 *
 * SINGLE SOURCE OF TRUTH for all brand messaging across the DemandGentic AI platform.
 * This file is imported by both client and server code.
 *
 * Pure TypeScript constants only - no imports, no async, no side effects.
 *
 * Usage:
 *   import { BRAND, TAGLINE, STATS, ... } from '@shared/brand-messaging';
 */

// ==================== COMPANY IDENTITY ====================

export const BRAND = {
  company: {
    legalName: 'Pivotal B2B LLC',
    productName: 'DemandGentic.ai',
    shortName: 'DemandGentic',
    parentBrand: 'Pivotal B2B',
    logoInitials: 'PB',
    location: 'Lewes, Delaware',
    phone: '(417) 900-3844',
    foundedYear: 2017,
    foundedLocation: 'Kabul, Afghanistan',
    copyrightYear: 2026,
    industry: 'Technology / B2B Demand Generation',
  },

  domains: {
    primary: 'demandgentic.ai',
    corporate: 'pivotalb2b.com',
    email: {
      contact: 'contact@demandgentic.ai',
      support: 'support@demandgentic.ai',
    },
  },

  social: {
    linkedin: 'https://www.linkedin.com/company/pivotal-b2b',
  },

  founder: {
    name: 'Zahid Mohammadi',
    title: 'CEO & The Architect',
    initials: 'ZM',
    origin: 'Kabul, Afghanistan',
  },
} as const;

// ==================== TAGLINES & POSITIONING ====================

export const TAGLINE = {
  /** The primary tagline used across the platform */
  primary: 'Human-Led Strategy. AI-Powered Execution.',
  /** The full branded tagline with product name */
  full: 'DemandGentic\u2014Human-Led Strategy. AI-Powered Execution.',
  /** Our identity statement */
  identity: 'Demand Problem Solvers',
  /** Mission statement */
  mission: 'Systematized Sincerity',
  /** Philosophy statement */
  philosophy: 'Restoring the Human in the Loop',
  /** Core promise - the defining commitment */
  corePromise: 'No interaction happens without reasoning first, and no interaction is ever forgotten.',
  /** Hero headline */
  heroHeadline: 'The End of Algorithmic Noise.',
  /** Hero sub-headline */
  heroSubHeadline: 'The Era of Agentic ABM Demand Reasoning.',
  /** Hero description */
  heroDescription: 'Problem Intelligence. Solution Mapping. Pinpoint Context. A B2B demand engine trained on 11+ years of front-line experience \u2014 where no interaction happens without reasoning first, and no interaction is ever forgotten.',
  /** Footer tagline */
  footerTagline: 'Your entire revenue engine. Voice, content, pipeline, data \u2014 one intelligent platform.',
  /** About page footer tagline */
  footerTaglineAbout: 'Technology as a steward of progress \u2014 using data to solve problems, not create noise.',
} as const;

// ==================== CORE PILLARS ====================

export const PILLARS = [
  {
    key: 'problem-intelligence',
    label: 'Problem Intelligence',
    iconName: 'Brain',
    color: 'violet',
  },
  {
    key: 'solution-mapping',
    label: 'Solution Mapping',
    iconName: 'Target',
    color: 'indigo',
  },
  {
    key: 'pinpoint-context',
    label: 'Pinpoint Context',
    iconName: 'Search',
    color: 'blue',
  },
  {
    key: 'compliance-first',
    label: 'Compliance First',
    iconName: 'Shield',
    color: 'emerald',
  },
] as const;

// ==================== STATS ====================

export const STATS = {
  yearsExperience: '11+',
  leadsGenerated: '2M+',
  enterpriseClients: '50+',
  contentEngines: '7',
  industriesServed: '40+',
  verifiedContacts: '70M+',
  countriesCovered: '195+',
  emailAccuracy: '98%',
  globalCampaigns: '100+',
  dataRefresh: 'Weekly',
} as const;

// ==================== PROBLEM FRAMEWORK ====================

export const PROBLEM_FRAMEWORK = {
  headline: 'The World is Drowning in Unintelligent Outreach.',
  subheadline: 'Traditional demand generation is broken. Buyers are overwhelmed, trust is eroding, and real solutions never reach the right ears.',
  problems: [
    {
      id: 'noise',
      number: '01',
      label: 'The Noise',
      title: 'Volume Over Intent',
      description: 'Automated spam erodes buyer trust. Spray-and-pray tactics ignore context, damage brands, and train prospects to delete without reading.',
      stat: { value: '91%', label: 'of B2B emails ignored' },
      iconName: 'Volume2',
      color: 'red',
    },
    {
      id: 'waste',
      number: '02',
      label: 'The Waste',
      title: 'Dirty Data, Hollow Metrics',
      description: 'Decisions made on outdated contacts and vanity metrics. Generic sequences that fail to reason or adapt to real buyer signals.',
      stat: { value: '30%', label: 'of B2B data decays yearly' },
      iconName: 'Database',
      color: 'amber',
    },
    {
      id: 'loss',
      number: '03',
      label: 'The Loss',
      title: 'Solutions Miss Their Audience',
      description: 'Real solutions never reach the right ear because they lack the right story, the right timing, and the right context.',
      stat: { value: '67%', label: 'of journeys happen pre-sales' },
      iconName: 'Target',
      color: 'blue',
    },
  ],
  summaryTop: 'CRMs store data. Marketing tools send messages. SDRs chase activity. Content teams scramble to keep up. None of them truly reason.',
  summaryHighlight: {
    problemIntelligence: 'problem intelligence',
    solutionMapping: 'solution mapping',
    pinpointContext: 'pinpoint context',
  },
  summaryBottom: 'Every interaction happens without reasoning. Every conversation is forgotten at the contact and account level.',
} as const;

// ==================== FOUR PILLARS (Solution Section) ====================

export const SOLUTION_PILLARS = [
  {
    badge: 'Demand Problem Solvers',
    title: 'Human-Led Strategy',
    description: '11+ years of front-line B2B demand experience. We lead with problem intelligence, solution mapping, and empathy \u2014 AI executes what humans architect.',
    quote: 'Truth, human connection, and empathy are never optional.',
    iconName: 'Users',
    color: 'violet',
  },
  {
    badge: 'Agentic Intelligence',
    title: 'Agentic Intelligence',
    description: 'Purpose-built agents powered by organization intelligence \u2014 reasoning first, compliance first, and never forgetting a single interaction at contact or account level.',
    quote: 'No interaction happens without reasoning first.',
    iconName: 'Brain',
    color: 'indigo',
  },
  {
    badge: 'Content Studio',
    title: 'Generative Content',
    description: 'Landing pages, emails, blogs, eBooks, solution briefs, and images \u2014 all generated with your brand voice and published in one click.',
    quote: 'An entire content team, powered by AI, guided by your brand.',
    iconName: 'Wand2',
    color: 'emerald',
  },
  {
    badge: 'Global Data',
    title: 'Precision Data',
    description: '70M+ verified contacts across 195 countries. 98% email accuracy. Weekly refresh. Multi-source verification.',
    quote: 'Your campaigns are only as good as your data. Ours is the best.',
    iconName: 'Database',
    color: 'blue',
  },
] as const;

// ==================== SERVICES CATALOG ====================

export const SERVICES = [
  {
    id: 'abm',
    badge: 'ABM',
    title: 'AI-Led Account-Based Marketing',
    description: 'Target, engage, and convert high-value accounts with intelligence-driven orchestration across email, voice, and content.',
    features: ['Buying committee mapping', 'Cross-channel orchestration', 'Account-level reasoning'],
    idealFor: 'Enterprise & mid-market B2B',
    iconName: 'Target',
    color: 'violet',
  },
  {
    id: 'voice-ai',
    badge: 'Voice AI',
    title: 'Autonomous Voice AI',
    description: 'AI systems that make and receive real phone calls with natural conversation, live objection handling, and seamless meeting booking.',
    features: ['Live phone conversations', 'Real-time qualification', 'Gatekeeper navigation'],
    idealFor: 'Outbound at scale without headcount',
    iconName: 'Phone',
    color: 'amber',
  },
  {
    id: 'email',
    badge: 'Email Marketing',
    title: 'Intelligent Email Marketing',
    description: 'AI-crafted email campaigns with persona-specific sequences, smart send-time optimization, and reply sentiment analysis \u2014 every email reasoned before it\'s sent.',
    features: ['Persona-specific sequences', 'Send-time optimization', 'Reply sentiment analysis'],
    idealFor: 'Nurture & conversion at scale',
    iconName: 'Mail',
    color: 'sky',
  },
  {
    id: 'content-studio',
    badge: 'Content Studio',
    title: 'Generative Content Creation',
    description: 'A full AI-powered content studio that generates landing pages, email campaigns, blog posts, eBooks, solution briefs, and images \u2014 all in your brand voice.',
    features: ['7 content generation engines', 'One-click publishing', 'AI-powered refinement'],
    idealFor: 'Campaign content at speed',
    iconName: 'Wand2',
    color: 'emerald',
  },
  {
    id: 'ai-sdr',
    badge: 'AI SDR',
    title: 'AI SDR-as-a-Service',
    description: 'Autonomous AI agents conduct first-touch outreach, qualification, follow-ups, and meeting booking across voice and email.',
    features: ['24/7 autonomous engagement', 'Human strategist oversight', 'Intelligent escalation'],
    idealFor: 'Scale without headcount',
    iconName: 'Bot',
    color: 'blue',
  },
  {
    id: 'pipeline',
    badge: 'Pipeline',
    title: 'Intelligent Pipeline Management',
    description: 'Manage your entire top-of-funnel with AI-driven account staging, automated AE assignment, and buyer journey tracking.',
    features: ['AI-powered AE assignment', 'Buyer journey stages', 'Account intelligence scoring'],
    idealFor: 'Pipeline visibility & control',
    iconName: 'LayoutDashboard',
    color: 'indigo',
  },
  {
    id: 'appointments',
    badge: 'Appointments',
    title: 'Qualified Appointment Generation',
    description: 'We deliver BANT-qualified sales appointments directly to your team\'s calendar through multi-channel outreach.',
    features: ['Full top-of-funnel management', 'Multi-channel outreach', 'No-show follow-up'],
    idealFor: 'Sales efficiency',
    iconName: 'Calendar',
    color: 'rose',
  },
  {
    id: 'intelligence',
    badge: 'Intelligence',
    title: 'Market & Account Intelligence',
    description: 'Deep research, enrichment, and analysis of accounts and industries to power better GTM decisions.',
    features: ['ICP refinement', 'Competitive landscape', 'Buying signal detection'],
    idealFor: 'GTM strategy',
    iconName: 'Search',
    color: 'cyan',
  },
  {
    id: 'data',
    badge: 'Data',
    title: 'B2B Data & Enrichment',
    description: 'Access our 70M+ verified contact database or enrich your existing data with our verification engine.',
    features: ['Custom list building', 'Database enrichment', 'Continuous hygiene'],
    idealFor: 'Campaign fuel',
    iconName: 'Database',
    color: 'slate',
  },
] as const;

// ==================== AI AGENTS ====================

export const AGENTS = [
  {
    id: 'research',
    title: 'Research Agent',
    subtitle: 'Demand Intel',
    description: 'Autonomous fact-gathering and strategic synthesis. Researches accounts, verifies data, and generates actionable intelligence briefs.',
    capabilities: ['Multi-source verification', 'Problem-to-account matching', 'Confidence scoring'],
    iconName: 'Search',
    color: 'emerald',
  },
  {
    id: 'voice',
    title: 'Voice Agent',
    subtitle: 'Live Conversations',
    description: 'AI that makes real phone calls with natural speech, live objection handling, and the ability to book meetings mid-conversation.',
    capabilities: ['Natural live conversations', 'Gatekeeper navigation', 'Real-time BANT qualification'],
    iconName: 'Phone',
    color: 'amber',
  },
  {
    id: 'email',
    title: 'Email Agent',
    subtitle: 'Demand Engage',
    description: 'AI trained on millions of B2B campaigns. Crafts persona-specific sequences that know when to push and when to nurture.',
    capabilities: ['Persona-specific copy', 'Sequence optimization', 'Reply sentiment analysis'],
    iconName: 'Mail',
    color: 'blue',
  },
  {
    id: 'content',
    title: 'Content Agent',
    subtitle: 'Creative Studio',
    description: 'Creates complete campaign assets \u2014 landing pages, email templates, blog posts, eBooks, solution briefs, and images \u2014 all in your brand voice.',
    capabilities: ['7 content engines', 'One-click publish', 'AI-powered refinement'],
    iconName: 'Wand2',
    color: 'violet',
  },
  {
    id: 'pipeline',
    title: 'Pipeline Agent',
    subtitle: 'Account Intelligence',
    description: 'Manages your top-of-funnel pipeline. Scores accounts, tracks buyer journeys through stages, and intelligently assigns reps to opportunities.',
    capabilities: ['AI-driven AE assignment', 'Buyer journey tracking', 'Account stage automation'],
    iconName: 'LayoutDashboard',
    color: 'indigo',
  },
  {
    id: 'qa',
    title: 'QA Agent',
    subtitle: 'Compliance & Quality',
    description: 'Real-time auditing across every interaction for quality, accuracy, and compliance. Ensures every touchpoint meets your standards.',
    capabilities: ['Real-time monitoring', 'Policy enforcement', 'Audit trail generation'],
    iconName: 'Shield',
    color: 'rose',
  },
] as const;

// ==================== PROCESS STEPS ====================

export const PROCESS_STEPS = [
  {
    step: '01',
    title: 'Discovery & Strategy',
    description: 'Our strategists map your solutions to buyer problems. We define ICP, build frameworks, and design campaign architecture.',
    deliverable: 'Custom campaign strategy',
    iconName: 'Lightbulb',
    color: 'violet',
  },
  {
    step: '02',
    title: 'Intelligence Activation',
    description: 'AI agents scan our 70M+ database, research accounts, verify facts, and match prospects to your problem framework.',
    deliverable: 'Verified target accounts',
    iconName: 'Search',
    color: 'indigo',
  },
  {
    step: '03',
    title: 'Content Generation',
    description: 'AI creates landing pages, emails, blogs, eBooks, and solution briefs \u2014 all in your brand voice, ready to publish.',
    deliverable: 'Full campaign content suite',
    iconName: 'Wand2',
    color: 'emerald',
  },
  {
    step: '04',
    title: 'Multi-Channel Execution',
    description: 'Voice agents hold live conversations. Email sequences deploy intelligently. Content publishes to branded pages.',
    deliverable: 'Active campaign execution',
    iconName: 'Zap',
    color: 'blue',
  },
  {
    step: '05',
    title: 'Pipeline Management',
    description: 'Accounts flow through intelligent pipeline stages. AI assigns reps, tracks buyer journeys, and surfaces ready-to-close opportunities.',
    deliverable: 'Managed pipeline with AE assignment',
    iconName: 'LayoutDashboard',
    color: 'amber',
  },
  {
    step: '06',
    title: 'Optimization & Handoff',
    description: 'Continuous analysis identifies what\'s working. AI optimizes in real-time. Qualified leads delivered to your sales team.',
    deliverable: 'BANT-qualified leads',
    iconName: 'TrendingUp',
    color: 'rose',
  },
] as const;

// ==================== PRINCIPLES ====================

export const PRINCIPLES = [
  {
    number: '01',
    title: 'Reasoning First',
    description: 'No interaction happens without reasoning first. Every touchpoint is researched, contextualized, and justified before it reaches a human being.',
    iconName: 'Brain',
  },
  {
    number: '02',
    title: 'Nothing Forgotten',
    description: 'No interaction is ever forgotten at the contact or account level. Every conversation, every signal, every response \u2014 remembered and reasoned upon.',
    iconName: 'Database',
  },
  {
    number: '03',
    title: 'Compliance First',
    description: 'Trust is earned through transparency. Every agent operates within compliance boundaries. Every data point is sourced, verified, and governed.',
    iconName: 'Shield',
  },
  {
    number: '04',
    title: 'Truth & Empathy',
    description: 'Human-to-human connection and empathy always come first. We believe in truth over vanity metrics, real conversations over automated noise.',
    iconName: 'UserCheck',
  },
] as const;

// ==================== VALUES ====================

export const VALUES = [
  {
    title: 'Integrity First',
    description: 'Every action, every algorithm, every interaction is built on a foundation of honesty and transparency.',
    iconName: 'Shield',
  },
  {
    title: 'Human-Centric',
    description: 'Technology serves humans, not the other way around. We never forget the person at the other end.',
    iconName: 'Heart',
  },
  {
    title: 'Purposeful Innovation',
    description: 'We don\'t build technology for technology\'s sake. Every feature solves a real human challenge.',
    iconName: 'Compass',
  },
  {
    title: 'Stewardship',
    description: 'We are stewards of progress \u2014 using our capabilities to build a better future for all.',
    iconName: 'Users',
  },
] as const;

// ==================== MILESTONES ====================

export const MILESTONES = [
  {
    year: '2017',
    title: 'The Beginning',
    description: 'Founded Pivotal B2B in Afghanistan, serving global tech markets against all odds. Learned that every interaction counts when the stakes are real.',
    iconName: 'Flag',
    color: 'amber',
  },
  {
    year: '2020-2024',
    title: 'Global Expansion',
    description: 'Managed 100+ global demand generation campaigns, identifying the fatal flaws in traditional \'Volume-First\' automation. Saw the need for reasoning.',
    iconName: 'Globe',
    color: 'violet',
  },
  {
    year: '2025',
    title: 'The Intelligence Layer',
    description: 'Engineered the Reasoning & Problem-Intelligence Layer, moving beyond simple AI toward Agentic Autonomy. Built the foundation for intelligent demand.',
    iconName: 'Brain',
    color: 'indigo',
  },
  {
    year: '2026',
    title: 'DemandGentic AI',
    description: 'Launched DemandGentic AI \u2014 the world\'s first account-aware, ethically-aligned demand engine. The culmination of a decade of frontline experience.',
    iconName: 'Rocket',
    color: 'blue',
  },
] as const;

// ==================== BRAND VOICE GUIDELINES ====================

export const BRAND_VOICE = {
  personality: {
    /** Scale from 0 (fully left) to 1 (fully right) */
    dimensions: {
      /** 0 = fully technical, 1 = fully accessible */
      technicalAccessible: 0.6,
      /** 0 = fully casual, 1 = fully formal */
      formalCasual: 0.7,
      /** 0 = fully conservative, 1 = fully bold */
      boldConservative: 0.65,
    },
    /** Traits that define the brand voice */
    traits: ['Empathetic', 'Authoritative', 'Transparent', 'Purposeful', 'Human-Centric'],
    /** Traits to explicitly avoid */
    antiTraits: ['Salesy', 'Generic', 'Hype-driven', 'Manipulative', 'Robotic', 'Impersonal'],
  },

  toneGuidelines: {
    formal: 'Used in proposals, case studies, executive communications, and enterprise presentations. Maintain authority while remaining accessible. Lead with data and outcomes.',
    conversational: 'Used in social media, blog posts, nurture emails, and community engagement. Warm, approachable, but still purposeful. Avoid fluff.',
    insightful: 'Used in thought leadership, industry analysis, and strategic content. Demonstrate deep expertise. Challenge conventional thinking with evidence.',
    persuasive: 'Used in landing pages, CTAs, conversion content, and sales collateral. Lead with the problem, present the solution, prove with evidence. Never manipulate.',
    technical: 'Used in documentation, integration guides, API references, and developer content. Clear, precise, well-structured. Respect the reader\'s expertise.',
  },

  vocabulary: {
    /** Words and phrases to use frequently */
    preferred: [
      'reasoning', 'intelligence', 'stewardship', 'demand problem-solving',
      'human connection', 'empathy', 'compliance', 'trust',
      'context', 'precision', 'verified', 'qualified',
      'front-line experience', 'organization intelligence',
      'agentic', 'purpose-built', 'account-aware',
    ],
    /** Words and phrases to avoid */
    avoid: [
      'spam', 'blast', 'spray-and-pray', 'automate blindly',
      'growth hack', 'disrupt', 'synergy', 'leverage',
      'crush it', 'hustle', 'ninja', 'guru',
      'vanity metrics', 'just automate', 'scale everything',
    ],
  },

  /** Key phrases that embody the brand - use in content generation and agent prompts */
  keyPhrases: [
    'No interaction happens without reasoning first',
    'No interaction is ever forgotten',
    'Truth, human connection, and empathy are never optional',
    'Human-Led Strategy. AI-Powered Execution.',
    'We are Demand Problem Solvers',
    'Problem Intelligence. Solution Mapping. Pinpoint Context.',
    'Reasoning first. Compliance first. Nothing forgotten.',
    'The machine is the map; the human spirit is the compass.',
    'Technology as a steward of progress',
    'We don\'t generate demand; we map solutions to human challenges',
  ],
} as const;

// ==================== SEO METADATA ====================

export const SEO = {
  defaultTitle: `${BRAND.company.parentBrand}: ${TAGLINE.full}`,
  defaultDescription: `${BRAND.company.parentBrand}: ${TAGLINE.full} Enterprise CRM platform with AI-powered lead qualification, multi-channel campaigns, and comprehensive analytics for B2B demand generation. Powered by Google Gemini AI.`,
  defaultKeywords: 'B2B Demand Generation, AI CRM, Google Gemini AI, Automated Lead Qualification, Conversational AI, Email Automation, Sales Intelligence, Pivotal B2B, AI Sales Agents, Autonomous CRM, Predictive Analytics, Gemini Flash, Voice AI, Outbound AI, Intelligent Campaigns, Revenue Operations, B2B Marketing Automation',
  ogSiteName: BRAND.company.productName,
  twitterTitle: `${BRAND.company.productName} - AI-Powered B2B Demand Generation`,
  twitterDescription: `Scale your B2B growth with ${BRAND.company.productName}. AI-driven lead qualification, autonomous campaigns, and intelligent CRM capabilities powered by Gemini.`,
  canonicalUrl: `https://${BRAND.domains.primary}/`,
  ogImageUrl: `https://${BRAND.domains.primary}/demangent-logo.png`,
} as const;

// ==================== SOCIAL PROFILE DESCRIPTIONS ====================

export const SOCIAL_PROFILES = {
  linkedin: {
    headline: `${BRAND.company.parentBrand} | ${TAGLINE.primary}`,
    bio: `${TAGLINE.identity}. ${BRAND.company.productName} is an AI-powered demand generation platform built on ${STATS.yearsExperience} years of front-line B2B experience. We combine Problem Intelligence, Solution Mapping, and Pinpoint Context to build demand that actually converts. ${STATS.verifiedContacts} verified contacts. ${STATS.countriesCovered} countries. Voice AI, email, content, pipeline \u2014 one intelligent platform.`,
    tagline: TAGLINE.primary,
  },
  twitter: {
    headline: `${BRAND.company.productName} | ${TAGLINE.identity}`,
    bio: `AI-powered B2B demand generation. ${TAGLINE.primary} Problem Intelligence \u00B7 Solution Mapping \u00B7 Pinpoint Context. Built on ${STATS.yearsExperience} years of front-line experience.`,
  },
  facebook: {
    headline: `${BRAND.company.parentBrand} - ${TAGLINE.primary}`,
    bio: `${BRAND.company.productName} is the AI-powered demand generation platform by ${BRAND.company.parentBrand}. ${STATS.yearsExperience} years of B2B expertise, ${STATS.verifiedContacts} verified contacts, ${STATS.countriesCovered} countries served.`,
  },
} as const;

// ==================== AGENT DEFAULT PROMPTS ====================
// These replace the generic defaults in org-intelligence-helper.ts

export const AGENT_DEFAULTS = {
  orgIntelligence: `**Organization Context**
You are operating on behalf of ${BRAND.company.legalName}, through the ${BRAND.company.productName} platform.
${BRAND.company.productName} is an AI-powered demand generation platform \u2014 ${TAGLINE.primary}

**Identity**: ${TAGLINE.identity} \u2014 We are a B2B demand generation company built on ${STATS.yearsExperience} years of front-line experience.
**Mission**: ${TAGLINE.mission} \u2014 ${TAGLINE.philosophy}
**Core Promise**: ${TAGLINE.corePromise}

**Value Proposition**
- We help B2B companies build demand with intelligence, not volume
- Problem Intelligence, Solution Mapping, Pinpoint Context, Compliance First
- Every interaction is reasoned before execution and never forgotten at the contact or account level
- We lead with empathy, truth, and human connection \u2014 these are never optional

**What We Offer**
- AI Voice Agents for live phone conversations with natural speech and real-time qualification
- Intelligent Email Marketing with persona-specific sequences and sentiment analysis
- Generative Content Studio for landing pages, emails, blogs, eBooks, solution briefs
- AI-Led Account-Based Marketing with buying committee mapping
- Intelligent Pipeline Management with AI-powered AE assignment
- ${STATS.verifiedContacts} verified B2B contacts across ${STATS.countriesCovered} countries with ${STATS.emailAccuracy} email accuracy

**Target Audience**
- B2B companies seeking intelligent demand generation that converts
- Sales and marketing leaders tired of algorithmic noise and vanity metrics
- Revenue teams looking for qualified pipeline and BANT-qualified appointments
- Companies in technology, SaaS, professional services, and 40+ other industries

**Key Differentiators**
- Agentic AI powered by Organization Intelligence \u2014 every agent reasons before it acts
- ${STATS.yearsExperience} years of front-line B2B demand experience, not theory
- Full-service platform: voice, email, content, pipeline, data \u2014 one intelligent system
- Compliance-first design: TCPA, GDPR, CCPA woven into every layer
- ${STATS.verifiedContacts} verified contacts with weekly refresh and multi-source verification`,

  compliancePolicy: `**Compliance Requirements \u2014 ${BRAND.company.productName}**
${BRAND.company.legalName} operates with compliance as a foundational principle, not a checkbox.
- Honor all opt-out requests immediately and permanently
- Never call numbers on Do Not Call lists
- Respect business hours (8am-6pm in recipient's timezone)
- Document all consent and opt-out requests
- Never misrepresent identity or purpose
- Comply with TCPA, GDPR, CCPA and regional regulations
- Every data point is sourced, verified, and governed
- Trust is earned through transparency in every interaction`,

  platformPolicies: `**Platform Rules \u2014 ${BRAND.company.productName}**
As a ${TAGLINE.identity} agent operating under ${BRAND.company.legalName}:
- Calls must have a clear, legitimate business purpose
- Never use deceptive tactics or high-pressure techniques
- Maintain professional, respectful tone at all times \u2014 lead with empathy
- End calls gracefully when requested
- Report any compliance concerns immediately
- Every conversation should provide value regardless of outcome
- We lead with insight, not sales pressure
- Truth, human connection, and empathy are never optional`,

  voiceDefaults: `**Voice & Communication Style \u2014 ${BRAND.company.productName}**
As an agent of ${TAGLINE.identity}:
- Speak clearly at a natural, unhurried pace
- Use professional but warm language \u2014 empathetic, authoritative, transparent, purposeful
- Ask one question at a time and wait for response
- Listen actively without interrupting
- Acknowledge what the other person says before responding
- If uncertain, ask for clarification rather than assuming
- Lead with problem intelligence \u2014 understand their challenges before presenting solutions
- Every interaction should demonstrate that business can be done with integrity
- Remember: no interaction happens without reasoning first`,
} as const;

// ==================== FOOTER CONSTANTS ====================

export const FOOTER = {
  copyright: `\u00A9 ${BRAND.company.copyrightYear} ${BRAND.company.legalName}. All rights reserved. ${BRAND.company.productName} is a product of ${BRAND.company.legalName}.`,
  navSections: {
    platform: ['AI Agents', 'Voice AI', 'Content Studio', 'Pipeline Intelligence', 'Data & Intelligence'],
    services: ['AI-Led ABM', 'Conversational Voice AI', 'Generative Content', 'AI SDR', 'Appointments', 'Data Services'],
    resources: ['Resources Center', 'About Us', 'Our Story'],
    getStarted: ['Schedule a Meeting', 'Request a Proposal', 'Contact Us'],
  },
} as const;

// ==================== DATA SECTION CONSTANTS ====================

export const DATA_SECTION = {
  headline: 'The Most Accurate B2B Data on the Planet.',
  subheadline: 'Your campaigns are only as good as your data. We invested in building the most comprehensive, accurate, and actionable B2B database available.',
  stats: [
    { number: STATS.verifiedContacts, label: 'Verified B2B Contacts', sublabel: 'Decision-makers across every industry', iconName: 'Users' },
    { number: STATS.countriesCovered, label: 'Countries Covered', sublabel: 'True global reach for campaigns', iconName: 'Globe' },
    { number: STATS.emailAccuracy, label: 'Email Accuracy', sublabel: 'Real-time verification before send', iconName: 'Target' },
    { number: STATS.dataRefresh, label: 'Data Refresh', sublabel: 'Continuous hygiene eliminates decay', iconName: 'RefreshCw' },
  ],
  promise: {
    headline: 'No Hallucinations. No Guesswork. No Decay.',
    description: 'Every fact in our database is tagged as verified, inferred, or unknown \u2014 with full source attribution. We don\'t just collect data; we collect evidence.',
  },
} as const;

// ==================== CONTENT STUDIO SECTION ====================

export const CONTENT_STUDIO = {
  headline: 'Create Entire Campaigns. In Minutes, Not Months.',
  subheadline: 'Stop waiting weeks for content. Our AI-powered studio generates conversion-ready landing pages, email campaigns, blog posts, eBooks, solution briefs, and images \u2014 all aligned to your brand, your audience, and your campaign goals.',
  engines: [
    { title: 'Landing Pages', description: 'Full responsive landing pages with forms, CTAs, and SEO \u2014 generated and published with a single click.', iconName: 'Globe', color: 'violet' },
    { title: 'Email Campaigns', description: 'Persona-targeted email templates and sequences that match your tone, your offer, and your audience\'s pain points.', iconName: 'Mail', color: 'blue' },
    { title: 'Blog Posts', description: 'SEO-optimized thought leadership content that positions your brand as the authority in your space.', iconName: 'FileText', color: 'indigo' },
    { title: 'eBooks & Briefs', description: 'Long-form eBooks and solution briefs designed to educate buyers and drive high-intent lead capture.', iconName: 'BookOpen', color: 'emerald' },
  ],
  capabilities: [
    { title: 'Generate', description: 'Describe what you need. The AI creates complete, publication-ready content with your brand voice, value propositions, and audience context built in.', iconName: 'Sparkles', color: 'violet' },
    { title: 'Refine', description: 'Chat with the AI to iterate. Adjust tone, expand sections, add CTAs, or rework entire pieces \u2014 all through natural conversation.', iconName: 'PenTool', color: 'emerald' },
    { title: 'Publish', description: 'One click to go live. Landing pages publish to branded URLs with full SEO. Content saves to your asset library for campaign use across all channels.', iconName: 'Globe', color: 'blue' },
  ],
} as const;

// ==================== PUBLIC PAGES MESSAGING ====================

export const PUBLIC_PAGES_MESSAGING = {
  /** Primary headline for public-facing pages */
  headline: 'The End of Algorithmic Noise.',
  /** Secondary headline */
  subHeadline: 'The Era of Agentic Reasoning.',
  /** Category positioning statement */
  category: 'Enterprise Agentic Account-Based Marketing',
  /** Core positioning tagline for public pages */
  tagline: 'Human-led ABM strategy. Reasoning-first AI execution. Governed, measurable pipeline outcomes.',
  /** Main value proposition paragraph */
  valueProposition: 'DemandGentic transforms your ABM strategy into coordinated, multi-channel execution across conversational voice, intelligent email, and pipeline workflows\u2014delivering qualified pipeline from target accounts without compromising compliance, data accuracy, or brand integrity.',
  /** Pipeline protection messaging */
  pipelineProtection: {
    headline: 'We do more than generate sales pipeline.',
    subHeadline: 'We protect it.',
    description: 'In a market saturated with fabricated engagement, bot-driven clicks, and budget-inflated "performance," B2B organizations are unknowingly buying noise instead of intent. Millions are spent on activity that never converts to revenue.',
    resolution: 'DemandGentic safeguards your pipeline from artificial engagement and misaligned traffic. Every touchpoint is reasoning-driven, ICP-aligned, compliance-checked, and strategically orchestrated\u2014ensuring your brand reaches real decision-makers inside real accounts.',
  },
  /** Precision statement */
  precisionStatement: {
    contrast: 'This is not automation at scale.',
    assertion: 'This is precision at scale.',
  },
  /** What We Deliver section */
  deliverables: [
    'Strategic, human-designed ABM frameworks',
    'Agentic AI execution grounded in contextual reasoning and shared memory',
    'Multi-channel orchestration (voice, email, workflow triggers)',
    'Verified, compliant engagement with suppression and policy controls',
    'Continuous QA, scoring, and optimization across campaign touchpoints',
    'Brand-controlled messaging and approvals across every interaction',
  ],
  /** Closing statement */
  closingStatement: {
    contrast: 'Algorithmic noise created the illusion of scale.',
    assertion: 'Agentic reasoning creates accountable revenue outcomes.',
  },
} as const;

// ==================== HOMEPAGE GOVERNANCE MODEL ====================

export const HOMEPAGE_GOVERNANCE = {
  version: '2026.03',
  releaseLabel: 'Governed platform narrative',
  managedThrough: [
    'Product feature registry',
    'Content governance',
    'Design governance',
    'AI governance',
    'Version history',
  ],
  navigation: [
    { label: 'Platform Story', href: '#story' },
    { label: 'Platform', href: '#platform' },
    { label: 'Governance', href: '#governance' },
    { label: 'About', href: '#about' },
  ],
  hero: {
    badge: 'Platform release narrative',
    eyebrow: 'One governed system for demand generation execution',
    headline: 'From signal to conversation to pipeline.',
    subHeadline: 'Research. Generate. Simulate. Launch. Govern. Learn.',
    summary:
      'DemandGentic replaces the disconnected dialer, email, ABM, content, and QA stack with one reasoning-first platform for B2B revenue teams. Every message is grounded in organization intelligence, every launch is reviewable, and every outcome feeds the next move.',
    bullets: [
      'Organization Intelligence and Problem Intelligence shape every touchpoint before outreach begins.',
      'Voice, email, landing pages, and workflow execution run inside one shared operating layer.',
      'Preview Studio, QA, content governance, and AI governance keep execution controlled before and after launch.',
    ],
    primaryCta: 'Book a Live Strategy Session',
    secondaryCta: 'See How The Platform Works',
    supportingLabel: 'Managed through content governance',
  },
  proofBar: [
    { value: STATS.yearsExperience, label: 'years of front-line demand generation experience' },
    { value: String(AGENTS.length), label: 'purpose-built agent roles in the council' },
    { value: STATS.contentEngines, label: 'Generative Studio engines in one workflow' },
    { value: STATS.verifiedContacts, label: 'verified contacts available for enrichment' },
  ],
  stackFrictions: [
    {
      title: 'Fragmented execution',
      stat: '3-5 disconnected tools',
      description:
        'Most teams still stitch together a dialer, email platform, ABM system, content tools, and QA spreadsheets. Context breaks between every handoff.',
      iconName: 'Layers',
    },
    {
      title: 'Generic outreach',
      stat: '0 shared memory',
      description:
        'Without organization context, problem mapping, and account-level memory, campaigns repeat the same story to every account and call that scale.',
      iconName: 'MessageSquare',
    },
    {
      title: 'Ungoverned AI',
      stat: 'High brand risk',
      description:
        'If teams cannot see which content is current, which model is active, or which approvals were applied, automation becomes a liability instead of an advantage.',
      iconName: 'ShieldCheck',
    },
  ],
  orchestrationFlow: [
    {
      step: '01',
      title: 'Build the intelligence layer',
      description:
        'Organization Intelligence and account research assemble the ICP, positioning, offer, market context, and buying-committee reality before execution starts.',
    },
    {
      step: '02',
      title: 'Generate campaign assets',
      description:
        'Generative Studio turns the intelligence layer into landing pages, emails, scripts, briefs, and supporting assets aligned to your brand and offer.',
    },
    {
      step: '03',
      title: 'Simulate before launch',
      description:
        'Preview Studio tests voice and email behavior before real execution so teams can refine the story, prompts, and objections without burning accounts.',
    },
    {
      step: '04',
      title: 'Execute across channels',
      description:
        'Voice, email, pages, and workflow triggers run from one operating layer with queue intelligence, routing controls, and shared memory.',
    },
    {
      step: '05',
      title: 'Govern every release',
      description:
        'Feature coverage, page health, approvals, version history, and AI model policy keep the platform auditable as the product story evolves.',
    },
    {
      step: '06',
      title: 'Learn and optimize',
      description:
        'Quality scoring, dispositions, simulations, and campaign analytics flow back into prompts, targeting, and content so execution compounds.',
    },
  ],
  platformModules: [
    {
      name: 'Organization Intelligence',
      category: 'Research layer',
      tone: 'cyan',
      iconName: 'BrainCircuit',
      description:
        'Multi-model context assembly for identity, ICP, positioning, offer architecture, and account-level messaging.',
      highlights: ['Company and ICP context', 'Competitive positioning', 'Account-aware message direction'],
    },
    {
      name: 'AI Voice Runtime',
      category: 'Conversation layer',
      tone: 'amber',
      iconName: 'Phone',
      description:
        'Live conversational calling with structured actions, dispositions, compliance controls, and real-time guidance.',
      highlights: ['Real-time calls', 'Disposition capture', 'Governed provider routing'],
    },
    {
      name: 'Mercury Email System',
      category: 'Inbox layer',
      tone: 'blue',
      iconName: 'Mail',
      description:
        'Persona-specific sequences, deliverability controls, routing, and campaign email generation in one governed system.',
      highlights: ['Sequence orchestration', 'Deliverability intelligence', 'Unified email routing'],
    },
    {
      name: 'Generative Studio',
      category: 'Creation layer',
      tone: 'emerald',
      iconName: 'Wand2',
      description:
        'Landing pages, email assets, blogs, eBooks, solution briefs, images, and refinement workflows generated from shared context.',
      highlights: ['Brand-aligned content', 'One-click publishing', 'Seven content engines'],
    },
    {
      name: 'Preview Studio',
      category: 'Simulation layer',
      tone: 'rose',
      iconName: 'Play',
      description:
        'Run simulations before launch to test messaging, prospect responses, and agent behavior without touching production outreach.',
      highlights: ['Voice simulations', 'Prompt previews', 'Pre-launch validation'],
    },
    {
      name: 'Queue Intelligence',
      category: 'Prioritization layer',
      tone: 'teal',
      iconName: 'LayoutDashboard',
      description:
        'Score accounts and contacts using timing, fit, data quality, and engagement signals so execution follows the best next opportunity.',
      highlights: ['Priority scoring', 'Next-best-action sequencing', 'Human + agent queue visibility'],
    },
    {
      name: 'Content + AI Governance',
      category: 'Control layer',
      tone: 'slate',
      iconName: 'ClipboardCheck',
      description:
        'Track feature coverage, page health, design improvements, approvals, rollback history, and model policies from one control surface.',
      highlights: ['Feature registry', 'Version history', 'Model governance'],
    },
    {
      name: 'QA + Learning Loop',
      category: 'Optimization layer',
      tone: 'indigo',
      iconName: 'RefreshCw',
      description:
        'Conversation quality, reanalysis, simulation feedback, and campaign outcomes continuously refine prompts, content, and targeting.',
      highlights: ['Quality scoring', 'Disposition intelligence', 'Continuous optimization'],
    },
  ],
  governanceStory: {
    badge: 'Managed through governance',
    title: 'The homepage story follows the platform governance model.',
    description:
      'This narrative is intentionally tied to the feature registry, content governance workflow, AI governance policies, and version history so the public story stays aligned with the real product.',
    pillars: [
      {
        title: 'Feature coverage',
        description: 'Homepage sections are mapped to current product capabilities instead of free-floating marketing claims.',
        iconName: 'ClipboardCheck',
      },
      {
        title: 'Preview before publish',
        description: 'Simulation and review come before launch so the message can be tested before it reaches live prospects.',
        iconName: 'Play',
      },
      {
        title: 'Policy-aware execution',
        description: 'Voice and email run under centralized governance for models, compliance constraints, and approvals.',
        iconName: 'ShieldCheck',
      },
      {
        title: 'Versioned evolution',
        description: 'As the platform changes, copy and design can be refreshed with traceable version history instead of ad hoc edits.',
        iconName: 'RefreshCw',
      },
    ],
  },
  audiences: [
    'VP Marketing and demand generation leaders',
    'Revenue operations teams replacing a fragmented GTM stack',
    'Sales development leaders scaling outreach without scaling noise',
    'Agency operators managing multiple clients, approvals, and reporting paths',
  ],
  story: {
    title: 'Why this platform exists',
    body:
      'DemandGentic was built after years of seeing revenue teams buy more automation while losing more context. The goal was never to build louder outbound. The goal was to build a system that reasons before it acts, remembers what happened, and keeps human judgment in control.',
  },
  cta: {
    title: 'See how governed execution changes pipeline quality.',
    description:
      'Walk through the intelligence layer, the campaign operating flow, and the governance controls with the team that designed the platform.',
    primary: 'Book a Live Strategy Session',
    secondary: 'Request a Proposal',
  },
} as const;

// ==================== FOUNDER QUOTES ====================

export const FOUNDER_QUOTES = {
  landing: 'Starting DemandGentic in Afghanistan in 2017 taught me that every interaction counts and every mistake is public. We built DemandGentic.ai to power a system that reasons before it acts, remembers every interaction, and puts truth, human connection, and compliance above everything else.',
  about: 'The machine is the map; the human spirit is the compass. We use both to build a world where technology solves more than it consumes.',
  technology: 'Technology is only as valuable as the integrity behind it.',
} as const;
