-- Migration: Create and Seed Departments Table
-- Timestamp: 20260726161500

-- 1. Create the departments table
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  hod_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policies
DROP POLICY IF EXISTS "Anyone view departments" ON public.departments;
CREATE POLICY "Anyone view departments" ON public.departments 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments 
  FOR ALL USING (public.get_user_role() IN ('Admin', 'PNC', 'Finance'));

-- 4. Seed initial departments
INSERT INTO public.departments (name, hod_name) VALUES
  ('AI LAB', NULL),
  ('CEO Office', 'Nitin Sudarshan'),
  ('Finance', NULL),
  ('Growth – Admissions', NULL),
  ('Growth – Placements', NULL),
  ('PnC', NULL),
  ('Residential', NULL),
  ('Sama', NULL),
  ('SOSC', NULL),
  ('Tech & Product', NULL),
  ('Zuvy', NULL)
ON CONFLICT (name) DO NOTHING;
