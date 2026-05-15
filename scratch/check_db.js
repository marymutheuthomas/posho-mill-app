import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTriggers() {
  const { data, error } = await supabase.rpc('inspect_triggers');
  if (error) {
    console.log('RPC inspect_triggers failed, trying raw query...');
    // If RPC doesn't exist, we might not be able to run raw SQL via supabase-js anon key
    // unless there is a generic execute_sql function (unlikely for security)
    console.error(error);
  } else {
    console.log('Triggers:', JSON.stringify(data, null, 2));
  }
}

checkTriggers();
