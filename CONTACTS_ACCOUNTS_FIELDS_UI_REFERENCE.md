# Contacts, Accounts & Fields UI Reference

## 📁 File Structure

### Page Components (client/src/pages/)

#### **Contacts Pages**
1. **`contacts.tsx`** - Main contacts list page
   - Features: Search, filters, bulk actions, pagination
   - Import/Export CSV functionality
   - Create contact dialog with form validation
   - Suppression list warnings (email & phone)
   - Selection & bulk operations (update, delete, add to list)
   
2. **`contact-detail.tsx`** - Individual contact detail page
   - Full contact information display
   - Linked account information
   - Contact navigation (prev/next)
   - Edit contact dialog
   - Lists & segments membership
   - Activity timeline
   - Professional history section
   - Data quality & source information
   - Custom fields display

#### **Accounts Pages**
1. **`accounts.tsx`** - Main accounts list page
   - Dual view modes: Cards & Table view
   - Search, filters, bulk actions, pagination
   - Import/Export CSV functionality
   - Create account dialog with form validation
   - Selection & bulk operations
   
2. **`account-detail.tsx`** - Individual account detail page
   - Full account/company overview
   - Related contacts table
   - Account navigation (prev/next)
   - Edit account dialog
   - AI industry suggestions review system
   - Lists & segments membership
   - Activity timeline
   - Technology stack & intent signals
   - Custom fields display
   
3. **`accounts-list-detail.tsx`** - Account list details (additional component)

### Component Files (client/src/components/)

#### **Custom Fields**
1. **`custom-fields-renderer.tsx`** - Dynamic custom field renderer
   - Supports multiple field types: text, number, email, url, date, boolean, select, multi_select, textarea
   - Renders appropriate input controls based on field type
   - Used in both contacts and accounts
   - Fetches active custom field definitions from API

#### **Account-Specific Components**
1. **`csv-import-accounts-dialog.tsx`** - CSV import dialog for accounts
2. **`accounts/account-card-premium.tsx`** - Premium card display for accounts

#### **General Components**
1. **`csv-field-mapper.tsx`** - CSV field mapping component (used for imports)

---

## 🗂️ Database Schema Fields

### **CONTACTS** (76+ fields total)

#### Core Identity
- `id` (varchar, UUID primary key)
- `accountId` (varchar, foreign key to accounts)
- `fullName` (text, required)
- `firstName` (text)
- `lastName` (text)

#### Contact Information
- `email` (text, required, unique)
- `emailNormalized` (text, indexed)
- `emailVerificationStatus` (enum: unknown/valid/invalid/risky)
- `emailAiConfidence` (numeric 0-100%)
- `emailStatus` (text, default 'unknown')

#### Phone Numbers
- `directPhone` (text) - Work direct line
- `directPhoneE164` (text) - E.164 format for calling
- `phoneExtension` (text)
- `phoneVerifiedAt` (timestamp)
- `phoneAiConfidence` (numeric 0-100%)
- `phoneStatus` (text, default 'unknown')
- `mobilePhone` (text) - Mobile direct
- `mobilePhoneE164` (text) - E.164 format

#### Professional Details
- `jobTitle` (text)
- `department` (text)
- `seniorityLevel` (text)

#### Career & Tenure
- `formerPosition` (text)
- `timeInCurrentPosition` (text) - e.g., "2 years"
- `timeInCurrentPositionMonths` (integer) - Computed for filtering
- `timeInCurrentCompany` (text) - e.g., "4 years"
- `timeInCurrentCompanyMonths` (integer) - Computed for filtering

#### Location & Geography
- `address` (text)
- `city` (text)
- `state` (text)
- `stateAbbr` (text) - e.g., "NC", "CA"
- `county` (text)
- `postalCode` (text)
- `country` (text)
- `contactLocation` (text) - Full formatted location
- `timezone` (text) - IANA timezone (e.g., 'America/New_York')

#### Social & Professional Networks
- `linkedinUrl` (text)

#### Data Enrichment
- `intentTopics` (text array) - Intent signals
- `tags` (text array)
- `customFields` (jsonb) - Dynamic custom fields

