import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectCustomers() {
  const { data, error } = await supabase.from('customers').select('*').limit(5);
  if (error) {
    console.log('Error querying customers:', error.message);
  } else {
    console.log('Customers Data:', JSON.stringify(data, null, 2));
  }
  
  const { data: debts, error: dError } = await supabase.from('debt_book').select('*').limit(5);
  if (dError) {
    console.log('Error querying debt_book:', dError.message);
  } else {
    console.log('Debt Book Data:', JSON.stringify(debts, null, 2));
  }
}

inspectCustomers();
