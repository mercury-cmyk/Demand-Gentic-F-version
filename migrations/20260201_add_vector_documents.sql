CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector_document_type') THEN
    CREATE TYPE vector_document_type AS ENUM ('account', 'contact', 'call', 'knowledge', 'campaign');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vector_documents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type vector_document_type NOT NULL,
  source_id text NOT NULL,
  content text NOT NULL,
  embedding vector(768) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  account_id varchar(36),
  industry text,
  disposition text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vector_documents_source_idx
  ON vector_documents (source_type, source_id);

CREATE INDEX IF NOT EXISTS vector_documents_source_type_idx
  ON vector_documents (source_type);

CREATE INDEX IF NOT EXISTS vector_documents_account_idx
  ON vector_documents (account_id);

CREATE INDEX IF NOT EXISTS vector_documents_industry_idx
  ON vector_documents (industry);

CREATE INDEX IF NOT EXISTS vector_documents_disposition_idx
  ON vector_documents (disposition);

CREATE INDEX IF NOT EXISTS vector_documents_embedding_hnsw_idx
  ON vector_documents USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS vector_documents_embedding_ivfflat_idx
  ON vector_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