#### Source & Tracking
- `sourceSystem` (text)
- `sourceRecordId` (text)
- `sourceUpdatedAt` (timestamp)
- `researchDate` (timestamp) - Enrichment date
- `list` (text) - Source list identifier (e.g., "InFynd", "ZoomInfo")

#### Data Quality
- `isInvalid` (boolean, default false)
- `invalidReason` (text)
- `invalidatedAt` (timestamp)
- `invalidatedBy` (varchar, user ID)

#### Consent & Compliance
- `consentBasis` (text)
- `consentSource` (text)
- `consentTimestamp` (timestamp)

#### Ownership & Metadata
- `ownerId` (varchar, user ID)
- `deletedAt` (timestamp) - Soft delete
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

---

### **ACCOUNTS** (70+ fields total)

#### Core Identity
- `id` (varchar, UUID primary key)
- `name` (text, required)
- `nameNormalized` (text)
- `canonicalName` (text) - Standardized name
- `domain` (text)
- `domainNormalized` (text, unique)
- `websiteDomain` (text) - Naked domain (e.g., aircanada.com)
- `previousNames` (text array)

#### Industry Classification (Dual-Strategy)
- `industryStandardized` (text) - Primary industry
- `industrySecondary` (text array) - Secondary industries
- `industryCode` (text)
- `industryRaw` (text) - Original industry value
- `sicCode` (text)
- `naicsCode` (text)

#### AI Industry Enrichment
- `industryAiSuggested` (text)
- `industryAiCandidates` (jsonb) - AI candidate suggestions
- `industryAiTopk` (text array) - Top K suggestions
- `industryAiConfidence` (numeric 0-1)
- `industryAiSource` (text)
- `industryAiSuggestedAt` (timestamp)
- `industryAiReviewedBy` (varchar, user ID)
- `industryAiReviewedAt` (timestamp)
- `industryAiStatus` (enum: pending/reviewed/accepted/rejected)

#### Company Size & Revenue
- `annualRevenue` (numeric)
- `revenueRange` (enum) - "$500M - $1B", "$1B+", etc.
- `employeesSizeRange` (enum) - "501-1000", "10000+", etc.
- `staffCount` (integer)

#### Company Information
- `description` (text) - Multiline UTF-8 company description
- `yearFounded` (integer)
- `foundedDate` (date) - YYYY-MM-DD or YYYY
- `foundedDatePrecision` (text) - 'year' or 'full'

#### Headquarters Location
- `hqStreet1` (text)
- `hqStreet2` (text)
- `hqStreet3` (text)
- `hqAddress` (text) - Legacy combined
- `hqCity` (text)
- `hqState` (text)
- `hqStateAbbr` (text) - e.g., "NC", "CA"
- `hqPostalCode` (text)
- `hqCountry` (text)
- `companyLocation` (text) - Full formatted location

#### Contact Information
- `mainPhone` (text)
- `mainPhoneE164` (text) - E.164 format for calling
- `mainPhoneExtension` (text)

#### Social & Professional Networks
- `linkedinUrl` (text)
- `linkedinId` (text) - LinkedIn numeric ID
- `linkedinSpecialties` (text array)

#### Technology & Intent
- `techStack` (text array) - Technologies installed
- `webTechnologies` (text) - BuiltWith URL or CSV list
- `webTechnologiesJson` (jsonb) - Normalized array
- `intentTopics` (text array) - Intent signals

#### Enrichment & AI
- `aiEnrichmentData` (jsonb) - Full AI research results
- `aiEnrichmentDate` (timestamp) - Last enrichment

#### Hierarchy & Organization
- `parentAccountId` (varchar) - Parent company
- `tags` (text array)
- `customFields` (jsonb) - Dynamic custom fields

#### Source & Tracking
- `sourceSystem` (text)
- `sourceRecordId` (text)
- `sourceUpdatedAt` (timestamp)

#### Ownership & Metadata
- `ownerId` (varchar, user ID)
- `deletedAt` (timestamp) - Soft delete
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

---

## 🎨 UI Display Patterns

### **Contact Detail Page Sections**

