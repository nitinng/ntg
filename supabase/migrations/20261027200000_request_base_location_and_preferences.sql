-- =============================================================================
-- Migration: Add Base Location, Travel Preferences, and Screenshot to Requests
-- =============================================================================
-- 1. base_location: Required field for NavGurukul campus / Remote.
-- 2. remote_location_details: Exact city / location when base_location is 'Remote'.
-- 3. travel_preferences: Optional text notes (preferred flight/train number, notes).
-- 4. screenshot_url: Optional image/PDF screenshot upload path.
-- =============================================================================

ALTER TABLE public.travel_requests
  ADD COLUMN IF NOT EXISTS base_location TEXT,
  ADD COLUMN IF NOT EXISTS remote_location_details TEXT,
  ADD COLUMN IF NOT EXISTS travel_preferences TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT;

COMMENT ON COLUMN public.travel_requests.base_location IS
  'Base location/campus picked on every request (e.g. Pune, Delhi, Remote).';

COMMENT ON COLUMN public.travel_requests.remote_location_details IS
  'Exact remote city or work location when base_location is Remote.';

COMMENT ON COLUMN public.travel_requests.travel_preferences IS
  'Optional requester preferences (preferred flight/train number, timing notes).';

COMMENT ON COLUMN public.travel_requests.screenshot_url IS
  'Private storage path to itinerary/fare screenshot uploaded during request creation.';
