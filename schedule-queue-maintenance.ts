#!/usr/bin/env -S npx tsx
import { Queue } from 'bullmq';
import { getRedisConnectionAsync } from './server/lib/queue';

const QUEUE_NAME = 'ai-campaign-orchestrator';

async function main() {
  console.log('Scheduling queue maintenance job...');
  
  const connection = await getRedisConnectionAsync();
  if (!connection) {
    console.error('Failed to connect to Redis');
    process.exit(1);
  }

  const queue = new Queue(QUEUE_NAME, { connection });

  // Remove old versions of the job if any to prevent duplicates
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'cleanup-stale-items') {
      await queue.removeRepeatableByKey(job.key);
      console.log('Removed existing repeatable job');
    }
  }

  // Schedule to run every 5 minutes
  await queue.add('cleanup-stale-items', {}, {
    repeat: {
      every: 5 * 60 * 1000, // 5 minutes
    },
    removeOnComplete: 10,
    removeOnFail: 50
  });

  console.log('✅ Scheduled "cleanup-stale-items" to run every 5 minutes');

  await queue.close();
  await connection.quit();
}

main().catch(console.error);