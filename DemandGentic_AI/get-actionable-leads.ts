import { pool } from './server/db';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=== ACTIONABLE HUMAN LEADS REPORT ===\n');

  try {
    const query = `
      SELECT 
        id,
        created_at,
        to_number_e164,
        duration_sec,
        ai_disposition,
        ai_transcript,
        ai_analysis
      FROM call_sessions
      WHERE ai_disposition ILIKE '%qualified%'
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    const res = await pool.query(query);
    const actionableLeads = [];

    for (const row of res.rows) {
      // 1. Parse details
      let transcriptStr = '';
      let transcriptArr = [];
      
      try {
        if (typeof row.ai_transcript === 'string') {
          if (row.ai_transcript.trim().startsWith('[')) {
             transcriptArr = JSON.parse(row.ai_transcript);
             transcriptStr = transcriptArr.map((t: any) => t.content || t.message || '').join(' ').toLowerCase();
          } else {
             transcriptStr = row.ai_transcript.toLowerCase();
          }
        }
      } catch (e) {
        transcriptStr = String(row.ai_transcript).toLowerCase();
      }

      // 2. Filter Logic
      const isGoogleScreener = transcriptStr.includes('google recording') || transcriptStr.includes('google, recording');
      const isAutomatedSystem = transcriptStr.includes('transfer to human') || transcriptStr.includes('press 1') || transcriptStr.includes('telephone operator');
      const isNotInterested = transcriptStr.includes('not interested') || transcriptStr.includes('remove me') || transcriptStr.includes('stop calling');
      
      // Heuristic: Is it short and mostly the agent talking?
      const isShort = row.duration_sec  15s AND has some human response))
      // - AND NOT explicit "not interested" (unless they asked for a callback later)

      // Only skip if it's definitely a bot/screener or explicitly negative
      if (isGoogleScreener) continue;
      if (isAutomatedSystem && !hasCallback) continue; // "Transfer to human" might be the user asking the bot, but usually it's the bot prompt.
      
      const analysis = typeof row.ai_analysis === 'string' ? JSON.parse(row.ai_analysis || '{}') : row.ai_analysis || {};

      actionableLeads.push({
        id: row.id,
        phone: row.to_number_e164,
        date: new Date(row.created_at).toLocaleString(),
        reason: hasCallback ? 'Requested Callback' : (hasMeeting ? 'Meeting Discussed' : 'Human Interaction / Potential Interest'),
        transcriptShort: transcriptStr.substring(0, 150) + '...',
        fullTranscript: transcriptArr
      });
    }

    if (actionableLeads.length === 0) {
      console.log('No definitely actionable leads found (most were likely screeners).Check "Potential" list below.');
    } else {
      console.log(`Found ${actionableLeads.length} Actionable Human Interactions:\n`);
      
      actionableLeads.forEach((lead, i) => {
        console.log(`[${i+1}] ${lead.phone} | ${lead.date} | ${lead.reason}`);
        console.log(`    ID: ${lead.id}`);
        // Find the last few messages to see the conclusion
        if (lead.fullTranscript && lead.fullTranscript.length > 0) {
            const lastMsgs = lead.fullTranscript.slice(-3);
            lastMsgs.forEach((msg: any) => {
                const role = (msg.role || 'unknown').toUpperCase();
                const txt = (msg.content || '').replace(/\n/g, ' ');
                console.log(`    ${role}: "${txt.substring(0, 80)}${txt.length>80?'...':''}"`);
            });
        }
        console.log('');
      });
    }

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

main();