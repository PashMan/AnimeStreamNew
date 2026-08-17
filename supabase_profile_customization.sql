-- Add profile customization columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS profile_bg text,
ADD COLUMN IF NOT EXISTS profile_layout text DEFAULT 'standard', -- 'standard', 'reversed', 'centered'
ADD COLUMN IF NOT EXISTS theme_color text DEFAULT 'primary'; -- 'primary', 'red', 'blue', 'green', etc.

-- Allow public read access to these columns (already covered by "Public Access" policy usually, but good to know)
