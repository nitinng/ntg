-- =============================================================================
-- PNC Admin RLS parity
-- =============================================================================
-- types.ts defines UserRole.PNC_ADMIN = 'PNC Admin' and UserRoleManagement.tsx
-- offers it as an assignable role, but almost every policy in this schema lists
-- only 'Admin', 'PNC', 'Finance'. A user whose profiles.role = 'PNC Admin'
-- therefore falls through to the *employee* branch of each policy: the UI shows
-- them the Queue, All Requests, mail templates and Sent Mails, while the
-- database returns only their own rows.
--
-- 20261008100100 called this out and worked around it for two tables. This
-- migration closes it across the schema.
--
-- Two rules decide what gets 'PNC Admin' added:
--
--   A. PARITY -- the policy already lists 'PNC'. PNC Admin is a strict superset
--      of PNC in the app's own promotion model (App.tsx 606-640: a PNC Admin
--      may promote to Employee/PNC/PNC Admin, a PNC may not), so any policy
--      naming 'PNC' must name 'PNC Admin'.
--
--   B. UI-IMPLIED -- the policy is Admin-only, but a client screen already
--      renders an editor for PNC Admin, so the write is attempted and fails.
--      These are listed individually below with the screen that grants it.
--
-- NOT CHANGED, deliberately:
--   - mail_templates "Staff view all templates" (20260928060000) is
--     USING (auth.role() = 'authenticated') -- no role list to extend.
--   - request_counters (20261008120000) intentionally has no policies.
--   - Nothing from the 8 Oct RLS hardening is loosened; 20261008100100,
--     20261008100200 and 20261008110000 already name 'PNC Admin'.
--
-- INVENTORY (table | policy | live source | rule)
--   profiles                     | Staff view all profiles                   | supabase_schema.sql:147            | A
--   profiles                     | Staff update all profiles                 | supabase_schema.sql:155            | A
--   profiles                     | guard_profile_self_update() [function]    | 20261008100000                     | A
--   travel_requests              | Admins view all requests                  | supabase_schema.sql:167            | A
--   travel_requests              | Admins update all requests                | supabase_schema.sql:173            | A
--   travel_requests              | guard_requester_request_update() [func]   | 20261005120000                     | A
--   advances                     | PNC and Finance can view and edit advances| supabase_schema.sql:195            | A
--   cancellation_records         | Admins view all cancellations             | supabase_schema.sql:242            | A
--   cancellation_records         | Admins insert cancellations               | supabase_schema.sql:250            | A
--   cancellation_records         | Admins update cancellations               | supabase_schema.sql:253            | A
--   cancellation_records         | Admins manage cancellations               | supabase_schema.sql:256            | A
--   refund_entries               | Admins manage refunds                     | supabase_schema.sql:271            | A
--   departments                  | Admins manage departments                 | 20260726161500                     | A
--   email_queue                  | Staff can view email queue                | 20260723140000                     | A
--   email_audit_logs             | Staff can view email audit logs           | 20260927140000                     | A
--   email_reminder_log           | Staff can view reminder log               | 20260927110000                     | A
--   email_routing_settings       | Staff can view email routing settings     | 20260927110000                     | A
--   mail_template_history        | Staff can view template history           | 20260928040000                     | A
--   meetup_approvers             | Admins and PNC can manage meetup approvers| 20260219142015                     | A
--   ticket_status_history        | Users can view own ticket history         | 20260723140000                     | A
--   ticket_violations            | Users can view own violations             | 20260723140000                     | A
--   mail_templates               | Admins manage templates                   | 20260101000000                     | B (MailTemplatesView.tsx:242)
--   mail_template_history        | Admins manage template history            | 20260927110000                     | B (MailTemplatesView.tsx:322 writes it)
--   email_routing_settings       | Admins manage email routing settings      | 20260927110000                     | B (EmailSettingsView.tsx:45)
--   email_audit_logs             | Admins manage email audit logs            | 20260927140000                     | B (logEmailAuditAction on settings save)
--   sla_configs                  | Admins can manage SLA configs             | 20260723150000                     | B (PolicyManagement.tsx:419; Policies tab is PNC-Admin-only, App.tsx:1180)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff view all profiles" ON public.profiles;
CREATE POLICY "Staff view all profiles" ON public.profiles FOR SELECT USING (
  public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin')
);

