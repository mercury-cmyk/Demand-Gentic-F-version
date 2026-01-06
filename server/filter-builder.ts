import { SQL, and, or, eq, ilike, sql, isNull, isNotNull, inArray, notInArray } from "drizzle-orm";
import { FilterGroup, FilterCondition } from "@shared/filter-types";
import { accounts, contacts, leads, campaigns } from "@shared/schema";

type TableType = typeof accounts | typeof contacts | typeof leads | typeof campaigns;

/**
 * Simplified Filter Builder
 * 
 * Supports 8 unified operators:
 * - equals, not_equals, contains, not_contains, begins_with, ends_with, is_empty, has_any_value
 * 
 * Multi-value handling:
 * - Multiple values within same field = OR logic
 * - Different fields = AND logic (based on filterGroup.logic)
 */

/**
 * Map filter field names to actual database column names (Drizzle properties)
 */
const FIELD_MAPPINGS: Record<string, Record<string, string>> = {
  accounts: {
    // Simplified mappings - field name to Drizzle property
    'industry': 'industryStandardized',  // Alias for backward compatibility
    'industryStandardized': 'industryStandardized',
    'employeesSizeRange': 'employeesSizeRange',
    'annualRevenue': 'annualRevenue',
    'revenueRange': 'revenueRange',
    'techStack': 'techStack',
    'domain': 'domain',
    'mainPhone': 'mainPhone',
    'linkedinUrl': 'linkedinUrl',
    'description': 'description',
    'tags': 'tags',
    'yearFounded': 'yearFounded',
    'sicCode': 'sicCode',
    'naicsCode': 'naicsCode',
    'hqCity': 'hqCity',
    'hqState': 'hqState',
    'hqCountry': 'hqCountry',
    'name': 'name',
    'ownerId': 'ownerId',
    'createdAt': 'createdAt',
    'updatedAt': 'updatedAt',
    'staffCount': 'staffCount'
  },
  contacts: {
    // Contact fields
    'seniorityLevel': 'seniorityLevel',
    'department': 'department',
    'jobTitle': 'jobTitle',
    'directPhone': 'directPhone',
    'mobilePhone': 'mobilePhone',
    'tags': 'tags',
    'consentBasis': 'consentBasis',
    'consentSource': 'consentSource',
    'linkedinUrl': 'linkedinUrl',
    'list': 'list',
    'fullName': 'fullName',
    'firstName': 'firstName',
    'lastName': 'lastName',
    'email': 'email',
    'city': 'city',
    'state': 'state',
    'country': 'country',
    'ownerId': 'ownerId',
    'sourceSystem': 'sourceSystem',
    'createdAt': 'createdAt',
    'updatedAt': 'updatedAt',
    
    // Company fields (via JOIN) - map to accounts table columns
    'industry': 'industryStandardized',  // Alias for backward compatibility
    'industryStandardized': 'industryStandardized',
    'employeesSizeRange': 'employeesSizeRange',
    'annualRevenue': 'annualRevenue',
    'revenueRange': 'revenueRange',
    'techStack': 'techStack',
    'accountName': 'name',
    'accountDomain': 'domain'
  },
  leads: {},
  campaigns: {
    'name': 'name',
    'status': 'status',
    'type': 'type',
    'ownerId': 'ownerId',
    'createdAt': 'createdAt',
    'updatedAt': 'updatedAt'
  }
};

function getColumnName(field: string, table: TableType): string {
  const tableName = table === accounts ? 'accounts' : table === contacts ? 'contacts' : table === leads ? 'leads' : 'campaigns';
  return FIELD_MAPPINGS[tableName]?.[field] || field;
}

/**
 * Fields that require JOIN to accounts table when filtering contacts
 */
const COMPANY_FIELDS = [
  'industry',  // Alias for industryStandardized
  'industryStandardized',
  'employeesSizeRange',
  'annualRevenue',
  'techStack',
  'accountName',
  'accountDomain'
];

/**
 * Array fields (use different operators)
 */
const ARRAY_FIELDS = ['techStack', 'tags', 'linkedinSpecialties', 'intentTopics', 'previousNames'];

