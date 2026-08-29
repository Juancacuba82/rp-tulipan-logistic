        function renderDriverLog() {
            window.renderDriverLog = renderDriverLog; // Export to window
            
            // NEW: Filter driver dropdown based on dates
            if (window.updateAvailableDriversForReport) {
                window.updateAvailableDriversForReport();
            }

            const body = document.getElementById('dl-body');
            const searchInput = document.getElementById('filter-search');
            if (!body) return;

            // REMOVED: Auto-fill for drivers - ensures clean filters upon entry
            // If the user is a driver, the hard security filter below (line 38)
            // will still ensure they only see their own trips.

            body.innerHTML = '';

            const searchTerm = (searchInput?.value || '').toLowerCase();
            const dateFrom = document.getElementById('filter-from')?.value;
            const dateTo = document.getElementById('filter-to')?.value;

            const sourceTrips = (window.driverReportTrips && window.driverReportTrips.length > 0) ? window.driverReportTrips : window.currentTrips;

            if (sourceTrips && sourceTrips.length > 0) {
                const allRows = sourceTrips;

                // 1. Filter the rows first
                const filtered = allRows.filter(r => {
                    const rDate = r[1];
                    const rDriver = (r[17] || 'UNASSIGNED').toString();
                    
                    // ROLE SECURITY: Driver ONLY sees their own name
                    if (window.currentUserRole === 'driver') {
                        const drvRef = (window.currentDriverNameRef || '').toLowerCase();
                        const rDrvClean = rDriver.toLowerCase().replace(/[^a-z0-9]/gi, '');
                        const drvRefClean = drvRef.toLowerCase().replace(/[^a-z0-9]/gi, '');
                        if (rDrvClean.length === 0 || drvRefClean.length === 0) return false;
                        if (!rDrvClean.includes(drvRefClean) && !drvRefClean.includes(rDrvClean)) return false;
                    }

                    const rStAmount = r[34];
                    const rCont = (r[3] || '').toString();
                    const rOrder = (r[5] || '').toString();

                    const rStatus = (r[41] || '').toUpperCase();

                    const matchesSearch = !searchTerm || rDriver.toLowerCase().trim() === searchTerm.trim()
                        || rCont.toLowerCase().includes(searchTerm)
                        || rOrder.toLowerCase().includes(searchTerm);
                    const matchesDate = (!dateFrom || rDate >= dateFrom) && (!dateTo || rDate <= dateTo);
                    
                    // Asegurarnos de que no filtre "PENDING"
                    // BUG FIX: PENDING_PAYMENT es el estado guardado cuando la orden sigue en "Pending" en el UI.
                    const isComplete = (rStatus === 'PAID' || rStatus === 'COMPLETE');

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
                        // Only reset to 0 if NOT in edit mode
                        if (!editingSettlementId) {
                            if (cashCollInput) cashCollInput.value = "0";
                            if (grossInput) grossInput.value = "0";
                            if (window.updateWeeklyCalc) window.updateWeeklyCalc();
                        }
                        return;
                    }

                    let totalPaidDriverGross = 0; // Sum of raw Paid Driver (Index 24)
                    let totalAdjustedCommission = 0; // Contractor (100%) or RP/JR (30%)
                    let totalCash = 0;

                    selectedIndices.forEach(idx => {
                        const r = filtered[idx];
                        const grossVal = (parseFloat(r[24]) || 0) * (parseInt(r[53]) || 1);
                        const company = (r[16] || '').trim().toUpperCase(); // CORRECT INDEX: baseValues[15] is rowData[16]

                        totalPaidDriverGross += grossVal;

                        // Apply 30% logic based on Company
                        if (company === 'RP TULIPAN' || company === 'JR SUPER CRANE') {
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
                window.currentFilteredRowsDriver = filtered; // Expose for driver confirmation total
                const isAdminView = (window.currentUserRole === 'admin');
                const fragment = document.createDocumentFragment();
                filtered.forEach((r, idx) => {
                    const tr = document.createElement('tr');
                    tr.style.cursor = 'pointer';
                    tr.onclick = (e) => {
                        if (e.target.closest('.cash-edit-btn')) return; // don't select when clicking edit
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
                    const tripId = r[0]; // Index 0 = trip_id

                    cellIndices.forEach((idx, i) => {
                        const td = document.createElement('td');
                        let value = r[idx] || '---';

                        if (idx === 1) {
                            value = window.formatDateMMDDYYYY(value);
                        }
                        else if (idx === 24) { 
                            value = (parseFloat(r[24]) || 0) * (parseInt(r[53]) || 1);
                        }

                        // Cash column: show value with inline edit button for admin
                        if (i === 10) { 
                            const isCashMarked = (r[34] === 'PAID');
                            const cashVal = isCashMarked ? parseFloat(r[22] || 0) : 0;
                            
                            if (isAdminView && isCashMarked) {
                                td.innerHTML = `
                                    <span style="display:flex; align-items:center; gap:6px;">
                                        <span class="cash-display-${tripId}" style="font-weight:700;">$${cashVal.toFixed(2)}</span>
                                        <button class="cash-edit-btn" onclick="window.editTripCash('${tripId}', ${cashVal})"
                                            style="background:#e0f2fe; border:none; color:#0284c7; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:0.7rem; font-weight:700;">
                                            <i class='fas fa-pen'></i>
                                        </button>
                                    </span>`;
                            } else {
                                td.textContent = isCashMarked ? `$${cashVal.toFixed(2)}` : '---';
                            }
                            tr.appendChild(td);
                            return;
                        }

                        td.textContent = value;
                        tr.appendChild(td);
                    });

                    fragment.appendChild(tr);
                });
                body.appendChild(fragment);
                // Clean up footer for now as requested
                const footerLabel = document.getElementById('dl-footer-label');
                const totalDisplay = document.getElementById('dl-total-paid');
                if (footerLabel) footerLabel.textContent = "Report Entries:";
                if (totalDisplay) totalDisplay.textContent = filtered.length;

                // Update Summary Card Counter
                const reportCountEl = document.getElementById('report-count-display');
                if (reportCountEl) {
                    reportCountEl.textContent = filtered.length;
                    // Visual feedback: green if filtering a specific driver
                    reportCountEl.style.color = searchTerm ? '#10b981' : '#1e293b';
                }

                // Initialize the Selection Summary (Resets calculator to 0 if nothing selected)
                updateSelectionSummary();

                // Check if this driver/week was already confirmed and color rows
                window.checkAndColorConfirmedTrips();
            }
        }

        // --- INLINE CASH EDITOR (Admin only) ---
        window.editTripCash = async function(tripId, currentVal) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot modify cash records.");
                return;
            }
            if (window.currentUserRole !== 'admin') return;

            const newValStr = prompt(
                `Edit cash received for this trip:\n(Current: $${parseFloat(currentVal).toFixed(2)})\n\nEnter new amount (0 if already fully collected):`,
                parseFloat(currentVal).toFixed(2)
            );
            if (newValStr === null) return; // cancelled

            const newVal = parseFloat(newValStr);
            if (isNaN(newVal) || newVal < 0) {
                alert('Please enter a valid number (0 or greater).');
                return;
            }

            try {
                const { error } = await db.from('trips').update({ amount: newVal }).eq('trip_id', tripId);
                if (error) throw error;

                // Update in-memory data so the UI reflects the change instantly
                if (window.currentTrips) {
                    const tripRow = window.currentTrips.find(t => t[0] === tripId);
                    if (tripRow) tripRow[22] = newVal;
                }

                // Update the displayed cash value in the cell without full re-render
                const displaySpan = document.querySelector(`.cash-display-${tripId}`);
                if (displaySpan) displaySpan.textContent = `$${newVal.toFixed(2)}`;
            } catch (err) {
                console.error('Error updating cash:', err);
                alert('Failed to update: ' + err.message);
            }
        };

        window.updateNetPayInfo = function () {
            const elComp = document.getElementById('in-company');
            const elGross = document.getElementById('in-paiddriver');
            const info = document.getElementById('net-pay-info');
            if (!elComp || !elGross || !info) return;

            const company = elComp.value;
            const gross = parseFloat(elGross.value) || 0;

            if (company === 'RP TULIPAN' || company === 'JR SUPER CRANE') {
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
            const salaryFormatted = settlementSalary.toLocaleString('de-DE', { minimumFractionDigits: 2 });
            resSalary.textContent = `$${salaryFormatted}`;
            resSalary.dataset.value = settlementSalary.toFixed(2);

            // 2. Link RIGHT result to LEFT 'Driver Salary' display
            const linkedDisplay = document.getElementById('res-linked-salary');
            if (linkedDisplay) linkedDisplay.textContent = `$${salaryFormatted}`;

            // 3. Left Side Calculation (Cash Balance)
            const cashColl = parseFloat(elCashColl.value) || 0;
            const lastBal = parseFloat(elLastBal.value) || 0;

            // Formula: Cash Balance = (Cash Collected + Last Week Balance) - Driver Salary (Settlement result)
            const cashTotal = (cashColl + lastBal) - settlementSalary;

            const cashFormatted = cashTotal.toLocaleString('de-DE', { minimumFractionDigits: 2 });
            resCashBal.textContent = `$${cashFormatted}`;
            resCashBal.dataset.value = cashTotal.toFixed(2);
        }

        // --- settlement ARCHIVING SYSTEM ---
        window.currentSettlements = [];
        let editingSettlementId = null;

        async function fetchHistory(force = false) {
            if (!force && window.currentSettlements && window.currentSettlements.length > 0) {
                renderSettlementHistory();
                if (window.syncDriverNames) window.syncDriverNames();
                return;
            }
            console.log("Attempting to fetch history from Supabase...");
            try {
                const { data, error } = await db.from('settlement_history')
                    .select('*')
                    .or('is_deleted.eq.false,is_deleted.is.null')
                    .order('created_at', { ascending: false })
                    .limit(500); // Optimization: Limit history load

                if (error) {
                    console.error("DB Error fetching history:", error.message);
                    throw error;
                }

                console.log(`Success: Fetched ${data ? data.length : 0} settlement records.`);
                window.currentSettlements = data || [];

                if (currentSettlements.length === 0) {
                    console.log("INFO: No settlement history found in database.");
                }

                renderSettlementHistory();
                
                // --- AUTOMATION: Ensure sync is called after history loads ---
                // This helps load the Last Week Balance if the driver was pre-selected (e.g. for driver role)
                if (window.syncDriverNames) window.syncDriverNames();
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
            const filtered = window.currentSettlements.filter(s => {
                const sDrv = (s.driver_name || '').toLowerCase();
                
                // ROLE SECURITY: Driver ONLY sees their own history (EXCEPT Robert Cortez)
                if (window.currentUserRole === 'driver') {
                    const drvRef = (window.currentDriverNameRef || '').toUpperCase();
                    if (drvRef !== "ROBERT CORTEZ") {
                        const drvClean = sDrv.replace(/[^a-z0-9]/gi, '');
                        const drvRefClean = drvRef.toLowerCase().replace(/[^a-z0-9]/gi, '');
                        if (drvClean.length === 0 || drvRefClean.length === 0 || (!drvClean.includes(drvRefClean) && !drvRefClean.includes(drvClean))) return false;
                    }
                }

                const matchLocal = sDrv.includes(filterValue);
                const matchGlobalDriver = !globalDriver || sDrv.trim() === globalDriver.trim();
                // Currently history table only has driver_name filter but we prepare for others
                return matchLocal && matchGlobalDriver;
            });

            if (filtered.length === 0) {
                body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px; color: #64748b; font-style: italic;">No records matching filter.</td></tr>`;
                return;
            }

            filtered.forEach(s => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.title = "Click to load into calculator";
                tr.onclick = () => loadSettlementToCalculator(s.id);
                
                const fDate = (d) => window.formatDateMMDDYYYY(d);
                
                // Color highlight if editing
                if (editingSettlementId === s.id) {
                    tr.style.background = '#fef3c7';
                    tr.style.border = '2px solid #f59e0b';
                }

                const balance = s.cash_balance || 0;
                const displayBalance = Math.max(0, balance);
                const balanceColor = displayBalance === 0 ? '#64748b' : '#10b981';

                const dSalary = s.driver_salary || 0;
                const absSalary = Math.abs(dSalary);
                const cashAdvance = s.cash_collected || 0;

                // Calculate Aging (Days between start and end)
                const start = new Date(s.start_date);
                const end = new Date(s.end_date);
                const diffTime = Math.abs(end - start);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 0;

                // Status Badge Logic (Subtle indicator for Admin only)
                let statusBadge = '';
                const status = s.status || 'PENDING';
                if (status === 'WAITING_REVIEW' && window.currentUserRole === 'admin') {
                    statusBadge = `<span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: 800; border: 1px solid #fde68a; margin-left: 8px; vertical-align: middle;">CONFIRM REQ.</span>`;
                }

                tr.innerHTML = `
                    <td style="font-weight: 700; color: #1e293b;">${s.driver_name || 'UNASSIGNED'} ${statusBadge}</td>
                    <td style="color: #475569;">${fDate(s.start_date)}</td>
                    <td style="color: #475569;">${fDate(s.end_date)}</td>
                    <td style="color: #64748b; font-size: 0.85rem;">${diffDays} Days</td>
                    <td style="font-weight: 800; color: #ef4444; font-size: 1.1rem; text-align: center !important;">
                        $${absSalary.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                    </td>
                    <td style="font-weight: 800; color: ${balanceColor}; font-size: 1.1rem; text-align: center !important;">
                        <span style="display:flex; align-items:center; justify-content:center; gap:6px;">
                            <span>$${displayBalance.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                            ${window.currentUserRole === 'admin' ? `
                            <button onclick="event.stopPropagation(); window.editSettlementCashBalance('${s.id}', ${displayBalance})"
                                style="background:#e0f2fe; border:none; color:#0284c7; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:0.7rem; font-weight:700;">
                                <i class='fas fa-pen'></i>
                            </button>
                            ` : ''}
                        </span>
                    </td>
                    ${window.currentUserRole !== 'driver' ? `
                    <td style="text-align: center;">
                        ${window.currentUserRole === 'admin' ? `
                        <button onclick="event.stopPropagation(); deleteSettlement('${s.id}')" class="btn-cancel" style="padding: 5px 10px; font-size: 0.7rem; background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;">
                            <i class="fas fa-trash"></i> DELETE
                        </button>` : '---'}
                    </td>` : ''}
                `;
                body.appendChild(tr);
            });
        }

        window.editSettlementCashBalance = async function(id, currentVal) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') return;

            const newValStr = prompt(
                `Edit Cash Balance for this settlement:\n(Current: $${parseFloat(currentVal).toFixed(2)})\n\nEnter new amount (e.g., 0 to clear balance):`,
                parseFloat(currentVal).toFixed(2)
            );
            if (newValStr === null) return; // cancelled

            const newVal = parseFloat(newValStr);
            if (isNaN(newVal)) {
                alert('Please enter a valid number.');
                return;
            }

            try {
                const { error } = await db.from('settlement_history').update({ cash_balance: newVal }).eq('id', id);
                if (error) throw error;

                // Update in-memory data
                const st = window.currentSettlements.find(s => String(s.id) === String(id));
                if (st) st.cash_balance = newVal;

                // Re-render table
                renderSettlementHistory();
                
                // If a driver is selected, sync to update the Last Week Balance field
                if (window.syncDriverNames) window.syncDriverNames();
            } catch (err) {
                console.error('Error updating cash balance:', err);
                alert('Failed to update: ' + err.message);
            }
        };

        window.loadSettlementToCalculator = function(id) {
            const settlement = window.currentSettlements.find(s => s.id === id);
            if (!settlement) {
                console.warn("Settlement not found for ID:", id);
                return;
            }

            // Set editing ID FIRST — this prevents updateSelectionSummary from resetting
            // the calculator to 0 when renderDriverLog clears the selection
            editingSettlementId = id;

            // --- Apply saved settlement values into the calculator IMMEDIATELY ---
            const elCashColl = document.getElementById('calc-cash-coll');
            const elLastBal  = document.getElementById('calc-last-bal');
            const elGross    = document.getElementById('calc-gross');
            const elFactory  = document.getElementById('calc-factory');
            const elWeekly   = document.getElementById('calc-weekly');

            if (elCashColl) elCashColl.value = settlement.cash_collected    ?? "0";
            if (elLastBal)  elLastBal.value  = settlement.last_week_balance ?? "0";
            if (elGross) {
                elGross.value            = settlement.gross_amount  ?? "0";
                elGross.dataset.adjusted = settlement.gross_adjusted ?? settlement.gross_amount ?? "0";
            }
            if (elFactory) elFactory.value = settlement.factory_fee_percent ?? "0";
            if (elWeekly)  elWeekly.value  = settlement.weekly_payment      ?? "0";

            // Load Status / Type dropdowns
            const statusField = document.getElementById('settlement-status');
            const typeField   = document.getElementById('settlement-payment-type');
            if (statusField) statusField.value = settlement.status       || 'PENDING';
            if (typeField) typeField.value   = settlement.payment_type || 'cash';

            // Restore payment method toggle visual
            if (window.selectSettlementPaymentMethod) {
                window.selectSettlementPaymentMethod((settlement.payment_type || 'cash').toLowerCase());
            }

            // Recalculate with the saved values
            if (window.updateWeeklyCalc) window.updateWeeklyCalc();

            // Update date filters (without triggering calculator reset from renderDriverLog)
            const fromField   = document.getElementById('filter-from');
            const toField     = document.getElementById('filter-to');
            const searchField = document.getElementById('filter-search');

            if (fromField) fromField.value = settlement.start_date || '';
            if (toField)   toField.value   = settlement.end_date   || '';

            if (searchField) {
                const options = Array.from(searchField.options);
                const matchingOpt = options.find(opt => opt.text.toUpperCase() === (settlement.driver_name || '').toUpperCase());
                if (matchingOpt) searchField.value = matchingOpt.value;
            }

            // Sync UI driver name display
            if (window.syncDriverNames) window.syncDriverNames();

            // Update button UI to "UPDATE" mode
            const btnArchive = document.getElementById('btn-archive-settlement');
            const btnCancel  = document.getElementById('btn-cancel-settlement-edit');
            if (btnArchive) {
                btnArchive.innerHTML = '<i class="fas fa-save"></i> UPDATE SETTLEMENT';
                btnArchive.style.background = '#2563eb';
            }
            if (btnCancel) btnCancel.style.display = 'block';

            // Scroll to calculator
            document.querySelector('.weekly-calculator-container')?.scrollIntoView({ behavior: 'smooth' });

            // Refresh history highlight (to show which row is selected)
            renderSettlementHistory();

            console.log("Settlement loaded into calculator:", {
                driver: settlement.driver_name,
                gross: settlement.gross_amount,
                cash_collected: settlement.cash_collected,
                cash_balance: settlement.cash_balance
            });
        };

        window.resetSettlementEdit = function() {
            editingSettlementId = null;
            
            const btnArchive = document.getElementById('btn-archive-settlement');
            const btnCancel = document.getElementById('btn-cancel-settlement-edit');
            if (btnArchive) {
                btnArchive.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> ARCHIVE SETTLEMENT';
                btnArchive.style.background = '#10b981';
            }
            if (btnCancel) btnCancel.style.display = 'none';

            // Clear inputs
            const ids = ['calc-cash-coll', 'calc-last-bal', 'calc-gross', 'calc-factory', 'calc-weekly'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = 0;
            });

            // Reset payment method to CASH
            if (window.selectSettlementPaymentMethod) window.selectSettlementPaymentMethod('cash');

            if (window.updateWeeklyCalc) window.updateWeeklyCalc();
            renderSettlementHistory();
        };

        // =========================================================================
        // PAYMENT METHOD TOGGLE — selectSettlementPaymentMethod
        // =========================================================================
        window.selectSettlementPaymentMethod = function(method) {
            const cashR = document.getElementById('spm-cash');
            const bankR = document.getElementById('spm-bank');
            const splitR = document.getElementById('spm-split');
            if (cashR) cashR.checked = (method === 'cash');
            if (bankR) bankR.checked = (method === 'bank');
            if (splitR) splitR.checked = (method === 'split');

            const hidden = document.getElementById('settlement-payment-type');
            if (hidden) hidden.value = method;

            const styles = {
                cash:  { el: 'spm-cash-label',  bg: '#10b981', border: '#10b981' },
                bank:  { el: 'spm-bank-label',  bg: '#3b82f6', border: '#3b82f6' },
                split: { el: 'spm-split-label', bg: '#7c3aed', border: '#7c3aed' }
            };
            ['cash', 'bank', 'split'].forEach(m => {
                const el = document.getElementById(styles[m].el);
                if (!el) return;
                if (m === method) {
                    el.style.background = styles[m].bg;
                    el.style.borderColor = styles[m].border;
                    el.style.color = 'white';
                } else {
                    el.style.background = 'white';
                    el.style.borderColor = '#cbd5e1';
                    el.style.color = '#64748b';
                }
            });

            const splitFields = document.getElementById('spm-split-fields');
            if (splitFields) splitFields.style.display = (method === 'split') ? 'block' : 'none';
            if (method === 'split' && window.validateSplitAmounts) window.validateSplitAmounts();
        };

        window.validateSplitAmounts = function() {
            const cashAmt = parseFloat(document.getElementById('spm-split-cash')?.value) || 0;
            const bankAmt = parseFloat(document.getElementById('spm-split-bank')?.value) || 0;
            const sum = cashAmt + bankAmt;
            const salaryEl = document.getElementById('res-driver-salary');
            const salary = Math.abs(parseFloat(salaryEl?.dataset?.value) || 0);
            const sumDisplay = document.getElementById('spm-split-sum-display');
            const statusEl   = document.getElementById('spm-split-status');
            const fmt = n => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
            if (sumDisplay) sumDisplay.textContent = `${fmt(sum)} / ${fmt(salary)}`;
            const isOk = Math.abs(sum - salary) < 0.01;
            if (statusEl) {
                if (isOk) {
                    statusEl.textContent = '✅ Cuadra perfecto';
                    statusEl.style.color = '#15803d';
                    if (sumDisplay) sumDisplay.style.color = '#15803d';
                } else {
                    const diff = salary - sum;
                    statusEl.textContent = diff > 0 ? `⚠ Faltan: ${fmt(diff)}` : `⚠ Excede: ${fmt(-diff)}`;
                    statusEl.style.color = '#ef4444';
                    if (sumDisplay) sumDisplay.style.color = '#ef4444';
                }
            }
            return isOk;
        };

        function syncDriverNames() {
            const selectEl = document.getElementById('filter-search');
            let val = 'UNASSIGNED';
            const display = document.getElementById('display-driver-sync');
            if (!display) return;

            if (selectEl && selectEl.value && selectEl.selectedIndex !== -1) {
                const opt = selectEl.options[selectEl.selectedIndex];
                if (opt) val = opt.text;
            }

            if (val !== 'UNASSIGNED' && val !== 'All Drivers') {
                display.style.color = '#166534'; // Dark green
                display.style.background = '#dcfce7'; // Light green
                display.style.borderColor = '#22c55e';
                
                // --- AUTOMATION: Auto-load Last Week Balance from History ---
                if (!editingSettlementId) {
                    const driverName = val.toUpperCase();
                    // Find most recent settlement for this driver
                    const lastSettlement = window.currentSettlements.find(s => (s.driver_name || '').toUpperCase() === driverName);
                    const elLastBal = document.getElementById('calc-last-bal');
                    
                    if (elLastBal) {
                        if (lastSettlement && lastSettlement.cash_balance > 0) {
                            elLastBal.value = lastSettlement.cash_balance.toFixed(2);
                            console.log(`Auto-loaded balance for ${driverName}: $${lastSettlement.cash_balance}`);
                        } else {
                            elLastBal.value = 0;
                        }
                        // Trigger recalculation
                        if (window.updateWeeklyCalc) window.updateWeeklyCalc();
                    }
                }
            } else {
                display.style.color = '#b91c1c'; // Dark red
                display.style.background = '#fee2e2'; // Light red
                display.style.borderColor = '#ef4444';
            }
            display.textContent = val.toUpperCase();
        }

        async function archiveSettlement() {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot create or modify settlements.");
                return;
            }
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
            const salaryField = document.getElementById('res-driver-salary');
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

            const cashAmountFinal = cashField ? (parseFloat(cashField.dataset.value) || 0) : 0;
            const salaryAmountFinal = salaryField ? (parseFloat(salaryField.dataset.value) || 0) : 0;

            // Validate SPLIT mode before confirming
            if (val_type === 'split') {
                const isValid = window.validateSplitAmounts ? window.validateSplitAmounts() : false;
                if (!isValid) {
                    alert('⚠ SPLIT MODE: La suma de Cash Amount y Bank Amount debe ser igual al Net Driver Salary antes de archivar.');
                    return;
                }
            }

            const confirmMsg = editingSettlementId 
                ? `Are you sure you want to UPDATE this settlement for ${driverNameFinal}?`
                : `Are you sure you want to ARCHIVE this settlement for ${driverNameFinal}?`;

            if (!confirm(confirmMsg)) return;

            // Calculator Data Capture
            const cashColl = parseFloat(document.getElementById('calc-cash-coll')?.value) || 0;
            const lastBal = parseFloat(document.getElementById('calc-last-bal')?.value) || 0;
            const grossRaw = parseFloat(document.getElementById('calc-gross')?.value) || 0;
            const grossAdj = parseFloat(document.getElementById('calc-gross')?.dataset.adjusted) || grossRaw;
            const factoryPct = parseFloat(document.getElementById('calc-factory')?.value) || 0;
            const weeklyPay = parseFloat(document.getElementById('calc-weekly')?.value) || 0;

            const entry = {
                driver_name: driverNameFinal,
                start_date: val_inicio,
                end_date: val_final,
                cash_balance: cashAmountFinal,
                driver_salary: salaryAmountFinal,
                status: val_status,
                payment_type: val_type,
                // Calculator Inputs
                cash_collected: cashColl,
                last_week_balance: lastBal,
                gross_amount: grossRaw,
                gross_adjusted: grossAdj,
                factory_fee_percent: factoryPct,
                weekly_payment: weeklyPay
            };

            try {
                let error;
                let targetSettlementId = editingSettlementId;
                if (editingSettlementId) {
                    const result = await db.from('settlement_history').update(entry).eq('id', editingSettlementId);
                    error = result.error;
                } else {
                    // --- DUPLICATE CHECK ---
                    const { data: existing, error: checkError } = await db.from('settlement_history')
                        .select('id')
                        .eq('driver_name', driverNameFinal)
                        .eq('start_date', val_inicio)
                        .eq('end_date', val_final)
                        .or('is_deleted.eq.false,is_deleted.is.null');

                    if (checkError) throw checkError;
                    
                    if (existing && existing.length > 0) {
                        alert(`ERROR: Ya existe una liquidación archivada para ${driverNameFinal} en este mismo rango de fechas (${val_inicio} al ${val_final}).\n\nSi necesitas corregirla, por favor bórrala de la lista de abajo y vuelve a crearla.`);
                        return;
                    }

                    const result = await db.from('settlement_history').insert([entry]).select();
                    error = result.error;
                    if (!error && result.data && result.data.length > 0) {
                        targetSettlementId = result.data[0].id;
                    }
                }
                
                if (error) throw error;

                // AUTOMATIC EXPENSE INTEGRATION
                const expenseAmount = Math.abs(salaryAmountFinal);
                const expenseDate = val_final || new Date().toISOString().split('T')[0];
                const expenseDescription = `Liquidación de ${driverNameFinal} - ${expenseDate}`;
                const noteBase = `Auto-generated from Driver Settlement ID: ${targetSettlementId || 'Unknown'}`;

                if (window.mapArrayToExpense && window.addExpense) {
                    const buildExpenseObj = (amount, pm, label) => {
                        const desc = label || expenseDescription;
                        const rowData = [
                            expenseDate, 'Driver Payment', desc,
                            `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                            noteBase, null, pm
                        ];
                        return window.mapArrayToExpense(rowData);
                    };

                    // Helper: save one expense and immediately sync to Cash Ledger locally
                    const saveAndSync = async (expObj, syncMode) => {
                        const saved = await window.addExpense(expObj);
                        if (saved && saved.length > 0 && window.syncExpenseToLedger) {
                            window.syncExpenseToLedger(saved[0], syncMode);
                        }
                    };

                    if (editingSettlementId) {
                        // UPDATE: find and delete existing expense(s)
                        const noteSearch = `Auto-generated from Driver Settlement ID: ${editingSettlementId}`;
                        let { data: existingExps } = await db.from('expenses').select('id').ilike('note', `%${noteSearch}%`);

                        if (!existingExps || existingExps.length === 0) {
                            const oldSettlement = window.currentSettlements.find(s => s.id === editingSettlementId);
                            if (oldSettlement) {
                                const oldDesc1 = `Liquidación de ${oldSettlement.driver_name} - ${oldSettlement.end_date}`;
                                const oldDesc2 = `Updated de ${oldSettlement.driver_name} - ${oldSettlement.end_date}`;
                                const { data: fallbackExp } = await db.from('expenses').select('id')
                                    .eq('category', 'Driver Payment')
                                    .in('description', [oldDesc1, oldDesc2]);
                                if (fallbackExp && fallbackExp.length > 0) existingExps = fallbackExp;
                            }
                        }

                        // Delete old expense(s) — also sync deletion to Cash Ledger locally
                        if (existingExps && existingExps.length > 0) {
                            for (const exp of existingExps) {
                                await db.from('expenses').delete().eq('id', exp.id);
                                if (window.syncExpenseToLedger) window.syncExpenseToLedger({ id: exp.id }, 'delete');
                            }
                        }

                        // Re-create based on current payment method
                        if (val_type === 'split') {
                            const splitCash = parseFloat(document.getElementById('spm-split-cash')?.value) || 0;
                            const splitBank = parseFloat(document.getElementById('spm-split-bank')?.value) || 0;
                            if (splitCash > 0) await saveAndSync(buildExpenseObj(splitCash, 'cash', `${expenseDescription} (Cash)`), 'add');
                            if (splitBank > 0) await saveAndSync(buildExpenseObj(splitBank, 'bank', `${expenseDescription} (Bank)`), 'add');
                        } else {
                            await saveAndSync(buildExpenseObj(expenseAmount, val_type === 'bank' ? 'bank' : 'cash'), 'add');
                        }

                    } else {
                        // NEW SETTLEMENT: create expense(s)
                        if (val_type === 'split') {
                            const splitCash = parseFloat(document.getElementById('spm-split-cash')?.value) || 0;
                            const splitBank = parseFloat(document.getElementById('spm-split-bank')?.value) || 0;
                            if (splitCash > 0) await saveAndSync(buildExpenseObj(splitCash, 'cash', `${expenseDescription} (Cash)`), 'add');
                            if (splitBank > 0) await saveAndSync(buildExpenseObj(splitBank, 'bank', `${expenseDescription} (Bank)`), 'add');
                        } else {
                            await saveAndSync(buildExpenseObj(expenseAmount, val_type === 'bank' ? 'bank' : 'cash'), 'add');
                        }
                    }
                }


                if (window.fetchHistory) await window.fetchHistory(true); 
                if (window.loadExpensesData) await window.loadExpensesData(true);

                alert(editingSettlementId ? "Settlement Updated Successfully!" : "Archive & Expense Saved Successfully!");
                resetSettlementEdit();
                // if (window.fetchHistory) window.fetchHistory(); // Handled above
            } catch (err) {
                console.error("Archive/Update failed:", err);
                alert("DATABASE ERROR: " + (err.message || "Unknown error"));
            }
        }
        window.archiveSettlement = archiveSettlement;

        async function deleteSettlement(id) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot delete settlements.");
                return;
            }
            if (!confirm("Are you sure you want to delete this historical record?")) return;
            try {
                const { error } = await db.from('settlement_history').update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: window.userEmail }).eq('id', id);
                if (error) throw error;
                if (window.logActivity) window.logActivity("DELETED_RECORD", `[${new Date().toLocaleString()}] Eliminó Settlement/Liquidación ID: ${id}`);
                fetchHistory(true);
            } catch (err) {
                alert("Delete failed: " + err.message);
            }
        }
        window.deleteSettlement = deleteSettlement;

        window.confirmReportByDriver = async function() {
            if (window.currentUserRole !== 'driver') return;

            const fromField = document.getElementById('filter-from');
            const toField   = document.getElementById('filter-to');
            const fromVal   = fromField?.value || '';
            const toVal     = toField?.value   || '';

            if (!fromVal || !toVal) {
                alert('Please select your week dates (Initial and Final Date) before confirming.');
                return;
            }

            const driverName = (window.currentDriverNameRef || '').toUpperCase();
            if (!driverName) {
                alert('Could not identify your driver profile. Please log in again.');
                return;
            }

            const totalPaidDriver = (window.currentFilteredRowsDriver || []).reduce((sum, r) => {
                return sum + ((parseFloat(r[24]) || 0) * (parseInt(r[53]) || 1));
            }, 0);

            if (!confirm(`Confirm that your trips from ${fromVal} to ${toVal} are correct?\n\nBy confirming, you are letting the admin know that you have reviewed your trips for this week.\n\nContinue?`)) return;

            const btn = document.getElementById('btn-driver-confirm-report');
            if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

            try {
                // Store confirmation in activity_logs — does NOT touch settlement_history
                const { data: { session } } = await db.auth.getSession();
                const { error } = await db.from('activity_logs').insert([{
                    user_email:  session?.user?.email || driverName,
                    action_type: 'DRIVER_CONFIRMED',
                    details:     JSON.stringify({ driver_name: driverName, start_date: fromVal, end_date: toVal, total: totalPaidDriver }),
                    view_date:   new Date().toISOString().split('T')[0]
                }]);
                if (error) throw error;

                alert(`✅ Confirmed! Admin will see your trips marked as reviewed.`);
                // Re-render so rows turn green immediately for the driver too
                if (window.renderDriverLog) window.renderDriverLog();
            } catch (err) {
                console.error('Confirmation failed:', err);
                alert('Error: ' + (err.message || 'Unknown error'));
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-double"></i> MY TRIPS ARE CORRECT — NOTIFY ADMIN'; }
            }
        };

        // Checks activity_logs for a DRIVER_CONFIRMED record matching current filter.
        // If found, paints all trip rows green so admin can see the driver reviewed them.
        window.checkAndColorConfirmedTrips = async function() {
            const body = document.getElementById('dl-body');
            if (!body) return;

            const filterFrom   = document.getElementById('filter-from')?.value || '';
            const filterTo     = document.getElementById('filter-to')?.value   || '';
            const driverFilter = (document.getElementById('filter-search')?.value || '').toUpperCase();

            // Need both dates AND a specific driver selected to check
            if (!filterFrom || !filterTo || !driverFilter) return;

            try {
                const { data, error } = await db.from('activity_logs')
                    .select('details')
                    .eq('action_type', 'DRIVER_CONFIRMED');

                if (error || !data || data.length === 0) return;

                const isConfirmed = data.some(log => {
                    try {
                        const d = JSON.parse(log.details || '{}');
                        return d.driver_name === driverFilter &&
                               d.start_date  === filterFrom   &&
                               d.end_date    === filterTo;
                    } catch { return false; }
                });

                const rows = body.querySelectorAll('tr');
                const indicator = document.getElementById('driver-confirmed-indicator');

                if (isConfirmed) {
                    rows.forEach(tr => {
                        tr.style.backgroundColor = '#dcfce7';
                        tr.style.borderLeft = '4px solid #16a34a';
                    });
                    if (indicator) indicator.style.display = 'flex';
                } else {
                    rows.forEach(tr => {
                        tr.style.backgroundColor = '';
                        tr.style.borderLeft = '';
                    });
                    if (indicator) indicator.style.display = 'none';
                }
            } catch (err) {
                console.error('Error checking confirmations:', err);
            }
        };

        // UI Utility for role-based visibility
        window.applyRoleVisibility = function() {
            const role = (window.currentUserRole || 'driver').toString().toLowerCase().trim();
            const isAdmin = (role === 'admin');
            const isEmployee = (role === 'employee' || role === 'staff' || role === 'student');
            const isDriver = (role === 'driver');
            const isStudent = (role === 'student');

            console.log("Applying Visibility for role:", role, "isAdmin:", isAdmin);

            const adminEls = document.querySelectorAll('.admin-only');
            const driverEls = document.querySelectorAll('.driver-only');
            const employeeEls = document.querySelectorAll('.employee-only');
            const staffEls = document.querySelectorAll('.staff-only'); 
            
            adminEls.forEach(el => el.style.display = isAdmin ? '' : 'none');
            driverEls.forEach(el => el.style.display = (isAdmin || isDriver) ? '' : 'none');
            employeeEls.forEach(el => el.style.display = (isAdmin || isEmployee) ? '' : 'none');
            staffEls.forEach(el => el.style.display = (isAdmin || isEmployee) ? '' : 'none');

            // Attendance Navigation: Only for Admin
            const btnAttNav = document.getElementById('btn-attendance-nav');
            if (btnAttNav) btnAttNav.style.display = isAdmin ? 'inline-flex' : 'none';

            // Calculator: visible to all but READ-ONLY for drivers
            const calc = document.querySelector('.weekly-calculator-container');
            if (calc) {
                calc.style.display = '';
                calc.querySelectorAll('input').forEach(inp => {
                    inp.readOnly = isDriver;
                    inp.style.background = isDriver ? '#f1f5f9' : '';
                    inp.style.cursor = isDriver ? 'not-allowed' : '';
                });
            }

            // Archive action is strictly for Admin
            const archiveBtn = document.getElementById('btn-archive-settlement');
            if (archiveBtn) archiveBtn.style.display = isAdmin ? '' : 'none';

            // Drivers cannot select all rows
            document.querySelectorAll('button[onclick*="toggleSelectAllDrivers"]').forEach(b => {
                b.style.display = isDriver ? 'none' : '';
            });
        };

        window.updateAvailableDriversForReport = function() {
            // Avoid messing with driver role as they have a restricted/fixed view
            if (window.currentUserRole === 'driver') return;
            
            const from = document.getElementById('filter-from')?.value;
            const to = document.getElementById('filter-to')?.value;
            const select = document.getElementById('filter-search');
            if (!select) return;

            // If no dates are selected, restore the full driver list
            if (!from && !to) {
                if (window.refreshDriverSelects) {
                    // We only want to refresh THIS select, not all of them
                    // But refreshDriverSelects is what we have. 
                    // To avoid a loop if refreshDriverSelects calls renderDriverLog, 
                    // we use a flag or just do it manually here.
                    const currentVal = select.value;
                    select.innerHTML = '<option value="">All Drivers</option>';
                    if (window.currentDrivers) {
                        window.currentDrivers.forEach(d => {
                            const opt = document.createElement('option');
                            opt.value = d.name;
                            opt.textContent = d.name;
                            select.appendChild(opt);
                        });
                    }
                    select.value = currentVal;
                }
                return;
            }

            // Filter trips for the date range to find active drivers
            const trips = window.driverReportTrips || window.currentTrips || [];
            const driversInPeriod = new Set();
            
            trips.forEach(t => {
                const tDate = t[1]; // Date index
                const tDriver = t[17]; // Driver index
                const tStatus = t[41]; // Order status index
                
                if (tDriver && tDriver !== '---' && tDriver !== 'UNASSIGNED') {
                    const matchesDate = (!from || tDate >= from) && (!to || tDate <= to);
                    const isPaid = (tStatus === 'PAID' || tStatus === 'COMPLETE' || tStatus === 'PENDING_PAYMENT'); 
                    if (matchesDate && isPaid) {
                        driversInPeriod.add(tDriver.toString().trim().toUpperCase());
                    }
                }
            });

            const currentVal = select.value;
            const currentText = select.selectedIndex !== -1 ? select.options[select.selectedIndex].text : '';
            
            select.innerHTML = '<option value="">All Drivers</option>';
            
            // Convert set to sorted array
            const sortedDrivers = Array.from(driversInPeriod).sort();
            
            sortedDrivers.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });

            // Try to restore selection if the driver still has orders in this period
            // We check against the text/name because values might be slightly different in some cases
            let found = false;
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === currentVal) {
                    select.value = currentVal;
                    found = true;
                    break;
                }
            }
            
            if (!found && currentVal !== '') {
                // If the selected driver is no longer in the list, we reset to "All Drivers"
                select.value = '';
                if (window.syncDriverNames) window.syncDriverNames();
            }
        };

        window.fetchTripsForDriverReport = async function() {
            const dateFrom = document.getElementById('filter-from')?.value;
            const dateTo = document.getElementById('filter-to')?.value;

            if (dateFrom && dateTo && window.db) {
                try {
                    // Show a quick visual indicator
                    const body = document.getElementById('dl-body');
                    if (body) {
                        body.innerHTML = '<tr><td colspan="15" style="text-align:center; padding:20px; font-weight:bold; color:#1e40af;"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i> Downloading trips for selected dates...</td></tr>';
                    }

                    const { data, error } = await window.db.from('trips')
                        .select('*')
                        .gte('date', dateFrom)
                        .lte('date', dateTo)
                        .or('is_deleted.eq.false,is_deleted.is.null');
                        
                    if (error) throw error;
                    
                    if (data && window.mapTripToArray) {
                        window.driverReportTrips = data.map(window.mapTripToArray);
                    } else {
                        window.driverReportTrips = [];
                    }
                } catch(e) {
                    console.error("Error fetching trips for driver report:", e);
                }
            } else {
                window.driverReportTrips = null;
            }
        };

        window.handleDriverDateChange = async function() {
            await window.fetchTripsForDriverReport();
            if (window.updateAvailableDriversForReport) window.updateAvailableDriversForReport();
            if (window.renderDriverLog) window.renderDriverLog();
            if (window.fetchHistory) window.fetchHistory();
        };

