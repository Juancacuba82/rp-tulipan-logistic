// receivables.js

window.receivablesData = {
    invoices: []
};

window.initReceivables = async function () {
    console.log('[Receivables] initReceivables');
    await loadReceivables();
    renderReceivables();
};

window.refreshReceivablesModule = async function () {
    await window.withRefreshButton('btn-refresh-receivables', async () => {
        await loadReceivables();
        renderReceivables();
    }, 'accounts receivable');
};

async function loadReceivables() {
    try {
        const { data, error } = await window.db.from('receivables_invoices')
            .select('*')
            .or('is_deleted.eq.false,is_deleted.is.null')
            .order('date_generated', { ascending: false });
        if (error) throw error;
        window.receivablesData.invoices = data || [];
        window._recvSettlementMap = null;
        window._recvLoadedOnce = true;
    } catch (err) {
        console.error('[Receivables] Error loading invoices:', err);
    }
}
window.loadReceivables = loadReceivables;

function collectTripPools() {
    if ((!window.combinedBillingTrips || window.combinedBillingTrips.length === 0) && window.compileCombinedBillingTrips) {
        window.compileCombinedBillingTrips();
    }
    return [
        window.combinedBillingTrips || [],
        window.rentalInvoiceTrips || [],
        window.currentTrips || [],
        window.allTripsUnfiltered || []
    ];
}

function findTripRowById(tid) {
    const id = String(tid);
    for (const pool of collectTripPools()) {
        const row = pool.find(r => r && String(r[0]) === id);
        if (row) return row;
    }
    return null;
}

function getUniqueOrderNumbersFromTripIds(tripIdsStr) {
    if (!tripIdsStr) return [];
    const ids = tripIdsStr.split(',').map(id => id.trim()).filter(id => id && !id.startsWith('RENTAL_ID:'));
    const orders = [];
    ids.forEach(id => {
        const row = findTripRowById(id);
        if (row && row[5] && row[5] !== '---') {
            const o = row[5].toString().trim();
            if (o) orders.push(o);
        }
    });
    return [...new Set(orders)];
}

function getOrderNumbersFromTripIds(tripIdsStr) {
    return getUniqueOrderNumbersFromTripIds(tripIdsStr).join(', ');
}

function isRentalReceivableInvoice(inv) {
    const svc = invoiceServiceKey(inv);
    if (svc === 'RENT' || svc === 'RENTAL') return true;
    const invNo = (inv.invoice_number || '').toString().toUpperCase();
    if (invNo.startsWith('RENT-')) return true;
    if ((inv.trip_ids || '').toString().includes('RENTAL_ID:')) return true;
    return false;
}

function invoiceServiceKey(inv) {
    const type = (inv.service_type || '').toString().toUpperCase().trim();
    if (type) {
        const clean = type.replace(/\|COMPANY:[^|]*/gi, '').split('|GROUP:')[0].trim();
        if (clean) return clean;
    }
    const invNo = (inv.invoice_number || '').toString();
    if (invNo.includes('-')) return invNo.split('-')[0].toUpperCase();
    return '';
}

// Legacy invoices have no service_type, so the key falls back to the invoice
// number prefix. Map those prefixes to real service names.
const INVOICE_PREFIX_SERVICES = {
    TRANS: 'TRANSPORT',
    RATE: 'TRANSPORT',
    SALE: 'SALES',
    STOR: 'STORAGE',
    YARD: 'YARD',
    RENT: 'RENT',
    AS: 'ALL',
    INV: 'ALL'
};

function parseInvoiceServiceTokens(inv) {
    const key = invoiceServiceKey(inv);
    if (!key) return [];
    const upper = key.toUpperCase();
    if (upper === 'ALL' || upper === 'ALL SERVICES') return [];
    return upper
        .split(/[,+/]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => INVOICE_PREFIX_SERVICES[s] || s);
}

// Builds the set of payment flags an invoice settles.
// Only the services the invoice actually billed are marked — never the whole order.
// The tax flag and the global `paid` flag are decided later, once we know whether
// every billable service on the trip ended up settled.
function paidPatchForServiceTokens(tokens) {
    const patch = {};
    const list = tokens || [];
    const knownHit = list.some(t => /TRANSPORT|TRANS|RATE|YARD|SALES|RENT|STORAGE/.test(t));
    // An empty or explicitly "ALL" service type means the invoice covered everything.
    const addAll = !list.length || list.some(t => t === 'ALL' || t === 'ALL SERVICES');
    if (!addAll && !knownHit) {
        // Unrecognised service type: settle nothing rather than wiping real debt.
        console.warn('[Receivables] Unrecognised service type, no payment flags applied:', list);
        return patch;
    }
    const has = (name) => addAll || list.some(t => t === name || t.startsWith(name + ' '));
    if (addAll || has('TRANSPORT') || has('TRANS') || list.includes('RATE')) patch.st_rate = 'PAID';
    if (addAll || has('YARD')) patch.st_yard = 'PAID';
    if (addAll || has('SALES')) patch.st_sales = 'PAID';
    if (addAll || has('RENT') || has('RENTAL')) patch.st_rent = 'PAID';
    // Storage shares the yard flag
    if (addAll || has('STORAGE') || list.includes('YARD STORAGE')) {
        patch.st_yard = 'PAID';
    }
    return patch;
}

// True when, after applying `patch`, no billable service on the trip is left unpaid.
function tripFullySettledAfterPatch(tripRow, patch) {
    if (!tripRow) return false;
    const qty = parseInt(tripRow.qty) || 1;
    const isPaidAfter = (col) => patch[col] === 'PAID' || tripRow[col] === 'PAID';

    const hasTrans = (tripRow.has_trans === 'YES' || tripRow.has_trans === true)
        && (parseFloat(tripRow.trans_pay) || 0) > 0;
    const hasSales = (tripRow.has_sales === 'YES' || tripRow.has_sales === true)
        && ((parseFloat(tripRow.sales_price) || 0) * qty) > 0;
    const hasYard = (parseFloat(tripRow.yard_rate) || 0) > 0;
    const hasRent = (tripRow.service_mode || '').toString().toUpperCase() === 'RENTAL INVOICE'
        && (parseFloat(tripRow.monthly_rate) || 0) > 0;

    if (hasTrans && !isPaidAfter('st_rate')) return false;
    if (hasSales && !isPaidAfter('st_sales')) return false;
    if (hasYard && !isPaidAfter('st_yard')) return false;
    if (hasRent && !isPaidAfter('st_rent')) return false;
    return true;
}

function applyPaidPatchToTripRow(local, patch) {
    if (!local || !patch) return false;
    let changed = false;
    if (patch.st_yard && local[30] !== 'PAID') { local[30] = 'PAID'; changed = true; }
    if (patch.st_rent && local[31] !== 'PAID') { local[31] = 'PAID'; changed = true; }
    if (patch.st_rate && local[32] !== 'PAID') { local[32] = 'PAID'; changed = true; }
    if (patch.st_sales && local[33] !== 'PAID') { local[33] = 'PAID'; changed = true; }
    if (patch.st_amount && local[34] !== 'PAID') { local[34] = 'PAID'; changed = true; }
    if (patch.st_tax && local[52] !== 'PAID') { local[52] = 'PAID'; changed = true; }
    if (patch.note) local[25] = patch.note;
    return changed;
}

function applyUnpaidPatchToTripRow(local, patch) {
    if (!local || !patch) return false;
    const idxMap = { st_yard: 30, st_rent: 31, st_rate: 32, st_sales: 33, st_amount: 34, st_tax: 52 };
    let changed = false;
    Object.keys(idxMap).forEach(col => {
        if (patch[col] && local[idxMap[col]] !== patch[col]) {
            local[idxMap[col]] = patch[col];
            changed = true;
        }
    });
    return changed;
}

function invoiceLinksTrip(inv, tripId) {
    if (!inv || !inv.trip_ids || !tripId) return false;
    const want = String(tripId);
    return inv.trip_ids.split(',').map(s => s.trim()).filter(Boolean).includes(want);
}

function invoiceStatusLabel(inv) {
    if (!inv) return '';
    const st = (inv.status || '').toLowerCase();
    const method = (inv.payment_method || '').toString().toUpperCase();
    if (st === 'written off' || method === 'WRITE-OFF') return 'WRITE-OFF';
    if (st === 'paid') return 'PAGADA';
    if (st === 'partial') return 'PARCIAL';
    return 'ABIERTA';
}

window.getInvoicesForTrip = function (tripId) {
    const list = (window.receivablesData && window.receivablesData.invoices) || [];
    return list.filter(inv => invoiceLinksTrip(inv, tripId));
};

