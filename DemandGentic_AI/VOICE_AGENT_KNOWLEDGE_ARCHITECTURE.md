# Voice Agent Foundation, Defaults & Knowledge at Campaign Runtime

## Executive Summary

At campaign runtime, the DemandGentic voice agent is powered by a **4-layer knowledge architecture** that assembles a comprehensive system prompt dynamically. This document outlines all foundation prompts, defaults, and knowledge the agent has access to.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      RUNTIME PROMPT ASSEMBLY                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ LAYER 1: UNIVERSAL (Voice Agent Control Intelligence)            │  │
│  │ ├─ State Machine (8 states)                                      │  │
│  │ ├─ Turn-Taking Rules                                             │  │
│  │ ├─ Disposition Logic                                             │  │
│  │ └─ Professional Standards                                        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ LAYER 2: ORGANIZATION (Knowledge Blocks + Intelligence)          │  │
│  │ ├─ 11 Default Knowledge Blocks (editable)                        │  │
│  │ ├─ Organization Training Rules                                   │  │
│  │ └─ Org-specific Instructions                                     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ LAYER 3.5: CALL FLOW (Deterministic Orchestration) ⭐ NEW        │  │
│  │ ├─ 8-Step Appointment Flow (default)                             │  │
│  │ ├─ Step-by-Step Goals & Constraints                              │  │
│  │ ├─ Allowed/Forbidden Intents per Step                            │  │
│  │ └─ Exit Criteria & Branch Rules                                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ LAYER 3: CAMPAIGN (Runtime Context)                              │  │
│  │ ├─ Campaign Objective & Brief                                    │  │
│  │ ├─ Product/Service Info                                          │  │
│  │ ├─ Talking Points & Objections                                   │  │
│  │ ├─ Account Intelligence (if enabled)                             │  │
│  │ └─ Contact Context (name, title, company)                        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ PROVIDER-SPECIFIC FORMATTING                                     │  │
│  │ ├─ Google/Gemini: XML tags (, etc.)       │  │
│  │ └─ OpenAI: Markdown headers with section separators              │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Layer Hierarchy (Override Rules)

| Layer | Name | Responsibility | Can Override Call Flow? |
|-------|------|----------------|-------------------------|
| 1 | Voice Agent Control | Behavior, compliance, turn-taking | ✅ Yes |
| 2 | Org Knowledge | Standards, ethics, tone | ✅ Yes |
| 3.5 | **Call Flow** | What to accomplish, in what order | ❌ No (authoritative) |
| 3 | Campaign Context | What to say/know (informational) | ❌ No |

---

## 📦 LAYER 1: Universal Voice Agent Control Intelligence

**Source:** `server/services/voice-agent-control-defaults.ts`

### Two Versions Available:

| Version | Token Count | Use Case |
|---------|-------------|----------|
| `CONDENSED_VOICE_AGENT_CONTROL` | ~2,500 tokens | Cost-optimized production calls |
| `DEFAULT_VOICE_AGENT_CONTROL_INTELLIGENCE` | ~6,000 tokens | Full-featured agent with complete rules |

---

### 🎯 Canonical Opening Message

```
"Hello, may I please speak with {{contact.full_name}}, 
the {{contact.job_title}} at {{account.name}}?"
```

**Allowed Variables:**
- `{{agent.name}}` - Agent's display name
- `{{org.name}}` - Organization name
- `{{account.name}}` - Company name being called
- `{{contact.full_name}}` - Contact's full name
- `{{contact.first_name}}` - Contact's first name
- `{{contact.last_name}}` - Contact's last name
- `{{contact.job_title}}` - Contact's job title
- `{{system.time_of_day}}` - "morning", "afternoon", or "evening"

---

### 🔄 State Machine (8 States)

```
START → IDENTITY_CHECK → RIGHT_PARTY_INTRO → CONTEXT_FRAMING
                                    ↓
                              DISCOVERY
                                    ↓
                              LISTENING
                                    ↓
                           ACKNOWLEDGEMENT
                                    ↓
                         PERMISSION_REQUEST → CLOSE → END
```

