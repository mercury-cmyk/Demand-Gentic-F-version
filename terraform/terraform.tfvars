# Example Terraform variables file
# Copy this to terraform.tfvars and fill in your values

gcp_project_id   = "your-gcp-project-id"
gcp_region       = "us-central1"
machine_type     = "e2-standard-4"

# Restrict SSH to your IP (e.g., "203.0.113.50/32")
ssh_source_cidr  = "0.0.0.0/0"

# Required credentials
github_token     = "ghp_your_github_token_here"
gemini_api_key   = "AIzaSy_your_gemini_key_here"

# Database connection (set up Cloud SQL first or use external DB)
database_url     = "postgresql://demandgentic:password@cloudsql-instance:5432/demandgentic"

# Redis connection (set up Cloud Redis first or use external Redis)
redis_url        = "redis://redis-instance:6379"

# TURN server credentials (generate strong random values)
turn_username    = "turnuser"
turn_password    = "generate_strong_random_password_here"
db_password      = "generate_strong_db_password_here"

# Optional: Database user for Cloud SQL
db_user          = "demandgentic"

# Optional: Create Cloud SQL and Redis instances
create_database  = true
create_redis     = true
