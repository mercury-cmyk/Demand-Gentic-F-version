/**
 * Recreate Pivotal_DG campaign and populate its queue
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const LIST_IDS = [
  '65ef1c92-2b65-44df-ae96-9297bb525577',
  '550501a2-12c0-46ad-b3af-203420aa7eac',
];
const BATCH_SIZE = 500;

async function main() {
  console.log('=== Pivotal_DG: Recreate + Populate Queue ===\n');

  // Step 1: Check if lists still exist
  for (const listId of LIST_IDS) {
    const listCheck = await db.execute(sql`SELECT id, name, array_length(record_ids, 1) as cnt FROM lists WHERE id = ${listId}`);
    if (listCheck.rows.length === 0) {
      console.error(`List ${listId} not found!`);
      process.exit(1);
    }
    console.log(`List: ${(listCheck.rows[0] as any).name} (${(listCheck.rows[0] as any).cnt} records)`);
  }

  // Step 2: Insert the campaign
  console.log('\nCreating Pivotal_DG campaign...');
  const insertResult = await db.execute(sql`
    INSERT INTO campaigns (
      id, type, name, status, dial_mode,
      audience_refs,
      target_qualified_leads, start_date,
      ai_agent_settings,
      campaign_objective,
      product_service_info,
      talking_points,
      target_audience_description,
      campaign_objections,
      success_criteria,
      voice_provider_fallback,
      problem_intelligence_org_id,
      max_call_duration_seconds,
      require_account_intelligence,
      enabled_channels,
      client_account_id,
      project_id,
      approval_status,
      creation_mode,
      number_pool_config,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      'sql',
      'Pivotal_DG',
      'active',
      'ai_agent',
      ${JSON.stringify({ lists: LIST_IDS })}::jsonb,
      100,
      '2026-02-09',
      ${JSON.stringify({
        persona: {
          name: "Algenib",
          role: "Sales Representative",
          voice: "Algenib",
          companyName: ""
        }
      })}::jsonb,
      'Accelerate pipeline generation for B2B revenue teams.',
      'DemandGentic AI is an AI-native demand generation platform. It replaces outbound dialers, marketing automation, and ABM tools with a unified demand generation engine. Key features include: AI voice agents for real-time prospecting, Generative Studio for hyper-personalized content creation, and Organization Intelligence to align every interaction with the prospect''s business context. It autonomously prospects, qualifies, and nurtures at scale.',
      ${JSON.stringify([
        "DemandGentic AI replaces fragmented point solutions with a single, AI-native demand generation platform.",
        "AI agents call, email, and qualify prospects, powered by deep organization intelligence.",
        "Reduce Cost per Qualified Lead by 40–60%.",
        "Achieve Connect Rates >12%.",
        "Generate Qualified Leads at a rate >25%.",
        "Reduce Time to First Meeting to 12%, Qualified Lead Rate >25%, Cost per Qualified Lead 40–60% reduction, Time to First Meeting  sql`${id}`), sql`, `)})
    )
    SELECT lc.contact_id FROM list_contacts lc
  `);

  const contactIds = (contactsResult.rows as any[]).map(r => r.contact_id);
  console.log(`Total unique contacts: ${contactIds.length}`);

  let addedCount = 0;
  let errorCount = 0;
  const totalBatches = Math.ceil(contactIds.length / BATCH_SIZE);

  for (let i = 0; i = 3) {
        console.error('Too many errors, aborting.');
        break;
      }
    }

    if (batchNum % 50 === 0 || batchNum === totalBatches) {
      const progress = await db.execute(sql`SELECT count(*) as cnt FROM campaign_queue WHERE campaign_id = ${CAMPAIGN_ID}`);
      addedCount = parseInt((progress.rows[0] as any).cnt);
      console.log(`  Batch ${batchNum}/${totalBatches} — queued: ${addedCount}`);
    }
  }

  // Final
  const finalCount = await db.execute(sql`
    SELECT count(*) as total, count(*) FILTER (WHERE status = 'queued') as queued
    FROM campaign_queue WHERE campaign_id = ${CAMPAIGN_ID}
  `);

  console.log('\n=== DONE ===');
  console.log(`Campaign: ${campaign.name} (${CAMPAIGN_ID})`);
  console.log(`Queue: ${(finalCount.rows[0] as any).total} total (${(finalCount.rows[0] as any).queued} queued)`);
  console.log(`Errors: ${errorCount}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});