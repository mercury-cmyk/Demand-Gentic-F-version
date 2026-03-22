# Skill-Based Voice Agent Framework Implementation

## Overview

This document outlines the implementation of a **Mission-Aligned, Skill-First Voice Agent Framework** for DemanGent.ai B2B demand generation platform.

**Core Principles:**
1. **Mission-First:** All agents act as brand stewards, guided by organization Vision & Mission
2. **Skill-First:** Users select pretrained skills instead of writing prompts
3. **Trust-Optimized:** Agents optimize for long-term relationships, not short-term metrics

**The Result:** Agents are extensions of the organization's intent, not just automation.

---

## 🏗️ System Architecture (3 Layers)

### **Layer 0: Vision & Mission Governance** ⭐ **(HIGHEST PRIORITY)**
- Acts as decision filter for EVERY agent action
- Overrides skill tactics when conflicts arise
- Ensures brand stewardship and long-term trust
- Tracks mission-alignment metrics
- **Cannot be disabled**

### **Layer 1: Universal Voice Agent Brain**
- Mandatory baseline intelligence for ALL voice agents
- Includes:
  - B2B calling etiquette and professionalism
  - Global compliance (GDPR, TCPA, CASL, opt-out handling)
  - Respectful call opening and exit logic
  - Objection handling framework (busy, not interested, timing)
  - Permission-based email follow-up logic
  - Call outcome classification (7 dispositions)
  - CRM auto-logging requirements
  - Human handoff rules
  - Do-not-harass logic
  - Error handling and tone calibration

**This layer cannot be disabled by users.**

### 2. **Skill Definitions** (`server/services/agent-skills.ts`)

#### **Category A: Content & Asset Distribution**
1. **Whitepaper Distribution Agent**
   - Introduces whitepapers in value-driven, non-sales way
   - Verbally summarizes asset content
   - Adapts framing by persona (IT, Marketing, Ops, Leadership)
   - Gauges interest conversationally
   - Requests email permission before sending
   - Success metrics: 60%+ email permission, 40%+ downloads

2. **Research Report Promotion Agent**
   - Positions reports as benchmarking tools
   - Leads with data and credibility
   - Frames as competitive intelligence
   - Highlights sample size and methodology
   - Success metrics: 70%+ delivery rate, 25%+ benchmark discussions

#### **Category B: Event Promotion**
3. **Webinar Registration Agent**
   - Drives confirmed registrations (not just awareness)
   - Emphasizes exclusivity and value
   - Handles objections (time, relevance, skepticism)
   - Pre-empts common concerns (recording availability, duration)
   - Success metrics: 35%+ registration conversion, 60%+ live attendance

4. **Executive Dinner Invitation Agent**
   - High-touch, intimate executive event outreach
   - Respectful, calm, professional tone for C-suite
   - Emphasizes peer-to-peer value and exclusivity
   - Manages dietary preferences and logistics
   - Success metrics: 50%+ RSVP acceptance, 80%+ actual attendance

#### **Planned Skills (Not Yet Implemented):**
- eBook Promotion Agent
- Case Study Distribution Agent
- Leadership Forum Invitation Agent
- Market Research Survey Agent
- Customer Feedback Agent
- MQL/SQL/BANT Qualification Agents

### 3. **Skill Compiler Service** (`server/services/agent-skill-compiler.ts`)
- Compiles skills + user inputs + org intelligence → complete system prompts
- NO PROMPT WRITING REQUIRED
- Layers:
  1. Agent identity & role
  2. Universal Voice Brain (mandatory)
  3. Skill-specific intelligence
  4. Context from user inputs
  5. Organization intelligence
  6. Success criteria & metrics
- Includes input validation
- Generates dynamic first messages with variables

### 4. **Skill Input System**
Each skill defines:
- **Required Inputs**: Must be provided (e.g., asset file, event name, date)
- **Optional Inputs**: Enhance personalization (e.g., target persona, key topics)
- **Input Types**: text, textarea, file, date, url, select, multiselect
- **Validation Rules**: required, minLength, maxLength, pattern

Example: Whitepaper Agent requires:
- Asset PDF upload
- Asset title
- Publishing organization name

Optional:
- Target persona (Marketing, Sales, IT, etc.)
- Key topics to highlight

---

## 🔧 Integration Points

### A. Database Schema Updates Needed

Add to `shared/schema.ts`:

```typescript
export const virtualAgents = pgTable("virtual_agents", {
  // ... existing fields ...

  // NEW FIELDS FOR SKILLS
  skillId: text('skill_id'), // e.g., 'whitepaper_distribution'
  skillInputs: jsonb('skill_inputs'), // User-provided input values
  compiledPromptMetadata: jsonb('compiled_prompt_metadata'), // {sources, compiledAt, skillMetadata}

  // Keep existing fields
  systemPrompt: text("system_prompt"),
  firstMessage: text("first_message"),
  // ...
});
```

