/**
 * calls.js - Logic for FORM CALLS (Lead Management)
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

/** Classify a lead by DESTINATION/source: manual | web-calculator | website-rp | ai-bot */
function getCallOriginKey(call) {
    const destRaw = (call?.created_by || '').toString().trim();
    const destName = getAssignedDisplayName(destRaw);
    const dest = destName.toLowerCase().replace(/[_\s]+/g, '-');
    const source = (call?.source || '').toString().trim().toLowerCase().replace(/[_\s]+/g, '-');

    if (
        dest === 'web-calculator' || dest === 'webcalculator' || dest.includes('web-calculator') ||
        source === 'calculator' || source === 'web-calculator'
    ) {
        return 'web-calculator';
    }
    if (
        dest === 'website-rp' || dest === 'websiterp' || dest.includes('website-rp') ||
        source === 'website-rp' || source === 'websiterp'
    ) {
        return 'website-rp';
    }
    if (
        dest === 'ai-bot' || dest === 'aibot' || dest === 'chatbot' ||
        dest.includes('rptulipantransport') ||
        source === 'chatbot' || source === 'chatbot-manual' || source.startsWith('chatbot')
    ) {
        return 'ai-bot';
    }
    return 'manual';
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

        let query = db.from('call_logs').select('*').gte('date', dateStr).or('is_deleted.eq.false,is_deleted.is.null');
        // Todos los empleados ven todos los registros — visibilidad total del equipo

        const { data, error } = await query.order('date', { ascending: false }).limit(1000);

        if (error) throw error;
        currentCalls = data || [];

        subscribeToCallsRealtime();
        renderCallsTable();
        await updateCallSellerDropdown();
    } catch (err) {
        console.error("Error loading calls:", err);
    }
}

/**
 * Maps device/locale codes from external apps into ENGLISH / SPANISH.
 * Accepts: en, en-US, es-MX, english, spanish, navigator.language, Accept-Language.
 *
 * External apps should send this when inserting into call_logs:
 *   language: navigator.language || navigator.userLanguage || 'en'
 */
function normalizeCallLanguage(value) {
    const raw = (value || '').toString().trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!raw) return '';

    const primary = raw.split(/[-_,;]/)[0].trim();
    if (
        primary === 'en' || primary === 'eng' ||
        raw === 'english' || raw === 'ingles' || raw.startsWith('en-') || raw.startsWith('en_')
    ) return 'ENGLISH';
    if (
        primary === 'es' || primary === 'spa' ||
        raw === 'spanish' || raw === 'espanol' || raw.startsWith('es-') || raw.startsWith('es_')
    ) return 'SPANISH';
    return raw.toUpperCase();
}

function getCallLanguageValue(call) {
    if (!call) return '';
    return normalizeCallLanguage(call.language || call.idioma || call.lang || '');
}

