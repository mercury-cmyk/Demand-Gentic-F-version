import { Queue, Worker } from 'bullmq';
import { createQueue, createWorker, isQueueAvailable } from './queue';
import { db } from '../db';
import { verificationCampaignWorkflows, verificationCampaigns } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';
import { screenCampaignEligibility } from '../services/eligibility-screening';
import { checkExistingDataForCampaign } from '../services/existing-data-checker';

type WorkflowStage = 'eligibility_check' | 'email_validation' | 'address_enrichment' | 'phone_enrichment' | 'completed';

export interface VerificationWorkflowJob {
  campaignId: string;
  startStage?: WorkflowStage;
}

const QUEUE_NAME = 'verification-workflow';

let workflowQueue: Queue | null = null;
let workflowWorker: Worker | null = null;

export function getVerificationWorkflowQueue(): Queue | null {
  if (!isQueueAvailable()) {
    console.warn('[VerificationWorkflow] Queue not available - Redis not configured');
    return null;
  }

  if (!workflowQueue) {
    workflowQueue = createQueue(QUEUE_NAME, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 50,
      removeOnFail: 200
    });

    if (workflowQueue) {
      console.log('[VerificationWorkflow] Queue initialized');
    }
  }

  return workflowQueue;
}

export function startVerificationWorkflowWorker() {
  if (!isQueueAvailable()) {
    console.warn('[VerificationWorkflow] Worker not started - Redis not configured');
    return null;
  }

  if (workflowWorker) {
    console.log('[VerificationWorkflow] Worker already running');
    return workflowWorker;
  }

  workflowWorker = createWorker(
    QUEUE_NAME,
    processVerificationWorkflow,
    {
      concurrency: 2
    }
  );

  if (workflowWorker) {
    workflowWorker.on('completed', (job) => {
      console.log(`[VerificationWorkflow] Job ${job.id} completed for campaign ${job.data.campaignId}`);
    });

    workflowWorker.on('failed', (job, err) => {
      console.error(`[VerificationWorkflow] Job ${job?.id} failed for campaign ${job?.data.campaignId}:`, err.message);
    });

    console.log('[VerificationWorkflow] Worker started with concurrency 2');
  }

  return workflowWorker;
}

