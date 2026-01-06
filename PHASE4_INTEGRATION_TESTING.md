# Phase 4: Integration Testing & API Examples

## Quick Start - Testing the Integration

### 1. Start the Application
```bash
npm run dev
```

### 2. Navigate to Email Campaign Creation
```
http://localhost:5173/campaigns/email/create
```

### 3. Step-by-Step Testing

#### Step 1: Audience Selection
- Select test segment or apply filters
- Should show "Continue to Content" button
- Click Next to proceed to Step 2

#### Step 2: Email Content (THE ENHANCED INTEGRATION)
✓ Should load Step2EmailContentEnhanced component
✓ Sender Profile dropdown should populate with available senders
✓ First verified sender should auto-select
✓ EmailBuilderClean should render with visual editor

**Test Sequence:**
1. Type in Subject field: "Test Campaign Email"
2. Switch to "Email Builder" tab
3. In EmailBuilderClean:
   - Add text block: "Hello {{first_name}}!"
   - Add image block with sample image
   - Add button block with link
   - Click Save button
4. Switch to "Templates" tab
   - Click "Browse Templates"
   - Select a template (loads into builder)
5. Switch to "Preview" tab
   - Click "Open Preview"
   - Verify multi-device display
6. Back in builder, click "Send Test Email"
   - Select test contacts
   - Verify test email sends successfully
7. Click "Continue to Scheduling" button

#### Step 3: Scheduling
- Configure send time
- Set timezone and throttling (optional)
- Proceed to Step 4

#### Step 4: Compliance
- Run verification checks
- Review warnings/issues
- Proceed to Step 5

#### Step 5: Summary
- Review all campaign data
- Launch campaign or save as draft
- Verify campaign created successfully

---

## API Testing

### Testing with curl/Postman

#### 1. Get Sender Profiles
```bash
curl -X GET http://localhost:3000/api/sender-profiles \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": "profile-1",
    "name": "Support Team",
    "email": "support@company.com",
    "verified": true
  },
  {
    "id": "profile-2",
    "name": "Marketing",
    "email": "marketing@company.com",
    "verified": false
  }
]
```

#### 2. Get Email Templates
```bash
curl -X GET http://localhost:3000/api/email-templates \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": "template-1",
    "name": "Welcome Email",
    "subject": "Welcome to {{company_name}}!",
    "preheader": "We're excited to have you",
    "htmlContent": "<html>...</html>",
    "category": "welcome",
    "thumbnail": "https://..."
  }
]
```

#### 3. Send Test Email
```bash
curl -X POST http://localhost:3000/api/campaigns/send-test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "emails": ["test@example.com", "user@example.com"],
    "subject": "Test Campaign: {{first_name}}",
    "preheader": "Check out this email",
    "html": "<html><body>Hello {{first_name}}!</body></html>",
    "senderProfileId": "profile-1"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Test emails sent to 2 recipients",
  "details": {
    "sent": ["test@example.com", "user@example.com"],
    "failed": []
  }
}
```

#### 4. Create Campaign
```bash
curl -X POST http://localhost:3000/api/campaigns \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Q1 Newsletter",
    "type": "email",
    "status": "active",
    "audienceRefs": {
      "segments": ["segment-1", "segment-2"]
    },
    "emailSubject": "Q1 Newsletter: {{month}} Updates",
    "emailHtmlContent": "<html><body>Hello {{first_name}}!</body></html>",
    "emailPreheader": "Check out our latest updates",
    "senderProfileId": "profile-1",
    "scheduleJson": {
      "type": "scheduled",
      "date": "2024-01-15",
      "time": "09:00",
      "timezone": "America/New_York"
    },
    "throttlingConfig": {
      "limit": 1000
    }
  }'
```

**Expected Response:**
```json
{
  "id": "campaign-123",
  "name": "Q1 Newsletter",
  "type": "email",
  "status": "active",
  "createdAt": "2024-01-10T10:30:00Z",
  "audienceSize": 5000,
  "emailSubject": "Q1 Newsletter: {{month}} Updates"
}
```

#### 5. Send Campaign (Execute)
```bash
curl -X POST http://localhost:3000/api/campaigns/campaign-123/send \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "campaignId": "campaign-123",
  "message": "Campaign sent successfully",
  "details": {
    "totalRecipients": 5000,
    "queued": 5000,
    "failed": 0,
    "estimatedDeliveryTime": "2024-01-15T09:00:00Z"
  }
}
```

