# Call Script Placeholder System

The Agent Console supports comprehensive dynamic placeholders in call scripts that automatically populate with real contact, account, agent, and campaign data.

## Supported Placeholder Formats

### Contact Placeholders
Modern format (recommended):
- `{{contact.fullName}}` - Full name of the contact
- `{{contact.firstName}}` - First name only
- `{{contact.lastName}}` - Last name only
- `{{contact.email}}` - Email address
- `{{contact.phone}}` - Direct phone number
- `{{contact.directPhone}}` - Direct phone number (alias)
- `{{contact.jobTitle}}` - Job title/position
- `{{contact.title}}` - Job title (alias)
- `{{contact.department}}` - Department name
- `{{contact.seniority}}` - Seniority level

Legacy format (backwards compatibility):
- `[Contact Name]` - Full name
- `[Contact First Name]` - First name
- `[Contact Email]` - Email address
- `[Contact Phone]` - Direct phone
- `[Contact Title]` - Job title
- `[Job Title]` - Job title (alias)

### Account Placeholders
Modern format (recommended):
- `{{account.name}}` - Company/account name
- `{{account.company}}` - Company name (alias)
- `{{account.domain}}` - Company domain
- `{{account.industry}}` - Industry classification
- `{{account.employees}}` - Staff count
- `{{account.revenue}}` - Annual revenue
- `{{account.phone}}` - Main company phone

Legacy format (backwards compatibility):
- `[Company Name]` - Account name
- `[Company]` - Account name (alias)
- `[Account Name]` - Account name (alias)
- `[Industry]` - Industry classification

### Agent Placeholders
Modern format (recommended):
- `{{agent.fullName}}` - Agent's full name
- `{{agent.firstName}}` - Agent's first name
- `{{agent.lastName}}` - Agent's last name
- `{{agent.name}}` - Agent's full name (alias)
- `{{agent.email}}` - Agent's email address

Legacy format (backwards compatibility):
- `[Agent Name]` - Agent's full name
- `[Your Name]` - Agent's full name (alias)

### Campaign Placeholders
Modern format (recommended):
- `{{campaign.name}}` - Campaign name

Legacy format (backwards compatibility):
- `[Campaign Name]` - Campaign name

## Example Call Script

```
Hello {{contact.firstName}}, this is {{agent.firstName}} calling from {{campaign.name}}.

I'm reaching out to {{account.name}} specifically because I noticed you're in the {{account.industry}} industry.

We specialize in helping companies like yours streamline their B2B customer engagement. As a {{contact.jobTitle}}, I thought you'd be interested in seeing how we can help improve your marketing ROI.

Key Points:
- Account-Based Marketing tailored for {{account.industry}}
- Multi-channel campaign management (Email & Telemarketing)
- AI-powered lead qualification
- Comprehensive compliance features

Do you have a few minutes to discuss how {{account.name}} could benefit from our platform?

Contact Information:
- Your Email: {{contact.email}}
- Your Phone: {{contact.phone}}
- Company: {{account.name}}
- Industry: {{account.industry}}

Let me know if you'd like to schedule a more detailed demo, {{contact.firstName}}. I can be reached at {{agent.email}}.

Best regards,
{{agent.fullName}}
```

## How It Works

1. **Data Fetching**: When an agent views a contact in the queue, the system fetches full contact and account details.
2. **Real-time Replacement**: All placeholders are replaced in real-time with actual data from the database.
3. **Fallback Handling**: If a field is empty or null, the placeholder is replaced with an empty string.
4. **Case Insensitive**: Placeholders are case-insensitive (e.g., `{{Contact.FirstName}}` works the same as `{{contact.firstname}}`).

## Implementation Notes

- Placeholders are replaced client-side in the Agent Console for security and performance.
- The system prioritizes full contact/account details from the database over limited queue item data.
- Both modern `{{}}` and legacy `[]` formats are supported for backwards compatibility.
- All replacements happen before the script is displayed to the agent.
