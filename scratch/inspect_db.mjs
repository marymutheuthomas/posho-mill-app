import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
  // Try to find any suspicious RPCs
  const { data: rpcs, error: rpcError } = await supabase.from('pg_proc').select('proname').limit(10);
  if (rpcError) console.log('Cannot query pg_proc directly');

  // Check the last few production logs and sessions
  const { data: logs } = await supabase.from('production_logs').select('*').order('created_at', { ascending: false }).limit(5);
  const { data: sessions } = await supabase.from('milling_sessions').select('*').order('created_at', { ascending: false }).limit(5);

  console.log('--- RECENT SESSIONS ---');
  console.log(JSON.stringify(sessions, null, 2));
  
  console.log('--- RECENT PRODUCTION LOGS ---');
  console.log(JSON.stringify(logs, null, 2));
}

inspectSchema();
