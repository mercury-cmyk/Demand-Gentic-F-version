/**
 * Re-score leads based on PROSPECT INTEREST, not conversation quality.
 * 
 * Interest Score = weighted formula prioritizing:
 *   - qualification_score (40%) — did the prospect meet qualification criteria?
 *   - engagement_score (30%) — was the prospect actively engaged?
 *   - closing_score (20%) — did it reach a positive conclusion?
 *   - empathy_score (10%) — was rapport established?
 * 
 * Qualification rule:
 *   - qualification_met = true  → ALWAYS qualifies (interest confirmed by AI)
 *   - expected_disposition matches positive patterns → qualifies if interest_score >= 60
 *   - Otherwise → only qualifies if interest_score >= 70
 */
import { pool } from '../server/db';

// Positive interest dispositions (AI detected prospect interest)
const INTEREST_DISPOSITIONS = [
  'success', 'qualified', 'qualified_lead', 'interested',
  'interest confirmed', 'lead generated', 'lead captured',
  'whitepaper consent obtained', 'whitepaper sent', 'whitepaper consent',
  'white paper consent obtained', 'white paper consent', 'white paper sent',
  'success - whitepaper consent', 'success - white paper consent',
  'success - consent obtained', 'success - whitepaper sent',
  'success - white paper sent', 'meeting booked', 'demo scheduled',
  'send information', 'hot lead / follow-up requested',
  'lead / whitepaper consent', 'lead / interest confirmed',
  'interested - material sent', 'data capture / callback',
  'lead / white paper sent', 'whitepaperconsen', 'in progress / qualified',
  'success - email obtained', 'referral', 'referral provided',
  'success / whitepaper consent',
];

function isInterestDisposition(dispo: string | null): boolean {
  if (!dispo) return false;
  return INTEREST_DISPOSITIONS.some(d => dispo.toLowerCase().includes(d.toLowerCase()));
}

