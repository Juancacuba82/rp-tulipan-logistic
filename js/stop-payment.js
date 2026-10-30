// Stop payment: plan (Cash / Zelle / Bill later) + what happened at the stop.
(function () {
    const PLAN = 87;
    const RESULT = 88;
    const RESULT_AT = 89;
    const RESULT_BY = 90;

    // How the customer pays at the stop (cash goes to caja Cash; the rest are Bank in money reports).
    const METHODS = ['CASH', 'ZELLE', 'WIRE', 'CHECK', 'CARD'];
    const PLANS = METHODS.concat(['BILL_LATER']);
    // BANK / SPLIT are only written from Accounts (when the exact method is unknown or mixed).
    const RESULTS = ['WAITING'].concat(METHODS.map(function (m) { return 'PAID_' + m; }), ['PAID_BANK', 'PAID_SPLIT']);

    function normPlan(v) {
        const s = (v || '').toString().toUpperCase().replace(/\s+/g, '_');
        return PLANS.indexOf(s) >= 0 ? s : '';
    }

    function normResult(v) {
        const s = (v || '').toString().toUpperCase().replace(/\s+/g, '_');
        return RESULTS.indexOf(s) >= 0 ? s : '';
    }

    function isPaidResult(res) {
        return !!res && res.indexOf('PAID_') === 0;
    }

    function methodOfResult(res) {
        const m = (res || '').replace('PAID_', '');
        return METHODS.indexOf(m) >= 0 ? m : '';
    }

    function niceResult(res) {
        if (res === 'PAID_SPLIT') return 'PAID CASH + BANK';
        if (res === 'WAITING') return 'WAITING';
        return res ? res.replace('_', ' ') : '';
    }

    window.STOP_PAY_METHODS = METHODS.slice();

    /** True when the driver/office still has to mark this plan as paid (not Bill later / not internal). */
    window.isStopPayCollectPlan = function (plan) {
        return METHODS.indexOf(normPlan(plan)) >= 0;
    };

    window.getStopPayPlan = function (tripOrVal) {
        if (Array.isArray(tripOrVal)) return normPlan(tripOrVal[PLAN]);
        if (tripOrVal && typeof tripOrVal === 'object') return normPlan(tripOrVal.stop_pay_plan);
        return normPlan(tripOrVal);
    };

    window.hydrateStopPayOnTrip = function (trip) {
        if (!trip || !trip[0]) return trip;
        if (normPlan(trip[PLAN])) return trip;
        const id = trip[0];
        const pools = [window.currentTrips, window.docsTripsCache, window.allTripsUnfiltered];
        for (let p = 0; p < pools.length; p++) {
            const src = (pools[p] || []).find(t => t && t[0] === id);
            if (src && normPlan(src[PLAN])) {
                trip[PLAN] = src[PLAN];
                trip[RESULT] = src[RESULT] || trip[RESULT] || '';
                trip[RESULT_AT] = src[RESULT_AT] || trip[RESULT_AT] || '';
                trip[RESULT_BY] = src[RESULT_BY] || trip[RESULT_BY] || '';
                return trip;
            }
        }
        return trip;
    };

    window.getStopPayResult = function (trip) {
        if (!trip) return '';
        const plan = normPlan(trip[PLAN]);
        const res = normResult(trip[RESULT]);
        if (plan === 'BILL_LATER') return res || 'BILL_LATER';
        if (METHODS.indexOf(plan) >= 0 && !res) return 'WAITING';
        return res;
    };

    window.stopPayNeedsDriverMark = function (trip) {
        const plan = window.getStopPayPlan(trip);
        if (METHODS.indexOf(plan) < 0) return false;
        const res = window.getStopPayResult(trip);
        return res === 'WAITING' || !res;
    };

    window.stopPayChip = function (trip) {
        const plan = window.getStopPayPlan(trip);
        const res = window.getStopPayResult(trip);
        if (!plan && !res) return { html: '', label: '', kind: '' };
        let label = '';
        let kind = 'wait';
        if (isPaidResult(res) && res !== 'BILL_LATER') {
            const paid = niceResult(res);
            const resMethod = methodOfResult(res);
            if (plan === 'BILL_LATER') {
                label = 'BILL LATER → ' + paid;
            } else if (plan && resMethod && plan !== resMethod) {
                label = plan + ' → ' + paid;
            } else {
                label = paid;
            }
            kind = 'paid';
        } else if (plan === 'BILL_LATER') {
            label = 'BILL LATER';
            kind = 'later';
        } else if (plan) {
            label = plan + ' · WAITING';
            kind = 'wait';
        } else {
            return { html: '', label: '', kind: '' };
        }
        const title = trip[RESULT_AT]
            ? ('Updated ' + new Date(trip[RESULT_AT]).toLocaleString() + (trip[RESULT_BY] ? ' · ' + trip[RESULT_BY] : ''))
            : '';
        const html = '<span class="stop-pay-chip stop-pay-' + kind + '" title="' + title.replace(/"/g, '') + '">' + label + '</span>';
        return { html: html, label: label, kind: kind };
    };

    function paintPlanButtons(plan) {
        const p = normPlan(plan);
        PLANS.forEach(function (k) {
            const el = document.getElementById('btn-stop-plan-' + k.toLowerCase().replace('_', '-'));
            if (!el) return;
            const on = p === k;
            el.classList.toggle('is-on', on);
            el.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const hid = document.getElementById('in-stop-pay-plan');
        if (hid) hid.value = p;
    }

    window.selectStopPayPlan = async function (plan) {
        const next = normPlan(plan);
        const current = window.readStopPayPlanFromForm ? window.readStopPayPlanFromForm() : '';
        const p = (next && next === current) ? '' : next;
        const id = window.editingTripDbId;
        const cleared = !p;
        const row = id ? (window.currentTrips || []).find(t => t && t[0] === id) : null;

        // Turning the plan off on an order that already has a recorded payment: ask first.
        if (cleared && row && isPaidResult(normResult(row[RESULT])) && window.openDriverStartConfirm) {
            const orderLabel = (row[5] && row[5] !== '---') ? row[5] : 'this trip';
            const ok = await window.openDriverStartConfirm({
                title: 'Clear stop payment?',
                order: 'Order: ' + orderLabel,
                text: 'This order already has a payment recorded.\n\nClear it and leave payment empty?',
                mode: 'yesno'
            });
            if (!ok) return;
        }

        paintPlanButtons(p);
        if (!id || !db) {
            if (typeof window.syncStopPayForm === 'function') window.syncStopPayForm(null, p);
            return;
        }
        const payload = cleared
            ? { stop_pay_plan: null, stop_pay_result: null, stop_pay_result_at: null, stop_pay_result_by: null }
            : { stop_pay_plan: p };
        db.from('trips').update(payload).eq('trip_id', id).then(function (ret) {
            if (ret.error) {
                console.warn('Could not save stop payment plan', ret.error);
                return;
            }
            patchLocal(id, cleared
                ? { plan: '', result: '', at: '', by: '' }
                : { plan: p });
            if (typeof window.syncStopPayForm === 'function') {
                const fresh = (window.currentTrips || []).find(t => t && t[0] === id) || null;
                window.syncStopPayForm(fresh, p);
            }
            if (typeof window.loadTableData === 'function' && window.currentTrips) {
                window.loadTableData(window.currentTrips, true);
            }
        });
    };

    window.readStopPayPlanFromForm = function () {
        return normPlan(document.getElementById('in-stop-pay-plan')?.value);
    };

    /**
     * Paint the sidebar. `forcePlan` (optional) is the plan the user just clicked;
     * when omitted, the highlight comes from the saved order.
     * Bill later keeps its own highlight even after Accounts records how they paid.
     */
    window.syncStopPayForm = function (trip, forcePlan) {
        const plan = trip ? window.getStopPayPlan(trip) : '';
        const res = trip ? window.getStopPayResult(trip) : '';
        let highlight;
        if (forcePlan !== undefined) {
            highlight = normPlan(forcePlan);
        } else if (plan === 'BILL_LATER') {
            highlight = plan;
        } else {
            highlight = methodOfResult(res) || plan;
        }
        paintPlanButtons(highlight);
        const resEl = document.getElementById('calendar-stop-pay-result');
        const box = document.getElementById('calendar-stop-pay-result-box');
        const staff = typeof window.isStaffForDriverStart === 'function' && window.isStaffForDriverStart();
        const showMarks = !!(staff && trip && METHODS.indexOf(highlight) >= 0);
        if (box) box.style.display = showMarks ? '' : 'none';
        if (resEl) {
            const chip = trip ? window.stopPayChip(trip) : { label: '' };
            resEl.textContent = chip.label || 'WAITING';
        }
        const paidMethod = methodOfResult(res);
        METHODS.forEach(function (m) {
            const b = document.getElementById('btn-cal-paid-' + m.toLowerCase());
            if (b) b.classList.toggle('is-on', paidMethod === m);
        });
    };

    function patchLocal(tripId, fields) {
        const apply = (arr) => {
            if (!arr) return;
            const row = arr.find(t => t && t[0] === tripId);
            if (!row) return;
            if (fields.plan !== undefined) row[PLAN] = fields.plan;
            if (fields.result !== undefined) row[RESULT] = fields.result;
            if (fields.at !== undefined) row[RESULT_AT] = fields.at;
            if (fields.by !== undefined) row[RESULT_BY] = fields.by;
        };
        apply(window.currentTrips);
        apply(window.docsTripsCache);
        apply(window.allTripsUnfiltered);
        if (window.currentDocTrip && window.currentDocTrip[0] === tripId) {
            if (fields.plan !== undefined) window.currentDocTrip[PLAN] = fields.plan;
            if (fields.result !== undefined) window.currentDocTrip[RESULT] = fields.result;
            if (fields.at !== undefined) window.currentDocTrip[RESULT_AT] = fields.at;
            if (fields.by !== undefined) window.currentDocTrip[RESULT_BY] = fields.by;
        }
    }

    window.markStopPayResult = async function (trip, result, opts) {
        if (!trip || !trip[0] || !db) return false;
        const res = normResult(result);
        if (!res) return false;
        const skipConfirm = !!(opts && opts.skipConfirm);
        const orderLabel = (trip[5] && trip[5] !== '---') ? trip[5] : 'this trip';
        const nice = niceResult(res);
        if (!skipConfirm && window.openDriverStartConfirm) {
            const ok = await window.openDriverStartConfirm({
                title: res === 'WAITING' ? 'Clear stop payment?' : 'Mark payment?',
                order: 'Order: ' + orderLabel,
                text: res === 'WAITING' ? 'Set this trip back to waiting?' : ('Are you sure?\n\n' + nice),
                mode: 'yesno'
            });
            if (!ok) return false;
        }
        const who = (window.userEmail || window.currentDriverNameRef || 'unknown').toString();
        const now = new Date().toISOString();
        const existingPlan = normPlan(trip[PLAN]);
        const payload = {
            stop_pay_result: res === 'WAITING' ? 'WAITING' : res,
            stop_pay_result_at: res === 'WAITING' ? null : now,
            stop_pay_result_by: res === 'WAITING' ? null : who
        };
        if (!existingPlan && methodOfResult(res)) {
            payload.stop_pay_plan = methodOfResult(res);
        } else if (existingPlan) {
            payload.stop_pay_plan = existingPlan;
        }
        try {
            const { error } = await db.from('trips').update(payload).eq('trip_id', trip[0]);
            if (error) throw error;
            patchLocal(trip[0], {
                plan: payload.stop_pay_plan || existingPlan || '',
                result: payload.stop_pay_result,
                at: payload.stop_pay_result_at || '',
                by: payload.stop_pay_result_by || ''
            });
            if (window.logActivity) {
                window.logActivity('STOP_PAY_MARKED', nice + ' on trip ' + trip[0] + ' order ' + orderLabel, trip[1] || null);
            }
            if (window.showToast) window.showToast(nice, 'success');
            if (typeof window.syncStopPayDocsUI === 'function') window.syncStopPayDocsUI();
            if (typeof window.syncStopPayForm === 'function') window.syncStopPayForm(trip);
            if (typeof window.loadDocTrips === 'function') window.loadDocTrips(false);
            return true;
        } catch (err) {
            console.error('markStopPayResult', err);
            const msg = (err && err.message) || String(err);
            if (/stop_pay/i.test(msg)) {
                alert('Run supabase-stop-payment.sql in Supabase, then try again.');
            } else {
                alert('Could not save payment: ' + msg);
            }
            return false;
        }
    };

    window.syncStopPayDocsUI = function () {
        const wrap = document.getElementById('docs-stop-pay-actions');
        const label = document.getElementById('docs-stop-pay-label');
        const hint = wrap ? wrap.querySelector('.docs-stop-pay-hint') : null;
        if (!wrap) return;
        if (window.currentDocTrip) window.hydrateStopPayOnTrip(window.currentDocTrip);
        const trip = window.currentDocTrip;
        const plan = window.getStopPayPlan(trip);
        const res = window.getStopPayResult(trip);
        const btns = {};
        METHODS.forEach(function (m) { btns[m] = document.getElementById('btn-docs-paid-' + m.toLowerCase()); });
        const setBtns = function (show) {
            METHODS.forEach(function (m) { if (btns[m]) btns[m].style.display = show ? '' : 'none'; });
        };
        if (!trip) {
            wrap.style.display = 'none';
            return;
        }
        if (plan === 'BILL_LATER') {
            wrap.style.display = 'block';
            if (label) {
                const chip = window.stopPayChip(trip);
                label.textContent = chip.label || 'BILL LATER';
                label.className = 'docs-stop-pay-label stop-pay-' + (chip.kind || 'later');
            }
            if (hint) hint.style.display = 'none';
            setBtns(false);
            return;
        }
        wrap.style.display = 'block';
        if (label) {
            const chip = window.stopPayChip(trip);
            label.textContent = chip.label || 'How did they pay?';
            label.className = 'docs-stop-pay-label stop-pay-' + (chip.kind || 'wait');
        }
        if (hint) hint.style.display = '';
        setBtns(true);
        const paidMethod = methodOfResult(res);
        METHODS.forEach(function (m) {
            if (btns[m]) btns[m].classList.toggle('is-on', paidMethod === m);
        });
    };

    window.handleDocsPaid = function (method) {
        if (!window.currentDocTrip) return;
        window.markStopPayResult(window.currentDocTrip, 'PAID_' + String(method || '').toUpperCase());
    };

    window.handleCalendarPaid = function (method) {
        const id = window.editingTripDbId;
        const trip = (window.currentTrips || []).find(t => t && t[0] === id);
        if (!trip) return;
        window.markStopPayResult(trip, 'PAID_' + String(method || '').toUpperCase()).then(function (ok) {
            if (ok && typeof window.loadTableData === 'function') window.loadTableData(window.currentTrips, true);
        });
    };

    // Old names kept so cached pages / other callers keep working.
    window.handleDocsPaidCash = function () { window.handleDocsPaid('CASH'); };
    window.handleDocsPaidZelle = function () { window.handleDocsPaid('ZELLE'); };
    window.handleCalendarPaidCash = function () { window.handleCalendarPaid('CASH'); };
    window.handleCalendarPaidZelle = function () { window.handleCalendarPaid('ZELLE'); };

    // ---- Accounts Receivable → order ------------------------------------------
    // When an invoice is fully paid in Accounts, record how they paid on the order.
    // Never overwrites a payment the driver/office already marked, and never changes the plan.
    const ACCOUNTS_TAG = 'ACCOUNTS';

    function accountsResult(cashAmt, bankAmt, bankKind) {
        const cash = parseFloat(cashAmt) || 0;
        const bank = parseFloat(bankAmt) || 0;
        if (cash > 0.005 && bank > 0.005) return 'PAID_SPLIT';
        if (cash > 0.005) return 'PAID_CASH';
        if (bank > 0.005) {
            const k = (bankKind || '').toString().toUpperCase();
            if (METHODS.indexOf(k) > 0) return 'PAID_' + k;   // ZELLE / WIRE / CHECK / CARD (not CASH)
            return 'PAID_BANK';
        }
        return '';
    }

    window.applyStopPayFromAccounts = async function (invoiceRecord, pay) {
        if (!invoiceRecord || !invoiceRecord.trip_ids || !window.db) return;
        const res = accountsResult(pay && pay.cashAmount, pay && pay.bankAmount, pay && pay.bankKind);
        if (!res) return;
        const ids = invoiceRecord.trip_ids.split(',').map(function (s) { return s.trim(); })
            .filter(function (t) { return t && t.indexOf('RENTAL_ID:') !== 0 && t.indexOf('VIRTUAL_RENTAL_') !== 0; });
        const who = ACCOUNTS_TAG + ' · ' + (window.userEmail || window.userName || 'unknown');
        const now = new Date().toISOString();
        for (let i = 0; i < ids.length; i++) {
            const tid = ids[i];
            try {
                const { data, error } = await window.db.from('trips')
                    .select('paid, stop_pay_plan, stop_pay_result')
                    .eq('trip_id', tid).limit(1);
                if (error) return; // columns missing (SQL not run): leave payment flow untouched
                const t = data && data[0];
                if (!t || t.paid !== true) continue;                       // order not fully settled yet
                if (isPaidResult(normResult(t.stop_pay_result))) continue; // already marked by driver/office
                const upd = await window.db.from('trips').update({
                    stop_pay_result: res,
                    stop_pay_result_at: now,
                    stop_pay_result_by: who
                }).eq('trip_id', tid);
                if (upd.error) continue;
                patchLocal(tid, { result: res, at: now, by: who });
            } catch (e) {
                console.warn('[StopPay] Accounts → order failed for', tid, e);
            }
        }
    };

    // Undo only what Accounts wrote (never a driver/office mark).
    window.clearStopPayFromAccounts = async function (invoiceRecord) {
        if (!invoiceRecord || !invoiceRecord.trip_ids || !window.db) return;
        const ids = invoiceRecord.trip_ids.split(',').map(function (s) { return s.trim(); })
            .filter(function (t) { return t && t.indexOf('RENTAL_ID:') !== 0 && t.indexOf('VIRTUAL_RENTAL_') !== 0; });
        for (let i = 0; i < ids.length; i++) {
            const tid = ids[i];
            try {
                const { data, error } = await window.db.from('trips')
                    .select('stop_pay_result, stop_pay_result_by')
                    .eq('trip_id', tid).limit(1);
                if (error) return;
                const t = data && data[0];
                if (!t || !t.stop_pay_result_by || String(t.stop_pay_result_by).indexOf(ACCOUNTS_TAG) !== 0) continue;
                const upd = await window.db.from('trips').update({
                    stop_pay_result: null,
                    stop_pay_result_at: null,
                    stop_pay_result_by: null
                }).eq('trip_id', tid);
                if (upd.error) continue;
                patchLocal(tid, { result: '', at: '', by: '' });
            } catch (e) {
                console.warn('[StopPay] Could not clear Accounts payment for', tid, e);
            }
        }
    };
})();