function getCallLanguageBadge(call) {
    const lang = getCallLanguageValue(call);
    if (!lang) return '---';
    if (lang === 'ENGLISH') return '<span class="inv-badge inv-badge-blue">ENGLISH</span>';
    if (lang === 'SPANISH') return '<span class="inv-badge inv-badge-orange">SPANISH</span>';
    return `<span class="inv-badge">${lang}</span>`;
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

        return matchSearch && matchFrom && matchTo && matchService && matchCity && matchStatus && matchSeller;
    });

    let manualCount = 0;
    let calcCount = 0;
    let webRpCount = 0;
    let botCount = 0;
    filtered.forEach(c => {
        const key = getCallOriginKey(c);
        if (key === 'web-calculator') calcCount++;
        else if (key === 'website-rp') webRpCount++;
        else if (key === 'ai-bot') botCount++;
        else manualCount++;
    });

    const setSourceCount = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setSourceCount('calls-count-manual', manualCount);
    setSourceCount('calls-count-calculator', calcCount);
    setSourceCount('calls-count-website-rp', webRpCount);
    setSourceCount('calls-count-ai-bot', botCount);

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

        const worker = getAssignedDisplayName(c.created_by);

        tr.style.cursor = 'pointer';
        tr.onclick = (e) => {
            editCallLog(c.id);
        };

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td style="font-weight:900;">
                ${(c.customer || "").toUpperCase()}
            </td>
            <td><span class="inv-badge inv-badge-blue">${c.service_type || 'Sales'}</span></td>
            <td style="font-weight: 700;">${window.formatUSPhone(c.phone) || "---"}</td>
            <td style="text-align: center;">${(c.city || "").toUpperCase()}</td>
            <td>${c.zip_code || "---"}</td>
            <td>${(c.measures || "").toUpperCase()}</td>
            <td style="color: #15803d; font-weight: 800;">$${Number(c.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="color: #b91c1c; font-weight: 700;">${nextStr}</td>
            <td><span class="inv-badge ${getStatusBadgeClass(c.status)}">${c.status || 'PENDING'}</span></td>
            <td class="admin-td-assigned" style="font-weight: 700; color: #1e40af;">${worker}</td>
            <td style="text-align: center; font-weight: 800;">${getCallLanguageBadge(c)}</td>
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
        updateCallSellerDropdown();
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

function isMissingColumnError(error, column) {
    const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    const code = (error?.code || '').toString();
    return code === 'PGRST204' || (msg.includes(column) && (msg.includes('column') || msg.includes('schema') || msg.includes('could not find')));
}

async function upsertCallLog(payload, id) {
    const run = (body) => id
        ? db.from('call_logs').update(body).eq('id', id).select()
        : db.from('call_logs').insert([body]).select();

    let result = await run(payload);
    if (result.error && payload.language != null && isMissingColumnError(result.error, 'language')) {
        const fallback = { ...payload };
        delete fallback.language;
        result = await run(fallback);
        if (!result.error && result.data && result.data[0]) {
            result.data[0].language = payload.language;
        }
    }
    return result;
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
        created_by: editingCallId
            ? (currentCalls.find(c => c.id === editingCallId)?.created_by || window.userEmail || null)
            : (window.userEmail || null),
        language: document.getElementById('call-language')?.value || 'ENGLISH',
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
                const { error: delErr } = await db.from('call_logs').update({is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: window.userEmail || 'unknown'}).eq('id', editingCallId);
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
                const { data, error } = await upsertCallLog(payload, editingCallId);
                if (error) throw error;
                if (data && data.length > 0) {
                    const idx = currentCalls.findIndex(c => c.id === editingCallId);
                    if (idx !== -1) currentCalls[idx] = data[0];
                }
                alert("Call updated successfully");
            } else {
                const { data, error } = await upsertCallLog(payload);
                if (error) throw error;
                if (data && data.length > 0) {
                    currentCalls.unshift(data[0]);
                }
                alert("Call registered successfully");
            }
        }

        resetCallForm();
        if (window.populateCityFilter) populateCityFilter();
        updateCallSellerDropdown();
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

    const langSel = document.getElementById('call-language');
    if (langSel) {
        const lang = getCallLanguageValue(call);
        langSel.value = (lang === 'SPANISH' || lang === 'ENGLISH') ? lang : 'ENGLISH';
    }

    document.getElementById('btn-save-call').textContent = "UPDATE CALL RECORD";

    const btnTrans = document.getElementById('btn-top-transfer');
    const btnDel = document.getElementById('btn-top-delete');
    if (btnTrans) { btnTrans.disabled = false; btnTrans.style.opacity = '1'; btnTrans.style.cursor = 'pointer'; }
    if (btnDel) { btnDel.disabled = false; btnDel.style.opacity = '1'; btnDel.style.cursor = 'pointer'; }

    renderCallsTable();
}

window.handleTopTransfer = function () {
    if (editingCallId) {
        openTransferModal(editingCallId);
    }
};

window.handleTopDelete = function () {
    const role = (window.currentUserRole || '').toLowerCase().trim();
    if (role !== 'admin') {
        alert("Only administrators can delete records.");
        return;
    }
    if (editingCallId) {
        deleteCallLog(editingCallId);
    }
};