DROP POLICY IF EXISTS "Staff update all profiles" ON public.profiles;
CREATE POLICY "Staff update all profiles" ON public.profiles FOR UPDATE USING (
  public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin')
);

-- ---------------------------------------------------------------------------
-- travel_requests
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins view all requests" ON public.travel_requests;
CREATE POLICY "Admins view all requests" ON public.travel_requests FOR SELECT USING (
  public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
);

DROP POLICY IF EXISTS "Admins update all requests" ON public.travel_requests;
CREATE POLICY "Admins update all requests" ON public.travel_requests FOR UPDATE USING (
  public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
);

-- ---------------------------------------------------------------------------
-- advances / cancellation_records / refund_entries
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "PNC and Finance can view and edit advances" ON public.advances;
CREATE POLICY "PNC and Finance can view and edit advances" ON public.advances
  FOR ALL USING (
    public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
  );

DROP POLICY IF EXISTS "Admins view all cancellations" ON public.cancellation_records;
CREATE POLICY "Admins view all cancellations" ON public.cancellation_records
  FOR SELECT USING (public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance'));

DROP POLICY IF EXISTS "Admins insert cancellations" ON public.cancellation_records;
CREATE POLICY "Admins insert cancellations" ON public.cancellation_records
  FOR INSERT WITH CHECK (public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance'));

DROP POLICY IF EXISTS "Admins update cancellations" ON public.cancellation_records;
CREATE POLICY "Admins update cancellations" ON public.cancellation_records
  FOR UPDATE USING (public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance'));

DROP POLICY IF EXISTS "Admins manage cancellations" ON public.cancellation_records;
CREATE POLICY "Admins manage cancellations" ON public.cancellation_records
  FOR ALL USING (public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance'));

DROP POLICY IF EXISTS "Admins manage refunds" ON public.refund_entries;
CREATE POLICY "Admins manage refunds" ON public.refund_entries
  FOR ALL USING (public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance'));

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments
  FOR ALL USING (public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance'));

-- ---------------------------------------------------------------------------
-- Email notification centre tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view email queue" ON public.email_queue;
CREATE POLICY "Staff can view email queue" ON public.email_queue
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'PNC', 'PNC Admin')
  )
);

DROP POLICY IF EXISTS "Staff can view email audit logs" ON public.email_audit_logs;
CREATE POLICY "Staff can view email audit logs"
  ON public.email_audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC', 'PNC Admin')));

-- Rule B: EmailSettingsView.tsx:45 renders the settings editor for PNC Admin,
-- and every save calls logEmailAuditAction(), which inserts here. Admin-only
-- writes made that audit entry fail silently for a PNC Admin.
DROP POLICY IF EXISTS "Admins manage email audit logs" ON public.email_audit_logs;
CREATE POLICY "Admins manage email audit logs"
  ON public.email_audit_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC Admin')));

DROP POLICY IF EXISTS "Staff can view reminder log" ON public.email_reminder_log;
CREATE POLICY "Staff can view reminder log"
  ON public.email_reminder_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC', 'PNC Admin')));

DROP POLICY IF EXISTS "Staff can view email routing settings" ON public.email_routing_settings;
CREATE POLICY "Staff can view email routing settings"
  ON public.email_routing_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC', 'PNC Admin')));

-- Rule B: EmailSettingsView.tsx:45.
DROP POLICY IF EXISTS "Admins manage email routing settings" ON public.email_routing_settings;
CREATE POLICY "Admins manage email routing settings"
  ON public.email_routing_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC Admin')));

-- ---------------------------------------------------------------------------
-- Mail templates
-- ---------------------------------------------------------------------------
-- Rule B: MailTemplatesView.tsx:242 sets canEdit for PNC Admin.
DROP POLICY IF EXISTS "Admins manage templates" ON public.mail_templates;
CREATE POLICY "Admins manage templates"
  ON public.mail_templates FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC Admin'))
  );

DROP POLICY IF EXISTS "Staff can view template history" ON public.mail_template_history;
CREATE POLICY "Staff can view template history"
  ON public.mail_template_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC', 'PNC Admin', 'Finance'))
    OR auth.role() = 'authenticated'
  );

-- Rule B: saving a template writes a history row from the client
-- (MailTemplatesView.tsx:322), so the editor and the history must agree.
DROP POLICY IF EXISTS "Admins manage template history" ON public.mail_template_history;
CREATE POLICY "Admins manage template history"
  ON public.mail_template_history FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC Admin'))
  );

