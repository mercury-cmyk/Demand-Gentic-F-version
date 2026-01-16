# System Prompt Examples: Intelligence Modes

This document shows what the AI agent sees in different intelligence modes.

## Mode 1: Without Intelligence (Default) - `require_account_intelligence = false`

**What's included:**
- Virtual agent base prompt
- Campaign objective & talking points
- **Basic company context** (industry, description, size, revenue)
- Contact details

**Example System Prompt Section:**

```markdown
## Campaign Objective
Book qualified meetings with IT decision makers to discuss our cloud security platform.

## Product/Service Information
Enterprise cloud security platform with SOC2 compliance, real-time threat detection, and automated incident response.

## Talking Points
- Reduces security incidents by 60%
- SOC2 Type II certified
- Integrates with existing SIEM tools
- 24/7 security operations center

## Account Background

Industry: Financial Services
About the company: TechBank provides digital banking solutions to regional credit unions and community banks across the US.
Company size: 150 employees
Revenue: $25M

## Contact Context
You're speaking with Sarah Chen, Chief Information Security Officer at TechBank.
```

**Characteristics:**
- ✅ Immediate - no delays
- ✅ Has basic company context for relevance
- ✅ AI can reference industry and company description
- ⚠️  No competitive intelligence
- ⚠️  No recent news or events
- ⚠️  No messaging strategy guidance

---

## Mode 2: With Intelligence - `require_account_intelligence = true`

**What's included:**
- Everything from Mode 1, PLUS:
- Deep company research
- Competitive landscape
- Recent news & events
- Messaging strategy & positioning
- Account-specific talking points
- Pain points & challenges
- Call planning & strategy

**Example System Prompt Section:**

```markdown
## Campaign Objective
Book qualified meetings with IT decision makers to discuss our cloud security platform.

## Product/Service Information
Enterprise cloud security platform with SOC2 compliance, real-time threat detection, and automated incident response.

## Talking Points
- Reduces security incidents by 60%
- SOC2 Type II certified
- Integrates with existing SIEM tools
- 24/7 security operations center

## Account Background

Industry: Financial Services
About the company: TechBank provides digital banking solutions to regional credit unions and community banks across the US.
Company size: 150 employees
Revenue: $25M

## Account Intelligence

### Company Overview
TechBank has been expanding rapidly, acquiring 3 regional credit unions in the past 18 months. Their digital-first approach has attracted younger customers but also increased their security risk surface.

### Recent Developments
- Announced $10M Series B funding (November 2025)
- Launched new mobile banking app (October 2025)
- Received FFIEC cybersecurity audit with findings requiring remediation (September 2025)

### Pain Points & Challenges
- Increasing compliance requirements from FFIEC and state regulators
- Legacy security tools creating visibility gaps
- Small security team (3 FTEs) struggling with 24/7 monitoring needs
- Recent phishing incidents affecting customer accounts

### Competitive Landscape
Currently using Splunk SIEM + CrowdStrike EDR. Budget allocated for SIEM refresh next quarter. Evaluating consolidation to reduce tool sprawl.

### Messaging Strategy
**Lead with:** Compliance automation and FFIEC audit readiness
**Emphasize:** Managed SOC services (addresses staffing constraints)
**Differentiate:** Banking-specific threat intelligence and compliance templates
**Avoid:** Feature comparison with Splunk - focus on operational efficiency

### Recommended Approach
1. Open with congratulations on Series B funding and growth
2. Reference FFIEC audit - position as partner for remediation
3. Focus on managed services angle given small team
4. Offer compliance gap analysis as meeting outcome

## Contact Context
You're speaking with Sarah Chen, Chief Information Security Officer at TechBank. She joined 6 months ago from a larger fintech and is tasked with modernizing their security program.

## Call Planning Notes
- Previous call attempt: No answer (3 days ago, 2:15 PM)
- Best time to reach: Mornings 9-11 AM based on her LinkedIn activity
- Recent LinkedIn posts show interest in zero-trust architecture
- Attended RSA Conference last month
```

**Characteristics:**
- ✅ Highly personalized and relevant
- ✅ Context-aware of company situation
- ✅ Strategic messaging guidance
- ✅ Specific pain points to address
- ✅ Competitive intelligence
- ⚠️  Requires pre-generation (or 5-30s delay if not cached)

---

## Comparison Example: Same Company, Different Modes

### Without Intelligence (Immediate)
```
"Hi Sarah, this is Alex from CloudSec. I'm reaching out to IT leaders
in the financial services industry about improving security operations.
I understand TechBank provides digital banking solutions.
Does improving threat detection and compliance automation sound relevant?"
```

### With Intelligence (Personalized)
```
"Hi Sarah, this is Alex from CloudSec. Congratulations on TechBank's
Series B funding - exciting growth! I saw you recently completed an FFIEC
cybersecurity audit. Many of our banking clients use our platform
specifically for audit remediation and ongoing compliance automation.
Given your team size and 24/7 monitoring needs, would it make sense
to explore how our managed SOC services could help?"
```

---

## When to Use Each Mode

### Use Mode 1 (Without Intelligence) When:
- Launching new campaigns quickly
- Doing high-volume cold outreach
- Testing messaging and scripts
- Company context (industry/description) provides enough context
- Speed is more important than deep personalization

### Use Mode 2 (With Intelligence) When:
- Running account-based marketing (ABM) campaigns
- Targeting enterprise accounts
- Need to reference specific company events/news
- Selling complex solutions requiring context
- Have time to pre-generate intelligence

---

## Technical Implementation

Both modes use the same `buildSystemPrompt()` function with different data sources:

**Mode 1 Source**: `getAccountProfileData(accountId)` - Database query (instant)
- Returns: name, industry, description, employeeCount, revenue, domain

**Mode 2 Sources**: Multiple AI-generated payloads (instant if cached, slow if not)
- `getOrBuildAccountIntelligence()` - Company research
- `getOrBuildAccountMessagingBrief()` - Messaging strategy
- `getOrBuildAccountCallBrief()` - Call strategy
- `getOrBuildParticipantCallPlan()` - Contact-specific plan
- `getCallMemoryNotes()` - Previous conversation history

**Key Insight**: Mode 1 now provides a "best of both worlds" - immediate calls with enough context to sound knowledgeable, without the complexity of full intelligence generation.