window.getTripArLockInfo = function (tripId) {
    const invoices = typeof window.getInvoicesForTrip === 'function' ? window.getInvoicesForTrip(tripId) : [];
    if (!tripId || !invoices.length) {
        return { locked: false, open: false, invoices: [], banner: '', statusText: '' };
    }
    const open = invoices.filter(inv => !isHistoryInvoice(inv));
    const nos = invoices.map(i => i.invoice_number || '—').join(', ');
    let statusText = 'PAGADA';
    if (open.length) {
        statusText = open.some(i => (i.status || '').toLowerCase() === 'partial') ? 'PARCIAL' : 'ABIERTA';
    } else if (invoices.some(i => invoiceStatusLabel(i) === 'WRITE-OFF')) {
        statusText = 'WRITE-OFF';
    }
    return {
        locked: true,
        open: open.length > 0,
        invoices,
        invoiceNumber: invoices[0] && invoices[0].invoice_number,
        statusText,
        banner: `Factura ${nos} · ${statusText} · cobro y cambios de pagado solo en Account`
    };
};

function arrayRowAsSettleTrip(row) {
    if (!row) return null;
    return {
        qty: parseInt(row[53]) || 1,
        has_trans: row[42],
        trans_pay: row[18],
        has_sales: row[43],
        sales_price: row[20],
        yard_rate: row[13],
        monthly_rate: row[27],
        service_mode: row[26],
        st_yard: row[30],
        st_rent: row[31],
        st_rate: row[32],
        st_sales: row[33],
        st_amount: row[34],
        st_tax: row[52]
    };
}

function calendarHintForInvoice(inv) {
    if (!inv || !inv.trip_ids) return '';
    const ids = inv.trip_ids.split(',').map(s => s.trim()).filter(t => t && !t.startsWith('RENTAL_ID:'));
    if (!ids.length) return '';
    let settled = 0;
    ids.forEach(tid => {
        const row = findTripRowById(tid);
        if (row && tripFullySettledAfterPatch(arrayRowAsSettleTrip(row), {})) settled += 1;
    });
    if (settled === ids.length) return 'Calendario: pagado';
    if (settled > 0) return `Calendario: ${settled}/${ids.length} viajes pagados`;
    return 'Calendario: pendiente';
}

function otherHistoryCoversFlag(tripId, flag, exceptInvId) {
    const list = (window.receivablesData && window.receivablesData.invoices) || [];
    return list.some(inv => {
        if (String(inv.id) === String(exceptInvId)) return false;
        if (!isHistoryInvoice(inv)) return false;
        if (!invoiceLinksTrip(inv, tripId)) return false;
        const tokens = parseInvoiceServiceTokens(inv);
        const cols = paidPatchForServiceTokens(tokens);
        if (flag === 'st_rent' && (isRentalReceivableInvoice(inv) || cols.st_rent === 'PAID')) return true;
        return cols[flag] === 'PAID';
    });
}

window.removeCashLedgerForInvoice = async function (invoiceNumber) {
    if (!invoiceNumber || !window.db) return { count: 0, total: 0 };
    const num = String(invoiceNumber);
    const { data, error } = await window.db.from('cash_ledger')
        .select('id, monto, referencia, descripcion')
        .eq('referencia', num);
    if (error) throw error;
    const rows = data || [];
    let total = 0;
    for (const row of rows) {
        total += parseFloat(row.monto) || 0;
        const { error: delErr } = await window.db.from('cash_ledger').delete().eq('id', row.id);
        if (delErr) throw delErr;
    }
    return { count: rows.length, total };
};

window.unsetLinkedTripsFromReceivable = async function (invoiceRecord, opts) {
    if (!invoiceRecord || !invoiceRecord.trip_ids || !window.db) return;
    const tripIdList = invoiceRecord.trip_ids.split(',').map(s => s.trim()).filter(Boolean);
    const normalTrips = tripIdList.filter(t => !t.startsWith('RENTAL_ID:'));
    if (!normalTrips.length) return;

    const tokens = parseInvoiceServiceTokens(invoiceRecord);
    const cols = paidPatchForServiceTokens(tokens);
    const svcType = (invoiceRecord.service_type || '').toUpperCase();

    for (const tid of normalTrips) {
        const unsetCols = { ...cols };
        if (svcType.includes('RENTAL') || tokens.includes('RENT') || tokens.includes('RENTAL')) {
            unsetCols.st_rent = 'PAID';
        }
        const patch = {};
        ['st_yard', 'st_rent', 'st_rate', 'st_sales'].forEach(flag => {
            if (unsetCols[flag] === 'PAID' && !otherHistoryCoversFlag(tid, flag, invoiceRecord.id)) {
                patch[flag] = 'PEND';
            }
        });
        try {
            const { data: tripRows } = await window.db.from('trips')
                .select('qty, has_trans, trans_pay, has_sales, sales_price, yard_rate, monthly_rate, service_mode, st_yard, st_rent, st_rate, st_sales, st_amount, st_tax')
                .eq('trip_id', tid)
                .limit(1);
            const tripRow = (tripRows && tripRows[0]) || null;
            const after = tripRow ? { ...tripRow } : {};
            Object.keys(patch).forEach(k => { after[k] = patch[k]; });
            if (!tripFullySettledAfterPatch(after, {})) {
                patch.st_tax = 'PEND';
                patch.st_amount = 'PEND';
                patch.paid = false;
            }
            if (Object.keys(patch).length) {
                await window.db.from('trips').update(patch).eq('trip_id', tid);
            }
        } catch (e) {
            console.warn('[Receivables] Could not unset trip', tid, e);
        }
        const applyLocal = (arr) => {
            if (!arr) return;
            const local = arr.find(t => String(t[0]) === String(tid));
            applyUnpaidPatchToTripRow(local, patch);
        };
        applyLocal(window.currentTrips);
        applyLocal(window.rentalInvoiceTrips);
        applyLocal(window.combinedBillingTrips);
        applyLocal(window.allTripsUnfiltered);
    }
    if (opts && opts.silent) return;
    if (typeof window.renderBillingTable === 'function') window.renderBillingTable();
    if (typeof window.applyAdvancedFilters === 'function') window.applyAdvancedFilters();
};

window.settleLinkedTripsFromReceivable = async function (invoiceRecord, writeOffReason, opts) {
    if (!invoiceRecord || !invoiceRecord.trip_ids || !window.db) return;
    const tripIdList = invoiceRecord.trip_ids.split(',').map(s => s.trim()).filter(Boolean);
    const normalTrips = tripIdList.filter(t => !t.startsWith('RENTAL_ID:'));
    if (!normalTrips.length) return;

    const tokens = parseInvoiceServiceTokens(invoiceRecord);
    const cols = paidPatchForServiceTokens(tokens);
    const svcType = (invoiceRecord.service_type || '').toUpperCase();
    const reasonNote = writeOffReason ? ` | WRITE-OFF: ${writeOffReason}` : ' | WRITE-OFF';

    for (const tid of normalTrips) {
        const patch = { ...cols };
        try {
            const { data: tripRows } = await window.db.from('trips')
                .select('note, service_mode, qty, has_trans, trans_pay, has_sales, sales_price, yard_rate, monthly_rate, st_yard, st_rent, st_rate, st_sales, st_amount, st_tax')
                .eq('trip_id', tid)
                .limit(1);
            const tripRow = (tripRows && tripRows[0]) || null;
            const mode = (tripRow?.service_mode || '').toString().toUpperCase();
            if (mode === 'RENTAL INVOICE' || svcType.includes('RENTAL') || tokens.includes('RENT') || tokens.includes('RENTAL')) {
                patch.st_rent = 'PAID';
                if (writeOffReason) patch.note = ((tripRow && tripRow.note) ? tripRow.note : '') + reasonNote;
            }

            // The tax and the order-level paid flag only close once every
            // billable service on the order has been settled.
            if (Object.keys(patch).length && tripFullySettledAfterPatch(tripRow, patch)) {
                patch.st_tax = 'PAID';
                patch.st_amount = 'PAID';
                patch.paid = true;
            }

            if (!Object.keys(patch).length) {
                console.warn('[Receivables] Nothing to settle for trip', tid);
                continue;
            }

            const alreadyPaid = tripRow &&
                (!patch.st_yard || tripRow.st_yard === 'PAID') &&
                (!patch.st_rent || tripRow.st_rent === 'PAID') &&
                (!patch.st_rate || tripRow.st_rate === 'PAID') &&
                (!patch.st_sales || tripRow.st_sales === 'PAID') &&
                (!patch.st_amount || tripRow.st_amount === 'PAID') &&
                (!patch.st_tax || tripRow.st_tax === 'PAID') &&
                !patch.note;
            if (!alreadyPaid) {
                await window.db.from('trips').update(patch).eq('trip_id', tid);
            }
        } catch (e) {
            console.warn('[Receivables] Could not settle trip', tid, e);
        }
        const applyLocal = (arr) => {
            if (!arr) return;
            const local = arr.find(t => String(t[0]) === String(tid));
            applyPaidPatchToTripRow(local, patch);
        };
        applyLocal(window.currentTrips);
        applyLocal(window.rentalInvoiceTrips);
        applyLocal(window.combinedBillingTrips);
        applyLocal(window.allTripsUnfiltered);
    }
    window._recvSettlementMap = null;
    if (opts && opts.silent) return;
    if (typeof window.loadRentalInvoiceTrips === 'function') {
        await window.loadRentalInvoiceTrips(true);
    }
    if (typeof window.renderRentalsTable === 'function') window.renderRentalsTable();
    if (typeof window.renderBillingTable === 'function') window.renderBillingTable();
};