| State | Purpose | Agent Behavior |
|-------|---------|----------------|
| **IDENTITY_CHECK** | Verify right person | Ask for contact by name, don't reveal company yet |
| **RIGHT_PARTY_INTRO** | Introduce self | "This is [Agent] with [Company]" |
| **CONTEXT_FRAMING** | Set the stage | Brief reason for call, ask permission to continue |
| **DISCOVERY** | Explore needs | Open questions, listen for pain points |
| **LISTENING** | Active listening | Let them talk, minimal interruptions |
| **ACKNOWLEDGEMENT** | Validate input | Reflect back what you heard |
| **PERMISSION_REQUEST** | Ask for next step | Request follow-up meeting, email, etc. |
| **CLOSE** | End call properly | Thank them, confirm any next steps |

---

### 📊 Disposition Codes & Logic

| Code | When to Use | Example Triggers |
|------|-------------|------------------|
| `qualified_lead` | Interest shown | Asked questions, requested info, agreed to meeting |
| `not_interested` | Explicit decline | "No thanks", "Not interested", "We're all set" |
| `do_not_call` | DNC request | "Remove me", "Don't call again" |
| `voicemail` | VM detected | "Please leave a message", beep tone |
| `no_answer` | No human contact | Silence, ring timeout, busy signal |
| `invalid_data` | Wrong contact | "Doesn't work here", "Wrong number" |
| `needs_review` | Unclear outcome | Complex situation, human review needed |

---

### 🎤 Turn-Taking Rules

```
CRITICAL RULES:
1. ONE QUESTION PER TURN - Never stack multiple questions
2. WAIT FOR RESPONSE - Minimum 2-3 seconds after asking
3. MICRO-PAUSES - Use "hmm...", "well..." for natural flow
4. SHORT RESPONSES - 1-2 sentences maximum per turn
5. NO MONOLOGUES - If speaking >15 seconds, you're talking too much
```

---

### 🚪 Gatekeeper Handling Protocol

```
IF gatekeeper detected:
  1. Be friendly but brief: "Hi, is [Contact Name] available?"
  2. If asked "who's calling?": Give name only, no company
  3. If asked "what's this about?": "Just following up on something 
     [Contact] was involved with. Is this a good time to connect?"
  4. Never pitch to the gatekeeper
  5. If blocked, ask for best time to call back
```

---

### 📞 Voicemail Detection & Handling

```
VOICEMAIL SIGNALS:
- "Please leave a message after the tone"
- "The person you are trying to reach..."
- "Hi, you've reached the voicemail of..."
- Generic VM greeting + beep

ACTION:
1. Detect voicemail within 3 seconds
2. Leave brief message (15-20 seconds max)
3. Call submit_disposition('voicemail')
4. Call end_call()
```

---

### 🤖 AI Transparency Policy

```
RULE: Never deny being AI, but don't volunteer it either.

IF ASKED "Are you a robot?" or "Is this AI?":
  - Be honest: "I am an AI assistant, yes."
  - Immediately pivot: "But I'm here to have a real conversation 
    about [topic]. Would you have a moment?"
  - Don't apologize for being AI
  - Don't explain how AI works
```

---

## 📦 LAYER 2: Organization Knowledge Blocks

**Source:** `server/services/knowledge-block-service.ts`

### 11 Default Knowledge Blocks

These are **editable** through the UI and can be customized per organization:

| # | Block Name | Scope | Purpose |
|---|------------|-------|---------|
| 1 | **Professional Standards** | Universal | Ethical conduct, no false claims |
| 2 | **Human Touch & Positivity** | Universal | Warm tone, avoid robotic phrasing |
| 3 | **Pacing & Delivery** | Universal | Natural pauses, conversational rhythm |
| 4 | **Identity Confirmation Gate** | Universal | Verify right person before pitching |
| 5 | **Call State Machine** | Universal | State-based conversation flow |
| 6 | **Turn-Taking Rules** | Universal | One question at a time, wait for response |
| 7 | **Gatekeeper Protocol** | Universal | Handle receptionists/assistants |
| 8 | **Objection Handling** | Universal | Acknowledge, pivot, don't argue |
| 9 | **Special Conditions** | Universal | Handle edge cases (bad connection, etc.) |
| 10 | **Conversation Feedback** | Universal | Adapt based on caller's tone |
| 11 | **Allowed Variables** | System | Template variable documentation |

---