---

## Backend Email Processing Pipeline

### Email Rendering Flow
```
POST /api/campaigns/send-test or /api/campaigns/:id/send
    ↓
campaign-send-routes.ts
    ├─ Fetch campaign from database
    ├─ Validate campaign status
    ├─ Resolve sender profile
    └─ Fetch contacts from audience
    ↓
bulk-email-service.ts::sendCampaignEmails()
    ├─ Iterate through contacts
    ├─ For each contact:
    │   ├─ Replace personalization tokens
    │   │   • {{first_name}} → contact.firstName
    │   │   • {{last_name}} → contact.lastName
    │   │   • {{company}} → contact.company
    │   │   • ... (20+ tokens)
    │   ├─ Check suppression list
    │   ├─ Generate tracking ID
    │   ├─ Call email-renderer.ts
    │   └─ Queue in BullMQ
    │
    └─ email-renderer.ts
        ├─ replacePersonalizationTokens()
        ├─ addTrackingPixel()
        │   • Injects: <img src="https://api.example.com/track/[id]" />
        ├─ wrapLinksWithTracking()
        │   • Converts: https://example.com
        │   • To: https://api.example.com/track/link/[id]?url=...
        ├─ generateComplianceFooter()
        │   • Adds unsubscribe link
        │   • Adds sender info
        │   • Adds privacy policy link
        └─ htmlToPlaintext()
            • Generates plain text version

    ↓
BullMQ Job Queue
    ├─ Each email queued as separate job
    ├─ Parallel processing (configurable workers)
    └─ Delivery via SMTP provider
```

---

## Personalization Tokens Reference

### Available Tokens for Merge Fields

All tokens use format: `{{token_name}}`

**Contact Fields:**
- `{{first_name}}` - Contact first name
- `{{last_name}}` - Contact last name
- `{{email}}` - Contact email address
- `{{phone}}` - Contact phone number
- `{{company}}` - Company name
- `{{job_title}}` - Job title
- `{{department}}` - Department
- `{{industry}}` - Industry
- `{{company_size}}` - Company size

**Account Fields:**
- `{{account_name}}` - Account/Company name
- `{{account_industry}}` - Account industry
- `{{account_location}}` - Account location
- `{{account_website}}` - Account website

**Custom Fields:**
- `{{custom_field_1}}` - Custom field values
- `{{custom_field_2}}`
- ... (any custom fields in schema)

**System Tokens:**
- `{{tracking_pixel}}` - Tracking pixel (auto-injected)
- `{{unsubscribe_link}}` - Unsubscribe URL (auto-injected)

---

## Troubleshooting

### Issue: Sender Profile Not Loading
**Solution:**
1. Verify sender profiles exist in database
2. Check GET /api/sender-profiles returns data
3. Verify authentication token valid
4. Check browser DevTools Network tab for API errors

### Issue: Test Email Not Sending
**Solution:**
1. Verify senderProfileId is valid
2. Verify email addresses are valid format
3. Check POST /api/campaigns/send-test returns success
4. Check server logs for BullMQ errors
5. Verify SMTP provider credentials

### Issue: Templates Not Loading
**Solution:**
1. Verify GET /api/email-templates returns templates
2. Check template data has required fields (subject, htmlContent)
3. Verify template IDs are unique

### Issue: Campaign Not Creating
**Solution:**
1. Verify all required fields provided (subject, html, senderProfileId)
2. Check audience references are valid
3. Verify authentication token valid
4. Check POST /api/campaigns returns campaign ID
5. Review server logs for database errors

### Issue: Emails Not Being Sent
**Solution:**
1. Verify campaign status is "active" (not "draft")
2. Check schedule time has passed (for scheduled campaigns)
3. Verify BullMQ workers running: `npm run start:worker`
4. Check contact count > 0
5. Verify sender profile verified
6. Check suppression list not blocking all contacts

---

## Integration Verification Checklist

### Frontend Components
- [ ] Step2EmailContentEnhanced loads without errors
- [ ] EmailBuilderClean renders visual editor
- [ ] GrapesJS blocks work (text, image, button, etc.)
- [ ] Monaco code editor works with HTML
- [ ] Subject line field accepts input
- [ ] Preheader field accepts input
- [ ] Form data saves on "Continue" button
- [ ] Form data does NOT save on validation errors

