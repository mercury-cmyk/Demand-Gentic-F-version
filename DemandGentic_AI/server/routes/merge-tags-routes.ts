/**
 * Merge Tags API Routes
 * Endpoints for managing and previewing email merge tags
 */

import { Router } from 'express';
import {
  MERGE_TAGS,
  getMergeDataForContact,
  replaceMergeTags,
  validateMergeTags,
  previewWithSampleData,
  extractMergeTags,
} from '../lib/email-merge-service';

export const mergeTagsRouter = Router();

/**
 * GET /api/merge-tags
 * Get list of all available merge tags
 */
mergeTagsRouter.get('/', async (req, res) => {
  try {
    // Group merge tags by category
    const groupedTags = {
      contact: {} as Record,
      account: {} as Record,
      campaign: {} as Record,
      sender: {} as Record,
      system: {} as Record,
    };

    Object.entries(MERGE_TAGS).forEach(([tag, label]) => {
      if (tag.startsWith('contact.')) {
        groupedTags.contact[tag] = label;
      } else if (tag.startsWith('account.')) {
        groupedTags.account[tag] = label;
      } else if (tag.startsWith('campaign.')) {
        groupedTags.campaign[tag] = label;
      } else if (tag.startsWith('sender.')) {
        groupedTags.sender[tag] = label;
      } else {
        groupedTags.system[tag] = label;
      }
    });

    res.json({
      tags: MERGE_TAGS,
      grouped: groupedTags,
    });
  } catch (error) {
    console.error('Error fetching merge tags:', error);
    res.status(500).json({ error: 'Failed to fetch merge tags' });
  }
});

/**
 * POST /api/merge-tags/validate
 * Validate merge tags in content
 */
mergeTagsRouter.post('/validate', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = validateMergeTags(content);
    
    res.json({
      isValid: result.invalid.length === 0,
      valid: result.valid,
      invalid: result.invalid,
      totalTags: result.valid.length + result.invalid.length,
    });
  } catch (error) {
    console.error('Error validating merge tags:', error);
    res.status(500).json({ error: 'Failed to validate merge tags' });
  }
});

/**
 * POST /api/merge-tags/preview
 * Preview content with sample merge data
 */
mergeTagsRouter.post('/preview', async (req, res) => {
  try {
    const { content, contactId, campaignId, senderProfileId } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    let previewContent: string;
    let mergeData: any = null;

    if (contactId) {
      // Use real contact data for preview
      mergeData = await getMergeDataForContact(contactId, campaignId, senderProfileId);
      previewContent = replaceMergeTags(content, mergeData, { preserveUnknownTags: true });
    } else {
      // Use sample data for preview
      previewContent = previewWithSampleData(content);
    }

    const extracted = extractMergeTags(content);
    const validation = validateMergeTags(content);

    res.json({
      original: content,
      preview: previewContent,
      tagsUsed: extracted,
      validation,
      mergeData: mergeData || 'sample',
    });
  } catch (error) {
    console.error('Error previewing merge tags:', error);
    res.status(500).json({ error: 'Failed to preview merge tags' });
  }
});

/**
 * POST /api/merge-tags/extract
 * Extract all merge tags from content
 */
mergeTagsRouter.post('/extract', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const tags = extractMergeTags(content);
    const validation = validateMergeTags(content);

    res.json({
      tags,
      count: tags.length,
      valid: validation.valid,
      invalid: validation.invalid,
    });
  } catch (error) {
    console.error('Error extracting merge tags:', error);
    res.status(500).json({ error: 'Failed to extract merge tags' });
  }
});

/**
 * POST /api/merge-tags/process
 * Process content by replacing merge tags with actual contact data
 */
mergeTagsRouter.post('/process', async (req, res) => {
  try {
    const { content, contactId, campaignId, senderProfileId, options } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    if (!contactId) {
      return res.status(400).json({ error: 'Contact ID is required for processing' });
    }

    const mergeData = await getMergeDataForContact(contactId, campaignId, senderProfileId);
    const processedContent = replaceMergeTags(content, mergeData, options || {});

    res.json({
      original: content,
      processed: processedContent,
      mergeData,
    });
  } catch (error) {
    console.error('Error processing merge tags:', error);
    res.status(500).json({ error: 'Failed to process merge tags' });
  }
});

/**
 * GET /api/merge-tags/contact/:contactId
 * Get merge data for a specific contact
 */
mergeTagsRouter.get('/contact/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { campaignId, senderProfileId } = req.query;

    const mergeData = await getMergeDataForContact(
      contactId,
      campaignId as string,
      senderProfileId as string
    );

    res.json(mergeData);
  } catch (error) {
    console.error('Error fetching contact merge data:', error);
    res.status(500).json({ error: 'Failed to fetch contact merge data' });
  }
});