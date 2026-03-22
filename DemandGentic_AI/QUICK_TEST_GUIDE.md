# QUICK TEST GUIDE: Agent Console Qualified Disposition

## What Was Fixed?

**Problem:** When agents submitted qualified dispositions from the Agent Console, leads weren't being created and weren't appearing in QA/Leads.

**Solution:** Added fallback lead creation logic when no call attempt exists.

---

## How to Test

### Prerequisites
- ✅ Active user logged in as an Agent
- ✅ Campaign configured and active
- ✅ Contact in the system

### Test Steps

#### Step 1: Open Agent Console
```
Navigate to: /agent-console (or Agent Console link)
```

#### Step 2: Simulate a Call
```
- Click "Start Call" or similar button
- Skip any dialing/connection steps
- Go directly to Wrap-up Phase
```

#### Step 3: Submit Qualified Disposition
```
1. In the Disposition dropdown, select: ✅ Qualified
2. (Optional) Add notes like: "Interested in scheduling"
3. Click "Save" button
4. Wait 1-2 seconds for lead to be created
```

#### Step 4: Verify Lead Created
```
METHOD A - Check QA Section:
1. Go to: QA & Leads → QA
2. Look for a NEW lead with:
   - Contact name: 
   - Company: 
   - Status: "new"
   - Agent: 
3. Should appear within 1-2 seconds ✅

METHOD B - Check Leads Section:
1. Go to: QA & Leads → Leads
2. Look for the same lead
3. Filter by Agent Name if needed ✅

METHOD C - Check Server Logs:
1. Open server logs/terminal
2. Look for entries like:
   [DISPOSITION] ✅ Lead created: 
   OR
   [DISPOSITION] ✅ FALLBACK: Lead created directly: 
```

---

## Expected Outcomes

### ✅ SUCCESS CASE: Lead Appears in QA

```
QA & Leads → QA
┌─────────────────────────────────────────┐
│ Lead ID: lead-xyz123                    │
│ Contact: John Smith                     │
│ Company: Acme Corp                      │
│ Agent: Your Name                        │
│ Status: new (pending QA review)         │
│ Created: 2 seconds ago                  │
└─────────────────────────────────────────┘
```

### ❌ FAILURE CASE: Lead Doesn't Appear

If lead doesn't appear after 5 seconds:
1. Refresh the page (Ctrl+R)
2. Check Agent name filter
3. Check date range filter
4. Check server logs for errors

---

## Debugging

### Check Server Logs
```bash
# Look for these success messages:
[DISPOSITION] Processing disposition through engine: qualified...
[DISPOSITION] ✅ Lead created: 

# Or fallback messages:
[DISPOSITION] ⚠️ Disposition engine didn't create lead...
[DISPOSITION] ✅ FALLBACK: Lead created directly: 

# Or error messages:
[DISPOSITION] Cannot create lead - contact not found
[DISPOSITION] Lead already exists: 
```

### Check Database Directly
```sql
-- Find recent qualified leads
SELECT 
  id, 
  contact_name, 
  agent_id, 
  qa_status, 
  created_at
FROM leads
WHERE 
  qa_status = 'new'
ORDER BY created_at DESC
LIMIT 10;

-- Verify it's linked to correct contact/campaign
SELECT 
  l.id,
  l.contact_id,
  l.campaign_id,
  l.agent_id,
  c.first_name,
  c.last_name
FROM leads l
JOIN contacts c ON l.contact_id = c.id
WHERE l.id = '';
```

---

## Test Cases

### Test Case 1: Basic Qualified Disposition
**Scenario:** No prior call attempt, manual agent submission
**Expected:** Lead created via fallback logic
**Success:** Lead appears in QA within 2 seconds

### Test Case 2: Multiple Agents
**Scenario:** Different agents submit qualified dispositions
**Expected:** Each creates their own lead
**Success:** All leads appear with correct agent names

### Test Case 3: Same Contact Multiple Times
**Scenario:** Submit qualified twice for same contact
**Expected:** First creates lead, second creates new lead (separate)
**Success:** Both leads appear (unless same campaign suppression applies)

### Test Case 4: Mixed Dispositions
**Scenario:** Some qualified, some "Not Interested"
**Expected:** Only qualified creates leads
**Success:** Qualified appear in Leads, Not Interested don't

---

## Common Issues & Solutions

### Issue: Lead doesn't appear
**Solution:**
1. Wait 2-3 seconds (give system time)
2. Refresh page
3. Check browser console for errors (F12)
4. Check server logs

### Issue: Duplicate leads appear
**Solution:**
- This shouldn't happen (fix includes duplicate check)
- Report if observed

### Issue: Wrong agent appears on lead
**Solution:**
- Verify you're logged in as the right agent
- Check user settings

### Issue: Wrong contact/company on lead
**Solution:**
- Verify correct contact was selected before disposition
- Check contact details in CRM

---

## Success Checklist

After testing, verify all of these:

- [ ] Qualified disposition submitted from Agent Console
- [ ] Lead appears in QA section within 2 seconds
- [ ] Lead shows correct contact name
- [ ] Lead shows correct company name
- [ ] Lead shows correct agent name
- [ ] qaStatus is "new"
- [ ] Server logs show "Lead created" or "FALLBACK: Lead created"
- [ ] No error messages in logs
- [ ] Refreshing page still shows the lead
- [ ] Other dispositions (not interested, etc.) still work

---

## Reporting Results

### ✅ Everything Works:
```
"Qualified dispositions from Agent Console now create leads.
Lead appears in QA/Leads within 1-2 seconds.
qaStatus is 'new' as expected.
Fix is working correctly!"
```

### ❌ Something's Wrong:
```
"Submitted qualified disposition but:
- Lead didn't appear after 5 seconds
- Error in logs: [error message]
- Agent name shows as null
- etc.

Steps taken: [what you tested]
Expected: [what should happen]
Actual: [what actually happened]
```

---

## Quick Reference

| Action | Expected Result |
|--------|-----------------|
| Select "Qualified" in Agent Console | ✅ Option available |
| Submit qualified disposition | ✅ No error message |
| Wait 1-2 seconds | ✅ Lead appears in QA |
| Check lead details | ✅ All fields correct |
| Refresh page | ✅ Lead still visible |
| Filter by agent | ✅ Lead still appears |
| Check server logs | ✅ Success message visible |

---

**Summary:** If qualified dispositions from Agent Console now create leads that appear in QA/Leads, the fix is working! 🎉