window.reconcileTripsFromPaidReceivables = async function () {
    const list = (window.receivablesData && window.receivablesData.invoices) || [];
    if (!list.length) return;

    const billingRows = window.combinedBillingTrips || [];
    const billingIds = new Set(billingRows.map(r => String(r[0])));
    const byTrip = new Map();

    for (const inv of list) {
        if (!isHistoryInvoice(inv) || !inv.trip_ids) continue;
        const tokens = parseInvoiceServiceTokens(inv);
        const ids = inv.trip_ids.split(',').map(s => s.trim()).filter(t => t && !t.startsWith('RENTAL_ID:'));
        ids.forEach(tid => {
            if (billingIds.size && !billingIds.has(String(tid))) return;
            const prev = byTrip.get(tid) || new Set();
            if (!tokens.length) prev.add('__ALL__');
            else tokens.forEach(t => prev.add(t));
            byTrip.set(tid, prev);
        });
    }

    for (const [tid, tokenSet] of byTrip) {
        const tokens = tokenSet.has('__ALL__') ? [] : [...tokenSet];
        const patch = paidPatchForServiceTokens(tokens);
        const local = billingRows.find(t => String(t[0]) === String(tid));
        const needs = !local ||
            (patch.st_yard && local[30] !== 'PAID') ||
            (patch.st_rent && local[31] !== 'PAID') ||
            (patch.st_rate && local[32] !== 'PAID') ||
            (patch.st_sales && local[33] !== 'PAID') ||
            (patch.st_amount && local[34] !== 'PAID') ||
            (patch.st_tax && local[52] !== 'PAID');
        if (!needs) continue;
        await window.settleLinkedTripsFromReceivable(
            { trip_ids: tid, service_type: tokens.join(',') },
            null,
            { silent: true }
        );
    }
};

function invoiceMatchesService(inv, filter) {
    if (!filter) return true;
    const f = filter.toUpperCase().trim();
    const key = invoiceServiceKey(inv);
    if (key === f || key.startsWith(f + '|')) return true;
    const invNo = (inv.invoice_number || '').toString().toUpperCase();
    return invNo.startsWith(f + '-');
}

function getReceivableSubtitle(inv) {
    if (isRentalReceivableInvoice(inv)) {
        const details = (inv.details_html || '').toString();
        const contFromDetails = (details.match(/Container:<\/strong>\s*([^<]+)/i) || [])[1];
        const periodFromDetails = (details.match(/Period:<\/strong>\s*([^<]+)/i) || [])[1];
        const ids = (inv.trip_ids || '').toString().split(',').map(s => s.trim()).filter(t => t && !t.startsWith('RENTAL_ID:'));
        const containers = [];
        ids.forEach(tid => {
            const row = findTripRowById(tid);
            const c = row && row[3] ? row[3].toString().trim() : '';
            if (c && c !== '---' && c !== 'TBA') containers.push(c);
        });
        const uniqueCont = [...new Set(containers)];
        let containerLabel = '';
        if (uniqueCont.length === 1) containerLabel = uniqueCont[0];
        else if (uniqueCont.length > 1) containerLabel = uniqueCont[0];
        else containerLabel = (contFromDetails || '').trim();
        const parts = [];
        if (containerLabel && containerLabel !== '---') parts.push(containerLabel);
        if (periodFromDetails) parts.push(periodFromDetails.trim());
        return parts.join(' · ');
    }

    const orders = getUniqueOrderNumbersFromTripIds(inv.trip_ids);
    if (orders.length !== 1) return '';
    const invNo = (inv.invoice_number || '').toString();
    if (orders[0] === invNo) return '';
    return orders[0];
}

function invoiceMatchesOrder(inv, search) {
    if (!search || !search.trim()) return true;
    const q = search.trim().toUpperCase();
    const details = (inv.details_html || '').toString().replace(/<[^>]+>/g, ' ');
    const hay = [
        inv.invoice_number || '',
        inv.trip_ids || '',
        details,
        getOrderNumbersFromTripIds(inv.trip_ids),
        getReceivableSubtitle(inv)
    ].join(' ').toUpperCase();
    return hay.includes(q);
}

function invoiceMatchesContainer(inv, search) {
    if (!search || !search.trim()) return true;
    const q = search.trim().toUpperCase();
    const details = (inv.details_html || '').toString().replace(/<[^>]+>/g, ' ');
    const ids = (inv.trip_ids || '').toString().split(',').map(s => s.trim()).filter(t => t && !t.startsWith('RENTAL_ID:'));
    const fromTrips = [];
    ids.forEach(tid => {
        const row = findTripRowById(tid);
        const c = row && row[3] ? row[3].toString().trim() : '';
        if (c) fromTrips.push(c);
    });
    const hay = [
        details,
        getReceivableSubtitle(inv),
        fromTrips.join(' ')
    ].join(' ').toUpperCase();
    return hay.includes(q);
}

function customerMatchesFilter(custName, filter) {
    if (!filter) return true;
    return (custName || '').toString().trim().toUpperCase() === filter.toString().trim().toUpperCase();
}

function isHistoryInvoice(inv) {
    const st = (inv.status || '').toLowerCase();
    const method = (inv.payment_method || '').toString().toUpperCase();
    return st === 'paid' || st === 'written off' || method === 'WRITE-OFF';
}

function recvTabKey() {
    return window.recvActiveTab === 'history' ? 'history' : 'pending';
}

function getRecvTabFilters() {
    if (!window.recvTabFilters) {
        window.recvTabFilters = {
            pending: { customer: window.recvCustomerFilter || '', service: window.recvServiceFilter || '' },
            history: { customer: '', service: '' }
        };
    }
    return window.recvTabFilters[recvTabKey()];
}

window.setRecvCustomerFilter = function (value) {
    getRecvTabFilters().customer = value || '';
    window.renderReceivables();
};

window.setRecvServiceFilter = function (value) {
    getRecvTabFilters().service = value || '';
    window.renderReceivables();
};

