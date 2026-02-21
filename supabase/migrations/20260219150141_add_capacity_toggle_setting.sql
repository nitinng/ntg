-- Add capacity enabled toggle setting
insert into meetup_settings (setting_key, setting_value)
values ('is_capacity_enabled', 'true'::jsonb)
on conflict (setting_key) do nothing;
