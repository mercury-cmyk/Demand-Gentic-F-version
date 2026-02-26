import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index';
import { db } from '../../db';
import { clientAccounts, clientProjects } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

describe('Campaign API Endpoints', () => {
  let authToken: string;
  let campaignId: string;
  let senderProfileId: string;
  let clientAccountId: string;
  let projectId: string;

  beforeAll(async () => {
    const [clientAccount] = await db
      .insert(clientAccounts)
      .values({ name: 'Test Client Account' })
      .returning();

    clientAccountId = clientAccount.id;

    const [clientProject] = await db
      .insert(clientProjects)
      .values({
        clientAccountId,
        name: 'Test Client Project',
      })
      .returning();

    projectId = clientProject.id;
  });

  afterAll(async () => {
    if (projectId) {
      await db.delete(clientProjects).where(eq(clientProjects.id, projectId));
    }
    if (clientAccountId) {
      await db.delete(clientAccounts).where(eq(clientAccounts.id, clientAccountId));
    }
  });

  beforeEach(async () => {
    // Setup: Create test user and get auth token
    authToken = 'test-token';
    senderProfileId = 'profile-1';
  });

  describe('GET /api/sender-profiles', () => {
    it('should return list of sender profiles', async () => {
      const response = await request(app)
        .get('/api/sender-profiles')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('email');
      expect(response.body[0]).toHaveProperty('verified');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/sender-profiles');

      expect(response.status).toBe(401);
    });

    it('should filter by verified status if query provided', async () => {
      const response = await request(app)
        .get('/api/sender-profiles?verified=true')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      response.body.forEach((profile: any) => {
        expect(profile.verified).toBe(true);
      });
    });
  });

  describe('GET /api/email-templates', () => {
    it('should return list of email templates', async () => {
      const response = await request(app)
        .get('/api/email-templates')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('id');
        expect(response.body[0]).toHaveProperty('name');
        expect(response.body[0]).toHaveProperty('subject');
        expect(response.body[0]).toHaveProperty('htmlContent');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/email-templates');

      expect(response.status).toBe(401);
    });

    it('should support category filtering', async () => {
      const response = await request(app)
        .get('/api/email-templates?category=welcome')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      response.body.forEach((template: any) => {
        expect(template.category).toBe('welcome');
      });
    });

    it('should support search by name', async () => {
      const response = await request(app)
        .get('/api/email-templates?search=Welcome')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      response.body.forEach((template: any) => {
        expect(template.name.toLowerCase()).toContain('welcome');
      });
    });
  });

  describe('POST /api/campaigns/send-test', () => {
    it('should send test email successfully', async () => {
      const response = await request(app)
        .post('/api/campaigns/send-test')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['test@example.com'],
          subject: 'Test Subject',
          html: '<html><body>Hello {{first_name}}!</body></html>',
          senderProfileId: senderProfileId
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('sent');
    });

    it('should validate email addresses', async () => {
      const response = await request(app)
        .post('/api/campaigns/send-test')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['invalid-email'],
          subject: 'Test',
          html: '<html></html>',
          senderProfileId: senderProfileId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('invalid');
    });

    it('should validate sender profile', async () => {
      const response = await request(app)
        .post('/api/campaigns/send-test')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['test@example.com'],
          subject: 'Test',
          html: '<html></html>',
          senderProfileId: 'non-existent'
        });

      expect(response.status).toBe(404);
    });

    it('should require all fields', async () => {
      const response = await request(app)
        .post('/api/campaigns/send-test')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['test@example.com']
          // Missing subject, html, senderProfileId
        });

      expect(response.status).toBe(400);
    });

    it('should perform personalization replacement', async () => {
      const response = await request(app)
        .post('/api/campaigns/send-test')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emails: ['john@example.com'],
          subject: 'Hello {{first_name}}',
          html: '<html><body>Welcome {{first_name}} from {{company}}!</body></html>',
          senderProfileId: senderProfileId,
          personalizationData: {
            'john@example.com': {
              first_name: 'John',
              company: 'Acme'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/campaigns', () => {
    it('should create campaign with all required fields', async () => {
      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Campaign',
          type: 'email',
          status: 'active',
          clientAccountId,
          projectId,
          audienceRefs: {
            segments: ['segment-1']
          },
          emailSubject: 'Test Subject',
          emailHtmlContent: '<html><body>Hello {{first_name}}!</body></html>',
          emailPreheader: 'Test preview',
          senderProfileId: senderProfileId
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Campaign');
      expect(response.body.type).toBe('email');
      expect(response.body.status).toBe('active');
      campaignId = response.body.id;
    });

    it('should save campaign as draft', async () => {
      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Draft Campaign',
          type: 'email',
          status: 'draft',
          clientAccountId,
          projectId,
          audienceRefs: {},
          emailSubject: 'Subject',
          emailHtmlContent: '<html></html>',
          senderProfileId: senderProfileId
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('draft');
    });

    it('should validate audience references', async () => {
      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test',
          type: 'email',
          status: 'active',
          clientAccountId,
          projectId,
          audienceRefs: {}, // Empty audience
          emailSubject: 'Subject',
          emailHtmlContent: '<html></html>',
          senderProfileId: senderProfileId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('audience');
    });

    it('should require email subject', async () => {
      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test',
          type: 'email',
          status: 'active',
          clientAccountId,
          projectId,
          audienceRefs: { segments: ['seg-1'] },
          // Missing emailSubject
          emailHtmlContent: '<html></html>',
          senderProfileId: senderProfileId
        });

      expect(response.status).toBe(400);
    });

    it('should require email HTML content', async () => {
      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test',
          type: 'email',
          status: 'active',
          clientAccountId,
          projectId,
          audienceRefs: { segments: ['seg-1'] },
          emailSubject: 'Subject',
          // Missing emailHtmlContent
          senderProfileId: senderProfileId
        });

      expect(response.status).toBe(400);
    });

    it('should store scheduling config if provided', async () => {
      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Scheduled Campaign',
          type: 'email',
          status: 'active',
          clientAccountId,
          projectId,
          audienceRefs: { segments: ['seg-1'] },
          emailSubject: 'Subject',
          emailHtmlContent: '<html></html>',
          senderProfileId: senderProfileId,
          scheduleJson: {
            type: 'scheduled',
            date: '2025-01-15',
            time: '09:00',
            timezone: 'America/New_York'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.scheduleJson).toBeDefined();
    });
  });

  describe('POST /api/campaigns/:id/send', () => {
    beforeEach(async () => {
      // Create a campaign first
      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Campaign to Send',
          type: 'email',
          status: 'active',
          clientAccountId,
          projectId,
          audienceRefs: { segments: ['segment-1'] },
          emailSubject: 'Subject',
          emailHtmlContent: '<html></html>',
          senderProfileId: senderProfileId
        });

      campaignId = response.body.id;
    });

    it('should send campaign successfully', async () => {
      const response = await request(app)
        .post(`/api/campaigns/${campaignId}/send`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.campaignId).toBe(campaignId);
    });

    it('should return error for non-existent campaign', async () => {
      const response = await request(app)
        .post('/api/campaigns/non-existent/send')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should queue emails in BullMQ', async () => {
      const response = await request(app)
        .post(`/api/campaigns/${campaignId}/send`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Queue should be created
      expect(response.body.queued).toBeGreaterThan(0);
    });

    it('should not allow sending draft campaigns', async () => {
      const draftResponse = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Draft Campaign',
          type: 'email',
          status: 'draft',
          clientAccountId,
          projectId,
          audienceRefs: { segments: ['seg-1'] },
          emailSubject: 'Subject',
          emailHtmlContent: '<html></html>',
          senderProfileId: senderProfileId
        });

      const draftId = draftResponse.body.id;

      const sendResponse = await request(app)
        .post(`/api/campaigns/${draftId}/send`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(sendResponse.status).toBe(400);
      expect(sendResponse.body.error).toContain('draft');
    });
  });

  describe('Email Rendering', () => {
    it('should replace personalization tokens', async () => {
      // Test token replacement
    });

    it('should inject tracking pixels', async () => {
      // Test tracking pixel injection
    });

    it('should wrap links with tracking', async () => {
      // Test link tracking setup
    });

    it('should add compliance footer', async () => {
      // Test compliance footer generation
    });

    it('should generate plaintext version', async () => {
      // Test plaintext conversion
    });
  });

  describe('Performance Tests', () => {
    it('should respond within SLA (< 200ms)', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/api/sender-profiles')
        .set('Authorization', `Bearer ${authToken}`);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(200);
    });

    it('should handle bulk email processing', async () => {
      const start = Date.now();
      
      // Send campaign with 1000+ contacts
      const response = await request(app)
        .post(`/api/campaigns/${campaignId}/send`)
        .set('Authorization', `Bearer ${authToken}`);

      const duration = Date.now() - start;
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});
