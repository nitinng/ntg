-- =============================================================================
-- Migration: Restore Orphaned Admin Requests (Data Fix & Backup)
-- =============================================================================
-- Issue #11: When Laksha was removed as PnC Admin, requests assigned to her
-- remained linked to her ID (assigned_pnc_id = laksha.id). Because she is now
-- an Employee, she cannot see them (RLS restricts her to own requests), and
-- active PnC staff filtering by 'My Requests' or 'Unassigned' do not see them.
--
-- Safety: As required, this data fix first backs up affected rows into
-- travel_requests_orphaned_backup before resetting assigned_pnc_id to NULL so
-- the requests immediately return to the PnC unassigned queue.
-- =============================================================================

-- 1. Create backup table
CREATE TABLE IF NOT EXISTS public.travel_requests_orphaned_backup (
  backup_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  backed_up_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  request_id UUID NOT NULL,
  original_assigned_pnc_id UUID,
  original_pnc_status TEXT,
  requester_name TEXT,
  submission_id TEXT,
  request_data JSONB NOT NULL
);

-- 2. Back up all open requests currently assigned to non-desk profiles
INSERT INTO public.travel_requests_orphaned_backup (
  request_id,
  original_assigned_pnc_id,
  original_pnc_status,
  requester_name,
  submission_id,
  request_data
)
SELECT 
  tr.id,
  tr.assigned_pnc_id,
  tr.pnc_status,
  tr.requester_name,
  tr.submission_id,
  to_jsonb(tr)
FROM public.travel_requests tr
JOIN public.profiles p ON p.id = tr.assigned_pnc_id
WHERE p.role NOT IN ('Admin', 'PNC', 'PNC Admin')
  AND tr.pnc_status NOT IN (
    'Closed',
    'Closed / Recorded - (self-booked)',
    'Cancelled by Employee',
    'Cancelled by PNC',
    'Cancelled by System',
    'Reconciled',
    'Written Off'
  );

-- 3. Restore visibility by returning orphaned requests to the unassigned queue
UPDATE public.travel_requests tr
SET 
  assigned_pnc_id = NULL,
  assigned_at = NULL,
  timeline = COALESCE(tr.timeline, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'id', extract(epoch FROM now())::text || '-orphan-restore',
      'timestamp', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
      'actor', 'System (Data Fix)',
      'event', 'Returned to Unassigned Queue',
      'details', 'Assigned staff member is no longer an active PnC desk member. Ticket restored to pool.'
    )
  ),
  updated_at = now()
FROM public.profiles p
WHERE p.id = tr.assigned_pnc_id
  AND p.role NOT IN ('Admin', 'PNC', 'PNC Admin')
  AND tr.pnc_status NOT IN (
    'Closed',
    'Closed / Recorded - (self-booked)',
    'Cancelled by Employee',
    'Cancelled by PNC',
    'Cancelled by System',
    'Reconciled',
    'Written Off'
  );
