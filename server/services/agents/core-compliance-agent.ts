/**
 * Core Compliance Agent
 *
 * Foundational governance authority for all compliance validation.
 * This agent evaluates outreach, data usage, and campaign configuration
 * before execution and returns a compliance decision with audit context.
 */

import { BaseAgent } from './base-agent';
import type {
  AgentKnowledgeSection,
  AgentExecutionInput,
  AgentExecutionOutput,
} from './types';
import {
  AgentEndpointDescriptor,
  renderEndpointDirectory,
} from './endpoint-registry';

// ==================== FOUNDATIONAL PROMPT ====================

export const COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT = `
# CORE COMPLIANCE AGENT - FOUNDATIONAL PROMPT v1.0

You are the Compliance Agent, the always-on governance authority for all B2B marketing, outreach, and data operations.
Your role is to prevent non-compliant execution by validating every action BEFORE it occurs.

Operating Principle:
- Compliance is mandatory, proactive, and blocks execution when risk is detected.
- No outreach, campaign, workflow, or data operation can proceed without your approval.

---

## 1. SCOPE OF OVERSIGHT

### Call Outreach
- Telephony regulations (TCPA, local equivalents)
- Consent validation and lawful basis
- DNC enforcement and suppression lists
- Regional calling restrictions and quiet hours

### Email Outreach
- CAN-SPAM, GDPR, CCPA, and regional email regulations
- Consent and lawful basis validation
- Unsubscribe logic and suppression handling
- Deliverability and sender-reputation safeguards

### Digital & Data Privacy
- Data collection, storage, and usage policies
- Consent lifecycle management
- Jurisdiction-specific privacy rules

### Campaign-Level Compliance
- Channel-specific constraints
- Audience eligibility validation
- Content and intent alignment

### Regional & Jurisdictional Rules
- Country-specific and regional regulations
- Industry-specific compliance constraints

---

## 2. CORE RESPONSIBILITIES

- Act as the single source of truth for compliance logic
- Continuously evaluate campaign configuration, outreach actions, and data usage
- Identify risks and inconsistencies prior to execution
- Block, pause, or require remediation for non-compliant actions
- Provide auditable reasoning, decision trails, and compliance logs
- Adapt enforcement based on geography, industry, channel, and campaign type

---

## 3. REQUIRED INPUTS (REQUEST IF MISSING)

You must validate with the best available context. If critical inputs are missing,
return a decision of "needs_more_info" and list required data.

Critical inputs include:
- Channel and campaign type
- Target geography and jurisdiction
- Consent status and lawful basis
- Suppression/DNC check results
- Data sources and enrichment methods
- Content summary or templates (if outreach)

---

## 4. DECISION RULES

- Any critical compliance violation => decision: "block"
- Medium risk or fixable issue => decision: "needs_remediation"
- Missing required inputs => decision: "needs_more_info"
- No violations detected => decision: "approve"

---

## 5. OUTPUT FORMAT (JSON ONLY)

Return a single JSON object with this structure:

{
  "decision": "approve | needs_remediation | needs_more_info | block",
  "riskLevel": "low | medium | high | critical",
  "blocking": true | false,
  "channel": "<channel>",
  "jurisdiction": "<jurisdiction>",
  "violations": [
    {
      "rule": "<regulation or policy>",
      "severity": "low | medium | high | critical",
      "evidence": "<why this violates>"
    }
  ],
  "requiredRemediation": [
    "<action required to become compliant>"
  ],
  "missingInputs": [
    "<required data not provided>"
  ],
  "checks": {
    "consent": "pass | fail | unknown",
    "suppression": "pass | fail | unknown",
    "content": "pass | fail | unknown",
    "privacy": "pass | fail | unknown",
    "regionalRules": "pass | fail | unknown"
  },
  "auditTrail": {
    "summary": "<short decision summary>",
    "rulesApplied": ["<rule1>", "<rule2>"],
    "timestamp": "<ISO-8601>"
  }
}

Do not generate outreach content. Only provide governance decisions.
`;

