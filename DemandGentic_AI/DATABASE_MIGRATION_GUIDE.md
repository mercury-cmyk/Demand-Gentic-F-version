# Database Migration Guide - Neon to Neon

## Step 1: Create a New Database in Neon

1. Go to https://console.neon.tech
2. Select your project
3. Click **"New Database"** in the Databases section
4. Name it (e.g., `neondb_v2` or `neondb_prod`)
5. Copy the **Connection String** from the new database

**Example connection string format:**
```
postgresql://neondb_owner:PASSWORD@new-host.neon.tech/new-database?sslmode=require
```

## Step 2: Get Your Current Database URL

Your current database URL is in `.env`:
```
DATABASE_URL="postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

## Step 3: Run the Migration Script

```powershell
# Navigate to project root
cd "c:\Users\Zahid\Downloads\DemanGent.ai-v0.1"

# Run the migration (replace with your new database URL)
npx ts-node migrate-database.ts "postgresql://neondb_owner:PASSWORD@new-host.neon.tech/new-database?sslmode=require&channel_binding=require"
```

The script will:
- ✅ Connect to your current database
- ✅ Copy all tables and data
- ✅ Copy all records (in batches of 100)
- ✅ Verify data counts match
- ✅ Show you a summary

## Step 4: Update Your Application

Once migration completes:

### Option A: Test First (Recommended)
1. Update `.env` with new DATABASE_URL
2. Restart the dev server: `npm run dev`
3. Test thoroughly
4. Keep old database as backup for 24 hours

### Option B: Keep Both for Failover
1. Create a new env variable `DATABASE_URL_NEW`
2. Update your application to support switching between them
3. Switch when ready

## Step 5: Verify Success

After updating `.env`, check:

```bash
# 1. Dev server should connect without errors
npm run dev

# 2. Visit the app
http://localhost:5000

# 3. Test key features:
# - Login with existing account
# - View campaigns and leads
# - Check dashboard stats
```

## Troubleshooting

**Connection refused:**
- Check that new database URL is correct
- Verify firewall/IP whitelist settings in Neon console

**Data not copied:**
- Check your source DATABASE_URL is valid
- Try running script again with verbose logging

**Foreign key constraints error:**
- Script automatically handles this by disabling/re-enabling constraints

## Rollback Plan

If something goes wrong:
1. Keep the old database running
2. Revert `.env` to original DATABASE_URL
3. Restart app
4. Investigate issue before retrying

---

**Need help?** Check the migration script output for detailed error messages.