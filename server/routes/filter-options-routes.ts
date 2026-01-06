/**
 * Filter Options API Routes
 * 
 * Provides endpoints for fetching filter option data with support for:
 * - Pagination
 * - Search/type-ahead
 * - Scoped dependencies (Country → State → City)
 * - Caching headers for performance
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  industryReference,
  companySizeReference,
  revenueRangeReference,
  seniorityLevelReference,
  jobFunctionReference,
  departmentReference,
  technologyReference,
  countryReference,
  stateReference,
  cityReference,
  users,
  campaigns,
  leads
} from "@shared/schema";
import { eq, ilike, inArray, and, desc, asc } from "drizzle-orm";
import {
  SENIORITY_LEVELS,
  EMPLOYEE_SIZE_BANDS,
  REVENUE_BANDS,
  JOB_FUNCTIONS,
  DEPARTMENTS,
  CAMPAIGN_STATUS_VALUES,
  CAMPAIGN_TYPE_VALUES,
  QA_STATUS_VALUES,
  EMAIL_VERIFICATION_STATUS,
  DIAL_MODE_VALUES
} from "@shared/referenceData";

const router = Router();

/**
 * GET /api/filters/options/industries
 * 
 * Fetch industry options from actual account data
 */
router.get('/industries', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    const { sql } = await import('drizzle-orm');
    
    // Build SQL query with parameters
    let sqlQuery;
    if (query && typeof query === 'string' && query.trim()) {
      sqlQuery = sql`
        SELECT DISTINCT industry_standardized as industry
        FROM accounts
        WHERE industry_standardized IS NOT NULL
          AND industry_standardized != ''
          AND industry_standardized ILIKE ${`%${query.trim()}%`}
        ORDER BY industry_standardized ASC
        LIMIT 100
      `;
    } else {
      sqlQuery = sql`
        SELECT DISTINCT industry_standardized as industry
        FROM accounts
        WHERE industry_standardized IS NOT NULL
          AND industry_standardized != ''
        ORDER BY industry_standardized ASC
        LIMIT 100
      `;
    }
    
    const results = await db.execute<{ industry: string }>(sqlQuery);
    
    // Format results
    const formatted = results.rows
      .filter(r => r.industry)
      .map(r => ({ id: r.industry, name: r.industry }));
    
    const cacheMaxAge = query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching industries:', error);
    res.status(500).json({ error: 'Failed to fetch industries' });
  }
});

/**
 * GET /api/filters/options/company-sizes
 * 
 * Fetch company size options from actual account data
 */
router.get('/company-sizes', async (req: Request, res: Response) => {
  try {
    const { sql } = await import('drizzle-orm');
    
    // Use text cast in SELECT to avoid enum validation issues
    const sqlQuery = sql`
      SELECT DISTINCT 
        CASE 
          WHEN employees_size_range IS NOT NULL THEN employees_size_range::text 
          ELSE NULL 
        END as size_range
      FROM accounts
      WHERE employees_size_range IS NOT NULL
      ORDER BY size_range ASC
      LIMIT 100
    `;
    
    const results = await db.execute<{ size_range: string | null }>(sqlQuery);
    
    // Format results - filter out empty strings and null values
    const formatted = results.rows
      .filter(r => r.size_range && r.size_range.trim() !== '')
      .map(r => ({ id: r.size_range!, name: r.size_range! }));
    
    res.set('Cache-Control', 'public, max-age=900');
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching company sizes:', error);
    res.status(500).json({ error: 'Failed to fetch company sizes' });
  }
});

/**
 * GET /api/filters/options/company-revenue
 * 
 * Fetch company revenue options from actual account data
 */
router.get('/company-revenue', async (req: Request, res: Response) => {
  try {
    const { sql } = await import('drizzle-orm');
    
    const sqlQuery = sql`
      SELECT DISTINCT annual_revenue as revenue
      FROM accounts
      WHERE annual_revenue IS NOT NULL
        AND annual_revenue != ''
      ORDER BY annual_revenue ASC
      LIMIT 100
    `;
    
    const results = await db.execute<{ revenue: string }>(sqlQuery);
    
    // Format results
    const formatted = results.rows
      .filter(r => r.revenue)
      .map(r => ({ id: r.revenue, name: r.revenue }));
    
    res.set('Cache-Control', 'public, max-age=900');
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching revenue ranges:', error);
    res.status(500).json({ error: 'Failed to fetch revenue ranges' });
  }
});

