// ============================================================
// billing-manager.js — Unified Billing Center
// Combines: cust-invoice.js + master-invoice.js
// ============================================================

(function () {

    // ── GLOBAL STATE ──────────────────────────────────────────
    window.billingRows = [];              // Current filtered rows in table
    window.currentBillingOrderRows = []; // Rows for the open order in the modal
    window.combinedBillingTrips = [];    // Cached combined trips
    window.billingDataLoaded = false;    // Flag to prevent redundant fetches

    window.injectVirtualRentals = function(trips) {
        if (!window.currentRentals) return trips;
        
        const newVirtualTrips = [];
        
        window.currentRentals.forEach(rental => {
            if (rental.status === 'ACTIVE') {
                const rentDebt = parseFloat(rental.base_price) || 0;
                if (rentDebt > 0) {
                    const rRel = (rental.order_number || rental.release_no || '').trim().toLowerCase();
                    const rCont = (rental.container_no || '').trim().toLowerCase();
                    
                    let origTrip = null;
                    if (rCont && rCont !== '---') {
                        origTrip = trips.find(t => {
                            const tCont = (t[3] || '').trim().toLowerCase();
                            if (tCont !== rCont) return false;
                            const tOrder = (t[5] || t[4] || '').trim().toLowerCase();
                            if (tOrder === rRel) return true;
                            if (tOrder.startsWith('ord-') && (rRel === '' || rRel === '---')) return true;
                            return false;
                        });
                    }
                    
                    if (origTrip) {
                        origTrip[27] = rentDebt.toFixed(2);
                        origTrip[31] = rental.payment_status === 'PAID' ? 'PAID' : 'PEND';
                        origTrip.isActiveRentalMerged = rental.id;
                    } else {
                        const virtualRow = new Array(80).fill('');
                        virtualRow[0] = 'VIRTUAL_RENTAL_' + rental.id;
                        virtualRow[1] = rental.final_date && rental.final_date !== '---' ? rental.final_date : rental.start_date;
                        virtualRow[2] = rental.size;
                        virtualRow[3] = rental.container_no;
                        virtualRow[4] = rental.release_no || '---';
                        virtualRow[5] = 'RENTAL-' + (rental.container_no || '---');
                        virtualRow[6] = '---';
                        virtualRow[8] = rental.delivery_place || '---';
                        virtualRow[11] = rental.customer_name;
                        virtualRow[27] = rentDebt.toFixed(2);
                        virtualRow[31] = rental.payment_status === 'PAID' ? 'PAID' : 'PEND';
                        virtualRow[41] = 'COMPLETE';
                        virtualRow[57] = 'NO';
                        
                        let fullOrigTrip = null;
                        if (window.currentTrips && rCont && rCont !== '---') {
                            fullOrigTrip = window.currentTrips.find(t => {
                                const tCont = (t[3] || '').trim().toLowerCase();
                                if (tCont !== rCont) return false;
                                const tOrder = (t[5] || t[4] || '').trim().toLowerCase();
                                if (tOrder === rRel) return true;
                                if (tOrder.startsWith('ord-') && (rRel === '' || rRel === '---')) return true;
                                return false;
                            });
                        }
                        if (fullOrigTrip) {
                            virtualRow[65] = fullOrigTrip[65] || '---';
                            virtualRow[17] = fullOrigTrip[17] || '---';
                        }
                        
                        newVirtualTrips.push(virtualRow);
                    }
                }
            }
        });
        return trips.concat(newVirtualTrips);
    };

    window.initBillingCenter = async function() {
        if (window.billingDataLoaded && window.combinedBillingTrips.length > 0) {
            // Already loaded, just render from memory
            if (typeof window.renderBillingTable === 'function') {
                window.renderBillingTable();
            }
            return;
        }

        console.log("Initializing Billing Center with dedicated fetch...");
        
        // --- ENSURE RENTALS ARE LOADED ---
        if (typeof window.loadRentalsData === 'function' && (!window.currentRentals || window.currentRentals.length === 0)) {
            await window.loadRentalsData();
        }

        const body = document.getElementById('billing-table-body');
        if (body) {
            body.innerHTML = '<tr><td colspan="15" style="text-align:center; padding:20px; font-weight:bold; color:#1e40af;"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i> Buscando órdenes pendientes...</td></tr>';
        }

        if (typeof window.getPendingBillingTrips === 'function') {
            const data = await window.getPendingBillingTrips();
            if (data && data.length > 0 && typeof window.mapTripToArray === 'function') {
                let trips = data.map(window.mapTripToArray);
                trips = window.injectVirtualRentals(trips); // INJECT VIRTUAL ROWS
                const todayStr = new Date().toISOString().split('T')[0];
                trips.sort((a, b) => {
                    const dateA = a[1] || '';
                    const dateB = b[1] || '';
                    const isTodayA = (dateA === todayStr);
                    const isTodayB = (dateB === todayStr);
                    if (isTodayA && !isTodayB) return -1;
                    if (!isTodayA && isTodayB) return 1;
                    return dateB.localeCompare(dateA);
                });
                window.combinedBillingTrips = trips;
            } else {
                if (!window.currentTrips || window.currentTrips.length === 0) {
                    if (window.loadTableData) await window.loadTableData();
                }
                window.combinedBillingTrips = window.buildCombinedBillingTrips();
            }
        } else {
            if (!window.currentTrips || window.currentTrips.length === 0) {
                if (window.loadTableData) await window.loadTableData();
            }
            window.combinedBillingTrips = window.buildCombinedBillingTrips();
        }
        
        window.billingDataLoaded = true;
        if (typeof window.renderBillingTable === 'function') {
            window.renderBillingTable();
        }
        
        // Run the invoice automation engine (banner + auto-send + reminders)
        if (typeof window.runInvoiceAutomation === 'function') {
            setTimeout(() => window.runInvoiceAutomation(), 800);
        }
    };

    window.buildCombinedBillingTrips = function() {
        // Fallback for cases where initBillingCenter is not yet active
        let trips = window.currentTrips ? [...window.currentTrips] : [];
        
        // --- INJECT VIRTUAL RENTAL DEBTS ---
        trips = window.injectVirtualRentals(trips);
        
        const todayStr = new Date().toISOString().split('T')[0];
        trips.sort((a, b) => {
            const dateA = a[1] || '';
            const dateB = b[1] || '';
            const isTodayA = (dateA === todayStr);
            const isTodayB = (dateB === todayStr);
            if (isTodayA && !isTodayB) return -1;
            if (!isTodayA && isTodayB) return 1;
            return dateB.localeCompare(dateA);
        });
        
        return trips;
    };

    // ── HELPERS ───────────────────────────────────────────────

    function fmtMoney(v) {
        return '$' + (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
    }

    function fmtDate(ds) {
        if (!ds || ds === '---') return '---';
        const p = ds.split('-');
        if (p.length !== 3) return ds;
        return `${p[1]}/${p[2]}/${p[0]}`;
    }

    function rowHasPendingPayment(row) {
        const orderNo = (row[5] || '---').toString().toUpperCase();
        const isYardStorage = orderNo.startsWith('YRD-');

        const hasTrans = row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0;
        const hasSales = row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0;
        const yardRate = !isYardStorage ? (parseFloat(row[13]) || 0) : 0;
        const takeTax  = row[49] === true || row[49] === 'true' || row[49] === 'YES' || row[49] === 'on' || row[49] === 1;
        const hasRent  = (parseFloat(row[27]) || 0) > 0.01;
        const hasStorage = isYardStorage ? (parseFloat(row[13]) || 0) > 0.01 : (parseFloat(row[14]) || 0) > 0.01;

        if (hasTrans && row[32] !== 'PAID') return true;
        if (hasSales && row[33] !== 'PAID') return true;
        if (yardRate > 0.01 && row[30] !== 'PAID') return true;
        if (takeTax  && row[52] !== 'PAID') return true;
        if (hasRent && row[31] !== 'PAID') return true;
        if (hasStorage && row[30] !== 'PAID') return true; // storage shares yard payment status

        return false;
    }

    // ── POPULATE FILTERS ──────────────────────────────────────
    window.populateBillingFilters = function () {
        // We no longer overwrite window.combinedBillingTrips here!
        // It is populated once independently by initBillingCenter.
        
        const cities     = new Set();
        const places     = new Set();
        const customers  = new Set();
        const drivers    = new Set();
        const releases   = new Set();

        const fOrder    = (document.getElementById('bc-f-order')?.value    || '').toLowerCase().trim();
        const fCity     = (document.getElementById('bc-f-city')?.value     || '').trim();
        const fPlace    = (document.getElementById('bc-f-place')?.value    || '').trim();
        const fCustomer = (document.getElementById('bc-f-customer')?.value || '').trim();
        const fDriver   = (document.getElementById('bc-f-driver')?.value   || '').trim();
        const fService  = (document.getElementById('bc-f-service')?.value  || '').trim();
        const fRelease  = (document.getElementById('bc-f-release')?.value  || '').trim();
        const fFrom     = document.getElementById('bc-f-from')?.value || '';
        const fTo       = document.getElementById('bc-f-to')?.value   || '';
        const fInvoice  = document.getElementById('bc-f-invoice')?.value || '';
        const fPayment  = (document.getElementById('bc-f-payment')?.value || 'all').toLowerCase();

        (window.combinedBillingTrips || []).forEach(row => {
            const status = (row[41] || '').toUpperCase();
            if (!(status === 'COMPLETE' || status === 'DELIVERED' || status === 'PAID')) return;

            const isPending = rowHasPendingPayment(row);
            
            const orderNo  = (row[5]  || '').toString().toLowerCase();
            const city     = (row[6]  || '').toString().trim();
            const place    = (row[8]  || '').toString().trim();
            const customer = (row[11] || '').toString().trim();
            const driver   = (row[17] || '').toString().trim();
            const release  = (row[4]  || '---').toString().trim();
            const rowDate  = row[1]   || '';
            const invSent  = (row[57] || 'NO').toUpperCase();

            const orderNoUpper = (row[5] || '---').toString().toUpperCase();
            const isYardStorage = orderNoUpper.startsWith('YRD-');
            
            const hasTrans = (parseFloat(row[18]) || 0) > 0.01;
            const hasSales = (parseFloat(row[20]) || 0) > 0.01;
            const hasYard  = !isYardStorage ? (parseFloat(row[13]) || 0) > 0.01 : false;
            const hasStorage = isYardStorage ? (parseFloat(row[13]) || 0) > 0.01 : (parseFloat(row[14]) || 0) > 0.01;
            const hasRent  = (parseFloat(row[27]) || 0) > 0.01;

            // Check non-dropdown filters
            if (fPayment === 'pending' && !isPending) return;
            if (fPayment === 'paid' && isPending) return;
            if (fOrder && !orderNo.includes(fOrder)) return;
            if (fFrom && rowDate < fFrom) return;
            if (fTo && rowDate > fTo) return;
            if (fInvoice && invSent !== fInvoice) return;
            if (fRelease && release !== fRelease) return;

            if (fService === 'TRANSPORT' && !hasTrans) return;
            if (fService === 'SALES' && !hasSales) return;
            if (fService === 'YARD' && !hasYard) return;
            if (fService === 'STORAGE' && !hasStorage) return;
            if (fService === 'RENT' && !hasRent) return;

            // To add a value to a specific dropdown, it must pass all OTHER dropdown filters
            const passCity = !fCity || city === fCity;
            const passPlace = !fPlace || place === fPlace;
            const passCustomer = !fCustomer || customer === fCustomer;
            const passDriver = !fDriver || driver === fDriver;
            const passRelease = !fRelease || release === fRelease;

            if (passPlace && passCustomer && passDriver && passRelease && city && city !== '---') cities.add(city);
            if (passCity && passCustomer && passDriver && passRelease && place && place !== '---') places.add(place);
            if (passCity && passPlace && passDriver && passRelease && customer && customer !== '---') customers.add(customer);
            if (passCity && passPlace && passCustomer && passRelease && driver && driver !== '---') drivers.add(driver);
            if (passCity && passPlace && passCustomer && passDriver && release && release !== '---') releases.add(release);
        });

        const fill = (id, vals, defaultTxt) => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = `<option value="">${defaultTxt}</option>`;
            const fragment = document.createDocumentFragment();
            [...vals].sort().forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                fragment.appendChild(opt);
            });
            sel.appendChild(fragment);
            if (cur && vals.has(cur)) {
                sel.value = cur;
            } else {
                sel.value = '';
            }
        };

        fill('bc-f-city',     cities,    'All Cities');
        fill('bc-f-place',    places,    'All Places');
        fill('bc-f-customer', customers, 'All Customers');
        fill('bc-f-driver',   drivers,   'All Drivers');
        fill('bc-f-release',  releases,  'All Releases');
    };

    // ── RENDER MAIN TABLE ─────────────────────────────────────
    window.renderBillingTable = function () {
        const body = document.getElementById('billing-table-body');
        if (!body) return;

        window.populateBillingFilters();

        const fOrder    = (document.getElementById('bc-f-order')?.value    || '').toLowerCase().trim();
        const fBooking  = (document.getElementById('bc-f-booking')?.value  || '').toLowerCase().trim();
        const fCity     = (document.getElementById('bc-f-city')?.value     || '').trim();
        const fPlace    = (document.getElementById('bc-f-place')?.value    || '').trim();
        const fCustomer = (document.getElementById('bc-f-customer')?.value || '').trim();
        const fDriver   = (document.getElementById('bc-f-driver')?.value   || '').trim();
        const fService  = (document.getElementById('bc-f-service')?.value || '').trim();
        const fRelease  = (document.getElementById('bc-f-release')?.value || '').trim();
        const fFrom     = document.getElementById('bc-f-from')?.value || '';
        const fTo       = document.getElementById('bc-f-to')?.value   || '';
        const fInvoice  = document.getElementById('bc-f-invoice')?.value || '';
        const fPayment  = (document.getElementById('bc-f-payment')?.value || 'all').toLowerCase();

        const filtered = (window.combinedBillingTrips || []).filter(row => {
            const status = (row[41] || '').toUpperCase();
            if (!(status === 'COMPLETE' || status === 'DELIVERED' || status === 'PAID')) return false;
            
            const isPending = rowHasPendingPayment(row);
            if (fPayment === 'pending' && !isPending) return false;
            if (fPayment === 'paid' && isPending) return false;

            const orderNo  = (row[5]  || '').toString().toLowerCase();
            const city     = (row[6]  || '').toString().trim();
            const place    = (row[8]  || '').toString().trim();
            const customer = (row[11] || '').toString().trim();
            const driver   = (row[17] || '').toString().trim();
            const release  = (row[4]  || '---').toString().trim();
            const booking  = (row[65] && row[65] !== '---') ? row[65].toString().toLowerCase() : '';
            const rowDate  = row[1]   || '';
            const invSent  = (row[57] || 'NO').toUpperCase();
            const orderNoUpper = (row[5] || '---').toString().toUpperCase();
            const isYardStorage = orderNoUpper.startsWith('YRD-');
            
            const hasTrans = (parseFloat(row[18]) || 0) > 0.01;
            const hasSales = (parseFloat(row[20]) || 0) > 0.01;
            const hasYard  = !isYardStorage ? (parseFloat(row[13]) || 0) > 0.01 : false;
            const hasStorage = isYardStorage ? (parseFloat(row[13]) || 0) > 0.01 : (parseFloat(row[14]) || 0) > 0.01;
            const hasRent  = (parseFloat(row[27]) || 0) > 0.01;

            if (fOrder    && !orderNo.includes(fOrder))    return false;
            if (fBooking  && !booking.includes(fBooking))  return false;
            if (fCity     && city     !== fCity)            return false;
            if (fPlace    && place    !== fPlace)           return false;
            if (fCustomer && customer !== fCustomer)        return false;
            if (fDriver   && driver   !== fDriver)          return false;
            if (fRelease  && release  !== fRelease)         return false;

            if (fService === 'TRANSPORT' && !hasTrans)      return false;
            if (fService === 'SALES'     && !hasSales)      return false;
            if (fService === 'YARD'      && !hasYard)       return false;
            if (fService === 'STORAGE'   && !hasStorage)    return false;
            if (fService === 'RENT'      && !hasRent)       return false;
            if (fFrom     && rowDate  < fFrom)              return false;
            if (fTo       && rowDate  > fTo)                return false;
            if (fInvoice  && invSent  !== fInvoice)         return false;

            return true;
        });

        window.billingRows = filtered;
        body.innerHTML    = '';

        let visibleCount = 0;
        let totalOwedAmount = 0;
        const fragment = document.createDocumentFragment();

        filtered.forEach((row) => {
            const orderNo = (row[5] || '---').toString().toUpperCase();
            const isInvoiceSent = (row[57] === 'YES');

            // Compute totals for this single row
            let totalYard = parseFloat(row[13]) || 0;
            let totalTrans = parseFloat(row[18]) || 0;
            const qty = parseInt(row[53]) || 1;
            let totalSales = (parseFloat(row[20]) || 0) * qty;

            // Storage calculation (Price per day * days, or Yard Stock flat fee)
            let totalStorage = 0;
            const isYardStorageRow = orderNo.startsWith('YRD-');
            if (isYardStorageRow) {
                totalStorage = totalYard;
                totalYard = 0;
            } else {
                const ppd = parseFloat(row[14]) || 0;
                if (ppd > 0) {
                    const entryDate = new Date(row[1]); // Date In
                    const exitDate = row[15] && row[15] !== '---' ? new Date(row[15]) : new Date(); // Date Out or Today
                    const diffTime = Math.abs(exitDate - entryDate);
                    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                    totalStorage = ppd * diffDays;
                }
            }

            // Rent calculation (Matches Rentals Total column exactly)
            let totalRent = 0;
            const mrate = parseFloat(row[27]) || 0;
            if (mrate > 0) {
                const tripId = row[0] || '';
                let rentalId = null;
                if (tripId.startsWith('VIRTUAL_RENTAL_')) {
                    rentalId = tripId.replace('VIRTUAL_RENTAL_', '');
                } else if (row.isActiveRentalMerged) {
                    rentalId = row.isActiveRentalMerged;
                }
                
                if (rentalId) {
                    const rental = (window.currentRentals || []).find(r => String(r.id) === String(rentalId));
                    if (rental && window.calculateRentalCost) {
                        const costInfo = window.calculateRentalCost(rental.start_date, rental.final_date, rental.base_price, rental.daily_rate, rental.status, rental.time_rent);
                        totalRent = costInfo.total;
                    } else {
                        totalRent = mrate;
                    }
                } else {
                    const entryDate = new Date(row[1]);
                    const exitDate = row[15] && row[15] !== '---' ? new Date(row[15]) : new Date();
                    const diffDays = Math.ceil(Math.abs(exitDate - entryDate) / (1000 * 60 * 60 * 24));
                    const diffPeriods = Math.max(1, Math.ceil(diffDays / 30));
                    totalRent = mrate * diffPeriods;
                }
            }
            
            let isOrderPendingPayment = false;

            // Calculate pending portions for total due
            let rowSubtotalOwed = 0;
            if (totalYard > 0.01 && row[30] !== 'PAID') rowSubtotalOwed += totalYard;
            if (totalTrans > 0.01 && row[32] !== 'PAID') rowSubtotalOwed += totalTrans;
            if (totalSales > 0.01 && row[33] !== 'PAID') rowSubtotalOwed += totalSales;
            // Assuming row[31] (in-rentpaid) handles both Storage and Rent
            if ((totalStorage > 0.01 || totalRent > 0.01) && row[31] !== 'PAID') {
                rowSubtotalOwed += (totalStorage + totalRent);
            }
            
            const takeTax = row[49] === true || row[49] === 'true' || row[49] === 'YES' || row[49] === 'on' || row[49] === 1;
            let rowTaxOwed = 0;
            if (takeTax && row[52] !== 'PAID') {
                const taxPct = parseFloat(row[50]) || 0;
                rowTaxOwed = ((totalTrans + totalSales + totalYard + totalStorage + totalRent) * taxPct) / 100;
            }
            
            totalOwedAmount += (rowSubtotalOwed + rowTaxOwed);

            if (rowHasPendingPayment(row)) {
                isOrderPendingPayment = true;
            }

            const grandTotal = totalTrans + totalSales + totalYard + totalStorage + totalRent;
            const displayDate = fmtDate(row[1]);
            const customer    = row[11] || '---';
            const city        = row[6]  || '---';
            const place       = row[8]  || '---';
            const nCont       = row[3]  || '---';
            const bookingNo   = (row[65] && row[65] !== '---') ? row[65] : '—';
            const release     = row[4]  || '---';
            const driverName  = row[17] || '---';

            let rowBg = isOrderPendingPayment ? '#fee2e2' : '#dcfce7'; // RED if pending, GREEN if paid

            const cs     = 'padding: 11px 13px; border-bottom: 1px solid #e2e8f0; text-align: center; vertical-align: middle; font-weight: 700; color: #0f172a;';
            const invBadge = isInvoiceSent
                ? `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:0.68rem;font-weight:800;">SENT ✓</span>`
                : `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:12px;font-size:0.68rem;font-weight:800;">PENDING</span>`;

            // Validation badge (Guardian check)
            const validBadge = window.getInvoiceValidationBadge
                ? window.getInvoiceValidationBadge(row)
                : '';

            // Last sent / reminder count info
            const lastSentDate = row[63];
            const reminderCount = parseInt(row[64]) || 0;
            let lastSentText = '—';
            if (lastSentDate) {
                const daysSince = Math.floor((Date.now() - new Date(lastSentDate)) / 86400000);
                lastSentText = daysSince === 0 ? 'Today' : `${daysSince}d ago`;
                if (reminderCount > 1) lastSentText += ` (×${reminderCount})`;
            }

            const tr = document.createElement('tr');
            tr.style.background = rowBg;
            tr.style.transition = 'background 0.15s';
            tr.onmouseenter = () => tr.style.background = '#e2e8f0';
            tr.onmouseleave = () => tr.style.background = rowBg;

            // We need the global index from currentTrips to easily identify this exact row
            const globalIdx = (window.combinedBillingTrips || []).indexOf(row);

            tr.innerHTML = `
                <td style="${cs}">${displayDate}</td>
                <td style="${cs}">${orderNo}</td>
                <td style="${cs}">${nCont}</td>
                <td style="${cs}">${bookingNo}</td>
                <td style="${cs}">${release}</td>
                <td style="${cs}">${customer}</td>
                <td style="${cs}">${city}</td>
                <td style="${cs} white-space:normal; min-width:130px; text-align:left;">${place}</td>
                <td style="display:none; ${cs}">${driverName}</td>
                <td style="${cs} color:#f59e0b;">${totalYard > 0 ? fmtMoney(totalYard) : ''}</td>
                <td style="${cs} color:#1e40af;">${totalTrans > 0 ? fmtMoney(totalTrans) : ''}</td>
                <td style="${cs} color:#10b981;">${totalSales > 0 ? fmtMoney(totalSales) : ''}</td>
                <td style="${cs} color:#e11d48;">${totalStorage > 0 ? fmtMoney(totalStorage) : ''}</td>
                <td style="${cs} color:#7c3aed;">${totalRent > 0 ? fmtMoney(totalRent) : ''}</td>
                <td style="${cs} font-size:1rem; font-weight:900; color:#1e293b;">${fmtMoney(grandTotal)}</td>
                <td style="${cs}">${invBadge}</td>
                <td style="${cs}">${validBadge}</td>
                <td style="${cs} font-size:0.7rem; color:#475569;">${lastSentText}</td>
                <td style="${cs}">
                    <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                        <button onclick="openBillingDetail(${globalIdx})" class="glossy-dark-btn-sm">
                            <i class="fas fa-file-invoice-dollar"></i> VIEW SEND
                        </button>
                        ${isOrderPendingPayment ? `
                        <button onclick="markBillingRowAsPaid(${globalIdx}, this)" class="glossy-green-btn-sm" title="Mark as Paid">
                            <i class="fas fa-check-double"></i> PAID
                        </button>
                        ` : ''}
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
            visibleCount++;
        });
        
        body.appendChild(fragment);

        if (visibleCount === 0) {
            body.innerHTML = '<tr><td colspan="13" style="padding:50px;text-align:center;color:#94a3b8;font-style:italic;">No pending invoices found for the selected filters.</td></tr>';
        }

        // Counter
        const counter = document.getElementById('billing-count-display');
        if (counter) counter.textContent = visibleCount;

        // Total Due
        const totalDueDisplay = document.getElementById('billing-total-due-display');
        if (totalDueDisplay) totalDueDisplay.textContent = fmtMoney(totalOwedAmount);

        // Toggle Booking Invoice Button
        const bookingInput = document.getElementById('bc-f-booking');
        const masterInvoiceBtn = document.getElementById('btn-booking-invoice');
        if (masterInvoiceBtn) {
            if (bookingInput && bookingInput.value.trim() !== '') {
                masterInvoiceBtn.style.display = 'inline-flex';
            } else {
                masterInvoiceBtn.style.display = 'none';
            }
        }

        // Toggle Service Invoice Button
        const serviceInput = document.getElementById('bc-f-service');
        const serviceInvoiceBtn = document.getElementById('btn-service-invoice');
        if (serviceInvoiceBtn) {
            if (serviceInput && serviceInput.value.trim() !== '') {
                serviceInvoiceBtn.style.display = 'inline-flex';
            } else {
                serviceInvoiceBtn.style.display = 'none';
            }
        }

        // Update the incomplete orders alert banner to reflect the filtered rows
        if (typeof window.renderIncompleteOrdersBanner === 'function') {
            window.renderIncompleteOrdersBanner();
        }
    };

    // ── RESET FILTERS ─────────────────────────────────────────
    window.resetBillingFilters = function () {
        ['bc-f-order','bc-f-booking','bc-f-city','bc-f-place','bc-f-customer','bc-f-driver','bc-f-service','bc-f-release','bc-f-from','bc-f-to','bc-f-invoice']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const fPayment = document.getElementById('bc-f-payment');
        if (fPayment) fPayment.value = 'pending';
        window.renderBillingTable();
    };

    // ── OPEN DETAIL MODAL ─────────────────────────────────────
    window.openBillingDetail = function (globalIdx) {
        const trips = window.combinedBillingTrips || [];
        const row = trips[globalIdx];

        if (!row) {
            alert(`Record not found.`);
            return;
        }

        const orderNo = (row[5] || '---').toString();
        window.currentBillingOrderRows = [row];
        renderBillingDetailModal([row], orderNo);

        const modal = document.getElementById('billing-detail-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    };

    // --- MASTER INVOICE (BOOKING INVOICE) ---
    window.viewMasterInvoice = function () {
        const rows = window.billingRows || [];
        if (rows.length === 0) {
            alert('No hay órdenes filtradas para generar el Booking Invoice.');
            return;
        }

        // Determine title
        let masterTitle = 'MASTER-INVOICE';
        const firstBooking = (rows[0][65] || '---').toString().trim().toUpperCase();
        if (firstBooking !== '---') {
            const allSameBooking = rows.every(r => (r[65] || '---').toString().trim().toUpperCase() === firstBooking);
            if (allSameBooking) {
                masterTitle = 'BOOKING-' + firstBooking;
            }
        }

        window.currentBillingOrderRows = rows;
        renderBillingDetailModal(rows, masterTitle);

        const modal = document.getElementById('billing-detail-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    };

    // --- SERVICE INVOICE ---
    window.viewServiceInvoice = function () {
        const rows = window.billingRows || [];
        if (rows.length === 0) {
            alert('No hay órdenes filtradas para generar el Service Invoice.');
            return;
        }

        const serviceInput = document.getElementById('bc-f-service');
        const selectedService = serviceInput ? serviceInput.value.trim().toUpperCase() : '';
        if (!selectedService) {
            alert('Por favor selecciona un servicio en el filtro.');
            return;
        }

        let masterTitle = 'SERVICE INVOICE: ' + selectedService;

        window.currentBillingOrderRows = rows;
        renderBillingDetailModal(rows, masterTitle, selectedService);

        const modal = document.getElementById('billing-detail-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeBillingDetail = function () {
        const modal = document.getElementById('billing-detail-modal');
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = '';
    };

    // Close modal on backdrop click
    document.addEventListener('click', function (e) {
        const modal = document.getElementById('billing-detail-modal');
        if (modal && e.target === modal) window.closeBillingDetail();
    });

    // ── RENDER DETAIL CONTENT INSIDE MODAL ───────────────────
    function renderBillingDetailModal(rows, orderNo, serviceFilter = null) {
        const mainRow     = rows[0];
        const preview     = document.getElementById('bm-invoice-preview');
        if (!preview) return;

        // Company selector
        const coSel  = document.getElementById('bm-company-selector');
        const coDisp = document.getElementById('bm-company-name-display');
        if (coSel && coDisp) coDisp.textContent = coSel.value;

        // Header
        document.getElementById('bm-order-display').textContent = orderNo || mainRow[5] || '---';
        document.getElementById('bm-date-display').textContent  = window.formatDateMMDDYYYY
            ? window.formatDateMMDDYYYY(mainRow[1])
            : fmtDate(mainRow[1]);

        // Bill To
        const customerName = mainRow[11] && mainRow[11] !== '---' ? mainRow[11] : 'No Customer';
        document.getElementById('bm-bill-to-name').textContent = customerName;

        const customerObj    = (window.currentCustomers || []).find(c => c.name === customerName);
        const billAddressEl  = document.getElementById('bm-bill-to-address');
        if (billAddressEl) {
            if (customerObj && customerObj.address) {
                billAddressEl.textContent     = customerObj.address;
                billAddressEl.style.display   = 'block';
            } else {
                billAddressEl.style.display   = 'none';
            }
        }

        document.getElementById('bm-from-address').textContent = mainRow[7] && mainRow[7] !== '---' ? mainRow[7] : 'N/A';
        document.getElementById('bm-to-address').textContent   = mainRow[8] && mainRow[8] !== '---' ? mainRow[8] : 'N/A';

        // Status badge
        let isEntirelyPaid = true;
        rows.forEach(r => {
            const orderNo = (r[5] || '---').toString().toUpperCase();
            const isYardStorage = orderNo.startsWith('YRD-');
            const hasTrans  = r[42] === 'YES' && (parseFloat(r[18]) || 0) > 0;
            const hasSales  = r[43] === 'YES' && (parseFloat(r[20]) || 0) > 0;
            const yardRate  = !isYardStorage ? (parseFloat(r[13]) || 0) : 0;
            const takeTax   = r[49] === true || r[49] === 'true' || r[49] === 'YES' || r[49] === 'on' || r[49] === 1;
            const hasRent   = (parseFloat(r[27]) || 0) > 0.01;
            const hasStorage = isYardStorage ? (parseFloat(r[13]) || 0) > 0.01 : (parseFloat(r[14]) || 0) > 0.01;

            if (hasTrans  && r[32] !== 'PAID') isEntirelyPaid = false;
            if (hasSales  && r[33] !== 'PAID') isEntirelyPaid = false;
            if (yardRate > 0.01 && r[30] !== 'PAID') isEntirelyPaid = false;
            if (takeTax   && r[52] !== 'PAID') isEntirelyPaid = false;
            if (hasRent   && r[31] !== 'PAID') isEntirelyPaid = false;
            if (hasStorage && r[30] !== 'PAID') isEntirelyPaid = false; // storage uses yard payment status
        });

        const badge = document.getElementById('bm-status-badge');
        if (badge) {
            badge.textContent       = isEntirelyPaid ? 'PAID' : 'PENDING';
            badge.style.background  = isEntirelyPaid ? '#dcfce7' : '#fee2e2';
            badge.style.color       = isEntirelyPaid ? '#15803d' : '#991b1b';
        }

        // Services table
        const body    = document.getElementById('bm-services-body');
        body.innerHTML = '';
        let subtotal   = 0;

        // Check if this is a YARD INVOICE static trip (yard_services = JSON snapshot)
        let isYardInvoice = false;
        let yardSnap = null;
        try {
            const maybeSnap = mainRow[12];
            if (maybeSnap && typeof maybeSnap === 'string' && maybeSnap.startsWith('{')) {
                yardSnap = JSON.parse(maybeSnap);
                if (yardSnap && yardSnap.items) isYardInvoice = true;
            }
        } catch(e) {}

        if (isYardInvoice && yardSnap) {
            // For YARD INVOICE rows, show the full yard invoice HTML inline
            subtotal = parseFloat(yardSnap.total) || (parseFloat(mainRow[13]) || 0);
            const servicesTable = body.closest('table');
            if (servicesTable) {
                const container = servicesTable.parentElement;
                servicesTable.style.display = 'none';
                let yardContainer = container.querySelector('#bm-yard-invoice-detail');
                if (!yardContainer) {
                    yardContainer = document.createElement('div');
                    yardContainer.id = 'bm-yard-invoice-detail';
                    container.insertBefore(yardContainer, servicesTable);
                }
                if (window.generateYardInvoiceHTML) {
                    const { html } = window.generateYardInvoiceHTML(yardSnap.items, yardSnap.dateFrom, yardSnap.dateTo, false, null);
                    yardContainer.innerHTML = html;
                    subtotal = parseFloat(mainRow[13]) || 0;
                } else {
                    yardContainer.innerHTML = `<p style="padding:20px;color:#475569;">YARD STORAGE — Total: ${fmtMoney(subtotal)}</p>`;
                }
            }
        } else {
            // Hide yard detail container if it exists
            const existingYardDetail = document.getElementById('bm-yard-invoice-detail');
            if (existingYardDetail) existingYardDetail.innerHTML = '';
            const servicesTable = body.closest('table');
            if (servicesTable) servicesTable.style.display = '';

            const transportMap = new Map();
            const yardMap = new Map();
            const rentMap = new Map();
            const storageMap = new Map();
            const salesMap = new Map();

            function addAggregatedItem(map, desc, qty, price) {
                const key = `${desc}|${price.toFixed(2)}`;
                if (map.has(key)) {
                    map.get(key).qty += qty;
                } else {
                    map.set(key, { desc, price, qty });
                }
            }

            // 1. Transport Services
            if (!serviceFilter || serviceFilter === 'TRANSPORT') {
                rows.forEach(row => {
                    const hasTrans = row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0;
                    if (hasTrans) {
                        const price = parseFloat(row[18]) || 0;
                        const qty = parseInt(row[53]) || 1;
                        addAggregatedItem(transportMap, 'TRANSPORT SERVICE', qty, price);
                    }
                });
            }
            
            // 2. Yard Services
            if (!serviceFilter || serviceFilter === 'YARD') {
                rows.forEach(row => {
                    const yardDesc = row[12] && row[12] !== '---' ? row[12] : '';
                    const yardRate = parseFloat(row[13]) || 0;
                    const qty = parseInt(row[53]) || 1;
                    
                    if (yardRate > 0) {
                        if (yardDesc && typeof yardDesc === 'string' && yardDesc.startsWith('[')) {
                            try {
                                const services = JSON.parse(yardDesc);
                                if (Array.isArray(services)) {
                                    services.forEach(s => {
                                        const servicePrice = parseFloat(s.price) || 0;
                                        if (servicePrice > 0) {
                                            addAggregatedItem(yardMap, `YARD SERVICE: ${s.desc || 'Other'}`, qty, servicePrice);
                                        }
                                    });
                                }
                            } catch(e) {
                                addAggregatedItem(yardMap, `YARD SERVICE`, qty, yardRate);
                            }
                        } else {
                            const desc = yardDesc && !yardDesc.startsWith('{') && yardDesc !== 'YES' ? `YARD SERVICE: ${yardDesc}` : `YARD SERVICE`;
                            addAggregatedItem(yardMap, desc, qty, yardRate);
                        }
                    }
                });
            }
            
            // 3. Container Rentals
            if (!serviceFilter || serviceFilter === 'RENT') {
                rows.forEach(row => {
                    const mrate = parseFloat(row[27]) || 0;
                    const tripId = row[0] || '';
                    
                    if (mrate > 0) {
                        let diffPeriods = 1;
                        let periodLabel = 'Month';
                        let startDateObj = new Date(row[1]);
                        let calcTotal = mrate;
                        
                        if (tripId.startsWith('VIRTUAL_RENTAL_')) {
                            const rentalId = tripId.replace('VIRTUAL_RENTAL_', '');
                            const rental = (window.currentRentals || []).find(r => String(r.id) === String(rentalId));
                            if (rental && window.calculateRentalCost) {
                                periodLabel = (rental.time_rent || '').toLowerCase().includes('week') ? 'Week' : 'Month';
                                startDateObj = new Date(rental.start_date);
                                const costInfo = window.calculateRentalCost(rental.start_date, rental.final_date, rental.base_price, rental.daily_rate, rental.status, rental.time_rent);
                                calcTotal = costInfo.total;
                                diffPeriods = Math.max(1, Math.round(calcTotal / mrate));
                            }
                        } else if (row.isActiveRentalMerged) {
                            const rentalId = row.isActiveRentalMerged;
                            const rental = (window.currentRentals || []).find(r => String(r.id) === String(rentalId));
                            if (rental && window.calculateRentalCost) {
                                periodLabel = (rental.time_rent || '').toLowerCase().includes('week') ? 'Week' : 'Month';
                                startDateObj = new Date(rental.start_date);
                                const costInfo = window.calculateRentalCost(rental.start_date, rental.final_date, rental.base_price, rental.daily_rate, rental.status, rental.time_rent);
                                calcTotal = costInfo.total;
                                diffPeriods = Math.max(1, Math.round(calcTotal / mrate));
                            }
                        } else {
                            const entryDate = new Date(row[1]);
                            const exitDate = row[15] && row[15] !== '---' ? new Date(row[15]) : new Date();
                            const diffDays = Math.ceil(Math.abs(exitDate - entryDate) / (1000 * 60 * 60 * 24));
                            diffPeriods = Math.max(1, Math.ceil(diffDays / 30));
                        }

                        for (let i = 1; i <= diffPeriods; i++) {
                            let pStart = new Date(startDateObj);
                            let pEnd = new Date(startDateObj);
                            if (periodLabel === 'Week') {
                                pStart.setDate(pStart.getDate() + (i-1)*7);
                                pEnd.setDate(pStart.getDate() + 7);
                            } else {
                                pStart.setDate(pStart.getDate() + (i-1)*30);
                                pEnd.setDate(pStart.getDate() + 30);
                            }
                            
                            const dStr = pStart.toLocaleDateString('en-US', {month:'2-digit', day:'2-digit', year:'numeric'}) + ' - ' + pEnd.toLocaleDateString('en-US', {month:'2-digit', day:'2-digit', year:'numeric'});
                            
                            addAggregatedItem(rentMap, `CONTAINER RENTAL (${periodLabel} ${i}: ${dStr})`, 1, mrate);
                        }
                    }
                });
            }
            
            // 4. Storage
            if (!serviceFilter || serviceFilter === 'STORAGE') {
                rows.forEach(row => {
                    const ppd = parseFloat(row[14]) || 0;
                    
                    if (ppd > 0) {
                        const entryDate = new Date(row[1]);
                        const exitDate = row[15] && row[15] !== '---' ? new Date(row[15]) : new Date();
                        const diffTime = Math.abs(exitDate - entryDate);
                        const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                        addAggregatedItem(storageMap, `STORAGE`, diffDays, ppd);
                    }
                });
            }
            
            // 5. Container Sales
            if (!serviceFilter || serviceFilter === 'SALES') {
                rows.forEach(row => {
                    const hasSales = row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0;
                    if (hasSales) {
                        const price = parseFloat(row[20]) || 0;
                        const qty = parseInt(row[53]) || 1;
                        addAggregatedItem(salesMap, `CONTAINER SALES`, qty, price);
                    }
                });
            }

            // Append grouped items to the table
            const allMaps = [transportMap, yardMap, rentMap, storageMap, salesMap];
            allMaps.forEach(map => {
                map.forEach(item => {
                    addDetailRow(body, item.desc, item.qty, item.price);
                    subtotal += (item.qty * item.price);
                });
            });
        }

        // Tax
        const takeTax   = mainRow[49] === true || mainRow[49] === 'true';
        const taxPct    = parseFloat(mainRow[50]) || 0;
        let   taxAmount = 0;

        const taxRow = document.getElementById('bm-tax-row');
        if (takeTax && taxPct > 0) {
            taxAmount = (subtotal * taxPct) / 100;
            if (taxRow) taxRow.style.display = 'table-row';
            document.getElementById('bm-tax-rate').textContent   = taxPct;
            document.getElementById('bm-tax-amount').textContent = fmtMoney(taxAmount);
        } else {
            if (taxRow) taxRow.style.display = 'none';
        }

        const grandTotal = subtotal + taxAmount;
        document.getElementById('bm-subtotal').textContent = fmtMoney(subtotal);
        document.getElementById('bm-total').textContent    = fmtMoney(grandTotal);
    }

    window.recalculateInvoiceTotals = function() {
        const body = document.getElementById('bm-services-body');
        if (!body) return;
        
        let newSubtotal = 0;
        const rows = body.querySelectorAll('tr');
        rows.forEach(tr => {
            const cb = tr.querySelector('.invoice-row-checkbox');
            if (!cb) return;
            if (cb.checked) {
                tr.style.opacity = '1';
                const totalText = tr.children[3].textContent.replace(/[^0-9.-]+/g, '');
                newSubtotal += parseFloat(totalText) || 0;
            } else {
                tr.style.opacity = '0.4';
            }
        });
        
        const taxPctDisplay = document.getElementById('bm-tax-pct-display');
        let taxPct = 0;
        if (taxPctDisplay && taxPctDisplay.parentElement.style.display !== 'none') {
            const rawPct = taxPctDisplay.textContent.replace('%', '').trim();
            taxPct = parseFloat(rawPct) || 0;
        }
        
        const newTax = (newSubtotal * taxPct) / 100;
        const newGrandTotal = newSubtotal + newTax;
        
        const subEl = document.getElementById('bm-subtotal');
        if (subEl) subEl.textContent = window.fmtMoney ? window.fmtMoney(newSubtotal) : '$' + newSubtotal.toFixed(2);
        
        const taxAmtEl = document.getElementById('bm-tax-amt');
        if (taxAmtEl) taxAmtEl.textContent = window.fmtMoney ? window.fmtMoney(newTax) : '$' + newTax.toFixed(2);
        
        const totalEl = document.getElementById('bm-total');
        if (totalEl) totalEl.textContent = window.fmtMoney ? window.fmtMoney(newGrandTotal) : '$' + newGrandTotal.toFixed(2);
        
        // Also update bd-grand-total if it exists (for Master Invoice sending)
        const bdGrandTotal = document.getElementById('bd-grand-total');
        if (bdGrandTotal) bdGrandTotal.textContent = window.fmtMoney ? window.fmtMoney(newGrandTotal) : '$' + newGrandTotal.toFixed(2);
    };

    function addDetailRow(body, desc, qty, unitPrice) {
        const tr    = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        tr.style.transition = 'opacity 0.2s';
        const total = qty * unitPrice;
        tr.innerHTML = `
            <td style="padding:14px 15px;font-weight:600;color:#1e293b;display:flex;align-items:center;gap:10px;">
                <input type="checkbox" class="invoice-row-checkbox no-print-checkbox" checked onchange="window.recalculateInvoiceTotals()" style="cursor:pointer;width:16px;height:16px;accent-color:#1e40af;">
                <span>${desc}</span>
            </td>
            <td style="padding:14px 15px;text-align:center;color:#0f172a;">${qty}</td>
            <td style="padding:14px 15px;text-align:right;color:#0f172a;">${fmtMoney(unitPrice)}</td>
            <td style="padding:14px 15px;text-align:right;font-weight:800;color:#1e293b;" class="row-total-val">${fmtMoney(total)}</td>
        `;
        body.appendChild(tr);
    }

    // ── COMPANY SELECTOR ──────────────────────────────────────
    window.updateBillingCompany = function () {
        const sel  = document.getElementById('bm-company-selector');
        const disp = document.getElementById('bm-company-name-display');
        if (sel && disp) disp.textContent = sel.value;
    };

    // ── DOWNLOAD MASTER INVOICE PDF ───────────────────────────
    window.downloadBillingInvoicePDF = async function () {
        const btn = event.currentTarget;
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            const firstRow = window.currentBillingOrderRows && window.currentBillingOrderRows[0];
            // Check if this is a YARD INVOICE static trip
            const serviceMode = firstRow ? (firstRow[12] || '') : '';
            let isYardInvoice = false;
            try { const snap = JSON.parse(serviceMode); if (snap && snap.items) isYardInvoice = true; } catch(e) {}
            
            if (isYardInvoice) {
                const snap = JSON.parse(firstRow[12]);
                const customerName = firstRow[11] || 'Customer';
                const { html } = window.generateYardInvoiceHTML(snap.items, snap.dateFrom, snap.dateTo, false, null);
                const b64Pdf = await window.generateYardInvoiceBase64(html, customerName);
                const a = document.createElement('a');
                a.href = b64Pdf;
                a.download = `Yard_Invoice_${customerName}_${firstRow[5]}.pdf`;
                a.click();
            } else {
                const blob = await generateMasterInvoiceBlob();
                if (blob) {
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement('a');
                    const ord  = document.getElementById('bm-order-display')?.textContent || 'ORDER';
                    a.href     = url;
                    a.download = `Invoice_${ord}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }
            }
        } catch (e) {
            console.error(e);
            alert('Error generating PDF');
        } finally {
            btn.disabled  = false;
            btn.innerHTML = orig;
        }
    };

    // ── GENERATE MASTER INVOICE PDF BLOB ─────────────────────
    async function generateMasterInvoiceBlob() {
        const originalEl = document.getElementById('bm-invoice-preview');
        if (!originalEl) return null;

        // Create an off-screen container to ensure html2canvas can render it
        // even if the modal is hidden (display: none).
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:-9999px;top:0;width:860px;background:white;z-index:-1;';
        
        // Clone the preview element deeply
        const clone = originalEl.cloneNode(true);
        // Temporarily hide actions for PDF in the clone
        const actions = clone.querySelector('#bm-invoice-actions');
        if (actions) actions.style.display = 'none';

        // Remove unchecked rows from clone and hide checkboxes
        const cloneRows = clone.querySelectorAll('#bm-services-body tr');
        const originalRows = originalEl.querySelectorAll('#bm-services-body tr');
        
        for (let i = 0; i < originalRows.length; i++) {
            const cb = originalRows[i].querySelector('.invoice-row-checkbox');
            if (cb && !cb.checked) {
                if (cloneRows[i]) cloneRows[i].remove();
            } else {
                if (cloneRows[i]) {
                    const cloneCb = cloneRows[i].querySelector('.no-print-checkbox');
                    if (cloneCb) cloneCb.remove();
                }
            }
        }

        container.appendChild(clone);
        document.body.appendChild(container);

        // --- PAGE BREAK FIX ---
        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;
        const MARGIN_MM = 5;
        const USABLE_MM = A4_HEIGHT_MM - (MARGIN_MM * 2);
        const pxPerMm = 860 / A4_WIDTH_MM; 
        const usablePx = USABLE_MM * pxPerMm;

        const cloneRect = clone.getBoundingClientRect();
        const allRows = clone.querySelectorAll('table tr');
        let currentPage = 1;

        for (let i = 0; i < allRows.length; i++) {
            const tr = allRows[i];
            const trRect = tr.getBoundingClientRect();
            const trTop = trRect.top - cloneRect.top;
            const trBottom = trRect.bottom - cloneRect.top;
            
            // If the row spans across the page boundary
            if (trTop < currentPage * usablePx && trBottom > (currentPage * usablePx) + 2) { 
                const pushDown = (currentPage * usablePx) - trTop;
                const spacer = document.createElement('tr');
                spacer.style.height = pushDown + 'px';
                spacer.innerHTML = `<td colspan="10" style="border:none; padding:0;"></td>`;
                tr.parentNode.insertBefore(spacer, tr);
                currentPage++;
            } else if (trBottom > currentPage * usablePx) {
                // In case a row starts after the boundary but we missed the exact crossing
                currentPage = Math.ceil(trBottom / usablePx);
            }
        }
        // --- END PAGE BREAK FIX ---

        try {
            const { jsPDF } = window.jspdf;
            const canvas    = await html2canvas(clone, { scale: 1.2, useCORS: true, backgroundColor: '#ffffff' });
            const imgData   = canvas.toDataURL('image/jpeg', 0.7);

            const pdf      = new jsPDF('p', 'mm', 'a4');
            const pw       = pdf.internal.pageSize.getWidth();
            const imgW     = pw;
            const imgH     = (canvas.height * pw) / canvas.width;

            // Multi-page support
            const ph       = pdf.internal.pageSize.getHeight();
            const margin   = 5;
            const usable   = ph - margin * 2;

            if (imgH <= usable) {
                pdf.addImage(imgData, 'JPEG', 0, margin, imgW, imgH);
            } else {
                const pages = Math.ceil(imgH / usable);
                for (let pg = 0; pg < pages; pg++) {
                    if (pg > 0) pdf.addPage();
                    const yOffset = -(pg * usable) + margin;
                    pdf.addImage(imgData, 'JPEG', 0, yOffset, imgW, imgH);
                    pdf.setFillColor(255, 255, 255);
                    if (pg > 0) pdf.rect(0, 0, pw, margin, 'F');
                    const over = yOffset + imgH - ph + margin;
                    if (over > 0) pdf.rect(0, ph - margin, pw, margin + 1, 'F');
                }
            }

            return pdf.output('blob');
        } finally {
            document.body.removeChild(container);
        }
    }

    // Make it globally accessible for email-service
    window.generateMasterInvoiceBlob = generateMasterInvoiceBlob;

    // ── SEND EMAIL (3 PDFs) — routed through Guardian ────────
    // The actual implementation lives in invoice-automation.js (sendBillingEmailWithValidation).
    // This wrapper keeps backward compatibility with the HTML button onclick.
    window.sendBillingEmail = function () {
        if (window.sendBillingEmailWithValidation) {
            return window.sendBillingEmailWithValidation();
        }
        // Fallback if automation module hasn't loaded yet
        alert('Invoice automation module not loaded. Please refresh the page.');
    };

    // ── ACCOUNT STATEMENT (bulk summary for selected customer) ─
    window.downloadBillingStatement = async function (format, btnElement) {
        // Re-use logic similar to old downloadCustInvoiceSummary
        const table = document.getElementById('billing-center-table');
        if (!table) return;

        const btn = btnElement || (window.event ? window.event.currentTarget : null);
        const originalContent = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        }

        const customerSel  = document.getElementById('bc-f-customer');
        const customerName = customerSel ? customerSel.value || 'All Customers' : 'All Customers';

        const totalDueDisplay = document.getElementById('billing-total-due-display');
        const totalPending = totalDueDisplay ? parseFloat(totalDueDisplay.textContent.replace(/[^0-9.-]+/g,"")) : 0;

        const tableClone = table.cloneNode(true);
        tableClone.querySelectorAll('thead tr').forEach(tr => {
            const ths = tr.querySelectorAll('th');
            for (let i = ths.length - 1; i >= 14; i--) {
                if (ths[i]) ths[i].remove();
            }
        });
        tableClone.querySelectorAll('tbody tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            for (let i = tds.length - 1; i >= 14; i--) {
                if (tds[i]) tds[i].remove();
            }
        });

        const hiddenContainer = document.createElement('div');
        hiddenContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:1200px;background:white;padding:40px;';
        document.body.appendChild(hiddenContainer);
        
        try {
            if (format === 'IMAGE') {
                hiddenContainer.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1e293b;padding-bottom:20px;margin-bottom:30px;">
                        <div>
                            <h1 style="margin:0;color:#1e293b;font-size:2.2rem;font-weight:900;">ACCOUNT STATEMENT</h1>
                            <h3 style="margin:5px 0;color:#475569;text-transform:uppercase;">CUSTOMER: ${customerName}</h3>
                        </div>
                        <div style="text-align:right;">
                            <p style="margin:0;color:#64748b;font-weight:bold;">Date: ${new Date().toLocaleDateString()}</p>
                            <p style="margin:5px 0;font-weight:900;color:#1e40af;font-size:1.1rem;">RP TULIPAN TRANSPORT INC</p>
                        </div>
                    </div>
                `;
                hiddenContainer.appendChild(tableClone);

                const footer = document.createElement('div');
                footer.style.cssText = 'margin-top:40px;text-align:right;border-top:3px solid #1e293b;padding-top:20px;';
                footer.innerHTML = `
                    <h2 style="margin:0;color:#1e293b;font-size:1.8rem;font-weight:900;">TOTAL BALANCE DUE: <span style="color:#dc2626;">${fmtMoney(totalPending)}</span></h2>
                    <p style="margin-top:15px;font-size:0.9rem;color:#475569;font-style:italic;font-weight:bold;">Please process payment at your earliest convenience. Thank you for your business!</p>
                `;
                hiddenContainer.appendChild(footer);

                const canvas = await html2canvas(hiddenContainer, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
                const url = canvas.toDataURL('image/png');
                const a   = document.createElement('a');
                a.href     = url;
                a.download = `Statement_${customerName.replace(/\s+/g, '_')}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

            } else if (format === 'PDF') {
                // Must append to DOM for jspdf-autotable to read computed styles
                hiddenContainer.appendChild(tableClone);
                
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('l', 'mm', 'a4');
                
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(22);
                pdf.setTextColor(30, 41, 59);
                pdf.text("ACCOUNT STATEMENT", 14, 20);
                
                pdf.setFontSize(12);
                pdf.setTextColor(71, 85, 105);
                pdf.text(`CUSTOMER: ${customerName}`.toUpperCase(), 14, 28);
                
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(10);
                pdf.setTextColor(100, 116, 139);
                pdf.text(`Date: ${new Date().toLocaleDateString()}`, 283, 20, { align: 'right' });
                
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(14);
                pdf.setTextColor(220, 38, 38);
                pdf.text("RP TULIPAN TRANSPORT INC", 283, 26, { align: 'right' });
                
                pdf.autoTable({
                    html: tableClone,
                    startY: 35,
                    theme: 'grid',
                    styles: { fontSize: 7, cellPadding: 2, textColor: [0, 0, 0], fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.3 },
                    headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.3 },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                });
                
                let finalY = (pdf.lastAutoTable && pdf.lastAutoTable.finalY) ? pdf.lastAutoTable.finalY + 15 : 45;
                if (finalY > pdf.internal.pageSize.getHeight() - 25) {
                    pdf.addPage();
                    finalY = 20;
                }
                
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(16);
                pdf.setTextColor(30, 41, 59);
                pdf.text(`TOTAL BALANCE DUE: `, 240, finalY, { align: 'right' });
                pdf.setTextColor(220, 38, 38);
                pdf.text(`${fmtMoney(totalPending)}`, 283, finalY, { align: 'right' });
                
                pdf.setFont("helvetica", "italic");
                pdf.setFontSize(9);
                pdf.setTextColor(71, 85, 105);
                pdf.text("Please process payment at your earliest convenience. Thank you for your business!", 283, finalY + 8, { align: 'right' });
                
                pdf.save(`Statement_${customerName.replace(/\s+/g, '_')}.pdf`);
            }
        } catch (err) {
            console.error('Error generating statement:', err);
            alert('Error generating statement: ' + err.message);
        } finally {
            if (document.body.contains(hiddenContainer)) {
                document.body.removeChild(hiddenContainer);
            }
            if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
        }
    };


    // Expose renderBillingDetailModal globally so the automation engine
    // can silently populate the invoice preview before generating PDFs
    window.renderBillingDetailModalForRow = function(rows, orderNo) {
        renderBillingDetailModal(rows, orderNo);
    };

    // ── MARK AS PAID DIRECTLY ─────────────────────────────────
    window.markBillingRowAsPaid = async function(globalIdx, btn) {
        const trips = window.combinedBillingTrips || [];
        const row = trips[globalIdx];
        if (!row) return;

        const tripId = row[0];
        
        // Handle virtual rental row
        if (tripId && tripId.startsWith('VIRTUAL_RENTAL_')) {
            const rentalId = tripId.replace('VIRTUAL_RENTAL_', '');
            if (typeof window.triggerRentalPaymentForBilling === 'function') {
                window.triggerRentalPaymentForBilling(rentalId);
            } else {
                alert("Rental payment function is not available.");
            }
            return;
        }

        const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        if (!tripId || !isUUID(tripId)) {
            alert("No se puede marcar como pagado. ID inválido.");
            return;
        }

        const confirmPay = confirm(`¿Marcar la orden ${row[5]} como totalmente PAGADA?`);
        if (!confirmPay) return;

        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            // ── AUTOMATIC CASH LEDGER FOR YARD INVOICES ──
            // If this is a Yard Invoice that was saved as Pending but has a payment intent
            let yardSnap = null;
            try {
                if (row[12] && typeof row[12] === 'string' && row[12].startsWith('{')) {
                    yardSnap = JSON.parse(row[12]);
                }
            } catch(e) {}
            
            if (yardSnap && yardSnap.paymentMethod && yardSnap.paymentMethod !== 'pending' && window.logCashTransaction) {
                const pMethod = yardSnap.paymentMethod;
                const cVal = yardSnap.cashSplit || 0;
                const bVal = yardSnap.bankSplit || 0;
                const orderNoStr = (row[5] || '---').toString().toUpperCase();
                const desc = orderNoStr.startsWith('YRD-') ? `Pago Factura Storage - ${orderNoStr}` : `Pago Factura Yard - ${orderNoStr}`;
                const cust = row[11] || '';
                const tot  = parseFloat(row[13]) || 0;

                alert(`Debug: Logging to Cash Ledger -> Method: ${pMethod}, Amount: ${tot}`);

                if (pMethod === 'cash' || pMethod === 'bank') {
                    await window.logCashTransaction({ tipo: 'ingreso', metodo: pMethod, monto: tot, descripcion: desc, referencia: row[5], chofer: cust });
                } else if (pMethod === 'split') {
                    if (cVal > 0) await window.logCashTransaction({ tipo: 'ingreso', metodo: 'cash', monto: cVal, descripcion: `${desc} (Split Cash)`, referencia: row[5], chofer: cust });
                    if (bVal > 0) await window.logCashTransaction({ tipo: 'ingreso', metodo: 'bank', monto: bVal, descripcion: `${desc} (Split Bank)`, referencia: row[5], chofer: cust });
                }
            } else if (yardSnap && !yardSnap.paymentMethod) {
                alert('Debug: yardSnap found but NO paymentMethod present. Was this invoice created before the update?');
            } else if (!yardSnap) {
                alert('Debug: Not a yard invoice or no valid JSON found in row[12].');
            }
            // ── END AUTOMATIC CASH LEDGER ──

            // All rows now use the standard trip update path (including YARD INVOICE static rows)
            const updateData = {
                st_rate: 'PAID',
                st_sales: 'PAID',
                st_yard: 'PAID',
                st_tax: 'PAID',
                paid: true,
                invoice_sent: 'YES'
            };

            await window.updateTrip(tripId, updateData);

            // Update local state
            row[32] = 'PAID'; // st_rate
            row[33] = 'PAID'; // st_sales
            row[30] = 'PAID'; // st_yard
            row[52] = 'PAID'; // st_tax
            row[57] = 'YES';  // invoice_sent

            if (window.allTripsUnfiltered) {
                const ufRow = window.allTripsUnfiltered.find(t => t[0] === tripId);
                if (ufRow) {
                    ufRow[32] = 'PAID';
                    ufRow[33] = 'PAID';
                    ufRow[30] = 'PAID';
                    ufRow[52] = 'PAID';
                    ufRow[57] = 'YES';
                }
            }

            if (window.showToast) window.showToast('Marcado como pagado exitosamente', 'success');
            else alert('Marcado como pagado exitosamente');
            
            // Re-render billing table
            window.renderBillingTable();
        } catch (err) {
            console.error('Error marking as paid:', err);
            alert('Error al marcar como pagado.');
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    };

    // ── MARK ALL FILTERED AS PAID ─────────────────────────────
    window.markAllFilteredAsPaid = async function(btn) {
        // Find all pending rows in window.billingRows
        const pendingRows = (window.billingRows || []).filter(row => rowHasPendingPayment(row));
        
        if (pendingRows.length === 0) {
            alert('No hay órdenes pendientes en la vista filtrada actual.');
            return;
        }

        const regularRows = pendingRows.filter(row => {
            const hasTrans = row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0;
            const hasSales = row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0;
            const yardRate = parseFloat(row[13]) || 0;
            const takeTax  = row[49] === true || row[49] === 'true' || row[49] === 'YES' || row[49] === 'on' || row[49] === 1;
            
            if (hasTrans && row[32] !== 'PAID') return true;
            if (hasSales && row[33] !== 'PAID') return true;
            if (yardRate > 0.01 && row[30] !== 'PAID') return true;
            if (takeTax && row[52] !== 'PAID') return true;
            return false;
        });

        const rentRows = pendingRows.filter(row => {
            const hasRent  = (parseFloat(row[27]) || 0) > 0.01;
            if (hasRent && row[31] !== 'PAID') return true;
            return false;
        });

        const origHtml = btn.innerHTML;
        btn.disabled = true;

        try {
            // Process regular rows first if any
            if (regularRows.length > 0) {
                let totalBulkAmount = 0;
                for (const row of regularRows) {
                    const hasTrans = row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0;
                    const hasSales = row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0;
                    const yardRate = parseFloat(row[13]) || 0;
                    const takeTax  = row[49] === true || row[49] === 'true' || row[49] === 'YES' || row[49] === 'on' || row[49] === 1;
                    
                    const qty = parseFloat(row[21]) || 1;
                    
                    let totalTrans = 0, totalSales = 0, totalYard = 0;
                    if (hasTrans) totalTrans = parseFloat(row[18]) || 0;
                    if (hasSales) totalSales = (parseFloat(row[20]) || 0) * qty;
                    if (yardRate > 0) totalYard = yardRate;
                    
                    let rowSubtotalOwed = 0;
                    if (hasTrans && row[32] !== 'PAID') rowSubtotalOwed += totalTrans;
                    if (hasSales && row[33] !== 'PAID') rowSubtotalOwed += totalSales;
                    if (yardRate > 0.01 && row[30] !== 'PAID') rowSubtotalOwed += totalYard;
                    
                    let rowTaxOwed = 0;
                    if (takeTax && row[52] !== 'PAID') {
                        const taxPct = parseFloat(row[50]) || 0;
                        rowTaxOwed = ((totalTrans + totalSales + totalYard) * taxPct) / 100;
                    }
                    
                    totalBulkAmount += (rowSubtotalOwed + rowTaxOwed);
                }

                const confirmPay = confirm(`¿Estás seguro de cobrar los servicios regulares de las ${regularRows.length} órdenes?\nTotal a procesar (sin rentas): $${totalBulkAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
                
                if (confirmPay) {
                    let paymentSplit = null;
                    if (totalBulkAmount > 0 && typeof window.showSplitPaymentModal === 'function') {
                        paymentSplit = await window.showSplitPaymentModal(totalBulkAmount);
                        if (!paymentSplit) {
                            alert('Cobro regular cancelado por el usuario.');
                        }
                    } else if (totalBulkAmount > 0) {
                        paymentSplit = { cashAmt: totalBulkAmount, bankAmt: 0 };
                    }

                    if (paymentSplit) {
                        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
                        let updatedCount = 0;
                        for (const row of regularRows) {
                            const tripId = row[0];
                            const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
                            if (!tripId || (!row.isYardAggregate && !isUUID(tripId))) continue;

                            const updateData = {
                                st_rate: 'PAID',
                                st_sales: 'PAID',
                                st_yard: 'PAID',
                                st_tax: 'PAID',
                                paid: true,
                                invoice_sent: 'YES'
                            };

                            await window.updateTrip(tripId, updateData);

                            row[32] = 'PAID'; 
                            row[33] = 'PAID'; 
                            row[30] = 'PAID'; 
                            row[52] = 'PAID'; 
                            row[57] = 'YES'; 

                            if (window.allTripsUnfiltered) {
                                const ufRow = window.allTripsUnfiltered.find(t => t[0] === tripId);
                                if (ufRow) {
                                    ufRow[32] = 'PAID';
                                    ufRow[33] = 'PAID';
                                    ufRow[30] = 'PAID';
                                    ufRow[52] = 'PAID';
                                    ufRow[57] = 'YES'; 
                                }
                            }
                            updatedCount++;
                        }
                        
                        if (paymentSplit && window.logCashTransaction) {
                            const desc = `Pago Masivo Billing - ${regularRows.length} ordenes (Serv. Regulares)`;
                            const cust = regularRows.length > 0 ? (regularRows[0][11] || 'Varios') : '';
                            const orderNumbers = regularRows.map(r => r[5] || 'S/N').join(', ');
                            const refText = orderNumbers.length > 100 ? orderNumbers.substring(0, 97) + '...' : orderNumbers;
                            
                            if (paymentSplit.cashAmt > 0) await window.logCashTransaction({ tipo: 'ingreso', metodo: 'cash', monto: paymentSplit.cashAmt, descripcion: `${desc} [Cash]`, referencia: refText, chofer: cust });
                            if (paymentSplit.bankAmt > 0) await window.logCashTransaction({ tipo: 'ingreso', metodo: 'bank', monto: paymentSplit.bankAmt, descripcion: `${desc} [Bank]`, referencia: refText, chofer: cust });
                        }

                        if (window.showToast) window.showToast(`${updatedCount} órdenes regulares cobradas`, 'success');
                    }
                }
            }

            // After regular processing, if there are rents, open Assistant
            if (rentRows.length > 0) {
                if (typeof window.openMultiRentModal === 'function') {
                    window.openMultiRentModal(rentRows);
                } else {
                    alert('Asistente de rentas no disponible.');
                }
            } else {
                window.renderBillingTable();
            }

        } catch (err) {
            console.error('Error marking bulk as paid:', err);
            alert('Hubo un error al marcar algunas órdenes como pagadas.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    };

    window.pendingMultiRentals = [];

    window.openMultiRentModal = function(rentRows) {
        window.pendingMultiRentals = [];
        const tbody = document.getElementById('multi-rent-table-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        // Extract rentals
        for (const row of rentRows) {
            const tripId = row[0] || '';
            let rentalId = null;
            if (tripId.startsWith('VIRTUAL_RENTAL_')) {
                rentalId = tripId.replace('VIRTUAL_RENTAL_', '');
            } else if (row.isActiveRentalMerged) {
                rentalId = row.isActiveRentalMerged;
            }
            
            if (rentalId) {
                const rental = (window.currentRentals || []).find(r => String(r.id) === String(rentalId));
                if (rental) {
                    window.pendingMultiRentals.push({
                        row: row,
                        rental: rental,
                        basePrice: parseFloat(rental.base_price) || 0,
                        periodsToPay: 0,
                        subtotal: 0
                    });
                }
            }
        }
        
        if (window.pendingMultiRentals.length === 0) {
            alert('No se encontraron rentas válidas activas en la selección.');
            window.renderBillingTable();
            return;
        }
        
        window.pendingMultiRentals.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-weight:600;">${item.rental.container_no || 'N/A'}</td>
                <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#475569;">${item.rental.customer_name || 'N/A'}</td>
                <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#10b981;font-weight:700;text-align:center;">$${item.basePrice.toLocaleString('en-US', {minimumFractionDigits:2})} / ${item.rental.time_rent || 'month'}</td>
                <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;">
                    <input type="number" min="0" value="0" style="width:60px;padding:5px;border-radius:5px;border:1px solid #cbd5e1;text-align:center;" oninput="window.updateMultiRentSubtotal(${index}, this.value)">
                </td>
                <td id="mrt-subtotal-${index}" style="padding:10px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-weight:800;text-align:right;">$0.00</td>
            `;
            tbody.appendChild(tr);
        });
        
        window.updateMultiRentGrandTotal();
        
        const modal = document.getElementById('multi-rent-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden'; // prevent bg scroll
        }
    };

    window.updateMultiRentSubtotal = function(index, value) {
        const item = window.pendingMultiRentals[index];
        if (!item) return;
        
        const periods = parseInt(value, 10) || 0;
        item.periodsToPay = Math.max(0, periods);
        item.subtotal = item.periodsToPay * item.basePrice;
        
        const td = document.getElementById(`mrt-subtotal-${index}`);
        if (td) td.textContent = `$${item.subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        
        window.updateMultiRentGrandTotal();
    };

    window.updateMultiRentGrandTotal = function() {
        let total = 0;
        window.pendingMultiRentals.forEach(item => {
            total += item.subtotal;
        });
        const gt = document.getElementById('multi-rent-grand-total');
        if (gt) gt.textContent = `$${total.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    };

    window.processMultiRentPayments = async function() {
        const itemsToPay = window.pendingMultiRentals.filter(item => item.periodsToPay > 0);
        
        if (itemsToPay.length === 0) {
            alert('No has indicado ningún periodo a cobrar.');
            return;
        }
        
        let totalAmount = 0;
        itemsToPay.forEach(item => totalAmount += item.subtotal);
        
        const confirmPay = confirm(`¿Estás seguro de procesar el pago de ${itemsToPay.length} rentas por un total de $${totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}?`);
        if (!confirmPay) return;
        
        let paymentSplit = null;
        if (totalAmount > 0 && typeof window.showSplitPaymentModal === 'function') {
            paymentSplit = await window.showSplitPaymentModal(totalAmount);
            if (!paymentSplit) {
                alert('Operación cancelada.');
                return;
            }
        } else if (totalAmount > 0) {
            paymentSplit = { cashAmt: totalAmount, bankAmt: 0 };
        }
        
        const btn = document.querySelector('#multi-rent-modal .glossy-green-btn');
        let origHtml = '';
        if (btn) {
            origHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        }
        
        try {
            for (const item of itemsToPay) {
                const row = item.rental;
                const periods = item.periodsToPay;
                
                const sDate = row.final_date ? new Date(row.final_date) : new Date(row.start_date || new Date());
                
                if (row.time_rent === 'monthly') {
                    sDate.setMonth(sDate.getMonth() + periods);
                } else if (row.time_rent === 'weekly') {
                    sDate.setDate(sDate.getDate() + (7 * periods));
                } else if (row.time_rent === 'diary') {
                    sDate.setDate(sDate.getDate() + (1 * periods));
                }
                
                const newFinalDateStr = sDate.toISOString().split('T')[0];
                
                const todayStr = new Date().toISOString().split('T')[0];
                const todayMs = new Date(todayStr).getTime();
                const newFinalDateMs = new Date(newFinalDateStr).getTime();
                
                const isPaidUp = newFinalDateMs > todayMs;
                const newPaymentStatus = isPaidUp ? 'PAID' : 'PENDING';
                
                const payload = {
                    final_date: newFinalDateStr,
                    payment_status: newPaymentStatus
                };
                
                const { data, error } = await db.from('rentals').update(payload).eq('id', row.id).select();
                if (error) throw error;
                
                const resultData = data[0];
                const idx = window.currentRentals.findIndex(r => r.id === row.id);
                if (idx !== -1) window.currentRentals[idx] = resultData;
            }
            
            if (paymentSplit && window.logCashTransaction) {
                const desc = `Pago Masivo de Rentas - ${itemsToPay.length} Contenedores`;
                const orderNumbers = itemsToPay.map(i => i.rental.container_no || 'S/N').join(', ');
                const refText = orderNumbers.length > 100 ? orderNumbers.substring(0, 97) + '...' : orderNumbers;
                
                if (paymentSplit.cashAmt > 0) {
                    await window.logCashTransaction({ tipo: 'ingreso', metodo: 'cash', monto: paymentSplit.cashAmt, descripcion: `${desc} [Cash]`, referencia: refText, chofer: 'Varios' });
                }
                if (paymentSplit.bankAmt > 0) {
                    await window.logCashTransaction({ tipo: 'ingreso', metodo: 'bank', monto: paymentSplit.bankAmt, descripcion: `${desc} [Bank]`, referencia: refText, chofer: 'Varios' });
                }
            }
            
            if (window.showToast) window.showToast(`Se cobraron ${itemsToPay.length} rentas exitosamente`, 'success');
            else alert(`Se cobraron ${itemsToPay.length} rentas exitosamente`);
            
            document.getElementById('multi-rent-modal').style.display = 'none';
            document.body.style.overflow = '';
            window.renderBillingTable();
            
        } catch (err) {
            console.error('Error in multi rent payment:', err);
            alert('Hubo un error al procesar algunas rentas: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    };

    // Force default payment filter to 'pending' on load to prevent browser cache issues
    document.addEventListener('DOMContentLoaded', () => {
        const paymentFilter = document.getElementById('bc-f-payment');
        if (paymentFilter) {
            paymentFilter.value = 'pending';
        }
    });

})();

