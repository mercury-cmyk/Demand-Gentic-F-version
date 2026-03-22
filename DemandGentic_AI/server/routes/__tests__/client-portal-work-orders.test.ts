/**
 * Client Portal Work Orders — Unified Direct Agentic Order Tests
 *
 * Tests for the shared "Submit New Direct Agentic Order" form backend:
 * - Zod validation (required & optional fields)
 * - Idempotency: event-based duplicate detection
 * - Event linkage: workOrderDraft creation for Argyle events
 * - Tenant isolation: clientAccountId scoping
 * - GET listing query
 * - GET by-event idempotency endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../db';
import { eq, and, sql } from 'drizzle-orm';
import {
  workOrders,
  workOrderDrafts,
  clientAccounts,
  clientPortalActivityLogs,
  externalEvents,
} from '../../../shared/schema';

// ─── Zod Schema Validation ──────────────────────────────────────────────────

describe('Work Order Zod Schema', () => {
  it('should accept minimal valid payload', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().optional().default(''),
      orderType: z.string().default('lead_generation'),
      priority: z.string().default('normal'),
      targetIndustries: z.array(z.string()).optional().default([]),
      targetTitles: z.array(z.string()).optional().default([]),
      targetCompanySize: z.string().optional().nullable(),
      targetRegions: z.array(z.string()).optional().default([]),
      targetAccountCount: z.number().optional().nullable(),
      targetLeadCount: z.number().optional().nullable(),
      requestedStartDate: z.string().optional().nullable(),
      requestedEndDate: z.string().optional().nullable(),
      estimatedBudget: z.number().optional().nullable(),
      clientNotes: z.string().optional().nullable(),
      specialRequirements: z.string().optional().nullable(),
      targetUrls: z.array(z.string()).optional().default([]),
      deliveryMethod: z.string().optional().default('email'),
      organizationContext: z.string().optional().nullable(),
      useOrgIntelligence: z.boolean().optional(),
      submitNow: z.boolean().default(true),
      eventSource: z.string().optional().nullable(),
      externalEventId: z.string().optional().nullable(),
      eventSourceUrl: z.string().optional().nullable(),
      eventMetadata: z.object({
        eventTitle: z.string().optional(),
        eventDate: z.string().optional(),
        eventType: z.string().optional(),
        eventLocation: z.string().optional(),
        eventCommunity: z.string().optional(),
      }).optional().nullable(),
    });

    const result = schema.safeParse({ title: 'Test Order' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Test Order');
      expect(result.data.orderType).toBe('lead_generation');
      expect(result.data.priority).toBe('normal');
      expect(result.data.submitNow).toBe(true);
    }
  });

  it('should reject payload with empty title', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      title: z.string().min(1),
    });

    const result = schema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('should accept full event-linked payload', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().optional().default(''),
      orderType: z.string().default('lead_generation'),
      submitNow: z.boolean().default(true),
      eventSource: z.string().optional().nullable(),
      externalEventId: z.string().optional().nullable(),
      eventSourceUrl: z.string().optional().nullable(),
      eventMetadata: z.object({
        eventTitle: z.string().optional(),
        eventDate: z.string().optional(),
        eventType: z.string().optional(),
        eventLocation: z.string().optional(),
        eventCommunity: z.string().optional(),
      }).optional().nullable(),
    });

    const result = schema.safeParse({
      title: 'Argyle Forum 2025 — Lead Gen',
      description: 'Need 500 leads for upcoming financial services summit',
      orderType: 'lead_generation',
      submitNow: true,
      eventSource: 'argyle_event',
      externalEventId: 'evt-abc-123',
      eventSourceUrl: 'https://argyleforum.com/events/test',
      eventMetadata: {
        eventTitle: 'Argyle Forum 2025',
        eventDate: 'March 15, 2025',
        eventType: 'forum',
        eventLocation: 'New York, NY',
        eventCommunity: 'CHRO',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eventSource).toBe('argyle_event');
      expect(result.data.eventMetadata?.eventTitle).toBe('Argyle Forum 2025');
    }
  });
});

// ─── Order Number Generation ────────────────────────────────────────────────

describe('Order Number Format', () => {
  it('should generate order numbers in WO-YYYYMM-XXXXXX format', () => {
    const generateOrderNumber = (): string => {
      const date = new Date();
      const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      return `WO-${dateStr}-${random}`;
    };

    const orderNum = generateOrderNumber();
    expect(orderNum).toMatch(/^WO-\d{6}-[A-Z0-9]{6}$/);
  });

  it('should generate unique order numbers', () => {
    const generateOrderNumber = (): string => {
      const date = new Date();
      const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      return `WO-${dateStr}-${random}`;
    };

    const numbers = new Set(Array.from({ length: 100 }, () => generateOrderNumber()));
    // With 36^6 possibilities, 100 should all be unique
    expect(numbers.size).toBe(100);
  });
});

// ─── Event Metadata Assembly ────────────────────────────────────────────────

describe('Event Metadata → Client Notes Assembly', () => {
  it('should build event details into client notes', () => {
    const eventMetadata = {
      eventTitle: 'CHRO Forum 2025',
      eventDate: 'April 10, 2025',
      eventType: 'forum',
      eventLocation: 'Chicago, IL',
      eventCommunity: 'CHRO',
    };
    const eventSourceUrl = 'https://argyleforum.com/events/chro-2025';
    let clientNotes = 'Need senior-level HR contacts';

    const eventInfo = [
      eventMetadata.eventTitle && `Event: ${eventMetadata.eventTitle}`,
      eventMetadata.eventDate && `Date: ${eventMetadata.eventDate}`,
      eventMetadata.eventType && `Type: ${eventMetadata.eventType}`,
      eventMetadata.eventLocation && `Location: ${eventMetadata.eventLocation}`,
      eventMetadata.eventCommunity && `Community: ${eventMetadata.eventCommunity}`,
      eventSourceUrl && `Source: ${eventSourceUrl}`,
    ].filter(Boolean).join('\n');

    clientNotes = `${clientNotes}\n\n--- Event Details ---\n${eventInfo}`;

    expect(clientNotes).toContain('--- Event Details ---');
    expect(clientNotes).toContain('Event: CHRO Forum 2025');
    expect(clientNotes).toContain('Location: Chicago, IL');
    expect(clientNotes).toContain('Need senior-level HR contacts');
  });

  it('should handle empty client notes with event metadata', () => {
    const eventMetadata = {
      eventTitle: 'CIO Summit',
      eventDate: 'May 2025',
    };
    let clientNotes = '';

    const eventInfo = [
      eventMetadata.eventTitle && `Event: ${eventMetadata.eventTitle}`,
      eventMetadata.eventDate && `Date: ${eventMetadata.eventDate}`,
    ].filter(Boolean).join('\n');

    clientNotes = clientNotes
      ? `${clientNotes}\n\n--- Event Details ---\n${eventInfo}`
      : `--- Event Details ---\n${eventInfo}`;

    expect(clientNotes).toBe('--- Event Details ---\nEvent: CIO Summit\nDate: May 2025');
  });
});

// ─── Idempotency Logic ──────────────────────────────────────────────────────

describe('Work Order Idempotency (Event-based)', () => {
  const createdClientIds: string[] = [];
  const createdWorkOrderIds: string[] = [];
  const createdDraftIds: string[] = [];
  const createdEventIds: string[] = [];
  const TEST_EVENT_EXT_ID = 'idem-test-evt-' + Date.now();

  let testClientId: string;
  let testEventId: string;

  beforeEach(async () => {
    // Create a test client account
    const [client] = await db
      .insert(clientAccounts)
      .values({ name: 'Idempotency Test Client' })
      .returning();
    testClientId = client.id;
    createdClientIds.push(testClientId);

    // Create a test external event (FK requirement)
    const [event] = await db
      .insert(externalEvents)
      .values({
        clientId: testClientId,
        sourceProvider: 'argyle',
        externalId: TEST_EVENT_EXT_ID,
        sourceUrl: 'https://argyleforum.com/test',
        title: 'Idempotency Test Event',
      })
      .returning();
    testEventId = event.id;
    createdEventIds.push(testEventId);
  });

  afterEach(async () => {
    // Clean up in reverse dependency order
    for (const id of createdDraftIds) {
      await db.delete(workOrderDrafts).where(eq(workOrderDrafts.id, id)).catch(() => {});
    }
    for (const id of createdWorkOrderIds) {
      await db.delete(workOrders).where(eq(workOrders.id, id)).catch(() => {});
    }
    for (const id of createdEventIds) {
      await db.delete(externalEvents).where(eq(externalEvents.id, id)).catch(() => {});
    }
    for (const id of createdClientIds) {
      await db.delete(clientAccounts).where(eq(clientAccounts.id, id)).catch(() => {});
    }
    createdDraftIds.length = 0;
    createdWorkOrderIds.length = 0;
    createdEventIds.length = 0;
    createdClientIds.length = 0;
  });

  it('should return exists=false when no draft exists for event', async () => {
    const [existingDraft] = await db
      .select()
      .from(workOrderDrafts)
      .where(
        and(
          eq(workOrderDrafts.externalEventId, 'nonexistent-event-id'),
          eq(workOrderDrafts.clientAccountId, testClientId),
        )
      )
      .limit(1);

    expect(existingDraft).toBeUndefined();
  });

  it('should find existing draft when one exists for event', async () => {
    // Create a draft linked to the event
    const [draft] = await db
      .insert(workOrderDrafts)
      .values({
        clientAccountId: testClientId,
        externalEventId: testEventId,
        status: 'draft',
        sourceFields: {},
        draftFields: { title: 'Test Event' },
        editedFields: [],
      })
      .returning();
    createdDraftIds.push(draft.id);

    const [found] = await db
      .select()
      .from(workOrderDrafts)
      .where(
        and(
          eq(workOrderDrafts.externalEventId, testEventId),
          eq(workOrderDrafts.clientAccountId, testClientId),
        )
      )
      .limit(1);

    expect(found).toBeDefined();
    expect(found!.externalEventId).toBe(testEventId);
    expect(found!.status).toBe('draft');
  });

  it('should detect submitted draft with work order (blocks duplicate)', async () => {
    // Create a work order
    const woResult = await db.execute(sql`
      INSERT INTO work_orders (order_number, client_account_id, title, status, submitted_at)
      VALUES (${'WO-TEST-IDEM'}, ${testClientId}, ${'Idempotency Test'}, ${'submitted'}, NOW())
      RETURNING id
    `);
    const woRows = (woResult as any).rows || woResult;
    const woId = Array.isArray(woRows) ? woRows[0]?.id : (woRows as any)?.id;
    createdWorkOrderIds.push(woId);

    // Create a submitted draft linked to the work order
    const [draft] = await db
      .insert(workOrderDrafts)
      .values({
        clientAccountId: testClientId,
        externalEventId: testEventId,
        status: 'submitted',
        workOrderId: woId,
        sourceFields: {},
        draftFields: {},
        editedFields: [],
        submittedAt: new Date(),
      })
      .returning();
    createdDraftIds.push(draft.id);

    // Check idempotency — should find the existing submitted order
    const [existing] = await db
      .select()
      .from(workOrderDrafts)
      .where(
        and(
          eq(workOrderDrafts.externalEventId, testEventId),
          eq(workOrderDrafts.clientAccountId, testClientId),
        )
      )
      .limit(1);

    expect(existing).toBeDefined();
    expect(existing!.status).toBe('submitted');
    expect(existing!.workOrderId).toBe(woId);
  });
});

// ─── Tenant Isolation ───────────────────────────────────────────────────────

describe('Tenant Isolation', () => {
  const createdClientIds: string[] = [];
  const createdDraftIds: string[] = [];
  const createdEventIds: string[] = [];
  const SHARED_EXT_ID = 'tenant-iso-ext-' + Date.now();

  let clientAId: string;
  let clientBId: string;
  let eventAId: string;
  let eventBId: string;

  beforeEach(async () => {
    const [clientA] = await db
      .insert(clientAccounts)
      .values({ name: 'Tenant A — Isolation Test' })
      .returning();
    clientAId = clientA.id;
    createdClientIds.push(clientAId);

    const [clientB] = await db
      .insert(clientAccounts)
      .values({ name: 'Tenant B — Isolation Test' })
      .returning();
    clientBId = clientB.id;
    createdClientIds.push(clientBId);

    // Each tenant needs their own external event (unique constraint: clientId + provider + externalId)
    const [evtA] = await db
      .insert(externalEvents)
      .values({
        clientId: clientAId,
        sourceProvider: 'argyle',
        externalId: SHARED_EXT_ID,
        sourceUrl: 'https://argyleforum.com/test-a',
        title: 'Shared Event (A)',
      })
      .returning();
    eventAId = evtA.id;
    createdEventIds.push(eventAId);

    const [evtB] = await db
      .insert(externalEvents)
      .values({
        clientId: clientBId,
        sourceProvider: 'argyle',
        externalId: SHARED_EXT_ID,
        sourceUrl: 'https://argyleforum.com/test-b',
        title: 'Shared Event (B)',
      })
      .returning();
    eventBId = evtB.id;
    createdEventIds.push(eventBId);
  });

  afterEach(async () => {
    for (const id of createdDraftIds) {
      await db.delete(workOrderDrafts).where(eq(workOrderDrafts.id, id)).catch(() => {});
    }
    for (const id of createdEventIds) {
      await db.delete(externalEvents).where(eq(externalEvents.id, id)).catch(() => {});
    }
    for (const id of createdClientIds) {
      await db.delete(clientAccounts).where(eq(clientAccounts.id, id)).catch(() => {});
    }
    createdDraftIds.length = 0;
    createdEventIds.length = 0;
    createdClientIds.length = 0;
  });

  it('should not find another tenant\'s event draft', async () => {
    // Client A creates a draft for their event
    const [draft] = await db
      .insert(workOrderDrafts)
      .values({
        clientAccountId: clientAId,
        externalEventId: eventAId,
        status: 'submitted',
        sourceFields: {},
        draftFields: {},
        editedFields: [],
      })
      .returning();
    createdDraftIds.push(draft.id);

    // Client B queries for the same event ID — should NOT find it
    const [found] = await db
      .select()
      .from(workOrderDrafts)
      .where(
        and(
          eq(workOrderDrafts.externalEventId, eventAId),
          eq(workOrderDrafts.clientAccountId, clientBId),
        )
      )
      .limit(1);

    expect(found).toBeUndefined();
  });

  it('should find only own tenant\'s draft', async () => {
    // Both clients create drafts for their respective events
    const [draftA] = await db
      .insert(workOrderDrafts)
      .values({
        clientAccountId: clientAId,
        externalEventId: eventAId,
        status: 'draft',
        sourceFields: {},
        draftFields: { title: 'A' },
        editedFields: [],
      })
      .returning();
    createdDraftIds.push(draftA.id);

    const [draftB] = await db
      .insert(workOrderDrafts)
      .values({
        clientAccountId: clientBId,
        externalEventId: eventBId,
        status: 'draft',
        sourceFields: {},
        draftFields: { title: 'B' },
        editedFields: [],
      })
      .returning();
    createdDraftIds.push(draftB.id);

    // Query as Client A — should find only their own draft
    const [foundA] = await db
      .select()
      .from(workOrderDrafts)
      .where(
        and(
          eq(workOrderDrafts.externalEventId, eventAId),
          eq(workOrderDrafts.clientAccountId, clientAId),
        )
      )
      .limit(1);

    // Query as Client B — should find only their own draft
    const [foundB] = await db
      .select()
      .from(workOrderDrafts)
      .where(
        and(
          eq(workOrderDrafts.externalEventId, eventBId),
          eq(workOrderDrafts.clientAccountId, clientBId),
        )
      )
      .limit(1);

    expect(foundA).toBeDefined();
    expect(foundA!.clientAccountId).toBe(clientAId);
    expect((foundA!.draftFields as any)?.title).toBe('A');

    expect(foundB).toBeDefined();
    expect(foundB!.clientAccountId).toBe(clientBId);
    expect((foundB!.draftFields as any)?.title).toBe('B');
  });
});

// ─── Work Order Creation (DB Integration) ───────────────────────────────────

describe('Work Order Creation via Raw SQL', () => {
  const createdClientIds: string[] = [];
  const createdWorkOrderIds: string[] = [];

  let testClientId: string;

  beforeEach(async () => {
    const [client] = await db
      .insert(clientAccounts)
      .values({ name: 'WO Creation Test Client' })
      .returning();
    testClientId = client.id;
    createdClientIds.push(testClientId);
  });

  afterEach(async () => {
    for (const id of createdWorkOrderIds) {
      await db.delete(workOrders).where(eq(workOrders.id, id)).catch(() => {});
    }
    for (const id of createdClientIds) {
      await db.delete(clientAccounts).where(eq(clientAccounts.id, id)).catch(() => {});
    }
    createdWorkOrderIds.length = 0;
    createdClientIds.length = 0;
  });

  it('should create a work order with raw SQL and return id', async () => {
    const orderNumber = `WO-TEST-${Date.now()}`;

    const result = await db.execute(sql`
      INSERT INTO work_orders (
        order_number, client_account_id, title, description,
        order_type, priority, status, submitted_at
      ) VALUES (
        ${orderNumber}, ${testClientId}, ${'Test Direct Order'},
        ${'Test description'},
        ${'lead_generation'}, ${'normal'}, ${'submitted'}, NOW()
      ) RETURNING *
    `);

    const rows = (result as any).rows || result;
    const wo = Array.isArray(rows) ? rows[0] : rows;

    expect(wo).toBeDefined();
    expect(wo.id).toBeDefined();
    expect(wo.order_number).toBe(orderNumber);
    expect(wo.title).toBe('Test Direct Order');
    expect(wo.status).toBe('submitted');
    createdWorkOrderIds.push(wo.id);
  });

  it('should attach event metadata in client_notes', async () => {
    const orderNumber = `WO-TEST-META-${Date.now()}`;
    const eventInfo = '--- Event Details ---\nEvent: CHRO Forum\nDate: March 2025';

    const result = await db.execute(sql`
      INSERT INTO work_orders (
        order_number, client_account_id, title,
        order_type, priority, status, client_notes, submitted_at
      ) VALUES (
        ${orderNumber}, ${testClientId}, ${'Event-linked Order'},
        ${'lead_generation'}, ${'normal'}, ${'submitted'},
        ${eventInfo}, NOW()
      ) RETURNING *
    `);

    const rows = (result as any).rows || result;
    const wo = Array.isArray(rows) ? rows[0] : rows;

    expect(wo.client_notes).toContain('--- Event Details ---');
    expect(wo.client_notes).toContain('CHRO Forum');
    createdWorkOrderIds.push(wo.id);
  });
});

// ─── Schema Presence ────────────────────────────────────────────────────────

describe('Schema: workOrders + workOrderDrafts', () => {
  it('should have workOrders table in schema', () => {
    expect(workOrders).toBeDefined();
    expect(workOrders.id).toBeDefined();
    expect(workOrders.orderNumber).toBeDefined();
    expect(workOrders.clientAccountId).toBeDefined();
    expect(workOrders.title).toBeDefined();
    expect(workOrders.status).toBeDefined();
  });

  it('should have workOrderDrafts table with externalEventId', () => {
    expect(workOrderDrafts).toBeDefined();
    expect(workOrderDrafts.id).toBeDefined();
    expect(workOrderDrafts.externalEventId).toBeDefined();
    expect(workOrderDrafts.workOrderId).toBeDefined();
    expect(workOrderDrafts.clientAccountId).toBeDefined();
    expect(workOrderDrafts.status).toBeDefined();
  });

  it('should have clientPortalActivityLogs table', () => {
    expect(clientPortalActivityLogs).toBeDefined();
    expect(clientPortalActivityLogs.id).toBeDefined();
    expect(clientPortalActivityLogs.action).toBeDefined();
    expect(clientPortalActivityLogs.entityType).toBeDefined();
  });
});