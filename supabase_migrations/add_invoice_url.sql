-- Add invoice_url column to travel_requests table
ALTER TABLE public.travel_requests 
ADD COLUMN IF NOT EXISTS invoice_url text;

-- Create storage bucket for invoices if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- Set up security policy for the invoices bucket (allow public read, authenticated upload)
-- Note: This assumes storage policies are needed. If disabled, this might not be strictly necessary but good practice.
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'invoices' );

create policy "Authenticated Upload"
  on storage.objects for insert
  with check ( bucket_id = 'invoices' and auth.role() = 'authenticated' );
