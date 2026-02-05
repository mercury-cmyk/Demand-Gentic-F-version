-- Migration: Fix client_project_status enum and ensure client_campaign_pricing table exists
-- Description: Adds 'rejected' and 'pending' status to client_project_status enum and creates pricing table

-- ==================== ADD MISSING ENUM VALUES ====================

-- Add 'rejected' to client_project_status enum if not exists
DO $$ BEGIN
    ALTER TYPE client_project_status ADD VALUE IF NOT EXISTS 'rejected';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add 'pending' to client_project_status enum if not exists (for project requests)
DO $$ BEGIN
    ALTER TYPE client_project_status ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==================== CLIENT CAMPAIGN PRICING TABLE ====================

-- Create client_campaign_pricing table if not exists
CREATE TABLE IF NOT EXISTS client_campaign_pricing (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,

    -- Campaign Type (matches CAMPAIGN_TYPES values in the order panel)
    campaign_type VARCHAR(100) NOT NULL,

    -- Pricing Configuration
    price_per_lead NUMERIC(10, 2) NOT NULL,
    minimum_order_size INTEGER DEFAULT 100,

    -- Volume-based discounts (optional)
    -- Format: [{minQuantity: 500, discountPercent: 5}, {minQuantity: 1000, discountPercent: 10}]
    volume_discounts JSONB DEFAULT '[]',

    -- Campaign-specific settings
    is_enabled BOOLEAN DEFAULT true, -- Whether this campaign type is available for this client
    notes TEXT, -- Internal notes about this pricing agreement

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Unique constraint: one price per campaign type per client
    CONSTRAINT unique_client_campaign_type UNIQUE (client_account_id, campaign_type)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_client_campaign_pricing_client ON client_campaign_pricing(client_account_id);
CREATE INDEX IF NOT EXISTS idx_client_campaign_pricing_type ON client_campaign_pricing(campaign_type);
CREATE INDEX IF NOT EXISTS idx_client_campaign_pricing_enabled ON client_campaign_pricing(client_account_id, is_enabled) WHERE is_enabled = true;

-- Add trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_client_campaign_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_client_campaign_pricing_updated_at ON client_campaign_pricing;
CREATE TRIGGER update_client_campaign_pricing_updated_at
    BEFORE UPDATE ON client_campaign_pricing
    FOR EACH ROW
    EXECUTE FUNCTION update_client_campaign_pricing_updated_at();

-- Add comments for documentation
COMMENT ON TABLE client_campaign_pricing IS 'Per-client pricing configuration for each campaign type';
COMMENT ON COLUMN client_campaign_pricing.campaign_type IS 'Campaign type key (e.g., high_quality_leads, appointment_generation, webinar_invite)';
COMMENT ON COLUMN client_campaign_pricing.price_per_lead IS 'Price per lead/unit for this campaign type';
COMMENT ON COLUMN client_campaign_pricing.minimum_order_size IS 'Minimum number of leads that must be ordered';
COMMENT ON COLUMN client_campaign_pricing.volume_discounts IS 'JSON array of volume discount tiers: [{minQuantity, discountPercent}]';
COMMENT ON COLUMN client_campaign_pricing.is_enabled IS 'Whether this campaign type is available for the client to order';
