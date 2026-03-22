import { pool } from '../server/db';
import { analyzeLeadQualification } from '../server/services/ai-qa-analyzer';

type QueryClient = {
  query: (text: string, params?: unknown[]) => Promise;
};

type PendingLead = {
  id: string;
  qa_status: string;
  contact_name: string | null;
  campaign_name: string | null;
  transcript_ready: boolean;
  ai_qualification_status: string | null;
  ai_score: string | null;
  qa_decision: string | null;
};

type QueueSnapshot = {
  total: number;
  new_count: number;
  under_review_count: number;
  legacy_pending_count: number;
  with_transcript: number;
  without_transcript: number;
  ai_qualified: number;
  ai_not_qualified: number;
  ai_needs_review: number;
  ai_missing: number;
};

const PENDING_STATUSES = ['new', 'under_review', 'Pending Review'] as const;

function toInt(value: unknown): number {
  return Number(value || 0);
}

function isPendingStatus(status: string | null | undefined): boolean {
  return status === 'new' || status === 'under_review' || status === 'Pending Review';
}

function classifyRemainingReason(lead: PendingLead): string {
  const decision = String(lead.qa_decision || '').toLowerCase();

  if (!lead.transcript_ready) return 'needs transcript or recording remediation';
  if (decision.includes('short duration review')) return 'short duration manual review';
  if (decision.includes('manual review')) return 'manual review required';
  if (decision.includes('needs review')) return 'borderline / incomplete evidence';
  if (decision.includes('moved to review')) return 'AI result still requires review';
  if (lead.ai_qualification_status === 'needs_review') return 'AI marked needs_review';
  if (lead.ai_qualification_status === 'not_qualified') return 'not qualified but above auto-reject threshold';
  if (lead.ai_qualification_status === 'qualified') return 'qualified but preserved for review';
  return 'unclassified pending item';
}

