-- Queue Management System Migration
-- Safe, additive migration for zero-downtime deployment
-- Feature flag: queue_replace_v1

-- ============================================================================
-- STEP 1: Add new fields to agent_queue table (safe ALTER TABLE ADD COLUMN)
-- ============================================================================

-- Add new columns if they don't exist (IF NOT EXISTS supported in PostgreSQL 9.6+)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'agent_queue' AND column_name = 'queued_at') THEN
        ALTER TABLE agent_queue ADD COLUMN queued_at timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'agent_queue' AND column_name = 'released_at') THEN
        ALTER TABLE agent_queue ADD COLUMN released_at timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'agent_queue' AND column_name = 'created_by') THEN
        ALTER TABLE agent_queue ADD COLUMN created_by varchar;
        ALTER TABLE agent_queue ADD CONSTRAINT agent_queue_created_by_fkey 
            FOREIGN KEY (created_by) REFERENCES users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'agent_queue' AND column_name = 'released_by') THEN
        ALTER TABLE agent_queue ADD COLUMN released_by varchar;
        ALTER TABLE agent_queue ADD CONSTRAINT agent_queue_released_by_fkey 
            FOREIGN KEY (released_by) REFERENCES users(id);
    END IF;
END $$;

-- Add 'released' to queue_state enum if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'released' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'manual_queue_state')
    ) THEN
        ALTER TYPE manual_queue_state ADD VALUE 'released';
    END IF;
END $$;

-- Enable pg_trgm extension for first_name filtering (safe IF NOT EXISTS)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- STEP 2: Create PostgreSQL Functions (idempotent, transactional)
-- ============================================================================

