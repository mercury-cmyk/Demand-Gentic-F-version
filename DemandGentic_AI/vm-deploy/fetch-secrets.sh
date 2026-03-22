#!/bin/bash
# ============================================================
# Fetch secrets from Google Secret Manager and write .env file
# Uses the Compute Engine metadata server for authentication.
# ============================================================

set -euo pipefail

ENV_FILE="vm-deploy/.env"
PROJECT="demandgentic"

echo "Fetching OAuth token from metadata server..."
TOKEN=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
    -H "Metadata-Flavor: Google" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

fetch_secret() {
    local name="$1"
    local val
    val=$(curl -sf "https://secretmanager.googleapis.com/v1/projects/$PROJECT/secrets/$name/versions/latest:access" \
        -H "Authorization: Bearer $TOKEN" 2>/dev/null | \
        python3 -c "import sys,json,base64; d=json.load(sys.stdin); print(base64.b64decode(d['payload']['data']).decode().strip())" 2>/dev/null) || true
    echo "$val"
}

echo "Fetching secrets..."

cat > "$ENV_FILE" > "$ENV_FILE"
echo "# Secrets (from Google Secret Manager)" >> "$ENV_FILE"

for secret in "${SECRETS[@]}"; do
    val=$(fetch_secret "$secret")
    if [ -n "$val" ] && [ "$val" != "null" ]; then
        echo "$secret=$val" >> "$ENV_FILE"
        echo "  + $secret"
    else
        echo "  - $secret (not found, skipping)"
    fi
done

if ! grep -q '^OPS_AGENT_TOKEN=' "$ENV_FILE"; then
    if command -v openssl >/dev/null 2>&1; then
        GENERATED_TOKEN=$(openssl rand -hex 24)
    else
        GENERATED_TOKEN=$(python3 - > "$ENV_FILE"
    echo "  + OPS_AGENT_TOKEN (generated locally)"
fi

chmod 600 "$ENV_FILE"
echo ""
echo "Wrote $ENV_FILE ($(wc -l < "$ENV_FILE") lines)"