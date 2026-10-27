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

-- Ensure RLS allows all authenticated users to ask questions and post replies
ALTER TABLE public.pnc_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can create questions" ON public.pnc_questions;
DROP POLICY IF EXISTS "Anyone authenticated can create questions" ON public.pnc_questions;
CREATE POLICY "Anyone authenticated can create questions" ON public.pnc_questions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Requesters view own questions, staff view all" ON public.pnc_questions;
DROP POLICY IF EXISTS "Anyone authenticated can view questions" ON public.pnc_questions;
CREATE POLICY "Anyone authenticated can view questions" ON public.pnc_questions
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC', 'Manager')
    OR true
  );

DROP POLICY IF EXISTS "Staff and authors can update questions" ON public.pnc_questions;
CREATE POLICY "Staff and authors can update questions" ON public.pnc_questions
  FOR UPDATE TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC')
  );

-- Replies RLS
ALTER TABLE public.pnc_question_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants view replies" ON public.pnc_question_replies;
CREATE POLICY "Participants view replies" ON public.pnc_question_replies
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Participants insert replies" ON public.pnc_question_replies;
CREATE POLICY "Participants insert replies" ON public.pnc_question_replies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Reload PostgREST schema cache so the API recognises the columns and policies immediately
NOTIFY pgrst, 'reload schema';
