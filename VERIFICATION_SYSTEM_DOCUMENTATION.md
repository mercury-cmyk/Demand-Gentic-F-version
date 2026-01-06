# B2B CRM Data Verification & Enrichment System
## Complete Technical Documentation

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Key Features](#key-features)
7. [API Reference](#api-reference)
8. [Code Examples](#code-examples)

---

## System Overview

The B2B CRM Data Verification & Enrichment System (CAT62542) is a comprehensive platform for validating, enriching, and managing contact data for B2B sales campaigns. It implements a sophisticated workflow with:

- **Configurable Eligibility Engine**: Geography-based filtering, job title matching, Senior DM fallback rules
- **4-Method Suppression Matching**: Email, CAV IDs, Name+Company hash
- **Manual Email Validation**: EmailListVerify API integration with 60-day cache
- **Quality Metrics Enforcement**: 95% OK email rate, 97% deliverability
- **10-Lead Cap Per Account**: Automatic enforcement
- **Spreadsheet-Like Console Interface**: Efficient agent workflow

---

## Architecture

### Technology Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- TailwindCSS + shadcn/ui components
- TanStack Query (data fetching)
- Wouter (routing)

**Backend:**
- Node.js + Express + TypeScript
- PostgreSQL (Neon) database
- Drizzle ORM
- JWT authentication

**External Services:**
- EmailListVerify API (email validation)
- AssemblyAI (call transcription - planned)
- Replit AI/OpenAI (lead scoring - planned)

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Verification │  │   Campaign   │  │  Suppression │      │
│  │   Console    │  │  Management  │  │   Manager    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/REST API
                            │
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Express + TypeScript)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Routes     │  │  Business    │  │   Utils      │      │
│  │              │  │   Logic      │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Drizzle ORM
                            │
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL Database (Neon)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Verification │  │   Campaign   │  │  Suppression │      │
│  │  Contacts    │  │    Config    │  │     List     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │    Email     │  │     Lead     │                        │
│  │  Validation  │  │ Submissions  │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

#### 1. `verification_campaigns`
Campaign configuration and settings.

```typescript
export const verificationCampaigns = pgTable("verification_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  status: verificationCampaignStatusEnum("status").default('Draft'),
  
  // Geography Rules
  targetGeographies: text("target_geographies").array(),
  
  // Job Title Rules
  targetJobTitles: text("target_job_titles").array(),
  seniorDmFallback: boolean("senior_dm_fallback").default(false),
  
  // Lead Cap Rules
  leadCapPerAccount: integer("lead_cap_per_account").default(10),
  
  // Quality Metrics
  minOkEmailRate: numeric("min_ok_email_rate", { precision: 5, scale: 2 }).default('95.00'),
  minDeliverabilityRate: numeric("min_deliverability_rate", { precision: 5, scale: 2 }).default('97.00'),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

#### 2. `verification_contacts`
Contact records for verification.

```typescript
export const verificationContacts = pgTable("verification_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'set null' }),
  sourceType: verificationSourceTypeEnum("source_type").notNull(),

  // Contact Information
  fullName: text("full_name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  title: text("title"),
  email: text("email"),
  emailLower: text("email_lower"),
  phone: text("phone"),
  mobile: text("mobile"),
  linkedinUrl: text("linkedin_url"),

  // Address Fields
  contactCity: text("contact_city"),
  contactState: text("contact_state"),
  contactCountry: text("contact_country"),
  contactPostal: text("contact_postal"),

  // CAV Integration
  cavId: text("cav_id"),
  cavUserId: text("cav_user_id"),

  // Status Fields
  eligibilityStatus: verificationEligibilityStatusEnum("eligibility_status").default('Out_of_Scope'),
  eligibilityReason: text("eligibility_reason"),
  verificationStatus: verificationStatusEnum("verification_status").default('Pending'),
  qaStatus: verificationQaStatusEnum("qa_status").default('Unreviewed'),
  emailStatus: verificationEmailStatusEnum("email_status").default('unknown'),
  suppressed: boolean("suppressed").default(false),

  assigneeId: varchar("assignee_id").references(() => users.id, { onDelete: 'set null' }),
  priorityScore: numeric("priority_score", { precision: 10, scale: 2 }),
  inSubmissionBuffer: boolean("in_submission_buffer").default(false),

  // Normalized Keys for Matching
  firstNameNorm: text("first_name_norm"),
  lastNameNorm: text("last_name_norm"),
  companyKey: text("company_key"),
  contactCountryKey: text("contact_country_key"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("verification_contacts_campaign_idx").on(table.campaignId),
  eligibilityIdx: index("verification_contacts_eligibility_idx").on(table.eligibilityStatus),
  suppressedIdx: index("verification_contacts_suppressed_idx").on(table.suppressed),
  normKeysIdx: index("verification_contacts_norm_keys_idx").on(table.firstNameNorm, table.lastNameNorm, table.companyKey, table.contactCountryKey),
  cavIdIdx: index("verification_contacts_cav_id_idx").on(table.cavId),
  emailIdx: index("verification_contacts_email_idx").on(table.email),
}));
```

#### 3. `verification_suppression_list`
Suppression list for campaign and global blocking.

```typescript
export const verificationSuppressionList = pgTable("verification_suppression_list", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }),
  
  // Matching Fields
  emailLower: text("email_lower"),
  cavId: text("cav_id"),
  cavUserId: text("cav_user_id"),
  nameCompanyHash: text("name_company_hash"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("verification_suppression_email_idx").on(table.emailLower),
  cavIdIdx: index("verification_suppression_cav_id_idx").on(table.cavId),
  cavUserIdIdx: index("verification_suppression_cav_user_id_idx").on(table.cavUserId),
  hashIdx: index("verification_suppression_hash_idx").on(table.nameCompanyHash),
  compositePk: primaryKey({ columns: [table.id] }),
}));
```

#### 4. `verification_email_validation_cache`
60-day cache for EmailListVerify API results.

```typescript
export const verificationEmailValidationCache = pgTable("verification_email_validation_cache", {
  contactId: varchar("contact_id").references(() => verificationContacts.id, { onDelete: 'cascade' }).notNull(),
  emailLower: text("email_lower").notNull(),
  
  status: verificationEmailStatusEnum("status").notNull(),
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
  
  rawResponse: jsonb("raw_response"),
}, (table) => ({
  pk: primaryKey({ columns: [table.contactId, table.emailLower] }),
  emailCheckedIdx: index("verification_email_cache_email_checked_idx").on(table.emailLower, table.checkedAt),
}));
```

#### 5. `verification_lead_submissions`
Tracks submitted leads for cap enforcement.

```typescript
export const verificationLeadSubmissions = pgTable("verification_lead_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => verificationContacts.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'set null' }),
  
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  submittedBy: varchar("submitted_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  campaignAccountIdx: index("verification_submissions_campaign_account_idx").on(table.campaignId, table.accountId),
}));
```

### Enums

```typescript
export const verificationSourceTypeEnum = pgEnum("verification_source_type", [
  "New_Sourced",
  "Existing_Contact",
  "ZoomInfo",
  "Upload",
]);