function updateReceivablesSummaryCards() {
    const stats = window.recvSummaryStats || {};
    const tab = window.recvActiveTab || 'pending';
    const countLabel = document.getElementById('recv-summary-count-label');
    const countValue = document.getElementById('recv-summary-count-value');
    const dueLabel = document.getElementById('recv-summary-due-label');
    const dueValue = document.getElementById('recv-summary-due-value');
    const dueIconWrap = document.getElementById('recv-summary-due-icon');
    if (tab === 'history') {
        if (countLabel) countLabel.textContent = 'Invoices in History';
        if (countValue) countValue.textContent = String(stats.historyCount ?? 0);
        if (dueLabel) dueLabel.textContent = 'Total Collected';
        if (dueValue) {
            dueValue.textContent = '$' + (stats.historyCollected ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            dueValue.style.color = '#10b981';
        }
        if (dueIconWrap) {
            dueIconWrap.style.background = '#ecfdf5';
            dueIconWrap.style.color = '#10b981';
        }
    } else {
        if (countLabel) countLabel.textContent = 'Pending Invoices';
        if (countValue) countValue.textContent = String(stats.pendingCount ?? 0);
        if (dueLabel) dueLabel.textContent = 'Total Due';
        if (dueValue) {
            dueValue.textContent = '$' + (stats.pendingDue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            dueValue.style.color = '#ef4444';
        }
        if (dueIconWrap) {
            dueIconWrap.style.background = '#fef2f2';
            dueIconWrap.style.color = '#ef4444';
        }
    }
}

function applyReceivablesTabUI() {
    const tab = recvTabKey();
    const pending = document.getElementById('recv-pending');
    const history = document.getElementById('recv-history');
    if (pending) pending.style.display = tab === 'history' ? 'none' : 'block';
    if (history) history.style.display = tab === 'history' ? 'block' : 'none';
    const btnPending = document.getElementById('recv-tab-pending');
    const btnHistory = document.getElementById('recv-tab-history');
    if (btnPending && btnHistory) {
        if (tab === 'history') {
            btnPending.className = 'glossy-dark-btn';
            btnHistory.className = 'glossy-blue-btn';
        } else {
            btnPending.className = 'glossy-blue-btn';
            btnHistory.className = 'glossy-dark-btn';
        }
    }
    updateReceivablesSummaryCards();
}

window.setReceivablesTab = function (tab) {
    window.recvActiveTab = tab === 'history' ? 'history' : 'pending';
    window.renderReceivables();
};

window.resetReceivablesFilters = function() {
    window.recvTabFilters = {
        pending: { customer: '', service: '' },
        history: { customer: '', service: '' }
    };
    window.recvCustomerFilter = '';
    window.recvServiceFilter = '';
    window.recvOrderFilter = '';
    window.recvContainerFilter = '';
    window.renderReceivables();
};

window.renderReceivables = function () {
    const container = document.getElementById('receivables-module');
    if (!container) return;

    const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';

    if (!window.recvActiveTab) window.recvActiveTab = 'pending';
    const tabFilters = getRecvTabFilters();
    const customerFilter = tabFilters.customer || '';
    const serviceFilter = tabFilters.service || '';
    const orderQ = window.recvOrderFilter;
    const containerQ = window.recvContainerFilter;
    const allInvoices = window.receivablesData.invoices || [];
    const tabInvoices = allInvoices.filter(inv => {
        const isHist = isHistoryInvoice(inv);
        return window.recvActiveTab === 'history' ? isHist : !isHist;
    });

    const servicesForCustomer = new Set();
    tabInvoices.forEach(inv => {
        const cust = (inv.customer_name || 'UNKNOWN').toString().trim().toUpperCase() || 'UNKNOWN';
        if (customerFilter && !customerMatchesFilter(cust, customerFilter)) return;
        if (!invoiceMatchesOrder(inv, orderQ)) return;
        if (!invoiceMatchesContainer(inv, containerQ)) return;
        const svc = invoiceServiceKey(inv);
        if (svc) servicesForCustomer.add(svc);
    });
    if (serviceFilter && !servicesForCustomer.has(serviceFilter)) {
        tabFilters.service = '';
    }
    const activeServiceFilter = tabFilters.service || '';

    const customersForService = new Set();
    tabInvoices.forEach(inv => {
        if (!invoiceMatchesService(inv, activeServiceFilter)) return;
        if (!invoiceMatchesOrder(inv, orderQ)) return;
        if (!invoiceMatchesContainer(inv, containerQ)) return;
        const cust = (inv.customer_name || 'UNKNOWN').toString().trim().toUpperCase() || 'UNKNOWN';
        customersForService.add(cust);
    });
    if (customerFilter && ![...customersForService].some(c => customerMatchesFilter(c, customerFilter))) {
        tabFilters.customer = '';
        servicesForCustomer.clear();
        tabInvoices.forEach(inv => {
            if (!invoiceMatchesOrder(inv, orderQ)) return;
            if (!invoiceMatchesContainer(inv, containerQ)) return;
            const svc = invoiceServiceKey(inv);
            if (svc) servicesForCustomer.add(svc);
        });
    }

    const activeCustomerFilter = tabFilters.customer || '';
    const servicesList = Array.from(servicesForCustomer).sort();
    const customersList = Array.from(customersForService).sort();

    const grouped = {
        pending: {},
        history: {}
    };

    tabInvoices.forEach(inv => {
        if (!invoiceMatchesService(inv, activeServiceFilter)) return;
        if (!invoiceMatchesOrder(inv, window.recvOrderFilter)) return;
        if (!invoiceMatchesContainer(inv, containerQ)) return;

        const custName = (inv.customer_name || 'UNKNOWN').toString().trim().toUpperCase() || 'UNKNOWN';
        const groupKey = isHistoryInvoice(inv) ? 'history' : 'pending';

        if (!grouped[groupKey][custName]) grouped[groupKey][custName] = [];
        grouped[groupKey][custName].push(inv);
    });

    let totalPendingDue = 0;
    let totalPendingCount = 0;
    let totalHistoryCount = 0;
    let totalHistoryCollected = 0;
    for (const [custName, invoices] of Object.entries(grouped.pending)) {
        if (activeCustomerFilter && !customerMatchesFilter(custName, activeCustomerFilter)) continue;
        invoices.forEach(inv => {
            const amtPaid = parseFloat(inv.amount_paid || 0);
            const totalAmt = parseFloat(inv.total_amount || 0);
            totalPendingDue += (totalAmt - amtPaid);
            totalPendingCount++;
        });
    }
    for (const [custName, invoices] of Object.entries(grouped.history)) {
        if (activeCustomerFilter && !customerMatchesFilter(custName, activeCustomerFilter)) continue;
        invoices.forEach(inv => {
            totalHistoryCount++;
            const isWriteOff = (inv.status || '').toLowerCase() === 'written off'
                || (inv.payment_method || '').toString().toUpperCase() === 'WRITE-OFF';
            if (!isWriteOff) {
                totalHistoryCollected += parseFloat(inv.amount_paid || inv.total_amount || 0);
            }
        });
    }

    window.recvSummaryStats = {
        pendingCount: totalPendingCount,
        pendingDue: totalPendingDue,
        historyCount: totalHistoryCount,
        historyCollected: totalHistoryCollected
    };

    let html = `
    <div class="header-banner" style="margin-bottom: 20px;">
        <div>
            <h1><i class="fas fa-file-invoice-dollar" style="color:var(--primary-light);"></i> ACCOUNTS RECEIVABLE</h1>
            <p>Manage and track your customer invoices and payments</p>
        </div>
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <div class="filter-summary-card" style="margin-bottom: 0; border-color: #fca5a5; min-width: 200px;">
                <div id="recv-summary-due-icon" class="filter-summary-icon" style="background: #fef2f2; color: #ef4444;">
                    <i class="fas fa-hand-holding-usd"></i>
                </div>
                <div class="filter-summary-info">
                    <span id="recv-summary-due-label" class="filter-summary-label">Total Due</span>
                    <span id="recv-summary-due-value" class="filter-summary-value" style="color: #ef4444;">$${totalPendingDue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
            </div>
            <div class="filter-summary-card" style="margin-bottom: 0; min-width: 150px;">
                <div class="filter-summary-icon" style="background: #eff6ff; color: #3b82f6;">
                    <i class="fas fa-file-invoice"></i>
                </div>
                <div class="filter-summary-info">
                    <span id="recv-summary-count-label" class="filter-summary-label">Pending Invoices</span>
                    <span id="recv-summary-count-value" class="filter-summary-value">${totalPendingCount}</span>
                </div>
            </div>
            <button type="button" id="btn-refresh-receivables" class="btn-module-refresh" onclick="window.refreshReceivablesModule()" title="Refresh Accounts Receivable from database"><i class="fas fa-sync-alt"></i> Refresh</button>
            <button class="btn-reset-modern" onclick="window.resetReceivablesFilters()" style="margin-left: 15px;"><i class="fas fa-undo"></i> Clear All Filters</button>
        </div>
    </div>
    
    <div class="tabs-container" style="display:flex; gap:10px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom:10px; align-items:center;">
        <button type="button" id="recv-tab-pending" class="glossy-blue-btn" onclick="window.setReceivablesTab('pending')">Pending Invoices</button>
        <button type="button" id="recv-tab-history" class="glossy-dark-btn" onclick="window.setReceivablesTab('history')">Payment History</button>
        
        <select id="recv-customer-filter" onchange="window.setRecvCustomerFilter(this.value)" style="padding: 8px 15px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 700; outline: none; margin-left: auto; color:#0f172a;">
            <option value="" ${!activeCustomerFilter ? 'selected' : ''}>ALL CUSTOMERS</option>
            ${customersList.map(c => `<option value="${c}" ${activeCustomerFilter && customerMatchesFilter(c, activeCustomerFilter) ? 'selected' : ''}>${c}</option>`).join('')}
        </select>

        <select id="recv-service-filter" onchange="window.setRecvServiceFilter(this.value)" style="padding: 8px 15px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 700; outline: none; margin-left: 10px; color:#0f172a;">
            <option value="" ${!activeServiceFilter ? 'selected' : ''}>ALL SERVICES</option>
            ${servicesList.map(s => `<option value="${s}" ${activeServiceFilter && activeServiceFilter === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>

        <input type="text" id="recv-container-filter" placeholder="Container #" oninput="window.recvContainerFilter = this.value; window.renderReceivables();" value="${(window.recvContainerFilter || '').replace(/"/g, '&quot;')}" style="padding: 8px 15px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 700; outline: none; margin-left: 10px; color:#0f172a; width: 130px;">
        <input type="text" id="recv-order-filter" placeholder="Search Order #" oninput="window.recvOrderFilter = this.value; window.renderReceivables();" value="${(window.recvOrderFilter || '').replace(/"/g, '&quot;')}" style="padding: 8px 15px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 700; outline: none; margin-left: 10px; color:#0f172a; width: 160px;" autofocus>
    </div>
    
    <!-- PENDING TAB -->
    <div id="recv-pending">
    `;

    let pendingCount = 0;
    if (Object.keys(grouped.pending).length > 0) {
        for (const [custName, invoices] of Object.entries(grouped.pending)) {
            if (activeCustomerFilter && !customerMatchesFilter(custName, activeCustomerFilter)) continue;
            pendingCount++;
            let totalPending = invoices.reduce((sum, i) => sum + (parseFloat(i.total_amount || 0) - parseFloat(i.amount_paid || 0)), 0);
            html += `
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow:hidden;">
                <div style="background: #f8fafc; padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a;"><i class="fas fa-building" style="color:#3b82f6; margin-right:8px;"></i> ${custName}</h3>
                    <div style="font-weight:900; color:#ef4444; font-size:1.1rem;">Pending: $${totalPending.toFixed(2)}</div>
                </div>
                <div style="padding: 10px 20px;">
                    <table style="width:100%; border-collapse: collapse;">
                        <thead>
                            <tr style="text-align:left; color:#64748b; font-size:0.8rem; border-bottom: 2px solid #e2e8f0;">
                                <th style="padding:8px 0;">INVOICE #</th>
                                <th style="padding:8px 0;">DATE</th>
                                <th style="padding:8px 0;">TOTAL</th>
                                <th style="padding:8px 0; color:#10b981;">PAID</th>
                                <th style="padding:8px 0; color:#ef4444;">BALANCE</th>
                                <th style="padding:8px 0; text-align:right;">ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            invoices.forEach(inv => {
                const d = inv.date_generated ? (window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(inv.date_generated) : inv.date_generated) : 'N/A';
                const displayInvNo = inv.invoice_number ? inv.invoice_number.toString() : 'N/A';
                
                let orderNoExtracted = '';
                const subtitle = getReceivableSubtitle(inv);
                if (subtitle) {
                    orderNoExtracted = `<br><span style="font-size:0.85rem; color:#0f172a; font-weight:600; letter-spacing:0.5px;">${subtitle}</span>`;
                }

                const amtPaid = parseFloat(inv.amount_paid || 0);
                const totalAmt = parseFloat(inv.total_amount || 0);
                const balance = totalAmt - amtPaid;
                
                const createdBy = inv.created_by ? `<div style="font-size:0.65rem; color:#94a3b8; margin-top:2px; font-weight:600;"><i class="fas fa-user" style="margin-right:3px;"></i>${inv.created_by}</div>` : '';
                const calHint = calendarHintForInvoice(inv);
                const calHintHtml = calHint ? `<div style="font-size:0.7rem; color:#0369a1; margin-top:3px; font-weight:700;">${calHint}</div>` : '';
                
                html += `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding:10px 0; font-weight:700;">${displayInvNo}${orderNoExtracted}${calHintHtml}</td>
                                <td style="padding:10px 0; color:#64748b;">${d}${createdBy}</td>
                                <td style="padding:10px 0; font-weight:700;">$${totalAmt.toFixed(2)}</td>
                                <td style="padding:10px 0; font-weight:700; color:#10b981;">$${amtPaid.toFixed(2)}</td>
                                <td style="padding:10px 0; font-weight:700; color:#ef4444;">$${balance.toFixed(2)}</td>
                                <td style="padding:10px 0; text-align:right; display:flex; justify-content:flex-end; gap:10px;">
                                    <button class="glossy-blue-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="openReceivablePreview('${inv.id}')" title="View Invoice">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    ${isAdmin ? `<button class="glossy-green-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="markReceivablePaid('${inv.id}')">
                                        PAY
                                    </button>` : ''}
                                    ${isAdmin ? `<button class="glossy-red-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="deleteReceivable('${inv.id}')" title="Delete Invoice">
                                        <i class="fas fa-trash"></i>
                                    </button>` : ''}
                                </td>
                            </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            </div>`;
        }
    }
    
    if (pendingCount === 0) {
        html += `<p style="color:#64748b; font-style:italic;">No pending invoices found for the selected filter.</p>`;
    }

    html += `</div>`; // End pending tab

    // HISTORY TAB
    html += `<div id="recv-history" style="display:none;">`;
    let historyCount = 0;
    if (Object.keys(grouped.history).length > 0) {
        for (const [custName, invoices] of Object.entries(grouped.history)) {
            if (activeCustomerFilter && !customerMatchesFilter(custName, activeCustomerFilter)) continue;
            historyCount++;
            let totalPaid = invoices.reduce((sum, i) => sum + parseFloat(i.amount_paid || 0), 0);
            html += `
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow:hidden;">
                <div style="background: #f8fafc; padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a;"><i class="fas fa-building" style="color:#10b981; margin-right:8px;"></i> ${custName}</h3>
                    <div style="font-weight:900; color:#10b981; font-size:1.1rem;">Total Paid: $${totalPaid.toFixed(2)}</div>
                </div>
                <div style="padding: 10px 20px;">
                    <table style="width:100%; border-collapse: collapse;">
                        <thead>
                            <tr style="text-align:left; color:#64748b; font-size:0.8rem; border-bottom: 2px solid #e2e8f0;">
                                <th style="padding:8px 0;">INVOICE #</th>
                                <th style="padding:8px 0;">DATE PAID</th>
                                <th style="padding:8px 0;">METHOD</th>
                                <th style="padding:8px 0; text-align:right;">AMOUNT</th>
                                <th style="padding:8px 0; text-align:right; width:140px;">ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            invoices.forEach(inv => {
                const d = inv.paid_date ? (window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(inv.paid_date) : inv.paid_date) : 'N/A';
                const displayInvNo = (inv.invoice_number || '---').toString();
                
                let orderNoExtracted = '';
                const subtitle = getReceivableSubtitle(inv);
                if (subtitle) {
                    orderNoExtracted = `<br><span style="font-size:0.85rem; color:#0f172a; font-weight:600; letter-spacing:0.5px;">${subtitle}</span>`;
                }

                const createdBy = inv.created_by ? `<div style="font-size:0.65rem; color:#94a3b8; margin-top:4px; font-weight:600;"><i class="fas fa-magic" style="margin-right:3px;"></i>Created: ${inv.created_by}</div>` : '';
                const paidBy = inv.paid_by ? `<div style="font-size:0.65rem; color:#10b981; margin-top:2px; font-weight:600;"><i class="fas fa-check-circle" style="margin-right:3px;"></i>Paid: ${inv.paid_by}</div>` : '';
                const calHint = calendarHintForInvoice(inv);
                const calHintHtml = calHint ? `<div style="font-size:0.7rem; color:#0369a1; margin-top:3px; font-weight:700;">${calHint}</div>` : '';

                const isWriteOff = (inv.status || '').toLowerCase() === 'written off'
                    || (inv.payment_method || '').toString().toUpperCase() === 'WRITE-OFF';
                const histAmt = isWriteOff ? 0 : parseFloat(inv.amount_paid || inv.total_amount || 0);
                const methodLabel = isWriteOff ? 'WRITE-OFF' : (inv.payment_method || 'N/A');

                html += `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding:10px 0; font-weight:700; color:#94a3b8;"><del>${displayInvNo}</del>${orderNoExtracted}${calHintHtml}</td>
                                <td style="padding:10px 0; color:#64748b;">${d}${createdBy}${paidBy}</td>
                                <td style="padding:10px 0;">
                                    <span style="background:${isWriteOff ? '#f3e8ff' : '#e0f2fe'}; color:${isWriteOff ? '#7c3aed' : '#0284c7'}; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">${methodLabel}</span>
                                </td>
                                <td style="padding:10px 0; font-weight:700; text-align:right; color:${isWriteOff ? '#7c3aed' : '#10b981'};">${isWriteOff ? '$0.00 (forgiven)' : '$' + histAmt.toFixed(2)}</td>
                                <td style="padding:10px 0; text-align:right; display:flex; justify-content:flex-end; gap:10px;">
                                    <button class="glossy-blue-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="openReceivablePreview('${inv.id}')" title="View Invoice">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    ${isAdmin ? `<button class="glossy-dark-btn" style="height:30px; padding:0 12px; font-size:0.7rem;" onclick="revertReceivable('${inv.id}')" title="Revert payment">
                                        Revertir
                                    </button>` : ''}
                                    ${isAdmin ? `<button class="glossy-red-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="deleteReceivable('${inv.id}')" title="Delete Invoice">
                                        <i class="fas fa-trash"></i>
                                    </button>` : ''}
                                </td>
                            </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            </div>`;
        }
    }
    
    if (historyCount === 0) {
        html += `<p style="color:#64748b; font-style:italic;">No payment history found for the selected filter.</p>`;
    }
    html += `</div>`;

    const activeEl = document.activeElement;
    const focusFilterId = activeEl && (activeEl.id === 'recv-order-filter' || activeEl.id === 'recv-container-filter') ? activeEl.id : null;
    let cursorPos = 0;
    if (focusFilterId) {
        cursorPos = activeEl.selectionStart;
    }

    container.innerHTML = html;
    applyReceivablesTabUI();

    if (focusFilterId) {
        const newEl = document.getElementById(focusFilterId);
        if (newEl) {
            newEl.focus();
            newEl.setSelectionRange(cursorPos, cursorPos);
        }
    }
};

