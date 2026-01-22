/**
 * Campaign Diagnostic Script
 *
 * Diagnoses why AI campaigns are not making calls:
 * - Checks campaign status and dial_mode
 * - Checks virtual agent assignment
 * - Checks queue status and contact counts
 * - Checks business hours and timezone coverage
 * - Checks enabled countries
 */
import { pool } from './server/db';

async function diagnose() {
  console.log('=== Campaign Diagnostic Report ===\n');

  // 1. Check active AI campaigns
  console.log('1. ACTIVE AI CAMPAIGNS');
  console.log('-'.repeat(50));

  const campaigns = await pool.query(`
    SELECT
      c.id,
      c.name,
      c.status,
      c.dial_mode,
      c.created_at,
      caa.virtual_agent_id,
      va.name as virtual_agent_name,
      va.provider as virtual_agent_provider
    FROM campaigns c
    LEFT JOIN campaign_agent_assignments caa ON caa.campaign_id = c.id
      AND caa.is_active = true
      AND caa.agent_type = 'ai'
    LEFT JOIN virtual_agents va ON va.id = caa.virtual_agent_id
    WHERE c.dial_mode = 'ai_agent'
    ORDER BY c.status, c.created_at DESC
  `);

  if (campaigns.rows.length === 0) {
    console.log('  NO AI CAMPAIGNS FOUND!\n');
    console.log('  To fix: Create a campaign with dial_mode = "ai_agent"\n');
  } else {
    for (const camp of campaigns.rows) {
      console.log(`  Campaign: ${camp.name}`);
      console.log(`    ID: ${camp.id}`);
      console.log(`    Status: ${camp.status} ${camp.status === 'active' ? '✓' : '⚠️ NOT ACTIVE'}`);
      console.log(`    Dial Mode: ${camp.dial_mode}`);
      console.log(`    Virtual Agent: ${camp.virtual_agent_name || '⚠️ NONE ASSIGNED'}`);
      if (camp.virtual_agent_provider) {
        console.log(`    Agent Provider: ${camp.virtual_agent_provider}`);
      }
      console.log('');
    }
  }

  // 2. Check queue status for active campaigns
  console.log('\n2. QUEUE STATUS (for AI campaigns)');
  console.log('-'.repeat(50));

  const queueStats = await pool.query(`
    SELECT
      c.name as campaign_name,
      c.status as campaign_status,
      COUNT(*) FILTER (WHERE cq.status = 'queued') as queued,
      COUNT(*) FILTER (WHERE cq.status = 'in_progress') as in_progress,
      COUNT(*) FILTER (WHERE cq.status = 'done') as done,
      COUNT(*) FILTER (WHERE cq.status = 'removed') as removed,
      COUNT(*) as total
    FROM campaigns c
    LEFT JOIN campaign_queue cq ON cq.campaign_id = c.id
    WHERE c.dial_mode = 'ai_agent'
    GROUP BY c.id, c.name, c.status
    ORDER BY c.status, c.name
  `);

  for (const stat of queueStats.rows) {
    console.log(`  ${stat.campaign_name} (${stat.campaign_status})`);
    console.log(`    Total contacts: ${stat.total}`);
    console.log(`    Queued: ${stat.queued} ${parseInt(stat.queued) === 0 ? '⚠️ NO CONTACTS TO CALL' : '✓'}`);
    console.log(`    In Progress: ${stat.in_progress}`);
    console.log(`    Done: ${stat.done}`);
    console.log(`    Removed: ${stat.removed}`);
    console.log('');
  }

  // 3. Check timezone/country distribution for queued contacts
  console.log('\n3. BUSINESS HOURS ANALYSIS (queued contacts only)');
  console.log('-'.repeat(50));

  const timezoneAnalysis = await pool.query(`
    WITH enabled_countries AS (
      SELECT unnest(ARRAY[
        'AU', 'AUSTRALIA', 'NZ', 'NEW ZEALAND',
        'AE', 'UNITED ARAB EMIRATES', 'UAE', 'DUBAI',
        'SA', 'SAUDI ARABIA', 'IL', 'ISRAEL',
        'QA', 'QATAR', 'KW', 'KUWAIT', 'BH', 'BAHRAIN', 'OM', 'OMAN',
        'US', 'USA', 'UNITED STATES', 'AMERICA',
        'CA', 'CANADA', 'MX', 'MEXICO',
        'GB', 'UK', 'UNITED KINGDOM', 'UNITED KINGDOM UK', 'ENGLAND', 'SCOTLAND', 'WALES',
        'IE', 'IRELAND',
        'DE', 'GERMANY', 'FR', 'FRANCE', 'IT', 'ITALY', 'ES', 'SPAIN',
        'NL', 'NETHERLANDS', 'BE', 'BELGIUM', 'CH', 'SWITZERLAND', 'AT', 'AUSTRIA',
        'SE', 'SWEDEN', 'NO', 'NORWAY', 'DK', 'DENMARK', 'FI', 'FINLAND',
        'PL', 'POLAND', 'PT', 'PORTUGAL', 'CZ', 'CZECHIA', 'CZECH REPUBLIC', 'GR', 'GREECE',
        'SG', 'SINGAPORE', 'HK', 'HONG KONG', 'JP', 'JAPAN', 'KR', 'SOUTH KOREA',
        'IN', 'INDIA', 'CN', 'CHINA', 'TW', 'TAIWAN', 'MY', 'MALAYSIA',
        'PH', 'PHILIPPINES', 'TH', 'THAILAND', 'VN', 'VIETNAM', 'ID', 'INDONESIA',
        'BR', 'BRAZIL', 'AR', 'ARGENTINA', 'CL', 'CHILE', 'CO', 'COLOMBIA', 'PE', 'PERU',
        'ZA', 'SOUTH AFRICA'
      ]) as country
    )
    SELECT
      COALESCE(UPPER(TRIM(ct.country)), 'NO COUNTRY') as country,
      COUNT(*) as count,
      CASE
        WHEN UPPER(TRIM(ct.country)) IN (SELECT country FROM enabled_countries) THEN 'ENABLED'
        ELSE 'DISABLED'
      END as region_status
    FROM campaign_queue cq
    JOIN contacts ct ON ct.id = cq.contact_id
    JOIN campaigns c ON c.id = cq.campaign_id
    WHERE cq.status = 'queued'
      AND c.dial_mode = 'ai_agent'
      AND c.status = 'active'
    GROUP BY COALESCE(UPPER(TRIM(ct.country)), 'NO COUNTRY')
    ORDER BY count DESC
    LIMIT 20
  `);

  if (timezoneAnalysis.rows.length === 0) {
    console.log('  No queued contacts found in active AI campaigns!\n');
  } else {
    let enabledCount = 0;
    let disabledCount = 0;

    console.log('  Country Distribution:');
    for (const row of timezoneAnalysis.rows) {
      const status = row.region_status === 'ENABLED' ? '✓' : '⚠️ DISABLED';
      console.log(`    ${row.country}: ${row.count} contacts ${status}`);
      if (row.region_status === 'ENABLED') {
        enabledCount += parseInt(row.count);
      } else {
        disabledCount += parseInt(row.count);
      }
    }
    console.log('');
    console.log(`  Summary: ${enabledCount} in enabled regions, ${disabledCount} in disabled regions`);
  }

  // 4. Check phone number availability
  console.log('\n4. PHONE NUMBER CHECK (queued contacts)');
  console.log('-'.repeat(50));

  const phoneCheck = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE ct.direct_phone_e164 IS NOT NULL OR ct.mobile_phone_e164 IS NOT NULL) as has_phone,
      COUNT(*) FILTER (WHERE ct.direct_phone_e164 IS NULL AND ct.mobile_phone_e164 IS NULL) as no_phone,
      COUNT(*) as total
    FROM campaign_queue cq
    JOIN contacts ct ON ct.id = cq.contact_id
    JOIN campaigns c ON c.id = cq.campaign_id
    WHERE cq.status = 'queued'
      AND c.dial_mode = 'ai_agent'
      AND c.status = 'active'
  `);

  const phone = phoneCheck.rows[0];
  if (phone) {
    console.log(`  Has phone number: ${phone.has_phone}`);
    console.log(`  No phone number: ${phone.no_phone} ${parseInt(phone.no_phone) > 0 ? '⚠️' : '✓'}`);
    console.log(`  Total: ${phone.total}`);
  }

  // 5. Check for contacts already called today (Telnyx D66 limit)
  console.log('\n5. CONTACTS ALREADY CALLED TODAY');
  console.log('-'.repeat(50));

  const calledToday = await pool.query(`
    SELECT COUNT(DISTINCT cs.contact_id) as called_today
    FROM call_sessions cs
    JOIN campaign_queue cq ON cq.contact_id = cs.contact_id
    JOIN campaigns c ON c.id = cq.campaign_id
    WHERE cs.created_at >= CURRENT_DATE
      AND cs.agent_type = 'ai'
      AND c.dial_mode = 'ai_agent'
      AND c.status = 'active'
      AND cq.status = 'queued'
  `);

  console.log(`  Contacts in queue already called today: ${calledToday.rows[0]?.called_today || 0}`);
  console.log('  (These will be skipped to avoid Telnyx daily call limits)\n');

  // 6. Check business hours eligibility
  console.log('\n6. BUSINESS HOURS ELIGIBILITY (current time check)');
  console.log('-'.repeat(50));

  const businessHoursCheck = await pool.query(`
    WITH contact_timezones AS (
      SELECT
        cq.id as queue_id,
        ct.country,
        ct.state,
        ct.timezone,
        COALESCE(
          ct.timezone,
          CASE
            WHEN UPPER(ct.country) IN ('GB', 'UK', 'UNITED KINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES') THEN 'Europe/London'
            WHEN UPPER(ct.country) IN ('US', 'USA', 'UNITED STATES', 'AMERICA') THEN 'America/New_York'
            WHEN UPPER(ct.country) IN ('CA', 'CANADA') THEN 'America/Toronto'
            WHEN UPPER(ct.country) IN ('AU', 'AUSTRALIA') THEN 'Australia/Sydney'
            WHEN ct.mobile_phone_e164 LIKE '+44%' OR ct.direct_phone_e164 LIKE '+44%' THEN 'Europe/London'
            WHEN ct.mobile_phone_e164 LIKE '+1%' OR ct.direct_phone_e164 LIKE '+1%' THEN 'America/New_York'
            ELSE NULL
          END
        ) as inferred_timezone
      FROM campaign_queue cq
      JOIN contacts ct ON ct.id = cq.contact_id
      JOIN campaigns c ON c.id = cq.campaign_id
      WHERE cq.status = 'queued'
        AND c.dial_mode = 'ai_agent'
        AND c.status = 'active'
    )
    SELECT
      inferred_timezone as timezone,
      COUNT(*) as contact_count,
      CASE
        WHEN inferred_timezone IS NOT NULL
             AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = inferred_timezone)
        THEN (
          EXTRACT(DOW FROM NOW() AT TIME ZONE inferred_timezone) BETWEEN 1 AND 5
          AND EXTRACT(HOUR FROM NOW() AT TIME ZONE inferred_timezone) BETWEEN 9 AND 16
        )
        ELSE false
      END as within_business_hours,
      CASE
        WHEN inferred_timezone IS NOT NULL
             AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = inferred_timezone)
        THEN TO_CHAR(NOW() AT TIME ZONE inferred_timezone, 'Day HH24:MI')
        ELSE 'Unknown'
      END as local_time
    FROM contact_timezones
    GROUP BY inferred_timezone
    ORDER BY contact_count DESC
    LIMIT 15
  `);

  let callableNow = 0;
  let notCallableNow = 0;
  let unknownTimezone = 0;

  console.log('  Timezone | Contacts | Local Time | Callable Now?');
  console.log('  ' + '-'.repeat(60));

  for (const row of businessHoursCheck.rows) {
    const tz = row.timezone || 'UNKNOWN';
    const callable = row.within_business_hours === true ? '✓ YES' : '✗ NO';
    console.log(`  ${tz.padEnd(20)} | ${String(row.contact_count).padStart(8)} | ${row.local_time.padEnd(15)} | ${callable}`);

    if (row.timezone === null) {
      unknownTimezone += parseInt(row.contact_count);
    } else if (row.within_business_hours === true) {
      callableNow += parseInt(row.contact_count);
    } else {
      notCallableNow += parseInt(row.contact_count);
    }
  }

  console.log('');
  console.log(`  Summary:`);
  console.log(`    Callable now (within business hours): ${callableNow}`);
  console.log(`    Not callable now (outside hours): ${notCallableNow}`);
  console.log(`    Unknown timezone (will be skipped): ${unknownTimezone}`);

  // 7. Final recommendation
  console.log('\n\n=== DIAGNOSIS SUMMARY ===');
  console.log('='.repeat(50));

  // Check for issues
  const issues: string[] = [];

  // Check if campaigns are active
  const activeCampaigns = campaigns.rows.filter((c: any) => c.status === 'active');
  if (activeCampaigns.length === 0) {
    issues.push('No active AI campaigns found. Activate a campaign first.');
  }

  // Check if virtual agents are assigned
  const campaignsWithoutAgent = activeCampaigns.filter((c: any) => !c.virtual_agent_id);
  if (campaignsWithoutAgent.length > 0) {
    issues.push(`${campaignsWithoutAgent.length} active campaign(s) have no virtual agent assigned.`);
  }

  // Check if there are queued contacts
  const totalQueued = queueStats.rows.reduce((sum: number, s: any) => sum + parseInt(s.queued || 0), 0);
  if (totalQueued === 0) {
    issues.push('No contacts are queued in active AI campaigns. Add contacts to the campaign queue.');
  }

  // Check if contacts can be called now
  if (callableNow === 0 && totalQueued > 0) {
    issues.push('No contacts are currently callable (all are outside business hours or have unknown timezone).');
  }

  if (issues.length === 0) {
    console.log('\n  ✓ No obvious issues found!');
    console.log('  If calls are still not being made, check:');
    console.log('    - Server logs for errors');
    console.log('    - Redis connection (required for BullMQ orchestrator)');
    console.log('    - TELNYX_FROM_NUMBER environment variable');
    console.log('    - Telnyx account balance and status');
  } else {
    console.log('\n  ISSUES FOUND:');
    for (let i = 0; i < issues.length; i++) {
      console.log(`    ${i + 1}. ${issues[i]}`);
    }
  }

  console.log('\n');
  process.exit(0);
}

diagnose().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