async function deleteCallLog(id) {
    const role = (window.currentUserRole || '').toLowerCase().trim();
    if (role !== 'admin') {
        alert("Only administrators can delete records.");
        return;
    }
    if (!confirm("Are you sure you want to delete this lead?")) return;

    try {
        const { error } = await db.from('call_logs').update({is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: window.userEmail || 'unknown'}).eq('id', id);
        if (error) throw error;

        // Remove from in-memory array immediately so the UI updates without a full reload
        currentCalls = currentCalls.filter(c => c.id !== id);

        if (editingCallId === id) {
            resetCallForm(); // also calls renderCallsTable()
        } else {
            renderCallsTable();
        }
        if (window.populateCityFilter) populateCityFilter();
        updateCallSellerDropdown();
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

    const langSel = document.getElementById('call-language');
    if (langSel) langSel.value = 'ENGLISH';

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
    document.getElementById('call-search').value = "";
    renderCallsTable();
}

function getAssignedDisplayName(value) {
    if (!value) return '---';
    const text = String(value).trim();
    return (text.includes('@') ? text.split('@')[0] : text).toUpperCase();
}

function updateCallSellerDropdown() {
    const sel = document.getElementById('cf-seller');
    if (!sel) return;

    const currentVal = sel.value;
    const assignees = [...new Set(
        currentCalls.map(c => c.created_by).filter(e => !!e && String(e).trim() !== '')
    )];

    assignees.sort((a, b) => getAssignedDisplayName(a).localeCompare(getAssignedDisplayName(b)));

    sel.innerHTML = '<option value="">All Destinations</option>';
    assignees.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = getAssignedDisplayName(s);
        sel.appendChild(opt);
    });

    if (currentVal && [...sel.options].some(o => o.value === currentVal)) {
        sel.value = currentVal;
    }
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
loadCallsData = async function (force = false) {
    await originalLoadCallsData(force);
    populateCityFilter();
};
window.loadCallsData = loadCallsData;
window.renderCallsTable = renderCallsTable;
window.updateCallSellerDropdown = updateCallSellerDropdown;

window.refreshCallsModule = async function () {
    await window.withRefreshButton('btn-refresh-calls', async () => {
        await loadCallsData(true);
    }, 'calls');
};

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

    // ── Check last called at ──
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (c.last_called_at) {
        const lastDate = new Date(c.last_called_at);
        const isToday = lastDate >= todayStart;

        let dateStr = '';
        if (isToday) {
            dateStr = lastDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } else {
            dateStr = lastDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + lastDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }

        const byName = (c.calling_by || '').split(' ')[0];
        const badge = byName ? `🕒 ${dateStr} · ${byName}` : `🕒 ${dateStr}`;
        const btnClass = isToday ? 'clk-today' : 'clk-available';
        const titlePrefix = isToday ? 'Ya llamado hoy a las' : 'Última llamada el';

        return `<div class="clk-last-badge">${badge}</div>
            <button class="clk-btn ${btnClass}"
                onclick="event.stopPropagation(); startCallLock('${c.id}')"
                title="${titlePrefix} ${dateStr}${byName ? ' por ' + byName : ''}. Clic para volver a llamar.">
                📞 LLAMAR
            </button>`;
    }

    // ── Never called — fully available ──
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
                
                if (payload.new.is_deleted === true) {
                    if (idx !== -1) {
                        currentCalls.splice(idx, 1);
                        renderCallsTable();
                        updateCallSellerDropdown();
                    }
                } else {
                    if (idx !== -1) {
                        currentCalls[idx] = { ...currentCalls[idx], ...payload.new };
                    } else {
                        currentCalls.unshift(payload.new);
                    }
                    renderCallsTable();
                    updateCallSellerDropdown();
                }
            }
        )
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'call_logs' },
            (payload) => {
                if (!payload.new) return;
                let newRecord = payload.new;

                if (!currentCalls.find(c => c.id === newRecord.id)) {
                    currentCalls.unshift(newRecord);
                    renderCallsTable();
                    updateCallSellerDropdown();
                }
            }
        )
        .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'call_logs' },
            (payload) => {
                if (!payload.old) return;
                const oldId = payload.old.id;
                const idx = currentCalls.findIndex(c => c.id === oldId);
                if (idx !== -1) {
                    currentCalls.splice(idx, 1);
                    renderCallsTable();
                    updateCallSellerDropdown();
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
