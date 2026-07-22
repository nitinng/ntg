-- Migration to add 'booked_by' column identifying the booking source (PNC vs Self)

ALTER TABLE public.travel_requests 
ADD COLUMN IF NOT EXISTS booked_by text DEFAULT 'PNC';

COMMENT ON COLUMN public.travel_requests.booked_by IS 'Identifier for who booked the ticket: "PNC" (default) or "SELF" (employee self-booking)';
