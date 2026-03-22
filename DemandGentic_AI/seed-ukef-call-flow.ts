/**
 * Seed UKEF Custom Call Flow - White Paper Distribution
 *
 * Creates the UKEF Export Finance call flow in the custom_call_flows table.
 * Goal: Get prospects to consent to receiving a free white paper from UKEF
 * about government support programs for UK businesses.
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
  exitCriteria?: Array;
  branches?: Array;
  fallback?: { action: string; maxAttempts?: number; message?: string };
};

async function seedUKEFCallFlow() {
  console.log('Creating UKEF Export Finance call flow (White Paper Distribution)...');

  const ukefCallFlow = {
    id: 'ukef-export-finance-flow',
    name: 'UKEF Export Finance - White Paper',
    objective: 'Get the prospect\'s consent to receive a free white paper published by UK Export Finance about government support programs for UK businesses',
    successCriteria: 'Prospect consents to receive the white paper via email',
    maxTotalTurns: 8,
    steps: [
      {
        stepId: 'step-1-intro',
        name: 'Introduction & Identity Confirmation',
        mappedState: 'CONTEXT_FRAMING',
        goal: 'Confirm you are speaking with the right person and that they are still in their role',
        allowedIntents: ['request_permission', 'acknowledge'],
        forbiddenIntents: ['propose_meeting', 'schedule_meeting', 'ask_question'],
        allowedQuestions: 1,
        maxTurnsInStep: 3,
        mustDo: [
          'Introduce yourself as calling on behalf of UK Export Finance',
          'Confirm you are speaking with the right person by name',
          'Confirm they are still in their role at the company'
        ],
        mustNotDo: [
          'Pitch products or services',
          'Ask discovery questions about their business',
          'Ask multiple questions at once',
          'Ask "would you be interested in..."'
        ],
        exitCriteria: [
          { signal: 'identity_confirmed', description: 'Prospect confirms identity and role', nextStep: 'step-2-pitch' },
          { signal: 'wrong_person', description: 'Wrong person or no longer in role', nextStep: 'step-4-close' },
          { signal: 'busy', description: 'Prospect is busy', nextStep: 'step-4-close' }
        ],
        branches: [
          { trigger: 'decline', condition: 'Immediate decline', targetStep: 'step-4-close', description: 'Thank and exit gracefully' }
        ],
        fallback: { action: 'clarify', maxAttempts: 2, message: 'Briefly explain you are calling from UK Export Finance' }
      },
      {
        stepId: 'step-2-pitch',
        name: 'White Paper Pitch',
        mappedState: 'ACKNOWLEDGEMENT',
        goal: 'Briefly mention the free white paper and ask to send it',
        allowedIntents: ['share_insight', 'acknowledge'],
        forbiddenIntents: ['ask_question', 'propose_meeting', 'schedule_meeting'],
        allowedQuestions: 0,
        maxTurnsInStep: 2,
        mustDo: [
          'Mention that UK Export Finance has published a free white paper about government programs to support UK businesses',
          'Emphasise it is completely free and published by UK Export Finance',
          'Keep the pitch brief - one or two sentences maximum'
        ],
        mustNotDo: [
          'Ask "would you be interested?"',
          'Ask discovery questions like "are you focused on exporting?"',
          'Go into detail about UKEF products',
          'Be salesy or pushy',
          'Pitch a meeting or callback'
        ],
        exitCriteria: [
          { signal: 'acknowledged', description: 'Prospect acknowledges', nextStep: 'step-3-consent' }
        ],
        fallback: { action: 'proceed', message: 'Move directly to asking if you can send it' }
      },
      {
        stepId: 'step-3-consent',
        name: 'Get Consent to Send',
        mappedState: 'CLOSE',
        goal: 'Get consent to send the white paper to their email',
        allowedIntents: ['confirm_details', 'acknowledge'],
        forbiddenIntents: ['ask_question', 'propose_meeting'],
        allowedQuestions: 1,
        maxTurnsInStep: 3,
        mustDo: [
          'Ask "Can I send it across to your email and you can have a look whenever you have time?"',
          'If they agree, confirm their email address',
          'Keep it casual and low-pressure'
        ],
        mustNotDo: [
          'Ask "would you be interested?"',
          'Try to pitch anything beyond the white paper',
          'Ask for a meeting or callback',
          'Push if they say no - accept gracefully'
        ],
        exitCriteria: [
          { signal: 'consent_given', description: 'Prospect agrees to receive white paper', nextStep: 'step-4-close' },
          { signal: 'declined', description: 'Prospect declines', nextStep: 'step-4-close' }
        ],
        branches: [
          { trigger: 'email_confirmed', condition: 'Email already on file confirmed', targetStep: 'step-4-close', description: 'Proceed to close' }
        ],
        fallback: { action: 'confirm', message: 'Confirm you will send the white paper and close warmly' }
      },
      {
        stepId: 'step-4-close',
        name: 'Close',
        mappedState: 'END',
        goal: 'End call warmly and professionally',
        allowedIntents: ['confirm_details', 'exit_call'],
        forbiddenIntents: [],
        allowedQuestions: 0,
        maxTurnsInStep: 2,
        mustDo: [
          'Thank them for their time',
          'If they agreed, confirm the white paper will be sent to their email',
          'Say goodbye warmly'
        ],
        mustNotDo: [
          'Introduce new topics',
          'Extend the call unnecessarily',
          'Try to pitch anything else'
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
    console.log('Steps: 4 (Intro → Pitch → Consent → Close)');
    console.log('Objective: White paper distribution');

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