export const verificationEligibilityStatusEnum = pgEnum("verification_eligibility_status", [
  "Eligible",
  "Out_of_Scope",
  "Geography_Mismatch",
  "Title_Mismatch",
  "Suppressed",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "Pending",
  "In_Progress",
  "Validated",
  "Rejected",
]);

export const verificationQaStatusEnum = pgEnum("verification_qa_status", [
  "Unreviewed",
  "Passed",
  "Flagged",
  "Failed",
]);

export const verificationEmailStatusEnum = pgEnum("verification_email_status", [
  "unknown",
  "ok",
  "invalid",
  "risky",
  "disposable",
]);
```

---

## Backend Implementation

### Key Files Structure

```
server/
├── routes/
│   ├── verification-campaigns.ts      # Campaign CRUD
│   ├── verification-contacts.ts       # Contact management & queue
│   ├── verification-suppression.ts    # Suppression list upload
│   └── verification-upload.ts         # CSV contact upload
├── lib/
│   ├── verification-utils.ts          # Core utilities
│   ├── verification-suppression.ts    # Suppression logic
│   └── verification-eligibility.ts    # Eligibility evaluation
└── db.ts                               # Database connection
```

### Core Utilities (`verification-utils.ts`)

#### Normalization Functions

```typescript
import crypto from 'crypto';

export const normalize = {
  // Email normalization (lowercase)
  emailLower: (email: string): string => {
    return email.toLowerCase().trim();
  },

  // Name normalization (remove special chars, lowercase)
  name: (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  },

  // Company key normalization
  companyKey: (name: string): string => {
    return name
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  },

  // Country key normalization
  countryKey: (country: string): string => {
    const mapping: Record<string, string> = {
      'usa': 'united states',
      'us': 'united states',
      'uk': 'united kingdom',
      // Add more mappings as needed
    };
    const normalized = country.toLowerCase().trim();
    return mapping[normalized] || normalized;
  },
};

