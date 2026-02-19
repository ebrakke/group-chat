-- Add mentions column to messages table for efficient mention tracking
ALTER TABLE messages ADD COLUMN mentions TEXT; -- JSON array of mentioned usernames
