import { db } from './server/db';
import { sql } from 'drizzle-orm';

const result = await db.execute(sql`
  SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE agent_type = 'human') as human_agents,
    COUNT(*) FILTER (WHERE agent_type = 'ai') as ai_agents,
    MIN(call_duration_seconds) as min_dur,
    MAX(call_duration_seconds) as max_dur,
    AVG(call_duration_seconds) as avg_dur
  FROM dialer_call_attempts
  WHERE disposition = 'qualified_lead'
    AND disposition_processed = false
`);

console.log('Unprocessed Qualified Leads by Agent Type:');
console.log(JSON.stringify(result.rows[0], null, 2));

// Get specific examples with duration > 0
const examples = await db.execute(sql`
  SELECT 
    id,
    agent_type,
    call_duration_seconds,
    connected,
    created_at,
    human_agent_id
  FROM dialer_call_attempts
  WHERE disposition = 'qualified_lead'
    AND disposition_processed = false
    AND call_duration_seconds > 0
  LIMIT 10
`);

console.log('\nExamples with duration > 0:');
console.log(JSON.stringify(examples.rows, null, 2));

process.exit(0);