async function main() {
  const client = await pool.connect();
  try {
    // Fetch ONLY AI leads with quality records
    const { rows } = await client.query(`
      SELECT DISTINCT ON (l.id)
        l.id as lead_id,
        l.contact_name,
        l.qa_status,
        l.ai_score as old_ai_score,
        l.ai_qualification_status as old_qual_status,
        cqr.qualification_met,
        cqr.expected_disposition,
        cqr.sentiment,
        cqr.engagement_level,
        cqr.overall_quality_score,
        cqr.qualification_score,
        cqr.engagement_score,
        cqr.closing_score,
        cqr.empathy_score,
        cqr.clarity_score,
        cqr.objection_handling_score
      FROM leads l
      JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
      LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
      WHERE l.deleted_at IS NULL
        AND (l.notes ILIKE '%ai_agent%' OR dca.agent_type::text = 'ai')
      ORDER BY l.id, cqr.created_at DESC
    `);

    console.log(`Found ${rows.length} scored AI leads to re-evaluate for interest.\n`);

    let updated = 0;
    let qualifiedCount = 0;
    let demotedCount = 0;
    let promotedCount = 0;
    const byStatus: Record<string, { total: number; qualified: number }> = {};

    for (const row of rows) {
      // INTEREST SCORE: weighted toward qualification, engagement, closing
      const interestScore = Math.round(
        (row.qualification_score || 0) * 0.40 +
        (row.engagement_score || 0) * 0.30 +
        (row.closing_score || 0) * 0.20 +
        (row.empathy_score || 0) * 0.10
      );

      // Determine if qualified based on INTEREST
      const qualMet = row.qualification_met === true;
      const isInterest = isInterestDisposition(row.expected_disposition);
      const positiveSentiment = row.sentiment === 'positive';
      const highEngagement = row.engagement_level === 'high' || row.engagement_level === 'medium';

      let qualified = false;
      let reason = '';

      if (qualMet) {
        // AI explicitly said qualification criteria were met = prospect expressed interest
        qualified = true;
        reason = 'qualification_met';
      } else if (isInterest && interestScore >= 60) {
        // AI detected interest disposition + decent interest score
        qualified = true;
        reason = `interest_dispo(${row.expected_disposition})`;
      } else if (interestScore >= 70 && positiveSentiment && highEngagement) {
        // High interest score + positive signals
        qualified = true;
        reason = 'high_interest_signals';
      }

      // Track changes
      const wasQualified = row.old_qual_status === 'qualified';
      if (qualified && !wasQualified) promotedCount++;
      if (!qualified && wasQualified) demotedCount++;

      // Update lead
      const newQualStatus = qualified ? 'qualified' : 'not_qualified';
      const newQaStatus = qualified
        ? (row.qa_status === 'approved' || row.qa_status === 'published' ? row.qa_status : 'under_review')
        : row.qa_status;

      await client.query(`
        UPDATE leads 
        SET ai_score = $1,
            ai_qualification_status = $2,
            qa_status = $3,
            updated_at = NOW()
        WHERE id = $4
      `, [interestScore, newQualStatus, newQaStatus, row.lead_id]);

      updated++;
      if (qualified) qualifiedCount++;

      if (!byStatus[row.qa_status]) byStatus[row.qa_status] = { total: 0, qualified: 0 };
      byStatus[row.qa_status].total++;
      if (qualified) byStatus[row.qa_status].qualified++;
    }

    console.log('='.repeat(70));
    console.log('INTEREST-BASED RE-SCORING COMPLETE');
    console.log('='.repeat(70));
    console.log(`Total leads updated: ${updated}`);
    console.log(`Qualified (prospect expressed interest): ${qualifiedCount}`);
    console.log(`Not qualified (no interest detected): ${updated - qualifiedCount}`);
    console.log(`Newly promoted to qualified: ${promotedCount}`);
    console.log(`Demoted from qualified: ${demotedCount}`);

    console.log('\nBy QA status:');
    for (const [status, stats] of Object.entries(byStatus)) {
      console.log(`  ${status}: ${stats.qualified}/${stats.total} showed interest`);
    }

    // Score distribution
    const dist = { '90-100': 0, '70-89': 0, '50-69': 0, '30-49': 0, '0-29': 0 };
    for (const row of rows) {
      const is = Math.round(
        (row.qualification_score || 0) * 0.40 +
        (row.engagement_score || 0) * 0.30 +
        (row.closing_score || 0) * 0.20 +
        (row.empathy_score || 0) * 0.10
      );
      if (is >= 90) dist['90-100']++;
      else if (is >= 70) dist['70-89']++;
      else if (is >= 50) dist['50-69']++;
      else if (is >= 30) dist['30-49']++;
      else dist['0-29']++;
    }
    console.log('\nInterest Score distribution:');
    for (const [range, count] of Object.entries(dist)) {
      console.log(`  ${range}: ${count}`);
    }

    // Show top qualifying leads
    const qualifiedLeads = rows
      .filter(r => r.qualification_met === true || isInterestDisposition(r.expected_disposition))
      .map(r => ({
        name: r.contact_name,
        interestScore: Math.round(
          (r.qualification_score || 0) * 0.40 +
          (r.engagement_score || 0) * 0.30 +
          (r.closing_score || 0) * 0.20 +
          (r.empathy_score || 0) * 0.10
        ),
        expectedDispo: r.expected_disposition,
        qualMet: r.qualification_met,
        qaStatus: r.qa_status,
      }))
      .sort((a, b) => b.interestScore - a.interestScore);

    if (qualifiedLeads.length > 0) {
      console.log(`\nTop ${Math.min(30, qualifiedLeads.length)} interest-qualified leads:`);
      for (const l of qualifiedLeads.slice(0, 30)) {
        console.log(`  IS:${l.interestScore} | ${l.name} | ${l.expectedDispo} | qual_met:${l.qualMet} | qa:${l.qaStatus}`);
      }
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
