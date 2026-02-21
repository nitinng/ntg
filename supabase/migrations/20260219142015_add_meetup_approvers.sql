-- Add Meetup Approvers table
-- This table stores the email IDs of people responsible for approving
-- Igatpuri meetup location availability requests.

CREATE TABLE IF NOT EXISTS public.meetup_approvers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.meetup_approvers ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone authenticated can read meetup approvers
DROP POLICY IF EXISTS "Authenticated users can read meetup approvers" ON public.meetup_approvers;
CREATE POLICY "Authenticated users can read meetup approvers"
  ON public.meetup_approvers FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only Admins and PNC can manage meetup approvers
DROP POLICY IF EXISTS "Admins and PNC can manage meetup approvers" ON public.meetup_approvers;
DROP POLICY IF EXISTS "Admins and PNC can insert meetup approvers" ON public.meetup_approvers;
DROP POLICY IF EXISTS "Admins and PNC can update meetup approvers" ON public.meetup_approvers;
DROP POLICY IF EXISTS "Admins and PNC can delete meetup approvers" ON public.meetup_approvers;

CREATE POLICY "Admins and PNC can manage meetup approvers"
  ON public.meetup_approvers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'PNC')
    )
  );
