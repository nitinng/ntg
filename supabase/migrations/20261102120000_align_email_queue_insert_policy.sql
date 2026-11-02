-- Migration: Align email_queue INSERT policy with guard_email_queue_insert()
-- Date: 2026-11-02
--
-- Symptom (SOS EMAIL_ENQUEUE_FAILED, production):
--   new row violates row-level security policy for table "email_queue"
--
-- Cause: 20261028003000 widened the guard trigger so the approving manager of a
-- request (travel_requests.approving_manager_email, or the requester profile's
-- manager_email) may queue lifecycle mail for it. The RLS INSERT policy from
-- 20261008110000 was never widened to match, so it still admits only desk staff
-- and the requester. RLS is checked after BEFORE triggers, so a manager's
-- approve/reject notification passed the trigger and was then rejected by the
-- policy. Lifecycle mail is non-blocking, so the action succeeded but the mail
-- was silently lost.
--
-- Fix: the policy now admits exactly the actors the trigger authorises. The
-- trigger stays the real guard (recipient sanitising, channel exemptions).

CREATE OR REPLACE FUNCTION public.can_queue_email_for_ticket(p_ticket_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $can_queue_email_for_ticket$
  SELECT EXISTS (
    SELECT 1
      FROM public.travel_requests tr
      LEFT JOIN public.profiles rp ON rp.id = tr.requester_id
      LEFT JOIN public.profiles me ON me.id = auth.uid()
      LEFT JOIN auth.users au      ON au.id = auth.uid()
     WHERE tr.id = p_ticket_id
       AND (
             tr.requester_id = auth.uid()
          OR lower(btrim(COALESCE(me.email, au.email, ''))) <> ''
             AND lower(btrim(COALESCE(me.email, au.email))) IN (
                   lower(btrim(COALESCE(tr.approving_manager_email, ''))),
                   lower(btrim(COALESCE(rp.manager_email, '')))
                 )
       )
  );
$can_queue_email_for_ticket$;

REVOKE ALL ON FUNCTION public.can_queue_email_for_ticket(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_queue_email_for_ticket(UUID) TO authenticated;

DROP POLICY IF EXISTS "Queue email for own request or as staff" ON public.email_queue;
DROP POLICY IF EXISTS "Queue email for own or managed request or as staff" ON public.email_queue;
CREATE POLICY "Queue email for own or managed request or as staff" ON public.email_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
    OR ticket_id IS NULL
    OR public.can_queue_email_for_ticket(ticket_id)
  );

-- Resolve the open alert(s) caused by this policy gap.
UPDATE public.sos_alerts
   SET status = 'Resolved',
       resolved_by = 'system',
       resolved_at = NOW(),
       resolution_note = 'email_queue INSERT policy aligned with guard_email_queue_insert(): approving managers can now queue lifecycle mail (20261102120000).'
 WHERE code = 'EMAIL_ENQUEUE_FAILED'
   AND status <> 'Resolved'
   AND message ILIKE '%row-level security policy for table "email_queue"%';

NOTIFY pgrst, 'reload schema';
