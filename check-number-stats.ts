import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkStats() {
  try {
    console.log('=== Number Pool Stats ===\n');

    // Check telnyx_numbers table for call stats
    const numbers = await db.execute(sql`
      SELECT
        phone_number_e164,
        status,
        calls_today,
        calls_this_hour,
        last_call_at
      FROM telnyx_numbers
      ORDER BY last_call_at DESC NULLS LAST
      LIMIT 10
    `);

    console.log('Numbers with recent calls:');
    if (numbers.rows.length === 0) {
      console.log('  No numbers found in pool');
    } else {
      for (const row of numbers.rows) {
        console.log(`  ${row.phone_number_e164}: today=${row.calls_today || 0}, hour=${row.calls_this_hour || 0}, last=${row.last_call_at || 'never'}`);
      }
    }

    // Check number_reputation table
    console.log('\n=== Number Reputation ===\n');
    const reputation = await db.execute(sql`
      SELECT
        nr.number_id,
        tn.phone_number_e164,
        nr.score,
        nr.band,
        nr.total_calls,
        nr.answered_calls,
        nr.last_calculated_at
      FROM number_reputation nr
      JOIN telnyx_numbers tn ON tn.id = nr.number_id
      ORDER BY nr.last_calculated_at DESC NULLS LAST
      LIMIT 5
    `);

    if (reputation.rows.length === 0) {
      console.log('  No reputation records found');
    } else {
      for (const row of reputation.rows) {
        console.log(`  ${row.phone_number_e164}: score=${row.score}, band=${row.band}, calls=${row.total_calls}, answered=${row.answered_calls}`);
      }
    }

    // Check if there are any call logs in number_metrics_window
    console.log('\n=== Recent Call Metrics (number_metrics_window) ===\n');
    const metrics = await db.execute(sql`
      SELECT
        nmw.number_id,
        tn.phone_number_e164,
        nmw.answered,
        nmw.disposition,
        nmw.duration_sec,
        nmw.called_at
      FROM number_metrics_window nmw
      LEFT JOIN telnyx_numbers tn ON tn.id = nmw.number_id
      ORDER BY nmw.called_at DESC
      LIMIT 5
    `);

    if (metrics.rows.length === 0) {
      console.log('  No call metrics recorded');
    } else {
      for (const row of metrics.rows) {
        console.log(`  ${row.phone_number_e164 || row.number_id}: answered=${row.answered}, disp=${row.disposition}, dur=${row.duration_sec}s, at=${row.called_at}`);
      }
    }

    // Check recent routing decisions
    console.log('\n=== Recent Routing Decisions ===\n');
    const decisions = await db.execute(sql`
      SELECT
        selected_number_e164,
        selection_reason,
        candidates_count,
        decided_at
      FROM number_routing_decisions
      ORDER BY decided_at DESC
      LIMIT 5
    `);

    if (decisions.rows.length === 0) {
      console.log('  No routing decisions recorded');
    } else {
      for (const row of decisions.rows) {
        console.log(`  ${row.selected_number_e164}: reason=${row.selection_reason}, candidates=${row.candidates_count}, at=${row.decided_at}`);
      }
    }

  } catch (e: any) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

checkStats();