// Name + Company hash for suppression matching
export function computeNameCompanyHash(
  firstName?: string | null,
  lastName?: string | null,
  companyKey?: string | null
): string {
  const parts = [
    firstName ? normalize.name(firstName) : '',
    lastName ? normalize.name(lastName) : '',
    companyKey ? normalize.companyKey(companyKey) : '',
  ];
  const combined = parts.join('');
  return crypto.createHash('md5').update(combined).digest('hex');
}

// Compute all normalized keys for a contact
export function computeNormalizedKeys(contact: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  country?: string | null;
}) {
  return {
    firstNameNorm: contact.firstName ? normalize.name(contact.firstName) : null,
    lastNameNorm: contact.lastName ? normalize.name(contact.lastName) : null,
    companyKey: contact.companyName ? normalize.companyKey(contact.companyName) : null,
    contactCountryKey: contact.country ? normalize.countryKey(contact.country) : null,
  };
}
```

#### Eligibility Evaluation

```typescript
export function evaluateEligibility(
  contact: {
    contactCountry?: string | null;
    title?: string | null;
  },
  campaign: {
    targetGeographies?: string[] | null;
    targetJobTitles?: string[] | null;
    seniorDmFallback?: boolean | null;
  }
): {
  status: 'Eligible' | 'Out_of_Scope' | 'Geography_Mismatch' | 'Title_Mismatch';
  reason: string;
} {
  // Geography check
  if (campaign.targetGeographies && campaign.targetGeographies.length > 0) {
    const countryMatch = campaign.targetGeographies.some(geo =>
      normalize.countryKey(geo) === normalize.countryKey(contact.contactCountry || '')
    );
    if (!countryMatch) {
      return {
        status: 'Geography_Mismatch',
        reason: 'Country not in target geographies',
      };
    }
  }

  // Job title check
  if (campaign.targetJobTitles && campaign.targetJobTitles.length > 0) {
    const titleLower = (contact.title || '').toLowerCase();
    const titleMatch = campaign.targetJobTitles.some(targetTitle =>
      titleLower.includes(targetTitle.toLowerCase())
    );

    if (!titleMatch) {
      // Check Senior DM fallback
      if (campaign.seniorDmFallback) {
        const isSeniorDM = /senior|sr\.?\s*decision\s*maker|head\s*of|chief|director|vp|vice\s*president/i.test(titleLower);
        if (!isSeniorDM) {
          return {
            status: 'Title_Mismatch',
            reason: 'Title does not match targets and not senior DM',
          };
        }
      } else {
        return {
          status: 'Title_Mismatch',
          reason: 'Title does not match target job titles',
        };
      }
    }
  }

  return {
    status: 'Eligible',
    reason: 'eligible',
  };
}
```

### Suppression Logic (`verification-suppression.ts`)

#### Apply Suppression

```typescript
export async function applySuppressionForContacts(
  campaignId: string,
  contactIds: string[]
) {
  if (contactIds.length === 0) return;
  
  await db.execute(sql`
    UPDATE verification_contacts c
    SET suppressed = TRUE
    WHERE c.id = ANY(${contactIds}::varchar[])
      AND c.campaign_id = ${campaignId}
      AND (
        c.email_lower IN (
          SELECT email_lower FROM verification_suppression_list
          WHERE (campaign_id = ${campaignId} OR campaign_id IS NULL) AND email_lower IS NOT NULL
        )
        OR c.cav_id IN (
          SELECT cav_id FROM verification_suppression_list
          WHERE (campaign_id = ${campaignId} OR campaign_id IS NULL) AND cav_id IS NOT NULL
        )
        OR c.cav_user_id IN (
          SELECT cav_user_id FROM verification_suppression_list
          WHERE (campaign_id = ${campaignId} OR campaign_id IS NULL) AND cav_user_id IS NOT NULL
        )
        OR MD5(LOWER(COALESCE(c.first_name, '')) || LOWER(COALESCE(c.last_name, '')) || LOWER(COALESCE(c.company_key, ''))) IN (
          SELECT name_company_hash FROM verification_suppression_list
          WHERE (campaign_id = ${campaignId} OR campaign_id IS NULL) AND name_company_hash IS NOT NULL
        )
      )
  `);
}
```

#### Add to Suppression List

```typescript
export async function addToSuppressionList(
  campaignId: string | null,
  entries: {
    email?: string;
    cavId?: string;
    cavUserId?: string;
    firstName?: string;
    lastName?: string;
    companyKey?: string;
  }[]
) {
  if (entries.length === 0) return;

  // Insert records individually for reliability
  for (const entry of entries) {
    const emailLower = entry.email ? normalize.emailLower(entry.email) : null;
    const cavId = entry.cavId || null;
    const cavUserId = entry.cavUserId || null;
    const nameCompanyHash = (entry.firstName || entry.lastName || entry.companyKey)
      ? computeNameCompanyHash(entry.firstName, entry.lastName, entry.companyKey)
      : null;
    
    await db.execute(sql`
      INSERT INTO verification_suppression_list 
        (campaign_id, email_lower, cav_id, cav_user_id, name_company_hash)
      VALUES (${campaignId}, ${emailLower}, ${cavId}, ${cavUserId}, ${nameCompanyHash})
    `);
  }
}
```

### API Routes

#### Queue Endpoint with Filtering

```typescript
router.get("/api/verification-campaigns/:campaignId/queue", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const limit = Number(req.query.limit) || 50;
    const contactSearch = req.query.contactSearch as string || "";
    const companySearch = req.query.companySearch as string || "";
    const sourceType = req.query.sourceType as string || "";
    const suppressionStatus = req.query.suppressionStatus as string || "";
    
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const cap = campaign.leadCapPerAccount;
    
    // Build dynamic filter conditions
    const filterConditions = [];
    
    if (contactSearch) {
      filterConditions.push(sql`(
        LOWER(c.full_name) LIKE ${`%${contactSearch.toLowerCase()}%`}
        OR LOWER(c.email) LIKE ${`%${contactSearch.toLowerCase()}%`}
      )`);
    }
    
    if (sourceType) {
      filterConditions.push(sql`c.source_type = ${sourceType}`);
    }
    
    if (suppressionStatus === 'matched') {
      filterConditions.push(sql`c.suppressed = TRUE`);
    } else if (suppressionStatus === 'unmatched') {
      filterConditions.push(sql`c.suppressed = FALSE`);
    }
    
    const filterSQL = filterConditions.length > 0 
      ? sql`AND ${sql.join(filterConditions, sql` AND `)}`
      : sql``;
    
    const queueItems = await db.execute(sql`
      WITH next_batch AS (
        SELECT c.id
        FROM verification_contacts c
        WHERE c.campaign_id = ${campaignId}
          AND c.eligibility_status = 'Eligible'
          AND c.verification_status = 'Pending'
          ${suppressionStatus === 'matched' || suppressionStatus === 'unmatched' ? sql`` : sql`AND c.suppressed = FALSE`}
          AND c.in_submission_buffer = FALSE
          AND (
            SELECT COUNT(*) FROM verification_lead_submissions s
            WHERE s.account_id = c.account_id AND s.campaign_id = ${campaignId}
          ) < ${cap}
          ${filterSQL}
          ${companySearch ? sql`AND c.account_id IN (
            SELECT id FROM accounts WHERE LOWER(name) LIKE ${`%${companySearch.toLowerCase()}%`}
          )` : sql``}
        ORDER BY c.priority_score DESC NULLS LAST, c.updated_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      SELECT 
        c.*,
        a.name as account_name,
        a.hq_city,
        a.hq_country
      FROM verification_contacts c
      JOIN next_batch nb ON nb.id = c.id
      LEFT JOIN accounts a ON a.id = c.account_id
    `);
    
    res.json({ data: queueItems.rows, total: queueItems.rowCount || 0 });
  } catch (error) {
    console.error("Error fetching queue:", error);
    res.status(500).json({ error: "Failed to fetch queue" });
  }
});
```

---

## Frontend Implementation

### Key Components Structure

```
client/src/
├── pages/
│   ├── verification-campaigns.tsx     # Campaign list
│   ├── verification-console.tsx       # Main verification interface
│   └── verification-campaign-form.tsx # Campaign creation/edit
└── components/
    └── ui/                             # shadcn components
