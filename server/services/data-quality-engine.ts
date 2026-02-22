/**
 * AI-Powered Data Quality Engine
 * 
 * Provides comprehensive data quality analysis, validation, and AI-driven
 * recommendations for audience data. Supports:
 * - Structural validation
 * - Missing field detection
 * - Industry/title normalization
 * - Duplicate detection
 * - Format validation
 * - ICP alignment scoring
 * - Template compliance
 * - AI-powered enrichment recommendations
 */

import { db } from "../db";
import { contacts, accounts, dataQualityIssues, dataQualityScans, dataTemplates } from "@shared/schema";
import { eq, sql, isNull, and, count, like, or, inArray, desc } from "drizzle-orm";

// ==================== TYPES ====================

export interface DataQualityReport {
  overallHealthScore: number;
  completenessScore: number;
  accuracyScore: number;
  consistencyScore: number;
  complianceScore: number;
  icpAlignmentScore: number;
  totalRecords: number;
  issuesFound: number;
  issueBreakdown: Record<string, number>;
  fieldCoverage: Record<string, number>;
  recommendations: QualityRecommendation[];
  scanId: string;
}

export interface QualityRecommendation {
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedRecords: number;
  suggestedAction: string;
  automatable: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  detectedSchema: DetectedColumn[];
  qualityScore: number;
  completenessScore: number;
}

interface ValidationError {
  row?: number;
  field: string;
  value: string;
  error: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface ValidationWarning {
  field: string;
  message: string;
  affectedRows: number;
  suggestion?: string;
}

interface DetectedColumn {
  name: string;
  detectedType: string;
  sampleValues: string[];
  nullPercentage: number;
  uniquePercentage: number;
  suggestedMapping?: string;
}

// ==================== INDUSTRY TAXONOMY ====================

const STANDARD_INDUSTRIES: Record<string, string[]> = {
  'Technology': ['tech', 'software', 'saas', 'it services', 'information technology', 'computer', 'digital', 'cloud'],
  'Financial Services': ['finance', 'banking', 'insurance', 'fintech', 'investment', 'capital', 'wealth', 'credit'],
  'Healthcare': ['health', 'medical', 'pharma', 'pharmaceutical', 'biotech', 'clinical', 'hospital', 'wellness'],
  'Manufacturing': ['manufacturing', 'industrial', 'production', 'factory', 'assembly'],
  'Retail': ['retail', 'e-commerce', 'ecommerce', 'consumer goods', 'shopping', 'merchandise'],
  'Energy': ['energy', 'oil', 'gas', 'renewable', 'solar', 'wind', 'utilities', 'power'],
  'Telecommunications': ['telecom', 'telecommunications', 'wireless', 'mobile', 'network'],
  'Education': ['education', 'university', 'school', 'academic', 'learning', 'training', 'edtech'],
  'Real Estate': ['real estate', 'property', 'construction', 'building', 'housing'],
  'Professional Services': ['consulting', 'legal', 'accounting', 'advisory', 'professional services'],
  'Media & Entertainment': ['media', 'entertainment', 'publishing', 'broadcast', 'gaming', 'music', 'film'],
  'Government': ['government', 'public sector', 'federal', 'state', 'municipal', 'defense'],
  'Non-Profit': ['non-profit', 'nonprofit', 'charity', 'ngo', 'foundation'],
  'Transportation & Logistics': ['transportation', 'logistics', 'shipping', 'freight', 'supply chain', 'aviation'],
  'Hospitality': ['hospitality', 'hotel', 'restaurant', 'food service', 'travel', 'tourism'],
  'Agriculture': ['agriculture', 'farming', 'agribusiness', 'food production'],
};

// ==================== TITLE HIERARCHY ====================

const SENIORITY_LEVELS: Record<string, string[]> = {
  'C-Suite': ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'ciso', 'cpo', 'chief'],
  'VP': ['vp', 'vice president', 'svp', 'senior vice president', 'evp', 'executive vice president'],
  'Director': ['director', 'head of', 'managing director'],
  'Manager': ['manager', 'lead', 'supervisor', 'team lead', 'group manager'],
  'Senior': ['senior', 'sr.', 'sr ', 'principal', 'staff'],
  'Mid-Level': ['specialist', 'analyst', 'engineer', 'developer', 'consultant', 'coordinator'],
  'Junior': ['junior', 'jr.', 'jr ', 'associate', 'assistant', 'entry'],
  'Intern': ['intern', 'trainee', 'apprentice'],
};

