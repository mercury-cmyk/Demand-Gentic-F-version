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
        "Reduce Time to First Meeting to <5 business days.",
        "Accelerate Content Production Speed to <2 hours."
      ])}::jsonb,
      'Mid-market to Enterprise companies ($10M–$500M+ ARR) in SaaS & Cloud, Cybersecurity, FinServ, HealthTech, Enterprise Software, and Professional Services. Primary buyers include VP Demand Gen, VP Revenue Ops, Director of Sales Development, CMO, and CRO.',
      ${JSON.stringify([
        "We already have a marketing automation and sales engagement platform.: DemandGentic AI unifies those tools into a single AI-native platform, reducing costs and improving efficiency.",
        "We're concerned about AI taking over human jobs.: DemandGentic AI augments your team, freeing them from repetitive tasks.",
        "How do you ensure compliance with data privacy regulations?: Our platform is built with compliance in mind."
      ])}::jsonb,
      'Connect Rate >12%, Qualified Lead Rate >25%, Cost per Qualified Lead 40–60% reduction, Time to First Meeting <5 business days.',
      true,
      'pivotal-b2b-super-org',
      240,
      false,
      ARRAY['voice'],
      '073ac22d-8c16-4db5-bf4f-667021dc0717',
      'b86370c8-3deb-4b48-8528-3e4e80341000',
      'draft',
      'manual',
      '{}'::jsonb,
      NOW(), NOW()
    )
    RETURNING id, name
  `);

  const campaign = insertResult.rows[0] as any;
  console.log(`Created campaign: ${campaign.name} (${campaign.id})`);
  const CAMPAIGN_ID = campaign.id;

  // Step 3: Populate queue
  console.log('\nResolving contacts from lists...');
  const contactsResult = await db.execute(sql`
    WITH list_contacts AS (
      SELECT DISTINCT unnest(record_ids) as contact_id
      FROM lists WHERE id IN (${sql.join(LIST_IDS.map(id => sql`${id}`), sql`, `)})
    )
    SELECT lc.contact_id FROM list_contacts lc
  `);

  const contactIds = (contactsResult.rows as any[]).map(r => r.contact_id);
  console.log(`Total unique contacts: ${contactIds.length}`);

  let addedCount = 0;
  let errorCount = 0;
  const totalBatches = Math.ceil(contactIds.length / BATCH_SIZE);

  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    try {
      await db.execute(sql`
        INSERT INTO campaign_queue (id, campaign_id, contact_id, account_id, status, priority, enqueued_by, enqueued_reason, created_at, updated_at)
        SELECT 
          gen_random_uuid(),
          ${CAMPAIGN_ID},
          c.id,
          c.account_id,
          'queued',
          100,
          'system',
          'campaign_audience',
          NOW(),
          NOW()
        FROM contacts c
        WHERE c.id::text = ANY(${batch})
          AND c.account_id IS NOT NULL
          AND (c.direct_phone_e164 IS NOT NULL OR c.mobile_phone_e164 IS NOT NULL)
        ON CONFLICT (campaign_id, contact_id) DO NOTHING
      `);
    } catch (err: any) {
      console.error(`  Batch ${batchNum} error: ${err.message}`);
      errorCount++;
      if (errorCount >= 3) {
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
