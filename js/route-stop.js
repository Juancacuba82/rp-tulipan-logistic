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

    // Drivers may open today's trips only between 6:00 AM and 10:00 PM local time.
    const DRIVER_DAY_START_HOUR = 6;
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
        return window.driverDayTrips(driverName, dateStr).length >= 2;
    };

    window.routeStopsReady = function (driverName, dateStr) {
        const trips = window.driverDayTrips(driverName, dateStr);
        if (trips.length <= 1) return true;
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
            if (g.trips.length < 2) return;
            if (!window.routeStopsReady(g.driver, g.date)) out.push(g);
        });
        out.sort((a, b) => (a.date + a.driver).localeCompare(b.date + b.driver));
        return out;
    };

    window.driverDocsDateVisible = function (dateStr) {
        const date = (dateStr || '').toString().split('T')[0];
        if (!date) return false;
        const today = localYmd();
        if (date > today) return true;
        if (date < today) return false;
        return driverTodayStillOpen();
    };

    window.driverDocsDateOpenable = function (dateStr) {
        const date = (dateStr || '').toString().split('T')[0];
        if (!date) return false;
        return date === localYmd() && driverTodayWorkHours();
    };

    window.nextDriverRouteTrip = function (driverName, dateStr) {
        const trips = window.driverDayTrips(driverName, dateStr);
        if (!trips.length) return null;
        if (trips.length === 1) return trips[0];
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
        if (!window.driverDocsDateOpenable(date)) {
            if (date === localYmd() && driverHour() < DRIVER_DAY_START_HOUR) {
                return {
                    ok: false,
                    reason: 'too_early',
                    text: 'This trip opens at 6:00 AM.'
                };
            }
            const nice = (typeof window.formatDateMMDDYYYY === 'function')
                ? window.formatDateMMDDYYYY(date)
                : date;
            return {
                ok: false,
                reason: 'future',
                text: 'This trip is for ' + nice + '.'
            };
        }
        const driver = trip[DRIVER];
        const siblings = window.driverDayTrips(driver, date);
        if (siblings.length >= 2 && !window.routeStopsReady(driver, date)) {
            return {
                ok: false,
                reason: 'unnumbered',
                text: 'Office must set Stop 1, 2, 3 for these trips before you can open them.'
            };
        }
        if (siblings.length >= 2) {
            const next = window.nextDriverRouteTrip(driver, date);
            if (next && next[0] !== trip[0]) {
                const label = (next[ORDER_NO] && next[ORDER_NO] !== '---') ? next[ORDER_NO] : 'the current stop';
                return {
                    ok: false,
                    reason: 'order',
                    text: 'Finish stop ' + (window.getTripRouteStop(next) || 1) + ' first' +
                    ((typeof window.tripNeedsDeliveryProof === 'function' && !window.tripNeedsDeliveryProof(next))
                        ? ' (tap Finish this stop).'
                        : ' (4 photos and both signatures).') +
                    '\n\nCurrent: order ' + label
                };
            }
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
        const role = (window.currentUserRole || '').toLowerCase().trim();
        window.currentDocTrip = trip;
        if (role === 'driver' && typeof window.tripIsStarted === 'function' && !window.tripIsStarted(trip)) {
            const started = await window.startDriverTrip(trip, { office: false, skipConfirm: true });
            if (!started) return false;
        }
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
        const block = window.docsTripOpenBlock(trip);
        if (!block.ok) {
            alert(block.text);
            return false;
        }
        if (typeof window.tripIsStarted === 'function' && !window.tripIsStarted(trip)) {
            alert('Start this trip first' + (actionLabel ? (' before ' + actionLabel) : '') + '.');
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
        const needs = siblings.length >= 2;
        box.style.display = '';
        const hint = document.getElementById('calendar-route-stop-hint');
        const btns = document.getElementById('calendar-route-stop-btns');
        const list = document.getElementById('calendar-route-stop-list');
        const current = window.getTripRouteStop(trip);
        if (hint) {
            if (!trip[DRIVER] || trip[DRIVER] === '---') {
                hint.textContent = 'Assign a driver first. Then set Stop 1, 2, 3 if they have more than one trip that day.';
            } else if (!needs) {
                hint.textContent = 'Only one open trip this day for this driver. Numbering is optional.';
            } else if (window.routeStopsReady(trip[DRIVER], tripDate(trip))) {
                hint.textContent = siblings.length + ' trips this day. Stops are set.';
            } else {
                hint.textContent = siblings.length + ' trips this day — set Stop 1, 2, 3 (driver cannot work until you do).';
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
            if (!needs) {
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
        if (!el) return;
        const staff = typeof window.isStaffForDriverStart === 'function' && window.isStaffForDriverStart();
        if (!staff) {
            el.style.display = 'none';
            return;
        }
        const today = localYmd();
        const tomorrow = addDaysYmd(today, 1);
        const bad = window.unreadyDriverRoutes([today, tomorrow]);
        if (!bad.length) {
            el.style.display = 'none';
            el.innerHTML = '';
            return;
        }
        const lines = bad.map(g => {
            const when = g.date === today ? 'today' : (g.date === tomorrow ? 'tomorrow' : g.date);
            return g.driver + ': ' + g.trips.length + ' trips ' + when;
        });
        el.style.display = 'flex';
        el.innerHTML = '<div><strong>Stops not set</strong> — drivers cannot work these until you number them.<br>' +
            lines.map(s => '<span>' + s + '</span>').join(' · ') + '</div>';
    };

    window.warnIfRouteNeedsStops = function (trip) {
        if (!trip) return;
        const day = tripDate(trip);
        const existing = window.driverDayTrips(trip[DRIVER], day);
        const ids = new Set(existing.map(t => t[0]));
        const extra = (trip[0] && !ids.has(trip[0]) && isOpenTrip(trip)) ? 1 : 0;
        const count = existing.length + extra;
        if (count < 2) return;
        if (extra === 0 && window.routeStopsReady(trip[DRIVER], day)) return;
        if (window.showToast) {
            window.showToast((trip[DRIVER] || 'Driver') + ' has ' + count +
                ' trips on ' + day + '. Set Stop 1, 2, 3.', 'info');
        }
        window.renderRouteStopBanner();
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
