-- Add disposition_needs_review to activity_event_type enum
ALTER TYPE activity_event_type ADD VALUE IF NOT EXISTS 'disposition_needs_review';
