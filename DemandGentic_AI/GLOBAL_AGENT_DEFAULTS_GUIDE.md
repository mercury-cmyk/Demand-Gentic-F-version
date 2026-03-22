# Global Agent Defaults Configuration System

## Overview

The Global Agent Defaults system provides centralized management of default settings that apply to all virtual agents. This eliminates redundant configuration and ensures consistency across your agent fleet.

## Features

### ✅ Centralized Configuration Management
- **Single Source of Truth**: All agent defaults managed in one location
- **Automatic Inheritance**: New agents automatically receive global defaults
- **Override Capability**: Individual agents can override defaults when needed

### 🎯 Configurable Settings

1. **Default Opening Message**
   - First message agents use when starting conversations
   - Supports template variables: `{{contact.full_name}}`, `{{account.name}}`, `{{campaign.purpose}}`
   - Example: "Hi, may I speak with {{contact.full_name}}? This is {{agent.name}} calling regarding {{campaign.purpose}}."

2. **Default System Prompt**
   - Defines agent personality, environment, and behavioral framework
   - Markdown-formatted for readability
   - Applied to all agents automatically

3. **Default Training Guidelines**
   - Behavioral constraints and best practices
   - Array of discrete guidelines
   - Foundational rules for all agents:
     - Never interrupt prospects
     - Detect and handle voicemail appropriately
     - Qualify using BANT (Budget, Authority, Need, Timeline)
     - Handle objections gracefully
     - Respect Do-Not-Call requests
     - And more...

4. **Default Voice Configuration**
   - Voice Provider: Google Gemini (default) or OpenAI Realtime
   - Voice Selection: Kore (default), Pegasus, Aoede, etc.

## Architecture

### Database Schema

```sql
CREATE TABLE agent_defaults (
  id UUID PRIMARY KEY,
  default_first_message TEXT NOT NULL,
  default_system_prompt TEXT NOT NULL,
  default_training_guidelines JSONB,
  default_voice_provider TEXT NOT NULL,
  default_voice TEXT NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP,
  created_at TIMESTAMP
);
```

### API Endpoints

**GET /api/agent-defaults**
- Fetches current global defaults
- Returns system defaults if no custom defaults are set
- Response includes `isSystemDefault` flag

**PUT /api/agent-defaults**
- Updates global defaults (upsert operation)
- Validates required fields
- Records updatedBy and updatedAt

**POST /api/agent-defaults/reset**
- Deletes custom defaults
- Falls back to system defaults
- Returns new system default values

### Frontend Components

1. **AgentDefaultsConfiguration** (`client/src/components/virtual-agents/agent-defaults-configuration.tsx`)
   - Main configuration UI
   - Real-time editing with preview
   - Save/Reset functionality
   - Visual indicators for system vs custom defaults

2. **AgentDefaultsSettingsPage** (`client/src/pages/agent-defaults-settings.tsx`)
   - Page wrapper for configuration component
   - Role-based access control (admin/manager only)

3. **Settings Navigation** (`client/src/components/settings/settings-layout.tsx`)
   - Added "Agent Defaults" link under Infrastructure settings
   - Icon: Settings gear
   - Description: "Global agent configuration"

### Integration with Agent Creation

Virtual agent creation form automatically fetches and applies global defaults:

```typescript
useEffect(() => {
  const loadAgentDefaults = async () => {
    if (isCreateOpen && !editingAgent) {
      const response = await apiRequest('GET', '/api/agent-defaults');
      const defaults = await response.json();
      
      setFormData({
        name: '',
        description: '',
        provider: defaults.defaultVoiceProvider || 'google',
        voice: defaults.defaultVoice || 'Kore',
        settings: { /* ... */ },
        isActive: true,
      });
    }
  };
  void loadAgentDefaults();
}, [isCreateOpen, editingAgent]);
```

## Usage

### Accessing Agent Defaults Configuration

**Via Settings Hub:**
1. Navigate to Settings
2. Click "Infrastructure Settings"
3. Select "Agent Defaults"

**Direct URL:**
- `/settings/agent-defaults`

**Access Requirements:**
- Role: Admin or Manager
- Non-admins redirected to homepage

### Editing Global Defaults

1. **Edit Opening Message**
   - Modify the default first message template
   - Use template variables for dynamic content
   - Preview how variables will be replaced

2. **Edit System Prompt**
   - Update personality, environment, and behavioral guidance
   - Use markdown formatting
   - Define tone and approach

3. **Manage Training Guidelines**
   - Add new guidelines with the input field
   - Remove guidelines with the × button
   - Reorder by editing the list directly

4. **Configure Voice Defaults**
   - Select voice provider (Google/OpenAI)
   - Choose default voice for new agents
   - Voice options update based on provider

5. **Save Changes**
   - Click "Save Global Defaults"
   - Toast notification confirms success
   - All new agents will use updated defaults

6. **Reset to System Defaults**
   - Click "Reset to System Defaults"
   - Confirm in the alert dialog
   - All customizations are discarded
   - System defaults are restored

### Visual Indicators

