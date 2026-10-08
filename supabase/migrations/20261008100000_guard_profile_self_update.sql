-- =============================================================================
-- SECURITY C1: stop users escalating their own role
-- =============================================================================
-- public.profiles carries the authorization role, and the self-update policy
-- (supabase_schema.sql:145) is:
--
--     CREATE POLICY "Users can update own profile" ON public.profiles
--       FOR UPDATE USING (auth.uid() = id);
--
-- No WITH CHECK, no column restriction. `role` is an ordinary column on that
-- row and public.get_user_role() -- which every staff-gated policy in the
-- schema consults -- reads it. So any authenticated user could run
--
--     supabase.from('profiles').update({ role: 'Admin' }).eq('id', myUserId)
--
-- and gain Admin reach over every table. Verified reproducible.
--
-- The same gap let a user self-assert document verification: passport_photo
-- and id_proof are JSONB blobs of { fileUrl, status, uploadedAt } written by
-- the user's own onboarding screen, so a crafted request could set
-- status = 'Approved' without staff review.
--
-- Fix: a BEFORE UPDATE trigger that pins the privileged fields on
-- requester-driven updates. Admin/PNC keep their existing powers, and
-- service-role / trigger writes (auth.uid() IS NULL) are untouched.
--
-- NOTE: App.tsx handleUpdateUser() already omits `role` deliberately, and
-- role changes go through handleUpdateUserRole() as Admin/PNC, so no client
-- change is needed. This closes the direct-API path the UI never used.
--
-- AUDIT FIRST: this has been open for the life of the table. Before applying,
-- review who currently holds elevated roles:
--     SELECT id, email, name, role FROM public.profiles
--      WHERE role <> 'Employee' ORDER BY role, email;
-- =============================================================================

-- A new document upload always re-enters review; it never carries a status the
-- uploader chose. An unchanged fileUrl keeps whatever status staff last set.
CREATE OR REPLACE FUNCTION public.pin_document_status(old_doc JSONB, new_doc JSONB)
RETURNS JSONB AS $$
  SELECT CASE
    -- Nothing supplied, or the field was cleared: keep what is stored.
    WHEN new_doc IS NULL OR jsonb_typeof(new_doc) <> 'object' THEN old_doc
    -- First upload, or a genuinely new file: force it into the review queue.
    WHEN old_doc IS NULL
      OR jsonb_typeof(old_doc) <> 'object'
      OR COALESCE(new_doc ->> 'fileUrl', '') IS DISTINCT FROM COALESCE(old_doc ->> 'fileUrl', '')
      THEN jsonb_set(new_doc, '{status}', to_jsonb('Pending Verification'::text))
    -- Same file: the stored status stands, whatever the client sent.
    ELSE jsonb_set(new_doc, '{status}',
                   to_jsonb(COALESCE(old_doc ->> 'status', 'Pending Verification')))
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Staff keep their current abilities; so do service-role and trigger writes,
  -- where auth.uid() is NULL. Only a user editing their OWN row is constrained.
  IF auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM OLD.id
     OR COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC')
  THEN
    RETURN NEW;
  END IF;

  -- Identity and authorization: never self-writable.
  NEW.id    := OLD.id;
  NEW.email := OLD.email;
  NEW.role  := OLD.role;

  -- Verification outcome is a staff decision, not a self-assertion.
  NEW.passport_photo := public.pin_document_status(OLD.passport_photo, NEW.passport_photo);
  NEW.id_proof       := public.pin_document_status(OLD.id_proof, NEW.id_proof);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_profile_self_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_self_update();

-- Make the policy's intent explicit. USING already restricts which rows are
-- visible for update; WITH CHECK stops the row being rewritten to another id.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
