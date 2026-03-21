-- Team Messaging, Calls, and Activity tables
-- Supports: team-messaging-routes, team-calls-routes, team-activity-routes

-- ── Chat / Messaging ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "chat_channels" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" varchar NOT NULL REFERENCES "iam_teams"("id") ON DELETE CASCADE,
  "organization_id" varchar REFERENCES "campaign_organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "channelType" text NOT NULL DEFAULT 'general',
  "created_by_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_archived" boolean NOT NULL DEFAULT false,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "chat_channels_team_idx" ON "chat_channels"("team_id");
CREATE INDEX IF NOT EXISTS "chat_channels_type_idx" ON "chat_channels"("channelType");
CREATE INDEX IF NOT EXISTS "chat_channels_created_at_idx" ON "chat_channels"("created_at");

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_id" varchar NOT NULL REFERENCES "chat_channels"("id") ON DELETE CASCADE,
  "sender_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "messageType" text NOT NULL DEFAULT 'text',
  "parent_message_id" varchar REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "attachment_ids" varchar[],
  "reactions" jsonb,
  "edited_at" timestamp,
  "edited_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "is_pinned" boolean NOT NULL DEFAULT false,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "chat_messages_channel_idx" ON "chat_messages"("channel_id");
CREATE INDEX IF NOT EXISTS "chat_messages_sender_idx" ON "chat_messages"("sender_id");
CREATE INDEX IF NOT EXISTS "chat_messages_created_at_idx" ON "chat_messages"("created_at");
CREATE INDEX IF NOT EXISTS "chat_messages_parent_idx" ON "chat_messages"("parent_message_id");

CREATE TABLE IF NOT EXISTS "channel_members" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_id" varchar NOT NULL REFERENCES "chat_channels"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "last_read_at" timestamp,
  "is_muted" boolean NOT NULL DEFAULT false,
  "joined_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "unique_channel_member" UNIQUE("channel_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "channel_members_channel_user_idx" ON "channel_members"("channel_id", "user_id");
CREATE INDEX IF NOT EXISTS "channel_members_user_idx" ON "channel_members"("user_id");

CREATE TABLE IF NOT EXISTS "message_read_receipts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" varchar NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "read_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "unique_message_read" UNIQUE("message_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "message_read_receipts_message_user_idx" ON "message_read_receipts"("message_id", "user_id");

-- ── File Uploads (message attachments) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "file_uploads" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "uploaded_by_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "file_name" text NOT NULL,
  "file_type" text NOT NULL,
  "file_size" bigint NOT NULL,
  "mime_type" text NOT NULL,
  "file_url" text NOT NULL,
  "download_count" integer DEFAULT 0,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "file_uploads_uploader_idx" ON "file_uploads"("uploaded_by_id");
CREATE INDEX IF NOT EXISTS "file_uploads_type_idx" ON "file_uploads"("file_type");
CREATE INDEX IF NOT EXISTS "file_uploads_created_at_idx" ON "file_uploads"("created_at");

-- ── Voice Calls & Recordings ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "call_transcripts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "call_id" varchar NOT NULL,
  "transcript_text" text,
  "transcript_json" jsonb,
  "summary" text,
  "key_points" text[],
  "sentiment" text,
  "is_public" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "call_transcripts_call_idx" ON "call_transcripts"("call_id");

CREATE TABLE IF NOT EXISTS "call_recordings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "call_id" varchar NOT NULL,
  "recording_url" text NOT NULL,
  "recording_duration" integer,
  "file_size" bigint,
  "format" text NOT NULL DEFAULT 'mp3',
  "transcript_id" varchar REFERENCES "call_transcripts"("id") ON DELETE SET NULL,
  "is_public" boolean NOT NULL DEFAULT false,
  "download_count" integer DEFAULT 0,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "call_recordings_call_idx" ON "call_recordings"("call_id");
CREATE INDEX IF NOT EXISTS "call_recordings_created_at_idx" ON "call_recordings"("created_at");

CREATE TABLE IF NOT EXISTS "voice_calls" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" varchar NOT NULL REFERENCES "iam_teams"("id") ON DELETE CASCADE,
  "initiator_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_ids" varchar[] NOT NULL,
  "channel_id" varchar REFERENCES "chat_channels"("id") ON DELETE SET NULL,
  "callType" text NOT NULL DEFAULT 'voice',
  "status" text NOT NULL DEFAULT 'ringing',
  "call_duration" integer,
  "start_time" timestamp,
  "end_time" timestamp,
  "recording_id" varchar REFERENCES "call_recordings"("id") ON DELETE SET NULL,
  "meeting_url" text,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "voice_calls_team_idx" ON "voice_calls"("team_id");
CREATE INDEX IF NOT EXISTS "voice_calls_initiator_idx" ON "voice_calls"("initiator_id");
CREATE INDEX IF NOT EXISTS "voice_calls_status_idx" ON "voice_calls"("status");
CREATE INDEX IF NOT EXISTS "voice_calls_created_at_idx" ON "voice_calls"("created_at");

-- Now add the FK from call_transcripts and call_recordings back to voice_calls
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_call_id_fk"
  FOREIGN KEY ("call_id") REFERENCES "voice_calls"("id") ON DELETE CASCADE
  NOT VALID;

ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_call_id_fk"
  FOREIGN KEY ("call_id") REFERENCES "voice_calls"("id") ON DELETE CASCADE
  NOT VALID;

CREATE TABLE IF NOT EXISTS "call_participants" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "call_id" varchar NOT NULL REFERENCES "voice_calls"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "join_time" timestamp,
  "leave_time" timestamp,
  "participation_duration" integer,
  "status" text NOT NULL DEFAULT 'invited',
  "device_type" text,
  "media_enabled" jsonb,
  "metadata" jsonb,
  CONSTRAINT "unique_call_participant" UNIQUE("call_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "call_participants_call_idx" ON "call_participants"("call_id");
CREATE INDEX IF NOT EXISTS "call_participants_user_idx" ON "call_participants"("user_id");

-- ── Team Activity ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "session_token" text NOT NULL UNIQUE,
  "device_info" jsonb,
  "ip_address" text,
  "last_active" timestamp NOT NULL DEFAULT now(),
  "started_at" timestamp NOT NULL DEFAULT now(),
  "ended_at" timestamp,
  "is_active" boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS "user_sessions_user_idx" ON "user_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "user_sessions_active_idx" ON "user_sessions"("is_active");

CREATE TABLE IF NOT EXISTS "user_status" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'offline',
  "status_message" text,
  "last_seen" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "user_status_user_idx" ON "user_status"("user_id");
CREATE INDEX IF NOT EXISTS "user_status_status_idx" ON "user_status"("status");

CREATE TABLE IF NOT EXISTS "team_member_activity" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "team_id" varchar REFERENCES "iam_teams"("id") ON DELETE CASCADE,
  "activity_type" text NOT NULL,
  "entity_type" text,
  "entity_id" varchar,
  "description" text,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "team_member_activity_user_idx" ON "team_member_activity"("user_id");
CREATE INDEX IF NOT EXISTS "team_member_activity_team_idx" ON "team_member_activity"("team_id");
CREATE INDEX IF NOT EXISTS "team_member_activity_created_at_idx" ON "team_member_activity"("created_at");