async function getQueueSnapshot(client: QueryClient): Promise {
  const { rows: [row] } = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE qa_status::text = 'new')::int AS new_count,
      COUNT(*) FILTER (WHERE qa_status::text = 'under_review')::int AS under_review_count,
      COUNT(*) FILTER (WHERE qa_status::text = 'Pending Review')::int AS legacy_pending_count,
      COUNT(*) FILTER (WHERE transcript IS NOT NULL AND length(transcript) > 20)::int AS with_transcript,
      COUNT(*) FILTER (WHERE transcript IS NULL OR length(transcript)  {
  const { rows } = await client.query(`
    SELECT
      l.id,
      l.qa_status,
      l.contact_name,
      COALESCE(c.name, 'Unknown') AS campaign_name,
      (l.transcript IS NOT NULL AND length(l.transcript) > 20) AS transcript_ready,
      l.ai_qualification_status,
      l.ai_score,
      l.qa_decision
    FROM leads l
    LEFT JOIN campaigns c ON c.id = l.campaign_id
    WHERE l.deleted_at IS NULL
      AND l.qa_status::text IN ('new', 'under_review', 'Pending Review')
    ORDER BY c.name NULLS LAST, l.created_at ASC
  `);

  return rows as PendingLead[];
}

function printSnapshot(label: string, snapshot: QueueSnapshot) {
  console.log(`\n${'='.repeat(88)}`);
  console.log(label);
  console.log('='.repeat(88));
  console.log(`Pending total:        ${snapshot.total}`);
  console.log(`  new:                ${snapshot.new_count}`);
  console.log(`  under_review:       ${snapshot.under_review_count}`);
  console.log(`  legacy Pending Rev: ${snapshot.legacy_pending_count}`);
  console.log(`With transcript:      ${snapshot.with_transcript}`);
  console.log(`Without transcript:   ${snapshot.without_transcript}`);
  console.log(`AI qualified:         ${snapshot.ai_qualified}`);
  console.log(`AI not qualified:     ${snapshot.ai_not_qualified}`);
  console.log(`AI needs_review:      ${snapshot.ai_needs_review}`);
  console.log(`AI result missing:    ${snapshot.ai_missing}`);
}

async function main() {
  const client = await pool.connect();
  const startedAt = new Date();

  try {
    console.log('='.repeat(88));
    console.log('REANALYZE ALL PENDING-REVIEW LEADS');
    console.log('='.repeat(88));
    console.log(`Started: ${startedAt.toISOString()}`);
    console.log(`Statuses targeted: ${PENDING_STATUSES.join(', ')}`);

    const beforeSnapshot = await getQueueSnapshot(client);
    printSnapshot('BEFORE', beforeSnapshot);

    const beforeLeads = await getPendingLeads(client);
    const beforeIds = beforeLeads.map((lead) => lead.id);
    const analyzableLeads = beforeLeads.filter((lead) => lead.transcript_ready);
    const missingTranscriptLeads = beforeLeads.filter((lead) => !lead.transcript_ready);

    console.log(`\nAnalyzable pending leads: ${analyzableLeads.length}`);
    console.log(`Pending leads without usable transcript: ${missingTranscriptLeads.length}`);

    let analyzed = 0;
    let analysisReturnedNull = 0;
    let analysisFailed = 0;

    for (let index = 0; index  AI result: ${result.qualification_status} | score ${result.score}/100`);
        } else {
          analysisReturnedNull++;
          console.log('  -> No analysis returned (likely incomplete transcript context)');
        }
      } catch (error) {
        analysisFailed++;
        console.error(`  -> Failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log(`\nReanalysis finished: ${analyzed} updated, ${analysisReturnedNull} null, ${analysisFailed} failed`);

    const approvedBackfill = await client.query(`
      UPDATE leads
      SET ai_qualification_status = 'qualified',
          updated_at = NOW()
      WHERE deleted_at IS NULL
        AND qa_status = 'approved'
        AND ai_qualification_status IS DISTINCT FROM 'qualified'
      RETURNING id
    `);

    const { rows: unresolvedPending } = await client.query(`
      SELECT id, ai_qualification_status, COALESCE(ai_score::numeric, 0) AS ai_score
      FROM leads
      WHERE deleted_at IS NULL
        AND qa_status::text IN ('new', 'under_review', 'Pending Review')
        AND ai_qualification_status IS NOT NULL
    `);

    let movedToApproved = 0;
    let movedToRejected = 0;
    let keptUnderReview = 0;

    for (const lead of unresolvedPending) {
      const score = Number(lead.ai_score || 0);
      const qualificationStatus = String(lead.ai_qualification_status || '');

      let nextStatus: 'approved' | 'rejected' | 'under_review';
      let qaDecision: string;

      if (qualificationStatus === 'qualified') {
        nextStatus = 'approved';
        qaDecision = `Backfill: Auto-approved — AI marked as qualified (score ${score}/100)`;
        movedToApproved++;
      } else if (qualificationStatus === 'not_qualified' && score  approved: ${movedToApproved}`);
    console.log(`  Pending -> rejected: ${movedToRejected}`);
    console.log(`  Pending kept under_review: ${keptUnderReview}`);

    const afterSnapshot = await getQueueSnapshot(client);
    printSnapshot('AFTER', afterSnapshot);

    const { rows: finalRows } = beforeIds.length
      ? await client.query(`
          SELECT
            l.id,
            l.qa_status,
            l.contact_name,
            COALESCE(c.name, 'Unknown') AS campaign_name,
            (l.transcript IS NOT NULL AND length(l.transcript) > 20) AS transcript_ready,
            l.ai_qualification_status,
            l.ai_score,
            l.qa_decision
          FROM leads l
          LEFT JOIN campaigns c ON c.id = l.campaign_id
          WHERE l.id = ANY($1::uuid[])
          ORDER BY c.name NULLS LAST, l.contact_name NULLS LAST
        `, [beforeIds])
      : { rows: [] };

    const afterById = new Map((finalRows as PendingLead[]).map((lead) => [lead.id, lead]));

    let nowApproved = 0;
    let nowRejected = 0;
    let stillPending = 0;

    for (const lead of beforeLeads) {
      const afterLead = afterById.get(lead.id);
      if (!afterLead) continue;
      if (afterLead.qa_status === 'approved' || afterLead.qa_status === 'published') nowApproved++;
      else if (afterLead.qa_status === 'rejected') nowRejected++;
      else if (isPendingStatus(afterLead.qa_status)) stillPending++;
    }

    console.log(`\nOutcome for originally pending leads:`);
    console.log(`  Now approved/published: ${nowApproved}`);
    console.log(`  Now rejected:           ${nowRejected}`);
    console.log(`  Still pending review:   ${stillPending}`);

    const remaining = (finalRows as PendingLead[]).filter((lead) => isPendingStatus(lead.qa_status));
    const remainingByReason = new Map();
    const remainingByCampaign = new Map();

    for (const lead of remaining) {
      const reason = classifyRemainingReason(lead);
      remainingByReason.set(reason, (remainingByReason.get(reason) || 0) + 1);
      remainingByCampaign.set(lead.campaign_name || 'Unknown', (remainingByCampaign.get(lead.campaign_name || 'Unknown') || 0) + 1);
    }

    if (remaining.length > 0) {
      console.log(`\nRemaining manual-review / blocked items:`);
      for (const [reason, count] of [...remainingByReason.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(count).padStart(3)}  ${reason}`);
      }

      console.log(`\nRemaining pending by campaign:`);
      for (const [campaign, count] of [...remainingByCampaign.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
        console.log(`  ${String(count).padStart(3)}  ${campaign}`);
      }

      console.log(`\nSample remaining leads:`);
      for (const lead of remaining.slice(0, 20)) {
        console.log(`  - ${lead.contact_name || lead.id} | ${lead.campaign_name || 'Unknown'} | ${lead.qa_status} | ${classifyRemainingReason(lead)}`);
      }
    } else {
      console.log('\nNo pending-review leads remain from the original queue. Nice.');
    }

    console.log(`\nFinished: ${new Date().toISOString()}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Fatal error during pending-review reanalysis:', error);
  process.exit(1);
});