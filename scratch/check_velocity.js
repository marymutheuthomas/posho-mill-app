import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cruyaesaitpmhlberaub.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('dashboard_inventory_velocity').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Row:', data);
  }
}
check();
