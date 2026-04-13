import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

export const supabase = createClient(supabaseUrl, supabaseKey);
