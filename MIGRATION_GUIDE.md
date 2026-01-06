# Migration Guide - Moving from Replit to Your Own Infrastructure

This guide will help you migrate your Pivotal B2B CRM from Replit to your own infrastructure.

## 📦 What's Included

### Database Files
1. **`migrations/0000_loud_whistler.sql`** - Drizzle migration file (2,174 lines)
   - Complete schema with all 117 tables
   - All ENUMs, indexes, and foreign keys
   - Use this for version-controlled migrations

2. **`schema_export.sql`** (241 KB) - PostgreSQL schema only
   - Complete database structure
   - No data, just tables/indexes/constraints
   - Use for fresh database setup

3. **`data_export.sql`** (69 MB) - Data only
   - All your existing data as INSERT statements
   - No schema definitions
   - Use to populate after schema creation

4. **`full_database_export.sql`** (51 MB) - Complete backup
   - Schema + Data in one file
   - Ready for immediate restore
   - Best for quick migration

## 🚀 Quick Start Migration

### Option 1: Full Database Restore (Fastest)

```bash
# Create a new PostgreSQL database
createdb pivotal_crm

# Restore everything at once
psql pivotal_crm < full_database_export.sql
```

### Option 2: Schema First, Then Data

```bash
# Create database
createdb pivotal_crm

# Import schema
psql pivotal_crm < schema_export.sql

# Import data
psql pivotal_crm < data_export.sql
```

### Option 3: Using Drizzle Migrations (Recommended for Production)

```bash
# 1. Copy the migrations folder to your new project
cp -r migrations /path/to/your/project/

# 2. Update your drizzle.config.ts to point to your new database
# 3. Run migrations
npm run db:push
```

## 🐳 Docker Deployment

### Using Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: pivotal_crm
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./full_database_export.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      DATABASE_URL: postgresql://postgres:your_secure_password@postgres:5432/pivotal_crm
      NODE_ENV: production
      JWT_SECRET: your_jwt_secret_here
      EMAIL_LIST_VERIFY_API_KEY: your_api_key
      BRAVE_SEARCH_API_KEY: your_api_key
    depends_on:
      - postgres

volumes:
  postgres_data:
```

Start with:
```bash
docker-compose up -d
```

## 🔧 Environment Variables Required

Create a `.env` file with:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/pivotal_crm

# Authentication
JWT_SECRET=your_secret_key_here
SESSION_SECRET=your_session_secret_here

# API Keys
EMAIL_LIST_VERIFY_API_KEY=your_elv_api_key
BRAVE_SEARCH_API_KEY=your_brave_api_key

# Telnyx (if using telephony)
TELNYX_API_KEY=your_telnyx_key
TELNYX_SIP_CONNECTION_ID=your_connection_id

# Optional: Email Service Providers
SENDGRID_API_KEY=your_sendgrid_key
AWS_SES_ACCESS_KEY=your_aws_key
MAILGUN_API_KEY=your_mailgun_key

# Node
NODE_ENV=production
PORT=5000
```

## 📋 Pre-Migration Checklist

- [ ] Backup all Replit secrets (API keys)
- [ ] Download all migration files
- [ ] Set up new PostgreSQL database (v14+)
- [ ] Configure environment variables
- [ ] Test database connection
- [ ] Verify all 117 tables imported correctly

## 🔍 Verify Migration

After importing, verify your data:

```sql
-- Check table count (should be 117)
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check critical tables
SELECT 
  'accounts' as table_name, COUNT(*) as rows FROM accounts
UNION ALL
SELECT 'contacts', COUNT(*) FROM contacts
UNION ALL
SELECT 'campaigns', COUNT(*) FROM campaigns
UNION ALL
SELECT 'verification_contacts', COUNT(*) FROM verification_contacts;

-- Verify ENUM types (should be 48)
SELECT COUNT(*) FROM pg_type 
WHERE typtype = 'e';
```

## 🏗️ Infrastructure Recommendations

### Minimum Requirements
- **Database**: PostgreSQL 14+ with 4GB RAM
- **App Server**: Node.js 20+, 2GB RAM, 2 CPU cores
- **Storage**: 10GB minimum (grows with call recordings)

### Recommended Setup
- **Database**: Managed PostgreSQL (AWS RDS, Neon, DigitalOcean)
- **App**: Container orchestration (K8s, ECS, or simple Docker Compose)
- **File Storage**: S3-compatible storage for call recordings
- **Redis**: For BullMQ job queue (call campaigns)

## 🔄 Post-Migration Steps

1. **Update Database Connection**
   ```typescript
   // drizzle.config.ts
   export default {
     schema: './shared/schema.ts',
     out: './migrations',
     dialect: 'postgresql',
     dbCredentials: {
       url: process.env.DATABASE_URL!
     }
   }
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build Application**
   ```bash
   npm run build
   ```

4. **Start Application**
   ```bash
   npm run dev  # Development
   npm start    # Production
   ```

5. **Verify Functionality**
   - [ ] Login works
   - [ ] Dashboard loads
   - [ ] Campaigns display correctly
   - [ ] Verification console accessible
   - [ ] Agent console functional (if using telephony)

## 🚨 Known Issues & Solutions

### Issue: Migration fails with "cannot cast automatically"
**Solution**: Use `--force` flag or manually convert data types:
```sql
ALTER TABLE accounts ALTER COLUMN annual_revenue TYPE numeric(20,2) USING annual_revenue::numeric(20,2);
```

### Issue: Foreign key constraints fail
**Solution**: Import in correct order (schema → data) or use full_database_export.sql

### Issue: Missing extensions
**Solution**: Enable required PostgreSQL extensions:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
```

## 📞 Support

If you encounter issues:
1. Check PostgreSQL logs: `tail -f /var/log/postgresql/postgresql.log`
2. Verify environment variables are set
3. Ensure PostgreSQL version is 14+
4. Check that all required Node.js dependencies are installed

## 🎯 Quick Deployment Platforms

### Railway
```bash
railway login
railway init
railway add
# Upload database using Railway's PostgreSQL plugin
railway up
```

### Render
1. Create PostgreSQL database
2. Import using `psql` command
3. Create Web Service
4. Set environment variables
5. Deploy

### AWS
- RDS for PostgreSQL
- ECS or EC2 for application
- S3 for file storage
- ElastiCache for Redis (BullMQ)

---

**Migration Time Estimate**: 30-60 minutes depending on infrastructure setup

**Database Size**: ~70MB (your current data)
**Tables**: 117
**ENUMs**: 48
**Indexes**: Preserved in migration files
