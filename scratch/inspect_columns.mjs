import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectColumns() {
  const views = [
    'dashboard_retail_sales',
    'daily_audits',
    'dashboard_external_production',
    'dashboard_internal_production'
  ];

  for (const name of views) {
    console.log(`\n=== COLUMNS FOR: ${name} ===`);
    
    // We can try to query PG columns via direct SQL functions if there's any, 
    // or try querying `information_schema.columns` using PostgREST (might fail due to permissions, but worth trying)
    try {
      const { data, error } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type')
        .eq('table_name', name);
        
      if (error) {
        console.error(`PostgREST information_schema failed: ${error.message}`);
      } else {
        console.log(data);
      }
    } catch (e) {
      console.error(e);
    }
  }
}

inspectColumns();
