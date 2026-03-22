# Project Manager CLI Guide

## Overview

The **Project Manager CLI** enables seamless context switching across multiple Google Cloud Platform (GCP) projects. Automatically manages environment variables, project configurations, and developer workflow.

## Quick Start

### List All Projects

```bash
npm run project -- list
```

**Output**:
```
📋 Configured Projects:
  project-1 (current) → us-central1
  project-2          → us-east1
  project-3          → europe-west1
```

### Show Current Project

```bash
npm run project -- current
```

**Output**:
```
🎯 Current Project: project-1
   Region: us-central1
   Organization: acme-corp
   Billing: acme-billing-account
```

### Switch to a Different Project

```bash
npm run project -- switch project-2
```

**Output**:
```
✅ Switched to project-2 (us-east1)
📝 Updated .env with:
   GCP_PROJECT_ID=project-2
   GCP_REGION=us-east1
🔄 Restarting services...
```

### Show Project Details

```bash
npm run project -- show project-1
```

**Output**:
```
📊 Project: project-1
   Project ID: acme-prod-123
   Region: us-central1
   Organization ID: org-456
   Billing Account: acme-billing-account
   Description: Production environment for ACME Corp
   Created: 2024-01-15
```

## Adding a New Project

### Interactive Setup

```bash
npm run project -- add my-new-project
```

The CLI will prompt you for:

```
🆕 Create New Project

✓ Project ID: my-new-project
? Region [us-central1]: (Press Enter to use default or type your choice)
> eu-west1

? Organization ID (optional): 
> org-12345

? Billing Account ID (optional):
> acme-billing

? Description:
> Development environment for Feature XYZ

✅ Project created successfully!
📝 Project saved to .gcp-projects/projects.json
```

**Example with all options**:

```bash
npm run project -- add staging-env
```

```
Project ID: staging-env
Region: us-west1
Organization ID: org-789
Billing Account: staging-billing
Description: Staging environment for release testing
Created: 2024-01-20 14:32:00

✅ Successfully added staging-env to projects
```

## Project Configuration

### File Structure

Projects are stored in `.gcp-projects/projects.json`:

```json
{
  "projects": {
    "project-1": {
      "projectId": "acme-prod-123",
      "region": "us-central1",
      "organizationId": "org-456",
      "billingAccount": "acme-billing-account",
      "description": "Production environment",
      "created": "2024-01-15T10:30:00Z"
    },
    "project-2": {
      "projectId": "acme-staging-456",
      "region": "us-east1",
      "organizationId": "org-456",
      "billingAccount": "staging-billing",
      "description": "Staging for release testing",
      "created": "2024-01-16T14:22:00Z"
    }
  },
  "currentProject": "project-1"
}
```

### Environment Variables

When you switch projects, the `.env` file is automatically updated:

```bash
# Before switching to project-2
GCP_PROJECT_ID=acme-prod-123
GCP_REGION=us-central1

# After: npm run project -- switch project-2
GCP_PROJECT_ID=acme-staging-456
GCP_REGION=us-east1
```

## Practical Workflows

### Scenario 1: Development → Staging → Production

```bash
# Work on feature in development
npm run project -- switch dev-env
npm run dev:local
# Make changes, test locally...

# Push to staging for QA
npm run project -- switch staging-env
npm run build
npm run deploy
# QA tests...

# Release to production
npm run project -- switch prod-env
npm run deploy
```

### Scenario 2: Multi-Tenant Setup

```bash
# Customer A
npm run project -- add customer-a-prod
npm run project -- switch customer-a-prod
npm run deploy

# Customer B
npm run project -- add customer-b-prod
npm run project -- switch customer-b-prod
npm run deploy

# List all customers
npm run project -- list
```

### Scenario 3: Regional Deployments

