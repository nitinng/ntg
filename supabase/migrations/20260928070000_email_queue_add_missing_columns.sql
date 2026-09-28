-- Migration: Add missing email_queue columns needed by emailTriggers.ts
-- The original table (20260723140000) didn't have event/audience/template columns.
-- The code inserts them but they were never added to the remote schema.

-- Add missing columns
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS event          TEXT,
  ADD COLUMN IF NOT EXISTS audience       TEXT,
  ADD COLUMN IF NOT EXISTS context_key    TEXT,
  ADD COLUMN IF NOT EXISTS template_key   TEXT,
  ADD COLUMN IF NOT EXISTS template_name  TEXT;

-- Allow ticket_id to be NULL (standalone/test emails have no ticket)
ALTER TABLE public.email_queue
  ALTER COLUMN ticket_id DROP NOT NULL;

-- Allow to_status to be NULL (not all queue events have a status transition)
ALTER TABLE public.email_queue
  ALTER COLUMN to_status DROP NOT NULL;
