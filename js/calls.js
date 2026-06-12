/**
 * calls.js - Logic for FORM CALL (Lead Management)
 */

let currentCalls = [];
let editingCallId = null;
let callsRealtimeChannel = null;

// OPT: Cache profiles locally to avoid 3 separate queries during load/transfer
let cachedProfilesEmails = null;
async function getProfilesEmails() {
    if (cachedProfilesEmails) return cachedProfilesEmails;
    const { data, error } = await db.from('profiles')
        .select('email, driver_name_ref')
        .in('role', ['admin', 'ADMIN', 'employee', 'EMPLOYEE', 'staff', 'STAFF', 'student', 'STUDENT', 'user', 'USER'])
        .order('email');
    if (error) throw error;
    cachedProfilesEmails = data || [];
    return cachedProfilesEmails;
}

async function loadCallsData(force = false) {
    if (!force && currentCalls && currentCalls.length > 0) {
        renderCallsTable();
        return;
    }
    console.log("Loading calls data...");
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
        const dateStr = sixMonthsAgo.toISOString().split('T')[0];

        let query = db.from('call_logs').select('*').gte('date', dateStr);
        // Todos los empleados ven todos los registros — visibilidad total del equipo

        const { data, error } = await query.order('date', { ascending: false }).limit(1000);

        if (error) throw error;
        currentCalls = data || [];



        subscribeToCallsRealtime();
        renderCallsTable();
        await updateCallSellerDropdown();
        await populateCallAssignedSelect();
    } catch (err) {
        console.error("Error loading calls:", err);
    }
}

async function populateCallAssignedSelect() {
    const sel = document.getElementById('call-assigned');
    if (!sel) return;

    const currentVal = sel.value;
    try {
        const data = await getProfilesEmails();

        sel.innerHTML = '';
        
        const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
        if (isAdmin) {
            const optEveryone = document.createElement('option');
            optEveryone.value = 'EVERYONE';
            optEveryone.textContent = 'EVERYONE';
            optEveryone.style.fontWeight = '900';
            optEveryone.style.color = '#1e40af';
            sel.appendChild(optEveryone);
        }

        data.forEach(p => {
            if (p.email) {
                const opt = document.createElement('option');
                opt.value = p.email;
                const rawName = p.driver_name_ref;
                const displayName = (rawName && rawName.trim() !== '') ? rawName : p.email.split('@')[0];
                opt.textContent = displayName.toUpperCase();
                sel.appendChild(opt);
            }
        });

        // Set default to current user if it's a new entry and no value selected
        if (!currentVal && window.userEmail) {
            sel.value = window.userEmail;
        } else if (currentVal) {
            sel.value = currentVal;
        }
    } catch (err) {
        console.error("Error populating assigned select:", err);
        // Fallback: use existing creators if profiles fetch fails
        const emails = [...new Set(currentCalls.map(c => c.created_by).filter(e => !!e))];
        if (window.userEmail && !emails.includes(window.userEmail)) emails.push(window.userEmail);
        
        sel.innerHTML = '';

        const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
        if (isAdmin) {
            const optEveryone = document.createElement('option');
            optEveryone.value = 'EVERYONE';
            optEveryone.textContent = 'EVERYONE';
            optEveryone.style.fontWeight = '900';
            optEveryone.style.color = '#1e40af';
            sel.appendChild(optEveryone);
        }

        emails.sort().forEach(e => {
            const opt = document.createElement('option');
            opt.value = e;
            // Check global map if available
            const mappedName = (window.globalUserNameMap && window.globalUserNameMap[e.toLowerCase().trim()]);
            const displayName = mappedName || e.split('@')[0];
            opt.textContent = displayName.toUpperCase();
            sel.appendChild(opt);
        });
        if (window.userEmail) sel.value = window.userEmail;
    }
}


