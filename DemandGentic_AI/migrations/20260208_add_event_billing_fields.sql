-- Add paymentDueDayOfMonth to client_billing_config for fixed-day-of-month due dates
ALTER TABLE client_billing_config
  ADD COLUMN IF NOT EXISTS payment_due_day_of_month INTEGER;

-- Add new event registration campaign type enum values
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'event_registration_digital_ungated'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')) THEN
        ALTER TYPE campaign_type ADD VALUE 'event_registration_digital_ungated';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'event_registration_digital_gated'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')) THEN
        ALTER TYPE campaign_type ADD VALUE 'event_registration_digital_gated';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'in_person_event'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')) THEN
        ALTER TYPE campaign_type ADD VALUE 'in_person_event';
    END IF;
END$$;