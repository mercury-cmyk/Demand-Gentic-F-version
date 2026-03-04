const https = require('https');
const fs = require('fs');

// Read key from .env file directly
const envContent = fs.readFileSync('.env', 'utf8');
const keyMatch = envContent.match(/^TELNYX_API_KEY=["']?([^"'\n]+)/m);
if (!keyMatch) {
  console.error('Could not find TELNYX_API_KEY in .env');
  process.exit(1);
}
const apiKey = keyMatch[1];
console.log('API Key:', apiKey.substring(0, 20) + '... (length: ' + apiKey.length + ')');

const options = {
  hostname: 'api.telnyx.com',
  path: '/v2/phone_numbers?page[size]=10',
  headers: { 'Authorization': 'Bearer ' + apiKey }
};

console.log('Request path:', options.path);

https.get(options, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Response (first 1000 chars):', data.substring(0, 1000));
  });
});