const DEPARTMENTS: Record<string, string[]> = {
  'IT / Engineering': ['it', 'engineering', 'development', 'devops', 'infrastructure', 'software', 'technology'],
  'Marketing': ['marketing', 'brand', 'content', 'digital marketing', 'demand gen', 'growth'],
  'Sales': ['sales', 'business development', 'account executive', 'revenue', 'commercial'],
  'Finance': ['finance', 'accounting', 'treasury', 'controller', 'financial'],
  'Human Resources': ['hr', 'human resources', 'talent', 'recruiting', 'people'],
  'Operations': ['operations', 'supply chain', 'logistics', 'procurement'],
  'Legal': ['legal', 'compliance', 'regulatory', 'counsel'],
  'Product': ['product', 'product management', 'product design'],
  'Customer Success': ['customer success', 'customer service', 'support', 'client services'],
  'Executive': ['executive', 'leadership', 'general management'],
};

// ==================== CORE ENGINE ====================

/**
 * Run a full data quality scan across all contacts and accounts
 */
export async function runFullQualityScan(triggeredBy: string, scope?: {
  projectId?: string;
  campaignId?: string;
  uploadId?: string;
}): Promise<DataQualityReport> {
  // Create scan record
  const [scan] = await db.insert(dataQualityScans).values({
    scanType: scope?.uploadId ? 'upload' : 'full',
    status: 'running',
    uploadId: scope?.uploadId,
    projectId: scope?.projectId,
    campaignId: scope?.campaignId,
    triggeredBy,
  }).returning();

  try {
    // Fetch all data
    const allContacts = await db.select({
      id: contacts.id,
      fullName: contacts.fullName,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      jobTitle: contacts.jobTitle,
      directPhone: contacts.directPhone,
      directPhoneE164: contacts.directPhoneE164,
      mobilePhone: contacts.mobilePhone,
      seniorityLevel: contacts.seniorityLevel,
      department: contacts.department,
      city: contacts.city,
      state: contacts.state,
      country: contacts.country,
      accountId: contacts.accountId,
    }).from(contacts).limit(50000);

    const allAccounts = await db.select({
      id: accounts.id,
      name: accounts.name,
      domain: accounts.domain,
      industryStandardized: accounts.industryStandardized,
      industryRaw: accounts.industryRaw,
      annualRevenue: accounts.annualRevenue,
      staffCount: accounts.staffCount,
      employeesSizeRange: accounts.employeesSizeRange,
      hqCity: accounts.hqCity,
      hqState: accounts.hqState,
      hqCountry: accounts.hqCountry,
      mainPhone: accounts.mainPhone,
    }).from(accounts).limit(50000);

    const issues: Array<{
      recordType: string;
      recordId: string;
      fieldName: string;
      issueType: string;
      severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
      description: string;
      currentValue: string | null;
      aiRecommendation: string | null;
      aiConfidence: number | null;
      suggestedValue: string | null;
    }> = [];

    // ==================== CONTACT QUALITY CHECKS ====================

    for (const contact of allContacts) {
      // Missing email
      if (!contact.email) {
        issues.push({
          recordType: 'contact',
          recordId: contact.id,
          fieldName: 'email',
          issueType: 'missing_email',
          severity: 'critical',
          description: 'Contact is missing email address',
          currentValue: null,
          aiRecommendation: 'Email is required for all contacts. Consider enrichment via vendor lookup.',
          aiConfidence: null,
          suggestedValue: null,
        });
      }

      // Missing title
      if (!contact.jobTitle) {
        issues.push({
          recordType: 'contact',
          recordId: contact.id,
          fieldName: 'jobTitle',
          issueType: 'missing_title',
          severity: 'high',
          description: `Contact "${contact.fullName}" is missing job title`,
          currentValue: null,
          aiRecommendation: 'Job title is critical for segmentation and ICP matching. Use LinkedIn enrichment.',
          aiConfidence: null,
          suggestedValue: null,
        });
      } else {
        // Title normalization check
        const normalizedSeniority = classifySeniority(contact.jobTitle);
        if (normalizedSeniority && contact.seniorityLevel !== normalizedSeniority) {
          issues.push({
            recordType: 'contact',
            recordId: contact.id,
            fieldName: 'seniorityLevel',
            issueType: 'title_seniority_mismatch',
            severity: 'low',
            description: `Seniority level "${contact.seniorityLevel}" doesn't match detected "${normalizedSeniority}" from title "${contact.jobTitle}"`,
            currentValue: contact.seniorityLevel,
            aiRecommendation: `Update seniority level to "${normalizedSeniority}" based on title analysis`,
            aiConfidence: 0.85,
            suggestedValue: normalizedSeniority,
          });
        }

        // Department detection
        const detectedDept = classifyDepartment(contact.jobTitle);
        if (detectedDept && !contact.department) {
          issues.push({
            recordType: 'contact',
            recordId: contact.id,
            fieldName: 'department',
            issueType: 'missing_department',
            severity: 'medium',
            description: `Department missing but can be inferred from title "${contact.jobTitle}"`,
            currentValue: null,
            aiRecommendation: `Set department to "${detectedDept}" based on title analysis`,
            aiConfidence: 0.8,
            suggestedValue: detectedDept,
          });
        }
      }

      // Missing name components
      if (!contact.firstName || !contact.lastName) {
        issues.push({
          recordType: 'contact',
          recordId: contact.id,
          fieldName: !contact.firstName ? 'firstName' : 'lastName',
          issueType: 'missing_name',
          severity: 'medium',
          description: `Contact missing ${!contact.firstName ? 'first' : 'last'} name`,
          currentValue: contact.fullName,
          aiRecommendation: contact.fullName ? `Parse "${contact.fullName}" to extract name components` : 'Enrich via vendor lookup',
          aiConfidence: contact.fullName ? 0.9 : null,
          suggestedValue: null,
        });
      }

      // Phone format validation
      if (contact.directPhone && !contact.directPhoneE164) {
        issues.push({
          recordType: 'contact',
          recordId: contact.id,
          fieldName: 'directPhoneE164',
          issueType: 'phone_format_invalid',
          severity: 'medium',
          description: `Phone "${contact.directPhone}" hasn't been normalized to E.164 format`,
          currentValue: contact.directPhone,
          aiRecommendation: 'Run phone normalization to convert to E.164 format for dialing compatibility',
          aiConfidence: null,
          suggestedValue: null,
        });
      }

      // Missing location
      if (!contact.country) {
        issues.push({
          recordType: 'contact',
          recordId: contact.id,
          fieldName: 'country',
          issueType: 'missing_geography',
          severity: 'medium',
          description: `Contact "${contact.fullName}" is missing country information`,
          currentValue: null,
          aiRecommendation: 'Geographic data is essential for campaign targeting and compliance. Enrich via IP or account mapping.',
          aiConfidence: null,
          suggestedValue: null,
        });
      }

      // Orphaned contact (no account)
      if (!contact.accountId) {
        issues.push({
          recordType: 'contact',
          recordId: contact.id,
          fieldName: 'accountId',
          issueType: 'orphaned_contact',
          severity: 'medium',
          description: `Contact "${contact.fullName}" is not linked to any account`,
          currentValue: null,
          aiRecommendation: 'Match contact to an account using email domain or company name.',
          aiConfidence: null,
          suggestedValue: null,
        });
      }
    }

    // ==================== ACCOUNT QUALITY CHECKS ====================

    for (const account of allAccounts) {
      // Missing industry
      if (!account.industryStandardized && !account.industryRaw) {
        issues.push({
          recordType: 'account',
          recordId: account.id,
          fieldName: 'industryStandardized',
          issueType: 'missing_industry',
          severity: 'high',
          description: `Account "${account.name}" is missing industry classification`,
          currentValue: null,
          aiRecommendation: 'Industry is critical for segmentation. Use domain analysis or AI classification.',
          aiConfidence: null,
          suggestedValue: null,
        });
      } else if (account.industryRaw && !account.industryStandardized) {
        // Unstandardized industry
        const standardized = classifyIndustry(account.industryRaw);
        issues.push({
          recordType: 'account',
          recordId: account.id,
          fieldName: 'industryStandardized',
          issueType: 'non_standardized_industry',
          severity: 'medium',
          description: `Industry "${account.industryRaw}" is not standardized`,
          currentValue: account.industryRaw,
          aiRecommendation: standardized ? `Map to standard taxonomy: "${standardized}"` : 'Review and map to standard taxonomy',
          aiConfidence: standardized ? 0.75 : null,
          suggestedValue: standardized,
        });
      }

      // Missing company size
      if (!account.staffCount && !account.employeesSizeRange) {
        issues.push({
          recordType: 'account',
          recordId: account.id,
          fieldName: 'staffCount',
          issueType: 'missing_company_size',
          severity: 'high',
          description: `Account "${account.name}" is missing employee count/size information`,
          currentValue: null,
          aiRecommendation: 'Company size is essential for ICP matching and ABM strategies. Enrich via LinkedIn or vendor data.',
          aiConfidence: null,
          suggestedValue: null,
        });
      }

      // Missing revenue
      if (!account.annualRevenue) {
        issues.push({
          recordType: 'account',
          recordId: account.id,
          fieldName: 'annualRevenue',
          issueType: 'missing_revenue',
          severity: 'medium',
          description: `Account "${account.name}" is missing annual revenue data`,
          currentValue: null,
          aiRecommendation: 'Revenue data improves lead scoring and ICP alignment. Enrich via firmographic data providers.',
          aiConfidence: null,
          suggestedValue: null,
        });
      }

      // Missing domain
      if (!account.domain) {
        issues.push({
          recordType: 'account',
          recordId: account.id,
          fieldName: 'domain',
          issueType: 'missing_domain',
          severity: 'medium',
          description: `Account "${account.name}" is missing website domain`,
          currentValue: null,
          aiRecommendation: 'Domain is essential for deduplication and enrichment. Search for company website.',
          aiConfidence: null,
          suggestedValue: null,
        });
      }

      // Missing HQ location
      if (!account.hqCountry) {
        issues.push({
          recordType: 'account',
          recordId: account.id,
          fieldName: 'hqCountry',
          issueType: 'missing_hq_location',
          severity: 'medium',
          description: `Account "${account.name}" is missing headquarters location`,
          currentValue: null,
          aiRecommendation: 'HQ location is needed for geographic targeting and compliance.',
          aiConfidence: null,
          suggestedValue: null,
        });
      }
    }

    // ==================== CALCULATE SCORES ====================

    const totalRecords = allContacts.length + allAccounts.length;
    const issueBreakdown: Record<string, number> = {};
    let criticalCount = 0, highCount = 0, mediumCount = 0, lowCount = 0;

    for (const issue of issues) {
      issueBreakdown[issue.issueType] = (issueBreakdown[issue.issueType] || 0) + 1;
      if (issue.severity === 'critical') criticalCount++;
      else if (issue.severity === 'high') highCount++;
      else if (issue.severity === 'medium') mediumCount++;
      else lowCount++;
    }

    // Calculate field coverage
    const fieldCoverage: Record<string, number> = {};
    if (allContacts.length > 0) {
      fieldCoverage['contact.email'] = Math.round((allContacts.filter(c => c.email).length / allContacts.length) * 100);
      fieldCoverage['contact.jobTitle'] = Math.round((allContacts.filter(c => c.jobTitle).length / allContacts.length) * 100);
      fieldCoverage['contact.phone'] = Math.round((allContacts.filter(c => c.directPhone || c.mobilePhone).length / allContacts.length) * 100);
      fieldCoverage['contact.country'] = Math.round((allContacts.filter(c => c.country).length / allContacts.length) * 100);
      fieldCoverage['contact.seniority'] = Math.round((allContacts.filter(c => c.seniorityLevel).length / allContacts.length) * 100);
      fieldCoverage['contact.department'] = Math.round((allContacts.filter(c => c.department).length / allContacts.length) * 100);
      fieldCoverage['contact.accountLinked'] = Math.round((allContacts.filter(c => c.accountId).length / allContacts.length) * 100);
    }
    if (allAccounts.length > 0) {
      fieldCoverage['account.industry'] = Math.round((allAccounts.filter(a => a.industryStandardized).length / allAccounts.length) * 100);
      fieldCoverage['account.revenue'] = Math.round((allAccounts.filter(a => a.annualRevenue).length / allAccounts.length) * 100);
      fieldCoverage['account.employees'] = Math.round((allAccounts.filter(a => a.staffCount || a.employeesSizeRange).length / allAccounts.length) * 100);
      fieldCoverage['account.domain'] = Math.round((allAccounts.filter(a => a.domain).length / allAccounts.length) * 100);
      fieldCoverage['account.hqLocation'] = Math.round((allAccounts.filter(a => a.hqCountry).length / allAccounts.length) * 100);
      fieldCoverage['account.phone'] = Math.round((allAccounts.filter(a => a.mainPhone).length / allAccounts.length) * 100);
    }

    // Calculate scores
    const completenessValues = Object.values(fieldCoverage);
    const completenessScore = completenessValues.length > 0
      ? Math.round(completenessValues.reduce((a, b) => a + b, 0) / completenessValues.length)
      : 0;

    const accuracyScore = totalRecords > 0
      ? Math.round(Math.max(0, 100 - (issues.filter(i => ['phone_format_invalid', 'non_standardized_industry', 'title_seniority_mismatch'].includes(i.issueType)).length / totalRecords) * 100))
      : 100;

    const consistencyScore = totalRecords > 0
      ? Math.round(Math.max(0, 100 - (issues.filter(i => ['non_standardized_industry', 'title_seniority_mismatch'].includes(i.issueType)).length / totalRecords) * 50))
      : 100;

    const complianceScore = totalRecords > 0
      ? Math.round(Math.max(0, 100 - (criticalCount / totalRecords) * 200))
      : 100;

    const overallHealthScore = Math.round(
      completenessScore * 0.3 +
      accuracyScore * 0.25 +
      consistencyScore * 0.2 +
      complianceScore * 0.25
    );

    // ICP alignment (based on required fields coverage)
    const icpFields = ['contact.jobTitle', 'contact.seniority', 'account.industry', 'account.employees', 'account.revenue'];
    const icpCoverage = icpFields.map(f => fieldCoverage[f] || 0);
    const icpAlignmentScore = icpCoverage.length > 0
      ? Math.round(icpCoverage.reduce((a, b) => a + b, 0) / icpCoverage.length)
      : 0;

    // Generate recommendations
    const recommendations: QualityRecommendation[] = [];

    if (issueBreakdown['missing_industry'] > 0) {
      recommendations.push({
        category: 'Industry Classification',
        priority: 'high',
        title: 'Missing Industry Data',
        description: `${issueBreakdown['missing_industry']} accounts are missing industry classification, reducing segmentation accuracy.`,
        affectedRecords: issueBreakdown['missing_industry'],
        suggestedAction: 'Run AI-powered industry classification using domain analysis and company name matching.',
        automatable: true,
      });
    }

    if (issueBreakdown['missing_title'] > 0) {
      recommendations.push({
        category: 'Title Enrichment',
        priority: 'high',
        title: 'Missing Job Titles',
        description: `${issueBreakdown['missing_title']} contacts lack job titles, blocking persona-based targeting.`,
        affectedRecords: issueBreakdown['missing_title'],
        suggestedAction: 'Enrich via LinkedIn profile lookup or vendor data append.',
        automatable: true,
      });
    }

    if (issueBreakdown['missing_company_size'] > 0) {
      recommendations.push({
        category: 'Firmographic Enrichment',
        priority: 'high',
        title: 'Missing Company Size Data',
        description: `${issueBreakdown['missing_company_size']} accounts have no employee count, impacting ICP alignment.`,
        affectedRecords: issueBreakdown['missing_company_size'],
        suggestedAction: 'Use firmographic data providers (ZoomInfo, Clearbit) for enrichment.',
        automatable: true,
      });
    }

    if (issueBreakdown['orphaned_contact'] > 0) {
      recommendations.push({
        category: 'Data Integrity',
        priority: 'medium',
        title: 'Orphaned Contacts',
        description: `${issueBreakdown['orphaned_contact']} contacts are not linked to any account, reducing account-level intelligence.`,
        affectedRecords: issueBreakdown['orphaned_contact'],
        suggestedAction: 'Match contacts to accounts using email domain extraction and company name matching.',
        automatable: true,
      });
    }

    if (issueBreakdown['missing_geography'] > 0) {
      recommendations.push({
        category: 'Geographic Data',
        priority: 'medium',
        title: 'Missing Geographic Information',
        description: `${issueBreakdown['missing_geography']} contacts lack country data, affecting geo-targeting compliance.`,
        affectedRecords: issueBreakdown['missing_geography'],
        suggestedAction: 'Derive geography from account HQ location, timezone, or IP-based enrichment.',
        automatable: true,
      });
    }

    if (issueBreakdown['non_standardized_industry'] > 0) {
      recommendations.push({
        category: 'Data Standardization',
        priority: 'medium',
        title: 'Non-Standardized Industry Names',
        description: `${issueBreakdown['non_standardized_industry']} accounts have industry names that don't match the standard taxonomy.`,
        affectedRecords: issueBreakdown['non_standardized_industry'],
        suggestedAction: 'Apply AI-powered industry mapping to normalize to standard taxonomy.',
        automatable: true,
      });
    }

    // Store issues in database (batch insert)
    if (issues.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < issues.length; i += BATCH_SIZE) {
        const batch = issues.slice(i, i + BATCH_SIZE).map(issue => ({
          ...issue,
          scanBatchId: scan.id,
        }));
        await db.insert(dataQualityIssues).values(batch);
      }
    }

    // Update scan record
    await db.update(dataQualityScans).set({
      status: 'completed',
      totalRecordsScanned: totalRecords,
      issuesFound: issues.length,
      criticalIssues: criticalCount,
      highIssues: highCount,
      mediumIssues: mediumCount,
      lowIssues: lowCount,
      overallHealthScore,
      completenessScore,
      accuracyScore,
      consistencyScore,
      complianceScore,
      issueBreakdown,
      fieldCoverage,
      aiRecommendations: recommendations,
      completedAt: new Date(),
    }).where(eq(dataQualityScans.id, scan.id));

    return {
      overallHealthScore,
      completenessScore,
      accuracyScore,
      consistencyScore,
      complianceScore,
      icpAlignmentScore,
      totalRecords,
      issuesFound: issues.length,
      issueBreakdown,
      fieldCoverage,
      recommendations,
      scanId: scan.id,
    };

  } catch (error) {
    // Mark scan as failed
    await db.update(dataQualityScans).set({
      status: 'failed',
      completedAt: new Date(),
    }).where(eq(dataQualityScans.id, scan.id));
    throw error;
  }
}

