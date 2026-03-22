# Campaign Creation — Organization Intelligence Integration

## Overview

The Campaign Creation form in the Client Portal now includes an **Organization Intelligence** integration feature that allows users to automatically populate campaign targeting details from their organization's intelligence profile.

## Feature Details

### Location
- **File**: `client/src/pages/client-portal/campaign-create.tsx`
- **Step**: Details Step (Step 3)
- **UI Component**: Blue card with "Populate" button

### How It Works

When a user navigates to the **Details** step during campaign creation, they'll see an Organization Intelligence card if they have an organization profile configured. Clicking the **"Populate"** button will automatically fill in campaign fields from their organization data.

### Populated Fields

The integration maps your organization intelligence to campaign fields as follows:

#### 1. **Target Industries**
- **Source**: `organization.icp.industries` or `organization.identity.industry`
- **Behavior**: Appends to existing industries (no duplicates)
- **Example**: If your ICP targets "SaaS" and "Enterprise Software", both are added

#### 2. **Target Job Titles**
- **Source**: `organization.icp.personas`
- **Behavior**: Extracts persona names/titles and appends to existing titles
- **Example**: If your ICP defines "CTO", "VP Engineering", "Director of IT", these are added

#### 3. **Target Regions**
- **Source**: `organization.identity.regions`
- **Behavior**: Appends to existing regions (no duplicates)
- **Example**: If your organization serves "North America" and "Europe", both are added

#### 4. **Target Audience**
- **Source**: `organization.icp.companySize` + `organization.identity.description`
- **Behavior**: Only populates if field is empty
- **Example**: "Mid-market SaaS companies - Cloud infrastructure solutions provider"

#### 5. **Success Criteria**
- **Source**: `organization.offerings.useCases`
- **Behavior**: Only populates if field is empty
- **Example**: "Successfully execute cloud migration, DevOps transformation use cases"

## Implementation Details

### State Management
```typescript
const [orgInteligenceLoading, setOrgIntelligenceLoading] = useState(false);
const [showOrgIntelligenceOptions, setShowOrgIntelligenceOptions] = useState(false);
```

### Data Fetching
```typescript
const { data: organizationIntelligence } = useQuery({
  queryKey: ['client-portal-organization-intelligence'],
  queryFn: async () => {
    const res = await fetch('/api/client-portal/settings/organization-intelligence', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return null;
    return res.json();
  },
});
```

### Core Function
```typescript
const populateFromOrganizationIntelligence = async () => {
  // Validates organization data exists
  // Extracts and maps fields
  // Avoids duplicates in array fields
  // Shows success/error toast
}
```

## User Experience

### UI Components

1. **Organization Intelligence Card**
   - Shows only if organization profile exists
   - Blue theme for visibility
   - Contains helpful description

2. **Populate Button**
   - Loading state with spinner during fetch
   - Disabled during loading
   - Success toast on completion
   - Error handling with user-friendly messages

3. **Non-Destructive Population**
   - Existing values are preserved
   - Array fields (industries, titles, regions) use `Set` to prevent duplicates
   - Can be clicked multiple times safely

## Error Handling

The feature includes comprehensive error handling:

```typescript
if (!organizationIntelligence?.organization) {
  toast({
    title: 'No Organization Intelligence',
    description: 'Please set up your organization profile first.',
    variant: 'destructive',
  });
  return;
}
```

## Data Source: Organization Intelligence

The organization intelligence data comes from:
- **Endpoint**: `/api/client-portal/settings/organization-intelligence`
- **Structure**:
  ```typescript
  {
    organization: {
      id: string;
      name: string;
      domain?: string;
      industry?: string;
      identity?: {
        legalName?: string;
        description?: string;
        industry?: string;
        employees?: string;
        regions?: string[];
        foundedYear?: number;
      };
      offerings?: {
        coreProducts?: string[];
        useCases?: string[];
        problemsSolved?: string[];
        differentiators?: string[];
      };
      icp?: {
        industries?: string[];
        personas?: Array;
        objections?: string[];
        companySize?: string;
      };
      positioning?: {
        oneLiner?: string;
        valueProposition?: string;
        competitors?: string[];
        whyUs?: string[];
      };
    }
  }
  ```

## Related Files

### Campaign Creation Flow
- `client/src/pages/client-portal/campaign-create.tsx` - Main campaign creation page (updated)
- `client/src/components/client-portal/campaigns/campaign-creation-wizard.tsx` - Alternative wizard component

### Organization Intelligence
- `client/src/pages/client-portal-intelligence.tsx` - Organization intelligence setup page
- `server/routes/org-intelligence-routes.ts` - Backend API endpoints
- `server/services/organization-research-service.ts` - Intelligence data processing

## Testing Recommendations

1. **Test with complete organization intelligence**
   - Set up organization profile with all fields
   - Verify all fields populate correctly

2. **Test with partial organization intelligence**
   - Leave some fields empty in organization profile
   - Verify only available fields populate

3. **Test non-destructive behavior**
   - Pre-fill campaign fields manually
   - Click "Populate" and verify existing values aren't overwritten
   - Check for duplicates in array fields

4. **Test error scenarios**
   - Click "Populate" without organization profile
   - Verify helpful error message appears

## Future Enhancements

Potential improvements:
1. **Selective Population**: Allow users to pick which fields to populate
2. **Preview**: Show preview of changes before applying
3. **Batch Operations**: Populate multiple fields with one button
4. **Custom Mappings**: Allow users to configure field mappings
5. **History**: Track which fields were populated from intelligence
6. **Sync**: Keep campaign fields in sync with organization intelligence updates

## API Integration Points

- `GET /api/client-portal/settings/organization-intelligence` - Fetch org intelligence
- No new endpoints needed; uses existing infrastructure

## Accessibility

The feature includes:
- Proper `aria-` labels on interactive elements
- Loading states with spinner animation
- Toast notifications for feedback
- Keyboard navigation support
- Color contrast compliance for blue theme

## Performance Considerations

- Organization intelligence data is cached via React Query
- Loading spinner prevents repeated requests during population
- Field population happens synchronously on client-side
- No network requests during population (data already cached)