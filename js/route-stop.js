// Route stop 1, 2, 3 — office numbers a driver's day; driver must follow it.
(function () {
    const ROUTE_STOP = 92;
    const DATE = 1;
    const ORDER_NO = 5;
    const DRIVER = 17;
    const STATUS = 41;
    const PHOTOS = 55;
    const CLIENT_SIG = 54;
    const DRIVER_SIG = 56;

    function namesMatch(a, b) {
        if (window.driverNamesMatch) return window.driverNamesMatch(a, b);
        const clean = (s) => (s || '').toString().replace(/[^a-z0-9]/gi, '').toLowerCase();
        const x = clean(a);
        const y = clean(b);
        if (!x || !y) return false;
        return x === y || x.includes(y) || y.includes(x);
    }

    function tripDate(trip) {
        return ((trip && trip[DATE]) || '').toString().split('T')[0];
    }

    function tripStatus(trip) {
        return ((trip && trip[STATUS]) || '').toString().toUpperCase();
    }

    function isOpenTrip(trip) {
        const st = tripStatus(trip);
        return st !== 'COMPLETE' && st !== 'PAID';
    }

    function localYmd(d) {
        const x = d || new Date();
        const y = x.getFullYear();
        const m = String(x.getMonth() + 1).padStart(2, '0');
        const day = String(x.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function addDaysYmd(ymd, days) {
        const p = (ymd || '').split('-').map(Number);
        if (p.length !== 3 || !p[0]) return ymd;
        const d = new Date(p[0], p[1] - 1, p[2]);
        d.setDate(d.getDate() + days);
        return localYmd(d);
    }

    // Drivers may open today's trips only between 2:00 AM and 10:00 PM local time.
    const DRIVER_DAY_START_HOUR = 2;
    const DRIVER_DAY_END_HOUR = 22;

    function driverHour() {
        return new Date().getHours();
    }

    function driverTodayStillOpen() {
        return driverHour() < DRIVER_DAY_END_HOUR;
    }

    function driverTodayWorkHours() {
        const h = driverHour();
        return h >= DRIVER_DAY_START_HOUR && h < DRIVER_DAY_END_HOUR;
    }

    window.ROUTE_STOP_IDX = ROUTE_STOP;

    window.getTripRouteStop = function (trip) {
        const n = parseInt(trip && trip[ROUTE_STOP], 10);
        return (n >= 1 && n <= 99) ? n : 0;
    };

    window.tripsPoolForRoute = function () {
        const byId = new Map();
        (window.allTripsUnfiltered || []).forEach(t => { if (t && t[0]) byId.set(t[0], t); });
        (window.currentTrips || []).forEach(t => { if (t && t[0]) byId.set(t[0], t); });
        (window.docsTripsCache || []).forEach(t => { if (t && t[0]) byId.set(t[0], t); });
        return Array.from(byId.values());
    };

    window.clearPastDueRouteStops = async function () {
        if (window._clearingPastDueStops || typeof db === 'undefined' || !db) return;
        const today = localYmd();
        const stale = window.tripsPoolForRoute().filter(t => {
            if (!t || !t[0] || !isOpenTrip(t)) return false;
            const d = tripDate(t);
            if (!d || d >= today) return false;
            return window.getTripRouteStop(t) > 0;
        });
        if (!stale.length) return;
        window._clearingPastDueStops = true;
        try {
            const ids = stale.map(t => t[0]);
            for (let i = 0; i < ids.length; i += 40) {
                const chunk = ids.slice(i, i + 40);
                const { error } = await db.from('trips').update({ route_stop: null }).in('trip_id', chunk);
                if (error) throw error;
                chunk.forEach(id => window.patchTripRouteStop(id, ''));
            }
            if (typeof window.syncCalendarRouteStopUI === 'function') window.syncCalendarRouteStopUI();
            if (typeof window.loadTableData === 'function' && window.currentTrips) {
                window.loadTableData(window.currentTrips);
            }
        } catch (err) {
            console.warn('clearPastDueRouteStops', err);
        } finally {
            window._clearingPastDueStops = false;
        }
    };

    window.patchTripRouteStop = function (tripId, stop) {
        const val = stop || '';
        const apply = (arr) => {
            if (!arr) return;
            const row = arr.find(t => t && t[0] === tripId);
            if (row) row[ROUTE_STOP] = val;
        };
        apply(window.currentTrips);
        apply(window.allTripsUnfiltered);
        apply(window.docsTripsCache);
        if (window.currentDocTrip && window.currentDocTrip[0] === tripId) {
            window.currentDocTrip[ROUTE_STOP] = val;
        }
    };

    window.driverDayTrips = function (driverName, dateStr, opts) {
        const includeClosed = !!(opts && opts.includeClosed);
        const exceptId = opts && opts.exceptId;
        const date = (dateStr || '').toString().split('T')[0];
        const name = (driverName || '').toString().trim();
        if (!name || name === '---' || !date) return [];
        return window.tripsPoolForRoute().filter(t => {
            if (!t || !t[0]) return false;
            if (exceptId && t[0] === exceptId) return false;
            if (tripDate(t) !== date) return false;
            if (!namesMatch(t[DRIVER], name)) return false;
            if (!includeClosed && !isOpenTrip(t)) return false;
            return true;
        }).sort((a, b) => {
            const sa = window.getTripRouteStop(a) || 999;
            const sb = window.getTripRouteStop(b) || 999;
            if (sa !== sb) return sa - sb;
            return String(a[ORDER_NO] || '').localeCompare(String(b[ORDER_NO] || ''));
        });
    };

    window.routeNeedsStops = function (driverName, dateStr) {
        return window.driverDayTrips(driverName, dateStr).length >= 1;
    };

    window.routeStopsReady = function (driverName, dateStr) {
        const trips = window.driverDayTrips(driverName, dateStr);
        if (!trips.length) return true;
        const used = new Set();
        for (const t of trips) {
            const n = window.getTripRouteStop(t);
            if (!n || n < 1 || n > trips.length || used.has(n)) return false;
            used.add(n);
        }
        return used.size === trips.length;
    };

    window.unreadyDriverRoutes = function (dates) {
        const daySet = new Set((dates || []).filter(Boolean));
        const groups = new Map();
        window.tripsPoolForRoute().forEach(t => {
            if (!t || !isOpenTrip(t)) return;
            const d = tripDate(t);
            if (daySet.size && !daySet.has(d)) return;
            const drv = (t[DRIVER] || '').toString().trim();
            if (!drv || drv === '---') return;
            const key = drv.toLowerCase() + '|' + d;
            if (!groups.has(key)) groups.set(key, { driver: drv, date: d, trips: [] });
            groups.get(key).trips.push(t);
        });
        const out = [];
        groups.forEach(g => {
            if (!g.trips.length) return;
            if (!window.routeStopsReady(g.driver, g.date)) out.push(g);
        });
        out.sort((a, b) => (a.date + a.driver).localeCompare(b.date + b.driver));
        return out;
    };

    window.driverDocsDateVisible = function (dateStr) {
        const date = (dateStr || '').toString().split('T')[0];
        if (!date) return false;
        return date >= localYmd();
    };

    window.driverDocsDateOpenable = function (dateStr) {
        const date = (dateStr || '').toString().split('T')[0];
        if (!date) return false;
        return date >= localYmd();
    };

    window.nextDriverRouteTrip = function (driverName, dateStr) {
        const trips = window.driverDayTrips(driverName, dateStr);
        if (!trips.length) return null;
        if (!window.routeStopsReady(driverName, dateStr)) return null;
        const ordered = trips.slice().sort((a, b) => window.getTripRouteStop(a) - window.getTripRouteStop(b));
        const isDone = (t) => (typeof window.tripStopIsComplete === 'function')
            ? window.tripStopIsComplete(t)
            : (typeof window.tripHasDeliveryProof === 'function' && window.tripHasDeliveryProof(t));
        return ordered.find(t => !isDone(t)) || null;
    };

    window.docsTripOpenBlock = function (trip) {
        if (!trip) return { ok: false, reason: 'missing' };
        const role = (window.currentUserRole || '').toLowerCase().trim();
        if (role !== 'driver') return { ok: true };
        const date = tripDate(trip);
        if (!window.driverDocsDateVisible(date)) {
            return { ok: false, reason: 'past', text: 'This trip date has already passed.' };
        }
        return { ok: true };
    };

    window.tryOpenDocsTrip = async function (trip, el) {
        const block = window.docsTripOpenBlock(trip);
        if (!block.ok) {
            if (window.openDriverStartConfirm) {
                const title = block.reason === 'too_early'
                    ? 'Too early'
                    : (block.reason === 'future'
                        ? 'This trip is not for today'
                        : (block.reason === 'unnumbered' ? 'Stops not set' : 'Not this trip yet'));
                await window.openDriverStartConfirm({
                    title: title,
                    order: (trip[ORDER_NO] && trip[ORDER_NO] !== '---') ? ('Order: ' + trip[ORDER_NO]) : '',
                    text: block.text,
                    mode: 'ok'
                });
            } else {
                alert(block.text);
            }
            return false;
        }
        window.currentDocTrip = trip;
        if (typeof window.fillReceiptFromTrip === 'function') {
            await window.fillReceiptFromTrip(window.currentDocTrip || trip, el);
        }
        if (typeof window.syncDriverStartUI === 'function') window.syncDriverStartUI();
        return true;
    };

    window.requireDocsTripStarted = function (actionLabel) {
        const role = (window.currentUserRole || '').toLowerCase().trim();
        if (role !== 'driver') return true;
        const trip = window.currentDocTrip;
        if (!trip) {
            alert('Open a trip first.');
            return false;
        }
        return true;
    };

    async function writeRouteStop(tripId, stop) {
        const payload = { route_stop: stop || null };
        const { error } = await db.from('trips').update(payload).eq('trip_id', tripId);
        if (error) throw error;
        window.patchTripRouteStop(tripId, stop || '');
    }

    window.setTripRouteStop = async function (tripId, stop) {
        if (!tripId || !db) return false;
        const trip = window.tripsPoolForRoute().find(t => t && t[0] === tripId);
        if (!trip) return false;
        const n = parseInt(stop, 10) || 0;
        if (n) {
            const others = window.driverDayTrips(trip[DRIVER], tripDate(trip), { exceptId: tripId });
            const clash = others.find(t => window.getTripRouteStop(t) === n);
            if (clash) {
                const order = (clash[ORDER_NO] && clash[ORDER_NO] !== '---') ? clash[ORDER_NO] : 'another trip';
                alert('Stop ' + n + ' is already on order ' + order + '.');
                return false;
            }
        }
        try {
            await writeRouteStop(tripId, n || null);
            if (window.logActivity) {
                window.logActivity('ROUTE_STOP_SET', 'Stop ' + (n || 'cleared') + ' on trip ' + tripId);
            }
            if (window.showToast) window.showToast(n ? ('Stop ' + n + ' saved') : 'Stop cleared', 'success');
            window.syncCalendarRouteStopUI();
            window.renderRouteStopBanner();
            if (typeof window.loadDocTrips === 'function') window.loadDocTrips(false);
            if (typeof window.loadTableData === 'function') window.loadTableData(window.currentTrips);
            return true;
        } catch (err) {
            console.error('setTripRouteStop', err);
            const msg = (err && err.message) || String(err);
            if (/route_stop/i.test(msg)) {
                alert('Run supabase-route-stop.sql in Supabase, then try again.');
            } else {
                alert('Could not save stop: ' + msg);
            }
            return false;
        }
    };

    window.syncCalendarRouteStopUI = function () {
        const box = document.getElementById('calendar-route-stop-box');
        if (!box) return;
        const staff = typeof window.isStaffForDriverStart === 'function' && window.isStaffForDriverStart();
        if (!staff) {
            box.style.display = 'none';
            return;
        }
        const id = window.editingTripDbId;
        const trip = id ? (window.currentTrips || []).find(t => t && t[0] === id) : null;
        if (!trip) {
            box.style.display = 'none';
            return;
        }
        const siblings = window.driverDayTrips(trip[DRIVER], tripDate(trip));
        const needs = siblings.length >= 1;
        box.style.display = '';
        const hint = document.getElementById('calendar-route-stop-hint');
        const btns = document.getElementById('calendar-route-stop-btns');
        const list = document.getElementById('calendar-route-stop-list');
        const current = window.getTripRouteStop(trip);
        if (hint) {
            if (!trip[DRIVER] || trip[DRIVER] === '---') {
                hint.textContent = 'Assign a driver first. Stop 1, 2, 3 is a guide for the driver (optional).';
            } else if (window.routeStopsReady(trip[DRIVER], tripDate(trip))) {
                hint.textContent = siblings.length + ' trip' + (siblings.length === 1 ? '' : 's') + ' this day. Stops are set.';
            } else {
                hint.textContent = 'Stop 1, 2, 3 is optional. The driver can open the order without it.';
            }
        }
        if (btns) {
            const max = Math.max(needs ? siblings.length : 3, 3);
            const count = Math.min(Math.max(max, 3), 9);
            let html = '';
            for (let i = 1; i <= count; i++) {
                html += '<button type="button" class="cal-route-stop-btn' + (current === i ? ' is-on' : '') + '" data-stop="' + i + '">' + i + '</button>';
            }
            html += '<button type="button" class="cal-route-stop-btn cal-route-stop-clear' + (!current ? ' is-on' : '') + '" data-stop="0">—</button>';
            btns.innerHTML = html;
            btns.querySelectorAll('button').forEach(btn => {
                btn.onclick = function () {
                    const stop = parseInt(btn.getAttribute('data-stop'), 10) || 0;
                    window.setTripRouteStop(trip[0], stop);
                };
            });
        }
        if (list) {
            if (!siblings.length) {
                list.innerHTML = '';
                return;
            }
            list.innerHTML = siblings.map(t => {
                const n = window.getTripRouteStop(t);
                const order = (t[ORDER_NO] && t[ORDER_NO] !== '---') ? t[ORDER_NO] : 'Trip';
                const on = t[0] === trip[0] ? ' is-current' : '';
                return '<button type="button" class="cal-route-sib' + on + '" data-id="' + t[0] + '">' +
                    '<span class="cal-route-sib-n">' + (n || '—') + '</span>' +
                    '<span>Order ' + order + '</span></button>';
            }).join('');
            list.querySelectorAll('button').forEach(btn => {
                btn.onclick = function () {
                    const tid = btn.getAttribute('data-id');
                    const idx = (window.currentTrips || []).findIndex(t => t && t[0] === tid);
                    if (idx >= 0 && typeof window.loadTripToEdit === 'function') window.loadTripToEdit(idx);
                };
            });
        }
    };

    window.renderRouteStopBanner = function () {
        const el = document.getElementById('calendar-route-banner');
        if (el) {
            el.style.display = 'none';
            el.innerHTML = '';
        }
    };

    window.warnIfRouteNeedsStops = function () {
        return;
    };

    window.calendarFamilyDriverHtml = function (moves, parentId) {
        const list = (moves || []).filter(Boolean);
        if (!list.length) return '';
        const pid = parentId || (list[0] && list[0][0]);
        const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        return list.map((m, i) => {
            const st = (m[41] || '').toUpperCase();
            const done = st === 'COMPLETE' || st === 'PAID';
            const raw = (m[17] && m[17] !== '---') ? String(m[17]).trim() : 'No driver';
            const short = raw.split(/\s+/)[0] || raw;
            const stop = window.getTripRouteStop ? window.getTripRouteStop(m) : 0;
            const seq = (typeof window.getMoveSeq === 'function')
                ? window.getMoveSeq(m, pid)
                : (i + 1);
            const title = 'Move ' + seq + ' · ' + raw + (done ? ' · Complete' : (stop ? (' · Stop ' + stop) : ' · no stop'));
            if (done) {
                return '<span class="cal-move-drv is-done" title="' + esc(title) + '">M' + seq + ' ✓ ' + esc(short) + '</span>';
            }
            if (stop) {
                return '<span class="cal-move-drv" title="' + esc(title) + '"><span class="trip-route-stop-badge">' + stop + '</span> ' + esc(short) + '</span>';
            }
            return '<span class="cal-move-drv is-missing" title="' + esc(title) + '">M' + seq + ' ' + esc(short) + '</span>';
        }).join('');
    };

    window.docsRouteLabel = function (trip) {
        const n = window.getTripRouteStop(trip);
        if (n) return '[' + n + '] ';
        const note = (trip && trip[25]) || '';
        const match = String(note).trim().match(/^(\d+)\./);
        return match ? '[' + match[1] + '] ' : '';
    };
})();
