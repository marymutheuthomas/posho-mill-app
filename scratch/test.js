const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://cruyaesaitpmhlberaub.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w');

async function test() {
  const { data: d1, error: e1 } = await supabase.from('daily_audits').select('*').limit(1);
  console.log('daily_audits:', d1, e1);
  const { data: d2, error: e2 } = await supabase.from('stock_take_history').select('*').limit(1);
  console.log('stock_take_history:', d2, e2);
}
test();
