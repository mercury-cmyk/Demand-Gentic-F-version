/**
 * AI Project Orchestrator
 * Converts natural language input into structured project and campaign data
 * Uses DeepSeek for intelligent extraction with confidence scoring
 */

import OpenAI from 'openai';
import { z } from 'zod';

// Zod schema for AI extraction validation
export const extractedProjectDataSchema = z.object({
  projectName: z.string().optional(),
  clientName: z.string().optional(),
  targetAudience: z.object({
    jobTitles: z.array(z.string()).optional(),
    industries: z.array(z.string()).optional(),
    companySize: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
    geography: z.array(z.string()).optional(),
  }).optional(),
  channels: z.array(z.enum(['email', 'call', 'verification', 'combo'])).optional(),
  volume: z.number().optional(),
  costPerLead: z.number().optional(),
  timeline: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional(),
  deliveryMethods: z.array(z.enum(['dashboard', 'excel', 'api', 'email', 'sftp'])).optional(),
  specialRequirements: z.array(z.string()).optional(),
});

export type ExtractedProjectData = z.infer<typeof extractedProjectDataSchema>;

/**
 * Extract structured project data from natural language
 */
export async function extractProjectFromNaturalLanguage(
  prompt: string
): Promise<{
  extractedData: ExtractedProjectData;
  confidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  modelUsed: string;
  processingTime: number;
  validationErrors: string[];
  validationWarnings: string[];
}> {
  const startTime = Date.now();
  
  try {
    const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
    if (!hasDeepSeek) {
      return {
        extractedData: {},
        confidenceScore: 0,
        confidenceLevel: 'low',
        modelUsed: 'disabled',
        processingTime: Date.now() - startTime,
        validationErrors: [],
        validationWarnings: ['DeepSeek not configured: set DEEPSEEK_API_KEY']
      };
    }
    const deepseek = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      timeout: 120_000,
      maxRetries: 2,
    });
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are an expert B2B CRM assistant that extracts structured project and campaign data from natural language descriptions.
Always respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON.

Your task is to analyze the user's request and extract a JSON object with these fields:
- projectName (string): Name or title of the project
- clientName (string): Client or company name
- targetAudience (object): { jobTitles: string[], industries: string[], companySize: { min: number, max: number }, geography: string[] }
- channels (string[]): Campaign channels, valid values: "email", "call", "verification", "combo"
- volume (number): Target number of leads
- costPerLead (number): Cost per lead in dollars
- timeline (object): { start: string (ISO date), end: string (ISO date) }
- deliveryMethods (string[]): Valid values: "dashboard", "excel", "api", "email", "sftp"
- specialRequirements (string[]): Any special requirements or custom needs