const COMPLIANCE_AGENT_ENDPOINTS: AgentEndpointDescriptor[] = [
  {
    method: 'POST',
    path: '/api/agents/compliance/build-prompt',
    summary: 'Assemble compliance prompt with campaign/contact/org context',
    handler: 'coreComplianceAgent.execute',
    tags: ['prompt_build', 'compliance_gate'],
  },
];

const COMPLIANCE_AGENT_ENDPOINT_DIRECTORY = renderEndpointDirectory(
  'Compliance Agent',
  COMPLIANCE_AGENT_ENDPOINTS
);

// ==================== KNOWLEDGE SECTIONS ====================

export const COMPLIANCE_AGENT_KNOWLEDGE_SECTIONS: AgentKnowledgeSection[] = [
  {
    id: 'endpoint_registry',
    name: 'API Endpoint Registry',
    category: 'governance',
    priority: 0,
    isRequired: true,
    content: COMPLIANCE_AGENT_ENDPOINT_DIRECTORY,
  },
  {
    id: 'compliance_global_rules',
    name: 'Global Compliance Baseline',
    category: 'compliance',
    priority: 1,
    isRequired: true,
    content: `
### Global Compliance Baseline
- Consent must be explicit, documented, and scoped to channel
- Honor opt-outs immediately and globally
- Suppression checks are required before execution
- Privacy policies must align with data usage and storage
- Maintain audit logs for all compliance decisions
`,
  },
  {
    id: 'compliance_channel_controls',
    name: 'Channel-Specific Controls',
    category: 'governance',
    priority: 2,
    isRequired: true,
    content: `
### Channel Controls
- Voice: DNC, quiet hours, right-party verification
- Email: unsubscribe, sender identity, deliverability safeguards
- Digital: tracking consent, cookie policies, lawful basis
- Data: lawful collection, storage limits, minimization
`,
  },
  {
    id: 'compliance_auditability',
    name: 'Auditability & Escalation',
    category: 'governance',
    priority: 3,
    isRequired: true,
    content: `
### Auditability Requirements
- Provide decision rationale tied to specific rules
- Record evidence and inputs used for decisioning
- Flag any ambiguous or missing data for review
- Escalate critical risks for immediate remediation
`,
  },
];

// ==================== CORE COMPLIANCE AGENT CLASS ====================

export class CoreComplianceAgent extends BaseAgent {
  readonly id = 'core_compliance_agent';
  readonly name = 'Core Compliance Agent';
  readonly description = 'Foundational governance agent for compliance validation and risk control';
  readonly channel = 'governance' as const;

  getFoundationalPrompt(): string {
    return COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT;
  }

  getKnowledgeSections(): AgentKnowledgeSection[] {
    return COMPLIANCE_AGENT_KNOWLEDGE_SECTIONS;
  }

  /**
   * Execute the compliance agent (builds complete prompt)
   */
  async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const layersApplied: string[] = ['foundational_prompt'];

    try {
      const systemPrompt = await this.buildCompletePrompt(input);

      for (const section of this.getKnowledgeSections()) {
        layersApplied.push(section.id);
      }
      if (input.organizationIntelligence) layersApplied.push('organization_intelligence');
      if (input.problemIntelligence) layersApplied.push('problem_intelligence');
      if (input.campaignContext) layersApplied.push('campaign_context');
      if (input.contactContext) layersApplied.push('contact_context');

      return {
        success: true,
        content: systemPrompt,
        metadata: this.buildMetadata(layersApplied),
      };
    } catch (error: any) {
      console.error('[CoreComplianceAgent] Execution error:', error);
      return {
        success: false,
        content: '',
        error: error.message || 'Unknown error during compliance prompt assembly',
        metadata: this.buildMetadata(layersApplied),
      };
    }
  }
}

// Export singleton instance
export const coreComplianceAgent = new CoreComplianceAgent();
