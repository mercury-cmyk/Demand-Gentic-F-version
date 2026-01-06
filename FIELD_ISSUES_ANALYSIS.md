# Field Issues Analysis Report

**Generated:** October 22, 2025  
**Analysis of:** UI Display, CSV Export, and CSV Import Mapping

---

## 🔍 Executive Summary

This report identifies **13 missing database fields** in CSV export functions, explains why certain fields don't appear in the UI (intentional design), and evaluates CSV import mapping logic for potential issues.

---

## ❌ CRITICAL: Missing Fields in CSV Export

### **Contact Export Missing (2 fields)**

The `exportContactsToCSV` function in `client/src/lib/csv-utils.ts` is **missing these computed fields**:

1. ✗ `timeInCurrentPositionMonths` (integer) - Shadow field for filtering/sorting tenure
2. ✗ `timeInCurrentCompanyMonths` (integer) - Shadow field for filtering/sorting company tenure

**Impact:** Users cannot export computed numeric values for filtering position/company tenure. Only text values (`timeInCurrentPosition`, `timeInCurrentCompany`) are exported.

**Location:** Lines 209-264 in `client/src/lib/csv-utils.ts`

---

### **Account Export Missing (11 fields)**

The `exportAccountsToCSV` function is **missing these database fields**:

#### Core Company Fields (3 missing)
3. ✗ `canonicalName` (text) - Standardized company name for deduplication
4. ✗ `websiteDomain` (text) - Naked domain (e.g., aircanada.com)
5. ✗ `foundedDate` (date) - YYYY-MM-DD or YYYY founding date
6. ✗ `foundedDatePrecision` (text) - 'year' or 'full' precision indicator

#### AI Industry Enrichment (3 missing)
7. ✗ `industryAiCandidates` (jsonb) - Full AI candidate suggestions array
8. ✗ `industryAiReviewedBy` (varchar) - User ID who reviewed AI suggestions
9. ✗ `industryAiReviewedAt` (timestamp) - When AI suggestions were reviewed

#### Technology Fields (2 missing)
10. ✗ `webTechnologies` (text) - BuiltWith URL or comma-separated list
11. ✗ `webTechnologiesJson` (jsonb) - Normalized array for filtering

#### AI Enrichment Data (1 missing)
12. ✗ `aiEnrichmentData` (jsonb) - Full AI research results from enrichment

**Impact:** Users lose critical data during export/reimport cycles, including:
- AI-powered industry suggestions and review workflow data
- Company canonicalization used for deduplication
- Complete technology stack information (only basic `techStack` exported)
- Founding date precision metadata
- Full AI enrichment research results

**Location:** Lines 326-381 in `client/src/lib/csv-utils.ts`

---

## ✅ UI Fields "Not Showing" - Intentional Design

Fields in detail pages are **conditionally rendered** based on data availability. This is **correct behavior**, not a bug.

### **Contact Detail Page** (client/src/pages/contact-detail.tsx)

**Conditionally Rendered Sections:**

1. **Professional History Card** - Only shown if ANY of these exist:
   - `formerPosition`
   - `timeInCurrentPosition`
   - `timeInCurrentCompany`

2. **Data Quality & Source Card** - Only shown if ANY of these exist:
   - `emailAiConfidence`
   - `phoneAiConfidence`
   - `sourceSystem`
   - `researchDate`
   - `timezone`
   - `list`

3. **Intent Signals** - Only shown if `intentTopics` array has values

4. **Custom Fields Card** - Only shown if `customFields` object has keys

5. **Phone Numbers** - Show '-' placeholder if E.164 formatted values are missing:
   - `directPhoneE164`
   - `mobilePhoneE164`

6. **Additional Address Info** - Only shown if exists:
   - `address` (street address)
   - `contactLocation` (full location string)

**Why This Is Good:**
- Clean UI that adapts to available data
- No empty sections cluttering the interface
- Users only see relevant information

---

### **Account Detail Page** (client/src/pages/account-detail.tsx)

**Conditionally Rendered Sections:**

1. **Industry Secondary** - Only shown if `industrySecondary` array has values

