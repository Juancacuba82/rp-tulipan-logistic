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
                        const drvRef = window.currentDriverNameRef || '';
                        if (window.driverNamesMatch) {
                            if (!window.driverNamesMatch(drvRef, rDriver)) return false;
                        } else {
                            if (rDriver.toLowerCase().trim() !== drvRef.toLowerCase().trim()) return false;
                        }
                    }

                    const rStAmount = r[34];
                    const rCont = (r[3] || '').toString();
                    const rOrder = (r[5] || '').toString();

                    const rStatus = (r[41] || '').toUpperCase();

                    const drvNameMatch = window.driverNamesMatch
                        ? window.driverNamesMatch(searchTerm, rDriver)
                        : rDriver.toLowerCase().trim() === searchTerm.trim();
                    const matchesSearch = !searchTerm || drvNameMatch
                        || rCont.toLowerCase().includes(searchTerm)
                        || rOrder.toLowerCase().includes(searchTerm);
                    const dateKey = String(rDate || '').slice(0, 10);
                    const matchesDate = (!dateFrom || dateKey >= dateFrom) && (!dateTo || dateKey <= dateTo);
                    
                    const isDriverView = window.isPlainDriverView && window.isPlainDriverView();
                    const statusOk = isDriverView
                        ? (rStatus === 'COMPLETE')
                        : (rStatus === 'PAID' || rStatus === 'COMPLETE');

                    return matchesSearch && matchesDate && statusOk;
                });

                if (window.resetWeeklyCalculator) window.resetWeeklyCalculator();

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
                        if (!editingSettlementId && window.resetWeeklyCalculator) {
                            window.resetWeeklyCalculator();
                        }
                        return;
                    }

                    window.driverCalcReady = true;

                    let totalPaidDriverGross = 0;
                    let totalAdjustedCommission = 0;
                    let totalCash = 0;

                    selectedIndices.forEach(idx => {
                        const r = filtered[idx];
                        const grossVal = (parseFloat(r[24]) || 0) * (parseInt(r[53]) || 1);
                        const company = (r[16] || '').trim().toUpperCase();

                        totalPaidDriverGross += grossVal;

                        if (company === 'RP TULIPAN' || company === 'JR SUPER CRANE') {
                            totalAdjustedCommission += grossVal * 0.3;
                        } else {
                            totalAdjustedCommission += grossVal;
                        }

                        totalCash += window.getTripOpenHold ? window.getTripOpenHold(r) : ((r[34] === 'PAID') ? (parseFloat(r[22]) || 0) : 0);
                    });

                    // SYNC WITH CALCULATOR
                    const calcGross = document.getElementById('calc-gross');
                    const calcCashColl = document.getElementById('calc-cash-coll');
                    
                    if (calcGross) {
                        calcGross.value = totalPaidDriverGross.toFixed(2);
                        calcGross.dataset.adjusted = totalAdjustedCommission.toFixed(2);
                    }
                    // Cash Collected comes from the driver wallet, not from Amount PAID rows
                    const drvName = document.getElementById('filter-search')?.options[document.getElementById('filter-search')?.selectedIndex]?.text
                        || document.getElementById('filter-search')?.value;
                    if (calcCashColl && !editingSettlementId) {
                        const wallet = window.getDriverWallet ? window.getDriverWallet(drvName) : 0;
                        calcCashColl.value = Math.max(wallet, totalCash).toFixed(2);
                    }

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
                window.currentFilteredRowsDriver = filtered;
                const fragment = document.createDocumentFragment();
                const lockDriverRows = window.isPlainDriverView && window.isPlainDriverView();
                filtered.forEach((r, idx) => {
                    const tr = document.createElement('tr');
                    tr.style.cursor = lockDriverRows ? 'default' : 'pointer';
                    if (!lockDriverRows) {
                        tr.onclick = () => {
                            if (selectedIndices.has(idx)) {
                                selectedIndices.delete(idx);
                                tr.classList.remove('selected-row');
                            } else {
                                selectedIndices.add(idx);
                                tr.classList.add('selected-row');
                            }
                            updateSelectionSummary();
                        };
                    }

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
                            const cashVal = window.getTripOpenHold ? window.getTripOpenHold(r) : 0;
                            td.textContent = cashVal > 0.009 ? `$${cashVal.toFixed(2)}` : '---';
                            if (cashVal > 0.009) {
                                td.style.fontWeight = '700';
                                td.style.color = '#d97706';
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

                if (lockDriverRows && currentFilteredRows.length > 0) {
                    currentFilteredRows.forEach((_, idx) => selectedIndices.add(idx));
                    body.querySelectorAll('tr:not(.selection-summary-row)').forEach(r => r.classList.add('selected-row'));
                }
                updateSelectionSummary();

                // Check if this driver/week was already confirmed and color rows
                if (window.refreshDriverCashSurfaces) window.refreshDriverCashSurfaces();
            }
        }

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

            const money = (n) => '$' + (parseFloat(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 });
            const heldEl = document.getElementById('res-cash-held');
            const idleCalc = !editingSettlementId && !window.driverCalcReady;
            if (idleCalc) {
                const linkedDisplay = document.getElementById('res-linked-salary');
                const lastBalIdle = parseFloat(elLastBal.value) || 0;
                resSalary.textContent = money(0);
                resSalary.dataset.value = '0';
                if (linkedDisplay) linkedDisplay.textContent = money(0);
                if (heldEl) heldEl.textContent = money(lastBalIdle);
                resCashBal.textContent = money(0);
                resCashBal.dataset.value = '0';
                const whoEl = document.getElementById('res-cash-who');
                const boxEl = document.getElementById('res-cash-box');
                const labelEl = document.getElementById('res-cash-label');
                if (boxEl) boxEl.classList.remove('owes-company', 'owes-driver');
                if (labelEl) labelEl.textContent = 'Select trips to calculate';
                if (whoEl) whoEl.textContent = lastBalIdle > 0.009
                    ? ('Last week leftover is ' + money(lastBalIdle) + ' — select trips to finish')
                    : 'Cash this week + last week − salary';
                if (window.updateDriverWeekSummary) window.updateDriverWeekSummary();
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

            const cashHeld = cashColl + lastBal;
            const cashTotal = cashHeld - settlementSalary;
            if (heldEl) heldEl.textContent = money(cashHeld);

            const absFormatted = money(Math.abs(cashTotal));
            resCashBal.textContent = absFormatted;
            resCashBal.dataset.value = cashTotal.toFixed(2);

            const whoEl = document.getElementById('res-cash-who');
            const boxEl = document.getElementById('res-cash-box');
            const labelEl = document.getElementById('res-cash-label');
            if (boxEl) boxEl.classList.remove('owes-company', 'owes-driver');
            if (cashTotal > 0.009) {
                if (labelEl) labelEl.textContent = 'Driver owes you';
                if (whoEl) whoEl.textContent = money(cashHeld) + ' − ' + money(settlementSalary) + ' = ' + absFormatted;
                if (boxEl) boxEl.classList.add('owes-company');
            } else if (cashTotal < -0.009) {
                if (labelEl) labelEl.textContent = 'You owe the driver';
                if (whoEl) whoEl.textContent = money(settlementSalary) + ' salary − ' + money(cashHeld) + ' cash = ' + absFormatted;
                if (boxEl) boxEl.classList.add('owes-driver');
            } else {
                if (labelEl) labelEl.textContent = 'Even — nothing owed';
                if (whoEl) whoEl.textContent = money(cashHeld) + ' − ' + money(settlementSalary) + ' = ' + money(0);
            }
            if (window.updateDriverWeekSummary) window.updateDriverWeekSummary();
        }

        window.driverCalcReady = false;
        window.resetWeeklyCalculator = function () {
            if (editingSettlementId) return;
            window.driverCalcReady = false;
            const gross = document.getElementById('calc-gross');
            const cash = document.getElementById('calc-cash-coll');
            if (gross) {
                gross.value = '0';
                delete gross.dataset.adjusted;
            }
            if (cash) cash.value = '0';
            const drvSel = document.getElementById('filter-search');
            const drvName = drvSel?.options[drvSel.selectedIndex]?.text || drvSel?.value;
            if (window.fillLastWeekBalance) window.fillLastWeekBalance(drvName);
            if (window.updateWeeklyCalc) window.updateWeeklyCalc();
        };

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
                        if (window.driverNamesMatch) {
                            if (!window.driverNamesMatch(drvRef, s.driver_name)) return false;
                        } else if (sDrv.trim() !== drvRef.toLowerCase().trim()) {
                            return false;
                        }
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
            window.editingSettlementId = id;

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
            window.editingSettlementId = null;
            
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
                if (!editingSettlementId && window.fillLastWeekBalance) {
                    window.fillLastWeekBalance(val);
                }
            } else {
                display.style.color = '#b91c1c'; // Dark red
                display.style.background = '#fee2e2'; // Light red
                display.style.borderColor = '#ef4444';
            }
            display.textContent = val.toUpperCase();
        }
        window.syncDriverNames = syncDriverNames;

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

            if (confirmMsg && !confirm(confirmMsg)) return;

            const liveWallet = window.getDriverWallet ? window.getDriverWallet(driverNameFinal) : 0;
            if (!editingSettlementId && liveWallet > 0.01) {
                const leftover = parseFloat(document.getElementById('res-cash-bal')?.dataset?.value) || 0;
                const ok = confirm(
                    `${driverNameFinal} tiene $${liveWallet.toFixed(2)} de la empresa (wallet).\n` +
                    `Al liquidar, el sueldo se descuenta de ese wallet. NO entra a caja oficina.\n` +
                    `Lo que quede ($${Math.max(0, leftover).toFixed(2)}) sigue debiendo el chofer hasta que use Entrego cash.\n\n¿Continuar?`
                );
                if (!ok) return;
            }

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

                // --- NEW PROFIT LINE LOGIC ---
                let driverCompany = 'CONTRACTOR';
                const sourceTrips = (window.driverReportTrips && window.driverReportTrips.length > 0) ? window.driverReportTrips : (window.currentTrips || []);
                const driverTrip = sourceTrips.find(t => (t[17] || '').toString().toUpperCase().trim() === driverNameFinal);
                if (driverTrip) {
                    driverCompany = (driverTrip[16] || '').toString().toUpperCase().trim();
                }

                let profitLine = 'contractors'; // Default for Contractors
                if (driverCompany === 'RP TULIPAN' || driverCompany === 'JR SUPER CRANE') {
                    profitLine = 'rpt_transportation';
                }
                // -----------------------------

                if (window.mapArrayToExpense && window.addExpense) {
                    const buildExpenseObj = (amount, pm, label) => {
                        const desc = label || expenseDescription;
                        const rowData = [
                            expenseDate, 'DRIVER PAYMENT', desc,
                            `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                            noteBase, null, pm, profitLine
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

                        const walletPool = cashColl + lastBal;
                        const fromWallet = Math.min(expenseAmount, Math.max(0, walletPool));
                        const fromOffice = Math.round((expenseAmount - fromWallet) * 100) / 100;
                        if (fromWallet > 0.009) {
                            await saveAndSync(buildExpenseObj(fromWallet, 'driver_wallet', `${expenseDescription} (Wallet chofer)`), 'add');
                        }
                        if (fromOffice > 0.009) {
                            if (val_type === 'split') {
                                const splitCash = parseFloat(document.getElementById('spm-split-cash')?.value) || 0;
                                const splitBank = parseFloat(document.getElementById('spm-split-bank')?.value) || 0;
                                const splitTotal = splitCash + splitBank;
                                const cShare = splitTotal > 0 ? fromOffice * (splitCash / splitTotal) : fromOffice;
                                const bShare = fromOffice - cShare;
                                if (cShare > 0.009) await saveAndSync(buildExpenseObj(cShare, 'cash', `${expenseDescription} (Cash)`), 'add');
                                if (bShare > 0.009) await saveAndSync(buildExpenseObj(bShare, 'bank', `${expenseDescription} (Bank)`), 'add');
                            } else {
                                await saveAndSync(buildExpenseObj(fromOffice, val_type === 'bank' ? 'bank' : 'cash'), 'add');
                            }
                        } else if (fromWallet < 0.01) {
                            await saveAndSync(buildExpenseObj(expenseAmount, val_type === 'bank' ? 'bank' : 'cash'), 'add');
                        }

                    } else {
                        const walletPool = cashColl + lastBal;
                        const fromWallet = Math.min(expenseAmount, Math.max(0, walletPool));
                        const fromOffice = Math.round((expenseAmount - fromWallet) * 100) / 100;
                        if (fromWallet > 0.009) {
                            await saveAndSync(buildExpenseObj(fromWallet, 'driver_wallet', `${expenseDescription} (Wallet chofer)`), 'add');
                        }
                        if (fromOffice > 0.009) {
                            if (val_type === 'split') {
                                const splitCash = parseFloat(document.getElementById('spm-split-cash')?.value) || 0;
                                const splitBank = parseFloat(document.getElementById('spm-split-bank')?.value) || 0;
                                const splitTotal = splitCash + splitBank;
                                const cShare = splitTotal > 0 ? fromOffice * (splitCash / splitTotal) : fromOffice;
                                const bShare = fromOffice - cShare;
                                if (cShare > 0.009) await saveAndSync(buildExpenseObj(cShare, 'cash', `${expenseDescription} (Cash)`), 'add');
                                if (bShare > 0.009) await saveAndSync(buildExpenseObj(bShare, 'bank', `${expenseDescription} (Bank)`), 'add');
                            } else {
                                await saveAndSync(buildExpenseObj(fromOffice, val_type === 'bank' ? 'bank' : 'cash'), 'add');
                            }
                        } else if (fromWallet < 0.01) {
                            await saveAndSync(buildExpenseObj(expenseAmount, val_type === 'bank' ? 'bank' : 'cash'), 'add');
                        }
                    }
                }


                if (window.fetchHistory) await window.fetchHistory(true); 
                if (window.loadExpensesData) await window.loadExpensesData(true);

                try {
                    if (window.closeDriverHoldsOnSettlement) {
                        await window.closeDriverHoldsOnSettlement(driverNameFinal, val_final);
                    }
                } catch (holdErr) {
                    console.error('[DriverCash] Could not move order cash to office after settlement:', holdErr);
                    alert('La liquidación se guardó, pero no se pudo pasar el cash de las órdenes a TODO OFICINA: ' + (holdErr.message || holdErr));
                }
                if (window.refreshDriverCashSurfaces) window.refreshDriverCashSurfaces();
                if (window.loadAccountingData) {
                    try { await window.loadAccountingData(true); } catch (e) { console.warn(e); }
                }

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
            if (typeof window.denyNonAdminDelete === 'function' && window.denyNonAdminDelete()) return;
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') {
                alert("Only administrators can delete records.");
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

        window.isPlainDriverView = function () {
            const role = (window.currentUserRole || '').toString().toLowerCase().trim();
            if (role !== 'driver') return false;
            const drvRef = (window.currentDriverNameRef || '').toUpperCase();
            return drvRef !== 'ROBERT CORTEZ';
        };

        function isoFromDate(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        function mondayOf(d) {
            const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const day = x.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            x.setDate(x.getDate() + diff);
            return x;
        }

        window.getDriverAutoWeekRange = function (driverName) {
            // Pay week is Monday–Saturday (paid on Saturday).
            const today = new Date();
            const thisMonday = mondayOf(today);
            const thisMondayIso = isoFromDate(thisMonday);
            const to = isoFromDate(today);
            let from = thisMondayIso;

            const rec = window.getLatestSettlementRecord
                ? window.getLatestSettlementRecord(driverName)
                : null;
            const end = rec && rec.end_date ? String(rec.end_date).slice(0, 10) : '';
            if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
                const next = new Date(end + 'T12:00:00');
                next.setDate(next.getDate() + 1);
                const nextIso = isoFromDate(next);
                // Unpaid prior week(s): include from day after last settlement.
                // Already paid through this Monday: show current week only.
                if (nextIso < thisMondayIso) from = nextIso;
            } else {
                const prevMonday = new Date(thisMonday);
                prevMonday.setDate(prevMonday.getDate() - 7);
                from = isoFromDate(prevMonday);
            }
            return { from, to };
        };

        window.applyDriverSettlementChrome = function () {
            const driverUi = window.isPlainDriverView && window.isPlainDriverView();
            const fromGroup = document.getElementById('filter-from')?.closest('.attendance-input-group');
            const toGroup = document.getElementById('filter-to')?.closest('.attendance-input-group');
            const clearBtn = document.querySelector('#reports-view .btn-reset-modern');
            const calc = document.querySelector('.weekly-calculator-container');
            const summary = document.getElementById('driver-week-summary');
            const selectAllWrap = document.querySelector('#reports-view button[onclick*="toggleSelectAllDrivers"]')?.parentElement;
            const historyWrap = document.getElementById('settlement-history-wrap');
            const archiveWrap = document.getElementById('btn-archive-settlement')?.parentElement;
            if (fromGroup) fromGroup.style.display = driverUi ? 'none' : '';
            if (toGroup) toGroup.style.display = driverUi ? 'none' : '';
            if (clearBtn) clearBtn.style.display = driverUi ? 'none' : '';
            if (calc) calc.style.display = driverUi ? 'none' : '';
            if (summary) summary.style.display = driverUi ? 'block' : 'none';
            if (selectAllWrap) selectAllWrap.style.display = driverUi ? 'none' : '';
            if (historyWrap) historyWrap.style.display = driverUi ? 'none' : '';
            if (archiveWrap) archiveWrap.style.display = driverUi ? 'none' : '';
        };

        window.updateDriverWeekSummary = function () {
            const payEl = document.getElementById('dws-pay');
            if (!payEl) return;
            const money = (n) => '$' + Math.abs(parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const salary = parseFloat(document.getElementById('res-driver-salary')?.dataset?.value) || 0;
            const cashColl = parseFloat(document.getElementById('calc-cash-coll')?.value) || 0;
            const lastBal = parseFloat(document.getElementById('calc-last-bal')?.value) || 0;
            const held = cashColl + lastBal;
            const due = held - salary;
            const from = document.getElementById('filter-from')?.value || '';
            const to = document.getElementById('filter-to')?.value || '';
            const rangeEl = document.getElementById('dws-range');
            if (rangeEl) {
                rangeEl.textContent = (from && to)
                    ? `Mon–Sat pay week  (${from} → ${to})`
                    : 'How we got this';
            }
            const lastEl = document.getElementById('dws-last');
            const cashEl = document.getElementById('dws-cash');
            const heldEl = document.getElementById('dws-held');
            if (lastEl) lastEl.textContent = money(lastBal);
            if (cashEl) cashEl.textContent = money(cashColl);
            if (heldEl) heldEl.textContent = money(held);
            payEl.textContent = money(salary);
            const payAgain = document.getElementById('dws-pay-again');
            if (payAgain) payAgain.textContent = money(salary);
            const grossEl = document.getElementById('dws-gross');
            const rateLabel = document.getElementById('dws-rate-label');
            const grossInput = document.getElementById('calc-gross');
            const generated = parseFloat(grossInput?.value) || 0;
            const adjusted = parseFloat(grossInput?.dataset?.adjusted) || generated;
            const isThirty = generated > 0.009 && Math.abs(adjusted - generated * 0.3) < 0.05;
            if (grossEl) grossEl.textContent = money(generated);
            if (rateLabel) rateLabel.textContent = isThirty ? 'Your 30%' : 'Your pay';
            const resultEl = document.getElementById('dws-result');
            const resultCard = document.getElementById('dws-result-card');
            const resultLabel = document.getElementById('dws-result-label');
            const resultNote = document.getElementById('dws-result-note');
            const helpEl = document.getElementById('dws-pay-note');
            if (resultCard) resultCard.classList.remove('owes-company', 'owes-driver', 'even');
            if (due > 0.009) {
                if (resultLabel) resultLabel.textContent = 'You owe the company';
                if (resultEl) resultEl.textContent = money(due);
                if (resultNote) resultNote.textContent = '';
                if (helpEl) helpEl.textContent = '';
                if (resultCard) resultCard.classList.add('owes-company');
            } else if (due < -0.009) {
                if (resultLabel) resultLabel.textContent = 'The company owes you';
                if (resultEl) resultEl.textContent = money(due);
                if (resultNote) resultNote.textContent = '';
                if (helpEl) helpEl.textContent = '';
                if (resultCard) resultCard.classList.add('owes-driver');
            } else {
                if (resultLabel) resultLabel.textContent = 'Even — nothing owed';
                if (resultEl) resultEl.textContent = money(0);
                if (resultNote) resultNote.textContent = '';
                if (helpEl) helpEl.textContent = '';
                if (resultCard) resultCard.classList.add('even');
            }
        };

        window.prepareDriverWeekView = async function () {
            window.applyDriverSettlementChrome();
            if (!window.isPlainDriverView || !window.isPlainDriverView()) return;
            const name = window.currentDriverNameRef || '';
            const sel = document.getElementById('filter-search');
            if (sel && name) {
                let matched = false;
                for (let i = 0; i < sel.options.length; i++) {
                    if ((sel.options[i].text || '').toUpperCase() === name.toUpperCase()
                        || (sel.options[i].value || '').toUpperCase() === name.toUpperCase()) {
                        sel.selectedIndex = i;
                        matched = true;
                        break;
                    }
                }
                if (!matched) sel.value = name;
            }
            if (window.syncDriverNames) window.syncDriverNames();
            const range = window.getDriverAutoWeekRange(name);
            const fromEl = document.getElementById('filter-from');
            const toEl = document.getElementById('filter-to');
            if (fromEl) fromEl.value = range.from;
            if (toEl) toEl.value = range.to;
            if (window.fetchTripsForDriverReport) await window.fetchTripsForDriverReport();
            if (window.renderDriverLog) window.renderDriverLog();
            if (window.updateDriverWeekSummary) window.updateDriverWeekSummary();
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
            if (window.applyDriverSettlementChrome) window.applyDriverSettlementChrome();
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

                    let query = window.db.from('trips')
                        .select('*')
                        .gte('date', dateFrom)
                        .lte('date', dateTo)
                        .or('is_deleted.eq.false,is_deleted.is.null');
                    if (window.isPlainDriverView && window.isPlainDriverView() && window.currentDriverNameRef) {
                        query = query.ilike('driver', `${window.currentDriverNameRef}%`);
                    }
                    const { data, error } = await query;
                        
                    if (error) throw error;
                    
                    if (data && window.mapTripToArray) {
                        let rows = data.map(window.mapTripToArray);
                        if (window.isPlainDriverView && window.isPlainDriverView() && window.driverNamesMatch) {
                            rows = rows.filter(r => window.driverNamesMatch(window.currentDriverNameRef, r[17]));
                        }
                        window.driverReportTrips = rows;
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

        window.refreshDriversModule = async function() {
            await window.withRefreshButton('btn-refresh-drivers', async () => {
                const dateFrom = document.getElementById('filter-from')?.value;
                const dateTo = document.getElementById('filter-to')?.value;
                if (dateFrom && dateTo && typeof window.fetchTripsForDriverReport === 'function') {
                    await window.fetchTripsForDriverReport();
                } else if (typeof window.getTrips === 'function' && typeof window.mapTripToArray === 'function') {
                    const data = await window.getTrips();
                    window.currentTrips = (data || []).map(window.mapTripToArray);
                    window.driverReportTrips = null;
                }
                if (typeof window.fetchHistory === 'function') await window.fetchHistory(true);
                if (typeof window.updateAvailableDriversForReport === 'function') window.updateAvailableDriversForReport();
                if (typeof window.renderDriverLog === 'function') window.renderDriverLog();
            }, 'drivers');
        };

