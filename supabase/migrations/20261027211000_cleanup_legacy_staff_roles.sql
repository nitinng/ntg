-- =============================================================================
-- Migration: Cleanup Legacy Staff Roles and Restore Desk Scope
-- =============================================================================
-- Backs up affected profiles first, then updates accounts not in the approved
-- 7-person desk team from 'Admin'/'PNC'/'PNC Admin' to 'Employee'.
-- This prevents former volunteers or unmapped accounts from receiving desk emails
-- or seeing operations queues.
-- =============================================================================

-- 1. Safe backup of current staff profiles
CREATE TABLE IF NOT EXISTS public.profiles_role_backup_20261027 (
  id UUID PRIMARY KEY,
  email TEXT,
  role TEXT,
  updated_at TIMESTAMPTZ,
  backed_up_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.profiles_role_backup_20261027 (id, email, role, updated_at, backed_up_at)
SELECT id, email, role, updated_at, now()
FROM public.profiles
WHERE role IN ('Admin', 'PNC', 'PNC Admin')
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  updated_at = EXCLUDED.updated_at,
  backed_up_at = now();

-- 2. Revert non-desk accounts to Employee role
UPDATE public.profiles
SET role = 'Employee',
    updated_at = now()
WHERE role IN ('Admin', 'PNC', 'PNC Admin')
  AND lower(trim(email)) NOT IN (
    'nitin.s@navgurukul.org',
    'travel@navgurukul.org',
    'aayushi.b@navgurukul.org',
    'praveenlingam@navgurukul.org',
    'neha.p@navgurukul.org',
    'shreyamishra@navgurukul.org',
    'pranjal.t@navgurukul.org'
  );
