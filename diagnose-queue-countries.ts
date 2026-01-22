/**
 * Diagnose why contacts in active AI campaigns aren't being called
 * Checks country data and business hours filtering
 */
import { db } from './server/db';
import { campaigns, campaignQueue, contacts, campaignAgentAssignments, virtualAgents } from './shared/schema';
import { eq, sql, and, inArray } from 'drizzle-orm';

async function diagnose() {
  console.log('=== AI Campaign Queue Diagnosis ===\n');

  // 1. Get active AI campaigns
  const activeCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      dialMode: campaigns.dialMode,
    })
    .from(campaigns)
    .where(and(eq(campaigns.status, 'active'), eq(campaigns.dialMode, 'ai_agent')));

  console.log(`Active AI Campaigns: ${activeCampaigns.length}\n`);

  for (const campaign of activeCampaigns) {
    console.log(`\n📌 Campaign: ${campaign.name} (${campaign.id})`);
    console.log(`   Status: ${campaign.status}, Mode: ${campaign.dialMode}`);

    // Check if there's an assigned virtual agent
    const agentAssignment = await db
      .select({
        agentName: virtualAgents.name,
        agentId: virtualAgents.id,
      })
      .from(campaignAgentAssignments)
      .innerJoin(virtualAgents, eq(virtualAgents.id, campaignAgentAssignments.virtualAgentId))
      .where(
        and(
          eq(campaignAgentAssignments.campaignId, campaign.id),
          eq(campaignAgentAssignments.agentType, 'ai'),
          eq(campaignAgentAssignments.isActive, true)
        )
      )
      .limit(1);

    if (agentAssignment.length > 0) {
      console.log(`   Virtual Agent: ${agentAssignment[0].agentName}`);
    } else {
      console.log(`   ⚠️ No AI agent assigned!`);
    }

    // 2. Get queue stats
    const queueStats = await db.execute(sql`
      SELECT 
        cq.status,
        COUNT(*) as count
      FROM campaign_queue cq
      WHERE cq.campaign_id = ${campaign.id}
      GROUP BY cq.status
      ORDER BY count DESC
    `);

    console.log('\n   Queue Status:');
    for (const row of queueStats.rows as any[]) {
      console.log(`     ${row.status}: ${row.count}`);
    }

    // 3. Check country distribution of queued contacts
    const countryStats = await db.execute(sql`
      SELECT 
        COALESCE(c.country, '(NULL)') as country,
        COUNT(*) as count
      FROM campaign_queue cq
      LEFT JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${campaign.id}
        AND cq.status = 'queued'
      GROUP BY c.country
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log('\n   Country Distribution (queued):');
    for (const row of countryStats.rows as any[]) {
      console.log(`     ${row.country}: ${row.count}`);
    }

    // 4. Check phone availability
    const phoneStats = await db.execute(sql`
      SELECT 
        CASE 
          WHEN c.mobile_phone_e164 IS NOT NULL AND c.direct_phone_e164 IS NOT NULL THEN 'has_both'
          WHEN c.mobile_phone_e164 IS NOT NULL THEN 'has_mobile'
          WHEN c.direct_phone_e164 IS NOT NULL THEN 'has_direct_only'
          ELSE 'no_phone'
        END as phone_status,
        COUNT(*) as count
      FROM campaign_queue cq
      LEFT JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${campaign.id}
        AND cq.status = 'queued'
      GROUP BY 
        CASE 
          WHEN c.mobile_phone_e164 IS NOT NULL AND c.direct_phone_e164 IS NOT NULL THEN 'has_both'
          WHEN c.mobile_phone_e164 IS NOT NULL THEN 'has_mobile'
          WHEN c.direct_phone_e164 IS NOT NULL THEN 'has_direct_only'
          ELSE 'no_phone'
        END
      ORDER BY count DESC
    `);

    console.log('\n   Phone Availability (queued):');
    for (const row of phoneStats.rows as any[]) {
      console.log(`     ${row.phone_status}: ${row.count}`);
    }

    // 5. Check timezone/business hours readiness (simplified)
    console.log('\n   Timezone notes: Most contacts use country for tz inference');

    // 6. Sample some contacts to see their data
    const sampleContacts = await db.execute(sql`
      SELECT 
        c.id,
        c.first_name,
        c.last_name,
        c.country,
        c.state,
        c.timezone,
        c.mobile_phone_e164,
        c.direct_phone_e164,
        a.name as account_name
      FROM campaign_queue cq
      LEFT JOIN contacts c ON c.id = cq.contact_id
      LEFT JOIN accounts a ON a.id = c.account_id
      WHERE cq.campaign_id = ${campaign.id}
        AND cq.status = 'queued'
      LIMIT 5
    `);

    console.log('\n   Sample Queued Contacts:');
    for (const row of sampleContacts.rows as any[]) {
      console.log(`     - ${row.first_name} ${row.last_name} (${row.account_name})`);
      console.log(`       Country: ${row.country || 'NULL'}, State: ${row.state || 'NULL'}, TZ: ${row.timezone || 'NULL'}`);
      console.log(`       Mobile: ${row.mobile_phone_e164 || 'NULL'}, Direct: ${row.direct_phone_e164 || 'NULL'}`);
    }

    // 7. Check how many contacts were already called today (the main filter!)
    const calledTodayStats = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE cs.created_at >= CURRENT_DATE) as called_today,
        COUNT(*) as total_queued
      FROM campaign_queue cq
      LEFT JOIN contacts c ON c.id = cq.contact_id
      LEFT JOIN call_sessions cs ON (
        cs.contact_id = cq.contact_id
        OR cs.to_number_e164 = c.direct_phone_e164 
        OR cs.to_number_e164 = c.mobile_phone_e164
      ) AND cs.agent_type = 'ai' AND cs.created_at >= CURRENT_DATE
      WHERE cq.campaign_id = ${campaign.id}
        AND cq.status = 'queued'
    `);

    const row = calledTodayStats.rows[0] as any;
    console.log(`\n   ⚠️ Already Called Today Filter:`);
    console.log(`     Total queued: ${row?.total_queued || 0}`);

    // Better query - count queued contacts that have a call today
    const calledTodayCount = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${campaign.id}
        AND cq.status = 'queued'
        AND EXISTS (
          SELECT 1 FROM call_sessions cs 
          WHERE cs.created_at >= CURRENT_DATE
            AND cs.agent_type = 'ai'
            AND (
              cs.contact_id = cq.contact_id
              OR cs.to_number_e164 = c.direct_phone_e164 
              OR cs.to_number_e164 = c.mobile_phone_e164
            )
        )
    `);
    console.log(`     Already called today (filtered out): ${(calledTodayCount.rows[0] as any)?.count || 0}`);

    // Count contacts eligible (not called today)
    const eligibleCount = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${campaign.id}
        AND cq.status = 'queued'
        AND (c.direct_phone_e164 IS NOT NULL OR c.mobile_phone_e164 IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM call_sessions cs 
          WHERE cs.created_at >= CURRENT_DATE
            AND cs.agent_type = 'ai'
            AND (
              cs.contact_id = cq.contact_id
              OR cs.to_number_e164 = c.direct_phone_e164 
              OR cs.to_number_e164 = c.mobile_phone_e164
            )
        )
    `);
    console.log(`     Eligible (not called today, has phone): ${(eligibleCount.rows[0] as any)?.count || 0}`);

    // 8. Check if contacts have scheduled retry times blocking them
    const scheduledRetries = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE cq.next_attempt_at IS NOT NULL AND cq.next_attempt_at > NOW()) as scheduled_later,
        COUNT(*) FILTER (WHERE cq.next_attempt_at IS NULL OR cq.next_attempt_at <= NOW()) as ready_now
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${campaign.id}
        AND cq.status = 'queued'
        AND (c.direct_phone_e164 IS NOT NULL OR c.mobile_phone_e164 IS NOT NULL)
    `);

    const retryRow = scheduledRetries.rows[0] as any;
    console.log(`\n   📅 Next Attempt Scheduling:`);
    console.log(`     Ready to call now: ${retryRow?.ready_now || 0}`);
    console.log(`     Scheduled for later: ${retryRow?.scheduled_later || 0}`);

    // 9. ACTUAL orchestrator query simulation
    const orchestratorQuery = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM campaign_queue cq
      LEFT JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${campaign.id}
        AND cq.status = 'queued'
        AND (cq.next_attempt_at IS NULL OR cq.next_attempt_at <= NOW())
        AND (c.direct_phone_e164 IS NOT NULL OR c.mobile_phone_e164 IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM call_sessions cs 
          WHERE cs.created_at >= CURRENT_DATE
            AND cs.agent_type = 'ai'
            AND (
              cs.contact_id = cq.contact_id
              OR cs.to_number_e164 = c.direct_phone_e164 
              OR cs.to_number_e164 = c.mobile_phone_e164
            )
        )
    `);
    console.log(`\n   🔍 Orchestrator Query Result:`);
    console.log(`     Contacts matching SQL: ${(orchestratorQuery.rows[0] as any)?.count || 0}`);

    // 10. Check WHY contacts are scheduled for later
    const scheduledReasons = await db.execute(sql`
      SELECT 
        cq.enqueued_reason,
        cq.next_attempt_at,
        NOW() as now_time,
        (cq.next_attempt_at - NOW()) as delay_remaining
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${campaign.id}
        AND cq.status = 'queued'
        AND cq.next_attempt_at IS NOT NULL
        AND cq.next_attempt_at > NOW()
      ORDER BY cq.next_attempt_at ASC
      LIMIT 10
    `);

    if ((scheduledReasons.rows as any[]).length > 0) {
      console.log(`\n   📋 Sample Scheduled Contacts (why they're delayed):`);
      for (const row of scheduledReasons.rows as any[]) {
        const reason = row.enqueued_reason || '(no reason set)';
        const nextAt = row.next_attempt_at;
        console.log(`     - Next at: ${nextAt}, Reason: ${reason.substring(0, 100)}`);
      }
    }
  }

  console.log('\n\n=== Diagnosis Complete ===');
  process.exit(0);
}

diagnose().catch(err => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
