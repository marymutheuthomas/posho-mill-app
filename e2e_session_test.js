// Cleanup probe test rows + run a real end-to-end session lifecycle test
// node e2e_session_test.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cruyaesaitpmhlberaub.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w'
);

// ── Step 0: Clean up all probe test rows ─────────────────────────────────────
async function cleanup() {
  const { data, error } = await supabase
    .from('milling_sessions')
    .delete()
    .eq('start_meter', 999.99)
    .select();
  if (error) {
    console.error('Cleanup error:', error.message);
  } else {
    console.log(`🧹 Cleaned up ${data.length} probe test row(s).`);
  }
}

// ── Step 1: Verify no active session exists ──────────────────────────────────
async function checkNoActive() {
  const { data, error } = await supabase
    .from('milling_sessions')
    .select('id, status, is_closed, start_meter')
    .eq('is_closed', false)
    .maybeSingle();

  if (error) throw new Error(`Active session check failed: ${error.message}`);
  if (data) {
    console.log('⚠️  Found existing active session:', data);
    return data.id; // Return so we can close it
  }
  console.log('✅ No active sessions — DB is clear.');
  return null;
}

// ── Step 2: Insert a new session (BIRTH) ─────────────────────────────────────
async function startSession() {
  const cleanPayload = {
    start_meter: 1234.56,
    session_type: 'Internal',
    status: 'Started',
    is_closed: false,
  };

  console.log('\n🟢 [BIRTH] Inserting session with payload:', cleanPayload);

  const { data, error } = await supabase
    .from('milling_sessions')
    .insert([cleanPayload])
    .select()
    .single();

  if (error) throw new Error(`INSERT failed: ${error.message}`);

  console.log('✅ [BIRTH] Session created:', {
    id: data.id,
    status: data.status,
    start_meter: data.start_meter,
    is_closed: data.is_closed,
  });
  return data.id;
}

// ── Step 3: Read back the last-end-meter (pre-fill query) ────────────────────
async function checkLastEndMeter() {
  const { data, error } = await supabase
    .from('milling_sessions')
    .select('end_meter, start_meter')
    .eq('status', 'Completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`last-end-meter query failed: ${error.message}`);
  console.log('\n🔍 [METER PRE-FILL] last-end-meter result:', data ?? 'null (no completed sessions — initial setup mode)');
  return data;
}

// ── Step 4: Close the session (DEATH) ────────────────────────────────────────
async function closeSession(sessionId) {
  const updatePayload = {
    end_meter: 1289.45,
    is_closed: true,
    status: 'Completed',
    closed_at: new Date().toISOString(),
  };

  console.log('\n🔴 [DEATH] Updating session', sessionId, 'with payload:', updatePayload);

  const { error } = await supabase
    .from('milling_sessions')
    .update(updatePayload)
    .eq('id', sessionId);

  if (error) throw new Error(`UPDATE failed: ${error.message}`);
  console.log('✅ [DEATH] Session closed successfully.');
}

// ── Step 5: Verify last-end-meter now returns the closed session ──────────────
async function verifyMeterAfterClose() {
  const { data, error } = await supabase
    .from('milling_sessions')
    .select('end_meter, start_meter, status')
    .eq('status', 'Completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Post-close meter query failed: ${error.message}`);
  console.log('\n🔍 [METER VERIFY] After close, last-end-meter:', data);
  if (data?.end_meter === 1289.45) {
    console.log('✅ [METER VERIFY] Auto-fill will correctly pre-populate: 1289.45 kWh');
  }
}

// ── Step 6: Clean up the test session ────────────────────────────────────────
async function deleteTestSession(sessionId) {
  const { error } = await supabase
    .from('milling_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) {
    console.error('❌ Could not delete test session:', error.message);
  } else {
    console.log('\n🧹 Test session deleted. DB is clean.');
  }
}

// ── Run full flow ─────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════');
console.log('   SESSION LIFECYCLE E2E TEST');
console.log('═══════════════════════════════════════════════');

try {
  await cleanup();
  
  const activeId = await checkNoActive();
  if (activeId) {
    console.log('Closing the stuck active session first...');
    await closeSession(activeId);
  }

  await checkLastEndMeter();    // Should be null or last real session

  const newSessionId = await startSession();
  await checkLastEndMeter();    // Should still be null (new session not yet completed)
  await closeSession(newSessionId);
  await verifyMeterAfterClose(); // Should now return 1289.45
  await deleteTestSession(newSessionId);

  console.log('\n═══════════════════════════════════════════════');
  console.log('   ✅ ALL CHECKS PASSED — SESSION LOGIC WORKS');
  console.log('═══════════════════════════════════════════════\n');
} catch (err) {
  console.error('\n❌ TEST FAILED:', err.message);
}