```

### Verification Console Component

The main verification console implements a dual-view interface:

**Queue View**: Spreadsheet-like table with filters
**Detail View**: Single contact with all information

#### State Management

```typescript
const [currentContactId, setCurrentContactId] = useState<string | null>(null);
const [showFilters, setShowFilters] = useState(false);
const [filters, setFilters] = useState({
  contactSearch: "",
  companySearch: "",
  sourceType: "",
  suppressionStatus: "",
});
```

#### Data Fetching with TanStack Query

```typescript
// Campaign data
const { data: campaign } = useQuery({
  queryKey: ["/api/verification-campaigns", campaignId],
});

// Campaign statistics
const { data: stats } = useQuery({
  queryKey: ["/api/verification-campaigns", campaignId, "stats"],
  refetchInterval: 10000, // Auto-refresh every 10s
});

// Queue with filters
const { data: queue, isLoading: queueLoading } = useQuery({
  queryKey: ["/api/verification-campaigns", campaignId, "queue", filters],
  enabled: !currentContactId,
});

// Current contact details
const { data: contact } = useQuery({
  queryKey: ["/api/verification-contacts", currentContactId],
  enabled: !!currentContactId,
});

// Associated contacts from same company
const { data: associatedContacts = [] } = useQuery<any[]>({
  queryKey: ["/api/verification-contacts/account", (contact as any)?.account_id, { campaignId }],
  enabled: !!currentContactId && !!(contact as any)?.account_id && !!campaignId,
});
```

#### Filter UI

```typescript
{showFilters && (
  <div className="mb-4 p-4 border rounded-md bg-muted/50 space-y-4">
    <div className="grid grid-cols-4 gap-4">
      <div>
        <Label className="text-xs">Contact Search</Label>
        <Input
          placeholder="Name or email..."
          value={filters.contactSearch}
          onChange={(e) => setFilters({ ...filters, contactSearch: e.target.value })}
          data-testid="input-contact-search"
        />
      </div>
      <div>
        <Label className="text-xs">Company Search</Label>
        <Input
          placeholder="Company name..."
          value={filters.companySearch}
          onChange={(e) => setFilters({ ...filters, companySearch: e.target.value })}
          data-testid="input-company-search"
        />
      </div>
      <div>
        <Label className="text-xs">Source Type</Label>
        <Select
          value={filters.sourceType || "all"}
          onValueChange={(value) => setFilters({ ...filters, sourceType: value === "all" ? "" : value })}
        >
          <SelectTrigger data-testid="select-source-type">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="New_Sourced">New Sourced</SelectItem>
            <SelectItem value="Existing_Contact">Existing Contact</SelectItem>
            <SelectItem value="ZoomInfo">ZoomInfo</SelectItem>
            <SelectItem value="Upload">Upload</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Suppression Status</Label>
        <Select
          value={filters.suppressionStatus || "all"}
          onValueChange={(value) => setFilters({ ...filters, suppressionStatus: value === "all" ? "" : value })}
        >
          <SelectTrigger data-testid="select-suppression-status">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="matched">Suppressed</SelectItem>
            <SelectItem value="unmatched">Not Suppressed</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
)}
```

#### Contact Detail View

```typescript
<Card>
  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
    <CardTitle>Contact & Company Information</CardTitle>
    <div className="flex gap-2">
      <Badge variant={eligibilityStatus === 'Eligible' ? 'default' : 'secondary'}>
        {eligibilityStatus}
      </Badge>
      {suppressed && <Badge variant="destructive">Suppressed</Badge>}
    </div>
  </CardHeader>
  <CardContent className="space-y-6">
    {/* Contact Details Section */}
    <div>
      <h3 className="text-sm font-semibold mb-3">Contact Details</h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Full Name</Label>
          <Input value={fullName} readOnly />
        </div>
        <div>
          <Label>Title</Label>
          <Input value={title} readOnly />
        </div>
        <div>
          <Label>Email</Label>
          <div className="flex gap-2">
            <Input value={email} readOnly />
            {emailStatus && <Badge>{emailStatus}</Badge>}
          </div>
        </div>
        {/* Phone, Mobile, LinkedIn, City, State, Country, Postal */}
        {/* CAV ID, CAV User ID */}
      </div>
    </div>

    {/* Company Information Section */}
    <div className="border-t pt-4">
      <h3 className="text-sm font-semibold mb-3">Company Information</h3>
      <div className="grid grid-cols-3 gap-4">
        {/* Company Name, HQ City, State, Country, Domain */}
      </div>
    </div>

    {/* Status & Metadata Section */}
    <div className="border-t pt-4">
      <h3 className="text-sm font-semibold mb-3">Status & Metadata</h3>
      <div className="grid grid-cols-3 gap-4">
        {/* Source Type, Verification Status, QA Status */}
      </div>
    </div>

    {/* Action Buttons */}
    <div className="flex gap-2 pt-4 border-t">
      <Button onClick={() => validateEmail()}>
        <Mail className="h-4 w-4 mr-2" />
        Validate Email
      </Button>
      <div className="flex-1" />
      <Button variant="outline" onClick={() => skip()}>Skip</Button>
      <Button onClick={() => saveAndNext()}>Save & Next</Button>
    </div>
  </CardContent>
