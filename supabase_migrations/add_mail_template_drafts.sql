-- Add is_draft column to mail_templates table
ALTER TABLE public.mail_templates
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT FALSE;

-- Drafts don't need a unique status_trigger (multiple drafts for same status are ok)
-- Drop the UNIQUE constraint on status_trigger so drafts can coexist with published templates
ALTER TABLE public.mail_templates
  DROP CONSTRAINT IF EXISTS mail_templates_status_trigger_key;

-- Add a partial unique index: only published (non-draft) templates must be unique per status_trigger
CREATE UNIQUE INDEX IF NOT EXISTS mail_templates_published_unique
  ON public.mail_templates (status_trigger)
  WHERE is_draft = FALSE;