### Sample Block Content: "Professional Standards"

```markdown
## Professional Standards

CORE PRINCIPLES:
- Always be truthful and accurate
- Never make claims you cannot verify
- Respect the person's time and autonomy
- If unsure about something, say so
- Maintain confidentiality of all information

PROHIBITED BEHAVIORS:
- Making false or misleading statements
- High-pressure sales tactics
- Dismissing or arguing with objections
- Sharing information about other contacts
- Discussing competitor relationships unless asked
```

---

### Sample Block Content: "Turn-Taking Rules"

```markdown
## Turn-Taking & Conversation Flow

PACING RULES:
1. After asking a question, WAIT 2-3 seconds minimum
2. If they're still talking, do NOT interrupt
3. Use verbal acknowledgments: "mm-hmm", "I see", "got it"
4. Mirror their energy level and pace
5. If they speak slowly, slow down too

RESPONSE LENGTH:
- Questions: 1 sentence
- Statements: 2 sentences max
- Explanations: 3 sentences max, then pause

NEVER:
- Stack multiple questions in one turn
- Continue talking if you hear them start to speak
- Say "that's a great question" (sounds scripted)
```

---

## 📦 LAYER 3.5: Call Flow Layer (Deterministic Orchestration)

**Source:** `server/services/call-flow-defaults.ts`
**UI:** Campaign Builder → Step "Call Flow"

### Purpose

The Call Flow Layer provides **deterministic conversation orchestration** - a step-by-step progression through the call that the AI agent MUST follow. This layer sits between Org Knowledge (L2) and Campaign Context (L3) because:

- **Cannot override:** Compliance rules (L1) or Org Standards (L2)
- **Overrides:** Campaign Context (L3) for conversation progression
- **Enforces:** Step-by-step contracts that constrain agent behavior

### Authority Model

```
┌─────────────────────────────────────────────────────────────┐
│  The Call Flow is AUTHORITATIVE - agent cannot:             │
│  • Skip steps or reorder steps                              │
│  • Use forbidden intents for current step                   │
│  • Proceed without meeting exit criteria                    │
│  • Improvise beyond allowed actions                         │
└─────────────────────────────────────────────────────────────┘
```

---

### Default B2B Appointment Setting Flow (8 Steps)

| Step | Name | Goal | Max Turns |
|------|------|------|-----------|
| 1 | Permission & Presence | Get permission, confirm you're speaking to the right person | 3 |
| 2 | Role Confirmation | Verify their role matches campaign target | 2 |
| 3 | Curiosity Trigger | Create interest with a relevant insight or question | 2 |
| 4 | Discovery Lite | Understand their current situation briefly | 3 |
| 5 | Insight Drop | Share a valuable insight that connects to their situation | 2 |
| 6 | Soft Meeting Ask | Propose a brief meeting/demo with low commitment | 2 |
| 7 | Calendar Lock | Get specific date/time commitment | 3 |
| 8 | Exit with Goodwill | Confirm next steps, end professionally | 2 |

---

### Call Flow Type Definitions

```typescript
interface CallFlow {
  id: string;
  name: string;
  description?: string;
  version: string;
  steps: CallFlowStep[];
  globalRules: {
    maxCallDuration?: number;     // seconds
    maxTotalTurns?: number;
    silenceTimeout?: number;      // seconds
    objectionHandling: "inline" | "dedicated_step" | "escalate";
  };
}

interface CallFlowStep {
  stepNumber: number;
  name: string;
  goal: string;
  state: AgentState;
  
  // Intent constraints
  allowedIntents: Intent[];
  forbiddenIntents: Intent[];
  allowedQuestions?: string[];
  
  // Turn limits
  maxTurnsInStep: number;
  minTurnsBeforeProgress?: number;
  
  // Behavioral constraints
  mustDo: string[];
  mustNotDo: string[];
  
  // Progression rules
  exitCriteria: ExitCondition[];
  branches: BranchRule[];
  fallback: FallbackAction;
}

type Intent = 
  | "request_permission"
  | "acknowledge"
  | "ask_question"
  | "listen"
  | "share_insight"
  | "propose_meeting"
  | "schedule_meeting"
  | "confirm_details"
  | "exit_call"
  | "handle_objection"
  | "refer_to_colleague";

type AgentState = 
  | "CONTEXT_FRAMING"
  | "DISCOVERY"
  | "LISTENING"
  | "ACKNOWLEDGEMENT"
  | "PERMISSION_REQUEST"
  | "CLOSE"
  | "END";
```