-- Function: Clear MY queue (queued/locked only) for a campaign
CREATE OR REPLACE FUNCTION clear_my_queue(
  p_campaign_id varchar,
  p_agent_id varchar,
  p_actor_user_id varchar
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE v_released int;
BEGIN
  WITH upd AS (
    UPDATE agent_queue
       SET queue_state = 'released',
           released_at = now(),
           released_by = p_actor_user_id,
           updated_at = now()
     WHERE campaign_id = p_campaign_id
       AND agent_id    = p_agent_id
       AND queue_state IN ('queued','locked')
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_released FROM upd;

  -- Audit log
  INSERT INTO activity_log (entity_type, entity_id, event_type, payload, created_by, created_at)
  VALUES (
    'campaign',
    p_campaign_id,
    'queue_cleared',
    jsonb_build_object(
      'action', 'queue.clear.mine',
      'agent_id', p_agent_id,
      'released', v_released
    ),
    p_actor_user_id,
    now()
  );

  RETURN v_released;
END$$;

-- Function: Clear ALL queues (admin only) for a campaign
CREATE OR REPLACE FUNCTION clear_all_queues(
  p_campaign_id varchar,
  p_actor_user_id varchar
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE v_released int;
BEGIN
  WITH upd AS (
    UPDATE agent_queue
       SET queue_state = 'released',
           released_at = now(),
           released_by = p_actor_user_id,
           updated_at = now()
     WHERE campaign_id = p_campaign_id
       AND queue_state IN ('queued','locked')
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_released FROM upd;

  -- Audit log
  INSERT INTO activity_log (entity_type, entity_id, event_type, payload, created_by, created_at)
  VALUES (
    'campaign',
    p_campaign_id,
    'queue_cleared',
    jsonb_build_object(
      'action', 'queue.clear.all',
      'released', v_released
    ),
    p_actor_user_id,
    now()
  );

  RETURN v_released;
END$$;

-- Function: Replace queue (primary). Default: keep in_progress.
CREATE OR REPLACE FUNCTION queue_replace(
  p_campaign_id varchar,
  p_agent_id varchar,
  p_actor_user_id varchar,
  p_first_name_contains text DEFAULT NULL,
  p_per_account_cap int DEFAULT NULL,
  p_max_queue_size int DEFAULT NULL,
  p_keep_in_progress boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE 
  v_released int := 0; 
  v_assigned int := 0; 
  v_skipped int := 0;
BEGIN
  -- 1) Release my queued/locked (optionally also in_progress)
  WITH upd AS (
    UPDATE agent_queue
       SET queue_state = 'released',
           released_at = now(),
           released_by = p_actor_user_id,
           updated_at = now()
     WHERE campaign_id = p_campaign_id
       AND agent_id    = p_agent_id
       AND (
         queue_state IN ('queued','locked')
         OR (queue_state = 'in_progress' AND NOT p_keep_in_progress)
       )
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_released FROM upd;

  -- 2) Get campaign_contacts that are in this campaign
  -- Build candidate pool respecting DNC/validity + filters
  WITH campaign_contact_ids AS (
    SELECT contact_id
    FROM campaign_queue
    WHERE campaign_id = p_campaign_id
  ),
  filtered AS (
    SELECT c.id AS contact_id, c.account_id
      FROM contacts c
     WHERE c.id IN (SELECT contact_id FROM campaign_contact_ids)
       AND (c.is_valid IS TRUE OR c.is_valid IS NULL)
       AND (c.is_opted_out IS FALSE OR c.is_opted_out IS NULL)
       -- Exclude global DNC
       AND NOT EXISTS (
         SELECT 1 FROM global_dnc g 
         WHERE g.contact_id = c.id
       )
       -- Apply first_name filter if provided
       AND (
         p_first_name_contains IS NULL
         OR c.first_name ILIKE '%' || p_first_name_contains || '%'
       )
  ),
  ranked AS (
    SELECT contact_id, account_id,
           ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY contact_id) AS rn
      FROM filtered
  ),
  capped AS (
    SELECT contact_id, account_id
      FROM ranked
     WHERE p_per_account_cap IS NULL OR rn <= p_per_account_cap
  ),
  available AS (
    SELECT cap.contact_id, cap.account_id
      FROM capped cap
     -- Exclude contacts already in active queue states for THIS campaign
     WHERE NOT EXISTS (
       SELECT 1 FROM agent_queue aq
       WHERE aq.contact_id  = cap.contact_id
         AND aq.campaign_id = p_campaign_id
         AND aq.queue_state IN ('queued','locked','in_progress')
     )
     LIMIT COALESCE(p_max_queue_size, 2147483647)
  ),
  ins AS (
    INSERT INTO agent_queue (
      campaign_id, agent_id, contact_id, account_id, 
      queue_state, queued_at, created_by, created_at, updated_at
    )
    SELECT 
      p_campaign_id, 
      p_agent_id, 
      a.contact_id, 
      a.account_id,
      'queued', 
      now(), 
      p_actor_user_id,
      now(),
      now()
    FROM available a
    ON CONFLICT (agent_id, campaign_id, contact_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_assigned FROM ins;

  -- 3) Count skipped due to collision (for reporting)
  WITH candidates AS (
    SELECT c.id AS contact_id
      FROM contacts c
     WHERE c.id IN (SELECT contact_id FROM campaign_contact_ids)
       AND (c.is_valid IS TRUE OR c.is_valid IS NULL)
       AND (c.is_opted_out IS FALSE OR c.is_opted_out IS NULL)
       AND NOT EXISTS (SELECT 1 FROM global_dnc g WHERE g.contact_id = c.id)
       AND (p_first_name_contains IS NULL OR c.first_name ILIKE '%'||p_first_name_contains||'%')
  )
  SELECT COUNT(*)
    INTO v_skipped
    FROM candidates c
   WHERE EXISTS (
     SELECT 1 FROM agent_queue aq
     WHERE aq.contact_id = c.contact_id
       AND aq.campaign_id = p_campaign_id
       AND aq.queue_state IN ('queued','locked','in_progress')
   );

  -- 4) Audit log
  INSERT INTO activity_log (entity_type, entity_id, event_type, payload, created_by, created_at)
  VALUES (
    'campaign',
    p_campaign_id,
    'queue_replaced',
    jsonb_build_object(
      'action', 'queue.replace',
      'agent_id', p_agent_id,
      'first_name_contains', p_first_name_contains,
      'per_account_cap', p_per_account_cap,
      'max_queue_size', p_max_queue_size,
      'keep_in_progress', p_keep_in_progress,
      'released', v_released,
      'assigned', v_assigned,
      'skipped_due_to_collision', v_skipped
    ),
    p_actor_user_id,
    now()
  );

  RETURN jsonb_build_object(
    'released', v_released,
    'assigned', v_assigned,
    'skipped_due_to_collision', v_skipped
  );
END$$;

-- ============================================================================
-- STEP 3: Create index for first_name filtering (performance optimization)
-- ============================================================================

-- GIN index for trigram search on first_name (safe IF NOT EXISTS)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'ix_contacts_first_name_trgm'
    ) THEN
        CREATE INDEX ix_contacts_first_name_trgm 
        ON contacts USING gin (first_name gin_trgm_ops);
    END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Deploy backend + frontend with FEATURE_FLAGS=queue_replace_v1 disabled
-- 2. Run QA tests in staging
-- 3. Enable feature flag for internal users
-- 4. Progressive rollout to all users
-- 5. Monitor metrics & logs