/**
 * Validate uploaded CSV/data before import
 */
export function validateUploadData(
  headers: string[],
  rows: Record<string, string>[],
  templateId?: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const detectedSchema: DetectedColumn[] = [];
  let duplicateCount = 0;

  // Detect schema from headers and data
  for (const header of headers) {
    const values = rows.map(r => r[header]).filter(Boolean);
    const nullCount = rows.length - values.length;
    const uniqueValues = new Set(values);

    detectedSchema.push({
      name: header,
      detectedType: detectFieldType(values.slice(0, 100)),
      sampleValues: values.slice(0, 5),
      nullPercentage: Math.round((nullCount / rows.length) * 100),
      uniquePercentage: values.length > 0 ? Math.round((uniqueValues.size / values.length) * 100) : 0,
      suggestedMapping: suggestFieldMapping(header),
    });
  }

  // Check for required fields based on detected type
  const emailColumns = headers.filter(h => h.toLowerCase().includes('email'));
  const nameColumns = headers.filter(h => /^(name|first|last|full)/i.test(h));

  if (emailColumns.length === 0) {
    warnings.push({
      field: 'email',
      message: 'No email column detected. Contacts require email addresses.',
      affectedRows: rows.length,
      suggestion: 'Add an email column or map an existing field.',
    });
  }

  if (nameColumns.length === 0) {
    warnings.push({
      field: 'name',
      message: 'No name column detected.',
      affectedRows: rows.length,
      suggestion: 'Add name fields for proper contact records.',
    });
  }

  // Validate email format
  if (emailColumns.length > 0) {
    const emailField = emailColumns[0];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let invalidEmails = 0;
    rows.forEach((row, idx) => {
      const email = row[emailField];
      if (email && !emailRegex.test(email)) {
        invalidEmails++;
        if (invalidEmails <= 10) {
          errors.push({
            row: idx + 1,
            field: emailField,
            value: email,
            error: 'Invalid email format',
            severity: 'high',
          });
        }
      }
    });
    if (invalidEmails > 10) {
      warnings.push({
        field: emailField,
        message: `${invalidEmails} total invalid email formats detected`,
        affectedRows: invalidEmails,
      });
    }
  }

  // Check for phone format
  const phoneColumns = headers.filter(h => /phone|tel|mobile|cell/i.test(h));
  for (const phoneCol of phoneColumns) {
    let badFormats = 0;
    rows.forEach((row, idx) => {
      const phone = row[phoneCol];
      if (phone && !/^[\+\d\s\-\(\)\.]+$/.test(phone)) {
        badFormats++;
        if (badFormats <= 5) {
          errors.push({
            row: idx + 1,
            field: phoneCol,
            value: phone,
            error: 'Phone contains invalid characters',
            severity: 'medium',
          });
        }
      }
    });
    if (badFormats > 0) {
      warnings.push({
        field: phoneCol,
        message: `${badFormats} phone numbers have formatting issues`,
        affectedRows: badFormats,
        suggestion: 'Normalize to E.164 format (+1XXXXXXXXXX)',
      });
    }
  }

  // Duplicate email detection
  if (emailColumns.length > 0) {
    const emailField = emailColumns[0];
    const seen = new Map<string, number>();
    rows.forEach((row) => {
      const email = (row[emailField] || '').toLowerCase().trim();
      if (email) {
        seen.set(email, (seen.get(email) || 0) + 1);
      }
    });
    duplicateCount = Array.from(seen.values()).filter(c => c > 1).reduce((sum, c) => sum + c - 1, 0);
    if (duplicateCount > 0) {
      warnings.push({
        field: emailField,
        message: `${duplicateCount} duplicate email addresses detected`,
        affectedRows: duplicateCount,
        suggestion: 'Deduplicate before import to prevent data quality issues.',
      });
    }
  }

  // Missing field warnings
  for (const col of detectedSchema) {
    if (col.nullPercentage > 50) {
      warnings.push({
        field: col.name,
        message: `${col.nullPercentage}% of values are empty for "${col.name}"`,
        affectedRows: Math.round((col.nullPercentage / 100) * rows.length),
        suggestion: col.nullPercentage > 90 ? 'Consider removing this field or enriching data.' : 'Plan for data enrichment on empty records.',
      });
    }
  }

  const validRows = rows.length - errors.filter(e => e.severity === 'critical' || e.severity === 'high').length;
  const qualityScore = Math.round(Math.max(0, 100 - (errors.length / Math.max(1, rows.length)) * 50 - (warnings.length * 2)));
  const allNullPercentages = detectedSchema.map(s => 100 - s.nullPercentage);
  const completenessScore = allNullPercentages.length > 0
    ? Math.round(allNullPercentages.reduce((a, b) => a + b, 0) / allNullPercentages.length)
    : 0;

  return {
    isValid: errors.filter(e => e.severity === 'critical').length === 0,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    duplicateRows: duplicateCount,
    errors,
    warnings,
    detectedSchema,
    qualityScore,
    completenessScore,
  };
}

