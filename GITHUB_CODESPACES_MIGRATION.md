# GitHub Codespaces Migration Guide

Complete guide to deploy Pivotal B2B CRM to GitHub Codespaces.

## 🚀 Quick Start (5 minutes)

### 1. Prepare Your Repository

```bash
# Initialize git repository (if not already done)
git init
git add .
git commit -m "Initial commit - Pivotal B2B CRM"

# Create GitHub repository and push
gh repo create pivotal-crm --private --source=. --remote=origin --push
```

### 2. Add Required Files to GitHub

Make sure these files are in your repository:
- ✅ `.devcontainer/` folder (already created)
- ✅ `full_database_export.sql` (your database backup)
- ✅ `.env.example` (template for environment variables)
- ✅ All application code

```bash
# Verify critical files are present
ls -la .devcontainer/
ls -lh full_database_export.sql
ls -la .env.example

# Commit everything
git add .
git commit -m "Add Codespaces configuration and database export"
git push
```

### 3. Configure Codespace Secrets

Go to your GitHub repository → Settings → Secrets and variables → Codespaces

Add these secrets:

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `JWT_SECRET` | JWT authentication secret | Run: `openssl rand -base64 32` |
| `SESSION_SECRET` | Session secret | Run: `openssl rand -base64 32` |
| `EMAIL_LIST_VERIFY_API_KEY` | Email validation API key | From EmailListVerify.com |
| `BRAVE_SEARCH_API_KEY` | Web search API key | From Brave Search API |
| `OPENAI_API_KEY` | OpenAI API key (optional) | From OpenAI dashboard |
| `TELNYX_API_KEY` | Telephony API key (optional) | From Telnyx dashboard |

### 4. Launch Codespace

1. Go to your GitHub repository
2. Click the green **Code** button
3. Select **Codespaces** tab
4. Click **Create codespace on main**

**That's it!** Codespaces will:
- ✅ Build the development container
- ✅ Install PostgreSQL and Redis
- ✅ Import your database automatically
- ✅ Install all dependencies
- ✅ Start the application on port 5000

## 🎯 What Happens Automatically

The devcontainer setup includes:

### Services Started
- **PostgreSQL 16** on port 5432
  - Database: `pivotal_crm`
  - User: `postgres`
  - Password: `postgres`
  - Auto-imports `full_database_export.sql`

- **Redis 7** on port 6379
  - For BullMQ job queue

- **Node.js 20** development environment
  - All npm dependencies installed
  - TypeScript configured

### VS Code Extensions Installed
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Docker
- PostgreSQL client
- TypeScript

### Application
- Automatically starts on `http://localhost:5000`
- Port forwarding configured
- Hot reload enabled

## 🔧 Manual Setup (if needed)

### Update Environment Variables

```bash
# Create .env from template
cp .env.example .env

# Edit with your values
code .env
```

Add your secrets:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pivotal_crm
REDIS_URL=redis://localhost:6379
NODE_ENV=development

JWT_SECRET=your-secret-here
SESSION_SECRET=your-secret-here
EMAIL_LIST_VERIFY_API_KEY=your-key-here
BRAVE_SEARCH_API_KEY=your-key-here
```

### Import Database Manually (if auto-import failed)

```bash
# Check if database is empty
psql -h localhost -U postgres -d pivotal_crm -c "SELECT COUNT(*) FROM users;"

# If empty, import
PGPASSWORD=postgres psql -h localhost -U postgres -d pivotal_crm -f full_database_export.sql
```

### Start Application Manually

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Application runs at http://localhost:5000
```

## 📊 Verify Setup

### Check Database
```bash
# Connect to PostgreSQL
psql -h localhost -U postgres -d pivotal_crm

# Verify tables (should be 117)
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';

# Check data
SELECT COUNT(*) FROM accounts;
SELECT COUNT(*) FROM contacts;
SELECT COUNT(*) FROM verification_contacts;

# Exit
\q
```

### Check Application
```bash
# Test API
curl http://localhost:5000/api/health

# Check logs
npm run dev
```

### Access Application
1. Codespaces will show a notification about forwarded port 5000
2. Click "Open in Browser"
3. Login with: `admin@crm.local` / `admin123`

## 🔐 Using Codespace Secrets

Codespace secrets are automatically injected as environment variables.

### Set Secrets via GitHub UI
1. Repository → Settings → Codespaces → Secrets
2. Click "New repository secret"
3. Add each secret from the table above

### Set Secrets via GitHub CLI
```bash
# Set a secret
gh secret set JWT_SECRET -b "$(openssl rand -base64 32)" --env codespaces

gh secret set EMAIL_LIST_VERIFY_API_KEY -b "your-api-key" --env codespaces

# List secrets
gh secret list --env codespaces
```

### Access Secrets in Code
Secrets are available as environment variables:
```typescript
const jwtSecret = process.env.JWT_SECRET;
const elvApiKey = process.env.EMAIL_LIST_VERIFY_API_KEY;
```

