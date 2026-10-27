-- =============================================================================
-- Migration: Manager Lock & Audit Log
-- =============================================================================
-- 1. Employees can set their reporting manager once during Travel Desk profile setup.
--    After that, the manager fields are locked for the employee.
-- 2. Any PnC Admin or Admin can edit an employee's manager.
-- 3. Every change to manager writes to manager_change_logs (employee, old manager,
--    new manager, changed_by, timestamp).
-- =============================================================================

-- 1. Create manager_change_logs table
CREATE TABLE IF NOT EXISTS public.manager_change_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_manager_name TEXT,
  old_manager_email TEXT,
  new_manager_name TEXT,
  new_manager_email TEXT,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_manager_change_logs_employee ON public.manager_change_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_manager_change_logs_created_at ON public.manager_change_logs(created_at DESC);

-- 2. RLS policies for manager_change_logs
ALTER TABLE public.manager_change_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view manager audit logs" ON public.manager_change_logs;
CREATE POLICY "Staff can view manager audit logs" ON public.manager_change_logs
  FOR SELECT USING (
    public.get_user_role() IN ('Admin', 'PNC Admin', 'PNC')
  );

DROP POLICY IF EXISTS "Staff can insert manager audit logs" ON public.manager_change_logs;
CREATE POLICY "Staff can insert manager audit logs" ON public.manager_change_logs
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('Admin', 'PNC Admin')
  );

-- 3. Update guard_profile_self_update to lock manager once set for employees
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Staff keep their current abilities; so do service-role and trigger writes,
  -- where auth.uid() is NULL. Only a user editing their OWN row is constrained.
  IF auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM OLD.id
     OR COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC Admin', 'PNC')
  THEN
    RETURN NEW;
  END IF;

  -- Identity and authorization: never self-writable.
  NEW.id    := OLD.id;
  NEW.email := OLD.email;
  NEW.role  := OLD.role;

  -- Verification outcome is a staff decision, not a self-assertion.
  NEW.passport_photo := public.pin_document_status(OLD.passport_photo, NEW.passport_photo);
  NEW.id_proof       := public.pin_document_status(OLD.id_proof, NEW.id_proof);

  -- Manager lock: Employee sets reporting manager once.
  -- After it has been set once (non-empty), it is locked for self-update.
  IF OLD.manager_email IS NOT NULL AND btrim(OLD.manager_email) <> '' THEN
    NEW.manager_name  := OLD.manager_name;
    NEW.manager_email := OLD.manager_email;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Audit trigger when manager is updated by staff
CREATE OR REPLACE FUNCTION public.trg_log_manager_change()
RETURNS TRIGGER AS $$
DECLARE
  v_changer_name TEXT;
BEGIN
  IF (OLD.manager_email IS DISTINCT FROM NEW.manager_email OR OLD.manager_name IS DISTINCT FROM NEW.manager_name) THEN
    -- Only log if old had a value (i.e. changing an existing manager) or new has a value
    IF (OLD.manager_email IS NOT NULL AND btrim(OLD.manager_email) <> '') OR (NEW.manager_email IS NOT NULL AND btrim(NEW.manager_email) <> '') THEN
      SELECT name INTO v_changer_name FROM public.profiles WHERE id = auth.uid();

      INSERT INTO public.manager_change_logs (
        employee_id,
        old_manager_name,
        old_manager_email,
        new_manager_name,
        new_manager_email,
        changed_by,
        changed_by_name,
        created_at
      ) VALUES (
        NEW.id,
        OLD.manager_name,
        OLD.manager_email,
        NEW.manager_name,
        NEW.manager_email,
        auth.uid(),
        COALESCE(v_changer_name, 'System / Staff'),
        now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_audit_manager_change ON public.profiles;
CREATE TRIGGER trg_audit_manager_change
AFTER UPDATE OF manager_name, manager_email ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_log_manager_change();
