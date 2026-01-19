/**
 * Test script to generate problem intelligence for a single account
 */

import { generateAccountProblemIntelligence } from '../server/services/problem-intelligence/problem-generation-engine';

const accountId = '003d96fe-73c7-4c63-9c7d-ea7821864041';
const campaignId = '2df6b4f5-c1ff-4324-87f0-94053d4c5cbf';

async function test() {
  console.log('Testing single account intelligence generation...');
  console.log('Account ID:', accountId);
  console.log('Campaign ID:', campaignId);
  console.log('---');

  try {
    const result = await generateAccountProblemIntelligence({
      campaignId,
      accountId,
      forceRefresh: true,
    });

    if (result) {
      console.log('✅ Generation successful!');
      console.log('Detected problems:', result.detectedProblems?.length || 0);
      console.log('Confidence:', result.confidence);
      console.log('Primary angle:', result.messagingPackage?.primaryAngle);
    } else {
      console.log('❌ Generation returned null');
    }
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
  }

  process.exit(0);
}

test();