/**
 * GET /api/filters/options/seniority-levels
 * 
 * Fetch seniority level options from standardized reference data
 */
router.get('/seniority-levels', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    
    let results = [...SENIORITY_LEVELS];
    
    // Filter by search query if provided
    if (query && typeof query === 'string' && query.trim()) {
      const searchTerm = query.trim().toLowerCase();
      results = results.filter(item => 
        item.name.toLowerCase().includes(searchTerm)
      );
    }
    
    const cacheMaxAge = query ? 300 : 3600;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    
    res.json({ data: results });
  } catch (error) {
    console.error('Error fetching seniority levels:', error);
    res.status(500).json({ error: 'Failed to fetch seniority levels' });
  }
});

/**
 * GET /api/filters/options/job-functions
 * 
 * Fetch job function options with optional search
 */
router.get('/job-functions', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    
    let conditions = [eq(jobFunctionReference.isActive, true)];
    
    if (query && typeof query === 'string' && query.trim()) {
      conditions.push(ilike(jobFunctionReference.name, `%${query.trim()}%`));
    }
    
    const results = await db
      .select({
        id: jobFunctionReference.id,
        name: jobFunctionReference.name,
        description: jobFunctionReference.description
      })
      .from(jobFunctionReference)
      .where(and(...conditions))
      .orderBy(asc(jobFunctionReference.sortOrder));
    
    const cacheMaxAge = query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    
    res.json({ data: results });
  } catch (error) {
    console.error('Error fetching job functions:', error);
    res.status(500).json({ error: 'Failed to fetch job functions' });
  }
});

/**
 * GET /api/filters/options/departments
 * 
 * Fetch department options with optional search
 */
