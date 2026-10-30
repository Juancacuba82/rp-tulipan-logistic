// Driver "Start this trip" — office can see which order is being done now.
(function () {
    const STARTED_AT = 85;
    const STARTED_BY = 86;
    const PHOTOS = 55;
    const CLIENT_SIG = 54;
    const DRIVER_SIG = 56;
    const ORDER_NO = 5;
    const DRIVER = 17;
    const STATUS = 41;

    function tripsPool() {
        const byId = new Map();
        (window.docsTripsCache || []).forEach(t => { if (t && t[0]) byId.set(t[0], t); });
        (window.currentTrips || []).forEach(t => { if (t && t[0]) byId.set(t[0], t); });
        return Array.from(byId.values());
    }

    function namesMatch(a, b) {
        if (window.driverNamesMatch) return window.driverNamesMatch(a, b);
        const clean = (s) => (s || '').toString().replace(/[^a-z0-9]/gi, '').toLowerCase();
        const x = clean(a);
        const y = clean(b);
        if (!x || !y) return false;
        return x === y || x.includes(y) || y.includes(x);
    }

    window.tripIsStarted = function (trip) {
        return !!(trip && trip[STARTED_AT]);
    };

    window.tripHasDeliveryProof = function (trip) {
        if (!trip) return false;
        const photos = Array.isArray(trip[PHOTOS]) ? trip[PHOTOS] : [];
        return photos.length >= 4 && !!(trip[CLIENT_SIG]) && !!(trip[DRIVER_SIG]);
    };

    window.isStaffForDriverStart = function () {
        const role = (window.currentUserRole || '').toLowerCase().trim();
        if (role === 'admin' || role === 'employee' || role === 'staff') return true;
        return typeof window.isAdmin === 'function' && window.isAdmin();
    };

    window.findStartedTripsForDriver = function (driverName, exceptId) {
        const name = (driverName || '').toString().trim();
        if (!name || name === '---') return [];
        return tripsPool().filter(t => {
            if (!t || !t[STARTED_AT]) return false;
            if (exceptId && t[0] === exceptId) return false;
            const st = (t[STATUS] || '').toString().toUpperCase();
            if (st === 'COMPLETE' || st === 'PAID') return false;
            return namesMatch(t[DRIVER], name);
        });
    };

    function patchLocalTrip(tripId, startedAt, startedBy) {
        const apply = (arr) => {
            if (!arr) return;
            const row = arr.find(t => t && t[0] === tripId);
            if (row) {
                row[STARTED_AT] = startedAt || '';
                row[STARTED_BY] = startedBy || '';
            }
        };
        apply(window.currentTrips);
        apply(window.docsTripsCache);
        apply(window.allTripsUnfiltered);
        if (window.currentDocTrip && window.currentDocTrip[0] === tripId) {
            window.currentDocTrip[STARTED_AT] = startedAt || '';
            window.currentDocTrip[STARTED_BY] = startedBy || '';
        }
    }

    let _startConfirmResolver = null;

    function setStartConfirmMode(mode) {
        const yesBtn = document.getElementById('driver-start-confirm-yes');
        const noBtn = document.getElementById('driver-start-confirm-no');
        const actions = document.getElementById('driver-start-confirm-actions');
        if (!yesBtn || !noBtn) return;
        if (mode === 'ok') {
            noBtn.style.display = 'none';
            yesBtn.textContent = 'OK';
            yesBtn.className = 'driver-start-btn-yes';
            if (actions) actions.style.justifyContent = 'stretch';
        } else {
            noBtn.style.display = '';
            noBtn.textContent = 'NO';
            yesBtn.textContent = 'YES';
            yesBtn.className = 'driver-start-btn-yes';
        }
    }

    window.closeDriverStartConfirm = function (ok) {
        const modal = document.getElementById('driver-start-confirm-modal');
        if (modal) modal.style.display = 'none';
        const resolve = _startConfirmResolver;
        _startConfirmResolver = null;
        if (resolve) resolve(!!ok);
    };

    window.openDriverStartConfirm = function (opts) {
        const modal = document.getElementById('driver-start-confirm-modal');
        const titleEl = document.getElementById('driver-start-confirm-title');
        const orderEl = document.getElementById('driver-start-confirm-order');
        const textEl = document.getElementById('driver-start-confirm-text');
        const yesBtn = document.getElementById('driver-start-confirm-yes');
        const noBtn = document.getElementById('driver-start-confirm-no');
        if (!modal) return Promise.resolve(false);
        if (_startConfirmResolver) _startConfirmResolver(false);
        if (titleEl) titleEl.textContent = (opts && opts.title) || 'Start this trip?';
        if (orderEl) {
            orderEl.textContent = (opts && opts.order) || '';
            orderEl.style.display = (opts && opts.order) ? '' : 'none';
        }
        if (textEl) textEl.textContent = (opts && opts.text) || 'Are you sure?';
        setStartConfirmMode((opts && opts.mode) || 'yesno');
        yesBtn.onclick = function () { window.closeDriverStartConfirm(true); };
        noBtn.onclick = function () { window.closeDriverStartConfirm(false); };
        modal.style.display = 'flex';
        return new Promise(function (resolve) {
            _startConfirmResolver = resolve;
        });
    };

    async function writeStart(tripId, startedAt, startedBy) {
        const payload = {
            driver_started_at: startedAt || null,
            driver_started_by: startedBy || null
        };
        const { error } = await db.from('trips').update(payload).eq('trip_id', tripId);
        if (error) throw error;
        patchLocalTrip(tripId, startedAt, startedBy);
    }

    window.clearDriverTripStart = async function (tripId, opts) {
        if (!tripId || !db) return false;
        const silent = !!(opts && opts.silent);
        try {
            await writeStart(tripId, null, null);
            if (window.logActivity) {
                window.logActivity('DRIVER_TRIP_START_CLEARED', 'Cleared start on trip ' + tripId);
            }
            if (!silent && window.showToast) window.showToast('Start cleared.', 'success');
            if (typeof window.syncDriverStartUI === 'function') window.syncDriverStartUI();
            if (typeof window.loadDocTrips === 'function') window.loadDocTrips(false);
            return true;
        } catch (err) {
            console.error('clearDriverTripStart', err);
            const msg = (err && err.message) || String(err);
            if (/driver_started/i.test(msg)) {
                alert('Run supabase-driver-trip-start.sql in Supabase, then try again.');
            } else {
                alert('Could not clear start: ' + msg);
            }
            return false;
        }
    };

    window.startDriverTrip = async function (trip, opts) {
        if (!trip || !trip[0] || !db) return false;
        const office = !!(opts && opts.office);
        const skipConfirm = !!(opts && opts.skipConfirm);
        const orderLabel = (trip[ORDER_NO] && trip[ORDER_NO] !== '---') ? trip[ORDER_NO] : 'this trip';
        const driverName = trip[DRIVER] || window.currentDriverNameRef || '';

        if (trip[STARTED_AT]) {
            if (window.showToast) window.showToast('This trip is already started.', 'info');
            return true;
        }

        const others = window.findStartedTripsForDriver(driverName, trip[0]);
        const blocked = others.filter(t => !window.tripHasDeliveryProof(t));

        if (blocked.length && !office) {
            const otherNo = (blocked[0][ORDER_NO] && blocked[0][ORDER_NO] !== '---')
                ? blocked[0][ORDER_NO]
                : 'the current trip';
            await window.openDriverStartConfirm({
                title: 'Finish this trip first',
                order: otherNo,
                text: 'Upload 4 photos and both signatures on the current trip first.\n\nIf this was the wrong start, message the office on WhatsApp so they can clear it.',
                mode: 'ok'
            });
            return false;
        }

        if (!skipConfirm) {
            const ok = await window.openDriverStartConfirm({
                title: 'Start this trip?',
                order: 'Order: ' + orderLabel,
                text: 'Are you sure?',
                mode: 'yesno'
            });
            if (!ok) return false;
        }

        const who = (window.userEmail || window.currentDriverNameRef || 'unknown').toString();
        const now = new Date().toISOString();

        try {
            for (const other of others) {
                await writeStart(other[0], null, null);
            }
            await writeStart(trip[0], now, who);
            if (window.logActivity) {
                window.logActivity('DRIVER_TRIP_STARTED', 'Started trip ' + trip[0] + ' order ' + orderLabel, trip[1] || null);
            }
            if (window.showToast) window.showToast('Started order ' + orderLabel, 'success');
            if (typeof window.syncDriverStartUI === 'function') window.syncDriverStartUI();
            if (typeof window.loadDocTrips === 'function') window.loadDocTrips(false);
            return true;
        } catch (err) {
            console.error('startDriverTrip', err);
            const msg = (err && err.message) || String(err);
            if (/driver_started/i.test(msg)) {
                alert('Run supabase-driver-trip-start.sql in Supabase, then try again.');
            } else {
                alert('Could not start this trip: ' + msg);
            }
            return false;
        }
    };

    window.syncDriverStartUI = function () {
        const trip = window.currentDocTrip;
        const startBtn = document.getElementById('btn-docs-start-trip');
        const clearBtn = document.getElementById('btn-docs-clear-start');
        const staff = window.isStaffForDriverStart();

        if (clearBtn) {
            clearBtn.style.display = (staff && trip && trip[STARTED_AT]) ? '' : 'none';
        }
        if (!startBtn) return;
        if (!trip) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<i class="fas fa-play"></i> START THIS TRIP';
            startBtn.classList.remove('is-started');
            return;
        }
        if (trip[STARTED_AT]) {
            startBtn.disabled = true;
            startBtn.classList.add('is-started');
            startBtn.innerHTML = '<i class="fas fa-truck"></i> DOING THIS NOW';
            return;
        }
        startBtn.disabled = false;
        startBtn.classList.remove('is-started');
        startBtn.innerHTML = '<i class="fas fa-play"></i> START THIS TRIP';
    };

    window.handleDocsStartTrip = async function () {
        if (!window.currentDocTrip) {
            alert('Open a trip first.');
            return;
        }
        const office = window.isStaffForDriverStart();
        await window.startDriverTrip(window.currentDocTrip, { office: office });
    };

    window.handleDocsClearStart = async function () {
        if (!window.isStaffForDriverStart()) return;
        if (!window.currentDocTrip || !window.currentDocTrip[STARTED_AT]) return;
        const orderLabel = window.currentDocTrip[ORDER_NO] || 'this trip';
        if (!confirm('Clear the start on order ' + orderLabel + '?\n\nThe driver can then start a different trip.')) return;
        await window.clearDriverTripStart(window.currentDocTrip[0]);
    };

    function currentCalendarTrip() {
        const id = window.editingTripDbId;
        if (!id) return null;
        return (window.currentTrips || []).find(t => t && t[0] === id) || null;
    }

    window.syncCalendarDriverStartUI = function () {
        const box = document.getElementById('calendar-driver-start-box');
        const label = document.getElementById('calendar-driver-start-label');
        const startBtn = document.getElementById('btn-cal-start-trip');
        const clearBtn = document.getElementById('btn-cal-clear-start');
        if (!box) return;
        if (!window.isStaffForDriverStart()) {
            box.style.display = 'none';
            return;
        }
        const trip = currentCalendarTrip();
        if (!trip) {
            box.style.display = 'none';
            return;
        }
        box.style.display = 'block';
        if (trip[STARTED_AT]) {
            const when = trip[STARTED_AT] ? new Date(trip[STARTED_AT]).toLocaleString() : '';
            if (label) label.textContent = 'Driver is doing this trip now' + (when ? ' · ' + when : '');
            if (startBtn) startBtn.style.display = 'none';
            if (clearBtn) clearBtn.style.display = '';
        } else {
            if (label) label.textContent = 'Driver has not started this trip.';
            if (startBtn) startBtn.style.display = '';
            if (clearBtn) clearBtn.style.display = 'none';
        }
    };

    window.handleCalendarStartTrip = async function () {
        const trip = currentCalendarTrip();
        if (!trip) return;
        await window.startDriverTrip(trip, { office: true });
        window.syncCalendarDriverStartUI();
        if (typeof window.loadTableData === 'function') window.loadTableData(window.currentTrips, true);
    };

    window.handleCalendarClearStart = async function () {
        const trip = currentCalendarTrip();
        if (!trip || !trip[STARTED_AT]) return;
        const orderLabel = trip[ORDER_NO] || 'this trip';
        if (!confirm('Clear the start on order ' + orderLabel + '?\n\nThe driver can then start a different trip.')) return;
        await window.clearDriverTripStart(trip[0]);
        window.syncCalendarDriverStartUI();
        if (typeof window.loadTableData === 'function') window.loadTableData(window.currentTrips, true);
    };

    window.driverStartBadgeHtml = function (trip, compact) {
        if (!trip || !trip[STARTED_AT]) return '';
        if (compact) {
            return '<span class="trip-doing-now-badge">NOW</span>';
        }
        const when = trip[STARTED_AT] ? new Date(trip[STARTED_AT]).toLocaleString() : '';
        return '<span class="trip-doing-now-badge" title="Started ' + when + '">DOING NOW</span>';
    };
})();