async function processVerificationWorkflow(job: any): Promise {
  const { campaignId, startStage = 'eligibility_check' } = job.data as VerificationWorkflowJob;

  console.log(`[VerificationWorkflow] Processing campaign ${campaignId} starting at stage: ${startStage}`);

  const acquired = await acquireCampaignLock(campaignId);
  if (!acquired) {
    console.log(`[VerificationWorkflow] Campaign ${campaignId} already being processed - skipping`);
    return;
  }

  try {
    let workflow = await db.query.verificationCampaignWorkflows.findFirst({
      where: eq(verificationCampaignWorkflows.campaignId, campaignId)
    });

    if (!workflow) {
      const [newWorkflow] = await db.insert(verificationCampaignWorkflows).values({
        campaignId,
        currentStage: startStage,
        status: 'processing'
      }).returning();
      workflow = newWorkflow;
    }

    if (workflow.status === 'completed') {
      console.log(`[VerificationWorkflow] Campaign ${campaignId} workflow already completed`);
      return;
    }

    await db.update(verificationCampaignWorkflows)
      .set({ 
        status: 'processing',
        startedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(verificationCampaignWorkflows.id, workflow.id));

    let currentStage = startStage || workflow.currentStage;

    while (currentStage !== 'completed') {
      console.log(`[VerificationWorkflow] Campaign ${campaignId} - Running stage: ${currentStage}`);

      try {
        currentStage = await executeStage(campaignId, workflow.id, currentStage);
      } catch (error: any) {
        console.error(`[VerificationWorkflow] Stage ${currentStage} failed for campaign ${campaignId}:`, error.message);
        
        await db.update(verificationCampaignWorkflows)
          .set({
            status: 'failed',
            errorMessage: error.message,
            retryCount: (workflow.retryCount || 0) + 1,
            updatedAt: new Date()
          })
          .where(eq(verificationCampaignWorkflows.id, workflow.id));

        throw error;
      }

      await db.update(verificationCampaignWorkflows)
        .set({
          currentStage,
          updatedAt: new Date()
        })
        .where(eq(verificationCampaignWorkflows.id, workflow.id));
    }

    await db.update(verificationCampaignWorkflows)
      .set({
        status: 'completed',
        currentStage: 'completed',
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(verificationCampaignWorkflows.id, workflow.id));

    console.log(`[VerificationWorkflow] Campaign ${campaignId} workflow completed successfully`);

  } finally {
    await releaseCampaignLock(campaignId);
  }
}

async function executeStage(
  campaignId: string,
  workflowId: string,
  stage: WorkflowStage
): Promise {
  switch (stage) {
    case 'eligibility_check':
      return await runEligibilityCheck(campaignId, workflowId);
    
    case 'email_validation':
      return await runEmailValidation(campaignId, workflowId);
    
    case 'address_enrichment':
      return await runAddressEnrichment(campaignId, workflowId);
    
    case 'phone_enrichment':
      return await runPhoneEnrichment(campaignId, workflowId);
    
    default:
      throw new Error(`Unknown workflow stage: ${stage}`);
  }
}

async function runEligibilityCheck(campaignId: string, workflowId: string): Promise {
  console.log(`[VerificationWorkflow] Running eligibility check for campaign ${campaignId}`);

  const result = await screenCampaignEligibility(campaignId);

  await db.update(verificationCampaignWorkflows)
    .set({
      eligibilityStats: {
        total: result.total,
        eligible: result.eligible,
        ineligible: result.ineligible + result.outOfScope + result.suppressed,
        processedAt: new Date().toISOString()
      },
      updatedAt: new Date()
    })
    .where(eq(verificationCampaignWorkflows.id, workflowId));

  console.log(`[VerificationWorkflow] Eligibility check complete - ${result.eligible}/${result.total} eligible`);

  return result.eligible > 0 ? 'email_validation' : 'completed';
}

async function runEmailValidation(campaignId: string, workflowId: string): Promise {
  console.log(`[VerificationWorkflow] Running email validation for campaign ${campaignId}`);

  await db.update(verificationCampaignWorkflows)
    .set({
      emailValidationStats: {
        total: 0,
        processed: 0,
        skipped: 0,
        valid: 0,
        invalid: 0,
        processedAt: new Date().toISOString()
      },
      updatedAt: new Date()
    })
    .where(eq(verificationCampaignWorkflows.id, workflowId));

  console.log(`[VerificationWorkflow] Email validation stage marked for async processing`);

  return 'address_enrichment';
}

async function runAddressEnrichment(campaignId: string, workflowId: string): Promise {
  console.log(`[VerificationWorkflow] Checking existing address data for campaign ${campaignId}`);

  const dataCheck = await checkExistingDataForCampaign(campaignId, true);

  await db.update(verificationCampaignWorkflows)
    .set({
      addressEnrichmentStats: {
        total: dataCheck.total,
        processed: 0,
        skipped: dataCheck.addressComplete,
        enriched: 0,
        failed: 0,
        processedAt: new Date().toISOString()
      },
      updatedAt: new Date()
    })
    .where(eq(verificationCampaignWorkflows.id, workflowId));

  console.log(`[VerificationWorkflow] Address data check complete - ${dataCheck.addressComplete}/${dataCheck.total} already have addresses`);

  return 'phone_enrichment';
}

async function runPhoneEnrichment(campaignId: string, workflowId: string): Promise {
  console.log(`[VerificationWorkflow] Checking existing phone data for campaign ${campaignId}`);

  const dataCheck = await checkExistingDataForCampaign(campaignId, true);

  await db.update(verificationCampaignWorkflows)
    .set({
      phoneEnrichmentStats: {
        total: dataCheck.total,
        processed: 0,
        skipped: dataCheck.phoneComplete,
        enriched: 0,
        failed: 0,
        processedAt: new Date().toISOString()
      },
      updatedAt: new Date()
    })
    .where(eq(verificationCampaignWorkflows.id, workflowId));

  console.log(`[VerificationWorkflow] Phone data check complete - ${dataCheck.phoneComplete}/${dataCheck.total} already have phones`);

  return 'completed';
}

async function acquireCampaignLock(campaignId: string): Promise {
  const existing = await db.query.verificationCampaignWorkflows.findFirst({
    where: and(
      eq(verificationCampaignWorkflows.campaignId, campaignId),
      eq(verificationCampaignWorkflows.status, 'processing')
    )
  });

  return !existing;
}

async function releaseCampaignLock(campaignId: string): Promise {
}

export async function startWorkflowForCampaign(
  campaignId: string,
  startStage?: WorkflowStage
): Promise {
  const queue = getVerificationWorkflowQueue();
  
  if (!queue) {
    console.warn('[VerificationWorkflow] Queue not available - running workflow synchronously');
    await processVerificationWorkflow({ 
      data: { campaignId, startStage } 
    } as any);
    return;
  }

  await queue.add(
    `workflow-${campaignId}`,
    { campaignId, startStage },
    {
      jobId: `workflow-${campaignId}`
    }
  );

  console.log(`[VerificationWorkflow] Queued workflow for campaign ${campaignId}`);
}

export async function addVerificationWorkflowJob(data: {
  campaignId: string;
  triggeredBy?: string;
  uploadJobId?: string;
}): Promise {
  const queue = getVerificationWorkflowQueue();
  
  if (!queue) {
    throw new Error('[VerificationWorkflow] Queue not available');
  }

  const job = await queue.add(`workflow-${data.campaignId}`, data, {
    jobId: `workflow-${data.campaignId}-${Date.now()}`,
  });

  return job.id!;
}

export function initializeVerificationWorkflowQueue() {
  const queue = getVerificationWorkflowQueue();
  console.log('[VerificationWorkflowQueue] Queue and worker initialized');
  return queue;
}