router.get('/departments', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    
    let conditions = [eq(departmentReference.isActive, true)];
    
    if (query && typeof query === 'string' && query.trim()) {
      conditions.push(ilike(departmentReference.name, `%${query.trim()}%`));
    }
    
    const results = await db
      .select({
        id: departmentReference.id,
        name: departmentReference.name,
        description: departmentReference.description
      })
      .from(departmentReference)
      .where(and(...conditions))
      .orderBy(asc(departmentReference.sortOrder));
    
    const cacheMaxAge = query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    
    res.json({ data: results });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

/**
 * GET /api/filters/options/technologies
 * 
 * Fetch technology options with optional search and category
 */
router.get('/technologies', async (req: Request, res: Response) => {
  try {
    const { query = '', category = '', page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    
    let conditions = [eq(technologyReference.isActive, true)];
    
    if (query && typeof query === 'string' && query.trim()) {
      conditions.push(ilike(technologyReference.name, `%${query.trim()}%`));
    }
    
    if (category && typeof category === 'string' && category.trim()) {
      conditions.push(eq(technologyReference.category, category.trim()));
    }
    
    const results = await db
      .select({
        id: technologyReference.id,
        name: technologyReference.name,
        category: technologyReference.category
      })
      .from(technologyReference)
      .where(and(...conditions))
      .orderBy(asc(technologyReference.name))
      .limit(limitNum)
      .offset(offset);
    
    const cacheMaxAge = query || category ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    
    res.json({
      data: results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        hasMore: results.length === limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching technologies:', error);
    res.status(500).json({ error: 'Failed to fetch technologies' });
  }
});

/**
 * GET /api/filters/options/countries
 * 
 * Fetch country options with optional search (type-ahead)
 */
router.get('/countries', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    
    let conditions = [eq(countryReference.isActive, true)];
    
    if (query && typeof query === 'string' && query.trim()) {
      conditions.push(ilike(countryReference.name, `%${query.trim()}%`));
    }
    
    const results = await db
      .select({
        id: countryReference.id,
        name: countryReference.name,
        code: countryReference.code
      })
      .from(countryReference)
      .where(and(...conditions))
      .orderBy(asc(countryReference.sortOrder))
      .limit(50);
    
    const cacheMaxAge = query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    
    res.json({ data: results });
  } catch (error) {
    console.error('Error fetching countries:', error);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

/**
 * GET /api/filters/options/states
 * 
 * Fetch state options with scoping by countries and optional search (type-ahead)
 * Query params: countries (comma-separated IDs), query (search term)
 */
router.get('/states', async (req: Request, res: Response) => {
  try {
    const { countries = '', query = '' } = req.query;
    
    let conditions = [eq(stateReference.isActive, true)];
    
    // Scope by countries if provided
    if (countries && typeof countries === 'string' && countries.trim()) {
      const countryIds = countries.split(',').map(id => id.trim()).filter(Boolean);
      if (countryIds.length > 0) {
        conditions.push(inArray(stateReference.countryId, countryIds));
      }
    }
    
    // Search by name
    if (query && typeof query === 'string' && query.trim()) {
      conditions.push(ilike(stateReference.name, `%${query.trim()}%`));
    }
    
    const results = await db
      .select({
        id: stateReference.id,
        name: stateReference.name,
        code: stateReference.code,
        countryId: stateReference.countryId
      })
      .from(stateReference)
      .where(and(...conditions))
      .orderBy(asc(stateReference.sortOrder))
      .limit(50);
    
    const cacheMaxAge = countries || query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    
    res.json({ data: results });
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ error: 'Failed to fetch states' });
  }
});

/**
 * GET /api/filters/options/cities
 * 
 * Fetch city options with scoping by countries/states and optional search (type-ahead)
 * Query params: countries (comma-separated IDs), states (comma-separated IDs), query (search term)
 */
router.get('/cities', async (req: Request, res: Response) => {
  try {
    const { countries = '', states = '', query = '', page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    
    let conditions = [eq(cityReference.isActive, true)];
    
    // Scope by countries if provided
    if (countries && typeof countries === 'string' && countries.trim()) {
      const countryIds = countries.split(',').map(id => id.trim()).filter(Boolean);
      if (countryIds.length > 0) {
        conditions.push(inArray(cityReference.countryId, countryIds));
      }
    }
    
    // Scope by states if provided (takes precedence over countries for filtering)
    if (states && typeof states === 'string' && states.trim()) {
      const stateIds = states.split(',').map(id => id.trim()).filter(Boolean);
      if (stateIds.length > 0) {
        conditions.push(inArray(cityReference.stateId, stateIds));
      }
    }
    
    // Search by name
    if (query && typeof query === 'string' && query.trim()) {
      conditions.push(ilike(cityReference.name, `%${query.trim()}%`));
    }
    
    const results = await db
      .select({
        id: cityReference.id,
        name: cityReference.name,
        stateId: cityReference.stateId,
        countryId: cityReference.countryId
      })
      .from(cityReference)
      .where(and(...conditions))
      .orderBy(asc(cityReference.sortOrder))
      .limit(limitNum)
      .offset(offset);
    
    const cacheMaxAge = countries || states || query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    
    res.json({
      data: results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        hasMore: results.length === limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

/**
 * GET /api/filters/options/users
 * 
 * Fetch user options (for Account Owner filter)
 * Query params: role (optional filter by role)
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { role = '' } = req.query;
    
    // Optional: filter by role if provided
    // Note: This would require joining with userRoles table
    // For now, we'll return all users
    
    const rawResults = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email
      })
      .from(users)
      .orderBy(asc(users.username))
      .limit(100);
    
    // Transform results to include full name
    const results = rawResults.map(user => ({
      id: user.id,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      email: user.email
    }));
    
    // Cache for 5 minutes (user data changes occasionally)
    res.set('Cache-Control', 'public, max-age=300');
    
    res.json({ data: results });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/filters/options/campaign-types
 * 
 * Fetch campaign type options from standardized reference data
 */
router.get('/campaign-types', async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data: CAMPAIGN_TYPE_VALUES });
  } catch (error) {
    console.error('Error fetching campaign types:', error);
    res.status(500).json({ error: 'Failed to fetch campaign types' });
  }
});

/**
 * GET /api/filters/options/campaign-status
 * 
 * Fetch campaign status options from standardized reference data
 */
router.get('/campaign-status', async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data: CAMPAIGN_STATUS_VALUES });
  } catch (error) {
    console.error('Error fetching campaign status:', error);
    res.status(500).json({ error: 'Failed to fetch campaign status' });
  }
});

/**
 * GET /api/filters/options/dial-modes
 * 
 * Fetch dial mode options from standardized reference data
 */
router.get('/dial-modes', async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data: DIAL_MODE_VALUES });
  } catch (error) {
    console.error('Error fetching dial modes:', error);
    res.status(500).json({ error: 'Failed to fetch dial modes' });
  }
});

