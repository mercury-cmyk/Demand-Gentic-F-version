# Production Database Cleanup Script

## ⚠️ WARNING

This script **permanently deletes** all business data from your production database. This action **cannot be undone**.

## What Gets Deleted

- ✅ All Accounts
- ✅ All Contacts
- ✅ All Campaigns
- ✅ All Leads
- ✅ All Lists/Segments
- ✅ All Call History
- ✅ All Queue Items
- ✅ All Suppressions
- ✅ All DV Projects
- ✅ All Email Verification Jobs
- ✅ All Content Assets
- ✅ All Activity Logs

## What Gets Preserved

- ✅ **Users** (all user accounts and authentication)
- ✅ **Email Templates**
- ✅ **SIP Trunks**

## How to Use

### Step 1: Run the Cleanup Script

In your Replit shell, run:

```bash
npx tsx scripts/clear-production-data.ts
```

### Step 2: Confirm the Action

The script will:
1. Show you current record counts
2. Ask for confirmation
3. Type exactly: `DELETE PRODUCTION DATA`
4. Press Enter

### Step 3: Wait for Completion

The script will:
- Clear all business data in a transaction (safe)
- Show you the final counts
- Verify users are preserved

### Step 4: Deploy to Production

After cleanup is complete:

1. Click the **"Publish"** button (top right)
2. Select **Autoscale** deployment (recommended)
3. Confirm and publish

Your application will deploy with:
- Clean production database (no old data)
- Current code version
- All users intact (can still log in)

## Safety Features

✅ **Transaction-based**: If anything fails, nothing is deleted  
✅ **User preservation**: Users table is never touched  
✅ **Confirmation required**: Must type exact phrase to proceed  
✅ **Pre/post validation**: Shows counts before and after  

## Alternative: Manual Cleanup via Drizzle Studio

If you prefer a visual interface:

1. Open Database pane → Production database
2. Click "My data" → Select "Edit" mode
3. Manually delete rows from each table
4. ⚠️ **Important**: Delete in this order to avoid foreign key errors:
   - campaign_suppressions
   - campaign_queue, agent_queue
   - calls, call_attempts
   - leads
   - list_members
   - contacts
   - accounts
   - campaigns
   - lists, segments
   - (etc.)

## Troubleshooting

**Error: "DATABASE_URL not found"**
- Make sure you're running this in your Replit shell
- The script automatically uses your production database

**Error: "Foreign key constraint violation"**
- This shouldn't happen (CASCADE handles it)
- If it does, the transaction will rollback (safe)

**Users still can't log in after cleanup**
- This shouldn't happen - users are preserved
- Check: `SELECT COUNT(*) FROM users;` in database

## After Cleanup

Your production database is now:
- Clean (no business data)
- With all users preserved
- Ready for your published app
- Using the latest schema from your code

Users can log in with existing credentials immediately after you publish.
