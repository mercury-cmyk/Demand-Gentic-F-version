ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS account_id varchar
  REFERENCES accounts(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_account_idx
  ON leads(account_id);

UPDATE leads
SET
  account_id = contacts.account_id,
  account_name = COALESCE(leads.account_name, accounts.name),
  account_industry = COALESCE(leads.account_industry, accounts.industry_standardized)
FROM contacts
LEFT JOIN accounts
  ON accounts.id = contacts.account_id
WHERE leads.contact_id = contacts.id
  AND (
    leads.account_id IS NULL
    OR leads.account_name IS NULL
    OR leads.account_industry IS NULL
  );