```bash
# US region
npm run project -- add app-us-east
npm run project -- switch app-us-east
npm run deploy

# EU region  
npm run project -- add app-eu-west
npm run project -- switch app-eu-west
npm run deploy

# APAC region
npm run project -- add app-apac-sg
npm run project -- switch app-apac-sg
npm run deploy
```

## Integration with Dev Workflow

### Pre-Development Checklist

```bash
# List available projects and current selection
npm run project -- list
npm run project -- current

# Switch to development environment
npm run project -- switch dev-env

# Start development server (uses switched project)
npm run dev:local

# Operations Hub will reflect the selected project's resources
# Navigate to http://localhost:5173/ops-hub
```

### CI/CD Integration

```bash
#!/bin/bash
# Deploy to production via CI/CD

# Switch to production project
npm run project -- switch prod-env

# Verify we're in the right project
npm run project -- current

# Build and deploy
npm run build
npm run deploy:production
```

### Docker Compose Integration

```yaml
# docker-compose.yml
version: '3'
services:
  app:
    build: .
    environment:
      - GCP_PROJECT_ID=${GCP_PROJECT_ID}
      - GCP_REGION=${GCP_REGION}
    ports:
      - "8080:8080"
```

```bash
# The .env file is automatically updated by project-manager
# Docker will pick up these environment variables
npm run project -- switch prod-env
docker-compose up
```

## Removing Projects

### Delete Project Configuration

```bash
npm run project -- remove project-1
```

**Output**:
```
⚠️  Are you sure? (y/n)
y

✅ Deleted project-1 from configuration
📍 Current project reset to: project-2
```

### Safety Notes

- Only deletes the configuration, not the actual GCP project
- If you delete the current project, switches to another
- Configuration can be restored from `.gcp-projects/projects.json` git history

## Advanced Usage

### Manual Configuration

You can manually edit `.gcp-projects/projects.json`:

```bash
# Edit projects file directly
nano .gcp-projects/projects.json

# Or with a JSON editor
code .gcp-projects/projects.json
```

### Batch Operations

```bash
# Create multiple projects at once via script
#!/bin/bash
for region in us-central1 us-east1 eu-west1; do
  npm run project -- add "app-$region"  projects_report.txt
```

## Troubleshooting

### Issue: "Project not found"

**Problem**: Trying to switch to a non-existent project

**Solution**:
```bash
# List available projects
npm run project -- list

# Add the project if it doesn't exist
npm run project -- add missing-project
```

### Issue: ".env not updated"

**Problem**: Environment variables still showing old project

**Solution**:
```bash
# Force switch (may need to restart dev server)
npm run project -- switch project-id

# Verify update
cat .env | grep GCP_PROJECT

# Restart development server
npm run dev:local
```

### Issue: Permission denied when accessing project

**Problem**: GCP credentials don't have access to project

**Solution**:
```bash
# Verify GCP authentication
gcloud auth login

# Check current GCP account
gcloud config get-value account

# Set to the correct account
gcloud config set account your-email@example.com

# List accessible projects
gcloud projects list
```

### Issue: "Cannot read projects.json"

**Problem**: Configuration file is corrupted or missing

**Solution**:
```bash
# Recreate projects configuration directory
mkdir -p .gcp-projects

# Start fresh
npm run project -- list

# Re-add your projects
npm run project -- add project-1
```

## Integration with Operations Hub

### Automatic Resource Sync

When you switch projects, the Operations Hub dashboard automatically updates:

```bash
npm run project -- switch prod-env

# Navigate to http://localhost:5173/ops-hub
# Now shows:
# ✓ Builds for prod-env
# ✓ Cloud Run deployments
# ✓ Cost data
# ✓ Domain configurations
# All for the switched project
```

### View Project-Specific Resources

```
Operations Hub Dashboard
├── Builds (prod-env)
├── Deployments (prod-env)  
├── Costs (prod-env)
├── Domains (prod-env)
└── Logs (prod-env)
```

## Command Reference

