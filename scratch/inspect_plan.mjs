const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

async function inspectPlan() {
  const tables = [
    'daily_audits',
    'dashboard_external_production',
    'dashboard_internal_production'
  ];

  for (const table of tables) {
    console.log(`\n=== PLAN FOR: ${table} ===`);
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/vnd.pgrst.plan'
        }
      });
      const text = await res.text();
      console.log(text);
    } catch (e) {
      console.error(e);
    }
  }
}

inspectPlan();
