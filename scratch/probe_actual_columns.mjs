import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function probe() {
  const tables = ['dashboard_external_production', 'dashboard_internal_production', 'daily_audits'];
  
  for (const table of tables) {
    console.log(`\n=== PROBING: ${table} ===`);
    const { error } = await supabase.from(table).select('non_existent_column_abc_xyz').limit(1);
    if (error) {
      console.log('Error message:', error.message);
      console.log('Details:', error.details);
      console.log('Hint:', error.hint);
    }
  }

  // Also let's probe some potential column names
  const extCols = ['input_kg', 'total_input_kg', 'kwh_consumed', 'total_kwh', 'kwh_used', 'efficiency_score', 'session_date'];
  for (const col of extCols) {
    const { error } = await supabase.from('dashboard_external_production').select(col).limit(1);
    console.log(`dashboard_external_production.${col}:`, error ? 'FAIL' : 'SUCCESS');
  }

  const intCols = ['net_output_kg', 'total_net_output_kg', 'kwh_consumed', 'total_kwh', 'kwh_used', 'production_date', 'session_date', 'waste_kg', 'product_name'];
  for (const col of intCols) {
    const { error } = await supabase.from('dashboard_internal_production').select(col).limit(1);
    console.log(`dashboard_internal_production.${col}:`, error ? 'FAIL' : 'SUCCESS');
  }
}

probe();
