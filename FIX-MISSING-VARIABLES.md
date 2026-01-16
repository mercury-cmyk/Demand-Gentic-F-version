# Fix: Missing Contact Variables in AI Calls

## Problem Diagnosed

AI calls were connecting to OpenAI Realtime API successfully, but the agent was saying **"I'm sorry, an error has occurred"** because required variables were missing from the opening message.

### Root Cause

The `client_state` object passed to OpenAI used field names that didn't match what the AI agent expected:

**What was being sent:**
```javascript
{
  contact_first_name: "Peter",
  contact_last_name: "Costello",
  company_name: "BCS Financial Corporation"
}
```

**What the AI agent expected:**
```javascript
{
  "contact.full_name": "Peter Costello",
  "contact.job_title": "CFO",  // ❌ Was completely missing!
  "account.name": "BCS Financial Corporation"
}
```

### Error in Logs

```
[OpenAI-Realtime-Dialer] ⚠️ CALL BLOCKED: Missing required variables for opening message: contact.full_name, contact.job_title, account.name
[OpenAI-Realtime-Dialer] Missing: contact.full_name, contact.job_title, account.name - Falling back to generic opening
[OpenAI-Realtime-Dialer] ⚠️ Validation failed - using simple opening message
```

Without these variables, the agent couldn't properly introduce itself or use the contact's name/title, resulting in a broken/generic opening that triggered the error message.

## Solution Implemented

Modified [server/services/telnyx-ai-bridge.ts:423-431](server/services/telnyx-ai-bridge.ts#L423-L431) to include both canonical field names (what the AI agent expects) AND legacy field names (for backward compatibility):

### Changes Made

```javascript
// Contact context for personalization (using canonical field names)
'contact.full_name': contactFullName || `${context.contactFirstName || ''} ${context.contactLastName || ''}`.trim(),
'contact.first_name': context.contactFirstName || '',
'contact.last_name': context.contactLastName || '',
'contact.job_title': context.contactTitle || '',  // ✅ NOW INCLUDED!
'account.name': context.companyName || '',
// Legacy field names for backward compatibility
contact_first_name: context.contactFirstName,
contact_last_name: context.contactLastName,
company_name: context.companyName,
```

### What Was Fixed

1. **✅ Added `contact.full_name`** - Properly formatted full name
2. **✅ Added `contact.job_title`** - From `context.contactTitle`
3. **✅ Added `account.name`** - Company name with correct field name
4. **✅ Kept legacy fields** - Backward compatibility with other systems

## How to Test

1. **Restart your dev server** to load the updated code
2. **Trigger a test call** from the campaign
3. **Watch the logs** - you should NO LONGER see:
   ```
   ⚠️ CALL BLOCKED: Missing required variables
   ```

4. **Listen to the call** - The AI should now properly introduce itself with:
   - Contact's full name
   - Contact's job title
   - Company name

## Expected Behavior After Fix

### Before (Broken)
```
[Call connects]
"I'm sorry, an error has occurred."
[Call ends]
```

### After (Fixed)
```
[Call connects]
"Hello, may I speak with Peter Costello, the CFO at BCS Financial Corporation?"
[Normal conversation proceeds]
```

## Verification

After restarting your server and making a test call, check logs for:

**Success indicators:**
- ✅ No "CALL BLOCKED" or "Missing required variables" warnings
- ✅ No "Falling back to generic opening" messages
- ✅ No "Validation failed" errors
- ✅ Call proceeds with proper introduction

**Call recordings:**
- Should hear proper personalized greeting
- No error messages
- AI engages in normal conversation

## Files Modified

- **[server/services/telnyx-ai-bridge.ts](server/services/telnyx-ai-bridge.ts#L423-L431)** - Added canonical field names to `client_state`

## Deployment

**For local/dev (ngrok):**
```bash
# Simply restart your dev server
# The changes will be picked up automatically
```

**For production (Google Cloud Run):**
```bash
# Commit and push changes
git add server/services/telnyx-ai-bridge.ts
git commit -m "fix: add missing contact variables to client_state for AI calls"
git push

# Deploy will trigger automatically via Cloud Build
```

## Related Issues Fixed

This also resolves:
- Generic/broken opening messages
- AI agent unable to personalize greetings
- "I'm sorry, an error has occurred" at call start
- Silent calls after connection

## Prevention

Going forward, ensure any new variables added to the AI agent's opening message template are also included in the `client_state` object with the correct canonical field names (`contact.field_name`, `account.field_name`, etc.).