/**
 * GET /api/filters/options/qa-status
 * 
 * Fetch QA status options from standardized reference data
 */
router.get('/qa-status', async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data: QA_STATUS_VALUES });
  } catch (error) {
    console.error('Error fetching QA status:', error);
    res.status(500).json({ error: 'Failed to fetch QA status' });
  }
});

/**
 * GET /api/filters/options/qa-outcomes
 * 
 * Fetch QA outcome options (approved, rejected, returned)
 */
router.get('/qa-outcomes', async (req: Request, res: Response) => {
  try {
    const outcomes = [
      { id: 'approved', name: 'Approved' },
      { id: 'rejected', name: 'Rejected' },
      { id: 'returned', name: 'Returned' }
    ];
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data: outcomes });
  } catch (error) {
    console.error('Error fetching QA outcomes:', error);
    res.status(500).json({ error: 'Failed to fetch QA outcomes' });
  }
});

/**
 * GET /api/filters/options/email-verification-status
 * 
 * Fetch email verification status options from standardized reference data
 */
router.get('/email-verification-status', async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data: EMAIL_VERIFICATION_STATUS });
  } catch (error) {
    console.error('Error fetching email verification status:', error);
    res.status(500).json({ error: 'Failed to fetch email verification status' });
  }
});

/**
 * GET /api/filters/options/phone-status
 * 
 * Fetch phone status options
 */
router.get('/phone-status', async (req: Request, res: Response) => {
  try {
    const statuses = [
      { id: 'unknown', name: 'Unknown' },
      { id: 'valid', name: 'Valid' },
      { id: 'invalid', name: 'Invalid' },
      { id: 'risky', name: 'Risky' }
    ];
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data: statuses });
  } catch (error) {
    console.error('Error fetching phone status:', error);
    res.status(500).json({ error: 'Failed to fetch phone status' });
  }
});

/**
 * GET /api/filters/options/contact-sources
 * 
 * Fetch unique contact source values from actual data
 */
router.get('/contact-sources', async (req: Request, res: Response) => {
  try {
    const { sql } = await import('drizzle-orm');
    
    const sqlQuery = sql`
      SELECT DISTINCT source_system as source
      FROM contacts
      WHERE source_system IS NOT NULL
        AND source_system != ''
      ORDER BY source_system ASC
      LIMIT 100
    `;
    
    const results = await db.execute<{ source: string }>(sqlQuery);
    
    const formatted = results.rows
      .filter(r => r.source)
      .map(r => ({ id: r.source, name: r.source }));
    
    res.set('Cache-Control', 'public, max-age=900');
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching contact sources:', error);
    res.status(500).json({ error: 'Failed to fetch contact sources' });
  }
});

/**
 * GET /api/filters/options/campaigns
 * 
 * Fetch campaign names for typeahead search
 */
router.get('/campaigns', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    const { sql } = await import('drizzle-orm');
    
    let sqlQuery;
    if (query && typeof query === 'string' && query.trim()) {
      sqlQuery = sql`
        SELECT id, name, campaign_type
        FROM campaigns
        WHERE name ILIKE ${`%${query.trim()}%`}
        ORDER BY name ASC
        LIMIT 50
      `;
    } else {
      sqlQuery = sql`
        SELECT id, name, campaign_type
        FROM campaigns
        ORDER BY name ASC
        LIMIT 50
      `;
    }
    
    const results = await db.execute<{ id: string; name: string; campaign_type: string }>(sqlQuery);
    
    const formatted = results.rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.campaign_type
    }));
    
    const cacheMaxAge = query ? 300 : 600;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

/**
 * GET /api/filters/options/lists
 * 
 * Fetch static lists for typeahead search from lists table
 */
