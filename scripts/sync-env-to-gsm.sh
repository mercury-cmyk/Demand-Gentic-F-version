#!/bin/bash
# sync-env-to-gsm.sh
# Syncs all .env variables to Google Secret Manager
# Usage: ./scripts/sync-env-to-gsm.sh [PROJECT_ID] [ENV_FILE]

set -e

PROJECT_ID="${1:-demandgentic-ai}"
ENV_FILE="${2:-.env}"
DRY_RUN="${DRY_RUN:-false}"

echo "============================================="
echo "  Sync .env to Google Secret Manager"
echo "============================================="
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "ERROR: gcloud CLI not found. Install from https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check authentication
ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
if [ -z "$ACCOUNT" ]; then
    echo "ERROR: Not authenticated. Run 'gcloud auth login' first."
    exit 1
fi
echo "Authenticated as: $ACCOUNT"

# Set project
gcloud config set project "$PROJECT_ID" 2>/dev/null
echo "Project: $PROJECT_ID"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found"
    exit 1
fi

# Get existing secrets
echo "Fetching existing secrets..."
EXISTING_SECRETS=$(gcloud secrets list --format="value(name)" 2>/dev/null || echo "")

CREATED=0
UPDATED=0
FAILED=0
TOTAL=0

# Read .env file and create secrets
while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    
    # Match KEY=VALUE pattern
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        KEY="${BASH_REMATCH[1]}"
        VALUE="${BASH_REMATCH[2]}"
        
        # Remove surrounding quotes
        VALUE="${VALUE%\"}"
        VALUE="${VALUE#\"}"
        VALUE="${VALUE%\'}"
        VALUE="${VALUE#\'}"
        
        # Skip empty values and placeholders
        [[ -z "$VALUE" || "$VALUE" == "sk-REPLACE_ME" ]] && continue
        
        TOTAL=$((TOTAL + 1))
        
        if [ "$DRY_RUN" = "true" ]; then
            echo "  Would sync: $KEY"
            continue
        fi
        
        # Check if secret exists
        if echo "$EXISTING_SECRETS" | grep -q "^${KEY}$"; then
            echo "Updating: $KEY"
            if echo -n "$VALUE" | gcloud secrets versions add "$KEY" --data-file=- 2>/dev/null; then
                echo "  ✓ Updated"
                UPDATED=$((UPDATED + 1))
            else
                echo "  ✗ Failed to update"
                FAILED=$((FAILED + 1))
            fi
        else
            echo "Creating: $KEY"
            if echo -n "$VALUE" | gcloud secrets create "$KEY" --data-file=- --replication-policy="automatic" 2>/dev/null; then
                echo "  ✓ Created"
                CREATED=$((CREATED + 1))
            else
                echo "  ✗ Failed to create"
                FAILED=$((FAILED + 1))
            fi
        fi
    fi
done < "$ENV_FILE"

echo ""
echo "============================================="
echo "  Summary"
echo "============================================="
echo "  Total:   $TOTAL"
echo "  Created: $CREATED"
echo "  Updated: $UPDATED"
echo "  Failed:  $FAILED"
echo ""

# Generate IAM binding command
echo "To grant Cloud Run access to these secrets, run:"
echo ""
echo "  gcloud projects add-iam-policy-binding $PROJECT_ID \\"
echo "    --member='serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com' \\"
echo "    --role='roles/secretmanager.secretAccessor'"
echo ""
