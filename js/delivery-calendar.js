// --- PREVENT MOUSE WHEEL FROM CHANGING NUMBER INPUT VALUES ---
document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('wheel', function (e) {
        if (document.activeElement && document.activeElement.type === 'number') {
            document.activeElement.blur();
        }
    }, { passive: true });
});

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
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                console.warn("Student attempted syncImmediate (blocked)");
                return;
            }
            if (editingIndex === null) return;
            const tripId = editingTripDbId;
            if (!tripId) return;

            const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
            if (!isUUID(tripId)) {
                console.warn("syncImmediate blocked: Legacy ID detected. Please refresh and try again after migration.");
                return;
            }

            const updateData = {};
            updateData[fieldName] = value;
            if (fieldName === 'st_amount') updateData.paid = (value === 'PAID');

            // --- PAY VALIDATION LOGIC REMOVED (User manages status manually) ---
            // Status now depends strictly on the manual 'Status' toggle.
            if (fieldName === 'st_amount') updateData.paid = (value === 'PAID');

            try {
                await updateTrip(tripId, updateData);
                
                // Update local state instead of full reload
                if (window.currentTrips) {
                    const localTrip = window.currentTrips.find(t => t[0] === tripId);
                    if (localTrip) {
                        // We need to map the fieldName back to the correct array index if we want to update the UI perfectly.
                        // However, for now, we'll do a lighter loadTableData or just update the currentDocTrip.
                        // To be safe and efficient, we update the local object and refresh the Doc Preview.
                        const fieldMap = {
                            'st_yard': 30, 'st_rent': 31, 'st_rate': 32, 'st_sales': 33, 'st_amount': 34,
                            'status': 41, 'paid': 34 // approximate
                        };
                        const idx = fieldMap[fieldName];
                        if (idx !== undefined) localTrip[idx] = value;
                    }
                }

                // --- DOCUMENT PREVIEW SYNC ---
                if (window.currentDocTrip && window.currentDocTrip[0] === tripId) {
                    const updatedTrip = (window.currentTrips || []).find(t => t[0] === tripId);
                    if (updatedTrip) {
                        window.currentDocTrip = updatedTrip;
                        if (window.drawReceipt) window.drawReceipt();
                    }
                }
                
                // (local state already updated above)
            } catch (err) {
                console.error("Immediate sync failed:", err);
                alert("DATABASE ERROR: " + (err.message || "Failed to sync field " + fieldName));
            }
        }
        window.syncImmediate = syncImmediate;

        let isSaving = false;
        async function addRow() {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot create or modify calendar orders.");
                return;
            }
            if (isSaving) return;

            const tripBtn = getTripArchiveButton();
            const labelSpan = tripBtn?.querySelector('.btn-archive-order-label');
            if (tripBtn) {
                tripBtn.disabled = true;
                if (labelSpan) labelSpan.textContent = 'Saving…';
                tripBtn.style.opacity = '0.7';
            }
            isSaving = true;

            try {
                const isTransport = document.getElementById('in-flag2').checked;
                const compVal = document.getElementById('in-company').value;
                const driverVal = document.getElementById('in-driver').value;

                // Company and Driver are MANDATORY if it's a transport-related order
                if (isTransport && (!compVal || compVal === '---')) {
                    alert("ERROR: Debes seleccionar una compañía para órdenes que incluyan servicios de transporte.");
                    isSaving = false;
                    restoreTripArchiveButtonUI();
                    return;
                }

                if (isTransport && (!driverVal || driverVal === '---')) {
                    alert("ERROR: Debes seleccionar un conductor para órdenes que incluyan servicios de transporte.");
                    isSaving = false;
                    restoreTripArchiveButtonUI();
                    return;
                }

                if (editingIndex === null) {
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
                    'in-invoice-sent', 'in-seller'
                ];

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

                const selectedRelType = document.getElementById('in-rel-type')?.value || 'DRY';
                const selectedRelCond = document.getElementById('in-rel-condition')?.value || 'USED';

                const finalizeVal = document.getElementById('in-status-toggle')?.value || 'PENDING_PAYMENT';
                const isFinalized = (finalizeVal === 'COMPLETE' || finalizeVal === 'PAID');
                const globalStatus = isFinalized ? 'COMPLETE' : 'PENDING_PAYMENT';

                const containerSource = document.getElementById('in-container-source')?.value || 'RELEASE';
                const yardItemId = document.getElementById('in-yard-item-id')?.value;
                const isYardSource = containerSource === 'YARD' || containerSource === 'STORAGE';

                const isMoveToYard = document.getElementById('in-move-to-yard')?.checked || false;

                // --- STOCK LOGIC PREPARATION ---
                const releasesSource = window.currentReleases || [];
                const selectedReleaseNormalized = (selectedRelease || '').trim().toUpperCase();
                const selectedSizeNormalized = (selectedSize || '').trim().toUpperCase();
                const releaseExists = releasesSource.some(r => (r[0] || '').trim().toUpperCase() === selectedReleaseNormalized);

                // --- MANUAL DEDUCT TOGGLE (replaces all old automatic rules) ---
                const manualDeductStock = document.getElementById('in-deduct-stock')?.checked ?? true;
                const isDeductionCandidate = !isYardSource && (selectedRelease && selectedRelease !== '---' && releaseExists) && manualDeductStock;
                const isYardDeductionCandidate = isYardSource && yardItemId && isFinalized;

                let wasFinalized = false;
                let wasDeductionCandidate = false;
                let wasMoveToYard = false;
                let oldRelData = null;

                if (editingIndex !== null) {
                    const tripsSource = window.currentTrips || [];
                    const oldRow = tripsSource[editingIndex];
                    if (oldRow) {
                        wasFinalized = (oldRow[41] === 'PAID' || oldRow[41] === 'COMPLETE');
                        wasMoveToYard = !!oldRow[62]; 
                        const oldSource = oldRow[58] || 'RELEASE';
                        const oldYardId = oldRow[59];
                        const oldRel = (oldRow[4] || '').trim().toUpperCase();
                        const oldRelExists = releasesSource.some(r => (r[0] || '').trim().toUpperCase() === oldRel);
                        // Determine wasDeductionCandidate:
                        // For new orders (index 74 saved), use that value directly.
                        // For old orders (index 74 is null), fall back to the old booking-number rule.
                        const savedDeductStock = oldRow[74];
                        if (savedDeductStock !== null && savedDeductStock !== undefined) {
                            wasDeductionCandidate = (oldSource === 'RELEASE') && (oldRel && oldRel !== '---' && oldRelExists) && (savedDeductStock === true || savedDeductStock === 'true');
                        } else {
                            const oldBookingStr = (oldRow[65] || '').trim();
                            const oldBookingNumber = oldBookingStr === '---' ? '' : oldBookingStr;
                            wasDeductionCandidate = (oldSource === 'RELEASE') && (oldRel && oldRel !== '---' && oldRelExists) && (!oldBookingNumber);
                        }
                        const wasYardDeductionCandidate = (oldSource === 'YARD' || oldSource === 'STORAGE') && oldYardId && wasFinalized;
                        
                        if (wasYardDeductionCandidate) {
                            const { data: yardItem } = await db.from('yard_stock').select('notes, lifts').eq('id', oldYardId).single();
                            if (yardItem) {
                                let notes = yardItem.notes || '';
                                notes = notes.replace(/\[ExitDate:\s*[\d\-]+\]/g, '').trim().replace(/\s+/g, ' ');
                                const newLifts = Math.max(1, (yardItem.lifts || 2) - 1);
                                await db.from('yard_stock').update({ status: 'AVAILABLE', notes: notes, exit_date: null, lifts: newLifts, order_out: null }).eq('id', oldYardId);
                                if (typeof window.updateLocalYardStatus === 'function') window.updateLocalYardStatus(oldYardId, 'AVAILABLE', notes, null, newLifts, null);
                            } else {
                                await db.from('yard_stock').update({ status: 'AVAILABLE', exit_date: null, lifts: 1, order_out: null }).eq('id', oldYardId);
                                if (typeof window.updateLocalYardStatus === 'function') window.updateLocalYardStatus(oldYardId, 'AVAILABLE', undefined, null, 1, null);
                            }
                        }
                        if (wasDeductionCandidate) {
                            oldRelData = {
                                release: oldRel,
                                size: (oldRow[2] || '---').trim().toUpperCase(),
                                qty: parseInt(oldRow[53]) || 1,
                                type: oldRow[44],
                                cond: oldRow[45]
                            };
                        }
                    }
                }

                let revertOld = wasFinalized && wasDeductionCandidate;
                let deductNew = isFinalized && isDeductionCandidate;
                const newQtyVal = parseInt(document.getElementById('in-qty')?.value) || 1;

                // Optimization: skip if nothing changed
                if (editingIndex !== null) {
                    const oldRow = window.currentTrips[editingIndex];
                    const clean = (v) => (v || '').toString().split('(')[0].trim().toUpperCase();
                    const oldQty = parseInt(oldRow[53]) || 1;
                    if (clean(oldRow[4]) === clean(selectedRelease) && clean(oldRow[2]) === clean(selectedSize) && (wasFinalized === isFinalized) && (wasDeductionCandidate === isDeductionCandidate) && (oldQty === newQtyVal)) {
                        revertOld = false; deductNew = false;
                    }
                }

                let pendingStockUpdates = [];
                if (deductNew || revertOld) {
                    if (revertOld && oldRelData) {
                        let oldRows = releasesSource.filter(r => (r[0] || '').trim().toUpperCase() === oldRelData.release && (r[16] || '').trim().toUpperCase() === oldRelData.size);
                        // Fallback: if container_size not set in DB, match by release number only
                        if (oldRows.length === 0) oldRows = releasesSource.filter(r => (r[0] || '').trim().toUpperCase() === oldRelData.release);
                        if (oldRows.length > 0) pendingStockUpdates.push({ targetReleaseId: oldRows[0][15], stockChange: oldRelData.qty });
                    }
                    if (deductNew) {
                        let matchingRows = releasesSource.filter(r => (r[0] || '').trim().toUpperCase() === selectedReleaseNormalized && (r[16] || '').trim().toUpperCase() === selectedSizeNormalized);
                        // Fallback: if container_size not set in DB (stored as '---'), match by release number only
                        if (matchingRows.length === 0) matchingRows = releasesSource.filter(r => (r[0] || '').trim().toUpperCase() === selectedReleaseNormalized);
                        if (matchingRows.length > 0) {
                            let totalStockFound = matchingRows.reduce((sum, r) => sum + (parseInt(r[14]) || 0), 0);
                            if (totalStockFound < newQtyVal) throw new Error("Stock insuficiente en el Release seleccionado.");
                            pendingStockUpdates.push({ targetReleaseId: matchingRows[0][15], stockChange: -newQtyVal });
                        }
                    }
                }

                if (isYardDeductionCandidate) {
                    const orderDate = document.getElementById('in-date')?.value || new Date().toISOString().split('T')[0];
                    const { data: yardItem } = await db.from('yard_stock').select('notes, lifts').eq('id', yardItemId).single();
                    if (yardItem) {
                        let notes = yardItem.notes || '';
                        notes = notes.replace(/\[ExitDate:\s*[\d\-]+\]/g, '').trim();
                        const isStorage = notes.includes('[Storage Yard]');
                        if (isStorage) {
                            notes = notes.replace('[Storage Yard] ', '').replace('[Storage Yard]', '').trim();
                        }
                        const prefix = isStorage ? '[Storage Yard] ' : '';
                        const updatedNotes = `${prefix}[ExitDate: ${orderDate}] ${notes}`.trim().replace(/\s+/g, ' ');
                        const newLifts = (yardItem.lifts || 1) + 1;
                        const outOrderNo = document.getElementById('in-order')?.value || '---';
                        await db.from('yard_stock').update({ status: 'SOLD', notes: updatedNotes, exit_date: orderDate, lifts: newLifts, order_out: outOrderNo }).eq('id', yardItemId);
                        if (typeof window.updateLocalYardStatus === 'function') window.updateLocalYardStatus(yardItemId, 'SOLD', updatedNotes, orderDate, newLifts, outOrderNo);
                    } else {
                        const outOrderNo = document.getElementById('in-order')?.value || '---';
                        await db.from('yard_stock').update({ status: 'SOLD', exit_date: orderDate, lifts: 2, order_out: outOrderNo }).eq('id', yardItemId);
                        if (typeof window.updateLocalYardStatus === 'function') window.updateLocalYardStatus(yardItemId, 'SOLD', undefined, orderDate, 2, outOrderNo);
                    }
                }

                // --- DATA MAPPING ---
                const isYardPaid = document.getElementById('in-yardpaid').checked;
                const isRatePaid = document.getElementById('in-ratepaid').checked;
                const isSalesPaid = document.getElementById('in-salespaid').checked;
                const isAmountPaid = document.getElementById('in-amountpaid').checked;

                const stYard = isYardPaid ? 'PAID' : 'PEND';
                const stRent = document.getElementById('in-rentpaid')?.checked ? 'PAID' : 'PEND';
                const stRate = isRatePaid ? 'PAID' : 'PEND';
                const stSales = isSalesPaid ? 'PAID' : 'PEND';
                const stAmount = isAmountPaid ? 'PAID' : 'PEND';

                const baseValues = fields.map(id => document.getElementById(id)?.value || '---');
                baseValues[1] = selectedSize || '---';
                baseValues[3] = selectedRelease || '---';
                baseValues[6] = selectedPickup || '---';
                baseValues[10] = selectedCustomer || '---';

                let pending = 0;
                const qtyMultiplier = parseInt(document.getElementById('in-qty')?.value) || 1;
                if (stYard === 'PEND') pending += (parseFloat(document.getElementById('in-yardrate')?.value || '0') || 0) * qtyMultiplier;
                if (stRate === 'PEND') pending += (parseFloat(document.getElementById('in-rate')?.value || '0') || 0) * qtyMultiplier;
                if (stSales === 'PEND') pending += (parseFloat(document.getElementById('in-sales')?.value || '0') || 0) * qtyMultiplier;
                if (stAmount === 'PEND') pending += parseFloat(document.getElementById('in-amount')?.value || '0') || 0;

                let existingSig = '', existingPhotos = [], existingSigDriver = '';
                if (editingIndex !== null && window.currentTrips[editingIndex]) {
                    existingSig = window.currentTrips[editingIndex][54] || '';
                    existingPhotos = window.currentTrips[editingIndex][55] || [];
                    existingSigDriver = window.currentTrips[editingIndex][56] || '';
                }

                const rowData = [
                    editingTripDbId || '', ...baseValues.slice(0, 28), baseValues[28], stYard, stRent, stRate, stSales, stAmount, pending.toFixed(2),
                    document.getElementById('in-email')?.value || '---', document.getElementById('in-truck')?.value || '---', document.getElementById('in-trailer')?.value || '---',
                    calculateFinalPay(baseValues[15], parseFloat(baseValues[23]) || 0), isYardPaid, globalStatus,
                    document.getElementById('in-flag2').checked ? 'YES' : 'NO', document.getElementById('in-flag3').checked ? 'YES' : 'NO',
                    selectedRelType, selectedRelCond,
                    document.getElementById('in-yard-cash').checked, document.getElementById('in-rate-cash').checked, document.getElementById('in-sales-cash').checked,
                    document.getElementById('in-showtax')?.checked || false, parseFloat(document.getElementById('in-taxpercent')?.value || '0') || 0,
                    document.getElementById('in-hideamounts')?.checked || false, document.getElementById('in-taxpaid')?.checked ? 'PAID' : 'PEND',
                    newQtyVal, existingSig, existingPhotos, existingSigDriver, (document.getElementById('in-sendemail')?.checked ? 'YES' : (document.getElementById('in-invoice-sent')?.value || 'NO')),
                    containerSource, yardItemId || '', window.userEmail || '', document.getElementById('in-seller')?.value || '---', isMoveToYard,
                    null, null, // indices 63-64: invoice_last_sent, invoice_reminder_count
                    (document.getElementById('in-booking')?.value || '---').toUpperCase(), // 65: booking_no
                    parseFloat(document.getElementById('in-rate-cash-amt')?.value) || 0, // 66: trans_cash_amt
                    parseFloat(document.getElementById('in-rate-bank-amt')?.value) || 0, // 67: trans_bank_amt
                    parseFloat(document.getElementById('in-yard-cash-amt')?.value) || 0, // 68: yard_cash_amt
                    parseFloat(document.getElementById('in-yard-bank-amt')?.value) || 0, // 69: yard_bank_amt
                    parseFloat(document.getElementById('in-sales-cash-amt')?.value) || 0, // 70: sales_cash_amt
                    parseFloat(document.getElementById('in-sales-bank-amt')?.value) || 0, // 71: sales_bank_amt
                    parseFloat(document.getElementById('in-amount-cash-amt')?.value) || 0, // 72: amount_cash_amt
                    parseFloat(document.getElementById('in-amount-bank-amt')?.value) || 0, // 73: amount_bank_amt
                    document.getElementById('in-deduct-stock')?.checked ?? true              // 74: deduct_stock
                ];

                const dbObj = mapArrayToTrip(rowData);
                const toYardDest = document.getElementById('in-to-yard-dest')?.value || 'RPTULIPAN';
                const yardNotesPrefix = toYardDest === 'STORAGE' ? '[Storage Yard] ' : '';
                const orderNote = (document.getElementById('in-note')?.value || '').trim();
                const combinedNotes = orderNote ? `${yardNotesPrefix}${orderNote}` : yardNotesPrefix.trim();
                const yardData = {
                    container_no: (document.getElementById('in-ncont')?.value || '---').toUpperCase(),
                    size: selectedSize || '---',
                    type: selectedRelType,
                    condition: selectedRelCond,
                    origin_release: document.getElementById('in-order')?.value || '---',
                    notes: combinedNotes,
                    customer_name: selectedCustomer || '---',
                    customer_phone: document.getElementById('in-phone')?.value || ''
                };

                // Capture the editing state BEFORE it gets cleared
                const savedIndex = editingIndex;
                const savedTripId = editingTripDbId;

                // --- ATOMIC SYNC VIA RPC ---
                const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
                const finalTripId = savedTripId || newTripIdForDb();
                
                if (!isUUID(finalTripId)) {
                    throw new Error(`La ID de esta orden (${finalTripId}) no es compatible con el nuevo sistema UUID. Por favor, ejecuta el script de migración SQL en Supabase o contacta a soporte.`);
                }

                console.log("Saving order via RPC sync...", { tripId: finalTripId, isMoveToYard });
                
                // BYPASS RPC YARD LOGIC to fix duplicates and phone mapping
                const { error: rpcErr } = await db.rpc('sync_order_with_yard', {
                    p_trip_id: finalTripId,
                    p_trip_data: dbObj,
                    p_order_no: document.getElementById('in-order')?.value || '---',
                    p_is_finalized: isFinalized,
                    p_move_to_yard: false, 
                    p_yard_data: yardData
                });

                if (rpcErr) throw rpcErr;

                // --- MASTER SAFETY UPDATE: Force save ALL fields from dbObj to guarantee DB matches UI ---
                const { trip_id: _ignoredId, ...masterPayload } = dbObj;
                masterPayload.move_to_yard = isMoveToYard;
                
                await db.from('trips').update(masterPayload).eq('trip_id', finalTripId);

                // --- MANUALLY SYNC YARD STOCK ---
                if (isMoveToYard) {
                    try {
                        let searchOrder = yardData.origin_release;
                        let searchCont = yardData.container_no;
                        
                        // If it was already in yard, try to find it using the old values in case they were edited
                        if (wasMoveToYard && editingIndex !== null) {
                            const oldRow = window.currentTrips[editingIndex];
                            if (oldRow) {
                                searchOrder = (oldRow[5] || '').trim().toUpperCase() || searchOrder; // order_no
                                searchCont = (oldRow[3] || '').trim().toUpperCase() || searchCont; // ncont
                            }
                        }

                        const { data: existingYard } = await db.from('yard_stock')
                            .select('id')
                            .eq('origin_release', searchOrder)
                            .eq('container_no', searchCont)
                            .limit(1);

                        const calendarDate = document.getElementById('in-date')?.value;
                        const createdAtStr = calendarDate ? new Date(calendarDate + 'T12:00:00').toISOString() : new Date().toISOString();

                        if (existingYard && existingYard.length > 0) {
                            // Update existing record
                            await db.from('yard_stock')
                                .update({ 
                                    container_no: yardData.container_no,
                                    size: yardData.size,
                                    type: yardData.type,
                                    condition: yardData.condition,
                                    origin_release: yardData.origin_release,
                                    notes: yardData.notes,
                                    customer_name: yardData.customer_name,
                                    customer_phone: yardData.customer_phone,
                                    created_at: createdAtStr
                                })
                                .eq('id', existingYard[0].id);
                        } else {
                            // Insert new record
                            await db.from('yard_stock')
                                .insert([{ 
                                    container_no: yardData.container_no,
                                    size: yardData.size,
                                    type: yardData.type,
                                    condition: yardData.condition,
                                    origin_release: yardData.origin_release,
                                    notes: yardData.notes,
                                    customer_name: yardData.customer_name,
                                    customer_phone: yardData.customer_phone,
                                    created_at: createdAtStr,
                                    status: 'AVAILABLE',
                                    entry_fee: 0,
                                    daily_rate: 0,
                                    lifts: 1
                                }]);
                        }
                    } catch(err) {
                        console.error("Failed to sync yard stock manually", err);
                    }
                }

                // --- REFRESH YARD UI ---
                if (isMoveToYard && typeof window.loadYardData === 'function') await window.loadYardData(true);

                editingIndex = null; editingTripDbId = null; window.selectedTripIds = [];

                // --- STOCK UPDATE (RELEASES) ---
                for (const [releaseId, change] of Object.entries(pendingStockUpdates.reduce((acc, u) => { acc[u.targetReleaseId] = (acc[u.targetReleaseId] || 0) + u.stockChange; return acc; }, {}))) {
                    const releaseRow = releasesSource.find(r => String(r[15]) === String(releaseId));
                    if (releaseRow) {
                        const newStock = Math.max(0, (parseInt(releaseRow[14]) || 0) + change);
                        await db.from('releases').update({ total_stock: newStock }).eq('id', releaseRow[15]);
                        releaseRow[14] = newStock;
                    }
                }

                // Check if email send was requested before form is reset
                const shouldSendEmail = document.getElementById('in-sendemail')?.checked;
                // Copy rowData and set the correct trip_id (index 0)
                const emailRowData = [...rowData];
                emailRowData[0] = finalTripId;

                alert('¡ORDEN GUARDADA CORRECTAMENTE!');
                resetForm();

                // Trigger email sending in background after database save is complete
                if (shouldSendEmail) {
                    const emailAddr = emailRowData[36];
                    if (!emailAddr || emailAddr === '---' || !emailAddr.includes('@')) {
                        console.warn("Invalid email address:", emailAddr);
                        if (window.showToast) window.showToast("Email invalid or missing, not sent", "warning");
                        else alert("Warning: Email invalid or missing, not sent.");
                    } else {
                        console.log("Triggering receipt email send for order:", emailRowData[5]);
                        if (window.showToast) window.showToast("Generating PDF & sending email...", "info");
                        
                        // Invoke generate and send sequence asynchronously
                        window.sendReceiptEmail(emailRowData).then(() => {
                            console.log("Receipt email sent successfully for order:", emailRowData[5]);
                        }).catch(err => {
                            console.error("Failed to send receipt email from calendar:", err);
                            if (window.showToast) window.showToast("Failed to send email: " + (err.text || err.message || err), "error");
                            else alert("Failed to send email: " + (err.text || err.message || JSON.stringify(err)));
                        });
                    }
                }

                if (savedIndex !== null) {
                    // OPTIMIZED UPDATE: Update the local array and the specific row UI
                    const updatedRowData = window.mapTripToArray(dbObj);
                    // Ensure the trip_id (which is at index 0) is preserved correctly
                    updatedRowData[0] = finalTripId;
                    
                    if (window.currentTrips) {
                        const idxInCurrent = window.currentTrips.findIndex(t => t[0] === finalTripId);
                        if (idxInCurrent !== -1) {
                            window.currentTrips[idxInCurrent] = updatedRowData;
                        } else {
                            window.currentTrips[savedIndex] = updatedRowData;
                        }
                    }

                    if (window.allTripsUnfiltered) {
                        const unfilteredIdx = window.allTripsUnfiltered.findIndex(t => t[0] === finalTripId);
                        if (unfilteredIdx !== -1) {
                            window.allTripsUnfiltered[unfilteredIdx] = updatedRowData;
                        } else {
                            window.allTripsUnfiltered.push(updatedRowData);
                        }
                    }

                    // Find the row in the DOM and refresh it
                    const targetTr = document.querySelector(`#table-body tr[data-tripid="${finalTripId}"]`);
                    if (targetTr && typeof window.refreshSingleRowUI === 'function') {
                        window.refreshSingleRowUI(targetTr, updatedRowData);
                        console.log("UI updated locally for row:", finalTripId);
                    } else {
                        // Fallback if anything goes wrong
                        await loadTableData(null, true);
                    }
                } else {
                    // NEW ORDER: local cache update (no DB fetch!)
                    const newRowData = window.mapTripToArray(dbObj);
                    newRowData[0] = finalTripId;

                    if (!window.currentTrips) window.currentTrips = [];
                    // DUPLICATE PROTECTION: Only push if the Realtime listener hasn't already loaded it!
                    const exists = window.currentTrips.some(t => t[0] === finalTripId);
                    if (!exists) {
                        window.currentTrips.push(newRowData);
                    } else {
                        const idx = window.currentTrips.findIndex(t => t[0] === finalTripId);
                        if (idx !== -1) window.currentTrips[idx] = newRowData;
                    }

                    if (!window.allTripsUnfiltered) window.allTripsUnfiltered = [];
                    // DUPLICATE PROTECTION: Only push if the Realtime listener hasn't already loaded it!
                    const existsUnfiltered = window.allTripsUnfiltered.some(t => t[0] === finalTripId);
                    if (!existsUnfiltered) {
                        window.allTripsUnfiltered.push(newRowData);
                    } else {
                        const idx = window.allTripsUnfiltered.findIndex(t => t[0] === finalTripId);
                        if (idx !== -1) window.allTripsUnfiltered[idx] = newRowData;
                    }

                    // Re-render table locally using the updated currentTrips cache
                    await loadTableData(window.currentTrips);
                    console.log("New order added and rendered locally without DB fetch.");
                }
            } catch (err) {
                console.error("FATAL ERROR IN ADDROW:", err);
                if (err.details) console.error("Error Details:", err.details);
                if (err.hint) console.error("Error Hint:", err.hint);
                alert("CRITICAL ERROR: " + (err.message || "Unknown error"));
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
                'in-yard', 'in-collect', 'in-mode', 'in-income', 'in-booking'
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
                        el.value = '';
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
                'in-sendemail', 'in-move-to-yard'
            ];
            checks.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.checked = false;
            });

            // Reset deduct-stock to YES by default for new orders
            const deductChkReset = document.getElementById('in-deduct-stock');
            if (deductChkReset) deductChkReset.checked = true;
            if (window.updateDeductButtons) window.updateDeductButtons();

            if (typeof window.setContainerSource === 'function') {
                window.setContainerSource('RELEASE');
            }
            if (document.getElementById('in-yard-item-id')) {
                document.getElementById('in-yard-item-id').value = '';
            }
            if (document.getElementById('in-to-yard-dest')) {
                document.getElementById('in-to-yard-dest').value = 'RPTULIPAN';
                document.getElementById('in-to-yard-dest').style.display = 'none';
            }

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

            // 6. Restore Button UI and Clear Selection
            window.selectedTripIds = []; // DESELECT any selected orders
            
            // Clear CSS classes from the DOM to remove highlighting
            document.querySelectorAll('#table-body tr').forEach(row => {
                row.classList.remove('editing-row', 'selected-row');
            });
            
            if (typeof restoreTripArchiveButtonUI === 'function') restoreTripArchiveButtonUI();
        }
        window.startNewOrder = startNewOrder;
        window.resetForm = startNewOrder; // Alias for safety

        // --- OPTIMIZED UI UPDATE FOR SINGLE ROW ---
        window.refreshSingleRowUI = function(tr, rowData) {
            const todayStr = new Date().toISOString().split('T')[0];
            const isTodayEntry = (rowData[1] === todayStr);
            
            const stYard = rowData[30];
            const stRent = rowData[31];
            const stRate = rowData[32];
            const stSales = rowData[33];
            const stAmount = rowData[34];
            const mode = rowData[26];
            const nextDueVal = rowData[29];

            // Update Datasets for Filtering & Logic
            tr.dataset.styard = stYard || 'PEND';
            tr.dataset.strent = stRent || 'PEND';
            tr.dataset.strate = stRate || 'PEND';
            tr.dataset.stsales = stSales || 'PEND';
            tr.dataset.stamount = stAmount || 'PEND';
            tr.dataset.status = rowData[41] || 'PENDING_PAYMENT';
            tr.dataset.seller = rowData[61] || '';
            tr.dataset.invoiceSent = rowData[57] || 'NO';
            tr.dataset.flagYard = (rowData[12] === 'YES') ? 'YES' : 'NO';
            tr.dataset.flagTransport = (rowData[42] === 'YES') ? 'YES' : 'NO';
            tr.dataset.flagSales = (rowData[43] === 'YES') ? 'YES' : 'NO';
            tr.dataset.flagToYard = !!rowData[62] ? 'YES' : 'NO';
            tr.dataset.fromCall = (rowData[58] === 'FORM_CALL') ? 'YES' : 'NO';

            // Highlights
            tr.style.backgroundColor = '';
            tr.style.border = '';
            if (isTodayEntry) {
                tr.style.backgroundColor = '#fefce8';
                tr.style.border = '2px solid #f59e0b';
            }
            if (rowData[41] === 'PENDING_PAYMENT' && rowData[1] < todayStr) {
                tr.style.backgroundColor = '#fee2e2';
                tr.style.border = '2px solid #ef4444';
            }
            if (mode === 'RENT' && nextDueVal !== '---' && new Date(nextDueVal + 'T00:00:00') < new Date()) {
                tr.style.backgroundColor = '#fff7ed';
                tr.style.border = '2px solid #f97316';
            }

            // Numerical values for filters
            tr.dataset.yardval = parseFloat(String(rowData[13]).replace(/[$,]/g, '')) || 0;
            tr.dataset.ppdval = parseFloat(String(rowData[14]).replace(/[$,]/g, '')) || 0;
            tr.dataset.rateval = parseFloat(String(rowData[18]).replace(/[$,]/g, '')) || 0;
            tr.dataset.salesval = parseFloat(String(rowData[20]).replace(/[$,]/g, '')) || 0;
            tr.dataset.amountval = parseFloat(String(rowData[22]).replace(/[$,]/g, '')) || 0;

            const fmtDate = (ds) => window.formatDateMMDDYYYY(ds);
            
            // Map table cells to rowData indices
            // Cells: 0=Date, 1=Size, 2=N.Cont, 3=Booking#, 4=Release#, 5=Order, 6=City, 7=PickUp, 8=Delivery, 9=Doors, 10=Miles, 11=Customer, 12=YardRate, 13=PPDay, 14=DateOut, 15=Company, 16=Driver, 17=TransPay, 18=SalesPrice, 19=Amount, 20=Phone, 21=PaidDriver, 22=Note
            const displayMapping = [
                1, 2, 3, 65, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20, 22, 23, 24, 25
            ];


            const cells = tr.querySelectorAll('td');
            displayMapping.forEach((dataIdx, cellIdx) => {
                if (cells[cellIdx]) {
                    let val = rowData[dataIdx];
                    if (dataIdx === 1 || dataIdx === 15) val = fmtDate(val);
                    
                    if ([13, 14, 18, 20, 22, 24].includes(dataIdx)) {
                        let numVal = parseFloat(String(val).replace(/[$,]/g, '')) || 0;
                        if ([13, 14, 18, 20, 24].includes(dataIdx)) {
                            numVal = numVal * (parseInt(rowData[53]) || 1);
                        }
                        const fmtMoney = `$${numVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                        cells[cellIdx].style.fontWeight = 'bold';
                        
                        if (dataIdx === 13) {
                            const isClear = (stYard === 'PAID' || numVal <= 0.01);
                            const isCash = !!rowData[46];
                            const iconClass = isCash ? 'fas fa-money-bill-wave' : 'fas fa-university';
                            const iconColor = isCash ? '#059669' : '#3b82f6';
                            cells[cellIdx].innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;"></i>${fmtMoney}`;
                            cells[cellIdx].style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                            cells[cellIdx].style.color = isClear ? '#166534' : '#991b1b';
                        } else if (dataIdx === 14) {
                            const isClear = (stRent === 'PAID' || numVal <= 0.01);
                            cells[cellIdx].textContent = fmtMoney;
                            cells[cellIdx].style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                            cells[cellIdx].style.color = isClear ? '#166534' : '#991b1b';
                        } else if (dataIdx === 18) {
                            const isClear = (stRate === 'PAID' || numVal <= 0.01);
                            const isCash = !!rowData[47];
                            const iconClass = isCash ? 'fas fa-money-bill-wave' : 'fas fa-university';
                            const iconColor = isCash ? '#059669' : '#3b82f6';
                            cells[cellIdx].innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;"></i>${fmtMoney}`;
                            cells[cellIdx].style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                            cells[cellIdx].style.color = isClear ? '#166534' : '#991b1b';
                        } else if (dataIdx === 20) {
                            const isClear = (stSales === 'PAID' || numVal <= 0.01);
                            const isCash = !!rowData[48];
                            const iconClass = isCash ? 'fas fa-money-bill-wave' : 'fas fa-university';
                            const iconColor = isCash ? '#059669' : '#3b82f6';
                            cells[cellIdx].innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;"></i>${fmtMoney}`;
                            cells[cellIdx].style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                            cells[cellIdx].style.color = isClear ? '#166534' : '#991b1b';
                        } else if (dataIdx === 22) {
                            const isCash = (stAmount === 'PAID');
                            const iconClass = isCash ? 'fas fa-money-bill-wave' : 'fas fa-university';
                            const iconColor = isCash ? '#059669' : '#3b82f6';
                            cells[cellIdx].innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;"></i>${fmtMoney}`;
                            cells[cellIdx].style.backgroundColor = '';
                            cells[cellIdx].style.color = '';
                        } else if (dataIdx === 24) {
                            cells[cellIdx].textContent = fmtMoney;
                            cells[cellIdx].style.backgroundColor = '';
                            cells[cellIdx].style.color = '';
                        }
                    } else if (dataIdx === 17) {
                        cells[cellIdx].textContent = val;
                    } else {
                        cells[cellIdx].textContent = val;
                    }
                }
            });
        };

        window.addRow = addRow;

        window.updateDeductButtons = function() {
            const chk = document.getElementById('in-deduct-stock');
            const btnYes = document.getElementById('btn-deduct-yes');
            const btnNo = document.getElementById('btn-deduct-no');
            if (!chk || !btnYes || !btnNo) return;
            if (chk.checked) {
                btnYes.style.background = '#dc2626'; btnYes.style.color = 'white';
                btnNo.style.background = 'transparent'; btnNo.style.color = '#64748b';
            } else {
                btnYes.style.background = 'transparent'; btnYes.style.color = '#64748b';
                btnNo.style.background = '#1e293b'; btnNo.style.color = 'white';
            }
        };

        window.updateReleaseDatalist = function () {
            const relSel = document.getElementById('in-release-sel');
            const relList = document.getElementById('release-list');
            if (typeof window.currentReleases === 'undefined' || !window.currentReleases) return;

            // 1. Group and Consolidate Stock to handle duplicates gracefully
            const consolidated = {};
            
            window.currentReleases.forEach(r => {
                if (!r) return;
                // Support both Array (from mapping) and Object (direct from DB)
                const relNo = (Array.isArray(r) ? r[0] : r.release_no || '').trim();
                const stock = (Array.isArray(r) ? Number(r[14]) : Number(r.total_stock) || 0);
                const size = (Array.isArray(r) ? r[16] : r.container_size || '---');
                const city = (Array.isArray(r) ? r[6] : r.city || '---');
                const type = (Array.isArray(r) ? r[2] : r.type || 'DRY');
                const cond = (Array.isArray(r) ? r[3] : r.condition || 'USED');
                const pickup = (Array.isArray(r) ? r[5] : r.depot_address || '---'); // index 5 is depot_address

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

                const fragment = document.createDocumentFragment();
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
                    fragment.appendChild(opt);
                });
                relSel.appendChild(fragment);
                if (currentVal) relSel.value = currentVal;
            }

            // 4. Update the fallback datalist
            if (relList) {
                relList.innerHTML = '';
                const uniqueRelNos = [...new Set(activeReleases.map(i => i.relNo))];
                const fragmentList = document.createDocumentFragment();
                uniqueRelNos.forEach(rel => {
                    const opt = document.createElement('option');
                    opt.value = rel;
                    fragmentList.appendChild(opt);
                });
                relList.appendChild(fragmentList);
            }
        };

        // --- DYNAMIC SIZE FILTER BASED ON RELEASE STOCK ---
        const setupReleaseValidation = () => {
            const relSel = document.getElementById('in-release-sel');
            const relMan = document.getElementById('in-release');
            const inSizeSelect = document.getElementById('in-size-sel');
            const relType = document.getElementById('in-rel-type');
            const relCond = document.getElementById('in-rel-condition');

            // PERF FIX: Guard against duplicate listener registration.
            // setupReleaseValidation() is called both at init AND inside loadTableData().
            // Without this guard, every table reload stacks new event listeners on these inputs,
            // causing 5x, 10x, etc. validation callbacks on each change.
            if (relSel && relSel.dataset.validationBound === 'true') return;
            if (relSel) relSel.dataset.validationBound = 'true';

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
                    // Clean function to ignore emojis/extra info in parentheses
                    const cleanVal = (v) => (v || '').toString().split('(')[0].trim().toUpperCase();

                    const sameRel  = cleanVal(oldTripData[4])  === cleanVal(selectedRel);
                    const sameSize = cleanVal(oldTripData[2])  === cleanVal(selectedSize);
                    const sameType = cleanVal(oldTripData[44]) === cleanVal(selectedRelType);
                    const sameCond = cleanVal(oldTripData[45]) === cleanVal(selectedRelCond);

                    if (oldTripData && sameRel && sameSize && sameType && sameCond) {
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
                            pickup: match[5], // Use index 5 (depot_address) instead of index 4 (depot name)
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
                    const inSizeSel = document.getElementById('in-size-sel');
                    if (rowData.size && rowData.size !== '---') {
                        // 1. Update Manual Input
                        if (inSize) inSize.value = rowData.size;
                        
                        // 2. Try to update Select Dropdown
                        if (inSizeSel) {
                            let sizeExistsInSel = false;
                            for (let opt of inSizeSel.options) {
                                if (opt.value === rowData.size) {
                                    inSizeSel.value = rowData.size;
                                    sizeExistsInSel = true;
                                    break;
                                }
                            }
                            // 3. If size not in list, switch to manual mode to ensure it's visible/used
                            if (!sizeExistsInSel && window.toggleSizeMode) {
                                window.toggleSizeMode('manual');
                            } else if (sizeExistsInSel && window.toggleSizeMode) {
                                window.toggleSizeMode('list');
                            }
                        }
                    }

                    const inPickup = document.getElementById('in-pickup');
                    const inPickupSel = document.getElementById('in-pickup-sel');
                    if (rowData.pickup && rowData.pickup !== '---') {
                        if (inPickup) inPickup.value = rowData.pickup;
                        
                        if (inPickupSel) {
                            let addressExistsInSel = false;
                            for (let opt of inPickupSel.options) {
                                if (opt.value === rowData.pickup) {
                                    inPickupSel.value = rowData.pickup;
                                    addressExistsInSel = true;
                                    break;
                                }
                            }
                            
                            if (typeof window.togglePickupAddressMode === 'function') {
                                if (addressExistsInSel) {
                                    window.togglePickupAddressMode('list');
                                } else {
                                    window.togglePickupAddressMode('manual');
                                }
                            }
                        }
                    }

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

                if (window.currentReleases.length === 0) return;

                // Get all rows matching this release #, type, and condition
                const matchingRows = window.currentReleases.filter(r => r[0] === selectedRel && r[2] === selectedRelType && r[3] === selectedRelCond);

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
            if (window.currentTrips.length > 0 && addressList) {
                const rows = window.currentTrips;
                const storedValues = rows.map(r => r[7]).filter(val => val && val !== '---');
                const existingOptions = Array.from(addressList.options).map(opt => opt.value);
                const uniqueNewOnes = [...new Set(storedValues)].filter(val => !existingOptions.includes(val));
                uniqueNewOnes.forEach(addr => {
                    const opt = document.createElement('option'); opt.value = addr;
                    addressList.appendChild(opt);
                });
            }
        }

        async function loadTripToEdit(idx) {
            if (!window.currentTrips[idx]) return;
            const rowData = window.currentTrips[idx];

            editingIndex = idx;
            const tripId = rowData[0];
            if (!tripId || tripId === '---') {
                console.error("CRITICAL: Selected trip row is missing its TRIP_ID at index 0.", rowData);
            }
            editingTripDbId = tripId || null;

            // --- ON-DEMAND LOADING FOR HEAVY ASSETS ---
            if (editingTripDbId && typeof window.getTripDetails === 'function') {
                console.log("Fetching full details for trip:", editingTripDbId);
                const details = await window.getTripDetails(editingTripDbId);
                if (details) {
                    rowData[54] = details.signature || '';
                    rowData[55] = Array.isArray(details.photos) ? details.photos : (typeof details.photos === 'string' ? JSON.parse(details.photos) : []);
                    rowData[56] = details.signature_driver || '';
                }
            }

            const fields = [
                'in-date', 'in-size', 'in-ncont', 'in-release', 'in-order', 'in-city', 'in-pickup',
                'in-delivery', 'in-doors', 'in-miles', 'in-customer',
                'in-yard', 'in-yardrate', 'in-priceperday', 'in-dateout', 'in-company', 'in-driver',
                'in-rate', 'in-paytype', 'in-sales', 'in-collect', 'in-amount', 'in-phone',
                'in-paiddriver', 'in-note',
                'in-mode', 'in-mrate', 'in-sdaterent', 'in-nextdue', 'in-qty',
                'in-invoice-sent', 'in-seller'
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
                } else if (id === 'in-seller') {
                    v = rowData[61] || '---';
                } else {
                    v = rowData[i + 1];
                }

                if (el) {
                    if (id === 'in-release') {
                        // Hybrid Logic: Check if value exists in Select
                        const sel = document.getElementById('in-release-sel');
                        let exists = false;
                        let vMatched = '';
                        if (sel) {
                            const vClean = (v || '').toString().trim().toUpperCase();
                            for (let opt of sel.options) {
                                if (opt.value.trim().toUpperCase() === vClean) { 
                                    exists = true; 
                                    vMatched = opt.value;
                                    break; 
                                }
                            }
                        }
                        if (exists && v !== '---' && v !== '') {
                            toggleReleaseMode('list');
                            sel.value = vMatched;
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

            // Populate Release Type and Condition
            const typeVal = rowData[44] === '---' ? 'DRY' : (rowData[44] || 'DRY');
            const condVal = rowData[45] === '---' ? 'USED' : (rowData[45] || 'USED');
            if (document.getElementById('in-rel-type')) document.getElementById('in-rel-type').value = typeVal;
            if (document.getElementById('in-rel-condition')) document.getElementById('in-rel-condition').value = condVal;

            // (Flags moved to end)



            // Set Checkboxes (Fixed Absolute Indices)
            if (document.getElementById('in-status-toggle')) {
                const sval = rowData[41] || 'PENDING_PAYMENT';
                const isFin = (sval === 'PAID' || sval === 'COMPLETE');
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

            // Price per Day (Index 14 in mapTripToArray)
            const ppdInput = document.getElementById('in-priceperday');
            if (ppdInput) {
                ppdInput.value = (rowData[14] === undefined || rowData[14] === null) ? 0 : rowData[14];
            }

            // Booking Number (Index 65)
            const bookingInput = document.getElementById('in-booking');
            if (bookingInput) {
                bookingInput.value = (rowData[65] && rowData[65] !== '---') ? rowData[65] : '';
            }

            // Populate Split Payment Amounts
            const splits = [
                { type: 'rate', cashIdx: 66, bankIdx: 67 },
                { type: 'yard', cashIdx: 68, bankIdx: 69 },
                { type: 'sales', cashIdx: 70, bankIdx: 71 },
                { type: 'amount', cashIdx: 72, bankIdx: 73 }
            ];
            
            splits.forEach(s => {
                const cashAmt = parseFloat(rowData[s.cashIdx]) || 0;
                const bankAmt = parseFloat(rowData[s.bankIdx]) || 0;
                const totalSplit = cashAmt + bankAmt;
                const payMethodSelect = document.getElementById(`in-${s.type}-pay-method`);
                const cashCheckbox = document.getElementById(s.type === 'amount' ? 'in-amount-cash' : `in-${s.type}-cash`);
                
                if (totalSplit > 0) {
                    if (payMethodSelect) payMethodSelect.value = 'split';
                    const cInput = document.getElementById(`in-${s.type}-cash-amt`);
                    const bInput = document.getElementById(`in-${s.type}-bank-amt`);
                    if (cInput) cInput.value = cashAmt > 0 ? cashAmt : '';
                    if (bInput) bInput.value = bankAmt > 0 ? bankAmt : '';
                } else {
                    const isCash = cashCheckbox ? cashCheckbox.checked : false;
                    if (payMethodSelect) payMethodSelect.value = isCash ? 'cash' : 'bank';
                    const cInput = document.getElementById(`in-${s.type}-cash-amt`);
                    const bInput = document.getElementById(`in-${s.type}-bank-amt`);
                    if (cInput) cInput.value = '';
                    if (bInput) bInput.value = '';
                }
                
                if (window.toggleSplit) window.toggleSplit(s.type);
            });

            // Deduct Stock Toggle (Index 74)
            const deductStockChk = document.getElementById('in-deduct-stock');
            if (deductStockChk) {
                const savedDeduct = rowData[74];
                if (savedDeduct !== null && savedDeduct !== undefined) {
                    deductStockChk.checked = (savedDeduct === true || savedDeduct === 'true');
                } else {
                    // Old order: infer from booking rule for backward compat
                    const bkn = (rowData[65] || '').trim();
                    deductStockChk.checked = !(bkn && bkn !== '---');
                }
                if (window.updateDeductButtons) window.updateDeductButtons();
            }

            // Truck / Trailer (Indices 44, 45 ignored for Trips UI)

            // Refresh UI States
            toggleModeFields();
            updateDriverCommission();
            if (window.filterDriversByCompany) window.filterDriversByCompany();

            // FIX: Re-apply the driver value because the initial set in the loop failed
            // due to the options not being populated yet for the selected company.
            const driverInput = document.getElementById('in-driver');
            const expectedDriver = rowData[17];
            if (driverInput && expectedDriver && expectedDriver !== '---') {
                driverInput.value = expectedDriver;
            }

            setTripArchiveButton({ label: 'Update order', isUpdate: true, disabled: false, opacity: 1, title: 'Save changes to this trip' });
            if (window.refreshTripArchiveStockUi) window.refreshTripArchiveStockUi();

            // --- FINAL FLAG RESTORATION (Moved to end for robustness) ---
            const isYardChecked = (rowData[12] === 'YES');
            const isTransChecked = (rowData[42] === 'YES');
            const isSalesChecked = (rowData[43] === 'YES');
            const isToYardChecked = !!rowData[62];
            const containerSource = rowData[58] || 'RELEASE';
            const yardItemId = rowData[59];

            if (document.getElementById('in-flag1')) document.getElementById('in-flag1').checked = isYardChecked;
            if (document.getElementById('in-flag2')) document.getElementById('in-flag2').checked = isTransChecked;
            if (document.getElementById('in-flag3')) document.getElementById('in-flag3').checked = isSalesChecked;
            if (document.getElementById('in-move-to-yard')) document.getElementById('in-move-to-yard').checked = isToYardChecked;

            if (window.toggleToYardDestSelect) window.toggleToYardDestSelect();
            const destSel = document.getElementById('in-to-yard-dest');
            if (destSel) {
                if (isToYardChecked && yardItemId) {
                    const isStorage = window.isYardItemInStorage ? window.isYardItemInStorage(yardItemId) : false;
                    destSel.value = isStorage ? 'STORAGE' : 'RPTULIPAN';
                } else {
                    destSel.value = 'RPTULIPAN';
                }
            }

            if (typeof window.setContainerSource === 'function') {
                window.setContainerSource(containerSource);
            }
            if (document.getElementById('in-yard-item-id')) {
                document.getElementById('in-yard-item-id').value = yardItemId || '';
            }
            if (yardItemId && (containerSource === 'YARD' || containerSource === 'STORAGE')) {
                const sel = document.getElementById('in-yard-stock-sel');
                if (sel) {
                    sel.value = yardItemId;
                }
            }

            if (window.toggleYardRate) window.toggleYardRate();
            if (window.toggleTransport) window.toggleTransport();
            if (window.toggleSalesPrice) window.toggleSalesPrice();

            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        let lastDateFrom = null;
        let lastDateTo = null;
        let isLoadingTable = false;
        async function loadTableData(preloadedData = null, force = false) {
            window.loadTableData = loadTableData;
            if (isLoadingTable) return;

            const dateFrom = document.getElementById('f-from-date')?.value || null;
            const dateTo   = document.getElementById('f-to-date')?.value || null;

            // Cache check: if exact date range was already queried and cache exists, but table has no rows, we reuse the cache instead of querying Supabase.
            const hasRows = document.getElementById('table-body')?.children.length > 0;
            if (!force && !preloadedData && window.currentTrips && window.currentTrips.length > 0 && lastDateFrom === dateFrom && lastDateTo === dateTo) {
                if (hasRows) {
                    return;
                } else {
                    preloadedData = window.currentTrips;
                }
            }

            isLoadingTable = true;

            const logisticsBody = document.getElementById('table-body');
            if (!logisticsBody) { isLoadingTable = false; return; }
            
            // Re-bind sidebar lookups if needed (failsafe for early script execution)
            if (typeof setupReleaseValidation === 'function') setupReleaseValidation();

            // Fetch from Supabase OR use preloaded data
            try {
                let data;
                let isAlreadyMapped = false;
                if (preloadedData) {
                    if (Array.isArray(preloadedData[0])) {
                        data = preloadedData;
                        isAlreadyMapped = true;
                    } else {
                        data = preloadedData;
                    }
                    
                    // Apply local date filtering even on preloadedData to prevent UI resets on edit
                    if (dateFrom || dateTo) {
                        data = data.filter(trip => {
                            const tDate = isAlreadyMapped ? trip[1] : (trip.date || '');
                            if (!tDate) return false;
                            if (dateFrom && tDate < dateFrom) return false;
                            if (dateTo && tDate > dateTo) return false;
                            return true;
                        });
                    }
                } else {
                    if (dateFrom || dateTo) {
                        if (window.allTripsUnfiltered && window.allTripsUnfiltered.length > 0) {
                            // Filter locally using the complete cached list
                            data = window.allTripsUnfiltered.filter(trip => {
                                const tDate = trip[1]; // Date is at index 1
                                if (!tDate) return false;
                                if (dateFrom && tDate < dateFrom) return false;
                                if (dateTo && tDate > dateTo) return false;
                                return true;
                            });
                            isAlreadyMapped = true;
                        } else {
                            data = await getAllTrips(dateFrom, dateTo);
                        }
                    } else {
                        data = await getTrips();
                    }
                    // Update queried filters on successful fetch
                    lastDateFrom = dateFrom;
                    lastDateTo = dateTo;
                }

                // Activity logs (not fetched for performance - kept empty)
                let activityLogs = [];

                // --- Priority Sorting: TODAY first, then recent dates ---
                const todayStr = new Date().toISOString().split('T')[0];
                data.sort((a, b) => {
                    const dateA = Array.isArray(a) ? a[1] : (a.date || '');
                    const dateB = Array.isArray(b) ? b[1] : (b.date || '');
                    const isTodayA = (dateA === todayStr);
                    const isTodayB = (dateB === todayStr);
                    if (isTodayA && !isTodayB) return -1;
                    if (!isTodayA && isTodayB) return 1;
                    return dateB.localeCompare(dateA);
                });

                // Clear and rebuild table
                logisticsBody.innerHTML = '';
                
                let renderedTrips = isAlreadyMapped ? data : data.map(mapTripToArray);

                // Cache complete list on unfiltered query (initial load)
                if (!dateFrom && !dateTo && !preloadedData) {
                    window.currentTrips = renderedTrips;
                    window.allTripsUnfiltered = renderedTrips;
                } else if (!window.currentTrips || window.currentTrips.length === 0) {
                    // Fallback if somehow global cache is missing
                    window.currentTrips = renderedTrips;
                    window.allTripsUnfiltered = renderedTrips;
                }

                // --- POPULATE FILTER DROPDOWNS (City, Size, Customer, Driver, Company) ---
                if (window.populateFilterPickers) window.populateFilterPickers();

                // --- CALC SYNC: Recalculate based on ALL Trips loaded ---
                if (window.renderDriverLog) window.renderDriverLog();
                
                // --- TOP SCROLLBAR SYNC ---
                setTimeout(syncTopScroll, 100); 

                // PERF FIX: Use DocumentFragment to batch all DOM insertions into a single reflow
                // instead of one reflow per row (200 rows = 1 reflow vs 200 reflows).
                const tableFragment = document.createDocumentFragment();
                // Pre-compute current time once outside the loop (avoids 200+ Date object allocations)
                const now = new Date();

                renderedTrips.forEach((rowData, idx) => {
                    try {
                        const tr = document.createElement('tr');
                        
                        // AUTHOR TOOLTIP: Dynamically resolve creator name from global map
                        const creatorEmail = rowData[60];
                        if (creatorEmail && creatorEmail !== '---') {
                            const cleanEmail = creatorEmail.trim().toLowerCase();
                            const creatorName = window.globalUserNameMap ? window.globalUserNameMap[cleanEmail] : null;
                            tr.title = `Creado por: ${creatorName || creatorEmail}`;
                        }
                        
                        const isTodayEntry = (rowData[1] === todayStr);
                        const mode = rowData[26];
                        const stYard = rowData[30];
                        const stRate = rowData[32];
                        const stSales = rowData[33];
                        const stAmount = rowData[34];
                        const nextDueVal = rowData[29];
                        const email = rowData[36];

                        tr.dataset.tripid = rowData[0];
                        tr.dataset.styard = stYard || 'PEND';
                        tr.dataset.strent = rowData[31] || 'PEND';
                        tr.dataset.strate = stRate || 'PEND';
                        tr.dataset.stsales = stSales || 'PEND';
                        tr.dataset.stamount = stAmount || 'PEND';
                        tr.dataset.status = rowData[41] || 'PENDING_PAYMENT';
                        tr.dataset.seller = rowData[61] || '';
                        tr.dataset.invoiceSent = rowData[57] || 'NO';
                        // Service type flags for filtering
                        tr.dataset.flagYard = (rowData[12] === 'YES') ? 'YES' : 'NO';
                        tr.dataset.flagTransport = (rowData[42] === 'YES') ? 'YES' : 'NO';
                        tr.dataset.flagSales = (rowData[43] === 'YES') ? 'YES' : 'NO';
                        tr.dataset.flagToYard = !!rowData[62] ? 'YES' : 'NO';
                        tr.dataset.fromCall = (rowData[58] === 'FORM_CALL') ? 'YES' : 'NO';

                        // Priority Highlight for Today
                        if (isTodayEntry) {
                            tr.style.backgroundColor = '#fefce8'; // Light Amber
                            tr.style.border = '2px solid #f59e0b'; // Amber Priority
                        }

                        // Past Due (Pending) Highlight
                        if (rowData[41] === 'PENDING_PAYMENT' && rowData[1] < todayStr) {
                            tr.style.backgroundColor = '#fee2e2'; // Light Red
                            tr.style.border = '2px solid #ef4444'; // Red Border
                        }

                        // Numerical values to handle $0.00 entries in filters
                        tr.dataset.yardval = parseFloat(String(rowData[13]).replace(/[$,]/g, '')) || 0;
                        tr.dataset.ppdval = parseFloat(String(rowData[14]).replace(/[$,]/g, '')) || 0;
                        tr.dataset.rateval = parseFloat(String(rowData[18]).replace(/[$,]/g, '')) || 0;
                        tr.dataset.salesval = parseFloat(String(rowData[20]).replace(/[$,]/g, '')) || 0;
                        tr.dataset.amountval = parseFloat(String(rowData[22]).replace(/[$,]/g, '')) || 0;
                        tr.dataset.qtyval = parseInt(rowData[53]) || 1;

                        // Display helper
                        const fmtDate = (ds) => window.formatDateMMDDYYYY(ds);

                        // Display columns
                        const displayData = [
                            fmtDate(rowData[1]),  // 0: Date (MM/DD/YYYY)
                            rowData[2],           // 1: Size
                            rowData[3],           // 2: N. Cont
                            (rowData[65] && rowData[65] !== '---') ? rowData[65] : '', // 3: Booking Number
                            rowData[4],           // 4: Release #
                            rowData[5],           // 5: Order
                            rowData[6],           // 6: City
                            rowData[7],           // 7: Pick Up Address
                            rowData[8],           // 8: Delivery Place
                            rowData[9],           // 9: Doors Direction
                            rowData[10],          // 10: Miles
                            rowData[11],          // 11: Customer
                            (parseFloat(String(rowData[13]).replace(/[$,]/g, '')) || 0) * (parseInt(rowData[53]) || 1), // 12: Yard Rate
                            (parseFloat(String(rowData[14]).replace(/[$,]/g, '')) || 0) * (parseInt(rowData[53]) || 1), // 13: Price per Day
                            fmtDate(rowData[15]), // 14: Date Out (MM/DD/YYYY)
                            rowData[16],          // 15: Company
                            rowData[17],          // 16: Driver
                            (parseFloat(String(rowData[18]).replace(/[$,]/g, '')) || 0) * (parseInt(rowData[53]) || 1), // 17: Trans. Pay
                            (parseFloat(String(rowData[20]).replace(/[$,]/g, '')) || 0) * (parseInt(rowData[53]) || 1), // 18: Sales Price
                            rowData[22],          // 19: Amount
                            rowData[23],          // 20: Phone #
                            (parseFloat(String(rowData[24]).replace(/[$,]/g, '')) || 0) * (parseInt(rowData[53]) || 1), // 21: Paid Driver
                            rowData[25],          // 22: Note
                            (() => {
                                const emailVal = rowData[61];
                                if (!emailVal || emailVal === '---') return '---';
                                const clean = emailVal.trim().toLowerCase();
                                const name = window.globalUserNameMap ? window.globalUserNameMap[clean] : null;
                                return name || emailVal.split('@')[0].toUpperCase();
                            })(), // 23: Employee (Seller)
                            email                 // 24: Email
                        ];

                        displayData.forEach((text, i) => {
                            const td = document.createElement('td');

                            // Money formatting for specific columns: [12-YardRate, 13-PricePerDay, 17-TransPay, 18-SalesPrice, 19-Amount, 21-PaidDriver]
                            if ([12, 13, 17, 18, 19, 21].includes(i)) {
                                const val = parseFloat(text) || 0;
                                td.textContent = `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                td.style.fontWeight = 'bold';
                                if (i === 12) { // Yard Rate
                                    const isClear = (stYard === 'PAID' || val <= 0.01);
                                    const isCash = !!rowData[46];
                                    const iconClass = isCash ? 'fas fa-money-bill-wave' : 'fas fa-university';
                                    const iconColor = isCash ? '#059669' : '#3b82f6';
                                    td.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;" title="${isCash ? 'CASH' : 'ONLINE/BANK'}"></i>$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                    td.style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                                    td.style.color = isClear ? '#166534' : '#991b1b';
                                } else if (i === 13) { // Price per Day
                                    const isClear = (rowData[31] === 'PAID' || val <= 0.01);
                                    td.style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                                    td.style.color = isClear ? '#166534' : '#991b1b';
                                } else if (i === 17) { // Trans Pay
                                    const isClear = (stRate === 'PAID' || val <= 0.01);
                                    const isCash = !!rowData[47];
                                    const iconClass = isCash ? 'fas fa-money-bill-wave' : 'fas fa-university';
                                    const iconColor = isCash ? '#059669' : '#3b82f6';
                                    td.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;" title="${isCash ? 'CASH' : 'ONLINE/BANK'}"></i>$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                    td.style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                                    td.style.color = isClear ? '#166534' : '#991b1b';
                                } else if (i === 18) { // Sales Price
                                    const isClear = (stSales === 'PAID' || val <= 0.01);
                                    const isCash = !!rowData[48];
                                    const iconClass = isCash ? 'fas fa-money-bill-wave' : 'fas fa-university';
                                    const iconColor = isCash ? '#059669' : '#3b82f6';
                                    td.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;" title="${isCash ? 'CASH' : 'ONLINE/BANK'}"></i>$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                    td.style.backgroundColor = isClear ? '#dcfce7' : '#fee2e2';
                                    td.style.color = isClear ? '#166534' : '#991b1b';
                                } else if (i === 19) { // Amount
                                    // NO Background color as requested. Just Icons:
                                    const iconClass = (stAmount === 'PAID') ? 'fas fa-money-bill-wave' : 'fas fa-university';
                                    const iconColor = (stAmount === 'PAID') ? '#059669' : '#3b82f6';
                                    td.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 6px;" title="${stAmount === 'PAID' ? 'CASH' : 'BANK TRANSFER'}"></i>$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                }
                            } else {
                                td.textContent = text;
                            }

                            // Highlight Employee (Seller) column specifically (now index 23)
                            if (i === 23) {
                                td.style.fontWeight = 'bold';
                                td.style.color = '#1e40af'; // Blue
                            }

                            // Custom styling for Driver Cell (Seen Indicator)
                            if (i === 16) { 
                                if (text && text !== '---') {
                                    // Ultra-robust cleaning function for names
                                    // Ultra-robust cleaning function (handles accents/diacritics)
                                    const clean = (s) => (s || '').toString()
                                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
                                        .replace(/[^A-Z0-9]/gi, '')
                                        .toUpperCase();
                                    const driverNameClean = clean(text);
                                    
                                    // OFFICIAL APP DRIVERS LIST (White-list)
                                    // Each sub-array is a group of identifiers (Name Variations and Email Prefixes)
                                    const DRIVER_GROUPS = [
                                        ["MILAYMIRANDA", "MILAYMIRANDA84"],
                                        ["ROBERTCORTEZ", "ROBERTCORTES", "CORTES410"],
                                        ["JORGEARAMIREZ", "JORGEANDYRAMIREZ", "JORGITO110488"],
                                        ["JOSE", "JOSEVARGAS", "JOSEEVARGAS", "3JYVARGASLLC"],
                                        ["LUISGARRIDO", "GARRIDOTRANSPORT1973"],
                                        ["ANTONIORAMON", "ANTONIORAMONCUBA", "RAMONCUBA88"],
                                        ["GREGORYCUTINO", "GRIGORY2013"],
            ["TRAVISJOSEY", "TJIZZLE88"]
                                    ];
                                    
                                    const APP_DRIVERS = DRIVER_GROUPS.flat();
                                    

                                    const isRegistered = APP_DRIVERS.includes(driverNameClean);

                                    if (isRegistered) {
                                        // Robust date normalization to YYYYMMDD
                                        const toYYYYMMDD = (d) => {
                                            if (!d) return '';
                                            const s = d.toString().trim();
                                            if (s.includes('-')) return s.split('T')[0].replace(/-/g, '');
                                            if (s.includes('/')) {
                                                const p = s.split('/');
                                                if (p[0].length === 4) return p.join('');
                                                return p[2] + p[0].padStart(2, '0') + p[1].padStart(2, '0');
                                            }
                                            return s.replace(/[^0-9]/g, '');
                                        };
                                        const orderDate = toYYYYMMDD(rowData[1]);

                                        // Find equivalence group for the current driver in the table
                                        const myGroup = DRIVER_GROUPS.find(g => g.includes(driverNameClean)) || [driverNameClean];

                                        // Find ALL logs for this driver, sorted by latest first
                                        const driverLogs = activityLogs.filter(log => {
                                            const logDriverClean = log.driver_name ? clean(log.driver_name) : '';
                                            const logEmailClean = clean((log.user_email || '').split('@')[0]);
                                            return (driverNameClean !== '' && (myGroup.includes(logDriverClean) || myGroup.includes(logEmailClean)));
                                        });

                                        // DEFAULT ICON STATE (Gray / Unread)
                                        let iconColor = '#94a3b8';
                                        let iconOpacity = '0.4';
                                        let tooltip = 'Not seen by driver yet';

                                        if (driverLogs.length > 0) {
                                            // PRECISE MATCH: for VIEW_TRIP_DETAILS logs,
                                            // require the specific tripId to be in the details field.
                                            // This prevents false-blue when driver viewed a DIFFERENT
                                            // order on the same date.
                                            const tripId = rowData[0];
                                            const exactMatch = driverLogs.find(log => {
                                                if (toYYYYMMDD(log.view_date) !== orderDate) return false;
                                                if (log.action_type === 'VIEW_TRIP_DETAILS') {
                                                    return !!(log.details && log.details.includes(tripId));
                                                }
                                                return true; // other action types: date match is enough
                                            });
                                            const latestLog = driverLogs[0];
                                            const lastSeenStr = new Date(latestLog.created_at).toLocaleString();
                                            
                                            if (exactMatch) {
                                                iconColor = '#3b82f6'; // Seen (Blue)
                                                iconOpacity = '1';
                                                tooltip = `Seen by driver on: ${new Date(exactMatch.created_at).toLocaleString()}`;
                                            } else {
                                                tooltip = `Last driver activity: ${lastSeenStr}`;
                                            }
                                        }
                                        
                                        td.innerHTML = `${text} <i class="fas fa-check-double" style="color: ${iconColor}; opacity: ${iconOpacity}; margin-left: 5px; cursor: help;" title="${tooltip}"></i>`;
                                    } else {
                                        td.textContent = text;
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
                            const role = (window.currentUserRole || '').toLowerCase().trim();
                            if (role === 'student') {
                                alert("Students cannot delete orders.");
                                return;
                            }
                            if (!confirm('¿Seguro que quieres borrar este viaje? Esta acción no se puede deshacer.')) return;
                            try {
                                // --- STOCK REVERSION LOGIC ---
                                const wasFinalized = (rowData[41] === 'PAID' || rowData[41] === 'COMPLETE');
                                const mode = rowData[26];
                                const relNo = rowData[4];
                                const size = rowData[2];
                                const type = rowData[44];
                                const cond = rowData[45];
                                const qtyVal = parseInt(rowData[53]) || 1;

                                // Determine if stock was deducted when this order was saved
                                const savedDeductForDel = rowData[74];
                                let wasDeductedFromRelease;
                                if (savedDeductForDel !== null && savedDeductForDel !== undefined) {
                                    // New orders: use the saved toggle value directly
                                    wasDeductedFromRelease = (savedDeductForDel === true || savedDeductForDel === 'true');
                                } else {
                                    // Backward compat: no DB column yet — restore if no booking number present
                                    // (any finalized RELEASE order without a booking was deducted)
                                    const bookingStrDel = (rowData[65] || '').trim();
                                    const bookingNumDel = bookingStrDel === '---' ? '' : bookingStrDel;
                                    wasDeductedFromRelease = !bookingNumDel;
                                }
                                const isReleaseSourceForDel = (rowData[58] || 'RELEASE') === 'RELEASE';

                                if (wasFinalized && relNo && relNo !== '---' && wasDeductedFromRelease && isReleaseSourceForDel) {
                                    console.log(`Reverting stock for deleted trip: ${relNo}, ${size}, Qty: ${qtyVal}`);
                                    
                                    // Ensure releases are loaded
                                    if (!window.currentReleases || window.currentReleases.length === 0) {
                                        if (window.loadReleasesData) await window.loadReleasesData();
                                    }

                                    // Robust matching: trim and uppercase
                                    const relNoNorm = String(relNo || '').trim().toUpperCase();
                                    const sizeNorm = String(size || '').trim().toUpperCase();
                                    const typeNorm = String(type || '').trim().toUpperCase();
                                    const condNorm = String(cond || '').trim().toUpperCase();

                                    // Find exact match
                                    const match = window.currentReleases.find(r => 
                                        String(r[0] || '').trim().toUpperCase() === relNoNorm && 
                                        String(r[16] || '').trim().toUpperCase() === sizeNorm &&
                                        String(r[2] || '').trim().toUpperCase() === typeNorm &&
                                        String(r[3] || '').trim().toUpperCase() === condNorm
                                    ) || window.currentReleases.find(r => String(r[0] || '').trim().toUpperCase() === relNoNorm); // Fallback to just Rel No

                                    if (match) {
                                        const releaseUuid = match[15];
                                        const currentStock = parseInt(match[14]) || 0;
                                        const newStock = currentStock + qtyVal;
                                        
                                        console.log(`Adjusting stock for release ${relNo}: ${currentStock} -> ${newStock}`);
                                        await db.from('releases')
                                            .update({ total_stock: newStock })
                                            .eq('id', releaseUuid);
                                            
                                        // OPT: Update local cache directly
                                        match[14] = newStock;
                                            
                                        if (window.loadReleasesData) await window.loadReleasesData(false);
                                    }
                                }

                                // --- YARD STOCK CLEANUP ---
                                const orderNoForDel = rowData[5] || '---';
                                const wasToYardForDel = !!rowData[62];
                                if (wasFinalized && wasToYardForDel) {
                                    console.log(`Cleaning Yard Stock for deleted order: ${orderNoForDel}`);
                                    await db.from('yard_stock').delete().ilike('notes', `%Order: ${orderNoForDel}%`);
                                }

                                // Revert sourced yard item back to AVAILABLE on deletion
                                const containerSourceForDel = rowData[58] || 'RELEASE';
                                const yardItemIdForDel = rowData[59];
                                const isYardSourceForDel = containerSourceForDel === 'YARD' || containerSourceForDel === 'STORAGE';
                                if (wasFinalized && isYardSourceForDel && yardItemIdForDel) {
                                    console.log(`Reverting yard item status for deleted order: ${yardItemIdForDel}`);
                                    const { data: yardItem } = await db.from('yard_stock').select('notes, lifts').eq('id', yardItemIdForDel).single();
                                    if (yardItem) {
                                        let notes = yardItem.notes || '';
                                        notes = notes.replace(/\[ExitDate:\s*[\d\-]+\]/g, '').trim().replace(/\s+/g, ' ');
                                        const newLifts = Math.max(1, (yardItem.lifts || 2) - 1);
                                        await db.from('yard_stock').update({ status: 'AVAILABLE', notes: notes, exit_date: null, lifts: newLifts, order_out: null }).eq('id', yardItemIdForDel);
                                        if (typeof window.updateLocalYardStatus === 'function') window.updateLocalYardStatus(yardItemIdForDel, 'AVAILABLE', notes, null, newLifts, null);
                                    } else {
                                        await db.from('yard_stock').update({ status: 'AVAILABLE', exit_date: null, lifts: 1, order_out: null }).eq('id', yardItemIdForDel);
                                        if (typeof window.updateLocalYardStatus === 'function') window.updateLocalYardStatus(yardItemIdForDel, 'AVAILABLE', undefined, null, 1, null);
                                    }
                                }

                                if (typeof window.loadYardData === 'function') await window.loadYardData(true);

                                await deleteTrip(rowData[0]); // This is trip_id

                                // Remove from local cache
                                if (window.currentTrips) {
                                    window.currentTrips = window.currentTrips.filter(t => t[0] !== rowData[0]);
                                }
                                if (window.allTripsUnfiltered) {
                                    window.allTripsUnfiltered = window.allTripsUnfiltered.filter(t => t[0] !== rowData[0]);
                                }

                                alert("Viaje eliminado");
                                await loadTableData(window.currentTrips);
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
                                // Find the actual index in currentTrips for editing
                                let realIdx = window.currentTrips.findIndex(t => t[0] === tripId);
                                if (realIdx === -1) realIdx = idx;
                                loadTripToEdit(realIdx);
                            } else {
                                editingIndex = null;
                                editingTripDbId = null;
                                if (window.resetForm) window.resetForm();
                            }

                            // PERF FIX: O(1) highlight update instead of O(n²) querySelectorAll+findIndex.
                            // Only remove highlight from the previously highlighted row, not scan all rows.
                            if (window._lastEditingTr && window._lastEditingTr !== tr) {
                                window._lastEditingTr.classList.remove('editing-row', 'selected-row');
                            }
                            tr.classList.remove('editing-row', 'selected-row');
                            if (editingIndex !== null) {
                                tr.classList.add('editing-row');
                                window._lastEditingTr = tr;
                            } else if (window.selectedTripIds.length > 0) {
                                tr.classList.add('selected-row');
                                window._lastEditingTr = tr;
                            } else {
                                window._lastEditingTr = null;
                            }
                        };
                        
                        // Check if this row is the editing row
                        const globalIdxForThis = window.currentTrips.findIndex(t => t[0] === rowData[0]);
                        if (editingIndex === globalIdxForThis || window.selectedTripIds.includes(rowData[0])) {
                            tr.classList.add(editingIndex === globalIdxForThis ? 'editing-row' : 'selected-row');
                        }

                        // OVERDUE RENT HIGHLIGHTING
                        if (mode === 'RENT' && nextDueVal !== '---' && new Date(nextDueVal + 'T00:00:00') < now) {
                            tr.style.backgroundColor = '#fff7ed';
                            tr.style.border = '2px solid #f97316';
                        }
                        tableFragment.appendChild(tr);
                    } catch (rowErr) {
                        console.error("Rendering error for row", idx, rowErr);
                    }
                });
                // Single DOM insertion: one reflow instead of one per row
                logisticsBody.appendChild(tableFragment);
                // Apply existing filters if any (for real-time persistence)
                applyAdvancedFilters();
                if (window.loadDocTrips) window.loadDocTrips();
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
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot modify settlement status.");
                return;
            }
            const tripIdx = currentTrips.findIndex(r => r[0] === tripId);
            if (tripIdx !== -1) {
                // Toggle status (Index 42)
                const newStatus = (currentTrips[tripIdx][42] === 'PAID') ? 'PENDING' : 'PAID';

                try {
                    await updateTrip(tripId, { payout_status: newStatus });
                    currentTrips[tripIdx][42] = newStatus;
                    await loadTableData(currentTrips); // Sync locally without DB reload
                    renderDriverLog();
                } catch (e) {
                    console.error("Payout toggle failed:", e);
                    alert("Failed to update payout status in database.");
                }
            }
        }

        async function settleDriverGroup(driverName) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot modify settlement status.");
                return;
            }
            if (!confirm(`Are you sure you want to mark ALL pending trips for ${driverName} as PAID?`)) return;

            const toUpdate = currentTrips.filter(r => (r[16] || 'UNASSIGNED') === driverName && r[42] !== 'PAID');

            try {
                // Bulk update logic: Sequential for safety or Promise.all
                const promises = toUpdate.map(r => updateTrip(r[0], { payout_status: 'PAID' }));
                await Promise.all(promises);

                // Update local cache
                toUpdate.forEach(r => {
                    const idx = currentTrips.findIndex(x => x[0] === r[0]);
                    if (idx !== -1) currentTrips[idx][42] = 'PAID';
                });

                await loadTableData(currentTrips);
                renderDriverLog();
                alert(`Settled ${toUpdate.length} trips for ${driverName}`);
            } catch (e) {
                console.error("Group settlement failed:", e);
                alert("Some trips failed to update. Check console.");
            }
        }

        async function revertDriverGroup(driverName) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot modify settlement status.");
                return;
            }
            if (!confirm(`Do you want to REVERT all trips for ${driverName} back to PENDING?`)) return;

            const toUpdate = currentTrips.filter(r => (r[16] || 'UNASSIGNED') === driverName && r[42] === 'PAID');

            try {
                const promises = toUpdate.map(r => updateTrip(r[0], { payout_status: 'PENDING' }));
                await Promise.all(promises);

                // Update local cache
                toUpdate.forEach(r => {
                    const idx = currentTrips.findIndex(x => x[0] === r[0]);
                    if (idx !== -1) currentTrips[idx][42] = 'PENDING';
                });

                await loadTableData(currentTrips);
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

        // =============================================================
        // REAL-TIME ACTIVITY SYNC  (3 layered mechanisms for reliability)
        // =============================================================
        // refreshReadReceiptIcons() re-fetches activity_logs from Supabase
        // and updates ONLY the double-check icon cells in-place (no table flicker).

        const _SYNC_DRIVER_GROUPS = [
            ["MILAYMIRANDA", "MILAYMIRANDA84"],
            ["ROBERTCORTEZ", "ROBERTCORTES", "CORTES410"],
            ["JORGEARAMIREZ", "JORGEANDYRAMIREZ", "JORGITO110488"],
            ["JOSE", "JOSEVARGAS", "JOSEEVARGAS", "3JYVARGASLLC"],
            ["LUISGARRIDO", "GARRIDOTRANSPORT1973"],
            ["ANTONIORAMON", "ANTONIORAMONCUBA", "RAMONCUBA88"],
            ["GREGORYCUTINO", "GRIGORY2013"],
            ["TRAVISJOSEY", "TJIZZLE88"]
        ];

        async function refreshReadReceiptIcons() {
            if (!db || !currentTrips || currentTrips.length === 0) return;
            try {
                const { data: logs, error } = await db.from('activity_logs')
                    .select('created_at, driver_name, user_email, view_date, action_type, details') // Select specific columns
                    .order('created_at', { ascending: false })
                    .limit(100); // Reduced from 500 to 100 for better DB performance
                if (error || !logs) return;

                const clean = (s) => (s || '').toString()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^A-Z0-9]/gi, '').toUpperCase();

                const toYYYYMMDD = (d) => {
                    if (!d) return '';
                    const s = d.toString().trim();
                    if (s.includes('-')) return s.split('T')[0].replace(/-/g, '');
                    if (s.includes('/')) {
                        const p = s.split('/');
                        if (p[0].length === 4) return p.join('');
                        return p[2] + p[0].padStart(2, '0') + p[1].padStart(2, '0');
                    }
                    return s.replace(/[^0-9]/g, '');
                };

                const rows = document.querySelectorAll('#table-body tr');
                rows.forEach((tr, idx) => {
                    const rowData = currentTrips[idx];
                    if (!rowData) return;
                    const driverText = rowData[17] || '';
                    if (!driverText || driverText === '---') return;

                    const driverNameClean = clean(driverText);
                    const myGroup = _SYNC_DRIVER_GROUPS.find(g => g.includes(driverNameClean));
                    if (!myGroup) return;

                    const orderDate = toYYYYMMDD(rowData[1]);
                    const tds = tr.querySelectorAll('td');
                    const driverTd = tds[15]; // displayData[15] = Driver column
                    if (!driverTd) return;

                    const driverLogs = logs.filter(log => {
                        const logDriverClean = clean(log.driver_name || '');
                        const logEmailClean = clean((log.user_email || '').split('@')[0]);
                        return myGroup.includes(logDriverClean) || myGroup.includes(logEmailClean);
                    });

                    let iconColor = '#94a3b8';
                    let iconOpacity = '0.4';
                    let tooltip = 'Not seen by driver yet';

                    if (driverLogs.length > 0) {
                        // PRECISE MATCH: require specific tripId in details for VIEW_TRIP_DETAILS logs
                        const tripId = rowData[0];
                        const exactMatch = driverLogs.find(log => {
                            if (toYYYYMMDD(log.view_date) !== orderDate) return false;
                            if (log.action_type === 'VIEW_TRIP_DETAILS') {
                                return !!(log.details && log.details.includes(tripId));
                            }
                            return true;
                        });
                        if (exactMatch) {
                            iconColor = '#3b82f6';
                            iconOpacity = '1';
                            tooltip = 'Seen by driver on: ' + new Date(exactMatch.created_at).toLocaleString();
                        } else {
                            tooltip = 'Last driver activity: ' + new Date(driverLogs[0].created_at).toLocaleString();
                        }
                    }

                    const icon = driverTd.querySelector('.fa-check-double');
                    if (icon) {
                        icon.style.color = iconColor;
                        icon.style.opacity = iconOpacity;
                        icon.title = tooltip;
                    }
                });
                console.log('refreshReadReceiptIcons: icons updated from', logs.length, 'logs.');
            } catch (e) {
                console.error('refreshReadReceiptIcons error:', e);
            }
        }
        window.refreshReadReceiptIcons = refreshReadReceiptIcons;
        
        // TARGETED UI UPDATE: Updates a single row's icon based on a new log payload
        function updateIconFromLog(log) {
            if (!currentTrips || currentTrips.length === 0 || !log) return;
            const clean = (s) => (s || '').toString()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^A-Z0-9]/gi, '').toUpperCase();
            const toYYYYMMDD = (d) => {
                if (!d) return '';
                const s = d.toString().trim();
                if (s.includes('-')) return s.split('T')[0].replace(/-/g, '');
                if (s.includes('/')) {
                    const p = s.split('/');
                    if (p[0].length === 4) return p.join('');
                    return p[2] + p[0].padStart(2, '0') + p[1].padStart(2, '0');
                }
                return s.replace(/[^0-9]/g, '');
            };

            const logDriverClean = clean(log.driver_name || '');
            const logEmailClean = clean((log.user_email || '').split('@')[0]);
            const logDate = toYYYYMMDD(log.view_date);

            const rows = document.querySelectorAll('#table-body tr');
            rows.forEach((tr, idx) => {
                const rowData = currentTrips[idx];
                if (!rowData) return;
                const driverText = rowData[17] || '';
                if (!driverText || driverText === '---') return;

                const driverNameClean = clean(driverText);
                const myGroup = _SYNC_DRIVER_GROUPS.find(g => g.includes(driverNameClean));
                if (!myGroup) return;

                // Check if this log belongs to this driver group
                if (!myGroup.includes(logDriverClean) && !myGroup.includes(logEmailClean)) return;

                const orderDate = toYYYYMMDD(rowData[1]);
                if (logDate !== orderDate) return;

                const tripId = rowData[0];
                let isMatch = false;
                if (log.action_type === 'VIEW_TRIP_DETAILS') {
                    isMatch = !!(log.details && log.details.includes(tripId));
                } else {
                    isMatch = true; 
                }

                if (isMatch) {
                    const tds = tr.querySelectorAll('td');
                    const driverTd = tds[15]; 
                    if (!driverTd) return;
                    const icon = driverTd.querySelector('.fa-check-double');
                    if (icon) {
                        icon.style.color = '#3b82f6';
                        icon.style.opacity = '1';
                        icon.title = 'Seen by driver on: ' + new Date(log.created_at).toLocaleString();
                    }
                }
            });
        }
        window.updateIconFromLog = updateIconFromLog;

        // --- Mechanism 1: Same-tab custom event ---
        window.addEventListener('activityLogged', (e) => {
            if (window.syncTimer) clearTimeout(window.syncTimer);
            window.syncTimer = setTimeout(() => refreshReadReceiptIcons(), 400);
        });

        // --- Mechanism 2: Supabase Realtime (instant cross-device push) ---
        (function setupRealtimeActivitySync() {
            if (!db) { setTimeout(setupRealtimeActivitySync, 2000); return; }
            if (window._activityRealtimeChannel) {
                try { db.removeChannel(window._activityRealtimeChannel); } catch(e) {}
                window._activityRealtimeChannel = null;
            }
            const channel = db
                .channel('calendar-activity-realtime-v2')
                .on('postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'activity_logs' },
                    (payload) => {
                        // TARGETED UPDATE: Instead of fetching 500 rows, we just update the specific row UI
                        if (typeof updateIconFromLog === 'function') {
                            updateIconFromLog(payload.new);
                        } else {
                            if (window.realtimeSyncTimer) clearTimeout(window.realtimeSyncTimer);
                            window.realtimeSyncTimer = setTimeout(() => refreshReadReceiptIcons(), 1000);
                        }
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('Realtime ACTIVE: will detect driver views instantly.');
                    }
                });
            window._activityRealtimeChannel = channel;
        })();

        // --- Mechanism 3: Polling fallback every 25 seconds ---
        // Guarantees icons stay in sync even if Realtime has issues.
        // Only fires when the calendar table is visible on screen.
        // --- Mechanism 3: Polling fallback REMOVED for performance ---
        // (Realtime and initial load are sufficient for 8+ concurrent users)

// Helper for Dual Scrollbars in Calendar
function syncTopScroll() {
    const topContainer = document.getElementById('top-scrollbar-container');
    const topDummy = document.getElementById('top-scrollbar-dummy');
    const tableContainer = document.getElementById('calendar-table-container');
    const table = document.getElementById('logistics-table');

    if (!topContainer || !topDummy || !tableContainer || !table) return;

    // Only show if table is wider than container
    if (table.offsetWidth > tableContainer.offsetWidth) {
        topContainer.style.display = 'block';
        topDummy.style.width = table.offsetWidth + 'px';
        
        // Sync scroll events
        topContainer.onscroll = () => {
            tableContainer.scrollLeft = topContainer.scrollLeft;
        };
        tableContainer.onscroll = () => {
            topContainer.scrollLeft = tableContainer.scrollLeft;
        };
    } else {
        topContainer.style.display = 'none';
    }
}

// PERF FIX: Debounce resize event so syncTopScroll only fires once after resize ends
let _syncScrollResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(_syncScrollResizeTimer);
    _syncScrollResizeTimer = setTimeout(syncTopScroll, 150);
});
// Initial setup
setTimeout(syncTopScroll, 1000);


// ============================================================
// NEARBY TRUCKS FINDER — Uses Google Distance Matrix API
// Scans PENDING orders across ALL dates and finds trucks with
// deliveries within 50 miles of a given zip code.
// ============================================================

window.openNearbyTrucksModal = function () {
    const modal = document.getElementById('nearby-trucks-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.getElementById('nearby-zipcode-input').value = '';
    document.getElementById('nearby-trucks-status').style.display = 'none';
    document.getElementById('nearby-trucks-placeholder').style.display = 'block';
    document.getElementById('nearby-trucks-list').style.display = 'none';
    document.getElementById('nearby-trucks-list').innerHTML = '';
    setTimeout(() => document.getElementById('nearby-zipcode-input').focus(), 100);
};

window.closeNearbyTrucksModal = function () {
    const modal = document.getElementById('nearby-trucks-modal');
    if (modal) modal.style.display = 'none';
};

window.searchNearbyTrucks = async function () {
    const inputEl = document.getElementById('nearby-zipcode-input');
    const zipCode = (inputEl?.value || '').trim().replace(/\s+/g, '');
    if (!zipCode) { inputEl?.focus(); return; }

    // Use allTripsUnfiltered to scan ALL dates in the system
    const allTrips = window.allTripsUnfiltered || window.currentTrips || [];
    if (!allTrips || allTrips.length === 0) {
        alert('No hay ordenes en el sistema para buscar.');
        return;
    }

    // Group PENDING trips by delivery place (Delivery Place = rowData[8])
    // Skip COMPLETE and PAID orders — those trucks already made that delivery
    const tripsByDelivery = {};
    allTrips.forEach(trip => {
        const status = trip[41] || 'PENDING_PAYMENT';
        if (status === 'COMPLETE' || status === 'PAID') return;
        const delivery = (trip[8] || '').trim();
        if (!delivery || delivery === '---') return;
        if (!tripsByDelivery[delivery]) tripsByDelivery[delivery] = [];
        tripsByDelivery[delivery].push(trip);
    });

    const uniqueDeliveries = Object.keys(tripsByDelivery);
    if (uniqueDeliveries.length === 0) {
        alert('No se encontraron ordenes PENDIENTES con direcciones de entrega.');
        return;
    }

    // Show loading state
    const statusEl = document.getElementById('nearby-trucks-status');
    const statusText = document.getElementById('nearby-trucks-status-text');
    const searchBtn = document.getElementById('btn-search-nearby');
    statusEl.style.display = 'flex';
    statusText.textContent = 'Connecting to Google Maps...';
    if (searchBtn) { searchBtn.disabled = true; searchBtn.style.opacity = '0.6'; }
    document.getElementById('nearby-trucks-placeholder').style.display = 'none';
    document.getElementById('nearby-trucks-list').style.display = 'none';
    document.getElementById('nearby-trucks-list').innerHTML = '';

    try {
        // Reuse the same Google API Key already stored by the mileage calculator
        let apiKey = localStorage.getItem('google_maps_api_key') || '';
        if (!apiKey) {
            const userKey = prompt('Ingresa tu Google Maps API Key para usar esta funcion:');
            if (userKey) { localStorage.setItem('google_maps_api_key', userKey.trim()); apiKey = userKey.trim(); }
            else { throw new Error('No se proporciono una API Key.'); }
        }

        if (typeof google === 'undefined' || !google.maps) {
            statusText.textContent = 'Loading Google Maps SDK...';
            if (typeof window.loadGoogleMapsScript === 'function') {
                await window.loadGoogleMapsScript(apiKey);
            } else {
                throw new Error('Google Maps SDK no esta disponible.');
            }
        }

        const service = new google.maps.DistanceMatrixService();
        const BATCH_SIZE = 25; // Google Distance Matrix allows up to 25 destinations per request
        const RADIUS_MILES = 50;
        const origin = zipCode + ', USA';
        const matched = [];

        // Process deliveries in batches to respect Google API limits
        for (let i = 0; i < uniqueDeliveries.length; i += BATCH_SIZE) {
            const batch = uniqueDeliveries.slice(i, i + BATCH_SIZE);
            statusText.textContent = 'Calculating distances... (' + Math.min(i + BATCH_SIZE, uniqueDeliveries.length) + ' / ' + uniqueDeliveries.length + ')';

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Google API timeout')), 20000);
                service.getDistanceMatrix({
                    origins: [origin],
                    destinations: batch,
                    travelMode: google.maps.TravelMode.DRIVING,
                    unitSystem: google.maps.UnitSystem.IMPERIAL,
                }, (response, status) => {
                    clearTimeout(timer);
                    if (status !== 'OK') { reject(new Error('Google API Error: ' + status)); return; }
                    response.rows[0].elements.forEach((el, idx) => {
                        if (el.status === 'OK') {
                            const distanceMiles = el.distance.value * 0.000621371;
                            if (distanceMiles <= RADIUS_MILES) {
                                matched.push({
                                    delivery: batch[idx],
                                    distanceMiles: distanceMiles,
                                    distanceText: el.distance.text,
                                    durationText: el.duration.text,
                                    trips: tripsByDelivery[batch[idx]]
                                });
                            }
                        }
                    });
                    resolve();
                });
            });
        }

        // Sort results from closest to farthest
        matched.sort((a, b) => a.distanceMiles - b.distanceMiles);

        // Render results
        const listEl = document.getElementById('nearby-trucks-list');
        listEl.innerHTML = '';

        if (matched.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:40px 20px; color:#94a3b8;">' +
                '<i class="fas fa-exclamation-circle" style="font-size:2.5rem; color:#f59e0b; margin-bottom:12px; display:block;"></i>' +
                '<p style="font-size:1rem; font-weight:700; color:#374151; margin:0 0 6px;">No pending trucks found within 50 miles</p>' +
                '<p style="font-size:0.85rem; margin:0; color:#6b7280;">No pending orders have deliveries within 50 miles of ZIP code <strong>' + zipCode + '</strong>.</p>' +
                '</div>';
        } else {
            const fmtDate = (ds) => window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(ds) : ds;

            // Summary banner
            const summaryEl = document.createElement('div');
            summaryEl.style.cssText = 'margin-bottom:16px; padding:12px 16px; background:linear-gradient(135deg,#eff6ff,#dbeafe); border-radius:10px; border:1px solid #bfdbfe; display:flex; align-items:center; gap:10px;';
            summaryEl.innerHTML = '<i class="fas fa-check-circle" style="color:#2563eb; font-size:1.2rem;"></i>' +
                '<span style="font-weight:800; color:#1e3a8a; font-size:0.95rem;">Found <strong>' + matched.length + '</strong> pending delivery location(s) within 50 miles of ZIP <strong>' + zipCode + '</strong></span>';
            listEl.appendChild(summaryEl);

            matched.forEach(function(item) {
                const card = document.createElement('div');
                card.style.cssText = 'border:1px solid #e2e8f0; border-radius:12px; margin-bottom:14px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.05);';

                // Color code by distance: green <=20mi, amber 21-35mi, red >35mi
                let badgeColor = '#10b981';
                if (item.distanceMiles > 35) badgeColor = '#ef4444';
                else if (item.distanceMiles > 20) badgeColor = '#f59e0b';

                const header = document.createElement('div');
                header.style.cssText = 'background:linear-gradient(135deg,#f8fafc,#f1f5f9); padding:12px 16px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;';
                header.innerHTML = '<div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">' +
                    '<i class="fas fa-map-marker-alt" style="color:#3b82f6; flex-shrink:0;"></i>' +
                    '<span style="font-weight:800; font-size:0.9rem; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + item.delivery + '</span>' +
                    '</div>' +
                    '<div style="display:flex; align-items:center; gap:10px; flex-shrink:0; margin-left:10px;">' +
                    '<span style="background:' + badgeColor + '; color:white; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:800; white-space:nowrap;">' +
                    '<i class="fas fa-road" style="margin-right:4px;"></i>' + item.distanceText + '</span>' +
                    '<span style="color:#64748b; font-size:0.75rem; white-space:nowrap;">~' + item.durationText + '</span>' +
                    '</div>';
                card.appendChild(header);

                const tripsContainer = document.createElement('div');
                tripsContainer.style.cssText = 'padding:10px 16px; display:flex; flex-direction:column; gap:8px;';
                item.trips.forEach(function(trip) {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:8px 10px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; font-size:0.8rem; cursor:pointer; transition:background 0.15s;';
                    row.title = 'Click to view map: ' + item.delivery + ' → ' + zipCode;
                    row.onmouseenter = function() { this.style.background = '#eff6ff'; this.style.borderColor = '#93c5fd'; };
                    row.onmouseleave = function() { this.style.background = '#f8fafc'; this.style.borderColor = '#e2e8f0'; };
                    row.onclick = function() {
                        var apiKey = localStorage.getItem('google_maps_api_key') || '';
                        var routeModal = document.getElementById('routing-map-modal');
                        var routeIframe = document.getElementById('routing-map-iframe');
                        if (!routeModal || !routeIframe || !apiKey) {
                            alert('No se pudo abrir el mapa. Verifica tu API Key de Google.');
                            return;
                        }
                        // Show route: from the existing order delivery → to the searched ZIP
                        var origin = encodeURIComponent(item.delivery);
                        var destination = encodeURIComponent(zipCode + ', USA');
                        routeIframe.src = 'https://www.google.com/maps/embed/v1/directions?key=' + apiKey + '&origin=' + origin + '&destination=' + destination;
                        routeModal.style.display = 'flex';
                    };
                    row.innerHTML =
                        '<span style="display:flex; align-items:center; gap:5px; color:#1e293b; font-weight:800; min-width:120px;">' +
                        '<i class="fas fa-truck" style="color:#3b82f6;"></i> ' + (trip[17] || '---') + '</span>' +
                        '<span style="color:#64748b; min-width:80px;">' +
                        '<i class="fas fa-expand-arrows-alt" style="color:#6366f1; margin-right:4px;"></i>' + (trip[2] || '---') + '</span>' +
                        '<span style="color:#64748b; min-width:100px;">' +
                        '<i class="fas fa-city" style="color:#10b981; margin-right:4px;"></i>' + (trip[6] || '---') + '</span>' +
                        '<span style="color:#64748b;">' +
                        '<i class="far fa-calendar-alt" style="color:#3b82f6; margin-right:4px;"></i>' + fmtDate(trip[1]) + '</span>' +
                        '<span style="color:#64748b;">' +
                        '<i class="fas fa-box" style="color:#94a3b8; margin-right:4px;"></i>' + (trip[3] || '---') + '</span>' +
                        '<span style="background:#f59e0b; color:white; padding:2px 8px; border-radius:4px; font-size:0.7rem; font-weight:700;">Pending</span>' +
                        '<span style="margin-left:auto; color:#3b82f6; font-size:0.75rem; display:flex; align-items:center; gap:4px; white-space:nowrap;">' +
                        '<i class="fas fa-map-marked-alt"></i> Ver mapa</span>';
                    tripsContainer.appendChild(row);
                });
                card.appendChild(tripsContainer);
                listEl.appendChild(card);
            });
        }

        statusEl.style.display = 'none';
        listEl.style.display = 'block';

    } catch (err) {
        statusEl.style.display = 'none';
        document.getElementById('nearby-trucks-list').style.display = 'block';
        document.getElementById('nearby-trucks-list').innerHTML =
            '<div style="text-align:center; padding:30px 20px;">' +
            '<i class="fas fa-exclamation-triangle" style="font-size:2rem; color:#ef4444; margin-bottom:10px; display:block;"></i>' +
            '<p style="font-weight:700; color:#991b1b; margin:0 0 5px;">Error</p>' +
            '<p style="font-size:0.85rem; color:#64748b; margin:0;">' + (err.message || 'Unknown error occurred') + '</p>' +
            '</div>';
    } finally {
        if (searchBtn) { searchBtn.disabled = false; searchBtn.style.opacity = '1'; }
    }
};

// Close modal when clicking outside (on the dark backdrop)
document.addEventListener('DOMContentLoaded', function() {
    var modal = document.getElementById('nearby-trucks-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) window.closeNearbyTrucksModal();
        });
    }
});

