/**
 * Campaign Templates API Routes
 *
 * Manages layered template system (campaign, account, contact levels)
 * for both email and voice channels.
 */

import { Router, Request, Response } from 'express';
import type { ChannelType, TemplateScope } from '@shared/multi-channel-types';
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  createDefaultTemplates,
  resolveTemplatesForExecution,
  resolveAndSubstituteTemplates,
} from '../services/template-resolution-service';

const router = Router();

// ============================================================
// TEMPLATE CRUD
// ============================================================

/**
 * GET /api/campaigns/:id/templates
 * List all templates for a campaign
 */
router.get('/:id/templates', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { channelType, scope, accountId, contactId } = req.query;

    const templates = await listTemplates({
      campaignId: id,
      channelType: channelType as ChannelType | undefined,
      scope: scope as TemplateScope | undefined,
      accountId: accountId as string | undefined,
      contactId: contactId as string | undefined,
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: error.message || 'Failed to list templates' });
  }
});

/**
 * GET /api/campaigns/:id/templates/:templateId
 * Get a specific template
 */
router.get('/:id/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    const template = await getTemplate(templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: error.message || 'Failed to get template' });
  }
});

/**
 * POST /api/campaigns/:id/templates
 * Create a new template
 */
router.post('/:id/templates', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const {
      channelType,
      scope,
      accountId,
      contactId,
      name,
      templateType,
      content,
      variables,
      priority,
    } = req.body;

    // Validate required fields
    if (!channelType || (channelType !== 'email' && channelType !== 'voice')) {
      return res.status(400).json({ error: 'channelType required (email or voice)' });
    }

    if (!scope || !['campaign', 'account', 'contact'].includes(scope)) {
      return res.status(400).json({ error: 'scope required (campaign, account, or contact)' });
    }

    if (!name || !templateType || !content) {
      return res.status(400).json({ error: 'name, templateType, and content are required' });
    }

    const template = await createTemplate({
      campaignId: id,
      channelType: channelType as ChannelType,
      scope: scope as TemplateScope,
      accountId,
      contactId,
      name,
      templateType,
      content,
      variables,
      priority,
      createdBy: userId,
    });

    res.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: error.message || 'Failed to create template' });
  }
});

/**
 * PATCH /api/campaigns/:id/templates/:templateId
 * Update a template
 */
router.patch('/:id/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { name, content, variables, priority, isActive } = req.body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (content !== undefined) updates.content = content;
    if (variables !== undefined) updates.variables = variables;
    if (priority !== undefined) updates.priority = priority;
    if (isActive !== undefined) updates.isActive = isActive;

    const template = await updateTemplate(templateId, updates);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: error.message || 'Failed to update template' });
  }
});

/**
 * DELETE /api/campaigns/:id/templates/:templateId
 * Delete a template
 */
router.delete('/:id/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    await deleteTemplate(templateId);

    res.json({
      success: true,
      message: 'Template deleted',
    });
  } catch (error: any) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: error.message || 'Failed to delete template' });
  }
});

// ============================================================
// TEMPLATE RESOLUTION
// ============================================================

/**
 * GET /api/campaigns/:id/templates/resolve
 * Resolve templates for a specific execution context
 */
router.get('/:id/templates/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { channelType, accountId, contactId, substitute } = req.query;

    if (!channelType || (channelType !== 'email' && channelType !== 'voice')) {
      return res.status(400).json({ error: 'channelType query parameter required (email or voice)' });
    }

    let resolved;
    if (substitute === 'true') {
      // Resolve and substitute variables
      resolved = await resolveAndSubstituteTemplates({
        campaignId: id,
        channelType: channelType as ChannelType,
        accountId: accountId as string | undefined,
        contactId: contactId as string | undefined,
      });
    } else {
      // Just resolve without substitution
      resolved = await resolveTemplatesForExecution({
        campaignId: id,
        channelType: channelType as ChannelType,
        accountId: accountId as string | undefined,
        contactId: contactId as string | undefined,
      });
    }

    res.json({
      success: true,
      data: resolved,
    });
  } catch (error: any) {
    console.error('Error resolving templates:', error);
    res.status(500).json({ error: error.message || 'Failed to resolve templates' });
  }
});

// ============================================================
// BULK OPERATIONS
// ============================================================

/**
 * POST /api/campaigns/:id/templates/create-defaults
 * Create default templates for a channel
 */
router.post('/:id/templates/create-defaults', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { channelType } = req.body;
    const userId = (req as any).user?.id;

    if (!channelType || (channelType !== 'email' && channelType !== 'voice')) {
      return res.status(400).json({ error: 'channelType required (email or voice)' });
    }

    const templates = await createDefaultTemplates(id, channelType as ChannelType, userId);

    res.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    console.error('Error creating default templates:', error);
    res.status(500).json({ error: error.message || 'Failed to create default templates' });
  }
});

export default router;
