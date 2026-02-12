-- Migration: Add concurrent call limit columns to agent_defaults
-- Date: 2026-02-12

ALTER TABLE agent_defaults
  ADD COLUMN IF NOT EXISTS default_max_concurrent_calls INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS global_max_concurrent_calls INTEGER NOT NULL DEFAULT 100;