router.get('/lists', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    const { lists } = await import('../../shared/schema');
    const { like, or, and } = await import('drizzle-orm');
    
    let results;
    if (query && typeof query === 'string' && query.trim()) {
      results = await db
        .select({
          id: lists.id,
          name: lists.name,
        })
        .from(lists)
        .where(
          like(lists.name, `%${query.trim()}%`)
        )
        .orderBy(lists.name)
        .limit(50);
    } else {
      results = await db
        .select({
          id: lists.id,
          name: lists.name,
        })
        .from(lists)
        .orderBy(lists.name)
        .limit(50);
    }
    
    const formatted = results.map(r => ({ 
      id: r.id, 
      name: r.name 
    }));
    
    const cacheMaxAge = query ? 300 : 600;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

/**
 * GET /api/filters/options/segments
 * 
 * Fetch dynamic segments for typeahead search from segments table
 */
router.get('/segments', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    const { segments } = await import('../../shared/schema');
    const { like } = await import('drizzle-orm');
    
    let results;
    if (query && typeof query === 'string' && query.trim()) {
      results = await db
        .select({
          id: segments.id,
          name: segments.name,
        })
        .from(segments)
        .where(
          like(segments.name, `%${query.trim()}%`)
        )
        .orderBy(segments.name)
        .limit(50);
    } else {
      results = await db
        .select({
          id: segments.id,
          name: segments.name,
        })
        .from(segments)
        .orderBy(segments.name)
        .limit(50);
    }
    
    const formatted = results.map(r => ({ 
      id: r.id, 
      name: r.name 
    }));
    
    const cacheMaxAge = query ? 300 : 600;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching segments:', error);
    res.status(500).json({ error: 'Failed to fetch segments' });
  }
});

/**
 * GET /api/filters/options/domain-sets
 * 
 * Fetch domain sets for typeahead search from domainSets table
 */
router.get('/domain-sets', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    const { domainSets } = await import('../../shared/schema');
    const { like } = await import('drizzle-orm');
    
    let results;
    if (query && typeof query === 'string' && query.trim()) {
      results = await db
        .select({
          id: domainSets.id,
          name: domainSets.name,
        })
        .from(domainSets)
        .where(
          like(domainSets.name, `%${query.trim()}%`)
        )
        .orderBy(domainSets.name)
        .limit(50);
    } else {
      results = await db
        .select({
          id: domainSets.id,
          name: domainSets.name,
        })
        .from(domainSets)
        .orderBy(domainSets.name)
        .limit(50);
    }
    
    const formatted = results.map(r => ({ 
      id: r.id, 
      name: r.name 
    }));
    
    const cacheMaxAge = query ? 300 : 600;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching domain sets:', error);
    res.status(500).json({ error: 'Failed to fetch domain sets' });
  }
});

/**
 * GET /api/filters/options/job-titles
 * 
 * Fetch unique job title values from actual contact data
 */
router.get('/job-titles', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    const { sql } = await import('drizzle-orm');
    
    let sqlQuery;
    if (query && typeof query === 'string' && query.trim()) {
      sqlQuery = sql`
        SELECT DISTINCT job_title as title
        FROM contacts
        WHERE job_title IS NOT NULL
          AND job_title != ''
          AND job_title ILIKE ${`%${query.trim()}%`}
        ORDER BY job_title ASC
        LIMIT 100
      `;
    } else {
      sqlQuery = sql`
        SELECT DISTINCT job_title as title
        FROM contacts
        WHERE job_title IS NOT NULL
          AND job_title != ''
        ORDER BY job_title ASC
        LIMIT 100
      `;
    }
    
    const results = await db.execute<{ title: string }>(sqlQuery);
    
    const formatted = results.rows
      .filter(r => r.title)
      .map(r => ({ id: r.title, name: r.title }));
    
    const cacheMaxAge = query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching job titles:', error);
    res.status(500).json({ error: 'Failed to fetch job titles' });
  }
});

/**
 * GET /api/filters/options/contact-tags
 * 
 * Fetch unique contact tag values from actual contact data (unnest array field)
 */
router.get('/contact-tags', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    const { sql } = await import('drizzle-orm');
    
    let sqlQuery;
    if (query && typeof query === 'string' && query.trim()) {
      sqlQuery = sql`
        SELECT DISTINCT t.tag
        FROM contacts
        CROSS JOIN LATERAL unnest(tags) AS t(tag)
        WHERE tags IS NOT NULL
          AND array_length(tags, 1) > 0
          AND t.tag ILIKE ${`%${query.trim()}%`}
        ORDER BY t.tag ASC
        LIMIT 100
      `;
    } else {
      sqlQuery = sql`
        SELECT DISTINCT t.tag
        FROM contacts
        CROSS JOIN LATERAL unnest(tags) AS t(tag)
        WHERE tags IS NOT NULL
          AND array_length(tags, 1) > 0
        ORDER BY t.tag ASC
        LIMIT 100
      `;
    }
    
    const results = await db.execute<{ tag: string }>(sqlQuery);
    
    const formatted = results.rows
      .filter(r => r.tag)
      .map(r => ({ id: r.tag, name: r.tag }));
    
    const cacheMaxAge = query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching contact tags:', error);
    res.status(500).json({ error: 'Failed to fetch contact tags' });
  }
});

