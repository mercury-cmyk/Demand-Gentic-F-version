/**
 * Sync GCS Recordings Script
 *
 * Scans Google Cloud Storage for recordings and updates the database
 * to match. This recovers recordings where:
 * - Upload succeeded but database update failed
 * - recordingS3Key is missing but file exists in GCS
 *
 * Run with: npx tsx sync-gcs-recordings.ts
 */

import { Storage } from '@google-cloud/storage';
import { db } from './server/db';
import { callSessions, leads } from './shared/schema';
import { eq, isNull, and, or } from 'drizzle-orm';

const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const GCS_BUCKET = process.env.GCS_BUCKET || process.env.S3_BUCKET || 'demandgentic-prod-storage-2026';

const CALL_SESSION_RECORDING_PREFIX = 'call-recordings';
const LEAD_RECORDING_PREFIX = 'recordings';

interface GCSRecording {
  key: string;
  size: number;
  updated: Date;
  campaignId: string | null;
  sessionId: string;
  format: string;
}

async function listGCSRecordings(): Promise<GCSRecording[]> {
  console.log(`\n📂 Scanning GCS bucket: ${GCS_BUCKET}`);
  console.log(`   Project: ${GCS_PROJECT_ID || '(default)'}\n`);

  const storage = new Storage({
    projectId: GCS_PROJECT_ID,
  });

  const bucket = storage.bucket(GCS_BUCKET);
  const recordings: GCSRecording[] = [];

  // List call session recordings
  console.log(`Scanning ${CALL_SESSION_RECORDING_PREFIX}/...`);
  try {
    const [callRecordingFiles] = await bucket.getFiles({
      prefix: CALL_SESSION_RECORDING_PREFIX + '/',
    });

    for (const file of callRecordingFiles) {
      // Pattern: call-recordings/{campaignId}/{sessionId}.{format}
      const parts = file.name.split('/');
      if (parts.length >= 3) {
        const campaignId = parts[1] === 'no-campaign' ? null : parts[1];
        const filename = parts[2];
        const [sessionId, format] = filename.split('.');

        if (sessionId && format) {
          recordings.push({
            key: file.name,
            size: parseInt(file.metadata.size || '0'),
            updated: new Date(file.metadata.updated || Date.now()),
            campaignId,
            sessionId,
            format,
          });
        }
      }
    }
    console.log(`   Found ${callRecordingFiles.length} files in call-recordings/`);
  } catch (err: any) {
    console.error(`   Error scanning call-recordings/:`, err.message);
  }

  // List lead recordings
  console.log(`Scanning ${LEAD_RECORDING_PREFIX}/...`);
  try {
    const [leadRecordingFiles] = await bucket.getFiles({
      prefix: LEAD_RECORDING_PREFIX + '/',
    });

    for (const file of leadRecordingFiles) {
      // Pattern: recordings/{leadId}.{format}
      const parts = file.name.split('/');
      if (parts.length >= 2) {
        const filename = parts[1];
        const [leadId, format] = filename.split('.');

        if (leadId && format) {
          recordings.push({
            key: file.name,
            size: parseInt(file.metadata.size || '0'),
            updated: new Date(file.metadata.updated || Date.now()),
            campaignId: null,
            sessionId: leadId,
            format,
          });
        }
      }
    }
    console.log(`   Found ${leadRecordingFiles.length} files in recordings/`);
  } catch (err: any) {
    console.error(`   Error scanning recordings/:`, err.message);
  }

  console.log(`\nTotal GCS recordings found: ${recordings.length}\n`);
  return recordings;
}

async function findOrphanedRecordings(gcsRecordings: GCSRecording[]) {
  console.log('🔍 Finding database records missing GCS keys...\n');

  // Find call_sessions with recordingUrl but no recordingS3Key
  const orphanedSessions = await db
    .select({
      id: callSessions.id,
      campaignId: callSessions.campaignId,
      recordingStatus: callSessions.recordingStatus,
    })
    .from(callSessions)
    .where(
      or(
        isNull(callSessions.recordingS3Key),
        eq(callSessions.recordingS3Key, '')
      )
    );

  console.log(`Found ${orphanedSessions.length} call_sessions without recordingS3Key`);

  // Find leads with recordingUrl but no recordingS3Key
  const orphanedLeads = await db
    .select({
      id: leads.id,
      recordingStatus: leads.recordingStatus,
    })
    .from(leads)
    .where(
      or(
        isNull(leads.recordingS3Key),
        eq(leads.recordingS3Key, '')
      )
    );

  console.log(`Found ${orphanedLeads.length} leads without recordingS3Key`);

  return { orphanedSessions, orphanedLeads };
}

