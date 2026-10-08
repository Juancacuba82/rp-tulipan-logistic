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
        rowData[72] = 0;
        rowData[73] = 0;
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
            { type: 'sales', paid: 'in-salespaid', total: 'in-sales', qty: true }
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
        const methods = ['rate', 'yard', 'sales'];
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

    async function persistHold(tripId, held, collectorWhenZero) {
        if (!window.db || !tripId) return;
        const col = held > 0.009 ? 'driver' : (collectorWhenZero || 'office');
        const { error } = await window.db.from('trips').update({
            driver_cash_held: held,
            cash_collector: col
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
                t[76] = col;
            }
        };
        patch(window.currentTrips);
        patch(window.allTripsUnfiltered);
        patch(window.driverReportTrips);
        patch(window.inventoryDataCache);
    }

    const PAY_LINES = [
        { paid: 32, flag: 47, total: 18, cashI: 66, bankI: 67, useQty: true },
        { paid: 30, flag: 46, total: 13, cashI: 68, bankI: 69, useQty: true },
        { paid: 33, flag: 48, total: 20, cashI: 70, bankI: 71, useQty: true }
    ];

    function lineCashOnRow(row, spec) {
        if (!paid(row[spec.paid])) return 0;
        const qty = spec.useQty ? (parseInt(row[53]) || 1) : 1;
        const splitCash = parseFloat(row[spec.cashI]) || 0;
        const splitBank = parseFloat(row[spec.bankI]) || 0;
        const total = (parseFloat(row[spec.total]) || 0) * qty;
        if (splitCash > 0.009) return splitCash;
        if (splitBank > 0.009) return 0;
        if (spec.flag !== null) return truthy(row[spec.flag]) ? total : 0;
        if ((row[76] || '').toString().toLowerCase() === 'driver' && total > 0) return total;
        if (!(row[76]) && total > 0) return total;
        return 0;
    }

    function moveCashToBankOnRow(row, amount) {
        let left = Math.round((parseFloat(amount) || 0) * 100) / 100;
        PAY_LINES.forEach(spec => {
            if (left < 0.01) return;
            const cashNow = lineCashOnRow(row, spec);
            if (cashNow < 0.01) return;
            const take = Math.min(cashNow, left);
            row[spec.cashI] = Math.round((cashNow - take) * 100) / 100;
            row[spec.bankI] = Math.round(((parseFloat(row[spec.bankI]) || 0) + take) * 100) / 100;
            if (spec.flag !== null) row[spec.flag] = (parseFloat(row[spec.cashI]) || 0) > 0.009;
            left = Math.round((left - take) * 100) / 100;
        });
        return Math.round(((parseFloat(amount) || 0) - left) * 100) / 100;
    }

    async function persistTripTurnIn(row) {
        if (!window.db || !row || !row[0]) return;
        const held = Math.max(0, parseFloat(row[77]) || 0);
        const payload = {
            driver_cash_held: held,
            cash_collector: held > 0.009 ? 'driver' : 'turned_in',
            trans_cash_amt: parseFloat(row[66]) || 0,
            trans_bank_amt: parseFloat(row[67]) || 0,
            yard_cash_amt: parseFloat(row[68]) || 0,
            yard_bank_amt: parseFloat(row[69]) || 0,
            sales_cash_amt: parseFloat(row[70]) || 0,
            sales_bank_amt: parseFloat(row[71]) || 0,
            amount_cash_amt: parseFloat(row[72]) || 0,
            amount_bank_amt: parseFloat(row[73]) || 0,
            r_cash: !!row[47] && row[47] !== 'false',
            y_cash: !!row[46] && row[46] !== 'false',
            s_cash: !!row[48] && row[48] !== 'false'
        };
        const { error } = await window.db.from('trips').update(payload).eq('trip_id', row[0]);
        if (error) throw error;
        const patch = (arr) => {
            if (!arr) return;
            const t = arr.find(r => r[0] === row[0]);
            if (t && t !== row) {
                PAY_LINES.forEach(spec => {
                    t[spec.cashI] = row[spec.cashI];
                    t[spec.bankI] = row[spec.bankI];
                    if (spec.flag !== null) t[spec.flag] = row[spec.flag];
                });
                t[76] = row[76];
                t[77] = row[77];
            }
        };
        patch(window.currentTrips);
        patch(window.allTripsUnfiltered);
        patch(window.driverReportTrips);
        patch(window.inventoryDataCache);
    }

    window.reduceDriverHolds = async function (driverName, amountToRemove, bankToConvert) {
        let left = Math.round((parseFloat(amountToRemove) || 0) * 100) / 100;
        let bankLeft = Math.round((parseFloat(bankToConvert) || 0) * 100) / 100;
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
            row[77] = next;
            row[76] = next > 0.009 ? 'driver' : 'turned_in';
            const conv = Math.min(take, bankLeft);
            if (conv > 0.009) {
                moveCashToBankOnRow(row, conv);
                bankLeft = Math.round((bankLeft - conv) * 100) / 100;
            }
            await persistTripTurnIn(row);
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

    /** After a settlement: holds close (wallet leftover lives on settlement_history). Cash does not enter office. */
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
            await persistHold(row[0] || row.trip_id, 0, 'settled');
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

    function ensureTurnInModal() {
        if (document.getElementById('dti-modal')) return;
        const wrap = document.createElement('div');
        wrap.id = 'dti-modal';
        wrap.style.cssText = 'display:none; position:fixed; inset:0; z-index:99999; background:rgba(15,23,42,0.55); align-items:center; justify-content:center; padding:16px;';
        wrap.innerHTML = `
            <div style="background:#fff; width:100%; max-width:460px; border-radius:16px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); overflow:hidden;">
                <div style="background:linear-gradient(135deg,#92400e,#d97706); color:#fff; padding:16px 18px;">
                    <div style="font-weight:900; font-size:1.05rem;">Entrega de dinero del chofer</div>
                    <div id="dti-driver" style="font-size:0.8rem; opacity:0.9; margin-top:2px;"></div>
                </div>
                <div style="padding:18px 18px 8px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px;">
                        <div style="background:#fffbeb; border:1px solid #fcd34d; border-radius:10px; padding:10px;">
                            <div style="font-size:0.65rem; font-weight:800; color:#92400e; text-transform:uppercase;">En órdenes</div>
                            <div id="dti-orders" style="font-weight:900; color:#78350f; font-size:1.05rem;">$0.00</div>
                        </div>
                        <div style="background:#eff6ff; border:1px solid #93c5fd; border-radius:10px; padding:10px;">
                            <div style="font-size:0.65rem; font-weight:800; color:#1d4ed8; text-transform:uppercase;">Semana pasada</div>
                            <div id="dti-last" style="font-weight:900; color:#1e3a8a; font-size:1.05rem;">$0.00</div>
                        </div>
                    </div>
                    <div style="margin-bottom:14px;">
                        <label style="font-size:0.72rem; font-weight:800; color:#334155; display:block; margin-bottom:4px;">Monto que entregó</label>
                        <input id="dti-amount" type="number" step="0.01" min="0"
                            style="width:100%; border:1px solid #cbd5e1; border-radius:10px; padding:10px 12px; font-weight:800; font-size:1rem;">
                        <div id="dti-total-hint" style="font-size:0.7rem; color:#64748b; margin-top:4px;"></div>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label style="font-size:0.72rem; font-weight:800; color:#334155; display:block; margin-bottom:6px;">Cómo lo recibió la oficina</label>
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
                            <button type="button" data-dti-m="cash" class="dti-mbtn">CASH</button>
                            <button type="button" data-dti-m="bank" class="dti-mbtn">BANK</button>
                            <button type="button" data-dti-m="split" class="dti-mbtn">SPLIT</button>
                        </div>
                    </div>
                    <div id="dti-split" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px; margin-bottom:10px;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                            <div>
                                <label style="font-size:0.65rem; font-weight:800; color:#047857;">CASH</label>
                                <input id="dti-cash" type="number" step="0.01" min="0" value="0"
                                    style="width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:8px; font-weight:700;">
                            </div>
                            <div>
                                <label style="font-size:0.65rem; font-weight:800; color:#1d4ed8;">BANK</label>
                                <input id="dti-bank" type="number" step="0.01" min="0" value="0"
                                    style="width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:8px; font-weight:700;">
                            </div>
                        </div>
                        <div id="dti-split-status" style="font-size:0.72rem; font-weight:700; margin-top:6px; color:#64748b;"></div>
                    </div>
                    <div id="dti-error" style="display:none; background:#fef2f2; color:#b91c1c; border-radius:8px; padding:8px 10px; font-size:0.75rem; font-weight:700; margin-bottom:8px;"></div>
                    <div id="dti-ok" style="display:none; background:#ecfdf5; color:#047857; border-radius:8px; padding:8px 10px; font-size:0.75rem; font-weight:700; margin-bottom:8px;"></div>
                </div>
                <div style="display:flex; gap:8px; padding:12px 18px 18px; justify-content:flex-end;">
                    <button type="button" id="dti-cancel" style="background:#f1f5f9; border:none; border-radius:10px; padding:10px 14px; font-weight:800; cursor:pointer; color:#334155;">Cancelar</button>
                    <button type="button" id="dti-save" style="background:#d97706; color:#fff; border:none; border-radius:10px; padding:10px 16px; font-weight:800; cursor:pointer;">Registrar entrega</button>
                </div>
            </div>`;
        wrap.querySelectorAll('.dti-mbtn').forEach(btn => {
            btn.style.cssText = 'border:2px solid #cbd5e1; background:#fff; color:#64748b; border-radius:10px; padding:10px 6px; font-weight:800; cursor:pointer; font-size:0.75rem;';
        });
        document.body.appendChild(wrap);
        wrap.addEventListener('click', (e) => { if (e.target === wrap) window.closeTurnInModal(); });
        document.getElementById('dti-cancel').onclick = () => window.closeTurnInModal();
        wrap.querySelectorAll('.dti-mbtn').forEach(btn => {
            btn.onclick = () => window.setTurnInMethod(btn.getAttribute('data-dti-m'));
        });
        const amtEl = document.getElementById('dti-amount');
        const cashEl = document.getElementById('dti-cash');
        amtEl.addEventListener('input', () => {
            if (wrap.dataset.method === 'split') {
                const amount = parseFloat(amtEl.value) || 0;
                const cash = parseFloat(cashEl.value) || 0;
                document.getElementById('dti-bank').value = Math.max(0, amount - cash).toFixed(2);
            }
            window.validateTurnInModal();
        });
        cashEl.addEventListener('input', () => {
            const amount = parseFloat(amtEl.value) || 0;
            const cash = parseFloat(cashEl.value) || 0;
            document.getElementById('dti-bank').value = Math.max(0, amount - cash).toFixed(2);
            window.validateTurnInModal();
        });
        document.getElementById('dti-bank').addEventListener('input', () => window.validateTurnInModal());
        document.getElementById('dti-save').onclick = () => window.confirmTurnInDriverCash();
    }

    window.setTurnInMethod = function (method) {
        const wrap = document.getElementById('dti-modal');
        if (!wrap) return;
        wrap.dataset.method = method;
        const styles = {
            cash: { bg: '#10b981', bd: '#10b981' },
            bank: { bg: '#3b82f6', bd: '#3b82f6' },
            split: { bg: '#7c3aed', bd: '#7c3aed' }
        };
        wrap.querySelectorAll('.dti-mbtn').forEach(btn => {
            const m = btn.getAttribute('data-dti-m');
            const on = m === method;
            btn.style.background = on ? styles[m].bg : '#fff';
            btn.style.borderColor = on ? styles[m].bd : '#cbd5e1';
            btn.style.color = on ? '#fff' : '#64748b';
        });
        document.getElementById('dti-split').style.display = method === 'split' ? 'block' : 'none';
        if (method === 'split') {
            const amount = parseFloat(document.getElementById('dti-amount').value) || 0;
            document.getElementById('dti-cash').value = amount.toFixed(2);
            document.getElementById('dti-bank').value = '0.00';
        }
        window.validateTurnInModal();
    };

    window.validateTurnInModal = function () {
        const wrap = document.getElementById('dti-modal');
        const err = document.getElementById('dti-error');
        const status = document.getElementById('dti-split-status');
        if (!wrap) return false;
        const max = parseFloat(wrap.dataset.total) || 0;
        const amount = parseFloat(document.getElementById('dti-amount').value) || 0;
        const method = wrap.dataset.method || 'cash';
        err.style.display = 'none';
        if (amount <= 0) return false;
        if (amount > max + 0.009) {
            err.style.display = 'block';
            err.textContent = 'El monto no puede ser mayor a ' + fmt(max);
            return false;
        }
        if (method === 'split') {
            const cash = parseFloat(document.getElementById('dti-cash').value) || 0;
            const bank = parseFloat(document.getElementById('dti-bank').value) || 0;
            const sum = Math.round((cash + bank) * 100) / 100;
            const ok = Math.abs(sum - amount) < 0.02;
            status.textContent = ok ? 'Cuadra perfecto' : `Suma ${fmt(sum)} vs ${fmt(amount)}`;
            status.style.color = ok ? '#047857' : '#b91c1c';
            return ok;
        }
        return true;
    };

    window.closeTurnInModal = function () {
        const wrap = document.getElementById('dti-modal');
        if (wrap) wrap.style.display = 'none';
    };

    window.turnInDriverCash = async function (driverName) {
        const role = (window.currentUserRole || '').toLowerCase();
        if (role === 'student' || role === 'driver') {
            return;
        }
        const { orders, lastWeek, total } = window.getDriverOpenCashBreakdown(driverName);
        if (total < 0.01) return;
        ensureTurnInModal();
        const wrap = document.getElementById('dti-modal');
        wrap.dataset.driver = normalizeDriver(driverName);
        wrap.dataset.total = String(total);
        wrap.dataset.orders = String(orders);
        wrap.dataset.last = String(lastWeek);
        document.getElementById('dti-driver').textContent = normalizeDriver(driverName);
        document.getElementById('dti-orders').textContent = fmt(orders);
        document.getElementById('dti-last').textContent = fmt(lastWeek);
        document.getElementById('dti-total-hint').textContent = 'Máximo disponible: ' + fmt(total);
        document.getElementById('dti-amount').value = total.toFixed(2);
        document.getElementById('dti-error').style.display = 'none';
        document.getElementById('dti-ok').style.display = 'none';
        document.getElementById('dti-save').disabled = false;
        window.setTurnInMethod('cash');
        wrap.style.display = 'flex';
    };

    window.confirmTurnInDriverCash = async function () {
        const wrap = document.getElementById('dti-modal');
        if (!wrap || !window.validateTurnInModal()) return;
        const driverName = wrap.dataset.driver;
        const { orders, lastWeek, total } = window.getDriverOpenCashBreakdown(driverName);
        const amount = Math.min(parseFloat(document.getElementById('dti-amount').value) || 0, total);
        const method = wrap.dataset.method || 'cash';
        let cashAmt = 0;
        let bankAmt = 0;
        if (method === 'cash') cashAmt = amount;
        else if (method === 'bank') bankAmt = amount;
        else {
            cashAmt = parseFloat(document.getElementById('dti-cash').value) || 0;
            bankAmt = parseFloat(document.getElementById('dti-bank').value) || 0;
        }
        cashAmt = Math.round(cashAmt * 100) / 100;
        bankAmt = Math.round(bankAmt * 100) / 100;

        const err = document.getElementById('dti-error');
        const ok = document.getElementById('dti-ok');
        const saveBtn = document.getElementById('dti-save');
        saveBtn.disabled = true;
        err.style.display = 'none';
        ok.style.display = 'none';

        try {
            const take = Math.round(amount * 100) / 100;
            const fromOrders = Math.min(take, orders);
            let appliedOrders = 0;
            if (fromOrders > 0.009) {
                appliedOrders = await window.reduceDriverHolds(driverName, fromOrders, 0);
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
            if (window.logCashTransaction) {
                if (cashAmt > 0.009) {
                    await window.logCashTransaction({
                        tipo: 'ingreso',
                        metodo: 'cash',
                        monto: cashAmt,
                        descripcion: `Entrega de chofer — ${normalizeDriver(driverName)} (Cash)`,
                        referencia: 'DRIVER_TURN_IN',
                        chofer: normalizeDriver(driverName)
                    });
                }
                if (bankAmt > 0.009) {
                    await window.logCashTransaction({
                        tipo: 'ingreso',
                        metodo: 'bank',
                        monto: bankAmt,
                        descripcion: `Entrega de chofer — ${normalizeDriver(driverName)} (Bank)`,
                        referencia: 'DRIVER_TURN_IN',
                        chofer: normalizeDriver(driverName)
                    });
                }
            }
            if (window.fetchHistory) await window.fetchHistory(true);
            if (window.loadAccountingData) {
                try { await window.loadAccountingData(true); } catch (e) { console.warn(e); }
            }
            window.refreshDriverCashSurfaces();
            const left = window.getDriverOpenCashBreakdown(driverName);
            ok.style.display = 'block';
            ok.textContent = `Registrado ${fmt(applied)}. Queda ${fmt(left.total)} con el chofer.`;
            setTimeout(() => window.closeTurnInModal(), 900);
        } catch (e) {
            saveBtn.disabled = false;
            err.style.display = 'block';
            err.textContent = 'No se pudo registrar: ' + (e.message || e);
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
