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

-- Helper function to prevent infinite recursion in RLS policies
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Travel Requests Table
CREATE TABLE IF NOT EXISTS public.travel_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id TEXT UNIQUE, -- Automatically generated via trigger
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
  invoice_url TEXT,
  vendor_name TEXT,
  timeline JSONB DEFAULT '[]',
  resubmission_count INTEGER DEFAULT 0 NOT NULL,
  on_hold_since TIMESTAMPTZ,
  cancelled_reason TEXT,
  status_change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2b. Request Counters for Readable IDs
CREATE TABLE IF NOT EXISTS public.request_counters (
  date_code TEXT, -- YYMMDD
  trip_type TEXT, -- O or R
  last_seq INT DEFAULT 0,
  PRIMARY KEY (date_code, trip_type)
);

-- 2c. Function to generate readable Submission ID (TRV-[TripType]-[YYMMDD]-[Sequence])
CREATE OR REPLACE FUNCTION generate_submission_id()
RETURNS TRIGGER AS $$
DECLARE
    trip_code TEXT;
    date_str TEXT;
    seq_num INT;
BEGIN
    IF NEW.trip_type = 'One-way' THEN
        trip_code := 'O';
    ELSIF NEW.trip_type = 'Round-trip' THEN
        trip_code := 'R';
    ELSE
        trip_code := 'X';
    END IF;

    date_str := to_char(CURRENT_DATE, 'YYMMDD');

    INSERT INTO public.request_counters (date_code, trip_type, last_seq)
    VALUES (date_str, trip_code, 1)
    ON CONFLICT (date_code, trip_type)
    DO UPDATE SET last_seq = request_counters.last_seq + 1
    RETURNING last_seq INTO seq_num;

    NEW.submission_id := 'TRV-' || trip_code || '-' || date_str || '-' || LPAD(seq_num::TEXT, 3, '0');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2d. Trigger to auto-generate submission_id before insert
DROP TRIGGER IF EXISTS trg_generate_submission_id ON public.travel_requests;
CREATE TRIGGER trg_generate_submission_id
BEFORE INSERT ON public.travel_requests
FOR EACH ROW
EXECUTE FUNCTION generate_submission_id();

