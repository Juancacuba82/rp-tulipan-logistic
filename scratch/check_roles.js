
const SUPABASE_URL = 'https://xtrceqpuwqetzslwxxux.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni';

async function checkRoles() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=role`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const data = await res.json();
        const roles = [...new Set(data.map(p => p.role))];
        console.log("Current unique roles in profiles table:", roles);
    } catch (err) {
        console.error("Error:", err);
    }
}

checkRoles();
