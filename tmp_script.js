
        // NOTE: If you experience CORS errors (Unsafe attempt to load script), 
        // please run this application using a local server (e.g., Live Server in VS Code, 
        // or 'python -m http.server' in your terminal) instead of opening the file directly.
        
        // Supabase Instance is already 'db' from supabase-client.js
        // No redundant initialization needed here.

        // --- REALTIME SUBSCRIPTION (Miami -> Argentina Sync) ---
        (function setupRealtime() {
            if (!db) return;
            
            const channels = ['trips', 'releases', 'expenses', 'fleet'];
            channels.forEach(table => {
                db.channel(`${table}_changes`)
                    .on('postgres_changes', { event: '*', schema: 'public', table: table }, async payload => {
                        console.log(`Realtime update on ${table}:`, payload.eventType);
                        
                        // Intelligent refresh:
                        if (table === 'trips') await loadTableData();
                        if (table === 'releases') await loadReleasesData();
                        if (table === 'expenses') await loadExpensesData();
                        if (table === 'fleet') await loadFleetData();
                    })
                    .subscribe();
            });
            console.log("Supabase Realtime channels active.");
        })();

        // --- TRIP DATA MAPPING HELPERS ---

        // --- TRIP DATA MAPPING HELPERS ---
        function mapTripToArray(t) {
            // New Unified Structure (v4)
            return [
                t.trip_id || '---', t.date || '---', t.size || '---', t.n_cont || '---', t.release_no || '---',
                t.order_no || '---', t.city || '---', t.pickup_address || '---', t.delivery_place || '---',
                t.doors_direction || '---', t.miles || 0, t.customer || '---',
                t.yard_services || '---', t.yard_rate || 0, t.date_out || '---',
                t.company || '---', t.driver || '---', t.trans_pay || 0, t.type_payment || '---',
                t.sales_price || 0, t.collect_payment || '---', t.amount || 0, t.phone_no || '---',
                t.paid_driver || 0, t.income_dis_fee || 0, t.note || '---', // 0-25
                t.st_yard || 'PEND', t.st_rent || 'PEND', t.st_rate || 'PEND', t.st_sales || 'PEND', t.st_amount || (t.paid ? 'PAID' : 'PENDING'), // 26-30
                (t.pending_balance || 0).toFixed(2), // 31
                t.email || '---', // 32
                t.truck_unit || '---', t.trailer_unit || '---', // 33, 34
                t.final_driver_pay || 0, // 35
                t.yard_rate_paid || false, // 36
                t.status || 'PENDING', // 37
                t.payout_status || 'PENDING', // 38 (New)
                t.service_mode || '---', t.monthly_rate || 0, t.start_date_rent || '---', t.next_due || '---', // 39-42
                t.price_per_day || 0 // 43
            ];
        }

        function mapArrayToTrip(row) {
            return {
                trip_id: row[0],
                date: row[1] === '---' ? null : row[1],
                size: row[2],
                n_cont: row[3],
                release_no: row[4],
                order_no: row[5],
                city: row[6],
                pickup_address: row[7],
                delivery_place: row[8],
                doors_direction: row[9],
                miles: parseFloat(row[10]) || 0,
                customer: row[11],
                yard_services: row[12],
                yard_rate: parseFloat(row[13]) || 0,
                date_out: row[14] === '---' ? null : row[14],
                company: row[15],
                driver: row[16],
                trans_pay: parseFloat(row[17]) || 0,
                type_payment: row[18],
                sales_price: parseFloat(row[19]) || 0,
                collect_payment: row[20],
                amount: parseFloat(row[21]) || 0,
                phone_no: row[22],
                paid_driver: parseFloat(row[23]) || 0,
                income_dis_fee: parseFloat(row[24]) || 0,
                note: row[25],
                st_yard: row[26],
                st_rent: row[27],
                st_rate: row[28],
                st_sales: row[29],
                st_amount: row[30],
                paid: row[30] === 'PAID',
                pending_balance: row[31] ? parseFloat(row[31].toString().replace('$', '').replace(/,/g, '')) || 0 : 0,
                email: row[32],
                truck_unit: row[33] === '---' ? null : row[33],
                trailer_unit: row[34] === '---' ? null : row[34],
                final_driver_pay: parseFloat(row[35]) || 0,
                yard_rate_paid: row[36] === true || row[36] === 'true',
                status: row[37] || 'PENDING',
                payout_status: row[38] || 'PENDING',
                service_mode: row[39],
                monthly_rate: parseFloat(row[40]) || 0,
                start_date_rent: row[41] === '---' ? null : row[41],
                next_due: row[42] === '---' ? null : row[42],
                price_per_day: parseFloat(row[43]) || 0
            };
        }

        function calculateFinalPay(company, grossPay) {
            if (company === 'RP TULIPAN' || company === 'JR SUPER CRAME') {
                return grossPay * 0.3;
            }
            return grossPay;
        }

        // --- UI STATE ---
        let currentTrips = []; // Cache from Supabase
        let currentReleases = []; // Cache from Supabase
        let currentExpenses = []; // Cache from Supabase
        let currentFleet = []; // Cache from Supabase
        let editingIndex = null;

        // --- FLEET DATA MAPPERS ---
        function mapFleetToUI(f) {
            return {
                id: f.unit_id,
                type: f.type,
                num: f.unit_number,
                vin: f.vin,
                plate: f.plate,
                year: f.year,
                miles: f.miles,
                lastDate: f.last_service_date || '',
                lastMiles: f.last_service_miles || 0,
                dueDate: f.next_service_due_date || '',
                dueMiles: f.next_service_due_miles || 0,
                status: f.status
            };
        }

        function mapUIToFleet(u) {
            return {
                unit_id: u.id,
                type: u.type,
                unit_number: u.num,
                vin: u.vin,
                plate: u.plate,
                year: parseInt(u.year) || null,
                miles: parseInt(u.miles) || 0,
                last_service_date: u.lastDate === '' ? null : u.lastDate,
                last_service_miles: parseInt(u.lastMiles) || 0,
                next_service_due_date: u.dueDate === '' ? null : u.dueDate,
                next_service_due_miles: parseInt(u.dueMiles) || 0,
                status: u.status
            };
        }

        // --- EXPENSE DATA MAPPERS ---
        function mapExpenseToArray(e) {
            return [
                e.date || '---', e.category || '---', e.description || '---',
                `$${(e.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, e.note || '---',
                e.id
            ];
        }

        function mapArrayToExpense(row) {
            return {
                date: (row[0] === '---' || !row[0]) ? null : row[0],
                category: row[1],
                description: row[2],
                amount: parseFloat(row[3].replace('$', '').replace(/,/g, '')) || 0,
                note: row[4]
            };
        }

        // --- RELEASE DATA MAPPERS ---
        function mapReleaseToArray(r) {
            return [
                r.release_no, r.date, r.type || 'EMPTY', r.condition || 'USED', r.depot || '---', r.depot_address || '---',
                r.city || '---', r.qty_20 || 0, r.price_20 || 0, r.qty_40 || 0, r.price_40 || 0,
                r.qty_45 || 0, r.price_45 || 0, r.seller || '---', r.total_stock || 0, r.id
            ];
        }

        function mapArrayToRelease(row) {
            return {
                release_no: row[0],
                date: row[1] === '---' ? null : row[1],
                type: row[2],
                condition: row[3],
                depot: row[4],
                depot_address: row[5],
                city: row[6],
                qty_20: parseInt(row[7]) || 0,
                price_20: parseFloat(row[8]) || 0,
                qty_40: parseInt(row[9]) || 0,
                price_40: parseFloat(row[10]) || 0,
                qty_45: parseInt(row[11]) || 0,
                price_45: parseFloat(row[12]) || 0,
                seller: row[13],
                total_stock: (parseInt(row[7]) || 0) + (parseInt(row[9]) || 0) + (parseInt(row[11]) || 0)
            };
        }

        const header = document.getElementById('header-nav');
        const heroView = document.getElementById('hero-view');
        const calendarView = document.getElementById('calendar-view');
        const docsView = document.getElementById('docs-view');
        const tableBody = document.getElementById('table-body');

        // --- PERMANENT DATA MIGRATION (One-time on startup) ---
        (function () {
            const dataKey = 'logisticsTableData';
            const rawData = localStorage.getItem(dataKey);
            if (rawData) {
                try {
                    let rows = JSON.parse(rawData);
                    let migrationCount = 0;
                    const migratedRows = rows.map(rowData => {
                        // If it's the old 45-field format, normalize it to 43 fields
                        if (rowData && rowData.length === 45) {
                            rowData.splice(33, 2); // Remove old STORAGE (33) and IN-OUT (34)
                            migrationCount++;
                        }
                        return rowData;
                    });

                    if (migrationCount > 0) {
                        localStorage.setItem(dataKey, JSON.stringify(migratedRows));
                        console.log(`Successfully migrated ${migrationCount} legacy records to the new 43-field structure.`);
                    }
                } catch (e) {
                    console.error('Migration failed:', e);
                }
            }

            // --- RELEASES MIGRATION (Structural Upgrade to Pricing per Size) ---
            const relKey = 'releasesTableData';
            const relRaw = localStorage.getItem(relKey);
            if (relRaw) {
                try {
                    let relRows = JSON.parse(relRaw);
                    // Standard upgrade: 11 columns -> 13 columns
                    if (relRows.length > 0 && relRows[0].length === 11) {
                        relRows = relRows.map(r => {
                            // Old structure: [0:NO, 1:DATE, 2:TYPE, 3:DEPOT, 4:CITY, 5:Q20, 6:Q40, 7:Q45, 8:PRICE, 9:SELLER, 10:TOTAL]
                            const newRow = [
                                r[0], r[1], r[2], r[3], r[4],
                                r[5], r[8], // 20 Qty, 20 Price
                                r[6], r[8], // 40 Qty, 40 Price
                                r[7], r[8], // 45 Qty, 45 Price
                                r[9], r[10] // Seller, Total
                            ];
                            return newRow;
                        });
                        localStorage.setItem(relKey, JSON.stringify(relRows));
                        console.log('Migrated Release structure to support per-size pricing.');
                    }
                } catch (e) { }
            }

            // --- V2 REMOVE PAYMENT STATUS (INDEX 12) ---
            try {
                const dataKey = 'logisticsTableData';
                const rawData = localStorage.getItem(dataKey);
                const migratedV2 = localStorage.getItem('v2_paystatus_removed_b'); // Safety flag
                if (rawData && !migratedV2) {
                    let rows = JSON.parse(rawData);
                    if (rows.length > 0 && rows[0].length >= 35) {
                        rows = rows.map(r => {
                            if (r.length >= 35) r.splice(12, 1); // Delete PAYMENT STATUS
                            return r;
                        });
                        localStorage.setItem(dataKey, JSON.stringify(rows));
                        localStorage.setItem('v2_paystatus_removed_b', 'true');
                        console.log('Successfully removed PAYMENT STATUS column and shifted indices.');
                    }
                }
            } catch (e) { }
        })();

        // Robust mobile menu toggle
        window.toggleMobileMenu = function (e) {
            if (e) e.stopPropagation();
            const btn = document.getElementById('hamburger-menu');
            const menu = document.getElementById('nav-actions-container');
            if (btn && menu) {
                btn.classList.toggle('active');
                menu.classList.toggle('active');
                console.log("Mobile menu toggled");
            }
        };

        // Event handled by onclick in HTML
        window.closeMenu = function () {
            const btn = document.getElementById('hamburger-menu');
            const menu = document.getElementById('nav-actions-container');
            if (btn && menu) {
                btn.classList.remove('active');
                menu.classList.remove('active');
            }
        };

        function showView(view) {
            console.log("Navigating to:", view);
            sessionStorage.setItem('activeSection', view);

            // 1. Reset Scroll IMMEDIATELY
            window.scrollTo(0, 0);

            // 2. Hide ALL sections with strict display:none and class hidden
            const sections = document.querySelectorAll('.view-section');
            sections.forEach(v => {
                v.classList.add('hidden');
                v.style.display = 'none';
            });

            // 3. Identification of target section
            const targetId = view.endsWith('-view') ? view : view + '-view';
            const target = document.getElementById(targetId);

            if (target) {
                target.classList.remove('hidden');
                // Use block for most sections, or flex if needed by component
                target.style.display = (view === 'hero') ? 'block' : 'block';

                // Special case for navbar styling
                if (view === 'hero') {
                    header.classList.remove('navbar-fixed-solid');
                } else {
                    header.classList.add('navbar-fixed-solid');
                }

                // 4. Trigger specific loads
                if (view === 'docs') {
                    if (window.loadDocTrips) window.loadDocTrips();
                } else if (view === 'reports') {
                    if (window.renderDriverLog) window.renderDriverLog();
                    if (window.fetchHistory) window.fetchHistory();
                } else if (view === 'calendar') {
                    if (window.loadTableData) window.loadTableData();
                    if (window.updateFleetSelectors) window.updateFleetSelectors();
                    if (window.loadReleasesData) window.loadReleasesData();
                } else if (view === 'fleet') {
                    if (window.loadFleetData) window.loadFleetData();
                } else if (view === 'profit-report') {
                    if (window.renderProfitReport) window.renderProfitReport();
                }
            } else {
                console.warn("View not found:", targetId);
            }
        }

        function saveTableData() {
            const logisticsBody = document.getElementById('table-body');
            if (!logisticsBody) return;
            const rows = [];
            const trs = logisticsBody.querySelectorAll('tr');
            trs.forEach(tr => {
                const rowData = Array.from(tr.querySelectorAll('td')).map(td => td.textContent);
                rows.push(rowData);
            });
            localStorage.setItem('logisticsTableData', JSON.stringify(rows));
        }
        function toggleYardRate() {
            const chkYard = document.getElementById('in-flag1');
            const yr = document.getElementById('yard-rate-group');
            const doGroup = document.getElementById('date-out-group');
            
            if (chkYard) {
                const isChecked = chkYard.checked;
                if (yr) yr.style.display = isChecked ? 'flex' : 'none';
                if (doGroup) doGroup.style.display = isChecked ? 'flex' : 'none';
                
                if (!isChecked) {
                    if (document.getElementById('in-yardrate')) document.getElementById('in-yardrate').value = 0;
                }
            }
        }
        window.toggleYardRate = toggleYardRate;

        // --- ADVANCED FILTERING LOGIC ---
        function populateFilterPickers() {
            if (currentTrips.length === 0) return;
            const rows = currentTrips;

            // Indices: 6:City, 2:Size, 11:Customer, 16:Driver, 15:Company
            const filters = {
                'f-city': 6,
                'f-size': 2,
                'f-customer': 11,
                'f-driver': 16,
                'f-company': 15
            };

            for (let id in filters) {
                const select = document.getElementById(id);
                if (!select) continue;
                const columnIdx = filters[id];

                // Get unique, non-empty, non-dashed values
                let uniqueValues = [...new Set(rows.map(row => row[columnIdx]))]
                    .filter(val => val && val !== '---' && val !== '')
                    .sort();

                // For City filter specifically, show ALL available cities from the form list
                if (id === 'f-city') {
                    uniqueValues = [
                        "MIAMI", "TAMPA", "JACKSONVILLE", "SAVANNAH", "TITUSVILLE",
                        "MASCOTTE", "ORLANDO", "ATLANTA", "CHARLESTON", "NEWARK",
                        "SUMMERVILLE", "BALTIMORE"
                    ].sort();
                } else if (id === 'f-customer') {
                    uniqueValues = [
                        "ANTONIO RENT", "RICHARD HAYNES", "MARK MORRINSON", "KEMOY",
                        "GLOBAL CONTAINER & CHASSIS", "PROSTAR GROUP CONTAINER",
                        "MAREX ROAD SERVICES", "ZUM SHIPPING"
                    ].sort();
                } else if (id === 'f-driver') {
                    uniqueValues = [
                        "LUIS GARRIDO", "ROBERT CORTEZ", "MILAY MIRANDA", 
                        "JORGE A RAMIREZ", "JOSE", "ANTONIO R CUBA", "TRAVIS JOSEY"
                    ].sort();
                }

                // Keep the "All" option
                const firstOption = select.options[0];
                select.innerHTML = '';
                select.appendChild(firstOption);

                uniqueValues.forEach(val => {
                    // Only show DONE and PENDING operational statuses
                    if (id === 'f-status' && val !== 'DONE' && val !== 'PENDING') return;

                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    select.appendChild(opt);
                });
            }
        }
        function applyAdvancedFilters() {
            const filters = {
                city: document.getElementById('f-city')?.value.toLowerCase() || '',
                size: document.getElementById('f-size')?.value.toLowerCase() || '',
                customer: document.getElementById('f-customer')?.value.toLowerCase() || '',
                driver: document.getElementById('f-driver')?.value.toLowerCase() || '',
                company: document.getElementById('f-company')?.value.toLowerCase() || '',
                status: document.getElementById('f-status')?.value.toLowerCase() || '',
                ncont: document.getElementById('f-ncont')?.value.toLowerCase() || '',
                order: document.getElementById('f-order')?.value.toLowerCase() || '',
                release: document.getElementById('f-release')?.value.toLowerCase() || '',
                phone: document.getElementById('f-phone')?.value.toLowerCase() || '',
                fromDate: document.getElementById('f-from-date')?.value || '',
                toDate: document.getElementById('f-to-date')?.value || ''
            };

            const rows = document.querySelectorAll('#table-body tr');
            rows.forEach((tr, rIdx) => {
                const cells = tr.cells;
                if (cells.length < 20) return; 

                // UPDATED INDICES FOR New 27-Column Structure (Display Grid)
                const valID = (cells[0].textContent || '').toLowerCase();
                const valDate = (cells[1].textContent || '');
                const valSize = (cells[2].textContent || '').toLowerCase();
                const valNcont = (cells[3].textContent || '').toLowerCase();
                const valRelease = (cells[4].textContent || '').toLowerCase();
                const valOrder = (cells[5].textContent || '').toLowerCase();
                const valCity = (cells[6].textContent || '').toLowerCase();
                const valDriver = (cells[17].textContent || '').toLowerCase(); // Shifted: 16 -> 17
                const valPhone = (cells[23].textContent || '').toLowerCase(); // Shifted: 22 -> 23
                
                const matchCity = !filters.city || valCity === filters.city.toLowerCase();
                const matchSize = !filters.size || valSize.includes(filters.size);
                const matchDriver = !filters.driver || valDriver === filters.driver.toLowerCase();
                
                const matchNcont = !filters.ncont || valNcont.includes(filters.ncont);
                const matchOrder = !filters.order || valOrder.includes(filters.order);
                const matchRelease = !filters.release || valRelease.includes(filters.release);
                const matchPhone = !filters.phone || valPhone.includes(filters.phone);
                
                const matchDate = (!filters.fromDate || valDate >= filters.fromDate) && 
                                  (!filters.toDate || valDate <= filters.toDate);

                if (matchCity && matchSize && matchDriver &&
                    matchNcont && matchOrder && matchRelease && matchPhone && matchDate) {
                    tr.style.display = '';
                } else {
                    tr.style.display = 'none';
                }
            });
        }


        function resetAdvancedFilters() {
            const inputs = document.querySelectorAll('.advanced-filter-panel select, .advanced-filter-panel input');
            inputs.forEach(el => el.value = '');
            if (window.applyAdvancedFilters) applyAdvancedFilters();
        }
        window.resetAdvancedFilters = resetAdvancedFilters;

        function resetForm() {
            editingIndex = null;
            const fields = [
                'in-id', 'in-date', 'in-size', 'in-ncont', 'in-release', 'in-order', 'in-city', 'in-pickup',
                'in-delivery', 'in-doors', 'in-miles', 'in-customer',
                'in-yard', 'in-yardrate', 'in-dateout', 'in-company', 'in-driver',
                'in-rate', 'in-paytype', 'in-sales', 'in-amount', 'in-phone',
                'in-paiddriver', 'in-income', 'in-note',
                'in-mode', 'in-mrate', 'in-sdaterent', 'in-nextdue', 'in-email',
                'in-flag1', 'in-flag2', 'in-flag3'
            ];
            fields.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') el.checked = false;
                    else el.value = (id === 'in-miles' || id.includes('rate') || id === 'in-amount') ? '0' : '';
                }
            });

            const checks = ['in-yardpaid', 'in-rentpaid', 'in-ratepaid', 'in-salespaid', 'in-amountpaid'];
            checks.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.checked = false;
            });

            const btn = document.querySelector('.btn-add-sidebar');
            if (btn) {
                btn.textContent = 'Archive Order';
                btn.classList.remove('btn-update');
            }
            initNewTripId();
        }

        // --- IMMEDIATE SYNC FOR EDIT MODE ---
        async function syncImmediate(fieldName, value) {
            if (editingIndex === null) return;
            const tripId = document.getElementById('in-id').value;
            if (!tripId) return;

            const updateData = {};
            updateData[fieldName] = value;
            if (fieldName === 'st_amount') updateData.paid = (value === 'PAID');

            try {
                console.log(`Syncing ${fieldName} -> ${value} for ${tripId}`);
                await updateTrip(tripId, updateData);
                // We don't necessarily need to reload everything if we just want UI feedback,
                // but loadTableData ensures consistent state across the app.
                await loadTableData(); 
            } catch (err) {
                console.error("Immediate sync failed:", err);
            }
        }
        let isSaving = false;
        async function addRow(shouldFinalize = false) {
            if (isSaving) return;

            const btn = document.querySelector('.sidebar-form .btn-add-sidebar');
            const originalText = btn ? btn.textContent : 'Archive Order';
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Saving... Wait';
                btn.style.opacity = '0.7';
            }
            isSaving = true;

            if (editingIndex === null) {
                const nextId = 'TRIP-' + Date.now().toString().slice(-6);
                document.getElementById('in-id').value = nextId;
                const ordInput = document.getElementById('in-order');
                if (!ordInput.value || ordInput.value.trim() === '') {
                    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                    let ordSuffix = '';
                    for (let i = 0; i < 4; i++) ordSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
                    ordInput.value = 'ORD-' + ordSuffix;
                }
            }

            const fields = [
                'in-id', 'in-date', 'in-size', 'in-ncont', 'in-release', 'in-order', 'in-city', 'in-pickup',
                'in-delivery', 'in-doors', 'in-miles', 'in-customer',
                'in-yard', 'in-yardrate', 'in-dateout', 'in-company', 'in-driver',
                'in-rate', 'in-paytype', 'in-sales', 'in-amount', 'in-phone',
                'in-paiddriver', 'in-income', 'in-note'
                // indices 0-25: removed legacy 'in-mode','in-mrate','in-sdaterent','in-nextdue'
            ];

            let currentlyFinalized = false;
            if (editingIndex !== null) {
                const existingTrip = currentTrips[editingIndex];
                currentlyFinalized = (existingTrip && existingTrip.status === 'FINALIZED');
            }

            const selectedRelease = document.getElementById('in-release').value;
            const selectedSize = document.getElementById('in-size').value;
            const selectedRelType = document.getElementById('in-rel-type').value;
            const selectedRelCond = document.getElementById('in-rel-condition').value;

            // PREPARE INVENTORY DEDUCTION (If Finalizing for first time)
            if (shouldFinalize && !currentlyFinalized && selectedRelease && selectedRelease !== '---') {
                if (!selectedRelType || !selectedRelCond) {
                    alert("ERROR: Para Finalizar una orden con Release, debes seleccionar TIPO y CONDICIÓN.");
                    isSaving = false; if (btn) { btn.disabled = false; btn.textContent = originalText; btn.style.opacity = '1'; }
                    return;
                }
                const matchingRows = currentReleases.filter(r => r[0] === selectedRelease && r[2] === selectedRelType && r[3] === selectedRelCond);
                if (matchingRows.length > 0) {
                    let dbField = '', stockIdx = -1;
                    if (selectedSize.startsWith("20")) { stockIdx = 7; dbField = 'qty_20'; }
                    else if (selectedSize.startsWith("40")) { stockIdx = 9; dbField = 'qty_40'; }
                    else if (selectedSize.startsWith("45")) { stockIdx = 11; dbField = 'qty_45'; }

                    if (stockIdx !== -1) {
                        const totalStockFound = matchingRows.reduce((sum, r) => sum + (parseInt(r[stockIdx]) || 0), 0);
                        if (totalStockFound <= 0) {
                            alert("Sin stock disponible.");
                            isSaving = false; if (btn) { btn.disabled = false; btn.textContent = originalText; btn.style.opacity = '1'; }
                            return;
                        }
                        window.calculatedNewStock = (parseInt(matchingRows[0][stockIdx]) || 0) - 1;
                        window.stockUpdateField = dbField;
                        window.targetReleaseId = matchingRows[0][15];
                    }
                }
            }

            const rowData = fields.map(id => {
                if (id === 'in-yard') {
                    const chk = document.getElementById('in-flag1');
                    return (chk && chk.checked) ? 'YES' : 'NO';
                }
                const el = document.getElementById(id);
                return (el && el.value !== '') ? el.value : '---';
            });
            const finalStatus = (shouldFinalize || currentlyFinalized) ? 'FINALIZED' : 'PENDING';

            const stYard = document.getElementById('in-yardpaid') ? (document.getElementById('in-yardpaid').checked ? 'PAID' : 'PEND') : 'PEND';
            const stRent = 'PEND';
            const stRate = document.getElementById('in-ratepaid') ? (document.getElementById('in-ratepaid').checked ? 'PAID' : 'PEND') : 'PEND';
            const stSales = document.getElementById('in-salespaid') ? (document.getElementById('in-salespaid').checked ? 'PAID' : 'PEND') : 'PEND';
            let stAmount = document.getElementById('in-amountpaid') ? (document.getElementById('in-amountpaid').checked ? 'PAID' : (shouldFinalize ? 'PAID' : 'PENDING')) : (shouldFinalize ? 'PAID' : 'PENDING');

            rowData.splice(26, 0, stYard, stRent, stRate, stSales, stAmount); // indices 26-30

            let pending = 0;
            if (stYard === 'PEND') pending += parseFloat(document.getElementById('in-yardrate')?.value || 0);
            if (stRate === 'PEND') pending += parseFloat(document.getElementById('in-rate')?.value || 0);
            if (stSales === 'PEND') pending += parseFloat(document.getElementById('in-sales')?.value || 0);
            if (stAmount === 'PENDING') pending += parseFloat(document.getElementById('in-amount')?.value || 0);

            rowData.push(pending.toFixed(2)); // 31
            rowData.push(document.getElementById('in-email').value || '---'); // 32
            rowData.push('---', '---'); // 33, 34
            rowData.push(calculateFinalPay(document.getElementById('in-company').value, parseFloat(document.getElementById('in-paiddriver').value) || 0)); // 35
            rowData.push(stYard === 'PAID'); // 36
            rowData.push(finalStatus); // 37
            rowData.push('PENDING'); // 38: payout_status default
            rowData.push(document.getElementById('in-mode').value || 'SALE'); // 39: service_mode
            rowData.push(parseFloat(document.getElementById('in-mrate')?.value || 0)); // 40: monthly_rate
            rowData.push(document.getElementById('in-sdaterent')?.value || '---'); // 41: start_date_rent
            rowData.push(document.getElementById('in-nextdue')?.value || '---'); // 42: next_due
            rowData.push(parseFloat(document.getElementById('in-priceperday')?.value || 0)); // 43: price_per_day

            const tripObj = mapArrayToTrip(rowData);

            try {
                if (editingIndex !== null) {
                    const { error } = await db.from('trips').update(tripObj).eq('trip_id', rowData[0]);
                    if (error) throw error;
                    editingIndex = null;
                } else {
                    const { error } = await db.from('trips').insert([tripObj]);
                    if (error) throw error;
                }

                // If deductions were prepped, apply now
                if (shouldFinalize && !currentlyFinalized && window.stockUpdateField) {
                    const upObj = {}; upObj[window.stockUpdateField] = window.calculatedNewStock;
                    await db.from('releases').update(upObj).eq('id', window.targetReleaseId);
                    delete window.stockUpdateField; delete window.calculatedNewStock; delete window.targetReleaseId;
                }

                alert(shouldFinalize ? '¡ORDEN FINALIZADA E INVENTARIO DESCONTADO!' : '¡ORDEN ARCHIVADA CORRECTAMENTE!');
                resetForm();
                await loadTableData();
                if (window.loadReleasesData) window.loadReleasesData();
            } catch (err) {
                console.error("Save Error:", err);
                alert("DATABASE ERROR: " + err.message);
            } finally {
                isSaving = false;
                if (btn) { btn.disabled = false; btn.textContent = originalText; btn.style.opacity = '1'; }
            }
        }

        window.updateReleaseDatalist = function() {
            const releaseList = document.getElementById('release-list');
            if (currentReleases.length > 0 && releaseList) {
                // Show ALL entered releases as suggestions, as requested
                releaseList.innerHTML = '';
                currentReleases.forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r[0]; // Release # is index 0
                    releaseList.appendChild(opt);
                });
            }
        }

        // --- DYNAMIC SIZE FILTER BASED ON RELEASE STOCK ---
        const inReleaseInput = document.getElementById('in-release');
        const inSizeSelect = document.getElementById('in-size');

        if (inReleaseInput && inSizeSelect) {
            const validateStockUI = () => {
                const selectedRel = inReleaseInput.value;
                const selectedSize = inSizeSelect.value;
                const selectedRelType = document.getElementById('in-rel-type').value;
                const selectedRelCond = document.getElementById('in-rel-condition').value;
                const btn = document.querySelector('.btn-add-sidebar');
                
                if (!selectedRel || selectedRel === '---' || !selectedSize || !selectedRelType || !selectedRelCond) {
                    if (btn && btn.textContent !== 'Saving... Wait') {
                        btn.disabled = false;
                        btn.style.opacity = '1';
                        btn.textContent = editingIndex !== null ? 'Update Trip' : 'Archive Order';
                    }
                    return;
                }

                if (currentReleases.length === 0) return;
                const matchingRows = currentReleases.filter(r => r[0] === selectedRel && r[2] === selectedRelType && r[3] === selectedRelCond);

                if (matchingRows.length > 0) {
                    let totalStock = 0;
                    let sizeBase = '';
                    let idx = -1;
                    if (selectedSize.startsWith("20")) { idx = 7; sizeBase = "20'"; }
                    else if (selectedSize.startsWith("40")) { idx = 9; sizeBase = "40'"; }
                    else if (selectedSize.startsWith("45")) { idx = 11; sizeBase = "45'"; }

                    if (idx !== -1) {
                        totalStock = matchingRows.reduce((sum, r) => sum + (parseInt(r[idx]) || 0), 0);
                    }

                    if (totalStock <= 0) {
                        btn.disabled = true;
                        btn.style.opacity = '0.5';
                        btn.textContent = `Sin stock disponible para contenedores de ${sizeBase}.`;
                        btn.style.background = '#64748b'; // Gray out
                    } else {
                        btn.disabled = false;
                        btn.style.opacity = '1';
                        btn.textContent = editingIndex !== null ? 'Update Trip' : 'Archive Order';
                        btn.style.background = editingIndex !== null ? '#0f172a' : '#b91c1c';
                    }
                }
            };

            [inReleaseInput, inSizeSelect, document.getElementById('in-rel-type'), document.getElementById('in-rel-condition')].forEach(el => {
                if (el) el.addEventListener('change', validateStockUI);
            });

            inReleaseInput.addEventListener('change', () => {
                const selectedRel = inReleaseInput.value;
                const selectedRelType = document.getElementById('in-rel-type').value;
                const selectedRelCond = document.getElementById('in-rel-condition').value;
                
                if (currentReleases.length === 0) return;
                const relData = currentReleases.find(r => r[0] === selectedRel && r[2] === selectedRelType && r[3] === selectedRelCond);

                if (relData) {
                    const stock20 = parseInt(relData[7]) || 0;
                    const stock40 = parseInt(relData[9]) || 0;
                    const stock45 = parseInt(relData[11]) || 0;

                    // Filter options based on stock
                    Array.from(inSizeSelect.options).forEach(opt => {
                        const val = opt.value;
                        if (!val) return; // Leave "Select Size"

                        let shouldShow = true;
                        if (val.startsWith("20")) shouldShow = stock20 > 0;
                        else if (val.startsWith("40")) shouldShow = stock40 > 0;
                        else if (val.startsWith("45")) shouldShow = stock45 > 0;

                        opt.disabled = !shouldShow;
                        opt.style.display = shouldShow ? 'block' : 'none';
                    });
                } else {
                    // Reset if no release found or clear
                    Array.from(inSizeSelect.options).forEach(opt => {
                        opt.disabled = false;
                        opt.style.display = 'block';
                    });
                }
            });
        }

        function updateAddressDatalist() {
            const addressList = document.getElementById('address-list');
            if (currentTrips.length > 0 && addressList) {
                const rows = currentTrips;
                const storedValues = rows.map(r => r[7]).filter(val => val && val !== '---');
                const existingOptions = Array.from(addressList.options).map(opt => opt.value);
                const uniqueNewOnes = [...new Set(storedValues)].filter(val => !existingOptions.includes(val));
                uniqueNewOnes.forEach(addr => {
                    const opt = document.createElement('option'); opt.value = addr;
                    addressList.appendChild(opt);
                });
            }
        }

        // --- AUTO ID GENERATION ---
        function initNewTripId() {
            const idInput = document.getElementById('in-id');
            if (idInput && (idInput.value === '' || idInput.value === 'TRIP-0000')) {
                const nextId = 'TRIP-' + Date.now().toString().slice(-6);
                idInput.value = nextId;
            }
        }

        function loadTripToEdit(idx) {
            if (!currentTrips[idx]) return;
            const rowData = currentTrips[idx];

            editingIndex = idx; // Set Global Edit State

            // Populate Fields (Map back from indices 0-35)
            const fields = [
                'in-id', 'in-date', 'in-size', 'in-ncont', 'in-release', 'in-order', 'in-city', 'in-pickup',
                'in-delivery', 'in-doors', 'in-miles', 'in-customer',
                'in-yard', 'in-yardrate', 'in-dateout', 'in-company', 'in-driver',
                'in-rate', 'in-paytype', 'in-sales', 'in-collect', 'in-amount', 'in-phone',
                'in-paiddriver', 'in-income', 'in-note'
                // removed legacy: 'in-mode','in-mrate','in-sdaterent','in-nextdue'
            ];

            fields.forEach((id, i) => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'in-yard') {
                        // handled by flag1 check below
                    } else {
                        el.value = (rowData[i] === '---') ? '' : rowData[i];
                    }
                }
            });

            // Set Yard Services Checkbox
            const chkYardServices = document.getElementById('in-flag1');
            if (chkYardServices) {
                chkYardServices.checked = (rowData[12] === 'YES');
            }

            // Re-trigger Toggles based on values loaded
            if (window.toggleYardRate) window.toggleYardRate();
            else toggleYardRate(); // fallback if not on window

            // Set Checkboxes — indices from mapTripToArray output:
            // [26]=st_yard, [28]=st_rate, [29]=st_sales, [30]=st_amount
            const elYardPaid = document.getElementById('in-yardpaid');
            if (elYardPaid) elYardPaid.checked = (rowData[26] === 'PAID');
            const elRatePaid = document.getElementById('in-ratepaid');
            if (elRatePaid) elRatePaid.checked = (rowData[28] === 'PAID');
            const elSalesPaid = document.getElementById('in-salespaid');
            if (elSalesPaid) elSalesPaid.checked = (rowData[29] === 'PAID');
            const elAmountPaid = document.getElementById('in-amountpaid');
            if (elAmountPaid) elAmountPaid.checked = (rowData[30] === 'PAID');

            // Email — index 32 in mapTripToArray output
            const elEmail = document.getElementById('in-email');
            if (elEmail) elEmail.value = rowData[32] || '';

            // Price per day — index 43
            const elPPD = document.getElementById('in-priceperday');
            if (elPPD) elPPD.value = rowData[43] || '';

            // Truck / Trailer (Indices 44, 45 ignored for Trips UI)

            // Refresh UI States
            updateDriverCommission();

            // Update UI Button
            const btn = document.querySelector('.btn-add-sidebar');
            if (btn) {
                btn.textContent = 'Update Trip';
                btn.classList.add('btn-update');
            }

            // Highlighting Row (Removing redundant loadTableData call)
            // loadTableData();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        let isLoadingTable = false;
        async function loadTableData() {
            if (isLoadingTable) return;
            isLoadingTable = true;

            const logisticsBody = document.getElementById('table-body');
            if (!logisticsBody) { isLoadingTable = false; return; }

            // Fetch from Supabase FIRST
            try {
                const data = await getTrips();
                console.log("Calendar View DEBUG: Records from Supabase ->", data ? data.length : 0);
                
                // Clear ONLY when data is ready
                logisticsBody.innerHTML = '';
                
                // Populating dynamic filters
                populateFilterPickers();

                currentTrips = data.map(mapTripToArray);

                // --- CALC SYNC: Recalculate based on ALL Trips loaded (Initial Load) ---
                if (window.renderDriverLog) window.renderDriverLog();

                currentTrips.forEach((rowData, idx) => {
                    try {
                        const tr = document.createElement('tr');
                        const stYard = rowData[26];
                        const stRate = rowData[28];
                        const stSales = rowData[29];
                        const stAmount = rowData[30];
                        const nextDueVal = rowData[42]; // Based on v4 structure
                        const email = rowData[32]; // index 32 for Email

                        // Construct display array (Exact Load Flow Order - 27 Columns)
                        const displayData = [
                            rowData[0],     // 0: ID
                            rowData[1],     // 1: Date
                            rowData[2],     // 2: Size
                            rowData[3],     // 3: N. Cont
                            rowData[4],     // 4: Release #
                            rowData[5],     // 5: Order - Bol Cont #
                            rowData[6],     // 6: City
                            rowData[7],     // 7: Pick Up Address
                            'STATUS_FLAGS', // 8: NEW COLUMN
                            rowData[8],     // 9: Delivery Place (was 8)
                            rowData[9],     // 10: Doors Direction (was 9)
                            rowData[10],    // 11: Miles
                            rowData[11],    // 12: Customer
                            rowData[13],    // 13: Yard Rate (Yard Services removed)
                            rowData[43],    // 14: Price per Day (NEW)
                            rowData[14],    // 15: Date Out
                            rowData[15],    // 16: Company
                            rowData[16],    // 17: Driver
                            rowData[17],    // 18: Trans Pay
                            rowData[19],    // 19: Sales Price (Type Pay removed)
                            rowData[21],    // 20: Amount
                            rowData[22],    // 21: Phone #
                            rowData[23],    // 22: Paid Driver
                            rowData[24],    // 23: Income Fee
                            rowData[25],    // 24: Note
                            email,          // 25: Email
                        ];

                        displayData.forEach((text, i) => {
                            const td = document.createElement('td');
                            
                            // FORMATTING STATUS_FLAGS COLUMN (Index 8)
                            if (i === 8) {
                                td.innerHTML = `
                                    <div style="display:flex; gap:5px; justify-content:center;">
                                        <input type="checkbox" style="width:16px; height:16px;">
                                        <input type="checkbox" style="width:16px; height:16px;">
                                        <input type="checkbox" style="width:16px; height:16px;">
                                    </div>
                                `;
                            }
                            // Formatting Currency: Yard Rate(13), PricePerDay(14), TransPay(18), Sales(19), Amount(20), PaidDriver(22), IncomeFee(23)
                            else if ([13, 14, 18, 19, 20, 22, 23].includes(i)) {
                                const val = parseFloat(text) || 0;
                                td.textContent = `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                td.style.fontWeight = 'bold';

                                // Yard Rate ✅ Icon logic (Index 13 after removing Yard Services)
                                if (i === 13 && stYard === 'PAID') {
                                    td.innerHTML = `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })} <i class="fas fa-check-circle" style="color: #10b981; margin-left: 5px;" title="Yard Fee Paid"></i>`;
                                }
                            } else {
                                td.textContent = text;
                            }

                            // PAID Status Checkbox for Amount Column (Index 21, Collect Pay removed)
                            if (i === 21) {
                                td.innerHTML = '';
                                const container = document.createElement('div');
                                container.style.display = 'flex';
                                container.style.alignItems = 'center';
                                container.style.justifyContent = 'center';
                                container.style.gap = '8px';

                                const chk = document.createElement('input');
                                chk.type = 'checkbox';
                                chk.checked = (stAmount === 'PAID');
                                chk.onclick = async (e) => {
                                    e.stopPropagation();
                                    const newStatus = chk.checked ? 'PAID' : 'PENDING';
                                    try {
                                        await updateTrip(rowData[0], { st_amount: newStatus, paid: chk.checked });
                                        // Update local cache to avoid re-fetch if possible, but loadTableData is safer
                                        await loadTableData();
                                    } catch (err) {
                                        alert("Update failed: " + err.message);
                                        chk.checked = !chk.checked; // revert
                                    }
                                };
                                container.appendChild(chk);
                                
                                const span = document.createElement('span');
                                const val = parseFloat(text) || 0;
                                span.textContent = `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                                container.appendChild(span);
                                
                                td.appendChild(container);
                                td.style.backgroundColor = (stAmount === 'PAID') ? '#dcfce7' : '#fee2e2';
                                td.style.color = (stAmount === 'PAID') ? '#166534' : '#991b1b';
                            }
                            
                            tr.appendChild(td);
                        });

                        // Action Column: Delete button
                        const actionTd = document.createElement('td');
                        const delBtn = document.createElement('button');
                        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                        delBtn.className = 'btn-cancel';
                        delBtn.style.padding = '4px 8px';
                        delBtn.onclick = async (e) => {
                            e.stopPropagation();
                            if (!confirm('¿Seguro que quieres borrar este viaje? Esta acción no se puede deshacer.')) return;
                            try {
                                await deleteTrip(rowData[0]);
                                alert("Viaje eliminado");
                                await loadTableData();
                            } catch (err) {
                                alert("Error al borrar: " + err.message);
                            }
                        };
                        actionTd.appendChild(delBtn);
                        tr.appendChild(actionTd);

                        tr.style.cursor = 'pointer';
                        tr.onclick = () => loadTripToEdit(idx);
                        if (editingIndex === idx) tr.classList.add('editing-row');

                        // OVERDUE RENT HIGHLIGHTING
                        const serviceMode = rowData[39];
                        if (serviceMode === 'RENT' && nextDueVal !== '---' && new Date(nextDueVal + 'T00:00:00') < new Date()) {
                            tr.style.backgroundColor = '#fff7ed';
                            tr.style.border = '2px solid #f97316';
                        }
                        logisticsBody.appendChild(tr);
                    } catch (rowErr) {
                        console.error("Rendering error for row", idx, rowErr);
                    }
                });
            // Apply existing filters if any (for real-time persistence)
            applyAdvancedFilters();
            } catch (err) {
                console.error("Error loading table:", err);
            } finally {
                isLoadingTable = false;
            }
        }

        let reportShowUnpaidOnly = false;
        function togglePendingFilter() {
            reportShowUnpaidOnly = !reportShowUnpaidOnly;
            const btn = document.getElementById('btn-pending-only');
            btn.style.background = reportShowUnpaidOnly ? '#fee2e2' : '#fff';
            btn.style.borderColor = reportShowUnpaidOnly ? '#ef4444' : '#cbd5e1';
            renderDriverLog();
        }

        async function resetReportFilters() {
            // RELOAD AS ULTIMATE RESET:
            // This clears the manual calculator, JS variables and resets input fields
            // The app will stay on "reports" view thanks to sessionStorage persistence.
            window.location.reload();
        }

        async function markTripAsPaid(tripId) {
            const tripIdx = currentTrips.findIndex(r => r[0] === tripId);
            if (tripIdx !== -1) {
                // Toggle status (Index 42)
                const newStatus = (currentTrips[tripIdx][42] === 'PAID') ? 'PENDING' : 'PAID';

                try {
                    await updateTrip(tripId, { payout_status: newStatus });
                    await loadTableData(); // Sync calendar table and local cache
                    renderDriverLog();
                } catch (e) {
                    console.error("Payout toggle failed:", e);
                    alert("Failed to update payout status in database.");
                }
            }
        }

        async function settleDriverGroup(driverName) {
            if (!confirm(`Are you sure you want to mark ALL pending trips for ${driverName} as PAID?`)) return;

            const toUpdate = currentTrips.filter(r => (r[18] || 'UNASSIGNED') === driverName && r[42] !== 'PAID');

            try {
                // Bulk update logic: Sequential for safety or Promise.all
                const promises = toUpdate.map(r => updateTrip(r[0], { payout_status: 'PAID' }));
                await Promise.all(promises);
                await loadTableData();
                renderDriverLog();
                alert(`Settled ${toUpdate.length} trips for ${driverName}`);
            } catch (e) {
                console.error("Group settlement failed:", e);
                alert("Some trips failed to update. Check console.");
            }
        }

        async function revertDriverGroup(driverName) {
            if (!confirm(`Do you want to REVERT all trips for ${driverName} back to PENDING?`)) return;

            const toUpdate = currentTrips.filter(r => (r[18] || 'UNASSIGNED') === driverName && r[42] === 'PAID');

            try {
                const promises = toUpdate.map(r => updateTrip(r[0], { payout_status: 'PENDING' }));
                await Promise.all(promises);
                await loadTableData();
                renderDriverLog();
                alert(`Reverted ${toUpdate.length} trips to pending.`);
            } catch (e) {
                console.error("Group revert failed:", e);
            }
        }

        function renderDriverLog() {
            const body = document.getElementById('dl-body');
            if (!body) return;
            body.innerHTML = '';

            const searchTerm = (document.getElementById('filter-search')?.value || '').toLowerCase();
            const dateFrom = document.getElementById('filter-from')?.value;
            const dateTo = document.getElementById('filter-to')?.value;

            if (currentTrips.length > 0) {
                const allRows = currentTrips;

                // 1. Filter the rows first
                const filtered = allRows.filter(r => {
                    const rDate = r[1]; // DATA
                    const rId = r[0]; // ID
                    const rDriver = (r[16] || 'UNASSIGNED').toString(); // Corrected Index for Driver: 16
                    const rStAmount = r[30]; // Index 30 is st_amount (PAID/PEND)

                    const matchesSearch = rDriver.toLowerCase().includes(searchTerm) || rId.toLowerCase().includes(searchTerm);
                    const matchesDate = (!dateFrom || rDate >= dateFrom) && (!dateTo || rDate <= dateTo);
                    
                    // STATUS FILTER LOGIC
                    const statusFilter = document.getElementById('settlement-status')?.value || 'ALL';
                    let matchesStatus = true;
                    if (statusFilter === 'PENDING') matchesStatus = (rStAmount !== 'PAID');
                    else if (statusFilter === 'PAID') matchesStatus = (rStAmount === 'PAID');
                    else if (statusFilter === 'VOID') matchesStatus = (rStAmount === 'VOID');

                    return matchesSearch && matchesDate && matchesStatus;
                });

                // AUTO-SUM FOR CALCULATOR (Link Amount to Cash Collected)
                let totalAmountFiltered = 0;
                let totalGrossFiltered = 0;
                filtered.forEach(r => {
                    totalAmountFiltered += parseFloat(r[21]) || 0; // Index 21 is Amount
                    // Use final_driver_pay (Index 35 in rowData) for calculator with fallback
                    let finalNetVal = parseFloat(r[35]) || 0;
                    if (finalNetVal <= 0) {
                        const comp = r[15] || ''; // Index 15 is Company
                        const grossPaid = parseFloat(r[23]) || 0; // Index 23 is Gross Driver Pay
                        finalNetVal = (comp === 'RP TULIPAN' || comp === 'JR SUPER CRAME') ? grossPaid * 0.3 : grossPaid;
                    }
                    totalGrossFiltered += finalNetVal;
                });
                const cashCollInput = document.getElementById('calc-cash-coll');
                const grossInput = document.getElementById('calc-gross');
                if (cashCollInput) cashCollInput.value = totalAmountFiltered.toFixed(2);
                if (grossInput) grossInput.value = totalGrossFiltered.toFixed(2);
                
                if (window.updateWeeklyCalc) window.updateWeeklyCalc();

                // --- DRIVER LOG LOGIC ---
                let selectedIndices = new Set();
                let currentFilteredRows = []; // Keep global reference for select all

                window.toggleSelectAllDrivers = function () {
                    const rows = body.querySelectorAll('tr:not(.selection-summary-row)');
                    if (selectedIndices.size === currentFilteredRows.length && currentFilteredRows.length > 0) {
                        // Deselect All
                        selectedIndices.clear();
                        rows.forEach(r => r.classList.remove('selected-row'));
                    } else {
                        // Select All
                        currentFilteredRows.forEach((_, idx) => selectedIndices.add(idx));
                        rows.forEach(r => r.classList.add('selected-row'));
                    }
                    updateSelectionSummary();
                }

                const updateSelectionSummary = () => {
                    // Remove existing summary row
                    const existing = document.getElementById('dl-selection-summary');
                    if (existing) existing.remove();

                    if (selectedIndices.size === 0) return;

                    let totalPaidDriver = 0;
                    let totalCash = 0;

                    selectedIndices.forEach(idx => {
                        const r = filtered[idx];
                        // Use final_driver_pay (Index 35) with fallback for calculation
                        let netVal = parseFloat(r[35]) || 0;
                        if (netVal <= 0) {
                            const comp = r[15] || '';
                            const grossPaid = parseFloat(r[23]) || 0;
                            netVal = (comp === 'RP TULIPAN' || comp === 'JR SUPER CRAME') ? grossPaid * 0.3 : grossPaid;
                        }
                        totalPaidDriver += netVal;
                        
                        if (r[30] === 'PAID') { // CASH status for Amount is Index 30
                            totalCash += parseFloat(r[21]) || 0; // Amount is Index 21
                        }
                    });

                    // SYNC WITH CALCULATOR (New Sync Logic)
                    const calcGross = document.getElementById('calc-gross');
                    const calcCashColl = document.getElementById('calc-cash-coll');
                    if (calcGross) calcGross.value = totalPaidDriver.toFixed(2);
                    if (calcCashColl) calcCashColl.value = totalCash.toFixed(2);

                    // Trigger the math for Balance and Driver Salary results
                    if (window.updateWeeklyCalc) window.updateWeeklyCalc();

                    const finalNet = totalPaidDriver - totalCash;

                    // Create Summary Row
                    const summaryTr = document.createElement('tr');
                    summaryTr.id = 'dl-selection-summary';
                    summaryTr.className = 'selection-summary-row';
                    summaryTr.innerHTML = `
                        <td colspan="9" style="text-align:right;">Selected Summary (${selectedIndices.size} trips):</td>
                        <td style="color: #4ade80;">$${finalNet.toFixed(2)}</td>
                        <td></td>
                    `;

                    // Insert after the last selected actual row in the DOM
                    let lastSelectedRow = null;
                    const rows = body.querySelectorAll('tr:not(.selection-summary-row)');
                    selectedIndices.forEach(idx => {
                        if (rows[idx]) lastSelectedRow = rows[idx];
                    });

                    if (lastSelectedRow) {
                        lastSelectedRow.after(summaryTr);
                    }
                };

                // Render simple flat list of 11 columns
                currentFilteredRows = filtered;
                filtered.forEach((r, idx) => {
                    const tr = document.createElement('tr');
                    tr.style.cursor = 'pointer';
                    tr.onclick = (e) => {
                        if (selectedIndices.has(idx)) {
                            selectedIndices.delete(idx);
                            tr.classList.remove('selected-row');
                        } else {
                            selectedIndices.add(idx);
                            tr.classList.add('selected-row');
                        }
                        updateSelectionSummary();
                    };

                    // Columns Map: Date(1), Size(2), N.Cont(3), Order(5), City(6), PickUp(7), Delivery(8), Miles(10), Driver(16), PaidDriver(23), Cash(21)
                    const cellIndices = [1, 2, 3, 5, 6, 7, 8, 10, 16, 23, 21];

                    cellIndices.forEach((idx, i) => {
                        const td = document.createElement('td');
                        let value = r[idx] || '---';

                        // Specific logic for 'Paid Driver' column in Reports: show FINAL NET PAY (Index 35) with fallback
                        if (idx === 23) {
                            let finalNet = parseFloat(r[35]) || 0;
                            // Fallback calculation in real-time if DB value is 0
                            if (finalNet <= 0) {
                                const comp = r[15] || ''; // rowData index 15: Company
                                const gross = parseFloat(r[23]) || 0; // rowData index 23: Paid Driver Gross
                                finalNet = (comp === 'RP TULIPAN' || comp === 'JR SUPER CRAME') ? gross * 0.3 : gross;
                            }
                            value = finalNet;
                        }

                        // Specific logic for the LAST column (Cash): only show if r[30] is PAID
                        if (i === 10) { // Index of 'Cash' column in cellIndices
                            const isCashMarked = (r[30] === 'PAID');
                            value = isCashMarked ? (r[21] || '---') : '---';
                        }

                        td.textContent = value;
                        tr.appendChild(td);
                    });

                    body.appendChild(tr);
                });
                // Clean up footer for now as requested
                const footerLabel = document.getElementById('dl-footer-label');
                const totalDisplay = document.getElementById('dl-total-paid');
                if (footerLabel) footerLabel.textContent = "Report Entries:";
                if (totalDisplay) totalDisplay.textContent = filtered.length;
            }
        }

        window.updateNetPayInfo = function() {
            const elComp = document.getElementById('in-company');
            const elGross = document.getElementById('in-paiddriver');
            const info = document.getElementById('net-pay-info');
            if (!elComp || !elGross || !info) return;

            const company = elComp.value;
            const gross = parseFloat(elGross.value) || 0;
            
            if (company === 'RP TULIPAN' || company === 'JR SUPER CRAME') {
                info.textContent = `Monto neto para chofer: $${(gross * 0.3).toFixed(2)} (30% aplicado)`;
            } else {
                info.textContent = `Monto neto para chofer: $${gross.toFixed(2)} (100% aplicado)`;
            }
        }

        window.updateWeeklyCalc = function () {
            // Safety Check: Avoid breaking if calculator is not in the current view (Mobil/Desktop)
            const elGross = document.getElementById('calc-gross');
            const elFactory = document.getElementById('calc-factory');
            const elWeekly = document.getElementById('calc-weekly');
            const elCashColl = document.getElementById('calc-cash-coll');
            const elLastBal = document.getElementById('calc-last-bal');
            const resSalary = document.getElementById('res-driver-salary');
            const resCashBal = document.getElementById('res-cash-bal');

            if (!elGross || !elFactory || !elWeekly || !elCashColl || !elLastBal || !resSalary || !resCashBal) {
                console.log("Calculadora no presente en el DOM. Omitiendo recálculo.");
                return;
            }

            // 1. Right Side Calculation (Settlement)
            const gross = parseFloat(elGross.value) || 0;
            const factoryPct = parseFloat(elFactory.value) || 0;
            const weeklyPayment = parseFloat(elWeekly.value) || 0;
            
            const factoringFee = gross * (factoryPct / 100);
            const settlementSalary = gross - factoringFee - weeklyPayment;

            // Updated RIGHT result box
            resSalary.textContent = `$${settlementSalary.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;

            // 2. Link RIGHT result to LEFT 'Driver Salary' display
            const linkedDisplay = document.getElementById('res-linked-salary');
            if (linkedDisplay) linkedDisplay.textContent = `$${settlementSalary.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;

            // 3. Left Side Calculation (Cash Balance)
            const cashColl = parseFloat(elCashColl.value) || 0;
            const lastBal = parseFloat(elLastBal.value) || 0;
            
            // Formula: Cash Balance = (Cash Collected + Last Week Balance) - Driver Salary (Settlement result)
            const cashTotal = (cashColl + lastBal) - settlementSalary;

            resCashBal.textContent = `$${cashTotal.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
        }

        // --- settlement ARCHIVING SYSTEM ---
        let currentSettlements = [];

        async function fetchHistory() {
            console.log("Attempting to fetch history from Supabase...");
            try {
                const { data, error } = await db
                    .from('settlement_history')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (error) {
                    console.error("DB Error fetching history:", error.message);
                    throw error;
                }
                
                console.log(`Success: Fetched ${data ? data.length : 0} settlement records.`);
                currentSettlements = data || [];
                
                if (currentSettlements.length === 0) {
                    console.log("INFO: No settlement history found in database.");
                }
                
                renderSettlementHistory();
            } catch (err) {
                console.error("CRITICAL: fetchHistory failed ->", err);
            }
        }
        window.fetchHistory = fetchHistory;
        // Alias for backward compatibility if needed
        window.loadSettlements = fetchHistory;

        function renderSettlementHistory() {
            const body = document.getElementById('settlement-history-body');
            const filterValue = (document.getElementById('history-local-filter')?.value || '').toLowerCase();
            const globalDriver = (document.getElementById('filter-search')?.value || '').toLowerCase();
            const globalStatus = document.getElementById('settlement-status')?.value || '';
            const globalType = document.getElementById('settlement-payment-type')?.value || '';
            
            if (!body) return;
            
            body.innerHTML = '';

            // Filter data locally if a search term exists (Universal Global Filter Logic)
            const filtered = currentSettlements.filter(s => {
                const matchLocal = (s.driver_name || '').toLowerCase().includes(filterValue);
                const matchGlobalDriver = (s.driver_name || '').toLowerCase().includes(globalDriver);
                // Currently history table only has driver_name filter but we prepare for others
                return matchLocal && matchGlobalDriver;
            });

            if (filtered.length === 0) {
                body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px; color: #64748b; font-style: italic;">No records matching filter.</td></tr>`;
                return;
            }

            filtered.forEach(s => {
                const tr = document.createElement('tr');
                const fDate = (d) => {
                    if (!d) return '---';
                    const dateObj = new Date(d + 'T00:00:00');
                    // Changed to DD/MM/YYYY as requested (Spanish style)
                    const d1 = dateObj.getDate().toString().padStart(2, '0');
                    const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                    const y = dateObj.getFullYear();
                    return `${d1}/${m}/${y}`;
                };

                // Aging Calculation
                let agingText = '---';
                if (s.start_date) {
                    const start = new Date(s.start_date + 'T00:00:00');
                    const diff = new Date() - start;
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    agingText = days >= 0 ? `${days} days` : 'Future';
                }
                
                const balance = s.cash_balance || 0;
                const balanceColor = balance < 0 ? '#ef4444' : '#10b981';

                tr.innerHTML = `
                    <td style="font-size: 0.75rem; color: #94a3b8;">${(s.id || '---').toString().slice(0, 8).toUpperCase()}</td>
                    <td style="font-weight: 700; color: #1e293b;">${s.driver_name || 'UNASSIGNED'}</td>
                    <td style="color: #475569;">${fDate(s.start_date)}</td>
                    <td style="color: #475569;">${fDate(s.end_date)}</td>
                    <td style="color: #64748b; font-size: 0.85rem;">${agingText}</td>
                    <td style="font-weight: 800; color: ${balanceColor}; font-size: 1.1rem;">
                        $${balance.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                    </td>
                    <td style="text-align: center;">
                        <button onclick="deleteSettlement('${s.id}')" class="btn-cancel" style="padding: 5px 10px; font-size: 0.7rem; background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;">
                            <i class="fas fa-trash"></i> DELETE
                        </button>
                    </td>
                `;
                body.appendChild(tr);
            });
        }

        function syncDriverNames() {
            const selectEl = document.getElementById('filter-search');
            let val = 'UNASSIGNED';
            if (selectEl && selectEl.value) {
                val = selectEl.options[selectEl.selectedIndex].text;
            }
            const display = document.getElementById('display-driver-sync');
            if (display) display.textContent = val.toUpperCase();
        }

        async function archiveSettlement() {
            // SCOPED CAPTURE: Searching specifically within the reports panel to avoid grabbing dates from 'New Trip Entry'
            const panel = document.getElementById('reports-view');
            if (!panel) return;

            let fromField = panel.querySelector('#filter-from') || panel.querySelectorAll('input[type="date"]')[0];
            let toField = panel.querySelector('#filter-to') || panel.querySelectorAll('input[type="date"]')[1];
            let searchField = panel.querySelector('#filter-search');

            const val_inicio = fromField ? fromField.value : '';
            const val_final = toField ? toField.value : '';
            const val_search = searchField ? searchField.value : '';
            
            const cashField = document.getElementById('res-cash-bal');
            const statusField = document.getElementById('settlement-status');
            const typeField = document.getElementById('settlement-payment-type');

            const val_status = statusField ? statusField.value : 'PENDING';
            const val_type = typeField ? typeField.value : 'CASH';

            // DIAGNOSTIC LOGGING
            console.log("Archive CAPTURE Scoped ->", {
                InitialValue: val_inicio,
                FinalValue: val_final,
                DriverSelected: val_search
            });

            const driverNameFinal = val_search.trim().toUpperCase() || 'UNASSIGNED';
            
            // VALIDATION: Dates are mandatory for archiving
            if (!val_inicio || !val_final) {
                alert(`Selecciona el rango de fechas antes de archivar.\n(Asegúrate de llenar los campos INITIAL y FINAL DATE arriba)`);
                return;
            }
            
            const cashText = cashField ? cashField.textContent : '$0,00';
            const cashAmountFinal = parseFloat(cashText.replace('$', '').replace(/\./g, '').replace(',', '.')) || 0;

            if (!confirm(`Are you sure you want to ARCHIVE this settlement for ${driverNameFinal}?`)) return;

            const entry = {
                driver_name: driverNameFinal,
                start_date: val_inicio,
                end_date: val_final,
                cash_balance: cashAmountFinal,
                status: val_status,
                payment_type: val_type
            };

            try {
                const { error } = await db.from('settlement_history').insert([entry]);
                if (error) throw error;
                
                // AUTOMATIC EXPENSE INTEGRATION
                const resSalary = document.getElementById('res-driver-salary');
                const salaryStr = resSalary ? resSalary.textContent : '$0,00';
                const salaryVal = parseFloat(salaryStr.replace('$', '').replace(/\./g, '').replace(',', '.')) || 0;

                // Date Fallback: Use selected final date or Today
                const expenseDate = val_final || new Date().toISOString().split('T')[0];

                const expData = [
                    expenseDate,
                    'Driver Payment',
                    `Liquidación de ${driverNameFinal} - ${expenseDate}`,
                    `$${salaryVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                    `Auto-generated from Driver Settlement Archive`
                ];
                
                const expenseObj = mapArrayToExpense(expData);
                await addExpense(expenseObj);
                
                alert("Archive & Expense Saved Successfully!");
                
                // Clear Calculators
                const ids = ['calc-cash-coll', 'calc-last-bal', 'calc-gross', 'calc-factory', 'calc-weekly'];
                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = 0;
                });
                
                updateWeeklyCalc();
                if (window.fetchHistory) window.fetchHistory();
            } catch (err) {
                console.error("Archive failed:", err);
                alert("DATABASE ERROR: " + (err.message || "Unknown error"));
            }
        }
        window.archiveSettlement = archiveSettlement;

        async function deleteSettlement(id) {
            if (!confirm("Are you sure you want to delete this historical record?")) return;
            try {
                const { error } = await db.from('settlement_history').delete().eq('id', id);
                if (error) throw error;
                fetchHistory();
            } catch (err) {
                alert("Delete failed: " + err.message);
            }
        }
        window.deleteSettlement = deleteSettlement;

        // Initialize state on load
        window.addEventListener('DOMContentLoaded', () => {
            loadTableData();
            loadReleasesData();
            loadExpensesData();
            renderDriverLog();
            updateReleaseDatalist();
            updateAddressDatalist();

            // --- PERSISTENCE LOGIC (Anti-F5) ---
            const savedSection = sessionStorage.getItem('activeSection') || 'hero';
            showView(savedSection);

            // Set initial ID and Order
            document.getElementById('in-id').value = 'TRIP-' + Date.now().toString().slice(-6);
            const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            let initialOrd = '';
            for (let i = 0; i < 4; i++) initialOrd += chars.charAt(Math.floor(Math.random() * chars.length));
            document.getElementById('in-order').value = 'ORD-' + initialOrd;

            // New logic for Release Row addition
            // New logic for Release Row addition (SUPABASE)
            window.addReleaseRow = async () => {
                const relNo = document.getElementById('rel-no-releases').value;
                if (!relNo) { alert('Please enter a Release Number'); return; }

                const date = document.getElementById('rel-date').value || '---';
                const city = document.getElementById('rel-city').value || '---';
                const depot = document.getElementById('rel-depot').value || '---';
                const address = document.getElementById('rel-address').value || '---';
                const seller = document.getElementById('rel-seller').value || '---';

                // We will collect multiple rows if multiple quantities are filled
                const sizesToProcess = [
                    { sizeName: "20' FT", qtyId: "rel-qty-20", priceId: "rel-price-20", typeName: "rel-20-type", condName: "rel-20-cond", column: "qty_20" },
                    { sizeName: "40' FT", qtyId: "rel-qty-40", priceId: "rel-price-40", typeName: "rel-40-type", condName: "rel-40-cond", column: "qty_40" },
                    { sizeName: "45' FT", qtyId: "rel-qty-45", priceId: "rel-price-45", typeName: "rel-45-type", condName: "rel-45-cond", column: "qty_45" }
                ];

                let processedCount = 0;

                for (const sz of sizesToProcess) {
                    const qty = parseInt(document.getElementById(sz.qtyId).value) || 0;
                    if (qty > 0) {
                        const price = parseFloat(document.getElementById(sz.priceId).value) || 0;
                        const type = document.querySelector(`input[name="${sz.typeName}"]:checked`).value;
                        const condition = document.querySelector(`input[name="${sz.condName}"]:checked`).value;

                        // Build single release object for this specific size category
                        const relObj = {
                            release_no: relNo,
                            date: date === '---' ? null : date,
                            type: type,
                            condition: condition,
                            depot: depot,
                            depot_address: address,
                            city: city,
                            qty_20: sz.column === 'qty_20' ? qty : 0,
                            price_20: sz.column === 'qty_20' ? price : 0,
                            qty_40: sz.column === 'qty_40' ? qty : 0,
                            price_40: sz.column === 'qty_40' ? price : 0,
                            qty_45: sz.column === 'qty_45' ? qty : 0,
                            price_45: sz.column === 'qty_45' ? price : 0,
                            seller: seller,
                            total_stock: qty
                        };

                        try {
                            await addRelease(relObj);
                            processedCount++;
                        } catch (err) {
                            console.error(`Failed to add release for ${sz.sizeName}:`, err);
                            alert(`Error saving ${sz.sizeName}: ${err.message}`);
                        }
                    }
                }

                if (processedCount > 0) {
                    await loadReleasesData();
                    if (window.updateReleaseDatalist) window.updateReleaseDatalist();
                    
                    // Clear fields
                    ['rel-no-releases', 'rel-qty-20', 'rel-qty-40', 'rel-qty-45'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.value = (id.includes('qty')) ? '0' : '';
                    });
                    
                    alert(`¡Éxito! Se han creado ${processedCount} variantes de Release correctamente.`);
                } else {
                    alert("Por favor, ingresa al menos una cantidad mayor a 0 para guardar.");
                }
            };

            window.saveReleasesData = function () {
                // Obsolete now that we use Supabase directly, but keeping it empty for potential temporary use
            };

            async function loadReleasesData() {
                const body = document.getElementById('releases-body');
                if (!body) return;

                try {
                    const data = await getReleases();
                    currentReleases = data.map(mapReleaseToArray);

                    body.innerHTML = '';
                    currentReleases.forEach(rowData => {
                        const tr = document.createElement('tr');
                        
                        // ICONIC ORDER: [0]rel_no, [1]date, [2]type(Icon), [3]cond(Icon), 'SIZE', [6]city, [4]depot, [5]depot_address, 'IN', 'PICKUP', 'STOCK', 13
                        const displayIndices = [0, 1, 2, 3, 'SIZE', 6, 4, 5, 'IN', 'PICKUP', 'STOCK', 13];
                        
                        const q20 = parseInt(rowData[7]) || 0;
                        const q40 = parseInt(rowData[9]) || 0;
                        const q45 = parseInt(rowData[11]) || 0;
                        const sumTotal = q20 + q40 + q45;

                        displayIndices.forEach(idx => {
                            const td = document.createElement('td');
                            let text = rowData[idx];

                            // Date format DD/MM/YYYY for index 1
                            if (idx === 1 && text && text !== '---') {
                                try {
                                    const d = new Date(text + 'T00:00:00');
                                    if (!isNaN(d.getTime())) {
                                        const dd = String(d.getDate()).padStart(2, '0');
                                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                                        const yyyy = d.getFullYear();
                                        text = `${dd}/${mm}/${yyyy}`;
                                    }
                                } catch(e) {}
                                td.textContent = text;
                            } 
                            // ICON LOGIC for TYPE (index 2)
                            else if (idx === 2) {
                                td.style.fontSize = '1.4rem';
                                if (text === 'DRY') {
                                    td.innerHTML = `<span title="DRY (Calor)">🔥</span>`;
                                } else if (text === 'REEFER') {
                                    td.innerHTML = `<span title="REEFER (Frío)">❄️</span>`;
                                } else {
                                    td.textContent = text;
                                }
                            }
                            // ICON LOGIC for CONDITION (index 3)
                            else if (idx === 3) {
                                td.style.fontSize = '1.4rem';
                                if (text === 'NEW') {
                                    td.innerHTML = `<span title="NEW Condition">✨</span>`;
                                } else {
                                    td.innerHTML = `<span title="USED Condition">🔧</span>`;
                                }
                            }
                            // NEW: SIZE Logic
                            else if (idx === 'SIZE') {
                                const q20 = parseInt(rowData[7]) || 0;
                                const q40 = parseInt(rowData[9]) || 0;
                                const q45 = parseInt(rowData[11]) || 0;
                                let sizeVal = '---';
                                if (q20 > 0) sizeVal = "20'";
                                else if (q40 > 0) sizeVal = "40'";
                                else if (q45 > 0) sizeVal = "45'";
                                td.textContent = sizeVal;
                                td.style.fontWeight = '800';
                            }
                            // NEW: Metrics Logic (IN, PICK UP, STOCK)
                            else if (idx === 'IN' || idx === 'PICKUP' || idx === 'STOCK') {
                                const initialIn = parseInt(rowData[14]) || 0; // total_stock
                                const currentStock = (parseInt(rowData[7]) || 0) + (parseInt(rowData[9]) || 0) + (parseInt(rowData[11]) || 0);
                                const pickedUp = initialIn - currentStock;

                                let valDisplay = 0;
                                if (idx === 'IN') valDisplay = initialIn;
                                else if (idx === 'PICKUP') valDisplay = pickedUp;
                                else if (idx === 'STOCK') valDisplay = currentStock;

                                td.textContent = valDisplay;
                                td.style.fontWeight = '900';

                                if (idx === 'STOCK' && valDisplay <= 10) {
                                    td.style.backgroundColor = '#fee2e2';
                                    td.style.color = '#dc2626';
                                    td.style.border = '2px solid #ef4444';
                                }
                                if (idx === 'PICKUP' && valDisplay > 0) {
                                    td.style.color = '#1e3a8a'; // Blue for Picked Up items
                                }
                                if (idx === 'IN') {
                                    td.style.color = '#1e293b';
                                }
                            }
                            // Explicit '0' for legacy indices if any remain (7, 9, 11) with RED ALERT
                            else if ([7, 9, 11].includes(idx)) {
                                const valStr = text !== undefined ? text : '0';
                                const valNum = parseInt(valStr) || 0;
                                td.textContent = valStr;
                                if (valNum <= 10) {
                                    td.style.backgroundColor = '#fee2e2';
                                    td.style.color = '#dc2626';
                                    td.style.fontWeight = '900';
                                    td.style.border = '2px solid #ef4444';
                                }
                            } else {
                                td.textContent = text;
                            }
                            tr.appendChild(td);
                        });



                        if (body) body.appendChild(tr);
                    });

                    // Update suggestions for Delivery Calendar
                    if (window.updateReleaseDatalist) window.updateReleaseDatalist();

                } catch (err) {
                    console.error("Error loading releases:", err);
                }
            }
            window.loadReleasesData = loadReleasesData; // Expose globally
            // Mobile menu behavior is handled by global toggleMobileMenu and closeMenu functions.

            // EXPENSE MANAGEMENT LOGIC
            window.toggleOtherExpense = () => {
                const cat = document.getElementById('exp-category').value;
                document.getElementById('group-exp-other').style.display = (cat === 'Other') ? 'block' : 'none';
            };

            window.addExpenseRow = async () => {
                const date = document.getElementById('exp-date').value || '---';
                const cat = document.getElementById('exp-category').value;
                const otherVal = document.getElementById('exp-other-desc').value;
                const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
                const note = document.getElementById('exp-note').value || '---';

                const desc = (cat === 'Other') ? otherVal : cat;
                const rowData = [date, cat, desc, `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, note];

                try {
                    const expenseObj = mapArrayToExpense(rowData);
                    await addExpense(expenseObj);
                    await loadExpensesData(); // Reload from Supabase

                    // Reset form partially
                    document.getElementById('exp-amount').value = '0';
                    document.getElementById('exp-note').value = '';
                    document.getElementById('exp-other-desc').value = '';
                    alert("Expense saved successfully!");
                } catch (err) {
                    console.error("Error adding expense:", err);
                    alert("Failed to save expense to database.");
                }
            };

            async function loadExpensesData() {
                const body = document.getElementById('expenses-body');
                if (!body) return;

                try {
                    const data = await getExpenses();
                    currentExpenses = data.map(mapExpenseToArray);

                    body.innerHTML = '';
                    currentExpenses.forEach((rowData) => {
                        const tr = document.createElement('tr');
                        rowData.slice(0, 5).forEach(text => { // Show first 5 columns
                            const td = document.createElement('td');
                            td.textContent = text;
                            tr.appendChild(td);
                        });

                        // Action Cell (Delete using expense_id at rowData[5])
                        const actionsTd = document.createElement('td');
                        const delBtn = document.createElement('button');
                        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                        delBtn.className = 'btn-cancel';
                        delBtn.style.padding = '5px 10px';
                        delBtn.onclick = async () => {
                            if (!confirm('Are you sure you want to delete this expense?')) return;
                            try {
                                const expenseId = rowData[5];
                                await deleteExpense(expenseId);
                                await loadExpensesData();
                            } catch (e) {
                                console.error("Error deleting expense:", e);
                                alert("Failed to delete expense from database.");
                            }
                        };
                        actionsTd.appendChild(delBtn);
                        tr.appendChild(actionsTd);
                        body.appendChild(tr);
                    });
                    calculateExpenseTotal();
                } catch (err) {
                    console.error("Error loading expenses:", err);
                }
            }

            function calculateExpenseTotal() {
                let total = 0;
                document.querySelectorAll('#expenses-body tr').forEach(row => {
                    const amountStr = row.cells[3].textContent.replace('$', '').replace(/,/g, '');
                    total += parseFloat(amountStr) || 0;
                });
                document.getElementById('exp-total-badge').textContent = `Total: $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            }

            function saveExpensesData() {
                // Obsolete now that we use Supabase
            }

            // PROFIT REPORT CALCULATIONS
            window.renderProfitReport = function () {
                const dateFrom = document.getElementById('profit-date-from').value;
                const dateTo = document.getElementById('profit-date-to').value;

                const logisticsData = currentTrips;
                const expensesData = currentExpenses;

                let totals = {
                    sales: 0,
                    rentals: 0,
                    yard: 0,
                    expenses: 0,
                    releases: 0
                };

                // 1. Calculate Revenue from Logistics (Fixed Indices matching v4 structure)
                logisticsData.forEach(row => {
                    const rowDate = row[1];
                    if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                        totals.sales += parseFloat(row[19]) || 0;  // sales_price at index 19
                        totals.yard += (parseFloat(row[13]) || 0) + (parseFloat(row[43]) || 0);   // yard_rate (13) + price_per_day (43)

                        // Rentals: Sum Trans Pay (17) and Monthly Rate (40)
                        const transPay = parseFloat(row[17]) || 0;
                        const monthlyRate = parseFloat(row[40]) || 0;
                        totals.rentals += (transPay + monthlyRate);
                    }
                });

                // 2. Calculate Expenses
                expensesData.forEach(row => {
                    const rowDate = row[0];
                    if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                        const amountStr = row[3] ? row[3].replace('$', '').replace(/,/g, '') : '0';
                        totals.expenses += parseFloat(amountStr) || 0;
                    }
                });

                // 3. New: Calculate Release Costs (Container Purchases)
                currentReleases.forEach(row => {
                    const rowDate = row[1];
                    if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                        const q20 = parseFloat(row[7]) || 0;
                        const p20 = parseFloat(row[8]) || 0;
                        const q40 = parseFloat(row[9]) || 0;
                        const p40 = parseFloat(row[10]) || 0;
                        const q45 = parseFloat(row[11]) || 0;
                        const p45 = parseFloat(row[12]) || 0;
                        totals.releases += (q20 * p20) + (q40 * p40) + (q45 * p45);
                    }
                });

                const totalRevenue = totals.sales + totals.rentals + totals.yard;
                const totalGlobalExpenses = totals.expenses + totals.releases;
                const netProfit = totalRevenue - totalGlobalExpenses;

                // 4. Update Summary Cards
                document.getElementById('total-revenue-val').textContent = `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                document.getElementById('total-expenses-val').textContent = `$${totalGlobalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

                const netEl = document.getElementById('net-profit-val');
                const profitCard = document.getElementById('profit-card-status');
                netEl.textContent = `$${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

                if (netProfit >= 0) {
                    netEl.className = 'positive';
                    profitCard.className = 'summary-card profit positive';
                } else {
                    netEl.className = 'negative';
                    profitCard.className = 'summary-card profit negative';
                }

                // 5. Update Breakdown List
                document.getElementById('val-sales').textContent = `$${totals.sales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                document.getElementById('val-rentals').textContent = `$${totals.rentals.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                document.getElementById('val-yard').textContent = `$${totals.yard.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                document.getElementById('val-releases').textContent = `$${totals.releases.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

                // 6. Update Simple Bar Chart
                const maxVal = Math.max(totals.sales, totals.rentals, totals.yard, totals.releases, 1);
                document.getElementById('bar-sales').style.width = `${(totals.sales / maxVal) * 100}%`;
                document.getElementById('bar-rentals').style.width = `${(totals.rentals / maxVal) * 100}%`;
                document.getElementById('bar-yard').style.width = `${(totals.yard / maxVal) * 100}%`;
            };

            window.resetProfitFilters = function () {
                document.getElementById('profit-date-from').value = '';
                document.getElementById('profit-date-to').value = '';
                renderProfitReport();
            };

            // DOCS CENTER LOGIC
            const docSelector = document.getElementById('doc-type-selector');
            const templates = {
                'delivery': document.getElementById('tpl-delivery'),
                'yard': document.getElementById('tpl-yard'),
                'sales': document.getElementById('tpl-sales')
            };

            const fieldGroups = {
                'delivery': document.querySelectorAll('.field-delivery'),
                'yard': document.querySelectorAll('.field-yard'),
                'sales': document.querySelectorAll('.field-sales')
            };

            // --- UNIVERSAL RECEIPT LOGIC ---
            let currentDocTrip = null;

            window.loadDocTrips = function () {
                const search = (document.getElementById('trip-search-input')?.value || '').toLowerCase();
                const fromDate = document.getElementById('trip-from-date')?.value;
                const toDate = document.getElementById('trip-to-date')?.value;
                const list = document.getElementById('trip-list-scroll');
                const data = currentTrips;

                if (!list) return;

                list.innerHTML = '';
                // Use a copy to avoid mutating cache while iterating if needed, slice() works
                data.slice().reverse().forEach(trip => {
                    const id = (trip[0] || '').toLowerCase();
                    const date = trip[1] || ''; // Index 1
                    const cont = (trip[3] || '').toString().toLowerCase(); // Index 3
                    const cust = (trip[11] || '').toString().toLowerCase(); // Index 11
                    const drv = (trip[16] || '').toString().toLowerCase(); // Index 16: Driver

                    const matchesSearch = !search || id.includes(search) || cont.includes(search) || cust.includes(search) || drv.includes(search);
                    const matchesDate = (!fromDate || date >= fromDate) && (!toDate || date <= toDate);

                    if (matchesSearch && matchesDate) {
                        const div = document.createElement('div');
                        div.className = 'trip-item';
                        div.innerHTML = `
                            <h4>ID: ${trip[0]}</h4>
                            <p>${trip[3] || 'No Cont'} | ${trip[16] || 'No Driver'}</p>
                            <p style="font-size:0.6rem; color:#94a3b8;">${trip[11] || 'No Cust'} | ${trip[1] || ''}</p>
                            <p style="font-size:0.55rem; color:#64748b;">Truck: ${trip[33] || 'N/A'} | Trailer: ${trip[34] || 'N/A'}</p>
                        `;
                        div.onclick = () => fillReceiptFromTrip(trip, div);
                        list.appendChild(div);
                    }
                });
            }

            window.fillReceiptFromTrip = function (trip, el) {
                // UI Active State
                document.querySelectorAll('.trip-item').forEach(i => i.classList.remove('active'));
                if (el) el.classList.add('active');

                // Store selected trip and CLEAR sideform for overrides
                currentDocTrip = trip;

                // Clear inputs so they remain "empty" for manual use
                const inputs = ['u-r-id', 'u-r-date', 'u-r-cont', 'u-r-size', 'u-r-rel', 'u-r-order', 'u-r-doors', 'u-r-customer', 'u-r-phone', 'u-r-pickup', 'u-r-place', 'u-r-yard', 'u-r-storage', 'u-r-sales', 'u-r-notes'];
                inputs.forEach(id => {
                    const elInput = document.getElementById(id);
                    if (elInput) elInput.value = '';
                });

                // Reset checkboxes
                ['chk-asis', 'chk-wwt', 'chk-cw', 'chk-new', 'chk-holes', 'chk-doors'].forEach(id => {
                    const elChk = document.getElementById(id);
                    if (elChk) elChk.checked = false;
                });

                drawReceipt();
            }

            window.drawReceipt = function () {
                const preview = document.getElementById('receipt-a4');

                // Helper: Prioritize Manual Input (Sidebar) over Trip Data
                const getV = (id, tripIdx, def = '') => {
                    const manual = document.getElementById(id).value;
                    if (manual && manual !== '0' && manual !== '') return manual;
                    if (currentDocTrip && currentDocTrip[tripIdx]) return currentDocTrip[tripIdx];
                    return def;
                };

                const getB = (id, searchText) => {
                    const manual = document.getElementById(id).checked;
                    if (manual) return true;
                    if (!currentDocTrip) return false;
                    const note = (currentDocTrip[25] || '').toUpperCase(); // Index 25 is Note
                    return note.includes(searchText);
                };

                // Gather Data for Rendering
                const data = {
                    id: getV('u-r-id', 0),
                    date: getV('u-r-date', 1),
                    move: document.getElementById('u-r-move').value || 'IN/OUT',
                    cont: getV('u-r-cont', 3),
                    size: getV('u-r-size', 2),
                    rel: getV('u-r-rel', 4),
                    order: getV('u-r-order', 5),
                    doors: getV('u-r-doors', 9),
                    cust: getV('u-r-customer', 11),
                    phone: getV('u-r-phone', 22), // Index 22 is phone_no
                    pickup: getV('u-r-pickup', 7),
                    place: getV('u-r-place', 8),
                    yard: parseFloat(getV('u-r-yard', 13)) || 0,
                    storage: parseFloat(getV('u-r-storage', 40)) || 0, // Index 40 is monthly_rate
                    transp: parseFloat(getV('u-r-transp', 17)) || 0, // Index 17 is trans_pay
                    sales: parseFloat(getV('u-r-sales', 19)) || 0, // Index 19 is sales_price
                    taxRate: parseFloat(document.getElementById('u-r-tax').value) || 0,
                    notes: getV('u-r-notes', 25), // Index 25 is Note
                    cond: {
                        asis: getB('chk-asis', 'AS IS'),
                        wwt: getB('chk-wwt', 'WWT'),
                        cw: getB('chk-cw', 'CW'),
                        new: getB('chk-new', 'NEW'),
                        holes: getB('chk-holes', 'NO HOLES'),
                        doors: getB('chk-doors', 'DOORS OK')
                    }
                };

                const subtotal = data.yard + data.storage + data.transp + data.sales;
                const taxVal = subtotal * (data.taxRate / 100);
                const total = subtotal + taxVal;

                // Base Header Template
                const headerHtml = `
                    <div class="receipt-header">
                        <div class="receipt-logo-area">
                            <h1 style="color:#b91c1c; font-size: 1.8rem; letter-spacing:-1px;">RP TULIPAN</h1>
                            <p style="font-weight:900; color:#1e293b; margin-top:-5px;">TRANSPORT, INC.</p>
                            <p style="font-size:0.7rem; color:#64748b;">9804 nw 80 ave Hialeah Gardens fl 33016</p>
                            <p style="font-size:0.7rem; color:#64748b;">Phone: 786-768-4409 | 786-736-6288</p>
                        </div>
                        ${data.id ? `
                        <div class="receipt-meta-box">
                            <h2 style="color:#1e293b; margin-bottom:5px; border-bottom: 2px solid #b91c1c; padding-bottom:5px;">RECEIPT</h2>
                            <p>ID: <strong style="font-size:1.1rem; color:#b91c1c;">#${data.id}</strong></p>
                            <p>DATE: <strong>${data.date || '---'}</strong></p>
                        </div>
                        ` : ''}
                    </div>
                `;

                if (!data.id) {
                    preview.innerHTML = headerHtml;
                    return;
                }

                // Helper to render field if not empty
                const f = (label, val) => {
                    if (!val || val === '---') return '';
                    return `<div class="receipt-field"><label>${label}</label><span>${val}</span></div>`;
                };

                // Helper to render section if has children
                const s = (title, content) => {
                    if (!content.trim()) return '';
                    return `
                        <div class="receipt-section-title">${title}</div>
                        <div class="receipt-grid-3">${content}</div>
                    `;
                };

                // Sections
                const logisticContent = f('MOVEMENT TYPE', data.move) + f('RELEASE / BOOKING', data.rel) + f('ORDER / BOL', data.order);
                const equipmentContent = f('CONTAINER #', data.cont) + f('SIZE & TYPE', data.size) + f('DOORS DIRECTION', data.doors) + f('PICK UP FROM', data.pickup) + f('DELIVERY PLACE', data.place);
                const clientContent = f('CUSTOMER NAME', data.cust) + f('PHONE', data.phone);

                // Inspection Section (Special because of grid layout)
                let inspectionContent = '';
                if (data.cond.asis) inspectionContent += `<div style="display:flex; align-items:center; gap:5px;"><span style="width:14px; height:14px; border:1px solid #000; display:inline-block; text-align:center; line-height:14px;">X</span> AS IS</div>`;
                if (data.cond.wwt) inspectionContent += `<div style="display:flex; align-items:center; gap:5px;"><span style="width:14px; height:14px; border:1px solid #000; display:inline-block; text-align:center; line-height:14px;">X</span> WWT</div>`;
                if (data.cond.cw) inspectionContent += `<div style="display:flex; align-items:center; gap:5px;"><span style="width:14px; height:14px; border:1px solid #000; display:inline-block; text-align:center; line-height:14px;">X</span> CW</div>`;
                if (data.cond.new) inspectionContent += `<div style="display:flex; align-items:center; gap:5px;"><span style="width:14px; height:14px; border:1px solid #000; display:inline-block; text-align:center; line-height:14px;">X</span> NEW</div>`;
                if (data.cond.holes) inspectionContent += `<div style="display:flex; align-items:center; gap:5px;"><span style="width:14px; height:14px; border:1px solid #000; display:inline-block; text-align:center; line-height:14px;">X</span> NO HOLES</div>`;
                if (data.cond.doors) inspectionContent += `<div style="display:flex; align-items:center; gap:5px;"><span style="width:14px; height:14px; border:1px solid #000; display:inline-block; text-align:center; line-height:14px;">X</span> DOORS OK</div>`;

                let inspectionSectionHtml = '';
                if (inspectionContent) {
                    inspectionSectionHtml = `
                        <div class="receipt-section-title">Inspection & Condition</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; font-size: 0.8rem;">
                            ${inspectionContent}
                        </div>
                    `;
                }

                // Billing Table
                let billingRows = '';
                if (data.yard > 0) billingRows += `<tr><td>Yard Loading / Interchange Fee</td><td style="text-align:right;">$${data.yard.toFixed(2)}</td></tr>`;
                if (data.storage > 0) billingRows += `<tr><td>Storage / Rental Fee</td><td style="text-align:right;">$${data.storage.toFixed(2)}</td></tr>`;
                if (data.sales > 0) billingRows += `<tr><td>Container Sales</td><td style="text-align:right;">$${data.sales.toFixed(2)}</td></tr>`;
                if (taxVal > 0) billingRows += `<tr><td>Taxes (${data.taxRate}%)</td><td style="text-align:right;">$${taxVal.toFixed(2)}</td></tr>`;

                let billingSectionHtml = '';
                if (total > 0) {
                    billingSectionHtml = `
                        <div class="receipt-section-title">Billing Summary</div>
                        <table class="receipt-table">
                            <thead>
                                <tr><th>Description</th><th style="text-align:right;">Amount</th></tr>
                            </thead>
                            <tbody>${billingRows}</tbody>
                            <tfoot>
                                <tr class="receipt-total-row">
                                    <td>TOTAL DUE</td>
                                    <td style="text-align:right; font-size:1.4rem; color:#b91c1c;">$${total.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    `;
                }

                // Final Notes
                const notesHtml = data.notes ? `
                    <div style="margin-top:25px;">
                        <label style="font-size:0.7rem; font-weight:bold; color:#64748b;">NOTES / DESCRIPTION:</label>
                        <div style="min-height:60px; border:1px solid #e2e8f0; padding:10px; font-size:0.8rem; margin-top:5px; background:#f8fafc; border-left: 4px solid #b91c1c;">
                            ${data.notes}
                        </div>
                    </div>
                ` : '';

                preview.innerHTML = `
                    ${headerHtml}
                    ${s('Logistics & Movement', logisticContent)}
                    ${s('Equipment Information', equipmentContent)}
                    ${s('Client Details', clientContent)}
                    ${inspectionSectionHtml}
                    ${billingSectionHtml}
                    ${notesHtml}
                    <div class="receipt-footer">
                        <div class="signature-box" style="border-top:1px solid #94a3b8; padding-top:10px; text-align:center; font-size:0.7rem; color:#64748b;">AUTHORIZED BY (RP TULIPAN)</div>
                        <div class="signature-box" style="border-top:1px solid #94a3b8; padding-top:10px; text-align:center; font-size:0.7rem; color:#64748b;">RECEIVED BY (CUSTOMER)</div>
                    </div>
                `;
            }

            window.printA4Document = function () {
                const el = document.getElementById('receipt-a4');
                if (!el) return;

                const printWin = window.open('', '', 'width=1000,height=1200');
                printWin.document.write('<html><head><title>Print Receipt</title>');
                // Import the same fonts
                printWin.document.write('<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&family=Roboto+Condensed:wght@400;700&display=swap" rel="stylesheet">');
                printWin.document.write('<style>');
                printWin.document.write(`
                    body { margin: 0; padding: 0; font-family: "Outfit", sans-serif; -webkit-print-color-adjust: exact; }
                    .a4-paper { width: 210mm; margin: 0 auto; padding: 20mm; background: white; min-height: 297mm; }
                    .receipt-header { display: flex; justify-content: space-between; border-bottom: 3px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px; }
                    .receipt-logo-area h1 { font-size: 1.8rem; margin: 0; font-weight: 900; color: #b91c1c; }
                    .receipt-logo-area p { font-size: 0.8rem; margin: 2px 0; color: #1e293b; }
                    .receipt-meta-box { text-align: right; }
                    .receipt-meta-box h2 { font-size: 1.5rem; margin: 0; color: #b91c1c; font-weight: 900; }
                    .receipt-section-title { background: #f8fafc; padding: 6px 12px; font-weight: 800; font-size: 0.8rem; margin-top: 18px; border-left: 5px solid #1e293b; color: #1e293b; text-transform: uppercase; }
                    .receipt-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 12px; }
                    .receipt-field { font-size: 0.9rem; }
                    .receipt-field label { display: block; font-weight: 700; color: #64748b; font-size: 0.7rem; margin-bottom: 2px; }
                    .receipt-field span { font-weight: 700; border-bottom: 1px dashed #cbd5e1; display: block; min-height: 1.4rem; }
                    .receipt-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    .receipt-table th { background: #1e293b; color: white; text-align: left; padding: 10px; font-size: 0.8rem; }
                    .receipt-table td { padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
                    .receipt-total-row { background: #f1f5f9; font-weight: 900; font-size: 1.2rem; }
                    .signature-box { width: 45%; border-top: 2px solid #1a1a1a; text-align: center; padding-top: 10px; font-size: 0.8rem; margin-top: 60px; font-weight: 700; }
                    @media print { @page { size: auto; margin: 10mm; } }
                `);
                printWin.document.write('</style></head><body>');
                printWin.document.write(el.innerHTML);
                printWin.document.write('</body></html>');
                printWin.document.close();

                printWin.focus();
                setTimeout(() => {
                    printWin.print();
                    printWin.close();
                }, 500);
            }

            window.updateCalendarFromReceipt = async function () {
                const id = document.getElementById('u-r-id').value;
                if (!id) return alert('Select a trip first!');

                const tripIdx = currentTrips.findIndex(t => t[0] === id);
                if (tripIdx === -1) return alert('Trip ID not found in database.');

                if (!confirm('This will update the main Delivery Calendar with these manual changes. Continue?')) return;

                // Sync Back to Supabase using proper field names
                const updates = {
                    date: document.getElementById('u-r-date').value || null,
                    n_cont: document.getElementById('u-r-cont').value,
                    size: document.getElementById('u-r-size').value,
                    release_no: document.getElementById('u-r-rel').value,
                    order_no: document.getElementById('u-r-order').value,
                    customer: document.getElementById('u-r-customer').value,
                    phone_no: document.getElementById('u-r-phone').value,
                    pickup_address: document.getElementById('u-r-pickup').value,
                    delivery_place: document.getElementById('u-r-place').value,
                    yard_rate: parseFloat(document.getElementById('u-r-yard').value) || 0,
                    monthly_rate: parseFloat(document.getElementById('u-r-storage').value) || 0,
                    sales_price: parseFloat(document.getElementById('u-r-sales').value) || 0,
                    note: document.getElementById('u-r-notes').value
                };

                try {
                    await updateTrip(id, updates);
                    if (window.loadTableData) await window.loadTableData();
                    await loadDocTrips();
                    alert('Success! Calendar and Report Panel have been updated with these values.');
                } catch (err) {
                    console.error("Sync failed:", err);
                    alert("Failed to sync calendar with Supabase.");
                }
            }

            // --- AUTO COMMISSION LOGIC ---
            window.updateDriverCommission = function () {
                const elCompany = document.getElementById('in-company');
                const elCommText = document.getElementById('in-comission');
                const elPaidBase = document.getElementById('in-paiddriver');
                const elCommRes = document.getElementById('in-comidriver');

                // Safety validation: Ensure elements exist before reading .value
                if (!elCompany || !elCommText || !elPaidBase) {
                    return; // Silently stop if form is not present (e.g., in other views)
                }

                const company = elCompany.value;
                const commText = elCommText.value;
                const commPercent = parseFloat(commText) || 30;
                const paidBase = parseFloat(elPaidBase.value) || 0;

                let result = 0;
                if (company === 'RP TULIPAN' || company === 'JR SUPER CRAME') {
                    result = paidBase * (commPercent / 100);
                } else {
                    result = paidBase;
                }

                if (elCommRes) {
                    elCommRes.value = result.toFixed(2);
                }
            }
            if (window.updateDriverCommission) updateDriverCommission();

            // Init with empty dates to show all by default
            const fromD = document.getElementById('trip-from-date');
            const toD = document.getElementById('trip-to-date');
            if (fromD) fromD.value = '';
            if (toD) toD.value = '';

            // loadDocTrips call at end of DOMContentLoaded handles initial population

            // --- FLEET MANAGEMENT LOGIC ---
            let currentFleetTab = 'truck';

            window.switchFleetTab = function (type) {
                currentFleetTab = type;
                document.getElementById('f-type').value = type;
                document.getElementById('truck-only-fields').style.display = (type === 'truck') ? 'block' : 'none';
                document.getElementById('tab-truck').classList.toggle('active', type === 'truck');
                document.getElementById('tab-trailer').classList.toggle('active', type === 'trailer');
                document.getElementById('fleet-table-title').textContent = (type === 'truck') ? 'Trucks Inventory' : 'Trailers Inventory';
                renderFleetTable();
            };

            window.saveFleetUnit = async function () {
                const id = document.getElementById('f-id').value;
                const unitData = {
                    id: id || Date.now().toString(),
                    type: document.getElementById('f-type').value,
                    num: document.getElementById('f-unit').value,
                    vin: document.getElementById('f-vin').value,
                    plate: document.getElementById('f-plate').value,
                    year: document.getElementById('f-year').value,
                    miles: document.getElementById('f-miles').value,
                    lastDate: document.getElementById('f-last-date').value,
                    lastMiles: document.getElementById('f-last-miles').value,
                    dueDate: document.getElementById('f-due-date').value,
                    dueMiles: document.getElementById('f-due-miles').value,
                    status: document.getElementById('f-status').value
                };

                if (!unitData.num) return alert('Unit # is required');

                try {
                    const dbUnit = mapUIToFleet(unitData);
                    await saveFleet(dbUnit);
                    await loadFleetData();
                    resetFleetForm();
                    alert('Unit saved successfully!');
                } catch (err) {
                    console.error("Error saving fleet unit:", err);
                    alert("Failed to save unit to Supabase.");
                }
            };

            window.renderFleetTable = function () {
                const fleet = currentFleet;
                const body = document.getElementById('fleet-table-body');
                if (!body) return;
                body.innerHTML = '';

                const filtered = fleet.filter(u => u.type === currentFleetTab);
                const today = new Date().toISOString().split('T')[0];

                filtered.forEach(u => {
                    const tr = document.createElement('tr');

                    // Maintenance Logic Check
                    let isOverdue = false;
                    if (u.dueDate && u.dueDate <= today) isOverdue = true;
                    if (u.type === 'truck' && u.dueMiles && parseInt(u.miles) >= parseInt(u.dueMiles)) isOverdue = true;

                    const nextServiceText = (u.dueDate || u.dueMiles) ? `${u.dueDate || 'N/A'}${u.dueMiles ? ' / ' + u.dueMiles + ' mi' : ''}` : 'No Due Set';
                    const statusClass = (u.status === 'Available') ? 'status-paid' : 'status-pending';

                    tr.innerHTML = `
                        <td style="font-weight: 900; color: var(--navy-blue);">${u.num}</td>
                        <td style="font-size: 0.65rem;">${u.vin || 'N/A'}<br><span style="color:var(--corporate-red); font-weight:bold;">${u.plate || 'N/A'}</span></td>
                        <td>${u.year || 'N/A'}</td>
                        <td>${u.type === 'truck' ? (u.miles || 0) + ' mi' : (u.plate || 'N/A')}</td>
                        <td style="${isOverdue ? 'color: white; background: #ef4444; font-weight: bold; border-radius: 4px;' : ''}">${nextServiceText}</td>
                        <td><span class="status-badge ${statusClass}">${u.status}</span></td>
                        <td>
                            <button onclick="editFleetUnit('${u.id}')" class="btn-reset-report" style="padding: 2px 8px; font-size: 0.7rem;">EDIT</button>
                            <button onclick="deleteFleetUnit('${u.id}')" class="btn-cancel" style="padding: 2px 8px; font-size: 0.7rem;">DEL</button>
                        </td>
                    `;
                    body.appendChild(tr);
                });
            };

            window.editFleetUnit = function (id) {
                const unit = currentFleet.find(u => u.id === id);
                if (!unit) return;

                document.getElementById('f-id').value = unit.id;
                document.getElementById('f-unit').value = unit.num;
                document.getElementById('f-vin').value = unit.vin;
                document.getElementById('f-plate').value = unit.plate;
                document.getElementById('f-year').value = unit.year;
                document.getElementById('f-miles').value = unit.miles;
                document.getElementById('f-last-date').value = unit.lastDate;
                document.getElementById('f-last-miles').value = unit.lastMiles;
                document.getElementById('f-due-date').value = unit.dueDate;
                document.getElementById('f-due-miles').value = unit.dueMiles;
                document.getElementById('f-status').value = unit.status;

                document.getElementById('fleet-form-title').textContent = 'Edit Unit ' + unit.num;
            };

            window.deleteFleetUnit = async function (id) {
                if (!confirm('Are you sure you want to delete this unit?')) return;
                try {
                    await deleteFleetUnit(id);
                    await loadFleetData();
                } catch (err) {
                    console.error("Error deleting unit:", err);
                }
            };

            async function loadFleetData() {
                try {
                    const data = await getFleet();
                    currentFleet = data.map(mapFleetToUI);
                    renderFleetTable();
                } catch (err) {
                    console.error("Error loading fleet:", err);
                }
            }
            window.loadFleetData = loadFleetData;

            // Run initial load
            loadFleetData();
        });

        document.addEventListener('DOMContentLoaded', async () => {
            const activeSection = sessionStorage.getItem('activeSection') || 'hero';
            
            // Generate initial ID
            if (window.initNewTripId) window.initNewTripId();
            
            // INITIAL DATA FETCH (Critical for reports persistence)
            if (window.renderDriverLog) {
                const logBody = document.getElementById('dl-body');
                if (logBody) logBody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 20px; color: #64748b;">Loading driver data...</td></tr>';
            }
            
            if (window.loadTableData) {
                await window.loadTableData();
                // After data is loaded, if we are in reports, re-render
                if (activeSection === 'reports') {
                    if (window.renderDriverLog) window.renderDriverLog();
                    if (window.fetchHistory) window.fetchHistory();
                }
            }
            
            showView(activeSection);
            
            // Forced Initial Fetch (For historical data)
            if (window.fetchHistory) window.fetchHistory();
        });

        window.addEventListener('scroll', () => {
            const h = document.getElementById('hero-view');
            if (h && !h.classList.contains('hidden')) {
                if (window.scrollY > 50) {
                    header.classList.add('navbar-scrolled');
                } else {
                    header.classList.remove('navbar-scrolled');
                }
            }
        });
    
