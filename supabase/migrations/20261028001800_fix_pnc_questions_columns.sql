-- =============================================================================
-- Migration: Ensure pnc_questions and pnc_question_replies have all required columns
-- Reload PostgREST schema cache to resolve missing column errors
-- =============================================================================

ALTER TABLE public.pnc_questions 
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Open',
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS employee_email TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.pnc_question_replies
  ADD COLUMN IF NOT EXISTS question_id UUID REFERENCES public.pnc_questions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS author_name TEXT,
  ADD COLUMN IF NOT EXISTS author_role TEXT,
  ADD COLUMN IF NOT EXISTS reply_text TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Reload PostgREST schema cache so the API recognises the columns immediately
NOTIFY pgrst, 'reload schema';
