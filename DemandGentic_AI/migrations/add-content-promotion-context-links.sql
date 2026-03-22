ALTER TABLE content_promotion_pages
ADD COLUMN IF NOT EXISTS client_account_id varchar;

ALTER TABLE content_promotion_pages
ADD COLUMN IF NOT EXISTS project_id varchar;

ALTER TABLE content_promotion_pages
ADD COLUMN IF NOT EXISTS campaign_id varchar;

ALTER TABLE content_promotion_pages
ADD COLUMN IF NOT EXISTS organization_id varchar;

ALTER TABLE content_promotion_pages
ADD COLUMN IF NOT EXISTS context_snapshot jsonb;

DO $$
BEGIN
  ALTER TABLE content_promotion_pages
  ADD CONSTRAINT content_promotion_pages_client_account_id_client_accounts_id_fk
  FOREIGN KEY (client_account_id) REFERENCES client_accounts(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE content_promotion_pages
  ADD CONSTRAINT content_promotion_pages_project_id_client_projects_id_fk
  FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE content_promotion_pages
  ADD CONSTRAINT content_promotion_pages_campaign_id_campaigns_id_fk
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE content_promotion_pages
  ADD CONSTRAINT content_promotion_pages_organization_id_campaign_organizations_id_fk
  FOREIGN KEY (organization_id) REFERENCES campaign_organizations(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS content_promo_pages_client_idx
ON content_promotion_pages (client_account_id);

CREATE INDEX IF NOT EXISTS content_promo_pages_project_idx
ON content_promotion_pages (project_id);

CREATE INDEX IF NOT EXISTS content_promo_pages_campaign_idx
ON content_promotion_pages (campaign_id);

CREATE INDEX IF NOT EXISTS content_promo_pages_organization_idx
ON content_promotion_pages (organization_id);

COMMENT ON COLUMN content_promotion_pages.context_snapshot IS
'Resolved client, project, campaign, and campaign-context snapshot captured when the page is saved.';