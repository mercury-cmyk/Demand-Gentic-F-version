/**
 * Template Resolution Service
 *
 * Resolves templates with layered priority: contact > account > campaign
 * Provides a unified interface for retrieving the most specific template
 * for a given context (campaign, account, contact).
 */

import { db } from '../db';
import {
  campaignTemplates,
  campaigns,
  accounts,
  contacts,
} from '@shared/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';
import type {
  ChannelType,
  TemplateScope,
  TemplateType,
  ResolvedTemplates,
  TemplateResolutionEntry,
  CampaignTemplate,
} from '@shared/multi-channel-types';

// ============================================================
// TEMPLATE RESOLUTION
// ============================================================

export interface TemplateResolutionContext {
  campaignId: string;
  channelType: ChannelType;
  accountId?: string;
  contactId?: string;
}

/**
 * Resolve all templates for a given execution context.
 * Priority order: contact > account > campaign
 */
export async function resolveTemplatesForExecution(
  context: TemplateResolutionContext
): Promise<ResolvedTemplates> {
  const { campaignId, channelType, accountId, contactId } = context;

  // Get all potentially applicable templates
  const templates = await db
    .select()
    .from(campaignTemplates)
    .where(
      and(
        eq(campaignTemplates.campaignId, campaignId),
        eq(campaignTemplates.channelType, channelType),
        eq(campaignTemplates.isActive, true)
      )
    )
    .orderBy(
      desc(campaignTemplates.priority),
      desc(campaignTemplates.scope) // This works because 'contact' > 'campaign' > 'account' alphabetically, but we'll filter properly
    );

  // Group templates by type
  const templatesByType = new Map<string, CampaignTemplate[]>();
  for (const template of templates) {
    const type = template.templateType;
    if (!templatesByType.has(type)) {
      templatesByType.set(type, []);
    }
    templatesByType.get(type)!.push(template as CampaignTemplate);
  }

  // Resolve each template type with priority
  const resolved: ResolvedTemplates = {
    resolutionLog: [],
  };

  for (const [templateType, candidates] of templatesByType.entries()) {
    const bestTemplate = findBestTemplate(candidates, accountId, contactId);
    if (bestTemplate) {
      // Apply the template content to the resolved object
      applyTemplateToResolved(resolved, templateType, bestTemplate.content);

      // Log the resolution
      resolved.resolutionLog.push({
        templateType: templateType as TemplateType,
        resolvedFrom: bestTemplate.scope as TemplateScope,
        templateId: bestTemplate.id,
        templateName: bestTemplate.name,
        accountId: bestTemplate.accountId || undefined,
        contactId: bestTemplate.contactId || undefined,
      });
    }
  }

  return resolved;
}

/**
 * Find the best template from candidates based on scope priority.
 * Priority: contact (for this contact) > account (for this account) > campaign
 */
function findBestTemplate(
  candidates: CampaignTemplate[],
  accountId?: string,
  contactId?: string
): CampaignTemplate | null {
  // Sort candidates by specificity (contact > account > campaign) and priority
  const sorted = [...candidates].sort((a, b) => {
    // First, sort by scope specificity
    const scopeOrder: Record<TemplateScope, number> = {
      contact: 3,
      account: 2,
      campaign: 1,
    };
    const scopeDiff = (scopeOrder[b.scope as TemplateScope] || 0) - (scopeOrder[a.scope as TemplateScope] || 0);
    if (scopeDiff !== 0) return scopeDiff;

    // Then by priority
    return (b.priority || 0) - (a.priority || 0);
  });

  // Find the first template that matches the context
  for (const template of sorted) {
    // Contact-level template: must match contactId
    if (template.scope === 'contact') {
      if (contactId && template.contactId === contactId) {
        return template;
      }
      continue;
    }

    // Account-level template: must match accountId
    if (template.scope === 'account') {
      if (accountId && template.accountId === accountId) {
        return template;
      }
      continue;
    }

    // Campaign-level template: always matches
    if (template.scope === 'campaign') {
      return template;
    }
  }

  return null;
}

/**
 * Apply template content to the resolved templates object.
 */
