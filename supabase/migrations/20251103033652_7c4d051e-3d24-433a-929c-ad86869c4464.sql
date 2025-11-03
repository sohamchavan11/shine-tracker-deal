-- Add specifications column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS specifications TEXT;