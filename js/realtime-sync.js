// js/realtime-sync.js
// Handles Supabase Realtime subscriptions to keep the UI updated across all devices.

window.initRealtimeSubscriptions = function() {
    if (!window.db) {
        console.warn('[Realtime] Supabase DB not initialized.');
        return;
    }
    
    // Prevent multiple subscriptions
    if (window._realtimeChannel) {
        window.db.removeChannel(window._realtimeChannel);
    }
    
    console.log('[Realtime] Initializing subscriptions...');
    const channel = window.db.channel('public:all');
    
    // 1. TRIPS
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, payload => {
        handleRealtimeTrips(payload);
    });
    
    // 2. RECEIVABLES INVOICES
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'receivables_invoices' }, payload => {
        handleRealtimeReceivables(payload);
    });
    
    // 3. CASH LEDGER
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'cash_ledger' }, payload => {
        handleRealtimeCashLedger(payload);
    });
    
    // 4. FLEET (TRUCKS)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'trucks' }, payload => {
        if (typeof window.loadFleetData === 'function') window.loadFleetData(true); 
    });
    
    // 5. DRIVERS
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, payload => {
        if (typeof window.loadDriversData === 'function') window.loadDriversData(true);
    });
    
    // 6. YARD STOCK (INVENTORY)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'yard_stock' }, payload => {
        if (typeof window.loadYardData === 'function') window.loadYardData(true);
    });
    
    // 7. EXPENSES
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, payload => {
        if (typeof window.loadExpensesData === 'function') window.loadExpensesData(true);
    });
    
    // 8. RELEASES
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'releases' }, payload => {
        if (typeof window.loadReleasesData === 'function') window.loadReleasesData(true);
    });
    
    // 9. RENTALS
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'rentals' }, payload => {
        if (typeof window.loadRentalsData === 'function') window.loadRentalsData(true);
    });
    
    // 10. CALLS
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs' }, payload => {
        if (typeof window.loadCallsData === 'function') window.loadCallsData();
        if (localStorage.getItem('activeSection') === 'calls' && typeof window.renderCallsTable === 'function') {
            window.renderCallsTable();
        }
    });

    // 11. CUSTOMERS
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, payload => {
        if (typeof window.loadCustomersData === 'function') window.loadCustomersData(true);
    });

    // 12. COMPANIES
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, payload => {
        if (typeof window.loadCompaniesData === 'function') window.loadCompaniesData();
    });

    // 13. DELIVERY ADDRESSES
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_addresses' }, payload => {
        if (typeof window.loadDeliveryAddressesData === 'function') window.loadDeliveryAddressesData(true);
    });

    channel.subscribe((status) => {
        console.log('[Realtime] Status:', status);
    });
    
    window._realtimeChannel = channel;
};

