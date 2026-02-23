/**
 * Base Agent Class
 * 
 * Abstract base class that all agents must extend.
 * Provides common functionality and enforces the agent contract.
 */

import type {
  IAgent,
  AgentChannel,
  AgentStatus,
  AgentKnowledgeSection,
  AgentExecutionInput,
  AgentExecutionOutput,
  AgentExecutionMetadata
} from './types';
import { createHash } from 'crypto';
import { getSuperOrgOIContext } from '../../lib/org-intelligence-helper';

export abstract class BaseAgent implements IAgent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly channel: AgentChannel;
  
  status: AgentStatus = 'active';
  
  /**
   * Get the prompt version based on hash of foundational prompt
   */
  get promptVersion(): string {
    const prompt = this.getFoundationalPrompt();
    return createHash('md5').update(prompt).digest('hex').slice(0, 8);
  }

  /**
   * Get the foundational prompt for this agent
   * Must be implemented by concrete agents
   */
  abstract getFoundationalPrompt(): string;

  /**
   * Get knowledge sections included in this agent
   * Must be implemented by concrete agents
   */
  abstract getKnowledgeSections(): AgentKnowledgeSection[];

  /**
   * Execute the agent with given input
   * Must be implemented by concrete agents
   */
  abstract execute(input: AgentExecutionInput): Promise<AgentExecutionOutput>;

  /**
   * Build the complete prompt including all layers
   */
  protected async buildCompletePrompt(input: AgentExecutionInput): Promise<string> {
    const parts: string[] = [];
    const knowledgeSections = this.getKnowledgeSections()
      .sort((a, b) => a.priority - b.priority);

    // Layer 1: Foundational Prompt (Always included)
    parts.push(this.getFoundationalPrompt());

    // Layer 2: Knowledge Sections
    for (const section of knowledgeSections) {
      parts.push(`\n# ${section.name}\n${section.content}`);
    }

    // Layer 3: Organization Intelligence (always injected — auto-fetches if not provided)
    const oiContext = input.organizationIntelligence || await getSuperOrgOIContext();
    if (oiContext) {
      parts.push(`\n# Organization Intelligence\n${oiContext}`);
    }

    // Layer 4: Problem Intelligence
    if (input.problemIntelligence) {
      parts.push(`\n# Problem Intelligence\n${input.problemIntelligence}`);
    }

    // Layer 5: Campaign Context
    if (input.campaignContext) {
      parts.push(this.buildCampaignContextSection(input.campaignContext));
    }

    // Layer 6: Contact Context
    if (input.contactContext) {
      parts.push(this.buildContactContextSection(input.contactContext));
    }

    // Layer 7: Additional Instructions
    if (input.additionalInstructions) {
      parts.push(`\n# Additional Instructions\n${input.additionalInstructions}`);
    }

    return parts.join('\n');
  }

  /**
   * Build campaign context section
   */
  protected buildCampaignContextSection(context: AgentExecutionInput['campaignContext']): string {
    if (!context) return '';

    const lines: string[] = ['\n# Campaign Context'];
    lines.push(`Campaign: ${context.campaignName}`);
    lines.push(`Type: ${context.campaignType}`);
    lines.push(`Objective: ${context.objective}`);
    lines.push(`Target Audience: ${context.targetAudience}`);

    if (context.valueProposition) {
      lines.push(`Value Proposition: ${context.valueProposition}`);
    }

    if (context.callToAction) {
      lines.push(`Call to Action: ${context.callToAction}`);
    }

    if (context.landingPageUrl) {
      lines.push(`Landing Page: ${context.landingPageUrl}`);
    }

    if (context.assets && context.assets.length > 0) {
      lines.push('\nAvailable Assets:');
      for (const asset of context.assets) {
        lines.push(`- ${asset.type}: ${asset.title}${asset.url ? ` (${asset.url})` : ''}`);
      }
    }

    if (context.complianceRequirements && context.complianceRequirements.length > 0) {
      lines.push('\nCompliance Requirements:');
      for (const req of context.complianceRequirements) {
        lines.push(`- ${req}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build contact context section
   */
  protected buildContactContextSection(context: AgentExecutionInput['contactContext']): string {
    if (!context) return '';

    const lines: string[] = ['\n# Contact Context'];

    if (context.firstName || context.lastName) {
      lines.push(`Name: ${[context.firstName, context.lastName].filter(Boolean).join(' ')}`);
    }

    if (context.title) {
      lines.push(`Title: ${context.title}`);
    }

    if (context.company) {
      lines.push(`Company: ${context.company}`);
    }

    if (context.industry) {
      lines.push(`Industry: ${context.industry}`);
    }

    if (context.customFields) {
      for (const [key, value] of Object.entries(context.customFields)) {
        if (value) {
          lines.push(`${key}: ${value}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Build execution metadata
   */
  protected buildMetadata(layersApplied: string[]): AgentExecutionMetadata {
    return {
      agentId: this.id,
      channel: this.channel,
      promptVersion: this.promptVersion,
      executionTimestamp: new Date(),
      layersApplied,
    };
  }
}