Be conservative in your extraction:
- Only extract information that is explicitly stated or can be reasonably inferred
- Use standard formats (ISO dates for timeline, numbers for volume/cost)
- For geography, use standard country/region names
- For job titles, use standard business titles (CFO, CEO, Marketing Director, etc.)
- For company size, use employee count ranges
- If information is unclear or missing, omit those fields rather than guessing.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const processingTime = Date.now() - startTime;

    const responseText = completion.choices[0]?.message?.content || '{}';
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const rawExtractedData = JSON.parse(cleaned);
    
    // Validate with Zod
    let extractedData = extractedProjectDataSchema.parse(rawExtractedData);

    // Normalize timeline dates (parse relative dates to ISO format)
    if (extractedData.timeline) {
      if (extractedData.timeline.start) {
        const parsedStart = parseRelativeDate(extractedData.timeline.start);
        if (parsedStart) {
          extractedData.timeline.start = parsedStart;
        }
      }
      if (extractedData.timeline.end) {
        const parsedEnd = parseRelativeDate(extractedData.timeline.end);
        if (parsedEnd) {
          extractedData.timeline.end = parsedEnd;
        }
      }
    }

    // Calculate confidence score based on completeness
    const { confidenceScore, confidenceLevel } = calculateConfidence(extractedData);

    // Validate extracted data
    const { validationErrors, validationWarnings } = validateExtractedData(extractedData);

    return {
      extractedData,
      confidenceScore,
      confidenceLevel,
      modelUsed: 'deepseek-chat',
      processingTime,
      validationErrors,
      validationWarnings,
    };
  } catch (error) {
    console.error('[AI Orchestrator] Extraction failed:', error);
    throw new Error(`Failed to extract project data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Calculate confidence score based on data completeness
 */
function calculateConfidence(data: ExtractedProjectData): {
  confidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
} {
  let score = 0;
  let maxScore = 0;

  // Critical fields (20 points each)
  const criticalFields = [
    data.projectName,
    data.clientName,
    data.channels && data.channels.length > 0,
    data.volume,
  ];
  
  criticalFields.forEach((field) => {
    maxScore += 20;
    if (field) score += 20;
  });

  // Important fields (10 points each)
  const importantFields = [
    data.costPerLead,
    data.targetAudience?.jobTitles && data.targetAudience.jobTitles.length > 0,
    data.targetAudience?.geography && data.targetAudience.geography.length > 0,
    data.deliveryMethods && data.deliveryMethods.length > 0,
  ];

  importantFields.forEach((field) => {
    maxScore += 10;
    if (field) score += 10;
  });

  // Additional fields (5 points each)
  const additionalFields = [
    data.targetAudience?.industries && data.targetAudience.industries.length > 0,
    data.targetAudience?.companySize,
    data.timeline?.start,
  ];

  additionalFields.forEach((field) => {
    maxScore += 5;
    if (field) score += 5;
  });

  // Handle empty extraction (division by zero guard)
  const confidenceScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  // Determine confidence level
  let confidenceLevel: 'high' | 'medium' | 'low';
  if (confidenceScore >= 85) {
    confidenceLevel = 'high';
  } else if (confidenceScore >= 60) {
    confidenceLevel = 'medium';
  } else {
    confidenceLevel = 'low';
  }

  return { confidenceScore, confidenceLevel };
}

/**
 * Validate extracted data and return errors/warnings
 */
function validateExtractedData(data: ExtractedProjectData): {
  validationErrors: string[];
  validationWarnings: string[];
} {
  const validationErrors: string[] = [];
  const validationWarnings: string[] = [];

  // Critical validations (errors) - only truly blocking issues
  if (!data.projectName && !data.clientName) {
    validationErrors.push('Either project name or client name must be specified');
  }

  // Company size validation
  if (data.targetAudience?.companySize) {
    const { min, max } = data.targetAudience.companySize;
    if (min && max && min > max) {
      validationErrors.push('Company size minimum cannot be greater than maximum');
    }
  }

  // Important validations (warnings) - can be addressed during review
  if (!data.channels || data.channels.length === 0) {
    validationWarnings.push('No campaign channel specified - will need to be added during review');
  }

  if (!data.volume || data.volume <= 0) {
    validationWarnings.push('Lead volume not specified or invalid - will need clarification');
  }

  if (!data.costPerLead) {
    validationWarnings.push('Cost per lead not specified - budget planning may be incomplete');
  }

  if (!data.targetAudience?.jobTitles || data.targetAudience.jobTitles.length === 0) {
    validationWarnings.push('No job titles specified - audience targeting may be too broad');
  }

  if (!data.targetAudience?.geography || data.targetAudience.geography.length === 0) {
    validationWarnings.push('No geography specified - assuming global or will need clarification');
  }

  if (!data.deliveryMethods || data.deliveryMethods.length === 0) {
    validationWarnings.push('No delivery method specified - will default to dashboard');
  }

  if (!data.timeline?.start) {
    validationWarnings.push('No start date specified - project timeline unclear');
  }

  return { validationErrors, validationWarnings };
}

/**
 * Redact PII from prompt for safe storage and learning
 */
export function redactPII(text: string): string {
  let redacted = text;

  // Email addresses
  redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');

  // Phone numbers - comprehensive patterns
  // US/Canada formats
  redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');
  redacted = redacted.replace(/\b\(\d{3}\)\s?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');
  redacted = redacted.replace(/\b1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE_REDACTED]');
  
  // UK formats
  redacted = redacted.replace(/\b0\d{3}\s?\d{3}\s?\d{4}\b/g, '[PHONE_REDACTED]');
  redacted = redacted.replace(/\b\+44\s?\d{3,4}\s?\d{3,4}\s?\d{3,4}\b/g, '[PHONE_REDACTED]');
  
  // International format
  redacted = redacted.replace(/\b\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g, '[PHONE_REDACTED]');

  // Credit card numbers
  redacted = redacted.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REDACTED]');

  // SSN/National ID patterns
  redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ID_REDACTED]'); // US SSN
  redacted = redacted.replace(/\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Z]\b/g, '[ID_REDACTED]'); // UK NI

  // IP addresses
  redacted = redacted.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP_REDACTED]');

  // Postal codes (US, UK, Canada)
  redacted = redacted.replace(/\b\d{5}(-\d{4})?\b/g, '[POSTAL_REDACTED]'); // US ZIP
  redacted = redacted.replace(/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/g, '[POSTAL_REDACTED]'); // UK postcode
  redacted = redacted.replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/g, '[POSTAL_REDACTED]'); // Canadian postal

  return redacted;
}

/**
 * Parse relative date strings to ISO format
 */
export function parseRelativeDate(dateString: string): string | null {
  const now = new Date();
  const lower = dateString.toLowerCase().trim();

  // Today/now
  if (lower === 'today' || lower === 'now') {
    return now.toISOString().split('T')[0];
  }

  // Tomorrow
  if (lower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  // Next week
  if (lower.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  }

  // In X days
  const daysMatch = lower.match(/in (\d+) days?/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    const future = new Date(now);
    future.setDate(now.getDate() + days);
    return future.toISOString().split('T')[0];
  }

  // In X weeks
  const weeksMatch = lower.match(/in (\d+) weeks?/);
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1], 10);
    const future = new Date(now);
    future.setDate(now.getDate() + (weeks * 7));
    return future.toISOString().split('T')[0];
  }

  // Next month
  if (lower.includes('next month')) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(now.getMonth() + 1);
    return nextMonth.toISOString().split('T')[0];
  }

  // In X months
  const monthsMatch = lower.match(/in (\d+) months?/);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1], 10);
    const future = new Date(now);
    future.setMonth(now.getMonth() + months);
    return future.toISOString().split('T')[0];
  }

  // Try to parse as ISO date (YYYY-MM-DD)
  const isoMatch = dateString.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[0];
  }

  // Try common date formats (MM/DD/YYYY, DD/MM/YYYY)
  const slashMatch = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    // Assume MM/DD/YYYY (US format) - could be enhanced with locale detection
    const month = slashMatch[1].padStart(2, '0');
    const day = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Return original if no pattern matches
  return null;
}
