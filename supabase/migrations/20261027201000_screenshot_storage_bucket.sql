-- =============================================================================
-- Migration: Private Storage Bucket for Request Screenshots
-- =============================================================================
-- Creates the 'request-screenshots' bucket with:
--   - public = false
--   - 5 MB file size limit
--   - Restricted to images (jpeg, png, webp) and PDF
--   - RLS restricted so only the employee, their manager, and PnC/Admin can view
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'request-screenshots',
  'request-screenshots',
  false,
  5242880, -- 5 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- Upload policy: Authenticated users can upload under their own user ID folder
DROP POLICY IF EXISTS "Requesters upload screenshots" ON storage.objects;
CREATE POLICY "Requesters upload screenshots" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'request-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Select policy: Requester, their approving manager, or PnC/Admin can view
DROP POLICY IF EXISTS "Screenshots viewable by requester, manager, and staff" ON storage.objects;
CREATE POLICY "Screenshots viewable by requester, manager, and staff" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'request-screenshots'
    AND (
      public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin')
      OR auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
          AND lower(p.manager_email) = (SELECT lower(email) FROM public.profiles WHERE id = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.travel_requests tr
        WHERE tr.requester_id::text = (storage.foldername(storage.objects.name))[1]
          AND lower(tr.approving_manager_email) = (SELECT lower(email) FROM public.profiles WHERE id = auth.uid())
      )
    )
  );
