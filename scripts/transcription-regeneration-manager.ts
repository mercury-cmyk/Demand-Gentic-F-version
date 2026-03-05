#!/usr/bin/env node

/**
 * Transcription Regeneration Manager CLI
 * 
 * Usage:
 *   npm run transcription-regen:start       # Start the worker
 *   npm run transcription-regen:stop        # Stop the worker
 *   npm run transcription-regen:status      # Get worker status
 *   npm run transcription-regen:config      # Update configuration
 *   npm run transcription-regen:progress    # Get overall progress
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_TOKEN = process.env.API_TOKEN || '';

interface CLIOptions {
  action: string;
  concurrency?: number;
  batchSize?: number;
  strategy?: 'telnyx_phone_lookup' | 'recording_url' | 'auto';
  batchDelayMs?: number;
  verbose?: boolean;
}

async function makeRequest(method: string, path: string, body?: any): Promise<any> {
  const headers: any = {
    'Content-Type': 'application/json',
  };

  if (API_TOKEN) {
    headers['Authorization'] = `Bearer ${API_TOKEN}`;
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    } as any);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    throw new Error(`Request failed: ${error.message}`);
  }
}

async function startWorker() {
  console.log('Starting transcription regeneration worker...');
  try {
    const result = await makeRequest('POST', '/api/call-intelligence/regeneration/worker/start');
    if (result.success) {
      console.log('✅ Worker started successfully');
      console.log(`\nWorker Status:`);
      console.log(`  Running: ${result.status.running}`);
      console.log(`  Active Jobs: ${result.status.activeJobs}`);
      console.log(`  Concurrency: ${result.status.config.concurrency}`);
      console.log(`  Batch Size: ${result.status.config.batchSize}`);
      console.log(`\nJob Statistics:`);
      console.log(`  Pending: ${result.status.jobStats.pending}`);
      console.log(`  In Progress: ${result.status.jobStats.inProgress}`);
      console.log(`  Submitted: ${result.status.jobStats.submitted}`);
      console.log(`  Completed: ${result.status.jobStats.completed}`);
      console.log(`  Failed: ${result.status.jobStats.failed}`);
      console.log(`  Total: ${result.status.jobStats.total}`);
    } else {
      console.error('❌ Failed to start worker:', result.error);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function stopWorker() {
  console.log('Stopping transcription regeneration worker...');
  try {
    const result = await makeRequest('POST', '/api/call-intelligence/regeneration/worker/stop');
    if (result.success) {
      console.log('✅ Worker stopped successfully');
    } else {
      console.error('❌ Failed to stop worker:', result.error);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function getStatus() {
  try {
    const result = await makeRequest('GET', '/api/call-intelligence/regeneration/worker/status');
    if (result.success) {
      const status = result.data;
      console.log('Transcription Regeneration Worker Status');
      console.log('═'.repeat(50));
      console.log(`Running: ${status.running ? '🟢 YES' : '🔴 NO'}`);
      console.log(`Active Jobs: ${status.activeJobs}`);
      console.log(`\nConfiguration:`);
      console.log(`  Concurrency: ${status.config.concurrency}`);
      console.log(`  Batch Size: ${status.config.batchSize}`);
      console.log(`  Batch Delay: ${status.config.batchDelayMs}ms`);
      console.log(`  Strategy: ${status.config.strategy}`);
      console.log(`  Verbose: ${status.config.verbose}`);
      console.log(`\nJob Statistics:`);
      console.log(`  ⏳ Pending: ${status.jobStats.pending}`);
      console.log(`  ⚙️  In Progress: ${status.jobStats.inProgress}`);
      console.log(`  📤 Submitted: ${status.jobStats.submitted}`);
      console.log(`  ✅ Completed: ${status.jobStats.completed}`);
      console.log(`  ❌ Failed: ${status.jobStats.failed}`);
      console.log(`  📊 Total: ${status.jobStats.total}`);
    } else {
      console.error('❌ Failed to get status:', result.error);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function getProgress() {
  try {
    const result = await makeRequest('GET', '/api/call-intelligence/regeneration/progress');
    if (result.success) {
      const data = result.data;
      console.log('Transcription Regeneration Progress');
      console.log('═'.repeat(50));
      console.log(`Progress: ${data.progressPercent}% (${data.submitted + data.completed}/${data.total})`);
      console.log(`\nBreakdown:`);
      console.log(`  ⏳ Pending: ${data.pending}`);
      console.log(`  ⚙️  In Progress: ${data.inProgress}`);
      console.log(`  📤 Submitted: ${data.submitted}`);
      console.log(`  ✅ Completed: ${data.completed}`);
      console.log(`  ❌ Failed: ${data.failed}`);
      
      if (data.estimatedRemainingMinutes > 0) {
        console.log(`\n⏱️  Estimated Time Remaining: ~${data.estimatedRemainingMinutes} minutes`);
      }
    } else {
      console.error('❌ Failed to get progress:', result.error);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function updateConfig(options: Partial<CLIOptions>) {
  console.log('Updating worker configuration...');
  const config: any = {};

  if (options.concurrency !== undefined) config.concurrency = options.concurrency;
  if (options.batchSize !== undefined) config.batchSize = options.batchSize;
  if (options.batchDelayMs !== undefined) config.batchDelayMs = options.batchDelayMs;
  if (options.strategy !== undefined) config.strategy = options.strategy;
  if (options.verbose !== undefined) config.verbose = options.verbose;

  try {
    const result = await makeRequest('POST', '/api/call-intelligence/regeneration/worker/config', config);
    if (result.success) {
      console.log('✅ Configuration updated');
      console.log('\nNew Configuration:', result.data.currentStatus.config);
    } else {
      console.error('❌ Failed to update config:', result.error);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const action = args[0] || 'status';
const options: CLIOptions = { action };

// Parse optional flags
for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const [key, value] = arg.substring(2).split('=');
    switch (key) {
      case 'concurrency':
        options.concurrency = parseInt(value, 10);
        break;
      case 'batch-size':
        options.batchSize = parseInt(value, 10);
        break;
      case 'strategy':
        options.strategy = value as any;
        break;
      case 'batch-delay':
        options.batchDelayMs = parseInt(value, 10);
        break;
      case 'verbose':
        options.verbose = value !== 'false';
        break;
    }
  }
}

// Execute action
(async () => {
  switch (action) {
    case 'start':
      await startWorker();
      break;
    case 'stop':
      await stopWorker();
      break;
    case 'status':
      await getStatus();
      break;
    case 'progress':
      await getProgress();
      break;
    case 'config':
      await updateConfig(options);
      break;
    default:
      console.log(`Unknown action: ${action}`);
      console.log(`\nUsage:`);
      console.log(`  transcription-regen start                                    Start the worker`);
      console.log(`  transcription-regen stop                                     Stop the worker`);
      console.log(`  transcription-regen status                                   Get worker status`);
      console.log(`  transcription-regen progress                                 Get overall progress`);
      console.log(`  transcription-regen config --concurrency=5 --batch-size=50   Update configuration`);
      process.exit(1);
  }
})();
