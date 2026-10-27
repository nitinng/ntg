-- =============================================================================
-- Migration: Allow Managers to View and Approve Requests Assigned to Them
-- =============================================================================
-- 1. Updates SELECT policy on travel_requests so that employees who are designated
--    as the approving manager (approving_manager_email) can view the request.
-- 2. Adds UPDATE policy on travel_requests so that designated approving managers
--    can Approve / Reject requests awaiting their decision.
-- =============================================================================

-- 1. SELECT Policy: Requester OR designated approving manager
DROP POLICY IF EXISTS "Employees view own requests" ON public.travel_requests;
CREATE POLICY "Employees view own requests" ON public.travel_requests
  FOR SELECT USING (
    auth.uid() = requester_id
    OR lower(approving_manager_email) = (
      SELECT lower(email) FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 2. UPDATE Policy: Designated approving manager can update status on approval pending requests
DROP POLICY IF EXISTS "Managers update assigned pending requests" ON public.travel_requests;
CREATE POLICY "Managers update assigned pending requests" ON public.travel_requests
  FOR UPDATE
  USING (
    lower(approving_manager_email) = (
      SELECT lower(email) FROM public.profiles WHERE id = auth.uid()
    )
    AND pnc_status = 'Approval Pending'
  )
  WITH CHECK (
    lower(approving_manager_email) = (
      SELECT lower(email) FROM public.profiles WHERE id = auth.uid()
    )
    AND pnc_status IN ('Approved', 'Processing', 'Rejected by Manager')
  );
