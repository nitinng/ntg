-- Add is_finalized column to meetup_availability_requests
ALTER TABLE public.meetup_availability_requests 
ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN DEFAULT FALSE;
