// Probe every realistic status value combination against the DB
// Run with: node probe_status.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cruyaesaitpmhlberaub.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

// First — check if the anon role can INSERT at all (RLS may be blocking)
async function checkRLS() {
  console.log('\n=== RLS / Auth Check ===');
  const { data: session } = await supabase.auth.getSession();
  console.log('Authenticated as:', session?.session?.user?.email ?? 'ANONYMOUS (no session)');
}

// Second — try inserting with every plausible status value
async function probeStatuses() {
  const candidates = [
    'Started', 'started', 'STARTED',
    'Completed', 'completed', 'COMPLETED',
    'Closed', 'closed', 'CLOSED',
    'Active', 'active', 'ACTIVE',
    'Pending', 'pending', 'PENDING',
    'Open', 'open', 'OPEN',
    'In Progress', 'In_Progress', 'IN_PROGRESS',
    'Running', 'running', 'RUNNING',
    'Stopped', 'stopped', 'STOPPED',
    'Finished', 'finished', 'FINISHED',
  ];

  console.log('\n=== Status Constraint Probe ===');
  for (const status of candidates) {
    const { error } = await supabase.from('milling_sessions').insert([{
      start_meter: 999.99,
      session_type: 'Internal',
      status,
      is_closed: false,
    }]);

    if (!error) {
      console.log(`✅ ACCEPTED: "${status}"`);
      // Clean up the test row immediately
      await supabase.from('milling_sessions').delete().eq('start_meter', 999.99);
    } else if (error.message?.includes('status_check') || error.message?.includes('check constraint')) {
      console.log(`❌ CHECK CONSTRAINT: "${status}"`);
    } else if (error.code === '42501' || error.message?.includes('RLS') || error.message?.includes('row-level security')) {
      console.log(`🔒 RLS BLOCKED: "${status}" — ${error.message}`);
      break; // All will fail if RLS blocks anon
    } else {
      console.log(`⚠️  OTHER ERROR: "${status}" — ${error.code}: ${error.message}`);
    }
  }
}

// Third — try reading the constraint definition via information_schema
async function readConstraintDef() {
  console.log('\n=== Constraint Definition via RPC ===');
  const { data, error } = await supabase.rpc('get_mill_status');
  console.log('get_mill_status RPC:', error ? error.message : JSON.stringify(data));
}

await checkRLS();
await probeStatuses();
await readConstraintDef();
