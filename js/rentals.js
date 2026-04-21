(function() {
    window.currentRentals = [];
    let editingRentalId = null;
    let originalRentalState = null;

    async function loadRentalsData() {
        try {
            const data = await getRentals();
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

    function calculateRentalCost(startDateStr, finalDateStr, basePrice, dailyRate, status) {
        if (!startDateStr) return { total: 0, days: 0 };
        const start = new Date(startDateStr); start.setHours(0, 0, 0, 0);
        let endDate = (status === 'FINISHED' && finalDateStr) ? new Date(finalDateStr) : new Date();
        endDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((endDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const daysPassed = Math.max(0, diffDays);
        const total = parseFloat(basePrice) + (daysPassed * parseFloat(dailyRate));
        return { total: total, days: daysPassed };
    }

    function renderRentalsTable() {
        const body = document.getElementById('rentals-body');
        if (!body) return;
        body.innerHTML = '';
        let totalAccumulated = 0;

        currentRentals.forEach((row, idx) => {
            const costInfo = calculateRentalCost(row.start_date, row.final_date, row.base_price, row.daily_rate, row.status);
            totalAccumulated += costInfo.total;
            const isExpired = row.status === 'ACTIVE' && row.final_date && new Date(row.final_date) < new Date().setHours(0,0,0,0);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color: #000000; font-weight: 700;">${formatDate(row.start_date)}</td>
                <td style="font-weight: 700; color: ${isExpired ? '#ef4444' : '#000000'};">
                    ${formatDate(row.final_date)} 
                    ${isExpired ? '<i class="fas fa-exclamation-triangle" title="Rental Expired"></i>' : ''}
                </td>
                <td style="font-weight: 700; color: #000000; text-align: center;">${row.release_no || '---'}</td>
                <td style="font-weight: 900; color: #000000;">${row.container_no || '---'}</td>
                <td style="font-weight: 700; color: #000000;">${row.customer_name || '---'}</td>
                <td style="color: #000000; font-weight: 700; text-align: center !important;">${row.phone || '---'}</td>
                <td style="color: #000000; font-weight: 700; text-align: center !important;">$${parseFloat(row.base_price).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="color: #000000; font-weight: 700; text-align: center !important;">$${parseFloat(row.daily_rate).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
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
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-manage-inline" onclick="editRental(${idx})"><i class="fas fa-edit"></i></button>
                        <button class="btn-manage-inline" style="color: #ef4444;" onclick="removeRental('${row.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            body.appendChild(tr);
        });
        const totalEl = document.getElementById('rentals-total-income');
        if (totalEl) totalEl.textContent = `$${totalAccumulated.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }

    async function saveRentalData() {
        const startDate = document.getElementById('rental-start-date').value;
        const finalDate = document.getElementById('rental-final-date').value;
        const container = document.getElementById('rental-container').value;
        const customer = (document.getElementById('rental-customer-sel').style.display !== 'none') ? document.getElementById('rental-customer-sel').value : document.getElementById('rental-customer').value;
        const releaseNo = (document.getElementById('rental-release-sel').style.display !== 'none') ? document.getElementById('rental-release-sel').value : document.getElementById('rental-release').value;
        const phone = document.getElementById('rental-phone').value;
        const basePrice = document.getElementById('rental-base-price').value || 0;
        const dailyRate = document.getElementById('rental-daily-rate').value || 0;
        const status = document.getElementById('rental-status').value;
        const paymentStatus = document.getElementById('rental-payment-status').value;
        const notes = document.getElementById('rental-notes').value;

        if (!startDate || !container || !customer) { alert("Please fill in Start Date, Container #, and Customer."); return; }

        const rentalData = {
            start_date: startDate, final_date: finalDate || null, container_no: container.toUpperCase(),
            customer_name: customer, release_no: releaseNo, phone: phone,
            base_price: parseFloat(basePrice), daily_rate: parseFloat(dailyRate),
            notes: notes, status: status, payment_status: paymentStatus
        };

        try {
            if (editingRentalId) {
                const wasActive = (originalRentalState.status === 'ACTIVE');
                const isActive = (status === 'ACTIVE');
                const relChanged = (originalRentalState.release_no !== releaseNo);

                if (wasActive && !isActive) {
                    await adjustReleaseStock(originalRentalState.release_no, 1);
                } else if (!wasActive && isActive) {
                    await adjustReleaseStock(releaseNo, -1);
                } else if (wasActive && isActive && relChanged) {
                    await adjustReleaseStock(originalRentalState.release_no, 1);
                    await adjustReleaseStock(releaseNo, -1);
                }
                await updateRental(editingRentalId, rentalData);
            } else {
                if (status === 'ACTIVE') await adjustReleaseStock(releaseNo, -1);
                await addRental(rentalData);
            }
            resetRentalForm();
            loadRentalsData();
        } catch (err) { alert("Error saving record: " + (err.message || "Unknown error")); }
    }

    function editRental(idx) {
        const row = currentRentals[idx];
        if (!row) return;
        editingRentalId = row.id; originalRentalState = { ...row };
        document.getElementById('rental-start-date').value = row.start_date;
        document.getElementById('rental-final-date').value = row.final_date || '';
        document.getElementById('rental-container').value = row.container_no;
        const selC = document.getElementById('rental-customer-sel'); const inpC = document.getElementById('rental-customer');
        selC.style.display = 'block'; inpC.style.display = 'none'; selC.value = row.customer_name;
        if (selC.value === "" && row.customer_name) { selC.style.display = 'none'; inpC.style.display = 'block'; inpC.value = row.customer_name; }
        const selR = document.getElementById('rental-release-sel'); const inpR = document.getElementById('rental-release');
        selR.style.display = 'block'; inpR.style.display = 'none'; selR.value = row.release_no || '';
        if (selR.value === "" && row.release_no) { selR.style.display = 'none'; inpR.style.display = 'block'; inpR.value = row.release_no; }
        document.getElementById('rental-phone').value = row.phone || '';
        document.getElementById('rental-base-price').value = row.base_price;
        document.getElementById('rental-daily-rate').value = row.daily_rate;
        document.getElementById('rental-status').value = row.status || 'ACTIVE';
        document.getElementById('rental-payment-status').value = row.payment_status || 'PENDING';
        document.getElementById('rental-notes').value = row.notes || '';
        document.getElementById('btn-save-rental').textContent = "UPDATE RENTAL RECORD";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function removeRental(id) {
        if (!confirm("Are you sure?")) return;
        const row = currentRentals.find(r => r.id === id);
        try { 
            if (row && row.status === 'ACTIVE' && row.release_no) await adjustReleaseStock(row.release_no, 1);
            await deleteRental(id); loadRentalsData(); 
        } catch (err) { console.error(err); }
    }

    function resetRentalForm() {
        editingRentalId = null; originalRentalState = null;
        document.getElementById('rental-start-date').value = '';
        document.getElementById('rental-final-date').value = '';
        document.getElementById('rental-container').value = '';
        document.getElementById('rental-customer-sel').style.display='block'; document.getElementById('rental-customer').style.display='none';
        document.getElementById('rental-customer-sel').value=''; document.getElementById('rental-customer').value='';
        document.getElementById('rental-release-sel').style.display='block'; document.getElementById('rental-release').style.display='none';
        document.getElementById('rental-release-sel').value=''; document.getElementById('rental-release').value='';
        document.getElementById('rental-phone').value = '';
        document.getElementById('rental-base-price').value = '';
        document.getElementById('rental-daily-rate').value = '';
        document.getElementById('rental-status').value = 'ACTIVE';
        document.getElementById('rental-payment-status').value = 'PENDING';
        document.getElementById('rental-notes').value = '';
        document.getElementById('btn-save-rental').textContent = "SAVE RENTAL RECORD";
    }

    function formatDate(dateStr) {
        if (!dateStr || dateStr === '---') return '---';
        const [y, m, d] = dateStr.split('-');
        return `${m}/${d}/${y}`;
    }

    window.loadRentalsData = loadRentalsData;
    window.saveRentalData = saveRentalData;
    window.editRental = editRental;
    window.removeRental = removeRental;
    window.resetRentalForm = resetRentalForm;
    window.toggleRentalCustomerMode = toggleRentalCustomerMode;
    window.toggleRentalReleaseMode = toggleRentalReleaseMode;
    window.populateRentalReleaseSelect = populateRentalReleaseSelect;
    window.populateRentalCustomerSelect = populateRentalCustomerSelect;
    window.populateAllRentalSelects = populateAllRentalSelects;
    window.calculateRentalCost = calculateRentalCost;

})();
