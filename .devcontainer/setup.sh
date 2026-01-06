#!/bin/bash

echo "🚀 Setting up Pivotal B2B CRM in GitHub Codespaces..."

# Navigate to workspace
cd /workspace

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
until pg_isready -h localhost -p 5432 -U postgres; do
  sleep 1
done

echo "✅ PostgreSQL is ready!"

# Check if database is already initialized
if psql -h localhost -U postgres -d pivotal_crm -c "SELECT 1 FROM users LIMIT 1;" &> /dev/null; then
  echo "✅ Database already initialized with data"
else
  echo "📊 Database is empty, importing data..."
  
  # Check if full_database_export.sql exists
  if [ -f "/workspace/full_database_export.sql" ]; then
    echo "Importing from full_database_export.sql..."
    PGPASSWORD=postgres psql -h localhost -U postgres -d pivotal_crm -f /workspace/full_database_export.sql
    echo "✅ Database imported successfully!"
  else
    echo "⚠️  No database export found. You'll need to import manually or use migrations."
    echo "Run: psql -h localhost -U postgres -d pivotal_crm -f full_database_export.sql"
  fi
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
  echo "📝 Creating .env file from example..."
  cp .env.example .env
  
  echo ""
  echo "⚠️  IMPORTANT: Update your .env file with:"
  echo "  1. JWT_SECRET (generate with: openssl rand -base64 32)"
  echo "  2. SESSION_SECRET (generate with: openssl rand -base64 32)"
  echo "  3. EMAIL_LIST_VERIFY_API_KEY"
  echo "  4. BRAVE_SEARCH_API_KEY"
  echo ""
  echo "You can add these as Codespace secrets for persistence."
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "  1. Update .env with your API keys"
echo "  2. The app will start automatically at http://localhost:5000"
echo "  3. Login with: admin@crm.local / admin123"
echo ""
echo "📚 Database connection: postgresql://postgres:postgres@localhost:5432/pivotal_crm"
echo "🔧 PgAdmin (optional): docker-compose --profile tools up -d pgadmin"
echo ""
