import { db } from './server/db';
import { sql } from 'drizzle-orm';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

// --- CONFIGURE THESE FOR THE IMPORT ---
const RECORDINGS_TO_IMPORT = [
  {
    date: '2026-02-12T21:59:06Z',
    to: '+17804988148',
    from: '+13023601514',
    duration: 35.1,
  },
  {
    date: '2026-02-12T21:48:57Z',
    to: '+14168393060',
    from: '+15858251303',
    duration: 54.9,
  },
  {
    date: '2026-02-12T21:44:32Z',
    to: '+16478933564',
    from: '+12026267428',
    duration: 29.4,
  },
];

const ORG_ID = 'GREEN_LEADS_ORG_ID'; // TODO: Set correct org/account id
const QUALIFIED_LEAD_TYPE = 'qualified_lead';

async function importTelnyxRecordings() {
  console.log('=== Telnyx Recording Import (Admin Only) ===\n');

  for (const rec of RECORDINGS_TO_IMPORT) {
    // ±5 min window
    const start = new Date(new Date(rec.date).getTime() - 5 * 60 * 1000).toISOString();
    const end = new Date(new Date(rec.date).getTime() + 5 * 60 * 1000).toISOString();

    const params = new URLSearchParams();
    params.append('filter[created_at][gte]', start);
    params.append('filter[created_at][lte]', end);
    params.append('page[size]', '100');

    const response = await fetch(`https://api.telnyx.com/v2/recordings?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    const recordings = data.data || [];

    // Find by from/to/duration (±5s)
      const match = recordings.find((r: any) => {
      const recDuration = Math.floor(r.duration_millis / 1000);
      return (
        Math.abs(recDuration - Math.round(rec.duration))  {
  console.error('Error:', e);
  process.exit(1);
});