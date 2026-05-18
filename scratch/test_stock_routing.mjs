import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cruyaesaitpmhlberaub.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydXlhZXNhaXRwbWhsYmVyYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDkzOTksImV4cCI6MjA5MTEyNTM5OX0.sHoeSD3B4ywdwKPEHYSlU9qXCwLnGJiu2rMTXvDOs_w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRouting() {
  const { data: products, error } = await supabase.from('products').select('*');
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  const getProductStock = (product) => {
    if (!product) return 0;
    const nameLower = product.name.toLowerCase();
    console.log(`Checking product: "${product.name}", nameLower: "${nameLower}"`);
    console.log(`  includes maize: ${nameLower.includes('maize')}`);
    console.log(`  includes retail: ${nameLower.includes('retail')}`);
    
    if (nameLower.includes('maize') && nameLower.includes('retail')) {
      const bulkMaize = products.find(x => x.name.toLowerCase() === 'maize bulk');
      console.log(`  Found bulkMaize:`, bulkMaize ? `${bulkMaize.name} (Stock: ${bulkMaize.current_stock})` : 'NOT FOUND');
      return bulkMaize ? (bulkMaize.current_stock || 0) : 0;
    }
    return product.current_stock || 0;
  };

  const maizeRetail = products.find(p => p.name.includes('retail'));
  if (maizeRetail) {
    const stock = getProductStock(maizeRetail);
    console.log(`\nFinal resolved stock for "${maizeRetail.name}": ${stock}`);
  } else {
    console.log('Maize retail not found in products list');
  }
}

testRouting();
