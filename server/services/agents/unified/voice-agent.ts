/**
 * Unified Voice Agent
 *
 * The voice agent implementation within the unified architecture.
 * It is responsible for handling real-time voice conversations.
 */

import { UnifiedBaseAgent } from './unified-base-agent';
import type { AgentExecutionInput, AgentExecutionOutput } from '../types';
import type { IUnifiedAgent, UnifiedAgentType, PromptSection, AgentCapability, CapabilityPromptMapping } from './types';
import { db } from '../../../db';
import { sql }from 'drizzle-orm';

export class VoiceAgent extends UnifiedBaseAgent implements IUnifiedAgent {
  // === IAgent fields ===
  readonly id = 'agent-voice-unified';
  readonly name = 'Unified Voice Agent';
  readonly description = 'The next-generation voice agent powered by the unified architecture.';
  readonly channel = 'voice';

  // === IUnifiedAgent fields ===
  readonly agentType: UnifiedAgentType = 'voice';

  private constructor() {
    super();
  }

  /**
   * The primary execution method for the voice agent.
   * This will be connected to the real-time call handling logic.
   */
  async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    // TODO: Implement the voice agent's core logic
    console.log(`[VoiceAgent] Executing with input:`, input);

    const prompt = await this.buildCompletePrompt(input);

    // For now, we'll just return a dummy response
    return {
      output: 'This is a dummy response from the Unified Voice Agent.',
      prompt,
      cost: 0.001,
      performance: {
        latency: 500,
        tokensPerSecond: 100,
        qualityScore: 0.9,
      },
    };
  }

  public static async create(): Promise<VoiceAgent> {
    const agent = new VoiceAgent();
    await agent.initialize();
    return agent;
  }

  private async initialize(): Promise<void> {
    try {
      console.log('[VoiceAgent] Initializing from database...');

      // 1. Fetch the master agent record
      const agentResult = await db.execute(sql`
        SELECT id, name, description, configuration, performance_snapshot, current_version, current_hash, deployed_at, deployed_by
        FROM unified_agents
        WHERE agent_type = ${this.agentType}
      `);

      if (agentResult.rows.length === 0) {
        throw new Error(`Unified agent with type '${this.agentType}' not found.`);
      }
      const agentData: any = agentResult.rows[0];
      const agentId = agentData.id;

      this.configuration = agentData.configuration;
      this.performanceSnapshot = agentData.performance_snapshot;
      this.versionControl = {
          currentVersion: agentData.current_version,
          currentHash: agentData.current_hash,
          deployedAt: new Date(agentData.deployed_at),
          deployedBy: agentData.deployed_by,
          totalVersions: 0, // Will be calculated below
          snapshots: [], // Will be loaded below
      };

      // 2. Fetch all active prompt sections for this agent
      const sectionsResult = await db.execute(sql`
        SELECT id, section_id, name, section_number, category, content, is_required, is_active, version_hash, last_updated, last_updated_by
        FROM unified_agent_prompt_sections
        WHERE agent_id = ${agentId} AND is_active = true
        ORDER BY section_number ASC
      `);

      this.promptSections = sectionsResult.rows.map((row: any) => ({
        id: row.id,
        sectionId: row.section_id,
        name: row.name,
        sectionNumber: row.section_number,
        category: row.category,
        content: row.content,
        isRequired: row.is_required,
        isActive: row.is_active,
        versionHash: row.version_hash,
        lastUpdated: new Date(row.last_updated),
        lastUpdatedBy: row.last_updated_by,
        changeHistory: [], // TODO: Load change history if needed
      } as PromptSection));

      // 3. Fetch all capabilities for this agent
      const capabilitiesResult = await db.execute(sql`
        SELECT id, capability_id, name, description, category, performance_score, trend
        FROM unified_agent_capabilities
        WHERE agent_id = ${agentId}
      `);

      this.capabilities = capabilitiesResult.rows.map((row: any) => ({
        id: row.id,
        capabilityId: row.capability_id,
        name: row.name,
        description: row.description,
        category: row.category,
        performanceScore: row.performance_score,
        trend: row.trend,
        isActive: true, // Assuming active, no is_active column in schema
        promptSectionIds: [], // Will be populated by mappings
        learningInputSources: [], // TODO: Load if needed
        optimizationWeight: 0.5, // Default weight
      } as AgentCapability));

      // 4. Fetch capability-to-prompt mappings
      const mappingsResult = await db.execute(sql`
        SELECT capability_id, prompt_section_id
        FROM unified_agent_capability_mappings
        WHERE agent_id = ${agentId}
      `);

      this.capabilityMappings = mappingsResult.rows.map((row: any) => ({
        capabilityId: row.capability_id,
        promptSectionId: row.prompt_section_id,
        confidence: 1,
        requiresApproval: false,
        learningInputSourceIds: [],
      } as CapabilityPromptMapping));

      // Populate promptSectionIds in capabilities from mappings
      const capabilityMap = new Map<string, AgentCapability>(this.capabilities.map(c => [c.id, c]));
      for (const mapping of this.capabilityMappings) {
          const cap = capabilityMap.get(mapping.capabilityId);
          if (cap) {
              cap.promptSectionIds.push(mapping.promptSectionId);
          }
      }

      // 5. Fetch version history (snapshots)
      const versionsResult = await db.execute(sql`
        SELECT version, hash, changelog, deployed_by, rollback_available, created_at
        FROM unified_agent_versions
        WHERE agent_id = ${agentId}
        ORDER BY created_at DESC
      `);

      this.versionControl.snapshots = versionsResult.rows.map((row: any) => ({
        version: row.version,
        hash: row.hash,
        timestamp: new Date(row.created_at),
        deployedBy: row.deployed_by,
        changelog: row.changelog,
        rollbackAvailable: row.rollback_available,
        promptSectionsSnapshot: {}, // Snapshot data is in JSONB, can be loaded if needed
        configurationSnapshot: {},
      }));
      this.versionControl.totalVersions = versionsResult.rows.length;

      console.log(`[VoiceAgent] Successfully initialized. Loaded ${this.promptSections.length} prompt sections.`);

    } catch (error) {
      console.error('[VoiceAgent] Failed to initialize from database:', error);
      // In case of failure, we can proceed with an empty/default state
      this.promptSections = [];
      this.capabilities = [];
      this.capabilityMappings = [];
    }
  }
}
