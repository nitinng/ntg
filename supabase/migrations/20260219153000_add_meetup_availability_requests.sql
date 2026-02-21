-- Create Meetup Availability Requests table
CREATE TABLE IF NOT EXISTS public.meetup_availability_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  department TEXT,
  team_size INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending', -- Pending, Approved, Rejected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  timeline JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE public.meetup_availability_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own requests
CREATE POLICY "Users can view their own meetup requests"
  ON public.meetup_availability_requests FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Policy: Users can insert their own requests
CREATE POLICY "Users can insert their own meetup requests"
  ON public.meetup_availability_requests FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- Policy: Meetup approvers can view all requests
CREATE POLICY "Meetup approvers can view all requests"
  ON public.meetup_availability_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetup_approvers
      JOIN public.profiles ON public.profiles.email = public.meetup_approvers.email
      WHERE public.profiles.id = auth.uid()
      AND public.meetup_approvers.is_active = true
    )
  );

-- Policy: Meetup approvers can update requests (for approval/rejection)
CREATE POLICY "Meetup approvers can update requests"
  ON public.meetup_availability_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetup_approvers
      JOIN public.profiles ON public.profiles.email = public.meetup_approvers.email
      WHERE public.profiles.id = auth.uid()
      AND public.meetup_approvers.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetup_approvers
      JOIN public.profiles ON public.profiles.email = public.meetup_approvers.email
      WHERE public.profiles.id = auth.uid()
      AND public.meetup_approvers.is_active = true
    )
  );

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.meetup_availability_requests
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();