/**
 * GET /api/filters/options/account-tags
 * 
 * Fetch unique account tag values from actual account data (unnest array field)
 */
router.get('/account-tags', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    const { sql } = await import('drizzle-orm');
    
    let sqlQuery;
    if (query && typeof query === 'string' && query.trim()) {
      sqlQuery = sql`
        SELECT DISTINCT t.tag
        FROM accounts
        CROSS JOIN LATERAL unnest(tags) AS t(tag)
        WHERE tags IS NOT NULL
          AND array_length(tags, 1) > 0
          AND t.tag ILIKE ${`%${query.trim()}%`}
        ORDER BY t.tag ASC
        LIMIT 100
      `;
    } else {
      sqlQuery = sql`
        SELECT DISTINCT t.tag
        FROM accounts
        CROSS JOIN LATERAL unnest(tags) AS t(tag)
        WHERE tags IS NOT NULL
          AND array_length(tags, 1) > 0
        ORDER BY t.tag ASC
        LIMIT 100
      `;
    }
    
    const results = await db.execute<{ tag: string }>(sqlQuery);
    
    const formatted = results.rows
      .filter(r => r.tag)
      .map(r => ({ id: r.tag, name: r.tag }));
    
    const cacheMaxAge = query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching account tags:', error);
    res.status(500).json({ error: 'Failed to fetch account tags' });
  }
});

/**
 * GET /api/filters/options/consent-basis
 * 
 * Fetch unique consent basis values from actual contact data
 */
router.get('/consent-basis', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    const { sql } = await import('drizzle-orm');
    
    let sqlQuery;
    if (query && typeof query === 'string' && query.trim()) {
      sqlQuery = sql`
        SELECT DISTINCT consent_basis as basis
        FROM contacts
        WHERE consent_basis IS NOT NULL
          AND consent_basis != ''
          AND consent_basis ILIKE ${`%${query.trim()}%`}
        ORDER BY consent_basis ASC
        LIMIT 50
      `;
    } else {
      sqlQuery = sql`
        SELECT DISTINCT consent_basis as basis
        FROM contacts
        WHERE consent_basis IS NOT NULL
          AND consent_basis != ''
        ORDER BY consent_basis ASC
        LIMIT 50
      `;
    }
    
    const results = await db.execute<{ basis: string }>(sqlQuery);
    
    const formatted = results.rows
      .filter(r => r.basis)
      .map(r => ({ id: r.basis, name: r.basis }));
    
    const cacheMaxAge = query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching consent basis:', error);
    res.status(500).json({ error: 'Failed to fetch consent basis' });
  }
});

/**
 * GET /api/filters/options/consent-source
 * 
 * Fetch unique consent source values from actual contact data
 */
router.get('/consent-source', async (req: Request, res: Response) => {
  try {
    const { query = '' } = req.query;
    const { sql } = await import('drizzle-orm');
    
    let sqlQuery;
    if (query && typeof query === 'string' && query.trim()) {
      sqlQuery = sql`
        SELECT DISTINCT consent_source as source
        FROM contacts
        WHERE consent_source IS NOT NULL
          AND consent_source != ''
          AND consent_source ILIKE ${`%${query.trim()}%`}
        ORDER BY consent_source ASC
        LIMIT 50
      `;
    } else {
      sqlQuery = sql`
        SELECT DISTINCT consent_source as source
        FROM contacts
        WHERE consent_source IS NOT NULL
          AND consent_source != ''
        ORDER BY consent_source ASC
        LIMIT 50
      `;
    }
    
    const results = await db.execute<{ source: string }>(sqlQuery);
    
    const formatted = results.rows
      .filter(r => r.source)
      .map(r => ({ id: r.source, name: r.source }));
    
    const cacheMaxAge = query ? 300 : 900;
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.json({ data: formatted });
  } catch (error) {
    console.error('Error fetching consent source:', error);
    res.status(500).json({ error: 'Failed to fetch consent source' });
  }
});

export default router;