-- 3. Trigger for new auth users to create a profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email, 'Employee');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. RLS POLICIES (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_requests ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can see/update their own; Staff can view all; Admins/PNC update all
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Staff (Admin/PNC) can view all profiles
DROP POLICY IF EXISTS "Staff view all profiles" ON public.profiles;
CREATE POLICY "Staff view all profiles" ON public.profiles FOR SELECT USING (
  public.get_user_role() IN ('Admin', 'PNC')
);

-- Admin can update anything, PNC can update profiles (checks role in UI)
DROP POLICY IF EXISTS "Staff update all profiles" ON public.profiles;
CREATE POLICY "Staff update all profiles" ON public.profiles FOR UPDATE USING (
  public.get_user_role() IN ('Admin', 'PNC')
);

-- Requests: Employee sees own, Admin/PNC/Finance see all
DROP POLICY IF EXISTS "Employees view own requests" ON public.travel_requests;
CREATE POLICY "Employees view own requests" ON public.travel_requests FOR SELECT USING (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Employees insert own requests" ON public.travel_requests;
CREATE POLICY "Employees insert own requests" ON public.travel_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Admins view all requests" ON public.travel_requests;
CREATE POLICY "Admins view all requests" ON public.travel_requests FOR SELECT USING (
  public.get_user_role() IN ('Admin', 'PNC', 'Finance')
);

DROP POLICY IF EXISTS "Admins update all requests" ON public.travel_requests;
CREATE POLICY "Admins update all requests" ON public.travel_requests FOR UPDATE USING (
  public.get_user_role() IN ('Admin', 'PNC', 'Finance')
);

-- 5. Advances Table for PNC
CREATE TABLE IF NOT EXISTS public.advances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  amount_received NUMERIC NOT NULL,
  amount_left NUMERIC NOT NULL,
  received_from TEXT NOT NULL,
  received_on DATE NOT NULL,
  receipt_id TEXT,
  comments TEXT,
  changelog JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Advances
ALTER TABLE public.advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PNC and Finance can view and edit advances" ON public.advances;
CREATE POLICY "PNC and Finance can view and edit advances" ON public.advances
  FOR ALL USING (
    public.get_user_role() IN ('Admin', 'PNC', 'Finance')
  );

-- 6. Link Travel Requests to Advances
ALTER TABLE public.travel_requests ADD COLUMN IF NOT EXISTS advance_id UUID REFERENCES public.advances(id);

ALTER TABLE public.advances ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.advances ADD COLUMN IF NOT EXISTS is_settled BOOLEAN DEFAULT false;

-- 7. Ticket Cancellation & Reconciliation Tables

ALTER TABLE public.travel_requests ADD COLUMN IF NOT EXISTS payment_source TEXT CHECK (payment_source IN ('Advance', 'Direct', 'Not Yet Entered')) DEFAULT 'Not Yet Entered';
ALTER TABLE public.travel_requests ADD COLUMN IF NOT EXISTS booking_status TEXT CHECK (booking_status IN ('Booked', 'Cancelled', 'Partially Cancelled', 'Reconciled'));

-- 7. Ticket Cancellation & Reconciliation Tables

ALTER TABLE public.travel_requests ADD COLUMN IF NOT EXISTS payment_source TEXT CHECK (payment_source IN ('Advance', 'Direct', 'Not Yet Entered')) DEFAULT 'Not Yet Entered';
ALTER TABLE public.travel_requests ADD COLUMN IF NOT EXISTS booking_status TEXT CHECK (booking_status IN ('Booked', 'Cancelled', 'Partially Cancelled', 'Reconciled'));
ALTER TABLE public.travel_requests ADD COLUMN IF NOT EXISTS split_tickets JSONB DEFAULT '[]'::jsonb;

-- Drop travel_legs table if it exists (we are using split_tickets JSONB on travel_requests)
DROP TABLE IF EXISTS public.travel_legs CASCADE;

CREATE TABLE IF NOT EXISTS public.cancellation_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  travel_request_id UUID REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  leg_id TEXT, -- References client-side generated leg ID string in split_tickets JSONB
  cancelled_by TEXT CHECK (cancelled_by IN ('Employee', 'Org')),
  cancellation_date TIMESTAMPTZ DEFAULT NOW(),
  policy_navgurukul_cover_percent NUMERIC NOT NULL,
  policy_employee_cover_percent NUMERIC NOT NULL,
  original_fare NUMERIC NOT NULL,
  net_unrecovered_amount NUMERIC DEFAULT 0,
  employee_owed_amount NUMERIC DEFAULT 0,
  org_absorbed_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Pending Refund' CHECK (status IN ('Pending Refund', 'Partially Refunded', 'Fully Refunded', 'Written Off', 'Reconciled', 'Disputed')),
  advance_id UUID REFERENCES public.advances(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.cancellation_records ENABLE ROW LEVEL SECURITY;

-- Policies for cancellation_records
DROP POLICY IF EXISTS "Admins view all cancellations" ON public.cancellation_records;
CREATE POLICY "Admins view all cancellations" ON public.cancellation_records FOR SELECT USING (public.get_user_role() IN ('Admin', 'PNC', 'Finance'));

DROP POLICY IF EXISTS "Employees view own cancellations" ON public.cancellation_records;
CREATE POLICY "Employees view own cancellations" ON public.cancellation_records FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.travel_requests WHERE id = travel_request_id AND requester_id = auth.uid())
);

DROP POLICY IF EXISTS "Admins insert cancellations" ON public.cancellation_records;
CREATE POLICY "Admins insert cancellations" ON public.cancellation_records FOR INSERT WITH CHECK (public.get_user_role() IN ('Admin', 'PNC', 'Finance'));

DROP POLICY IF EXISTS "Admins update cancellations" ON public.cancellation_records;
CREATE POLICY "Admins update cancellations" ON public.cancellation_records FOR UPDATE USING (public.get_user_role() IN ('Admin', 'PNC', 'Finance'));

DROP POLICY IF EXISTS "Admins manage cancellations" ON public.cancellation_records;
CREATE POLICY "Admins manage cancellations" ON public.cancellation_records FOR ALL USING (public.get_user_role() IN ('Admin', 'PNC', 'Finance'));

CREATE TABLE IF NOT EXISTS public.refund_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cancellation_record_id UUID REFERENCES public.cancellation_records(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  date_received DATE NOT NULL,
  receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.refund_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage refunds" ON public.refund_entries;
CREATE POLICY "Admins manage refunds" ON public.refund_entries FOR ALL USING (public.get_user_role() IN ('Admin', 'PNC', 'Finance'));

DROP POLICY IF EXISTS "Employees view own refunds" ON public.refund_entries;
CREATE POLICY "Employees view own refunds" ON public.refund_entries FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.cancellation_records cr 
    JOIN public.travel_requests tr ON cr.travel_request_id = tr.id 
    WHERE cr.id = cancellation_record_id AND tr.requester_id = auth.uid()
  )
);

-- Atomic advance balance update function
CREATE OR REPLACE FUNCTION public.update_advance_balance(
  p_advance_id UUID,
  p_amount_delta NUMERIC,
  p_changelog_entry JSONB
) RETURNS NUMERIC AS $$
DECLARE
  v_new_amount NUMERIC;
  v_updated_entry JSONB;
BEGIN
  -- 1. Perform atomic update
  UPDATE public.advances
  SET 
    amount_left = amount_left + p_amount_delta,
    updated_at = NOW()
  WHERE id = p_advance_id
  RETURNING amount_left INTO v_new_amount;

  -- 2. Modify the changelog entry to append the new active balance
  v_updated_entry := p_changelog_entry || jsonb_build_object(
    'details', 
    (p_changelog_entry->>'details') || ' Active balance: ₹' || v_new_amount || '.'
  );

  -- 3. Update the changelog array
  UPDATE public.advances
  SET changelog = COALESCE(changelog, '[]'::jsonb) || jsonb_build_array(v_updated_entry)
  WHERE id = p_advance_id;

  RETURN v_new_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

