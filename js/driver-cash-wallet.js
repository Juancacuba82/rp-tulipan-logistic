(function () {
    'use strict';

    const fmt = (n) => '$' + (Math.abs(parseFloat(n) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function truthy(v) {
        return v === true || v === 'true' || v === 'YES' || v === 1 || v === '1';
    }

    function paid(v) {
        return v === 'PAID' || v === true || v === 'true';
    }

    function allTrips() {
        return window.allTripsUnfiltered || window.currentTrips || [];
    }

    function normalizeDriver(name) {
        return (name || '').toString().trim().toUpperCase();
    }

    function serviceCash(row, paidIdx, cashFlagIdx, totalIdx, cashAmtIdx, useQty) {
        if (!paid(row[paidIdx])) return 0;
        const qty = useQty ? (parseInt(row[53]) || 1) : 1;
        const splitCash = parseFloat(row[cashAmtIdx]) || 0;
        const total = (parseFloat(row[totalIdx]) || 0) * qty;
        if (splitCash > 0.009) return splitCash;
        if (truthy(row[cashFlagIdx])) return total;
        return 0;
    }

    function tripCashFromRow(row) {
        if (!row) return 0;
        let cash = 0;
        cash += serviceCash(row, 32, 47, 18, 66, true);
        cash += serviceCash(row, 30, 46, 13, 68, true);
        cash += serviceCash(row, 33, 48, 20, 70, true);
        if (paid(row[34])) {
            const splitA = parseFloat(row[72]) || 0;
            const splitB = parseFloat(row[73]) || 0;
            const amt = parseFloat(row[22]) || 0;
            if (splitA > 0.009) cash += splitA;
            else if (splitB > 0.009) { /* bank / split remainder — not driver cash */ }
            else if ((row[76] || '').toString().toLowerCase() === 'driver' && amt > 0) cash += amt;
            else if (!(row[76]) && amt > 0) cash += amt; // legacy Amount PAID
        }
        return Math.round(cash * 100) / 100;
    }

    window.computeTripCashPortion = tripCashFromRow;

    window.getHoldFromDbTrip = function (t) {
        if (!t) return 0;
        const collector = (t.cash_collector || '').toString().toLowerCase();
        if (collector !== 'driver') return 0;
        const stored = parseFloat(t.driver_cash_held);
        return (!isNaN(stored) && stored > 0) ? stored : 0;
    };

    window.getTripOpenHold = function (row) {
        if (!row) return 0;
        const collector = (row[76] || '').toString().toLowerCase();
        if (collector !== 'driver') return 0;
        const stored = parseFloat(row[77]);
        return (!isNaN(stored) && stored > 0) ? stored : 0;
    };

    window.getDriverWalletMap = function () {
        const map = {};
        allTrips().forEach(row => {
            const hold = window.getTripOpenHold(row);
            if (hold < 0.01) return;
            const name = normalizeDriver(row[17]);
            if (!name || name === '---' || name === 'UNASSIGNED') return;
            map[name] = (map[name] || 0) + hold;
        });
        Object.keys(map).forEach(k => { map[k] = Math.round(map[k] * 100) / 100; });
        return map;
    };

    window.getDriverWallet = function (driverName) {
        const key = normalizeDriver(driverName);
        if (!key) return 0;
        return window.getDriverWalletMap()[key] || 0;
    };

    window.applyDriverCashOnSave = function (rowData, prevRow) {
        const amtMethod = document.getElementById('in-amount-pay-method')?.value;
        const amtVal = parseFloat(rowData[22]) || 0;
        if (paid(rowData[34]) && amtMethod === 'cash' && amtVal > 0 && !(parseFloat(rowData[72]) > 0) && !(parseFloat(rowData[73]) > 0)) {
            rowData[72] = amtVal;
            rowData[73] = 0;
        }
        if (paid(rowData[34]) && amtMethod === 'bank' && amtVal > 0 && !(parseFloat(rowData[72]) > 0) && !(parseFloat(rowData[73]) > 0)) {
            rowData[72] = 0;
            rowData[73] = amtVal;
        }
        const driverAmt = parseFloat(document.getElementById('in-cash-driver-amt')?.value) || 0;
        const held = Math.max(0, Math.round(driverAmt * 100) / 100);
        rowData[76] = held > 0.009 ? 'driver' : 'office';
        rowData[77] = held;
        return rowData;
    };

    window.getFormCashTotal = function () {
        const qty = parseInt(document.getElementById('in-qty')?.value) || 1;
        const lines = [
            { type: 'rate', paid: 'in-ratepaid', total: 'in-rate', qty: true },
            { type: 'yard', paid: 'in-yardpaid', total: 'in-yardrate', qty: true },
            { type: 'sales', paid: 'in-salespaid', total: 'in-sales', qty: true },
            { type: 'amount', paid: 'in-amountpaid', total: 'in-amount', qty: false }
        ];
        let cash = 0;
        lines.forEach(s => {
            if (!document.getElementById(s.paid)?.checked) return;
            const method = document.getElementById(`in-${s.type}-pay-method`)?.value;
            const total = parseFloat(document.getElementById(s.total)?.value) || 0;
            const line = s.qty ? total * qty : total;
            if (method === 'cash') cash += line;
            else if (method === 'split') cash += parseFloat(document.getElementById(`in-${s.type}-cash-amt`)?.value) || 0;
        });
        return Math.round(cash * 100) / 100;
    };

    let _cashSplitLock = false;

    window.onCashSplitInput = function (source) {
        if (_cashSplitLock) return;
        _cashSplitLock = true;
        const total = window.getFormCashTotal();
        const officeEl = document.getElementById('in-cash-office-amt');
        const driverEl = document.getElementById('in-cash-driver-amt');
        const hidden = document.getElementById('in-cash-collector');
        if (source === 'office' && officeEl && driverEl) {
            const office = parseFloat(officeEl.value) || 0;
            if (total > 0) driverEl.value = Math.max(0, Math.round((total - office) * 100) / 100);
        } else if (source === 'driver' && officeEl && driverEl) {
            const driver = parseFloat(driverEl.value) || 0;
            if (total > 0) officeEl.value = Math.max(0, Math.round((total - driver) * 100) / 100);
        }
        const driverAmt = parseFloat(driverEl?.value) || 0;
        if (hidden) hidden.value = driverAmt > 0.009 ? 'driver' : 'office';
        window.updateCashSplitHint();
        _cashSplitLock = false;
    };

    window.updateCashSplitHint = function () {
        const hint = document.getElementById('cash-split-hint');
        if (!hint) return;
        const total = window.getFormCashTotal();
        const office = parseFloat(document.getElementById('in-cash-office-amt')?.value) || 0;
        const driver = parseFloat(document.getElementById('in-cash-driver-amt')?.value) || 0;
        const sum = Math.round((office + driver) * 100) / 100;
        const ok = total < 0.01 || Math.abs(sum - total) < 0.02;
        hint.style.color = ok ? '#065f46' : '#b91c1c';
        hint.textContent = ok
            ? `Efectivo de la orden: $${total.toFixed(2)} → Oficina $${office.toFixed(2)} + Chofer $${driver.toFixed(2)}. Solo el chofer entra a En la calle.`
            : `No cuadra: Oficina + Chofer = $${sum.toFixed(2)} vs efectivo de la orden $${total.toFixed(2)}.`;
    };

    window.selectCashCollector = function (who) {
        const total = window.getFormCashTotal();
        const officeEl = document.getElementById('in-cash-office-amt');
        const driverEl = document.getElementById('in-cash-driver-amt');
        const hidden = document.getElementById('in-cash-collector');
        if (who === 'driver') {
            if (officeEl) officeEl.value = total > 0 ? '0' : '';
            if (driverEl) driverEl.value = total > 0 ? total.toFixed(2) : '';
        } else {
            if (officeEl) officeEl.value = total > 0 ? total.toFixed(2) : '';
            if (driverEl) driverEl.value = total > 0 ? '0' : '';
        }
        if (hidden) hidden.value = who;
        const officeBtn = document.getElementById('cash-col-office');
        const driverBtn = document.getElementById('cash-col-driver');
        if (officeBtn && driverBtn) {
            const on = (el, active, bg, bd, color) => {
                el.style.background = active ? bg : 'white';
                el.style.borderColor = active ? bd : '#cbd5e1';
                el.style.color = active ? color : '#64748b';
            };
            on(officeBtn, who === 'office', '#ecfdf5', '#10b981', '#065f46');
            on(driverBtn, who === 'driver', '#fffbeb', '#d97706', '#92400e');
        }
        window.updateCashSplitHint();
    };

    window.formHasCashPayment = function () {
        const methods = ['rate', 'yard', 'sales', 'amount'];
        return methods.some(type => {
            const sel = document.getElementById(`in-${type}-pay-method`);
            if (sel && (sel.value === 'cash' || sel.value === 'split')) {
                if (sel.value === 'cash') return true;
                const c = parseFloat(document.getElementById(`in-${type}-cash-amt`)?.value) || 0;
                return c > 0;
            }
            const flag = document.getElementById(type === 'amount' ? 'in-amount-cash' : `in-${type}-cash`);
            return !!(flag && flag.checked);
        });
    };

    window.refreshCashCollectorUi = function () {
        const box = document.getElementById('cash-collector-box');
        if (!box) return;
        const show = window.formHasCashPayment();
        box.style.display = show ? 'block' : 'none';
        if (show) window.updateCashSplitHint();
    };

    window.fillCashSplitFromRow = function (rowData) {
        const portion = tripCashFromRow(rowData);
        const held = parseFloat(rowData && rowData[77]) || 0;
        const officeEl = document.getElementById('in-cash-office-amt');
        const driverEl = document.getElementById('in-cash-driver-amt');
        const hidden = document.getElementById('in-cash-collector');
        if (driverEl) driverEl.value = held > 0 ? held.toFixed(2) : (portion > 0 ? '0' : '');
        if (officeEl) officeEl.value = portion > 0 ? Math.max(0, portion - held).toFixed(2) : '';
        if (hidden) hidden.value = held > 0.009 ? 'driver' : 'office';
        const officeBtn = document.getElementById('cash-col-office');
        const driverBtn = document.getElementById('cash-col-driver');
        if (officeBtn && driverBtn) {
            const mixed = held > 0.009 && (portion - held) > 0.009;
            const who = held > 0.009 && !mixed ? 'driver' : 'office';
            officeBtn.style.background = (!held || mixed) ? '#ecfdf5' : 'white';
            driverBtn.style.background = (held > 0.009) ? '#fffbeb' : 'white';
        }
        window.refreshCashCollectorUi();
    };

    async function persistHold(tripId, held) {
        if (!window.db || !tripId) return;
        const { error } = await window.db.from('trips').update({
            driver_cash_held: held,
            cash_collector: held > 0.009 ? 'driver' : 'office'
        }).eq('trip_id', tripId);
        if (error) {
            console.warn('[DriverCash] persist hold failed:', error.message);
            throw error;
        }
        const patch = (arr) => {
            if (!arr) return;
            const t = arr.find(r => r[0] === tripId);
            if (t) {
                t[77] = held;
                t[76] = held > 0.009 ? 'driver' : 'office';
            }
        };
        patch(window.currentTrips);
        patch(window.allTripsUnfiltered);
        patch(window.driverReportTrips);
        patch(window.inventoryDataCache);
    }

    window.reduceDriverHolds = async function (driverName, amountToRemove) {
        let left = Math.round((parseFloat(amountToRemove) || 0) * 100) / 100;
        if (left < 0.01) return 0;
        const key = normalizeDriver(driverName);
        const rows = allTrips()
            .filter(r => normalizeDriver(r[17]) === key && window.getTripOpenHold(r) > 0.009)
            .sort((a, b) => String(a[1] || '').localeCompare(String(b[1] || '')));

        for (const row of rows) {
            if (left < 0.01) break;
            const hold = window.getTripOpenHold(row);
            const take = Math.min(hold, left);
            const next = Math.round((hold - take) * 100) / 100;
            row[76] = 'driver';
            row[77] = next;
            await persistHold(row[0], next);
            left = Math.round((left - take) * 100) / 100;
        }
        return Math.round(((parseFloat(amountToRemove) || 0) - left) * 100) / 100;
    };

    window.reconcileDriverHoldsTo = async function (driverName, targetHeld) {
        const current = window.getDriverWallet(driverName);
        const target = Math.max(0, parseFloat(targetHeld) || 0);
        const diff = Math.round((current - target) * 100) / 100;
        if (diff > 0.009) await window.reduceDriverHolds(driverName, diff);
    };

    /** After a settlement: trip price/cash stay, but chofer hold → 0 and collector → office (TODO OFICINA). */
    window.closeDriverHoldsOnSettlement = async function (driverName, throughDate) {
        const key = normalizeDriver(driverName);
        if (!key || !window.db) return 0;

        const seen = new Set();
        const candidates = [];

        const considerRow = (row) => {
            if (!row || seen.has(row[0])) return;
            if (normalizeDriver(row[17]) !== key) return;
            if (window.getTripOpenHold(row) < 0.01) return;
            if (throughDate && String(row[1] || '') > String(throughDate)) return;
            seen.add(row[0]);
            candidates.push(row);
        };
        (allTrips() || []).forEach(considerRow);
        (window.driverReportTrips || []).forEach(considerRow);
        (window.currentTrips || []).forEach(considerRow);

        try {
            const { data, error } = await window.db.from('trips')
                .select('trip_id, date, driver, cash_collector, driver_cash_held')
                .or('is_deleted.eq.false,is_deleted.is.null');
            if (!error && data) {
                data.forEach(t => {
                    if (normalizeDriver(t.driver) !== key) return;
                    if (window.getHoldFromDbTrip(t) < 0.01) return;
                    if (throughDate && String(t.date || '') > String(throughDate)) return;
                    if (seen.has(t.trip_id)) return;
                    seen.add(t.trip_id);
                    candidates.push({
                        0: t.trip_id,
                        1: t.date,
                        17: t.driver,
                        76: t.cash_collector,
                        77: t.driver_cash_held
                    });
                });
            }
        } catch (e) {
            console.warn('[DriverCash] DB scan for holds failed, using memory only:', e);
        }

        for (const row of candidates) {
            await persistHold(row[0] || row.trip_id, 0);
        }
        return candidates.length;
    };

    window.getLatestSettlementRecord = function (driverName) {
        const key = normalizeDriver(driverName);
        if (!key || !window.currentSettlements) return null;
        return window.currentSettlements.find(s => normalizeDriver(s.driver_name) === key) || null;
    };

    window.getLatestSettlementLeftover = function (driverName) {
        const rec = window.getLatestSettlementRecord(driverName);
        const bal = parseFloat(rec && rec.cash_balance) || 0;
        return bal > 0 ? Math.round(bal * 100) / 100 : 0;
    };

    window.getDriverOpenCashBreakdown = function (driverName) {
        const orders = window.getDriverWallet(driverName) || 0;
        const lastWeek = window.getLatestSettlementLeftover(driverName) || 0;
        return {
            orders: Math.round(orders * 100) / 100,
            lastWeek: Math.round(lastWeek * 100) / 100,
            total: Math.round((orders + lastWeek) * 100) / 100
        };
    };

    window.renderDriverWalletBanner = function (driverName, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const name = normalizeDriver(driverName);
        const { orders, lastWeek, total } = window.getDriverOpenCashBreakdown(driverName);
        if (!name || name === 'UNASSIGNED' || name === 'ALL DRIVERS' || total < 0.01) {
            el.style.display = 'none';
            el.innerHTML = '';
            return;
        }
        el.style.display = 'flex';
        const isDriverRole = (window.currentUserRole === 'driver');
        const parts = [];
        if (orders > 0.009) parts.push(`órdenes ${fmt(orders)}`);
        if (lastWeek > 0.009) parts.push(`semana pasada ${fmt(lastWeek)}`);
        el.innerHTML = `
            <i class="fas fa-money-bill-wave" style="font-size:1.2rem;"></i>
            <div style="flex:1;">
                <div style="font-weight:900; font-size:0.85rem;">${isDriverRole ? 'Llevas efectivo de la empresa' : name + ' tiene efectivo de la empresa'}</div>
                <div style="font-size:0.75rem; font-weight:700; opacity:0.9;">${parts.join(' + ')} — se descuenta al liquidar o cuando lo entregue en oficina</div>
            </div>
            <div style="font-weight:900; font-size:1.25rem;">${fmt(total)}</div>
            ${!isDriverRole ? `<button type="button" onclick="window.turnInDriverCash('${name.replace(/'/g, "\\'")}')"
                style="background:#fff; color:#92400e; border:none; border-radius:8px; padding:8px 12px; font-weight:800; cursor:pointer; font-size:0.75rem;">
                <i class="fas fa-hand-holding-usd"></i> ENTREGÓ CASH
            </button>` : ''}
        `;
    };

    window.turnInDriverCash = async function (driverName) {
        const role = (window.currentUserRole || '').toLowerCase();
        if (role === 'student' || role === 'driver') {
            alert('Solo oficina puede registrar una entrega de cash.');
            return;
        }
        const { orders, lastWeek, total } = window.getDriverOpenCashBreakdown(driverName);
        if (total < 0.01) {
            alert('Este chofer no tiene cash abierto de la empresa.');
            return;
        }
        const raw = prompt(
            `${normalizeDriver(driverName)} tiene ${fmt(total)} de la empresa.\n` +
            `Órdenes: ${fmt(orders)}\nSemana pasada (Settlement): ${fmt(lastWeek)}\n\n` +
            `¿Cuánto entregó en oficina? (el precio de las órdenes no se borra)`,
            total.toFixed(2)
        );
        if (raw === null) return;
        const amt = parseFloat(raw);
        if (isNaN(amt) || amt <= 0) {
            alert('Monto inválido.');
            return;
        }
        const take = Math.min(amt, total);
        try {
            const fromOrders = Math.min(take, orders);
            let appliedOrders = 0;
            if (fromOrders > 0.009) {
                appliedOrders = await window.reduceDriverHolds(driverName, fromOrders);
            }
            let appliedLast = 0;
            const rest = Math.round((take - appliedOrders) * 100) / 100;
            if (rest > 0.009 && lastWeek > 0.009) {
                appliedLast = Math.min(rest, lastWeek);
                const rec = window.getLatestSettlementRecord(driverName);
                if (rec && rec.id && window.db) {
                    const nextBal = Math.round((Math.max(0, lastWeek - appliedLast)) * 100) / 100;
                    const { error } = await window.db.from('settlement_history')
                        .update({ cash_balance: nextBal })
                        .eq('id', rec.id);
                    if (error) throw error;
                    rec.cash_balance = nextBal;
                }
            }
            const applied = Math.round((appliedOrders + appliedLast) * 100) / 100;
            if (applied > 0.009 && window.logCashTransaction) {
                await window.logCashTransaction({
                    tipo: 'ingreso',
                    metodo: 'cash',
                    monto: applied,
                    descripcion: `Entrega de cash — ${normalizeDriver(driverName)}`,
                    referencia: 'DRIVER_CASH_TURN_IN',
                    chofer: normalizeDriver(driverName)
                });
            }
            if (window.fetchHistory) await window.fetchHistory(true);
            if (window.loadAccountingData) {
                try { await window.loadAccountingData(true); } catch (e) { console.warn(e); }
            }
            window.refreshDriverCashSurfaces();
            const left = window.getDriverOpenCashBreakdown(driverName);
            alert(`Registrado: ${fmt(applied)} pasó a caja. Queda ${fmt(left.total)} con el chofer.`);
        } catch (err) {
            alert('No se pudo registrar la entrega: ' + (err.message || err) + '\n\nSi falta la columna driver_cash_held, ejecuta supabase-driver-cash-wallet.sql');
        }
    };

    window.refreshDriverCashSurfaces = function () {
        const reportDrv = document.getElementById('filter-search');
        let reportName = '';
        if (reportDrv && reportDrv.selectedIndex >= 0) {
            reportName = reportDrv.options[reportDrv.selectedIndex]?.text || reportDrv.value;
        }
        window.renderDriverWalletBanner(reportName, 'driver-cash-wallet-banner');

        if (window.updateWeeklyCalc) window.updateWeeklyCalc();
    };

    window.syncCalculatorFromDriverWallet = function (driverName) {
        if (window.editingSettlementId) return;
        const elCash = document.getElementById('calc-cash-coll');
        const elLast = document.getElementById('calc-last-bal');
        if (!elCash) return;
        const wallet = window.getDriverWallet(driverName);
        elCash.value = wallet.toFixed(2);
        const leftover = window.getLatestSettlementLeftover
            ? window.getLatestSettlementLeftover(driverName)
            : 0;
        if (elLast) elLast.value = leftover.toFixed(2);
        if (window.updateWeeklyCalc) window.updateWeeklyCalc();
    };
})();