function renderCallsTable() {
    const tbody = document.getElementById('calls-body');
    if (!tbody) return;

    const isAdmin = (window.currentUserRole === 'admin');

    // Show all UI elements for all roles — todos pueden ver todo
    const sellerFilterItem = document.getElementById('cf-seller-filter-item');
    if (sellerFilterItem) sellerFilterItem.style.display = 'block';
    
    document.querySelectorAll('.admin-th-assigned').forEach(el => el.style.display = '');

    // Get filter values
    const fFrom = document.getElementById('cf-from-date')?.value || "";
    const fTo = document.getElementById('cf-to-date')?.value || "";
    const fService = document.getElementById('cf-service')?.value || "";
    const fCity = document.getElementById('cf-city')?.value || "";
    const fStatus = document.getElementById('cf-status')?.value || "";
    const fSeller = document.getElementById('cf-seller')?.value || "";
    const fSource = document.getElementById('cf-source')?.value || "";
    const search = document.getElementById('call-search')?.value.toLowerCase() || "";

    tbody.innerHTML = "";

    const filtered = currentCalls.filter(c => {
        const matchSearch = !search || 
            (c.customer || "").toLowerCase().includes(search) || 
            (c.phone || "").toLowerCase().includes(search);
        
        const matchFrom = !fFrom || (c.next_call_date && c.next_call_date >= fFrom);
        const matchTo = !fTo || (c.next_call_date && c.next_call_date <= fTo);
        const matchService = !fService || c.service_type === fService;
        const matchCity = !fCity || c.city === fCity;
        const matchStatus = !fStatus || c.status === fStatus;
        const matchSeller = !fSeller || c.created_by === fSeller;
        const matchSource = !fSource || c.source === fSource;

        return matchSearch && matchFrom && matchTo && matchService && matchCity && matchStatus && matchSeller && matchSource;
    });

    // Update Summary Card Counter
    const callsCountEl = document.getElementById('calls-count-display');
    if (callsCountEl) {
        callsCountEl.textContent = filtered.length;
        // Visual feedback: blue if filtering
        const isFiltered = fFrom || fTo || fService || fCity || fStatus || fSeller || fSource || search;
        callsCountEl.style.color = isFiltered ? '#1e40af' : '#1e293b';
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Split calls: Today's calls first, then the rest
    const todayCalls = [];
    const otherCalls = [];
    
    filtered.forEach(c => {
        if (c.next_call_date === todayStr) {
            todayCalls.push(c);
        } else {
            otherCalls.push(c);
        }
    });

    // Sort otherCalls by next_call_date ascending (closest first, missing dates at the bottom)
    otherCalls.sort((a, b) => {
        const dateA = a.next_call_date || "9999-99-99";
        const dateB = b.next_call_date || "9999-99-99";
        return dateA.localeCompare(dateB);
    });

    const finalSorted = [...todayCalls, ...otherCalls];

    finalSorted.forEach(c => {
        const tr = document.createElement('tr');
        if (editingCallId === c.id) tr.classList.add('editing-row');

        // Highlight Priority based on Next Call date
        if (c.next_call_date === todayStr) {
            tr.style.backgroundColor = '#fefce8'; // Light Amber (Today)
            tr.style.border = '2px solid #f59e0b'; // Amber Priority
        } else if (c.next_call_date && c.next_call_date < todayStr && c.status !== 'SOLD' && c.status !== 'CANCELLED') {
            tr.style.backgroundColor = '#fee2e2'; // Light Red (Overdue)
            tr.style.border = '2px solid #dc2626'; // Strong Red Priority
        }

        // Format dates
        const formatDate = (ds) => {
            if (!ds || ds === '---') return '---';
            const parts = ds.split('-');
            if (parts.length !== 3) return ds;
            return `${parts[1]}/${parts[2]}/${parts[0]}`;
        };

        const dateStr = formatDate(c.date);
        const nextStr = formatDate(c.next_call_date);

        // Get worker alias or email
        const worker = c.created_by ? c.created_by.split('@')[0].toUpperCase() : '---';

        tr.style.cursor = 'pointer';
        tr.onclick = (e) => {
            editCallLog(c.id);
        };

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td style="font-weight:900;">
                ${(c.customer || "").toUpperCase()}
                ${c.source === 'website' ? '<span class="inv-badge inv-badge-green" style="font-size: 0.55rem; padding: 1px 4px; margin-left: 4px;">WEB</span>' : ''}
            </td>
            <td><span class="inv-badge inv-badge-blue">${c.service_type || 'Sales'}</span></td>
            <td style="font-weight: 700;">${window.formatUSPhone(c.phone) || "---"}</td>
            <td style="text-align: center;">${(c.city || "").toUpperCase()}</td>
            <td>${c.zip_code || "---"}</td>
            <td>${(c.measures || "").toUpperCase()}</td>
            <td style="color: #15803d; font-weight: 800;">$${Number(c.amount || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
            <td style="color: #b91c1c; font-weight: 700;">${nextStr}</td>
            <td><span class="inv-badge ${getStatusBadgeClass(c.status)}">${c.status || 'PENDING'}</span></td>
            <td class="admin-td-assigned" style="font-weight: 700; color: #1e40af;">${worker}</td>
            <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c.description || ''}">
                ${(c.description || "---").toUpperCase()}
            </td>
            <td style="text-align: center; min-width: 130px; padding: 6px 8px;">${buildCallButton(c)}</td>
        `;
        tbody.appendChild(tr);
    });
}

/** TRANSFER LOGIC **/
let callIdToTransfer = null;

async function openTransferModal(id) {
    callIdToTransfer = id;
    const modal = document.getElementById('transfer-call-modal');
    if (modal) modal.style.display = 'flex';

    // Populate employees list
    const sel = document.getElementById('transfer-to-email');
    if (sel) {
        sel.innerHTML = '<option value="">Loading employees...</option>';
        try {
            // Fetch only admin and employee roles
            const data = await getProfilesEmails();

            sel.innerHTML = '<option value="">Select Employee...</option>';
            
            const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
            if (isAdmin) {
                const optEveryone = document.createElement('option');
                optEveryone.value = 'EVERYONE';
                optEveryone.textContent = 'EVERYONE';
                sel.appendChild(optEveryone);
            }

            data.forEach(p => {
                if (p.email && p.email !== window.userEmail) { // Don't transfer to self
                    const opt = document.createElement('option');
                    opt.value = p.email;
                    opt.textContent = p.email;
                    sel.appendChild(opt);
                }
            });
        } catch (err) {
            console.warn("Could not fetch profiles, falling back to existing created_by emails", err);
            const emails = [...new Set(currentCalls.map(c => c.created_by).filter(e => !!e && e !== window.userEmail))];
            sel.innerHTML = '<option value="">Select Employee...</option>';
            emails.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e;
                opt.textContent = e;
                sel.appendChild(opt);
            });
        }
    }
}

function closeTransferModal() {
    const modal = document.getElementById('transfer-call-modal');
    if (modal) modal.style.display = 'none';
    callIdToTransfer = null;
}

async function executeTransfer() {
    const email = document.getElementById('transfer-to-email').value;
    if (!email) {
        alert("Please select an employee");
        return;
    }

    if (!confirm(`Are you sure you want to transfer this client to ${email}? You will lose access to this record.`)) return;

    try {
        const { data, error } = await db.from('call_logs').update({ created_by: email }).eq('id', callIdToTransfer).select();
        if (error) throw error;
        
        alert("Client transferred successfully");
        closeTransferModal();

        // Update local state: if not admin, remove it as it's no longer theirs (unless it's EVERYONE)
        const role = (window.currentUserRole || '').toLowerCase().trim();
        if (role !== 'admin') {
            currentCalls = currentCalls.filter(c => c.id !== callIdToTransfer);
        } else if (data && data.length > 0) {
            const idx = currentCalls.findIndex(c => c.id === callIdToTransfer);
            if (idx !== -1) currentCalls[idx] = data[0];
        }
        
        if (editingCallId === callIdToTransfer) {
            resetCallForm();
        } else {
            renderCallsTable();
        }
        if (window.populateCityFilter) populateCityFilter();
    } catch (err) {
        console.error("Error transferring client:", err);
        alert("Error: " + err.message);
    }
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'SOLD': return 'inv-badge-green';
        case 'FOLLOW UP': return 'inv-badge-orange';
        case 'CANCELLED': return 'inv-badge-red';
        default: return 'inv-badge-blue';
    }
}

async function saveCallLog() {
    const btn = document.getElementById('btn-save-call');
    const originalText = btn.textContent;
    
    // Collect data
    const payload = {
        date: document.getElementById('call-date').value || new Date().toISOString().split('T')[0],
        customer: document.getElementById('call-customer').value.toUpperCase(),
        service_type: document.getElementById('call-service').value,
        phone: document.getElementById('call-phone').value,
        city: document.getElementById('call-city').value.toUpperCase(),
        zip_code: document.getElementById('call-zip').value,
        measures: (document.getElementById('call-size').style.display === 'none' 
                    ? document.getElementById('call-size-sel').value 
                    : document.getElementById('call-size').value).toUpperCase(),
        amount: Math.round((parseFloat(document.getElementById('call-amount').value) || 0) * 100) / 100,
        next_call_date: document.getElementById('call-next-date').value || null,
        status: document.getElementById('call-status').value,
        description: document.getElementById('call-description').value,
        created_by: document.getElementById('call-assigned').value || window.userEmail || null,
        source: editingCallId ? (currentCalls.find(c => c.id === editingCallId)?.source || 'manual') : 'manual'
    };

    if (!payload.customer) {
        alert("Customer name is required");
        return;
    }

    const role = (window.currentUserRole || '').toLowerCase().trim();
    if (role === 'student') {
        if (payload.status === 'SOLD') {
            alert("Students cannot set status to SOLD (leads to calendar creation).");
            return;
        }
    }

    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        if (payload.status === 'SOLD') {
            const transferOk = await transferSoldCallToCalendar(payload);
            if (!transferOk) throw new Error("Could not transfer SOLD lead to calendar");

            if (editingCallId) {
                // Remove from call_logs since it's now in the calendar
                const { error: delErr } = await db.from('call_logs').delete().eq('id', editingCallId);
                if (delErr) console.warn("Note: Transferred to calendar but failed to remove from call logs:", delErr);
                
                // Remove from local state
                currentCalls = currentCalls.filter(c => c.id !== editingCallId);
            }
            alert("¡Lead convertido a VENDIDO y transferido al Delivery Calendar!");
        } else {
            if (editingCallId) {
                // Liberar candado si este empleado estaba en llamada
                const existingCall = currentCalls.find(c => c.id === editingCallId);
                const myName = _getMyDisplayName();
                if (existingCall && existingCall.is_on_call && existingCall.calling_by === myName) {
                    payload.is_on_call = false;
                    payload.last_called_at = new Date().toISOString();
                    // calling_by se mantiene para registrar quién llamó por última vez
                }
                const { data, error } = await db.from('call_logs').update(payload).eq('id', editingCallId).select();
                if (error) throw error;
                if (data && data.length > 0) {
                    const idx = currentCalls.findIndex(c => c.id === editingCallId);
                    if (idx !== -1) currentCalls[idx] = data[0];
                }
                alert("Call updated successfully");
            } else {
                const { data, error } = await db.from('call_logs').insert([payload]).select();
                if (error) throw error;
                if (data && data.length > 0) {
                    currentCalls.unshift(data[0]);
                }
                alert("Call registered successfully");
            }
        }
        
        resetCallForm();
        if (window.populateCityFilter) populateCityFilter();
    } catch (err) {
        console.error("Error saving call:", err);
        alert("Error saving record: " + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function editCallLog(id) {
    const call = currentCalls.find(c => c.id === id);
    if (!call) return;

    editingCallId = id;
    
    document.getElementById('call-date').value = call.date || "";
    document.getElementById('call-customer').value = call.customer || "";
    document.getElementById('call-service').value = call.service_type || "Sales";
    document.getElementById('call-phone').value = window.formatUSPhone(call.phone || "");
    document.getElementById('call-city').value = call.city || "";
    document.getElementById('call-zip').value = call.zip_code || "";
    const sizeVal = call.measures || "";
    const sizeSel = document.getElementById('call-size-sel');
    const sizeInput = document.getElementById('call-size');
    const isStandard = [...sizeSel.options].some(opt => opt.value === sizeVal);

    if (isStandard && sizeVal !== "") {
        sizeSel.value = sizeVal;
        sizeSel.style.display = 'block';
        sizeInput.style.display = 'none';
    } else {
        sizeInput.value = sizeVal;
        sizeSel.style.display = 'none';
        sizeInput.style.display = 'block';
    }
    document.getElementById('call-amount').value = call.amount || 0;
    document.getElementById('call-next-date').value = call.next_call_date || "";
    document.getElementById('call-status').value = call.status || "PENDING";
    document.getElementById('call-description').value = call.description || "";
    
    const assignSel = document.getElementById('call-assigned');
    if (assignSel) assignSel.value = call.created_by || window.userEmail || "";

    document.getElementById('btn-save-call').textContent = "UPDATE CALL RECORD";
    
    const btnTrans = document.getElementById('btn-top-transfer');
    const btnDel = document.getElementById('btn-top-delete');
    if (btnTrans) { btnTrans.disabled = false; btnTrans.style.opacity = '1'; btnTrans.style.cursor = 'pointer'; }
    if (btnDel) { btnDel.disabled = false; btnDel.style.opacity = '1'; btnDel.style.cursor = 'pointer'; }

    renderCallsTable();
}

window.handleTopTransfer = function() {
    if (editingCallId) {
        openTransferModal(editingCallId);
    }
};

window.handleTopDelete = function() {
    if (editingCallId) {
        deleteCallLog(editingCallId);
    }
};

async function deleteCallLog(id) {
    if (!confirm("Are you sure you want to delete this lead?")) return;

    try {
        const { error } = await db.from('call_logs').delete().eq('id', id);
        if (error) throw error;

        // Remove from in-memory array immediately so the UI updates without a full reload
        currentCalls = currentCalls.filter(c => c.id !== id);

        if (editingCallId === id) {
            resetCallForm(); // also calls renderCallsTable()
        } else {
            renderCallsTable();
        }
        if (window.populateCityFilter) populateCityFilter();
    } catch (err) {
        console.error("Error deleting call:", err);
        alert("Error: " + err.message);
    }
}

function resetCallForm() {
    editingCallId = null;
    document.getElementById('call-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('call-customer').value = "";
    document.getElementById('call-service').value = "Sales";
    document.getElementById('call-phone').value = "";
    document.getElementById('call-city').value = "";
    document.getElementById('call-zip').value = "";
    document.getElementById('call-size-sel').value = "";
    document.getElementById('call-size-sel').style.display = 'block';
    document.getElementById('call-size').value = "";
    document.getElementById('call-size').style.display = 'none';
    document.getElementById('call-amount').value = 0;
    document.getElementById('call-next-date').value = "";
    document.getElementById('call-status').value = "PENDING";
    document.getElementById('call-description').value = "";
    
    const assignSel = document.getElementById('call-assigned');
    if (assignSel && window.userEmail) assignSel.value = window.userEmail;
    
    document.getElementById('btn-save-call').textContent = "SAVE CALL RECORD";

    const btnTrans = document.getElementById('btn-top-transfer');
    const btnDel = document.getElementById('btn-top-delete');
    if (btnTrans) { btnTrans.disabled = true; btnTrans.style.opacity = '0.5'; btnTrans.style.cursor = 'not-allowed'; }
    if (btnDel) { btnDel.disabled = true; btnDel.style.opacity = '0.5'; btnDel.style.cursor = 'not-allowed'; }

    renderCallsTable();
}

function resetCallFilters() {
    document.getElementById('cf-from-date').value = "";
    document.getElementById('cf-to-date').value = "";
    document.getElementById('cf-service').value = "";
    document.getElementById('cf-city').value = "";
    document.getElementById('cf-status').value = "";
    document.getElementById('cf-seller').value = "";
    document.getElementById('cf-source').value = "";
    document.getElementById('call-search').value = "";
    renderCallsTable();
}

async function updateCallSellerDropdown() {
    const sel = document.getElementById('cf-seller');
    if (!sel) return;

    const currentVal = sel.value;
    
    try {
        // Fetch all potential sellers (admins, employees, staff)
        const data = await getProfilesEmails();

        sel.innerHTML = '<option value="">All Employees</option>';
        
        const optEveryone = document.createElement('option');
        optEveryone.value = 'EVERYONE';
        optEveryone.textContent = 'EVERYONE';
        sel.appendChild(optEveryone);

        data.forEach(p => {
            if (p.email) {
                const opt = document.createElement('option');
                opt.value = p.email;
                const rawName = p.driver_name_ref;
                const displayName = (rawName && rawName.trim() !== '') ? rawName : p.email.split('@')[0];
                opt.textContent = displayName.toUpperCase();
                sel.appendChild(opt);
            }
        });
    } catch (err) {
        console.warn("Fallback: updating seller dropdown from call data", err);
        const sellers = [...new Set(currentCalls.map(c => c.created_by).filter(e => !!e))].sort();
        sel.innerHTML = '<option value="">All Employees</option>';
        sellers.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            const mappedName = (window.globalUserNameMap && window.globalUserNameMap[s.toLowerCase().trim()]);
            const displayName = mappedName || s.split('@')[0];
            opt.textContent = displayName.toUpperCase();
            sel.appendChild(opt);
        });
    }

    if (currentVal) sel.value = currentVal;
}


function populateCityFilter() {
    const filterSel = document.getElementById('cf-city');
    if (!filterSel) return;
    
    const currentVal = filterSel.value;
    const cities = [...new Set(currentCalls.map(c => c.city).filter(city => !!city))].sort();
    
    filterSel.innerHTML = '<option value="">All Cities</option>';
    cities.forEach(city => {
        const opt = document.createElement('option');
        opt.value = city;
        opt.textContent = city.toUpperCase();
        filterSel.appendChild(opt);
    });
    
    if (currentVal) filterSel.value = currentVal;
}

// Update loadCallsData to also populate the city filter
const originalLoadCallsData = loadCallsData;
loadCallsData = async function() {
    await originalLoadCallsData();
    populateCityFilter();
}

function toggleCallSizeMode() {
    const sel = document.getElementById('call-size-sel');
    const inp = document.getElementById('call-size');
    const icon = document.getElementById('toggle-icon-call-size');

    if (sel.style.display !== 'none') {
        sel.style.display = 'none';
        inp.style.display = 'block';
        icon.classList.remove('fa-edit');
        icon.classList.add('fa-list');
    } else {
        sel.style.display = 'block';
        inp.style.display = 'none';
        icon.classList.remove('fa-list');
        icon.classList.add('fa-edit');
    }
}

async function transferSoldCallToCalendar(call) {
    console.log("Transferring sold call to calendar...", call);
    
    // Generate a unique Order No
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let ordSuffix = '';
    for (let i = 0; i < 4; i++) ordSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
    const orderNo = 'ORD-' + ordSuffix;

    // Build the trip object (trips table)
    const tripObj = {
        trip_id: crypto.randomUUID(),
        date: call.next_call_date || call.date,  // Use "Next Call" date as the delivery date
        size: call.measures,
        customer: call.customer,
        phone_no: call.phone,
        city: call.city,
        delivery_place: call.zip_code, // Now labeled "Delivery Place" in UI
        note: '',  // Note goes empty to calendar; origin tracked via container_source
        container_source: 'FORM_CALL',  // Marker used by CALLS TRANSFER filter
        status: 'PENDING_PAYMENT',
        order_no: orderNo,
        amount: call.amount,
        service_mode: 'SALE',
        has_trans: call.service_type === 'Transport' ? 'YES' : 'NO',
        has_sales: call.service_type === 'Sales' ? 'YES' : 'NO',
        yard_services: call.service_type === 'Service Yard' ? 'YES' : 'NO',
        // Map amount to the specific field for better tracking
        trans_pay: call.service_type === 'Transport' ? call.amount : 0,
        sales_price: call.service_type === 'Sales' ? call.amount : 0,
        yard_rate: call.service_type === 'Service Yard' ? call.amount : 0,
        // Default flags
        st_yard: 'PEND',
        st_rent: 'PEND',
        st_rate: 'PEND',
        st_sales: 'PEND',
        st_amount: 'PEND'
    };

    try {
        const { error } = await db.from('trips').insert([tripObj]);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error("Error in transferSoldCallToCalendar:", err);
        alert("CRITICAL ERROR: Could not transfer to calendar: " + err.message);
        return false;
    }
}

// Initial set date and phone formatting listener
document.addEventListener('DOMContentLoaded', () => {
    const d = document.getElementById('call-date');
    if (d) d.value = new Date().toISOString().split('T')[0];

    const phoneInp = document.getElementById('call-phone');
    if (phoneInp) {
        phoneInp.addEventListener('input', (e) => {
            const cursor = e.target.selectionStart;
            const oldLen = e.target.value.length;
            
            e.target.value = window.formatUSPhone(e.target.value);
            
            // Adjust cursor position if characters were added/removed (simplified)
            const newLen = e.target.value.length;
            if (newLen > oldLen) {
                e.target.setSelectionRange(cursor + (newLen - oldLen), cursor + (newLen - oldLen));
            } else {
                e.target.setSelectionRange(cursor, cursor);
            }
        });
    }
});

// ── CALL LOCKING SYSTEM ─────────────────────────────────────────────────────

/**
 * Returns the display name of the currently logged-in user.
 * Used to identify who is on a call.
 */
function _getMyDisplayName() {
    const myEmail = (window.userEmail || '').toLowerCase().trim();
    const mapped = window.globalUserNameMap && window.globalUserNameMap[myEmail];
    return mapped ? mapped.toUpperCase() : (window.userEmail || '').split('@')[0].toUpperCase();
}

/**
 * startCallLock(id)
 * Marks a call_log record as "on call" by this employee.
 * Other employees will see a red pulsing indicator on that row.
 * Also opens the record in the editing form for convenience.
 */
async function startCallLock(id) {
    const myName = _getMyDisplayName();
    try {
        const { data, error } = await db.from('call_logs')
            .update({ is_on_call: true, calling_by: myName })
            .eq('id', id)
            .select();
        if (error) throw error;

        // Update local state immediately
        if (data && data[0]) {
            const idx = currentCalls.findIndex(c => c.id === id);
            if (idx !== -1) currentCalls[idx] = { ...currentCalls[idx], ...data[0] };
        }

        // Open record in the form so the employee can fill in notes
        editCallLog(id);
        renderCallsTable();
    } catch (err) {
        console.error('Error starting call lock:', err);
        alert('Error al iniciar llamada: ' + err.message);
    }
}

/**
 * buildCallButton(c)
 * Returns the HTML for the call action button in each table row.
 * States:
 *   🟢 LLAMAR        — available, not called today
 *   🟡 LLAMAR        — available but already called today (shows time)
 *   🟠 EN LLAMADA    — I am currently on this call
 *   🔴 OCUPADO       — another employee is on this call right now
 */
function buildCallButton(c) {
    const myName = _getMyDisplayName();

    // ── Someone is actively on this call ──
    if (c.is_on_call) {
        const caller = c.calling_by || 'Alguien';
        const isMe = caller === myName;
        if (isMe) {
            return `<button class="clk-btn clk-mine" onclick="event.stopPropagation();"
                title="Tú estás en llamada ahora. Guarda el registro para terminar.">
                <span class="clk-dot"></span>EN LLAMADA (YO)
            </button>`;
        } else {
            const shortName = caller.split(' ')[0];
            return `<button class="clk-btn clk-busy" disabled
                title="${caller} está en llamada ahora mismo. Espera que termine.">
                🔴 OCUPADO · ${shortName}
            </button>`;
        }
    }

    // ── Check if called today ──
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (c.last_called_at) {
        const lastDate = new Date(c.last_called_at);
        if (lastDate >= todayStart) {
            const timeStr = lastDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const byName = (c.calling_by || '').split(' ')[0];
            const badge = byName ? `🕒 ${timeStr} · ${byName}` : `🕒 ${timeStr}`;
            return `<div class="clk-last-badge">${badge}</div>
                <button class="clk-btn clk-today"
                    onclick="event.stopPropagation(); startCallLock('${c.id}')"
                    title="Ya llamado hoy a las ${timeStr}${byName ? ' por ' + byName : ''}. Clic para volver a llamar.">
                    📞 LLAMAR
                </button>`;
        }
    }

    // ── Not called today — fully available ──
    return `<button class="clk-btn clk-available"
        onclick="event.stopPropagation(); startCallLock('${c.id}')"
        title="Iniciar llamada con ${(c.customer || '').toUpperCase()}">
        📞 LLAMAR
    </button>`;
}

/**
 * subscribeToCallsRealtime()
 * Opens a Supabase Realtime channel so all employees see lock changes
 * instantly without refreshing the page.
 */
function subscribeToCallsRealtime() {
    if (callsRealtimeChannel) return; // Already subscribed

    callsRealtimeChannel = db.channel('calls_realtime_v1')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'call_logs' },
            (payload) => {
                if (!payload.new) return;
                const idx = currentCalls.findIndex(c => c.id === payload.new.id);
                if (idx !== -1) {
                    // Merge updated fields into local state
                    currentCalls[idx] = { ...currentCalls[idx], ...payload.new };
                    renderCallsTable();
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ Calls Realtime activo — cambios en vivo habilitados');
            }
        });
}

// ── Call button styles (injected once) ──────────────────────────────────────
(function injectCallLockStyles() {
    if (document.getElementById('call-lock-styles')) return;
    const style = document.createElement('style');
    style.id = 'call-lock-styles';
    style.textContent = `
        .clk-btn {
            border: none;
            border-radius: 7px;
            padding: 6px 10px;
            font-size: 0.68rem;
            font-weight: 800;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s;
            display: block;
            width: 100%;
            text-align: center;
            letter-spacing: 0.3px;
        }
        /* 🟢 Available */
        .clk-available {
            background: #dcfce7;
            color: #15803d;
            border: 1.5px solid #86efac;
        }
        .clk-available:hover {
            background: #16a34a;
            color: white;
            transform: scale(1.05);
            box-shadow: 0 2px 8px rgba(21,128,61,0.3);
        }
        /* 🟡 Already called today */
        .clk-today {
            background: #fef9c3;
            color: #92400e;
            border: 1.5px solid #fde68a;
        }
        .clk-today:hover {
            background: #d97706;
            color: white;
        }
        /* 🟠 I am on this call */
        .clk-mine {
            background: linear-gradient(135deg, #fff7ed, #ffedd5);
            color: #c2410c;
            border: 2px solid #fb923c;
            cursor: default;
            animation: clk-pulse-orange 1.6s ease-in-out infinite;
        }
        /* 🔴 Another employee is on this call */
        .clk-busy {
            background: linear-gradient(135deg, #fee2e2, #fecaca);
            color: #991b1b;
            border: 2px solid #fca5a5;
            cursor: not-allowed;
            animation: clk-pulse-red 1.6s ease-in-out infinite;
        }
        @keyframes clk-pulse-orange {
            0%, 100% { box-shadow: 0 0 0 0 rgba(251,146,60,0.5); }
            50%       { box-shadow: 0 0 0 6px rgba(251,146,60,0); }
        }
        @keyframes clk-pulse-red {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
            50%       { box-shadow: 0 0 0 7px rgba(239,68,68,0); }
        }
        /* Small badge under button showing last call time */
        .clk-last-badge {
            font-size: 0.59rem;
            color: #64748b;
            text-align: center;
            margin-bottom: 3px;
            font-weight: 700;
        }
        /* Pulsing dot inside "on call" button */
        .clk-dot {
            display: inline-block;
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #ea580c;
            margin-right: 5px;
            vertical-align: middle;
            animation: clk-dot-blink 1s ease-in-out infinite;
        }
        @keyframes clk-dot-blink {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.15; }
        }
    `;
    document.head.appendChild(style);
})();
