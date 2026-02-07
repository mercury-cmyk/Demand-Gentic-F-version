/**
 * Seed UKEF Custom Call Flow
 * 
 * Creates the UKEF Export Finance call flow in the custom_call_flows table
 */

import { db } from './server/db';
import { customCallFlows } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Type for the steps array to match schema
type CallFlowStep = {
  stepId: string;
  name: string;
  mappedState?: string;
  goal?: string;
  allowedIntents?: string[];
  forbiddenIntents?: string[];
  allowedQuestions?: number;
  maxTurnsInStep?: number;
  mustDo?: string[];
  mustNotDo?: string[];
  exitCriteria?: Array<{ signal: string; description: string; nextStep?: string }>;
  branches?: Array<{ trigger: string; condition: string; targetStep?: string; capability?: string; description?: string }>;
  fallback?: { action: string; maxAttempts?: number; message?: string };
};

async function seedUKEFCallFlow() {
  console.log('Creating UKEF Export Finance call flow...');

  const ukefCallFlow = {
    id: 'ukef-export-finance-flow',
    name: 'UKEF Export Finance',
    objective: 'Qualify UK exporters for UKEF finance products and schedule follow-up with Export Finance Manager',
    successCriteria: 'Qualified lead with confirmed export activity, financing need identified, and callback/meeting scheduled',
    maxTotalTurns: 15,
    steps: [
      {
        stepId: 'step-1-intro',
        name: 'Introduction & Permission',
        mappedState: 'CONTEXT_FRAMING',
        goal: 'Introduce UKEF and get permission to discuss export financing',
        allowedIntents: ['request_permission', 'acknowledge'],
        forbiddenIntents: ['propose_meeting', 'schedule_meeting'],
        allowedQuestions: 1,
        maxTurnsInStep: 3,
        mustDo: [
          'Introduce yourself as calling on behalf of UK Export Finance',
          'Confirm you are speaking with the right person (Director/Owner)',
          'Ask if they have a moment to discuss export support'
        ],
        mustNotDo: [
          'Pitch products immediately',
          'Assume they know what UKEF is',
          'Ask multiple questions at once'
        ],
        exitCriteria: [
          { signal: 'permission_granted', description: 'Prospect agrees to continue', nextStep: 'step-2-qualify-export' },
          { signal: 'busy', description: 'Prospect is busy', nextStep: 'step-6-callback' }
        ],
        branches: [
          { trigger: 'decline', condition: 'Immediate decline', targetStep: 'step-7-close', description: 'Thank and exit gracefully' }
        ],
        fallback: { action: 'clarify', maxAttempts: 2, message: 'Briefly explain UKEF helps UK businesses export' }
      },
      {
        stepId: 'step-2-qualify-export',
        name: 'Export Activity Qualification',
        mappedState: 'DISCOVERY',
        goal: 'Confirm export activity and understand current export situation',
        allowedIntents: ['ask_question', 'listen', 'acknowledge'],
        forbiddenIntents: ['propose_meeting'],
        allowedQuestions: 2,
        maxTurnsInStep: 4,
        mustDo: [
          'Ask if they currently export or are looking to export',
          'Understand which markets/countries they export to or want to enter',
          'Gauge the scale of their export activity'
        ],
        mustNotDo: [
          'Skip if they mention exporting - dig deeper',
          'Assume they do not export based on company size'
        ],
        exitCriteria: [
          { signal: 'exports_confirmed', description: 'Active exporter identified', nextStep: 'step-3-needs' },
          { signal: 'looking_to_export', description: 'Planning to start exporting', nextStep: 'step-3-needs' },
          { signal: 'no_export', description: 'No export activity or interest', nextStep: 'step-7-close' }
        ],
        fallback: { action: 'probe', message: 'Ask about their international business ambitions' }
      },
      {
        stepId: 'step-3-needs',
        name: 'Financing Needs Assessment',
        mappedState: 'DISCOVERY',
        goal: 'Identify specific financing challenges or opportunities',
        allowedIntents: ['ask_question', 'listen', 'share_insight', 'acknowledge'],
        forbiddenIntents: [],
        allowedQuestions: 2,
        maxTurnsInStep: 4,
        mustDo: [
          'Ask about challenges in securing finance for export orders',
          'Explore if they have lost contracts due to financing terms',
          'Understand their working capital needs for export fulfillment'
        ],
        mustNotDo: [
          'Overwhelm with product details',
          'Assume they know about government-backed financing'
        ],
        exitCriteria: [
          { signal: 'financing_need', description: 'Clear financing need identified', nextStep: 'step-4-educate' },
          { signal: 'no_immediate_need', description: 'No pressing need but interested', nextStep: 'step-5-offer' }
        ],
        branches: [
          { trigger: 'objection', condition: 'Already have banking relationships', targetStep: 'step-4-educate', capability: 'objection_handling', description: 'Explain UKEF works through their existing bank' }
        ],
        fallback: { action: 'emphasize', message: 'Share that over 80% of UKEF-supported businesses are SMEs' }
      },
      {
        stepId: 'step-4-educate',
        name: 'UKEF Value Proposition',
        mappedState: 'ACKNOWLEDGEMENT',
        goal: 'Briefly explain how UKEF can help their specific situation',
        allowedIntents: ['share_insight', 'acknowledge', 'ask_question'],
        forbiddenIntents: [],
        allowedQuestions: 1,
        maxTurnsInStep: 3,
        mustDo: [
          'Match their need to relevant UKEF product (GEF, buyer financing, insurance)',
          'Mention that UKEF works through their existing bank relationship',
          'Highlight that support is available for contracts of various sizes'
        ],
        mustNotDo: [
          'Overwhelm with all products',
          'Make promises about approval',
          'Provide specific rates or terms'
        ],
        exitCriteria: [
          { signal: 'interested', description: 'Shows interest in learning more', nextStep: 'step-5-offer' },
          { signal: 'questions', description: 'Has specific questions', nextStep: 'step-5-offer' }
        ],
        fallback: { action: 'proceed', message: 'Move to offering next steps' }
      },
      {
        stepId: 'step-5-offer',
        name: 'Next Steps Proposal',
        mappedState: 'CLOSE',
        goal: 'Propose connection with Export Finance Manager',
        allowedIntents: ['propose_meeting', 'schedule_meeting', 'confirm_details'],
        forbiddenIntents: [],
        allowedQuestions: 2,
        maxTurnsInStep: 4,
        mustDo: [
          'Offer a no-obligation call with an Export Finance Manager',
          'Explain the EFM provides free guidance tailored to their situation',
          'Propose specific times or ask for their availability'
        ],
        mustNotDo: [
          'Be pushy if they need to think about it',
          'Overstate what the EFM call involves'
        ],
        exitCriteria: [
          { signal: 'meeting_agreed', description: 'Callback/meeting scheduled', nextStep: 'step-7-close' },
          { signal: 'needs_time', description: 'Wants to think about it', nextStep: 'step-6-callback' }
        ],
        branches: [
          { trigger: 'email_preferred', condition: 'Prefers email first', targetStep: 'step-7-close', description: 'Offer to send information by email' }
        ],
        fallback: { action: 'alternative', message: 'Offer email with information and follow-up call' }
      },
      {
        stepId: 'step-6-callback',
        name: 'Callback Arrangement',
        mappedState: 'PERMISSION_REQUEST',
        goal: 'Arrange a callback time',
        allowedIntents: ['schedule_meeting', 'confirm_details', 'acknowledge'],
        forbiddenIntents: [],
        allowedQuestions: 1,
        maxTurnsInStep: 2,
        mustDo: [
          'Propose a specific callback time',
          'Confirm best number to reach them',
          'Set clear expectation for the callback'
        ],
        mustNotDo: [
          'Leave it open-ended',
          'Accept "sometime next week" without specifics'
        ],
        exitCriteria: [
          { signal: 'callback_set', description: 'Callback time confirmed', nextStep: 'step-7-close' }
        ],
        fallback: { action: 'confirm', message: 'Confirm email for follow-up information' }
      },
      {
        stepId: 'step-7-close',
        name: 'Close',
        mappedState: 'END',
        goal: 'End call professionally with clear next steps',
        allowedIntents: ['confirm_details', 'exit_call'],
        forbiddenIntents: [],
        allowedQuestions: 0,
        maxTurnsInStep: 2,
        mustDo: [
          'Summarize any agreed next steps',
          'Confirm email address if sending information',
          'Thank them for their time'
        ],
        mustNotDo: [
          'Introduce new topics',
          'Extend the call unnecessarily'
        ],
        exitCriteria: [
          { signal: 'call_ended', description: 'Call completed' }
        ],
        fallback: { action: 'exit', message: 'End call professionally' }
      }
    ] as CallFlowStep[],
    version: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  try {
    // Check if already exists
    const existing = await db.select().from(customCallFlows).where(
      eq(customCallFlows.id, 'ukef-export-finance-flow')
    );
    
    if (existing.length > 0) {
      console.log('UKEF call flow already exists, updating...');
      await db.update(customCallFlows)
        .set({
          name: ukefCallFlow.name,
          objective: ukefCallFlow.objective,
          successCriteria: ukefCallFlow.successCriteria,
          maxTotalTurns: ukefCallFlow.maxTotalTurns,
          steps: ukefCallFlow.steps,
          version: ukefCallFlow.version + 1,
          updatedAt: new Date()
        })
        .where(eq(customCallFlows.id, 'ukef-export-finance-flow'));
    } else {
      await db.insert(customCallFlows).values(ukefCallFlow);
    }

    console.log('✅ UKEF Export Finance call flow created/updated successfully!');
    console.log('Flow ID: ukef-export-finance-flow');
    console.log('Steps: 7');
    
  } catch (error) {
    console.error('❌ Error creating UKEF call flow:', error);
    throw error;
  }
}

seedUKEFCallFlow()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