/**
 * Text fields (can check for empty string)
 * Numeric and date fields should only check for NULL, not empty string
 */
const TEXT_FIELDS = [
  'name', 'domain', 'industryStandardized', 'description', 'sicCode', 'naicsCode',
  'mainPhone', 'linkedinUrl', 'hqCity', 'hqState', 'hqCountry',
  'fullName', 'firstName', 'lastName', 'email', 'jobTitle', 'department',
  'seniorityLevel', 'directPhone', 'mobilePhone', 'linkedinUrl', 'city',
  'state', 'country', 'consentBasis', 'consentSource', 'list', 'sourceSystem'
];

const NUMERIC_FIELDS = ['yearFounded', 'staffCount'];
const ENUM_FIELDS = ['employeesSizeRange', 'revenueRange', 'annualRevenue'];

/**
 * Special fields that require custom handling (junction tables, complex queries)
 * These fields are skipped in regular field condition building
 */
const SPECIAL_HANDLING_FIELDS = [
  'listName',        // Contacts in static lists (junction table)
  'segmentName',     // Contacts in dynamic segments (complex query)
  'domainSetName',   // Contacts linked to domain sets (junction table)
  'accountListName'  // Accounts in target account lists (junction table)
];

/**
 * Build SQL query from filter group
 */
export function buildFilterQuery(filterGroup: FilterGroup, table: TableType): SQL | undefined {
  if (!filterGroup.conditions || filterGroup.conditions.length === 0) {
    return undefined;
  }

  const conditions = filterGroup.conditions
    .map(condition => buildCondition(condition, table))
    .filter(Boolean) as SQL[];

  if (conditions.length === 0) {
    return undefined;
  }

  return filterGroup.logic === 'AND' ? and(...conditions) : or(...conditions);
}

/**
 * Build SQL condition for a single filter condition
 */
function buildCondition(condition: FilterCondition, table: TableType): SQL | undefined {
  const { field, operator, values: rawValues, value } = condition as any;
  
  // Handle both 'values' (array) and 'value' (singular) formats from different FilterBuilder versions
  const values: (string | number)[] = rawValues || (value !== undefined && value !== '' ? [value] : []);

  // Skip special handling fields (not yet implemented)
  if (SPECIAL_HANDLING_FIELDS.includes(field)) {
    console.warn(`[FILTER_BUILDER] Skipping special field '${field}' - custom handling not yet implemented`);
    return undefined;
  }

  // Get the actual column name
  const columnName = getColumnName(field, table);
  
  // Check if this is a company field on contacts (requires JOIN)
  const isCompanyField = table === contacts && COMPANY_FIELDS.includes(field);
  const isArrayField = ARRAY_FIELDS.includes(columnName);

  // Handle company fields on contacts (requires EXISTS subquery with JOIN)
  if (isCompanyField) {
    return buildCompanyFieldCondition(field, operator, values, columnName, isArrayField);
  }

  // Handle regular fields
  return buildRegularFieldCondition(field, operator, values, table, columnName, isArrayField);
}

/**
 * Build condition for company fields on contacts (requires JOIN to accounts)
 */
