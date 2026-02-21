-- Migration to add 'booked_by' column to identifying the booking source (PNC vs Self)

ALTER TABLE travel_requests 
ADD COLUMN booked_by text DEFAULT 'PNC';

COMMENT ON COLUMN travel_requests.booked_by IS 'Identifier for who booked the ticket: "PNC" (default) or "SELF" (employee self-booking)';
