-- =============================================================================
-- Migration: Create/Repair pnc_questions and pnc_question_replies
-- Self-contained: creates tables if not present, adds any missing columns,
-- and configures RLS policies so authenticated users can submit questions and replies.
-- =============================================================================

-- 1. Create pnc_questions if it does not exist
CREATE TABLE IF NOT EXISTS public.pnc_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_name TEXT,
  employee_email TEXT,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  status TEXT DEFAULT 'Open' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Ensure all columns exist even if the table was created earlier with a partial schema
ALTER TABLE public.pnc_questions 
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS question TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Open',
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS employee_email TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Drop NOT NULL on legacy question and asker_* columns if present from prior schema
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pnc_questions' AND column_name = 'question') THEN
    ALTER TABLE public.pnc_questions ALTER COLUMN question DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pnc_questions' AND column_name = 'asker_id') THEN
    ALTER TABLE public.pnc_questions ALTER COLUMN asker_id DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pnc_questions' AND column_name = 'asker_name') THEN
    ALTER TABLE public.pnc_questions ALTER COLUMN asker_name DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pnc_questions' AND column_name = 'asker_email') THEN
    ALTER TABLE public.pnc_questions ALTER COLUMN asker_email DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pnc_questions_employee ON public.pnc_questions(employee_id);
CREATE INDEX IF NOT EXISTS idx_pnc_questions_status ON public.pnc_questions(status);

-- 2. Create pnc_question_replies if it does not exist
CREATE TABLE IF NOT EXISTS public.pnc_question_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID REFERENCES public.pnc_questions(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_name TEXT,
  author_role TEXT,
  reply_text TEXT NOT NULL DEFAULT '',
  is_edited BOOLEAN DEFAULT false NOT NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Ensure all columns exist on replies
ALTER TABLE public.pnc_question_replies
  ADD COLUMN IF NOT EXISTS question_id UUID REFERENCES public.pnc_questions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS author_name TEXT,
  ADD COLUMN IF NOT EXISTS author_role TEXT,
  ADD COLUMN IF NOT EXISTS reply_text TEXT,
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_pnc_replies_question ON public.pnc_question_replies(question_id, created_at ASC);

-- 3. Configure RLS for pnc_questions
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
  USING (true);

DROP POLICY IF EXISTS "Staff and authors can update questions" ON public.pnc_questions;
CREATE POLICY "Staff and authors can update questions" ON public.pnc_questions
  FOR UPDATE TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC')
  );

-- 4. Configure RLS for pnc_question_replies
ALTER TABLE public.pnc_question_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants view replies" ON public.pnc_question_replies;
CREATE POLICY "Participants view replies" ON public.pnc_question_replies
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Participants insert replies" ON public.pnc_question_replies;
CREATE POLICY "Participants insert replies" ON public.pnc_question_replies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
