// Seed script to populate filter field registry with all available fields
import { db } from './db';
import { filterFieldRegistry, type FilterField } from '@shared/schema';

interface FilterFieldDef {
  entity: string;
  key: string;
  label: string;
  type: string;
  operators: string[];
  category: FilterField['category'];
  isCustom: boolean;
  description?: string;
  sortOrder?: number;
}

const filterFields: FilterFieldDef[] = [
  // Contact Fields
  { entity: 'contact', key: 'fullName', label: 'Full Name', type: 'string', operators: ['equals', 'contains', 'startsWith', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 1 },
  { entity: 'contact', key: 'firstName', label: 'First Name', type: 'string', operators: ['equals', 'contains', 'startsWith', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 2 },
  { entity: 'contact', key: 'lastName', label: 'Last Name', type: 'string', operators: ['equals', 'contains', 'startsWith', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 3 },
  { entity: 'contact', key: 'email', label: 'Email Address', type: 'string', operators: ['equals', 'contains', 'endsWith', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 4 },
  { entity: 'contact', key: 'emailVerificationStatus', label: 'Email Verification Status', type: 'string', operators: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 5 },
  { entity: 'contact', key: 'directPhone', label: 'Direct Phone', type: 'string', operators: ['equals', 'notEquals', 'contains', 'doesNotContain', 'startsWith', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 6 },
  { entity: 'contact', key: 'mobilePhone', label: 'Mobile Phone', type: 'string', operators: ['equals', 'notEquals', 'contains', 'doesNotContain', 'startsWith', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 7 },
  { entity: 'contact', key: 'jobTitle', label: 'Job Title', type: 'string', operators: ['equals', 'contains', 'startsWith', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 7 },
  { entity: 'contact', key: 'department', label: 'Department', type: 'string', operators: ['equals', 'contains', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 8 },
  { entity: 'contact', key: 'seniorityLevel', label: 'Seniority Level', type: 'string', operators: ['equals', 'notEquals'], category: 'contact_fields', isCustom: false, sortOrder: 9 },
  { entity: 'contact', key: 'city', label: 'City', type: 'string', operators: ['equals', 'contains', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 10 },
  { entity: 'contact', key: 'state', label: 'State/Province', type: 'string', operators: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 11 },
  { entity: 'contact', key: 'country', label: 'Country', type: 'string', operators: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 12 },
  { entity: 'contact', key: 'linkedinUrl', label: 'LinkedIn Profile URL', type: 'string', operators: ['equals', 'contains', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 13 },
  { entity: 'contact', key: 'intentTopics', label: 'Intent Topics', type: 'array', operators: ['containsAny', 'containsAll', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 14 },
  { entity: 'contact', key: 'tags', label: 'Contact Tags', type: 'array', operators: ['containsAny', 'containsAll', 'isEmpty', 'isNotEmpty'], category: 'contact_fields', isCustom: false, sortOrder: 15 },
  { entity: 'contact', key: 'accountName', label: 'Account Name', type: 'string', operators: ['equals', 'contains', 'startsWith', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_relationship', isCustom: false, sortOrder: 100 },
  { entity: 'contact', key: 'accountDomain', label: 'Account Domain', type: 'string', operators: ['equals', 'contains', 'containsAny', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_relationship', isCustom: false, sortOrder: 101 },
  { entity: 'contact', key: 'employeesSizeRange', label: 'Employee Count Range', type: 'enum', operators: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_relationship', isCustom: false, sortOrder: 102 },
  { entity: 'contact', key: 'staffCount', label: 'Staff Count', type: 'number', operators: ['equals', 'greaterThan', 'lessThan', 'between', 'notEquals'], category: 'account_relationship', isCustom: false, sortOrder: 103 },

  // Account Fields
  { entity: 'account', key: 'name', label: 'Company Name', type: 'string', operators: ['equals', 'contains', 'startsWith', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 1 },
  { entity: 'account', key: 'domain', label: 'Company Domain', type: 'string', operators: ['equals', 'contains', 'endsWith', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 2 },
  { entity: 'account', key: 'industry', label: 'Industry', type: 'string', operators: ['equals', 'contains', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 3 },
  { entity: 'account', key: 'annualRevenue', label: 'Annual Revenue', type: 'string', operators: ['equals', 'contains', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 4 },
  { entity: 'account', key: 'employeesSizeRange', label: 'Employee Count Range', type: 'enum', operators: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 5 },
  { entity: 'account', key: 'staffCount', label: 'Staff Count', type: 'number', operators: ['equals', 'greaterThan', 'lessThan', 'between', 'notEquals'], category: 'account_fields', isCustom: false, sortOrder: 6 },
  { entity: 'account', key: 'hqCity', label: 'HQ City', type: 'string', operators: ['equals', 'contains', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 7 },
  { entity: 'account', key: 'hqState', label: 'HQ State', type: 'string', operators: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 8 },
  { entity: 'account', key: 'hqCountry', label: 'HQ Country', type: 'string', operators: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 9 },
  { entity: 'account', key: 'linkedinUrl', label: 'LinkedIn Company Page', type: 'string', operators: ['equals', 'contains', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 10 },
  { entity: 'account', key: 'linkedinSpecialties', label: 'LinkedIn Specialties', type: 'array', operators: ['containsAny', 'containsAll', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 11 },
  { entity: 'account', key: 'intentTopics', label: 'Intent Topics', type: 'array', operators: ['containsAny', 'containsAll', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 12 },
  { entity: 'account', key: 'techStack', label: 'Technologies Installed', type: 'array', operators: ['containsAny', 'containsAll', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 13 },
  { entity: 'account', key: 'tags', label: 'Account Tags', type: 'array', operators: ['containsAny', 'containsAll', 'isEmpty', 'isNotEmpty'], category: 'account_fields', isCustom: false, sortOrder: 14 },

  // Suppression Fields
  { entity: 'suppression', key: 'emailSuppressed', label: 'Email Suppressed', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'suppression_fields', isCustom: false, sortOrder: 1, description: 'Contact email is on suppression list' },
  { entity: 'suppression', key: 'dncFlag', label: 'Do Not Call', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'suppression_fields', isCustom: false, sortOrder: 2, description: 'Contact phone is on DNC list' },
  { entity: 'suppression', key: 'consentWithdrawn', label: 'Consent Withdrawn', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'suppression_fields', isCustom: false, sortOrder: 3 },

  // Email Campaign Fields
  { entity: 'email_activity', key: 'campaignName', label: 'Campaign Name', type: 'string', operators: ['equals', 'contains', 'notEquals'], category: 'email_campaign_fields', isCustom: false, sortOrder: 1 },
  { entity: 'email_activity', key: 'emailSent', label: 'Email Sent', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'email_campaign_fields', isCustom: false, sortOrder: 2 },
  { entity: 'email_activity', key: 'emailDelivered', label: 'Email Delivered', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'email_campaign_fields', isCustom: false, sortOrder: 3 },
  { entity: 'email_activity', key: 'emailOpened', label: 'Email Opened', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'email_campaign_fields', isCustom: false, sortOrder: 4 },
  { entity: 'email_activity', key: 'emailClicked', label: 'Email Clicked', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'email_campaign_fields', isCustom: false, sortOrder: 5 },
  { entity: 'email_activity', key: 'emailBounced', label: 'Email Bounced', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'email_campaign_fields', isCustom: false, sortOrder: 6 },

  // Telemarketing Campaign Fields  
  { entity: 'call_activity', key: 'campaignName', label: 'Telemarketing Campaign', type: 'string', operators: ['equals', 'contains', 'notEquals'], category: 'telemarketing_campaign_fields', isCustom: false, sortOrder: 1 },
  { entity: 'call_activity', key: 'callerName', label: 'Caller Name', type: 'string', operators: ['equals', 'contains'], category: 'telemarketing_campaign_fields', isCustom: false, sortOrder: 2 },
  { entity: 'call_activity', key: 'callDisposition', label: 'Call Disposition', type: 'string', operators: ['equals', 'notEquals'], category: 'telemarketing_campaign_fields', isCustom: false, sortOrder: 3 },
  { entity: 'call_activity', key: 'callDuration', label: 'Call Duration (seconds)', type: 'number', operators: ['equals', 'greaterThan', 'lessThan', 'between'], category: 'telemarketing_campaign_fields', isCustom: false, sortOrder: 4 },

  // QA Fields
  { entity: 'lead', key: 'qaStatus', label: 'QA Status', type: 'string', operators: ['equals', 'notEquals'], category: 'qa_fields', isCustom: false, sortOrder: 1 },
  { entity: 'lead', key: 'qaComments', label: 'QA Comments', type: 'string', operators: ['contains', 'isEmpty', 'isNotEmpty'], category: 'qa_fields', isCustom: false, sortOrder: 2 },
  { entity: 'lead', key: 'qaRejectionReason', label: 'QA Rejection Reason', type: 'string', operators: ['equals', 'contains', 'isEmpty', 'isNotEmpty'], category: 'qa_fields', isCustom: false, sortOrder: 3 },

  // List/Segment Fields
  { entity: 'membership', key: 'includedInList', label: 'Included in List', type: 'string', operators: ['equals', 'notEquals'], category: 'list_segment_fields', isCustom: false, sortOrder: 1 },
  { entity: 'membership', key: 'includedInSegment', label: 'Included in Segment', type: 'string', operators: ['equals', 'notEquals'], category: 'list_segment_fields', isCustom: false, sortOrder: 2 },

  // Client Portal Fields
  { entity: 'client_delivery', key: 'clientDelivered', label: 'Delivered to Client', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'client_portal_fields', isCustom: false, sortOrder: 1 },
  { entity: 'client_delivery', key: 'clientAccepted', label: 'Client Accepted', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'client_portal_fields', isCustom: false, sortOrder: 2 },
  { entity: 'client_delivery', key: 'clientRejected', label: 'Client Rejected', type: 'boolean', operators: ['isTrue', 'isFalse'], category: 'client_portal_fields', isCustom: false, sortOrder: 3 },
  { entity: 'client_delivery', key: 'clientComments', label: 'Client Feedback', type: 'string', operators: ['contains', 'isEmpty', 'isNotEmpty'], category: 'client_portal_fields', isCustom: false, sortOrder: 4 },
  { entity: 'client_delivery', key: 'clientName', label: 'Client Organization', type: 'string', operators: ['equals', 'contains', 'notEquals'], category: 'client_portal_fields', isCustom: false, sortOrder: 5 },
];

export async function seedFilterFields() {
  console.log('Seeding filter field registry...');

  // Clear existing fields (optional - remove if you want to preserve custom fields)
  await db.delete(filterFieldRegistry).execute();

  // Insert all field definitions
  await db.insert(filterFieldRegistry).values(
    filterFields.map(field => ({
      ...field,
      visibleInFilters: true,
    }))
  ).execute();

  console.log(`✓ Seeded ${filterFields.length} filter fields across ${new Set(filterFields.map(f => f.category)).size} categories`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedFilterFields()
    .then(() => {
      console.log('Seed complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    });
}