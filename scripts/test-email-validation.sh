#!/bin/bash

# Email Validation Testing Script
# Prerequisites: You must be logged in as an admin user

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Base URL (change if needed)
BASE_URL="http://localhost:5000"

# JWT token (you'll need to get this from your browser's localStorage or login)
# To get your token: Open browser dev tools -> Console -> localStorage.getItem('token')
TOKEN="${AUTH_TOKEN:-YOUR_JWT_TOKEN_HERE}"

if [ "$TOKEN" = "YOUR_JWT_TOKEN_HERE" ]; then
  echo -e "${RED}Error: Please set AUTH_TOKEN environment variable${NC}"
  echo "Example: export AUTH_TOKEN='your-jwt-token'"
  echo "Or get it from browser localStorage.getItem('token')"
  exit 1
fi

echo -e "${BLUE}=== Email Validation Testing Script ===${NC}\n"

# Check system status
echo -e "${GREEN}1. Checking validation system status...${NC}"
curl -X GET "${BASE_URL}/api/test/email-validation/status" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  | jq '.'

echo -e "\n${GREEN}2. Testing valid corporate email...${NC}"
curl -X POST "${BASE_URL}/api/test/email-validation/single" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@microsoft.com",
    "skipCache": false
  }' | jq '.'

echo -e "\n${GREEN}3. Testing invalid email (syntax error)...${NC}"
curl -X POST "${BASE_URL}/api/test/email-validation/single" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "not-an-email",
    "skipCache": false
  }' | jq '.'

echo -e "\n${GREEN}4. Testing disposable email...${NC}"
curl -X POST "${BASE_URL}/api/test/email-validation/single" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "temp@mailinator.com",
    "skipCache": false
  }' | jq '.'

echo -e "\n${GREEN}5. Testing role account (risky)...${NC}"
curl -X POST "${BASE_URL}/api/test/email-validation/single" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@gmail.com",
    "skipCache": false
  }' | jq '.'

echo -e "\n${GREEN}6. Testing batch validation (mixed emails)...${NC}"
curl -X POST "${BASE_URL}/api/test/email-validation/batch" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [
      "valid@salesforce.com",
      "invalid@nonexistent-domain-xyz.com",
      "info@company.com",
      "test@guerrillamail.com"
    ],
    "skipCache": false
  }' | jq '.'

echo -e "\n${BLUE}=== Testing Complete ===${NC}"
echo -e "Review the results above to verify validation accuracy"
