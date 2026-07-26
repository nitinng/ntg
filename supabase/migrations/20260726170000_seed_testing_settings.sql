-- Migration: Seed Testing Form Validation Settings
-- Timestamp: 20260726170000

INSERT INTO public.meetup_settings (setting_key, setting_value)
VALUES ('testing_mandatory_toggles', '{"admin": true, "pnc": true, "employee": true}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
