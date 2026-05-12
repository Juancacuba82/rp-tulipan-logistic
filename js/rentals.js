(function() {
    window.currentRentals = [];
    let editingRentalId = null;
    let originalRentalState = null;

    async function loadRentalsData(force = false) {
        if (!force && window.currentRentals && window.currentRentals.length > 0) {
            // If we have data but want to ensure we have the full 1-year range, we could check a flag
            // For now, let's just render what we have.
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

            if (typeof window.loadReleasesData === 'function' && (!window.currentReleases || window.currentReleases.length === 0)) {
                await window.loadReleasesData();
            }
            populateAllRentalSelects();
            renderRentalsTable();
        } catch (err) { console.error("Error loading rentals:", err); }
    }


    function populateAllRentalSelects() {
        populateRentalCustomerSelect();
        populateRentalReleaseSelect();
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

    function calculateRentalCost(startDateStr, finalDateStr, basePrice, dailyRate, status, timeRent) {
        if (!startDateStr) return { total: 0, days: 0 };
        const start = new Date(startDateStr); start.setHours(0, 0, 0, 0);
        let endDate = (status === 'FINISHED' && finalDateStr) ? new Date(finalDateStr) : new Date();
        endDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((endDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const daysPassed = Math.max(0, diffDays);
        
        // Cumulative Calculation based on time periods
        let units = 1;
        if (startDateStr && finalDateStr) {
            const sDate = new Date(startDateStr);
            const fDate = new Date(finalDateStr);
            if (fDate > sDate) {
                let count = 0;
                let temp = new Date(sDate);
                while (temp < fDate) {
                    if (timeRent === 'monthly') temp.setMonth(temp.getMonth() + 1);
                    else if (timeRent === 'weekly') temp.setDate(temp.getDate() + 7);
                    else if (timeRent === 'diary') temp.setDate(temp.getDate() + 1);
                    else { temp.setMonth(temp.getMonth() + 1); } // Default monthly
                    count++;
                    if (count > 1000) break; // Safety
                }
                units = count;
            }
        }

        const total = parseFloat(basePrice) * units;
        return { total: total, days: daysPassed };
    }

    function renderRentalsTable() {
        const body = document.getElementById('rentals-body');
        if (!body) return;
        body.innerHTML = '';
        let totalAccumulated = 0;

        const showAll = document.getElementById('rental-show-all')?.checked;
        let visibleCount = 0;

        if (!window.currentRentals) return;
        window.currentRentals.forEach((row, idx) => {
            const statusStr = (row.status || '').trim().toUpperCase();
            
            // Default: Show only ACTIVE. If showAll is checked, show EVERYTHING.
            if (!showAll && statusStr !== 'ACTIVE') return;
            
            visibleCount++;
            
            const costInfo = calculateRentalCost(row.start_date, row.final_date, row.base_price, row.daily_rate, row.status, row.time_rent);
            totalAccumulated += costInfo.total;
            
            // Highlight row in red if expired (ACTIVE and date reached/passed)
            const isExpired = row.status === 'ACTIVE' && row.final_date && new Date(row.final_date) <= new Date().setHours(0,0,0,0);
            
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
                <td style="font-weight: 700; color: ${isExpired ? '#ef4444' : '#000000'};">
                    ${formatDate(row.final_date)} 
                    ${isExpired ? '<i class="fas fa-exclamation-triangle" title="Rental Expired"></i>' : ''}
                </td>
                <td style="font-weight: 700; color: #000000; text-align: center;">${row.release_no || '---'}</td>
                <td style="font-weight: 700; color: #000000; text-align: center;">${row.size || '---'}</td>
                <td style="font-weight: 900; color: #000000;">${row.container_no || '---'}</td>
                <td style="font-weight: 700; color: #000000;">${row.delivery_place || '---'}</td>
                <td style="font-weight: 700; color: #000000;">${row.customer_name || '---'}</td>
                <td style="color: #000000; font-weight: 700; text-align: center !important;">${window.formatUSPhone(row.phone) || '---'}</td>
                <td style="color: #000000; font-weight: 700; text-align: center !important;">$${parseFloat(row.base_price).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="font-weight: 800; color: #000000;">${costInfo.days} days</td>
                <td style="font-weight: 900; color: ${row.status === 'ACTIVE' ? '#10b981' : '#000000'}; font-size: 1rem;">$${costInfo.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td>
                    <span class="status-badge" style="background: ${row.status === 'FINISHED' ? '#64748b' : '#10b981'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">
                        ${row.status || 'ACTIVE'}
                    </span>
                </td>
                <td>
                    <span class="status-badge" style="background: ${row.payment_status === 'PAID' ? '#1e40af' : '#94a3b8'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">
                        ${row.payment_status || 'PENDING'}
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
            if (editingRentalId) {
                const wasActive = (originalRentalState.status === 'ACTIVE');
                const isActive = (status === 'ACTIVE');
                const relChanged = (originalRentalState.release_no !== releaseNo);

                // --- AUTOMATION: Advance Final Date when marking PENDING as PAID ---
                if (originalRentalState.payment_status === 'PENDING' && paymentStatus === 'PAID') {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const today = new Date(todayStr).getTime();
                    const oldFinalDate = originalRentalState.final_date ? new Date(originalRentalState.final_date).getTime() : 0;

                    if (oldFinalDate <= today) {
                        payload.start_date = originalRentalState.start_date; 
                        
                        const sDate = originalRentalState.final_date ? new Date(originalRentalState.final_date) : new Date();
                        if (timeRent === 'monthly') {
                            sDate.setMonth(sDate.getMonth() + 1);
                        } else if (timeRent === 'weekly') {
                            sDate.setDate(sDate.getDate() + 7);
                        } else if (timeRent === 'diary') {
                            sDate.setDate(sDate.getDate() + 1);
                        }
                        payload.final_date = sDate.toISOString().split('T')[0];
                    }
                }

                // Adjust Stock
                if (wasActive && !isActive) {
                    await adjustReleaseStock(originalRentalState.release_no, 1);
                } else if (!wasActive && isActive) {
                    await adjustReleaseStock(releaseNo, -1);
                } else if (wasActive && isActive && relChanged) {
                    await adjustReleaseStock(originalRentalState.release_no, 1);
                    await adjustReleaseStock(releaseNo, -1);
                }
            } else {
                if (status === 'ACTIVE' && releaseNo) {
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
            } else {
                const { data: insertedData, error } = await db.from('rentals').insert([payload]).select();
                if (error) throw error;
                resultData = insertedData[0];
                window.currentRentals.unshift(resultData);
            }

            alert(editingRentalId ? "Rental record updated!" : "New rental record saved!");
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
        document.getElementById('btn-save-rental').textContent = "UPDATE RENTAL RECORD";
        
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
        if (!confirm("Are you sure you want to delete this rental record?")) return;

        const role = (window.currentUserRole || '').toLowerCase().trim();
        if (role === 'student') {
            alert("Students cannot delete rental records.");
            return;
        }

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
        document.getElementById('btn-save-rental').textContent = "SAVE RENTAL RECORD";
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

    window.renderRentalsTable = renderRentalsTable;
    window.loadRentalsData = loadRentalsData;
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
