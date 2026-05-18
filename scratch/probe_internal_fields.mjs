import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

const candidates = [
  'id',
  'created_at',
  'production_date',
  'session_date',
  'audit_date',
  'date',
  
  // Power / energy
  'kwh',
  'total_kwh',
  'kwh_consumed',
  'total_kwh_consumed',
  'kwh_used',
  'total_kwh_used',
  'power_units',
  'total_power_units',
  'power_consumed',
  'total_power_consumed',
  'power_cost',
  'total_power_cost',
  'power_efficiency',
  'power_efficiency_kwh_per_kg',
  
  // Input / Output / Waste
  'input_kg',
  'total_input_kg',
  'net_output_kg',
  'total_net_output_kg',
  'waste_kg',
  'total_waste_kg',
  'byproduct_kg',
  'total_byproduct_kg',
  
  // Product / Customer / Sales
  'product_id',
  'product_code',
  'product_name',
  'product_category',
  'total_service_revenue',
  'service_revenue',
  'revenue',
  'total_revenue',
  'expected_cash',
  'actual_cash_collected',
  'expected_cash_system'
];

async function probe() {
  console.log('--- Probing dashboard_internal_production ---');
  for (const col of candidates) {
    const { error } = await supabase.from('dashboard_internal_production').select(col).limit(1);
    if (!error) {
      console.log(`dashboard_internal_production.${col}: SUCCESS`);
    }
  }

  console.log('\n--- Probing dashboard_external_production ---');
  for (const col of candidates) {
    const { error } = await supabase.from('dashboard_external_production').select(col).limit(1);
    if (!error) {
      console.log(`dashboard_external_production.${col}: SUCCESS`);
    }
  }
  
  console.log('\n--- Probing daily_audits ---');
  for (const col of candidates) {
    const { error } = await supabase.from('daily_audits').select(col).limit(1);
    if (!error) {
      console.log(`daily_audits.${col}: SUCCESS`);
    }
  }
}

probe();
