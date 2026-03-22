# Unified Contacts & Accounts - Quick Start Guide

## 🚀 Getting Started

### Start the Application
```bash
npm run dev
```

Visit:
- **Contacts:** http://localhost:5000/contacts
- **Accounts:** http://localhost:5000/accounts

## 📋 Key Features

### 1. Unified Data Structure
Both contacts and accounts now have a consistent, enriched data model:

**UnifiedContactRecord:**
```typescript
{
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phones: UnifiedPhoneRecord[];  // Unified phone numbers
  job: { title, department, seniority };
  location: { city, state, country, timezone };
  account?: { id, name, domain, industry, size };  // Linked account
  status: { phone, email, consentBasis };
  metadata: { createdAt, updatedAt };
}
```

**UnifiedAccountRecord:**
```typescript
{
  id: string;
  name: string;
  domain?: string;
  industry: { primary, secondary[], sic, naics };
  size: { employees, revenue };
  location: { city, state, country, address };
  phones: UnifiedPhoneRecord[];
  stats: { contacts: number };  // Contact count
  metadata: { createdAt, updatedAt };
}
```

### 2. Dynamic Filtering

**Built-in Filter Builder:**
- Click "Add Filter" to add new filter conditions
- Choose from pre-configured fields per entity type
- Select operator (contains, equals, greater than, etc.)
- Enter value or select from dropdown
- Apply filters to see results instantly

**Example Filters:**
- Email contains "@gmail.com"
- Job Title in ["CEO", "CTO", "VP Sales"]
- Created Date between 2024-01-01 and 2024-12-31
- Account Industry equals "Technology"

### 3. Using the Hooks in Your Code

**Fetch Unified Contacts:**
```typescript
import { useUnifiedContacts } from '@/hooks/use-unified-data';

function MyComponent() {
  const { contacts, pagination, isLoading, error } = useUnifiedContacts(
    filterValues,  // Optional FilterValues object
    1,             // Page number
    100            // Items per page
  );

  if (isLoading) return Loading...;
  if (error) return Error: {error.message};

  return (
    
      {contacts?.map(contact => (
        {contact.name}
      ))}
    
  );
}
```

**Fetch Unified Accounts:**
```typescript
import { useUnifiedAccounts } from '@/hooks/use-unified-data';

function MyComponent() {
  const { accounts, pagination, isLoading } = useUnifiedAccounts(
    filterValues,
    1,
    50
  );

  return (
    
      {accounts?.map(account => (
        
          {account.name} - {account.stats.contacts} contacts
        
      ))}
    
  );
}
```

## 🔌 API Endpoints

### GET /api/contacts-unified
Fetch unified contacts with filtering and pagination.

**Query Parameters:**
- `filterValues` (optional) - JSON string of FilterValues
- `limit` (default: 100) - Items per page
- `offset` (default: 0) - Starting position

**Response:**
```json
{
  "data": [
    {
      "id": "123",
      "name": "John Doe",
      "email": "john@example.com",
      "phones": [
        {
          "number": "5551234567",
          "type": "direct",
          "label": "Direct",
          "isPrimary": true
        }
      ],
      "account": {
        "id": "456",
        "name": "Acme Corp",
        "industry": "Technology"
      }
    }
  ],
  "pagination": {
    "total": 250,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

### GET /api/accounts-unified
Same structure as contacts-unified but returns UnifiedAccountRecord[].

## 🎨 UI Components

### FilterShell
Main filter interface component.

```typescript
import { FilterShell } from '@/components/filters/filter-shell';

 refetch()}
/>
```

### Pagination
Handle page navigation.

```typescript
import { Pagination } from '@/components/pagination';