</Card>
```

#### Associated Contacts

```typescript
{accountId && (
  <Card>
    <CardHeader>
      <CardTitle>Associated Contacts from {accountName}</CardTitle>
    </CardHeader>
    <CardContent>
      {associatedContacts.length > 0 ? (
        <div className="space-y-2">
          {associatedContacts.map((assocContact, index) => (
            <div
              key={assocContact.id}
              className={`p-3 border rounded-md flex items-center justify-between ${
                assocContact.id === currentContactId ? 'bg-accent' : 'hover-elevate'
              }`}
            >
              <div className="flex-1 grid grid-cols-4 gap-4">
                <div>
                  <p className="text-sm font-medium">{assocContact.fullName}</p>
                  <p className="text-xs text-muted-foreground">{assocContact.title || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{assocContact.email || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm">{assocContact.phone || assocContact.mobile || "-"}</p>
                </div>
                <div>
                  <Badge variant="outline">{assocContact.verificationStatus}</Badge>
                </div>
              </div>
              {assocContact.id !== currentContactId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCurrentContactId(assocContact.id)}
                >
                  View
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No other contacts found for this company.</p>
      )}
    </CardContent>
  </Card>
)}
```

---

## Key Features

### 1. Contact Upload & Eligibility

**CSV Upload**:
- Supports multiple delimiters (comma, tab, pipe, semicolon)
- Auto-detection with explicit fallback testing
- Field mapping with header normalization
- Validation and error reporting

**Eligibility Evaluation**:
- Geography filtering (target countries)
- Job title matching with wildcards
- Senior DM fallback for decision makers
- Automatic status assignment

### 2. Suppression Management

**4-Method Matching**:
1. **Email**: Exact match (case-insensitive)
2. **CAV ID**: Direct ID match
3. **CAV User ID**: Direct user ID match
4. **Name+Company Hash**: MD5 hash of normalized first+last+company

**Campaign & Global**:
- Campaign-specific suppression lists
- Global suppression (null campaignId)
- Combined matching logic

### 3. Email Validation

**EmailListVerify Integration**:
- Manual validation trigger
- 60-day cache to avoid duplicate API calls
- Composite PK (contactId, emailLower) prevents stale cache
- Status tracking: ok, invalid, risky, disposable, unknown

**Cache Index**:
```typescript
index("verification_email_cache_email_checked_idx")
  .on(table.emailLower, table.checkedAt)
```
Optimizes lookups by email and recency.

### 4. Queue Management

**Intelligent Prioritization**:
- Priority score (DESC, nulls last)
- Updated timestamp (ASC for oldest first)
- FOR UPDATE SKIP LOCKED (concurrent processing)

**Lead Cap Enforcement**:
- Subquery counts submitted leads per account
- Filters out accounts at cap
- Real-time enforcement

**Filtering**:
- Contact search (name/email)
- Company search
- Source type
- Suppression status (matched/unmatched)

### 5. Quality Metrics

**Campaign-Level Tracking**:
- OK email rate: `ok_email_count / validated_count`
- Deliverability rate: `1 - (invalid_email_count / validated_count)`
- Real-time dashboard display with progress bars

**Enforcement** (planned):
- Block submission buffer release if below thresholds
- Alert agents when metrics degrade

### 6. Agent Workflow

**Console Interface**:
1. View queue with filters
2. Click contact to see full details
3. Validate email (if needed)
4. Review company information
5. Check associated contacts
6. Save & move to next

**Keyboard-Friendly**:
- Tab navigation
- Enter to submit
- Escape to close

---

## API Reference

### Campaign Endpoints

#### GET `/api/verification-campaigns`
List all campaigns.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Q1 2025 Campaign",
    "status": "Active",
    "targetGeographies": ["United States", "Canada"],
    "targetJobTitles": ["CTO", "VP Engineering"],
    "leadCapPerAccount": 10,
    "minOkEmailRate": "95.00",
    "minDeliverabilityRate": "97.00"
  }
]
```

#### POST `/api/verification-campaigns`
Create new campaign.

**Request:**
```json
{
  "name": "Q2 2025 Campaign",
  "targetGeographies": ["United Kingdom"],
  "targetJobTitles": ["CEO", "Director"],
  "seniorDmFallback": true,
  "leadCapPerAccount": 15
}
```

#### GET `/api/verification-campaigns/:id/stats`
Get campaign statistics.

**Response:**
```json
{
  "totalContacts": 1500,
  "eligibleCount": 850,
  "validatedCount": 320,
  "okEmailCount": 305,
  "invalidEmailCount": 10,
  "submittedCount": 285
}
```

### Contact Endpoints

#### GET `/api/verification-campaigns/:campaignId/queue`
Get verification queue with filters.

**Query Params:**
- `limit` (default: 50)
- `contactSearch` (name or email)
- `companySearch` (company name)
- `sourceType` (New_Sourced, Existing_Contact, ZoomInfo, Upload)
- `suppressionStatus` (matched, unmatched)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "fullName": "John Doe",
      "email": "john@example.com",
      "title": "CTO",
      "accountName": "Acme Corp",
      "emailStatus": "ok",
      "suppressed": false
    }
  ],
  "total": 45
}
```

#### GET `/api/verification-contacts/:id`
Get single contact with company details.

**Response:**
```json
{
  "id": "uuid",
  "fullName": "Jane Smith",
  "firstName": "Jane",
  "lastName": "Smith",
  "title": "VP Engineering",
  "email": "jane@techcorp.com",
  "phone": "+1-555-0100",
  "mobile": "+1-555-0101",
  "contactCity": "San Francisco",
  "contactState": "CA",
  "contactCountry": "United States",
  "cavId": "CAV123456",
  "cavUserId": "USER789",
  "accountName": "TechCorp Inc",
  "hqCity": "San Francisco",
  "hqCountry": "United States",
  "domain": "techcorp.com",
  "eligibilityStatus": "Eligible",
  "verificationStatus": "Pending",
  "emailStatus": "unknown",
  "suppressed": false
}
```

#### GET `/api/verification-contacts/account/:accountId`
Get all contacts from same account.

**Query Params:**
- `campaignId` (required)

**Response:**
```json
[
  {
    "id": "uuid",
    "fullName": "Contact 1",
    "email": "contact1@company.com",
    "verificationStatus": "Validated"
  },
  {
    "id": "uuid2",
    "fullName": "Contact 2",
    "email": "contact2@company.com",
    "verificationStatus": "Pending"
  }
]
```

#### POST `/api/verification-contacts/:id/email/verify`
Trigger email validation.

**Response:**
```json
{
  "emailStatus": "ok",
  "checkedAt": "2025-10-21T00:00:00Z"
}
```

#### PUT `/api/verification-contacts/:id`
Update contact.

**Request:**
```json
{
  "verificationStatus": "Validated",
  "qaStatus": "Passed"
}
```

### Suppression Endpoints

#### POST `/api/verification-campaigns/:campaignId/suppression/upload`
Upload suppression CSV.

**Request:**
```json
{
  "csvData": "email,firstName,lastName,companyName\ntest@example.com,John,Doe,Acme Corp"
}
```

**Response:**
```json
{
  "total": 100,
  "added": 98,
  "skipped": 2,
  "errors": [
    "Row 5: Must have email, CAV ID, or complete Name+Company"
  ]
}
```

#### GET `/api/verification-campaigns/:campaignId/suppression`
List suppression entries.

**Response:**
```json
[
  {
    "id": "uuid",
    "emailLower": "blocked@example.com",
    "cavId": null,
    "nameCompanyHash": null,
    "createdAt": "2025-10-20T00:00:00Z"
  }
]
```

### Upload Endpoints

#### POST `/api/verification-campaigns/:campaignId/upload`
Upload contact CSV.

**Request:**
```json
{
  "csvData": "Full Name,Title,Email,Company,Country\nJohn Doe,CTO,john@example.com,Acme,USA"
}
```

**Response:**
```json
{
  "total": 500,
  "eligible": 350,
  "outOfScope": 100,
  "suppressed": 50,
  "errors": []
}
```

---

## Code Examples

### Creating a Campaign

```typescript
const createCampaign = async () => {
  const response = await fetch('/api/verification-campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Q1 2025 Tech Leaders',
      targetGeographies: ['United States', 'Canada'],
      targetJobTitles: ['CTO', 'VP Engineering', 'Director of IT'],
      seniorDmFallback: true,
      leadCapPerAccount: 10,
      minOkEmailRate: 95.00,
      minDeliverabilityRate: 97.00,
    }),
  });
  
  const campaign = await response.json();
  console.log('Created campaign:', campaign.id);
};
```

### Uploading Contacts

```typescript
const uploadContacts = async (campaignId: string, csvFile: File) => {
  const csvData = await csvFile.text();
  
  const response = await fetch(`/api/verification-campaigns/${campaignId}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csvData }),
  });
  
  const result = await response.json();
  console.log(`Uploaded: ${result.eligible} eligible, ${result.suppressed} suppressed`);
};
```

### Validating an Email

```typescript
const validateEmail = async (contactId: string) => {
  const response = await fetch(`/api/verification-contacts/${contactId}/email/verify`, {
    method: 'POST',
  });
  
  const result = await response.json();
  console.log(`Email status: ${result.emailStatus}`);
};
```

### Filtering Queue

```typescript
const { data: queue } = useQuery({
  queryKey: [
    '/api/verification-campaigns',
    campaignId,
    'queue',
    {
      contactSearch: 'john',
      companySearch: 'tech',
      sourceType: 'New_Sourced',
      suppressionStatus: 'unmatched',
    }
  ],
});
```

---

## Performance Optimizations

### Database Indexes

**Critical Indexes:**
1. `verification_contacts_campaign_idx` - Fast campaign filtering
2. `verification_contacts_eligibility_idx` - Status-based queries
3. `verification_email_cache_email_checked_idx` - Cache lookups
4. `verification_suppression_email_idx` - Email matching
5. `verification_submissions_campaign_account_idx` - Cap enforcement

### Query Optimization

**Queue Query**:
- Uses CTE with FOR UPDATE SKIP LOCKED for concurrency
- Filters before join to reduce data
- Indexed columns in WHERE clause

**Suppression Check**:
- Separate indexes for each matching method
- OR conditions use indexed columns
- Subquery optimization

### Caching Strategy

**Email Validation**:
- 60-day cache prevents duplicate API calls
- Composite PK ensures cache invalidation on email change
- Index on (email, checkedAt) for efficient lookups

**TanStack Query**:
- 10-second auto-refresh for stats
- Infinite cache for static data
- Smart invalidation on mutations

---

## Security Considerations

### Authentication
- JWT-based session management
- Role-based access control (admin, agent, viewer)
- Protected routes with middleware

### Data Privacy
- Email normalization prevents case-sensitive duplicates
- Hashing for name+company matching
- No PII in logs

### SQL Injection Prevention
- Drizzle ORM parameterized queries
- Template literal SQL escaping
- Input validation with Zod

---

## Future Enhancements

### Planned Features
1. **AI-Powered Lead Scoring**: OpenAI integration for quality prediction
2. **Call Transcription**: AssemblyAI for phone conversation QA
3. **Batch Operations**: Bulk approve/reject
4. **Advanced Analytics**: Conversion tracking, agent performance
5. **Email Templates**: Automated outreach sequences
6. **CRM Integration**: Sync with Salesforce, HubSpot

### Scalability
- Implement job queue for bulk operations
- Add Redis caching layer
- Database read replicas for reporting
- Horizontal scaling with load balancer

---

## Deployment

### Environment Variables

```env
DATABASE_URL=postgresql://...
EMAILLISTVERIFY_API_KEY=your_key_here
JWT_SECRET=your_secret_here
NODE_ENV=production
```

### Database Migration

```bash
# Push schema changes
npm run db:push

# Force push (data loss warning)
npm run db:push --force
```

### Production Checklist

- [ ] Environment variables configured
- [ ] Database indexes created
- [ ] Email validation API key set
- [ ] SSL/TLS enabled
- [ ] CORS configured
- [ ] Rate limiting enabled
- [ ] Logging and monitoring setup
- [ ] Backup strategy implemented

---

## Troubleshooting

### Common Issues

**Queue returns empty**:
- Check eligibility status of contacts
- Verify lead cap not reached
- Ensure contacts not suppressed

**Email validation fails**:
- Verify EmailListVerify API key
- Check API quota/credits
- Review cache entries

**Suppression upload errors**:
- Ensure CSV has required fields
- Check delimiter detection
- Verify field mappings

**Performance degradation**:
- Run ANALYZE on tables
- Check index usage with EXPLAIN
- Monitor query execution time

---

## Support

For technical support or questions:
- Review this documentation
- Check database logs
- Verify API responses
- Contact system administrator

---

**Version**: 1.0.0  
**Last Updated**: October 21, 2025  
**Author**: Replit Agent
