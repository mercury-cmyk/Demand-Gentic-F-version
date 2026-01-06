# Fix Replit Deployment - Annual Revenue Error

## The Problem

Your **production database** on Replit still has the old `annual_revenue` column type, which causes deployment to fail with:

```
ALTER TABLE "accounts" ALTER COLUMN "annual_revenue" SET DATA TYPE numeric(20, 2);
column "annual_revenue" cannot be cast automatically to type numeric
```

## Quick Fix (2 Options)

### Option 1: Force Migration (Recommended)

Run this command in your Replit deployment environment:

```bash
# This forces the migration to complete
npm run db:push -- --force
```

This will:
- ✅ Convert `annual_revenue` to `numeric(20,2)`
- ✅ Preserve all existing data
- ✅ Complete the deployment

### Option 2: Manual SQL Fix

If Option 1 doesn't work, run this SQL against your **production database**:

```sql
ALTER TABLE accounts 
ALTER COLUMN annual_revenue TYPE numeric(20, 2) 
USING CASE 
  WHEN annual_revenue IS NULL THEN NULL
  ELSE annual_revenue::numeric(20, 2)
END;
```

## How to Apply the Fix on Replit

### Required environment variable

The server now reads the production Neon connection string from a
`REPLIT_PRODUCTION_DATABASE_URL` secret whenever
`REPLIT_DEPLOYMENT=1`. This avoids hard-coding credentials in the
repository and lets you rotate the value safely.

1. In your Replit project, open the **Secrets** panel.
2. Add a new secret named `REPLIT_PRODUCTION_DATABASE_URL` with the
   exact connection string for your production database.
3. Ensure `REPLIT_DEPLOYMENT` is set to `1` in the deployment
   environment (Replit does this automatically for production).
4. Redeploy — the app will log which Neon endpoint is being used without
   printing the full credentials.

> **Tip:** If the secret is missing, the deployment will fail fast with a
> clear error. Double-check the spelling if you see that message.

### Method 1: Using Replit Database Pane

1. Open your Replit project
2. Click on **Database** tool (in left sidebar)
3. Switch to **Production** database
4. Click **Query** tab
5. Paste the SQL from `fix-production-db.sql`
6. Click **Run**
7. Verify it shows: `numeric | 20 | 2`
8. Try deploying again

### Method 2: Using Drizzle Push

1. In your Replit deployment:
   ```bash
   # Connect to production database
   export DATABASE_URL="your_production_database_url"
   
   # Force migration
   npm run db:push -- --force
   ```

2. Redeploy your app

## Verify the Fix

After applying, check that it worked:

```sql
SELECT column_name, data_type, numeric_precision, numeric_scale 
FROM information_schema.columns 
WHERE table_name = 'accounts' AND column_name = 'annual_revenue';
```

Should return:
```
column_name     | data_type | numeric_precision | numeric_scale
annual_revenue  | numeric   | 20                | 2
```

## Why This Happened

- Your **development** database was fixed with `npm run db:push --force`
- Your **production** database on Replit uses a separate database instance
- Production database still has the old column type
- Deployment tries to migrate production but fails on automatic type casting

## Prevent Future Issues

Going forward, when you deploy:

1. Always test migrations locally first
2. Use `npm run db:push --force` for schema changes
3. Production and development databases are separate - each needs migrations applied

---

**After applying the fix, your Replit deployment should succeed!**
