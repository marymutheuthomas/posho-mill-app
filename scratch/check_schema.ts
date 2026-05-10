import { supabase } from './src/lib/supabase';

async function checkSchema() {
  const { data, error } = await supabase.from('production_logs').select('*').limit(1);
  if (error) {
    console.error('Error fetching production_logs:', error);
  } else {
    console.log('Production logs columns:', Object.keys(data[0] || {}));
  }
}

checkSchema();
