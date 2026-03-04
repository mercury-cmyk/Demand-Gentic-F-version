/**
 * Check all secrets for UTF-8 BOM contamination
 */
const { execSync } = require('child_process');

const secrets = [
  'DATABASE_URL', 'JWT_SECRET', 'SESSION_SECRET', 'TELNYX_API_KEY',
  'TELNYX_SIP_USERNAME', 'TELNYX_SIP_PASSWORD', 'TELNYX_SIP_CONNECTION_ID',
  'TELNYX_CALL_CONTROL_APP_ID', 'TELNYX_FROM_NUMBER', 'TELNYX_CONNECTION_ID',
  'DRACHTIO_HOST', 'DRACHTIO_PORT', 'PUBLIC_IP', 'MEDIA_BRIDGE_SECRET',
  'REDIS_URL', 'PUBLIC_WEBSOCKET_URL'
];

const project = 'gen-lang-client-0789558283';

for (const name of secrets) {
  try {
    const val = execSync(
      `gcloud secrets versions access latest --secret=${name} --project=${project}`,
      { encoding: 'buffer', env: { ...process.env, CLOUDSDK_PYTHON: 'C:/Python314/python.exe' } }
    );
    const hasBOM = val.length >= 3 && val[0] === 0xEF && val[1] === 0xBB && val[2] === 0xBF;
    if (hasBOM) {
      const clean = val.toString('utf8').replace(/^\uFEFF/, '');
      console.log(`BOM: ${name} = "${clean.substring(0, 30)}..."`);
    } else {
      // console.log(`OK: ${name}`);
    }
  } catch (e) {
    console.log(`ERR: ${name}`);
  }
}
console.log('Done.');
