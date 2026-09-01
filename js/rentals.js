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

    function periodsOverlap(aStart, aEnd, bStart, bEnd) {
        if (!aStart || !aEnd || !bStart || !bEnd) return true;
        return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
    }

    function findMatchingRentalInvoice(row, filterStartStr, filterEndStr) {
        const trips = getRentalInvoiceTrips();
        if (!trips.length || !row) return null;

        const rid = row.id != null ? String(row.id) : '';
        const cont = (row.container_no || '').toString().trim().toUpperCase();
        const fStart = parseLocalDate(filterStartStr);
        const fEnd = parseLocalDate(filterEndStr);
        const hasFilter = !!(fStart || fEnd);
        const rangeStart = fStart || parseLocalDate(row.start_date);
        const rangeEnd = fEnd || parseLocalDate(row.final_date) || new Date();
        if (rangeEnd) rangeEnd.setHours(0, 0, 0, 0);

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

        const pool = byRid.length ? byRid : byCont;
        const matched = pool.filter(t => {
            const { start, end } = getInvoicePeriod(t);
            if (hasFilter) {
                const rs = rangeStart || new Date(2000, 0, 1);
                const re = rangeEnd || new Date(2099, 11, 31);
                return periodsOverlap(start, end, rs, re);
            }
            if (byRid.length) return true;
            const rentalStart = parseLocalDate(row.start_date);
            const rentalEnd = parseLocalDate(row.final_date) || new Date();
            if (rentalEnd) rentalEnd.setHours(0, 0, 0, 0);
            if (start && end && rentalStart) {
                return periodsOverlap(start, end, rentalStart, rentalEnd);
            }
            return true;
        });

        if (!matched.length) return null;
        return matched.find(t => (t[31] || '').toString().trim().toUpperCase() === 'PAID') || matched[0];
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
            renderRentalsTable();
            return;
        }
        try {
            const data = await getRentals();
            
            // --- AUTOMATION: Auto-Pending for expired PAID rentals ---
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            let updateCount = 0;

            console.log("Checking for expired rentals... Today is:", new Date(today).toLocaleDateString());

            const expiredIds = [];
            for (let row of data) {
                const status = (row.status || '').trim().toUpperCase();
                const pStatus = (row.payment_status || '').trim().toUpperCase();

                if (status === 'ACTIVE' && pStatus === 'PAID' && row.final_date) {
                    let fDate;
                    if (row.final_date.includes('-')) {
                        const [fy, fm, fd] = row.final_date.split('-').map(Number);
                        fDate = new Date(fy, fm - 1, fd).getTime();
                    } else {
                        fDate = new Date(row.final_date).getTime();
                    }

                    if (!isNaN(fDate) && fDate <= today) {
                        row.payment_status = 'PENDING';
                        expiredIds.push(row.id);
                    }
                }
            }

            if (expiredIds.length > 0) {
                console.log(`Auto-Pending: Batch updating ${expiredIds.length} expired rentals...`);
                if (window.updateRentalsBatch) {
                    window.updateRentalsBatch(expiredIds, { payment_status: 'PENDING' })
                        .then(() => console.log(`DB confirmed PENDING for ${expiredIds.length} rentals.`))
                        .catch(err => console.error(`Batch update failed:`, err));
                }
            }

            if (updateCount > 0) {
                console.log(`Marked ${updateCount} rentals as PENDING locally.`);
            }

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
        // month charges 1 cycle — not the full accumulated debt. Unfiltered
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
            
            totalAccumulated += costInfo.total;
            
            row._calculatedCost = costInfo.total; // Store for generateRentalInvoice
            row._calculatedStart = startDateFilter || row.start_date;
            row._calculatedEnd = endDateFilter || row.final_date || new Date().toISOString().split('T')[0];

            let dynamicPaymentStatus = 'UNBILLED';
            let isExpired = false;

            const matchingTrip = findMatchingRentalInvoice(row, startDateFilter, endDateFilter);
            if (matchingTrip) {
                const stRent = (matchingTrip[31] || '').toString().trim().toUpperCase();
                dynamicPaymentStatus = (stRent === 'PAID') ? 'PAID' : 'PENDING';
            }
            
            // Highlight row in red if status is UNBILLED or PENDING, AND the evaluated end date has already passed
            if (row.status === 'ACTIVE' && (dynamicPaymentStatus === 'UNBILLED' || dynamicPaymentStatus === 'PENDING')) {
                const endObj = new Date(row._calculatedEnd);
                endObj.setHours(0,0,0,0);
                const today = new Date();
                today.setHours(0,0,0,0);
                
                if (today > endObj) {
                    isExpired = true; // Red alert
                }
            }

            const displayCost = costInfo.total;
            const displayDays = costInfo.cycleLabel;
            const balanceDue = displayCost;
            
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
                <td style="color: #000000; font-weight: 700;">${formatDate(row.start_date)}</td>
                <td style="font-weight: 700; color: ${isExpired ? '#ef4444' : '#000000'}; font-size: 0.85rem; line-height: 1.2;">
                    ${formatDate(row.start_date)}<br>a ${formatDate(row.final_date)} 
                    ${isExpired ? '<i class="fas fa-exclamation-triangle" title="Rental Expired"></i>' : ''}
                </td>
                <td style="font-weight: 700; color: #000000; text-align: center;">${row.release_no || '---'}</td>
                <td style="font-weight: 700; color: #000000; text-align: center;">${row.size || '---'}</td>
                <td style="font-weight: 900; color: ${isDuplicate ? '#9a3412' : '#000000'}; background-color: ${isDuplicate ? '#ffedd5' : 'transparent'};" ${isDuplicate ? 'title="ATENCIÓN: Este número de contenedor está repetido en el sistema."' : ''}>
                    ${isDuplicate ? '<i class="fas fa-exclamation-triangle" style="color: #ea580c; margin-right: 6px;"></i>' : ''}${row.container_no || '---'}
                </td>
                <td style="font-weight: 700; color: #000000;">${row.delivery_place || '---'}</td>
                <td style="font-weight: 700; color: #000000;">${row.customer_name || '---'}</td>
                <td style="color: #000000; font-weight: 700; text-align: center !important;">${window.formatUSPhone(row.phone) || '---'}</td>
                <td style="color: #000000; font-weight: 700; text-align: center !important;">$${parseFloat(row.base_price).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="font-weight: 800; color: #000000;">${displayDays}</td>
                <td style="font-weight: 900; color: ${balanceDue > 0 ? (isExpired ? '#ef4444' : '#000000') : '#10b981'}; font-size: 1rem;">$${balanceDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td>
                    <span class="status-badge" style="background: ${row.status === 'FINISHED' ? '#64748b' : '#10b981'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">
                        ${row.status || 'ACTIVE'}
                    </span>
                </td>
                <td>
                    <span class="status-badge" style="background: ${dynamicPaymentStatus === 'PAID' ? '#1e40af' : '#94a3b8'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">
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

        // Show/Hide combined invoice button
        const combBtn = document.getElementById('btn-combined-invoice');
        if (combBtn) {
            const hasVisibleActive = visibleCount > 0 && customerFilter !== '';
            combBtn.style.display = hasVisibleActive ? 'inline-block' : 'none';
        }

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
        const status = document.getElementById('rental-status').value;
        const paymentStatus = document.getElementById('rental-payment-status').value;
        const notes = document.getElementById('rental-notes').value;

        if (!startDate || !container || !customer) { alert("Please fill in Start Date, Container #, and Customer."); return; }

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
        document.getElementById('rental-status').value = row.status || 'ACTIVE';
        document.getElementById('rental-payment-status').value = row.payment_status || 'PENDING';
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
        
        const invBtn = document.getElementById('btn-generate-invoice');
        if (invBtn) invBtn.style.display = 'block';
        
        const payBtn = document.getElementById('btn-register-payment');
        if (payBtn) {
            payBtn.style.display = (row.status === 'ACTIVE') ? 'block' : 'none';
        }
        
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
        document.getElementById('rental-status').value = 'ACTIVE';
        document.getElementById('rental-payment-status').value = 'PENDING';
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
        
        const invBtn = document.getElementById('btn-generate-invoice');
        if (invBtn) invBtn.style.display = 'none';
        
        const payBtn = document.getElementById('btn-register-payment');
        if (payBtn) payBtn.style.display = 'none';
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

    window.generateRentalInvoice = async function() {
        if (!editingRentalId) {
            alert('Select a rental to generate an invoice.');
            return;
        }
        const row = window.currentRentals.find(r => r.id === editingRentalId);
        if (!row) return;

        // Create or reuse modal dynamically
        let modal = document.getElementById('rental-invoice-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'rental-invoice-modal';
            modal.className = 'simple-modal';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header" style="background: #1e3a8a; color: white; padding: 15px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin:0; font-size: 1.1rem;"><i class="fas fa-file-invoice-dollar" style="margin-right: 8px;"></i> Generate Rental Invoice</h3>
                        <button class="btn-close-modal" onclick="document.getElementById('rental-invoice-modal').style.display='none'" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer;"><i class="fas fa-times"></i></button>
                    </div>
                    <div style="padding: 20px; font-size: 0.95rem; color: #334155; line-height: 1.6;">
                        <div style="display: grid; grid-template-columns: 100px 1fr; gap: 10px; margin-bottom: 20px;">
                            <strong style="color: #64748b;">Customer:</strong> <span id="ri-modal-customer" style="font-weight: 600;"></span>
                            <strong style="color: #64748b;">Container:</strong> <span><span id="ri-modal-container" style="font-weight: 600;"></span> (<span id="ri-modal-size"></span>)</span>
                            <strong style="color: #64748b;">Period:</strong> <span id="ri-modal-period" style="font-weight: 600; color: #2563eb;"></span>
                            <strong style="color: #64748b;">Amount:</strong> <span style="font-weight: 700; color: #10b981; font-size: 1.1rem;">$<span id="ri-modal-amount"></span></span>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <label style="font-weight: 700; display: block; margin-bottom: 10px; color: #1e293b;">Payment Status</label>
                            <div style="display: flex; gap: 20px; align-items: center;">
                                <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="ri-pay-status" value="PENDING" checked> Pending
                                </label>
                                <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="ri-pay-status" value="PAID"> Paid Now
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding: 15px 20px; background: #f1f5f9; text-align: right; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
                        <button style="padding: 10px 15px; background: #64748b; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; font-weight: 600;" onclick="document.getElementById('rental-invoice-modal').style.display='none'">Cancel</button>
                        <button id="btn-confirm-rental-invoice" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-check"></i> Generate Invoice</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const invoiceDate = new Date().toISOString().split('T')[0];
        const start = row._calculatedStart || row.start_date || invoiceDate;
        const end = row._calculatedEnd || row.final_date || invoiceDate;
        const fmt = (s) => { const p = s.split('-'); return `${p[1]}/${p[2]}/${p[0]}`; };
        
        document.getElementById('ri-modal-customer').textContent = row.customer_name || '---';
        document.getElementById('ri-modal-container').textContent = row.container_no || '---';
        document.getElementById('ri-modal-size').textContent = row.size || '---';
        document.getElementById('ri-modal-period').textContent = `${fmt(start)} - ${fmt(end)}`;
        
        const rentAmount = (typeof row._calculatedCost === 'number') ? row._calculatedCost : (parseFloat(row.base_price) || 0);
        document.getElementById('ri-modal-amount').textContent = rentAmount.toFixed(2);
        
        // Reset radio
        const radios = document.getElementsByName('ri-pay-status');
        if (radios.length > 0) radios[0].checked = true;
        
        // Setup confirm action
        const confirmBtn = document.getElementById('btn-confirm-rental-invoice');
        confirmBtn.onclick = async function() {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            const isPaidNow = document.querySelector('input[name="ri-pay-status"]:checked').value === 'PAID';
            const orderNo = `RENT-${Math.floor(1000 + Math.random() * 9000)}`;
            const periodLabel = `${fmt(start)} - ${fmt(end)}`;
            
            let paymentSplit = null;
            let totalPaid = 0;
            let isFullyPaid = false;
            if (isPaidNow) {
                paymentSplit = await window.showSplitPaymentModal(rentAmount);
                if (!paymentSplit) {
                    // User cancelled the payment split modal
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i class="fas fa-check"></i> Generate Invoice';
                    return;
                }
                totalPaid = paymentSplit.cashAmt + paymentSplit.bankAmt;
                isFullyPaid = totalPaid >= rentAmount;
            }

            let baseTrip = null;
            if (window.currentTrips && window.currentTrips.length > 0) {
                // Find latest trip for this container
                baseTrip = window.currentTrips.slice().reverse().find(t => t[3] === row.container_no);
            }

            if (!baseTrip) {
                // Fallback: fetch from database if not in memory
                try {
                    const { data: dbTrips, error: dbErr } = await window.db.from('trips')
                        .select('*')
                        .eq('n_cont', row.container_no)
                        .or('is_deleted.eq.false,is_deleted.is.null')
                        .order('date', { ascending: false })
                        .limit(1);
                    if (!dbErr && dbTrips && dbTrips.length > 0 && typeof window.mapTripToArray === 'function') {
                        baseTrip = window.mapTripToArray(dbTrips[0]);
                    }
                } catch (e) {
                    console.warn("Could not fetch base trip from DB", e);
                }
            }

            const tripObj = {
                trip_id: crypto.randomUUID(),
                date: invoiceDate,
                order_no: baseTrip ? baseTrip[5] : orderNo, // Use original order number in Trips table
                customer: row.customer_name,
                pickup_address: baseTrip ? baseTrip[7] : '',
                delivery_place: baseTrip ? baseTrip[8] : '',
                note: formatRentalInvoiceNote(periodLabel, row.id),
                n_cont: row.container_no,
                yard_rate: 0, 
                monthly_rate: rentAmount, // This maps to row[27] which is the RENT column in billing
                service_mode: 'RENTAL INVOICE',
                status: 'COMPLETE',
                st_yard: isFullyPaid ? 'PAID' : 'PEND',
                st_rate: 'PAID',
                st_sales: 'PAID',
                st_amount: 'PAID',
                st_rent: isFullyPaid ? 'PAID' : 'PEND', // Ensure rent status matches payment
                has_trans: 'NO',
                has_sales: 'NO',
                invoice_sent: 'YES',
                paid: isFullyPaid,
                email: baseTrip ? (baseTrip[36] === '---' ? '' : baseTrip[36]) : '',
                start_date_rent: start,
                next_due: end
            };

            try {
                const { error: insertError } = await window.db.from('trips').insert([tripObj]);
                if (insertError) throw insertError;
                if (typeof window.mapTripToArray === 'function') {
                    rememberRentalInvoiceTrip(window.mapTripToArray(tripObj));
                }
                
                if (isPaidNow && paymentSplit && window.logCashTransaction) {
                    const desc = `Pago Factura Renta - ${orderNo}`;
                    if (paymentSplit.cashAmt > 0) {
                        await window.logCashTransaction({ tipo: 'ingreso', metodo: 'cash', monto: paymentSplit.cashAmt, descripcion: desc + ' [Cash]', referencia: orderNo, chofer: row.customer_name });
                    }
                    if (paymentSplit.bankAmt > 0) {
                        await window.logCashTransaction({ tipo: 'ingreso', metodo: 'bank', monto: paymentSplit.bankAmt, descripcion: desc + ' [Bank]', referencia: orderNo, chofer: row.customer_name });
                    }
                }
                
                // Always generate Accounts Receivable record
                if (window.addInvoiceToReceivables) {
                    const detailsHtml = `
                        <div style="font-size:0.85rem; color:#475569;">
                            <strong>Container:</strong> ${row.container_no || '---'}<br>
                            <strong>Period:</strong> ${fmt(start)} - ${fmt(end)}
                        </div>
                    `;
                    
                    let arMethod = '';
                    if (isPaidNow && paymentSplit) {
                        if (paymentSplit.cashAmt > 0 && paymentSplit.bankAmt > 0) arMethod = 'Split';
                        else if (paymentSplit.cashAmt > 0) arMethod = 'Cash';
                        else arMethod = 'Bank';
                    }
                    
                    await window.addInvoiceToReceivables(
                        row.customer_name, 
                        orderNo, 
                        rentAmount, 
                        detailsHtml, 
                        [tripObj.trip_id, 'RENTAL_ID:' + row.id], 
                        'RENTAL',
                        totalPaid,
                        arMethod
                    );
                }
                
                modal.style.display = 'none';
                alert('Rental Invoice generated successfully!');
                window.billingDataLoaded = false;
                
                if (typeof window.renderBillingTable === 'function') window.renderBillingTable();
                renderRentalsTable();
            } catch(err) {
                console.error('Error generating rental invoice:', err);
                alert('Failed to generate invoice.');
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-check"></i> Generate Invoice';
            }
        };

        modal.style.display = 'flex';
    };

    window.generateCombinedRentalInvoice = async function() {
        const customerFilter = (document.getElementById('rental-filter-customer')?.value || '').trim().toLowerCase();
        if (!customerFilter) {
            alert('Please select a customer first.');
            return;
        }

        const showAll = document.getElementById('rental-show-all')?.checked;
        const startDateFilter = document.getElementById('rental-filter-start')?.value;
        const endDateFilter = document.getElementById('rental-filter-end')?.value;

        if (!startDateFilter || !endDateFilter) {
            alert('Por favor, selecciona un rango de fechas (FROM y TO) para generar el invoice de ese periodo.');
            return;
        }

        const sizeFilter = (document.getElementById('rental-filter-size')?.value || '').trim().toLowerCase();
        const containerFilter = (document.getElementById('rental-filter-container')?.value || '').trim().toLowerCase();

        // Get matching rentals
        const matchingRentals = window.currentRentals.filter(row => {
            if (!showAll && row.status === 'FINISHED') return false;
            
            const matchesCust = !customerFilter || (row.customer_name && row.customer_name.toLowerCase() === customerFilter);
            const matchesSize = !sizeFilter || (row.size && row.size.toLowerCase() === sizeFilter);
            const matchesCont = !containerFilter || (row.container_no && row.container_no.toLowerCase().includes(containerFilter));
            
            let matchesDates = true;
            if (startDateFilter || endDateFilter) {
                const rowStart = new Date(row.start_date); rowStart.setHours(0,0,0,0);
                const rowEnd = (row.status === 'FINISHED' && row.final_date) ? new Date(row.final_date) : new Date();
                rowEnd.setHours(0,0,0,0);
                
                const fStart = startDateFilter ? new Date(startDateFilter + 'T00:00:00') : new Date('2000-01-01T00:00:00');
                if (startDateFilter) fStart.setHours(0,0,0,0);
                
                const fEnd = endDateFilter ? new Date(endDateFilter + 'T00:00:00') : new Date('2099-12-31T00:00:00');
                if (endDateFilter) {
                    fEnd.setDate(fEnd.getDate() + 1);
                    fEnd.setHours(0,0,0,0);
                }
                
                const overlap = (rowStart <= fEnd && rowEnd >= fStart);
                if (!overlap) matchesDates = false;
            }
            
            return matchesCust && matchesSize && matchesCont && matchesDates;
        });

        if (matchingRentals.length === 0) {
            alert('No matching rentals found to invoice.');
            return;
        }

        // Filter out those that already have a ghost trip for this period? 
        // The user said: "todo lo que entre en las fechas seleccionadas es lo que debe ir en ese invoice"
        // Let's sum it up.
        let totalCombinedAmount = 0;
        const processedRentals = [];

        matchingRentals.forEach(row => {
            const costData = calculateRentalCost(
                row.start_date, row.final_date, row.base_price, row.daily_rate, row.status, row.time_rent,
                startDateFilter, endDateFilter
            );
            
            const bDue = parseFloat(costData.total) || 0;
            if (bDue > 0) {
                totalCombinedAmount += bDue;
                processedRentals.push({ row, amount: bDue });
            }
        });

        if (totalCombinedAmount <= 0) {
            alert('The total amount to invoice is 0.');
            return;
        }

        // Reuse the modal for combined invoice
        let modal = document.getElementById('rental-invoice-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'rental-invoice-modal';
            modal.className = 'simple-modal';
            modal.style.display = 'none';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header" style="background: #1e3a8a; color: white; padding: 15px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin:0; font-size: 1.1rem;"><i class="fas fa-file-invoice-dollar" style="margin-right: 8px;"></i> Generate Combined Invoice</h3>
                    <button class="btn-close-modal" onclick="document.getElementById('rental-invoice-modal').style.display='none'" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer;"><i class="fas fa-times"></i></button>
                </div>
                <div style="padding: 20px; font-size: 0.95rem; color: #334155; line-height: 1.6;">
                    <div style="margin-bottom: 20px;">
                        <strong style="color: #64748b;">Customer:</strong> <span style="font-weight: 600;">${matchingRentals[0].customer_name.toUpperCase()}</span><br>
                        <strong style="color: #64748b;">Rentals Included:</strong> <span style="font-weight: 600;">${processedRentals.length}</span>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 700; color: #475569;">Total Amount:</span>
                            <span style="font-size: 1.5rem; font-weight: 900; color: #0f172a;">$${totalCombinedAmount.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; gap: 15px; margin-top: 10px;">
                            <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; font-weight: 600; color: #1e293b;">
                                <input type="radio" name="ri-pay-status" value="PENDING" checked> Pay Later (Pending)
                            </label>
                            <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; font-weight: 600; color: #10b981;">
                                <input type="radio" name="ri-pay-status" value="PAID"> Paid Now
                            </label>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="padding: 15px 20px; background: #f1f5f9; text-align: right; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
                    <button style="padding: 10px 15px; background: #64748b; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; font-weight: 600;" onclick="document.getElementById('rental-invoice-modal').style.display='none'">Cancel</button>
                    <button id="btn-confirm-combined-invoice" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-check"></i> Generate Invoice</button>
                </div>
            </div>
        `;

        const confirmBtn = document.getElementById('btn-confirm-combined-invoice');
        confirmBtn.onclick = async function() {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            const isPaidNow = document.querySelector('input[name="ri-pay-status"]:checked').value === 'PAID';
            const orderNo = `RENT-${Math.floor(1000 + Math.random() * 9000)}`;
            const invoiceDate = new Date().toISOString().split('T')[0];
            
            let paymentSplit = null;
            let totalPaid = 0;
            let isFullyPaid = false;
            
            if (isPaidNow) {
                paymentSplit = await window.showSplitPaymentModal(totalCombinedAmount);
                if (!paymentSplit) {
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i class="fas fa-check"></i> Generate Invoice';
                    return;
                }
                totalPaid = paymentSplit.cashAmt + paymentSplit.bankAmt;
                isFullyPaid = totalPaid >= totalCombinedAmount;
            }

            try {
                let allTripIds = [];
                let detailsHtml = '<div style="font-size:0.85rem; color:#475569;">';
                
                // Fetch base trips for all containers at once if possible, or individually
                for (const item of processedRentals) {
                    const row = item.row;
                    const rAmount = item.amount;
                    
                    let baseTrip = null;
                    if (window.currentTrips && window.currentTrips.length > 0) {
                        baseTrip = window.currentTrips.slice().reverse().find(t => t[3] === row.container_no);
                    }
                    if (!baseTrip) {
                        try {
                            const { data: dbTrips } = await window.db.from('trips').select('*').eq('n_cont', row.container_no).or('is_deleted.eq.false,is_deleted.is.null').order('date', { ascending: false }).limit(1);
                            if (dbTrips && dbTrips.length > 0 && typeof window.mapTripToArray === 'function') {
                                baseTrip = window.mapTripToArray(dbTrips[0]);
                            }
                        } catch (e) {}
                    }
                    
                    const tripId = crypto.randomUUID();
                    allTripIds.push(tripId);
                    allTripIds.push('RENTAL_ID:' + row.id);
                    
                    const start = startDateFilter || row._calculatedStart || row.start_date || invoiceDate;
                    const end = endDateFilter || row._calculatedEnd || row.final_date || invoiceDate;
                    const fmt = (s) => { const p = s.split('-'); return `${p[1]}/${p[2]}/${p[0]}`; };
                    const periodLabel = `${fmt(start)} - ${fmt(end)}`;
                    
                    detailsHtml += `<strong>Container:</strong> ${row.container_no || '---'} (${periodLabel}) - <strong>$${rAmount.toFixed(2)}</strong><br>`;

                    const tripObj = {
                        trip_id: tripId,
                        date: invoiceDate,
                        order_no: baseTrip ? baseTrip[5] : orderNo, 
                        customer: row.customer_name,
                        pickup_address: baseTrip ? baseTrip[7] : '',
                        delivery_place: baseTrip ? baseTrip[8] : '',
                        note: formatRentalInvoiceNote(periodLabel, row.id),
                        n_cont: row.container_no,
                        yard_rate: 0, 
                        monthly_rate: rAmount, 
                        service_mode: 'RENTAL INVOICE',
                        status: 'COMPLETE',
                        st_yard: isFullyPaid ? 'PAID' : 'PEND',
                        st_rate: 'PAID',
                        st_sales: 'PAID',
                        st_amount: 'PAID',
                        st_rent: isFullyPaid ? 'PAID' : 'PEND', 
                        has_trans: 'NO',
                        has_sales: 'NO',
                        invoice_sent: 'YES',
                        paid: isFullyPaid,
                        email: baseTrip ? (baseTrip[36] === '---' ? '' : baseTrip[36]) : '',
                        start_date_rent: start,
                        next_due: end
                    };
                    
                    const { error: insertError } = await window.db.from('trips').insert([tripObj]);
                    if (insertError) throw insertError;
                    if (typeof window.mapTripToArray === 'function') {
                        rememberRentalInvoiceTrip(window.mapTripToArray(tripObj));
                    }
                }
                
                detailsHtml += '</div>';
                
                if (isPaidNow && paymentSplit && window.logCashTransaction) {
                    const desc = `Pago Factura Renta Combinada - ${orderNo}`;
                    if (paymentSplit.cashAmt > 0) {
                        await window.logCashTransaction({ tipo: 'ingreso', metodo: 'cash', monto: paymentSplit.cashAmt, descripcion: desc + ' [Cash]', referencia: orderNo, chofer: matchingRentals[0].customer_name });
                    }
                    if (paymentSplit.bankAmt > 0) {
                        await window.logCashTransaction({ tipo: 'ingreso', metodo: 'bank', monto: paymentSplit.bankAmt, descripcion: desc + ' [Bank]', referencia: orderNo, chofer: matchingRentals[0].customer_name });
                    }
                }
                
                if (window.addInvoiceToReceivables) {
                    let arMethod = '';
                    if (isPaidNow && paymentSplit) {
                        if (paymentSplit.cashAmt > 0 && paymentSplit.bankAmt > 0) arMethod = 'Split';
                        else if (paymentSplit.cashAmt > 0) arMethod = 'Cash';
                        else arMethod = 'Bank';
                    }
                    
                    await window.addInvoiceToReceivables(
                        matchingRentals[0].customer_name, 
                        orderNo, 
                        totalCombinedAmount, 
                        detailsHtml, 
                        allTripIds, 
                        'RENTAL',
                        totalPaid,
                        arMethod
                    );
                }
                
                modal.style.display = 'none';
                alert('Combined Rental Invoice generated successfully!');
                window.billingDataLoaded = false;
                
                if (typeof window.renderBillingTable === 'function') window.renderBillingTable();
                renderRentalsTable();
            } catch(err) {
                console.error('Error generating combined invoice:', err);
                alert('Failed to generate combined invoice.');
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-check"></i> Generate Invoice';
            }
        };

        modal.style.display = 'flex';
    };

    window.refreshRentalsModule = async function() {
        await window.withRefreshButton('btn-refresh-rentals', async () => {
            const data = await getRentals();
            window.currentRentals = data || [];
            await loadRentalInvoiceTrips(true);
            populateRentalFilterCustomerSelect();
            populateRentalFilterSizeSelect();
            populateRentalFilterContainerList();
            renderRentalsTable();
        }, 'rentals');
    };

    window.renderRentalsTable = renderRentalsTable;
    window.loadRentalsData = loadRentalsData;
    window.loadRentalInvoiceTrips = loadRentalInvoiceTrips;
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