---

### Sample Step Contract (Step 1: Permission & Presence)

```typescript
{
  stepNumber: 1,
  name: "Permission & Presence",
  goal: "Get permission to speak and confirm you're talking to the right person",
  state: "PERMISSION_REQUEST",
  
  allowedIntents: ["request_permission", "acknowledge"],
  forbiddenIntents: ["propose_meeting", "share_insight", "schedule_meeting"],
  
  allowedQuestions: [
    "Is this {firstName}?",
    "Did I catch you at a bad time?",
    "Do you have a quick moment?"
  ],
  
  maxTurnsInStep: 3,
  
  mustDo: [
    "State your name clearly",
    "State your company name",
    "Ask if they have a moment",
    "Be respectful of their time"
  ],
  
  mustNotDo: [
    "Pitch the product",
    "Ask discovery questions",
    "Mention pricing or offers",
    "Talk for more than 15 seconds"
  ],
  
  exitCriteria: [
    { condition: "permission_granted", nextStep: 2 },
    { condition: "wrong_person", action: "ask_for_correct_person" },
    { condition: "bad_time", action: "offer_callback" }
  ],
  
  branches: [
    { trigger: "hard_objection", gotoStep: 8 },
    { trigger: "immediate_interest", gotoStep: 4 }
  ],
  
  fallback: { action: "exit_gracefully", gotoStep: 8 }
}
```

---

### Runtime Injection

The Call Flow is injected into the voice agent system prompt at runtime:

```typescript
// In voice-dialer.ts
const effectiveCallFlow = campaignConfig?.callFlow || getDefaultCallFlow();
const callFlowSection = buildCallFlowPromptSection(effectiveCallFlow, currentStep);

// Injected after campaign context, before agent conversation
```

**Prompt Injection Format:**
```
## Call Flow: B2B Appointment Setting (v1.0)

CURRENT STEP: Step 1 - Permission & Presence
GOAL: Get permission to speak and confirm you're talking to the right person

ALLOWED INTENTS: request_permission, acknowledge
FORBIDDEN INTENTS: propose_meeting, share_insight, schedule_meeting

MUST DO:
- State your name clearly
- State your company name
- Ask if they have a moment
- Be respectful of their time

MUST NOT DO:
- Pitch the product
- Ask discovery questions
- Mention pricing or offers
- Talk for more than 15 seconds

EXIT CRITERIA:
- If permission granted → proceed to Step 2
- If wrong person → ask for correct person
- If bad time → offer callback

MAX TURNS IN THIS STEP: 3
```

---

### Campaign Builder UI

The Call Flow step in the Campaign Builder provides:

1. **Overview Tab** - Visual flow diagram showing all 8 steps
2. **Flow Steps Tab** - Accordion view of each step's contracts
3. **Customize Tab** - Toggle between default and custom flows

**Default Flow Toggle:**
```
[🔒 Using Default Flow]     [🔓 Customize Flow]
```

When default is selected, campaigns use `null` in the `callFlow` field and the system applies the default B2B Appointment flow at runtime.

---

## 📦 LAYER 3: Campaign Context (Runtime Injection)

**Source:** `server/services/foundation-capabilities.ts`

### Campaign Context Section Builder

At runtime, the following campaign-specific data is injected:

```typescript
buildCampaignContextSection({
  objective: string,        // Campaign goal
  productInfo: string,      // Product/service details
  talkingPoints: string[],  // Key points to mention
  targetAudience: string,   // Who we're calling
  objections: string,       // Expected objections & responses
  successCriteria: string,  // What defines a successful call
  brief: string,            // Campaign context brief
})
```

---

### Contact Context Section

```typescript
buildContactContextSection({
  fullName: string,
  firstName: string,
  lastName: string,
  jobTitle: string,
  company: string,
  email: string,
  phone: string,
})
```

**Output Example:**
```
## Contact Information

You are calling: John Smith
Title: VP of Engineering
Company: Acme Corp
Email: john.smith@acme.com
Phone: +1-555-123-4567
```