// opts.skipRender: only patch the caches and return whether a re-render is needed
//                  (used by the change-polling below to render once for many rows).
function handleRealtimeTrips(payload, opts) {
    const skipRender = !!(opts && opts.skipRender);
    if (!(opts && opts.silent)) console.log('[Realtime] Trips change detected:', payload.eventType);
    
    const applyToCache = (cacheArray) => {
        if (!cacheArray) return false;
        let modified = false;
        
        if (payload.eventType === 'INSERT') {
            const newArr = window.mapTripToArray ? window.mapTripToArray(payload.new) : null;
            if (newArr && payload.new.is_deleted !== true) {
                // Prevent duplicates
                if (!cacheArray.find(t => t[0] === payload.new.trip_id)) {
                    cacheArray.unshift(newArr);
                    modified = true;
                }
            }
        } else if (payload.eventType === 'UPDATE') {
            const isSoftDeleted = payload.new.is_deleted === true;
            const updatedArr = window.mapTripToArray ? window.mapTripToArray(payload.new) : null;
            
            if (updatedArr) {
                const idx = cacheArray.findIndex(t => t[0] === payload.new.trip_id);
                if (isSoftDeleted) {
                    if (idx !== -1) {
                        cacheArray.splice(idx, 1); // Remove from cache
                        modified = true;
                    }
                } else {
                    if (idx !== -1) {
                        cacheArray[idx] = updatedArr; // Update existing
                        modified = true;
                    } else {
                        cacheArray.unshift(updatedArr); // Treat as INSERT (restored)
                        modified = true;
                    }
                }
            }
        }
        return modified;
    };

    let needsRender = false;
    
    const isRentalInvoice = ((payload.new && payload.new.service_mode) || '').toString().toUpperCase() === 'RENTAL INVOICE'
        || ((payload.old && payload.old.service_mode) || '').toString().toUpperCase() === 'RENTAL INVOICE';
    const isYardInvoice = ((payload.new && payload.new.service_mode) || '').toString().toUpperCase() === 'YARD INVOICE'
        || ((payload.old && payload.old.service_mode) || '').toString().toUpperCase() === 'YARD INVOICE';

    if (payload.eventType === 'DELETE') {
        if (window.currentTrips) {
            window.currentTrips = window.currentTrips.filter(t => t[0] !== payload.old.trip_id);
            needsRender = true;
        }
        if (window.allTripsUnfiltered) {
            window.allTripsUnfiltered = window.allTripsUnfiltered.filter(t => t[0] !== payload.old.trip_id);
        }
        if (window.rentalInvoiceTrips) {
            const before = window.rentalInvoiceTrips.length;
            window.rentalInvoiceTrips = window.rentalInvoiceTrips.filter(t => t[0] !== payload.old.trip_id);
            if (window.rentalInvoiceTrips.length !== before) needsRender = true;
        }
        if (window.yardInvoiceTrips) {
            const beforeY = window.yardInvoiceTrips.length;
            window.yardInvoiceTrips = window.yardInvoiceTrips.filter(t => t[0] !== payload.old.trip_id);
            if (window.yardInvoiceTrips.length !== beforeY) needsRender = true;
        }
    } else {
        const mod1 = applyToCache(window.currentTrips);
        const mod2 = applyToCache(window.allTripsUnfiltered);
        if (isRentalInvoice) {
            if (!window.rentalInvoiceTrips) window.rentalInvoiceTrips = [];
            applyToCache(window.rentalInvoiceTrips);
        }
        if (isYardInvoice) {
            if (!window.yardInvoiceTrips) window.yardInvoiceTrips = [];
            applyToCache(window.yardInvoiceTrips);
        }
        needsRender = mod1 || mod2 || isRentalInvoice || isYardInvoice;
    }
    
    if (!needsRender) return false;
    if (skipRender) return true;

    renderAfterTripsChange();
    return true;
}

function renderAfterTripsChange() {
    // Trigger re-renders based on active view
    const activeView = localStorage.getItem('activeSection');
    
    // Don't re-render calendar if user is actively editing a row to prevent losing input focus
    const isEditingCalendar = document.getElementById('edit-row-modal') && document.getElementById('edit-row-modal').style.display !== 'none';
    
    if (activeView === 'calendar' && typeof window.loadTableData === 'function') {
        if (!isEditingCalendar) {
            window.loadTableData(window.currentTrips, true); // Force local render
        }
    } else if (activeView === 'billing-center' && typeof window.renderBillingTable === 'function') {
        window.renderBillingTable();
    } else if (activeView === 'rentals' && typeof window.renderRentalsTable === 'function') {
        window.renderRentalsTable();
    } else if (activeView === 'releases' && typeof window.renderReleasesTable === 'function') {
        window.renderReleasesTable();
    } else if (activeView === 'docs-receipts' && typeof window.loadDocTrips === 'function') {
        window.loadDocTrips(false);
        if (typeof window.syncDriverStartUI === 'function') window.syncDriverStartUI();
    } else if (activeView === 'driver-settlements' && typeof window.renderDriverLog === 'function') {
        window.renderDriverLog();
    } else if (activeView === 'inventory' && typeof window.renderInventorTable === 'function') {
        window.renderInventorTable();
    }
}