1. **Contact Information Card**
   - Email with icon
   - Phone numbers (direct work + mobile) with click-to-call
   - Job title, department, seniority
   - Phone extensions
   - Email verification status badge
   - Location (city, state, county, postal code, country)
   - Full address strings
   - Intent topics (badges)

2. **Professional History Card** (conditional)
   - Former position
   - Time in current position
   - Time at company

3. **Data Quality & Source Card** (conditional)
   - Email AI confidence
   - Phone AI confidence
   - Source system
   - Research date
   - Timezone
   - List identifier

4. **Custom Fields Card** (conditional)
   - Dynamic display of all custom fields
   - 2-column grid layout

5. **Linked Account Card**
   - Company name with icon
   - Domain
   - Industry
   - Employee size
   - Revenue
   - Location
   - Click to view full account

6. **Lists & Segments Membership**
   - Shows all lists and dynamic segments

7. **Activity Timeline**
   - Real-time activity feed
   - Auto-refresh every 30 seconds

### **Account Detail Page Sections**

1. **Overview Card**
   - Industry (primary + secondary badges)
   - Employee size
   - Annual revenue
   - HQ location (city, state, country)
   - Postal code
   - Year founded
   - Main HQ phone with click-to-call
   - HQ street addresses (1, 2, 3)
   - Description
   - Full address string
   - Custom fields (2-column grid)
   - Tech stack (badges)
   - Intent topics (badges)

2. **AI Industry Suggestions Card** (conditional)
   - Shows AI-suggested industries
   - Confidence scores
   - Accept/Reject workflow
   - Primary/Secondary selection

3. **Related Contacts Table**
   - Name with avatar
   - Title
   - Email
   - Direct work phone
   - Mobile direct
   - Click-to-call links
   - View contact button

4. **Lists & Segments Membership**
   - Shows all lists and dynamic segments

5. **Activity Timeline**
   - Real-time activity feed
   - Auto-refresh every 30 seconds

---

## 📊 Custom Fields System

### **Field Types Supported**
1. **text** - Single-line text input
2. **number** - Numeric input
3. **email** - Email input with validation
4. **url** - URL input with validation
5. **date** - Date picker
6. **boolean** - Toggle switch
7. **select** - Single-select dropdown
8. **multi_select** - Multiple checkbox selection
9. **textarea** - Multi-line text (default fallback)

### **Custom Field Definition Table**
Fields stored in `custom_field_definitions`:
- `entityType` - 'account' or 'contact'
- `fieldKey` - Unique key in customFields JSONB
- `displayLabel` - Human-readable label
- `fieldType` - Type from list above
- `options` - For select/multi_select (JSON array)
- `required` - Boolean
- `defaultValue` - Text
- `helpText` - Tooltip/placeholder
- `displayOrder` - Sort order
- `active` - Enable/disable

### **Storage**
- Custom field values stored in `customFields` JSONB column
- Completely dynamic - no schema changes needed
- Filtered by entityType and active status
- Rendered using `CustomFieldsRenderer` component

---

## 🔧 Key UI Features

### **Contacts Page**
- ✅ Search by name, email, title, company
- ✅ Advanced sidebar filters (SidebarFilters component)
- ✅ Bulk selection (single page or all pages)
- ✅ Bulk operations: Update, Delete, Export, Add to List
- ✅ CSV Import with field mapping
- ✅ CSV Export (filtered results)
- ✅ Suppression warnings (email & phone)
- ✅ Create contact dialog with validation
- ✅ Pagination (50 items per page)

### **Accounts Page**
- ✅ Dual view modes (Cards / Table toggle)
- ✅ Search by name, domain, industry
- ✅ Advanced sidebar filters
- ✅ Bulk selection (cards or table rows)
- ✅ Bulk operations: Update, Delete, Export, Add to List
- ✅ CSV Import with smart field mapping
- ✅ CSV Export (filtered results)
- ✅ Create account dialog
- ✅ Pagination (50 items per page)

### **Detail Pages Navigation**
- ✅ Breadcrumb navigation
- ✅ Previous/Next entity navigation
- ✅ Quick action buttons (LinkedIn, Call, Email, Copy, Website)
- ✅ Edit dialog
- ✅ Related entity links (contact ↔ account)

