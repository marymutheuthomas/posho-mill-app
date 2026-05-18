import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testColumns() {
  // Test daily_audits columns
  {
    console.log('\n--- Daily Audits Column Test ---');
    const { error } = await supabase.from('daily_audits').select('expected_cash_system, actual_cash_collected').limit(1);
    console.log('Test expected_cash_system, actual_cash_collected:', error ? error.message : 'SUCCESS!');
  }

  // Test daily_audits date column
  {
    const dateColumns = ['audit_date', 'created_at', 'reconciliation_date', 'date'];
    for (const col of dateColumns) {
      const { error } = await supabase.from('daily_audits').select(col).limit(1);
      console.log(`Test daily_audits column [${col}]:`, error ? error.message : 'SUCCESS!');
    }
  }

  // Test dashboard_external_production columns
  {
    console.log('\n--- External Production Column Test ---');
    const cols = ['total_kg_input', 'total_kwh_consumed', 'total_service_revenue', 'power_efficiency_kwh_per_kg', 'production_date', 'session_date'];
    for (const col of cols) {
      const { error } = await supabase.from('dashboard_external_production').select(col).limit(1);
      console.log(`Test dashboard_external_production column [${col}]:`, error ? error.message : 'SUCCESS!');
    }
  }

  // Test dashboard_internal_production columns
  {
    console.log('\n--- Internal Production Column Test ---');
    const cols = ['total_net_output', 'total_net_output_kg', 'total_kwh_consumed', 'production_date', 'session_date'];
    for (const col of cols) {
      const { error } = await supabase.from('dashboard_internal_production').select(col).limit(1);
      console.log(`Test dashboard_internal_production column [${col}]:`, error ? error.message : 'SUCCESS!');
    }
  }
}

testColumns();