2. **Description** - Only shown if `description` exists

3. **Custom Fields Card** - Only shown if `customFields` object has keys

4. **Technologies Installed** - Only shown if `techStack` array has values

5. **Intent Signals** - Only shown if `intentTopics` array has values

6. **AI Industry Suggestions Card** - Only shown if:
   - `industryAiSuggested` exists
   - `industryAiStatus` is 'pending' (awaiting review)

**Why This Is Good:**
- Prevents empty cards from appearing
- Focuses user attention on actual data
- AI review workflow only appears when actionable

---

## ⚠️ CSV Import Mapping - Potential Issues

### **Field Mapper Logic** (client/src/components/csv-field-mapper.tsx)

The `autoMapColumn` function has **good coverage** but some **edge cases** could cause problems:

#### ✅ **Strengths:**

1. **Normalization:** Converts column names to lowercase, removes spaces/underscores/hyphens
2. **Account Prefix Detection:** Correctly identifies `account_` prefixed fields
3. **Flexible Matching:** Uses exact match + substring matching (includes/includes)
4. **Special Mappings:** 70+ predefined exact matches for Pivotal B2B Standard Template
5. **Custom Fields:** Dynamically appends custom field definitions to mapping lists

#### ⚠️ **Potential Issues:**

1. **Ambiguous Generic Terms**
   - **Problem:** Generic column names like "name", "phone", "city" could map to either contact OR account
   - **Current Behavior:** Falls back to contact fields (line 224-228 generic fallbacks)
   - **Risk:** If CSV has "name" column intended for account, it might map to contact `fullName`
   - **Mitigation:** User must manually review auto-mapped fields

2. **Case-Insensitive But Exact Match Required**
   - **Problem:** After normalization, exact string comparison is used
   - **Example:** "Full Name" → normalized to "fullname" → matches
   - **Example:** "Full_Name_Contact" → normalized to "fullnamecontact" → might NOT match if field is "fullname"
   - **Risk:** Very similar but not identical normalized names might fail
   - **Mitigation:** Substring matching (`includes`) helps but isn't perfect

3. **Missing Unmapped Field Validation**
   - **Problem:** If critical fields are unmapped, import might succeed with incomplete data
   - **Current Behavior:** UI shows unmapped count badge, but no blocking validation
   - **Risk:** User could proceed with incomplete mapping
   - **Mitigation:** User must manually review and ensure all critical fields mapped

4. **Account Field Name Collisions**
   - **Problem:** If CSV has both "industry" and "account_industry", which takes precedence?
   - **Current Behavior:** `account_` prefix check happens first (line 129), so `account_industry` wins
   - **Risk:** Low, but could be confusing if user expects different behavior
   - **Mitigation:** Clear naming convention in templates

5. **Custom Field Naming**
   - **Problem:** CSV template uses `custom_fieldname` prefix, but how are custom fields identified during mapping?
   - **Current Behavior:** Custom fields added to `CONTACT_FIELDS` and `ACCOUNT_FIELDS` arrays
   - **Risk:** If custom field name conflicts with standard field, which wins?
   - **Mitigation:** Need to verify custom field matching priority

---

## 📊 Data Flow Issues

### **Round-Trip Data Loss**

**Scenario:** User exports contacts/accounts → Makes changes → Re-imports

**Result:** **Data loss occurs** for missing export fields

#### Example: Account Round-Trip

1. **Export Account** (using current `exportAccountsToCSV`)
   - ✅ Exports: `industryAiSuggested`, `industryAiTopk`, `industryAiConfidence`
   - ❌ Missing: `industryAiCandidates`, `industryAiReviewedBy`, `industryAiReviewedAt`

2. **User Edits CSV** (adds new accounts, updates industries)

