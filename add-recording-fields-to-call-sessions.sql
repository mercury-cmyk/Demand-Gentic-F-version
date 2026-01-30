-- Migration: Add recording fields to call_sessions table
-- This enables unified recording storage across all call types (test, campaign, agent)

-- Add recording S3 key (permanent storage location)
ALTER TABLE call_sessions 
ADD COLUMN IF NOT EXISTS recording_s3_key TEXT;

-- Add recording duration in seconds
ALTER TABLE call_sessions 
ADD COLUMN IF NOT EXISTS recording_duration_sec INTEGER;

-- Add recording status enum
-- Values: pending, recording, uploading, stored, failed
DO $$ BEGIN
  CREATE TYPE recording_status_enum AS ENUM ('pending', 'recording', 'uploading', 'stored', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE call_sessions 
ADD COLUMN IF NOT EXISTS recording_status recording_status_enum DEFAULT 'pending';

-- Add recording format (mp3, wav)
ALTER TABLE call_sessions 
ADD COLUMN IF NOT EXISTS recording_format TEXT DEFAULT 'mp3';

-- Add recording file size in bytes
ALTER TABLE call_sessions 
ADD COLUMN IF NOT EXISTS recording_file_size_bytes INTEGER;

-- Add index on recording_status for efficient querying
CREATE INDEX IF NOT EXISTS call_sessions_recording_status_idx 
ON call_sessions(recording_status) 
WHERE recording_status IS NOT NULL;

-- Add composite index for recordings dashboard queries (campaign + date + status)
CREATE INDEX IF NOT EXISTS call_sessions_recordings_dashboard_idx 
ON call_sessions(campaign_id, started_at DESC, recording_status) 
WHERE recording_s3_key IS NOT NULL;

COMMENT ON COLUMN call_sessions.recording_s3_key IS 'S3/GCS key for permanent recording storage';
COMMENT ON COLUMN call_sessions.recording_duration_sec IS 'Duration of the recording in seconds';
COMMENT ON COLUMN call_sessions.recording_status IS 'Status: pending, recording, uploading, stored, failed';
COMMENT ON COLUMN call_sessions.recording_format IS 'Audio format: mp3 or wav';
COMMENT ON COLUMN call_sessions.recording_file_size_bytes IS 'File size of the recording in bytes';
