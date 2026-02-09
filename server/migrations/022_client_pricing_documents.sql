-- Client Pricing Documents table
-- Stores uploaded pricing agreement PDFs/documents per client
CREATE TABLE IF NOT EXISTS client_pricing_documents (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_key VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER,
  uploaded_by VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_pricing_docs_client_idx ON client_pricing_documents(client_account_id);