async function syncRecordings(
  gcsRecordings: GCSRecording[],
  orphanedSessions: { id: string; campaignId: string | null; recordingStatus: string | null }[],
  orphanedLeads: { id: string; recordingStatus: string | null }[],
  dryRun: boolean
) {
  console.log('\n🔄 Syncing recordings...\n');

  // Create lookup maps
  const gcsCallRecordings = new Map<string, GCSRecording>();
  const gcsLeadRecordings = new Map<string, GCSRecording>();

  for (const rec of gcsRecordings) {
    if (rec.key.startsWith(CALL_SESSION_RECORDING_PREFIX)) {
      gcsCallRecordings.set(rec.sessionId, rec);
    } else if (rec.key.startsWith(LEAD_RECORDING_PREFIX)) {
      gcsLeadRecordings.set(rec.sessionId, rec);
    }
  }

  let sessionsUpdated = 0;
  let leadsUpdated = 0;

  // Match call_sessions
  for (const session of orphanedSessions) {
    const gcsRec = gcsCallRecordings.get(session.id);
    if (gcsRec) {
      console.log(`✅ Found GCS match for call_session ${session.id}`);
      console.log(`   Key: ${gcsRec.key}`);
      console.log(`   Size: ${(gcsRec.size / 1024).toFixed(1)} KB`);

      if (!dryRun) {
        await db.update(callSessions)
          .set({
            recordingS3Key: gcsRec.key,
            recordingStatus: 'stored',
            recordingFormat: gcsRec.format as any,
            recordingFileSizeBytes: gcsRec.size,
          })
          .where(eq(callSessions.id, session.id));
      }
      sessionsUpdated++;
    }
  }

  // Match leads
  for (const lead of orphanedLeads) {
    const gcsRec = gcsLeadRecordings.get(lead.id);
    if (gcsRec) {
      console.log(`✅ Found GCS match for lead ${lead.id}`);
      console.log(`   Key: ${gcsRec.key}`);
      console.log(`   Size: ${(gcsRec.size / 1024).toFixed(1)} KB`);

      if (!dryRun) {
        await db.update(leads)
          .set({
            recordingS3Key: gcsRec.key,
            recordingStatus: 'stored',
          })
          .where(eq(leads.id, lead.id));
      }
      leadsUpdated++;
    }
  }

  return { sessionsUpdated, leadsUpdated };
}

async function showGCSSummary(gcsRecordings: GCSRecording[]) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    GCS Storage Summary');
  console.log('═══════════════════════════════════════════════════════════\n');

  const callRecordings = gcsRecordings.filter(r => r.key.startsWith(CALL_SESSION_RECORDING_PREFIX));
  const leadRecordings = gcsRecordings.filter(r => r.key.startsWith(LEAD_RECORDING_PREFIX));

  const totalSize = gcsRecordings.reduce((sum, r) => sum + r.size, 0);

  console.log(`Call Session Recordings: ${callRecordings.length}`);
  console.log(`Lead Recordings:         ${leadRecordings.length}`);
  console.log(`Total Recordings:        ${gcsRecordings.length}`);
  console.log(`Total Storage:           ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

  // Group by campaign
  const byCampaign = new Map<string, number>();
  for (const rec of callRecordings) {
    const key = rec.campaignId || 'no-campaign';
    byCampaign.set(key, (byCampaign.get(key) || 0) + 1);
  }

  if (byCampaign.size > 0) {
    console.log('\nBy Campaign:');
    for (const [campaign, count] of byCampaign.entries()) {
      console.log(`  ${campaign}: ${count} recordings`);
    }
  }

  // Show recent recordings
  const recent = [...gcsRecordings]
    .sort((a, b) => b.updated.getTime() - a.updated.getTime())
    .slice(0, 5);

  if (recent.length > 0) {
    console.log('\nMost Recent Recordings:');
    for (const rec of recent) {
      console.log(`  ${rec.updated.toISOString().split('T')[0]} - ${rec.key}`);
    }
  }

  console.log('');
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('          Sync GCS Recordings to Database');
  console.log('═══════════════════════════════════════════════════════════');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const summaryOnly = args.includes('--summary');

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
  }

  try {
    // List all recordings in GCS
    const gcsRecordings = await listGCSRecordings();

    if (gcsRecordings.length === 0) {
      console.log('No recordings found in GCS bucket.');
      console.log('Make sure GCS_BUCKET and credentials are configured correctly.');
      process.exit(0);
    }

    // Show summary
    await showGCSSummary(gcsRecordings);

    if (summaryOnly) {
      process.exit(0);
    }

    // Find orphaned database records
    const { orphanedSessions, orphanedLeads } = await findOrphanedRecordings(gcsRecordings);

    // Sync them
    const { sessionsUpdated, leadsUpdated } = await syncRecordings(
      gcsRecordings,
      orphanedSessions,
      orphanedLeads,
      dryRun
    );

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                         Results');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`GCS Recordings Found:    ${gcsRecordings.length}`);
    console.log(`Orphaned Sessions:       ${orphanedSessions.length}`);
    console.log(`Orphaned Leads:          ${orphanedLeads.length}`);
    console.log(`Sessions Updated:        ${sessionsUpdated}${dryRun ? ' (dry run)' : ''}`);
    console.log(`Leads Updated:           ${leadsUpdated}${dryRun ? ' (dry run)' : ''}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    if (sessionsUpdated === 0 && leadsUpdated === 0) {
      console.log('No orphaned recordings found that match GCS files.');
      console.log('The recordings in the database that show "stored" but fail to play');
      console.log('were likely never uploaded to GCS successfully.');
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('Could not load the default credentials')) {
      console.log('\nMake sure you have GCS credentials configured:');
      console.log('  - Set GOOGLE_APPLICATION_CREDENTIALS environment variable');
      console.log('  - Or run: gcloud auth application-default login');
    }
    process.exit(1);
  }

  process.exit(0);
}

main();