// ==================== CLASSIFICATION HELPERS ====================

export function classifyIndustry(raw: string): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  for (const [standard, keywords] of Object.entries(STANDARD_INDUSTRIES)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return standard;
    }
  }
  return null;
}

export function classifySeniority(title: string): string | null {
  if (!title) return null;
  const lower = title.toLowerCase().trim();
  for (const [level, keywords] of Object.entries(SENIORITY_LEVELS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return level;
    }
  }
  return null;
}

export function classifyDepartment(title: string): string | null {
  if (!title) return null;
  const lower = title.toLowerCase().trim();
  for (const [dept, keywords] of Object.entries(DEPARTMENTS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return dept;
    }
  }
  return null;
}

function detectFieldType(values: string[]): string {
  if (values.length === 0) return 'unknown';
  const sample = values.slice(0, 50);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[\+\d\s\-\(\)\.]+$/;
  const numberRegex = /^\d+\.?\d*$/;

  if (sample.every(v => emailRegex.test(v))) return 'email';
  if (sample.every(v => phoneRegex.test(v) && v.length >= 7)) return 'phone';
  if (sample.every(v => numberRegex.test(v))) return 'number';
  if (sample.every(v => /^\d{4}-\d{2}-\d{2}/.test(v))) return 'date';
  return 'text';
}

