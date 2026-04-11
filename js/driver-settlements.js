        function renderDriverLog() {
            const body = document.getElementById('dl-body');
            if (!body) return;
            body.innerHTML = '';

            const searchTerm = (document.getElementById('filter-search')?.value || '').toLowerCase();
            const dateFrom = document.getElementById('filter-from')?.value;
            const dateTo = document.getElementById('filter-to')?.value;

            if (currentTrips.length > 0) {
                const allRows = currentTrips;

                // 1. Filter the rows first
                const filtered = allRows.filter(r => {
                    const rDate = r[1];
                    const rDriver = (r[17] || 'UNASSIGNED').toString();
                    
                    // ROLE SECURITY: Driver ONLY sees their own name
                    if (window.currentUserRole === 'driver') {
                        const drvRef = (window.currentDriverNameRef || '').toLowerCase();
                        if (rDriver.toLowerCase() !== drvRef) return false;
                    }

                    const rStAmount = r[34];
                    const rCont = (r[3] || '').toString();
                    const rOrder = (r[5] || '').toString();

                    const rStatus = r[41];

                    const matchesSearch = !searchTerm || rDriver.toLowerCase().includes(searchTerm)
                        || rCont.toLowerCase().includes(searchTerm)
                        || rOrder.toLowerCase().includes(searchTerm);
                    const matchesDate = (!dateFrom || rDate >= dateFrom) && (!dateTo || rDate <= dateTo);
                    const isComplete = (rStatus === 'PAID');

                    return matchesSearch && matchesDate && isComplete;
                });

                if (window.updateWeeklyCalc) window.updateWeeklyCalc();

                // --- DRIVER LOG LOGIC ---
                let selectedIndices = new Set();
                let currentFilteredRows = []; // Keep global reference for select all

                window.toggleSelectAllDrivers = function () {
                    const rows = body.querySelectorAll('tr:not(.selection-summary-row)');
                    if (selectedIndices.size === currentFilteredRows.length && currentFilteredRows.length > 0) {
                        // Deselect All
                        selectedIndices.clear();
                        rows.forEach(r => r.classList.remove('selected-row'));
                    } else {
                        // Select All
                        currentFilteredRows.forEach((_, idx) => selectedIndices.add(idx));
                        rows.forEach(r => r.classList.add('selected-row'));
                    }
                    updateSelectionSummary();
                }

                const updateSelectionSummary = () => {
                    // Remove existing summary row
                    const existing = document.getElementById('dl-selection-summary');
                    if (existing) existing.remove();

                    // Elements used by calculator
                    const cashCollInput = document.getElementById('calc-cash-coll');
                    const grossInput = document.getElementById('calc-gross');

                    if (selectedIndices.size === 0) {
                        if (cashCollInput) cashCollInput.value = "0.00";
                        if (grossInput) grossInput.value = "0.00";
                        if (window.updateWeeklyCalc) window.updateWeeklyCalc();
                        return;
                    }

                    let totalPaidDriverGross = 0; // Sum of raw Paid Driver (Index 24)
                    let totalAdjustedCommission = 0; // Contractor (100%) or RP/JR (30%)
                    let totalCash = 0;

                    selectedIndices.forEach(idx => {
                        const r = filtered[idx];
                        const grossVal = parseFloat(r[24]) || 0;
                        const company = (r[16] || '').trim().toUpperCase(); // CORRECT INDEX: baseValues[15] is rowData[16]

                        totalPaidDriverGross += grossVal;

                        // Apply 30% logic based on Company
                        if (company === 'RP TULIPAN' || company === 'JR SUPER CRAME') {
                            totalAdjustedCommission += grossVal * 0.3;
                        } else {
                            totalAdjustedCommission += grossVal; // Contractors get 100%
                        }

                        if (r[34] === 'PAID') { 
                            totalCash += parseFloat(r[22]) || 0; // Amount is Index 22
                        }
                    });

                    // SYNC WITH CALCULATOR
                    const calcGross = document.getElementById('calc-gross');
                    const calcCashColl = document.getElementById('calc-cash-coll');
                    
                    if (calcGross) {
                        // REQUIREMENT: Gross Amount field shows 100% of the sum
                        calcGross.value = totalPaidDriverGross.toFixed(2);
                        // We store the Adjusted Commission base as a hidden attribute for math
                        calcGross.dataset.adjusted = totalAdjustedCommission.toFixed(2);
                    }
                    if (calcCashColl) calcCashColl.value = totalCash.toFixed(2);

                    // Trigger the math for Balance and Driver Salary results
                    if (window.updateWeeklyCalc) window.updateWeeklyCalc();

                    const finalNet = totalPaidDriverGross - totalCash;

                    // Create Summary Row
                    const summaryTr = document.createElement('tr');
                    summaryTr.id = 'dl-selection-summary';
                    summaryTr.className = 'selection-summary-row';
                    summaryTr.innerHTML = `
                        <td colspan="9" style="text-align:right;">Selected Gross Summary (${selectedIndices.size} trips):</td>
                        <td style="color: #4ade80;">$${totalPaidDriverGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td>$${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    `;

                    // Update Main Calculator Inputs
                    if (cashCollInput) cashCollInput.value = totalCash.toFixed(2);
                    if (window.updateWeeklyCalc) window.updateWeeklyCalc();

                    // Insert after the last selected actual row in the DOM
                    let lastSelectedRow = null;
                    const rows = body.querySelectorAll('tr:not(.selection-summary-row)');
                    selectedIndices.forEach(idx => {
                        if (rows[idx]) lastSelectedRow = rows[idx];
                    });

                    if (lastSelectedRow) {
                        lastSelectedRow.after(summaryTr);
                    }
                };

                // Render simple flat list of 11 columns
                currentFilteredRows = filtered;
                filtered.forEach((r, idx) => {
                    const tr = document.createElement('tr');
                    tr.style.cursor = 'pointer';
                    tr.onclick = (e) => {
                        if (selectedIndices.has(idx)) {
                            selectedIndices.delete(idx);
                            tr.classList.remove('selected-row');
                        } else {
                            selectedIndices.add(idx);
                            tr.classList.add('selected-row');
                        }
                        updateSelectionSummary();
                    };

                    // Columns Map: Date(1), Size(2), N.Cont(3), Order(5), City(6), PickUp(7), Delivery(8), Miles(10), Driver(17), PaidDriver(24), Cash(22)
                    const cellIndices = [1, 2, 3, 5, 6, 7, 8, 10, 17, 24, 22];

                    cellIndices.forEach((idx, i) => {
                        const td = document.createElement('td');
                        let value = r[idx] || '---';

                        // Specific logic for 'Paid Driver' column in Reports: show raw Paid Driver (Index 24)
                        if (idx === 24) { 
                            value = parseFloat(r[24]) || 0;
                        }

                        // Specific logic for the LAST column (Cash): only show if 'CASH' was checked (r[34] === 'PAID')
                        if (i === 10) { 
                            const isCashMarked = (r[34] === 'PAID');
                            value = isCashMarked ? (r[22] || '0.00') : '---';
                        }

                        td.textContent = value;
                        tr.appendChild(td);
                    });

                    body.appendChild(tr);
                });
                // Clean up footer for now as requested
                const footerLabel = document.getElementById('dl-footer-label');
                const totalDisplay = document.getElementById('dl-total-paid');
                if (footerLabel) footerLabel.textContent = "Report Entries:";
                if (totalDisplay) totalDisplay.textContent = filtered.length;

                // Initialize the Selection Summary (Resets calculator to 0 if nothing selected)
                updateSelectionSummary();
            }
        }

        window.updateNetPayInfo = function () {
            const elComp = document.getElementById('in-company');
            const elGross = document.getElementById('in-paiddriver');
            const info = document.getElementById('net-pay-info');
            if (!elComp || !elGross || !info) return;

            const company = elComp.value;
            const gross = parseFloat(elGross.value) || 0;

            if (company === 'RP TULIPAN' || company === 'JR SUPER CRAME') {
                info.textContent = `Monto neto para chofer: $${(gross * 0.3).toFixed(2)} (30% aplicado)`;
            } else {
                info.textContent = `Monto neto para chofer: $${gross.toFixed(2)} (100% aplicado)`;
            }
        }

        window.updateWeeklyCalc = function () {
            // Safety Check: Avoid breaking if calculator is not in the current view (Mobil/Desktop)
            const elGross = document.getElementById('calc-gross');
            const elFactory = document.getElementById('calc-factory');
            const elWeekly = document.getElementById('calc-weekly');
            const elCashColl = document.getElementById('calc-cash-coll');
            const elLastBal = document.getElementById('calc-last-bal');
            const resSalary = document.getElementById('res-driver-salary');
            const resCashBal = document.getElementById('res-cash-bal');

            if (!elGross || !elFactory || !elWeekly || !elCashColl || !elLastBal || !resSalary || !resCashBal) {
                console.log("Calculadora no presente en el DOM. Omitiendo recálculo.");
                return;
            }

            // 1. Right Side Calculation (Settlement)
            const displayGross = parseFloat(elGross.value) || 0;
            // Requirement: Math base is the adjusted commission (30% logic) if present, else fallback to displayed gross
            const mathGross = parseFloat(elGross.dataset.adjusted) || displayGross;
            
            const factoryPct = parseFloat(elFactory.value) || 0;
            const weeklyPayment = parseFloat(elWeekly.value) || 0;

            const factoringFee = mathGross * (factoryPct / 100);
            const settlementSalary = mathGross - factoringFee - weeklyPayment;

            // Updated RIGHT result box
            resSalary.textContent = `$${settlementSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            // 2. Link RIGHT result to LEFT 'Driver Salary' display
            const linkedDisplay = document.getElementById('res-linked-salary');
            if (linkedDisplay) linkedDisplay.textContent = `$${settlementSalary.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;

            // 3. Left Side Calculation (Cash Balance)
            const cashColl = parseFloat(elCashColl.value) || 0;
            const lastBal = parseFloat(elLastBal.value) || 0;

            // Formula: Cash Balance = (Cash Collected + Last Week Balance) - Driver Salary (Settlement result)
            const cashTotal = (cashColl + lastBal) - settlementSalary;

            resCashBal.textContent = `$${cashTotal.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
        }

        // --- settlement ARCHIVING SYSTEM ---
        let currentSettlements = [];

        async function fetchHistory() {
            console.log("Attempting to fetch history from Supabase...");
            try {
                const { data, error } = await db
                    .from('settlement_history')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error("DB Error fetching history:", error.message);
                    throw error;
                }

                console.log(`Success: Fetched ${data ? data.length : 0} settlement records.`);
                currentSettlements = data || [];

                if (currentSettlements.length === 0) {
                    console.log("INFO: No settlement history found in database.");
                }

                renderSettlementHistory();
            } catch (err) {
                console.error("CRITICAL: fetchHistory failed ->", err);
            }
        }
        window.fetchHistory = fetchHistory;
        // Alias for backward compatibility if needed
        window.loadSettlements = fetchHistory;

        function renderSettlementHistory() {
            const body = document.getElementById('settlement-history-body');
            const filterValue = (document.getElementById('history-local-filter')?.value || '').toLowerCase();
            const globalDriver = (document.getElementById('filter-search')?.value || '').toLowerCase();
            const globalType = document.getElementById('settlement-payment-type')?.value || '';

            if (!body) return;

            body.innerHTML = '';

            // Filter data locally if a search term exists (Universal Global Filter Logic)
            const filtered = currentSettlements.filter(s => {
                const sDrv = (s.driver_name || '').toLowerCase();
                
                // ROLE SECURITY: Driver ONLY sees their own history
                if (window.currentUserRole === 'driver') {
                    const drvRef = (window.currentDriverNameRef || '').toLowerCase();
                    if (sDrv !== drvRef) return false;
                }

                const matchLocal = sDrv.includes(filterValue);
                const matchGlobalDriver = sDrv.includes(globalDriver);
                // Currently history table only has driver_name filter but we prepare for others
                return matchLocal && matchGlobalDriver;
            });

            if (filtered.length === 0) {
                body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color: #64748b; font-style: italic;">No records matching filter.</td></tr>`;
                return;
            }

            filtered.forEach(s => {
                const tr = document.createElement('tr');
                const fDate = (d) => {
                    if (!d) return '---';
                    const dateObj = new Date(d + 'T00:00:00');
                    // Changed to DD/MM/YYYY as requested (Spanish style)
                    const d1 = dateObj.getDate().toString().padStart(2, '0');
                    const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                    const y = dateObj.getFullYear();
                    return `${d1}/${m}/${y}`;
                };

                // Aging Calculation
                let agingText = '---';
                if (s.start_date) {
                    const start = new Date(s.start_date + 'T00:00:00');
                    const diff = new Date() - start;
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    agingText = days >= 0 ? `${days} days` : 'Future';
                }

                const balance = s.cash_balance || 0;
                const balanceColor = balance < 0 ? '#ef4444' : '#10b981';

                tr.innerHTML = `
                    <td style="font-weight: 700; color: #1e293b;">${s.driver_name || 'UNASSIGNED'}</td>
                    <td style="color: #475569;">${fDate(s.start_date)}</td>
                    <td style="color: #475569;">${fDate(s.end_date)}</td>
                    <td style="color: #64748b; font-size: 0.85rem;">${agingText}</td>
                    <td style="font-weight: 800; color: ${balanceColor}; font-size: 1.1rem;">
                        $${balance.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                    </td>
                    ${window.currentUserRole !== 'driver' ? `
                    <td style="text-align: center;">
                        ${window.currentUserRole === 'admin' ? `
                        <button onclick="deleteSettlement('${s.id}')" class="btn-cancel" style="padding: 5px 10px; font-size: 0.7rem; background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;">
                            <i class="fas fa-trash"></i> DELETE
                        </button>` : '---'}
                    </td>` : ''}
                `;
                body.appendChild(tr);
            });
        }

        function syncDriverNames() {
            const selectEl = document.getElementById('filter-search');
            let val = 'UNASSIGNED';
            const display = document.getElementById('display-driver-sync');
            if (!display) return;

            if (selectEl && selectEl.value) {
                val = selectEl.options[selectEl.selectedIndex].text;
                display.style.color = '#166534'; // Dark green
                display.style.background = '#dcfce7'; // Light green
                display.style.borderColor = '#22c55e';
            } else {
                display.style.color = '#b91c1c'; // Dark red
                display.style.background = '#fee2e2'; // Light red
                display.style.borderColor = '#ef4444';
            }
            display.textContent = val.toUpperCase();
        }

        async function archiveSettlement() {
            // SCOPED CAPTURE: Searching specifically within the reports panel to avoid grabbing dates from 'New Trip Entry'
            const panel = document.getElementById('reports-view');
            if (!panel) return;

            let fromField = panel.querySelector('#filter-from') || panel.querySelectorAll('input[type="date"]')[0];
            let toField = panel.querySelector('#filter-to') || panel.querySelectorAll('input[type="date"]')[1];
            let searchField = panel.querySelector('#filter-search');

            const val_inicio = fromField ? fromField.value : '';
            const val_final = toField ? toField.value : '';
            const val_search = searchField ? searchField.value : '';

            const cashField = document.getElementById('res-cash-bal');
            const statusField = document.getElementById('settlement-status');
            const typeField = document.getElementById('settlement-payment-type');

            const val_status = statusField ? statusField.value : 'PENDING';
            const val_type = typeField ? typeField.value : 'CASH';

            // DIAGNOSTIC LOGGING
            console.log("Archive CAPTURE Scoped ->", {
                InitialValue: val_inicio,
                FinalValue: val_final,
                DriverSelected: val_search
            });

            const driverNameFinal = val_search.trim().toUpperCase() || 'UNASSIGNED';

            // VALIDATION: Dates are mandatory for archiving
            if (!val_inicio || !val_final) {
                alert(`Selecciona el rango de fechas antes de archivar.\n(Asegúrate de llenar los campos INITIAL y FINAL DATE arriba)`);
                return;
            }

            const cashText = cashField ? cashField.textContent : '$0,00';
            const cashAmountFinal = parseFloat(cashText.replace('$', '').replace(/\./g, '').replace(',', '.')) || 0;

            if (!confirm(`Are you sure you want to ARCHIVE this settlement for ${driverNameFinal}?`)) return;

            const entry = {
                driver_name: driverNameFinal,
                start_date: val_inicio,
                end_date: val_final,
                cash_balance: cashAmountFinal,
                status: val_status,
                payment_type: val_type
            };

            try {
                const { error } = await db.from('settlement_history').insert([entry]);
                if (error) throw error;

                // AUTOMATIC EXPENSE INTEGRATION
                const resSalary = document.getElementById('res-driver-salary');
                const salaryStr = resSalary ? resSalary.textContent : '$0,00';
                const salaryVal = parseFloat(salaryStr.replace('$', '').replace(/\./g, '').replace(',', '.')) || 0;

                // Date Fallback: Use selected final date or Today
                const expenseDate = val_final || new Date().toISOString().split('T')[0];

                const expData = [
                    expenseDate,
                    'Driver Payment',
                    `Liquidación de ${driverNameFinal} - ${expenseDate}`,
                    `$${salaryVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                    `Auto-generated from Driver Settlement Archive`
                ];

                const expenseObj = mapArrayToExpense(expData);
                await addExpense(expenseObj);

                alert("Archive & Expense Saved Successfully!");

                // Clear Calculators
                const ids = ['calc-cash-coll', 'calc-last-bal', 'calc-gross', 'calc-factory', 'calc-weekly'];
                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = 0;
                });

                updateWeeklyCalc();
                if (window.fetchHistory) window.fetchHistory();
            } catch (err) {
                console.error("Archive failed:", err);
                alert("DATABASE ERROR: " + (err.message || "Unknown error"));
            }
        }
        window.archiveSettlement = archiveSettlement;

        async function deleteSettlement(id) {
            if (!confirm("Are you sure you want to delete this historical record?")) return;
            try {
                const { error } = await db.from('settlement_history').delete().eq('id', id);
                if (error) throw error;
                fetchHistory();
            } catch (err) {
                alert("Delete failed: " + err.message);
            }
        }
        window.deleteSettlement = deleteSettlement;

        // New logic for Release Row addition (SUPABASE)
        window.addReleaseRow = async () => {
            const relNo = document.getElementById('rel-no-releases').value;
            const dte = document.getElementById('rel-date').value || '---';
            const cty = document.getElementById('rel-city').value || '---';
            const dpt = document.getElementById('rel-depot').value || '---';
            const adr = document.getElementById('rel-address').value || '---';
            const slr = document.getElementById('rel-seller').value || '---';

            // Unified Inputs
            const fullSize = document.getElementById('rel-size-detail').value;
            const qty = parseInt(document.getElementById('rel-qty-unified').value) || 0;
            const price = parseFloat(document.getElementById('rel-price-unified').value) || 0;
            const type = document.querySelector('input[name="rel-uni-type"]:checked').value;
            const condition = document.querySelector('input[name="rel-uni-cond"]:checked').value;

            if (!relNo) { alert('Please enter a Release Number'); return; }
            if (!fullSize) { alert('Please select a container size'); return; }
            if (qty <= 0 && !editingReleaseId) { alert('Please enter a quantity greater than 0'); return; }

            // Map specific size to the old base columns for backward compatibility
            let q20 = 0, q40 = 0, q45 = 0;
            let p20 = 0, p40 = 0, p45 = 0;

            if (fullSize.startsWith("20")) { q20 = qty; p20 = price; }
            else if (fullSize.startsWith("40")) { q40 = qty; p40 = price; }
            else if (fullSize.startsWith("45")) { q45 = qty; p45 = price; }

            // STOCK PRESERVATION LOGIC (for edits)
            let finalStock = qty;
            if (editingReleaseId) {
                const oldRel = currentReleases.find(r => r[15] === editingReleaseId);
                if (oldRel) {
                    const oldInitial = (parseInt(oldRel[7]) || 0) + (parseInt(oldRel[9]) || 0) + (parseInt(oldRel[11]) || 0);
                    const oldStock = parseInt(oldRel[14]) || 0;
                    const sold = Math.max(0, oldInitial - oldStock);
                    finalStock = Math.max(0, qty - sold);
                }
            }

            const relObj = {
                release_no: relNo,
                date: dte === '---' ? null : dte,
                type: type,
                condition: condition,
                depot: dpt,
                depot_address: adr,
                city: cty,
                qty_20: q20,
                price_20: p20,
                qty_40: q40,
                price_40: p40,
                qty_45: q45,
                price_45: p45,
                seller: slr,
                total_stock: finalStock,
                container_size: fullSize,
                paid: document.getElementById('rel-paid').checked,
                is_cash: document.getElementById('rel-is-cash').checked
            };

            try {
                if (editingReleaseId) {
                    const targets = (window.selectedReleaseIds && window.selectedReleaseIds.length > 1) ? window.selectedReleaseIds : [editingReleaseId];
                    if (targets.length > 1) {
                        if (!confirm(`¿Actualizar estos ${targets.length} releases con la nueva información?`)) return;
                    }

                    for (const targetId of targets) {
                        let finalRelObj = { ...relObj };

                        // Recalculate stock specifically for each release in the selection
                        const targetRel = currentReleases.find(r => r[15] === targetId);
                        if (targetRel) {
                            const oldInitial = (parseInt(targetRel[7]) || 0) + (parseInt(targetRel[9]) || 0) + (parseInt(targetRel[11]) || 0);
                            const oldStock = parseInt(targetRel[14]) || 0;
                            const sold = Math.max(0, oldInitial - oldStock);
                            finalRelObj.total_stock = Math.max(0, qty - sold);
                        }

                        await updateRelease(targetId, finalRelObj);
                    }
                    alert("Releases actualizados correctamente.");
                    window.selectedReleaseIds = []; // Clear selection after update
                } else {
                    await addRelease(relObj);
                    alert("Release added successfully!");
                }
                resetReleaseForm();
                await loadReleasesData();
                if (window.updateReleaseDatalist) window.updateReleaseDatalist();
            } catch (err) {
                alert("Operation failed: " + err.message);
            }
        };

