
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
async function checkProfiles() {
    const { data, error } = await supabase.from('profiles').select('*').limit(5);
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}
checkProfiles();