function applyTemplateToResolved(
  resolved: ResolvedTemplates,
  templateType: string,
  content: string
): void {
  // Voice templates
  if (templateType === 'opening') resolved.opening = content;
  else if (templateType === 'gatekeeper') resolved.gatekeeper = content;
  else if (templateType === 'pitch') resolved.pitch = content;
  else if (templateType === 'closing') resolved.closing = content;
  else if (templateType === 'voicemail') resolved.voicemail = content;
  else if (templateType.startsWith('objection_')) {
    // Objection handling: objection_busy, objection_not_interested, etc.
    const objectionKey = templateType.replace('objection_', '');
    if (!resolved.objectionHandling) resolved.objectionHandling = {};
    resolved.objectionHandling[objectionKey] = content;
  }
  // Email templates
  else if (templateType === 'subject') resolved.subject = content;
  else if (templateType === 'preheader') resolved.preheader = content;
  else if (templateType === 'greeting') resolved.greeting = content;
  else if (templateType === 'body_intro') resolved.bodyIntro = content;
  else if (templateType === 'value_proposition') resolved.valueProposition = content;
  else if (templateType === 'call_to_action') resolved.callToAction = content;
  else if (templateType === 'signature') resolved.signature = content;
}

// ============================================================
// TEMPLATE CRUD OPERATIONS
// ============================================================

export interface CreateTemplateParams {
  campaignId: string;
  channelType: ChannelType;
  scope: TemplateScope;
  accountId?: string;
  contactId?: string;
  name: string;
  templateType: string;
  content: string;
  variables?: Record<string, string>;
  priority?: number;
  createdBy?: string;
}

/**
 * Create a new template at any scope level.
 */
