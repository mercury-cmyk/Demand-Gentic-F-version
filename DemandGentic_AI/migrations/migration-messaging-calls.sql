-- Team Messaging and Calls Schema
-- Migration for chat channels, messages, voice calls, and recordings

-- Chat Channels table
CREATE TABLE IF NOT EXISTS chat_channels (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  team_id varchar(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('general', 'private', 'direct')) DEFAULT 'general',
  is_archived boolean NOT NULL DEFAULT false,
  created_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_channels_team ON chat_channels(team_id);
CREATE INDEX idx_chat_channels_type ON chat_channels(type);

-- Chat Messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel_id varchar(36) NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  thread_parent_id varchar(36) REFERENCES chat_messages(id) ON DELETE CASCADE,
  reactions jsonb,
  edited_at timestamp,
  deleted_at timestamp,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id);
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);

-- Channel Members table  
CREATE TABLE IF NOT EXISTS channel_members (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel_id varchar(36) NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'guest')) DEFAULT 'member',
  joined_at timestamp NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX idx_channel_members_user ON channel_members(user_id);

-- Message Read Receipts table
CREATE TABLE IF NOT EXISTS message_read_receipts (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id varchar(36) NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamp NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_read_receipts_message ON message_read_receipts(message_id);
CREATE INDEX idx_read_receipts_user ON message_read_receipts(user_id);

-- Voice Calls table
CREATE TABLE IF NOT EXISTS voice_calls (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  team_id varchar(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  channel_id varchar(36) REFERENCES chat_channels(id) ON DELETE SET NULL,
  initiated_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_type text NOT NULL CHECK (call_type IN ('voice', 'video')) DEFAULT 'voice',
  status text NOT NULL CHECK (status IN ('ringing', 'active', 'ended', 'missed')) DEFAULT 'ringing',
  started_at timestamp,
  ended_at timestamp,
  duration_seconds integer,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_calls_team ON voice_calls(team_id);
CREATE INDEX idx_voice_calls_channel ON voice_calls(channel_id);
CREATE INDEX idx_voice_calls_status ON voice_calls(status);
CREATE INDEX idx_voice_calls_created ON voice_calls(created_at);

-- Call Participants table
CREATE TABLE IF NOT EXISTS call_participants (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  call_id varchar(36) NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('invited', 'joined', 'left', 'declined')) DEFAULT 'invited',
  is_muted boolean NOT NULL DEFAULT false,
  is_camera_off boolean NOT NULL DEFAULT false,
  joined_at timestamp,
  left_at timestamp,
  duration_seconds integer,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_participants_call ON call_participants(call_id);
CREATE INDEX idx_call_participants_user ON call_participants(user_id);

-- Call Recordings table
CREATE TABLE IF NOT EXISTS call_recordings (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  call_id varchar(36) NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
  recording_url text NOT NULL,
  recording_duration integer,
  file_size bigint,
  format text NOT NULL DEFAULT 'mp3',
  transcript_id varchar(36),
  is_public boolean NOT NULL DEFAULT false,
  download_count integer DEFAULT 0,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_recordings_call ON call_recordings(call_id);

-- Call Transcripts table
CREATE TABLE IF NOT EXISTS call_transcripts (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  call_id varchar(36) NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
  transcript_text text NOT NULL,
  summary text,
  key_points text[],
  sentiment text,
  duration_seconds integer,
  word_count integer,
  language text DEFAULT 'en',
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_transcripts_call ON call_transcripts(call_id);

-- File Uploads table  
CREATE TABLE IF NOT EXISTS file_uploads (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  uploaded_by_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  file_url text NOT NULL,
  download_count integer DEFAULT 0,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_file_uploads_uploader ON file_uploads(uploaded_by_id);
CREATE INDEX idx_file_uploads_type ON file_uploads(file_type);

-- Add messages reference to file uploads (for message attachments)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_attachment_ids varchar(36)[];