---

## 📋 Data Completeness Indicators

Both contact and account detail pages calculate data completeness scores based on:

**Contact Key Fields:**
- firstName, lastName, jobTitle, department, seniorityLevel
- directPhone, mobilePhone, linkedinUrl
- city, state, country

**Account Key Fields:**
- domain, industryStandardized, employeesSizeRange
- annualRevenue, hqCity, hqState, hqCountry
- mainPhone, linkedinUrl

Displayed as percentage with color-coded badges.

---

## 📤 CSV Import/Export Fields

### **Contact CSV Import Template** (Unified Format)
Supports both contacts-only and unified contacts+accounts format with automatic detection.

#### **Contact Import Fields** (20 base fields + custom)
1. `firstName` - First name
2. `lastName` - Last name
3. `fullName` - Full name (auto-computed if not provided)
4. `email` - Email address (required)
5. `directPhone` - Direct work phone
6. `mobilePhone` - Mobile direct phone
7. `jobTitle` - Job title
8. `department` - Department
9. `seniorityLevel` - Seniority level
10. `city` - City
11. `state` - State
12. `county` - County
13. `postalCode` - Postal/ZIP code
14. `country` - Country
15. `contactLocation` - Full formatted location
16. `linkedinUrl` - LinkedIn profile URL
17. `consentBasis` - Consent basis (e.g., "legitimate_interest")
18. `consentSource` - Consent source (e.g., "Website Form")
19. `tags` - Comma-separated tags (e.g., "enterprise,vip")
20. `customFields` - JSON string for custom fields

#### **Account Import Fields** (Prefixed with `account_`)
21. `account_name` - Company name
22. `account_domain` - Company domain
23. `account_industry` - Industry
24. `account_employeesSize` - Employee size range
25. `account_revenue` - Revenue range
26. `account_hqStreet1` - HQ street address 1
27. `account_hqStreet2` - HQ street address 2
28. `account_hqStreet3` - HQ street address 3
29. `account_hqCity` - HQ city
30. `account_hqState` - HQ state
31. `account_hqPostalCode` - HQ postal code
32. `account_hqCountry` - HQ country
33. `account_companyLocation` - Full formatted HQ location
34. `account_phone` - Main HQ phone
35. `account_linkedinUrl` - Company LinkedIn URL
36. `account_description` - Company description
37. `account_techStack` - Comma-separated technologies
38. `account_tags` - Comma-separated account tags
39. `account_customFields` - JSON string for account custom fields

**Features:**
- ✅ Automatic format detection (unified vs contacts-only)
- ✅ Smart field mapping with CSV field mapper
- ✅ Flexible column name matching (handles variations)
- ✅ Batch processing (50 contacts per batch)
- ✅ Duplicate detection via email
- ✅ Automatic account linking
- ✅ Custom fields support (dynamic)
- ✅ Phone number formatting by country
- ✅ Email normalization
- ✅ Tags array parsing
- ✅ Validation with error reporting

---

### **Contact CSV Export Fields** (56 fields)

Complete export includes all database fields for full data portability:

