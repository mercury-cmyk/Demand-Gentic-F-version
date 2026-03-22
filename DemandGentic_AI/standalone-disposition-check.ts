import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from '@neondatabase/serverless';
import ws from "ws";

// @ts-ignore
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 1
});

async function checkDispositions() {
  try {
    // ============ DIALER CALL ATTEMPTS (AI Campaign Calls) ============
    const dialerTotalResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM dialer_call_attempts
    `);

    const dialerWithDispResult = await pool.query(`
      SELECT COUNT(*) as with_disp
      FROM dialer_call_attempts
      WHERE disposition IS NOT NULL
    `);

    const dialerRecentResult = await pool.query(`
      SELECT COUNT(*) as recent_total
      FROM dialer_call_attempts
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);

    const dialerRecentDispResult = await pool.query(`
      SELECT COUNT(*) as recent_with_disp
      FROM dialer_call_attempts
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND disposition IS NOT NULL
    `);

    const dialerBreakdownResult = await pool.query(`
      SELECT disposition, COUNT(*) as count
      FROM dialer_call_attempts
      WHERE disposition IS NOT NULL
      GROUP BY disposition
      ORDER BY count DESC
    `);

    // ============ CALL ATTEMPTS (Legacy Human Calls) ============
    // Total calls all time
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM call_attempts
    `);

    // Calls with dispositions
    const withDispositionResult = await pool.query(`
      SELECT COUNT(*) as with_disp
      FROM call_attempts
      WHERE disposition IS NOT NULL
    `);

    // Recent calls (last 7 days)
    const recentResult = await pool.query(`
      SELECT COUNT(*) as recent_total
      FROM call_attempts
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);

    // Recent with disposition
    const recentDispResult = await pool.query(`
      SELECT COUNT(*) as recent_with_disp
      FROM call_attempts
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND disposition IS NOT NULL
    `);

    // Disposition breakdown
    const breakdownResult = await pool.query(`
      SELECT disposition, COUNT(*) as count
      FROM call_attempts
      WHERE disposition IS NOT NULL
      GROUP BY disposition
      ORDER BY count DESC
    `);

    // Print AI/Dialer stats first
    const dialerTotal = parseInt(dialerTotalResult.rows[0].total);
    const dialerWithDisp = parseInt(dialerWithDispResult.rows[0].with_disp);
    const dialerRecentTotal = parseInt(dialerRecentResult.rows[0].recent_total);
    const dialerRecentWithDisp = parseInt(dialerRecentDispResult.rows[0].recent_with_disp);

    console.log('\n📊 Call Disposition Analysis\n');
    console.log('='.repeat(50));

    console.log('\n🤖 AI/DIALER CALL ATTEMPTS (dialer_call_attempts):');
    console.log(`   Total Calls: ${dialerTotal.toLocaleString()}`);
    console.log(`   With Disposition: ${dialerWithDisp.toLocaleString()}`);
    console.log(`   Missing Disposition: ${(dialerTotal - dialerWithDisp).toLocaleString()}`);
    if (dialerTotal > 0) {
      console.log(`   Disposition Rate: ${((dialerWithDisp / dialerTotal) * 100).toFixed(1)}%`);
    }

    console.log('\n   Last 7 Days:');
    console.log(`     Total: ${dialerRecentTotal.toLocaleString()}`);
    console.log(`     With Disposition: ${dialerRecentWithDisp.toLocaleString()}`);

    if (dialerBreakdownResult.rows.length > 0) {
      console.log('\n   Disposition Breakdown:');
      dialerBreakdownResult.rows.forEach((row: any) => {
        console.log(`     ${row.disposition}: ${row.count}`);
      });
    }
    
    const total = parseInt(totalResult.rows[0].total);
    const withDisp = parseInt(withDispositionResult.rows[0].with_disp);
    const recentTotal = parseInt(recentResult.rows[0].recent_total);
    const recentWithDisp = parseInt(recentDispResult.rows[0].recent_with_disp);

    console.log('\n👤 LEGACY CALL ATTEMPTS (call_attempts):');
    console.log(`   Total Calls: ${total.toLocaleString()}`);
    console.log(`   With Disposition: ${withDisp.toLocaleString()}`);
    console.log(`   Missing Disposition: ${(total - withDisp).toLocaleString()}`);

    if (total > 0) {
      const percentage = ((withDisp / total) * 100).toFixed(1);
      console.log(`   Disposition Rate: ${percentage}%`);
    }

    console.log('\n   Last 7 Days:');
    console.log(`     Total: ${recentTotal.toLocaleString()}`);
    console.log(`     With Disposition: ${recentWithDisp.toLocaleString()}`);

    if (breakdownResult.rows.length > 0) {
      console.log('\n   Disposition Breakdown:');
      breakdownResult.rows.forEach((row: any) => {
        console.log(`     ${row.disposition}: ${row.count}`);
      });
    }

    console.log('\n' + '='.repeat(50));
    console.log();
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkDispositions();