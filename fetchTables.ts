import { supabase } from './supabaseClient';

async function checkTables() {
  const { data, error } = await supabase.from('app_settings').select('*');
  console.log('app_settings:', data, error);

  const { data: d2, error: e2 } = await supabase.from('policy_config').select('*');
  console.log('policy_config:', d2, e2);
}
checkTables();
