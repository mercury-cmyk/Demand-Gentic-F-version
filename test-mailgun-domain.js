/**
 * Test script to check Mailgun domain status
 */

const domain = 'mail.pivotal-b2b.info';
const apiKey = '4153d1617158f894a1f4f4f3b5b97518-e61ae8dd-4b22cd2c';
const apiBase = 'https://api.mailgun.net/v3';

async function checkDomain() {
  try {
    const auth = Buffer.from(`api:${apiKey}`).toString('base64');
    console.log(`\nChecking domain: ${domain}`);
    console.log(`API Base: ${apiBase}/domains/${domain}\n`);
    
    const response = await fetch(`${apiBase}/domains/${domain}`, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error:`, response.status, errorText);
      return;
    }

    const data = await response.json();
    
    console.log('='.repeat(80));
    console.log('MAILGUN DOMAIN STATUS');
    console.log('='.repeat(80));
    console.log(`\nDomain: ${data.domain.name}`);
    console.log(`State: ${data.domain.state}`);
    console.log(`SMTP Login: ${data.domain.smtp_login}`);
    console.log(`Created: ${data.domain.created_at}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('SENDING DNS RECORDS');
    console.log('='.repeat(80));
    
    data.sending_dns_records.forEach((record, idx) => {
      console.log(`\n[${idx + 1}] ${record.record_type} Record`);
      console.log(`  Name: ${record.name}`);
      console.log(`  Valid: ${record.valid} ${record.valid === 'valid' ? '✅' : '❌'}`);
      console.log(`  Value: ${record.value.substring(0, 100)}${record.value.length > 100 ? '...' : ''}`);
      if (record.cached && record.cached.length > 0) {
        console.log(`  Cached: ${record.cached.join(', ')}`);
      }
    });
    
    // Parse verification status
    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION STATUS');
    console.log('='.repeat(80));
    
    const spfRecord = data.sending_dns_records.find(r => r.record_type === 'TXT' && r.name === domain);
    const dkimRecord = data.sending_dns_records.find(r => r.record_type === 'TXT' && r.name.includes('_domainkey'));
    const dmarcRecord = data.sending_dns_records.find(r => r.record_type === 'TXT' && r.name === `_dmarc.${domain}`);
    
    console.log(`\nSPF:   ${spfRecord ? (spfRecord.valid === 'valid' ? '✅ Verified' : '❌ Failed') : '⚠️  Not Found'}`);
    console.log(`DKIM:  ${dkimRecord ? (dkimRecord.valid === 'valid' ? '✅ Verified' : '❌ Failed') : '⚠️  Not Found'}`);
    console.log(`DMARC: ${dmarcRecord ? (dmarcRecord.valid === 'valid' ? '✅ Verified' : '❌ Failed') : '⚠️  Not Found'}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('FULL API RESPONSE');
    console.log('='.repeat(80));
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDomain();
