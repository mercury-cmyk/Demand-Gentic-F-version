-- Add work-order QA status tracking column without touching legacy qa_status.
ALTER TABLE "work_orders"
ADD COLUMN IF NOT EXISTS "wo_qa_status" text;