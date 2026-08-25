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

function handleRealtimeTrips(payload) {
    console.log('[Realtime] Trips change detected:', payload.eventType);
    
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
    
    if (payload.eventType === 'DELETE') {
        if (window.currentTrips) {
            window.currentTrips = window.currentTrips.filter(t => t[0] !== payload.old.trip_id);
            needsRender = true;
        }
        if (window.allTripsUnfiltered) {
            window.allTripsUnfiltered = window.allTripsUnfiltered.filter(t => t[0] !== payload.old.trip_id);
        }
    } else {
        const mod1 = applyToCache(window.currentTrips);
        const mod2 = applyToCache(window.allTripsUnfiltered);
        needsRender = mod1 || mod2;
    }
    
    if (!needsRender) return;

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
    } else if (activeView === 'docs-receipts' && typeof window.renderTripPhotos === 'function') {
        window.renderTripPhotos();
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
