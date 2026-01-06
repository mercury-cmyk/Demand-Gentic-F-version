#!/bin/bash

# Deploy to GitHub Codespaces - One-Command Setup
# Usage: ./deploy-to-codespaces.sh

set -e

echo "🚀 Deploying Pivotal B2B CRM to GitHub Codespaces..."
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "🔑 Authenticating with GitHub..."
    gh auth login
fi

# Check if full_database_export.sql exists
if [ ! -f "full_database_export.sql" ]; then
    echo "⚠️  Warning: full_database_export.sql not found!"
    echo "Database won't be auto-imported. You can import it later."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if .devcontainer exists
if [ ! -d ".devcontainer" ]; then
    echo "❌ .devcontainer directory not found!"
    echo "Make sure you have the Codespaces configuration files."
    exit 1
fi

# Get repository name
read -p "Enter repository name (default: pivotal-crm): " REPO_NAME
REPO_NAME=${REPO_NAME:-pivotal-crm}

# Get repository visibility
read -p "Make repository private? (Y/n): " -n 1 -r PRIVATE
echo
if [[ $PRIVATE =~ ^[Nn]$ ]]; then
    VISIBILITY="--public"
else
    VISIBILITY="--private"
fi

# Initialize git if needed
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit - Pivotal B2B CRM with Codespaces configuration"
fi

# Create GitHub repository
echo "📤 Creating GitHub repository: $REPO_NAME..."
if gh repo create "$REPO_NAME" $VISIBILITY --source=. --remote=origin --push; then
    echo "✅ Repository created successfully!"
else
    echo "⚠️  Repository might already exist. Pushing to existing repo..."
    git push -u origin main 2>/dev/null || git push -u origin master 2>/dev/null || echo "Already up to date"
fi

echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. Configure Codespace Secrets (REQUIRED):"
echo "   Go to: https://github.com/$(gh api user -q .login)/$REPO_NAME/settings/secrets/codespaces"
echo ""
echo "   Add these secrets:"
echo "   - JWT_SECRET (run: openssl rand -base64 32)"
echo "   - SESSION_SECRET (run: openssl rand -base64 32)"
echo "   - EMAIL_LIST_VERIFY_API_KEY"
echo "   - BRAVE_SEARCH_API_KEY"
echo ""
echo "2. Create Codespace:"
echo "   Run: gh codespace create --repo $(gh api user -q .login)/$REPO_NAME"
echo "   Or visit: https://github.com/$(gh api user -q .login)/$REPO_NAME"
echo "   Click: Code → Codespaces → Create codespace"
echo ""
echo "3. Wait ~5 minutes for setup to complete"
echo ""
echo "4. Access your CRM at the forwarded port 5000"
echo "   Login: admin@crm.local / admin123"
echo ""
echo "📚 Full guide: See GITHUB_CODESPACES_MIGRATION.md"
echo ""
echo "✅ Deployment preparation complete!"
