// File: server/services/analytics-service.ts
// Campaign Analytics Service

import { db } from '../db';
import { campaigns, emailEvents, contacts } from '../db/schema';
import { eq, and, gte, lte, count } from 'drizzle-orm';

interface CampaignMetrics {
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  openCount: number;
  openRate: number;
  clickCount: number;
  clickRate: number;
  bounceCount: number;
  bounceRate: number;
  unsubscribeCount: number;
  unsubscribeRate: number;
  conversionCount?: number;
  conversionRate?: number;
  revenue?: number;
}

interface DailyMetrics {
  date: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
}

interface LinkPerformance {
  [url: string]: {
    clicks: number;
    uniqueClicks: number;
    rate: number;
  };
}

interface EngagementSegment {
  segment: string;
  count: number;
  openRate: number;
  clickRate: number;
}

// Get campaign metrics
export async function getCampaignMetrics(
  campaignId: string
): Promise<CampaignMetrics> {
  const events = await db.query.emailEvents.findMany({
    where: eq(emailEvents.campaignId, campaignId),
  });

  const sentCount = events.filter(e => e.type === 'sent').length;
  const deliveredCount = events.filter(e => e.type === 'delivered').length;
  const failedCount = events.filter(e => e.type === 'failed').length;
  const openCount = events.filter(e => e.type === 'opened').length;
  const clickCount = events.filter(e => e.type === 'clicked').length;
  const bounceCount = events.filter(e => e.type === 'bounced').length;
  const unsubscribeCount = events.filter(
    e => e.type === 'unsubscribed'
  ).length;

  return {
    sentCount,
    deliveredCount,
    failedCount,
    openCount,
    openRate: sentCount > 0 ? (openCount / sentCount) * 100 : 0,
    clickCount,
    clickRate: sentCount > 0 ? (clickCount / sentCount) * 100 : 0,
    bounceCount,
    bounceRate: sentCount > 0 ? (bounceCount / sentCount) * 100 : 0,
    unsubscribeCount,
    unsubscribeRate: sentCount > 0 ? (unsubscribeCount / sentCount) * 100 : 0,
  };
}

// Get daily metrics
export async function getDailyMetrics(
  campaignId: string,
  days: number = 30
): Promise<DailyMetrics[]> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await db.query.emailEvents.findMany({
    where: and(
      eq(emailEvents.campaignId, campaignId),
      gte(emailEvents.createdAt, startDate)
    ),
  });

  // Group by date
  const metricsMap: Record<string, DailyMetrics> = {};

  events.forEach(event => {
    const date = event.createdAt?.toISOString().split('T')[0] || '';
    if (!metricsMap[date]) {
      metricsMap[date] = {
        date,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
      };
    }

    if (event.type === 'sent') metricsMap[date].sent++;
    if (event.type === 'delivered') metricsMap[date].delivered++;
    if (event.type === 'opened') metricsMap[date].opened++;
    if (event.type === 'clicked') metricsMap[date].clicked++;
    if (event.type === 'bounced') metricsMap[date].bounced++;
  });

  return Object.values(metricsMap).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

// Get link performance
export async function getLinkPerformance(
  campaignId: string
): Promise<LinkPerformance> {
  const clickEvents = await db.query.emailEvents.findMany({
    where: and(
      eq(emailEvents.campaignId, campaignId),
      eq(emailEvents.type, 'clicked')
    ),
  });

  const linkMap: Record<
    string,
    { clicks: number; uniqueContacts: Set<string> }
  > = {};

  clickEvents.forEach(event => {
    const url = event.metadata?.url || 'unknown';
    if (!linkMap[url]) {
      linkMap[url] = { clicks: 0, uniqueContacts: new Set() };
    }
    linkMap[url].clicks++;
    if (event.contactId) {
      linkMap[url].uniqueContacts.add(event.contactId);
    }
  });

  // Convert to performance format
  const totalClicks = Object.values(linkMap).reduce(
    (sum, link) => sum + link.clicks,
    0
  );
  const performance: LinkPerformance = {};

  Object.entries(linkMap).forEach(([url, data]) => {
    performance[url] = {
      clicks: data.clicks,
      uniqueClicks: data.uniqueContacts.size,
      rate:
        totalClicks > 0 ? (data.clicks / totalClicks) * 100 : 0,
    };
  });

  return performance;
}

// Get engagement segments
export async function getEngagementSegments(
  campaignId: string
): Promise<EngagementSegment[]> {
  const events = await db.query.emailEvents.findMany({
    where: eq(emailEvents.campaignId, campaignId),
  });

  // Segment by engagement level
  const contactEngagement: Record<
    string,
    { sent: boolean; opened: boolean; clicked: boolean }
  > = {};

  events.forEach(event => {
    const contactId = event.contactId || '';
    if (!contactEngagement[contactId]) {
      contactEngagement[contactId] = {
        sent: false,
        opened: false,
        clicked: false,
      };
    }

    if (event.type === 'sent') contactEngagement[contactId].sent = true;
    if (event.type === 'opened') contactEngagement[contactId].opened = true;
    if (event.type === 'clicked') contactEngagement[contactId].clicked = true;
  });

  // Count segments
  const nonOpeners = Object.values(contactEngagement).filter(
    e => e.sent && !e.opened
  ).length;
  const openers = Object.values(contactEngagement).filter(
    e => e.sent && e.opened && !e.clicked
  ).length;
  const clickers = Object.values(contactEngagement).filter(
    e => e.sent && e.clicked
  ).length;
  const total = Object.values(contactEngagement).length;

  return [
    {
      segment: 'Non-Openers',
      count: nonOpeners,
      openRate: 0,
      clickRate: 0,
    },
    {
      segment: 'Openers',
      count: openers,
      openRate: total > 0 ? (openers / total) * 100 : 0,
      clickRate: 0,
    },
    {
      segment: 'Clickers',
      count: clickers,
      openRate: total > 0 ? ((openers + clickers) / total) * 100 : 0,
      clickRate: total > 0 ? (clickers / total) * 100 : 0,
    },
  ];
}

