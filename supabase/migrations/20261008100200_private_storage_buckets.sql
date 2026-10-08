-- =============================================================================
-- SECURITY H1: storage buckets are world-readable
-- =============================================================================
-- 20260103000000_add_invoice_url_and_bucket.sql created the invoices bucket as
--
--     INSERT INTO storage.buckets (id, name, public) VALUES ('invoices','invoices', true);
--     CREATE POLICY "Public Access" ON storage.objects
--       FOR SELECT USING ( bucket_id = 'invoices' );
--
-- public = true plus an unconditional SELECT policy means travel invoices --
-- traveller names, routes, PNRs, fares -- are readable by anyone holding the
-- object URL, with no authentication at all. Object paths leak through
-- referrers, forwarded mail and browser history, and the flat naming scheme
-- (pnc_self_booking_<ts>.pdf, split_<requestId>_<ts>.pdf) is guessable.
--
-- The upload side was equally open: any authenticated user could write any
-- file, any size, any MIME type, to a public bucket under the org's domain.
--
-- Two further buckets are in use that no migration ever created -- they were
-- made by hand in the dashboard, and the client calls getPublicUrl() on both,
-- which only returns working links when the bucket is public:
--
--   user-documents   passport photos and government ID  (OnboardingView.tsx:131)
--   chat-attachments files shared in request threads     (ChatView.tsx:423)
--
-- user-documents is the more serious of the two: it holds identity documents.
-- This migration brings all three under version control and locks them down.
--
-- ---------------------------------------------------------------------------
-- REQUIRES THE MATCHING CLIENT CHANGE IN THIS BRANCH. Making a bucket private
-- invalidates every getPublicUrl() link already stored in the database, so the
-- client must resolve stored URLs through createSignedUrl(). Do not apply this
-- migration without deploying the client change in the same release.
-- ---------------------------------------------------------------------------
-- =============================================================================

-- NOTE ON ROLE NAMES
-- types.ts defines UserRole.PNC_ADMIN = 'PNC Admin', but no existing RLS policy
-- in this schema mentions it -- every one lists only 'Admin', 'PNC', 'Finance'.
-- A user holding 'PNC Admin' is therefore treated as an ordinary employee by
-- the database while the UI shows them staff screens. That is a pre-existing
-- inconsistency, not introduced here; the policies below include 'PNC Admin'
-- so that locking these buckets does not newly break those users. The wider
-- mismatch should be fixed across the schema separately.

-- 1. Private buckets, with limits ---------------------------------------------
-- Only invoices is guaranteed to exist; the other two are created outside
-- migrations, so guard each update rather than assuming.

UPDATE storage.buckets
   SET public = false,
       file_size_limit = 10485760,                      -- 10 MB
       allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/webp']
 WHERE id = 'invoices';

UPDATE storage.buckets
   SET public = false,
       file_size_limit = 5242880,                       -- 5 MB, matches the UI check
       allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/webp']
 WHERE id = 'user-documents';

UPDATE storage.buckets
   SET public = false,
       file_size_limit = 10485760
 WHERE id = 'chat-attachments';

-- 2. Remove the blanket public-read policy ------------------------------------
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;

-- 3. invoices ------------------------------------------------------------------
-- Invoice objects are named flat at the bucket root, with no owner prefix, so
-- ownership cannot be derived from the path. Derive it from the request the
-- file is attached to instead: you may read an invoice that belongs to a
-- travel request you are already allowed to see.

DROP POLICY IF EXISTS "Invoices readable by owner or staff" ON storage.objects;
CREATE POLICY "Invoices readable by owner or staff" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (
      public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
      OR EXISTS (
        SELECT 1 FROM public.travel_requests tr
         WHERE tr.requester_id = auth.uid()
           AND (
             COALESCE(tr.invoice_url, '') LIKE '%' || storage.objects.name
             OR COALESCE(tr.split_tickets::text, '') LIKE '%' || storage.objects.name || '%'
           )
      )
    )
  );

-- Uploading an invoice is a desk action: PNC and Finance book and attach them.
DROP POLICY IF EXISTS "Invoices writable by staff" ON storage.objects;
CREATE POLICY "Invoices writable by staff" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices' AND public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance'));

-- 4. user-documents -------------------------------------------------------------
-- Paths are '<userId>/<filename>' (OnboardingView.tsx:131), so ownership is the
-- leading path segment. Owner reads their own; staff read for verification.

DROP POLICY IF EXISTS "Own documents or verification staff" ON storage.objects;
CREATE POLICY "Own documents or verification staff" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin')
    )
  );

DROP POLICY IF EXISTS "Upload own documents" ON storage.objects;
CREATE POLICY "Upload own documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- OnboardingView uploads with upsert: true, which needs UPDATE as well.
DROP POLICY IF EXISTS "Replace own documents" ON storage.objects;
CREATE POLICY "Replace own documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'user-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 5. chat-attachments -----------------------------------------------------------
-- Paths are '<threadId>/<filename>'. Thread membership is not modelled in a way
-- this policy can check, so this restricts to signed-in users -- strictly
-- better than world-readable, but not per-thread. Tightening it to thread
-- participants is follow-up work once membership is queryable.

DROP POLICY IF EXISTS "Chat attachments for signed-in users" ON storage.objects;
CREATE POLICY "Chat attachments for signed-in users" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "Chat attachment upload" ON storage.objects;
CREATE POLICY "Chat attachment upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');
