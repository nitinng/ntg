-- Create travel_mode_policies table
CREATE TABLE IF NOT EXISTS travel_mode_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  travel_mode TEXT NOT NULL UNIQUE,
  min_advance_days INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default policies
INSERT INTO travel_mode_policies (travel_mode, min_advance_days, description) VALUES
  ('Flight', 7, 'Flights must be booked at least 7 days in advance'),
  ('Train', 3, 'Trains must be booked at least 3 days in advance'),
  ('Bus', 1, 'Buses must be booked at least 1 day in advance')
ON CONFLICT (travel_mode) DO NOTHING;

-- Enable RLS
ALTER TABLE travel_mode_policies ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read
CREATE POLICY "Everyone can read travel mode policies"
  ON travel_mode_policies
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only PNC and Admin can update
CREATE POLICY "PNC and Admin can update travel mode policies"
  ON travel_mode_policies
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('PNC', 'Admin')
    )
  );
