
const SUPABASE_URL = 'https://xtrceqpuwqetzslwxxux.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni';

async function diagnose() {
    console.log("--- SUPABASE DIAGNOSTIC REPORT ---");
    
    const tables = ['trips', 'tasks', 'releases', 'yard_stock', 'activity_logs', 'profiles'];
    
    for (const table of tables) {
        try {
            // Get count
            const countRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=count`, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Prefer': 'count=exact'
                }
            });
            const countHeader = countRes.headers.get('content-range');
            const count = countHeader ? countHeader.split('/')[1] : 'unknown';
            
            // Get sample row for columns
            const sampleRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });
            const sampleData = await sampleRes.json();
            const columns = sampleData.length > 0 ? Object.keys(sampleData[0]) : [];
            
            console.log(`\nTable: ${table.toUpperCase()}`);
            console.log(`- Total rows: ${count}`);
            console.log(`- Columns: ${columns.join(', ')}`);
            
            if (table === 'trips') {
                const orderIds = sampleData.length > 0 ? { 
                    trip_id: sampleData[0].trip_id, 
                    order_no: sampleData[0].order_no,
                    n_cont: sampleData[0].n_cont
                } : 'No data';
                console.log(`- ID Sample:`, orderIds);
            }
        } catch (err) {
            console.log(`- Error scanning ${table}: ${err.message}`);
        }
    }
}

diagnose();
