-- SUPABASE SCHEMA FOR NAVGURUKUL TRAVEL DESK

-- 1. Profiles Table (Linked to Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  role TEXT DEFAULT 'Employee',
  department TEXT,
  campus TEXT,
  manager_name TEXT,
  manager_email TEXT,
  avatar TEXT,           -- URL to profile picture
  passport_photo JSONB, -- Stores { fileUrl, status, uploadedAt }
  id_proof JSONB,      -- Stores { fileUrl, status, uploadedAt, type }
  phone TEXT CHECK (phone ~ '^\d{10}$'),
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT CHECK (emergency_contact_phone ~ '^\d{10}$'),
  emergency_contact_relation TEXT,
  blood_group TEXT,
  medical_conditions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Travel Requests Table
CREATE TABLE IF NOT EXISTS public.travel_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id TEXT,
  requester_id UUID REFERENCES public.profiles(id),
  requester_name TEXT,
  requester_email TEXT,
  requester_phone TEXT,
  requester_department TEXT,
  requester_campus TEXT,
  purpose TEXT NOT NULL,
  approving_manager_name TEXT,
  approving_manager_email TEXT,
  trip_type TEXT, -- 'One-way' or 'Round-trip'
  travel_mode TEXT, -- 'Flight', 'Train', 'Bus'
  from_location TEXT,
  to_location TEXT,
  date_of_travel DATE,
  preferred_departure_window TEXT,
  return_date DATE,
  return_preferred_departure_window TEXT,
  number_of_travelers INTEGER DEFAULT 1,
  traveller_names TEXT,
  contact_numbers TEXT,
  priority TEXT DEFAULT 'Medium',
  special_requirements TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  blood_group TEXT,
  medical_conditions TEXT,
  approval_status TEXT DEFAULT 'Pending',
  pnc_status TEXT DEFAULT 'Not Started',
  ticket_cost NUMERIC,
  vendor_name TEXT,
  timeline JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Trigger for new auth users to create a profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email, 'Employee');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. RLS POLICIES (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_requests ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can see/update their own; Admins see/update all
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
);
CREATE POLICY "Admins update all profiles" ON public.profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
);

-- Requests: Employee sees own, Admin/PNC/Finance see all
CREATE POLICY "Employees view own requests" ON public.travel_requests FOR SELECT USING (auth.uid() = requester_id);
CREATE POLICY "Employees insert own requests" ON public.travel_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Admins view all requests" ON public.travel_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC', 'Finance'))
);
CREATE POLICY "Admins update all requests" ON public.travel_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC', 'Finance'))
);