// Get time-to-open distribution
export async function getTimeToOpenDistribution(
  campaignId: string
): Promise<Record<string, number>> {
  const openEvents = await db.query.emailEvents.findMany({
    where: and(
      eq(emailEvents.campaignId, campaignId),
      eq(emailEvents.type, 'opened')
    ),
  });

  // Get sent times to calculate time-to-open
  const sentEvents = await db.query.emailEvents.findMany({
    where: and(
      eq(emailEvents.campaignId, campaignId),
      eq(emailEvents.type, 'sent')
    ),
  });

  const sentTimes: Record<string, Date> = {};
  sentEvents.forEach(e => {
    if (e.messageId) {
      sentTimes[e.messageId] = e.createdAt || new Date();
    }
  });

  const distribution: Record<string, number> = {
    '0-1h': 0,
    '1-6h': 0,
    '6-24h': 0,
    '24h+': 0,
  };

  openEvents.forEach(event => {
    const messageId = event.metadata?.messageId || event.messageId;
    const sentTime = sentTimes[messageId];

    if (sentTime && event.createdAt) {
      const diffMs = event.createdAt.getTime() - sentTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours <= 1) distribution['0-1h']++;
      else if (diffHours <= 6) distribution['1-6h']++;
      else if (diffHours <= 24) distribution['6-24h']++;
      else distribution['24h+']++;
    }
  });

  return distribution;
}

// Get device breakdown
export async function getDeviceBreakdown(
  campaignId: string
): Promise<Record<string, number>> {
  const openEvents = await db.query.emailEvents.findMany({
    where: and(
      eq(emailEvents.campaignId, campaignId),
      eq(emailEvents.type, 'opened')
    ),
  });

  const deviceMap: Record<string, number> = {
    desktop: 0,
    mobile: 0,
    tablet: 0,
    unknown: 0,
  };

  openEvents.forEach(event => {
    const device = event.metadata?.deviceType || 'unknown';
    if (device in deviceMap) {
      deviceMap[device as keyof typeof deviceMap]++;
    }
  });

  return deviceMap;
}

// Get geographic breakdown
export async function getGeographicBreakdown(
  campaignId: string
): Promise<Record<string, number>> {
  const openEvents = await db.query.emailEvents.findMany({
    where: and(
      eq(emailEvents.campaignId, campaignId),
      eq(emailEvents.type, 'opened')
    ),
  });

  const geoMap: Record<string, number> = {};

  openEvents.forEach(event => {
    const country = event.metadata?.country || 'Unknown';
    geoMap[country] = (geoMap[country] || 0) + 1;
  });

  return geoMap;
}

// Calculate engagement score
export function calculateEngagementScore(metrics: CampaignMetrics): number {
  // Score: 0-100 based on open rate, click rate, and other factors
  let score = 0;

  // Open rate (0-50 points)
  score += Math.min(50, metrics.openRate * 2.5);

  // Click rate (0-30 points)
  score += Math.min(30, metrics.clickRate * 3);

  // Low bounce rate bonus (0-20 points)
  score += Math.max(0, 20 - metrics.bounceRate * 4);

  return Math.min(100, score);
}

// Get competitive benchmark
export async function getCompetitiveBenchmark(industry: string): Promise<CampaignMetrics> {
  // In production, this would fetch from a benchmarks database
  const benchmarks: Record<string, CampaignMetrics> = {
    technology: {
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      openCount: 0,
      openRate: 23.4,
      clickCount: 0,
      clickRate: 3.2,
      bounceCount: 0,
      bounceRate: 0.8,
      unsubscribeCount: 0,
      unsubscribeRate: 0.3,
    },
    retail: {
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      openCount: 0,
      openRate: 18.5,
      clickCount: 0,
      clickRate: 2.5,
      bounceCount: 0,
      bounceRate: 0.9,
      unsubscribeCount: 0,
      unsubscribeRate: 0.4,
    },
    finance: {
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      openCount: 0,
      openRate: 25.1,
      clickCount: 0,
      clickRate: 4.1,
      bounceCount: 0,
      bounceRate: 0.6,
      unsubscribeCount: 0,
      unsubscribeRate: 0.2,
    },
  };

  return (
    benchmarks[industry] || benchmarks.technology
  );
}

// Generate analytics report
export async function generateAnalyticsReport(campaignId: string) {
  const metrics = await getCampaignMetrics(campaignId);
  const dailyMetrics = await getDailyMetrics(campaignId, 30);
  const linkPerformance = await getLinkPerformance(campaignId);
  const segments = await getEngagementSegments(campaignId);
  const devices = await getDeviceBreakdown(campaignId);
  const geography = await getGeographicBreakdown(campaignId);
  const engagementScore = calculateEngagementScore(metrics);

  return {
    summary: metrics,
    dailyMetrics,
    linkPerformance,
    segments,
    devices,
    geography,
    engagementScore,
    generatedAt: new Date(),
  };
}
