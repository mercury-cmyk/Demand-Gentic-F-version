/**
 * Agent Registry
 * 
 * Central registry for all agents in the system.
 * Provides agent discovery, registration, and lifecycle management.
 */

import type { IAgent, AgentChannel, AgentRegistration } from './types';

class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map = new Map();

  private constructor() {}

  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  /**
   * Register an agent with the registry
   */
  register(agent: IAgent): void {
    const existing = this.agents.get(agent.id);
    
    if (existing) {
      // Update existing registration
      existing.agent = agent;
      existing.lastUpdated = new Date();
      console.log(`[AgentRegistry] Updated agent: ${agent.id}`);
    } else {
      // New registration
      this.agents.set(agent.id, {
        agent,
        registeredAt: new Date(),
        lastUpdated: new Date(),
        usageCount: 0,
      });
      console.log(`[AgentRegistry] Registered agent: ${agent.id} (${agent.name})`);
    }
  }

  /**
   * Unregister an agent
   */
  unregister(agentId: string): boolean {
    const deleted = this.agents.delete(agentId);
    if (deleted) {
      console.log(`[AgentRegistry] Unregistered agent: ${agentId}`);
    }
    return deleted;
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): IAgent | undefined {
    const registration = this.agents.get(agentId);
    if (registration) {
      registration.usageCount++;
      return registration.agent;
    }
    return undefined;
  }

  /**
   * Get all agents for a specific channel
   */
  getAgentsByChannel(channel: AgentChannel): IAgent[] {
    return Array.from(this.agents.values())
      .filter(reg => reg.agent.channel === channel)
      .map(reg => reg.agent);
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): IAgent[] {
    return Array.from(this.agents.values()).map(reg => reg.agent);
  }

  /**
   * Get registration metadata for an agent
   */
  getRegistration(agentId: string): AgentRegistration | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Check if an agent is registered
   */
  isRegistered(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Get the primary agent for a channel
   * Returns the first active agent found for the channel
   */
  getPrimaryAgent(channel: AgentChannel): IAgent | undefined {
    const agents = this.getAgentsByChannel(channel);
    return agents.find(a => a.status === 'active');
  }

  /**
   * Get registry statistics
   */
  getStats(): { totalAgents: number; byChannel: Record } {
    const byChannel: Record = {
      voice: 0,
      email: 0,
      sms: 0,
      chat: 0,
      governance: 0,
      data: 0,
    };

    const values = Array.from(this.agents.values());
    for (const reg of values) {
      byChannel[reg.agent.channel]++;
    }

    return {
      totalAgents: this.agents.size,
      byChannel,
    };
  }
}

// Export singleton instance
export const agentRegistry = AgentRegistry.getInstance();

// Export for type usage
export { AgentRegistry };