const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDate() {
  const { data } = await supabase.from('sales_transactions')
    .select('*')
    .gte('created_at', '2026-05-11T21:00:00.000Z')
    .lte('created_at', '2026-05-12T20:59:59.999Z');
  
  let totalCash = 0;
  let totalLine = 0;
  data.forEach(tx => {
    totalCash += Number(tx.amount_cash) || 0;
    totalLine += Number(tx.total_price) || 0;
  });
  console.log('Total Cash:', totalCash);
  console.log('Total Price:', totalLine);

  const { data: prods } = await supabase.from('products').select('*');
  let manualCash = 0;
  data.forEach(tx => {
    const p = prods.find(prod => prod.id === tx.product_id);
    const rate = (tx.transaction_type || '').toLowerCase() === 'service' ? Number(p?.milling_fee || 0) : Number(p?.selling_price || 0);
    const weight = Number(tx.weight_kg) || 0;
    const lineTotal = weight * rate;
    
    if (!isNaN(lineTotal)) {
      if (tx.amount_cash !== undefined && tx.amount_cash !== null) {
        manualCash += Number(tx.amount_cash);
      }
    }
  });
  console.log('Manual Cash from logic:', manualCash);
}
checkDate();