window.markReceivablePaid = function (id, balance, invoiceNumber, custName, totalAmount, amtPaid) {
    const isAdmin = typeof window.isAdmin === 'function'
        ? window.isAdmin()
        : (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
    if (!isAdmin) {
        alert('Only administrators can register payments in Accounts Receivable.');
        return;
    }
    const inv = (window.receivablesData.invoices || []).find(i => String(i.id) === String(id));
    if (inv) {
        totalAmount = parseFloat(inv.total_amount) || 0;
        amtPaid = parseFloat(inv.amount_paid) || 0;
        balance = totalAmount - amtPaid;
        invoiceNumber = inv.invoice_number;
        custName = inv.customer_name;
    }
    balance = parseFloat(balance) || 0;
    totalAmount = parseFloat(totalAmount) || 0;
    amtPaid = parseFloat(amtPaid) || 0;

    // Remove existing modal if any
    let existing = document.getElementById('receivables-payment-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'receivables-payment-modal';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.7)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.borderRadius = '16px';
    modal.style.padding = '30px';
    modal.style.width = '420px';
    modal.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
    modal.style.fontFamily = "'Outfit', sans-serif";

    const paySubtitle = inv ? getReceivableSubtitle(inv) : '';

    let html = `
        <h2 style="margin: 0 0 10px 0; color: #0f172a; font-size: 1.5rem;"><i class="fas fa-money-check-alt" style="color: #3b82f6;"></i> Process Payment</h2>
        <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:20px;">
            <p style="margin: 0 0 5px 0; color: #64748b; font-size: 0.95rem;">Invoice: <strong style="color:#0f172a;">${invoiceNumber}</strong></p>
            ${paySubtitle ? `<p style="margin:0 0 8px 0;color:#0f172a;font-weight:800;font-size:0.9rem;">${paySubtitle}</p>` : ''}
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem;">
                <span style="color:#64748b;">Total Invoice:</span>
                <span style="font-weight:700;">$${totalAmount.toFixed(2)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem;">
                <span style="color:#64748b;">Amount Paid:</span>
                <span style="font-weight:700; color:#10b981;">$${amtPaid.toFixed(2)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:1.1rem; margin-top:10px; border-top:1px dashed #cbd5e1; padding-top:10px;">
                <span style="color:#0f172a; font-weight:900;">Balance Due:</span>
                <span style="font-weight:900; color:#ef4444;">$${balance.toFixed(2)}</span>
            </div>
        </div>

        <div id="recv-step-1">
            <p style="margin:0 0 10px 0; font-size: 0.95rem; color: #334155; font-weight:700;">Payment Amount:</p>
            <div style="position: relative; margin-bottom:20px;">
                <span style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); font-weight: 900; color: #64748b; font-size:1.2rem;">$</span>
                <input type="number" id="recv-payment-amount" value="${balance.toFixed(2)}" max="${balance.toFixed(2)}" style="width: 100%; padding: 15px 15px 15px 35px; border: 2px solid #3b82f6; border-radius: 10px; font-size: 1.2rem; font-weight: 900; color:#0f172a; outline: none;">
            </div>
            <button id="btn-next-step" class="glossy-blue-btn" style="width: 100%; justify-content: center; font-size:1.1rem; padding:15px;">NEXT <i class="fas fa-arrow-right" style="margin-left:10px;"></i></button>
            <button type="button" id="btn-write-off" style="margin-top:12px; width:100%; background:#faf5ff; border:1px solid #d8b4fe; padding:12px; border-radius:10px; cursor:pointer; color:#6b21a8; font-weight:800;">Write off / Complimentary (no collection)</button>
        </div>
        
        <div id="recv-step-2" style="display: none;">
            <p style="margin:0 0 15px 0; font-size: 0.95rem; color: #334155; font-weight:700; text-align:center;">Select Payment Method for <span id="display-pay-amt" style="color:#3b82f6; font-size:1.2rem;">$0.00</span></p>
            <div id="recv-method-selection" style="display: flex; flex-direction: column; gap: 10px;">
                <button type="button" id="btn-pay-bank" class="glossy-blue-btn" style="width: 100%; justify-content: center;">ALL BANK</button>
                <button type="button" id="btn-pay-cash" class="glossy-green-btn" style="width: 100%; justify-content: center;">ALL CASH</button>
                <button type="button" id="btn-pay-split" class="glossy-dark-btn" style="width: 100%; justify-content: center;">SPLIT PAYMENT</button>
            </div>

            <div id="recv-split-input" style="display: none; flex-direction: column; gap: 15px;">
                <p style="margin:0; font-size: 0.9rem; color: #334155;">Enter the portion paid in <strong>CASH</strong>:</p>
                <div style="position: relative;">
                    <span style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); font-weight: 900; color: #64748b;">$</span>
                    <input type="number" id="recv-cash-amount" placeholder="0.00" style="width: 100%; padding: 12px 15px 12px 30px; border: 2px solid #cbd5e1; border-radius: 10px; font-size: 1.1rem; font-weight: 700; outline: none;">
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:0.85rem; font-weight:700;">
                    <span>Bank Portion:</span>
                    <span id="recv-bank-portion">$0.00</span>
                </div>
                <button id="btn-confirm-split" class="glossy-red-btn" style="width: 100%; justify-content: center;">CONFIRM SPLIT</button>
            </div>
            
            <button id="btn-back-step" style="margin-top: 15px; width: 100%; background: transparent; border: none; cursor: pointer; color: #64748b; font-weight: 700; text-decoration:underline;">Back</button>
        </div>

        <button id="btn-cancel-payment" style="margin-top: 15px; width: 100%; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 12px; border-radius: 10px; cursor: pointer; color: #475569; font-weight: 700; transition: all 0.2s;">CANCEL</button>
    `;

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('#btn-cancel-payment');
    closeBtn.onclick = () => overlay.remove();
    
    let currentPaymentAmount = balance;

    const markLinkedRentalTripsSettled = async (invoiceRecord, writeOffReason) => {
        if (typeof window.settleLinkedTripsFromReceivable === 'function') {
            await window.settleLinkedTripsFromReceivable(invoiceRecord, writeOffReason);
        }
    };

    const processWriteOff = async () => {
        const reason = prompt('Write off this invoice with no collection.\nReason (required), e.g. complimentary week:');
        if (reason === null) return;
        const trimmed = (reason || '').trim();
        if (!trimmed) {
            alert('A reason is required to write off an invoice.');
            return;
        }
        if (!confirm(`This will close invoice ${invoiceNumber} as complimentary. No money will be recorded in Cash Ledger or Profit. Continue?`)) {
            return;
        }
        const woBtn = overlay.querySelector('#btn-write-off');
        if (woBtn) woBtn.disabled = true;
        try {
            const extraNote = `<div style="margin-top:8px;color:#7c3aed;font-weight:700;">WRITE-OFF: ${trimmed.replace(/</g, '')}</div>`;
            const invoiceRecord = window.receivablesData.invoices.find(i => i.id === id);
            const updatePayload = {
                amount_paid: amtPaid,
                status: 'Written Off',
                payment_method: 'WRITE-OFF',
                paid_date: new Date().toISOString(),
                paid_by: window.userEmail || window.userName || 'Unknown',
                details_html: ((invoiceRecord && invoiceRecord.details_html) ? invoiceRecord.details_html : '') + extraNote
            };
            const { error: updateErr } = await window.db.from('receivables_invoices').update(updatePayload).eq('id', id);
            if (updateErr) throw updateErr;
            if (window.logActivity) {
                window.logActivity('UPDATED_RECORD', `[${new Date().toLocaleString()}] Write-off invoice ${invoiceNumber}. Reason: ${trimmed}`);
            }
            await markLinkedRentalTripsSettled(invoiceRecord, trimmed);
            overlay.remove();
            await loadReceivables();
            renderReceivables();
            if (typeof window.reconcileRentalTripsFromReceivables === 'function') {
                await window.reconcileRentalTripsFromReceivables();
            }
            if (typeof window.renderBillingTable === 'function') window.renderBillingTable();
        } catch (err) {
            console.error('Error writing off invoice:', err);
            alert('Failed to write off invoice: ' + err.message);
            if (woBtn) woBtn.disabled = false;
        }
    };

    overlay.querySelector('#btn-next-step').onclick = () => {
        const inputVal = parseFloat(overlay.querySelector('#recv-payment-amount').value);
        if (!inputVal || inputVal <= 0) {
            alert("Please enter a valid payment amount.");
            return;
        }
        if (inputVal > balance + 0.01) {
            alert(`Payment cannot exceed the balance due ($${balance.toFixed(2)}).`);
            return;
        }
        currentPaymentAmount = inputVal;
        overlay.querySelector('#display-pay-amt').textContent = `$${currentPaymentAmount.toFixed(2)}`;
        overlay.querySelector('#recv-bank-portion').textContent = `$${currentPaymentAmount.toFixed(2)}`;
        overlay.querySelector('#recv-step-1').style.display = 'none';
        overlay.querySelector('#recv-step-2').style.display = 'block';
    };

    overlay.querySelector('#btn-back-step').onclick = () => {
        overlay.querySelector('#recv-step-2').style.display = 'none';
        overlay.querySelector('#recv-step-1').style.display = 'block';
    };

    const processPayment = async (cashAmount, bankAmount, label) => {
        if ((inv.status || '') === 'Paid') {
            alert('This invoice is already paid.');
            return;
        }
        const btnAllBank = overlay.querySelector('#btn-pay-bank');
        const btnAllCash = overlay.querySelector('#btn-pay-cash');
        const btnSplit = overlay.querySelector('#btn-pay-split');
        const btnConfirmSplit = overlay.querySelector('#btn-confirm-split');
        if (btnAllBank) btnAllBank.disabled = true;
        if (btnAllCash) btnAllCash.disabled = true;
        if (btnSplit) btnSplit.disabled = true;
        if (btnConfirmSplit) btnConfirmSplit.disabled = true;

        const newAmountPaid = amtPaid + cashAmount + bankAmount;
        // Consider it fully paid if the difference is less than 2 cents
        const isFullyPaid = (totalAmount - newAmountPaid) <= 0.01;
        const newStatus = isFullyPaid ? 'Paid' : 'Partial';

        try {
            const updatePayload = {
                amount_paid: newAmountPaid,
                status: newStatus,
                paid_date: new Date().toISOString()
            };
            if (isFullyPaid) {
                updatePayload.payment_method = label; // Only label method if fully paid
                updatePayload.paid_by = window.userEmail || window.userName || 'Unknown';
            }

            const { error: updateErr } = await window.db.from('receivables_invoices')
                .update(updatePayload)
                .eq('id', id);

            if (updateErr) throw updateErr;
            if (window.logActivity) window.logActivity("UPDATED_RECORD", `[${new Date().toLocaleString()}] Actualizó Pago en Accounts Receivable ID: ${id}. Pagado: $${newAmountPaid}`);

            if (isFullyPaid) {
                const invoiceRecord = window.receivablesData.invoices.find(i => String(i.id) === String(id)) || inv;
                await markLinkedRentalTripsSettled(invoiceRecord, null);
            }

            if (cashAmount > 0) {
                if (window.logCashTransaction) {
                    await window.logCashTransaction({
                        tipo: 'ingreso',
                        metodo: 'cash',
                        monto: cashAmount,
                        descripcion: `Payment for Invoice ${invoiceNumber} (CASH)`,
                        referencia: invoiceNumber,
                        cliente: custName,
                        date: new Date().toISOString().split('T')[0]
                    });
                } else {
                    const entry = {
                        date: new Date().toISOString().split('T')[0],
                        tipo: 'ingreso',
                        metodo: 'cash',
                        monto: cashAmount,
                        descripcion: `Payment for Invoice ${invoiceNumber} (CASH)`,
                        referencia: invoiceNumber,
                        cliente: custName
                    };
                    const { error: ledgerErr } = await window.db.from('cash_ledger').insert([entry]);
                    if (ledgerErr) console.error('[Receivables] Error saving cash to ledger:', ledgerErr);
                }
            }

            if (bankAmount > 0) {
                if (window.logCashTransaction) {
                    await window.logCashTransaction({
                        tipo: 'ingreso',
                        metodo: 'bank',
                        monto: bankAmount,
                        descripcion: `Payment for Invoice ${invoiceNumber} (BANK)`,
                        referencia: invoiceNumber,
                        cliente: custName,
                        date: new Date().toISOString().split('T')[0]
                    });
                } else {
                    const entry = {
                        date: new Date().toISOString().split('T')[0],
                        tipo: 'ingreso',
                        metodo: 'bank',
                        monto: bankAmount,
                        descripcion: `Payment for Invoice ${invoiceNumber} (BANK)`,
                        referencia: invoiceNumber,
                        cliente: custName
                    };
                    const { error: ledgerErr } = await window.db.from('cash_ledger').insert([entry]);
                    if (ledgerErr) console.error('[Receivables] Error saving bank to ledger:', ledgerErr);
                }
            }

            overlay.remove();
            await loadReceivables();
            renderReceivables();
            if (typeof window.reconcileRentalTripsFromReceivables === 'function') {
                await window.reconcileRentalTripsFromReceivables();
            }
            if (typeof window.renderBillingTable === 'function') window.renderBillingTable();

        } catch (err) {
            console.error('Error marking paid:', err);
            alert('Failed to process payment: ' + err.message);
            if (btnAllBank) btnAllBank.disabled = false;
            if (btnAllCash) btnAllCash.disabled = false;
            if (btnSplit) btnSplit.disabled = false;
            if (btnConfirmSplit) btnConfirmSplit.disabled = false;
        }
    };

    overlay.querySelector('#btn-pay-bank').onclick = () => processPayment(0, currentPaymentAmount, 'Bank');
    overlay.querySelector('#btn-pay-cash').onclick = () => processPayment(currentPaymentAmount, 0, 'Cash');
    const writeOffBtn = overlay.querySelector('#btn-write-off');
    if (writeOffBtn) writeOffBtn.onclick = () => processWriteOff();

    const splitInputDiv = overlay.querySelector('#recv-split-input');
    const methodSelectionDiv = overlay.querySelector('#recv-method-selection');

    overlay.querySelector('#btn-pay-split').onclick = () => {
        methodSelectionDiv.style.display = 'none';
        splitInputDiv.style.display = 'flex';
        overlay.querySelector('#recv-cash-amount').focus();
    };

    const cashInput = overlay.querySelector('#recv-cash-amount');
    const bankPortionSpan = overlay.querySelector('#recv-bank-portion');

    cashInput.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value) || 0;
        if (val > currentPaymentAmount) {
            val = currentPaymentAmount;
            e.target.value = val;
        }
        bankPortionSpan.textContent = '$' + (currentPaymentAmount - val).toFixed(2);
    });

    overlay.querySelector('#btn-confirm-split').onclick = () => {
        const cashAmount = parseFloat(cashInput.value) || 0;
        const bankAmount = currentPaymentAmount - cashAmount;
        if (cashAmount <= 0 && bankAmount <= 0) {
            alert('Please enter a valid amount.');
            return;
        }
        processPayment(cashAmount, bankAmount, 'Split');
    };
};

