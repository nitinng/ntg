-- =============================================================================
-- Migration: Ask PnC Inquiries and Dynamic FAQ System
-- =============================================================================
-- 1. published_faqs: Database-backed FAQs promoted by PnC Admin, rendered in the
--    Employee Guide FAQ section.
-- 2. pnc_questions: Employee questions to PnC.
-- 3. pnc_question_replies: Thread replies between employee and PnC desk.
-- =============================================================================

-- 1. Published FAQs
CREATE TABLE IF NOT EXISTS public.published_faqs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'General' NOT NULL,
  sort_order INT DEFAULT 0 NOT NULL,
  promoted_from_question_id UUID,
  promoted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_published BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.published_faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view published FAQs" ON public.published_faqs;
CREATE POLICY "Anyone can view published FAQs" ON public.published_faqs
  FOR SELECT TO authenticated
  USING (is_published = true OR public.get_user_role() IN ('Admin', 'PNC Admin'));

DROP POLICY IF EXISTS "PnC Admin manages FAQs" ON public.published_faqs;
CREATE POLICY "PnC Admin manages FAQs" ON public.published_faqs
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('Admin', 'PNC Admin'))
  WITH CHECK (public.get_user_role() IN ('Admin', 'PNC Admin'));

-- 2. PnC Questions Table
CREATE TABLE IF NOT EXISTS public.pnc_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  employee_email TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'Open' NOT NULL CHECK (status IN ('Open', 'Answered', 'Resolved', 'Promoted to FAQ')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pnc_questions_employee ON public.pnc_questions(employee_id);
CREATE INDEX IF NOT EXISTS idx_pnc_questions_status ON public.pnc_questions(status);

ALTER TABLE public.pnc_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Requesters view own questions, staff view all" ON public.pnc_questions;
CREATE POLICY "Requesters view own questions, staff view all" ON public.pnc_questions
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC')
  );

DROP POLICY IF EXISTS "Employees can create questions" ON public.pnc_questions;
CREATE POLICY "Employees can create questions" ON public.pnc_questions
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

DROP POLICY IF EXISTS "Staff and authors can update questions" ON public.pnc_questions;
CREATE POLICY "Staff and authors can update questions" ON public.pnc_questions
  FOR UPDATE TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC')
  );

-- 3. Replies to PnC Questions (Thread component)
CREATE TABLE IF NOT EXISTS public.pnc_question_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.pnc_questions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  reply_text TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false NOT NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pnc_replies_question ON public.pnc_question_replies(question_id, created_at ASC);

ALTER TABLE public.pnc_question_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants view replies" ON public.pnc_question_replies;
CREATE POLICY "Participants view replies" ON public.pnc_question_replies
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC')
    OR EXISTS (
      SELECT 1 FROM public.pnc_questions q
      WHERE q.id = pnc_question_replies.question_id AND q.employee_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants insert replies" ON public.pnc_question_replies;
CREATE POLICY "Participants insert replies" ON public.pnc_question_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC')
      OR EXISTS (
        SELECT 1 FROM public.pnc_questions q
        WHERE q.id = pnc_question_replies.question_id AND q.employee_id = auth.uid()
      )
    )
  );

-- 4. Seed published FAQs with current 8 guide questions
INSERT INTO public.published_faqs (question, answer, sort_order)
VALUES
  (
    'My request still says Not Started. Is it stuck?',
    'No. That''s just the policy check running, and it takes seconds. It''ll move to Processing if you booked with enough notice, or Approval Pending if you didn''t.',
    1
  ),
  (
    'My manager hasn''t responded and it''s been days.',
    'Follow up directly with your manager. If they are on leave or unreachable, contact PNC — they can advise on an alternative approver.',
    2
  ),
  (
    'Can I change a request after submitting it?',
    'Only if it''s been rejected — then use Edit & Resubmit, up to three times. For a request still in progress, cancel it and submit a corrected one.',
    3
  ),
  (
    'I don''t know my travel times yet.',
    'Choose Anytime in the Preferred Time dropdown. It gives PNC the widest search and usually gets you a better fare.',
    4
  ),
  (
    'My temporary access window is about to expire.',
    'Ask PNC or an Admin to review your documents. Once it lapses you can''t submit anything new, but any request already in progress carries on as normal.',
    5
  ),
  (
    'My document was rejected — do I get another grace period?',
    'No. A rejection locks booking straight away. Upload a corrected version and it goes back into the review queue.',
    6
  ),
  (
    'Will cancelling cost me anything?',
    'Not if the ticket hasn''t been bought yet — that''s clean, with no penalty. After booking it depends on why: cancellations driven by the airline or by ops are absorbed by the organisation, while a change in your own plans may leave you owing a share of the fare.',
    7
  ),
  (
    'I''ve used all three resubmissions.',
    'The button locks after the third attempt. Speak to PNC or your manager directly — at that point the issue needs a conversation, then a fresh request.',
    8
  )
ON CONFLICT DO NOTHING;
