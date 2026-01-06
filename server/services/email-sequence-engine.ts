
import { db } from "../db";
import { emailSequences, sequenceEnrollments, emailTemplates } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";

interface SequenceStep {
  type: "email" | "task" | "wait";
  mode?: "manual" | "auto";
  templateId?: string;
  wait?: string; // ISO 8601 duration
  subject?: string;
  body?: string;
}

/**
 * Process email sequence enrollments
 */
export async function processSequenceEnrollments(): Promise<void> {
  try {
    // Find enrollments ready to process
    const readyEnrollments = await db
      .select()
      .from(sequenceEnrollments)
      .where(
        and(
          eq(sequenceEnrollments.status, 'active'),
          lte(sequenceEnrollments.nextRunAt, new Date())
        )
      );

    console.log(`[Sequence] Processing ${readyEnrollments.length} enrollments`);

    for (const enrollment of readyEnrollments) {
      await processEnrollment(enrollment);
    }
  } catch (error) {
    console.error('[Sequence] Error processing enrollments:', error);
  }
}

/**
 * Process single enrollment
 */
async function processEnrollment(enrollment: any): Promise<void> {
  try {
    // Get sequence definition
    const [sequence] = await db
      .select()
      .from(emailSequences)
      .where(eq(emailSequences.id, enrollment.sequenceId))
      .limit(1);

    if (!sequence) {
      console.error('[Sequence] Sequence not found:', enrollment.sequenceId);
      return;
    }

    const steps = sequence.steps as SequenceStep[];
    const currentStep = steps[enrollment.currentStep];

    if (!currentStep) {
      // Sequence completed
      await db
        .update(sequenceEnrollments)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      return;
    }

    // Execute step
    if (currentStep.type === 'email') {
      await sendSequenceEmail(enrollment, currentStep);
    } else if (currentStep.type === 'task') {
      await createSequenceTask(enrollment, currentStep);
    }

    // Calculate next run time
    const nextRunAt = calculateNextRun(currentStep);
    const nextStep = enrollment.currentStep + 1;

    await db
      .update(sequenceEnrollments)
      .set({
        currentStep: nextStep,
        nextRunAt,
        lastActionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sequenceEnrollments.id, enrollment.id));

  } catch (error) {
    console.error('[Sequence] Error processing enrollment:', error);
    
    // Mark as failed
    await db
      .update(sequenceEnrollments)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(sequenceEnrollments.id, enrollment.id));
  }
}

/**
 * Send email for sequence step
 */
async function sendSequenceEmail(enrollment: any, step: SequenceStep): Promise<void> {
  console.log('[Sequence] Sending email for enrollment:', enrollment.id);

  // Get template if specified
  let emailBody = step.body || '';
  let emailSubject = step.subject || '';

  if (step.templateId) {
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, step.templateId))
      .limit(1);

    if (template) {
      emailBody = template.htmlContent || '';
      emailSubject = template.subject || '';
    }
  }

  // Here you would integrate with your email sending service
  // For now, just log
  console.log('[Sequence] Email sent:', { subject: emailSubject, mode: step.mode });
}

/**
 * Create task for sequence step
 */
async function createSequenceTask(enrollment: any, step: SequenceStep): Promise<void> {
  console.log('[Sequence] Creating task for enrollment:', enrollment.id);
  // Task creation logic here
}

/**
 * Calculate next run time based on wait duration
 */
function calculateNextRun(step: SequenceStep): Date {
  const now = new Date();
  
  if (!step.wait) {
    return now;
  }

  // Parse ISO 8601 duration (e.g., "P2D" = 2 days)
  const match = step.wait.match(/P(\d+)D/);
  if (match) {
    const days = parseInt(match[1]);
    now.setDate(now.getDate() + days);
  }

  return now;
}

/**
 * Enroll contact in sequence
 */
export async function enrollInSequence(
  sequenceId: string,
  contactId: string,
  opportunityId?: string
): Promise<void> {
  try {
    await db.insert(sequenceEnrollments).values({
      sequenceId,
      contactId,
      opportunityId,
      status: 'active',
      currentStep: 0,
      nextRunAt: new Date(),
    });

    console.log('[Sequence] Enrolled contact:', contactId);
  } catch (error) {
    console.error('[Sequence] Error enrolling:', error);
    throw error;
  }
}

/**
 * Pause enrollment
 */
export async function pauseEnrollment(enrollmentId: string): Promise<void> {
  await db
    .update(sequenceEnrollments)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(sequenceEnrollments.id, enrollmentId));
}

/**
 * Resume enrollment
 */
export async function resumeEnrollment(enrollmentId: string): Promise<void> {
  await db
    .update(sequenceEnrollments)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(sequenceEnrollments.id, enrollmentId));
}
