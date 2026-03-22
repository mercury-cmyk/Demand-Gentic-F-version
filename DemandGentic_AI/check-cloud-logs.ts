import { Logging } from '@google-cloud/logging';

async function checkCloudLogs() {
  console.log('='.repeat(80));
  console.log('CHECKING GOOGLE CLOUD LOGS FOR LEAD CREATION');
  console.log('='.repeat(80));
  console.log();

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'demandgentic';
  console.log(`Project: ${projectId}`);

  try {
    const logging = new Logging({ projectId });

    // Query for disposition and lead-related logs
    const filter = `
      resource.type="cloud_run_revision"
      AND (
        textPayload=~"qualified_lead"
        OR textPayload=~"lead created"
        OR textPayload=~"processQualifiedLead"
        OR textPayload=~"DISPOSITION"
        OR textPayload=~"submit_disposition"
      )
      AND timestamp >= "${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}"
    `;

    console.log('Fetching logs from the last 24 hours...\n');

    const [entries] = await logging.getEntries({
      filter: filter.trim().replace(/\s+/g, ' '),
      pageSize: 100,
      orderBy: 'timestamp desc',
    });

    if (entries.length === 0) {
      console.log('❌ No disposition/lead logs found in the last 24 hours.');
      console.log('\nThis could mean:');
      console.log('  1. No calls have been processed');
      console.log('  2. Logs are not being written correctly');
      console.log('  3. The filter might need adjustment');
    } else {
      console.log(`Found ${entries.length} relevant log entries:\n`);

      // Categorize logs
      const qualifiedLeadLogs: any[] = [];
      const dispositionLogs: any[] = [];
      const otherLogs: any[] = [];

      for (const entry of entries) {
        const text = entry.data?.toString() || entry.metadata?.textPayload || '';
        const timestamp = entry.metadata?.timestamp;

        if (text.toLowerCase().includes('qualified_lead')) {
          qualifiedLeadLogs.push({ timestamp, text });
        } else if (text.toLowerCase().includes('disposition')) {
          dispositionLogs.push({ timestamp, text });
        } else {
          otherLogs.push({ timestamp, text });
        }
      }

      // Show qualified lead logs
      console.log('=== QUALIFIED_LEAD LOGS ===');
      if (qualifiedLeadLogs.length === 0) {
        console.log('❌ No qualified_lead logs found');
      } else {
        console.log(`Found ${qualifiedLeadLogs.length} qualified_lead entries:`);
        for (const log of qualifiedLeadLogs.slice(0, 10)) {
          const time = new Date(log.timestamp).toLocaleString();
          console.log(`\n[${time}]`);
          console.log(`  ${log.text.substring(0, 300)}${log.text.length > 300 ? '...' : ''}`);
        }
      }

      // Show disposition logs summary
      console.log('\n\n=== DISPOSITION LOGS (sample) ===');
      if (dispositionLogs.length === 0) {
        console.log('❌ No disposition logs found');
      } else {
        console.log(`Found ${dispositionLogs.length} disposition entries. Sample:`);
        for (const log of dispositionLogs.slice(0, 5)) {
          const time = new Date(log.timestamp).toLocaleString();
          console.log(`\n[${time}]`);
          console.log(`  ${log.text.substring(0, 200)}${log.text.length > 200 ? '...' : ''}`);
        }
      }

      // Summary
      console.log('\n\n=== SUMMARY ===');
      console.log(`Total logs found: ${entries.length}`);
      console.log(`Qualified lead logs: ${qualifiedLeadLogs.length}`);
      console.log(`Disposition logs: ${dispositionLogs.length}`);
      console.log(`Other related logs: ${otherLogs.length}`);
    }

  } catch (error: any) {
    console.error('Error fetching logs:', error.message);
    if (error.message.includes('Could not load the default credentials')) {
      console.log('\n⚠️  Google Cloud credentials not configured.');
      console.log('   Set GOOGLE_APPLICATION_CREDENTIALS environment variable');
      console.log('   or run: gcloud auth application-default login');
    }
  }

  process.exit(0);
}

checkCloudLogs().catch(console.error);