- **System Defaults Badge**: Displayed when using unmodified system defaults
- **Last Updated Badge**: Shows when custom defaults were last modified
- **Info Box**: Explains how defaults work and their scope
- **Guideline Checkmarks**: Visual confirmation of active guidelines

## System Defaults

### Default Opening Message
```
Hi, may I speak with {{contact.full_name}}? This is {{agent.name}} calling regarding {{campaign.purpose}}.
```

### Default System Prompt
```markdown
# Personality

You are a professional, articulate, and highly trained B2B sales development representative speaking on behalf of a respected organization. Your tone is confident, warm, and consultative—never pushy or robotic. You adapt naturally to the prospect's communication style while maintaining professionalism.

# Environment

You are making outbound calls to decision-makers at businesses. These prospects are busy and may be skeptical. Your job is to quickly establish credibility, demonstrate value, and move the conversation toward the next step.

# Core Behaviors

- **Lead with value**: Immediately communicate why this call matters to them
- **Listen actively**: Ask thoughtful questions and genuinely engage with their responses
- **Handle objections gracefully**: Never argue; acknowledge concerns and reframe
- **Respect their time**: Keep the conversation focused and productive
- **Be human**: Use natural language, appropriate humor when it fits, and show empathy
```

### Default Training Guidelines
1. Never interrupt the prospect while they are speaking
2. If you detect voicemail, leave a professional message and end the call
3. Qualify prospects based on budget, authority, need, and timeline (BANT)
4. Handle price objections by focusing on value and ROI
5. Use the prospect's name naturally during conversation (not excessively)
6. Ask open-ended questions to uncover pain points
7. Summarize next steps clearly before ending the call
8. Never make false claims or promises you cannot keep
9. Respect Do-Not-Call requests immediately and apologize
10. Stay within compliance boundaries for cold calling regulations

### Default Voice Configuration
- **Provider**: Google Gemini Live
- **Voice**: Kore (soft & friendly)

## Migration

### Database Migration

Run the migration to create the `agent_defaults` table:

```bash
psql -U your_user -d your_database -f migrations/20260118101636_add_agent_defaults.sql
```

The migration:
- Creates `agent_defaults` table
- Adds indexes for performance
- Inserts system default row with ID `00000000-0000-0000-0000-000000000001`

### No Breaking Changes

This feature is **fully backward compatible**:
- Existing agents are unaffected
- New agents automatically use global defaults
- Individual agents can override any default
- If defaults API is unavailable, hardcoded fallbacks are used

## Benefits

### 🚀 Velocity
- Reduces agent creation time by pre-configuring common settings
- Eliminates repetitive data entry
- Enables bulk changes across all new agents

### 🎯 Consistency
- Ensures all agents follow organizational standards
- Reduces configuration drift
- Maintains brand voice and compliance

### 🔧 Maintainability
- Single location to update default behavior
- Easy A/B testing of different configurations
- Clear audit trail of changes

### 📊 Governance
- Admin-controlled configuration
- Role-based access control
- Transparent visibility into what defaults are being applied

## Best Practices

1. **Start with System Defaults**
   - Review system defaults before customizing
   - Only override when necessary

2. **Test Changes**
   - Create a test agent after updating defaults
   - Verify behavior matches expectations

3. **Document Customizations**
   - Keep internal notes on why defaults were changed
   - Link to relevant policies or compliance requirements

4. **Review Regularly**
   - Audit defaults quarterly
   - Update based on agent performance data
   - Incorporate learnings from top-performing agents

5. **Use Template Variables**
   - Leverage `{{contact.*}}` and `{{campaign.*}}` variables
   - Makes messages dynamic and personalized
   - Reduces need for agent-specific customization

## Future Enhancements

Planned improvements:
- [ ] Version history for defaults
- [ ] A/B testing framework
- [ ] Default presets (by industry, use case)
- [ ] Bulk apply defaults to existing agents
- [ ] Default templates library
- [ ] AI-powered default optimization
- [ ] Per-campaign default overrides

## Troubleshooting

### Defaults Not Applying to New Agents

**Issue**: New agents not using global defaults

**Solutions**:
1. Verify API route is registered: `app.use("/api/agent-defaults", agentDefaultsRouter)`
2. Check database migration ran successfully
3. Ensure agent creation code fetches defaults before setting form data
4. Check browser console for API errors

### Cannot Access Configuration Page

**Issue**: 403 Forbidden or redirect to homepage

**Solutions**:
1. Verify user role is `admin` or `manager`
2. Check AuthContext is properly initialized
3. Verify route exists in App.tsx

### Changes Not Saving

**Issue**: Save button clicks don't persist changes

**Solutions**:
1. Check Network tab for API errors
2. Verify database connection is active
3. Ensure user has write permissions
4. Check server logs for validation errors

## Related Documentation

- [Virtual Agent Creation Guide](./AGENT_USER_GUIDE.md)
- [Voice Configuration](./AUDIO_FIX_QUICK_REF.md)
- [Settings Hub Architecture](./SETTINGS_HUB.md)
- [API Routes Documentation](./API_ROUTES.md)

---

**Outcome**: Global agent defaults system successfully implemented and documented