function suggestFieldMapping(header: string): string | undefined {
  const lower = header.toLowerCase().replace(/[_\-\s]+/g, '');
  const mappings: Record<string, string> = {
    'email': 'email',
    'emailaddress': 'email',
    'firstname': 'firstName',
    'first': 'firstName',
    'lastname': 'lastName',
    'last': 'lastName',
    'fullname': 'fullName',
    'name': 'fullName',
    'jobtitle': 'jobTitle',
    'title': 'jobTitle',
    'company': 'accountName',
    'companyname': 'accountName',
    'organization': 'accountName',
    'phone': 'directPhone',
    'directphone': 'directPhone',
    'mobilephone': 'mobilePhone',
    'mobile': 'mobilePhone',
    'cell': 'mobilePhone',
    'telephone': 'directPhone',
    'industry': 'industry',
    'country': 'country',
    'state': 'state',
    'city': 'city',
    'website': 'domain',
    'domain': 'domain',
    'url': 'domain',
    'revenue': 'annualRevenue',
    'annualrevenue': 'annualRevenue',
    'employees': 'staffCount',
    'employeecount': 'staffCount',
    'companysize': 'employeesSizeRange',
    'seniority': 'seniorityLevel',
    'department': 'department',
    'linkedin': 'linkedinUrl',
    'linkedinurl': 'linkedinUrl',
  };
  return mappings[lower];
}

