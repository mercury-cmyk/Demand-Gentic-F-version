/**
 * AI Call Readiness Check Script
 * Validates all components needed for AI voice calls
 */

import { db } from './server/db';
import { sipTrunkConfigs, campaigns, knowledgeBlocks, callSessions, agentDefaults } from './shared/schema';
import { eq, desc } from 'drizzle-orm';

async function checkAICallReadiness() {
  console.log('\n========================================');
  console.log('🔍 AI CALL READINESS CHECK');
  console.log('========================================\n');
  
  const results: { component: string; status: '✅' | '⚠️' | '❌'; details: string }[] = [];
  
  // 1. Check Telnyx Phone Numbers from env
  console.log('📞 Phone Numbers:');
  const telnyxFromNumber = process.env.TELNYX_FROM_NUMBER;
  if (telnyxFromNumber) {
    console.log(`   ${telnyxFromNumber} (from env TELNYX_FROM_NUMBER)`);
    results.push({
      component: 'Phone Numbers',
      status: '✅',
      details: `Configured: ${telnyxFromNumber}`
    });
  } else {
    console.log('   ❌ TELNYX_FROM_NUMBER not set');
    results.push({
      component: 'Phone Numbers',
      status: '❌',
      details: 'No TELNYX_FROM_NUMBER configured'
    });
  }
  console.log('');
  
  // 2. Check SIP Trunks
  try {
    const trunks = await db.select().from(sipTrunkConfigs).limit(10);
    const activeTrunks = trunks.filter(t => t.isActive);
    
    if (activeTrunks.length > 0) {
      results.push({
        component: 'SIP Trunks',
        status: '✅',
        details: `${activeTrunks.length} active trunk(s)`
      });
    } else if (trunks.length > 0) {
      results.push({
        component: 'SIP Trunks',
        status: '⚠️',
        details: `${trunks.length} found but none active`
      });
    } else {
      results.push({
        component: 'SIP Trunks',
        status: '⚠️',
        details: 'No SIP trunks (using Telnyx API instead)'
      });
    }
    
    console.log('📡 SIP Trunks:');
    trunks.slice(0, 3).forEach(t => {
      console.log(`   ${t.name} | ${t.provider} | ${t.isActive ? 'active' : 'inactive'}`);
    });
    if (trunks.length === 0) console.log('   (none configured - using Telnyx API)');
    console.log('');
  } catch (err: any) {
    results.push({ component: 'SIP Trunks', status: '⚠️', details: 'Table may not exist' });
  }
  
  // 3. Check Voice Configuration (from Agent Defaults)
  try {
    const defaults = await db.select().from(agentDefaults).limit(1);
    const defaultConfig = defaults[0];
    
    if (defaultConfig) {
      const voiceProvider = defaultConfig.defaultVoiceProvider || 'openai';
      const voiceName = defaultConfig.defaultVoice || 'Fenrir';
      results.push({
        component: 'Voice Config',
        status: '✅',
        details: `${voiceProvider} / ${voiceName}`
      });
      console.log('🎙️ Voice Configuration:');
      console.log(`   Provider: ${voiceProvider}`);
      console.log(`   Voice: ${voiceName}`);
    } else {
      results.push({
        component: 'Voice Config',
        status: '⚠️',
        details: 'Using defaults (Gemini/Fenrir)'
      });
      console.log('🎙️ Voice Configuration:');
      console.log('   Using defaults (Gemini/Fenrir)');
    }
    console.log('');
  } catch (err: any) {
    results.push({ component: 'Voice Config', status: '⚠️', details: err.message });
  }
  
  // 4. Check Voice Campaigns
  try {
    const voiceCampaigns = await db.select().from(campaigns)
      .where(eq(campaigns.type, 'call'))
      .limit(10);
    const activeCampaigns = voiceCampaigns.filter(c => c.status === 'active' || c.status === 'scheduled');
    
    if (activeCampaigns.length > 0) {
      results.push({
        component: 'Voice Campaigns',
        status: '✅',
        details: `${activeCampaigns.length} active campaign(s)`
      });
    } else if (voiceCampaigns.length > 0) {
      results.push({
        component: 'Voice Campaigns',
        status: '⚠️',
        details: `${voiceCampaigns.length} found but none active`
      });
    } else {
      results.push({
        component: 'Voice Campaigns',
        status: '⚠️',
        details: 'No voice (call) campaigns created'
      });
    }
    
    console.log('📢 Voice Campaigns (type=call):');
    voiceCampaigns.slice(0, 5).forEach(c => {
      console.log(`   ${c.name} | ${c.status}`);
    });
    if (voiceCampaigns.length === 0) console.log('   (none found)');
    console.log('');
  } catch (err: any) {
    results.push({ component: 'Voice Campaigns', status: '❌', details: err.message });
  }
  
  // 5. Check Knowledge Blocks
  try {
    const blocks = await db.select().from(knowledgeBlocks).limit(30);
    const activeBlocks = blocks.filter(b => b.isActive);
    
    if (activeBlocks.length >= 5) {
      results.push({
        component: 'Knowledge Blocks',
        status: '✅',
        details: `${activeBlocks.length} active blocks`
      });
    } else if (blocks.length > 0) {
      results.push({
        component: 'Knowledge Blocks',
        status: '⚠️',
        details: `${blocks.length} found, ${activeBlocks.length} active`
      });
    } else {
      results.push({
        component: 'Knowledge Blocks',
        status: '❌',
        details: 'No knowledge blocks configured'
      });
    }
    
    console.log('🧠 Knowledge Blocks:');
    console.log(`   Total: ${blocks.length}, Active: ${activeBlocks.length}`);
    console.log('');
  } catch (err: any) {
    results.push({ component: 'Knowledge Blocks', status: '⚠️', details: 'May not be initialized' });
  }
  
  // 6. Check Recent Call Sessions (to see if calls are working)
  try {
    const recentSessions = await db.select().from(callSessions)
      .orderBy(desc(callSessions.createdAt))
      .limit(5);
    
    console.log('📞 Recent Call Sessions:');
    if (recentSessions.length > 0) {
      recentSessions.forEach(s => {
        const date = s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A';
        console.log(`   ${date} | ${s.agentType || 'human'} | ${s.aiDisposition || s.status || 'in-progress'}`);
      });
      results.push({
        component: 'Call History',
        status: '✅',
        details: `${recentSessions.length} recent sessions found`
      });
    } else {
      console.log('   (no call sessions yet)');
      results.push({
        component: 'Call History',
        status: '⚠️',
        details: 'No call sessions yet - first call pending'
      });
    }
    console.log('');
  } catch (err: any) {
    results.push({ component: 'Call History', status: '⚠️', details: 'Could not check call history' });
  }
  
  // 6. Check Environment Variables
  const envChecks = [
    { key: 'TELNYX_API_KEY', name: 'Telnyx API Key' },
    { key: 'TELNYX_TEXML_APP_ID', name: 'Telnyx App ID' },
    { key: 'TELNYX_CONNECTION_ID', name: 'Telnyx Connection ID' },
    { key: 'GEMINI_API_KEY', name: 'Gemini API Key' },
    { key: 'OPENAI_API_KEY', name: 'OpenAI API Key' },
  ];
  
  console.log('🔑 Environment Variables:');
  envChecks.forEach(check => {
    const value = process.env[check.key];
    const status = value ? '✅' : '❌';
    const display = value ? `${value.substring(0, 15)}...` : 'NOT SET';
    console.log(`   ${status} ${check.name}: ${display}`);
  });
  console.log('');
  
  // Check critical env vars
  const telnyxOk = !!process.env.TELNYX_API_KEY && !!process.env.TELNYX_CONNECTION_ID;
  const aiOk = !!process.env.GEMINI_API_KEY || !!process.env.OPENAI_API_KEY;
  
  results.push({
    component: 'Telnyx Config',
    status: telnyxOk ? '✅' : '❌',
    details: telnyxOk ? 'API Key + Connection ID configured' : 'Missing Telnyx credentials'
  });
  
  results.push({
    component: 'AI Provider',
    status: aiOk ? '✅' : '❌',
    details: process.env.GEMINI_API_KEY ? 'Gemini configured' : process.env.OPENAI_API_KEY ? 'OpenAI configured' : 'No AI provider'
  });
  
  // Summary
  console.log('========================================');
  console.log('📊 READINESS SUMMARY');
  console.log('========================================');
  
  results.forEach(r => {
    console.log(`${r.status} ${r.component}: ${r.details}`);
  });
  
  const criticalFails = results.filter(r => r.status === '❌');
  const warnings = results.filter(r => r.status === '⚠️');
  
  console.log('\n========================================');
  if (criticalFails.length === 0) {
    console.log('✅ SYSTEM READY FOR AI CALLS');
  } else {
    console.log('❌ NOT READY - Fix these issues:');
    criticalFails.forEach(f => console.log(`   - ${f.component}: ${f.details}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings (non-blocking):');
    warnings.forEach(w => console.log(`   - ${w.component}: ${w.details}`));
  }
  console.log('========================================\n');
  
  process.exit(criticalFails.length > 0 ? 1 : 0);
}

checkAICallReadiness();
