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
                    
                    let dynStatus = (rental.payment_status || 'PEND').trim().toUpperCase();
                    if (rental.final_date) {
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        const finalDateObj = new Date(rental.final_date);
                        finalDateObj.setHours(0,0,0,0);
                        if (dynStatus === 'PAID' && today >= finalDateObj) {
                            dynStatus = 'PEND';
                        }
                    } else {
                        dynStatus = 'PEND';
                    }
                    
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
                        origTrip[31] = dynStatus === 'PAID' ? 'PAID' : 'PEND';
                        origTrip.isActiveRentalMerged = rental.id;
                    } else {
                        const virtualRow = new Array(80).fill('');
                        virtualRow[0] = 'VIRTUAL_RENTAL_' + rental.id;
                        virtualRow[1] = rental.final_date && rental.final_date !== '---' ? rental.final_date : rental.start_date;
                        virtualRow[2] = rental.size;
                        virtualRow[3] = rental.container_no;
                        virtualRow[4] = '---'; // Leave Releases blank to avoid confusion
                        virtualRow[5] = rental.release_no && rental.release_no !== '---' ? rental.release_no : ('RENTAL-' + (rental.container_no || '---'));
                        virtualRow[6] = '---';
                        virtualRow[8] = rental.delivery_place || '---';
                        virtualRow[11] = rental.customer_name;
                        virtualRow[27] = rentDebt.toFixed(2);
                        virtualRow[31] = dynStatus === 'PAID' ? 'PAID' : 'PEND';
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
        const bookings   = new Set();
        const services   = new Set();

        const fOrder    = (document.getElementById('bc-f-order')?.value    || '').toLowerCase().trim();
        const fBooking  = (document.getElementById('bc-f-booking')?.value  || '').trim();
        const fCity     = (document.getElementById('bc-f-city')?.value     || '').trim();
        const fPlace    = (document.getElementById('bc-f-place')?.value    || '').trim();
        const fCustomer = (document.getElementById('bc-f-customer')?.value || '').trim();
        const fDriver   = (document.getElementById('bc-f-driver')?.value   || '').trim();
        const fService  = (document.getElementById('bc-f-service')?.value  || '').trim();
        const fRelease  = (document.getElementById('bc-f-release')?.value  || '').trim();
        const fFrom     = document.getElementById('bc-f-from')?.value || '';
        const fTo       = document.getElementById('bc-f-to')?.value   || '';
        const fPayment  = (document.getElementById('bc-f-payment')?.value || 'all').toLowerCase();
        const fDebt     = (document.getElementById('bc-f-debt')?.value || 'unpaid').toLowerCase();

        (window.combinedBillingTrips || []).forEach(row => {
            const status = (row[41] || '').toUpperCase();
            if (!(status === 'COMPLETE' || status === 'DELIVERED' || status === 'PAID')) return;

            if (fDebt === 'unpaid' && !rowHasPendingPayment(row)) return;

            const isPending = rowHasPendingPayment(row);
            
            const orderNo  = (row[5]  || '').toString().toLowerCase();
            const city     = (row[6]  || '').toString().trim();
            const place    = (row[8]  || '').toString().trim();
            const customer = (row[11] || '').toString().trim();
            const driver   = (row[17] || '').toString().trim();
            const release  = (row[4]  || '---').toString().trim();
            const booking  = (row[65] && row[65] !== '---') ? row[65].toString().trim() : '';
            const rowDate  = row[1]   || '';
            const invSent  = (row[57] || 'NO').toUpperCase();

            const orderNoUpper = (row[5] || '---').toString().toUpperCase();
            const isYardStorage = orderNoUpper.startsWith('YRD-');
            
            const hasTrans = (parseFloat(row[18]) || 0) > 0.01;
            const hasSales = (parseFloat(row[20]) || 0) > 0.01;
            const hasYard  = !isYardStorage ? (parseFloat(row[13]) || 0) > 0.01 : false;
            const hasStorage = isYardStorage ? (parseFloat(row[13]) || 0) > 0.01 : (parseFloat(row[14]) || 0) > 0.01;
            const hasRent  = (parseFloat(row[27]) || 0) > 0.01;
            const isRentService = (row[26] || '').toString().toUpperCase().includes('RENT') || (row[0] || '').toString().startsWith('VIRTUAL_RENTAL') || row.isActiveRentalMerged !== undefined;

            let activeServicesFilter = [];
            if (row[42] === 'YES' && hasTrans) activeServicesFilter.push('TRANSPORT');
            if (hasYard) activeServicesFilter.push('YARD');
            if (row[43] === 'YES' && hasSales) activeServicesFilter.push('SALES');
            if (hasStorage) activeServicesFilter.push('STORAGE');
            if (hasRent && isRentService) activeServicesFilter.push('RENT');

            let invoiced = row[75] ? String(row[75]).split(',') : [];
            if (row[57] === 'YES' && invoiced.length === 0) invoiced = activeServicesFilter.slice();

            let invBadgeStatus = 'pending';
            if (activeServicesFilter.length > 0) {
                let allInvoiced = activeServicesFilter.every(s => invoiced.includes(s));
                let someInvoiced = activeServicesFilter.some(s => invoiced.includes(s));
                if (allInvoiced) invBadgeStatus = 'sent';
                else if (someInvoiced) invBadgeStatus = 'partial';
            } else if (row[57] === 'YES') {
                invBadgeStatus = 'sent';
            }

            // Check fixed text/date filters
            if (fPayment !== 'all' && fPayment !== invBadgeStatus) return;
            if (fOrder && !orderNo.includes(fOrder)) return;
            if (fFrom && rowDate < fFrom) return;
            if (fTo && rowDate > fTo) return;

            const passService = !fService || 
                                (fService === 'TRANSPORT' && hasTrans) ||
                                (fService === 'SALES' && hasSales) ||
                                (fService === 'YARD' && hasYard) ||
                                (fService === 'STORAGE' && hasStorage) ||
                                (fService === 'RENT' && hasRent && isRentService);

            const passCity = !fCity || city === fCity;
            const passPlace = !fPlace || place === fPlace;
            const passCustomer = !fCustomer || customer === fCustomer;
            const passDriver = !fDriver || driver === fDriver;
            const passRelease = !fRelease || release === fRelease;
            const passBooking = !fBooking || booking === fBooking;

            if (passPlace && passCustomer && passDriver && passRelease && passBooking && passService && city && city !== '---') cities.add(city);
            if (passCity && passCustomer && passDriver && passRelease && passBooking && passService && place && place !== '---') places.add(place);
            if (passCity && passPlace && passDriver && passRelease && passBooking && passService && customer && customer !== '---') customers.add(customer);
            if (passCity && passPlace && passCustomer && passRelease && passBooking && passService && driver && driver !== '---') drivers.add(driver);
            if (passCity && passPlace && passCustomer && passDriver && passBooking && passService && release && release !== '---') releases.add(release);
            if (passCity && passPlace && passCustomer && passDriver && passRelease && passService && booking && booking !== '---') bookings.add(booking);
            
            if (passCity && passPlace && passCustomer && passDriver && passRelease && passBooking) {
                if (hasTrans) services.add('TRANSPORT');
                if (hasSales) services.add('SALES');
                if (hasYard) services.add('YARD');
                if (hasStorage) services.add('STORAGE');
                if (hasRent && isRentService) services.add('RENT');
            }
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

        fill('bc-f-booking',  bookings,  'All Bookings');
        fill('bc-f-city',     cities,    'All Cities');
        fill('bc-f-place',    places,    'All Places');
        fill('bc-f-customer', customers, 'All Customers');
        fill('bc-f-driver',   drivers,   'All Drivers');
        fill('bc-f-release',  releases,  'All Releases');
        fill('bc-f-service',  services,  'All Services');
    };

    // ── RENDER MAIN TABLE ─────────────────────────────────────
    window.renderBillingTable = function () {
        const body = document.getElementById('billing-table-body');
        if (!body) return;

        window.populateBillingFilters();

        const fOrder    = (document.getElementById('bc-f-order')?.value    || '').toLowerCase().trim();
        const fBooking  = (document.getElementById('bc-f-booking')?.value  || '').trim();
        const fCity     = (document.getElementById('bc-f-city')?.value     || '').trim();
        const fPlace    = (document.getElementById('bc-f-place')?.value    || '').trim();
        const fCustomer = (document.getElementById('bc-f-customer')?.value || '').trim();
        const fDriver   = (document.getElementById('bc-f-driver')?.value   || '').trim();
        const fService  = (document.getElementById('bc-f-service')?.value || '').trim();
        const fRelease  = (document.getElementById('bc-f-release')?.value || '').trim();
        const fFrom     = document.getElementById('bc-f-from')?.value || '';
        const fTo       = document.getElementById('bc-f-to')?.value   || '';
        const fPayment  = (document.getElementById('bc-f-payment')?.value || 'all').toLowerCase();
        const fDebt     = (document.getElementById('bc-f-debt')?.value || 'unpaid').toLowerCase();

        const filtered = (window.combinedBillingTrips || []).filter(row => {
            const status = (row[41] || '').toUpperCase();
            if (!(status === 'COMPLETE' || status === 'DELIVERED' || status === 'PAID')) return false;

            if (fDebt === 'unpaid' && !rowHasPendingPayment(row)) return false;

            const orderNo  = (row[5]  || '').toString().toLowerCase();
            const city     = (row[6]  || '').toString().trim();
            const place    = (row[8]  || '').toString().trim();
            const customer = (row[11] || '').toString().trim();
            const driver   = (row[17] || '').toString().trim();
            const release  = (row[4]  || '---').toString().trim();
            const booking  = (row[65] && row[65] !== '---') ? row[65].toString().trim() : '';
            const rowDate  = row[1]   || '';
            const invSent  = (row[57] || 'NO').toUpperCase();
            const orderNoUpper = (row[5] || '---').toString().toUpperCase();
            const isYardStorage = orderNoUpper.startsWith('YRD-');
            
            const hasTrans = (parseFloat(row[18]) || 0) > 0.01;
            const hasSales = (parseFloat(row[20]) || 0) > 0.01;
            const hasYard  = !isYardStorage ? (parseFloat(row[13]) || 0) > 0.01 : false;
            const hasStorage = isYardStorage ? (parseFloat(row[13]) || 0) > 0.01 : (parseFloat(row[14]) || 0) > 0.01;
            const hasRent  = (parseFloat(row[27]) || 0) > 0.01;
            const isRentService = (row[26] || '').toString().toUpperCase().includes('RENT') || (row[0] || '').toString().startsWith('VIRTUAL_RENTAL') || row.isActiveRentalMerged !== undefined;

            if (fOrder    && !orderNo.includes(fOrder))    return false;
            if (fBooking  && booking !== fBooking)         return false;
            if (fCity     && city     !== fCity)            return false;
            if (fPlace    && place    !== fPlace)           return false;
            if (fCustomer && customer !== fCustomer)        return false;
            if (fDriver   && driver   !== fDriver)          return false;
            if (fRelease  && release  !== fRelease)         return false;

            if (fService === 'TRANSPORT' && !hasTrans)      return false;
            if (fService === 'SALES'     && !hasSales)      return false;
            if (fService === 'YARD'      && !hasYard)       return false;
            if (fService === 'STORAGE'   && !hasStorage)    return false;
            if (fService === 'RENT'      && (!hasRent || !isRentService)) return false;
            if (fFrom     && rowDate  < fFrom)              return false;
            if (fTo       && rowDate  > fTo)                return false;

            let activeServicesFilter = [];
            if (row[42] === 'YES' && hasTrans) activeServicesFilter.push('TRANSPORT');
            if (hasYard) activeServicesFilter.push('YARD');
            if (row[43] === 'YES' && hasSales) activeServicesFilter.push('SALES');
            if (hasStorage) activeServicesFilter.push('STORAGE');
            if (hasRent && isRentService) activeServicesFilter.push('RENT');

            let invoiced = row[75] ? String(row[75]).split(',') : [];
            if (row[57] === 'YES' && invoiced.length === 0) invoiced = activeServicesFilter.slice();

            let invBadgeStatus = 'pending';
            if (activeServicesFilter.length > 0) {
                let allInvoiced = activeServicesFilter.every(s => invoiced.includes(s));
                let someInvoiced = activeServicesFilter.some(s => invoiced.includes(s));
                if (allInvoiced) invBadgeStatus = 'sent';
                else if (someInvoiced) invBadgeStatus = 'partial';
            } else if (row[57] === 'YES') {
                invBadgeStatus = 'sent';
            }

            if (fPayment !== 'all' && fPayment !== invBadgeStatus) return false;

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
            const qty = parseInt(row[53]) || 1;
            let totalTrans = (parseFloat(row[18]) || 0) * qty;
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
                        const costInfo = window.calculateRentalCost(rental.start_date, rental.final_date, rental.base_price, rental.daily_rate, rental.status, rental.time_rent, null, null);
                        totalRent = (row[31] === 'PAID') ? 0 : costInfo.total;
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

            // Calculate which services are active
            let activeServices = [];
            if (row[42] === 'YES' && totalTrans > 0) activeServices.push('TRANSPORT');
            if (totalYard > 0) activeServices.push('YARD');
            if (row[43] === 'YES' && totalSales > 0) activeServices.push('SALES');
            if (totalStorage > 0) activeServices.push('STORAGE');
            if (totalRent > 0) activeServices.push('RENT');

            let invoiced = row[75] ? String(row[75]).split(',') : [];
            if (row[57] === 'YES' && invoiced.length === 0) invoiced = activeServices.slice();

            let invBadgeStatus = 'PENDING';
            if (activeServices.length > 0) {
                let allInvoiced = activeServices.every(s => invoiced.includes(s));
                let someInvoiced = activeServices.some(s => invoiced.includes(s));
                if (allInvoiced) invBadgeStatus = 'SENT';
                else if (someInvoiced) invBadgeStatus = 'PARTIAL';
            } else if (row[57] === 'YES') {
                invBadgeStatus = 'SENT';
            }

            let invBadge = '';
            if (invBadgeStatus === 'SENT') {
                invBadge = `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:0.68rem;font-weight:800;">SENT ✓</span>`;
            } else if (invBadgeStatus === 'PARTIAL') {
                invBadge = `<span style="background:#ffedd5;color:#c2410c;padding:2px 8px;border-radius:12px;font-size:0.68rem;font-weight:800;">PARTIAL</span>`;
            } else {
                invBadge = `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:12px;font-size:0.68rem;font-weight:800;">PENDING</span>`;
            }

            let rowBg = '#fee2e2'; // PENDING = RED
            if (invBadgeStatus === 'SENT') rowBg = '#dcfce7'; // SENT = GREEN
            else if (invBadgeStatus === 'PARTIAL') rowBg = '#ffedd5'; // PARTIAL = ORANGE

            const cs     = 'padding: 11px 13px; border-bottom: 1px solid #e2e8f0; text-align: center; vertical-align: middle; font-weight: 700; color: #0f172a;';
            
            const fmtSrv = (amt, isInv, defaultColor) => {
                if (amt <= 0) return '';
                if (isInv) return `<span style="color:#2563eb;font-weight:900;" title="Invoice sent for this service">${fmtMoney(amt)} <i class="fas fa-check-circle" style="font-size:0.75rem;"></i></span>`;
                return `<span style="color:${defaultColor};">${fmtMoney(amt)}</span>`;
            };

            const htmlYard = fmtSrv(totalYard, invoiced.includes('YARD'), '#f59e0b');
            const htmlTrans = fmtSrv(totalTrans, invoiced.includes('TRANSPORT'), '#1e40af');
            const htmlSales = fmtSrv(totalSales, invoiced.includes('SALES'), '#10b981');
            const htmlStorage = fmtSrv(totalStorage, invoiced.includes('STORAGE'), '#e11d48');
            const htmlRent = fmtSrv(totalRent, invoiced.includes('RENT'), '#7c3aed');

            // Validation badge (Guardian check)
            const validBadge = window.getInvoiceValidationBadge
                ? window.getInvoiceValidationBadge(row)
                : '';

            // Last sent / reminder count info
            const lastSentDate = row[63];
            const reminderCount = parseInt(row[64]) || 0;
            let lastSentText = '—';
            if (lastSentDate) {
                const dateObj = new Date(lastSentDate);
                const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dd = String(dateObj.getDate()).padStart(2, '0');
                const yyyy = dateObj.getFullYear();
                lastSentText = `${mm}/${dd}/${yyyy}`;
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
                <td style="${cs} width:40px; text-align:center;">
                    <input type="checkbox" class="billing-row-checkbox" checked data-global-idx="${globalIdx}" style="cursor:pointer; transform:scale(1.2);" onclick="event.stopPropagation();">
                </td>
                <td style="${cs}">${displayDate}</td>
                <td style="${cs}">${orderNo}</td>
                <td style="${cs}">${nCont}</td>
                <td style="${cs}">${bookingNo}</td>
                <td style="${cs}">${release}</td>
                <td style="${cs}">${customer}</td>
                <td style="${cs}">${city}</td>
                <td style="${cs} white-space:normal; min-width:130px; text-align:left;">${place}</td>
                <td style="display:none; ${cs}">${driverName}</td>
                <td style="${cs}">${htmlYard}</td>
                <td style="${cs}">${htmlTrans}</td>
                <td style="${cs}">${htmlSales}</td>
                <td style="${cs}">${htmlStorage}</td>
                <td style="${cs}">${htmlRent}</td>
                <td style="${cs} font-size:1rem; font-weight:900; color:#1e293b;">${fmtMoney(grandTotal)}</td>
                <td style="${cs}">${invBadge}</td>
                <td style="${cs}">${validBadge}</td>
                <td style="${cs} font-size:0.7rem; color:#475569;">${lastSentText}</td>
                <td style="${cs} text-align:center;">
                    <button onclick="previewSingleRowInvoice(${globalIdx})" title="Preview Invoice" style="background:#f1f5f9; border:none; border-radius:6px; padding:6px 10px; cursor:pointer; color:#0f4c8a; transition:background 0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                        <i class="fas fa-eye"></i>
                    </button>
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

        // Toggle Filtered Invoice Button
        const custInput = document.getElementById('bc-f-customer');
        const sendFilteredBtn = document.getElementById('btn-send-filtered-invoice');
        if (sendFilteredBtn) {
            if (custInput && custInput.value.trim() !== '') {
                sendFilteredBtn.style.display = 'inline-flex';
            } else {
                sendFilteredBtn.style.display = 'none';
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
        if (fPayment) fPayment.value = 'all';
        window.renderBillingTable();
    };

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
            for (let i = ths.length - 1; i >= 15; i--) {
                if (ths[i]) ths[i].remove();
            }
        });
        tableClone.querySelectorAll('tbody tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            for (let i = tds.length - 1; i >= 15; i--) {
                if (tds[i]) tds[i].remove();
            }
        });

        const hiddenContainer = document.createElement('div');
        hiddenContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:max-content;min-width:1800px;background:white;padding:40px;';
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

                const canvas = await html2canvas(hiddenContainer, { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 2200 });
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
                const pdf = new jsPDF({ compress: true, orientation: 'l', unit: 'mm', format: 'a4' });
                
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
                        periodsToPay: 1,
                        subtotal: parseFloat(rental.base_price) || 0
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
                    <input type="number" min="0" value="1" style="width:60px;padding:5px;border-radius:5px;border:1px solid #cbd5e1;text-align:center;" oninput="window.updateMultiRentSubtotal(${index}, this.value)">
                </td>
                <td id="mrt-subtotal-${index}" style="padding:10px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-weight:800;text-align:right;">$${item.subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
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

    // Force default payment filter to 'all' on load to prevent browser cache issues
    document.addEventListener('DOMContentLoaded', () => {
        const paymentFilter = document.getElementById('bc-f-payment');
        if (paymentFilter) {
            paymentFilter.value = 'all';
        }
    });


    // ── MASTER FILTERED INVOICE ───────────────────────────────
    window.toggleAllBillingRows = function(sourceCheckbox) {
        const checkboxes = document.querySelectorAll('.billing-row-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = sourceCheckbox.checked;
        });
    };

    window.openMasterBillingModal = function(overrideRows = null, overrideInvoiceNo = null, overrideCustomer = null) {
        let rows = overrideRows || window.billingRows || [];
        
        if (!overrideRows) {
            // Filter out unselected rows based on checkboxes
            const checkboxes = document.querySelectorAll('.billing-row-checkbox');
            if (checkboxes.length > 0) {
                const checkedIndices = Array.from(document.querySelectorAll('.billing-row-checkbox:checked')).map(cb => parseInt(cb.dataset.globalIdx, 10));
                rows = (window.combinedBillingTrips || []).filter((r, idx) => checkedIndices.includes(idx));
            }
        }

        if (rows.length === 0) {
            alert('No hay órdenes seleccionadas para facturar en la vista actual.');
            return;
        }
        
        window.currentBillingOrderRows = rows;

        const globalCustomer = document.getElementById('bc-f-customer')?.value;
        let customer = overrideCustomer || globalCustomer;
        let isSinglePreview = false;

        if (!customer && rows.length === 1) {
            customer = rows[0][11] || 'Unknown Customer';
            isSinglePreview = true;
        }

        if (!customer) {
            alert('Debe seleccionar un cliente específico para generar un invoice.');
            return;
        }

        const btnSend = document.getElementById('mb-btn-send-email');
        const btnPdf = document.getElementById('mb-btn-download-pdf');
        if (btnSend) btnSend.style.display = isSinglePreview ? 'none' : 'inline-flex';
        if (btnPdf) btnPdf.style.display = isSinglePreview ? 'none' : 'inline-block';

        document.getElementById('mb-bill-to-name').textContent = customer;
        document.getElementById('mb-date-display').textContent = new Date().toLocaleDateString('en-US');

        const fromDateStr = document.getElementById('bc-f-from')?.value;
        const toDateStr = document.getElementById('bc-f-to')?.value;
        const periodContainer = document.getElementById('mb-period-container');
        const periodDisplay = document.getElementById('mb-period-display');
        
        if (fromDateStr || toDateStr) {
            let pStr = '';
            if (fromDateStr && toDateStr) {
                const fD = new Date(fromDateStr + 'T00:00:00');
                const tD = new Date(toDateStr + 'T00:00:00');
                pStr = `From ${fD.toLocaleDateString('en-US')} to ${tD.toLocaleDateString('en-US')}`;
            } else if (fromDateStr) {
                const fD = new Date(fromDateStr + 'T00:00:00');
                pStr = `From ${fD.toLocaleDateString('en-US')}`;
            } else if (toDateStr) {
                const tD = new Date(toDateStr + 'T00:00:00');
                pStr = `Up to ${tD.toLocaleDateString('en-US')}`;
            }
            if(periodDisplay) periodDisplay.textContent = pStr;
            if(periodContainer) periodContainer.style.display = 'block';
        } else {
            if(periodContainer) periodContainer.style.display = 'none';
        }

        const uniqueContainers = new Set();
        rows.forEach(r => {
            const containerNo = (r[3] && r[3] !== '---') ? r[3].toString().trim().toUpperCase() : '';
            if (containerNo) uniqueContainers.add(containerNo);
        });
        const containersContainer = document.getElementById('mb-containers-container');
        const containersDisplay = document.getElementById('mb-containers-display');
        if (uniqueContainers.size > 0) {
            if (containersDisplay) containersDisplay.textContent = uniqueContainers.size;
            if (containersContainer) containersContainer.style.display = 'block';
        } else {
            if (containersContainer) containersContainer.style.display = 'none';
        }

        const custObj = (window.currentCustomers || []).find(c => c.name === customer);
        const custAddress = custObj && custObj.address ? custObj.address : '';
        document.getElementById('mb-bill-to-address').textContent = custAddress;

        let allSameLocations = true;
        let firstLocStr = null;
        let fromVal = 'N/A';
        let toVal = 'PICK UP';
        
        rows.forEach(r => {
            const f = (r[7] && r[7] !== '---') ? r[7].toString().trim() : 'N/A';
            const t = (r[8] && r[8] !== '---') ? r[8].toString().trim() : 'PICK UP';
            const locStr = `${f}_${t}`;
            if (firstLocStr === null) {
                firstLocStr = locStr;
                fromVal = f;
                toVal = t;
            } else if (locStr !== firstLocStr) {
                allSameLocations = false;
            }
        });

        document.getElementById('mb-service-from').textContent = allSameLocations ? fromVal : 'VARIOUS LOCATIONS';
        document.getElementById('mb-service-to').textContent = allSameLocations ? toVal : 'VARIOUS LOCATIONS';
        const tbody = document.getElementById('mb-services-container');
        tbody.innerHTML = '';
        let grandTotal = 0;
        let activeServices = 0;
        let prefix = 'INV';

        const fService = (document.getElementById('bc-f-service')?.value || '').trim();

        const serviceGroups = {
            TRANSPORT: {},
            YARD: {},
            SALES: {},
            STORAGE: {},
            RENT: {}
        };

        const addGroup = (srv, booking, unitCost, qty, total) => {
            const key = booking && booking !== '---' ? `B|${booking}|${unitCost}` : `NB|${unitCost}`;
            if (!serviceGroups[srv][key]) {
                serviceGroups[srv][key] = { booking: booking && booking !== '---' ? booking : null, unitCost, qty: 0, total: 0 };
            }
            serviceGroups[srv][key].qty += qty;
            serviceGroups[srv][key].total += total;
        };

        rows.forEach(r => {
            const orderNo = (r[5] || '').toString().toUpperCase();
            const bookingNo = (r[65] && r[65] !== '---') ? r[65].toString().trim() : '---';
            const containerNo = (r[3] && r[3] !== '---') ? r[3].toString().trim() : '---';
            const size = (r[2] && r[2] !== '---') ? r[2].toString().trim() : '';
            
            const f = (r[7] && r[7] !== '---') ? r[7].toString().trim() : 'N/A';
            const t = (r[8] && r[8] !== '---') ? r[8].toString().trim() : 'PICK UP';
            const locHtml = !allSameLocations ? `<br><span style="font-size:0.8rem;color:#475569;font-weight:normal;">(From: ${f} - To: ${t})</span>` : '';
            
            let grpSalesTrans = bookingNo !== '---' ? `Booking: ${bookingNo}` : '';
            if (size) grpSalesTrans += ` <span style="color:#64748b;">(${size})</span>`;
            grpSalesTrans += locHtml;
            
            let grpYardStorageRent = containerNo !== '---' ? `Container: ${containerNo}` : (orderNo ? `Order: ${orderNo}` : '');
            if (size) grpYardStorageRent += ` <span style="color:#64748b;">(${size})</span>`;
            grpYardStorageRent += locHtml;

            const isYardStorageRow = orderNo.startsWith('YRD-');

            let rYard = parseFloat(r[13]) || 0;
            let rTrans = parseFloat(r[18]) || 0;
            const rQty = parseInt(r[53]) || 1;
            let rSales = (parseFloat(r[20]) || 0) * rQty;

            let rStorage = 0;
            if (isYardStorageRow) {
                rStorage = rYard;
                rYard = 0;
            } else {
                const ppd = parseFloat(r[14]) || 0;
                if (ppd > 0) {
                    const entryDate = new Date(r[1]);
                    const exitDate = r[15] && r[15] !== '---' ? new Date(r[15]) : new Date();
                    const diffTime = Math.abs(exitDate - entryDate);
                    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                    rStorage = ppd * diffDays;
                }
            }

            let rRent = 0;
            const mrate = parseFloat(r[27]) || 0;
            if (mrate > 0) {
                const tripId = r[0] || '';
                let rentalId = null;
                if (tripId.startsWith('VIRTUAL_RENTAL_')) {
                    rentalId = tripId.replace('VIRTUAL_RENTAL_', '');
                } else if (r.isActiveRentalMerged) {
                    rentalId = r.isActiveRentalMerged;
                }
                if (rentalId) {
                    const rental = (window.currentRentals || []).find(rt => String(rt.id) === String(rentalId));
                    if (rental && window.calculateRentalCost) {
                        const costInfo = window.calculateRentalCost(rental.start_date, rental.final_date, rental.base_price, rental.daily_rate, rental.status, rental.time_rent, null, null);
                        rRent = (r[31] === 'PAID') ? 0 : costInfo.total;
                    } else {
                        rRent = mrate;
                    }
                } else {
                    const entryDate = new Date(r[1]);
                    const exitDate = r[15] && r[15] !== '---' ? new Date(r[15]) : new Date();
                    const diffDays = Math.ceil(Math.abs(exitDate - entryDate) / (1000 * 60 * 60 * 24));
                    const diffPeriods = Math.max(1, Math.ceil(diffDays / 30));
                    rRent = mrate * diffPeriods;
                }
            }

            if ((fService === '' || fService === 'TRANSPORT') && rTrans > 0 && r[42] === 'YES') {
                addGroup('TRANSPORT', grpSalesTrans, rTrans, rQty, rTrans * rQty);
            }
            if ((fService === '' || fService === 'YARD') && rYard > 0) {
                let parsed = false;
                const sizeHtml = size ? ` <span style="color:#64748b;">(${size})</span>` : '';
                if (r[12] && r[12] !== '---') {
                    try {
                        const services = JSON.parse(r[12]);
                        if (Array.isArray(services)) {
                            services.forEach(s => {
                                const baseDesc = (s.desc && s.desc.trim() !== '') ? s.desc.trim() : 'YARD SERVICE';
                                const price = parseFloat(s.price) || 0;
                                if (price > 0) {
                                    addGroup('YARD', baseDesc + sizeHtml + locHtml, price, rQty, price * rQty);
                                }
                            });
                            parsed = true;
                        }
                    } catch(e) {
                        // Not JSON, continue to fallback
                    }
                }
                if (!parsed) {
                    const yardServiceName = (r[12] && r[12] !== '---') ? r[12].toString().trim() : 'YARD SERVICE';
                    const uCost = rYard / rQty;
                    addGroup('YARD', yardServiceName + sizeHtml + locHtml, uCost, rQty, rYard);
                }
            }
            if ((fService === '' || fService === 'SALES') && rSales > 0 && r[43] === 'YES') {
                const uCost = rSales / rQty;
                addGroup('SALES', grpSalesTrans, uCost, rQty, rSales);
            }
            if ((fService === '' || fService === 'STORAGE') && rStorage > 0) {
                addGroup('STORAGE', grpYardStorageRent, rStorage, 1, rStorage);
            }
            if ((fService === '' || fService === 'RENT') && rRent > 0) {
                const sizeHtml = size ? ` <span style="color:#64748b;">(${size})</span>` : '';
                addGroup('RENT', 'CONTAINER RENTAL' + sizeHtml + locHtml, rRent, 1, rRent);
            }
        });

        const renderService = (srv, title, prefixKey) => {
            const keys = Object.keys(serviceGroups[srv]);
            if (keys.length === 0) return;
            
            const isFirst = (activeServices === 0);
            activeServices++;
            prefix = prefixKey;
            
            // For jsPDF.html, table is the best block element to trigger page break
            const breakHtml = isFirst ? '' : '<div style="page-break-before: always; break-before: page; height:1px;"></div>';
            
            const isYard = (srv === 'YARD');

            let tableHeaderHtml = '';
            tableHeaderHtml = `
                <tr style="background:#1e293b;color:white; page-break-inside: avoid;">
                    <th style="padding:12px 15px;text-align:left;font-size:0.75rem;text-transform:uppercase;">Description</th>
                    <th style="padding:12px 15px;text-align:center;font-size:0.75rem;text-transform:uppercase;">SVC QTY</th>
                    <th style="padding:12px 15px;text-align:right;font-size:0.75rem;text-transform:uppercase;">Unit Cost</th>
                    <th style="padding:12px 15px;text-align:right;font-size:0.75rem;text-transform:uppercase;">Total</th>
                </tr>
                <tr style="background:#e2e8f0; page-break-inside: avoid;">
                    <th colspan="4" style="padding:10px 15px;font-weight:900;color:#1e293b;text-align:center;text-transform:uppercase;">${title}</th>
                </tr>
            `;

            let tableHtml = breakHtml + `
                <table style="width:100%;border-collapse:collapse;margin-bottom:15px; page-break-inside: auto;">
                    <thead>
                        ${tableHeaderHtml}
                    </thead>
                    <tbody>
            `;

            let srvTotal = 0;
            
            keys.forEach(k => {
                const grp = serviceGroups[srv][k];
                let desc = title;
                if (grp.booking && grp.booking !== '---') {
                    if (grp.booking.startsWith('<br>')) {
                        desc = title + grp.booking;
                    } else {
                        desc = grp.booking;
                    }
                }
                srvTotal += grp.total;
                
                tableHtml += `
                    <tr style="page-break-inside: avoid;">
                        <td style="padding:14px 15px;font-weight:600;color:#1e293b; border-bottom:1px solid #e2e8f0;">${desc}</td>
                        <td style="padding:14px 15px;text-align:center;color:#0f172a; border-bottom:1px solid #e2e8f0;">${grp.qty}</td>
                        <td style="padding:14px 15px;text-align:right;color:#0f172a; border-bottom:1px solid #e2e8f0;">$${grp.unitCost.toFixed(2)}</td>
                        <td style="padding:14px 15px;text-align:right;font-weight:800;color:#1e293b; border-bottom:1px solid #e2e8f0;">$${grp.total.toFixed(2)}</td>
                    </tr>
                `;
            });
            tableHtml += `
                    </tbody>
                    <tfoot>
                        <tr style="background:#f8fafc; page-break-inside: avoid;">
                            <td colspan="3" style="padding:10px 15px;text-align:right;font-size:0.9rem;font-weight:800;color:#1e293b;border-bottom:2px solid #cbd5e1;">${title} SUBTOTAL:</td>
                            <td style="padding:10px 15px;text-align:right;font-size:0.95rem;font-weight:900;color:#1e40af;border-bottom:2px solid #cbd5e1;">$${srvTotal.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            `;
            
            tbody.innerHTML += tableHtml;
            grandTotal += srvTotal;
        };

        renderService('TRANSPORT', 'TRANSPORT SERVICE', 'TRANS');
        renderService('YARD', 'YARD / ADDITIONAL SERVICES', 'YARD');
        renderService('SALES', 'CONTAINER SALES', 'SALE');
        renderService('STORAGE', 'STORAGE SERVICE', 'STOR');
        renderService('RENT', 'CONTAINER RENTAL', 'RENT');

        document.getElementById('mb-total').textContent = `${grandTotal.toFixed(2)}`;

        if (activeServices > 1) {
            prefix = 'AS';
        }

        const uniqueNum = Math.floor(100000 + Math.random() * 900000);
        const invoiceNo = overrideInvoiceNo || `${prefix}-${uniqueNum}`;

        const invoiceNoField = document.getElementById('mb-invoice-number');
        if (invoiceNoField) {
            invoiceNoField.textContent = invoiceNo;
        }
        // Save the generated number globally so it can be retrieved if needed (e.g. for PDF)
        window.currentMasterInvoiceNo = invoiceNo;

        const modal = document.getElementById('master-billing-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    };

    window.createMasterInvoiceRecordOnly = async function(event) {
        if (!event) event = window.event;
        const btn = event?.currentTarget;
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> CREANDO REGISTRO...';
        }

        try {
            if (window.addInvoiceToReceivables) {
                const customer = document.getElementById('bc-f-customer')?.value || 'Customer';
                const invNo = window.currentMasterInvoiceNo || 'INV';
                const totalText = document.getElementById('mb-total')?.textContent || '0';
                const totalNum = parseFloat(totalText.replace(/[^0-9.-]+/g,"")) || 0;
                const detailsHtml = document.getElementById('mb-services-container')?.innerHTML || '';
                const tripIds = (window.currentBillingOrderRows || []).map(r => r[0]).filter(Boolean);
                const svcFilter = document.getElementById('bc-f-service')?.value || '';
                
                await window.addInvoiceToReceivables(customer, invNo, totalNum, detailsHtml, tripIds, svcFilter);
                
                // Actualizar contadores y status localmente para que se marque de verde sin necesidad de email
                const nowIso = new Date().toISOString();
                (window.currentBillingOrderRows || []).forEach(row => {
                    const tripId = row[0];
                    if (tripId && !tripId.startsWith('VIRTUAL_RENTAL_')) {
                        row[57] = 'YES';
                        row[63] = nowIso;
                        const currentCount = parseInt(row[64]) || 0;
                        row[64] = currentCount + 1;
                    }
                });
                
                if (window.showToast) window.showToast('Registro de Invoice creado exitosamente', 'success');
                else alert('Registro de Invoice creado exitosamente');
                
                if (window.closeMasterBillingModal) window.closeMasterBillingModal();
                if (window.renderBillingTable) window.renderBillingTable();
            } else {
                alert("Módulo Accounts no cargado.");
            }
        } catch(e) {
            console.error(e);
            alert("Error creando el registro.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origText;
            }
        }
    };

    window.closeMasterBillingModal = function() {
        const modal = document.getElementById('master-billing-modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
        window.currentMasterInvoiceNo = null;
    };

    window.sendFilteredInvoiceEmail = async function() {
        const btn = event.currentTarget;
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ENVIANDO...';

        try {
            // Check if automation function is available, else simulate
            if (window.sendBillingEmailWithValidation) {
                // Ensure we use the exact rows that were rendered in the modal
                // (currentBillingOrderRows is already correctly set by viewMasterBilling or previewSingleRowInvoice)
                await window.sendBillingEmailWithValidation(btn);
            } else {
                await new Promise(r => setTimeout(r, 1500));
                if (window.showToast) window.showToast('Factura enviada exitosamente!', 'success');
                else alert('Factura enviada exitosamente!');
            }
            window.closeMasterBillingModal();
        } catch(e) {
            console.error(e);
            alert('Error enviando la factura.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    };


    window.updateMasterBillingCompany = function() {
        const select = document.getElementById('mb-billing-company-select');
        const companyId = select.value;

        const nameEl = document.getElementById('mb-company-name');
        const addrEl = document.getElementById('mb-company-address');
        const bName = document.getElementById('mb-bank-name');
        const bCompany = document.getElementById('mb-bank-company');
        const bAccount = document.getElementById('mb-bank-account');
        const bRouting = document.getElementById('mb-bank-routing');
        const bSwift = document.getElementById('mb-bank-swift');
        const bAddr = document.getElementById('mb-bank-addr');
        const bZelle = document.getElementById('mb-bank-zelle');

        if (companyId === 'JR_SUPER_CRANE') {
            nameEl.textContent = 'JR SUPER CRANE TRANSPORT INC';
            addrEl.textContent = '9804 NW 80th Ave, Hialeah Gardens FL 33016';
            bName.textContent = 'Bank Of America';
            bCompany.textContent = 'JR SUPER CRANE TRANSPORT INC';
            bAccount.textContent = '898111245429';
            bRouting.textContent = '063100277';
            bSwift.textContent = 'BOFAUS3N';
            bAddr.textContent = '900 W 49 ST, Hialeah, FL 33012';
            bZelle.textContent = '786-768-4409';
        } else {
            // Default: RP_TULIPAN
            nameEl.textContent = 'RP TULIPAN TRANSPORT INC';
            addrEl.textContent = '9804 NW 80th Ave, Hialeah Gardens FL 33016';
            bName.textContent = 'Bank Of America';
            bCompany.textContent = 'RP TULIPAN TRANSPORT INC';
            bAccount.textContent = '898111245429';
            bRouting.textContent = '063100277';
            bSwift.textContent = 'BOFAUS3N';
            bAddr.textContent = '900 W 49 ST, Hialeah, FL 33012';
            bZelle.textContent = '786-768-4409';
        }
    };

    window.downloadFilteredInvoicePDF = async function() {
        const btn = event.currentTarget;
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GENERATING PDF...';

        try {
            const container = document.getElementById('mb-invoice-preview');
            // Hide buttons temporarily
            const actionsDiv = container.querySelector('div:last-child');
            actionsDiv.style.display = 'none';

            // Wait a tick for UI update
            await new Promise(r => setTimeout(r, 100));

            // Ensure html2pdf is available
            if (typeof html2pdf === 'undefined') {
                alert('Librería html2pdf no encontrada.');
                actionsDiv.style.display = 'flex';
                btn.disabled = false;
                btn.innerHTML = origText;
                return;
            }

            const customer = document.getElementById('bc-f-customer')?.value || 'Customer';
            const invNo = window.currentMasterInvoiceNo || 'INV';
            const filename = `${invNo}_${customer.replace(/[^a-z0-9]/gi, '_')}.pdf`;

            const opt = {
                margin:       15,
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'pt', format: 'letter', orientation: 'portrait' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            await html2pdf().set(opt).from(container).save();

            // Restore buttons
            actionsDiv.style.display = 'flex';
            btn.disabled = false;
            btn.innerHTML = origText;
            
        } catch (e) {
            console.error('Error generating PDF:', e);
            alert('Error generando el PDF.');
            // Restore actions just in case
            const actionsDiv = document.getElementById('mb-invoice-preview').querySelector('div:last-child');
            if (actionsDiv) actionsDiv.style.display = 'flex';
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    };

    window.previewSingleRowInvoice = function(idx) {
        if (!window.combinedBillingTrips || !window.combinedBillingTrips[idx]) return;
        const row = window.combinedBillingTrips[idx];
        const oldBillingRows = window.billingRows;
        window.billingRows = [row];
        window.openMasterBillingModal(row);
        window.billingRows = oldBillingRows;
    };

    window.generateMasterInvoiceBlob = async function() {
        const container = document.getElementById('mb-invoice-preview');
        if (!container) return null;

        // Hide buttons temporarily
        const actionsDiv = container.querySelector('div:last-child');
        const origDisplay = actionsDiv ? actionsDiv.style.display : 'flex';
        if (actionsDiv) actionsDiv.style.display = 'none';

        await new Promise(r => setTimeout(r, 100));

        try {
            const opt = {
                margin:       15,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'pt', format: 'letter', orientation: 'portrait' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            const blob = await html2pdf().set(opt).from(container).output('blob');
            return blob;
        } finally {
            if (actionsDiv) actionsDiv.style.display = origDisplay;
        }
    };

})();