/**
 * Get audience analytics overview
 */
export async function getAudienceOverview() {
  // Contact stats
  const [contactStats] = await db.select({
    total: sql<number>`count(*)::int`,
    withEmail: sql<number>`count(case when ${contacts.email} is not null then 1 end)::int`,
    withTitle: sql<number>`count(case when ${contacts.jobTitle} is not null then 1 end)::int`,
    withPhone: sql<number>`count(case when ${contacts.directPhone} is not null or ${contacts.mobilePhone} is not null then 1 end)::int`,
    withAccount: sql<number>`count(case when ${contacts.accountId} is not null then 1 end)::int`,
  }).from(contacts);

  // Account stats
  const [accountStats] = await db.select({
    total: sql<number>`count(*)::int`,
    withIndustry: sql<number>`count(case when ${accounts.industryStandardized} is not null then 1 end)::int`,
    withRevenue: sql<number>`count(case when ${accounts.annualRevenue} is not null then 1 end)::int`,
    withEmployees: sql<number>`count(case when ${accounts.staffCount} is not null or ${accounts.employeesSizeRange} is not null then 1 end)::int`,
    withDomain: sql<number>`count(case when ${accounts.domain} is not null then 1 end)::int`,
  }).from(accounts);

  // Industry distribution
  const industryDist = await db.select({
    industry: accounts.industryStandardized,
    count: sql<number>`count(*)::int`,
  }).from(accounts)
    .where(sql`${accounts.industryStandardized} is not null`)
    .groupBy(accounts.industryStandardized)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  // Seniority distribution
  const seniorityDist = await db.select({
    seniority: contacts.seniorityLevel,
    count: sql<number>`count(*)::int`,
  }).from(contacts)
    .where(sql`${contacts.seniorityLevel} is not null`)
    .groupBy(contacts.seniorityLevel)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  // Department distribution
  const departmentDist = await db.select({
    department: contacts.department,
    count: sql<number>`count(*)::int`,
  }).from(contacts)
    .where(sql`${contacts.department} is not null`)
    .groupBy(contacts.department)
    .orderBy(desc(sql`count(*)`))
    .limit(15);

  // Geographic distribution
  const geoDist = await db.select({
    country: contacts.country,
    count: sql<number>`count(*)::int`,
  }).from(contacts)
    .where(sql`${contacts.country} is not null`)
    .groupBy(contacts.country)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  // Company size distribution
  const sizeDist = await db.select({
    sizeRange: accounts.employeesSizeRange,
    count: sql<number>`count(*)::int`,
  }).from(accounts)
    .where(sql`${accounts.employeesSizeRange} is not null`)
    .groupBy(accounts.employeesSizeRange)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return {
    contacts: contactStats,
    accounts: accountStats,
    distributions: {
      industry: industryDist,
      seniority: seniorityDist,
      department: departmentDist,
      geography: geoDist,
      companySize: sizeDist,
    },
  };
}