// Returns true only when the invoice was actually stored in Accounts Receivable.
// Callers must not mark orders as invoiced when this returns false.
window.addInvoiceToReceivables = async function (customerName, invoiceNumber, totalAmount, detailsHtml = '', tripIds = [], serviceType = '', amountPaid = 0, paymentMethod = '', opts = {}) {
    if (!customerName || !invoiceNumber || !totalAmount) return false;
    try {
        const customerUpper = customerName.trim().toUpperCase();

        // Anti-Duplicado por Número de Factura Exacto (Double-click protection)
        const { data: dupInvNo } = await window.db.from('receivables_invoices')
            .select('id')
            .eq('invoice_number', invoiceNumber)
            .or('is_deleted.eq.false,is_deleted.is.null');

        if (dupInvNo && dupInvNo.length > 0) {
            console.warn(`[Receivables] Anti-duplicate: Invoice ${invoiceNumber} is already recorded.`);
            return false;
        }

        // Build trip sync metadata
        const tripIdsStr = Array.isArray(tripIds) ? tripIds.filter(Boolean).join(',') : (tripIds || '');
        const svcType = (serviceType || '').toString().toUpperCase().trim();

        const isAdminUser = typeof window.isAdmin === 'function'
            ? window.isAdmin()
            : (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
        // Silent auto-invoices (rentals cycles) must only be created by admins
        if (opts.silent && !isAdminUser) {
            console.warn(`[Receivables] Skipping silent invoice ${invoiceNumber}: only admins can auto-create AR invoices.`);
            return false;
        }

        const insertPayload = {
            customer_name: customerUpper,
            invoice_number: invoiceNumber,
            total_amount: parseFloat(totalAmount),
            details_html: detailsHtml,
            trip_ids: tripIdsStr || null,
            service_type: svcType || null,
            status: 'PENDING',
            amount_paid: 0,
            created_by: opts.created_by || window.userEmail || window.userName || 'Unknown'
        };

        const amt = parseFloat(amountPaid) || 0;
        const tot = parseFloat(totalAmount) || 0;

        if (amt > 0) {
            insertPayload.amount_paid = amt;
            insertPayload.paid_date = new Date().toISOString();
            insertPayload.payment_method = paymentMethod;
            insertPayload.status = (amt >= tot) ? 'Paid' : 'Partial';
            if (amt >= tot) {
                insertPayload.paid_by = window.userEmail || window.userName || 'Unknown';
            }
        }

        const { error } = await window.db.from('receivables_invoices').insert([insertPayload]);
        if (error) throw error;
        console.log(`[Receivables] Invoice ${invoiceNumber} added to AR. Trips: ${tripIdsStr}, Service: ${svcType}`);
        if (!opts.silent) {
            await loadReceivables();
        }
        return true;
    } catch (err) {
        console.error('[Receivables] Failed to add invoice to AR:', err);
        if (!opts || !opts.silent) {
            alert('Error al guardar en Accounts Receivable: ' + err.message);
        }
        return false;
    }
};

window.revertReceivable = async function (id) {
    const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
    if (!isAdmin) {
        alert('Acceso denegado: Solo los administradores pueden revertir facturas.');
        return;
    }
    const inv = (window.receivablesData.invoices || []).find(i => String(i.id) === String(id));
    if (!inv) return;
    const invNo = inv.invoice_number || '';
    const isWriteOff = (inv.status || '').toLowerCase() === 'written off'
        || (inv.payment_method || '').toString().toUpperCase() === 'WRITE-OFF';
    const msg = isWriteOff
        ? `Revertir ${invNo} a pendiente.\nNo hay cobro en caja (write-off). El viaje dejará de verse pagado por esta factura.`
        : `Revertir ${invNo} a pendiente.\nSe quitará de caja el cobro de esta factura y el viaje volverá a pendiente de pago.`;
    if (!confirm(msg)) return;
    try {
        let ledger = { count: 0, total: 0 };
        if (!isWriteOff && typeof window.removeCashLedgerForInvoice === 'function') {
            ledger = await window.removeCashLedgerForInvoice(invNo);
        }
        await window.unsetLinkedTripsFromReceivable(inv, { silent: true });
        const { error } = await window.db.from('receivables_invoices').update({
            status: 'PENDING',
            amount_paid: 0,
            payment_method: null,
            paid_date: null,
            paid_by: null
        }).eq('id', id);
        if (error) throw error;
        if (window.logActivity) {
            window.logActivity('UPDATED_RECORD', `[${new Date().toLocaleString()}] Revirtió factura ${invNo}. Caja: ${ledger.count} movimiento(s), $${(ledger.total || 0).toFixed(2)}`);
        }
        await loadReceivables();
        renderReceivables();
        if (typeof window.renderBillingTable === 'function') window.renderBillingTable();
        if (typeof window.applyAdvancedFilters === 'function') window.applyAdvancedFilters();
        alert(ledger.count
            ? `Factura revertida. Se quitaron ${ledger.count} movimiento(s) de caja ($${(ledger.total || 0).toFixed(2)}).`
            : 'Factura revertida a pendiente.');
    } catch (err) {
        console.error('[Receivables] Error reverting invoice:', err);
        alert('No se pudo revertir: ' + err.message);
    }
};

window.deleteReceivable = async function (id) {
    const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
    if (!isAdmin) {
        alert("Acceso denegado: Solo los administradores pueden eliminar registros.");
        return;
    }
    const inv = window.receivablesData.invoices.find(i => i.id === id);
    const invNo = (inv && inv.invoice_number) || '';
    const isWriteOff = inv && ((inv.status || '').toLowerCase() === 'written off'
        || (inv.payment_method || '').toString().toUpperCase() === 'WRITE-OFF');
    if (!confirm(`Eliminar factura ${invNo || ''}?\nSe quitará de caja el cobro ligado a esta factura (si existe) y el pagado del viaje que vino de ella.`)) return;
    try {
        let ledger = { count: 0, total: 0 };
        if (inv && !isWriteOff && typeof window.removeCashLedgerForInvoice === 'function') {
            ledger = await window.removeCashLedgerForInvoice(invNo);
        }
        if (inv && typeof window.unsetLinkedTripsFromReceivable === 'function') {
            await window.unsetLinkedTripsFromReceivable(inv, { silent: true });
        }
        const { error } = await window.db.from('receivables_invoices').update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: window.userEmail }).eq('id', id);
        if (error) throw error;

        // Delete ghost trips associated with RENTAL or YARD STORAGE invoices
        if (inv && (inv.service_type === 'RENTAL' || inv.service_type === 'YARD STORAGE') && inv.trip_ids) {
            const tripIds = inv.trip_ids.split(',').map(s => s.trim()).filter(t => t && !t.startsWith('RENTAL_ID:'));
            if (tripIds.length > 0) {
                await window.db.from('trips').delete().in('trip_id', tripIds);
                if (window.currentTrips) {
                    window.currentTrips = window.currentTrips.filter(t => !tripIds.includes(t[0]));
                }
                if (typeof window.applyAdvancedFilters === 'function') window.applyAdvancedFilters();
            }
        }

        console.log(`[Receivables] Invoice ${id} deleted.`);
        if (window.logActivity) {
            window.logActivity('DELETED_RECORD', `[${new Date().toLocaleString()}] Eliminó factura ${invNo}. Caja: ${ledger.count} movimiento(s), $${(ledger.total || 0).toFixed(2)}`);
        }
        await loadReceivables();
        renderReceivables();
        if (typeof window.renderBillingTable === 'function') window.renderBillingTable();
        if (typeof window.applyAdvancedFilters === 'function') window.applyAdvancedFilters();
        if (ledger.count) {
            alert(`Factura eliminada. Se quitaron ${ledger.count} movimiento(s) de caja ($${(ledger.total || 0).toFixed(2)}).`);
        }
    } catch (err) {
        console.error('[Receivables] Error deleting invoice:', err);
        alert('Failed to delete invoice: ' + err.message);
    }
};

