# 🚀 Quick Deploy to GitHub Codespaces

## One-Command Setup

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial commit"
gh repo create pivotal-crm --private --source=. --remote=origin --push

# 2. Open Codespace
# Go to GitHub repo → Code → Codespaces → Create codespace
```

That's it! Your CRM will be running in 5 minutes.

## What You Get

✅ **Full Development Environment**
- PostgreSQL 16 with your data (8,942 accounts imported)
- Redis for job queues
- Node.js 20 with all dependencies
- VS Code with extensions

✅ **Automatic Setup**
- Database imported from `full_database_export.sql`
- All 117 tables created
- Application starts on port 5000

✅ **Built-in Tools**
- PgAdmin (database GUI)
- Hot reload
- TypeScript support

## Required Secrets

Add in GitHub → Settings → Codespaces → Secrets:

```bash
JWT_SECRET=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)
EMAIL_LIST_VERIFY_API_KEY=your_key
BRAVE_SEARCH_API_KEY=your_key
```

## Login

Once started, visit the forwarded port 5000:
- **Email**: `admin@crm.local`
- **Password**: `admin123`

## Full Guide

See [GITHUB_CODESPACES_MIGRATION.md](./GITHUB_CODESPACES_MIGRATION.md) for complete instructions.
