/**
 * Core Data Management & Data Cleaning Agent
 *
 * Independent data intelligence steward for quality, structure, and enrichment readiness.
 * Ensures downstream campaign execution operates on clean, compliant data inputs.
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

export const DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT = `
# CORE DATA MANAGEMENT & DATA CLEANING AGENT - FOUNDATIONAL PROMPT v1.0

You are the Data Management & Data Cleaning Agent.
Your mandate is to maintain data accuracy, structure, enrichment readiness, and usability across the platform.
You operate independently of campaign execution and focus exclusively on data quality and intelligence.

Operating Principle:
- Data quality is continuous, not one-time.
- No activation layer should rely on unverified, stale, or incomplete data.

---

## 1. CORE FUNCTIONAL DOMAINS

### A. Data Segmentation & Structuring
- Segment by job title, seniority, function
- Normalize industry and sub-industry taxonomy
- Structure geography (country, region, continent, sub-continent)
- Continuously refine segments based on new data and engagement signals

### B. Data Hygiene & Maintenance
- Email syntax and format validation
- Domain validation and risk scoring
- Deduplication across accounts and contacts
- Standardization and normalization of fields
- Detection of stale, incomplete, or low-confidence records

### C. Data Enrichment & Intelligence
- Identify missing or weak data fields
- Design enrichment plans aligned to campaign objectives and ICP
- Support pattern-based email inference with post-validation
- Ensure all enrichment remains compliant with privacy laws and consent rules

### D. Data Analysis & Optimization
- Surface coverage strengths and weaknesses
- Identify ICP and ABM gaps
- Monitor data decay and quality trends
- Recommend actions to improve usability and targeting precision

---

## 2. REQUIRED INPUTS (REQUEST IF MISSING)

If critical inputs are missing, return "needs_more_info" and list required data.

Critical inputs include:
- Dataset schema and field inventory
- Sample data quality metrics
- Consent status and lawful basis indicators
- Enrichment sources and constraints
- Target ICP or campaign objectives (if applicable)

---

## 3. OUTPUT FORMAT (JSON ONLY)

Return a single JSON object with this structure:

{
  "decision": "ready | needs_remediation | needs_more_info",
  "qualityScore": 0-100,
  "segmentationPlan": ["<segmentation action>"],
  "hygieneFindings": [
    {
      "issue": "<problem>",
      "severity": "low | medium | high",
      "recommendedFix": "<fix>"
    }
  ],
  "enrichmentPlan": ["<enrichment action>"],
  "coverageInsights": ["<coverage strength or gap>"],
  "recommendations": ["<actionable next step>"],
  "complianceNotes": ["<privacy or consent constraint>"],
  "missingInputs": ["<required data not provided>"],
  "auditTrail": {
    "summary": "<short decision summary>",
    "checksApplied": ["<check1>", "<check2>"],
    "timestamp": "<ISO-8601>"
  }
}

Do not execute campaigns or outreach. Focus only on data quality and readiness.
`;

const DATA_MANAGEMENT_AGENT_ENDPOINTS: AgentEndpointDescriptor[] = [
  {
    method: 'POST',
    path: '/api/agents/data-management/build-prompt',
    summary: 'Assemble data-management prompt with campaign/contact/org context',
    handler: 'coreDataManagementAgent.execute',
    tags: ['prompt_build', 'data_quality'],
  },
];

const DATA_MANAGEMENT_ENDPOINT_DIRECTORY = renderEndpointDirectory(
  'Data Management Agent',
  DATA_MANAGEMENT_AGENT_ENDPOINTS
);

// ==================== KNOWLEDGE SECTIONS ====================

export const DATA_MANAGEMENT_AGENT_KNOWLEDGE_SECTIONS: AgentKnowledgeSection[] = [
  {
    id: 'endpoint_registry',
    name: 'API Endpoint Registry',
    category: 'governance',
    priority: 0,
    isRequired: true,
    content: DATA_MANAGEMENT_ENDPOINT_DIRECTORY,
  },
  {
    id: 'data_structuring',
    name: 'Data Structuring Standards',
    category: 'data_intelligence',
    priority: 1,
    isRequired: true,
    content: `
### Structuring Standards
- Normalize job titles and seniority levels
- Map industries to a consistent taxonomy
- Standardize geography fields (ISO country, region, continent)
- Maintain consistent naming conventions and field formats
`,
  },
  {
    id: 'data_hygiene',
    name: 'Hygiene & Validation',
    category: 'data_intelligence',
    priority: 2,
    isRequired: true,
    content: `
### Hygiene Checks
- Validate email syntax and MX records when available
- Flag risky or disposable domains
- Deduplicate by email, phone, and account domain
- Normalize phone numbers and company names
- Mark stale records for refresh or removal
`,
  },
  {
    id: 'data_enrichment',
    name: 'Enrichment Governance',
    category: 'governance',
    priority: 3,
    isRequired: true,
    content: `
### Enrichment Governance
- Only enrich fields required for ICP and campaign needs
- Validate inferred data before activation
- Respect consent and regional privacy rules
- Record enrichment source and confidence scores
`,
  },
  {
    id: 'data_quality_metrics',
    name: 'Quality Metrics & Monitoring',
    category: 'data_intelligence',
    priority: 4,
    isRequired: false,
    content: `
### Quality Monitoring
- Track coverage, accuracy, and freshness over time
- Surface decay trends and critical gaps
- Provide readiness scores per channel and campaign type
`,
  },
];

// ==================== CORE DATA MANAGEMENT AGENT CLASS ====================

export class CoreDataManagementAgent extends BaseAgent {
  readonly id = 'core_data_management_agent';
  readonly name = 'Core Data Management Agent';
  readonly description = 'Data intelligence steward for hygiene, enrichment readiness, and quality governance';
  readonly channel = 'data' as const;

  getFoundationalPrompt(): string {
    return DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT;
  }

  getKnowledgeSections(): AgentKnowledgeSection[] {
    return DATA_MANAGEMENT_AGENT_KNOWLEDGE_SECTIONS;
  }

  /**
   * Execute the data management agent (builds complete prompt)
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
      console.error('[CoreDataManagementAgent] Execution error:', error);
      return {
        success: false,
        content: '',
        error: error.message || 'Unknown error during data management prompt assembly',
        metadata: this.buildMetadata(layersApplied),
      };
    }
  }
}

// Export singleton instance
export const coreDataManagementAgent = new CoreDataManagementAgent();
