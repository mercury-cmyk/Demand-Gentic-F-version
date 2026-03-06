// Test simulation endpoint
const BASE = 'http://localhost:8080/api';

// 1. Login
const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'Admin123!' }),
});
const loginData = await loginRes.json();
if (!loginData.token) {
  console.error('LOGIN FAILED:', loginData);
  process.exit(1);
}
const token = loginData.token;
console.log('✅ Logged in');

// 2. Run simulation (no campaignId — tests in-memory session path)
console.log('\n--- SIMULATION (no campaignId) ---');
const simRes = await fetch(`${BASE}/voice-agent-training/simulate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    scenarioId: 'budget_objection',
    personaId: 'skeptical_dm',
    maxTurns: 6,
    inputScenario: 'Call a VP of Finance who is skeptical about budget allocation',
  }),
});
const simData = await simRes.json();
console.log('Status:', simRes.status);
console.log('Success:', simData.success);
if (simData.simulation) {
  console.log('Session ID:', simData.simulation.sessionId);
  console.log('Turns:', simData.simulation.turns);
  console.log('Scores:', JSON.stringify(simData.simulation.scores));
  console.log('\n--- TRANSCRIPT PREVIEW ---');
  for (const t of simData.simulation.transcriptPreview || []) {
    console.log(`  [${t.role}] ${t.content.substring(0, 120)}`);
  }
}
if (simData.analysis) {
  console.log('\n--- ANALYSIS ---');
  console.log('Overall Score:', simData.analysis.overallScore);
  console.log('Recommendations:', JSON.stringify(simData.analysis.recommendations));
  console.log('Stages:', simData.analysis.conversationStages);
}
if (simData.error) {
  console.log('ERROR:', simData.error);
}

// 3. Run simulation WITH a real campaignId
console.log('\n\n--- SIMULATION (with campaignId) ---');
const simRes2 = await fetch(`${BASE}/voice-agent-training/simulate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    campaignId: '95faa25b-934b-4efc-9cd7-f5357016dba2',
    scenarioId: 'gatekeeper_handoff',
    personaId: 'gatekeeper_assistant',
    maxTurns: 6,
  }),
});
const simData2 = await simRes2.json();
console.log('Status:', simRes2.status);
console.log('Success:', simData2.success);
if (simData2.simulation) {
  console.log('Session ID:', simData2.simulation.sessionId);
  console.log('Turns:', simData2.simulation.turns);
  console.log('Scores:', JSON.stringify(simData2.simulation.scores));
  console.log('\n--- TRANSCRIPT PREVIEW ---');
  for (const t of simData2.simulation.transcriptPreview || []) {
    console.log(`  [${t.role}] ${t.content.substring(0, 120)}`);
  }
}
if (simData2.error) {
  console.log('ERROR:', simData2.error);
}

console.log('\n✅ SIMULATION TEST COMPLETE');
