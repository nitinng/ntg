-- =============================================================================
-- Migration: Add discussion resolution tracking to travel_requests
-- Captures who marked it resolved, when, and how long the resolution took
-- =============================================================================

ALTER TABLE public.travel_requests
  ADD COLUMN IF NOT EXISTS comments_resolved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS comments_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comments_resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS comments_resolved_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comments_resolution_duration_ms BIGINT;

CREATE INDEX IF NOT EXISTS idx_travel_requests_comments_resolved ON public.travel_requests(comments_resolved);

NOTIFY pgrst, 'reload schema';