export async function createTemplate(
  params: CreateTemplateParams
): Promise<CampaignTemplate> {
  // Validate scope and references
  if (params.scope === 'account' && !params.accountId) {
    throw new Error('Account ID required for account-level templates');
  }
  if (params.scope === 'contact' && !params.contactId) {
    throw new Error('Contact ID required for contact-level templates');
  }
  if (params.scope === 'campaign' && (params.accountId || params.contactId)) {
    throw new Error('Account/Contact ID should not be provided for campaign-level templates');
  }

  const [template] = await db
    .insert(campaignTemplates)
    .values({
      campaignId: params.campaignId,
      channelType: params.channelType,
      scope: params.scope,
      accountId: params.accountId || null,
      contactId: params.contactId || null,
      name: params.name,
      templateType: params.templateType,
      content: params.content,
      variables: params.variables || null,
      priority: params.priority || 0,
      isActive: true,
      createdBy: params.createdBy || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return template as CampaignTemplate;
}

/**
 * Update an existing template.
 */
export async function updateTemplate(
  templateId: string,
  updates: Partial<{
    name: string;
    content: string;
    variables: Record<string, string>;
    priority: number;
    isActive: boolean;
  }>
): Promise<CampaignTemplate | null> {
  const [template] = await db
    .update(campaignTemplates)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(campaignTemplates.id, templateId))
    .returning();

  return template as CampaignTemplate | null;
}

/**
 * Delete a template.
 */
export async function deleteTemplate(templateId: string): Promise<boolean> {
  await db
    .delete(campaignTemplates)
    .where(eq(campaignTemplates.id, templateId));

  return true;
}

/**
 * Get a template by ID.
 */
export async function getTemplate(templateId: string): Promise<CampaignTemplate | null> {
  const [template] = await db
    .select()
    .from(campaignTemplates)
    .where(eq(campaignTemplates.id, templateId))
    .limit(1);

  return template as CampaignTemplate | null;
}

/**
 * List all templates for a campaign.
 */
export async function listTemplates(params: {
  campaignId: string;
  channelType?: ChannelType;
  scope?: TemplateScope;
  accountId?: string;
  contactId?: string;
}): Promise<CampaignTemplate[]> {
  let query = db
    .select()
    .from(campaignTemplates)
    .where(eq(campaignTemplates.campaignId, params.campaignId));

  // Note: Additional filters would need to be applied in a more complex query
  // For simplicity, we'll filter in memory
  const templates = await query;

  return templates.filter(t => {
    if (params.channelType && t.channelType !== params.channelType) return false;
    if (params.scope && t.scope !== params.scope) return false;
    if (params.accountId && t.accountId !== params.accountId) return false;
    if (params.contactId && t.contactId !== params.contactId) return false;
    return true;
  }) as CampaignTemplate[];
}

// ============================================================
// BULK TEMPLATE OPERATIONS
// ============================================================

/**
 * Create default campaign-level templates for a channel.
 */
export async function createDefaultTemplates(
  campaignId: string,
  channelType: ChannelType,
  createdBy?: string
): Promise<CampaignTemplate[]> {
  const templates: CreateTemplateParams[] = [];

  if (channelType === 'voice') {
    templates.push(
      {
        campaignId,
        channelType,
        scope: 'campaign',
        name: 'Default Opening',
        templateType: 'opening',
        content: 'Hello, may I please speak with {{contact.firstName}}?',
        variables: { 'contact.firstName': 'the decision maker' },
        priority: 0,
        createdBy,
      },
      {
        campaignId,
        channelType,
        scope: 'campaign',
        name: 'Default Pitch',
        templateType: 'pitch',
        content: "I'm calling from {{organization.name}} regarding {{campaign.objective}}. Given your role, I thought you might find this relevant.",
        variables: {
          'organization.name': 'Our Company',
          'campaign.objective': 'an opportunity',
        },
        priority: 0,
        createdBy,
      },
      {
        campaignId,
        channelType,
        scope: 'campaign',
        name: 'Default Closing',
        templateType: 'closing',
        content: 'Thank you for your time, {{contact.firstName}}. Have a great rest of your day!',
        variables: { 'contact.firstName': '' },
        priority: 0,
        createdBy,
      }
    );
  } else {
    templates.push(
      {
        campaignId,
        channelType,
        scope: 'campaign',
        name: 'Default Subject',
        templateType: 'subject',
        content: 'Quick question about {{account.name}}',
        variables: { 'account.name': 'your priorities' },
        priority: 0,
        createdBy,
      },
      {
        campaignId,
        channelType,
        scope: 'campaign',
        name: 'Default Greeting',
        templateType: 'greeting',
        content: 'Hi {{contact.firstName}},',
        variables: { 'contact.firstName': '' },
        priority: 0,
        createdBy,
      },
      {
        campaignId,
        channelType,
        scope: 'campaign',
        name: 'Default CTA',
        templateType: 'call_to_action',
        content: 'Would you be open to a brief conversation this week?',
        priority: 0,
        createdBy,
      }
    );
  }

  const created: CampaignTemplate[] = [];
  for (const template of templates) {
    const t = await createTemplate(template);
    created.push(t);
  }

  return created;
}

/**
 * Copy templates from one account to another.
 */
export async function copyAccountTemplates(
  campaignId: string,
  sourceAccountId: string,
  targetAccountId: string
): Promise<CampaignTemplate[]> {
  const sourceTemplates = await listTemplates({
    campaignId,
    scope: 'account',
    accountId: sourceAccountId,
  });

  const copied: CampaignTemplate[] = [];
  for (const template of sourceTemplates) {
    const newTemplate = await createTemplate({
      campaignId,
      channelType: template.channelType as ChannelType,
      scope: 'account',
      accountId: targetAccountId,
      name: template.name,
      templateType: template.templateType,
      content: template.content,
      variables: template.variables as Record<string, string> | undefined,
      priority: template.priority || 0,
      createdBy: template.createdBy || undefined,
    });
    copied.push(newTemplate);
  }

  return copied;
}

// ============================================================
// TEMPLATE VARIABLE SUBSTITUTION
// ============================================================

export interface TemplateVariables {
  contact?: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
    linkedinUrl?: string;
  };
  account?: {
    name?: string;
    website?: string;
    industry?: string;
    city?: string;
    state?: string;
    country?: string;
    employeeCount?: number;
  };
  campaign?: {
    name?: string;
    objective?: string;
    product?: string;
  };
  organization?: {
    name?: string;
    website?: string;
  };
  custom?: Record<string, string>;
}

/**
 * Substitute variables in template content.
 */
