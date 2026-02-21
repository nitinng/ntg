-- Create meetup_settings table
create table if not exists meetup_settings (
    id uuid primary key default uuid_generate_v4(),
    setting_key text unique not null,
    setting_value jsonb not null,
    updated_at timestamp with time zone default now()
);

-- Insert default seats
insert into meetup_settings (setting_key, setting_value)
values ('total_seats', '20'::jsonb)
on conflict (setting_key) do nothing;

-- Enable RLS
alter table meetup_settings enable row level security;

-- Admin can do everything
create policy "Admins can manage meetup settings"
on meetup_settings
for all
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role = 'Admin'
  )
);

-- Everyone can read
create policy "Everyone can read meetup settings"
on meetup_settings
for select
to authenticated
using (true);