| Command | Purpose | Example |
|---------|---------|---------|
| `list` | Show all projects | `npm run project -- list` |
| `current` | Show active project | `npm run project -- current` |
| `add ` | Create project (interactive) | `npm run project -- add my-proj` |
| `switch ` | Change to project | `npm run project -- switch my-proj` |
| `show ` | Display project details | `npm run project -- show my-proj` |
| `remove ` | Delete project config | `npm run project -- remove my-proj` |

## npm script Configuration

The project manager is integrated via npm scripts:

```json
{
  "scripts": {
    "project": "tsx scripts/project-manager.ts"
  }
}
```

This allows the convenient syntax:
```bash
npm run project -- [command] [args]
```

## Best Practices

### 1. Naming Convention

Use descriptive project names:

```bash
npm run project -- add dev-env          # ✓ Clear purpose
npm run project -- add project-1        # ✗ Too vague

npm run project -- add us-east-prod     # ✓ Region + env
npm run project -- add acme-staging     # ✓ Client + env
```

### 2. Documentation

Add descriptions to projects:

```bash
npm run project -- add datacenter-v2
```

```
Description: Replacement datacenter for legacy migration (JIRA-4521)
```

Later, you can reference this via:
```bash
npm run project -- show datacenter-v2
```

### 3. Backup Configuration

Commit `.gcp-projects/projects.json` to version control:

```bash
git add .gcp-projects/projects.json
git commit -m "Add GCP project configurations"
```

Team members can:
```bash
git pull
npm run project -- list  # See all available projects
npm run project -- switch prod-env  # Start working
```

### 4. Secure Sensitive Data

Never commit actual service account keys. Instead:

```bash
# Store in Google Secret Manager
gcloud secrets create gcp-key --data-file=service-account.json

# Retrieve in CI/CD
gcloud secrets versions access latest --secret="gcp-key"
```

## Integration Examples

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        
      - name: Switch to Production
        run: npm run project -- switch prod-env
        
      - name: Deploy
        run: npm run deploy:production
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Warn if .env has uncommitted changes
if git diff --cached .env | grep -q "GCP_PROJECT_ID"; then
  echo "⚠️  Detected GCP_PROJECT_ID change. Verify correct project selected:"
  npm run project -- current
  read -p "Continue? (y/n) " confirm
  [[ "$confirm" != "y" ]] && exit 1
fi
```

### Docker Build Arg

```dockerfile
# Dockerfile
ARG GCP_PROJECT_ID
ARG GCP_REGION

FROM node:20
ENV GCP_PROJECT_ID=$GCP_PROJECT_ID
ENV GCP_REGION=$GCP_REGION
```

```bash
# Build with current project settings
source .env
docker build \
  --build-arg GCP_PROJECT_ID=$GCP_PROJECT_ID \
  --build-arg GCP_REGION=$GCP_REGION \
  -t app:latest .
```

## Performance & Optimization

### Caching Project List

For CLI tools that use project info frequently:

```typescript
import { getOrchestrator } from './services/multi-provider-agent';
import { getProjectManager } from './services/project-manager';

// Cache project config in memory
const projectManager = getProjectManager();
const projects = await projectManager.loadProjects();  // Reads once
const current = projects.currentProject;             // Access from memory
```

### Parallel Project Operations

```bash
# Deploy to multiple projects in parallel
for project in dev-env staging-env prod-env; do
  npm run project -- switch "$project" && npm run deploy &
done
wait  # Wait for all to complete
```

---

**Related Documentation**:
- [Multi-Provider Agent Guide](./MULTI_PROVIDER_AGENT_GUIDE.md) - Use LLM agents in your projects
- [Cloud Workstations Setup](./CLOUD_WORKSTATIONS_SETUP.md) - Containerized dev environment
- [Operations Hub Guide](./OPS_INFRASTRUCTURE_SETUP.md) - Infrastructure management dashboard