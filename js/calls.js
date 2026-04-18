/**
 * calls.js - Logic for FORM CALL (Lead Management)
 */

let currentCalls = [];
let editingCallId = null;

async function loadCallsData() {
    console.log("Loading calls data...");
    try {
        let query = db.from('call_logs').select('*');
        
        // If the user is not admin, only show their own records
        if (window.currentUserRole !== 'admin' && window.userEmail) {
            query = query.eq('created_by', window.userEmail);
        }

        const { data, error } = await query.order('date', { ascending: false });

        if (error) throw error;
        currentCalls = data || [];
        renderCallsTable();
        updateCallSellerDropdown();
    } catch (err) {
        console.error("Error loading calls:", err);
    }
}


function renderCallsTable() {
    const tbody = document.getElementById('calls-body');
    if (!tbody) return;

    // Get filter values
    const fFrom = document.getElementById('cf-from-date')?.value || "";
    const fTo = document.getElementById('cf-to-date')?.value || "";
    const fService = document.getElementById('cf-service')?.value || "";
    const fCity = document.getElementById('cf-city')?.value || "";
    const fSeller = document.getElementById('cf-seller')?.value || "";
    const fStatus = document.getElementById('cf-status')?.value || "";
    const search = document.getElementById('call-search')?.value.toLowerCase() || "";

    tbody.innerHTML = "";

    const filtered = currentCalls.filter(c => {
        const matchSearch = !search || 
            (c.customer || "").toLowerCase().includes(search) || 
            (c.phone || "").toLowerCase().includes(search);
        
        const matchFrom = !fFrom || c.date >= fFrom;
        const matchTo = !fTo || c.date <= fTo;
        const matchService = !fService || c.service_type === fService;
        const matchCity = !fCity || c.city === fCity;
        const matchSeller = !fSeller || c.seller === fSeller;
        const matchStatus = !fStatus || c.status === fStatus;

        return matchSearch && matchFrom && matchTo && matchService && matchCity && matchSeller && matchStatus;
    });

    filtered.forEach(c => {
        const tr = document.createElement('tr');
        if (editingCallId === c.id) tr.classList.add('editing-row');

        // Format dates
        const dateStr = c.date ? new Date(c.date + 'T00:00:00').toLocaleDateString() : '---';
        const nextStr = c.next_call_date ? new Date(c.next_call_date + 'T00:00:00').toLocaleDateString() : '---';

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td style="font-weight:900;">${(c.customer || "").toUpperCase()}</td>
            <td><span class="inv-badge inv-badge-blue">${c.service_type || 'Sales'}</span></td>
            <td>${c.phone || "---"}</td>
            <td>${(c.city || "").toUpperCase()}</td>
            <td>${c.zip_code || "---"}</td>
            <td>${(c.measures || "").toUpperCase()}</td>
            <td style="color: #15803d; font-weight: 800;">$${Number(c.amount || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
            <td style="color: #b91c1c; font-weight: 700;">${nextStr}</td>
            <td>${c.seller || "---"}</td>
            <td><span class="inv-badge ${getStatusBadgeClass(c.status)}">${c.status || 'PENDING'}</span></td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button onclick="editCallLog('${c.id}')" class="btn-manage-inline" title="Edit"><i class="fas fa-edit"></i></button>
                    <button onclick="openTransferModal('${c.id}')" class="btn-manage-inline" style="color: #6366f1;" title="Transfer"><i class="fas fa-exchange-alt"></i></button>
                    <button onclick="deleteCallLog('${c.id}')" class="btn-manage-inline" style="color: #ef4444;" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </td>
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
            const { data, error } = await db.from('profiles')
                .select('email')
                .in('role', ['admin', 'employee'])
                .order('email');

            if (error) throw error;

            sel.innerHTML = '<option value="">Select Employee...</option>';
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
        const { error } = await db.from('call_logs').update({ created_by: email }).eq('id', callIdToTransfer);
        if (error) throw error;
        
        alert("Client transferred successfully");
        closeTransferModal();
        await loadCallsData();
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
        measures: document.getElementById('call-measures').value.toUpperCase(),
        amount: Math.round((parseFloat(document.getElementById('call-amount').value) || 0) * 100) / 100,
        next_call_date: document.getElementById('call-next-date').value || null,
        seller: document.getElementById('call-seller').value,
        status: document.getElementById('call-status').value,
        description: document.getElementById('call-description').value,
        created_by: window.userEmail || null
    };

    if (!payload.customer) {
        alert("Customer name is required");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        let error;
        if (editingCallId) {
            const { error: err } = await db.from('call_logs').update(payload).eq('id', editingCallId);
            error = err;
        } else {
            const { error: err } = await db.from('call_logs').insert([payload]);
            error = err;
        }

        if (error) throw error;

        alert(editingCallId ? "Call updated successfully" : "Call registered successfully");
        resetCallForm();
        await loadCallsData();
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
    document.getElementById('call-phone').value = call.phone || "";
    document.getElementById('call-city').value = call.city || "";
    document.getElementById('call-zip').value = call.zip_code || "";
    document.getElementById('call-measures').value = call.measures || "";
    document.getElementById('call-amount').value = call.amount || 0;
    document.getElementById('call-next-date').value = call.next_call_date || "";
    document.getElementById('call-seller').value = call.seller || "";
    document.getElementById('call-status').value = call.status || "PENDING";
    document.getElementById('call-description').value = call.description || "";

    document.getElementById('btn-save-call').textContent = "UPDATE CALL RECORD";
    renderCallsTable();
}

async function deleteCallLog(id) {
    if (!confirm("Are you sure you want to delete this lead?")) return;

    try {
        const { error } = await db.from('call_logs').delete().eq('id', id);
        if (error) throw error;
        await loadCallsData();
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
    document.getElementById('call-measures').value = "";
    document.getElementById('call-amount').value = 0;
    document.getElementById('call-next-date').value = "";
    document.getElementById('call-seller').value = "";
    document.getElementById('call-status').value = "PENDING";
    document.getElementById('call-description').value = "";
    
    document.getElementById('btn-save-call').textContent = "SAVE CALL RECORD";
    renderCallsTable();
}

function resetCallFilters() {
    document.getElementById('cf-from-date').value = "";
    document.getElementById('cf-to-date').value = "";
    document.getElementById('cf-service').value = "";
    document.getElementById('cf-city').value = "";
    document.getElementById('cf-seller').value = "";
    document.getElementById('cf-status').value = "";
    document.getElementById('call-search').value = "";
    renderCallsTable();
}

function updateCallSellerDropdown() {
    const sel = document.getElementById('call-seller');
    const filterSel = document.getElementById('cf-seller');
    if (!sel && !filterSel) return;
    
    // Preserve current selection if any
    const currentVal = sel ? sel.value : "";
    const currentFilterVal = filterSel ? filterSel.value : "";

    if (sel) sel.innerHTML = '<option value="">Select Seller...</option>';
    if (filterSel) filterSel.innerHTML = '<option value="">All Sellers</option>';
    
    if (window.currentSellers && window.currentSellers.length > 0) {
        window.currentSellers.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = s.name;
            if (sel) sel.appendChild(opt.cloneNode(true));
            if (filterSel) filterSel.appendChild(opt.cloneNode(true));
        });
    }
    
    if (sel && currentVal) sel.value = currentVal;
    if (filterSel && currentFilterVal) filterSel.value = currentFilterVal;
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

// Initial set date
document.addEventListener('DOMContentLoaded', () => {
    const d = document.getElementById('call-date');
    if (d) d.value = new Date().toISOString().split('T')[0];
});
