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
        return (name || '').toString().trim().toUpperCase().replace(/\s+/g, ' ');
    }

    // JAVIER ↔ JAVIER DAVILA. Not JOHN ↔ JOHNDOE or SMITH ↔ JOHN SMITH.
    window.driverNamesMatch = function (a, b) {
        const na = normalizeDriver(a);
        const nb = normalizeDriver(b);
        if (!na || !nb) return false;
        if (na === nb) return true;
        return nb.startsWith(na + ' ') || na.startsWith(nb + ' ');
    };

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

    // =====================================================================
    // OPEN DRIVER CASH ("debt") — one source of truth, read from the database.
    // Each order where the driver still holds company cash is one row here.
    // Calendar, the Driver Report table, the banner and the Turned-in-cash
    // modal all read this same list, so they can never disagree.
    // =====================================================================
    const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
    const isoDay = (v) => String(v || '').slice(0, 10);
    const cleanTxt = (v) => {
        const s = (v === null || v === undefined) ? '' : String(v).trim();
        return (s === '---') ? '' : s;
    };
    const esc = (v) => String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function toIso(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function parseIso(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
        return m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)) : null;
    }
    function todayIso() {
        return (typeof window.localCalendarToday === 'function') ? window.localCalendarToday() : toIso(new Date());
    }
    function mondayOfIso(iso) {
        const d = parseIso(iso);
        if (!d) return '';
        d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()));
        return toIso(d);
    }
    function addDaysIso(iso, n) {
        const d = parseIso(iso);
        if (!d) return '';
        d.setDate(d.getDate() + n);
        return toIso(d);
    }
    function mmdd(iso) {
        const d = parseIso(iso);
        return d ? String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') : '---';
    }

    const debtStore = window._driverDebt = {
        loaded: false, rows: [], byTrip: {}, at: 0, inflight: null, settlementsTried: false
    };

    function debtRowFromDb(t) {
        return {
            tripId: t.trip_id,
            date: isoDay(t.date),
            driver: normalizeDriver(t.driver),
            orderNo: cleanTxt(t.order_no),
            releaseNo: cleanTxt(t.release_no),
            nCont: cleanTxt(t.n_cont),
            amount: round2(t.driver_cash_held)
        };
    }

    function debtRowFromMemory(r) {
        return {
            tripId: r[0],
            date: isoDay(r[1]),
            driver: normalizeDriver(r[17]),
            orderNo: cleanTxt(r[5]),
            releaseNo: cleanTxt(r[4]),
            nCont: cleanTxt(r[3]),
            amount: round2(window.getTripOpenHold(r))
        };
    }

    function rebuildDebtIndex() {
        debtStore.byTrip = {};
        debtStore.rows.forEach(r => { debtStore.byTrip[r.tripId] = r.amount; });
    }

    // Keep the in-memory list correct right after we write a change (before the next DB read).
    function applyDebtLocal(tripId, held) {
        if (!debtStore.loaded) return;
        const idx = debtStore.rows.findIndex(r => r.tripId === tripId);
        if (held > 0.009) {
            if (idx !== -1) debtStore.rows[idx].amount = round2(held);
        } else if (idx !== -1) {
            debtStore.rows.splice(idx, 1);
        }
        rebuildDebtIndex();
    }

    async function fetchOpenHoldsFromDb() {
        if (!window.db) return null;
        try {
            const { data, error } = await window.db.from('trips')
                .select('trip_id, date, driver, order_no, release_no, n_cont, cash_collector, driver_cash_held')
                .eq('cash_collector', 'driver')
                .gt('driver_cash_held', 0)
                .or('is_deleted.eq.false,is_deleted.is.null')
                .limit(5000);
            if (error) throw error;
            return (data || []).map(debtRowFromDb).filter(r => r.amount > 0.009);
        } catch (e) {
            console.warn('[DriverCash] could not read open driver cash:', e.message || e);
            return null;
        }
    }

    async function ensureSettlementsLoaded() {
        if (window.currentSettlements && window.currentSettlements.length) return;
        if (debtStore.settlementsTried || typeof window.fetchHistory !== 'function') return;
        debtStore.settlementsTried = true;
        try { await window.fetchHistory(true); } catch (e) { console.warn('[DriverCash] settlements not loaded', e); }
    }

    function startDebtRefresh() {
        if (debtStore.inflight) return debtStore.inflight;
        debtStore.inflight = (async () => {
            try {
                await ensureSettlementsLoaded();
                const rows = await fetchOpenHoldsFromDb();
                if (rows) {
                    debtStore.rows = rows;
                    rebuildDebtIndex();
                    debtStore.loaded = true;
                    debtStore.at = Date.now();
                }
            } finally {
                debtStore.inflight = null;
            }
            if (typeof window.paintDriverCashSurfaces === 'function') window.paintDriverCashSurfaces();
            return debtStore.rows;
        })();
        return debtStore.inflight;
    }

    // force=true: always read the database again (after any write). Otherwise reuse a recent read.
    window.refreshDriverDebt = function (force) {
        if (debtStore.inflight) {
            // A read that started before our write may be outdated: read once more after it ends.
            return force ? debtStore.inflight.then(() => startDebtRefresh()) : debtStore.inflight;
        }
        if (!force && debtStore.loaded && (Date.now() - debtStore.at) < 15000) {
            return Promise.resolve(debtStore.rows);
        }
        return startDebtRefresh();
    };

    // Called when trips change (Realtime): re-read once things settle down.
    let debtTimer = null;
    window.scheduleDriverDebtRefresh = function () {
        if (!debtStore.loaded) return;
        clearTimeout(debtTimer);
        debtTimer = setTimeout(() => { window.refreshDriverDebt(true).catch(() => {}); }, 1200);
    };

    function debtRowsForDriver(driverName) {
        const key = normalizeDriver(driverName);
        if (!key) return [];
        const rows = debtStore.loaded
            ? debtStore.rows
            : allTrips().filter(r => window.getTripOpenHold(r) > 0.009).map(debtRowFromMemory);
        return rows.filter(r => r.driver && window.driverNamesMatch(key, r.driver));
    }

    // Cash still owed on ONE order (what the Driver Report "Cash" column shows).
    window.getTripDebtAmount = function (row) {
        if (!row) return 0;
        if (debtStore.loaded) return debtStore.byTrip[row[0]] || 0;
        return window.getTripOpenHold(row);
    };

    function lastSettlementEnd(driverName) {
        const rec = window.getLatestSettlementRecord ? window.getLatestSettlementRecord(driverName) : null;
        return rec && rec.end_date ? isoDay(rec.end_date) : '';
    }

    // Orders dated on/before the driver's last settlement: their cash is part of that settlement's leftover.
    function holdIsOld(driverName, date) {
        const end = lastSettlementEnd(driverName);
        const d = isoDay(date);
        return !!(end && d && d <= end);
    }
    window.isTripHoldOld = function (row) {
        return row ? holdIsOld(row[17], row[1]) : false;
    };

    function weeksAgoLabel(mondayIso, thisMonday) {
        const a = parseIso(mondayIso), b = parseIso(thisMonday);
        if (!a || !b) return 'No date';
        const n = Math.round((b - a) / (7 * 24 * 3600 * 1000));
        if (n === 0) return 'This week';
        if (n === 1) return 'Last week';
        if (n === -1) return 'Next week';
        if (n < 0) return 'Upcoming';
        return n + ' weeks ago';
    }

    /**
     * Everything the driver still owes, split into groups the office can pick from:
     *  - one group per calendar week (Mon–Sun) of the ORDER date, with each order and amount
     *  - "Earlier balance": leftover of the last settlement that has no order detail saved
     */
    window.getDriverDebt = function (driverName) {
        const rows = debtRowsForDriver(driverName);
        const rec = window.getLatestSettlementRecord ? window.getLatestSettlementRecord(driverName) : null;
        const lastEnd = rec && rec.end_date ? isoDay(rec.end_date) : '';
        const balance = rec ? Math.max(0, round2(rec.cash_balance)) : 0;
        const thisMonday = mondayOfIso(todayIso());
        const byWeek = {};
        let current = 0, old = 0;

        rows.forEach(r => {
            const isOld = !!(lastEnd && r.date && r.date <= lastEnd);
            const mon = r.date ? mondayOfIso(r.date) : '';
            const key = 'w:' + (mon || 'none');
            if (!byWeek[key]) {
                byWeek[key] = {
                    key, kind: 'week', monday: mon, amount: 0, orders: [],
                    label: mon ? weeksAgoLabel(mon, thisMonday) : 'No date',
                    range: mon ? (mmdd(mon) + ' – ' + mmdd(addDaysIso(mon, 6))) : ''
                };
            }
            byWeek[key].amount = round2(byWeek[key].amount + r.amount);
            byWeek[key].orders.push({
                tripId: r.tripId, date: r.date, amount: r.amount, isOld,
                label: r.orderNo || r.releaseNo || r.nCont || String(r.tripId || '').slice(0, 8),
                nCont: r.nCont
            });
            if (isOld) old = round2(old + r.amount); else current = round2(current + r.amount);
        });

        const weeks = Object.keys(byWeek).map(k => byWeek[k]);
        weeks.forEach(g => g.orders.sort((a, b) => String(a.date).localeCompare(String(b.date))
            || String(a.label).localeCompare(String(b.label))));
        weeks.sort((a, b) => String(b.monday || '0000').localeCompare(String(a.monday || '0000'))); // newest first

        const legacy = round2(Math.max(0, balance - old));
        const groups = weeks.slice();
        if (legacy > 0.009) {
            groups.push({
                key: 'legacy', kind: 'legacy', monday: '', amount: legacy, orders: [],
                label: 'Earlier balance', range: 'no order detail'
            });
        }
        return {
            groups, current, old, legacy, balance, lastEnd, rec,
            total: round2(current + old + legacy)
        };
    };

    // Cash the driver collected on orders AFTER the last settlement (what the calculator calls "cash this week").
    // Older cash is already inside the last settlement's leftover, so it is not counted twice.
    window.getDriverWalletMap = function () {
        const map = {};
        const rows = debtStore.loaded
            ? debtStore.rows
            : allTrips().filter(r => window.getTripOpenHold(r) > 0.009).map(debtRowFromMemory);
        rows.forEach(r => {
            if (!r.driver || r.driver === '---' || r.driver === 'UNASSIGNED') return;
            if (holdIsOld(r.driver, r.date)) return;
            map[r.driver] = (map[r.driver] || 0) + r.amount;
        });
        Object.keys(map).forEach(k => { map[k] = Math.round(map[k] * 100) / 100; });
        return map;
    };

    window.getDriverWallet = function (driverName) {
        const key = normalizeDriver(driverName);
        if (!key) return 0;
        const map = window.getDriverWalletMap();
        if (map[key]) return map[key];
        const matches = Object.keys(map).filter(k => window.driverNamesMatch(key, k));
        if (!matches.length) return 0;
        matches.sort((a, b) => b.length - a.length);
        return map[matches[0]] || 0;
    };

    function closedCollector(v) {
        const c = (v || '').toString().toLowerCase().trim();
        return (c === 'turned_in' || c === 'settled' || c === 'wallet') ? c : '';
    }

    window.applyDriverCashOnSave = function (rowData, prevRow) {
        rowData[72] = 0;
        rowData[73] = 0;
        const driverAmt = parseFloat(document.getElementById('in-cash-driver-amt')?.value) || 0;
        const held = Math.max(0, Math.round(driverAmt * 100) / 100);
        // Keep turned_in / settled / wallet when the driver still has $0. Those flags tell
        // accounting "this cash already entered the office via a turn-in/settlement — do not
        // count the trip cash again". Overwriting them with 'office' on a Calendar re-save
        // would duplicate the ingreso.
        if (held > 0.009) {
            rowData[76] = 'driver';
        } else {
            rowData[76] = closedCollector(prevRow && prevRow[76]) || 'office';
        }
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
        applyDebtLocal(tripId, held);
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

    /**
     * After a settlement is archived. The driver's pay is taken from the OLDEST cash first, so what is
     * still owed (`leftover`) stays on the NEWEST orders — each one keeps its own amount and keeps
     * showing in the Driver Report and in Calendar until the driver actually turns it in.
     * Orders that were fully covered by the pay are closed ('settled').
     * Without `leftover` (old behaviour) every order up to `throughDate` is closed.
     */
    window.closeDriverHoldsOnSettlement = async function (driverName, throughDate, leftover) {
        const key = normalizeDriver(driverName);
        if (!key || !window.db) return 0;

        try { await window.refreshDriverDebt(true); } catch (e) { console.warn(e); }

        const rows = debtRowsForDriver(key)
            .filter(r => !throughDate || (r.date && r.date <= isoDay(throughDate)))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.tripId).localeCompare(String(b.tripId)));

        let keep = (leftover === undefined || leftover === null) ? 0 : Math.max(0, round2(leftover));
        let changed = 0;
        for (let i = rows.length - 1; i >= 0; i--) {
            const r = rows[i];
            const kept = Math.min(r.amount, keep);
            keep = round2(keep - kept);
            if (Math.abs(kept - r.amount) < 0.005) continue; // this order still owes everything it owed
            await persistHold(r.tripId, kept, 'settled');
            changed++;
        }
        try { await window.refreshDriverDebt(true); } catch (e) { console.warn(e); }
        return changed;
    };

    /** Move the latest settlement's leftover up/down (never below 0 when paying it down). */
    async function adjustLatestSettlementBalance(driverName, delta) {
        const rec = window.getLatestSettlementRecord ? window.getLatestSettlementRecord(driverName) : null;
        if (!rec || !rec.id || !window.db) return false;
        const bal = parseFloat(rec.cash_balance) || 0;
        let next;
        if (delta < 0) next = bal > 0 ? Math.max(0, round2(bal + delta)) : bal;
        else next = round2(bal + delta);
        if (Math.abs(next - bal) < 0.005) return true;
        const { error } = await window.db.from('settlement_history').update({ cash_balance: next }).eq('id', rec.id);
        if (error) throw error;
        rec.cash_balance = next;
        return true;
    }

    /** If someone lowers the settlement leftover by hand, order cash cannot exceed it: trim oldest orders first. */
    window.reconcileDriverOldHolds = async function (driverName) {
        try { await window.refreshDriverDebt(true); } catch (e) { console.warn(e); }
        const debt = window.getDriverDebt(driverName);
        let excess = round2(debt.old - debt.balance);
        if (excess < 0.01) return 0;
        const olds = [];
        debt.groups.forEach(g => g.orders.forEach(o => { if (o.isOld) olds.push(o); }));
        olds.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        let trimmed = 0;
        for (const o of olds) {
            if (excess < 0.01) break;
            const t = Math.min(o.amount, excess);
            await persistHold(o.tripId, round2(o.amount - t), 'settled');
            excess = round2(excess - t);
            trimmed = round2(trimmed + t);
        }
        try { await window.refreshDriverDebt(true); } catch (e) { console.warn(e); }
        return trimmed;
    };

    /**
     * Calendar saved an order. If that order belongs to an already-settled period, its driver cash is part of
     * the settlement leftover, so keep that leftover in step (e.g. "ALL OFFICE" in Calendar = the driver paid it).
     * Then refresh the Driver Report so both screens always show the same thing.
     */
    window.afterTripCashSaved = async function (info) {
        try {
            const prevRow = info && info.prevRow;
            const newRow = info && info.newRow;
            if (newRow) {
                // Read everything we need from the rows BEFORE any await (rows can be replaced meanwhile).
                const prevHold = prevRow ? window.getTripOpenHold(prevRow) : 0;
                const newHold = window.getTripOpenHold(newRow);
                const prevDriver = prevRow ? normalizeDriver(prevRow[17]) : '';
                const newDriver = normalizeDriver(newRow[17]);
                const prevDate = prevRow ? isoDay(prevRow[1]) : '';
                const newDate = isoDay(newRow[1]);
                await ensureSettlementsLoaded();
                const adj = new Map();
                const add = (drv, v) => {
                    if (!drv || Math.abs(v) < 0.005) return;
                    adj.set(drv, round2((adj.get(drv) || 0) + v));
                };
                if (prevHold > 0.009 && holdIsOld(prevDriver, prevDate)) add(prevDriver, -prevHold);
                if (newHold > 0.009 && holdIsOld(newDriver, newDate)) add(newDriver, newHold);
                let touched = false;
                for (const [drv, delta] of adj) {
                    if (Math.abs(delta) < 0.005) continue;
                    await adjustLatestSettlementBalance(drv, delta);
                    touched = true;
                }
                if (touched && typeof window.fetchHistory === 'function') {
                    try { await window.fetchHistory(true); } catch (e) { console.warn(e); }
                }
            }
        } catch (e) {
            console.warn('[DriverCash] could not sync settlement balance after Calendar save:', e);
        }
        try { await window.refreshDriverDebt(true); } catch (e) { console.warn(e); }
    };

    window.getLatestSettlementRecord = function (driverName) {
        const key = normalizeDriver(driverName);
        if (!key || !window.currentSettlements) return null;
        const exact = window.currentSettlements.find(s => normalizeDriver(s.driver_name) === key);
        if (exact) return exact;
        return window.currentSettlements.find(s => window.driverNamesMatch(key, s.driver_name)) || null;
    };

    window.getLatestSettlementLeftover = function (driverName) {
        const rec = window.getLatestSettlementRecord(driverName);
        const bal = parseFloat(rec && rec.cash_balance) || 0;
        return bal > 0 ? Math.round(bal * 100) / 100 : 0;
    };

    // Kept for compatibility: current = cash on orders after the last settlement, lastWeek = everything older.
    window.getDriverOpenCashBreakdown = function (driverName) {
        const d = window.getDriverDebt(driverName);
        return {
            orders: d.current,
            lastWeek: round2(d.old + d.legacy),
            total: d.total,
            groups: d.groups
        };
    };

    window.renderDriverWalletBanner = function (driverName, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        if (window.isPlainDriverView && window.isPlainDriverView()) {
            el.style.display = 'none';
            el.innerHTML = '';
            return;
        }
        const name = normalizeDriver(driverName);
        if (!name || name === 'UNASSIGNED' || name === 'ALL DRIVERS') {
            el.style.display = 'none';
            el.innerHTML = '';
            return;
        }
        const debt = window.getDriverDebt(driverName);
        if (debt.total < 0.01) {
            el.style.display = 'none';
            el.innerHTML = '';
            return;
        }
        el.style.display = 'flex';
        el.style.flexWrap = 'wrap';
        el.style.rowGap = '10px';
        const isDriverRole = (window.currentUserRole === 'driver');
        const box = (label, amount, emphasize, title) => `
            <div title="${esc(title || '')}" style="background:${emphasize ? '#fff7ed' : 'rgba(255,255,255,0.7)'}; border:1px solid ${emphasize ? '#c2410c' : 'rgba(146,64,14,0.28)'}; border-radius:10px; padding:8px 14px; min-width:148px;">
                <div style="font-size:0.68rem; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; opacity:0.9;">${esc(label)}</div>
                <div style="font-weight:900; font-size:1.55rem; line-height:1.15; color:#7c2d12;">${fmt(amount)}</div>
            </div>`;
        const boxes = debt.groups.map(g => box(g.label, g.amount, g.label !== 'This week', g.range)).join('');

        // Which orders make up what the driver owes (stays here until it is turned in)
        const chip = (o) => `
            <span style="background:#fff; border:1px solid rgba(146,64,14,0.3); border-radius:8px; padding:3px 8px; font-size:0.72rem; font-weight:700; color:#7c2d12;">
                ${esc(o.label)}${o.nCont ? ` <span style="opacity:0.65; font-weight:600;">${esc(o.nCont)}</span>` : ''}
                <span style="opacity:0.7; font-weight:600;">· ${mmdd(o.date)}</span>
                · <b>${fmt(o.amount)}</b>
            </span>`;
        const detail = debt.groups.map(g => `
            <div>
                <div style="font-weight:900; font-size:0.78rem;">
                    ${esc(g.label)}${g.range ? ` <span style="opacity:0.7; font-weight:700;">(${esc(g.range)})</span>` : ''} — ${fmt(g.amount)}
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">
                    ${g.kind === 'legacy'
                        ? '<span style="font-size:0.72rem; font-style:italic; opacity:0.85;">Carried over from an earlier settlement — the individual orders were not saved.</span>'
                        : g.orders.map(chip).join('')}
                </div>
            </div>`).join('');

        el.innerHTML = `
            <i class="fas fa-money-bill-wave" style="font-size:1.4rem;"></i>
            <div style="flex:1; min-width:200px;">
                <div style="font-weight:900; font-size:1rem;">${isDriverRole ? 'You are holding company cash' : esc(name) + ' is holding company cash'}</div>
                <div style="font-size:0.75rem; font-weight:600; opacity:0.85; margin-top:2px;">Stays here until you mark it as turned in (here or in Calendar)</div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:stretch;">
                ${boxes}
                ${box('Total due', debt.total, false, '')}
            </div>
            ${!isDriverRole ? `<button type="button" onclick="window.turnInDriverCash('${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')"
                onmouseover="this.style.background='#fff7ed'" onmouseout="this.style.background='#fff'"
                style="background:#fff; color:#92400e; border:2px solid #92400e; border-radius:8px; padding:10px 14px; font-weight:800; cursor:pointer; font-size:0.8rem; box-shadow:0 1px 3px rgba(124,45,18,0.25);">
                <i class="fas fa-hand-holding-usd"></i> TURNED IN CASH
            </button>` : ''}
            <div style="flex:1 1 100%; width:100%; border-top:1px dashed rgba(146,64,14,0.4); padding-top:10px; display:grid; gap:8px; max-height:220px; overflow:auto;">
                ${detail}
            </div>
        `;
    };

    function ensureTurnInModal() {
        if (document.getElementById('dti-modal')) return;
        const wrap = document.createElement('div');
        wrap.id = 'dti-modal';
        wrap.style.cssText = 'display:none; position:fixed; inset:0; z-index:99999; background:rgba(15,23,42,0.55); align-items:center; justify-content:center; padding:16px;';
        wrap.innerHTML = `
            <div style="background:#fff; width:100%; max-width:500px; max-height:94vh; overflow-y:auto; border-radius:16px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);">
                <div style="background:linear-gradient(135deg,#92400e,#d97706); color:#fff; padding:16px 18px;">
                    <div style="font-weight:900; font-size:1.05rem;">Driver cash turn-in</div>
                    <div id="dti-driver" style="font-size:0.8rem; opacity:0.9; margin-top:2px;"></div>
                </div>
                <div style="padding:18px 18px 8px;">
                    <div style="font-size:0.72rem; font-weight:800; color:#334155; margin-bottom:6px;">What is the driver paying now?</div>
                    <div id="dti-groups" style="display:grid; gap:8px; margin-bottom:14px; max-height:260px; overflow-y:auto;"></div>
                    <div style="margin-bottom:14px;">
                        <label style="font-size:0.72rem; font-weight:800; color:#334155; display:block; margin-bottom:4px;">Amount turned in</label>
                        <input id="dti-amount" type="number" step="0.01" min="0"
                            style="width:100%; border:1px solid #cbd5e1; border-radius:10px; padding:10px 12px; font-weight:800; font-size:1rem;">
                        <div id="dti-total-hint" style="font-size:0.7rem; color:#64748b; margin-top:4px;"></div>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label style="font-size:0.72rem; font-weight:800; color:#334155; display:block; margin-bottom:6px;">How the office received it</label>
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
                    <button type="button" id="dti-cancel" style="background:#f1f5f9; border:none; border-radius:10px; padding:10px 14px; font-weight:800; cursor:pointer; color:#334155;">Cancel</button>
                    <button type="button" id="dti-save" style="background:#d97706; color:#fff; border:none; border-radius:10px; padding:10px 16px; font-weight:800; cursor:pointer;">Save turn-in</button>
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
        if (turnInSelectedKeys().length === 0) {
            err.style.display = 'block';
            err.textContent = 'Select what the driver is paying now (check at least one line above).';
            return false;
        }
        if (amount <= 0) return false;
        if (amount > max + 0.009) {
            err.style.display = 'block';
            err.textContent = 'Amount cannot be more than ' + fmt(max);
            return false;
        }
        if (method === 'split') {
            const cash = parseFloat(document.getElementById('dti-cash').value) || 0;
            const bank = parseFloat(document.getElementById('dti-bank').value) || 0;
            const sum = Math.round((cash + bank) * 100) / 100;
            const ok = Math.abs(sum - amount) < 0.02;
            status.textContent = ok ? 'Amounts match' : `Sum ${fmt(sum)} vs ${fmt(amount)}`;
            status.style.color = ok ? '#047857' : '#b91c1c';
            return ok;
        }
        return true;
    };

    window.closeTurnInModal = function () {
        const wrap = document.getElementById('dti-modal');
        if (wrap) wrap.style.display = 'none';
    };

    // ---- Turn-in modal: pick WHICH debt the driver is paying (week by week) ----
    function turnInSelectedKeys() {
        const box = document.getElementById('dti-groups');
        if (!box) return [];
        return Array.prototype.slice.call(box.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.getAttribute('data-dti-key'));
    }

    function renderTurnInGroups(debt) {
        const box = document.getElementById('dti-groups');
        if (!box) return;
        box.innerHTML = debt.groups.map(g => {
            const orders = g.kind === 'legacy'
                ? 'Carried over from an earlier settlement (no order detail saved)'
                : g.orders.map(o => `${esc(o.label)} ${fmt(o.amount)}`).join(' · ');
            return `
                <label style="display:flex; gap:10px; align-items:flex-start; border:1px solid #e2e8f0; background:#f8fafc; border-radius:10px; padding:9px 11px; cursor:pointer;">
                    <input type="checkbox" data-dti-key="${esc(g.key)}" checked style="margin-top:3px; width:16px; height:16px; cursor:pointer;">
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; justify-content:space-between; gap:8px; font-weight:800; color:#1e293b; font-size:0.85rem;">
                            <span>${esc(g.label)}${g.range ? ` <span style="font-weight:600; color:#64748b; font-size:0.72rem;">${esc(g.range)}</span>` : ''}</span>
                            <span>${fmt(g.amount)}</span>
                        </div>
                        <div style="font-size:0.68rem; color:#64748b; margin-top:2px; word-break:break-word;">${orders}</div>
                    </div>
                </label>`;
        }).join('');
        box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', onTurnInSelectionChange);
        });
    }

    function selectedTurnInTotal() {
        const wrap = document.getElementById('dti-modal');
        const keys = turnInSelectedKeys();
        const groups = (wrap && wrap._debtGroups) || [];
        return round2(groups.filter(g => keys.indexOf(g.key) !== -1).reduce((s, g) => s + g.amount, 0));
    }

    function onTurnInSelectionChange() {
        const wrap = document.getElementById('dti-modal');
        if (!wrap) return;
        const total = selectedTurnInTotal();
        wrap.dataset.total = String(total);
        document.getElementById('dti-total-hint').textContent = 'Selected: ' + fmt(total) + ' (maximum you can enter)';
        document.getElementById('dti-amount').value = total.toFixed(2);
        if ((wrap.dataset.method || 'cash') === 'split') {
            document.getElementById('dti-cash').value = total.toFixed(2);
            document.getElementById('dti-bank').value = '0.00';
        }
        window.validateTurnInModal();
    }

    window.turnInDriverCash = async function (driverName) {
        const role = (window.currentUserRole || '').toLowerCase();
        if (role === 'student' || role === 'driver') {
            return;
        }
        // Always start from what the database says right now (someone may have paid from Calendar).
        try { await window.refreshDriverDebt(true); } catch (e) { console.warn(e); }
        const debt = window.getDriverDebt(driverName);
        if (debt.total < 0.01) return;
        ensureTurnInModal();
        const wrap = document.getElementById('dti-modal');
        wrap.dataset.driver = normalizeDriver(driverName);
        wrap._debtGroups = debt.groups;
        document.getElementById('dti-driver').textContent = normalizeDriver(driverName);
        renderTurnInGroups(debt);
        wrap.dataset.total = String(selectedTurnInTotal());
        document.getElementById('dti-total-hint').textContent = 'Selected: ' + fmt(selectedTurnInTotal()) + ' (maximum you can enter)';
        document.getElementById('dti-amount').value = selectedTurnInTotal().toFixed(2);
        document.getElementById('dti-error').style.display = 'none';
        document.getElementById('dti-ok').style.display = 'none';
        document.getElementById('dti-save').disabled = false;
        window.setTurnInMethod('cash');
        wrap.style.display = 'flex';
    };

    /**
     * Apply a payment to the groups the office ticked, OLDEST first.
     *  - every order paid goes to 'turned_in' (so Calendar shows it as already in the office)
     *  - cash that belonged to an already-settled week also lowers that settlement's leftover
     *  - "earlier balance" lowers the settlement's leftover only
     */
    async function applyTurnIn(driverName, groupKeys, amount) {
        await window.refreshDriverDebt(true);
        const debt = window.getDriverDebt(driverName);
        const selected = debt.groups.filter(g => groupKeys.indexOf(g.key) !== -1).slice().reverse(); // oldest first
        const available = round2(selected.reduce((s, g) => s + g.amount, 0));
        const target = Math.min(round2(amount), available);
        let left = target;
        let settleDelta = 0;

        for (const g of selected) {
            if (left < 0.01) break;
            const take = Math.min(left, g.amount);
            if (g.kind === 'legacy') {
                settleDelta = round2(settleDelta + take);
                left = round2(left - take);
                continue;
            }
            let groupLeft = take;
            for (const o of g.orders) {
                if (groupLeft < 0.01) break;
                const part = Math.min(o.amount, groupLeft);
                await persistHold(o.tripId, round2(o.amount - part), 'turned_in');
                if (o.isOld) settleDelta = round2(settleDelta + part);
                groupLeft = round2(groupLeft - part);
            }
            left = round2(left - take);
        }
        if (settleDelta > 0.009) await adjustLatestSettlementBalance(driverName, -settleDelta);
        return round2(target - left);
    }

    window.confirmTurnInDriverCash = async function () {
        const wrap = document.getElementById('dti-modal');
        if (!wrap || !window.validateTurnInModal()) return;
        const driverName = wrap.dataset.driver;
        const keys = turnInSelectedKeys();
        const typed = round2(document.getElementById('dti-amount').value);
        const method = wrap.dataset.method || 'cash';
        let cashAmt = 0;
        let bankAmt = 0;
        if (method === 'cash') cashAmt = typed;
        else if (method === 'bank') bankAmt = typed;
        else {
            cashAmt = round2(document.getElementById('dti-cash').value);
            bankAmt = round2(document.getElementById('dti-bank').value);
        }

        const err = document.getElementById('dti-error');
        const ok = document.getElementById('dti-ok');
        const saveBtn = document.getElementById('dti-save');
        saveBtn.disabled = true;
        err.style.display = 'none';
        ok.style.display = 'none';

        let applied = 0;
        try {
            applied = await applyTurnIn(driverName, keys, typed);
            if (Math.abs(applied - typed) > 0.009) {
                throw new Error(`Only ${fmt(applied)} of ${fmt(typed)} could be applied — the balance changed (maybe it was paid from Calendar). Close this window and open it again.`);
            }
        } catch (e) {
            try { await window.refreshDriverDebt(true); } catch (e2) { /* ignore */ }
            saveBtn.disabled = false;
            err.style.display = 'block';
            err.textContent = 'Could not save: ' + (e.message || e) + (applied > 0.009 ? ` (Already applied: ${fmt(applied)}.)` : '');
            return;
        }

        // Money received by the office goes to the ledger. The cash balances above are already saved.
        try {
            if (window.logCashTransaction) {
                if (cashAmt > 0.009) {
                    await window.logCashTransaction({
                        tipo: 'ingreso',
                        metodo: 'cash',
                        monto: cashAmt,
                        descripcion: `Driver turn-in — ${normalizeDriver(driverName)} (Cash)`,
                        referencia: 'DRIVER_TURN_IN',
                        chofer: normalizeDriver(driverName)
                    });
                }
                if (bankAmt > 0.009) {
                    await window.logCashTransaction({
                        tipo: 'ingreso',
                        metodo: 'bank',
                        monto: bankAmt,
                        descripcion: `Driver turn-in — ${normalizeDriver(driverName)} (Bank)`,
                        referencia: 'DRIVER_TURN_IN',
                        chofer: normalizeDriver(driverName)
                    });
                }
            }
        } catch (e) {
            console.warn('[DriverCash] turn-in ledger entry failed', e);
            err.style.display = 'block';
            err.textContent = 'The driver balance was updated, but the ledger entry failed: ' + (e.message || e);
        }

        try {
            if (window.fetchHistory) await window.fetchHistory(true);
            await window.refreshDriverDebt(true);
            if (window.loadAccountingData) {
                try { await window.loadAccountingData(true); } catch (e) { console.warn(e); }
            }
        } catch (e) {
            console.warn('[DriverCash] refresh after turn-in failed', e);
        }
        window.paintDriverCashSurfaces();
        const left = window.getDriverDebt(driverName);
        ok.style.display = 'block';
        ok.textContent = `Recorded ${fmt(applied)}. Remaining with driver: ${fmt(left.total)}.`;
        // Save stays disabled on purpose: this payment is done (prevents recording it twice).
        if (err.style.display !== 'block') setTimeout(() => window.closeTurnInModal(), 900);
    };

    // Driver Report "Cash" cell for one order: how much that order's driver still owes.
    window.paintDriverCashCell = function (td, row) {
        if (!td) return;
        const amt = window.getTripDebtAmount ? window.getTripDebtAmount(row) : 0;
        if (amt > 0.009) {
            td.textContent = '$' + amt.toFixed(2);
            td.style.fontWeight = '700';
            td.style.color = '#d97706';
            td.title = 'The driver still owes ' + fmt(amt) + ' for this order';
        } else {
            td.textContent = '---';
            td.style.fontWeight = '';
            td.style.color = '';
            td.title = '';
        }
    };

    function paintDriverLogCashCells() {
        const body = document.getElementById('dl-body');
        if (!body || !debtStore.loaded) return;
        body.querySelectorAll('tr[data-trip-id]').forEach(tr => {
            const td = tr.querySelector('td[data-cash-cell]');
            if (!td) return;
            window.paintDriverCashCell(td, [tr.getAttribute('data-trip-id')]);
        });
    }

    // Repaint what is on screen from the data we already have (banner + Cash column).
    window.paintDriverCashSurfaces = function () {
        try {
            const reportDrv = document.getElementById('filter-search');
            let reportName = '';
            if (reportDrv && reportDrv.selectedIndex >= 0) {
                reportName = reportDrv.options[reportDrv.selectedIndex]?.text || reportDrv.value;
            }
            window.renderDriverWalletBanner(reportName, 'driver-cash-wallet-banner');
            paintDriverLogCashCells();
        } catch (e) {
            console.warn('[DriverCash] paint failed', e);
        }
    };

    // Paint now, and make sure the numbers come from a recent database read.
    window.refreshDriverCashSurfaces = function () {
        window.paintDriverCashSurfaces();
        if (window.isPlainDriverView && window.isPlainDriverView()) return;
        window.refreshDriverDebt(false).catch(() => {});
    };

    window.fillLastWeekBalance = function (driverName) {
        if (window.editingSettlementId) return;
        const elLast = document.getElementById('calc-last-bal');
        if (!elLast) return;
        const leftover = window.getLatestSettlementLeftover
            ? window.getLatestSettlementLeftover(driverName)
            : 0;
        elLast.value = leftover.toFixed(2);
    };

    window.syncCalculatorFromDriverWallet = function (driverName) {
        if (window.editingSettlementId) return;
        window.fillLastWeekBalance(driverName);
        if (!window.driverCalcReady) {
            if (window.updateWeeklyCalc) window.updateWeeklyCalc();
            return;
        }
        const elCash = document.getElementById('calc-cash-coll');
        if (!elCash) return;
        elCash.value = (window.getDriverWallet(driverName) || 0).toFixed(2);
        if (window.updateWeeklyCalc) window.updateWeeklyCalc();
    };
})();
