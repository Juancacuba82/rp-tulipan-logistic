// Stop payment: plan (Cash / Zelle / Bill later) + what happened at the stop.
(function () {
    const PLAN = 87;
    const RESULT = 88;
    const RESULT_AT = 89;
    const RESULT_BY = 90;

    function normPlan(v) {
        const s = (v || '').toString().toUpperCase().replace(/\s+/g, '_');
        if (s === 'CASH' || s === 'ZELLE' || s === 'BILL_LATER') return s;
        return '';
    }

    function normResult(v) {
        const s = (v || '').toString().toUpperCase().replace(/\s+/g, '_');
        if (s === 'WAITING' || s === 'PAID_CASH' || s === 'PAID_ZELLE') return s;
        return '';
    }

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
        if ((plan === 'CASH' || plan === 'ZELLE') && !res) return 'WAITING';
        return res;
    };

    window.stopPayNeedsDriverMark = function (trip) {
        const plan = window.getStopPayPlan(trip);
        if (plan !== 'CASH' && plan !== 'ZELLE') return false;
        const res = window.getStopPayResult(trip);
        return res === 'WAITING' || !res;
    };

    window.stopPayChip = function (trip) {
        const plan = window.getStopPayPlan(trip);
        const res = window.getStopPayResult(trip);
        if (!plan && !res) return { html: '', label: '', kind: '' };
        let label = '';
        let kind = 'wait';
        if (plan === 'BILL_LATER') {
            label = 'BILL LATER';
            kind = 'later';
        } else if (res === 'PAID_CASH' || res === 'PAID_ZELLE') {
            const paid = res === 'PAID_CASH' ? 'PAID CASH' : 'PAID ZELLE';
            if (plan && ((plan === 'CASH' && res === 'PAID_ZELLE') || (plan === 'ZELLE' && res === 'PAID_CASH'))) {
                label = plan + ' → ' + paid;
            } else {
                label = paid;
            }
            kind = 'paid';
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
        ['CASH', 'ZELLE', 'BILL_LATER'].forEach(function (k) {
            const el = document.getElementById('btn-stop-plan-' + k.toLowerCase().replace('_', '-'));
            if (!el) return;
            const on = p === k;
            el.classList.toggle('is-on', on);
            el.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const hid = document.getElementById('in-stop-pay-plan');
        if (hid) hid.value = p;
    }

    window.selectStopPayPlan = function (plan) {
        paintPlanButtons(plan);
        const id = window.editingTripDbId;
        if (!id || !db) return;
        const p = normPlan(plan);
        db.from('trips').update({ stop_pay_plan: p || null }).eq('trip_id', id).then(function (ret) {
            if (ret.error) {
                console.warn('Could not save stop payment plan', ret.error);
                return;
            }
            patchLocal(id, { plan: p });
            if (typeof window.loadTableData === 'function' && window.currentTrips) {
                window.loadTableData(window.currentTrips, true);
            }
        });
    };

    window.readStopPayPlanFromForm = function () {
        return normPlan(document.getElementById('in-stop-pay-plan')?.value);
    };

    window.syncStopPayForm = function (trip) {
        const plan = trip ? window.getStopPayPlan(trip) : '';
        const res = trip ? window.getStopPayResult(trip) : '';
        let highlight = plan;
        if (res === 'PAID_ZELLE') highlight = 'ZELLE';
        else if (res === 'PAID_CASH') highlight = 'CASH';
        paintPlanButtons(highlight);
        const resEl = document.getElementById('calendar-stop-pay-result');
        const box = document.getElementById('calendar-stop-pay-result-box');
        const staff = typeof window.isStaffForDriverStart === 'function' && window.isStaffForDriverStart();
        const showMarks = !!(staff && trip && (highlight === 'CASH' || highlight === 'ZELLE' || res === 'PAID_CASH' || res === 'PAID_ZELLE'));
        if (box) box.style.display = showMarks ? '' : 'none';
        if (resEl) {
            const chip = trip ? window.stopPayChip(trip) : { label: '' };
            resEl.textContent = chip.label || 'WAITING';
        }
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
        if (res !== 'PAID_CASH' && res !== 'PAID_ZELLE' && res !== 'WAITING') return false;
        const skipConfirm = !!(opts && opts.skipConfirm);
        const orderLabel = (trip[5] && trip[5] !== '---') ? trip[5] : 'this trip';
        const nice = res === 'PAID_CASH' ? 'PAID CASH' : (res === 'PAID_ZELLE' ? 'PAID ZELLE' : 'WAITING');
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
        if (!existingPlan && (res === 'PAID_CASH' || res === 'PAID_ZELLE')) {
            payload.stop_pay_plan = res === 'PAID_ZELLE' ? 'ZELLE' : 'CASH';
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
        const cashBtn = document.getElementById('btn-docs-paid-cash');
        const zelleBtn = document.getElementById('btn-docs-paid-zelle');
        if (!trip) {
            wrap.style.display = 'none';
            return;
        }
        if (plan === 'BILL_LATER') {
            wrap.style.display = 'block';
            if (label) {
                label.textContent = 'BILL LATER';
                label.className = 'docs-stop-pay-label stop-pay-later';
            }
            if (hint) hint.style.display = 'none';
            if (cashBtn) cashBtn.style.display = 'none';
            if (zelleBtn) zelleBtn.style.display = 'none';
            return;
        }
        wrap.style.display = 'block';
        if (label) {
            const chip = window.stopPayChip(trip);
            label.textContent = chip.label || 'How did they pay?';
            label.className = 'docs-stop-pay-label stop-pay-' + (chip.kind || 'wait');
        }
        if (hint) hint.style.display = '';
        if (cashBtn) cashBtn.style.display = '';
        if (zelleBtn) zelleBtn.style.display = '';
        if (cashBtn) cashBtn.classList.toggle('is-on', res === 'PAID_CASH');
        if (zelleBtn) zelleBtn.classList.toggle('is-on', res === 'PAID_ZELLE');
    };

    window.handleDocsPaidCash = function () {
        if (!window.currentDocTrip) return;
        window.markStopPayResult(window.currentDocTrip, 'PAID_CASH');
    };

    window.handleDocsPaidZelle = function () {
        if (!window.currentDocTrip) return;
        window.markStopPayResult(window.currentDocTrip, 'PAID_ZELLE');
    };

    window.handleCalendarPaidCash = function () {
        const id = window.editingTripDbId;
        const trip = (window.currentTrips || []).find(t => t && t[0] === id);
        if (!trip) return;
        window.markStopPayResult(trip, 'PAID_CASH').then(function (ok) {
            if (ok && typeof window.loadTableData === 'function') window.loadTableData(window.currentTrips, true);
        });
    };

    window.handleCalendarPaidZelle = function () {
        const id = window.editingTripDbId;
        const trip = (window.currentTrips || []).find(t => t && t[0] === id);
        if (!trip) return;
        window.markStopPayResult(trip, 'PAID_ZELLE').then(function (ok) {
            if (ok && typeof window.loadTableData === 'function') window.loadTableData(window.currentTrips, true);
        });
    };
})();
