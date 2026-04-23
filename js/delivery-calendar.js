// --- UI STATE FOR TRIP ENTRY ---
let editingIndex = null;
let editingTripDbId = null;

function getTripArchiveButton() {
    return document.getElementById('btn-archive-order');
}

function setTripArchiveButton(opts) {
    const btn = getTripArchiveButton();
    if (!btn) return;
    const span = btn.querySelector('.btn-archive-order-label');
    if (opts.disabled !== undefined) btn.disabled = opts.disabled;
    if (opts.opacity !== undefined) btn.style.opacity = String(opts.opacity);
    if (opts.label !== undefined && span) span.textContent = opts.label;
    if (opts.isUpdate === true) btn.classList.add('btn-update');
    else if (opts.isUpdate === false) btn.classList.remove('btn-update');
    if (opts.title !== undefined) btn.title = opts.title || '';
}

function restoreTripArchiveButtonUI() {
    const isEdit = (editingIndex !== null);
    setTripArchiveButton({
        disabled: false,
        opacity: 1,
        label: isEdit ? 'Update order' : 'Archive Order',
        isUpdate: isEdit,
        title: isEdit ? 'Save changes to this trip' : 'Save trip to database'
    });
}
window.restoreTripArchiveButtonUI = restoreTripArchiveButtonUI;

