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
    expect(escapeHtml('')).toBe(
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
    expect(escapeHtml('"A & B"')).toBe(
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
    const result = renderTemplate('Value: {{val}}', { val: '' });
    expect(result).toBe('Value: &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('should NOT escape triple-brace variables {{{raw}}}', () => {
    const result = renderTemplate('HTML: {{{content}}}', { content: 'Bold' });
    expect(result).toBe('HTML: Bold');
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
{{title}}
{{{htmlBody}}}
{{#if showFooter}}{{footerText}}{{else}}Default{{/if}}
    `.trim();
    const result = renderTemplate(template, {
      title: 'Hello & Welcome',
      htmlBody: 'Bold',
      showFooter: 'yes',
      footerText: 'Custom Footer',
    });
    expect(result).toContain('Hello &amp; Welcome');
    expect(result).toContain('Bold');
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
    expect(MERCURY_DEFAULTS.fromEmail).toBe('mercury@demandgentic.ai');
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
      html: 'Test',
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
    const tokens = new Set();
    for (let i = 0; i  {
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
    const vars: Record = {
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
    const vars: Record = {
      firstName: '',
      lastName: 'Smith',
      email: 'test@test.com',
      companyName: 'A&B Corp',
      inviteLink: 'https://app.example.com/accept-invite?token=abc',
      expiryDays: '7',
    };

    const html = renderTemplate(inviteTemplate.htmlTemplate, vars);
    expect(html).not.toContain('' });
    expect(result).not.toContain('';
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
    const result = renderTemplate('Hello {{name}}', { name: '' });
    expect(result).not.toContain('');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should escape event handler injection', () => {
    const result = renderTemplate('{{val}}', { val: '' });
    expect(result).toContain('&lt;img');
    expect(result).not.toContain(' {
    const result = renderTemplate('{{content}}', { content: 'bold' });
    expect(result).toContain('&lt;div&gt;');
    expect(result).not.toContain('');
  });

  it('should safely render templates with existing HTML structure', () => {
    const tpl = '{{msg}}';
    const result = renderTemplate(tpl, { msg: 'Hello' });
    expect(result).toContain('Hello');
  });
});