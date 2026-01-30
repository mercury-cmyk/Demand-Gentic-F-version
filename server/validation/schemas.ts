import { z } from 'zod';

/**
 * VALIDATION SCHEMAS
 * Zod schemas for request validation to prevent injection attacks and ensure data integrity
 */

// Authentication schemas
export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

export const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

// User management schemas
export const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  email: z.string().email('Invalid email address').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: z.enum(['admin', 'agent', 'quality_analyst', 'content_creator', 'campaign_manager']),
});

export const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  role: z.enum(['admin', 'agent', 'quality_analyst', 'content_creator', 'campaign_manager']).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const assignRoleSchema = z.object({
  role: z.enum(['admin', 'agent', 'quality_analyst', 'content_creator', 'campaign_manager']),
});

// Contact schemas
export const createContactSchema = z.object({
  accountId: z.string().uuid().optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  directPhone: z.string().max(50).optional(),
  mobilePhone: z.string().max(50).optional(),
  jobTitle: z.string().max(200).optional(),
  department: z.string().max(100).optional(),
  status: z.enum(['active', 'inactive', 'bounced']).optional(),
});

// Account schemas
export const createAccountSchema = z.object({
  name: z.string().min(1).max(500),
  website: z.string().url().optional().or(z.literal('')),
  industry: z.string().max(200).optional(),
  employeeCount: z.number().int().min(0).optional(),
  revenue: z.number().min(0).optional(),
  country: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
});

// Campaign schemas
export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['email', 'telemarketing']),
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'completed']).optional(),
  targetAudience: z.string().max(1000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// Lead schemas
export const updateLeadStatusSchema = z.object({
  status: z.enum(['new', 'under_review', 'approved', 'rejected', 'published']),
  notes: z.string().max(2000).optional(),
});

// Suppression schemas
export const addSuppressionSchema = z.object({
  value: z.string().min(1).max(500),
  type: z.enum(['email', 'phone']),
  reason: z.string().max(500).optional(),
});

export const addCampaignSuppressionSchema = z.object({
  contactId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
}).refine(data => data.contactId || data.accountId, {
  message: 'Either contactId or accountId must be provided',
});

// Bulk operation schemas
export const bulkSuppressionSchema = z.object({
  suppressions: z.array(z.object({
    value: z.string().min(1).max(500),
    type: z.enum(['email', 'phone']),
    reason: z.string().max(500).optional(),
  })).min(1).max(50000), // Limit bulk operations to 50k items
});

// Queue management schemas
export const manualQueueSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(50000),
  agentId: z.string().uuid(),
});

// Filter schemas
export const filterSchema = z.object({
  field: z.string().min(1).max(100),
  operator: z.enum(['equals', 'contains', 'startsWith', 'endsWith', 'greaterThan', 'lessThan', 'in']),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number()])),
  ]),
});

// Pagination schemas
export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1)).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(50000)).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// ID parameter schemas
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const campaignIdSchema = z.object({
  campaignId: z.string().uuid('Invalid campaign ID format'),
});

export const userIdSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
});

// Search schemas
export const searchSchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(['accounts', 'contacts', 'campaigns', 'leads']).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
});

// Date range schemas
export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).refine(data => {
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) <= new Date(data.endDate);
  }
  return true;
}, {
  message: 'Start date must be before or equal to end date',
});

// Export schemas
export const exportRequestSchema = z.object({
  format: z.enum(['csv', 'xlsx', 'json']),
  filters: z.array(filterSchema).optional(),
  fields: z.array(z.string()).optional(),
});

// Import schemas
export const importConfigSchema = z.object({
  fileType: z.enum(['csv', 'xlsx']),
  hasHeader: z.boolean().default(true),
  delimiter: z.enum([',', ';', '\t', '|']).optional(),
  fieldMapping: z.record(z.string()).optional(),
});

// Webhook schemas
export const webhookSchema = z.object({
  url: z.string().url('Invalid webhook URL'),
  events: z.array(z.string()).min(1),
  secret: z.string().min(16).optional(),
});

// Settings schemas
export const updateSettingsSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.union([z.string(), z.number(), z.boolean(), z.object({})]),
});

// Lead Intake API schema
export const leadIntakeSchema = z.object({
  email: z.string().email('Valid email is required'),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  company: z.string().max(500).optional(),
  companyDomain: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  jobTitle: z.string().max(200).optional(),
  department: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
  consentBasis: z.string().max(100).optional(),
  consentSource: z.string().max(255).optional(),
});
