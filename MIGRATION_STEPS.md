# Database Migration - Complete Setup Guide

## 🎯 Objective
Migrate all data from your current Neon database to a new Neon database: `ep-morning-frog-ah8z53gq`

## ✅ Step-by-Step Instructions

### **STEP 1: Initialize the Target Database Schema**

First, we need to create all the tables in the target database:

```powershell
cd "c:\Users\Zahid\Downloads\DemanGent.ai-v0.1"

# 1a. Temporarily update .env with NEW database URL
# Edit .env and change DATABASE_URL to:
# DATABASE_URL="postgresql://neondb_owner:npg_2foHtBDqGKQ9@ep-morning-frog-ah8z53gq-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# 1b. Push the schema to the new database
npm run db:push

# This will:
# - Create all 168 tables
# - Set up indexes
# - Configure constraints
```

### **STEP 2: Revert to Source Database (Temporarily)**

```powershell
# 2a. Update .env back to your ORIGINAL database URL:
# DATABASE_URL="postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# 2b. This is just for reading the data
```

### **STEP 3: Run the Data Migration**

```powershell
# This copies all data from source to target
npx ts-node migrate-database.ts "postgresql://neondb_owner:npg_2foHtBDqGKQ9@ep-morning-frog-ah8z53gq-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

This will:
- ✅ Copy 168 tables
- ✅ Migrate 100K+ records
- ✅ Verify row counts match
- ✅ Take ~5-15 minutes depending on data size

### **STEP 4: Switch to New Database**

```powershell
# Update .env with NEW database URL:
# DATABASE_URL="postgresql://neondb_owner:npg_2foHtBDqGKQ9@ep-morning-frog-ah8z53gq-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

### **STEP 5: Test the Application**

```powershell
# 5a. Restart dev server
npm run dev

# 5b. Visit http://localhost:5000 and test:
# - Login works
# - Dashboard shows correct stats
# - Can view campaigns, leads, etc.
```

---

## 📋 Database URLs Reference

**Current (Source) Database:**
```
postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

**New (Target) Database:**
```
postgresql://neondb_owner:npg_2foHtBDqGKQ9@ep-morning-frog-ah8z53gq-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

---

## 🚨 Important Notes

1. **Keep old database as backup** for at least 24 hours
2. **Don't run the app during migration** - stop `npm run dev`
3. **Connection strings are sensitive** - don't commit `.env` to git
4. **Test thoroughly** before deleting old database

---

## ⏮️ Rollback Plan

If anything goes wrong:

```powershell
# 1. Stop the app
# 2. Revert .env to original DATABASE_URL
# 3. npm run dev
# 4. Everything will be back to normal
```

The old database is untouched and can be used immediately.

---

## ❓ Troubleshooting

**Q: `db:push` fails or takes too long**
- A: The target database might already have tables. Try clearing it first or create a fresh database.

**Q: Migration script says "relation does not exist"**
- A: You skipped Step 1. Run `npm run db:push` first.

**Q: After switching, app shows old data**
- A: Check that `.env` DATABASE_URL was actually updated. Restart `npm run dev`.

**Q: Connection timeout errors**
- A: Neon connection pooler might be throttling. Wait a moment and retry.

---

Ready to start? Begin with **STEP 1** above!