window.openReceivablePreview = async function (id) {
    const inv = window.receivablesData.invoices.find(i => String(i.id) === String(id));
    if (!inv) return;

    const invoiceNumber = inv.invoice_number;
    const customerName = inv.customer_name;

    if (!inv.trip_ids) {
        alert('This invoice record does not have associated trip data and cannot be opened in the main billing modal. Please use the Billing module.');
        return;
    }

    const tripIds = inv.trip_ids.split(',').map(tid => tid.trim()).filter(tid => tid && !tid.startsWith('RENTAL_ID:'));
    if (!tripIds.length) {
        alert('This invoice has no linked trips to preview.');
        return;
    }

    let rows = tripIds.map(findTripRowById).filter(Boolean);

    if (rows.length === 0 && window.db) {
        try {
            const { data } = await window.db.from('trips').select('*').in('trip_id', tripIds);
            if (data && data.length && typeof window.mapTripToArray === 'function') {
                rows = data.map(window.mapTripToArray).filter(Boolean);
                rows.forEach(r => {
                    if (typeof window.rememberRentalInvoiceTrip === 'function' && (r[26] || '').toString().toUpperCase() === 'RENTAL INVOICE') {
                        window.rememberRentalInvoiceTrip(r);
                    }
                });
            }
        } catch (e) {
            console.warn('[Receivables] Preview fetch failed', e);
        }
    }

    if (rows.length === 0) {
        alert("Could not find the original orders for this invoice. They might have been deleted.");
        return;
    }

    if (window.openMasterBillingModal) {
        let preselected = 'TRANSPORT,RENT,SALES,STORAGE,YARD';
        let groupBy = 'ORDER';
        const svcType = inv.service_type || '';
        const companyKey = window.parseBillingCompanyFromSvcType
            ? window.parseBillingCompanyFromSvcType(svcType)
            : 'RP_TULIPAN';
        const svcClean = svcType.replace(/\|COMPANY:[^|]*/gi, '');
        if (svcClean) {
            if (svcClean.includes('|GROUP:')) {
                const parts = svcClean.split('|GROUP:');
                preselected = parts[0] || preselected;
                groupBy = (parts[1] || 'ORDER').split('|')[0] || 'ORDER';
            } else {
                preselected = svcClean;
            }
        }
        window.openMasterBillingModal(rows, invoiceNumber, customerName, false, preselected, true, groupBy, companyKey);
    } else {
        alert("Billing module is not fully loaded.");
    }
};