function handleRealtimeReceivables(payload) {
    console.log('[Realtime] Receivables change detected:', payload.eventType);
    
    if (!window.receivablesData || !window.receivablesData.invoices) return;
    
    let cache = window.receivablesData.invoices;
    let modified = false;

    if (payload.eventType === 'INSERT') {
        if (!cache.find(i => i.id === payload.new.id) && payload.new.is_deleted !== true) {
            cache.unshift(payload.new);
            modified = true;
        }
    } else if (payload.eventType === 'UPDATE') {
        const isSoftDeleted = payload.new.is_deleted === true;
        const idx = cache.findIndex(i => i.id === payload.new.id);
        
        if (isSoftDeleted) {
            if (idx !== -1) {
                cache.splice(idx, 1);
                modified = true;
            }
        } else {
            if (idx !== -1) {
                cache[idx] = payload.new;
                modified = true;
            } else {
                cache.unshift(payload.new);
                modified = true;
            }
        }
    } else if (payload.eventType === 'DELETE') {
        window.receivablesData.invoices = cache.filter(i => i.id !== payload.old.id);
        modified = true;
    }

    if (modified && localStorage.getItem('activeSection') === 'accounts-rec' && typeof window.renderReceivables === 'function') {
        // Prevent closing payment modal if they are actively paying
        const isPaying = document.getElementById('receivables-payment-modal');
        if (!isPaying) {
            window.renderReceivables();
        }
    }
}

function handleRealtimeCashLedger(payload) {
    console.log('[Realtime] Cash Ledger change detected:', payload.eventType);
    
    const activeView = localStorage.getItem('activeSection');
    if (activeView === 'ledger' && typeof window.renderCashLedger === 'function') {
        // Since cash ledger calculates totals dynamically from DB, we trigger a re-fetch
        // But we debounce it slightly to avoid multiple calls if many changes arrive
        if (window._ledgerRealtimeTimeout) clearTimeout(window._ledgerRealtimeTimeout);
        window._ledgerRealtimeTimeout = setTimeout(() => {
            window.renderCashLedger(); 
        }, 500);
    }
}

