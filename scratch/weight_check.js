
const SUPABASE_URL = 'https://xtrceqpuwqetzslwxxux.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni';

async function checkDataWeight() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/trips?select=trip_id,signature,photos&limit=5`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const data = await res.json();
        
        console.log("--- DATA WEIGHT ANALYSIS ---");
        data.forEach(row => {
            const sigWeight = row.signature ? row.signature.length : 0;
            const photosWeight = row.photos ? JSON.stringify(row.photos).length : 0;
            console.log(`Trip ID: ${row.trip_id}`);
            console.log(`- Signature Length: ${sigWeight} chars`);
            console.log(`- Photos Length: ${photosWeight} chars`);
        });
    } catch (err) {
        console.log("Error:", err.message);
    }
}

checkDataWeight();