1. `id` - Contact UUID
2. `accountId` - Linked account UUID
3. `firstName` - First name
4. `lastName` - Last name
5. `fullName` - Full name
6. `email` - Email address
7. `emailNormalized` - Normalized email
8. `emailVerificationStatus` - Verification status (unknown/valid/invalid/risky)
9. `emailAiConfidence` - AI confidence score (0-100%)
10. `directPhone` - Direct work phone (formatted)
11. `directPhoneE164` - E.164 phone format
12. `phoneExtension` - Phone extension
13. `phoneVerifiedAt` - Phone verification timestamp
14. `phoneAiConfidence` - Phone AI confidence (0-100%)
15. `mobilePhone` - Mobile phone (formatted)
16. `mobilePhoneE164` - Mobile E.164 format
17. `jobTitle` - Job title
18. `department` - Department
19. `seniorityLevel` - Seniority level
20. `formerPosition` - Previous position
21. `timeInCurrentPosition` - Time in current role
22. `timeInCurrentCompany` - Time at company
23. `linkedinUrl` - LinkedIn profile URL
24. `address` - Street address
25. `city` - City
26. `state` - State
27. `stateAbbr` - State abbreviation
28. `county` - County
29. `postalCode` - Postal/ZIP code
30. `country` - Country
31. `contactLocation` - Full formatted location
32. `timezone` - IANA timezone
33. `intentTopics` - Comma-separated intent topics
34. `tags` - Comma-separated tags
35. `consentBasis` - Consent basis
36. `consentSource` - Consent source
37. `consentTimestamp` - Consent timestamp
38. `ownerId` - Owner user ID
39. `customFields` - JSON custom fields
40. `emailStatus` - Email status
41. `phoneStatus` - Phone status
42. `sourceSystem` - Source system
43. `sourceRecordId` - Source record ID
44. `sourceUpdatedAt` - Source update timestamp
45. `researchDate` - Research/enrichment date
46. `list` - Source list identifier
47. `isInvalid` - Invalid flag (boolean)
48. `invalidReason` - Invalid reason
49. `invalidatedAt` - Invalidation timestamp
50. `invalidatedBy` - Invalidated by user ID
51. `deletedAt` - Soft delete timestamp
52. `createdAt` - Creation timestamp
53. `updatedAt` - Last update timestamp

**Export Features:**
- ✅ RFC4180 compliant CSV format
- ✅ Proper escaping for commas, quotes, newlines
- ✅ Array fields as comma-separated values
- ✅ JSON custom fields preserved
- ✅ All timestamps included
- ✅ Bulk export of filtered results
- ✅ Admin-only export access

---

### **Account CSV Import Template** (19 fields + custom)

1. `name` - Company name (required)
2. `domain` - Company domain
3. `industryStandardized` - Standardized industry
4. `employeesSizeRange` - Employee size range (e.g., "1000-5000")
5. `annualRevenue` - Annual revenue
6. `hqStreet1` - HQ street address 1
7. `hqStreet2` - HQ street address 2
8. `hqStreet3` - HQ street address 3
9. `hqCity` - HQ city
10. `hqState` - HQ state
11. `hqPostalCode` - HQ postal code
12. `hqCountry` - HQ country
13. `companyLocation` - Full formatted HQ location
14. `mainPhone` - Main HQ phone
15. `linkedinUrl` - Company LinkedIn URL
16. `description` - Company description
17. `techStack` - Comma-separated technologies
18. `tags` - Comma-separated tags
19. `customFields` - JSON string for custom fields

**Features:**
- ✅ Batch processing (100 accounts per batch)
- ✅ Duplicate detection via domain
- ✅ Fuzzy name matching for deduplication
- ✅ Custom fields support
- ✅ Phone number formatting
- ✅ Validation with error reporting
- ✅ CSV template generator

---

### **Account CSV Export Fields** (51 fields)

Complete export includes all database fields:

1. `id` - Account UUID
2. `name` - Company name
3. `nameNormalized` - Normalized name
4. `domain` - Company domain
5. `domainNormalized` - Normalized domain
6. `industryStandardized` - Primary industry
7. `industrySecondary` - Comma-separated secondary industries
8. `industryCode` - Industry code
9. `industryRaw` - Original industry value
10. `industryAiSuggested` - AI suggested industry
11. `industryAiTopk` - Comma-separated AI top K suggestions
12. `industryAiConfidence` - AI confidence score
13. `industryAiSource` - AI source
14. `industryAiSuggestedAt` - AI suggestion timestamp
15. `industryAiStatus` - AI review status
16. `annualRevenue` - Annual revenue
17. `revenueRange` - Revenue range
18. `employeesSizeRange` - Employee size range
19. `staffCount` - Exact staff count
20. `description` - Company description
21. `hqStreet1` - HQ street 1
22. `hqStreet2` - HQ street 2
23. `hqStreet3` - HQ street 3
24. `hqAddress` - Legacy combined address
25. `hqCity` - HQ city
26. `hqState` - HQ state
27. `hqStateAbbr` - HQ state abbreviation
28. `hqPostalCode` - HQ postal code
29. `hqCountry` - HQ country
30. `companyLocation` - Full formatted location
31. `yearFounded` - Year founded
32. `sicCode` - SIC code
33. `naicsCode` - NAICS code
34. `previousNames` - Comma-separated previous names
35. `linkedinUrl` - LinkedIn company URL
36. `linkedinId` - LinkedIn numeric ID
37. `linkedinSpecialties` - Comma-separated specialties
38. `mainPhone` - Main phone (formatted)
39. `mainPhoneE164` - E.164 phone format
40. `mainPhoneExtension` - Phone extension
41. `intentTopics` - Comma-separated intent topics
42. `techStack` - Comma-separated technologies
43. `parentAccountId` - Parent company UUID
44. `tags` - Comma-separated tags
45. `ownerId` - Owner user ID
46. `customFields` - JSON custom fields
47. `sourceSystem` - Source system
48. `sourceRecordId` - Source record ID
49. `sourceUpdatedAt` - Source update timestamp
50. `aiEnrichmentDate` - AI enrichment timestamp
51. `deletedAt` - Soft delete timestamp
52. `createdAt` - Creation timestamp
53. `updatedAt` - Last update timestamp

