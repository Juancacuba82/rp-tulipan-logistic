// supabase-client.js - RP Tulipan Logistic 
// Configuration for Supabase integration

// Insert your Supabase URL and Key here
const SUPABASE_URL = 'https://xtrceqpuwqetzslwxxux.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni';

// Initialize the Supabase client
// For browser usage with the CDN, 'supabase' is globally available.
let db;
try {
    if (typeof supabase !== 'undefined') {
        db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.error("Supabase library not loaded. Ensure the CDN script is present.");
    }
} catch (e) {
    console.error("Supabase client failed to initialize:", e);
}

// --- AUTHENTICATION HELPERS ---
async function signIn(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

async function signOut() {
    const { error } = await db.auth.signOut();
    if (error) throw error;
}

async function getSession() {
    const { data: { session }, error } = await db.auth.getSession();
    if (error) throw error;
    return session;
}

async function getProfile(userId) {
    const { data, error } = await db.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    return data;
}

async function getTrips() {
    try {
        const { data, error } = await db
            .from('trips')
            .select('*')
            .order('date', { ascending: false }); // <--- ¡Añade esta línea!

        if (error) throw error;
        console.log("Viajes obtenidos de Supabase:", data.length);
        return data || [];
    } catch (err) {
        console.error('Error fetching trips:', err);
        return [];
    }
}



async function addTrip(tripData) {
    const { data, error } = await db.from('trips').insert([tripData]);
    if (error) { console.error('Error adding trip:', error); throw error; }
    return data;
}

async function updateTrip(tripId, updateData) {
    const { data, error } = await db.from('trips').update(updateData).eq('trip_id', tripId);
    if (error) { console.error('Error updating trip:', error); throw error; }
    return data;
}

async function deleteTrip(tripId) {
    const { error } = await db.from('trips').delete().eq('trip_id', tripId);
    if (error) { console.error('Error deleting trip:', error); throw error; }
}

// Helper for Releases
async function getReleases() {
    const { data, error } = await db.from('releases').select('*');
    if (error) { console.error('Error fetching releases:', error); return []; }
    return data;
}

async function addRelease(releaseData) {
    const { data, error } = await db.from('releases').insert([releaseData]);
    if (error) { console.error('Error adding release:', error); throw error; }
    return data;
}

async function updateRelease(id, updateData) {
    const { data, error } = await db.from('releases').update(updateData).eq('id', id);
    if (error) { console.error('Error updating release:', error); throw error; }
    return data;
}

// Helper for Expenses
async function getExpenses() {
    const { data, error } = await db.from('expenses').select('*');
    if (error) { console.error('Error fetching expenses:', error); return []; }
    return data;
}

async function addExpense(expenseData) {
    const { data, error } = await db.from('expenses').insert([expenseData]);
    if (error) { console.error('Error adding expense:', error); throw error; }
    return data;
}

async function deleteExpense(expenseId) {
    const { error } = await db.from('expenses').delete().eq('id', expenseId);
    if (error) { console.error('Error deleting expense:', error); throw error; }
}

// Helper for Fleet
async function getFleet() {
    const { data, error } = await db.from('fleet').select('*');
    if (error) { console.error('Error fetching fleet:', error); return []; }
    return data;
}

async function saveFleet(fleetData) {
    const { data, error } = await db.from('fleet').upsert([fleetData], { onConflict: 'unit_id' });
    if (error) { console.error('Error saving fleet:', error); throw error; }
    return data;
}

async function supabaseDeleteFleetUnit(unitId) {
    const { error } = await db.from('fleet').delete().eq('unit_id', unitId);
    if (error) { console.error('Error deleting unit:', error); throw error; }
}
window.supabaseDeleteFleetUnit = supabaseDeleteFleetUnit;

// Helper for Rentals
async function getRentals() {
    const { data, error } = await db.from('rentals').select('*').order('start_date', { ascending: false });
    if (error) { console.error('Error fetching rentals:', error); return []; }
    return data;
}

async function addRental(rentalData) {
    const { data, error } = await db.from('rentals').insert([rentalData]);
    if (error) { console.error('Error adding rental:', error); throw error; }
    return data;
}

async function updateRental(id, updateData) {
    const { data, error } = await db.from('rentals').update(updateData).eq('id', id);
    if (error) { console.error('Error updating rental:', error); throw error; }
    return data;
}

async function deleteRental(id) {
    const { error } = await db.from('rentals').delete().eq('id', id);
    if (error) { console.error('Error deleting rental:', error); throw error; }
}

// MIGRATION TOOL: Help move data from LocalStorage to Supabase
async function migrateDataToSupabase() {
    console.log("Starting migration...");

    // 1. Migrate Expenses
    const localExpenses = JSON.parse(localStorage.getItem('expensesTableData') || '[]');
    if (localExpenses.length > 0) {
        const formattedExpenses = localExpenses.map(row => ({
            date: row[0] === '---' ? null : row[0],
            category: row[1],
            description: row[2],
            amount: parseFloat(row[3].replace('$', '').replace(/,/g, '')) || 0,
            note: row[4]
        }));
        const { error } = await db.from('expenses').insert(formattedExpenses);
        if (error) console.error("Error migrating expenses:", error);
        else console.log("Expenses migrated successfully!");
    }

    // 2. Migrate Fleet
    const localFleet = JSON.parse(localStorage.getItem('fleetData') || '[]');
    if (localFleet.length > 0) {
        const formattedFleet = localFleet.map(u => ({
            unit_id: u.id,
            type: u.type,
            unit_number: u.num,
            vin: u.vin,
            plate: u.plate,
            year: parseInt(u.year) || null,
            miles: parseInt(u.miles) || 0,
            last_service_date: u.lastDate === '' ? null : u.lastDate,
            last_service_miles: parseInt(u.lastMiles) || 0,
            next_service_due_date: u.dueDate === '' ? null : u.dueDate,
            next_service_due_miles: parseInt(u.dueMiles) || 0,
            status: u.status
        }));
        const { error } = await db.from('fleet').upsert(formattedFleet, { onConflict: 'unit_id' });
        if (error) console.error("Error migrating fleet:", error);
        else console.log("Fleet migrated successfully!");
    }

    // 3. Migrate Releases
    const localReleases = JSON.parse(localStorage.getItem('releasesTableData') || '[]');
    if (localReleases.length > 0) {
        const formattedReleases = localReleases.map(row => ({
            release_no: row[0],
            date: row[1] === '---' ? null : row[1],
            type: row[2],
            depot: row[3],
            city: row[4],
            qty_20: parseInt(row[5]) || 0,
            price_20: parseFloat(row[6]) || 0,
            qty_40: parseInt(row[7]) || 0,
            price_40: parseFloat(row[8]) || 0,
            qty_45: parseInt(row[9]) || 0,
            price_45: parseFloat(row[10]) || 0,
            seller: row[11],
            total_stock: parseInt(row[12]) || 0
        }));
        const { error } = await db.from('releases').insert(formattedReleases);
        if (error) console.error("Error migrating releases:", error);
        else console.log("Releases migrated successfully!");
    }

    // 4. Migrate Trips
    const localTrips = JSON.parse(localStorage.getItem('logisticsTableData') || '[]');
    if (localTrips.length > 0) {
        const formattedTrips = localTrips.map(row => ({
            trip_id: row[0],
            date: row[1] === '---' ? null : row[1],
            size: row[2],
            n_cont: row[3],
            release_no: row[4],
            order_no: row[5],
            city: row[6],
            pickup_address: row[7],
            delivery_place: row[8],
            doors_direction: row[9],
            miles: parseFloat(row[10]) || 0,
            customer: row[11],
            yard_services: row[13],
            yard_rate: parseFloat(row[14]) || 0,
            date_out: row[15] === '---' ? null : row[15],
            day_rate: parseFloat(row[16]) || 0,
            company: row[17],
            driver: row[18],
            trans_pay: parseFloat(row[19]) || 0,
            type_payment: row[20],
            sales_price: parseFloat(row[21]) || 0,
            collect_payment: row[22],
            amount: parseFloat(row[23]) || 0,
            phone_no: row[24],
            paid_driver: parseFloat(row[25]) || 0,
            status: row[26],
            commission_percent: row[27],
            commission_driver: parseFloat(row[28]) || 0,
            income_dis_fee: parseFloat(row[29]) || 0,
            invoice: row[30],
            note: row[31],
            service_mode: row[32],
            monthly_rate: parseFloat(row[33]) || 0,
            start_date_rent: row[34] === '---' ? null : row[34],
            next_due: row[35] === '---' ? null : row[35],
            st_yard: row[36],
            st_rent: row[37],
            st_rate: row[38],
            st_sales: row[39],
            st_amount: row[40],
            pending_balance: parseFloat(row[41].replace('$', '').replace(/,/g, '')) || 0,
            payout_status: row[42],
            email: row[43]
        }));
        const { error } = await db.from('trips').insert(formattedTrips);
        if (error) console.error("Error migrating trips:", error);
        else console.log("Trips migrated successfully!");
    }
}

// --- STORAGE HELPERS ---
async function uploadReceipt(blob, filename) {
    const filePath = `${filename}`;
    const { data, error } = await db.storage
        .from('receipts')
        .upload(filePath, blob, {
            cacheControl: '3600',
            upsert: true
        });

    if (error) {
        console.error('Error uploading to Supabase Storage:', error);
        throw error;
    }

    // Get Public URL
    const { data: { publicUrl } } = db.storage
        .from('receipts')
        .getPublicUrl(filePath);

    return publicUrl;
}
