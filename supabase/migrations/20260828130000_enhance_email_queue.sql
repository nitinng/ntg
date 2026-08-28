-- ============================================================
-- Migration: Enhance email_queue table for provider-agnostic
-- delivery, idempotency, and bounded retry tracking
-- ============================================================

-- Add optional columns with safe defaults (100% backward-compatible)
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS cc TEXT[] DEFAULT '{}'::text[];
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS bcc TEXT[] DEFAULT '{}'::text[];

-- Allow standalone test emails without requiring a travel request ticket_id
ALTER TABLE public.email_queue ALTER COLUMN ticket_id DROP NOT NULL;
ALTER TABLE public.email_queue ALTER COLUMN to_status DROP NOT NULL;

-- Update status check constraint if needed to include 'Processing'
ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_status_check;
ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_status_check 
  CHECK (status IN ('Pending', 'Processing', 'Sent', 'Failed'));

-- Indexes for high-throughput worker querying and duplicate prevention
CREATE INDEX IF NOT EXISTS idx_email_queue_pending_poll 
  ON public.email_queue (status, available_at) 
  WHERE status IN ('Pending', 'Processing');

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_idempotency 
  ON public.email_queue (idempotency_key) 
  WHERE idempotency_key IS NOT NULL;
