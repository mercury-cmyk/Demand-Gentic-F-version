import { db } from './server/db';

(async () => {
  try {
    console.log('\n=== Recent AI Call Sessions ===\n');
    
    const result = await db.execute(`
      SELECT *
      FROM call_sessions
      ORDER BY created_at DESC
      LIMIT 20
    `);

    if (result.rows.length === 0) {
      console.log('No call sessions found.');
      process.exit(0);
    }

    result.rows.forEach((r: any, i: number) => {
      console.log(`${i + 1}. Call Session: ${r.id}`);
      console.log(`   Contact ID: ${r.contact_id || 'N/A'}`);
      console.log(`   Status: ${r.status}`);
      console.log(`   Connected: ${r.connected ? 'Yes' : 'No'}`);
      console.log(`   Duration: ${r.duration || 0}s`);
      console.log(`   AI Disposition: ${r.ai_disposition || 'N/A'}`);
      if (r.ai_transcript && r.ai_transcript.length > 10) {
        const preview = r.ai_transcript.substring(0, 150);
        console.log(`   Transcript: ${preview}${r.ai_transcript.length > 150 ? '...' : ''}`);
      }
      console.log(`   Time: ${new Date(r.created_at).toLocaleString()}`);
      console.log('');
    });

    console.log('\n✅ AI Call Log Check Complete\n');

    process.exit(0);
  } catch (error) {
    console.error('Error checking call logs:', error);
    process.exit(1);
  }
})();
