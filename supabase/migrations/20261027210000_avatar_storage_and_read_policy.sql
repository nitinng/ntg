-- =============================================================================
-- Migration: Public Avatars Bucket and Avatar Read Policy
-- =============================================================================
-- Resolves broken custom avatars uploaded by users.
-- 1. Creates a public 'avatars' bucket so avatars load reliably for all users
--    without hitting private bucket RLS or expiration errors.
-- 2. Adds SELECT policy on 'user-documents' so existing avatars already uploaded
--    to 'user-documents' can be read by all authenticated users.
-- =============================================================================

-- 1. Create public 'avatars' bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 2. Storage policies for 'avatars' bucket
DROP POLICY IF EXISTS "Avatars publicly readable" ON storage.objects;
CREATE POLICY "Avatars publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Policy on 'user-documents' so existing custom avatars can be viewed by all authenticated users
DROP POLICY IF EXISTS "Avatars in user-documents readable by authenticated" ON storage.objects;
CREATE POLICY "Avatars in user-documents readable by authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-documents'
    AND storage.objects.name LIKE '%/avatar_%'
  );
