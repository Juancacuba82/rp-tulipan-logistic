(function() {
    window.currentRentals = [];
    window.rentalInvoiceTrips = window.rentalInvoiceTrips || [];
    let editingRentalId = null;
    let originalRentalState = null;

    function parseLocalDate(str) {
        if (!str || str === '---') return null;
        const s = str.toString().trim();
        if (s.includes('-')) {
            const [y, m, d] = s.split('-').map(Number);
            if (!y || !m || !d) return null;
            return new Date(y, m - 1, d);
        }
        if (s.includes('/')) {
            const [m, d, y] = s.split('/').map(Number);
            if (!y || !m || !d) return null;
            return new Date(y, m - 1, d);
        }
        return null;
    }

    function stripRentalIdFromNote(note) {
        return (note || '').toString().replace(/\s*\|\s*RID:.*/i, '').trim();
    }

    function extractRentalIdFromNote(note) {
        const m = (note || '').toString().match(/\|\s*RID:([^\s|]+)/i);
        return m ? m[1] : '';
    }

    function formatRentalInvoiceNote(periodLabel, rentalId) {
        const period = (periodLabel || '').toString().trim();
        return rentalId ? `${period} | RID:${rentalId}` : period;
    }

    function rememberRentalInvoiceTrip(tripArr) {
        if (!tripArr || !tripArr[0]) return;
        if (!window.rentalInvoiceTrips) window.rentalInvoiceTrips = [];
        const idx = window.rentalInvoiceTrips.findIndex(t => t[0] === tripArr[0]);
        if (idx !== -1) window.rentalInvoiceTrips[idx] = tripArr;
        else window.rentalInvoiceTrips.unshift(tripArr);
    }

    function getRentalInvoiceTrips() {
        const byId = new Map();
        const add = (arr) => {
            if (!arr || !arr.length) return;
            arr.forEach(t => {
                if (!t || !t[0]) return;
                if ((t[26] || '').toString().toUpperCase() === 'RENTAL INVOICE') {
                    byId.set(t[0], t);
                }
            });
        };
        add(window.rentalInvoiceTrips);
        add(window.currentTrips);
        add(window.combinedBillingTrips);
        add(window.allTripsUnfiltered);
        return [...byId.values()];
    }

    function getInvoicePeriod(trip) {
        let start = parseLocalDate(trip[28] && trip[28] !== '---' ? trip[28] : '');
        let end = parseLocalDate(trip[29] && trip[29] !== '---' ? trip[29] : '');
        if (!start || !end) {
            const period = stripRentalIdFromNote(trip[25]);
            const m = period.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
            if (m) {
                start = start || parseLocalDate(m[1]);
                end = end || parseLocalDate(m[2]);
            }
        }
        return { start, end };
    }

    function datesOverlap(aStart, aEnd, bStart, bEnd) {
        if (!aStart || !aEnd || !bStart || !bEnd) return false;
        return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
    }

    function toIsoDate(d) {
        if (!d || isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function rentCycleUnit(timeRent) {
        const t = (timeRent || '').toLowerCase();
        if (t === 'weekly') return 'weekly';
        if (t === 'diary' || t === 'daily') return 'daily';
        return 'monthly';
    }

    function nextCycleStart(start, unit, n) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        if (unit === 'monthly') return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
        const x = new Date(d);
        x.setDate(x.getDate() + n * (unit === 'weekly' ? 7 : 1));
        return x;
    }

    function cycleUnitLabels(unit, count) {
        if (unit === 'monthly') return count === 1 ? 'Month' : 'Months';
        if (unit === 'weekly') return count === 1 ? 'Week' : 'Weeks';
        return count === 1 ? 'day' : 'days';
    }

    function buildPrepaidCycles(startDateStr, timeRent, throughDate, maxCycles = 800) {
        const start = parseLocalDate(startDateStr);
        if (!start) return [];
        start.setHours(0, 0, 0, 0);
        const through = new Date(throughDate);
        through.setHours(0, 0, 0, 0);
        const unit = rentCycleUnit(timeRent);
        const cycles = [];
        for (let i = 0; i < maxCycles; i++) {
            const cStart = nextCycleStart(start, unit, i);
            if (cStart.getTime() > through.getTime()) break;
            const cNext = nextCycleStart(start, unit, i + 1);
            const cEnd = new Date(cNext.getFullYear(), cNext.getMonth(), cNext.getDate());
            cEnd.setDate(cEnd.getDate() - 1);
            cycles.push({ start: cStart, end: cEnd, index: i });
        }
        return cycles;
    }

    function mergeRentalInvoicePool(byRid, byCont) {
        const pool = new Map();
        byRid.forEach(t => pool.set(t[0], t));
        byCont.forEach(t => {
            if (!pool.has(t[0])) pool.set(t[0], t);
        });
        return [...pool.values()];
    }

    function buildRentalInvoicePoolForRow(row, trips) {
        if (!trips.length || !row) return [];
        const rid = row.id != null ? String(row.id) : '';
        const cont = (row.container_no || '').toString().trim().toUpperCase();
        const byRid = [];
        const byCont = [];
        trips.forEach(t => {
            const noteRid = extractRentalIdFromNote(t[25]);
            if (rid && noteRid && String(noteRid) === rid) {
                byRid.push(t);
                return;
            }
            const tCont = (t[3] || '').toString().trim().toUpperCase();
            if (cont && tCont === cont && tCont !== '---' && tCont !== 'TBA') {
                byCont.push(t);
            }
        });
        return mergeRentalInvoicePool(byRid, byCont);
    }

    function getRentalInvoicePool(row) {
        return buildRentalInvoicePoolForRow(row, getRentalInvoiceTrips());
    }

    function buildReceivableSettlementByTripId() {
        const map = new Map();
        const invoices = (window.receivablesData && window.receivablesData.invoices) || [];
        invoices.forEach(inv => {
            const st = (inv.status || '').toLowerCase();
            const method = (inv.payment_method || '').toString().toUpperCase();
            const settled = st === 'paid' || st === 'written off' || method === 'WRITE-OFF';
            if (!settled) return;
            const ids = (inv.trip_ids || '').toString().split(',').map(s => s.trim()).filter(t => t && !t.startsWith('RENTAL_ID:'));
            ids.forEach(tid => map.set(String(tid), inv));
        });
        return map;
    }

    function getReceivableSettlementByTripId() {
        const invoices = (window.receivablesData && window.receivablesData.invoices) || [];
        const count = invoices.length;
        if (window._recvSettlementMap && window._recvSettlementInvCount === count) {
            return window._recvSettlementMap;
        }
        const map = buildReceivableSettlementByTripId();
        window._recvSettlementMap = map;
        window._recvSettlementInvCount = count;
        return map;
    }

    function isTripCycleSettled(trip, recvByTripId) {
        if (!trip) return false;
        const st = (trip[31] || '').toString().trim().toUpperCase();
        const note = (trip[25] || '').toString();
        if (st === 'PAID' || /WRITE-?OFF|WAIVED|COMPLIMENTARY/i.test(note)) return true;
        const tid = trip && trip[0] != null ? String(trip[0]) : '';
        if (tid && recvByTripId && recvByTripId.has(tid)) return true;
        return false;
    }

    async function ensureReceivablesForRentals() {
        if (typeof window.loadReceivables !== 'function') return;
        const list = window.receivablesData && window.receivablesData.invoices;
        if (!list || !list.length) {
            await window.loadReceivables();
        }
        window._recvSettlementMap = null;
    }

    async function reconcileRentalTripsFromReceivables() {
        try {
            await ensureReceivablesForRentals();
            const recvByTripId = getReceivableSettlementByTripId();
            if (!recvByTripId.size || !window.db) return 0;

            const rows = window.currentRentals || [];
            if (!rows.length) return 0;

            const seen = new Set();
            let patched = 0;

            for (const row of rows) {
                const status = (row.status || '').trim().toUpperCase();
                if (status && status !== 'ACTIVE' && status !== 'FINISHED') continue;

                for (const trip of getRentalInvoicePool(row)) {
                    const tid = trip && trip[0] != null ? String(trip[0]) : '';
                    if (!tid || seen.has(tid)) continue;
                    seen.add(tid);

                    if (!recvByTripId.has(tid)) continue;
                    if (isTripCycleSettled(trip, null)) continue;

                    const inv = recvByTripId.get(tid);
                    const isWriteOff = (inv.status || '').toLowerCase() === 'written off'
                        || (inv.payment_method || '').toString().toUpperCase() === 'WRITE-OFF';
                    const patch = { st_rent: 'PAID', paid: true };
                    try {
                        if (isWriteOff) {
                            const { data: tripRows } = await window.db.from('trips').select('note').eq('trip_id', tid).limit(1);
                            const existing = (tripRows && tripRows[0] && tripRows[0].note) ? tripRows[0].note : (trip[25] || '');
                            if (!/WRITE-?OFF/i.test(existing)) {
                                patch.note = existing + ' | WRITE-OFF';
                            }
                        }
                        await window.db.from('trips').update(patch).eq('trip_id', tid);
                        patched += 1;
                        const applyLocal = (arr) => {
                            if (!arr) return;
                            const local = arr.find(t => String(t[0]) === tid);
                            if (!local) return;
                            local[31] = 'PAID';
                            if (patch.note) local[25] = patch.note;
                        };
                        applyLocal(window.rentalInvoiceTrips);
                        applyLocal(window.currentTrips);
                        applyLocal(window.combinedBillingTrips);
                    } catch (e) {
                        console.warn('[Rentals] Reconcile trip from Account failed', tid, e);
                    }
                }
            }

            if (patched > 0) {
                console.log(`[Rentals] Reconciled ${patched} rental invoice trip(s) with Account (Paid / Write-off).`);
                window._recvSettlementMap = null;
            }
            return patched;
        } catch (err) {
            console.warn('[Rentals] Reconcile skipped due to error:', err);
            return 0;
        }
    }

    function getPrepaidBalance(row, filterStartStr, filterEndStr) {
        const unit = rentCycleUnit(row.time_rent);
        const priced = parseFloat(row.base_price) || 0;
        const empty = {
            cyclesDue: 0,
            unpaidCycles: 0,
            amountDue: 0,
            paymentStatus: 'PAID',
            needsAlert: false,
            unit,
            cycleLabel: '0',
            invoiceStart: null,
            invoiceEnd: null,
            unpaid: [],
            unbilled: []
        };
        if (!row || !row.start_date) return empty;

        const status = (row.status || '').trim().toUpperCase();
        let through = new Date();
        through.setHours(0, 0, 0, 0);
        if (status === 'FINISHED' && row.final_date) {
            const fd = parseLocalDate(row.final_date);
            if (fd) {
                fd.setHours(0, 0, 0, 0);
                through = fd;
            }
        }

        let cycles = buildPrepaidCycles(row.start_date, row.time_rent, through);
        const fStart = parseLocalDate(filterStartStr);
        const fEnd = parseLocalDate(filterEndStr);
        if (fStart || fEnd) {
            const rs = fStart || new Date(2000, 0, 1);
            const re = fEnd || new Date(2099, 11, 31);
            rs.setHours(0, 0, 0, 0);
            re.setHours(0, 0, 0, 0);
            cycles = cycles.filter(c => datesOverlap(c.start, c.end, rs, re));
        }

        const invoices = getRentalInvoicePool(row);
        const recvByTripId = getReceivableSettlementByTripId();
        const unpaid = [];
        const unbilled = [];
        let billedUnpaid = 0;
        cycles.forEach(c => {
            const covering = invoices.filter(t => {
                const { start, end } = getInvoicePeriod(t);
                return datesOverlap(start, end, c.start, c.end);
            });
            const settled = covering.some(t => isTripCycleSettled(t, recvByTripId));
            if (settled) return;
            unpaid.push(c);
            if (covering.length) billedUnpaid += 1;
            else unbilled.push(c);
        });

        const paymentStatus = unpaid.length ? 'PENDING' : 'PAID';
        const first = unpaid[0];
        const last = unpaid[unpaid.length - 1];
        const dueWord = cycleUnitLabels(unit, unpaid.length || 1);

        return {
            cyclesDue: cycles.length,
            unpaidCycles: unpaid.length,
            amountDue: unpaid.length * priced,
            paymentStatus,
            needsAlert: unpaid.length > 0,
            unit,
            cycleLabel: unpaid.length
                ? `${unpaid.length} ${dueWord} due`
                : (cycles.length ? 'Current paid' : '0'),
            invoiceStart: first ? toIsoDate(first.start) : null,
            invoiceEnd: last ? toIsoDate(last.end) : null,
            unpaid,
            unbilled
        };
    }

    function isRentalCycleInvoiced(row, cycle) {
        return getRentalInvoicePool(row).some(t => {
            const { start, end } = getInvoicePeriod(t);
            return datesOverlap(start, end, cycle.start, cycle.end);
        });
    }

    function fmtIsoMdY(iso) {
        const p = (iso || '').split('-');
        return p.length >= 3 ? `${p[1]}/${p[2]}/${p[0]}` : (iso || '');
    }

    async function createRentalCycleInvoice(row, cycle) {
        if (!row || !cycle || !window.db) return null;
        const isAdminUser = typeof window.isAdmin === 'function'
            ? window.isAdmin()
            : (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
        if (!isAdminUser) return null;
        if (isRentalCycleInvoiced(row, cycle)) return null;
        const amount = parseFloat(row.base_price) || 0;
        if (amount <= 0) return null;

        const start = toIsoDate(cycle.start);
        const end = toIsoDate(cycle.end);
        const invoiceDate = new Date().toISOString().split('T')[0];
        const orderNo = `RENT-${Date.now().toString(36)}-${Math.floor(Math.random() * 900 + 100)}`;
        const periodLabel = `${fmtIsoMdY(start)} - ${fmtIsoMdY(end)}`;
        const tripId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `rent-${Date.now()}-${Math.random()}`;

        const tripObj = {
            trip_id: tripId,
            date: invoiceDate,
            order_no: orderNo,
            customer: row.customer_name,
            delivery_place: row.delivery_place || '',
            note: formatRentalInvoiceNote(periodLabel, row.id),
            n_cont: row.container_no,
            yard_rate: 0,
            monthly_rate: amount,
            service_mode: 'RENTAL INVOICE',
            status: 'COMPLETE',
            st_yard: 'PEND',
            st_rate: 'PAID',
            st_sales: 'PAID',
            st_amount: 'PAID',
            st_rent: 'PEND',
            has_trans: 'NO',
            has_sales: 'NO',
            invoice_sent: 'YES',
            paid: false,
            start_date_rent: start,
            next_due: end
        };

        const { error: insertError } = await window.db.from('trips').insert([tripObj]);
        if (insertError) throw insertError;
        if (typeof window.mapTripToArray === 'function') {
            rememberRentalInvoiceTrip(window.mapTripToArray(tripObj));
        }

        if (window.addInvoiceToReceivables) {
            const detailsHtml = `
                <div style="font-size:0.85rem; color:#475569;">
                    <strong>Container:</strong> ${row.container_no || '---'}<br>
                    <strong>Period:</strong> ${periodLabel}
                </div>
            `;
            await window.addInvoiceToReceivables(
                row.customer_name,
                orderNo,
                amount,
                detailsHtml,
                [tripId, 'RENTAL_ID:' + row.id],
                'RENTAL',
                0,
                '',
                { silent: true }
            );
        }
        return tripObj;
    }

    let rentalCycleInvoiceSync = null;
    async function ensureRentalCycleInvoices() {
        // Only admins may auto-create rental AR invoices (avoids driver/staff emails on created_by)
        const isAdminUser = typeof window.isAdmin === 'function'
            ? window.isAdmin()
            : (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
        if (!isAdminUser) return;

        if (rentalCycleInvoiceSync) return rentalCycleInvoiceSync;
        rentalCycleInvoiceSync = (async () => {
            const rows = window.currentRentals || [];
            let created = 0;
            for (const row of rows) {
                const status = (row.status || '').trim().toUpperCase();
                if (status && status !== 'ACTIVE' && status !== 'FINISHED') continue;
                const prepaid = getPrepaidBalance(row, null, null);
                const missing = prepaid.unbilled || [];
                for (const cycle of missing) {
                    try {
                        const made = await createRentalCycleInvoice(row, cycle);
                        if (made) created += 1;
                    } catch (err) {
                        console.warn('[Rentals] Auto invoice failed for', row.container_no, err);
                    }
                }
            }
            if (created > 0) {
                await loadRentalInvoiceTrips(true);
                window.billingDataLoaded = false;
                if (typeof window.loadReceivables === 'function') {
                    await window.loadReceivables();
                    const recvView = document.getElementById('receivables-view');
                    if (recvView && !recvView.classList.contains('hidden') && typeof window.renderReceivables === 'function') {
                        window.renderReceivables();
                    }
                }
            }
        })();
        try {
            await rentalCycleInvoiceSync;
        } finally {
            rentalCycleInvoiceSync = null;
        }
    }

    async function loadRentalInvoiceTrips(force = false) {
        if (!force && window.rentalInvoiceTrips && window.rentalInvoiceTrips.length > 0) return;
        const sc = window.db || (typeof db !== 'undefined' ? db : null);
        if (!sc) return;
        try {
            const { data, error } = await sc.from('trips')
                .select('*')
                .eq('service_mode', 'RENTAL INVOICE')
                .or('is_deleted.eq.false,is_deleted.is.null')
                .order('date', { ascending: false })
                .limit(1000);
            if (error) throw error;
            window.rentalInvoiceTrips = (data || [])
                .map(t => (typeof window.mapTripToArray === 'function' ? window.mapTripToArray(t) : null))
                .filter(Boolean);
        } catch (err) {
            console.warn('Could not load rental invoice trips:', err);
            if (!window.rentalInvoiceTrips) window.rentalInvoiceTrips = [];
        }
    }

    async function loadRentalsData(force = false) {
        if (!force && window.currentRentals && window.currentRentals.length > 0) {
            await loadRentalInvoiceTrips(false);
            await reconcileRentalTripsFromReceivables();
            await ensureRentalCycleInvoices();
            renderRentalsTable();
            return;
        }
        try {
            const data = await getRentals();
            
            // Always use the locally-mutated data — never re-fetch (that would overwrite our changes)
            window.currentRentals = data || [];

            if (typeof window.loadTableData === 'function' && window.currentTrips) {
                window.loadTableData(window.currentTrips);
            }

            if (typeof window.loadReleasesData === 'function' && (!window.currentReleases || window.currentReleases.length === 0)) {
                await window.loadReleasesData();
            }
            populateAllRentalSelects();
            await loadRentalInvoiceTrips(true);
            await reconcileRentalTripsFromReceivables();
            await ensureRentalCycleInvoices();
            renderRentalsTable();
        } catch (err) { console.error("Error loading rentals:", err); }
    }


    function populateAllRentalSelects() {
        populateRentalCustomerSelect();
        populateRentalReleaseSelect();
        populateRentalFilterCustomerSelect();
        populateRentalFilterSizeSelect();
        populateRentalFilterContainerList();
    }
    
    window.clearRentalFilters = function() {
        document.getElementById('rental-filter-start').value = '';
        document.getElementById('rental-filter-end').value = '';
        document.getElementById('rental-filter-customer').value = '';
        document.getElementById('rental-filter-size').value = '';
        document.getElementById('rental-filter-container').value = '';
        document.getElementById('rental-show-all').checked = false;
        renderRentalsTable();
    };

    function populateRentalFilterContainerList() {
        const dropdown = document.getElementById('rental-container-dropdown');
        if (!dropdown || !window.currentRentals) return;
        dropdown.innerHTML = '';
        const uniqueContainers = [...new Set(window.currentRentals.map(r => (r.container_no || '').toString().trim().toUpperCase()).filter(c => c && c !== '---' && c !== 'TBA'))].sort();
        uniqueContainers.forEach(container => {
            const item = document.createElement('div');
            item.textContent = container;
            item.style.padding = '8px 12px';
            item.style.fontSize = '0.8rem';
            item.style.fontWeight = '700';
            item.style.color = '#1e293b';
            item.style.cursor = 'pointer';
            item.style.transition = 'background-color 0.15s ease';
            item.onmouseenter = () => item.style.backgroundColor = '#f1f5f9';
            item.onmouseleave = () => item.style.backgroundColor = 'transparent';
            item.onclick = (e) => {
                e.stopPropagation();
                document.getElementById('rental-filter-container').value = container;
                dropdown.style.display = 'none';
                renderRentalsTable();
            };
            dropdown.appendChild(item);
        });
    }

    window.showRentalContainerDropdown = function() {
        const dropdown = document.getElementById('rental-container-dropdown');
        if (dropdown) {
            dropdown.style.display = 'flex';
            if(typeof window.filterRentalContainerDropdown === 'function') {
                window.filterRentalContainerDropdown();
            }
        }
    };

    window.filterRentalContainerDropdown = function() {
        const inputStr = (document.getElementById('rental-filter-container')?.value || '').toLowerCase();
        const dropdown = document.getElementById('rental-container-dropdown');
        if (!dropdown) return;
        const items = dropdown.querySelectorAll('div');
        items.forEach(item => {
            if (item.textContent.toLowerCase().includes(inputStr)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    };

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const input = document.getElementById('rental-filter-container');
        const dropdown = document.getElementById('rental-container-dropdown');
        if (input && dropdown && e.target !== input && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    function populateRentalFilterCustomerSelect() {
        const sel = document.getElementById('rental-filter-customer');
        if (!sel || !window.currentRentals) return;
        
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">All Customers</option>';
        
        const uniqueCustomers = [...new Set(window.currentRentals.map(r => (r.customer_name || '').trim()).filter(Boolean))].sort();
        
        uniqueCustomers.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
        });
        
        if (currentVal && uniqueCustomers.includes(currentVal)) {
            sel.value = currentVal;
        } else {
            sel.value = '';
        }
    }

    function populateRentalFilterSizeSelect() {
        const sel = document.getElementById('rental-filter-size');
        if (!sel || !window.currentRentals) return;
        
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">All Sizes</option>';
        
        const uniqueSizes = [...new Set(window.currentRentals.map(r => (r.size || '').trim()).filter(Boolean))].sort();
        
        uniqueSizes.forEach(size => {
            const opt = document.createElement('option');
            opt.value = size;
            opt.textContent = size;
            sel.appendChild(opt);
        });
        
        if (currentVal && uniqueSizes.includes(currentVal)) {
            sel.value = currentVal;
        } else {
            sel.value = '';
        }
    }

    function populateRentalCustomerSelect() {
        const sel = document.getElementById('rental-customer-sel');
        const data = window.currentCustomers;
        if (!sel || !data) return;
        const currentVal = sel.value;
        sel.innerHTML = '<option value="" disabled selected>Select Customer...</option>';
        data.forEach(c => {
            const name = c.name || c[1] || ''; 
            if (name) {
                const opt = document.createElement('option');
                opt.value = name; opt.textContent = name;
                sel.appendChild(opt);
            }
        });
        if (currentVal) sel.value = currentVal;
    }

    function populateRentalReleaseSelect() {
        const sel = document.getElementById('rental-release-sel');
        const data = window.currentReleases;
        if (!sel || !data) return;
        const currentVal = sel.value;
        sel.innerHTML = '<option value="" disabled selected>Select Release...</option>';
        data.forEach(r => {
            if (!r) return;
            const relNo = (Array.isArray(r) ? r[0] : r.release_no || '').trim();
            const stock = (Array.isArray(r) ? Number(r[14]) : Number(r.total_stock) || 0);
            const size = (Array.isArray(r) ? r[16] : r.container_size || '---');
            const city = (Array.isArray(r) ? r[6] : r.city || '---');
            if (relNo && relNo !== '---' && stock > 0) {
                const opt = document.createElement('option');
                opt.value = relNo;
                opt.textContent = `${relNo} - ${size} - ${city}`;
                sel.appendChild(opt);
            }
        });
        if (currentVal) sel.value = currentVal;
    }

    // --- STOCK MANAGEMENT HELPER (STOCK ONLY - PROTECT IN) ---
    async function adjustReleaseStock(releaseNo, delta) {
        if (!releaseNo || releaseNo === '---') return;
        
        const sc = window.db || (typeof db !== 'undefined' ? db : (typeof supabase !== 'undefined' ? supabase : null));
        if (!sc) return;

        try {
            const cleanRelNo = releaseNo.toString().trim();
            
            // Solo necesitamos el ID y el total_stock actual
            const { data, error } = await sc.from('releases')
                .select('id, total_stock')
                .eq('release_no', cleanRelNo)
                .or('is_deleted.eq.false,is_deleted.is.null')
                .maybeSingle();
            
            if (data) {
                const newTotalStock = Math.max(0, (parseInt(data.total_stock) || 0) + delta);
                
                // ACTUALIZAR SOLO TOTAL_STOCK (Protege la columna IN)
                const { error: upError } = await sc.from('releases')
                    .update({ total_stock: newTotalStock })
                    .eq('id', data.id);
                
                if (!upError) {
                    console.log("Stock Update OK for " + cleanRelNo + " => new total_stock:", newTotalStock);
                    if (window.loadReleasesData) window.loadReleasesData();
                } else {
                    console.error("DB Update Error:", upError);
                }
            } else {
                console.warn("Release not found in DB:", cleanRelNo, error);
            }
        } catch (err) {
            console.error("Critical error in adjustReleaseStock:", err);
        }
    }

    function findTripForRentalRow(row) {
        if (!row) return null;
        const cont = (row.container_no || '').toString().trim().toUpperCase();
        const orderNo = (row.release_no || '').toString().trim();
        const pools = [
            window.currentTrips,
            window.allTripsUnfiltered,
            window.combinedBillingTrips
        ];
        for (const pool of pools) {
            if (!pool || !pool.length) continue;
            if (orderNo && orderNo !== '---') {
                const exact = pool.find(t => {
                    const c = (t[3] || '').toString().trim().toUpperCase();
                    const o = (t[5] || '').toString().trim();
                    return c === cont && o === orderNo;
                });
                if (exact) return exact;
            }
            const byCont = pool.find(t => (t[3] || '').toString().trim().toUpperCase() === cont);
            if (byCont) return byCont;
        }
        return null;
    }

    async function fetchTripForRentalRow(row) {
        let trip = findTripForRentalRow(row);
        if (trip || !window.db || !row) return trip;
        const cont = (row.container_no || '').toString().trim();
        const orderNo = (row.release_no || '').toString().trim();
        try {
            let q = window.db.from('trips').select('*')
                .eq('n_cont', cont)
                .or('is_deleted.eq.false,is_deleted.is.null')
                .order('date', { ascending: false })
                .limit(5);
            if (orderNo && orderNo !== '---') {
                q = q.eq('order_no', orderNo);
            }
            const { data } = await q;
            if (data && data.length && typeof window.mapTripToArray === 'function') {
                return window.mapTripToArray(data[0]);
            }
        } catch (e) {
            console.warn('[Rentals] Could not fetch trip for yard return', e);
        }
        return null;
    }

    function updateRentalEditSummary(row) {
        const panel = document.getElementById('rental-edit-summary');
        const statusEl = document.getElementById('rental-display-status');
        const payEl = document.getElementById('rental-display-payment');
        const cyclesEl = document.getElementById('rental-display-cycles');
        if (!panel || !row) {
            if (panel) panel.style.display = 'none';
            return;
        }
        panel.style.display = 'block';
        const st = (row.status || 'ACTIVE').toString().toUpperCase();
        if (statusEl) {
            statusEl.textContent = st;
            statusEl.style.background = st === 'FINISHED' ? '#64748b' : '#10b981';
        }
        const prepaid = getPrepaidBalance(row, null, null);
        const pay = prepaid.paymentStatus || 'PAID';
        if (payEl) {
            payEl.textContent = pay;
            payEl.style.background = pay === 'PAID' ? '#1e40af' : '#d97706';
        }
        if (cyclesEl) {
            const due = prepaid.amountDue || 0;
            cyclesEl.textContent = prepaid.cycleLabel + (due > 0 ? ` · $${due.toFixed(2)} due` : '');
        }
    }

    function updateRentalEditActionButtons(row) {
        const returnBtn = document.getElementById('btn-return-rental-yard');
        const st = (row && row.status || '').toString().toUpperCase();
        if (returnBtn) {
            returnBtn.style.display = (editingRentalId && st === 'ACTIVE') ? 'block' : 'none';
        }
    }

    window.openReturnRentalToYardModal = function () {
        if (!editingRentalId) {
            alert('Select a rental row first.');
            return;
        }
        const row = window.currentRentals.find(r => r.id === editingRentalId);
        if (!row) return;
        if ((row.status || '').toUpperCase() !== 'ACTIVE') {
            alert('This rental is already finished.');
            return;
        }

        const prepaid = getPrepaidBalance(row, null, null);
        const unpaidWarn = prepaid.unpaidCycles > 0
            ? `<p style="margin:0 0 12px; padding:10px; background:#fff7ed; border:1px solid #fdba74; border-radius:8px; font-size:0.85rem; color:#9a3412;"><strong>${prepaid.unpaidCycles}</strong> prepaid cycle(s) still open in Rentals / Account. Collect or write off in <strong>Account</strong>; yard return is $0.</p>`
            : '';

        const today = new Date().toISOString().split('T')[0];
        const orderTrace = (row.release_no || '---').toString();
        const traceWarn = (!orderTrace || orderTrace === '---')
            ? `<p style="margin:0 0 12px; padding:10px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; font-size:0.85rem; color:#991b1b;">No order # on this rental — future <strong>Form Inventor</strong> cost may not link to Releases.</p>`
            : `<p style="margin:0 0 12px; font-size:0.8rem; color:#64748b;">Order / trace for cost: <strong>${orderTrace}</strong> (kept on Yard Stock for later sales).</p>`;

        let overlay = document.getElementById('rental-return-yard-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'rental-return-yard-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;z-index:999998;padding:16px;';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;max-width:480px;width:100%;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);overflow:hidden;font-family:Montserrat,sans-serif;">
                <div style="background:#047857;color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-size:1.05rem;"><i class="fas fa-warehouse" style="margin-right:8px;"></i> Return to Yard</h3>
                    <button type="button" id="rental-return-yard-close" style="background:none;border:none;color:#fff;font-size:1.25rem;cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
                <div style="padding:20px;color:#334155;">
                    <p style="margin:0 0 10px;font-size:0.9rem;">Container <strong>${(row.container_no || '---').toString()}</strong> · ${row.customer_name || '---'}</p>
                    ${traceWarn}
                    ${unpaidWarn}
                    <label style="display:block;font-size:0.75rem;font-weight:800;color:#64748b;margin-bottom:4px;">RETURN DATE</label>
                    <input type="date" id="rental-return-date" value="${today}" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-weight:700;margin-bottom:14px;box-sizing:border-box;">
                    <label style="display:block;font-size:0.75rem;font-weight:800;color:#64748b;margin-bottom:4px;">YARD DESTINATION</label>
                    <select id="rental-return-yard-dest" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-weight:700;margin-bottom:14px;">
                        <option value="RPTULIPAN">RP Tulipan Yard</option>
                        <option value="STORAGE">Storage Yard</option>
                    </select>
                    <p style="margin:0;font-size:0.78rem;color:#64748b;">Entry fee, daily rate and lift cost will be <strong>$0</strong> (own container). Rental status → FINISHED.</p>
                </div>
                <div style="padding:14px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;">
                    <button type="button" id="rental-return-yard-cancel" style="padding:10px 16px;background:#e2e8f0;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Cancel</button>
                    <button type="button" id="rental-return-yard-confirm" style="padding:10px 18px;background:#047857;color:#fff;border:none;border-radius:8px;font-weight:800;cursor:pointer;">Confirm return</button>
                </div>
            </div>
        `;

        const close = () => { overlay.style.display = 'none'; };
        overlay.style.display = 'flex';
        overlay.querySelector('#rental-return-yard-close').onclick = close;
        overlay.querySelector('#rental-return-yard-cancel').onclick = close;
        overlay.querySelector('#rental-return-yard-confirm').onclick = async () => {
            const returnDate = overlay.querySelector('#rental-return-date').value;
            const dest = overlay.querySelector('#rental-return-yard-dest').value || 'RPTULIPAN';
            if (!returnDate) {
                alert('Please select a return date.');
                return;
            }
            const btn = overlay.querySelector('#rental-return-yard-confirm');
            btn.disabled = true;
            btn.textContent = 'Processing...';
            try {
                await completeReturnRentalToYard(row, returnDate, dest);
                close();
            } catch (err) {
                console.error(err);
                alert('Failed to return container to yard: ' + (err.message || err));
            } finally {
                btn.disabled = false;
                btn.textContent = 'Confirm return';
            }
        };
    };

    async function completeReturnRentalToYard(row, returnDate, yardDest) {
        if (!row || !window.db) throw new Error('Missing rental or database');
        const sc = window.db;
        const containerNo = (row.container_no || '').toString().trim().toUpperCase();
        const originRelease = (row.release_no || '').toString().trim() || '---';
        const yardNotesPrefix = yardDest === 'STORAGE' ? '[Storage Yard] ' : '';
        const returnNote = `Returned from rental ${returnDate}`;
        const notes = `${yardNotesPrefix}${returnNote}`.trim();

        const linkedTrip = await fetchTripForRentalRow(row);
        const relType = linkedTrip ? ((linkedTrip[44] || 'DRY').toString()) : 'DRY';
        const relCondition = linkedTrip ? ((linkedTrip[45] || 'CW').toString()) : 'CW';
        const size = row.size || (linkedTrip ? linkedTrip[2] : '---') || '---';

        const createdAtStr = new Date(returnDate + 'T12:00:00').toISOString();

        const { data: existingYard } = await sc.from('yard_stock')
            .select('id, notes, lifts, lift_cost')
            .eq('container_no', containerNo)
            .eq('origin_release', originRelease)
            .or('is_deleted.eq.false,is_deleted.is.null')
            .limit(1);

        const yardPayload = {
            container_no: containerNo,
            size: size,
            type: relType,
            condition: relCondition,
            origin_release: originRelease,
            notes: notes,
            customer_name: '',
            customer_phone: '',
            daily_rate: 0,
            entry_fee: 0,
            lift_cost: 0,
            lifts: 1,
            status: 'AVAILABLE',
            exit_date: null,
            order_out: null,
            created_at: createdAtStr
        };

        if (existingYard && existingYard.length > 0) {
            const { error: yErr } = await sc.from('yard_stock').update(yardPayload).eq('id', existingYard[0].id);
            if (yErr) throw yErr;
        } else {
            const { error: yErr } = await sc.from('yard_stock').insert([yardPayload]);
            if (yErr) throw yErr;
        }

        const rentalUpdate = {
            status: 'FINISHED',
            final_date: returnDate,
            notes: ((row.notes || '') + `\n[Returned to yard ${returnDate} — ${yardDest === 'STORAGE' ? 'Storage Yard' : 'RP Tulipan Yard'}]`).trim()
        };
        const { data: updated, error: rErr } = await sc.from('rentals').update(rentalUpdate).eq('id', row.id).select();
        if (rErr) throw rErr;

        if (updated && updated[0]) {
            const idx = window.currentRentals.findIndex(r => r.id === row.id);
            if (idx !== -1) window.currentRentals[idx] = { ...window.currentRentals[idx], ...updated[0] };
        }

        if (window.logActivity) {
            window.logActivity('UPDATED_RECORD', `[${new Date().toLocaleString()}] Rental returned to yard: ${containerNo} → ${yardDest} (${returnDate})`);
        }

        if (typeof window.loadYardData === 'function') {
            await window.loadYardData(true);
        }
        if (typeof window.renderYardTable === 'function') {
            window.renderYardTable();
        }

        alert(`Container ${containerNo} is back in Yard Stock (${yardDest === 'STORAGE' ? 'Storage Yard' : 'RP Tulipan Yard'}). Rental marked FINISHED.`);
        resetRentalForm();
        await reconcileRentalTripsFromReceivables();
        renderRentalsTable();
    }

    function toggleRentalCustomerMode() {
        const sel = document.getElementById('rental-customer-sel');
        const inp = document.getElementById('rental-customer');
        const icon = document.getElementById('rental-toggle-icon-customer');
        if (sel.style.display !== 'none') {
            sel.style.display = 'none'; inp.style.display = 'block';
            icon.className = 'fas fa-list'; inp.focus();
        } else {
            sel.style.display = 'block'; inp.style.display = 'none';
            icon.className = 'fas fa-edit'; populateRentalCustomerSelect();
        }
    }

    function toggleRentalReleaseMode() {
        const sel = document.getElementById('rental-release-sel');
        const inp = document.getElementById('rental-release');
        const icon = document.getElementById('rental-toggle-icon-release');
        if (sel.style.display !== 'none') {
            sel.style.display = 'none'; inp.style.display = 'block';
            icon.className = 'fas fa-list'; inp.focus();
        } else {
            sel.style.display = 'block'; inp.style.display = 'none';
            icon.className = 'fas fa-edit'; populateRentalReleaseSelect();
        }
    }

    function toggleRentalSizeMode() {
        const sel = document.getElementById('rental-size-sel');
        const inp = document.getElementById('rental-size');
        const icon = document.getElementById('rental-toggle-icon-size');
        if (sel.style.display !== 'none') {
            sel.style.display = 'none'; inp.style.display = 'block';
            icon.className = 'fas fa-list'; inp.focus();
        } else {
            sel.style.display = 'block'; inp.style.display = 'none';
            icon.className = 'fas fa-edit';
        }
    }

    function calculateRentalCost(startDateStr, finalDateStr, basePrice, dailyRate, status, timeRent, dateFrom = null, dateTo = null) {
        if (!startDateStr) return { total: 0, days: 0, overlapDays: 0, cycles: 0, cycleLabel: '0 days', actualStart: null, actualEnd: null };
        const start = new Date(startDateStr); start.setHours(0, 0, 0, 0);
        let endDate = (status === 'FINISHED' && finalDateStr) ? new Date(finalDateStr) : new Date();
        endDate.setHours(0, 0, 0, 0);
        
        let effectiveStart = start;
        let effectiveEnd = endDate;
        
        const useFilter = dateFrom || dateTo;
        if (useFilter) {
            const fStart = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date('2000-01-01T00:00:00');
            if (dateFrom) fStart.setHours(0, 0, 0, 0);
            
            const fEnd = dateTo ? new Date(dateTo + 'T00:00:00') : new Date('2099-12-31T00:00:00');
            if (dateTo) {
                fEnd.setDate(fEnd.getDate() + 1);
                fEnd.setHours(0, 0, 0, 0);
            }
            
            effectiveStart = new Date(Math.max(start.getTime(), fStart.getTime()));
            effectiveEnd = new Date(Math.min(endDate.getTime(), fEnd.getTime()));
        }
        
        let overlapDays = 0;
        if (effectiveStart <= effectiveEnd) {
            overlapDays = (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24);
        }
        
        const bPrice = parseFloat(basePrice) || 0;
        
        let cycles = 1;
        let cycleLabel = '1 Month';
        const trStr = (timeRent || '').toLowerCase();

        // With FROM/TO filters, bill only the overlapping window so one selected
        // month charges 1 cycle â€” not the full accumulated debt. Unfiltered
        // totals keep the original start-to-today (or final_date) logic.
        if (useFilter && overlapDays > 0) {
            const cycleStart = effectiveStart;
            const filterEndInclusive = dateTo
                ? new Date(dateTo + 'T00:00:00')
                : endDate;
            filterEndInclusive.setHours(0, 0, 0, 0);
            const cycleEnd = new Date(Math.min(endDate.getTime(), filterEndInclusive.getTime()));

            if (trStr === 'monthly') {
                let months = (cycleEnd.getFullYear() - cycleStart.getFullYear()) * 12;
                months -= cycleStart.getMonth();
                months += cycleEnd.getMonth();
                if (cycleEnd.getDate() > cycleStart.getDate()) {
                    months += 1;
                }
                cycles = Math.max(1, months);
                cycleLabel = cycles === 1 ? '1 Month' : `${cycles} Months`;
            } else if (trStr === 'weekly') {
                cycles = Math.max(1, Math.ceil(overlapDays / 7));
                cycleLabel = cycles === 1 ? '1 Week' : `${cycles} Weeks`;
            } else {
                cycles = Math.max(1, Math.ceil(overlapDays));
                cycleLabel = cycles === 1 ? '1 day' : `${cycles} days`;
            }
        } else if (trStr === 'monthly') {
            let months = (endDate.getFullYear() - start.getFullYear()) * 12;
            months -= start.getMonth();
            months += endDate.getMonth();
            
            if (endDate.getDate() >= start.getDate() && (endDate.getTime() > start.getTime())) {
                months += 1; 
            }
            cycles = Math.max(1, months);
            cycleLabel = cycles === 1 ? '1 Month' : `${cycles} Months`;
        } else if (trStr === 'weekly') {
            const diffTime = Math.abs(endDate.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            cycles = Math.max(1, Math.floor(diffDays / 7) + 1);
            cycleLabel = cycles === 1 ? '1 Week' : `${cycles} Weeks`;
        } else {
            const diffTime = Math.abs(endDate.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            cycles = Math.max(1, diffDays);
            cycleLabel = cycles === 1 ? '1 day' : `${cycles} days`;
        }
        
        const finalTotal = cycles * bPrice;
        
        return { 
            total: finalTotal, 
            overlapDays: Math.ceil(Math.max(0, overlapDays)),
            cycles: cycles,
            cycleLabel: cycleLabel,
            actualStart: start,
            actualEnd: endDate 
        };
    }

    function renderRentalsTable() {
        const body = document.getElementById('rentals-body');
        if (!body) return;
        body.innerHTML = '';
        let totalAccumulated = 0;

        const showAll = document.getElementById('rental-show-all')?.checked;
        const startDateFilter = document.getElementById('rental-filter-start')?.value;
        const endDateFilter = document.getElementById('rental-filter-end')?.value;
        const customerFilter = (document.getElementById('rental-filter-customer')?.value || '').trim().toLowerCase();
        const sizeFilter = (document.getElementById('rental-filter-size')?.value || '').trim().toLowerCase();
        const containerFilter = (document.getElementById('rental-filter-container')?.value || '').trim().toLowerCase();

        let visibleCount = 0;

        if (!window.currentRentals) return;

        // --- DUPLICATE CONTAINER DETECTION ---
        const containerCounts = {};
        window.currentRentals.forEach(r => {
            const cNum = (r.container_no || '').toString().trim().toUpperCase();
            if (cNum && cNum !== '---' && cNum !== 'TBA') {
                containerCounts[cNum] = (containerCounts[cNum] || 0) + 1;
            }
        });

        window.currentRentals.forEach((row, idx) => {
            const statusStr = (row.status || '').trim().toUpperCase();
            
            // Default: Show only ACTIVE. If showAll is checked, show EVERYTHING.
            if (!showAll && statusStr !== 'ACTIVE') return;
            
            // INSTEAD of strict start_date filtering, we calculate the cost first!
            const costInfo = calculateRentalCost(row.start_date, row.final_date, row.base_price, row.daily_rate, row.status, row.time_rent, startDateFilter, endDateFilter);
            
            // If filters are active, and this container didn't overlap the period AT ALL, hide it!
            if ((startDateFilter || endDateFilter) && costInfo.overlapDays <= 0) {
                return;
            }
            
            if (customerFilter) {
                const cName = (row.customer_name || '').trim().toLowerCase();
                if (cName !== customerFilter) return;
            }
            
            if (sizeFilter) {
                const rSize = (row.size || '').trim().toLowerCase();
                if (rSize !== sizeFilter) return;
            }
            
            if (containerFilter) {
                const cNumStr = (row.container_no || '').toString().trim().toLowerCase();
                if (!cNumStr.includes(containerFilter)) return;
            }
            
            visibleCount++;

            const prepaid = getPrepaidBalance(row, startDateFilter, endDateFilter);
            totalAccumulated += prepaid.amountDue;

            row._calculatedCost = prepaid.amountDue;
            row._calculatedStart = prepaid.invoiceStart || startDateFilter || row.start_date;
            row._calculatedEnd = prepaid.invoiceEnd || endDateFilter || row.final_date || new Date().toISOString().split('T')[0];
            row._prepaidBalance = prepaid;

            const dynamicPaymentStatus = prepaid.paymentStatus;
            const isExpired = prepaid.needsAlert;
            const displayDays = prepaid.cycleLabel;
            const balanceDue = prepaid.amountDue;
            
            const cNum = (row.container_no || '').toString().trim().toUpperCase();
            const isDuplicate = (cNum && cNum !== '---' && cNum !== 'TBA' && containerCounts[cNum] > 1);

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            if (isExpired) {
                tr.style.backgroundColor = '#fee2e2'; // Light Red background
            }
            if (editingRentalId === row.id) {
                tr.classList.add('selected-row');
            }

            tr.onclick = () => editRental(idx);

            tr.innerHTML = `
                <td style="color: ${isExpired ? '#ef4444' : '#000000'}; font-weight: 700;">
                    ${formatDate(row.start_date)}
                    ${isExpired ? ' <i class="fas fa-exclamation-triangle" title="Unpaid prepaid cycle"></i>' : ''}
                </td>
                <td class="rentals-col-time-rent" style="font-weight: 700; color: ${isExpired ? '#ef4444' : '#000000'}; font-size: 0.85rem; line-height: 1.2;">
                    ${formatDate(row.start_date)}<br>a ${formatDate(row.final_date)}
                </td>
                <td style="font-weight: 700; color: #000000; text-align: center;">${row.release_no || '---'}</td>
                <td style="font-weight: 700; color: #000000; text-align: center;">${row.size || '---'}</td>
                <td style="font-weight: 900; color: ${isDuplicate ? '#9a3412' : '#000000'}; background-color: ${isDuplicate ? '#ffedd5' : 'transparent'};" ${isDuplicate ? 'title="ATENCIÃ“N: Este nÃºmero de contenedor estÃ¡ repetido en el sistema."' : ''}>
                    ${isDuplicate ? '<i class="fas fa-exclamation-triangle" style="color: #ea580c; margin-right: 6px;"></i>' : ''}${row.container_no || '---'}
                </td>
                <td style="font-weight: 700; color: #000000;">${row.delivery_place || '---'}</td>
                <td style="font-weight: 700; color: #000000;">${row.customer_name || '---'}</td>
                <td style="color: #000000; font-weight: 700; text-align: center !important;">${window.formatUSPhone(row.phone) || '---'}</td>
                <td style="color: #000000; font-weight: 700; text-align: center !important;">$${parseFloat(row.base_price).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="font-weight: 800; color: ${isExpired ? '#ef4444' : '#000000'};">${displayDays}</td>
                <td style="font-weight: 900; color: ${balanceDue > 0 ? (isExpired ? '#ef4444' : '#000000') : '#10b981'}; font-size: 1rem;">$${balanceDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td>
                    <span class="status-badge" style="background: ${row.status === 'FINISHED' ? '#64748b' : '#10b981'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">
                        ${row.status || 'ACTIVE'}
                    </span>
                </td>
                <td>
                    <span class="status-badge" style="background: ${dynamicPaymentStatus === 'PAID' ? '#1e40af' : (dynamicPaymentStatus === 'PENDING' ? '#d97706' : '#94a3b8')}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">
                        ${dynamicPaymentStatus}
                    </span>
                  </td>
                  <td style="font-size: 0.75rem; color: #000000; font-weight: 700; min-width: 140px; max-width: 140px; white-space: normal; word-wrap: break-word; line-height: 1.2;">${row.notes || ''}</td>
            `;
            body.appendChild(tr);
        });

        // Update Summary Card Counter with filtered count
        const countEl = document.getElementById('rental-count-display');
        if (countEl) countEl.textContent = visibleCount;

        // Show/Hide global delete button
        const delBtn = document.getElementById('btn-delete-rental-global');
        if (delBtn) delBtn.style.display = editingRentalId ? 'flex' : 'none';
        const totalEl = document.getElementById('rentals-total-income');
        if (totalEl) totalEl.textContent = `$${totalAccumulated.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }

    async function saveRentalData() {
        const role = (window.currentUserRole || '').toLowerCase().trim();
        if (role === 'student') {
            alert("Students cannot create or modify rental records.");
            return;
        }
        const startDate = document.getElementById('rental-start-date').value;
        const timeRent = document.getElementById('rental-time-rent').value;
        
        // Calculate final date automatically based on timeRent
        let finalDate = null;
        if (startDate && timeRent) {
            const sDate = new Date(startDate);
            if (timeRent === 'monthly') {
                sDate.setMonth(sDate.getMonth() + 1);
            } else if (timeRent === 'weekly') {
                sDate.setDate(sDate.getDate() + 7);
            } else if (timeRent === 'diary') {
                sDate.setDate(sDate.getDate() + 1);
            }
            finalDate = sDate.toISOString().split('T')[0];
        }

        const container = document.getElementById('rental-container').value;
        const customer = (document.getElementById('rental-customer-sel').style.display !== 'none') ? document.getElementById('rental-customer-sel').value : document.getElementById('rental-customer').value;
        const releaseNo = (document.getElementById('rental-release-sel').style.display !== 'none') ? document.getElementById('rental-release-sel').value : document.getElementById('rental-release').value;
        const phone = document.getElementById('rental-phone').value;
        const basePrice = document.getElementById('rental-base-price').value || 0;
        const size = (document.getElementById('rental-size-sel').style.display !== 'none') ? document.getElementById('rental-size-sel').value : document.getElementById('rental-size').value;
        const deliveryPlace = document.getElementById('rental-delivery-place').value;
        const notes = document.getElementById('rental-notes').value;

        if (!startDate || !container || !customer) { alert("Please fill in Start Date, Container #, and Customer."); return; }
        if (!originalRentalState) return;

        const status = (originalRentalState.status || 'ACTIVE').toString();
        const paymentStatus = originalRentalState.payment_status || 'PENDING';

        if (originalRentalState.final_date) {
            finalDate = originalRentalState.final_date;
        }

        const payload = {
            start_date: startDate, 
            final_date: finalDate, 
            time_rent: timeRent,
            container_no: container.toUpperCase(),
            customer_name: customer, 
            release_no: releaseNo, 
            size: size,
            delivery_place: deliveryPlace,
            phone: phone,
            base_price: parseFloat(basePrice), 
            daily_rate: 0,
            notes: notes, 
            status: status, 
            payment_status: paymentStatus
        };

        try {
            if (!editingRentalId) {
                alert("Error: Rentals can only be created from the Delivery Calendar (select 'Rent' service).");
                return;
            }
            if (editingRentalId) {
                const wasActive = (originalRentalState.status === 'ACTIVE');
                const isActive = (status === 'ACTIVE');
                const relChanged = (originalRentalState.release_no !== releaseNo);

                // Stock management remains unchanged


                // Adjust Stock
                if (wasActive && !isActive) {
                    await adjustReleaseStock(originalRentalState.release_no, 1);
                } else if (!wasActive && isActive) {
                    await adjustReleaseStock(releaseNo, -1);
                } else if (wasActive && isActive && relChanged) {
                    await adjustReleaseStock(originalRentalState.release_no, 1);
                    await adjustReleaseStock(releaseNo, -1);
                }
            }

            let resultData = null;
            if (editingRentalId) {
                const { data: updatedData, error } = await db.from('rentals').update(payload).eq('id', editingRentalId).select();
                if (error) throw error;
                resultData = updatedData[0];
                const idx = window.currentRentals.findIndex(r => r.id === editingRentalId);
                if (idx !== -1) window.currentRentals[idx] = resultData;
                
                // Sync Rent Price back to Calendar
                if (originalRentalState.base_price !== parseFloat(basePrice)) {
                    await db.from('trips')
                        .update({ monthly_rate: parseFloat(basePrice) })
                        .eq('n_cont', resultData.container_no)
                        .eq('release_no', resultData.release_no);
                    
                    // Invalidate calendar trips cache if needed
                    if (window.currentTrips) {
                        for (const t of window.currentTrips) {
                            if (t[3] === resultData.container_no && t[4] === resultData.release_no) {
                                t[27] = parseFloat(basePrice);
                            }
                        }
                    }
                }
            }

            alert(editingRentalId ? "Rental record updated!" : "New rental record saved!");
            window.billingDataLoaded = false; // Invalidate billing cache to show new rental debts
            resetRentalForm();
            renderRentalsTable();
        } catch (err) {
            console.error('Error saving rental:', err);
            alert("Error saving record: " + err.message);
        }
    }

    function editRental(idx) {
        const row = window.currentRentals[idx];
        if (!row) return;
        editingRentalId = row.id; originalRentalState = { ...row };
        document.getElementById('rental-start-date').value = row.start_date;
        document.getElementById('rental-time-rent').value = row.time_rent || 'monthly';
        document.getElementById('rental-container').value = row.container_no;
        const selC = document.getElementById('rental-customer-sel'); const inpC = document.getElementById('rental-customer');
        selC.style.display = 'block'; inpC.style.display = 'none'; selC.value = row.customer_name;
        if (selC.value === "" && row.customer_name) { selC.style.display = 'none'; inpC.style.display = 'block'; inpC.value = row.customer_name; }
        const selR = document.getElementById('rental-release-sel'); const inpR = document.getElementById('rental-release');
        selR.style.display = 'block'; inpR.style.display = 'none'; selR.value = row.release_no || '';
        if (selR.value === "" && row.release_no) { selR.style.display = 'none'; inpR.style.display = 'block'; inpR.value = row.release_no; }
        
        const selS = document.getElementById('rental-size-sel'); const inpS = document.getElementById('rental-size');
        selS.style.display = 'block'; inpS.style.display = 'none'; selS.value = row.size || '';
        if (selS.value === "" && row.size) { selS.style.display = 'none'; inpS.style.display = 'block'; inpS.value = row.size; }

        document.getElementById('rental-delivery-place').value = row.delivery_place || '';
        document.getElementById('rental-phone').value = window.formatUSPhone(row.phone || '');
        document.getElementById('rental-base-price').value = row.base_price;
        updateRentalEditSummary(row);
        document.getElementById('rental-notes').value = row.notes || '';
        
        // Lock core fields to prevent sync errors with Calendar
        document.getElementById('rental-start-date').disabled = true;
        document.getElementById('rental-container').disabled = true;
        selC.disabled = true; inpC.disabled = true;
        selR.disabled = true; inpR.disabled = true;
        selS.disabled = true; inpS.disabled = true;
        document.getElementById('rental-delivery-place').disabled = true;

        document.getElementById('btn-save-rental').style.display = 'block';
        document.getElementById('btn-reset-rental').style.display = 'block';
        updateRentalEditActionButtons(row);

        // Refresh table to show highlighting and delete button
        renderRentalsTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function removeSelectedRental() {
        if (!editingRentalId) return;
        await removeRental();
    }

    async function removeRental() {
        if (!editingRentalId) return;
        const role = (window.currentUserRole || '').toLowerCase().trim();
        if (role !== 'admin') {
            alert("Only administrators can delete records.");
            return;
        }
        if (!confirm("Are you sure you want to delete this rental record?")) return;

        const row = window.currentRentals.find(r => r.id === editingRentalId);
        try { 
            if (row && row.status === 'ACTIVE' && row.release_no) {
                await adjustReleaseStock(row.release_no, 1);
            }
            await deleteRental(editingRentalId); 
            
            // Local-first removal
            window.currentRentals = window.currentRentals.filter(r => r.id !== editingRentalId);
            
            resetRentalForm(); 
            renderRentalsTable();
        } catch (err) { 
            console.error(err);
            alert("Error deleting record: " + err.message);
        }
    }

    function resetRentalForm() {
        editingRentalId = null; originalRentalState = null;
        document.getElementById('rental-start-date').value = '';
        document.getElementById('rental-time-rent').value = 'monthly';
        document.getElementById('rental-container').value = '';
        document.getElementById('rental-customer-sel').style.display='block'; document.getElementById('rental-customer').style.display='none';
        document.getElementById('rental-customer-sel').value=''; document.getElementById('rental-customer').value='';
        document.getElementById('rental-release-sel').value=''; document.getElementById('rental-release').value='';
        document.getElementById('rental-size-sel').style.display='block'; document.getElementById('rental-size').style.display='none';
        document.getElementById('rental-size-sel').value=''; document.getElementById('rental-size').value='';
        document.getElementById('rental-delivery-place').value = '';
        document.getElementById('rental-phone').value = '';
        document.getElementById('rental-base-price').value = '';
        const summaryPanel = document.getElementById('rental-edit-summary');
        if (summaryPanel) summaryPanel.style.display = 'none';
        document.getElementById('rental-notes').value = '';
        
        // Unlock fields
        document.getElementById('rental-start-date').disabled = false;
        document.getElementById('rental-container').disabled = false;
        document.getElementById('rental-customer-sel').disabled = false;
        document.getElementById('rental-customer').disabled = false;
        document.getElementById('rental-release-sel').disabled = false;
        document.getElementById('rental-release').disabled = false;
        document.getElementById('rental-size-sel').disabled = false;
        document.getElementById('rental-size').disabled = false;
        document.getElementById('rental-delivery-place').disabled = false;

        document.getElementById('btn-save-rental').style.display = 'none';
        document.getElementById('btn-reset-rental').style.display = 'none';
        updateRentalEditActionButtons(null);

        renderRentalsTable(); // Hide delete button and clear highlight
    }

    function formatDate(dateStr) {
        if (!dateStr || dateStr === '---') return '---';
        const [y, m, d] = dateStr.split('-');
        return `${m}/${d}/${y}`;
    }

    // Phone formatting listener for rentals
    document.addEventListener('DOMContentLoaded', () => {
        const phoneInp = document.getElementById('rental-phone');
        if (phoneInp) {
            phoneInp.addEventListener('input', (e) => {
                const cursor = e.target.selectionStart;
                const oldLen = e.target.value.length;
                e.target.value = window.formatUSPhone(e.target.value);
                const newLen = e.target.value.length;
                if (newLen > oldLen) {
                    e.target.setSelectionRange(cursor + (newLen - oldLen), cursor + (newLen - oldLen));
                } else {
                    e.target.setSelectionRange(cursor, cursor);
                }
            });
        }
    });

    window.showSplitPaymentModal = function(totalAmount) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0'; overlay.style.left = '0';
            overlay.style.width = '100vw'; overlay.style.height = '100vh';
            overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = '999999';

            const modal = document.createElement('div');
            modal.style.backgroundColor = 'white';
            modal.style.padding = '25px';
            modal.style.borderRadius = '12px';
            modal.style.width = '350px';
            modal.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.2)';
            modal.style.borderTop = '5px solid #10b981';
            modal.style.fontFamily = 'Montserrat, sans-serif';

            modal.innerHTML = `
                <h3 style="margin-top:0; color:#1e293b; font-size:18px;">Payment Split</h3>
                <p style="font-size:14px; color:#475569; margin-bottom:15px;">Total to pay: <strong style="color:#0f172a;">$${totalAmount.toFixed(2)}</strong></p>
                <div style="margin-bottom:10px;">
                    <label style="display:block; font-size:12px; font-weight:bold; color:#64748b; margin-bottom:4px;">Cash Amount ($)</label>
                    <input type="number" id="split-cash" value="0.00" step="0.01" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block; font-size:12px; font-weight:bold; color:#64748b; margin-bottom:4px;">Bank/Zelle Amount ($)</label>
                    <input type="number" id="split-bank" value="${totalAmount.toFixed(2)}" step="0.01" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button id="split-cancel" style="padding:8px 16px; background:#e2e8f0; color:#475569; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Cancel</button>
                    <button id="split-confirm" style="padding:8px 16px; background:#10b981; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Confirm Payment</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const cashInput = modal.querySelector('#split-cash');
            const bankInput = modal.querySelector('#split-bank');

            cashInput.addEventListener('input', () => {
                let c = parseFloat(cashInput.value) || 0;
                if (c > totalAmount) { c = totalAmount; cashInput.value = c.toFixed(2); }
                if (c < 0) { c = 0; cashInput.value = c.toFixed(2); }
                bankInput.value = (totalAmount - c).toFixed(2);
            });

            bankInput.addEventListener('input', () => {
                let b = parseFloat(bankInput.value) || 0;
                if (b > totalAmount) { b = totalAmount; bankInput.value = b.toFixed(2); }
                if (b < 0) { b = 0; bankInput.value = b.toFixed(2); }
                cashInput.value = (totalAmount - b).toFixed(2);
            });

            modal.querySelector('#split-cancel').addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(null);
            });

            modal.querySelector('#split-confirm').addEventListener('click', () => {
                const finalCash = parseFloat(cashInput.value) || 0;
                const finalBank = parseFloat(bankInput.value) || 0;
                if (Math.abs(finalCash + finalBank - totalAmount) > 0.05) {
                    alert('The amounts do not sum up to the total.');
                    return;
                }
                document.body.removeChild(overlay);
                resolve({ cashAmt: finalCash, bankAmt: finalBank });
            });
        });
    };

    window.refreshRentalsModule = async function() {
        await window.withRefreshButton('btn-refresh-rentals', async () => {
            const data = await getRentals();
            window.currentRentals = data || [];
            await loadRentalInvoiceTrips(true);
            await reconcileRentalTripsFromReceivables();
            await ensureRentalCycleInvoices();
            populateRentalFilterCustomerSelect();
            populateRentalFilterSizeSelect();
            populateRentalFilterContainerList();
            renderRentalsTable();
        }, 'rentals');
    };

    window.renderRentalsTable = renderRentalsTable;
    window.loadRentalsData = loadRentalsData;
    window.loadRentalInvoiceTrips = loadRentalInvoiceTrips;
    window.reconcileRentalTripsFromReceivables = reconcileRentalTripsFromReceivables;
    window.rememberRentalInvoiceTrip = rememberRentalInvoiceTrip;
    window.stripRentalIdFromNote = stripRentalIdFromNote;
    window.saveRentalData = saveRentalData;
    window.editRental = editRental;
    window.removeRental = removeRental;
    window.resetRentalForm = resetRentalForm;
    window.toggleRentalCustomerMode = toggleRentalCustomerMode;
    window.toggleRentalReleaseMode = toggleRentalReleaseMode;
    window.toggleRentalSizeMode = toggleRentalSizeMode;
    window.populateRentalReleaseSelect = populateRentalReleaseSelect;
    window.populateRentalCustomerSelect = populateRentalCustomerSelect;
    window.populateAllRentalSelects = populateAllRentalSelects;
    window.calculateRentalCost = calculateRentalCost;
    window.removeSelectedRental = removeSelectedRental;

})();
