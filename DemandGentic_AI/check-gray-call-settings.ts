import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkGrayCallSettings() {
  console.log('========================================');
  console.log('CHECK GRAY BEKURS CALL SETTINGS');
  console.log('========================================\n');

  // Get the call attempt
  const attempt = await db.execute(sql`
    SELECT
      dca.*,
      c.first_name,
      c.last_name,
      camp.name as campaign_name,
      camp.id as campaign_id
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN campaigns camp ON camp.id = dca.campaign_id
    WHERE c.first_name = 'Gray' AND c.last_name = 'Bekurs'
      AND dca.disposition = 'qualified_lead'
    LIMIT 1
  `);

  if (attempt.rows.length === 0) {
    console.log('No call attempt found');
    process.exit(0);
  }

  const call = attempt.rows[0] as any;
  console.log('Call Attempt:');
  console.log(`  ID: ${call.id}`);
  console.log(`  Campaign: ${call.campaign_name} (${call.campaign_id})`);
  console.log(`  Virtual Agent ID: ${call.virtual_agent_id}`);
  console.log(`  Duration: ${call.call_duration_seconds}s`);
  console.log(`  Created: ${call.created_at}`);

  // Get the virtual agent settings
  if (call.virtual_agent_id) {
    const agent = await db.execute(sql`
      SELECT
        id,
        name,
        system_prompt,
        settings
      FROM virtual_agents
      WHERE id = ${call.virtual_agent_id}
    `);

    if (agent.rows.length > 0) {
      const va = agent.rows[0] as any;
      console.log('\nVirtual Agent:');
      console.log(`  Name: ${va.name}`);
      console.log(`  ID: ${va.id}`);

      if (va.settings) {
        const settings = typeof va.settings === 'string'
          ? JSON.parse(va.settings)
          : va.settings;

        console.log('\nAgent Settings:');
        console.log(`  noPiiLogging: ${settings?.advanced?.privacy?.noPiiLogging || 'not set'}`);
        console.log(`  transcriptionEnabled: ${settings?.advanced?.asr?.transcriptionEnabled}`);

        // Check client events settings
        if (settings?.advanced?.clientEvents) {
          console.log(`  clientEvents.userTranscript: ${settings.advanced.clientEvents.userTranscript}`);
          console.log(`  clientEvents.agentResponse: ${settings.advanced.clientEvents.agentResponse}`);
        }

        console.log('\nFull Advanced Settings:');
        console.log(JSON.stringify(settings?.advanced, null, 2));
      }
    }
  }

  // Check if there's a call_session with more data
  console.log('\n========================================');
  console.log('CHECK CALL SESSIONS');
  console.log('========================================\n');

  const sessions = await db.execute(sql`
    SELECT *
    FROM call_sessions
    WHERE contact_id = ${call.contact_id}
    ORDER BY created_at DESC
    LIMIT 5
  `);

  console.log(`Found ${sessions.rows.length} call sessions for this contact`);

  for (const row of sessions.rows) {
    const s = row as any;
    console.log(`\nSession: ${s.id}`);
    console.log(`  Created: ${s.created_at}`);
    console.log(`  AI Disposition: ${s.ai_disposition}`);
    console.log(`  Duration: ${s.call_duration_seconds || s.duration_seconds || 0}s`);

    if (s.transcript) {
      console.log(`\n  TRANSCRIPT (${s.transcript.length} chars):`);
      console.log(`  ${s.transcript}`);
    }

    if (s.call_summary) {
      console.log(`\n  CALL SUMMARY:`);
      console.log(JSON.stringify(s.call_summary, null, 2));
    }

    // Log all columns for debugging
    console.log('\n  ALL COLUMNS:');
    for (const [key, value] of Object.entries(s)) {
      if (value !== null && value !== undefined && String(value).length  {
  console.error('Error:', e);
  process.exit(1);
});