-- Add attendee_emails column to meetup_availability_requests
ALTER TABLE public.meetup_availability_requests 
ADD COLUMN IF NOT EXISTS attendee_emails JSONB DEFAULT '[]'::jsonb;
