import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function analyzeLegacyLeads() {
  console.log('='.repeat(60));
  console.log('LEGACY LEADS ANALYSIS (without call_attempt_id)');
  console.log('='.repeat(60));

  console.log('\n1. BY QA STATUS:');
  const byStatus = await db.execute(sql`
    SELECT qa_status, COUNT(*) as count
    FROM leads
    WHERE call_attempt_id IS NULL AND deleted_at IS NULL
    GROUP BY qa_status
    ORDER BY count DESC
  `);
  byStatus.rows?.forEach(r => console.log('  ', r.qa_status, ':', r.count));

  console.log('\n2. BY CREATION MONTH:');
  const byMonth = await db.execute(sql`
    SELECT
      TO_CHAR(created_at, 'YYYY-MM') as month,
      COUNT(*) as count
    FROM leads
    WHERE call_attempt_id IS NULL AND deleted_at IS NULL
    GROUP BY TO_CHAR(created_at, 'YYYY-MM')
    ORDER BY month DESC
    LIMIT 12
  `);
  byMonth.rows?.forEach(r => console.log('  ', r.month, ':', r.count));

  console.log('\n3. DATA QUALITY:');
  const quality = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN recording_url IS NOT NULL THEN 1 ELSE 0 END) as has_recording,
      SUM(CASE WHEN transcript IS NOT NULL THEN 1 ELSE 0 END) as has_transcript,
      SUM(CASE WHEN call_duration IS NOT NULL AND call_duration > 0 THEN 1 ELSE 0 END) as has_duration,
      SUM(CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) as has_contact,
      SUM(CASE WHEN campaign_id IS NOT NULL THEN 1 ELSE 0 END) as has_campaign
    FROM leads
    WHERE call_attempt_id IS NULL AND deleted_at IS NULL
  `);
  const q = quality.rows?.[0] || {};
  console.log('  Total legacy leads:', q.total);
  console.log('  Has recording URL:', q.has_recording);
  console.log('  Has transcript:', q.has_transcript);
  console.log('  Has call duration:', q.has_duration);
  console.log('  Has contact_id:', q.has_contact);
  console.log('  Has campaign_id:', q.has_campaign);

  console.log('\n4. VOICEMAIL INDICATORS IN NOTES:');
  const vmIndicators = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM leads
    WHERE call_attempt_id IS NULL
      AND deleted_at IS NULL
      AND (
        LOWER(notes) LIKE '%voicemail%' OR
        LOWER(notes) LIKE '%no answer%' OR
        LOWER(notes) LIKE '%left message%' OR
        LOWER(notes) LIKE '%vm%'
      )
  `);
  console.log('  Leads with voicemail keywords in notes:', vmIndicators.rows?.[0]?.count || 0);

  console.log('\n5. VOICEMAIL PATTERNS IN TRANSCRIPTS:');
  const vmTranscripts = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM leads
    WHERE call_attempt_id IS NULL
      AND deleted_at IS NULL
      AND transcript IS NOT NULL
      AND (
        LOWER(transcript) LIKE '%voicemail%' OR
        LOWER(transcript) LIKE '%leave a message%' OR
        LOWER(transcript) LIKE '%after the tone%' OR
        LOWER(transcript) LIKE '%beep%' OR
        LOWER(transcript) LIKE '%not available%please leave%'
      )
  `);
  console.log('  Leads with voicemail patterns in transcript:', vmTranscripts.rows?.[0]?.count || 0);

  console.log('\n6. SAMPLE LEGACY LEADS (10):');
  const samples = await db.execute(sql`
    SELECT
      id,
      contact_name,
      account_name,
      qa_status,
      call_duration,
      LEFT(notes, 80) as notes_preview,
      created_at
    FROM leads
    WHERE call_attempt_id IS NULL AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 10
  `);
  samples.rows?.forEach(r => {
    console.log('  -', r.id?.slice(0, 8), '|', r.contact_name?.slice(0, 20), '|', r.account_name?.slice(0, 15), '|', r.qa_status, '| dur:', r.call_duration, '|', r.notes_preview?.slice(0, 40));
  });

  console.log('\n7. LEADS LINKABLE TO OLD CALLS TABLE:');
  const oldCalls = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM leads l
    WHERE l.call_attempt_id IS NULL
      AND l.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM calls c
        WHERE c.contact_id = l.contact_id
          AND c.campaign_id = l.campaign_id
      )
  `);
  console.log('  Leads with matching old calls record:', oldCalls.rows?.[0]?.count || 0);

  console.log('\n' + '='.repeat(60));
  process.exit(0);
}

analyzeLegacyLeads().catch(e => { console.error(e); process.exit(1); });