```

## 🔍 Filter Configuration

Filters are defined in [shared/unified-filter-config.ts](shared/unified-filter-config.ts).

**Adding Custom Filters:**

1. Open `shared/unified-filter-config.ts`
2. Add your field to the appropriate section:

```typescript
{
  field: 'customField',
  label: 'Custom Field',
  type: 'text',  // or 'select', 'number', 'date', 'multiSelect'
  operators: ['contains', 'equals'],
  entity: 'contacts'  // or 'accounts'
}
```

3. Ensure the field exists in your database schema
4. Update [server/filter-builder.ts](server/filter-builder.ts) if needed for complex queries

## 📊 Phone Number Handling

Unified phone records automatically classify and prioritize phone numbers:

**Phone Types:**
- `direct` - Contact's direct line (highest priority)
- `mobile` - Contact's mobile phone
- `hq` - Company headquarters phone
- `other` - Other phone numbers

**Priority System:**
```typescript
phones: [
  { number: "5551234567", type: "direct", isPrimary: true },
  { number: "5559876543", type: "mobile", isPrimary: false },
  { number: "5555551212", type: "hq", isPrimary: false }
]
```

Access the primary phone:
```typescript
const primaryPhone = contact.phones.find(p => p.isPrimary) || contact.phones[0];
```

## 🌐 Location Data Fallback

Location data uses a smart fallback chain:

**Contact Location Logic:**
1. Use contact's location if available
2. Fall back to account's HQ location
3. Return null if neither exists

```typescript
location: {
  city: contact.city || account?.hqCity || null,
  state: contact.state || account?.hqState || null,
  country: contact.country || account?.hqCountry || null
}
```

## 💡 Best Practices

### 1. Use React Query Caching
The hooks automatically cache results. Leverage this:

```typescript
// This won't refetch if data is cached
const { contacts } = useUnifiedContacts(filters, 1, 100);
```

### 2. Debounce Search Input
For search inputs, debounce to reduce API calls:

```typescript
const [searchQuery, setSearchQuery] = useState("");
const debouncedSearch = useDebounce(searchQuery, 300);

const { contacts } = useUnifiedContacts(
  { name: `contains:${debouncedSearch}` },
  1,
  100
);
```

### 3. Handle Loading States
Always show loading indicators:

```typescript
if (isLoading) {
  return ;
}
```

### 4. Error Handling
Gracefully handle errors:

```typescript
if (error) {
  return (
    
      Error
      {error.message}
    
  );
}
```

## 🐛 Common Issues

### Issue: Filters not applying
**Cause:** FilterValues format incorrect
**Solution:** Ensure filterValues structure matches:
```typescript
{ fieldName: "operator:value" }
// or
{ fieldName: ["in:value1", "value2"] }
```

### Issue: Pagination not working
**Cause:** Page calculation incorrect
**Solution:** Use this formula:
```typescript
const offset = (page - 1) * limit;
```

### Issue: Phone numbers not displaying
**Cause:** Phone array might be empty
**Solution:** Always check array length:
```typescript
{contact.phones.length > 0 ? contact.phones[0].number : 'N/A'}
```

## 📚 Additional Resources

- **Full Migration Guide:** [UNIFIED_CONTACTS_ACCOUNTS_MIGRATION.md](UNIFIED_CONTACTS_ACCOUNTS_MIGRATION.md)
- **Source Repository:** https://github.com/Pivotal-B2B-LLC/PipelineIQ
- **Filter Types:** [shared/filter-types.ts](shared/filter-types.ts)
- **Schema Definition:** [shared/schema.ts](shared/schema.ts)

## 🎯 Quick Commands

```bash
# Start development server
npm run dev

# Run type checking
npm run check

# Build for production
npm run build

# Start production server
npm start
```

## ✅ Testing Checklist

- [ ] Navigate to /contacts page
- [ ] Add a filter (e.g., email contains "@test.com")
- [ ] Click "Apply" and verify results filter
- [ ] Test pagination (if > 100 records)
- [ ] Click on a contact name to view details
- [ ] Navigate to /accounts page
- [ ] Add a filter (e.g., industry = "Technology")
- [ ] Verify account detail page loads
- [ ] Check related contacts table in account detail

---

**Need Help?** Check the full migration documentation or refer to the source repository for examples.