-- Add new campaign types to the campaign_type enum
-- This aligns the database with the unified campaign types in client/src/lib/campaign-types.ts

-- Add new enum values (PostgreSQL requires ALTER TYPE for adding values to enums)
DO $$
BEGIN
    -- Event-based campaigns (if not exists)
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'webinar_invite' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')) THEN
        ALTER TYPE campaign_type ADD VALUE 'webinar_invite';
    END IF;

    -- Sales qualification campaigns
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'bant_qualification' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')) THEN
        ALTER TYPE campaign_type ADD VALUE 'bant_qualification';
    END IF;

    -- Appointment setting campaigns
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'appointment_setting' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')) THEN
        ALTER TYPE campaign_type ADD VALUE 'appointment_setting';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'demo_request' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')) THEN
        ALTER TYPE campaign_type ADD VALUE 'demo_request';
    END IF;

    -- Follow-up campaigns
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'follow_up' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')) THEN
        ALTER TYPE campaign_type ADD VALUE 'follow_up';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'nurture' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')) THEN
        ALTER TYPE campaign_type ADD VALUE 'nurture';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 're_engagement' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')) THEN
        ALTER TYPE campaign_type ADD VALUE 're_engagement';
    END IF;
END$$;

-- Note: 'appointment_generation' already exists as a legacy value
-- New code should use 'appointment_setting' but both are accepted

COMMENT ON TYPE campaign_type IS 'Unified campaign types - see client/src/lib/campaign-types.ts for definitions';