/**
 * Agent Endpoint Registry
 *
 * Lightweight helper for keeping agent-owned API endpoints visible
 * inside the agent's prompt/knowledge sections.
 *
 * Usage:
 * 1) Define endpoints for an agent as `AgentEndpointDescriptor[]`
 * 2) Call `renderEndpointDirectory(...)` to produce a prompt-safe block
 * 3) Add that block as a knowledge section in the agent's prompt file
 *
 * This makes sure every new/updated route is reflected in the agent
 * prompt, so analysts can trace which functions map to which agent.
 */

export interface AgentEndpointDescriptor {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  handler: string;
  tags?: string[];
}

export function renderEndpointDirectory(
  heading: string,
  endpoints: AgentEndpointDescriptor[]
): string {
  const lines: string[] = [];

  lines.push(`## ${heading} Endpoint Directory`);
  lines.push(
    'Keep this list in sync with route definitions. When you add or update a route, update the registry entry so the agent prompt stays authoritative.'
  );

  for (const endpoint of endpoints) {
    const tagSuffix = endpoint.tags && endpoint.tags.length > 0
      ? ` | tags: ${endpoint.tags.join(', ')}`
      : '';
    lines.push(
      `- ${endpoint.method} ${endpoint.path} — ${endpoint.summary} (handler: ${endpoint.handler}${tagSuffix})`
    );
  }

  return lines.join('\n');
}