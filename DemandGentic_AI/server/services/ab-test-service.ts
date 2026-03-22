// File: server/services/ab-test-service.ts
// A/B Testing System Service

import { db } from '../db';
import { campaigns, abTests, emailEvents, contacts } from '../db/schema';
import { eq, and, gte } from 'drizzle-orm';

interface ABTestConfig {
  campaignId: string;
  variantA: {
    subject: string;
    htmlContent: string;
  };
  variantB: {
    subject: string;
    htmlContent: string;
  };
  splitPercentage: number; // 0-100
  testDuration: number; // hours
  minimumSampleSize: number;
}

interface ABTestResult {
  variantA: {
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    openRate: number;
    clickRate: number;
  };
  variantB: {
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    openRate: number;
    clickRate: number;
  };
  statisticalSignificance: number;
  winnerVariant?: 'A' | 'B';
  confidence: number;
}

// Create A/B test
export async function createABTest(config: ABTestConfig) {
  const testId = `abtest_${Date.now()}`;
  const endTime = new Date(Date.now() + config.testDuration * 60 * 60 * 1000);

  const result = await db.insert(abTests).values({
    id: testId,
    campaignId: config.campaignId,
    variantA: {
      subject: config.variantA.subject,
      htmlContent: config.variantA.htmlContent,
      splitPercentage: config.splitPercentage,
    },
    variantB: {
      subject: config.variantB.subject,
      htmlContent: config.variantB.htmlContent,
      splitPercentage: 100 - config.splitPercentage,
    },
    status: 'active',
    startedAt: new Date(),
    endsAt: endTime,
    minimumSampleSize: config.minimumSampleSize,
    metrics: {
      variantA: {
        sent: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
      },
      variantB: {
        sent: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
      },
    },
  });

  return result;
}

// Get variant for contact (deterministic split)
export function getVariantForContact(
  contactId: string,
  testId: string,
  splitPercentage: number
): 'A' | 'B' {
  // Use hash of contactId + testId for deterministic split
  const combined = `${contactId}:${testId}`;
  const hash = combined.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);

  const position = hash % 100;
  return position  3.841 ? 1 - (chiSquare / 10) : 0;
  const significance = Math.max(0, Math.min(1, pValue));
  const confidence = 1 - significance;

  // Update significance
  await db
    .update(abTests)
    .set({ 
      statisticalSignificance: significance,
      confidence,
    })
    .where(eq(abTests.id, testId));

  // Auto-declare winner if significant
  if (confidence > 0.95 && totalSent >= test.minimumSampleSize) {
    const variantARate = metricA.opened / metricA.sent;
    const variantBRate = metricB.opened / metricB.sent;
    const winner = variantARate > variantBRate ? 'A' : 'B';

    await db
      .update(abTests)
      .set({
        status: 'completed',
        winnerVariant: winner,
        completedAt: new Date(),
      })
      .where(eq(abTests.id, testId));
  }
}

// Get A/B test results
export async function getABTestResults(testId: string): Promise {
  const test = await db.query.abTests.findFirst({
    where: eq(abTests.id, testId),
  });

  if (!test) {
    throw new Error('A/B test not found');
  }

  const metrics = test.metrics as any;
  const variantA = metrics.variantA;
  const variantB = metrics.variantB;

  return {
    variantA: {
      sent: variantA.sent,
      opened: variantA.opened,
      clicked: variantA.clicked,
      bounced: variantA.bounced,
      openRate: variantA.sent > 0 ? (variantA.opened / variantA.sent) * 100 : 0,
      clickRate: variantA.sent > 0 ? (variantA.clicked / variantA.sent) * 100 : 0,
    },
    variantB: {
      sent: variantB.sent,
      opened: variantB.opened,
      clicked: variantB.clicked,
      bounced: variantB.bounced,
      openRate: variantB.sent > 0 ? (variantB.opened / variantB.sent) * 100 : 0,
      clickRate: variantB.sent > 0 ? (variantB.clicked / variantB.sent) * 100 : 0,
    },
    statisticalSignificance: test.statisticalSignificance || 0,
    winnerVariant: test.winnerVariant,
    confidence: test.confidence || 0,
  };
}

// Declare winner manually
export async function declareWinner(
  testId: string,
  winnerVariant: 'A' | 'B'
) {
  await db
    .update(abTests)
    .set({
      status: 'completed',
      winnerVariant,
      completedAt: new Date(),
    })
    .where(eq(abTests.id, testId));

  return { success: true, winner: winnerVariant };
}

// Get all A/B tests for campaign
export async function getABTestsForCampaign(campaignId: string) {
  const tests = await db.query.abTests.findMany({
    where: eq(abTests.campaignId, campaignId),
  });

  return tests;
}

// Archive old A/B tests
export async function archiveOldTests() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  await db
    .update(abTests)
    .set({ status: 'archived' })
    .where(
      and(
        eq(abTests.status, 'completed'),
        gte(abTests.completedAt, oneDayAgo)
      )
    );
}

// Export results to CSV
export async function exportResults(testId: string): Promise {
  const test = await db.query.abTests.findFirst({
    where: eq(abTests.id, testId),
  });

  if (!test) throw new Error('Test not found');

  const results = await getABTestResults(testId);

  const csv = `
A/B Test Results
Test ID: ${testId}
Campaign ID: ${test.campaignId}
Status: ${test.status}
Started: ${test.startedAt}
Ended: ${test.completedAt}

Variant A (Subject: "${test.variantA.subject}")
Sent: ${results.variantA.sent}
Opened: ${results.variantA.opened} (${results.variantA.openRate.toFixed(2)}%)
Clicked: ${results.variantA.clicked} (${results.variantA.clickRate.toFixed(2)}%)
Bounced: ${results.variantA.bounced}

Variant B (Subject: "${test.variantB.subject}")
Sent: ${results.variantB.sent}
Opened: ${results.variantB.opened} (${results.variantB.openRate.toFixed(2)}%)
Clicked: ${results.variantB.clicked} (${results.variantB.clickRate.toFixed(2)}%)
Bounced: ${results.variantB.bounced}

Statistical Significance: ${(results.statisticalSignificance * 100).toFixed(2)}%
Confidence: ${(results.confidence * 100).toFixed(2)}%
Winner: ${results.winnerVariant || 'Not determined'}
  `;

  return csv;
}