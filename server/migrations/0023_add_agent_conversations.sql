-- Migration 023: Add Agent Conversations and Execution Plans
-- Supports the interactive AgentX chat interface and plan-execute workflow

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE agent_plan_status AS ENUM (
    'pending',
    'approved',
    'executing',
    'completed',
    'rejected',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- TABLE: Agent Conversations
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_conversations (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User associations
    user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
    client_user_id VARCHAR,
    
    -- Session management
    session_id VARCHAR NOT NULL,
    title TEXT,
    
    -- Conversation state
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    context JSONB,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Timestamps
    last_message_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for agent_conversations
CREATE INDEX IF NOT EXISTS agent_conversations_user_idx ON agent_conversations(user_id);
CREATE INDEX IF NOT EXISTS agent_conversations_client_user_idx ON agent_conversations(client_user_id);
CREATE INDEX IF NOT EXISTS agent_conversations_session_idx ON agent_conversations(session_id);
CREATE INDEX IF NOT EXISTS agent_conversations_active_idx ON agent_conversations(is_active);
CREATE INDEX IF NOT EXISTS agent_conversations_last_message_idx ON agent_conversations(last_message_at);


-- ============================================================================
-- TABLE: Agent Execution Plans
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_execution_plans (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Associations
    conversation_id VARCHAR REFERENCES agent_conversations(id) ON DELETE CASCADE,
    user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
    client_user_id VARCHAR,
    
    -- Request
    request_message TEXT NOT NULL,
    
    -- Plan details
    planned_steps JSONB NOT NULL,
    
    -- Risk assessment
    risk_level TEXT NOT NULL DEFAULT 'low',
    affected_entities JSONB,
    
    -- Execution state
    status agent_plan_status NOT NULL DEFAULT 'pending',
    executed_steps JSONB DEFAULT '[]'::jsonb,
    
    -- User modifications
    user_modifications JSONB,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for agent_execution_plans
CREATE INDEX IF NOT EXISTS agent_execution_plans_conversation_idx ON agent_execution_plans(conversation_id);
CREATE INDEX IF NOT EXISTS agent_execution_plans_user_idx ON agent_execution_plans(user_id);
CREATE INDEX IF NOT EXISTS agent_execution_plans_status_idx ON agent_execution_plans(status);
