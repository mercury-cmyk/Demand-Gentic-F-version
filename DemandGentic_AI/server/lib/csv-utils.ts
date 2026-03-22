/**
 * Shared CSV Utilities
 * Common functions for parsing, validating, and processing CSV files
 */

import Papa from 'papaparse';
import { Readable } from 'stream';
import csv from 'fast-csv';

// ============================================================================
// TYPES
// ============================================================================

export interface CSVParseResult {
  data: T[];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
}

export interface CSVParseOptions {
  headers?: boolean;
  skipEmptyLines?: boolean;
  delimiter?: string | 'auto';
  transformHeader?: (header: string) => string;
  trim?: boolean;
}

export interface CSVStreamOptions {
  headers?: boolean;
  trim?: boolean;
}

export interface CSVValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CSVUploadResponse {
  message: string;
  totalEntries: number;
  added: number;
  duplicates?: number;
  skipped?: number;
  errors?: string[];
}

// ============================================================================
// CSV PARSING
// ============================================================================

/**
 * Parse CSV string with automatic delimiter detection
 * Tries common delimiters: comma, tab, pipe, semicolon
 */
export function parseCSVWithAutoDelimiter(
  csvData: string,
  options: Omit = {}
): CSVParseResult {
  const delimiters = [',', '\t', '|', ';'];
  let bestResult: Papa.ParseResult | null = null;
  let bestScore = -1;

  for (const delimiter of delimiters) {
    const result = Papa.parse(csvData, {
      header: options.headers ?? true,
      skipEmptyLines: options.skipEmptyLines ?? true,
      delimiter,
      transformHeader: options.transformHeader,
    });

    // Score based on: data rows found, minimal errors
    const score = result.data.length * 100 - result.errors.length * 10;

    if (score > bestScore && result.data.length > 0) {
      bestScore = score;
      bestResult = result;
    }
  }

  if (!bestResult || bestResult.data.length === 0) {
    throw new Error('CSV parsing failed - could not detect valid delimiter');
  }

  return bestResult as CSVParseResult;
}

/**
 * Parse CSV string with specific or automatic delimiter
 */
export function parseCSV(
  csvData: string,
  options: CSVParseOptions = {}
): CSVParseResult {
  if (options.delimiter === 'auto' || !options.delimiter) {
    return parseCSVWithAutoDelimiter(csvData, options);
  }

  const result = Papa.parse(csvData, {
    header: options.headers ?? true,
    skipEmptyLines: options.skipEmptyLines ?? true,
    delimiter: options.delimiter,
    transformHeader: options.transformHeader,
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(`CSV parsing failed: ${result.errors[0]?.message || 'Unknown error'}`);
  }

  return result as CSVParseResult;
}

/**
 * Stream CSV parsing for large files
 */
export function parseCSVStream(
  csvContent: string,
  options: CSVStreamOptions = {}
): Promise {
  return new Promise((resolve, reject) => {
    const rows: T[] = [];
    const stream = Readable.from([csvContent]);

    csv
      .parseStream(stream, {
        headers: options.headers ?? true,
        trim: options.trim ?? true,
      })
      .on('data', (row: T) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

// ============================================================================
// HEADER NORMALIZATION
// ============================================================================

/**
 * Standard header transformations for common CSV field names
 */
export function normalizeCSVHeader(header: string): string {
  const normalized = header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  const mappings: Record = {
    // Email variations
    'email': 'email',
    'emailaddress': 'email',
    'mail': 'email',
    'e-mail': 'email',
    
    // Company variations
    'company': 'company',
    'companyname': 'company',
    'organization': 'company',
    'account': 'company',
    'accountname': 'company',
    
    // Name variations
    'firstname': 'firstName',
    'fname': 'firstName',
    'givenname': 'firstName',
    'lastname': 'lastName',
    'lname': 'lastName',
    'surname': 'lastName',
    'familyname': 'lastName',
    
    // Domain variations
    'domain': 'domain',
    'website': 'domain',
    'url': 'domain',
    
    // Contact ID variations
    'contactid': 'contactId',
    'id': 'id',
    'cavid': 'cavId',
    'cavuserid': 'cavUserId',
  };

  return mappings[normalized] || normalized;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string | null {
  const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
  if (match) {
    return match[1].toLowerCase().replace(/^www\./, '');
  }
  return null;
}

/**
 * Normalize company name for matching
 * Removes common suffixes, extra whitespace, and converts to lowercase
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(inc|ltd|llc|corp|corporation|limited|company|co)\b\.?/gi, '')
    .trim();
}

/**
 * Detect if CSV content has headers
 */
export function hasCSVHeaders(csvContent: string): boolean {
  const lines = csvContent.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return false;

  const firstLine = lines[0]?.trim();
  
  // Check if first line looks like a header row
  const headerIndicators = [
    'email', 'name', 'company', 'domain', 'phone', 
    'address', 'id', 'contact', 'account', 'first', 'last'
  ];

  return headerIndicators.some(indicator => 
    firstLine.toLowerCase().includes(indicator)
  );
}

// ============================================================================
// RESPONSE FORMATTING
// ============================================================================

/**
 * Create standardized CSV upload response
 */
export function createCSVUploadResponse(
  totalEntries: number,
  added: number,
  options: {
    duplicates?: number;
    skipped?: number;
    errors?: string[];
    customMessage?: string;
  } = {}
): CSVUploadResponse {
  const response: CSVUploadResponse = {
    message: options.customMessage || 'CSV upload processed successfully',
    totalEntries,
    added,
  };

  if (options.duplicates !== undefined) {
    response.duplicates = options.duplicates;
  }

  if (options.skipped !== undefined && options.skipped > 0) {
    response.skipped = options.skipped;
  }

  if (options.errors && options.errors.length > 0) {
    response.errors = options.errors;
  }

  return response;
}

/**
 * Create standardized error response for CSV operations
 */
export function createCSVErrorResponse(
  error: unknown,
  context: string = 'CSV processing'
): { error: string; details?: any } {
  if (error instanceof Error) {
    return {
      error: `${context} failed`,
      details: error.message,
    };
  }

  return {
    error: `${context} failed`,
    details: String(error),
  };
}

// ============================================================================
// COMMON PATTERNS
// ============================================================================

/**
 * Process CSV rows with validation and error collection
 */
export async function processCSVRows(
  rows: TInput[],
  processor: (row: TInput, index: number) => TOutput | null | Promise,
  options: {
    collectErrors?: boolean;
    skipInvalid?: boolean;
  } = {}
): Promise {
  const results: TOutput[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (let i = 0; i (
  items: T[],
  keyFn: (item: T) => string
): T[] {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Smart field detection for headerless CSV files
 * Determines if a value is email, domain, company name, etc.
 */
export function detectFieldType(value: string): 'email' | 'domain' | 'company' | 'unknown' {
  const trimmed = value.trim();

  // Email detection
  if (isValidEmail(trimmed)) {
    return 'email';
  }

  // Domain detection (has dots, no spaces, looks like URL)
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed) && !trimmed.includes(' ')) {
    return 'domain';
  }

  // Company name (has spaces or multiple words, not too short)
  if (trimmed.length > 3 && !/^\d+$/.test(trimmed)) {
    return 'company';
  }

  return 'unknown';
}