### Sender Profile Integration
- [ ] GET /api/sender-profiles returns profiles
- [ ] Dropdown populates with profiles
- [ ] First verified profile auto-selects
- [ ] Changing profile updates selection
- [ ] Selected profile stored in form data
- [ ] Unverified sender shows warning badge

### Template Integration
- [ ] TemplateSelectorModal opens from "Browse Templates" button
- [ ] Template list populates from API
- [ ] Clicking template loads content into builder
- [ ] Template data includes: name, subject, html, preheader
- [ ] Loaded content persists in builder

### Test Email Integration
- [ ] SendTestEmailModal opens from builder
- [ ] Email list shows sample contacts
- [ ] Sending test email calls POST /api/campaigns/send-test
- [ ] Success message shows after send
- [ ] Test email includes personalization
- [ ] Test email includes tracking pixel

### Preview Integration
- [ ] Preview modal opens from "Preview" tab
- [ ] Shows desktop view
- [ ] Shows tablet view
- [ ] Shows mobile view
- [ ] Personalization preview shows token replacement
- [ ] Dark mode toggle works

### Campaign Wizard Data Flow
- [ ] Step 1 audience data flows through
- [ ] Step 2 content data includes: subject, html, preheader, senderProfileId
- [ ] Step 3 scheduling data flows through
- [ ] Step 4 compliance data flows through
- [ ] Step 5 summary shows all accumulated data
- [ ] Campaign created with all data

### API Integration
- [ ] POST /api/campaigns creates campaign successfully
- [ ] Campaign has correct emailSubject
- [ ] Campaign has correct emailHtmlContent
- [ ] Campaign has correct emailPreheader
- [ ] Campaign has correct senderProfileId
- [ ] Campaign appears in campaign list
- [ ] Campaign can be launched from summary page

### Backend Email Processing
- [ ] POST /api/campaigns/:id/send triggers delivery
- [ ] Email rendering includes personalization tokens
- [ ] Tracking pixel injected in email
- [ ] Links wrapped with tracking parameters
- [ ] Compliance footer added
- [ ] Plain text version generated
- [ ] Emails queued in BullMQ
- [ ] Emails delivered via SMTP

---

## Performance Metrics

### Expected Performance

**Component Load Time:**
- Step2EmailContentEnhanced: < 500ms
- EmailBuilderClean initial render: < 1s
- GrapesJS initialization: < 2s
- TemplateSelectorModal: < 500ms

**API Response Times:**
- GET /api/sender-profiles: < 200ms
- GET /api/email-templates: < 500ms
- POST /api/campaigns/send-test: < 1s
- POST /api/campaigns: < 500ms
- POST /api/campaigns/:id/send: < 1s

**Email Processing:**
- Per-email rendering: < 100ms
- Full campaign (1000 emails): < 2 minutes
- Test emails (5 emails): < 5 seconds

---

## Next Steps

1. **Testing Phase** (Recommended)
   - Follow the Step-by-Step Testing section above
   - Verify each component works as expected
   - Test all API endpoints
   - Validate email delivery

2. **Optimization Phase** (Optional)
   - Profile component performance
   - Optimize template loading
   - Add caching for sender profiles
   - Implement template search

3. **Feature Enhancements** (Backlog)
   - Drag-and-drop template builder
   - Advanced personalization (conditional blocks)
   - A/B testing variants
   - Campaign scheduling UI improvements
   - Analytics dashboard

4. **Production Deployment**
   - Configure environment variables
   - Set up sender profile verification
   - Configure SMTP provider
   - Set up monitoring and alerts
   - Train team on feature

---

## Support & Documentation

- **EmailBuilderClean**: 227 lines, configurable visual editor
- **GrapesJS**: Official docs at https://grapesjs.com
- **Email Rendering**: 273 lines, full personalization + tracking
- **BullMQ**: Queue jobs at https://docs.bullmq.io
- **Campaign API**: Full endpoints in campaign-send-routes.ts

For issues or questions, review logs in:
- Client: Browser DevTools Console
- Server: Terminal output / logs folder
- BullMQ: Redis monitoring tools
