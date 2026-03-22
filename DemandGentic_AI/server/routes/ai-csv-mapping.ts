import { Router } from 'express';
import { requireAuth } from '../auth';
import { AiFieldMatcherService } from '../lib/ai-field-matcher';
import { db } from '../db';
import { customFieldDefinitions } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * POST /api/csv-ai-mapping/suggest
 * Get AI-powered field mapping suggestions
 * 
 * Body:
 * - csvHeaders: string[] - CSV column headers
 * - csvData: string[][] - Sample CSV rows (first 10-20 rows recommended)
 */
router.post('/api/csv-ai-mapping/suggest', requireAuth, async (req, res) => {
  try {
    const { csvHeaders, csvData } = req.body;

    if (!csvHeaders || !Array.isArray(csvHeaders) || csvHeaders.length === 0) {
      return res.status(400).json({ error: 'csvHeaders is required and must be a non-empty array' });
    }

    if (!csvData || !Array.isArray(csvData)) {
      return res.status(400).json({ error: 'csvData is required and must be an array' });
    }

    // Fetch ALL active custom fields (organization-wide, not just user-created)
    // This ensures AI can suggest mappings for any custom field in the system
    const allActiveCustomFields = await db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.active, true));

    console.log(`[AI CSV Mapping] Found ${allActiveCustomFields.length} active custom fields for AI suggestions`);

    // Get AI suggestions
    const suggestions = await AiFieldMatcherService.suggestMappings(
      csvHeaders,
      csvData.slice(0, 20), // Limit to first 20 rows for performance
      allActiveCustomFields
    );

    res.json({
      suggestions,
      metadata: {
        totalColumns: csvHeaders.length,
        sampledRows: Math.min(csvData.length, 20),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[AI CSV Mapping] Error generating suggestions:', error);
    res.status(500).json({
      error: 'Failed to generate AI mapping suggestions',
      message: error.message,
      fallback: true, // Signal frontend to use fallback mapping
    });
  }
});

export default router;