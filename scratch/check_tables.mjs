import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function listTables() {
  // Since we can't easily list tables with the anon key without a specific RPC,
  // we will try to query common names or check the schema if possible.
  // Alternatively, let's try to query 'customers' and see if it works.
  
  const tables = ['customers', 'debt_book', 'customer_debt_summary', 'profiles'];
  
  for (const table of tables) {
    const { data, error, count } = await supabase.from(table).select('*', { count: 'exact', head: true }).limit(1);
    if (error) {
      console.log(`Table [${table}]: Error - ${error.message}`);
    } else {
      console.log(`Table [${table}]: OK - Count: ${count}`);
    }
  }
}

listTables();
