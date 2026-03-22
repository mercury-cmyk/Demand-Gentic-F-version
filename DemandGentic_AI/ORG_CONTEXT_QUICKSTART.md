# Organization Intelligence → Campaign Context Quick Start

## How It Works

When creating a campaign, you now have the option to **load campaign context directly from your organization's intelligence data**. This means:

- ✅ Automatically populate campaign objectives from organization positioning
- ✅ Pre-fill target audience from organization ICP data  
- ✅ Load messaging, talking points, and call openers
- ✅ Set qualification criteria based on organization intelligence
- ✅ All pre-populated data is fully editable before launch

## Step-by-Step Guide

### 1. Start Campaign Creation
Navigate to **Campaigns → Create with AI**

### 2. Select Campaign Type
Choose between:
- **Telemarketing / AI Calling** - Outbound voice campaigns
- **Email Campaign** - Email outreach sequences

### 3. Load Organization Context (NEW!)
You'll see a new card: **"Load Organization Context"**

- Click the organization dropdown
- Select the organization that already has intelligence data
- Review organization details in the preview
- Click **"Load Context"** button

### 4. Confirm Loading
A dialog appears showing what will be populated:
- Campaign objectives and goals
- Target audience (industries, job titles, seniority)
- Core messaging and talking points
- Email angles and call openers
- Conversation flow and objection handling

Click **"Load Context"** to proceed

### 5. Review & Customize
The campaign wizard opens with pre-populated context:
- All sections are pre-filled from organization intelligence
- Review each section in the "Campaign Structure" panel
- Customize any fields as needed
- Approve each section before launch

### 6. Launch Campaign
Once all sections are approved, launch your campaign with confidence that context is aligned with organization intelligence

## What Gets Populated

### From Organization Identity
- Company name and description
- Industry classification
- Employee size range
- Operating regions

### From Organization Offerings
- Core products and services
- Key use cases
- Problems solved
- Competitive differentiators

### From Organization ICP
- Target industries
- Buyer personas (job titles)
- Common objections

### From Organization Positioning
- One-liner pitch
- Competitive positioning
- Why customers choose them

### From Organization Outreach
- Email approach angles
- Cold call openers
- Engagement strategies

## Key Benefits

| Aspect | Without Pre-Loading | With Pre-Loading |
|--------|-------------------|------------------|
| **Setup Time** | 15-20 min | 2-3 min |
| **Consistency** | Manual alignment needed | Automatic alignment |
| **Accuracy** | Prone to errors | Pre-researched data |
| **Customization** | Manual entry | Start with smart defaults |
| **Completeness** | Often incomplete | Pre-filled all key fields |

## Example: TechCorp AI Solutions

### Before (Manual Entry)
- Describe goals: "Generate leads for AI solutions"
- List industries: "Technology, Finance, Healthcare"
- Write messaging: "Help companies automate..."
- Time: ~18 minutes

### After (Context Loading)
1. Select "TechCorp AI Solutions" from org dropdown
2. Click "Load Context"
3. Review pre-populated objectives, audience, messaging
4. Minor tweaks (5 min)
5. Launch
6. Time: ~5 minutes total

## Technical Details

**Endpoint**: `GET /api/org-intelligence/campaign-context/:organizationId`

**Integration Point**: Intelligent Campaign Creator

**Compatibility**: 
- Email campaigns ✅
- Telemarketing/Voice campaigns ✅
- Both campaign types fully supported

## Troubleshooting

**"No Organizations Found"**
- You need to have organizations created with intelligence data
- Create a new organization or analyze an existing one with AI

**"Context not loading"**
- Check that organization has complete intelligence data
- Verify organization ID is correct
- Check browser console for error details

**"Some fields are empty"**
- Not all organizations have complete intelligence
- Fields marked "Unknown" can be manually filled
- This is normal - customize as needed before launch

## Pro Tips

💡 **Reuse Context**: Use same organization for multiple campaigns to maintain messaging consistency

💡 **Customize First**: Pre-populated context is a starting point, customize to your specific campaign

💡 **Review Carefully**: Always review sections before approving to ensure accuracy

💡 **Update Organization**: If organization intelligence is outdated, update it first for best results

💡 **Save Drafts**: Save as draft first to review context before going live

## What's Next?

After launching a campaign with pre-loaded organization context, you can:
- Monitor campaign performance
- Adjust messaging based on results
- Update organization intelligence for future campaigns
- Create related campaigns with consistent positioning