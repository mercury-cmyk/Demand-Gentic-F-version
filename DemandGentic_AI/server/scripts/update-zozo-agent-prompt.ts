/**
 * Script to update ZOZO Agent's system prompt to follow the standard three-layer architecture.
 *
 * Run with: npx tsx server/scripts/update-zozo-agent-prompt.ts
 *
 * This script:
 * 1. Finds the ZOZO agent in the database
 * 2. Updates its systemPrompt to use the FOUNDATION_AGENT_PROMPT_TEMPLATE
 * 3. Sets isFoundationAgent = true for proper architecture alignment
 */

import { db } from '../db';
import { virtualAgents } from '../../shared/schema';
import { eq, ilike } from 'drizzle-orm';
import { FOUNDATION_AGENT_PROMPT_TEMPLATE } from '../services/voice-agent-control-defaults';

async function updateZozoAgentPrompt() {
  console.log('🔍 Searching for ZOZO agent...');

  // Find ZOZO agent (case-insensitive search)
  const agents = await db
    .select()
    .from(virtualAgents)
    .where(ilike(virtualAgents.name, '%zozo%'));

  if (agents.length === 0) {
    console.log('❌ No ZOZO agent found in the database.');
    console.log('');
    console.log('Available agents:');
    const allAgents = await db.select({ id: virtualAgents.id, name: virtualAgents.name }).from(virtualAgents);
    allAgents.forEach(a => console.log(`  - ${a.name} (${a.id})`));
    process.exit(1);
  }

  if (agents.length > 1) {
    console.log('⚠️  Multiple ZOZO agents found:');
    agents.forEach(a => console.log(`  - ${a.name} (${a.id})`));
    console.log('Please specify which one to update by modifying the script.');
    process.exit(1);
  }

  const zozo = agents[0];
  console.log(`✅ Found ZOZO agent: "${zozo.name}" (ID: ${zozo.id})`);
  console.log('');

  // Show current prompt (truncated)
  const currentPrompt = zozo.systemPrompt || '(empty)';
  console.log('📄 Current prompt (first 200 chars):');
  console.log(`   ${currentPrompt.substring(0, 200)}...`);
  console.log('');

  // Update the agent
  console.log('🔄 Updating ZOZO agent with foundation prompt template...');

  await db
    .update(virtualAgents)
    .set({
      systemPrompt: FOUNDATION_AGENT_PROMPT_TEMPLATE,
      isFoundationAgent: true,
      updatedAt: new Date(),
    })
    .where(eq(virtualAgents.id, zozo.id));

  console.log('✅ ZOZO agent updated successfully!');
  console.log('');
  console.log('📋 Changes made:');
  console.log('   - systemPrompt: Updated to FOUNDATION_AGENT_PROMPT_TEMPLATE');
  console.log('   - isFoundationAgent: true');
  console.log('');
  console.log('🏗️  Architecture alignment:');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log('   │  1. FOUNDATION LAYER (ZOZO Agent)       │');
  console.log('   │     - Personality, Environment, Tone    │');
  console.log('   │     - Turn-Taking Rules                 │');
  console.log('   │     - RIGHT-PARTY VERIFICATION          │');
  console.log('   │     - Gatekeeper STRICT COMPLIANCE      │');
  console.log('   ├─────────────────────────────────────────┤');
  console.log('   │  2. CAMPAIGN LAYER (Runtime)            │');
  console.log('   │     - Injected from campaign config     │');
  console.log('   ├─────────────────────────────────────────┤');
  console.log('   │  3. CONTACT LAYER (Per-Call)            │');
  console.log('   │     - Name, Company, Title, Intel       │');
  console.log('   └─────────────────────────────────────────┘');
}

updateZozoAgentPrompt()
  .then(() => {
    console.log('');
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error updating ZOZO agent:', error);
    process.exit(1);
  });