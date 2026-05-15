const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xtrceqpuwqetzslwxxux.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni';

async function diagnose() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    console.log("Fetching last 5 trips...");
    const { data, error } = await supabase
        .from('trips')
        .select('trip_id, order_no, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
    
    if (error) {
        console.error("Error fetching trips:", error);
    } else {
        console.log("Last 5 trips:", data);
        if (data.length > 0) {
            const firstId = data[0].trip_id;
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            console.log(`Format of '${firstId}': ${uuidRegex.test(firstId) ? 'UUID' : 'Custom'}`);
        }
    }
}

diagnose();
