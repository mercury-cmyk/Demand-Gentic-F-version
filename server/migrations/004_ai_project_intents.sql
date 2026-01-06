-- Migration: 004_ai_project_intents.sql
-- Description: Add AI-powered project creation tables
--              - ai_project_intents (stores natural language extraction results)
--              - ai_intent_feedback (stores user corrections for learning loop)
-- Date: 2025-11-10

-- Create AI Intent Status Enum (Idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_intent_status') THEN
    CREATE TYPE ai_intent_status AS ENUM ('processing', 'needs_review', 'approved', 'rejected', 'created');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_confidence_level') THEN
    CREATE TYPE ai_confidence_level AS ENUM ('high', 'medium', 'low');
  END IF;
END $$;

-- AI Project Intents Table
-- Stores natural language extraction results for project creation
CREATE TABLE IF NOT EXISTS ai_project_intents (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status ai_intent_status DEFAULT 'processing' NOT NULL,
  
  -- Input
  original_prompt TEXT NOT NULL,
  redacted_prompt TEXT,
  input_method VARCHAR(32) DEFAULT 'text', -- 'text', 'voice', 'file'
  
  -- AI Extraction Results
  extracted_data JSONB NOT NULL,
  confidence_score VARCHAR(10),
  confidence_level ai_confidence_level,
  model_used VARCHAR(64),
  processing_time INTEGER, -- milliseconds
  
  -- Validation
  validation_errors JSONB DEFAULT '[]',
  validation_warnings JSONB DEFAULT '[]',
  
  -- Human Review
  reviewed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  approval_notes TEXT,
  rejection_reason TEXT,
  
  -- Project Creation
  project_id VARCHAR(36), -- Reference to created project (no FK as projects table may not exist)
  created_campaign_ids TEXT[], -- Array of campaign IDs created from this intent
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for ai_project_intents
CREATE INDEX IF NOT EXISTS ai_project_intents_user_idx ON ai_project_intents(user_id);
CREATE INDEX IF NOT EXISTS ai_project_intents_status_idx ON ai_project_intents(status);
CREATE INDEX IF NOT EXISTS ai_project_intents_created_at_idx ON ai_project_intents(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_project_intents_confidence_idx ON ai_project_intents(confidence_level);

-- AI Intent Feedback Table
-- Stores user corrections and feedback for continuous learning
CREATE TABLE IF NOT EXISTS ai_intent_feedback (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id VARCHAR(36) NOT NULL REFERENCES ai_project_intents(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Feedback Data
  corrected_data JSONB, -- User's corrections to extracted data
  feedback_type VARCHAR(32) NOT NULL, -- 'correction', 'approval', 'rejection', 'suggestion'
  feedback_notes TEXT,
  
  -- Outcome Tracking
  was_helpful BOOLEAN,
  final_outcome VARCHAR(32), -- 'project_created', 'rejected', 'abandoned'
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for ai_intent_feedback
CREATE INDEX IF NOT EXISTS ai_intent_feedback_intent_idx ON ai_intent_feedback(intent_id);
CREATE INDEX IF NOT EXISTS ai_intent_feedback_user_idx ON ai_intent_feedback(user_id);
CREATE INDEX IF NOT EXISTS ai_intent_feedback_created_at_idx ON ai_intent_feedback(created_at DESC);
