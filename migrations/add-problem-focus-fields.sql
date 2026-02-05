-- Add focus/priority fields to problem_definitions table
-- Allows organizations to mark certain problems as "focus" problems
-- Focus problems get boosted confidence and appear first in results

-- Add isFocusProblem field
ALTER TABLE problem_definitions
ADD COLUMN IF NOT EXISTS is_focus_problem BOOLEAN NOT NULL DEFAULT false;

-- Add focusWeight field (0-100, higher = more priority)
ALTER TABLE problem_definitions
ADD COLUMN IF NOT EXISTS focus_weight INTEGER NOT NULL DEFAULT 50;

-- Add index for efficient querying of focus problems
CREATE INDEX IF NOT EXISTS problem_definitions_focus_idx
ON problem_definitions(is_focus_problem)
WHERE is_focus_problem = true;

-- Add composite index for org + focus queries
CREATE INDEX IF NOT EXISTS problem_definitions_org_focus_idx
ON problem_definitions(organization_id, is_focus_problem, focus_weight DESC)
WHERE is_active = true;