-- ---------------------------------------------------------------------------
-- SLA configs -- Rule B: the Policies tab is PNC-Admin-only (App.tsx:1180) and
-- PolicyManagement.tsx:419 renders its editor, but writes were Admin-only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage SLA configs" ON public.sla_configs;
CREATE POLICY "Admins can manage SLA configs" ON public.sla_configs
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC Admin'))
  );

-- ---------------------------------------------------------------------------
-- Meetup approvers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and PNC can manage meetup approvers" ON public.meetup_approvers;
CREATE POLICY "Admins and PNC can manage meetup approvers"
  ON public.meetup_approvers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'PNC', 'PNC Admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Ticket state-machine tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own ticket history" ON public.ticket_status_history;
CREATE POLICY "Users can view own ticket history" ON public.ticket_status_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.travel_requests
    WHERE travel_requests.id = ticket_status_history.ticket_id
    AND (
      travel_requests.requester_id = auth.uid()
      OR travel_requests.approving_manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
  )
);

DROP POLICY IF EXISTS "Users can view own violations" ON public.ticket_violations;
CREATE POLICY "Users can view own violations" ON public.ticket_violations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.travel_requests
    WHERE travel_requests.id = ticket_violations.ticket_id
    AND (
      travel_requests.requester_id = auth.uid()
      OR travel_requests.approving_manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
  )
);

-- ---------------------------------------------------------------------------
-- Trigger guards
-- ---------------------------------------------------------------------------
-- 20261008100000 pins identity/role/document-status on a self-update and exempts
-- staff. A PNC Admin editing their OWN profile row was treated as an employee.
-- They belong in the exempt list: App.tsx 606-640 lets a PNC Admin change roles,
-- which is the capability this guard is protecting.
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS TRIGGER AS $guard_profile_self_update$
BEGIN
  IF auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM OLD.id
     OR COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC', 'PNC Admin')
  THEN
    RETURN NEW;
  END IF;

  NEW.id    := OLD.id;
  NEW.email := OLD.email;
  NEW.role  := OLD.role;

  NEW.passport_photo := public.pin_document_status(OLD.passport_photo, NEW.passport_photo);
  NEW.id_proof       := public.pin_document_status(OLD.id_proof, NEW.id_proof);

  RETURN NEW;
END;
$guard_profile_self_update$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 20261005120000 pins booking/finance columns when a requester edits their own
-- request. A PNC Admin who is also the traveller could therefore not record
-- their own ticket cost or invoice. Staff exemption extended to match.
CREATE OR REPLACE FUNCTION public.guard_requester_request_update()
RETURNS TRIGGER AS $guard_requester_request_update$
BEGIN
  IF auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM OLD.requester_id
     OR COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
  THEN
    RETURN NEW;
  END IF;

  NEW.id              := OLD.id;
  NEW.submission_id   := OLD.submission_id;
  NEW.requester_id    := OLD.requester_id;
  NEW.created_at      := OLD.created_at;

  NEW.approval_status := OLD.approval_status;

  NEW.ticket_cost     := OLD.ticket_cost;
  NEW.invoice_url     := OLD.invoice_url;
  NEW.vendor_name     := OLD.vendor_name;
  NEW.booking_status  := OLD.booking_status;
  NEW.payment_source  := OLD.payment_source;
  NEW.advance_id      := OLD.advance_id;
  NEW.split_tickets   := OLD.split_tickets;
  NEW.booked_by       := OLD.booked_by;

  RETURN NEW;
END;
$guard_requester_request_update$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers are recreated so a re-run of this migration leaves a consistent
-- binding even if the earlier migration has not been applied in this database.
DROP TRIGGER IF EXISTS trg_guard_profile_self_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_self_update();

DROP TRIGGER IF EXISTS trg_guard_requester_request_update ON public.travel_requests;
CREATE TRIGGER trg_guard_requester_request_update
BEFORE UPDATE ON public.travel_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_requester_request_update();