export function substituteVariables(
  content: string,
  variables: TemplateVariables
): string {
  let result = content;

  // Contact variables
  if (variables.contact) {
    result = result.replace(/\{\{contact\.firstName\}\}/g, variables.contact.firstName || '');
    result = result.replace(/\{\{contact\.lastName\}\}/g, variables.contact.lastName || '');
    result = result.replace(/\{\{contact\.fullName\}\}/g, variables.contact.fullName || '');
    result = result.replace(/\{\{contact\.email\}\}/g, variables.contact.email || '');
    result = result.replace(/\{\{contact\.phone\}\}/g, variables.contact.phone || '');
    result = result.replace(/\{\{contact\.jobTitle\}\}/g, variables.contact.jobTitle || '');
  }

  // Account variables
  if (variables.account) {
    result = result.replace(/\{\{account\.name\}\}/g, variables.account.name || '');
    result = result.replace(/\{\{account\.website\}\}/g, variables.account.website || '');
    result = result.replace(/\{\{account\.industry\}\}/g, variables.account.industry || '');
    result = result.replace(/\{\{account\.city\}\}/g, variables.account.city || '');
    result = result.replace(/\{\{account\.state\}\}/g, variables.account.state || '');
    result = result.replace(/\{\{account\.country\}\}/g, variables.account.country || '');
  }

  // Campaign variables
  if (variables.campaign) {
    result = result.replace(/\{\{campaign\.name\}\}/g, variables.campaign.name || '');
    result = result.replace(/\{\{campaign\.objective\}\}/g, variables.campaign.objective || '');
    result = result.replace(/\{\{campaign\.product\}\}/g, variables.campaign.product || '');
  }

  // Organization variables
  if (variables.organization) {
    result = result.replace(/\{\{organization\.name\}\}/g, variables.organization.name || '');
    result = result.replace(/\{\{organization\.website\}\}/g, variables.organization.website || '');
  }

  // Custom variables
  if (variables.custom) {
    for (const [key, value] of Object.entries(variables.custom)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value || '');
    }
  }

  // Clean up any remaining unsubstituted variables
  result = result.replace(/\{\{[^}]+\}\}/g, '');

  return result;
}

/**
 * Build variables from database records.
 */
export async function buildVariablesFromContext(
  campaignId: string,
  accountId?: string,
  contactId?: string
): Promise<TemplateVariables> {
  const variables: TemplateVariables = {};

  // Get campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (campaign) {
    variables.campaign = {
      name: campaign.name,
      objective: campaign.campaignObjective || undefined,
      product: campaign.productServiceInfo || undefined,
    };
  }

  // Get account if provided
  if (accountId) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (account) {
      variables.account = {
        name: account.name || undefined,
        website: account.website || undefined,
        industry: account.industry || undefined,
        city: account.city || undefined,
        state: account.state || undefined,
        country: account.country || undefined,
        employeeCount: account.employeeCount || undefined,
      };
    }
  }

  // Get contact if provided
  if (contactId) {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    if (contact) {
      variables.contact = {
        firstName: contact.firstName || undefined,
        lastName: contact.lastName || undefined,
        fullName: contact.firstName && contact.lastName
          ? `${contact.firstName} ${contact.lastName}`
          : contact.firstName || contact.lastName || undefined,
        email: contact.email || undefined,
        phone: contact.phone || contact.mobile || undefined,
        jobTitle: contact.jobTitle || undefined,
        linkedinUrl: contact.linkedinUrl || undefined,
      };
    }
  }

  return variables;
}

/**
 * Resolve templates and substitute variables in one operation.
 */
export async function resolveAndSubstituteTemplates(
  context: TemplateResolutionContext
): Promise<ResolvedTemplates> {
  // First resolve templates
  const resolved = await resolveTemplatesForExecution(context);

  // Build variables from context
  const variables = await buildVariablesFromContext(
    context.campaignId,
    context.accountId,
    context.contactId
  );

  // Substitute variables in each resolved template
  if (resolved.opening) resolved.opening = substituteVariables(resolved.opening, variables);
  if (resolved.gatekeeper) resolved.gatekeeper = substituteVariables(resolved.gatekeeper, variables);
  if (resolved.pitch) resolved.pitch = substituteVariables(resolved.pitch, variables);
  if (resolved.closing) resolved.closing = substituteVariables(resolved.closing, variables);
  if (resolved.voicemail) resolved.voicemail = substituteVariables(resolved.voicemail, variables);
  if (resolved.subject) resolved.subject = substituteVariables(resolved.subject, variables);
  if (resolved.preheader) resolved.preheader = substituteVariables(resolved.preheader, variables);
  if (resolved.greeting) resolved.greeting = substituteVariables(resolved.greeting, variables);
  if (resolved.bodyIntro) resolved.bodyIntro = substituteVariables(resolved.bodyIntro, variables);
  if (resolved.valueProposition) resolved.valueProposition = substituteVariables(resolved.valueProposition, variables);
  if (resolved.callToAction) resolved.callToAction = substituteVariables(resolved.callToAction, variables);
  if (resolved.signature) resolved.signature = substituteVariables(resolved.signature, variables);

  if (resolved.objectionHandling) {
    for (const key of Object.keys(resolved.objectionHandling)) {
      resolved.objectionHandling[key] = substituteVariables(resolved.objectionHandling[key], variables);
    }
  }

  return resolved;
}
