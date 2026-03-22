-- Add department routing layer to problem intelligence system
-- Enables mapping detected problems to specific departments (IT, Finance, HR, etc.)

-- 1. Add targetDepartments to problem_definitions
-- Specifies which departments typically own this problem
ALTER TABLE "problem_definitions"
ADD COLUMN IF NOT EXISTS "target_departments" text[] DEFAULT '{}';

-- 2. Add targetDepartments to organization_service_catalog
-- Specifies which departments this service targets (budget owners / pain owners)
ALTER TABLE "organization_service_catalog"
ADD COLUMN IF NOT EXISTS "target_departments" text[] DEFAULT '{}';

-- 3. Add departmentIntelligence to campaign_account_problems
-- Stores the per-department intelligence breakdown (problems, solutions, messaging per dept)
ALTER TABLE "campaign_account_problems"
ADD COLUMN IF NOT EXISTS "department_intelligence" jsonb DEFAULT '{}';