function buildCompanyFieldCondition(
  field: string,
  operator: string,
  values: (string | number)[],
  accountColumnName: string,
  isArrayField: boolean
): SQL | undefined {
  const accountColumn = (accounts as any)[accountColumnName];
  
  if (!accountColumn) {
    console.warn(`Company field ${field} (mapped to ${accountColumnName}) not found in accounts table`);
    return undefined;
  }

  // Determine if this is a text field (can check for empty string)
  const isTextField = TEXT_FIELDS.includes(accountColumnName);

  // Handle is_empty and has_any_value first (don't need values)
  if (operator === 'is_empty') {
    if (isArrayField) {
      // For array fields, check for NULL or empty array '{}'
      return or(
        isNull(contacts.accountId),
        sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND (${accountColumn} IS NULL OR ${accountColumn} = '{}'))`
      );
    } else if (isTextField) {
      // For text fields, check for NULL or empty string
      return or(
        isNull(contacts.accountId),
        sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND (${accountColumn} IS NULL OR ${accountColumn} = ''))`
      );
    } else {
      // For numeric/enum fields, only check NULL
      return or(
        isNull(contacts.accountId),
        sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND ${accountColumn} IS NULL)`
      );
    }
  }

  if (operator === 'has_any_value') {
    if (isArrayField) {
      // For array fields, check for NOT NULL and not empty array
      return sql`${contacts.accountId} IS NOT NULL AND EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND ${accountColumn} IS NOT NULL AND ${accountColumn} != '{}')`;
    } else if (isTextField) {
      // For text fields, check for NOT NULL and not empty string
      return sql`${contacts.accountId} IS NOT NULL AND EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND ${accountColumn} IS NOT NULL AND ${accountColumn} != '')`;
    } else {
      // For numeric/enum fields, only check NOT NULL
      return sql`${contacts.accountId} IS NOT NULL AND EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND ${accountColumn} IS NOT NULL)`;
    }
  }

  // For all other operators, we need values
  if (!values || values.length === 0) {
    return undefined;
  }

  // Build condition based on operator
  switch (operator) {
    case 'equals':
      // Multi-value OR: equals ANY of the values
      // Cast enum fields to text for comparison
      const isEnumField = ENUM_FIELDS.includes(accountColumnName);
      const compareColumn = isEnumField ? sql`${accountColumn}::text` : accountColumn;
      
      if (values.length === 1) {
        return sql`${contacts.accountId} IS NOT NULL AND EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND ${compareColumn} = ${values[0]})`;
      }
      return sql`${contacts.accountId} IS NOT NULL AND EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND ${compareColumn} = ANY(ARRAY[${sql.join(values.map(v => sql`${v}`), sql`, `)}]))`;
    
    case 'not_equals':
      // Multi-value AND: not equals ALL of the values
      // IMPORTANT: Include contacts with no account or account with NULL field (and empty string for text fields)
      const isEnumFieldNotEq = ENUM_FIELDS.includes(accountColumnName);
      const compareColumnNotEq = isEnumFieldNotEq ? sql`${accountColumn}::text` : accountColumn;
      
      if (values.length === 1) {
        const nullCheck = isTextField 
          ? or(sql`${compareColumnNotEq} != ${values[0]}`, isNull(accountColumn), eq(accountColumn, ''))
          : or(sql`${compareColumnNotEq} != ${values[0]}`, isNull(accountColumn));
        return or(
          isNull(contacts.accountId),
          sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND (${nullCheck}))`
        );
      }
      // Multi-value: For enum fields, use NOT IN with text cast
      const nullCheckMulti = isEnumFieldNotEq
        ? or(sql`${compareColumnNotEq} != ALL(${values})`, isNull(accountColumn))
        : isTextField
          ? or(notInArray(accountColumn, values), isNull(accountColumn), eq(accountColumn, ''))
          : or(notInArray(accountColumn, values), isNull(accountColumn));
      return or(
        isNull(contacts.accountId),
        sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND (${nullCheckMulti}))`
      );
    
    case 'contains':
      // Multi-value OR: contains ANY of the values
      const isEnumFieldContains = ENUM_FIELDS.includes(accountColumnName);
      const compareColumnContains = isEnumFieldContains ? sql`${accountColumn}::text` : accountColumn;
      
      if (isArrayField) {
        // For array fields, use array overlap operator
        return sql`${contacts.accountId} IS NOT NULL AND EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND ${accountColumn} && ARRAY[${sql.join(values.map(v => sql`${v}`), sql`, `)}]::text[])`;
      } else {
        // For text/enum fields, use ILIKE with OR
        const orConditions = values.map(v => sql`${compareColumnContains} ILIKE '%' || ${String(v)} || '%'`);
        return sql`${contacts.accountId} IS NOT NULL AND EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND (${or(...orConditions)}))`;
      }
    
    case 'not_contains':
      // Multi-value AND: does not contain ALL of the values
      // IMPORTANT: Include contacts with no account or account with NULL field (and empty for arrays/text fields)
      const isEnumFieldNotContains = ENUM_FIELDS.includes(accountColumnName);
      const compareColumnNotContains = isEnumFieldNotContains ? sql`${accountColumn}::text` : accountColumn;
      
      if (isArrayField) {
        // For array fields, include NULL and empty arrays
        return or(
          isNull(contacts.accountId),
          sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND (NOT (${accountColumn} && ARRAY[${sql.join(values.map(v => sql`${v}`), sql`, `)}]::text[]) OR ${accountColumn} IS NULL OR ${accountColumn} = '{}'))`
        );
      } else {
        // For text/enum fields, include NULL (and empty strings only for text fields)
        const andConditions = values.map(v => sql`${compareColumnNotContains} NOT ILIKE '%' || ${String(v)} || '%'`);
        const nullCheck = isTextField
          ? sql`((${and(...andConditions)}) OR ${accountColumn} IS NULL OR ${accountColumn} = '')`
          : sql`((${and(...andConditions)}) OR ${accountColumn} IS NULL)`;
        return or(
          isNull(contacts.accountId),
          sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND ${nullCheck})`
        );
      }
    
    case 'begins_with':
      // Multi-value OR: begins with ANY of the values
      const isEnumFieldBegins = ENUM_FIELDS.includes(accountColumnName);
      const compareColumnBegins = isEnumFieldBegins ? sql`${accountColumn}::text` : accountColumn;
      const startsOrConditions = values.map(v => sql`${compareColumnBegins} ILIKE ${String(v)} || '%'`);
      return sql`${contacts.accountId} IS NOT NULL AND EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND (${or(...startsOrConditions)}))`;
    
    case 'ends_with':
      // Multi-value OR: ends with ANY of the values
      const isEnumFieldEnds = ENUM_FIELDS.includes(accountColumnName);
      const compareColumnEnds = isEnumFieldEnds ? sql`${accountColumn}::text` : accountColumn;
      const endsOrConditions = values.map(v => sql`${compareColumnEnds} ILIKE '%' || ${String(v)}`);
      return sql`${contacts.accountId} IS NOT NULL AND EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${contacts.accountId} AND (${or(...endsOrConditions)}))`;
    
    default:
      console.warn(`Operator ${operator} not supported for company fields`);
      return undefined;
  }
}

/**
 * Build condition for regular fields (no JOIN required)
 */
function buildRegularFieldCondition(
  field: string,
  operator: string,
  values: (string | number)[],
  table: TableType,
  columnName: string,
  isArrayField: boolean
): SQL | undefined {
  const column = (table as any)[columnName];
  
  if (!column) {
    console.warn(`Field ${field} (mapped to ${columnName}) not found in table`);
    return undefined;
  }

  // Determine if this is a text field (can check for empty string)
  const isTextField = TEXT_FIELDS.includes(columnName);

  // Handle is_empty and has_any_value (don't need values)
  if (operator === 'is_empty') {
    if (isArrayField) {
      return or(isNull(column), sql`${column} = '{}'`);
    } else if (isTextField) {
      // Text fields: check NULL or empty string
      return or(isNull(column), eq(column, ''));
    } else {
      // Numeric/enum fields: only check NULL
      return isNull(column);
    }
  }

  if (operator === 'has_any_value') {
    if (isArrayField) {
      return and(isNotNull(column), sql`${column} != '{}'`);
    } else if (isTextField) {
      // Text fields: check NOT NULL and not empty string
      return and(isNotNull(column), sql`${column} != ''`);
    } else {
      // Numeric/enum fields: only check NOT NULL
      return isNotNull(column);
    }
  }

  // For all other operators, we need values
  if (!values || values.length === 0) {
    return undefined;
  }

  // Build condition based on operator
  // Cast enum fields to text for full operator support
  const isEnumField = ENUM_FIELDS.includes(columnName);
  const compareColumn = isEnumField ? sql`${column}::text` : column;
  
  switch (operator) {
    case 'equals':
      // Multi-value OR: equals ANY of the values
      if (values.length === 1) {
        return isEnumField ? sql`${compareColumn} = ${values[0]}` : eq(column, values[0]);
      }
      return isEnumField ? sql`${compareColumn} = ANY(ARRAY[${sql.join(values.map(v => sql`${v}`), sql`, `)}])` : inArray(column, values);
    
    case 'not_equals':
      // Multi-value AND: not equals ALL of the values
      // IMPORTANT: Include NULL values (and empty strings for text fields)
      if (values.length === 1) {
        const nullConditions = [sql`${compareColumn} != ${values[0]}`, isNull(column)];
        if (isTextField) {
          nullConditions.push(eq(column, ''));
        }
        return or(...nullConditions);
      }
      const nullConditionsMulti = isEnumField 
        ? [sql`${compareColumn} != ALL(${values})`, isNull(column)]
        : [notInArray(column, values), isNull(column)];
      if (isTextField && !isEnumField) {
        nullConditionsMulti.push(eq(column, ''));
      }
      return or(...nullConditionsMulti);
    
    case 'contains':
      // Multi-value OR: contains ANY of the values
      if (isArrayField) {
        // For array fields, use array overlap operator
        return sql`${column} && ARRAY[${sql.join(values.map(v => sql`${v}`), sql`, `)}]::text[]`;
      } else {
        // For text/enum fields, use ILIKE with OR
        const orConditions = values.map(v => sql`${compareColumn} ILIKE '%' || ${String(v)} || '%'`);
        return or(...orConditions);
      }
    
    case 'not_contains':
      // Multi-value AND: does not contain ALL of the values
      // IMPORTANT: Include NULL values (and empty for arrays/text fields)
      if (isArrayField) {
        // For array fields, include NULL and empty arrays
        return or(
          sql`NOT (${column} && ARRAY[${sql.join(values.map(v => sql`${v}`), sql`, `)}]::text[])`,
          isNull(column),
          sql`${column} = '{}'`
        );
      } else {
        // For text/enum fields, include NULL (and empty strings for text fields)
        const andConditions = values.map(v => sql`${compareColumn} NOT ILIKE '%' || ${String(v)} || '%'`);
        const nullConditionsNotContains = [and(...andConditions), isNull(column)];
        if (isTextField) {
          nullConditionsNotContains.push(eq(column, ''));
        }
        return or(...nullConditionsNotContains);
      }
    
    case 'begins_with':
      // Multi-value OR: begins with ANY of the values
      const startsOrConditions = values.map(v => sql`${compareColumn} ILIKE ${String(v)} || '%'`);
      return or(...startsOrConditions);
    
    case 'ends_with':
      // Multi-value OR: ends with ANY of the values
      const endsOrConditions = values.map(v => sql`${compareColumn} ILIKE '%' || ${String(v)}`);
      return or(...endsOrConditions);
    
    default:
      console.warn(`Operator ${operator} not supported`);
      return undefined;
  }
}

// Helper to apply suppression filters for contacts
export function buildSuppressionFilter(
  isEmailSuppressed?: boolean,
  isPhoneSuppressed?: boolean
): SQL | undefined {
  const conditions: SQL[] = [];

  if (isEmailSuppressed !== undefined) {
    if (isEmailSuppressed) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM suppression_emails 
          WHERE suppression_emails.email = contacts.email_normalized
        )`
      );
    } else {
      conditions.push(
        sql`NOT EXISTS (
          SELECT 1 FROM suppression_emails 
          WHERE suppression_emails.email = contacts.email_normalized
        )`
      );
    }
  }

  if (isPhoneSuppressed !== undefined && isPhoneSuppressed) {
    conditions.push(
      or(
        sql`EXISTS (
          SELECT 1 FROM suppression_phones 
          WHERE suppression_phones.phone_number = contacts.direct_phone_e164
        )`,
        sql`EXISTS (
          SELECT 1 FROM suppression_phones 
          WHERE suppression_phones.phone_number = contacts.mobile_phone_e164
        )`
      )!
    );
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return and(...conditions);
}