### B. API Routes to Add

Add to `server/routes/virtual-agents.ts`:

```typescript
// Get all available skills
router.get('/api/agent-skills', requireAuth, async (req, res) => {
  const skills = getAllSkills();
  res.json(skills);
});

// Get skills by category
router.get('/api/agent-skills/category/:category', requireAuth, async (req, res) => {
  const skills = getSkillsByCategory(req.params.category as AgentSkillCategory);
  res.json(skills);
});

// Get skill details with input requirements
router.get('/api/agent-skills/:skillId', requireAuth, async (req, res) => {
  const skill = getSkillById(req.params.skillId);
  if (!skill) {
    return res.status(404).json({ error: 'Skill not found' });
  }
  res.json(skill);
});

// Create agent from skill
router.post('/api/virtual-agents/create-from-skill', requireAuth, async (req, res) => {
  const { agentName, skillId, skillInputValues, voice, provider } = req.body;

  // Validate inputs
  const validation = validateSkillInputs(skillId, skillInputValues);
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Invalid inputs',
      missingInputs: validation.missingInputs,
      errors: validation.errors
    });
  }

  // Compile skill to prompt
  const compiled = await compileSkillToPrompt({
    agentName,
    skillId,
    skillInputValues,
    organizationName: req.user.organizationName
  });

  // Create agent in database
  const [agent] = await db.insert(virtualAgents).values({
    name: agentName,
    systemPrompt: compiled.systemPrompt,
    firstMessage: compiled.firstMessage,
    skillId,
    skillInputs: skillInputValues,
    compiledPromptMetadata: {
      sources: compiled.sources,
      compiledAt: compiled.compiledAt,
      skillMetadata: compiled.skillMetadata
    },
    voice: voice || 'nova',
    provider: provider || 'openai',
    isActive: true,
    createdBy: req.user.id
  }).returning();

  res.json(agent);
});

// Preview compiled prompt
router.post('/api/agent-skills/preview', requireAuth, async (req, res) => {
  const { agentName, skillId, skillInputValues } = req.body;

  const preview = await previewCompiledPrompt({
    agentName,
    skillId,
    skillInputValues,
    organizationName: req.user.organizationName
  });

  res.json(preview);
});
```

### C. Frontend UI Implementation

Create new component: `client/src/components/virtual-agents/skill-based-agent-creator.tsx`

**UX Flow:**
1. **Agent Name** - Text input
2. **Select Skill** - Grid of skill cards with descriptions
3. **Skill Inputs** - Dynamic form based on selected skill
   - File upload for assets
   - Text inputs for event details
   - Dropdowns for persona selection
4. **Voice & Provider** - Existing selectors
5. **Preview Generated Prompt** - Expandable section showing:
   - Sources used
   - Final system prompt
   - Success metrics
   - Call flow stages
6. **Deploy Agent** - Creates agent immediately

**Key UI Components:**
```tsx
 setSelectedSkill(skill.id)}
/>




```

---

## 🎯 User Experience

### Before (Prompt-First):
1. User creates agent
2. User writes complex system prompt (500+ words)
3. User debugs prompt issues
4. User handles objections manually
5. User tracks compliance separately

### After (Skill-First):
1. User names agent: "Sarah - Whitepaper Specialist"
2. User selects: **Whitepaper Distribution** skill
3. User uploads PDF: `future-of-b2b-marketing.pdf`
4. User enters: "Acme Corp"
5. User deploys → **Agent is live in 30 seconds**

**All reasoning, objection handling, compliance, and call flow are pretrained in the skill.**

---

## 📊 Skill Intelligence Architecture

Each skill contains:

### 1. **Call Flow Stages**
Step-by-step progression:
- Stage 1: Introduction (with time limit)
- Stage 2: Value delivery (adapted to persona)
- Stage 3: Interest gauge (conversational)
- Stage 4: Permission-based next step
- Stage 5: Outcome classification

### 2. **Objection Response Library**
Pretrained responses for:
- "I'm too busy"
- "Not interested"
- "Send me information"
- "Already have a solution"
- "How did you get my number?"
- "What's the catch?"

### 3. **Persona Adaptation**
Different messaging for:
- Marketing Leaders → Strategy, ROI, customer insights
- Sales Leaders → Productivity, pipeline, revenue
- IT Leaders → Technology, integration, security
- Operations Leaders → Efficiency, process, scalability
- C-Suite → Business outcomes, competitive advantage