// --- IMMEDIATE SYNC FOR EDIT MODE ---
        async function syncImmediate(fieldName, value) {
            if (editingIndex === null) return;
            const tripId = editingTripDbId;
            if (!tripId) return;

            const updateData = {};
            updateData[fieldName] = value;
            if (fieldName === 'st_amount') updateData.paid = (value === 'PAID');

            // --- PAY VALIDATION LOGIC ---
            if (['st_yard', 'st_rate', 'st_sales'].includes(fieldName)) {
                const isYard = document.getElementById('in-yardpaid').checked;
                const isRate = document.getElementById('in-ratepaid').checked;
                const isSales = document.getElementById('in-salespaid').checked;
                updateData.status = (isYard && isRate && isSales) ? 'PAID' : 'PENDING_PAYMENT';
            }

            try {
                console.log(`Syncing ${fieldName} -> ${value} for ${tripId}`);
                await updateTrip(tripId, updateData);
                await loadTableData();
                
                // --- DOCUMENT PREVIEW SYNC ---
                if (window.currentDocTrip && window.currentDocTrip[0] === tripId) {
                    const updatedTrip = currentTrips.find(t => t[0] === tripId);
                    if (updatedTrip) {
                        window.currentDocTrip = updatedTrip;
                        if (window.drawReceipt) window.drawReceipt();
                    }
                }
            } catch (err) {
                console.error("Immediate sync failed:", err);
                alert("DATABASE ERROR: " + (err.message || "Failed to sync field " + fieldName));
            }
        }
        window.syncImmediate = syncImmediate;

        let isSaving = false;
        async function addRow() {
            if (isSaving) return;

            const tripBtn = getTripArchiveButton();
            const labelSpan = tripBtn?.querySelector('.btn-archive-order-label');
            if (tripBtn) {
                tripBtn.disabled = true;
                if (labelSpan) labelSpan.textContent = 'Saving…';
                tripBtn.style.opacity = '0.7';
            }
            isSaving = true;

            const isTransport = document.getElementById('in-flag2').checked;
            const compVal = document.getElementById('in-company').value;

            // Company is only MANDATORY if it's a transport-related order
            if (isTransport && (!compVal || compVal === '---')) {
                alert("ERROR: Debes seleccionar una compañía para órdenes que incluyan servicios de transporte.");
                isSaving = false;
                restoreTripArchiveButtonUI();
                return;
            }

            if (editingIndex === null) {
                // Only auto-generate Order if user hasn't typed one
                const ordInput = document.getElementById('in-order');
                if (!ordInput.value || ordInput.value.trim() === '') {
                    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                    let ordSuffix = '';
                    for (let i = 0; i < 4; i++) ordSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
                    ordInput.value = 'ORD-' + ordSuffix;
                }
            }
            const fields = [
                'in-date', 'in-size', 'in-ncont', 'in-release', 'in-order', 'in-city', 'in-pickup',
                'in-delivery', 'in-doors', 'in-miles', 'in-customer',
                'in-yard', 'in-yardrate', 'in-priceperday', 'in-dateout', 'in-company', 'in-driver',
                'in-rate', 'in-paytype', 'in-sales', 'in-collect', 'in-amount', 'in-phone',
                'in-paiddriver', 'in-note',
                'in-mode', 'in-mrate', 'in-sdaterent', 'in-nextdue', 'in-qty',
                'in-invoice-sent'
            ];

            // 0. UNIQUE CONTAINER VALIDATION REMOVED


            // 1. GRANULAR INVENTORY VALIDATION (BLOQUEO POR MEDIDA + TIPO + CONDICIÓN)
            const relSel = document.getElementById('in-release-sel');
            const relMan = document.getElementById('in-release');
            const selectedRelease = (relMan && relMan.style.display !== 'none') ? relMan.value : (relSel ? relSel.value : '');

            const custSel = document.getElementById('in-customer-sel');
            const custMan = document.getElementById('in-customer');
            const selectedCustomer = (custMan && custMan.style.display !== 'none') ? custMan.value : (custSel ? custSel.value : '');

            const pickupSel = document.getElementById('in-pickup-sel');
            const pickupMan = document.getElementById('in-pickup');
            const selectedPickup = (pickupMan && pickupMan.style.display !== 'none') ? pickupMan.value : (pickupSel ? pickupSel.value : '');

            const sizeSel = document.getElementById('in-size-sel');
            const sizeMan = document.getElementById('in-size');
            const selectedSize = (sizeMan && sizeMan.style.display !== 'none') ? sizeMan.value : (sizeSel ? sizeSel.value : '');

            const selectedRelType = document.getElementById('in-rel-type').value;
            const selectedRelCond = document.getElementById('in-rel-condition').value;

            // STOCK DEDUCTION CRITERIA: SALE/RENT, RELEASE PRESENT, ALL PAID, NOT YARD-SERVICE-ONLY
            const yardEl = document.getElementById('in-yard');
            const yardVal = yardEl ? yardEl.value : (document.getElementById('in-flag1')?.checked ? 'YES' : 'NO');
            const yardOnly = yardVal === 'YES' && (parseFloat(document.getElementById('in-sales')?.value || '0') === 0);
            const modeVal = document.getElementById('in-mode')?.value || 'SALE';
            const isSalesFlag = document.getElementById('in-flag3')?.checked || false;
            const releaseExists = (currentReleases || []).some(r => r[0] === selectedRelease);
            const isDeductionCandidate = (selectedRelease && selectedRelease !== '---' && !yardOnly && 
                                         ((modeVal === 'SALE' && isSalesFlag) || modeVal === 'RENT') && 
                                         releaseExists);
            const isYardPaid = document.getElementById('in-yardpaid').checked;
            const isRatePaid = document.getElementById('in-ratepaid').checked;
            const isSalesPaid = document.getElementById('in-salespaid').checked;
            const isAmountPaid = document.getElementById('in-amountpaid').checked;

            const stYard = isYardPaid ? 'PAID' : 'PEND';
            const stRent = document.getElementById('in-rentpaid')?.checked ? 'PAID' : 'PEND';
            const stRate = isRatePaid ? 'PAID' : 'PEND';
            const stSales = isSalesPaid ? 'PAID' : 'PEND';
            const stAmount = (document.getElementById('in-amountpaid') && document.getElementById('in-amountpaid').checked) ? 'PAID' : 'PEND';

            // The status toggle (swish) is the MASTER finalization flag.
            // Green = order finalized (money visible in Profit Report, stock deducted if sale)
            // Red  = order pending  (money hidden from Profit Report, no stock deduction)
            const finalizeVal = document.getElementById('in-status-toggle')?.value || 'PENDING_PAYMENT';
            const isFinalized = finalizeVal === 'PAID';
            const globalStatus = isFinalized ? 'PAID' : 'PENDING_PAYMENT';

            // Stock deduction only triggers when the toggle is switched TO green AND
            // it is a new order or was previously not finalized
            let newlyFinalized = false;
            let newlyPending = false;

            if (editingIndex !== null) {
                const oldRow = currentTrips[editingIndex];
                if (oldRow) {
                    const wasFinalized = (oldRow[41] === 'PAID');
                    if (isFinalized && !wasFinalized) newlyFinalized = true;
                    if (!isFinalized && wasFinalized) newlyPending = true;
                }
            } else {
                if (isFinalized) newlyFinalized = true;
            }

            // TRIGGER LOGIC: Deduct ONLY if the order is or becomes finalized (Green).
            // Revert if it was finalized and now is marked as pending (Red).
            const triggerStockUpdate = newlyFinalized && isDeductionCandidate;
            const triggerStockRevert = newlyPending && isDeductionCandidate;

            // Stock validation: run whenever an order involves a Release
            if (isDeductionCandidate) {
                if (!selectedRelType || !selectedRelCond) {
                    alert("ERROR: Para movimientos con Release, debes seleccionar TIPO y CONDICIÓN para validar stock.");
                    isSaving = false;
                    restoreTripArchiveButtonUI();
                    return;
                }

                // Ensure releases are loaded
                if (!currentReleases || currentReleases.length === 0) {
                    if (window.loadReleasesData) await loadReleasesData();
                }

                if (currentReleases && currentReleases.length > 0) {
                    // SIMPLIFIED MATCHING: Just use Release # and Exact Size
                    let matchingRows = currentReleases.filter(r =>
                        r[0] === selectedRelease &&
                        (r[16] || '').trim() === selectedSize.trim()
                    );

                    // Fallback to size-based heuristic if no specific size match
                    if (matchingRows.length === 0) {
                        matchingRows = currentReleases.filter(r => r[0] === selectedRelease);
                        if (selectedSize.startsWith("20")) matchingRows = matchingRows.filter(r => (parseInt(r[7]) > 0));
                        else if (selectedSize.startsWith("40")) matchingRows = matchingRows.filter(r => (parseInt(r[9]) > 0));
                        else if (selectedSize.startsWith("45")) matchingRows = matchingRows.filter(r => (parseInt(r[11]) > 0));
                    }

                    if (matchingRows.length > 0) {
                        let totalStockFound = 0;
                        let dbField = '';
                        let sizeBase = '';
                        let stockIdx = -1;

                        if (selectedSize.startsWith("20")) { stockIdx = 7; dbField = 'qty_20'; sizeBase = "20'"; }
                        else if (selectedSize.startsWith("40")) { stockIdx = 9; dbField = 'qty_40'; sizeBase = "40'"; }
                        else if (selectedSize.startsWith("45")) { stockIdx = 11; dbField = 'qty_45'; sizeBase = "45'"; }

                        if (stockIdx !== -1) {
                            // VALIDATION: Check total_stock (index 14) instead of initial investment columns
                            totalStockFound = matchingRows.reduce((sum, r) => sum + (parseInt(r[14]) || 0), 0);

                            // Bypass for editing same order
                            let bypassStockCheck = false;
                            if (editingIndex !== null) {
                                const old = currentTrips[editingIndex];
                                if (old && old[4] === selectedRelease && old[2] === selectedSize && old[44] === selectedRelType && old[45] === selectedRelCond) {
                                    bypassStockCheck = true;
                                }
                            }

                            if (totalStockFound <= 0 && !bypassStockCheck) {
                                alert(`Sin stock disponible para contenedores de ${selectedSize} en la combinación ${selectedRelType}/${selectedRelCond}.`);
                                isSaving = false;
                                restoreTripArchiveButtonUI();
                                return;
                            }

                            // Preparation for actual deduction/reversion
                            if (triggerStockUpdate || triggerStockRevert) {
                                const qtyVal = parseInt(document.getElementById('in-qty')?.value) || 1;
                                const change = triggerStockUpdate ? -qtyVal : qtyVal;
                                // ALWAYS update total_stock, NEVER touch the initial investment columns (qty_20, etc)
                                window.calculatedNewStock = (parseInt(matchingRows[0][14]) || 0) + change;
                                window.stockUpdateField = 'total_stock';
                                window.targetReleaseNo = selectedRelease;
                                window.targetReleaseId = matchingRows[0][15]; // DB UUID
                            }
                        }
                    } else {
                        console.log("Saving order with manual/external release (no exact stock match found).");
                    }
                }
            } else if (isDeductionCandidate && !isFinalized) {
                console.log("Stock deduction skipped: swish is RED (order not finalized).");
            }


            // --- Final Data Construction (Fixed Absolute 44-Index Map) ---
            const baseValues = fields.map(id => {
                const el = document.getElementById(id);
                return el ? el.value || '---' : '---';
            });

            // CRITICAL FIX: Ensure hybrid Release #, Pickup, Customer AND Size are correctly captured in baseValues
            baseValues[1] = selectedSize || '---';
            baseValues[3] = selectedRelease || '---';
            baseValues[6] = selectedPickup || '---';
            baseValues[10] = selectedCustomer || '---';

            // Calculate Pending Balance (matches logic in report view)
            let pending = 0;
            if (stYard === 'PEND') pending += parseFloat(document.getElementById('in-yardrate')?.value || '0') || 0;
            if (stRate === 'PEND') pending += parseFloat(document.getElementById('in-rate')?.value || '0') || 0;
            if (stSales === 'PEND') pending += parseFloat(document.getElementById('in-sales')?.value || '0') || 0;
            if (stAmount === 'PEND') pending += parseFloat(document.getElementById('in-amount')?.value || '0') || 0;
            if (stRent === 'PEND' && (document.getElementById('in-mode')?.value || '') === 'RENT') {
                pending += parseFloat(document.getElementById('in-mrate')?.value || '0') || 0;
            }

            // Preserve existing signature and photos if editing
            let existingSig = '';
            let existingPhotos = [];
            if (editingIndex !== null && currentTrips[editingIndex]) {
                existingSig = currentTrips[editingIndex][54] || '';
                existingPhotos = currentTrips[editingIndex][55] || [];
            }

            const rowData = [
                editingTripDbId || '',                  // 0: trip_id
                ...baseValues.slice(0, 28),             // 1-28: Fields 0-27 (Date to StartDateRent)
                baseValues[28],                          // 29: Next Due (Fields[28])
                stYard,                                  // 30
                stRent,                                  // 31
                stRate,                                  // 32
                stSales,                                 // 33
                stAmount,                                // 34
                pending.toFixed(2),                      // 35: Pending Balance
                document.getElementById('in-email')?.value || '---',  // 36
                document.getElementById('in-truck')?.value || '---',  // 37
                document.getElementById('in-trailer')?.value || '---',// 38
                calculateFinalPay(baseValues[15], parseFloat(baseValues[23]) || 0), // 39 (Company at fields[15], Gross at fields[23])
                isYardPaid,                              // 40
                globalStatus,                            // 41
                document.getElementById('in-flag2').checked ? 'YES' : 'NO', // 42
                document.getElementById('in-flag3').checked ? 'YES' : 'NO', // 43
                document.getElementById('in-rel-type')?.value || '---',    // 44
                document.getElementById('in-rel-condition')?.value || '---',// 45
                document.getElementById('in-yard-cash').checked,          // 46
                document.getElementById('in-rate-cash').checked,          // 47
                document.getElementById('in-sales-cash').checked,         // 48
                document.getElementById('in-showtax')?.checked || false,   // 49
                parseFloat(document.getElementById('in-taxpercent')?.value || '0') || 0, // 50
                document.getElementById('in-hideamounts')?.checked || false, // 51
                document.getElementById('in-taxpaid')?.checked ? 'PAID' : 'PEND', // 52
                document.getElementById('in-qty')?.value || 1, // 53
                existingSig,    // 54
                existingPhotos, // 55
                '',             // 56 (driver sig placeholder - handled by dbObj mapping)
                document.getElementById('in-invoice-sent')?.value || 'NO' // 57
            ];

            const dbObj = mapArrayToTrip(rowData);

            // --- SUPABASE INTEGRATION ---
            try {
                if (editingIndex !== null) {
                    const targets = (window.selectedTripIds && window.selectedTripIds.length > 1) ? window.selectedTripIds : [editingTripDbId];
                    if (targets.length > 1) {
                        if (!confirm(`¿Deseas aplicar estos cambios a los ${targets.length} viajes seleccionados?`)) {
                            isSaving = false;
                            restoreTripArchiveButtonUI();
                            return;
                        }
                    }

                    for (const idToUp of targets) {
                        const { error } = await db.from('trips').update(dbObj).eq('trip_id', idToUp);
                        if (error) {
                            console.error(`Error updating trip ${idToUp}:`, error.message);
                        }
                    }
                    editingIndex = null;
                    editingTripDbId = null;
                    window.selectedTripIds = []; // Clear selection after bulk update
                } else {
                    const newId = newTripIdForDb();
                    dbObj.trip_id = newId;
                    const { error } = await db.from('trips').insert([dbObj]);
                    if (error) {
                        console.error("SUPABASE INSERT ERROR:", error.message, error.details);
                        alert(`Error insertando en DB: ${error.message}.`);
                        isSaving = false;
                        restoreTripArchiveButtonUI();
                        return;
                    }
                }



                // STOCK UPDATE EXECUTION (Deduction OR Reversion)
                if ((triggerStockUpdate || triggerStockRevert) && window.stockUpdateField && window.calculatedNewStock !== undefined) {
                    const upObj = {};
                    upObj[window.stockUpdateField] = window.calculatedNewStock;

                    const logMsg = triggerStockUpdate ? `Executing Stock Deduction (-1)` : `Executing Stock Reversion (+1)`;
                    console.log(`${logMsg} in ${window.stockUpdateField} for release ${window.targetReleaseNo}`);

                    await db.from('releases')
                        .update(upObj)
                        .eq('id', window.targetReleaseId);

                    // Clean up
                    delete window.stockUpdateField;
                    delete window.calculatedNewStock;
                    delete window.targetReleaseNo;
                    delete window.targetReleaseType;
                    delete window.targetReleaseCond;
                    delete window.targetReleaseId;
                }

                alert('¡ORDEN CONFIRMADA CORRECTAMENTE!');
                console.log("Trip saved successfully to Supabase.");

                // --- AUTOMATED EMAIL TRIGGER ---
                const sendChecked = document.getElementById('in-sendemail')?.checked;
                if (sendChecked) {
                    if (window.generatePDFFromData) {
                        window.generatePDFFromData(rowData).then(blob => {
                            if (blob) window.sendReceiptEmail(rowData, blob);
                        }).catch(e => console.error("Email trigger err:", e));
                    }
                }

                resetForm();
                await loadTableData();
                if (window.loadReleasesData) await window.loadReleasesData();
                if (window.updateReleaseDatalist) window.updateReleaseDatalist();
                if (window.updateAddressDatalist) window.updateAddressDatalist();
                if (window.renderDriverLog) window.renderDriverLog();

                alert("¡ORDEN GUARDADA CORRECTAMENTE!");
            } catch (err) {
                console.error("Failed to save trip:", err);
                alert("DATABASE ERROR: " + (err.message || "Unknown error"));
            } finally {
                isSaving = false;
                restoreTripArchiveButtonUI();
            }
        }

        function startNewOrder() {
            console.log("Starting a new order entry (clearing state)...");
            editingIndex = null;
            editingTripDbId = null;

            // 1. Text, Number, and Date Inputs
            const fieldsToClear = [
                'in-ncont', 'in-release', 'in-order', 'in-delivery', 'in-miles',
                'in-yardrate', 'in-priceperday', 'in-rate', 'in-sales', 'in-amount',
                'in-phone', 'in-note', 'in-mrate', 'in-taxpercent', 'in-paiddriver',
                'in-pickup', 'in-customer', 'in-email', 'in-qty', 'in-size',
                'in-yard', 'in-collect', 'in-mode', 'in-income'
            ];

            fieldsToClear.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'in-taxpercent') {
                        el.value = '7';
                    } else if (id === 'in-qty') {
                        el.value = '1';
                    } else if (id === 'in-mode') {
                        el.value = 'SALE';
                    } else if (['in-yardrate', 'in-priceperday', 'in-rate', 'in-sales', 'in-amount', 'in-miles', 'in-paiddriver', 'in-mrate'].includes(id)) {
                        el.value = '0';
                    } else {
                        el.value = '';
                    }
                }
            });

            // 2. Select Dropdowns
            const selectsToReset = [
                'in-size-sel', 'in-rel-type', 'in-rel-condition', 'in-city', 
                'in-pickup-sel', 'in-customer-sel', 'in-doors', 'in-company', 
                'in-driver', 'in-paytype', 'in-release-sel', 'in-status-toggle',
                'in-invoice-sent'
            ];
            selectsToReset.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.selectedIndex = 0;
            });

            // 3. Checkboxes
            const checks = [
                'in-flag1', 'in-flag2', 'in-flag3', 'in-yardpaid', 'in-rentpaid',
                'in-ratepaid', 'in-salespaid', 'in-amountpaid', 'in-yard-cash',
                'in-rate-cash', 'in-sales-cash', 'in-showtax', 'in-hideamounts', 'in-taxpaid',
                'in-sendemail'
            ];
            checks.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.checked = false;
            });

            // 4. Special Dates (Reset to empty or today)
            const dates = ['in-dateout', 'in-sdaterent', 'in-nextdue'];
            dates.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const mainDate = document.getElementById('in-date');
            if (mainDate) mainDate.value = new Date().toISOString().split('T')[0];

            // 5. Reset UI display states (Toggles)
            if (typeof toggleYardRate === 'function') toggleYardRate();
            else if (window.toggleYardRate) window.toggleYardRate();

            if (typeof toggleTransport === 'function') toggleTransport();
            else if (window.toggleTransport) window.toggleTransport();

            if (typeof toggleSalesPrice === 'function') toggleSalesPrice();
            else if (window.toggleSalesPrice) window.toggleSalesPrice();

            if (typeof updateStatusColor === 'function') updateStatusColor('PEND');
            else if (window.updateStatusColor) window.updateStatusColor('PEND');

            // Hybrid mode resets
            if (typeof toggleSizeMode === 'function') toggleSizeMode('list');
            if (typeof toggleReleaseMode === 'function') toggleReleaseMode('list');
            if (typeof togglePickupAddressMode === 'function') togglePickupAddressMode('list');
            if (typeof toggleCustomerMode === 'function') toggleCustomerMode('list');

            // Clear net pay info text
            const netPayEl = document.getElementById('net-pay-info');
            if (netPayEl) netPayEl.textContent = '';

            // 6. Restore Button UI
            // 6. Restore Button UI and Clear Selection
            window.selectedTripIds = []; // DESELECT any selected orders
            if (typeof loadTableData === 'function') loadTableData();
            
            if (typeof restoreTripArchiveButtonUI === 'function') restoreTripArchiveButtonUI();
        }
        window.startNewOrder = startNewOrder;
        window.resetForm = startNewOrder; // Alias for safety

        window.addRow = addRow;

        window.updateReleaseDatalist = function () {
            const relSel = document.getElementById('in-release-sel');
            const relList = document.getElementById('release-list');
            if (typeof currentReleases === 'undefined' || !currentReleases) return;

            // 1. Group and Consolidate Stock to handle duplicates gracefully
            const consolidated = {};
            
            currentReleases.forEach(r => {
                if (!r) return;
                // Support both Array (from mapping) and Object (direct from DB)
                const relNo = (Array.isArray(r) ? r[0] : r.release_no || '').trim();
                const stock = (Array.isArray(r) ? Number(r[14]) : Number(r.total_stock) || 0);
                const size = (Array.isArray(r) ? r[16] : r.container_size || '---');
                const city = (Array.isArray(r) ? r[6] : r.city || '---');
                const type = (Array.isArray(r) ? r[2] : r.type || 'DRY');
                const cond = (Array.isArray(r) ? r[3] : r.condition || 'USED');
                const pickup = (Array.isArray(r) ? r[4] : r.depot || '---');

                if (!relNo || relNo === '---') return;

                // Unique key for matching dropdown entry
                const key = `${relNo}|${size}|${city}|${type}|${cond}`;
                
                // CRITICAL: Only consider it if stock is truly positive
                if (stock > 0) {
                    if (!consolidated[key]) {
                        consolidated[key] = {
                            relNo, size, city, type, cond, pickup,
                            totalStock: stock,
                            rawData: r
                        };
                    } else {
                        // Consolidate stock from multiple database entries of the same release
                        consolidated[key].totalStock += stock;
                    }
                }
            });

            // 2. Prepare the final list
            const activeReleases = Object.values(consolidated)
                .sort((a, b) => a.relNo.localeCompare(b.relNo));

            // 3. Populate Selection UI
            if (relSel) {
                const currentVal = relSel.value;
                relSel.innerHTML = '<option value="" disabled selected>Select Release...</option>';

                activeReleases.forEach(item => {
                    const displayText = `${item.relNo} - ${item.size} - ${item.city}`;
                    const opt = document.createElement('option');
                    opt.value = item.relNo;
                    opt.textContent = displayText;
                    
                    const r = item.rawData;
                    opt.dataset.size = item.size;
                    opt.dataset.city = item.city;
                    opt.dataset.type = item.type;
                    opt.dataset.cond = item.cond;
                    opt.dataset.pickup = item.pickup;
                    relSel.appendChild(opt);
                });
                if (currentVal) relSel.value = currentVal;
            }

            // 4. Update the fallback datalist
            if (relList) {
                relList.innerHTML = '';
                const uniqueRelNos = [...new Set(activeReleases.map(i => i.relNo))];
                uniqueRelNos.forEach(rel => {
                    const opt = document.createElement('option');
                    opt.value = rel;
                    relList.appendChild(opt);
                });
            }
        };

        // --- DYNAMIC SIZE FILTER BASED ON RELEASE STOCK ---
        const setupReleaseValidation = () => {
            const relSel = document.getElementById('in-release-sel');
            const relMan = document.getElementById('in-release');
            const inSizeSelect = document.getElementById('in-size');
            const relType = document.getElementById('in-rel-type');
            const relCond = document.getElementById('in-rel-condition');

            const validateStockUI = () => {
                const selectedRel = (relMan && relMan.style.display !== 'none') ? relMan.value : (relSel ? relSel.value : '');
                const selectedSize = inSizeSelect ? inSizeSelect.value : '';
                const selectedRelType = relType?.value;
                const selectedRelCond = relCond?.value;
                const tripBtn = getTripArchiveButton();
                const labelSpan = tripBtn?.querySelector('.btn-archive-order-label');

                if (!tripBtn || (labelSpan && labelSpan.textContent === 'Saving…')) return;

                if (!selectedRel || selectedRel === '---' || !selectedSize || !selectedRelType || !selectedRelCond) {
                    restoreTripArchiveButtonUI();
                    return;
                }
                if (currentReleases.length === 0) {
                    restoreTripArchiveButtonUI();
                    return;
                }

                // Filter rows by Release No, Type, and Condition
                const matchingRows = currentReleases.filter(r => r[0] === selectedRel && r[2] === selectedRelType && r[3] === selectedRelCond);
                if (matchingRows.length === 0) {
                    restoreTripArchiveButtonUI();
                    tripBtn.title = 'Entrada de Release externa (no registrada en Form Releases).';
                    return;
                }

                // Match exact specific size (Index 16)
                const exactSizeRows = matchingRows.filter(r => (r[16] || '').trim() === selectedSize.trim());

                let idx = -1;
                if (selectedSize.startsWith("20")) { idx = 7; sizeBase = "20'"; }
                else if (selectedSize.startsWith("40")) { idx = 9; sizeBase = "40'"; }
                else if (selectedSize.startsWith("45")) { idx = 11; sizeBase = "45'"; }

                if (exactSizeRows.length > 0) {
                    totalStock = exactSizeRows.reduce((sum, r) => sum + (parseInt(r[idx]) || 0), 0);
                } else if (idx !== -1) {
                    // Fallback to generic matching if no specific size records exist yet
                    totalStock = matchingRows.reduce((sum, r) => sum + (parseInt(r[idx]) || 0), 0);
                }

                if (editingIndex !== null) {
                    const oldTripData = currentTrips[editingIndex];
                    if (oldTripData && oldTripData[4] === selectedRel && oldTripData[2] === selectedSize && oldTripData[44] === selectedRelType && oldTripData[45] === selectedRelCond) {
                        bypass = true;
                    }
                }

                const requestedQty = parseInt(document.getElementById('in-qty')?.value) || 1;
                if (totalStock < requestedQty && !bypass) {
                    tripBtn.disabled = true;
                    tripBtn.style.opacity = '0.5';
                    if (labelSpan) labelSpan.textContent = 'No stock';
                    tripBtn.title = `Sin stock para ${sizeBase || 'esta medida'}.`;
                    if (editingIndex !== null) tripBtn.classList.add('btn-update');
                } else {
                    tripBtn.disabled = false;
                    tripBtn.style.opacity = '1';
                    tripBtn.title = editingIndex !== null ? 'Save changes to this trip' : 'Save trip to database';
                    restoreTripArchiveButtonUI();
                }
            };

            window.refreshTripArchiveStockUi = validateStockUI;

            const autoPopulateFromRelease = () => {
                const relSel = document.getElementById('in-release-sel');
                const relMan = document.getElementById('in-release');
                const isListMode = relSel && relSel.style.display !== 'none';
                const selectedRel = isListMode ? relSel.value : (relMan ? relMan.value : '');
                
                if (!selectedRel || selectedRel === '---') return;

                let rowData = null;

                // 1. Try to get data from the selected OPTION (most reliable and fast)
                if (isListMode && relSel.selectedIndex > 0) {
                    const opt = relSel.options[relSel.selectedIndex];
                    if (opt.dataset && opt.dataset.size) {
                        rowData = {
                            city: opt.dataset.city,
                            size: opt.dataset.size,
                            pickup: opt.dataset.pickup,
                            type: opt.dataset.type,
                            cond: opt.dataset.cond
                        };
                    }
                }

                // 2. Fallback to searching the array (Manual mode or if attributes failed)
                if (!rowData && typeof currentReleases !== 'undefined') {
                    const currentSize = document.getElementById('in-size')?.value || '';
                    const match = currentReleases.find(r => r[0] === selectedRel && r[16] === currentSize) 
                               || currentReleases.find(r => r[0] === selectedRel);
                    if (match) {
                        rowData = {
                            city: match[6],
                            size: match[16],
                            pickup: match[4],
                            type: match[2],
                            cond: match[3]
                        };
                    }
                }

                if (rowData) {
                    // Update form elements
                    const inCity = document.getElementById('in-city');
                    if (inCity) inCity.value = rowData.city || '';

                    const inSize = document.getElementById('in-size');
                    if (inSize && rowData.size && rowData.size !== '---') {
                        inSize.value = rowData.size;
                    }

                    const inPickup = document.getElementById('in-pickup');
                    if (inPickup) inPickup.value = rowData.pickup || '';

                    const inType = document.getElementById('in-rel-type');
                    if (inType) inType.value = rowData.type || 'DRY';

                    const inCond = document.getElementById('in-rel-condition');
                    if (inCond) inCond.value = rowData.cond || 'USED';
                }
                
                if (window.validateStockUI) window.validateStockUI();
            };
            window.autoPopulateFromRelease = autoPopulateFromRelease;

            const changeElements = [relSel, relMan, inSizeSelect, relType, relCond];
            changeElements.forEach(el => {
                if (el) {
                    el.addEventListener('change', (e) => {
                        if (el === relSel || el === inSizeSelect) autoPopulateFromRelease();
                        else validateStockUI();
                    });
                }
            });

            const updateReleaseSizes = () => {
                const selectedRel = (relMan && relMan.style.display !== 'none') ? relMan.value : (relSel ? relSel.value : '');
                const selectedRelType = relType?.value;
                const selectedRelCond = relCond?.value;

                if (currentReleases.length === 0) return;

                // Get all rows matching this release #, type, and condition
                const matchingRows = currentReleases.filter(r => r[0] === selectedRel && r[2] === selectedRelType && r[3] === selectedRelCond);

                Array.from(inSizeSelect.options).forEach(opt => {
                    const val = opt.value;
                    if (!val) return;

                    // Check if there is ANY stock for this specific variant
                    const specificRows = matchingRows.filter(r => (r[16] || '').trim() === val.trim());
                    let hasStock = false;

                    if (specificRows.length > 0) {
                        hasStock = specificRows.some(r => (parseInt(r[7]) || parseInt(r[9]) || parseInt(r[11])) > 0);
                    } else {
                        // Fallback: Check base size stock if no specific record exists
                        let idx = -1;
                        if (val.startsWith("20")) idx = 7;
                        else if (val.startsWith("40")) idx = 9;
                        else if (val.startsWith("45")) idx = 11;

                        if (idx !== -1) {
                            hasStock = matchingRows.some(r => (parseInt(r[idx]) || 0) > 0);
                        }
                    }

                    opt.disabled = !hasStock;
                    opt.style.display = hasStock ? 'block' : 'none';
                });
            };

            if (relSel) relSel.addEventListener('change', updateReleaseSizes);
            if (relMan) relMan.addEventListener('input', updateReleaseSizes);
        };
        setupReleaseValidation();

        function updateAddressDatalist() {
            const addressList = document.getElementById('address-list');
            if (currentTrips.length > 0 && addressList) {
                const rows = currentTrips;
                const storedValues = rows.map(r => r[7]).filter(val => val && val !== '---');
                const existingOptions = Array.from(addressList.options).map(opt => opt.value);
                const uniqueNewOnes = [...new Set(storedValues)].filter(val => !existingOptions.includes(val));
                uniqueNewOnes.forEach(addr => {
                    const opt = document.createElement('option'); opt.value = addr;
                    addressList.appendChild(opt);
                });
            }
        }

        function loadTripToEdit(idx) {
            if (!currentTrips[idx]) return;
            const rowData = currentTrips[idx];

            editingIndex = idx;
            const tripId = rowData[0];
            if (!tripId || tripId === '---') {
                console.error("CRITICAL: Selected trip row is missing its TRIP_ID at index 0.", rowData);
            }
            editingTripDbId = tripId || null;

            const fields = [
                'in-date', 'in-size', 'in-ncont', 'in-release', 'in-order', 'in-city', 'in-pickup',
                'in-delivery', 'in-doors', 'in-miles', 'in-customer',
                'in-yard', 'in-yardrate', 'in-priceperday', 'in-dateout', 'in-company', 'in-driver',
                'in-rate', 'in-paytype', 'in-sales', 'in-collect', 'in-amount', 'in-phone',
                'in-paiddriver', 'in-note',
                'in-mode', 'in-mrate', 'in-sdaterent', 'in-nextdue', 'in-qty',
                'in-invoice-sent'
            ];

            fields.forEach((id, i) => {
                const el = document.getElementById(id);
                // The fields list has 30 items. The trip array mapping has 54 items.
                // We need to map the fields to their corresponding indices in rowData.
                let v;
                if (id === 'in-qty') {
                    v = rowData[53]; // Qty is index 53
                } else if (id === 'in-invoice-sent') {
                    v = rowData[57] || 'NO';
                } else {
                    v = rowData[i + 1];
                }

                if (el) {
                    if (id === 'in-release') {
                        // Hybrid Logic: Check if value exists in Select
                        const sel = document.getElementById('in-release-sel');
                        let exists = false;
                        if (sel) {
                            for (let opt of sel.options) {
                                if (opt.value === v) { exists = true; break; }
                            }
                        }
                        if (exists && v !== '---' && v !== '') {
                            toggleReleaseMode('list');
                            sel.value = v;
                        } else {
                            toggleReleaseMode('manual');
                            el.value = (v === '---' || v === undefined || v === null) ? '' : v;
                        }
                    } else if (id === 'in-customer') {
                        // Hybrid Logic for Customer
                        const sel = document.getElementById('in-customer-sel');
                        let exists = false;
                        if (sel) {
                            for (let opt of sel.options) {
                                if (opt.value === v) { exists = true; break; }
                            }
                        }
                        if (exists && v !== '---' && v !== '') {
                            toggleCustomerMode('list');
                            sel.value = v;
                        } else {
                            toggleCustomerMode('manual');
                            el.value = (v === '---' || v === undefined || v === null) ? '' : v;
                        }
                    } else if (id === 'in-size') {
                        // Hybrid Logic for Size
                        const sel = document.getElementById('in-size-sel');
                        let exists = false;
                        if (sel) {
                            for (let opt of sel.options) {
                                if (opt.value === v) { exists = true; break; }
                            }
                        }
                        if (exists && v !== '---' && v !== '') {
                            toggleSizeMode('list');
                            sel.value = v;
                        } else {
                            toggleSizeMode('manual');
                            el.value = (v === '---' || v === undefined || v === null) ? '' : v;
                        }
                    } else if (id === 'in-pickup') {
                        // Hybrid Logic for Pickup Address
                        const sel = document.getElementById('in-pickup-sel');
                        let exists = false;
                        if (sel) {
                            for (let opt of sel.options) {
                                if (opt.value === v) { exists = true; break; }
                            }
                        }
                        if (exists && v !== '---' && v !== '') {
                            togglePickupAddressMode('list');
                            sel.value = v;
                        } else {
                            togglePickupAddressMode('manual');
                            el.value = (v === '---' || v === undefined || v === null) ? '' : v;
                        }
                    } else {
                        el.value = (v === '---' || v === undefined || v === null) ? '' : v;
                    }
                }
            });
            // Final check to ensure stock label updates
            if (window.refreshTripArchiveStockUi) window.refreshTripArchiveStockUi();

            // Set Additional Fields (rel_type, rel_condition)
            if (document.getElementById('in-rel-type')) document.getElementById('in-rel-type').value = rowData[44] === '---' ? '' : (rowData[44] || '');
            if (document.getElementById('in-rel-condition')) document.getElementById('in-rel-condition').value = rowData[45] === '---' ? '' : (rowData[45] || '');

            // Re-trigger Toggles based on values loaded (Fixed Absolute Indices)
            const isYardChecked = (rowData[12] === 'YES');
            const isTransChecked = (rowData[42] === 'YES');
            const isSalesChecked = (rowData[43] === 'YES');

            document.getElementById('in-flag1').checked = isYardChecked;
            document.getElementById('in-flag2').checked = isTransChecked;
            document.getElementById('in-flag3').checked = isSalesChecked;

            toggleYardRate();
            toggleTransport();
            toggleSalesPrice();


            // Set Checkboxes (Fixed Absolute Indices)
            if (document.getElementById('in-status-toggle')) {
                const sval = rowData[41] || 'PENDING_PAYMENT';
                document.getElementById('in-status-toggle').value = sval;
                updateStatusColor(sval);
            }

            document.getElementById('in-yardpaid').checked = (rowData[30] === 'PAID');
            document.getElementById('in-rentpaid').checked = (rowData[31] === 'PAID');
            document.getElementById('in-ratepaid').checked = (rowData[32] === 'PAID');
            document.getElementById('in-salespaid').checked = (rowData[33] === 'PAID');
            document.getElementById('in-amountpaid').checked = (rowData[34] === 'PAID');

            // Set Cash Method Flags
            document.getElementById('in-yard-cash').checked = (rowData[46] === true || rowData[46] === 'true');
            document.getElementById('in-rate-cash').checked = (rowData[47] === true || rowData[47] === 'true');
            document.getElementById('in-sales-cash').checked = (rowData[48] === true || rowData[48] === 'true');

            // Tax Settings
            const showTax = document.getElementById('in-showtax');
            if (showTax) {
                const tv = rowData[49];
                showTax.checked = (tv === true || tv === 'true' || tv === 'YES' || tv === 'on' || tv === 1);
            }
            const taxPerc = document.getElementById('in-taxpercent');
            if (taxPerc) {
                taxPerc.value = rowData[50] || 7;
            }

            // Hide Amounts on Receipt Settings
            const hideAmts = document.getElementById('in-hideamounts');
            if (hideAmts) {
                const hv = rowData[51];
                hideAmts.checked = (hv === true || hv === 'true' || hv === 'YES' || hv === 'on' || hv === 1);
            }

            // Set Tax Paid Checkbox (Index 52)
            const taxPaid = document.getElementById('in-taxpaid');
            if (taxPaid) {
                taxPaid.checked = (rowData[52] === 'PAID');
            }

            // Removed DRIVER Payout Status as requested

            const emailInput = document.getElementById('in-email');
            if (emailInput) {
                const ev = rowData[36]; // Correctly mapped to index 36 from mapTripToArray
                emailInput.value = (ev === '---' || ev === undefined || ev === null) ? '' : ev;
            }

            // Price per Day (Index 43 in mapTripToArray)
            const ppdInput = document.getElementById('in-priceperday');
            if (ppdInput) {
                ppdInput.value = (rowData[43] === undefined || rowData[43] === null) ? 0 : rowData[43];
            }

            // Truck / Trailer (Indices 44, 45 ignored for Trips UI)

            // Refresh UI States
            toggleModeFields();
            updateDriverCommission();

            setTripArchiveButton({ label: 'Update order', isUpdate: true, disabled: false, opacity: 1, title: 'Save changes to this trip' });
            if (window.refreshTripArchiveStockUi) window.refreshTripArchiveStockUi();

            // Highlighting Row (Removing redundant loadTableData call)
            // loadTableData();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        let isLoadingTable = false;
        async function loadTableData() {
            window.loadTableData = loadTableData;
            if (isLoadingTable) return;
            isLoadingTable = true;

            const logisticsBody = document.getElementById('table-body');
            if (!logisticsBody) { isLoadingTable = false; return; }
            
            // Re-bind sidebar lookups if needed (failsafe for early script execution)
            if (typeof setupReleaseValidation === 'function') setupReleaseValidation();

            // Fetch from Supabase FIRST
            try {
                const data = await getTrips();
                
                // --- Activity Log Sync (Admin Only) ---
                let tomorrowLogs = [];
                if (window.currentUserRole === 'admin' && window.fetchActivityLogs) {
                    const tom = new Date();
                    tom.setDate(tom.getDate() + 1);
                    const tomStr = tom.toISOString().split('T')[0];
                    tomorrowLogs = await window.fetchActivityLogs('VIEW_TOMORROW_ORDERS', tomStr);
                }
                const seenDrivers = new Set(tomorrowLogs.map(l => l.user_email));
                
                // --- Priority Sorting: TODAY first, then Chronological (Ascending) ---
                const todayStr = new Date().toISOString().split('T')[0];
                data.sort((a, b) => {
                    const isTodayA = (a.date === todayStr);
                    const isTodayB = (b.date === todayStr);
                    if (isTodayA && !isTodayB) return -1;
                    if (!isTodayA && isTodayB) return 1;
                    return (a.date || '').localeCompare(b.date || '');
                });

                console.log("Calendar View DEBUG: Records from Supabase ->", data ? data.length : 0);

                // Clear ONLY when data is ready
                logisticsBody.innerHTML = '';

                // Populating dynamic filters
                populateFilterPickers();

                currentTrips = data.map(mapTripToArray);

                // --- CALC SYNC: Recalculate based on ALL Trips loaded (Initial Load) ---
                if (window.renderDriverLog) window.renderDriverLog();

                currentTrips.forEach((rowData, idx) => {
                    try {
                        const tr = document.createElement('tr');
                        const isTodayEntry = (rowData[1] === todayStr);
                        const mode = rowData[26];
                        const stYard = rowData[30];
                        const stRate = rowData[32];
                        const stSales = rowData[33];
                        const stAmount = rowData[34];
                        const nextDueVal = rowData[29];
                        const email = rowData[36];

                        tr.dataset.styard = stYard || 'PEND';
                        tr.dataset.strent = rowData[31] || 'PEND';
                        tr.dataset.strate = stRate || 'PEND';
                        tr.dataset.stsales = stSales || 'PEND';
                        tr.dataset.stamount = stAmount || 'PEND';
                        tr.dataset.status = rowData[41] || 'PENDING_PAYMENT';
                        // Service type flags for filtering
                        tr.dataset.flagYard = (rowData[12] === 'YES') ? 'YES' : 'NO';
                        tr.dataset.flagTransport = (rowData[42] === 'YES') ? 'YES' : 'NO';
                        tr.dataset.flagSales = (rowData[43] === 'YES') ? 'YES' : 'NO';

                        // Priority Highlight for Today
                        if (isTodayEntry) {
                            tr.style.backgroundColor = '#fefce8'; // Light Amber
                            tr.style.border = '2px solid #f59e0b'; // Amber Priority
                        }

                        // Numerical values to handle $0.00 entries in filters
                        tr.dataset.yardval = parseFloat(String(rowData[13]).replace(/[$,]/g, '')) || 0;
                        tr.dataset.ppdval = parseFloat(String(rowData[14]).replace(/[$,]/g, '')) || 0;
                        tr.dataset.rateval = parseFloat(String(rowData[18]).replace(/[$,]/g, '')) || 0;
                        tr.dataset.salesval = parseFloat(String(rowData[20]).replace(/[$,]/g, '')) || 0;
                        tr.dataset.amountval = parseFloat(String(rowData[22]).replace(/[$,]/g, '')) || 0;

                        // Display helper
                        const fmtDate = (ds) => window.formatDateMMDDYYYY(ds);

                        // Display columns
                        const displayData = [
                            fmtDate(rowData[1]),  // 0: Date (MM/DD/YYYY)
                            rowData[2],           // 1: Size
                            rowData[3],           // 2: N. Cont
                            rowData[4],           // 3: Release #
                            rowData[5],           // 4: Order
                            rowData[6],           // 5: City
                            rowData[7],           // 6: Pick Up Address
                            rowData[8],           // 7: Delivery Place
                            rowData[9],           // 8: Doors Direction
                            rowData[10],          // 9: Miles
                            rowData[11],          // 10: Customer
                            rowData[13],          // 11: Yard Rate
                            rowData[14],          // 12: Price per Day
                            fmtDate(rowData[15]), // 13: Date Out (MM/DD/YYYY)
                            rowData[16],          // 14: Company
                            rowData[17],          // 15: Driver
                            rowData[18],          // 16: Trans. Pay
                            rowData[20],          // 17: Sales Price
                            rowData[22],          // 18: Amount
                            rowData[23],          // 19: Phone #
                            rowData[24],          // 20: Paid Driver
                            rowData[25],          // 21: Note
                            email                 // 22: Email
                        ];

                        displayData.forEach((text, i) => {
                            const td = document.createElement('td');

                            // Money formatting for specific columns: [11-YardRate, 12-PricePerDay, 16-TransPay, 17-SalesPrice, 18-Amount, 20-PaidDriver]
                            if ([11, 12, 16, 17, 18, 20].includes(i)) {
                                const val = parseFloat(text) || 0;
                                td.textContent = `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                td.style.fontWeight = 'bold';
                                if (i === 11) { // Yard Rate
                                    const isClear = (stYard === 'PAID' || val <= 0.01);
                                    const isCash = !!rowData[46];
                                    const iconClass = isCash ? 'fas fa-money-bill-wave' : 'fas fa-university';
                                    const iconColor = isCash ? '#059669' : '#3b82f6';
                                    td.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;" title="${isCash ? 'CASH' : 'ONLINE/BANK'}"></i>$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                    td.style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                                    td.style.color = isClear ? '#166534' : '#991b1b';
                                } else if (i === 12) { // Price per Day
                                    const isClear = (rowData[31] === 'PAID' || val <= 0.01);
                                    td.style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                                    td.style.color = isClear ? '#166534' : '#991b1b';
                                } else if (i === 16) { // Trans Pay
                                    const isClear = (stRate === 'PAID' || val <= 0.01);
                                    const isCash = !!rowData[47];
                                    const iconClass = isCash ? 'fas fa-money-bill-wave' : 'fas fa-university';
                                    const iconColor = isCash ? '#059669' : '#3b82f6';
                                    td.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;" title="${isCash ? 'CASH' : 'ONLINE/BANK'}"></i>$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                    td.style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                                    td.style.color = isClear ? '#166534' : '#991b1b';
                                } else if (i === 17) { // Sales Price
                                    const isClear = (stSales === 'PAID' || val <= 0.01);
                                    const isCash = !!rowData[48];
                                    const iconClass = isCash ? 'fas fa-money-bill-wave' : 'fas fa-university';
                                    const iconColor = isCash ? '#059669' : '#3b82f6';
                                    td.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;" title="${isCash ? 'CASH' : 'ONLINE/BANK'}"></i>$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                    td.style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                                    td.style.color = isClear ? '#166534' : '#991b1b';
                                } else if (i === 18) { // Amount
                                    // NO Background color as requested. Just Icons:
                                    const iconClass = (stAmount === 'PAID') ? 'fas fa-money-bill-wave' : 'fas fa-university';
                                    const iconColor = (stAmount === 'PAID') ? '#059669' : '#3b82f6';
                                    td.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;" title="${stAmount === 'PAID' ? 'CASH' : 'BANK TRANSFER'}"></i>$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                }
                            } else {
                                td.textContent = text;
                            }

                            // Custom styling for Driver Cell (Seen Indicator)
                            if (i === 15) { // Driver index in displayData
                                // Get Tomorrow in LOCAL time
                                const today = new Date();
                                const tomorrow = new Date(today);
                                tomorrow.setDate(today.getDate() + 1);
                                const tomStr = tomorrow.toLocaleDateString('sv-SE'); // Formato YYYY-MM-DD local
                                
                                // Check if this specific order is for tomorrow
                                if (rowData[1] === tomStr && text && text !== '---') {
                                    const driverName = (text || '').toUpperCase();
                                    const hasSeen = tomorrowLogs.some(log => {
                                        return log.user_email.toUpperCase().includes(driverName) || 
                                               driverName.includes(log.user_email.split('@')[0].toUpperCase());
                                    });

                                    if (hasSeen) {
                                        td.innerHTML = `${text} <i class="fas fa-check-double" style="color: #3b82f6; margin-left: 5px;" title="Driver has seen tomorrow's orders"></i>`;
                                    } else {
                                        // WhatsApp style: Gray double check if not seen yet
                                        td.innerHTML = `${text} <i class="fas fa-check-double" style="color: #94a3b8; margin-left: 5px; opacity: 0.6;" title="Driver hasn't seen tomorrow's orders yet"></i>`;
                                    }
                                }
                            }
                            
                            tr.appendChild(td);
                        });

                        // Action Column: Delete button
                        const actionTd = document.createElement('td');
                        const delBtn = document.createElement('button');
                        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                        delBtn.className = 'btn-cancel';
                        delBtn.style.padding = '4px 8px';
                        delBtn.onclick = async (e) => {
                            e.stopPropagation();
                            if (!confirm('¿Seguro que quieres borrar este viaje? Esta acción no se puede deshacer.')) return;
                            try {
                                // --- STOCK REVERSION LOGIC ---
                                const wasFinalized = rowData[41] === 'PAID';
                                const mode = rowData[26];
                                const relNo = rowData[4];
                                const size = rowData[2];
                                const type = rowData[44];
                                const cond = rowData[45];
                                const qtyVal = parseInt(rowData[53]) || 1;

                                if (wasFinalized && relNo && relNo !== '---' && (mode === 'SALE' || mode === 'RENT')) {
                                    console.log(`Reverting stock for deleted trip: ${relNo}, ${size}, Qty: ${qtyVal}`);
                                    
                                    // Ensure releases are loaded
                                    if (!currentReleases || currentReleases.length === 0) {
                                        if (window.loadReleasesData) await window.loadReleasesData();
                                    }

                                    // Find exact match
                                    const match = currentReleases.find(r => 
                                        r[0] === relNo && 
                                        String(r[16] || '').trim() === String(size || '').trim() &&
                                        r[2] === type &&
                                        r[3] === cond
                                    ) || currentReleases.find(r => r[0] === relNo); // Fallback to just Rel No

                                    if (match) {
                                        const releaseUuid = match[15];
                                        const currentStock = parseInt(match[14]) || 0;
                                        const newStock = currentStock + qtyVal;
                                        
                                        console.log(`Adjusting stock for release ${relNo}: ${currentStock} -> ${newStock}`);
                                        await db.from('releases')
                                            .update({ total_stock: newStock })
                                            .eq('id', releaseUuid);
                                            
                                        if (window.loadReleasesData) await window.loadReleasesData();
                                    }
                                }

                                await deleteTrip(rowData[0]); // This is trip_id
                                alert("Viaje eliminado");
                                await loadTableData();
                            } catch (err) {
                                console.error("Error during deletion/reversion:", err);
                                alert("Error al borrar: " + err.message);
                            }
                        };
                        actionTd.appendChild(delBtn);
                        tr.appendChild(actionTd);

                        tr.style.cursor = 'pointer';
                        tr.onclick = (e) => {
                            const tripId = rowData[0];
                            const isAlreadySelected = window.selectedTripIds.includes(tripId);
                            const isOnlySelected = window.selectedTripIds.length === 1 && isAlreadySelected;

                            if (e.ctrlKey) {
                                if (isAlreadySelected) {
                                    window.selectedTripIds = window.selectedTripIds.filter(id => id !== tripId);
                                } else {
                                    window.selectedTripIds.push(tripId);
                                }
                            } else {
                                if (isOnlySelected) {
                                    window.selectedTripIds = [];
                                } else {
                                    window.selectedTripIds = [tripId];
                                }
                            }

                            if (window.selectedTripIds.length > 0) {
                                loadTripToEdit(idx);
                            } else {
                                editingIndex = null;
                                editingTripDbId = null;
                                if (window.resetForm) window.resetForm();
                            }

                            // Dynamic Highlighting Refresh
                            document.querySelectorAll('#table-body tr').forEach((row, rIdx) => {
                                const rData = currentTrips[rIdx];
                                row.classList.remove('editing-row', 'selected-row');
                                if (editingIndex === rIdx) row.classList.add('editing-row');
                                else if (window.selectedTripIds.includes(rData?.[0])) row.classList.add('selected-row');
                            });
                        };
                        if (editingIndex === idx || window.selectedTripIds.includes(rowData[0])) {
                            tr.classList.add(editingIndex === idx ? 'editing-row' : 'selected-row');
                        }

                        // OVERDUE RENT HIGHLIGHTING
                        if (mode === 'RENT' && nextDueVal !== '---' && new Date(nextDueVal + 'T00:00:00') < new Date()) {
                            tr.style.backgroundColor = '#fff7ed';
                            tr.style.border = '2px solid #f97316';
                        }
                        logisticsBody.appendChild(tr);
                    } catch (rowErr) {
                        console.error("Rendering error for row", idx, rowErr);
                    }
                });
                // Apply existing filters if any (for real-time persistence)
                applyAdvancedFilters();
            } catch (err) {
                console.error("Error loading table:", err);
            } finally {
                isLoadingTable = false;
            }
        }

        let reportShowUnpaidOnly = false;
        function togglePendingFilter() {
            reportShowUnpaidOnly = !reportShowUnpaidOnly;
            const btn = document.getElementById('btn-pending-only');
            btn.style.background = reportShowUnpaidOnly ? '#fee2e2' : '#fff';
            btn.style.borderColor = reportShowUnpaidOnly ? '#ef4444' : '#cbd5e1';
            renderDriverLog();
        }

        async function resetReportFilters() {
            // Reset input fields
            const drv = document.getElementById('filter-search');
            const from = document.getElementById('filter-from');
            const to = document.getElementById('filter-to');
            
            if (drv) drv.value = '';
            if (from) from.value = '';
            if (to) to.value = '';

            // Reset pending only flag
            if (typeof reportShowUnpaidOnly !== 'undefined') {
                reportShowUnpaidOnly = false;
                const btn = document.getElementById('btn-pending-only');
                if (btn) {
                    btn.style.background = '#fff';
                    btn.style.borderColor = '#cbd5e1';
                }
            }

            // Sync UI display
            if (window.syncDriverNames) window.syncDriverNames();

            // Refresh data views
            if (window.renderDriverLog) window.renderDriverLog();
            if (window.fetchHistory) window.fetchHistory();
        }

        async function markTripAsPaid(tripId) {
            const tripIdx = currentTrips.findIndex(r => r[0] === tripId);
            if (tripIdx !== -1) {
                // Toggle status (Index 42)
                const newStatus = (currentTrips[tripIdx][42] === 'PAID') ? 'PENDING' : 'PAID';

                try {
                    await updateTrip(tripId, { payout_status: newStatus });
                    await loadTableData(); // Sync calendar table and local cache
                    renderDriverLog();
                } catch (e) {
                    console.error("Payout toggle failed:", e);
                    alert("Failed to update payout status in database.");
                }
            }
        }

        async function settleDriverGroup(driverName) {
            if (!confirm(`Are you sure you want to mark ALL pending trips for ${driverName} as PAID?`)) return;

            const toUpdate = currentTrips.filter(r => (r[16] || 'UNASSIGNED') === driverName && r[42] !== 'PAID');

            try {
                // Bulk update logic: Sequential for safety or Promise.all
                const promises = toUpdate.map(r => updateTrip(r[0], { payout_status: 'PAID' }));
                await Promise.all(promises);
                await loadTableData();
                renderDriverLog();
                alert(`Settled ${toUpdate.length} trips for ${driverName}`);
            } catch (e) {
                console.error("Group settlement failed:", e);
                alert("Some trips failed to update. Check console.");
            }
        }

        async function revertDriverGroup(driverName) {
            if (!confirm(`Do you want to REVERT all trips for ${driverName} back to PENDING?`)) return;

            const toUpdate = currentTrips.filter(r => (r[16] || 'UNASSIGNED') === driverName && r[42] === 'PAID');

            try {
                const promises = toUpdate.map(r => updateTrip(r[0], { payout_status: 'PENDING' }));
                await Promise.all(promises);
                await loadTableData();
                renderDriverLog();
                alert(`Reverted ${toUpdate.length} trips to pending.`);
            } catch (e) {
                console.error("Group revert failed:", e);
            }
        }

        function toggleSizeMode(forceMode) {
            const sel = document.getElementById('in-size-sel');
            const man = document.getElementById('in-size');
            const icon = document.getElementById('toggle-icon-size');

            let isManual = man.style.display !== 'none';
            if (forceMode === 'manual') isManual = false;
            if (forceMode === 'list') isManual = true;

            if (isManual) {
                man.style.display = 'none';
                sel.style.display = 'block';
                icon.className = 'fas fa-edit';
                man.value = '';
            } else {
                sel.style.display = 'none';
                man.style.display = 'block';
                icon.className = 'fas fa-list';
                sel.selectedIndex = 0;
            }
        }
        window.toggleSizeMode = toggleSizeMode;

