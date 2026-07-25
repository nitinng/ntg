-- Migration: Implement Ticket State Machine Schema (Phase 1)
-- Timestamp: 20260723140000

-- 1. Update/Add Check Constraint on pnc_status column in travel_requests table
ALTER TABLE public.travel_requests DROP CONSTRAINT IF EXISTS chk_pnc_status;
ALTER TABLE public.travel_requests ADD CONSTRAINT chk_pnc_status CHECK (
  pnc_status IN (
    'Not Started',
    'Approval Pending',
    'Rejected by Manager',
    'Approved',
    'Processing',
    'On Hold',
    'Rejected by PNC',
    'Booked',
    'Cancelled by Employee',
    'Cancelled by PNC',
    'Closed'
  )
);

-- 2. Add state machine supporting columns to travel_requests table
ALTER TABLE public.travel_requests
ADD COLUMN IF NOT EXISTS resubmission_count INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS on_hold_since TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
ADD COLUMN IF NOT EXISTS status_change_reason TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Create ticket_status_history table (Audit Trail)
CREATE TABLE IF NOT EXISTS public.ticket_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id),
  actor_role TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_history_from_status CHECK (
    from_status IS NULL OR from_status IN (
      'Not Started', 'Approval Pending', 'Rejected by Manager', 'Approved', 'Processing',
      'On Hold', 'Rejected by PNC', 'Booked', 'Cancelled by Employee', 'Cancelled by PNC', 'Closed'
    )
  ),
  CONSTRAINT chk_history_to_status CHECK (
    to_status IN (
      'Not Started', 'Approval Pending', 'Rejected by Manager', 'Approved', 'Processing',
      'On Hold', 'Rejected by PNC', 'Booked', 'Cancelled by Employee', 'Cancelled by PNC', 'Closed'
    )
  )
);

-- 4. Create ticket_violations table (submission versioning)
CREATE TABLE IF NOT EXISTS public.ticket_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  submission_version INTEGER NOT NULL DEFAULT 1,
  has_violation BOOLEAN NOT NULL DEFAULT FALSE,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create email_queue table (for decoupled retry-capable email sending)
CREATE TABLE IF NOT EXISTS public.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  to_status TEXT NOT NULL,
  recipients TEXT[] NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Sent', 'Failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.ticket_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for ticket_status_history
DROP POLICY IF EXISTS "Users can view own ticket history" ON public.ticket_status_history;
CREATE POLICY "Users can view own ticket history" ON public.ticket_status_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.travel_requests
    WHERE travel_requests.id = ticket_status_history.ticket_id
    AND (
      travel_requests.requester_id = auth.uid()
      OR travel_requests.approving_manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'PNC', 'Finance')
  )
);

DROP POLICY IF EXISTS "System and PNC can insert ticket history" ON public.ticket_status_history;
CREATE POLICY "System and PNC can insert ticket history" ON public.ticket_status_history
FOR INSERT
TO authenticated
WITH CHECK (true); -- Transition logic / RPC runs with auth checks inside pgSQL function

-- 8. RLS Policies for ticket_violations
DROP POLICY IF EXISTS "Users can view own violations" ON public.ticket_violations;
CREATE POLICY "Users can view own violations" ON public.ticket_violations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.travel_requests
    WHERE travel_requests.id = ticket_violations.ticket_id
    AND (
      travel_requests.requester_id = auth.uid()
      OR travel_requests.approving_manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'PNC', 'Finance')
  )
);

DROP POLICY IF EXISTS "System and PNC can insert/update violations" ON public.ticket_violations;
CREATE POLICY "System and PNC can insert/update violations" ON public.ticket_violations
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 9. RLS Policies for email_queue
DROP POLICY IF EXISTS "Staff can view email queue" ON public.email_queue;
CREATE POLICY "Staff can view email queue" ON public.email_queue
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'PNC')
  )
);

DROP POLICY IF EXISTS "System can insert to email queue" ON public.email_queue;
CREATE POLICY "System can insert to email queue" ON public.email_queue
FOR INSERT
TO authenticated
WITH CHECK (true);
