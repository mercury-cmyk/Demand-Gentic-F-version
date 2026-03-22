/**
 * Add Work Order Attachments Support
 * 
 * Adds secure file attachment capabilities to work orders.
 * Files are stored in S3/GCS with metadata in the database.
 */

-- Work Order Attachments table
CREATE TABLE IF NOT EXISTS work_order_attachments (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link to work order
    work_order_id VARCHAR NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    
    -- File metadata
    filename TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_key TEXT NOT NULL, -- S3/GCS key for the actual file
    
    -- Upload tracking
    uploaded_by VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS work_order_attachments_work_order_idx ON work_order_attachments(work_order_id);
CREATE INDEX IF NOT EXISTS work_order_attachments_uploaded_by_idx ON work_order_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS work_order_attachments_storage_key_idx ON work_order_attachments(storage_key);

-- Add attachment count field to work_orders for quick visibility  
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS attachment_count INTEGER DEFAULT 0;

-- Function to update attachment count
CREATE OR REPLACE FUNCTION update_work_order_attachment_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE work_orders 
    SET attachment_count = (
        SELECT COUNT(*) 
        FROM work_order_attachments 
        WHERE work_order_id = COALESCE(OLD.work_order_id, NEW.work_order_id)
    )
    WHERE id = COALESCE(OLD.work_order_id, NEW.work_order_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers to maintain attachment count
DROP TRIGGER IF EXISTS work_order_attachments_count_trigger ON work_order_attachments;
CREATE TRIGGER work_order_attachments_count_trigger
    AFTER INSERT OR DELETE ON work_order_attachments
    FOR EACH ROW
    EXECUTE FUNCTION update_work_order_attachment_count();