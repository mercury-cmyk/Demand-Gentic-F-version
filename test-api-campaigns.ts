import axios from 'axios';

async function testCampaignEndpoint() {
  const baseUrl = 'https://demandgentic-voice-yehu6cmsbq-uc.a.run.app';
  
  console.log('Testing /api/campaigns endpoint');
  console.log('URL:', `${baseUrl}/api/campaigns`);
  console.log('---');

  try {
    // First test with GET without auth to see what error we get
    console.log('\n1. Testing GET /api/campaigns (no auth):');
    try {
      const response = await axios.get(`${baseUrl}/api/campaigns`, {
        timeout: 5000,
        validateStatus: () => true // Accept all status codes
      });
      console.log('Status:', response.status);
      console.log('Headers:', Object.keys(response.headers).join(', '));
      console.log('Data:', JSON.stringify(response.data, null, 2).substring(0, 500));
    } catch (err: any) {
      console.log('Error:', err.message);
      if (err.response) {
        console.log('Status:', err.response.status);
        console.log('Data:', err.response.data);
      }
    }

    // Test health endpoint to see if service is responding
    console.log('\n2. Testing GET /api/health (no auth):');
    try {
      const response = await axios.get(`${baseUrl}/api/health`, {
        timeout: 5000,
        validateStatus: () => true
      });
      console.log('Status:', response.status);
      console.log('Data:', response.data);
    } catch (err: any) {
      console.log('Error:', err.message);
    }

    // Test a simple endpoint that doesn't require auth
    console.log('\n3. Testing GET / (root):');
    try {
      const response = await axios.get(`${baseUrl}/`, {
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: () => true
      });
      console.log('Status:', response.status);
      console.log('Headers Content-Type:', response.headers['content-type']);
      console.log('Body length:', response.data?.length || 'N/A');
    } catch (err: any) {
      console.log('Error:', err.message);
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testCampaignEndpoint().catch(console.error);
