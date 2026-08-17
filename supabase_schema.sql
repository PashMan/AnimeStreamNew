-- Add missing columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS card_blur TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS card_opacity TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_shape TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_color TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_layout TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_banner TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_bg TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS watched_anime_ids TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friends TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS watched_time INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS episodes_watched INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Ensure private_messages has is_read column
ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

-- Ensure forum_topics has necessary columns
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS replies_count INTEGER DEFAULT 0;
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS anime_id TEXT;

-- Ensure forum_posts has parent_id for nested replies
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES forum_posts(id);

-- Drop existing function to allow parameter name changes
DROP FUNCTION IF EXISTS increment_topic_replies(uuid);

-- Function to increment topic replies count
CREATE OR REPLACE FUNCTION increment_topic_replies(topic_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE forum_topics
  SET replies_count = replies_count + 1
  WHERE id = topic_id;
END;
$$ LANGUAGE plpgsql;

-- Reports table for moderation
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES profiles(id),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  target_content TEXT,
  target_link TEXT,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
