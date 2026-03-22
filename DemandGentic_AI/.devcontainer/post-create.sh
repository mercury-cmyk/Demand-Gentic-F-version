#!/bin/bash
# Post-create hook for Cloud Workstations / Dev Containers
# Runs after the container is created but before the first command

set -e

echo "🚀 [DemandGentic AI] Post-Create Setup"
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Install dependencies
echo -e "${BLUE}[1/6] Installing npm dependencies...${NC}"
npm install --legacy-peer-deps
echo -e "${GREEN}✓ Dependencies installed${NC}"

# 2. Set up environment
echo -e "${BLUE}[2/6] Setting up environment variables...${NC}"
if [ ! -f .env ]; then
  echo -e "${YELLOW}⚓ Copying .env.example to .env${NC}"
  cp .env.example .env
  echo -e "${YELLOW}⚠️  Please update .env with your GCP credentials and API keys${NC}"
else
  echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# 3. Verify Node version
echo -e "${BLUE}[3/6] Verifying Node.js version...${NC}"
NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION}${NC}"

# 4. Verify TypeScript
echo -e "${BLUE}[4/6] Setting up TypeScript...${NC}"
npx tsc --version
echo -e "${GREEN}✓ TypeScript ready${NC}"

# 5. Initialize database (if needed)
echo -e "${BLUE}[5/6] Checking database...${NC}"
if command -v psql &> /dev/null; then
  echo -e "${GREEN}✓ PostgreSQL client available${NC}"
  # Drizzle DB schema will be pushed on first npm run dev:local
  echo -e "${YELLOW}ℹ️  Database schema will be initialized on first dev server start${NC}"
else
  echo -e "${YELLOW}⚠️  PostgreSQL client not found (will be available when services start)${NC}"
fi

# 6. Check GCP setup
echo -e "${BLUE}[6/6] Checking GCP integration...${NC}"
if command -v gcloud &> /dev/null; then
  GCLOUD_VERSION=$(gcloud --version | head -n 1)
  echo -e "${GREEN}✓ ${GCLOUD_VERSION}${NC}"
  echo -e "${YELLOW}ℹ️  Run 'gcloud auth login' to authenticate${NC}"
else
  echo -e "${YELLOW}⚠️  gcloud CLI not found (installing...)${NC}"
fi

echo ""
echo -e "${GREEN}====== Setup Complete! ======${NC}"
echo ""
echo "📋 Next Steps:"
echo "  1. Review and update .env file with your GCP and API credentials"
echo "  2. Run 'npm run dev:local' to start the development server"
echo "  3. Access the app at http://localhost:8080"
echo ""
echo "🔗 Useful Commands:"
echo "  npm run dev:local          # Start dev server"
echo "  npm run dev                # Start with ngrok tunnel"
echo "  npm run build              # Build for production"
echo "  npm run check              # TypeScript type check"
echo "  npm run project -- add  # Add a GCP project"
echo ""
echo "📚 Resources:"
echo "  • Operations Hub: http://localhost:5173/ops-hub (when frontend is running)"
echo "  • API Docs: Check server/routes.ts for available endpoints"
echo "  • Cloud Workstations: Use 'gcloud workstations' commands"
echo ""