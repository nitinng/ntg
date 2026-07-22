-- Remove contact_numbers column from travel_requests table as it's redundant
ALTER TABLE public.travel_requests
DROP COLUMN IF EXISTS contact_numbers;
