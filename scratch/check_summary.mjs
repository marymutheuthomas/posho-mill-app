import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSummary() {
  const { data, error } = await supabase.from('customer_debt_summary').select('*');
  if (error) {
    console.log('Error querying customer_debt_summary:', error.message, error.details);
  } else {
    console.log('Summary Data Count:', data.length);
    console.log('Sample Data:', data.slice(0, 5));
  }
}

checkSummary();
