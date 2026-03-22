/**
 * Call Monitoring Job
 *
 * Scheduled job to monitor call metrics and detect issues
 * Run this daily via cron or scheduler
 */

import { runMonitoringCheck } from '../services/call-monitoring-service';

/**
 * Main job execution
 */
async function executeMonitoringJob() {
  console.log('='.repeat(60));
  console.log('CALL MONITORING JOB - Starting');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  try {
    await runMonitoringCheck();

    console.log('\n' + '='.repeat(60));
    console.log('CALL MONITORING JOB - Completed Successfully');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('CALL MONITORING JOB - Failed');
    console.error('Error:', error);
    console.error('='.repeat(60));

    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  executeMonitoringJob();
}

export { executeMonitoringJob };