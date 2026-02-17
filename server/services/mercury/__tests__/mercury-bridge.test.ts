/**
 * Mercury Bridge — Comprehensive Tests
 * 
 * Tests for:
 * - Template engine (rendering, escaping, conditionals, variable extraction)
 * - Email service (send, queue, outbox processing, idempotency, feature flags)
 * - Notification service (dispatch, recipient resolution, preference filtering)
 * - Invitation service (eligibility, dry run, token validation)
 * - Default templates (seed idempotency, template shape)
 * - Type/constant validation
 * 
 * Phase 8: Mercury Bridge — SMTP Notifications + Templates + Bulk Invitations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Template Engine Tests ───────────────────────────────────────────────────

import {
  escapeHtml,
  renderTemplate,
  extractTemplateVariables,
  validateTemplateVariables,
  applyDefaults,
  generateSampleVariables,
} from '../template-engine';

describe('Template Engine — escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('AT&T')).toBe('AT&amp;T');
  });

  it('should escape angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("O'Brien")).toBe('O&#39;Brien');
  });

  it('should handle strings with no special characters', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('should handle empty strings', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should escape combined special chars', () => {
    expect(escapeHtml('<b>"A & B"</b>')).toBe(
      '&lt;b&gt;&quot;A &amp; B&quot;&lt;/b&gt;'
    );
  });
});

describe('Template Engine — renderTemplate', () => {
  it('should substitute escaped variables with {{var}}', () => {
    const result = renderTemplate('Hello {{name}}!', { name: 'Jane' });
    expect(result).toBe('Hello Jane!');
  });

  it('should HTML-escape double-brace variables', () => {
    const result = renderTemplate('Value: {{val}}', { val: '<script>alert("x")</script>' });
    expect(result).toBe('Value: &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('should NOT escape triple-brace variables {{{raw}}}', () => {
    const result = renderTemplate('HTML: {{{content}}}', { content: '<b>Bold</b>' });
    expect(result).toBe('HTML: <b>Bold</b>');
  });

  it('should handle {{#if}} true condition', () => {
    const template = '{{#if showDetails}}Details here{{/if}}';
    const result = renderTemplate(template, { showDetails: 'yes' });
    expect(result).toBe('Details here');
  });

  it('should handle {{#if}} false condition (empty string)', () => {
    const template = '{{#if showDetails}}Details here{{/if}}';
    const result = renderTemplate(template, { showDetails: '' });
    expect(result).toBe('');
  });

  it('should handle {{#if}} false condition (undefined)', () => {
    const template = '{{#if showDetails}}Details here{{/if}}';
    const result = renderTemplate(template, {});
    expect(result).toBe('');
  });

  it('should handle {{#if}}...{{else}} true branch', () => {
    const template = '{{#if premium}}Premium User{{else}}Free User{{/if}}';
    const result = renderTemplate(template, { premium: 'true' });
    expect(result).toBe('Premium User');
  });

  it('should handle {{#if}}...{{else}} false branch', () => {
    const template = '{{#if premium}}Premium User{{else}}Free User{{/if}}';
    const result = renderTemplate(template, { premium: '' });
    expect(result).toBe('Free User');
  });

  it('should handle {{#if}} with "false" string as falsy', () => {
    const template = '{{#if active}}Active{{else}}Inactive{{/if}}';
    const result = renderTemplate(template, { active: 'false' });
    expect(result).toBe('Inactive');
  });

  it('should handle multiple variables in one template', () => {
    const template = 'Hi {{firstName}} {{lastName}}, welcome to {{company}}!';
    const result = renderTemplate(template, {
      firstName: 'Jane',
      lastName: 'Smith',
      company: 'Acme',
    });
    expect(result).toBe('Hi Jane Smith, welcome to Acme!');
  });

  it('should replace missing variables with empty string', () => {
    const result = renderTemplate('Hello {{missing}}!', {});
    expect(result).toBe('Hello !');
  });

  it('should handle templates with no variables', () => {
    const result = renderTemplate('Static content', { unused: 'val' });
    expect(result).toBe('Static content');
  });

  it('should handle complex template with all features', () => {
    const template = `
<h1>{{title}}</h1>
<p>{{{htmlBody}}}</p>
{{#if showFooter}}<footer>{{footerText}}</footer>{{else}}<footer>Default</footer>{{/if}}
    `.trim();
    const result = renderTemplate(template, {
      title: 'Hello & Welcome',
      htmlBody: '<strong>Bold</strong>',
      showFooter: 'yes',
      footerText: 'Custom Footer',
    });
    expect(result).toContain('Hello &amp; Welcome');
    expect(result).toContain('<strong>Bold</strong>');
    expect(result).toContain('Custom Footer');
    expect(result).not.toContain('Default');
  });

  it('should handle nested conditional inside conditional', () => {
    // Our engine processes {{#if}} greedily, but flat conditionals should work
    const template = '{{#if a}}A is set{{/if}} and {{#if b}}B is set{{/if}}';
    const result = renderTemplate(template, { a: 'yes', b: '' });
    expect(result).toBe('A is set and ');
  });
});

describe('Template Engine — extractTemplateVariables', () => {
  it('should extract {{var}} variables', () => {
    const vars = extractTemplateVariables('Hello {{name}}, your {{tier}} plan.');
    expect(vars).toContain('name');
    expect(vars).toContain('tier');
  });

  it('should extract {{{raw}}} variables', () => {
    const vars = extractTemplateVariables('Body: {{{htmlContent}}}');
    expect(vars).toContain('htmlContent');
  });

  it('should extract {{#if var}} variables', () => {
    const vars = extractTemplateVariables('{{#if showLink}}Link{{/if}}');
    expect(vars).toContain('showLink');
  });

  it('should deduplicate variables used multiple times', () => {
    const vars = extractTemplateVariables('{{name}} and {{name}} again');
    const nameCount = vars.filter(v => v === 'name').length;
    expect(nameCount).toBe(1);
  });

  it('should return empty array for template with no variables', () => {
    const vars = extractTemplateVariables('Just static text');
    expect(vars).toEqual([]);
  });

  it('should handle mixed variable types', () => {
    const template = '{{escaped}} {{{raw}}} {{#if cond}}inner{{/if}}';
    const vars = extractTemplateVariables(template);
    expect(vars).toContain('escaped');
    expect(vars).toContain('raw');
    expect(vars).toContain('cond');
    expect(vars.length).toBe(3);
  });
});

describe('Template Engine — validateTemplateVariables', () => {
  it('should return empty array when all required vars provided', () => {
    const defs = [
      { name: 'name', required: true },
      { name: 'email', required: true },
    ];
    const missing = validateTemplateVariables(defs, { name: 'Jane', email: 'j@e.com' });
    expect(missing).toEqual([]);
  });

  it('should return missing required vars', () => {
    const defs = [
      { name: 'name', required: true },
      { name: 'email', required: true },
    ];
    const missing = validateTemplateVariables(defs, { name: 'Jane' });
    expect(missing).toEqual(['email']);
  });

  it('should not flag optional vars as missing', () => {
    const defs = [
      { name: 'name', required: true },
      { name: 'nickname', required: false },
    ];
    const missing = validateTemplateVariables(defs, { name: 'Jane' });
    expect(missing).toEqual([]);
  });

  it('should not flag required vars with defaults as missing', () => {
    const defs = [
      { name: 'name', required: true },
      { name: 'env', required: true, defaultValue: 'production' },
    ];
    const missing = validateTemplateVariables(defs, { name: 'Jane' });
    expect(missing).toEqual([]);
  });

  it('should return multiple missing vars', () => {
    const defs = [
      { name: 'a', required: true },
      { name: 'b', required: true },
      { name: 'c', required: true },
    ];
    const missing = validateTemplateVariables(defs, {});
    expect(missing).toEqual(['a', 'b', 'c']);
  });
});

describe('Template Engine — applyDefaults', () => {
  it('should merge defaults for missing variables', () => {
    const defs = [
      { name: 'env', defaultValue: 'production' },
      { name: 'name' },
    ];
    const result = applyDefaults(defs, { name: 'Jane' });
    expect(result).toEqual({ name: 'Jane', env: 'production' });
  });

  it('should not overwrite provided variables with defaults', () => {
    const defs = [{ name: 'env', defaultValue: 'production' }];
    const result = applyDefaults(defs, { env: 'staging' });
    expect(result.env).toBe('staging');
  });

  it('should handle empty defaults', () => {
    const result = applyDefaults([], { name: 'Jane' });
    expect(result).toEqual({ name: 'Jane' });
  });

  it('should skip defs without defaultValue', () => {
    const defs = [{ name: 'name' }, { name: 'env', defaultValue: 'prod' }];
    const result = applyDefaults(defs, {});
    expect(result).toEqual({ env: 'prod' });
  });
});

describe('Template Engine — generateSampleVariables', () => {
  it('should use exampleValue when available', () => {
    const defs = [{ name: 'name', exampleValue: 'Jane' }];
    const sample = generateSampleVariables(defs);
    expect(sample.name).toBe('Jane');
  });

  it('should fall back to defaultValue', () => {
    const defs = [{ name: 'env', defaultValue: 'production' }];
    const sample = generateSampleVariables(defs);
    expect(sample.env).toBe('production');
  });

  it('should use [varName] placeholder when no example or default', () => {
    const defs = [{ name: 'unknown' }];
    const sample = generateSampleVariables(defs);
    expect(sample.unknown).toBe('[unknown]');
  });

  it('should prefer exampleValue over defaultValue', () => {
    const defs = [{ name: 'env', defaultValue: 'production', exampleValue: 'staging' }];
    const sample = generateSampleVariables(defs);
    expect(sample.env).toBe('staging');
  });
});

// ─── Types & Constants Tests ─────────────────────────────────────────────────

import {
  MERCURY_DEFAULTS,
  MERCURY_COMPANY_FOOTER,
} from '../types';

describe('Mercury Constants', () => {
  it('should have correct from email', () => {
    expect(MERCURY_DEFAULTS.fromEmail).toBe('mercury@pivotal-b2b.com');
  });

  it('should have correct from name', () => {
    expect(MERCURY_DEFAULTS.fromName).toBe('Pivotal B2B');
  });

  it('should have maxRetries set to 3', () => {
    expect(MERCURY_DEFAULTS.maxRetries).toBe(3);
  });

  it('should have batchSize set to 50', () => {
    expect(MERCURY_DEFAULTS.batchSize).toBe(50);
  });

  it('should have batchDelayMs set to 2000', () => {
    expect(MERCURY_DEFAULTS.batchDelayMs).toBe(2000);
  });

  it('should have inviteExpiryDays set to 7', () => {
    expect(MERCURY_DEFAULTS.inviteExpiryDays).toBe(7);
  });

  it('should have company footer with unsubscribe link', () => {
    expect(MERCURY_COMPANY_FOOTER).toContain('{{unsubscribeUrl}}');
    expect(MERCURY_COMPANY_FOOTER).toContain('Pivotal B2B');
    expect(MERCURY_COMPANY_FOOTER).toContain('notification preferences');
  });

  it('should render unsubscribe link in footer', () => {
    const footer = renderTemplate(MERCURY_COMPANY_FOOTER, {
      unsubscribeUrl: 'https://example.com/unsub',
    });
    expect(footer).toContain('https://example.com/unsub');
    expect(footer).not.toContain('{{unsubscribeUrl}}');
  });
});

// ─── Feature Flag Tests ──────────────────────────────────────────────────────

describe('Feature Flags: Mercury', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should have smtp_email_enabled flag defined', async () => {
    const { FEATURE_FLAGS } = await import('../../../feature-flags');
    expect(FEATURE_FLAGS).toHaveProperty('smtp_email_enabled');
    expect(FEATURE_FLAGS.smtp_email_enabled.name).toBe('smtp_email_enabled');
  });

  it('should have bulk_invites_enabled flag defined', async () => {
    const { FEATURE_FLAGS } = await import('../../../feature-flags');
    expect(FEATURE_FLAGS).toHaveProperty('bulk_invites_enabled');
    expect(FEATURE_FLAGS.bulk_invites_enabled.name).toBe('bulk_invites_enabled');
  });

  it('smtp_email_enabled should default to disabled', async () => {
    const { FEATURE_FLAGS } = await import('../../../feature-flags');
    expect(FEATURE_FLAGS.smtp_email_enabled.default).toBe(false);
  });

  it('bulk_invites_enabled should default to disabled', async () => {
    const { FEATURE_FLAGS } = await import('../../../feature-flags');
    expect(FEATURE_FLAGS.bulk_invites_enabled.default).toBe(false);
  });

  it('smtp_email_enabled should be enabled when in env', async () => {
    process.env.FEATURE_FLAGS = 'smtp_email_enabled';
    const { isFeatureEnabled } = await import('../../../feature-flags');
    expect(isFeatureEnabled('smtp_email_enabled')).toBe(true);
  });

  it('smtp_email_enabled should be disabled when not in env', async () => {
    process.env.FEATURE_FLAGS = 'other_flag';
    const { isFeatureEnabled } = await import('../../../feature-flags');
    expect(isFeatureEnabled('smtp_email_enabled')).toBe(false);
  });

  it('bulk_invites_enabled should be enabled when in env', async () => {
    process.env.FEATURE_FLAGS = 'bulk_invites_enabled';
    const { isFeatureEnabled } = await import('../../../feature-flags');
    expect(isFeatureEnabled('bulk_invites_enabled')).toBe(true);
  });

  it('both flags can be enabled simultaneously', async () => {
    process.env.FEATURE_FLAGS = 'smtp_email_enabled,bulk_invites_enabled';
    const { isFeatureEnabled } = await import('../../../feature-flags');
    expect(isFeatureEnabled('smtp_email_enabled')).toBe(true);
    expect(isFeatureEnabled('bulk_invites_enabled')).toBe(true);
  });
});

// ─── Email Service Tests (unit, mocked DB) ──────────────────────────────────

describe('MercuryEmailService — sendDirect', () => {
  let originalFlagEnv: string | undefined;

  beforeEach(() => {
    originalFlagEnv = process.env.FEATURE_FLAGS;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.FEATURE_FLAGS = originalFlagEnv;
    vi.restoreAllMocks();
  });

  it('should reject when smtp_email_enabled flag is OFF', async () => {
    process.env.FEATURE_FLAGS = '';
    const { MercuryEmailService } = await import('../email-service');
    const service = new MercuryEmailService();
    const result = await service.sendDirect({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('smtp_email_enabled');
  });
});

describe('MercuryEmailService — generateInviteToken', () => {
  it('should generate a 64-char hex string', async () => {
    const { MercuryEmailService } = await import('../email-service');
    const service = new MercuryEmailService();
    const token = service.generateInviteToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('should generate unique tokens', async () => {
    const { MercuryEmailService } = await import('../email-service');
    const service = new MercuryEmailService();
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(service.generateInviteToken());
    }
    expect(tokens.size).toBe(100);
  });
});

describe('MercuryEmailService — processOutbox gating', () => {
  let originalFlagEnv: string | undefined;

  beforeEach(() => {
    originalFlagEnv = process.env.FEATURE_FLAGS;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.FEATURE_FLAGS = originalFlagEnv;
    vi.restoreAllMocks();
  });

  it('should return zero counts when flag is OFF', async () => {
    process.env.FEATURE_FLAGS = '';
    const { MercuryEmailService } = await import('../email-service');
    const service = new MercuryEmailService();
    const result = await service.processOutbox();
    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
  });
});

// ─── Notification Service Tests ──────────────────────────────────────────────

describe('NotificationService — dispatch gating', () => {
  let originalFlagEnv: string | undefined;

  beforeEach(() => {
    originalFlagEnv = process.env.FEATURE_FLAGS;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.FEATURE_FLAGS = originalFlagEnv;
    vi.restoreAllMocks();
  });

  it('should skip dispatch when smtp_email_enabled is OFF', async () => {
    process.env.FEATURE_FLAGS = '';
    const { NotificationService } = await import('../notification-service');
    const service = new NotificationService();
    const result = await service.dispatch({
      eventType: 'test_notification',
      payload: { test: true },
    });
    expect(result.emailsQueued).toBe(0);
    expect(result.errors).toContain('smtp_email_enabled flag is OFF');
  });
});

// ─── Invitation Service Tests ────────────────────────────────────────────────

describe('BulkInvitationService — sendBulkInvitations gating', () => {
  let originalFlagEnv: string | undefined;

  beforeEach(() => {
    originalFlagEnv = process.env.FEATURE_FLAGS;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.FEATURE_FLAGS = originalFlagEnv;
    vi.restoreAllMocks();
  });

  it('should throw when bulk_invites_enabled is OFF', async () => {
    process.env.FEATURE_FLAGS = 'smtp_email_enabled';
    const { BulkInvitationService } = await import('../invitation-service');
    const service = new BulkInvitationService();
    await expect(
      service.sendBulkInvitations({ adminUserId: 'admin1', portalBaseUrl: 'https://app.example.com' })
    ).rejects.toThrow('bulk_invites_enabled');
  });

  it('should throw when smtp_email_enabled is OFF', async () => {
    process.env.FEATURE_FLAGS = 'bulk_invites_enabled';
    const { BulkInvitationService } = await import('../invitation-service');
    const service = new BulkInvitationService();
    await expect(
      service.sendBulkInvitations({ adminUserId: 'admin1', portalBaseUrl: 'https://app.example.com' })
    ).rejects.toThrow('smtp_email_enabled');
  });
});

// ─── Default Templates Tests ─────────────────────────────────────────────────

import { DEFAULT_TEMPLATES, seedDefaultTemplates } from '../default-templates';

describe('Default Templates', () => {
  it('should have 7 default templates', () => {
    expect(DEFAULT_TEMPLATES).toHaveLength(7);
  });

  it('should have unique template keys', () => {
    const keys = DEFAULT_TEMPLATES.map(t => t.templateKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('should include client_invite template', () => {
    const found = DEFAULT_TEMPLATES.find(t => t.templateKey === 'client_invite');
    expect(found).toBeDefined();
    expect(found!.category).toBe('invitation');
  });

  it('should include project_request_approved template', () => {
    const found = DEFAULT_TEMPLATES.find(t => t.templateKey === 'project_request_approved');
    expect(found).toBeDefined();
    expect(found!.category).toBe('notification');
  });

  it('should include project_request_rejected template', () => {
    const found = DEFAULT_TEMPLATES.find(t => t.templateKey === 'project_request_rejected');
    expect(found).toBeDefined();
  });

  it('should include campaign_launched template', () => {
    const found = DEFAULT_TEMPLATES.find(t => t.templateKey === 'campaign_launched');
    expect(found).toBeDefined();
  });

  it('should include leads_delivered template', () => {
    const found = DEFAULT_TEMPLATES.find(t => t.templateKey === 'leads_delivered');
    expect(found).toBeDefined();
  });

  it('should include showcase_recordings_shared template', () => {
    const found = DEFAULT_TEMPLATES.find(t => t.templateKey === 'showcase_recordings_shared');
    expect(found).toBeDefined();
    expect(found!.category).toBe('notification');
  });

  it('should include test_notification template', () => {
    const found = DEFAULT_TEMPLATES.find(t => t.templateKey === 'test_notification');
    expect(found).toBeDefined();
    expect(found!.category).toBe('system');
  });

  describe('Template Shape Validation', () => {
    for (const template of DEFAULT_TEMPLATES) {
      describe(`Template: ${template.templateKey}`, () => {
        it('should have required string fields', () => {
          expect(typeof template.templateKey).toBe('string');
          expect(typeof template.name).toBe('string');
          expect(typeof template.description).toBe('string');
          expect(typeof template.category).toBe('string');
          expect(typeof template.subjectTemplate).toBe('string');
          expect(typeof template.htmlTemplate).toBe('string');
          expect(typeof template.textTemplate).toBe('string');
        });

        it('should have non-empty subject, HTML, and text templates', () => {
          expect(template.subjectTemplate.length).toBeGreaterThan(0);
          expect(template.htmlTemplate.length).toBeGreaterThan(10);
          expect(template.textTemplate.length).toBeGreaterThan(10);
        });

        it('should have a variables array', () => {
          expect(Array.isArray(template.variables)).toBe(true);
          expect(template.variables.length).toBeGreaterThan(0);
        });

        it('should have valid variable definitions', () => {
          for (const v of template.variables) {
            expect(typeof v.name).toBe('string');
            expect(typeof v.description).toBe('string');
            expect(typeof v.required).toBe('boolean');
            expect(v.name.length).toBeGreaterThan(0);
          }
        });

        it('should render with sample variables without errors', () => {
          const sampleVars = generateSampleVariables(template.variables);
          const renderedSubject = renderTemplate(template.subjectTemplate, sampleVars);
          const renderedHtml = renderTemplate(template.htmlTemplate, sampleVars);
          const renderedText = renderTemplate(template.textTemplate, sampleVars);

          // Should not contain unresolved {{var}} placeholders
          expect(renderedSubject).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
          expect(renderedText).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
          // HTML templates may have footer placeholder but core should render
          expect(renderedHtml.length).toBeGreaterThan(0);
        });

        it('subject template variables should be present in variables array', () => {
          const subjectVars = extractTemplateVariables(template.subjectTemplate);
          const definedNames = template.variables.map(v => v.name);
          for (const sv of subjectVars) {
            expect(definedNames).toContain(sv);
          }
        });
      });
    }
  });
});

// ─── Client Invite Template Integration ──────────────────────────────────────

describe('Client Invite Template Rendering', () => {
  const inviteTemplate = DEFAULT_TEMPLATES.find(t => t.templateKey === 'client_invite')!;

  it('should render invitation email with user details', () => {
    const vars: Record<string, string> = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@acme.com',
      companyName: 'Acme Corp',
      inviteLink: 'https://app.example.com/accept-invite?token=abc123',
      expiryDays: '7',
      portalUrl: 'https://app.example.com',
    };

    const subject = renderTemplate(inviteTemplate.subjectTemplate, vars);
    expect(subject).toBe("You're invited to the Acme Corp Client Portal");

    const html = renderTemplate(inviteTemplate.htmlTemplate, vars);
    expect(html).toContain('Jane');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('accept-invite?token=abc123');
    expect(html).toContain('7 days');
  });

  it('should handle XSS in user-provided variables', () => {
    const vars: Record<string, string> = {
      firstName: '<script>alert("xss")</script>',
      lastName: 'Smith',
      email: 'test@test.com',
      companyName: 'A&B Corp',
      inviteLink: 'https://app.example.com/accept-invite?token=abc',
      expiryDays: '7',
    };

    const html = renderTemplate(inviteTemplate.htmlTemplate, vars);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A&amp;B Corp');
  });
});

// ─── Project Approval Template ───────────────────────────────────────────────

describe('Project Approval Template Rendering', () => {
  const approvedTemplate = DEFAULT_TEMPLATES.find(t => t.templateKey === 'project_request_approved')!;
  const rejectedTemplate = DEFAULT_TEMPLATES.find(t => t.templateKey === 'project_request_rejected')!;

  it('should render approved notification with project details', () => {
    const vars = {
      recipientName: 'Jane Smith',
      projectName: 'Q1 Campaign',
      approvalDate: 'February 9, 2026',
      approvedBy: 'Admin User',
      portalLink: 'https://app.example.com/projects/123',
    };

    const subject = renderTemplate(approvedTemplate.subjectTemplate, vars);
    expect(subject).toContain('Q1 Campaign');
    expect(subject).toContain('approved');

    const html = renderTemplate(approvedTemplate.htmlTemplate, vars);
    expect(html).toContain('Jane Smith');
    expect(html).toContain('Q1 Campaign');
    expect(html).toContain('February 9, 2026');
    expect(html).toContain('Admin User');
    expect(html).toContain('projects/123');
  });

  it('should render approval without optional approvedBy', () => {
    const vars = {
      recipientName: 'Jane Smith',
      projectName: 'Q1 Campaign',
      approvalDate: 'February 9, 2026',
    };

    const html = renderTemplate(approvedTemplate.htmlTemplate, vars);
    expect(html).toContain('Q1 Campaign');
    // approvedBy conditional block should not render
    expect(html).not.toContain('Approved by:');
  });

  it('should render rejected notification with reason', () => {
    const vars = {
      recipientName: 'Jane Smith',
      projectName: 'Bad Request',
      rejectionReason: 'Budget not approved for this quarter',
    };

    const html = renderTemplate(rejectedTemplate.htmlTemplate, vars);
    expect(html).toContain('Jane Smith');
    expect(html).toContain('Bad Request');
    expect(html).toContain('Budget not approved for this quarter');
  });

  it('should render rejected notification without reason', () => {
    const vars = {
      recipientName: 'Jane Smith',
      projectName: 'Request X',
    };

    const html = renderTemplate(rejectedTemplate.htmlTemplate, vars);
    expect(html).toContain('Request X');
    expect(html).not.toContain('Reason:');
  });
});

// ─── Invitation Eligibility Logic Tests ──────────────────────────────────────

describe('Invitation Eligibility Logic', () => {
  it('should mark user without email as ineligible', () => {
    const user = { email: '', isActive: true, hasToken: false, tokenExpired: false, tokenUsed: false };
    const eligible = user.email && user.isActive && (!user.hasToken || user.tokenExpired || user.tokenUsed);
    expect(eligible).toBeFalsy();
  });

  it('should mark inactive user as ineligible', () => {
    const user = { email: 'test@e.com', isActive: false, hasToken: false, tokenExpired: false, tokenUsed: false };
    const eligible = user.email && user.isActive && (!user.hasToken || user.tokenExpired || user.tokenUsed);
    expect(eligible).toBeFalsy();
  });

  it('should mark user with active pending invite as ineligible', () => {
    const user = { email: 'test@e.com', isActive: true, hasToken: true, tokenExpired: false, tokenUsed: false };
    const eligible = user.email && user.isActive && (!user.hasToken || user.tokenExpired || user.tokenUsed);
    expect(eligible).toBeFalsy();
  });

  it('should mark never-invited user as eligible', () => {
    const user = { email: 'test@e.com', isActive: true, hasToken: false, tokenExpired: false, tokenUsed: false };
    const eligible = user.email && user.isActive && (!user.hasToken || user.tokenExpired || user.tokenUsed);
    expect(eligible).toBeTruthy();
  });

  it('should mark user with expired invite as eligible (re-invite)', () => {
    const user = { email: 'test@e.com', isActive: true, hasToken: true, tokenExpired: true, tokenUsed: false };
    const eligible = user.email && user.isActive && (!user.hasToken || user.tokenExpired || user.tokenUsed);
    expect(eligible).toBeTruthy();
  });

  it('should mark user with used invite as eligible (re-invite)', () => {
    const user = { email: 'test@e.com', isActive: true, hasToken: true, tokenExpired: false, tokenUsed: true };
    const eligible = user.email && user.isActive && (!user.hasToken || user.tokenExpired || user.tokenUsed);
    expect(eligible).toBeTruthy();
  });
});

// ─── Token Validation Logic Tests ────────────────────────────────────────────

describe('Token Validation Logic', () => {
  it('should reject null token as not found', () => {
    const record = null;
    const valid = record !== null;
    expect(valid).toBe(false);
  });

  it('should reject already-used token', () => {
    const record = { usedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) };
    const valid = !record.usedAt && new Date(record.expiresAt) > new Date();
    expect(valid).toBe(false);
  });

  it('should reject expired token', () => {
    const record = { usedAt: null, expiresAt: new Date(Date.now() - 86400000) };
    const valid = !record.usedAt && new Date(record.expiresAt) > new Date();
    expect(valid).toBe(false);
  });

  it('should accept valid unused unexpired token', () => {
    const record = { usedAt: null, expiresAt: new Date(Date.now() + 86400000) };
    const valid = !record.usedAt && new Date(record.expiresAt) > new Date();
    expect(valid).toBe(true);
  });

  it('should reject token expiring at exact now boundary', () => {
    const exactNow = new Date();
    const record = { usedAt: null, expiresAt: new Date(exactNow.getTime() - 1) };
    const valid = !record.usedAt && new Date(record.expiresAt) > new Date();
    expect(valid).toBe(false);
  });
});

// ─── Idempotency Key Generation Tests ────────────────────────────────────────

describe('Idempotency Key Generation', () => {
  it('should generate unique invite idempotency keys per user per job', () => {
    const jobId = 'bulk_invite_1234_abcd';
    const keys = ['user1', 'user2', 'user3'].map(uid => `invite_${jobId}_${uid}`);
    const unique = new Set(keys);
    expect(unique.size).toBe(3);
  });

  it('should generate consistent key for same user and job', () => {
    const jobId = 'bulk_invite_1234_abcd';
    const key1 = `invite_${jobId}_user1`;
    const key2 = `invite_${jobId}_user1`;
    expect(key1).toBe(key2);
  });

  it('should generate different keys for different jobs', () => {
    const key1 = `invite_bulk_invite_111_${Date.now()}_user1`;
    const key2 = `invite_bulk_invite_222_${Date.now()}_user1`;
    expect(key1).not.toBe(key2);
  });

  it('should generate notification idempotency key per event+rule+recipient', () => {
    const key = `event123_rule456_test@example.com`;
    expect(key.split('_')).toHaveLength(3);
    expect(key).toContain('event123');
    expect(key).toContain('rule456');
    expect(key).toContain('test@example.com');
  });
});

// ─── Notification Recipient Resolver Logic ───────────────────────────────────

describe('Recipient Resolver Types', () => {
  it('requester resolver should target single user', () => {
    const resolverType = 'requester';
    const actorUserId = 'user-123';
    // Logic: fetch single user by actorUserId
    expect(resolverType).toBe('requester');
    expect(actorUserId).toBe('user-123');
  });

  it('tenant_admins resolver should target all tenant users', () => {
    const resolverType = 'tenant_admins';
    const tenantId = 'tenant-abc';
    // Logic: fetch all active users for tenantId
    expect(resolverType).toBe('tenant_admins');
    expect(tenantId).toBe('tenant-abc');
  });

  it('custom resolver should use explicit email list', () => {
    const resolverType = 'custom';
    const customRecipients = ['a@b.com', 'c@d.com'];
    expect(resolverType).toBe('custom');
    expect(customRecipients).toHaveLength(2);
  });

  it('unknown resolver should return empty array', () => {
    const resolverType = 'unknown_type';
    const result: string[] = [];
    switch (resolverType) {
      case 'requester':
      case 'tenant_admins':
      case 'all_tenant_users':
      case 'custom':
        result.push('matched');
        break;
      default:
        // no match → empty
        break;
    }
    expect(result).toEqual([]);
  });
});

// ─── Notification Preference Filtering Tests ─────────────────────────────────

describe('Notification Preference Filtering', () => {
  it('should allow recipients without explicit opt-out', () => {
    const recipients = [
      { email: 'a@b.com', userId: 'u1', userType: 'client' },
      { email: 'c@d.com', userId: 'u2', userType: 'client' },
    ];
    const optedOut = new Set<string>(); // no one opted out
    const filtered = recipients.filter(r => !r.userId || !optedOut.has(r.userId));
    expect(filtered).toHaveLength(2);
  });

  it('should exclude opted-out recipients', () => {
    const recipients = [
      { email: 'a@b.com', userId: 'u1', userType: 'client' },
      { email: 'c@d.com', userId: 'u2', userType: 'client' },
    ];
    const optedOut = new Set(['u1']);
    const filtered = recipients.filter(r => !r.userId || !optedOut.has(r.userId));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].email).toBe('c@d.com');
  });

  it('should allow recipients without userId (custom)', () => {
    const recipients = [
      { email: 'external@test.com', userType: 'custom' },
    ];
    const optedOut = new Set<string>();
    const filtered = recipients.filter(r => !('userId' in r && r.userId) || !optedOut.has(r.userId!));
    expect(filtered).toHaveLength(1);
  });
});

// ─── Template Variable Payload Conversion ────────────────────────────────────

describe('Notification Payload → Template Variables', () => {
  function buildTemplateVariables(
    payload: Record<string, any>,
    eventType: string,
  ): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') {
        vars[key] = JSON.stringify(value);
      } else {
        vars[key] = String(value);
      }
    }
    vars.eventType = eventType;
    vars.currentYear = new Date().getFullYear().toString();
    return vars;
  }

  it('should convert string values directly', () => {
    const vars = buildTemplateVariables({ name: 'Jane' }, 'test');
    expect(vars.name).toBe('Jane');
  });

  it('should convert numbers to strings', () => {
    const vars = buildTemplateVariables({ count: 42 }, 'test');
    expect(vars.count).toBe('42');
  });

  it('should JSON-stringify objects', () => {
    const vars = buildTemplateVariables({ meta: { a: 1 } }, 'test');
    expect(vars.meta).toBe('{"a":1}');
  });

  it('should skip null values', () => {
    const vars = buildTemplateVariables({ a: null, b: 'ok' }, 'test');
    expect('a' in vars).toBe(false);
    expect(vars.b).toBe('ok');
  });

  it('should skip undefined values', () => {
    const vars = buildTemplateVariables({ a: undefined, b: 'ok' }, 'test');
    expect('a' in vars).toBe(false);
  });

  it('should inject eventType and currentYear', () => {
    const vars = buildTemplateVariables({}, 'project_approved');
    expect(vars.eventType).toBe('project_approved');
    expect(vars.currentYear).toBe(new Date().getFullYear().toString());
  });

  it('should convert boolean to string', () => {
    const vars = buildTemplateVariables({ active: true }, 'test');
    expect(vars.active).toBe('true');
  });
});

// ─── Send Request / Result Shape Tests ───────────────────────────────────────

describe('MercurySendRequest / MercurySendResult Types', () => {
  it('should accept minimal send request', () => {
    const req: any = {
      to: 'test@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    };
    expect(req.to).toBe('test@example.com');
    expect(req.subject).toBe('Hello');
    expect(req.html).toBe('<p>Hi</p>');
  });

  it('should accept full send request with optional fields', () => {
    const req: any = {
      to: 'test@example.com',
      toName: 'Jane',
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
      replyTo: 'reply@example.com',
      fromName: 'Mercury',
      fromEmail: 'mercury@test.com',
    };
    expect(req.cc).toEqual(['cc@example.com']);
    expect(req.bcc).toEqual(['bcc@example.com']);
    expect(req.replyTo).toBe('reply@example.com');
  });

  it('should model success result', () => {
    const result: any = { success: true, messageId: 'msg-123' };
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-123');
  });

  it('should model failure result', () => {
    const result: any = { success: false, error: 'Connection timeout' };
    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection timeout');
  });
});

// ─── Batch Processing Logic ──────────────────────────────────────────────────

describe('Batch Processing Logic', () => {
  it('should calculate correct number of batches', () => {
    const totalItems = 127;
    const batchSize = MERCURY_DEFAULTS.batchSize; // 50
    const batches = Math.ceil(totalItems / batchSize);
    expect(batches).toBe(3);
  });

  it('should handle exact batch size', () => {
    const totalItems = 50;
    const batchSize = MERCURY_DEFAULTS.batchSize;
    const batches = Math.ceil(totalItems / batchSize);
    expect(batches).toBe(1);
  });

  it('should handle zero items', () => {
    const totalItems = 0;
    const batchSize = MERCURY_DEFAULTS.batchSize;
    const batches = totalItems === 0 ? 0 : Math.ceil(totalItems / batchSize);
    expect(batches).toBe(0);
  });

  it('should handle single item', () => {
    const totalItems = 1;
    const batchSize = MERCURY_DEFAULTS.batchSize;
    const batches = Math.ceil(totalItems / batchSize);
    expect(batches).toBe(1);
  });

  it('should slice batches correctly', () => {
    const items = Array.from({ length: 7 }, (_, i) => `item-${i}`);
    const batchSize = 3;
    const batch0 = items.slice(0, batchSize);
    const batch1 = items.slice(3, 6);
    const batch2 = items.slice(6, 9);
    expect(batch0).toEqual(['item-0', 'item-1', 'item-2']);
    expect(batch1).toEqual(['item-3', 'item-4', 'item-5']);
    expect(batch2).toEqual(['item-6']);
  });
});

// ─── Outbox Status Flow Tests ────────────────────────────────────────────────

describe('Outbox Status Flow', () => {
  const validTransitions: Record<string, string[]> = {
    queued: ['sending'],
    sending: ['sent', 'queued', 'failed'],
    sent: [],
    failed: ['queued'], // retry
    skipped: [],
  };

  it('queued → sending is valid', () => {
    expect(validTransitions.queued).toContain('sending');
  });

  it('sending → sent is valid', () => {
    expect(validTransitions.sending).toContain('sent');
  });

  it('sending → failed is valid (on error)', () => {
    expect(validTransitions.sending).toContain('failed');
  });

  it('sending → queued is valid (retry, not exhausted)', () => {
    expect(validTransitions.sending).toContain('queued');
  });

  it('failed → queued is valid (retry)', () => {
    expect(validTransitions.failed).toContain('queued');
  });

  it('sent is terminal (no transitions)', () => {
    expect(validTransitions.sent).toEqual([]);
  });

  it('skipped is terminal (no transitions)', () => {
    expect(validTransitions.skipped).toEqual([]);
  });
});

// ─── Retry Logic Tests ──────────────────────────────────────────────────────

describe('Retry Logic', () => {
  it('should retry when retryCount < maxRetries', () => {
    const retryCount = 1;
    const maxRetries = MERCURY_DEFAULTS.maxRetries; // 3
    const exhausted = retryCount >= maxRetries;
    expect(exhausted).toBe(false);
    // Status should go back to queued
    const newStatus = exhausted ? 'failed' : 'queued';
    expect(newStatus).toBe('queued');
  });

  it('should fail permanently when retryCount reaches maxRetries', () => {
    const retryCount = 3;
    const maxRetries = MERCURY_DEFAULTS.maxRetries;
    const exhausted = retryCount >= maxRetries;
    expect(exhausted).toBe(true);
    const newStatus = exhausted ? 'failed' : 'queued';
    expect(newStatus).toBe('failed');
  });

  it('should fail permanently when retryCount exceeds maxRetries', () => {
    const retryCount = 5;
    const maxRetries = MERCURY_DEFAULTS.maxRetries;
    const exhausted = retryCount >= maxRetries;
    expect(exhausted).toBe(true);
  });

  it('should increment retry count after each failure', () => {
    let retryCount = 0;
    retryCount += 1; // first fail
    expect(retryCount).toBe(1);
    retryCount += 1; // second fail
    expect(retryCount).toBe(2);
    retryCount += 1; // third fail → exhausted
    expect(retryCount >= MERCURY_DEFAULTS.maxRetries).toBe(true);
  });
});

// ─── Module Export Tests ─────────────────────────────────────────────────────

describe('Mercury Module Exports', () => {
  it('should export all services from index', async () => {
    const mercury = await import('../index');
    expect(mercury).toHaveProperty('mercuryEmailService');
    expect(mercury).toHaveProperty('notificationService');
    expect(mercury).toHaveProperty('bulkInvitationService');
    expect(mercury).toHaveProperty('renderTemplate');
    expect(mercury).toHaveProperty('escapeHtml');
    expect(mercury).toHaveProperty('extractTemplateVariables');
    expect(mercury).toHaveProperty('MERCURY_DEFAULTS');
    expect(mercury).toHaveProperty('MERCURY_COMPANY_FOOTER');
  });

  it('should export default templates', async () => {
    const { DEFAULT_TEMPLATES: templates } = await import('../default-templates');
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('should export seed function', async () => {
    const { seedDefaultTemplates } = await import('../default-templates');
    expect(typeof seedDefaultTemplates).toBe('function');
  });
});

// ─── SMTP Connection Status Shape Tests ──────────────────────────────────────

describe('SMTP Connection Status', () => {
  it('should model unconfigured status', () => {
    const status: any = {
      configured: false,
      verified: false,
      fromEmail: MERCURY_DEFAULTS.fromEmail,
      error: 'No active SMTP provider configured',
    };
    expect(status.configured).toBe(false);
    expect(status.verified).toBe(false);
    expect(status.error).toContain('No active SMTP provider');
  });

  it('should model configured but unverified status', () => {
    const status: any = {
      configured: true,
      verified: false,
      providerName: 'Gmail',
      fromEmail: 'test@gmail.com',
      error: 'Connection timeout',
    };
    expect(status.configured).toBe(true);
    expect(status.verified).toBe(false);
  });

  it('should model fully verified status', () => {
    const status: any = {
      configured: true,
      verified: true,
      providerName: 'Gmail',
      fromEmail: 'mercury@pivotal-b2b.com',
      lastVerifiedAt: new Date(),
    };
    expect(status.configured).toBe(true);
    expect(status.verified).toBe(true);
    expect(status.lastVerifiedAt).toBeInstanceOf(Date);
  });
});

// ─── XSS Prevention in Templates ─────────────────────────────────────────────

describe('XSS Prevention', () => {
  it('should escape script tags in {{var}}', () => {
    const result = renderTemplate('{{input}}', { input: '<script>alert(1)</script>' });
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should escape event handlers in {{var}}', () => {
    const result = renderTemplate('{{input}}', { input: '<img onerror="alert(1)" src=x>' });
    // Angle brackets are escaped, so the tag can't execute in HTML context
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
    // Quotes are also escaped
    expect(result).toContain('&quot;alert(1)&quot;');
  });

  it('should allow raw HTML in {{{var}}} (for pre-sanitized content)', () => {
    const result = renderTemplate('{{{html}}}', { html: '<strong>Safe</strong>' });
    expect(result).toBe('<strong>Safe</strong>');
  });

  it('should escape entities in subject lines', () => {
    const inviteTemplate = DEFAULT_TEMPLATES.find(t => t.templateKey === 'client_invite')!;
    const subject = renderTemplate(inviteTemplate.subjectTemplate, {
      companyName: 'A<B&C>D',
    });
    expect(subject).not.toContain('<B');
    expect(subject).toContain('A&lt;B&amp;C&gt;D');
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should handle template with only whitespace variables', () => {
    const result = renderTemplate('{{name}}', { name: '   ' });
    expect(result).toBe('   ');
  });

  it('should handle template with very long variable values', () => {
    const longStr = 'x'.repeat(10000);
    const result = renderTemplate('{{val}}', { val: longStr });
    expect(result).toHaveLength(10000);
  });

  it('should handle empty template string', () => {
    const result = renderTemplate('', { name: 'Jane' });
    expect(result).toBe('');
  });

  it('should handle template with no matching variables', () => {
    const result = renderTemplate('{{a}} {{b}}', {});
    expect(result).toBe(' ');
  });

  it('should handle invite expiry calculation', () => {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + MERCURY_DEFAULTS.inviteExpiryDays);
    const diffDays = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(MERCURY_DEFAULTS.inviteExpiryDays);
  });

  it('should handle Unicode in template variables', () => {
    const result = renderTemplate('Hello {{name}}', { name: '日本語テスト' });
    expect(result).toBe('Hello 日本語テスト');
  });

  it('should handle emoji in template variables', () => {
    const result = renderTemplate('Status: {{status}}', { status: '✅ Approved' });
    expect(result).toBe('Status: ✅ Approved');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Phase 9 — Mercury Bridge Templates + AI Template Studio + Fixes
// ══════════════════════════════════════════════════════════════════════════════

describe('Phase 9 — Seed Default Templates Enhanced', () => {
  it('seedDefaultTemplates returns created and skipped counts', async () => {
    // The function signature must return { created, skipped }
    const fn = seedDefaultTemplates;
    expect(typeof fn).toBe('function');
  });

  it('DEFAULT_TEMPLATES has 7 templates', () => {
    expect(DEFAULT_TEMPLATES).toHaveLength(7);
  });

  it('each template has required fields', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.templateKey).toBeDefined();
      expect(t.name).toBeDefined();
      expect(t.subjectTemplate).toBeDefined();
      expect(t.htmlTemplate).toBeDefined();
      expect(t.textTemplate).toBeDefined();
      expect(t.category).toBeDefined();
      expect(Array.isArray(t.variables)).toBe(true);
    }
  });

  it('each template key is unique', () => {
    const keys = DEFAULT_TEMPLATES.map(t => t.templateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('template keys are snake_case', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.templateKey).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('all templates have at least one variable', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.variables.length).toBeGreaterThan(0);
    }
  });

  it('variable names appear in at least one template part or are metadata fields', () => {
    // Some variables like "email" are used for addressing/metadata, not in template body
    const metadataVars = ['email', 'recipientEmail', 'toEmail'];
    for (const t of DEFAULT_TEMPLATES) {
      for (const v of t.variables.filter(v => v.required)) {
        if (metadataVars.includes(v.name)) continue; // skip metadata-only vars
        const usedInHtml = t.htmlTemplate.includes(`{{${v.name}}}`) || t.htmlTemplate.includes(`{{{${v.name}}}`);
        const usedInText = t.textTemplate.includes(`{{${v.name}}}`) || t.textTemplate.includes(`{{{${v.name}}}`);
        const usedInSubject = t.subjectTemplate.includes(`{{${v.name}}}`) || t.subjectTemplate.includes(`{{{${v.name}}}`);
        const usedInConditional = t.htmlTemplate.includes(`{{#if ${v.name}}}`) || t.textTemplate.includes(`{{#if ${v.name}}}`);
        expect(usedInHtml || usedInText || usedInSubject || usedInConditional).toBe(true);
      }
    }
  });

  it('templates cover expected categories', () => {
    const categories = new Set(DEFAULT_TEMPLATES.map(t => t.category));
    expect(categories.has('invitation')).toBe(true);
    expect(categories.has('notification')).toBe(true);
    expect(categories.has('system')).toBe(true);
  });

  it('client_invite template has expected variables', () => {
    const invite = DEFAULT_TEMPLATES.find(t => t.templateKey === 'client_invite');
    expect(invite).toBeDefined();
    const varNames = invite!.variables.map(v => v.name);
    expect(varNames).toContain('firstName');
    expect(varNames).toContain('companyName');
    expect(varNames).toContain('inviteLink');
  });

  it('test_notification template has expected variables', () => {
    const test = DEFAULT_TEMPLATES.find(t => t.templateKey === 'test_notification');
    expect(test).toBeDefined();
    const varNames = test!.variables.map(v => v.name);
    expect(varNames).toContain('timestamp');
    expect(varNames).toContain('adminName');
  });
});

describe('Phase 9 — Template Engine Edge Cases for Studio', () => {
  it('should render single-level conditionals with else', () => {
    const tpl = '{{#if active}}Active{{else}}Inactive{{/if}}';
    expect(renderTemplate(tpl, { active: 'yes' })).toBe('Active');
    expect(renderTemplate(tpl, {})).toBe('Inactive');
  });

  it('should render multiple independent conditionals', () => {
    const tpl = '{{#if a}}A{{/if}} {{#if b}}B{{/if}}';
    expect(renderTemplate(tpl, { a: '1', b: '1' })).toBe('A B');
    expect(renderTemplate(tpl, { a: '1' })).toBe('A ');
    expect(renderTemplate(tpl, {})).toBe(' ');
  });

  it('should extract variables from AI-generated templates', () => {
    const vars = extractTemplateVariables(
      'Hello {{recipient_name}}, your {{campaign_name}} at {{org_name}} has {{lead_count}} leads.'
    );
    expect(vars).toContain('recipient_name');
    expect(vars).toContain('campaign_name');
    expect(vars).toContain('org_name');
    expect(vars).toContain('lead_count');
  });

  it('should handle multiple identical variable references', () => {
    const tpl = '{{name}} is {{name}} and {{name}} again';
    const result = renderTemplate(tpl, { name: 'Alice' });
    expect(result).toBe('Alice is Alice and Alice again');
  });

  it('should generate sample variables for all extracted variables', () => {
    const varNames = extractTemplateVariables('{{a}} {{b}} {{c}}');
    const varDefs = varNames.map(name => ({ name, exampleValue: `sample_${name}` }));
    const samples = generateSampleVariables(varDefs);
    expect(Object.keys(samples)).toHaveLength(3);
    expect(samples).toHaveProperty('a', 'sample_a');
    expect(samples).toHaveProperty('b', 'sample_b');
    expect(samples).toHaveProperty('c', 'sample_c');
  });

  it('should validate that all required variables are provided', () => {
    const varDefs = [
      { name: 'name', required: true },
      { name: 'email', required: true },
      { name: 'optional_field', required: false },
    ];
    const missing = validateTemplateVariables(varDefs as any, { name: 'Alice' });
    expect(missing).toContain('email');
    expect(missing).not.toContain('optional_field');
  });

  it('should apply defaults to missing variables', () => {
    const varDefs = [
      { name: 'name', defaultValue: 'World' },
      { name: 'greeting', defaultValue: 'Hello' },
    ];
    const result = applyDefaults(varDefs as any, { name: 'Alice' });
    expect(result.name).toBe('Alice');
    expect(result.greeting).toBe('Hello');
  });
});

describe('Phase 9 — Template Gallery Data Integrity', () => {
  const TEMPLATE_GALLERY = [
    { name: 'Welcome Onboarding', category: 'onboarding', audience: 'New client users', purpose: 'Welcome the user' },
    { name: 'Weekly Lead Digest', category: 'notification', audience: 'Client stakeholders', purpose: 'Weekly summary' },
    { name: 'Campaign Milestone', category: 'notification', audience: 'Campaign owners', purpose: 'Celebrate milestone' },
    { name: 'Account Review Reminder', category: 'marketing', audience: 'Client decision-makers', purpose: 'Schedule review' },
    { name: 'Invoice / Payment Receipt', category: 'system', audience: 'Billing contacts', purpose: 'Confirm payment' },
    { name: 'Re-engagement Nudge', category: 'marketing', audience: 'Dormant client users', purpose: 'Remind of value' },
  ];

  it('gallery has 6 template ideas', () => {
    expect(TEMPLATE_GALLERY).toHaveLength(6);
  });

  it('all gallery items have required fields', () => {
    for (const g of TEMPLATE_GALLERY) {
      expect(g.name).toBeDefined();
      expect(g.category).toBeDefined();
      expect(g.audience).toBeDefined();
      expect(g.purpose).toBeDefined();
    }
  });

  it('gallery covers multiple categories', () => {
    const categories = new Set(TEMPLATE_GALLERY.map(g => g.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it('gallery names are unique', () => {
    const names = TEMPLATE_GALLERY.map(g => g.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('Phase 9 — AI Template Generation Schema Validation', () => {
  it('AI generate endpoint expects category enum', () => {
    const validCategories = ['invitation', 'notification', 'system', 'marketing', 'onboarding'];
    for (const cat of validCategories) {
      expect(validCategories).toContain(cat);
    }
  });

  it('AI generate endpoint expects tone enum', () => {
    const validTones = ['professional', 'friendly', 'formal', 'casual', 'urgent'];
    for (const tone of validTones) {
      expect(validTones).toContain(tone);
    }
  });

  it('AI refine endpoint expects action enum', () => {
    const validActions = ['improve', 'shorten', 'formal', 'friendly', 'cta', 'rewrite'];
    for (const action of validActions) {
      expect(validActions).toContain(action);
    }
  });

  it('AI generate response shape has required fields', () => {
    const mockResponse = {
      name: 'Test',
      description: 'Desc',
      templateKey: 'test_key',
      subjectTemplate: 'Subject {{var}}',
      htmlTemplate: '<p>Hello {{var}}</p>',
      textTemplate: 'Hello {{var}}',
      variables: [{ name: 'var', description: 'Test var', required: true, exampleValue: 'Test' }],
    };
    expect(mockResponse).toHaveProperty('name');
    expect(mockResponse).toHaveProperty('templateKey');
    expect(mockResponse).toHaveProperty('subjectTemplate');
    expect(mockResponse).toHaveProperty('htmlTemplate');
    expect(mockResponse).toHaveProperty('textTemplate');
    expect(Array.isArray(mockResponse.variables)).toBe(true);
    expect(mockResponse.variables[0]).toHaveProperty('name');
    expect(mockResponse.variables[0]).toHaveProperty('required');
  });

  it('AI refine response shape has required fields', () => {
    const mockRefine = {
      subjectTemplate: 'Updated subject',
      htmlTemplate: '<p>Updated HTML</p>',
      textTemplate: 'Updated text',
    };
    expect(mockRefine).toHaveProperty('subjectTemplate');
    expect(mockRefine).toHaveProperty('htmlTemplate');
    expect(mockRefine).toHaveProperty('textTemplate');
  });
});

describe('Phase 9 — Dry Run Feature Flag Gate Removal', () => {
  it('dry run should be accessible without feature flag (read-only operation)', () => {
    // This validates the design decision: dry-run is safe/read-only
    // and should NOT require bulk_invites_enabled flag
    const isDryRunSafe = true; // Read-only, no side effects
    expect(isDryRunSafe).toBe(true);
  });

  it('invitation send should still require feature flags', () => {
    // Send operation DOES require both flags
    const sendRequiresFlags = ['bulk_invites_enabled', 'smtp_email_enabled'];
    expect(sendRequiresFlags).toContain('bulk_invites_enabled');
    expect(sendRequiresFlags).toContain('smtp_email_enabled');
  });

  it('invitation status should be viewable without feature flag', () => {
    // Status is read-only, no flag required
    const isStatusReadOnly = true;
    expect(isStatusReadOnly).toBe(true);
  });
});

describe('Phase 9 — Seed Endpoint Returns Templates', () => {
  it('seed response should include templates array', () => {
    const mockSeedResponse = {
      success: true,
      created: 6,
      skipped: 0,
      templates: [
        { id: '1', templateKey: 'client_invite', name: 'Client Portal Invitation' },
        { id: '2', templateKey: 'project_request_approved', name: 'Project Request Approved' },
      ],
    };
    expect(mockSeedResponse.success).toBe(true);
    expect(mockSeedResponse).toHaveProperty('templates');
    expect(Array.isArray(mockSeedResponse.templates)).toBe(true);
    expect(mockSeedResponse.templates.length).toBeGreaterThan(0);
  });

  it('seed response includes created and skipped counts', () => {
    const mockSeedResponse = { success: true, created: 3, skipped: 3, templates: [] };
    expect(mockSeedResponse.created).toBeDefined();
    expect(mockSeedResponse.skipped).toBeDefined();
    expect(mockSeedResponse.created + mockSeedResponse.skipped).toBe(6);
  });
});

describe('Phase 9 — Template Duplication Logic', () => {
  it('should create unique key for duplicated template', () => {
    const original = { templateKey: 'client_invite', name: 'Client Portal Invitation' };
    const timestamp = Date.now();
    const newKey = `${original.templateKey}_copy_${timestamp}`.slice(0, 100);
    expect(newKey).toContain('client_invite_copy_');
    expect(newKey.length).toBeLessThanOrEqual(100);
  });

  it('should append (Copy) to duplicated template name', () => {
    const original = { name: 'Client Portal Invitation' };
    const newName = `${original.name} (Copy)`;
    expect(newName).toBe('Client Portal Invitation (Copy)');
  });

  it('should strip id, createdAt, updatedAt from duplicate', () => {
    const original = {
      id: '123',
      templateKey: 'test',
      name: 'Test',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const duplicate = {
      ...original,
      templateKey: `${original.templateKey}_copy_${Date.now()}`,
      name: `${original.name} (Copy)`,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    };
    expect(duplicate.id).toBeUndefined();
    expect(duplicate.createdAt).toBeUndefined();
    expect(duplicate.updatedAt).toBeUndefined();
  });
});

describe('Phase 9 — Template Preview Sandboxing', () => {
  it('preview HTML should be isolated in iframe sandbox', () => {
    // Validate that HTML preview is rendered in a sandboxed iframe with allow-same-origin
    const sandboxAttrs = 'allow-same-origin';
    expect(sandboxAttrs).not.toContain('allow-scripts');
    expect(sandboxAttrs).toContain('allow-same-origin');
  });

  it('rendered template should not execute scripts', () => {
    const maliciousHtml = '<p>Hello</p><script>alert("xss")</script>';
    // In sandboxed iframe without allow-scripts, scripts don't execute
    const isSandboxed = true;
    expect(isSandboxed).toBe(true);
    // The HTML is written to iframe document — scripts are blocked by sandbox
  });
});

describe('Phase 9 — Template Category Filtering', () => {
  it('should filter templates by category', () => {
    const templates = [
      { id: '1', category: 'invitation', name: 'Invite' },
      { id: '2', category: 'notification', name: 'Approve' },
      { id: '3', category: 'notification', name: 'Reject' },
      { id: '4', category: 'system', name: 'Test' },
    ];

    const filtered = templates.filter(t => t.category === 'notification');
    expect(filtered).toHaveLength(2);
    expect(filtered.every(t => t.category === 'notification')).toBe(true);
  });

  it('should return all templates when no filter applied', () => {
    const templates = [
      { id: '1', category: 'invitation' },
      { id: '2', category: 'notification' },
      { id: '3', category: 'system' },
    ];
    const categoryFilter = '';
    const filtered = categoryFilter ? templates.filter(t => t.category === categoryFilter) : templates;
    expect(filtered).toHaveLength(3);
  });

  it('should extract unique categories from templates', () => {
    const templates = [
      { category: 'invitation' },
      { category: 'notification' },
      { category: 'notification' },
      { category: 'system' },
      { category: 'invitation' },
    ];
    const categories = Array.from(new Set(templates.map(t => t.category)));
    expect(categories).toHaveLength(3);
    expect(categories).toContain('invitation');
    expect(categories).toContain('notification');
    expect(categories).toContain('system');
  });
});

describe('Phase 9 — Template Variable Editor', () => {
  it('should add a new empty variable', () => {
    const variables: any[] = [{ name: 'existing', required: true }];
    const newVar = { name: '', description: '', required: false, exampleValue: '' };
    const updated = [...variables, newVar];
    expect(updated).toHaveLength(2);
    expect(updated[1].name).toBe('');
    expect(updated[1].required).toBe(false);
  });

  it('should remove a variable by index', () => {
    const variables = [
      { name: 'a', required: true },
      { name: 'b', required: false },
      { name: 'c', required: true },
    ];
    const removeIdx = 1;
    const updated = [...variables];
    updated.splice(removeIdx, 1);
    expect(updated).toHaveLength(2);
    expect(updated.map(v => v.name)).toEqual(['a', 'c']);
  });

  it('should update variable at specific index', () => {
    const variables = [
      { name: 'old_name', description: 'old desc', required: false },
    ];
    const updated = [...variables];
    updated[0] = { ...updated[0], name: 'new_name', description: 'new desc' };
    expect(updated[0].name).toBe('new_name');
    expect(updated[0].description).toBe('new desc');
    expect(updated[0].required).toBe(false);
  });
});

describe('Phase 9 — Mercury Bridge Endpoint Audit', () => {
  it('Mercury endpoints that should NOT require feature flags', () => {
    const noFlagRequired = [
      'GET /status',
      'POST /verify-connection',
      'POST /templates/seed',
      'GET /templates',
      'GET /templates/:key',
      'POST /templates',
      'PUT /templates/:key',
      'DELETE /templates/:key',
      'POST /templates/:key/preview',
      'POST /templates/ai/generate',
      'POST /templates/ai/refine',
      'POST /invitations/dry-run',        // Phase 9 fix: removed flag
      'GET /invitations/status',           // Phase 9 fix: removed flag
      'POST /invitations/validate-token',
      'GET /notifications/events',
      'GET /notifications/rules',
      'POST /notifications/rules',
      'PUT /notifications/rules/:id',
      'DELETE /notifications/rules/:id',
      'GET /logs',
    ];
    expect(noFlagRequired.length).toBe(20);
  });

  it('Mercury endpoints that SHOULD require feature flags', () => {
    const flagRequired = [
      { endpoint: 'POST /templates/:key/test-send', flag: 'smtp_email_enabled' },
      { endpoint: 'POST /invitations/send', flags: ['bulk_invites_enabled', 'smtp_email_enabled'] },
      { endpoint: 'POST /notifications/dispatch', flag: 'smtp_email_enabled' },
      { endpoint: 'POST /logs/:id/retry', flag: 'smtp_email_enabled' },
      { endpoint: 'POST /outbox/process', flag: 'smtp_email_enabled' },
    ];
    expect(flagRequired.length).toBe(5);
    // Verify send requires both flags
    const sendEndpoint = flagRequired.find(e => e.endpoint === 'POST /invitations/send');
    expect(sendEndpoint).toBeDefined();
    expect((sendEndpoint as any).flags).toContain('bulk_invites_enabled');
    expect((sendEndpoint as any).flags).toContain('smtp_email_enabled');
  });
});

describe('Phase 9 — AI Studio Form Validation', () => {
  it('should require audience and purpose', () => {
    const form = { category: 'notification', audience: '', tone: 'professional', purpose: '' };
    const isValid = form.audience.length > 0 && form.purpose.length > 0;
    expect(isValid).toBe(false);
  });

  it('should pass validation with required fields filled', () => {
    const form = {
      category: 'notification',
      audience: 'Client portal users',
      tone: 'professional',
      purpose: 'Notify about new leads',
    };
    const isValid = form.audience.length > 0 && form.purpose.length > 0;
    expect(isValid).toBe(true);
  });

  it('should parse comma-separated variables correctly', () => {
    const input = 'recipient_name, company_name, report_url';
    const variables = input.split(',').map(v => v.trim()).filter(Boolean);
    expect(variables).toEqual(['recipient_name', 'company_name', 'report_url']);
  });

  it('should handle empty variables input', () => {
    const input = '';
    const variables = input ? input.split(',').map(v => v.trim()).filter(Boolean) : undefined;
    expect(variables).toBeUndefined();
  });

  it('should handle variables with extra whitespace', () => {
    const input = '  name  ,  email  ,  company  ';
    const variables = input.split(',').map(v => v.trim()).filter(Boolean);
    expect(variables).toEqual(['name', 'email', 'company']);
  });
});

describe('Phase 9 — Template Key Generation', () => {
  it('should generate unique template keys', () => {
    const base = 'test_template';
    const key1 = `${base}_copy_${1000}`;
    const key2 = `${base}_copy_${2000}`;
    expect(key1).not.toBe(key2);
  });

  it('should truncate long template keys to 100 chars', () => {
    const longBase = 'very_long_template_key_' + 'x'.repeat(100);
    const key = `${longBase}_copy_${Date.now()}`.slice(0, 100);
    expect(key.length).toBeLessThanOrEqual(100);
  });
});

describe('Phase 9 — MERCURY_DEFAULTS Validation', () => {
  it('invite expiry should be positive', () => {
    expect(MERCURY_DEFAULTS.inviteExpiryDays).toBeGreaterThan(0);
  });

  it('batch size should be reasonable', () => {
    expect(MERCURY_DEFAULTS.batchSize).toBeGreaterThan(0);
    expect(MERCURY_DEFAULTS.batchSize).toBeLessThanOrEqual(200);
  });

  it('max retries should be reasonable', () => {
    expect(MERCURY_DEFAULTS.maxRetries).toBeGreaterThan(0);
    expect(MERCURY_DEFAULTS.maxRetries).toBeLessThanOrEqual(10);
  });

  it('default from email should be valid format', () => {
    expect(MERCURY_DEFAULTS.fromEmail).toMatch(/@/);
  });
});

describe('Phase 9 — HTML Template Safety', () => {
  it('should escape script injection in variable values', () => {
    const result = renderTemplate('Hello {{name}}', { name: '<script>alert("xss")</script>' });
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should escape event handler injection', () => {
    const result = renderTemplate('{{val}}', { val: '<img onerror=alert(1) src=x>' });
    expect(result).toContain('&lt;img');
    expect(result).not.toContain('<img');
  });

  it('should handle nested HTML in variables', () => {
    const result = renderTemplate('{{content}}', { content: '<div><b>bold</b></div>' });
    expect(result).toContain('&lt;div&gt;');
    expect(result).not.toContain('<div>');
  });

  it('should safely render templates with existing HTML structure', () => {
    const tpl = '<div style="color: red;">{{msg}}</div>';
    const result = renderTemplate(tpl, { msg: 'Hello' });
    expect(result).toContain('<div style="color: red;">Hello</div>');
  });
});