// =====================================================================
// CHANGE POLLING FOR TRIPS (Calendar)
// Realtime is OFF in the database for trips, so other PCs' changes used to need a manual
// Refresh. Instead of re-downloading orders, every ~45 s (only while the Calendar is open
// and the tab is visible) we ask ONE small question: "which trips changed since my last
// check?" (trips.updated_at > marker). Usually 0-2 rows come back.
// Requires the column from supabase-add-trips-updated-at.sql. Without it this stays OFF
// and the Calendar behaves exactly as before.
// =====================================================================
(function () {
    const POLL_MS = 45000;          // how often to ask
    const SAFETY_MARGIN_MS = 30000; // overlap so nothing is missed between "marker" and "download"
    const MAX_ROWS = 300;           // per question
    let timer = null;
    let watermark = null;           // ISO string: "I already have every change up to here"
    let disabled = false;           // trips.updated_at does not exist
    let polling = false;
    let pendingRender = false;      // changes arrived while the user was editing an order
    let pendingFullReload = false;  // many changes arrived while editing: full reload once the order closes
    let lastPollAt = 0;
    let burst = 0;

    function disableIfColumnMissing(error) {
        if (error && /updated_at/i.test(error.message || '')) {
            if (!disabled) console.info('[Sync] trips.updated_at not found: automatic change detection is OFF. Run supabase-add-trips-updated-at.sql to enable it.');
            disabled = true;
            if (timer) { clearInterval(timer); timer = null; }
        } else if (error) {
            console.warn('[Sync] change check failed (will retry):', error.message || error);
        }
    }

    // Called right BEFORE the big trips query. Returns a promise with the newest change time
    // in the table ('' if empty, null if unavailable).
    window.tripsDeltaPrepare = function () {
        if (disabled || !window.db) return null;
        return window.db.from('trips')
            .select('updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .then(({ data, error }) => {
                if (error) { disableIfColumnMissing(error); return null; }
                return (data && data[0] && data[0].updated_at) || '';
            })
            .catch(() => null);
    };

    // Called after the Calendar painted a fresh load: remember the marker and start the timer.
    window.tripsDeltaStart = async function (preparePromise) {
        if (disabled) return;
        let wm = null;
        try { wm = preparePromise ? await preparePromise : null; } catch (e) { wm = null; }
        if (wm === null) return; // unknown: keep the previous marker (if any)
        watermark = wm ? new Date(Date.parse(wm) - SAFETY_MARGIN_MS).toISOString() : new Date(0).toISOString();
        burst = 0;
        window._tripsDeltaActive = true;
        if (!timer) timer = setInterval(() => tick(), POLL_MS);
        if (!window._tripsDeltaVisibilityBound) {
            window._tripsDeltaVisibilityBound = true;
            document.addEventListener('visibilitychange', () => {
                // Coming back to the tab (or waking the computer): catch up right away
                if (!document.hidden && Date.now() - lastPollAt > 20000) tick();
            });
        }
    };

    // Used when opening the Calendar view so it doesn't wait for the next timer tick.
    window.tripsDeltaPollNow = function () {
        if (Date.now() - lastPollAt > 15000) tick();
    };

    function renderOrDefer() {
        if (window.editingTripDbId) { pendingRender = true; return; } // don't disturb an open order
        pendingRender = false;
        renderAfterTripsChange();
    }

    function applyRows(rows) {
        let needsRender = false;
        let openOrderChanged = false;
        rows.forEach(row => {
            if (!row || !row.trip_id) return;
            const versions = window._tripVersions;
            const known = versions ? versions.get(row.trip_id) : null;
            const sameVersion = known && row.updated_at && new Date(known).getTime() === new Date(row.updated_at).getTime();
            if (versions && row.updated_at) versions.set(row.trip_id, row.updated_at);
            if (sameVersion) return; // we already have exactly this version
            if (window.editingTripDbId && row.trip_id === window.editingTripDbId) openOrderChanged = true;
            const changed = handleRealtimeTrips({ eventType: 'UPDATE', new: row, old: {} }, { skipRender: true, silent: true });
            needsRender = needsRender || changed;
        });
        if (openOrderChanged && typeof window.showCalendarNotice === 'function') {
            window.showCalendarNotice('Otra persona modificó la orden que tienes abierta. Si guardas, se te avisará antes de sobrescribir sus cambios.', 12000);
        }
        if (needsRender) renderOrDefer();
        return needsRender;
    }

    async function tick() {
        if (!window.editingTripDbId) {
            if (pendingFullReload) {
                pendingFullReload = false;
                pendingRender = false;
                if (typeof window.loadTableData === 'function') window.loadTableData(null, true);
                return;
            }
            if (pendingRender) { pendingRender = false; renderAfterTripsChange(); }
        }
        if (disabled || polling || !watermark || !window.db) return;
        if (document.hidden) return;
        if (localStorage.getItem('activeSection') !== 'calendar') return;
        if (window._calendarLoading) return;
        polling = true;
        try {
            const { data, error } = await window.db.from('trips')
                .select('*')
                .gt('updated_at', watermark)
                .order('updated_at', { ascending: true })
                .limit(MAX_ROWS);
            if (error) { disableIfColumnMissing(error); return; }
            const rows = data || [];
            lastPollAt = Date.now();
            if (rows.length) {
                watermark = rows[rows.length - 1].updated_at || watermark;
                applyRows(rows);
            }
            if (typeof window.markCalendarSynced === 'function') window.markCalendarSynced();

            if (rows.length >= MAX_ROWS) {
                // Many changes (e.g. the computer slept for a long time): after a few rounds a full reload is cheaper
                burst++;
                if (burst >= 3) {
                    burst = 0;
                    if (window.editingTripDbId) {
                        // An order is open: don't rebuild the table behind it. Reload when it closes.
                        pendingFullReload = true;
                    } else if (typeof window.loadTableData === 'function') {
                        window.loadTableData(null, true);
                    }
                } else {
                    setTimeout(() => tick(), 1000);
                }
            } else {
                burst = 0;
            }
        } catch (e) {
            console.warn('[Sync] change check error:', e);
        } finally {
            polling = false;
        }
    }
})();
