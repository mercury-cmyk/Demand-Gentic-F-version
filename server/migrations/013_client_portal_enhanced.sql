-- Enhanced Client Portal Migration
-- Adds: Projects, Billing Config, Activity Costs, Invoices, Delivery Links, Voice Commands

-- ==================== ENUMS ====================

DO $$ BEGIN
    CREATE TYPE client_project_status AS ENUM (
        'draft',
        'active',
        'paused',
        'completed',
        'archived'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE billing_model_type AS ENUM (
        'cpl',              -- Cost Per Lead
        'cpc',              -- Cost Per Contact
        'monthly_retainer', -- Fixed monthly fee
        'hybrid'            -- Retainer + overage
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE activity_cost_type AS ENUM (
        'lead_delivered',
        'contact_verified',
        'ai_call_minute',
        'email_sent',
        'sms_sent',
        'retainer_fee',
        'setup_fee',
        'adjustment',
        'credit'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE invoice_status AS ENUM (
        'draft',
        'pending',
        'sent',
        'paid',
        'overdue',
        'void',
        'disputed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE delivery_status AS ENUM (
        'pending',
        'processing',
        'delivered',
        'failed',
        'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE voice_command_intent AS ENUM (
        'navigation',
        'query',
        'action',
        'report',
        'unknown'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==================== CLIENT PROJECTS ====================

CREATE TABLE IF NOT EXISTS client_projects (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,

    -- Project Details
    name TEXT NOT NULL,
    description TEXT,
    project_code TEXT UNIQUE,

    -- Dates
    start_date DATE,
    end_date DATE,

    -- Status
    status client_project_status NOT NULL DEFAULT 'draft',

    -- Budget
    budget_amount NUMERIC(12,2),
    budget_currency VARCHAR(3) DEFAULT 'USD',

    -- Billing Settings (override account defaults)
    billing_model billing_model_type,
    rate_per_lead NUMERIC(10,2),
    rate_per_contact NUMERIC(10,2),
    rate_per_call_minute NUMERIC(10,4),
    monthly_retainer NUMERIC(10,2),

    -- Metadata
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_projects_client_idx ON client_projects(client_account_id);
CREATE INDEX IF NOT EXISTS client_projects_status_idx ON client_projects(status);
CREATE INDEX IF NOT EXISTS client_projects_code_idx ON client_projects(project_code);

-- Link campaigns to projects
CREATE TABLE IF NOT EXISTS client_project_campaigns (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR NOT NULL REFERENCES client_projects(id) ON DELETE CASCADE,
    campaign_id VARCHAR NOT NULL REFERENCES verification_campaigns(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    assigned_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,

    UNIQUE(project_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS client_project_campaigns_project_idx ON client_project_campaigns(project_id);
CREATE INDEX IF NOT EXISTS client_project_campaigns_campaign_idx ON client_project_campaigns(campaign_id);

-- ==================== BILLING CONFIGURATION ====================

CREATE TABLE IF NOT EXISTS client_billing_config (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id VARCHAR NOT NULL UNIQUE REFERENCES client_accounts(id) ON DELETE CASCADE,

    -- Default Pricing Model
    default_billing_model billing_model_type NOT NULL DEFAULT 'cpl',

    -- Rates (defaults)
    default_rate_per_lead NUMERIC(10,2) DEFAULT 150.00,
    default_rate_per_contact NUMERIC(10,2) DEFAULT 25.00,
    default_rate_per_call_minute NUMERIC(10,4) DEFAULT 0.15,
    default_rate_per_email NUMERIC(10,4) DEFAULT 0.02,

    -- Retainer Settings
    monthly_retainer_amount NUMERIC(12,2),
    retainer_includes_leads INTEGER,
    overage_rate_per_lead NUMERIC(10,2),

    -- Payment Terms
    payment_terms_days INTEGER DEFAULT 30,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Billing Contact
    billing_email TEXT,
    billing_address JSONB,

    -- Tax
    tax_exempt BOOLEAN DEFAULT FALSE,
    tax_id TEXT,
    tax_rate NUMERIC(5,4) DEFAULT 0,

    -- Auto Invoice Settings
    auto_invoice_enabled BOOLEAN DEFAULT TRUE,
    invoice_day_of_month INTEGER DEFAULT 1,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==================== ACTIVITY COSTS (Real-time tracking) ====================

CREATE TABLE IF NOT EXISTS client_activity_costs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    project_id VARCHAR REFERENCES client_projects(id) ON DELETE SET NULL,
    campaign_id VARCHAR REFERENCES verification_campaigns(id) ON DELETE SET NULL,
    order_id VARCHAR REFERENCES client_portal_orders(id) ON DELETE SET NULL,

    -- Activity Details
    activity_type activity_cost_type NOT NULL,
    activity_date TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Reference to source record
    reference_type TEXT,
    reference_id VARCHAR,

    -- Cost Calculation
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit_rate NUMERIC(10,4) NOT NULL,
    total_cost NUMERIC(12,4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Billing Status
    invoice_id VARCHAR,
    invoiced_at TIMESTAMP,

    -- Metadata
    description TEXT,
    metadata JSONB,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_activity_costs_client_date_idx ON client_activity_costs(client_account_id, activity_date);
CREATE INDEX IF NOT EXISTS client_activity_costs_invoice_idx ON client_activity_costs(invoice_id);
CREATE INDEX IF NOT EXISTS client_activity_costs_uninvoiced_idx ON client_activity_costs(client_account_id) WHERE invoice_id IS NULL;
CREATE INDEX IF NOT EXISTS client_activity_costs_project_idx ON client_activity_costs(project_id);
CREATE INDEX IF NOT EXISTS client_activity_costs_campaign_idx ON client_activity_costs(campaign_id);

-- ==================== INVOICES ====================

CREATE TABLE IF NOT EXISTS client_invoices (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,

    -- Invoice Details
    invoice_number TEXT UNIQUE NOT NULL,

    -- Period
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,

    -- Amounts
    subtotal NUMERIC(12,2) NOT NULL,
    tax_amount NUMERIC(12,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL,
    amount_paid NUMERIC(12,2) DEFAULT 0,
    balance_due NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Status
    status invoice_status NOT NULL DEFAULT 'draft',

    -- Dates
    issue_date DATE,
    due_date DATE,
    paid_date DATE,

    -- Payment
    payment_method TEXT,
    payment_reference TEXT,

    -- Notes
    notes TEXT,
    internal_notes TEXT,

    -- PDF Storage
    pdf_url TEXT,

    -- Audit
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    sent_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    sent_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_invoices_client_idx ON client_invoices(client_account_id);
CREATE INDEX IF NOT EXISTS client_invoices_status_idx ON client_invoices(status);
CREATE INDEX IF NOT EXISTS client_invoices_period_idx ON client_invoices(billing_period_start, billing_period_end);
CREATE INDEX IF NOT EXISTS client_invoices_due_date_idx ON client_invoices(due_date);

-- Add foreign key to activity_costs now that invoices table exists
ALTER TABLE client_activity_costs
    ADD CONSTRAINT client_activity_costs_invoice_fk
    FOREIGN KEY (invoice_id) REFERENCES client_invoices(id) ON DELETE SET NULL;

-- Invoice Line Items
CREATE TABLE IF NOT EXISTS client_invoice_items (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id VARCHAR NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,

    -- Item Details
    description TEXT NOT NULL,
    item_type TEXT NOT NULL,

    -- Quantity & Pricing
    quantity NUMERIC(10,2) NOT NULL,
    unit_price NUMERIC(10,4) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,

    -- Project/Campaign Reference
    project_id VARCHAR REFERENCES client_projects(id) ON DELETE SET NULL,
    campaign_id VARCHAR REFERENCES verification_campaigns(id) ON DELETE SET NULL,

    -- Period
    period_start DATE,
    period_end DATE,

    -- Ordering
    sort_order INTEGER DEFAULT 0,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_invoice_items_invoice_idx ON client_invoice_items(invoice_id);

-- Invoice Activity Log
CREATE TABLE IF NOT EXISTS client_invoice_activity (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id VARCHAR NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,

    activity_type TEXT NOT NULL,
    description TEXT,

    performed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    performed_by_client VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
    performed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_invoice_activity_invoice_idx ON client_invoice_activity(invoice_id);

-- ==================== DELIVERY LINKS ====================

CREATE TABLE IF NOT EXISTS client_delivery_links (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    order_id VARCHAR REFERENCES client_portal_orders(id) ON DELETE SET NULL,
    campaign_id VARCHAR REFERENCES verification_campaigns(id) ON DELETE SET NULL,
    project_id VARCHAR REFERENCES client_projects(id) ON DELETE SET NULL,

    -- Delivery Details
    delivery_type TEXT NOT NULL DEFAULT 'csv_export',
    delivery_status delivery_status NOT NULL DEFAULT 'pending',

    -- Link Information
    file_url TEXT,
    file_name TEXT,
    link_expires_at TIMESTAMP,
    download_count INTEGER DEFAULT 0,
    max_downloads INTEGER,

    -- Delivery Content
    contact_count INTEGER NOT NULL DEFAULT 0,
    file_format TEXT DEFAULT 'csv',
    file_size_bytes BIGINT,

    -- Tracking
    delivered_at TIMESTAMP,
    first_accessed_at TIMESTAMP,
    last_accessed_at TIMESTAMP,

    -- Security
    access_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
    password_protected BOOLEAN DEFAULT FALSE,
    password_hash TEXT,

    -- Audit
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_delivery_links_client_idx ON client_delivery_links(client_account_id);
CREATE INDEX IF NOT EXISTS client_delivery_links_order_idx ON client_delivery_links(order_id);
CREATE INDEX IF NOT EXISTS client_delivery_links_token_idx ON client_delivery_links(access_token);
CREATE INDEX IF NOT EXISTS client_delivery_links_status_idx ON client_delivery_links(delivery_status);

-- Delivery Access Log
CREATE TABLE IF NOT EXISTS client_delivery_access_log (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_link_id VARCHAR NOT NULL REFERENCES client_delivery_links(id) ON DELETE CASCADE,

    accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    accessed_by_user_id VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS client_delivery_access_log_link_idx ON client_delivery_access_log(delivery_link_id);

-- ==================== VOICE COMMANDS ====================

CREATE TABLE IF NOT EXISTS client_voice_commands (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_user_id VARCHAR NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,

    -- Command Details
    transcript TEXT NOT NULL,
    intent voice_command_intent DEFAULT 'unknown',
    entities JSONB,

    -- Response
    response_text TEXT,
    response_audio_url TEXT,

    -- Action Taken
    action_type TEXT,
    action_result JSONB,
    action_success BOOLEAN,

    -- Timing
    processing_duration_ms INTEGER,

    -- Audio Storage
    audio_input_url TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_voice_commands_user_idx ON client_voice_commands(client_user_id);
CREATE INDEX IF NOT EXISTS client_voice_commands_account_idx ON client_voice_commands(client_account_id);
CREATE INDEX IF NOT EXISTS client_voice_commands_created_idx ON client_voice_commands(created_at);

-- Voice Configuration per Client
CREATE TABLE IF NOT EXISTS client_voice_config (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id VARCHAR UNIQUE NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,

    -- Voice Settings
    voice_enabled BOOLEAN DEFAULT TRUE,
    preferred_voice TEXT DEFAULT 'nova',
    response_speed NUMERIC(3,2) DEFAULT 1.0,

    -- Permissions
    voice_can_create_orders BOOLEAN DEFAULT TRUE,
    voice_can_view_invoices BOOLEAN DEFAULT TRUE,
    voice_can_download_reports BOOLEAN DEFAULT TRUE,

    -- Custom Vocabulary
    custom_vocabulary JSONB,

    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==================== HELPER FUNCTIONS ====================

-- Function to generate sequential invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number() RETURNS TEXT AS $$
DECLARE
    year_part TEXT;
    seq_num INTEGER;
    new_number TEXT;
BEGIN
    year_part := to_char(NOW(), 'YYYY');

    SELECT COALESCE(MAX(
        CAST(NULLIF(regexp_replace(invoice_number, '^INV-\d{4}-', ''), '') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM client_invoices
    WHERE invoice_number LIKE 'INV-' || year_part || '-%';

    new_number := 'INV-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate project codes
CREATE OR REPLACE FUNCTION generate_project_code() RETURNS TEXT AS $$
DECLARE
    year_part TEXT;
    seq_num INTEGER;
    new_code TEXT;
BEGIN
    year_part := to_char(NOW(), 'YYYY');

    SELECT COALESCE(MAX(
        CAST(NULLIF(regexp_replace(project_code, '^PRJ-\d{4}-', ''), '') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM client_projects
    WHERE project_code LIKE 'PRJ-' || year_part || '-%';

    new_code := 'PRJ-' || year_part || '-' || LPAD(seq_num::TEXT, 3, '0');
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate project code
CREATE OR REPLACE FUNCTION set_project_code() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.project_code IS NULL THEN
        NEW.project_code := generate_project_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_project_code ON client_projects;
CREATE TRIGGER trigger_set_project_code
    BEFORE INSERT ON client_projects
    FOR EACH ROW
    EXECUTE FUNCTION set_project_code();

-- ==================== UPDATE TIMESTAMPS TRIGGERS ====================

CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_client_projects_updated_at ON client_projects;
CREATE TRIGGER update_client_projects_updated_at
    BEFORE UPDATE ON client_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_billing_config_updated_at ON client_billing_config;
CREATE TRIGGER update_client_billing_config_updated_at
    BEFORE UPDATE ON client_billing_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_invoices_updated_at ON client_invoices;
CREATE TRIGGER update_client_invoices_updated_at
    BEFORE UPDATE ON client_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_voice_config_updated_at ON client_voice_config;
CREATE TRIGGER update_client_voice_config_updated_at
    BEFORE UPDATE ON client_voice_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================== COMMENTS ====================

COMMENT ON TABLE client_projects IS 'Client projects containing multiple campaigns for organization and billing';
COMMENT ON TABLE client_billing_config IS 'Billing configuration and pricing for each client account';
COMMENT ON TABLE client_activity_costs IS 'Real-time tracking of billable activities';
COMMENT ON TABLE client_invoices IS 'Generated invoices for clients';
COMMENT ON TABLE client_invoice_items IS 'Line items for each invoice';
COMMENT ON TABLE client_delivery_links IS 'Secure download links for data deliveries';
COMMENT ON TABLE client_voice_commands IS 'Voice command history and analytics';
COMMENT ON TABLE client_voice_config IS 'Voice assistant configuration per client';
