-- Migration: Allow all authenticated staff (Admin, PNC, Finance) to read mail templates and history
DROP POLICY IF EXISTS "Staff view all templates" ON public.mail_templates;
CREATE POLICY "Staff view all templates"
  ON public.mail_templates FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC', 'Finance'))
    OR auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Staff can view template history" ON public.mail_template_history;
CREATE POLICY "Staff can view template history"
  ON public.mail_template_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC', 'Finance'))
    OR auth.role() = 'authenticated'
  );
