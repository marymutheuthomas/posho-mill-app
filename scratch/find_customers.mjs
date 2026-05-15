import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findCustomers() {
  const { data, error } = await supabase.from('sales_transactions').select('customer_name').limit(100);
  if (error) {
    console.log('Error:', error.message);
  } else {
    const names = [...new Set(data.map(d => d.customer_name))];
    console.log('Customer names in sales_transactions:', names);
  }
}

findCustomers();
