const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

async function fetchOpenApi() {
  const url = `${supabaseUrl}/rest/v1/?apikey=${supabaseKey}`;
  try {
    const res = await fetch(url);
    const schema = await res.json();
    console.log("Response:", JSON.stringify(schema, null, 2));
  } catch (e) {
    console.error('Error fetching OpenAPI spec:', e);
  }
}

fetchOpenApi();