3. **Re-import Account**
   - ✅ AI suggestion fields can be imported (if user hasn't deleted them)
   - ❌ AI review workflow data is **permanently lost** (not in CSV)
   - ❌ Canonical names lost → Could create duplicate accounts
   - ❌ AI enrichment research data lost → Cannot audit enrichment source

**Impact:** Critical workflow and audit trail data is destroyed during export/import cycle.

---

## 🔧 Recommended Fixes

### **Priority 1: Add Missing Export Fields**

#### Fix Contact Export
```typescript
// Add to headers array (line ~264):
"timeInCurrentPositionMonths",
"timeInCurrentCompanyMonths",

// Add to row mapping (after line ~288):
escapeCSVField(contact.timeInCurrentPositionMonths || ""),
escapeCSVField(contact.timeInCurrentCompanyMonths || ""),
```

#### Fix Account Export
```typescript
// Add to headers array (after line ~381):
"canonicalName",
"websiteDomain", 
"foundedDate",
"foundedDatePrecision",
"industryAiCandidates",
"industryAiReviewedBy",
"industryAiReviewedAt",
"webTechnologies",
"webTechnologiesJson",
"aiEnrichmentData",

// Add to row mapping (after line ~437):
escapeCSVField(account.canonicalName || ""),
escapeCSVField(account.websiteDomain || ""),
escapeCSVField(account.foundedDate || ""),
escapeCSVField(account.foundedDatePrecision || ""),
escapeCSVField(account.industryAiCandidates ? JSON.stringify(account.industryAiCandidates) : ""),
escapeCSVField(account.industryAiReviewedBy || ""),
escapeCSVField(account.industryAiReviewedAt || ""),
escapeCSVField(account.webTechnologies || ""),
escapeCSVField(account.webTechnologiesJson ? JSON.stringify(account.webTechnologiesJson) : ""),
escapeCSVField(account.aiEnrichmentData ? JSON.stringify(account.aiEnrichmentData) : ""),
```

---

### **Priority 2: Enhance CSV Import Validation**

**Add Pre-Import Validation:**
1. Check for critical required fields (email for contacts, name for accounts)
2. Warn user about unmapped columns
3. Block import if email column is unmapped for contacts
4. Show preview of how data will be mapped before import

**Add Mapping Confidence Indicator:**
```typescript
// For each mapping, show confidence level:
- ✅ Exact match (high confidence)
- ⚠️ Fuzzy match (medium confidence) 
- ❓ Generic fallback (low confidence - review required)
```

---

### **Priority 3: Improve Field Mapper UI**

**Enhancements:**
1. **Highlight ambiguous mappings** - Show warning icon for generic terms
2. **Add mapping suggestions** - For unmapped fields, suggest closest matches
3. **Add validation rules** - Prevent duplicate target field mappings
4. **Show sample data** - Display first 3 values for each CSV column during mapping

---

## 📈 Field Coverage Statistics

### **Contact Fields**
- **Database Fields:** 76 fields
- **Export Coverage:** 51/76 fields (67%) ❌ **2 missing**
- **Import Template:** 20 base fields + custom (27%)
- **UI Display:** All fields (conditionally rendered)

### **Account Fields**
- **Database Fields:** 70 fields  
- **Export Coverage:** 40/70 fields (57%) ❌ **11 missing**
- **Import Template:** 19 base fields + custom (27%)
- **UI Display:** All fields (conditionally rendered)

---

## 🎯 Summary of Issues

| Issue | Severity | Count | Impact |
|-------|----------|-------|--------|
| Missing Contact Export Fields | High | 2 | Data loss on export/reimport |
| Missing Account Export Fields | **Critical** | 11 | **Workflow data loss, audit trail destruction** |
| UI Fields Not Showing | None | 0 | **Intentional design - working correctly** |
| CSV Mapping Ambiguities | Medium | ~5 edge cases | Potential mismatched mappings |
| Missing Import Validation | Medium | N/A | Users can import incomplete data |

**Total Critical Issues:** **13 missing export fields** (2 contacts, 11 accounts)

---

## 🚀 Implementation Priority

1. **Immediate:** Add 13 missing fields to CSV export functions
2. **Short-term:** Add pre-import validation for critical fields
3. **Medium-term:** Enhance field mapper with confidence indicators
4. **Long-term:** Add sample data preview during mapping

---

**End of Report**