## 🛠️ Development Workflow

### Start/Stop Services

```bash
# View running services
docker ps

# Restart PostgreSQL
docker-compose restart db

# Start PgAdmin (database GUI)
docker-compose --profile tools up -d pgadmin
# Access at http://localhost:5050
# Login: admin@crm.local / admin
```

### Database Operations

```bash
# Create backup
pg_dump -h localhost -U postgres pivotal_crm > backup_$(date +%Y%m%d).sql

# Run migrations
npm run db:push

# Force migration
npm run db:push -- --force

# Open Drizzle Studio
npx drizzle-kit studio
```

### Logs and Debugging

```bash
# Application logs
npm run dev

# PostgreSQL logs
docker-compose logs db

# Redis logs
docker-compose logs redis

# All service logs
docker-compose logs -f
```

## 🚨 Troubleshooting

### Database Connection Failed
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check connection
pg_isready -h localhost -p 5432 -U postgres

# Restart database
docker-compose restart db
```

### Port Already in Use
```bash
# Check what's using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>

# Or use a different port
PORT=3000 npm run dev
```

### Database Not Imported
```bash
# Check if file exists
ls -lh full_database_export.sql

# Import manually
PGPASSWORD=postgres psql -h localhost -U postgres -d pivotal_crm -f full_database_export.sql

# Verify
psql -h localhost -U postgres -d pivotal_crm -c "SELECT COUNT(*) FROM users;"
```

### Missing Environment Variables
```bash
# Check loaded variables
env | grep -E "JWT_SECRET|EMAIL_LIST"

# Rebuild container to load new secrets
# Command Palette (Ctrl+Shift+P) → "Codespaces: Rebuild Container"
```

## 📁 File Structure

```
pivotal-crm/
├── .devcontainer/
│   ├── devcontainer.json       # Codespaces configuration
│   ├── docker-compose.yml      # Services (PostgreSQL, Redis)
│   ├── Dockerfile              # Development container
│   └── setup.sh                # Auto-setup script
├── migrations/                 # Database migrations
│   └── 0000_loud_whistler.sql
├── full_database_export.sql    # Complete database backup
├── schema_export.sql           # Schema only
├── data_export.sql             # Data only
├── .env.example                # Environment template
├── docker-compose.yml          # Production Docker setup
├── Dockerfile                  # Production container
└── GITHUB_CODESPACES_MIGRATION.md  # This file
```

## 🎓 Tips & Best Practices

### 1. Use Codespace Secrets for API Keys
Don't commit API keys to `.env` file. Use GitHub Codespace secrets instead.

### 2. Prebuilds for Faster Startup
Enable prebuilds in repository settings to start Codespaces faster.

### 3. Machine Type
- **2-core, 8GB RAM**: Good for development
- **4-core, 16GB RAM**: Better for large datasets
- **8-core, 32GB RAM**: Best for heavy workloads

### 4. Stop Codespace When Not Using
Codespaces consume compute credits. Stop when done:
- Click Codespace name → Stop codespace

### 5. Persistent Storage
Data in volumes (`postgres-data`, `redis-data`) persists across rebuilds.
Application code changes are persisted in workspace.

### 6. Database Backups
Create regular backups:
```bash
# Weekly backup
pg_dump -h localhost -U postgres pivotal_crm > backup_$(date +%Y%m%d).sql

# Commit to repo (if small)
git add backup_*.sql
git commit -m "Database backup"
git push
```

## 🔄 Updating Production

When ready to deploy to production:

```bash
# Export latest database
pg_dump -h localhost -U postgres pivotal_crm > full_database_export.sql

# Commit changes
git add .
git commit -m "Update database and code"
git push

# Deploy to production platform
# (Railway, Render, AWS, etc.)
```

## 📞 Support Resources

- **Codespaces Docs**: https://docs.github.com/codespaces
- **Docker Compose**: https://docs.docker.com/compose/
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Drizzle ORM**: https://orm.drizzle.team/

## ⚡ Quick Commands Reference

```bash
# Start application
npm run dev

# Database access
psql -h localhost -U postgres -d pivotal_crm

# Create database backup
pg_dump -h localhost -U postgres pivotal_crm > backup.sql

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Rebuild container (after secret changes)
# Ctrl+Shift+P → "Codespaces: Rebuild Container"

# Stop all services
docker-compose down

# Start all services
docker-compose up -d
```

---

## 🎉 Success Checklist

- [ ] Repository pushed to GitHub
- [ ] Codespace secrets configured
- [ ] Codespace created and running
- [ ] Database imported (8,942 accounts)
- [ ] Application accessible at port 5000
- [ ] Login successful (admin@crm.local)
- [ ] Dashboard loads correctly
- [ ] All 117 database tables present

**Estimated setup time: 5-10 minutes**

Enjoy your Pivotal B2B CRM in GitHub Codespaces! 🚀
