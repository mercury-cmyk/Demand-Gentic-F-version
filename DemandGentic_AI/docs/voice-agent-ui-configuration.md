# Voice Agent UI Configuration Guide

This guide explains how to configure voice agents with personality, conversation flow, and behavior settings through the UI.

## Overview

Voice agents can be configured with rich personality and behavior settings stored in the `virtualAgents.settings` JSONB field. These settings follow the **OpenAI Voice Agents Guide** best practices for creating natural, effective voice agents.

## Configuration Structure

The configuration is stored as JSON in the `settings` field of the `virtual_agents` table:

```typescript
{
  "personality": { /* Personality & Tone Configuration */ },
  "conversationStates": [ /* Optional structured conversation flow */ ],
  "fillerWords": { /* Filler word usage configuration */ },
  "handoff": { /* Agent handoff configuration */ },
  "systemTools": { /* System tool toggles */ },
  "advanced": { /* Advanced settings */ }
}
```

## 1. Personality & Tone Configuration

Control how the agent sounds and behaves during conversations.

### UI Form Fields

| Field | Type | Options | Description |
|-------|------|---------|-------------|
| Identity | text | - | Who or what the AI represents (e.g., "Professional B2B research assistant") |
| Task | textarea | - | What the agent is expected to do |
| Demeanor | text | - | Overall attitude (e.g., "Patient, professional, consultative") |
| Tone | text | - | Voice style (e.g., "Warm and conversational") |
| Enthusiasm Level | select | very-low, low, moderate, high, very-high | Energy level in responses |
| Formality Level | select | very-casual, casual, balanced, professional, very-professional | Language style |
| Emotion Level | select | neutral, slightly-expressive, expressive, very-expressive | Emotional expressiveness |
| Filler Words | select | none, rarely, occasionally, often, very-often | Frequency of "um", "uh", etc. |
| Pacing | select | very-slow, slow, moderate, fast, very-fast | Speech speed |
| Additional Details | textarea | - | Any other personality notes |

### Example JSON

```json
{
  "personality": {
    "identity": "You are a professional B2B research assistant representing Acme Corp.",
    "task": "Conduct brief discovery conversations with business leaders to understand their perspectives and identify qualified leads.",
    "demeanor": "Patient, professional, and consultative. Not pushy or sales-oriented.",
    "tone": "Warm and conversational, yet professional.",
    "enthusiasmLevel": "moderate",
    "formalityLevel": "professional",
    "emotionLevel": "expressive",
    "fillerWords": "occasionally",
    "pacing": "moderate",
    "additionalDetails": "You have 10+ years experience in B2B sales and understand enterprise challenges."
  }
}
```

## 2. Conversation States (Optional)

Define structured conversation flows with states and transitions. Useful for guided interactions.

### UI Implementation

Consider a visual flow builder or JSON editor:

```json
{
  "conversationStates": [
    {
      "id": "1_identity_check",
      "description": "Verify speaking with the right person",
      "instructions": [
        "Politely confirm you're speaking with the contact",
        "If gatekeeper, politely request transfer"
      ],
      "examples": [
        "Hello, may I speak with John Smith please?",
        "Is this John? Great, thank you for taking my call."
      ],
      "transitions": [{
        "nextStep": "2_introduction",
        "condition": "Once identity is confirmed"
      }]
    },
    {
      "id": "2_introduction",
      "description": "Introduce yourself and purpose",
      "instructions": [
        "Thank them for their time",
        "State you're from [company]",
        "Briefly explain purpose"
      ],
      "examples": [
        "Thank you for taking my call. I'm reaching out from Acme Corp..."
      ],
      "transitions": [{
        "nextStep": "3_discovery",
        "condition": "After introduction"
      }]
    }
  ]
}
```

## 3. Filler Words Configuration

Control when and how the agent uses filler words like "um", "uh", "hmm".

### UI Form Fields

| Field | Type | Description |
|-------|------|-------------|
| Frequency | select | Overall frequency (none, rarely, occasionally, often, very-often) |
| Use When Processing | checkbox | Use fillers when processing complex information |
| Use When Considering | checkbox | Use fillers when considering a response |
| Use When Empathizing | checkbox | Use fillers when expressing empathy |
| Use When Transitioning | checkbox | Use fillers when transitioning topics |
| Avoid During Identity Check | checkbox | Never use during identity verification |
| Avoid During Key Info | checkbox | Never use when delivering key information |
| Avoid During Closing | checkbox | Never use during closing statements |
| Avoid During Transfer | checkbox | Never use when transferring to human |
| Custom Instructions | textarea | Additional filler word guidelines |

### Example JSON

```json
{
  "fillerWords": {
    "frequency": "occasionally",
    "useWhen": {
      "processingComplexInfo": true,
      "consideringResponse": true,
      "expressingEmpathy": true,
      "transitioning": false
    },
    "avoidWhen": {
      "identityVerification": true,
      "keyInformationDelivery": true,
      "closingStatements": true,
      "transferHandoff": true
    },
    "customInstructions": "Use 'hmm' when showing you're thinking about their response"
  }
}
```

## 4. Enhanced Agent Handoff

Configure how the agent handles transfers to human agents or specialized AI agents.

### UI Form Fields

| Field | Type | Description |
|-------|------|-------------|
| Enable Handoff | checkbox | Whether handoff capability is enabled |
| Pre-Transfer Message | text | What to say before transferring |
| Transfer Failure Message | text | What to say if transfer fails |
| Capture Rationale | checkbox | Capture why transfer is needed |
| Capture Summary | checkbox | Capture conversation summary |
| Capture Sentiment | checkbox | Capture prospect sentiment |
| Capture Urgency | checkbox | Capture urgency level |
| Capture Topics | checkbox | Capture key topics discussed |
| Capture Attempts | checkbox | Capture what was attempted before transfer |