---

## 🔧 Foundation Capabilities

**Source:** `server/services/foundation-capabilities.ts`

### 8 Modular Capabilities

| Capability | ID | Description |
|------------|----|-------------|
| **Gatekeeper Handling** | `gatekeeper_handling` | Navigate past receptionists/assistants |
| **Right Party Verification** | `right_party_verification` | Confirm speaking with correct person |
| **Objection Handling** | `objection_handling` | Address concerns without arguing |
| **Meeting Booking** | `meeting_booking` | Schedule follow-up calls/meetings |
| **Survey Collection** | `survey_collection` | Gather feedback responses |
| **Qualification** | `qualification` | Determine if lead is qualified |
| **Voicemail Handling** | `voicemail_handling` | Leave effective VM messages |
| **Transfer Handoff** | `transfer_handoff` | Warm transfer to human agent |

---

## 🎨 Provider-Specific Formatting

**Source:** `server/services/provider-prompt-assembly.ts`

### Google Gemini Format

```xml

[Top-priority rules that MUST be followed]



[Knowledge blocks content]



[Campaign-specific information]



[Per-call contact details]

```

### OpenAI Format

```markdown
# CRITICAL INSTRUCTIONS
[Top-priority rules]

---

# CORE KNOWLEDGE
[Knowledge blocks content]

---

# CAMPAIGN CONTEXT
[Campaign-specific information]

---

# CONTACT CONTEXT
[Per-call contact details]
```

---

## 🔗 Runtime Assembly Flow

**Source:** `server/services/voice-dialer.ts` → `buildSystemPrompt()`

```
1. Determine provider (google/openai)
2. Check for custom agentPrompt (PATH 1) or use knowledge blocks (PATH 2)
3. Load knowledge blocks for provider
4. Build campaign context section
5. Build account intelligence context (if enabled)
6. Build call plan context (if enabled)
7. Build contact context section
8. Apply personality configuration
9. Apply voice agent control layer (condensed or full)
10. Add provider-specific preamble (Gemini critical instructions)
11. Return final assembled prompt
```

---

## 📈 Token Budgets

| Component | Estimated Tokens |
|-----------|------------------|
| Gemini Preamble | ~800 |
| Condensed Voice Control | ~2,500 |
| Full Voice Control | ~6,000 |
| Knowledge Blocks (default) | ~1,500 |
| Campaign Context | ~500-1,000 |
| Contact Context | ~100-200 |
| Account Intelligence | ~1,000-2,000 |
| **Total (condensed)** | **~5,000-7,000** |
| **Total (full)** | **~10,000-12,000** |

---

## 🛠️ Key Files Reference

| File | Purpose |
|------|---------|
| [voice-agent-control-defaults.ts](server/services/voice-agent-control-defaults.ts) | Canonical defaults, state machine, disposition logic |
| [foundation-capabilities.ts](server/services/foundation-capabilities.ts) | Capability templates, context builders |
| [knowledge-block-service.ts](server/services/knowledge-block-service.ts) | Knowledge block CRUD, 3-layer architecture |
| [provider-prompt-assembly.ts](server/services/provider-prompt-assembly.ts) | Provider-specific formatting (XML/Markdown) |
| [voice-dialer.ts](server/services/voice-dialer.ts) | Runtime buildSystemPrompt(), call orchestration |

---

## 📋 Quick Reference Card

### Agent First Principles
1. **Identity first** - Always confirm who you're speaking with
2. **Listen more** - Short responses, one question at a time
3. **Be human** - Natural pauses, casual language, no scripts
4. **Dispose always** - Every call must have a disposition code
5. **Tools are silent** - Never verbalize tool names or actions

### Disposition Decision Tree
```
Call answered?
├─ No → no_answer
└─ Yes → Person speaking?
         ├─ Voicemail → voicemail
         └─ Human → Right person?
                    ├─ Wrong number → invalid_data
                    └─ Right person → Showed interest?
                                      ├─ Yes → qualified_lead
                                      ├─ No, declined → not_interested
                                      ├─ Asked for DNC → do_not_call
                                      └─ Unclear → needs_review
```

---

*Generated: Auto-documented from codebase analysis*
*Last Updated: Voice Agent Knowledge Architecture v1.0*