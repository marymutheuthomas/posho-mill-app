const query = `query { __schema { types { name kind enumValues { name } } } }`;
fetch('https://cruyaesaitpmhlberaub.supabase.co/graphql/v1', {
  method: 'POST',
  headers: {
    apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query })
})
.then(res => res.json())
.then(data => {
  const enums = data.data.__schema.types.filter(t => t.kind === 'ENUM');
  console.log(JSON.stringify(enums, null, 2));
})
.catch(console.error);
