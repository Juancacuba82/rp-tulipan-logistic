
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xtrceqpuwqetzslwxxux.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni'; // This is a public key, but I'll try to use it if I can.
// Actually, I should check if there's a service role key or if I can just use the public one.
// The user might have a local environment with the client already.

async function checkOrder() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    console.log("Checking order ORD-1TLJ...");
    const { data: order, error: orderErr } = await supabase
        .from('trips')
        .select('*')
        .eq('order_no', 'ORD-1TLJ')
        .single();
    
    if (orderErr) {
        console.error("Order error:", orderErr);
    } else {
        console.log("Order found:", {
            order_no: order.order_no,
            status: order.status,
            has_sales: order.has_sales,
            release_no: order.release_no,
            qty: order.qty
        });
    }

    console.log("Checking release 50341111...");
    const { data: release, error: relErr } = await supabase
        .from('releases')
        .select('*')
        .eq('release_no', '50341111');
    
    if (relErr) {
        console.error("Release error:", relErr);
    } else {
        console.log("Releases found:", release.map(r => ({
            id: r.id,
            release_no: r.release_no,
            container_size: r.container_size,
            total_stock: r.total_stock
        })));
    }
}

checkOrder();
