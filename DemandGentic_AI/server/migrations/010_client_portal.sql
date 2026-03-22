-- Client Portal System Migration
-- Creates client accounts, client users, campaign access, orders, and order contacts

-- Create enum for client portal order status
DO $$ BEGIN
    CREATE TYPE client_portal_order_status AS ENUM (
        'draft',
        'submitted',
        'approved',
        'in_fulfillment',
        'completed',
        'rejected',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Client Accounts - Organization-level entity for clients
CREATE TABLE IF NOT EXISTS client_accounts (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    company_name TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_accounts_name_idx ON client_accounts(name);
CREATE INDEX IF NOT EXISTS client_accounts_active_idx ON client_accounts(is_active);

-- Client Users - Separate auth for client portal login
CREATE TABLE IF NOT EXISTS client_users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMP,
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_users_email_idx ON client_users(email);
CREATE INDEX IF NOT EXISTS client_users_client_account_idx ON client_users(client_account_id);
CREATE INDEX IF NOT EXISTS client_users_active_idx ON client_users(is_active);

-- Client Campaign Access - Links clients to verification campaigns
CREATE TABLE IF NOT EXISTS client_campaign_access (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    campaign_id VARCHAR NOT NULL REFERENCES verification_campaigns(id) ON DELETE CASCADE,
    granted_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_campaign_access_unique_idx ON client_campaign_access(client_account_id, campaign_id);
CREATE INDEX IF NOT EXISTS client_campaign_access_client_idx ON client_campaign_access(client_account_id);
CREATE INDEX IF NOT EXISTS client_campaign_access_campaign_idx ON client_campaign_access(campaign_id);

-- Client Portal Orders - Monthly contact requests from clients
CREATE TABLE IF NOT EXISTS client_portal_orders (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    client_user_id VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
    campaign_id VARCHAR NOT NULL REFERENCES verification_campaigns(id) ON DELETE CASCADE,
    
    requested_quantity INTEGER NOT NULL,
    approved_quantity INTEGER,
    delivered_quantity INTEGER NOT NULL DEFAULT 0,
    
    order_month INTEGER NOT NULL,
    order_year INTEGER NOT NULL,
    
    status client_portal_order_status NOT NULL DEFAULT 'draft',
    
    client_notes TEXT,
    admin_notes TEXT,
    
    approved_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    rejected_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMP,
    rejection_reason TEXT,
    
    submitted_at TIMESTAMP,
    fulfilled_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_portal_orders_order_number_idx ON client_portal_orders(order_number);
CREATE INDEX IF NOT EXISTS client_portal_orders_client_account_idx ON client_portal_orders(client_account_id);
CREATE INDEX IF NOT EXISTS client_portal_orders_campaign_idx ON client_portal_orders(campaign_id);
CREATE INDEX IF NOT EXISTS client_portal_orders_status_idx ON client_portal_orders(status);
CREATE INDEX IF NOT EXISTS client_portal_orders_month_year_idx ON client_portal_orders(order_month, order_year);

-- Client Portal Order Contacts - Contacts in an order with edit/comment
CREATE TABLE IF NOT EXISTS client_portal_order_contacts (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR NOT NULL REFERENCES client_portal_orders(id) ON DELETE CASCADE,
    verification_contact_id VARCHAR NOT NULL REFERENCES verification_contacts(id) ON DELETE CASCADE,
    
    edited_data JSONB,
    admin_comment TEXT,
    client_comment TEXT,
    
    selection_order INTEGER NOT NULL,
    selected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    selected_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    
    is_delivered BOOLEAN NOT NULL DEFAULT false,
    delivered_at TIMESTAMP,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_portal_order_contacts_order_idx ON client_portal_order_contacts(order_id);
CREATE INDEX IF NOT EXISTS client_portal_order_contacts_contact_idx ON client_portal_order_contacts(verification_contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_portal_order_contacts_unique_idx ON client_portal_order_contacts(order_id, verification_contact_id);