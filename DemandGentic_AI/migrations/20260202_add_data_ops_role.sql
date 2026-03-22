-- Migration: Add data_ops role to user_role enum
-- This allows users to have the data_ops role for data management access

-- Add the new value to the enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'data_ops';