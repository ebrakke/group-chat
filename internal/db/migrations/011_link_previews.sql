-- Add link_previews column to messages table for OG metadata storage
ALTER TABLE messages ADD COLUMN link_previews TEXT; -- JSON array of link preview objects
