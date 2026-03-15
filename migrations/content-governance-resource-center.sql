-- Add resource center fields to published pages
ALTER TABLE generative_studio_published_pages ADD COLUMN IF NOT EXISTS is_resource_center BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE generative_studio_published_pages ADD COLUMN IF NOT EXISTS resource_category TEXT;
CREATE INDEX IF NOT EXISTS gen_studio_published_resource_center_idx ON generative_studio_published_pages(is_resource_center);
