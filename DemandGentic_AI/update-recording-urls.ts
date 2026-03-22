import { db } from './server/db';
import { sql } from 'drizzle-orm';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

interface TelnyxRecording {
  id: string;
  download_urls: {
    mp3?: string;
    wav?: string;
  };
  duration_millis: number;
  created_at: string;
  status: string;
}

async function updateRecordingUrls() {
  console.log('========================================');
  console.log('UPDATE LEADS WITH FRESH RECORDING URLS');
  console.log('========================================\n');

  // Get actual call times from dialer_call_attempts for Jan 15 qualified/not_interested calls
  const callAttempts = await db.execute(sql`
    SELECT
      dca.id,
      dca.contact_id,
      dca.call_duration_seconds,
      c.first_name,
      c.last_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.disposition IN ('qualified_lead', 'not_interested')
      AND dca.call_duration_seconds > 0
    ORDER BY dca.call_duration_seconds DESC
  `);

  // Fetch all Jan 15 recordings from Telnyx
  const jan15Start = new Date('2026-01-15T00:00:00Z');
  const jan15End = new Date('2026-01-15T23:59:59Z');

  const params = new URLSearchParams();
  params.append('filter[created_at][gte]', jan15Start.toISOString());
  params.append('filter[created_at][lte]', jan15End.toISOString());
  params.append('page[size]', '100');

  const response = await fetch(`https://api.telnyx.com/v2/recordings?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  const recordings: TelnyxRecording[] = data.data || [];

  console.log(`Found ${recordings.length} recordings from Jan 15\n`);

  for (const row of callAttempts.rows) {
    const call = row as any;
    const callDuration = call.call_duration_seconds;
    const contactName = `${call.first_name} ${call.last_name}`;

    console.log(`\n${contactName} (${callDuration}s):`);

    // Find recording with matching duration
    const match = recordings.find(r => {
      const recDuration = Math.floor(r.duration_millis / 1000);
      return Math.abs(recDuration - callDuration)  0) {
          const leadId = (leadResult.rows[0] as any).id;

          await db.execute(sql`
            UPDATE leads
            SET recording_url = ${downloadUrl}
            WHERE id = ${leadId}
          `);

          console.log(`  ✅ Updated lead ${leadId}`);
          console.log(`  URL: ${downloadUrl.substring(0, 80)}...`);
        }
      }
    } else {
      console.log(`  ❌ No exact match found`);
    }
  }

  console.log('\n\n========================================');
  console.log('VERIFICATION - Try these URLs now:');
  console.log('========================================\n');

  const verifyLeads = await db.execute(sql`
    SELECT
      id,
      contact_name,
      call_duration,
      recording_url
    FROM leads
    WHERE created_at > NOW() - INTERVAL '1 day'
    ORDER BY created_at DESC
  `);

  for (const row of verifyLeads.rows) {
    const r = row as any;
    console.log(`${r.contact_name} (${r.call_duration}s):`);
    if (r.recording_url) {
      console.log(`  ${r.recording_url}`);
    } else {
      console.log(`  No recording URL`);
    }
    console.log('');
  }

  console.log('\n⚠️  WARNING: These Telnyx URLs expire in ~10 minutes!');
  console.log('For permanent storage, the GCS bucket needs to be configured properly.');

  process.exit(0);
}

updateRecordingUrls().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});