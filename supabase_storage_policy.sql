-- Run this in your Supabase SQL Editor to fix the avatar upload issue

-- 1. Create the avatars bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create the collection-covers bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('collection-covers', 'collection-covers', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS (Row Level Security) - usually enabled by default, but good to ensure
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow Updates" ON storage.objects;

-- 4. Create permissive policies (Required because we are using custom auth, not Supabase Auth)

-- Allow anyone to view avatars and collection covers
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id IN ('avatars', 'collection-covers') );

-- Allow anyone (including anonymous users) to upload to the avatars and collection covers buckets
CREATE POLICY "Allow Uploads"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id IN ('avatars', 'collection-covers') );

-- Allow updates
CREATE POLICY "Allow Updates"
ON storage.objects FOR UPDATE
USING ( bucket_id IN ('avatars', 'collection-covers') );
