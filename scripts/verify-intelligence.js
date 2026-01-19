import { neon } from '@neondatabase/serverless';
const sql = neon('postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require');

(async function() {
  const sample = await sql`
    SELECT
      cap.account_id,
      a.name as account_name,
      cap.messaging_package,
      cap.confidence,
      cap.generated_at
    FROM campaign_account_problems cap
    JOIN accounts a ON cap.account_id = a.id
    WHERE cap.campaign_id = '2df6b4f5-c1ff-4324-87f0-94053d4c5cbf'
    ORDER BY cap.generated_at DESC
    LIMIT 3
  `;

  console.log('Sample generated intelligence (3 most recent):');
  sample.forEach((row, i) => {
    console.log('\nAccount', i+1, ':', row.account_name);
    console.log('  Confidence:', row.confidence);
    console.log('  Generated:', row.generated_at);
    const mp = typeof row.messaging_package === 'string'
      ? JSON.parse(row.messaging_package)
      : row.messaging_package;
    console.log('  Primary angle:', mp?.primaryAngle || 'N/A');
    if (mp?.openingLines?.length > 0) {
      console.log('  Opening line:', mp.openingLines[0]?.substring(0, 100) + '...');
    }
  });
})();