### Example JSON

```json
{
  "handoff": {
    "enabled": true,
    "destinations": [
      {
        "id": "human_agent",
        "name": "Human Agent",
        "description": "Transfer to a live representative",
        "specializesIn": ["Complex situations", "Escalations"],
        "transferCriteria": "User explicitly requests OR situation is beyond AI scope"
      }
    ],
    "contextFields": {
      "rationale": true,
      "conversationSummary": true,
      "prospectSentiment": true,
      "urgency": true,
      "keyTopics": true,
      "attemptedResolution": true
    },
    "preTransferMessage": "I understand. Let me connect you with someone who can help. Just a moment please.",
    "transferFailureMessage": "I apologize, but I'm unable to connect you at this moment. May I take your information for a callback?"
  }
}
```

## 5. System Tools

Enable/disable specific system capabilities.

### UI Toggles

- **End Conversation** - Allow agent to end conversations
- **Detect Language** - Auto-detect caller language
- **Skip Turn** - Allow skipping turns
- **Transfer to Agent** - Enable human agent transfers
- **Transfer to Number** - Enable transferring to specific numbers
- **Play Keypad Touch Tone** - Enable DTMF tones
- **Voicemail Detection** - Detect and handle voicemail

## 6. Advanced Settings

### ASR (Speech Recognition)

```json
{
  "asr": {
    "model": "default",  // or "scribe_realtime"
    "inputFormat": "pcm_16000",
    "keywords": "enterprise, B2B, SaaS",  // Improve recognition
    "transcriptionEnabled": true
  }
}
```

### Conversational Settings

```json
{
  "conversational": {
    "eagerness": "high",  // Response speed: low, normal, high
    "takeTurnAfterSilenceSeconds": 2,
    "endConversationAfterSilenceSeconds": 60,
    "maxConversationDurationSeconds": 240
  }
}
```

### Cost Optimization

```json
{
  "costOptimization": {
    "maxResponseTokens": 512,  // 256-1024
    "useCondensedPrompt": true,  // Save ~60% on prompt tokens
    "enableCostTracking": true
  }
}
```

## Complete Example Configuration

```json
{
  "personality": {
    "identity": "You are Sarah, a professional B2B research assistant at Acme Corp with 10+ years of experience.",
    "task": "Conduct brief discovery conversations to understand leadership perspectives and identify qualified leads.",
    "demeanor": "Patient, professional, consultative. You're a trusted advisor, not a salesperson.",
    "tone": "Warm and conversational, yet professional. You sound like a peer speaking to another peer.",
    "enthusiasmLevel": "moderate",
    "formalityLevel": "professional",
    "emotionLevel": "expressive",
    "fillerWords": "occasionally",
    "pacing": "moderate",
    "additionalDetails": "You understand enterprise challenges and speak the language of business leaders."
  },
  "fillerWords": {
    "frequency": "occasionally",
    "useWhen": {
      "processingComplexInfo": true,
      "consideringResponse": true,
      "expressingEmpathy": true,
      "transitioning": false
    },
    "avoidWhen": {
      "identityVerification": true,
      "keyInformationDelivery": true,
      "closingStatements": true,
      "transferHandoff": true
    }
  },
  "handoff": {
    "enabled": true,
    "contextFields": {
      "rationale": true,
      "conversationSummary": true,
      "prospectSentiment": true,
      "urgency": true,
      "keyTopics": true,
      "attemptedResolution": true
    },
    "preTransferMessage": "I understand. Let me connect you with someone who can help.",
    "transferFailureMessage": "I apologize for the delay. May I take your contact information for a callback?"
  },
  "systemTools": {
    "endConversation": true,
    "transferToAgent": true,
    "voicemailDetection": true
  },
  "advanced": {
    "conversational": {
      "eagerness": "high",
      "takeTurnAfterSilenceSeconds": 2,
      "maxConversationDurationSeconds": 240
    },
    "costOptimization": {
      "maxResponseTokens": 512,
      "useCondensedPrompt": true,
      "enableCostTracking": true
    }
  }
}
```

## Database Update Example

When saving from the UI:

```sql
UPDATE virtual_agents
SET
  settings = '{ /* JSON configuration above */ }',
  updated_at = NOW()
WHERE id = 'agent_id_here';
```

## Testing Configuration

After updating settings, test with a sample call to verify:

1. Personality and tone match expectations
2. Conversation flow is natural
3. Filler words are used appropriately
4. Handoff captures proper context
5. Cost optimization is working (check token usage)

## Best Practices

1. **Start Simple** - Begin with just personality configuration, add complexity as needed
2. **Test Iterations** - Test each configuration change with sample calls
3. **Monitor Costs** - Enable cost tracking to understand token usage
4. **User Feedback** - Gather feedback on agent naturalness and effectiveness
5. **A/B Testing** - Test different personality configurations to find what works best

## API Endpoints (for UI Integration)

### Get Agent Configuration
```
GET /api/virtual-agents/:id
Response: { settings: { personality, fillerWords, handoff, ... } }
```

### Update Agent Configuration
```
PATCH /api/virtual-agents/:id
Body: { settings: { /* updated configuration */ } }
```

### Validate Configuration
```
POST /api/virtual-agents/validate-settings
Body: { settings: { /* configuration to validate */ } }
Response: { valid: true, errors: [] }
```

---

For more details on voice agent best practices, see:
- [OpenAI Voice Agents Guide](https://platform.openai.com/docs/guides/voice-agents)
- [voice-agent-config.ts](../shared/voice-agent-config.ts) - TypeScript type definitions