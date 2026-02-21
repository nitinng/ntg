-- Add calendar enabled toggle setting
insert into meetup_settings (setting_key, setting_value)
values ('is_calendar_enabled', 'true'::jsonb)
on conflict (setting_key) do nothing;
