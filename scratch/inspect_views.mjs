import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  const views = [
    'dashboard_retail_sales',
    'daily_audits',
    'dashboard_external_production',
    'dashboard_internal_production',
    'products'
  ];

  for (const name of views) {
    console.log(`\n=== VIEW: ${name} ===`);
    try {
      const { data, error } = await supabase.from(name).select('*').limit(2);
      if (error) {
        console.error(`Error querying ${name}:`, error.message);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      console.error(`Exception querying ${name}:`, e);
    }
  }
}

inspect();