**Export Features:**
- ✅ RFC4180 compliant CSV format
- ✅ All AI enrichment fields included
- ✅ Complete industry classification data
- ✅ Array fields as comma-separated values
- ✅ JSON custom fields preserved
- ✅ Hierarchy support (parent accounts)
- ✅ Bulk export with filters

---

## 🎯 Summary

**Total UI Files:**
- 5 page components (contacts, contact-detail, accounts, account-detail, accounts-list-detail)
- 4 component files (custom-fields-renderer, csv-import-accounts-dialog, account-card-premium, csv-field-mapper)

**Total Database Fields:**
- Contacts: 76+ fields
- Accounts: 70+ fields
- Custom Fields: Unlimited via JSONB

**CSV Import/Export:**
- Contact Import: 20 base fields + account fields + custom fields
- Contact Export: 56 fields (complete data)
- Account Import: 19 fields + custom fields
- Account Export: 51 fields (complete data)

**Total Features:**
- Full CRUD operations
- Advanced filtering & search
- Bulk operations (update, delete, export, add to list)
- CSV Import/Export with field mapping
- Unified contacts+accounts import
- Automatic deduplication
- Phone number formatting
- Email normalization
- AI enrichment integration
- Custom fields system (9 field types)
- Activity tracking
- Suppression management
- Data quality scoring
- RFC4180 compliant CSV format

---

## ⚠️ Known Issues & Gaps

### **Missing Fields in CSV Export** 

#### Contact Export (2 missing fields)
- ❌ `timeInCurrentPositionMonths` - Computed integer for filtering
- ❌ `timeInCurrentCompanyMonths` - Computed integer for filtering

**Impact:** Numeric tenure fields for advanced filtering not exported.

#### Account Export (11 missing fields)
- ❌ `canonicalName` - Standardized company name
- ❌ `websiteDomain` - Naked domain (e.g., aircanada.com)
- ❌ `foundedDate` - YYYY-MM-DD founding date
- ❌ `foundedDatePrecision` - 'year' or 'full'
- ❌ `industryAiCandidates` - Full AI candidate suggestions (JSON)
- ❌ `industryAiReviewedBy` - User ID who reviewed AI
- ❌ `industryAiReviewedAt` - AI review timestamp
- ❌ `webTechnologies` - BuiltWith URL/list
- ❌ `webTechnologiesJson` - Normalized tech array (JSON)
- ❌ `aiEnrichmentData` - Full AI research results (JSON)

**Impact:** Critical data loss during export/reimport cycles including:
- AI review workflow data
- Company canonicalization for deduplication
- Complete technology information
- AI enrichment audit trail

**See:** `FIELD_ISSUES_ANALYSIS.md` for detailed analysis and fixes.

---

## 📚 Related Documentation

- **FIELD_ISSUES_ANALYSIS.md** - Comprehensive analysis of missing export fields, UI conditional rendering logic, and CSV mapping edge cases
- **replit.md** - System architecture and technical implementation details
- **shared/schema.ts** - Complete database schema definitions
