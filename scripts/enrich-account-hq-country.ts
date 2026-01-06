/**
 * Enrich Account HQ Country from Contact Countries
 * 
 * For accounts missing hq_country, infer it from the countries of associated
 * verification contacts. If most/all contacts are in the same country, that's
 * likely the HQ country.
 */

import { db } from '../server/db';
import { accounts } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function enrichAccountHqCountry(campaignId: string) {
  console.log('🔄 Enriching Account HQ Countries from Contact Data...\n');
  
  const stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
  };

  try {
    // Use SQL to infer HQ country for each account based on contact countries
    // Logic: If >= 50% of an account's contacts are in the same country, use that as HQ country
    const result = await db.execute(sql`
      WITH account_country_stats AS (
        SELECT 
          vc.account_id,
          vc.contact_country,
          COUNT(*) as contact_count,
          COUNT(*) OVER (PARTITION BY vc.account_id) as total_contacts_per_account,
          ROUND(100.0 * COUNT(*) / COUNT(*) OVER (PARTITION BY vc.account_id), 1) as percentage
        FROM verification_contacts vc
        WHERE vc.campaign_id = ${campaignId}
          AND vc.account_id IS NOT NULL
          AND vc.contact_country IS NOT NULL
          AND vc.contact_country != ''
          AND vc.deleted = false
        GROUP BY vc.account_id, vc.contact_country
      ),
      dominant_countries AS (
        SELECT 
          account_id,
          contact_country as inferred_hq_country,
          contact_count,
          total_contacts_per_account,
          percentage
        FROM account_country_stats
        WHERE percentage >= 50  -- At least 50% of contacts in this country
        ORDER BY account_id, percentage DESC, contact_count DESC
      )
      UPDATE accounts a
      SET 
        hq_country = dc.inferred_hq_country,
        updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (account_id)
          account_id,
          inferred_hq_country
        FROM dominant_countries
      ) dc
      WHERE a.id = dc.account_id
        AND (a.hq_country IS NULL OR a.hq_country = '')
      RETURNING a.id, a.name, a.hq_country
    `);

    stats.updated = result.rowCount || 0;
    
    console.log(`\n✅ Enriched ${stats.updated} accounts with HQ country\n`);
    
    // Sample some results
    if (result.rows.length > 0) {
      console.log('Sample enriched accounts:');
      result.rows.slice(0, 10).forEach((row: any) => {
        console.log(`  - ${row.name}: ${row.hq_country}`);
      });
    }

  } catch (error: any) {
    console.error('\n❌ Enrichment failed:', error.message);
    process.exit(1);
  }
}

// Get campaign ID from command line
const campaignId = process.argv[2];

if (!campaignId) {
  console.error('❌ Campaign ID required');
  console.log('Usage: npx tsx scripts/enrich-account-hq-country.ts <campaign-id>');
  process.exit(1);
}

enrichAccountHqCountry(campaignId).then(() => {
  console.log('\n✅ Enrichment complete!\n');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