### 4. **Success Metrics**
Each skill tracks:
- Conversion rates (registration, email permission, qualification)
- Engagement scores
- Compliance adherence
- Average call duration
- Lead quality

---

## 🚀 Next Steps

### Phase 1: Complete Backend Integration
- [x] Create skill definitions
- [x] Build skill compiler
- [ ] Add database migrations for skill fields
- [ ] Implement API routes for skill-based creation
- [ ] Add file upload handling for asset skills

### Phase 2: Build Frontend UI
- [ ] Create skill selection interface
- [ ] Build dynamic input forms
- [ ] Add prompt preview component
- [ ] Integrate with existing agent creation flow
- [ ] Add skill filtering by category

### Phase 3: Add Remaining Skills
- [ ] Survey & Research Agents (3 skills)
- [ ] Qualification Agents (4 skills)
- [ ] Additional content distribution skills (3 skills)

### Phase 4: Advanced Features
- [ ] Multi-skill agents (combine 2-3 skills)
- [ ] Custom skill builder for power users
- [ ] A/B testing framework for skills
- [ ] Skill performance analytics dashboard

---

## 💡 Key Advantages

1. **No Prompt Writing** - Users never see or write system prompts
2. **Instant Deployment** - Agents ready in 30-60 seconds
3. **Pretrained Intelligence** - Objection handling, call flows, compliance embedded
4. **Consistent Quality** - Every agent uses best practices
5. **Compliance Guaranteed** - Universal Brain ensures GDPR/TCPA adherence
6. **Measurable Performance** - Built-in success metrics per skill
7. **Scalable** - Add new skills without touching core code
8. **User-Friendly** - Non-technical users can deploy sophisticated agents

---

## 📝 Example: Complete Agent Creation

**Scenario:** User wants to promote a whitepaper

### Input:
```json
{
  "agentName": "Sarah Chen",
  "skillId": "whitepaper_distribution",
  "skillInputValues": {
    "asset_file": "future-of-b2b-marketing.pdf",
    "asset_title": "The Future of B2B Marketing Automation",
    "publishing_org": "Acme Corporation",
    "target_persona": "marketing",
    "key_topics": "AI, automation, ROI measurement"
  },
  "voice": "nova",
  "provider": "openai"
}
```

### Output (Compiled System Prompt):
```
# AGENT IDENTITY
You are Sarah Chen, a professional B2B voice agent specializing in whitepaper distribution agent.
You represent Acme Corporation.

# UNIVERSAL VOICE AGENT INTELLIGENCE
[Full universal brain - 2000+ words]

# SPECIALIZED SKILL INTELLIGENCE
[Whitepaper distribution intelligence - 1500+ words]
- Call flow stages
- Persona adaptation
- Objection responses
- Interest gauging tactics

# YOUR CONTEXT & INPUTS
## Whitepaper Title
The Future of B2B Marketing Automation

## Publishing Organization
Acme Corporation

## Target Persona
Marketing Leaders

## Key Topics
- AI
- automation
- ROI measurement

# ORGANIZATION INTELLIGENCE
[Company info, value prop, ICP, positioning]

# SUCCESS CRITERIA
- Email delivery permission rate >60%
- Whitepaper download rate >40%
- Lead qualification rate >15%
[...]
```

### First Message:
```
Hello, good {{timezone_aware_greeting}}— this is Sarah Chen calling from Acme Corporation. May I please speak with {{contact_firstName}}, the {{contact_jobTitle}} at {{account_name}}?
```

**Result:** Production-ready voice agent deployed in 30 seconds, no prompt writing required.

---

## 🔒 Compliance & Safety

### Built-In Safeguards:
1. **Universal opt-out handling** - Mandatory in all skills
2. **No pressure tactics** - Enforced in skill logic
3. **Time-based calling restrictions** - 8am-6pm business hours
4. **Permission-based follow-ups** - Email consent required
5. **Honest positioning** - No misleading language
6. **Data privacy** - GDPR/CCPA compliant by default

### Monitoring:
- Every call transcribed and logged
- Compliance violations flagged automatically
- Human review for escalations
- Regular skill performance audits

---

## 📞 Support & Documentation

### For Users:
- Skill selection guide
- Input best practices
- Troubleshooting common issues
- Performance optimization tips

### For Developers:
- How to add new skills
- Skill testing framework
- Prompt engineering guidelines
- Integration documentation

---

## Summary

This implementation transforms DemanGent.ai from a **prompt-first** to a **skill-first** platform.

Users select pretrained, battle-tested skills instead of writing prompts from scratch. Agents deploy instantly with embedded intelligence, compliance, and measurable performance metrics.

**The result:** High-quality B2B voice agents accessible to non-technical users, with enterprise-grade consistency and compliance.