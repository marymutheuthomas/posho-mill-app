import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSessionLogs() {
  const sessionId = '134a06fa-b8f2-4886-b55a-db0b4a483545';
  console.log(`Checking logs for session ${sessionId}...`);
  
  const { data: logs, error } = await supabase.from('production_logs').select('*').eq('session_id', sessionId);
  if (error) console.error(error);
  else console.log('Logs found:', logs);

  const { data: session } = await supabase.from('milling_sessions').select('*').eq('id', sessionId).maybeSingle();
  console.log('Current Session Status:', session);
}

checkSessionLogs();
