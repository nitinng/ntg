-- =============================================================================
-- Migration: Ticket Comments & Central Notification Settings
-- =============================================================================
-- 1. ticket_comments: Slack-style comment thread on request stubs between
--    requester, manager, and PnC/Admin. Append-only, with edit flag & timestamp.
-- 2. comment_notifications_enabled: Central platform-wide setting in settings,
--    viewable and editable by Admin, PNC Admin, and Admin, with change audit log.
-- =============================================================================

-- 1. Create ticket_comments table
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  mentions JSONB DEFAULT '[]'::jsonb, -- Array of email/id strings
  is_edited BOOLEAN DEFAULT false NOT NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_created ON public.ticket_comments(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_author ON public.ticket_comments(author_id);

-- 2. RLS for ticket_comments
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Staff, or requester, or approving manager
DROP POLICY IF EXISTS "Participants view ticket comments" ON public.ticket_comments;
CREATE POLICY "Participants view ticket comments" ON public.ticket_comments
  FOR SELECT USING (
    public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC')
    OR EXISTS (
      SELECT 1 FROM public.travel_requests tr
      WHERE tr.id = ticket_comments.ticket_id
        AND (
          tr.requester_id = auth.uid()
          OR lower(tr.approving_manager_email) = (SELECT lower(email) FROM public.profiles WHERE id = auth.uid())
        )
    )
  );

-- INSERT policy: Staff, or requester, or approving manager
DROP POLICY IF EXISTS "Participants insert ticket comments" ON public.ticket_comments;
CREATE POLICY "Participants insert ticket comments" ON public.ticket_comments
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND (
      public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC')
      OR EXISTS (
        SELECT 1 FROM public.travel_requests tr
        WHERE tr.id = ticket_comments.ticket_id
          AND (
            tr.requester_id = auth.uid()
            OR lower(tr.approving_manager_email) = (SELECT lower(email) FROM public.profiles WHERE id = auth.uid())
          )
      )
    )
  );

-- UPDATE policy: Author can edit comment text, setting is_edited = true
DROP POLICY IF EXISTS "Authors can edit own comment text" ON public.ticket_comments;
CREATE POLICY "Authors can edit own comment text" ON public.ticket_comments
  FOR UPDATE USING (
    auth.uid() = author_id
  ) WITH CHECK (
    auth.uid() = author_id
  );

-- Note: Append-only design - NO DELETE policy is created.

-- 3. Settings Audit Log for central comment notification settings
CREATE TABLE IF NOT EXISTS public.setting_change_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  changed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.setting_change_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view setting change logs" ON public.setting_change_logs;
CREATE POLICY "Staff view setting change logs" ON public.setting_change_logs
  FOR SELECT USING (
    public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC')
  );

DROP POLICY IF EXISTS "Staff insert setting change logs" ON public.setting_change_logs;
CREATE POLICY "Staff insert setting change logs" ON public.setting_change_logs
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('Admin', 'PNC Admin')
  );

-- Seed central comment notifications setting
INSERT INTO public.settings (setting_key, setting_value, updated_at)
VALUES (
  'comment_notifications_enabled',
  'true'::jsonb,
  now()
)
ON CONFLICT (setting_key) DO NOTHING;
