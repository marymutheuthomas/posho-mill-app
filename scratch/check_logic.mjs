import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLogic() {
  console.log('Checking for any RPCs or unusual functions...');
  
  // We can try to see if there are any RPCs that sound like "close_session"
  // But we don't have a list.
  
  // Let's check if the user has any "pending transactions" in Dexie that might be causing this?
  // No, I'm running on the server, I can't check user's local Dexie.
  
  // Let's check the structure of production_logs
  const { data: columnData, error: colError } = await supabase.from('production_logs').select('*').limit(0);
  if (colError) console.error(colError);
  else console.log('Production Logs columns:', Object.keys(columnData || {}));

  // Let's look for any session updates that happened recently
  const { data: updates } = await supabase.from('milling_sessions').select('*').order('closed_at', { ascending: false }).limit(5);
  console.log('Recent closures:', JSON.stringify(updates, null, 2));
}

checkLogic();
