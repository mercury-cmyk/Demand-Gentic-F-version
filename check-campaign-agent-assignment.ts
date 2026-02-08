import 'dotenv/config';
import { db } from './server/db';
import { campaignAgentAssignments, virtualAgents } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

async function check() {
  const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
  
  // Check all assignments for this campaign
  const allAssignments = await db
    .select()
    .from(campaignAgentAssignments)
    .where(eq(campaignAgentAssignments.campaignId, campaignId));
  
  console.log('All campaign agent assignments:');
  console.log(JSON.stringify(allAssignments, null, 2));
  
  // Check for active AI agent assignment (what test-call endpoint looks for)
  const activeAiAssignment = await db
    .select({
      virtualAgentId: campaignAgentAssignments.virtualAgentId,
      agentName: virtualAgents.name,
      systemPrompt: virtualAgents.systemPrompt,
      firstMessage: virtualAgents.firstMessage,
      voice: virtualAgents.voice,
      settings: virtualAgents.settings,
    })
    .from(campaignAgentAssignments)
    .innerJoin(virtualAgents, eq(virtualAgents.id, campaignAgentAssignments.virtualAgentId))
    .where(
      and(
        eq(campaignAgentAssignments.campaignId, campaignId),
        eq(campaignAgentAssignments.agentType, "ai"),
        eq(campaignAgentAssignments.isActive, true)
      )
    )
    .limit(1);
  
  console.log('\nActive AI agent assignment (test-call lookup):');
  console.log(JSON.stringify(activeAiAssignment, null, 2));
  
  process.exit(0);
}

check().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
