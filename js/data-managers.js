        // --- ACTIVITY LOGGING LOGIC ---
        window.logActivity = async function (actionType, details = null, viewDate = null) {
            if (!db) return;
            try {
                // OPT: Use cached session data (set at login) to avoid redundant auth + profile queries
                let email = window.userEmail;
                let driverName = window.currentDriverNameRef || window.currentUserName || null;

                // Only fall back to DB queries if cache is empty (e.g. first load)
                if (!email) {
                    const { data: { session } } = await db.auth.getSession();
                    if (!session) return;
                    email = session.user.email;

                    if (!driverName) {
                        const { data: profile } = await db.from('profiles')
                            .select('driver_name_ref, full_name, name')
                            .eq('id', session.user.id)
                            .single();
                        driverName = profile?.driver_name_ref || profile?.full_name || profile?.name;
                    }
                }

                // Final safety net
                if (!driverName || driverName === 'null') {
                    driverName = (email || '').split('@')[0] || "Unknown";
                }

                const { error } = await db.from('activity_logs').insert([{
                    user_email: email.trim(),
                    action_type: actionType,
                    details: details,
                    view_date: viewDate,
                    driver_name: driverName.toString().trim()
                }]);

                if (error) throw error;

                // Notify any open views to refresh their read-receipt icons
                window.dispatchEvent(new CustomEvent('activityLogged', {
                    detail: { driverName, actionType, viewDate }
                }));
            } catch (err) {
                console.warn("Could not log activity:", err);
            }
        };

        window.fetchActivityLogs = async function (type = null, date = null) {
            if (!db) return [];
            try {
                // OPT: Limit to last 90 days + LIMIT 500 to prevent full-table downloads as activity_logs grows
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

                let query = db.from('activity_logs')
                    .select('id, user_email, action_type, details, view_date, driver_name, created_at')
                    .gte('created_at', ninetyDaysAgo.toISOString());
                if (type) query = query.eq('action_type', type);
                if (date) query = query.eq('view_date', date);

                const { data, error } = await query.order('created_at', { ascending: false }).limit(500);
                if (error) throw error;
                return data || [];
            } catch (err) {
                console.error("Error fetching activity logs:", err);
                return [];
            }
        };

        // --- DRIVER MANAGEMENT LOGIC ---
        let currentDrivers = [];
        window.openDriverManager = function () {
            document.getElementById('driver-manager-modal').style.display = 'flex';
            renderDriverManagerList();
        }
        window.closeDriverManager = function () {
            document.getElementById('driver-manager-modal').style.display = 'none';
        }

        window.openEmailSettings = function () {
            document.getElementById('ejs-public-key').value = localStorage.getItem('ejs_public_key') || '';
            document.getElementById('ejs-service-id').value = localStorage.getItem('ejs_service_id') || '';
            document.getElementById('ejs-template-id').value = localStorage.getItem('ejs_template_id') || '';
            document.getElementById('ejs-invoice-template-id').value = localStorage.getItem('ejs_invoice_template_id') || '';
            if (document.getElementById('ejs-yard-template-id')) document.getElementById('ejs-yard-template-id').value = localStorage.getItem('ejs_yard_template_id') || '';
            document.getElementById('email-settings-modal').style.display = 'block';
        }
        window.saveEmailSettings = function () {
            localStorage.setItem('ejs_public_key', document.getElementById('ejs-public-key').value.trim());
            localStorage.setItem('ejs_service_id', document.getElementById('ejs-service-id').value.trim());
            localStorage.setItem('ejs_template_id', document.getElementById('ejs-template-id').value.trim());
            localStorage.setItem('ejs_invoice_template_id', document.getElementById('ejs-invoice-template-id').value.trim());
            if (document.getElementById('ejs-yard-template-id')) localStorage.setItem('ejs_yard_template_id', document.getElementById('ejs-yard-template-id').value.trim());
            alert('Settings Saved Locally');
            closeEmailSettings();
        }
        window.closeEmailSettings = function () {
            document.getElementById('email-settings-modal').style.display = 'none';
        }

        // --- SMART IMPORTER LOGIC REMOVED ---

        async function loadDriversData(force = false) {
            if (!db) return;
            if (!force && currentDrivers && currentDrivers.length > 0) {
                refreshDriverSelects();
                if (window.populateDriverAuditList) window.populateDriverAuditList();
                return;
            }
            try {
                const { data, error } = await db.from('drivers').select('*').eq('is_deleted', false).order('name', { ascending: true });
                if (error) throw error;

                // One-time self-migration: If table is empty, seed from hardcoded list
                if (data.length === 0) {
                    const seed = ["LUIS GARRIDO", "ROBERT CORTEZ", "MILAY MIRANDA", "JORGE A RAMIREZ", "JOSE", "ANTONIO R CUBA", "TRAVIS JOSEY"];
                    const seedObjs = seed.map(n => ({ name: n }));
                    await db.from('drivers').insert(seedObjs);
                    return loadDriversData();
                }

                currentDrivers = data;
                window.currentDrivers = data;
                refreshDriverSelects();
                if (window.populateDriverAuditList) window.populateDriverAuditList();
            } catch (err) {
                console.error("Error loading drivers:", err);
            }
        }
        window.loadDriversData = loadDriversData;

        function refreshDriverSelects() {
            const sideSel = document.getElementById('in-driver');
            const filterSel = document.getElementById('f-driver');
            const reportFilterSel = document.getElementById('filter-search');

            const populate = (sel, isFilter = false) => {
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = isFilter ? '<option value="">All Drivers</option>' : '<option value="" disabled selected>Select Driver</option>';
                currentDrivers.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.name;
                    opt.textContent = d.name;
                    sel.appendChild(opt);
                });
                
                // Ensure the logged-in driver is always in the dropdown list
                const isDriverRole = (window.currentUserRole === 'driver');
                if (window.currentDriverNameRef && isDriverRole) {
                    const drvRef = window.currentDriverNameRef.toUpperCase().trim();
                    const exists = currentDrivers.some(d => (d.name || '').toUpperCase().trim() === drvRef);
                    if (!exists && drvRef !== "ROBERT CORTEZ") {
                        const opt = document.createElement('option');
                        opt.value = drvRef;
                        opt.textContent = drvRef;
                        sel.appendChild(opt);
                    }
                }
                
                // If it's a driver logged in, force their value (EXCEPT Robert Cortez)
                if (isFilter && sel.id === 'filter-search' && window.currentDriverNameRef && isDriverRole) {
                    const drvRef = (window.currentDriverNameRef || '').toUpperCase();
                    if (drvRef === "ROBERT CORTEZ") {
                        // Let him pick anything
                        if (currentVal) sel.value = currentVal;
                    } else {
                        sel.value = window.currentDriverNameRef;
                    }
                } else if (currentVal) {
                    sel.value = currentVal;
                }
            };

            populate(sideSel, false);
            populate(filterSel, true);
            populate(reportFilterSel, true);
            
            const expFilterDrv = document.getElementById('exp-filter-driver');
            if (expFilterDrv) populate(expFilterDrv, true);
            
            const docsFilterSel = document.getElementById('docs-driver-dropdown');
            if (docsFilterSel) {
                const currentVal = docsFilterSel.value;
                docsFilterSel.innerHTML = '<option value="">All Drivers</option>';
                currentDrivers.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.name;
                    opt.textContent = d.name;
                    docsFilterSel.appendChild(opt);
                });

                // Ensure the logged-in driver is in the docs dropdown list too
                const isDriverRole = (window.currentUserRole === 'driver');
                if (window.currentDriverNameRef && isDriverRole) {
                    const drvRef = window.currentDriverNameRef.toUpperCase().trim();
                    const exists = currentDrivers.some(d => (d.name || '').toUpperCase().trim() === drvRef);
                    if (!exists && drvRef !== "ROBERT CORTEZ") {
                        const opt = document.createElement('option');
                        opt.value = drvRef;
                        opt.textContent = drvRef;
                        docsFilterSel.appendChild(opt);
                    }
                }

                if (currentVal) docsFilterSel.value = currentVal;
            }

            // TRIGGER SYNC: This fixes the "UNASSIGNED" lag on startup
            if (window.syncDriverNames) window.syncDriverNames();
            if (window.renderDriverLog) window.renderDriverLog();
        }
        window.refreshDriverSelects = refreshDriverSelects;

        window.filterDriversByCompany = function() {
            const companySel = document.getElementById('in-company');
            const driverSel = document.getElementById('in-driver');
            if (!companySel || !driverSel) return;

            const company = companySel.value;
            const currentDriverVal = driverSel.value;
            
            // Re-populate driverSel from scratch based on filter
            driverSel.innerHTML = '<option value="" disabled selected>Select Driver</option>';
            
            const exclusiveDrivers = ["MILAY MIRANDA", "LUIS GARRIDO", "JORGE A RAMIREZ", "GREGORY CUTINO", "ROBERT CORTEZ"];
            
            let filteredDrivers = currentDrivers;
            if (company === 'RP TULIPAN' || company === 'JR SUPER CRANE') {
                filteredDrivers = currentDrivers.filter(d => exclusiveDrivers.includes(d.name.toUpperCase()) || d.name.toUpperCase() === "ROLY PEREZ");
            } else if (company === 'CONTRACTOR') {
                filteredDrivers = currentDrivers.filter(d => !exclusiveDrivers.includes(d.name.toUpperCase()));
            }

            filteredDrivers.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                opt.textContent = d.name;
                driverSel.appendChild(opt);
            });
            
            // Try to keep the previously selected driver if it still exists in the new list
            if (currentDriverVal && Array.from(driverSel.options).some(opt => opt.value === currentDriverVal)) {
                driverSel.value = currentDriverVal;
            } else {
                driverSel.value = "";
            }
        };

        function populateDriverAuditList() {
            const list = document.getElementById('fleet-drivers-list');
            if (!list) return;
            list.innerHTML = '';
            currentDrivers.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                list.appendChild(opt);
            });
        }
        window.populateDriverAuditList = populateDriverAuditList;

        function renderDriverManagerList() {
            const container = document.getElementById('driver-list-body');
            if (!container) return;
            container.innerHTML = '';
            currentDrivers.forEach(d => {
                const item = document.createElement('div');
                item.className = 'driver-item';
                item.innerHTML = `
                    <span>${d.name}</span>
                    ${(window.currentUserRole || '').toLowerCase().trim() === 'admin' ? `<button onclick="deleteDriver('${d.id}')" class="btn-del-driver" title="Delete Driver">
                        <i class="fas fa-trash-alt"></i>
                    </button>` : ''}
                `;
                container.appendChild(item);
            });
        }

        async function addNewDriver() {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot manage drivers.");
                return;
            }
            const input = document.getElementById('new-driver-name');
            const name = input.value.trim().toUpperCase();
            if (!name) return;

            try {
                const { error } = await db.from('drivers').insert([{ name: name }]);
                if (error) {
                    if (error.code === '23505') alert("Driver already exists!");
                    else throw error;
                }
                input.value = '';
                await loadDriversData(true);
                renderDriverManagerList();
            } catch (err) {
                console.error("Failed to add driver:", err);
                alert("Error adding driver.");
            }
        }
        window.addNewDriver = addNewDriver;

        async function deleteDriver(id) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') {
                alert("Only administrators can delete records.");
                return;
            }
            if (!confirm("Are you sure you want to remove this driver from the active list?")) return;
            try {
                const { error } = await db.from('drivers').delete().eq('id', id);
                if (error) throw error;
                if (window.logActivity) window.logActivity("DELETED_RECORD", `[${new Date().toLocaleString()}] Eliminó Chofer ID: ${id}`);
                await loadDriversData(true);
                renderDriverManagerList();
            } catch (err) {
                console.error("Failed to delete driver:", err);
            }
        }
        window.deleteDriver = deleteDriver;

        // --- CUSTOMER MANAGEMENT LOGIC ---
        let currentCustomers = [];
        window.openCustomerManager = function () {
            document.getElementById('customer-manager-modal').style.display = 'flex';
            renderCustomerManagerList();
        }
        window.closeCustomerManager = function () {
            if (window.cancelEditCustomer) window.cancelEditCustomer();
            document.getElementById('customer-manager-modal').style.display = 'none';
        }

        async function loadCustomersData(force = false) {
            if (!db) return;
            if (!force && currentCustomers && currentCustomers.length > 0) {
                refreshCustomerSelects();
                return;
            }
            try {
                const { data, error } = await db.from('customers').select('*').eq('is_deleted', false).order('name', { ascending: true });
                if (error) throw error;

                // One-time self-migration: If table is empty, seed from current static list
                if (data.length === 0) {
                    const seed = ["ANTONIO RENT", "RICHARD HAYNES", "MARK MORRINSON", "KEMOY", "GLOBAL CONTAINER & CHASSIS", "PROSTAR GROUP CONTAINER", "MAREX ROAD SERVICES", "ZUM SHIPPING"];
                    const seedObjs = seed.map(n => ({ name: n }));
                    await db.from('customers').insert(seedObjs);
                    return loadCustomersData();
                }

                currentCustomers = data;
                window.currentCustomers = data;
                refreshCustomerSelects();
            } catch (err) {
                console.error("Error loading customers:", err);
            }
        }
        window.loadCustomersData = loadCustomersData;

        function refreshCustomerSelects() {
            const sideSel = document.getElementById('in-customer-sel');
            const filterSel = document.getElementById('f-customer');

            const populate = (sel, isFilter = false) => {
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = isFilter ? '<option value="">All Customers</option>' : '<option value="" disabled selected>Select Customer</option>';
                currentCustomers.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    opt.textContent = c.name;
                    opt.dataset.email = c.email || '';
                    opt.dataset.address = c.address || '';
                    sel.appendChild(opt);
                });
                if (currentVal) sel.value = currentVal;
            };

            populate(sideSel, false);
            populate(filterSel, true);

            const docsCustSel = document.getElementById('docs-customer-dropdown');
            if (docsCustSel) {
                const currentVal = docsCustSel.value;
                docsCustSel.innerHTML = '<option value="">All Customers</option>';
                currentCustomers.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    opt.textContent = c.name;
                    docsCustSel.appendChild(opt);
                });
                if (currentVal) docsCustSel.value = currentVal;
            }

            if (window.populateYardCustomerSelect) {
                window.populateYardCustomerSelect();
            }

            // Auto-fill email and address when selecting a customer
            if (sideSel && !sideSel.dataset.listenerAdded) {
                sideSel.addEventListener('change', (e) => {
                    const opt = sideSel.options[sideSel.selectedIndex];
                    const email = opt.dataset.email;
                    
                    const emailField = document.getElementById('in-email');
                    if (emailField) {
                        emailField.value = email || '';
                    }
                });
                sideSel.dataset.listenerAdded = "true";
            }
            
            if (window.populateRentalCustomerSelect) window.populateRentalCustomerSelect();
        }

        function renderCustomerManagerList() {
            const container = document.getElementById('customer-list-body');
            if (!container) return;
            container.innerHTML = '';
            currentCustomers.forEach(c => {
                const item = document.createElement('div');
                item.className = 'driver-item'; // Reuse same styles
                item.innerHTML = `
                    <div style="display: flex; flex-direction: column; flex: 1; padding-right: 10px;">
                        <span style="font-size: 0.85rem; font-weight: bold;">${c.name}</span>
                        <span style="font-size: 0.7rem; color: #64748b; text-transform: lowercase; font-weight: normal;">${c.email || 'no email'}</span>
                        <span style="font-size: 0.7rem; color: #475569; font-weight: normal; margin-top: 2px;">${c.address || 'no address'}</span>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="startEditCustomer('${c.name.replace(/'/g, "\\'")}', '${(c.email || '').replace(/'/g, "\\'")}', '${(c.address || '').replace(/'/g, "\\'")}')" class="btn-del-driver" style="background: #e2e8f0; color: #3b82f6;" title="Edit Customer">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${(window.currentUserRole || '').toLowerCase().trim() === 'admin' ? `<button onclick="deleteCustomer('${c.name.replace(/'/g, "\\'")}')" class="btn-del-driver" title="Delete Customer">
                            <i class="fas fa-trash-alt"></i>
                        </button>` : ''}
                    </div>
                `;
                container.appendChild(item);
            });
        }

        let editingCustomerOriginalName = null;

        window.startEditCustomer = function(name, email, address) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot manage customers.");
                return;
            }
            
            editingCustomerOriginalName = name;
            
            const inputName = document.getElementById('new-customer-name');
            const inputEmail = document.getElementById('new-customer-email');
            const inputAddress = document.getElementById('new-customer-address');
            const btnAddUpdate = document.getElementById('btn-add-update-customer');
            const btnCancel = document.getElementById('btn-cancel-edit-customer');
            
            if (inputName) inputName.value = name;
            if (inputEmail) inputEmail.value = email;
            if (inputAddress) inputAddress.value = address;
            
            if (btnAddUpdate) {
                btnAddUpdate.textContent = 'UPDATE';
                btnAddUpdate.style.background = '#f59e0b';
            }
            if (btnCancel) {
                btnCancel.style.display = 'inline-block';
            }
            
            if (inputName) inputName.focus();
        };

        window.cancelEditCustomer = function() {
            editingCustomerOriginalName = null;
            
            const inputName = document.getElementById('new-customer-name');
            const inputEmail = document.getElementById('new-customer-email');
            const inputAddress = document.getElementById('new-customer-address');
            const btnAddUpdate = document.getElementById('btn-add-update-customer');
            const btnCancel = document.getElementById('btn-cancel-edit-customer');
            
            if (inputName) inputName.value = '';
            if (inputEmail) inputEmail.value = '';
            if (inputAddress) inputAddress.value = '';
            
            if (btnAddUpdate) {
                btnAddUpdate.textContent = 'ADD';
                btnAddUpdate.style.background = '#3b82f6';
            }
            if (btnCancel) {
                btnCancel.style.display = 'none';
            }
        };

        async function addNewCustomer() {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot manage customers.");
                return;
            }
            const input = document.getElementById('new-customer-name');
            const emailInput = document.getElementById('new-customer-email');
            const addressInput = document.getElementById('new-customer-address');
            
            const name = input.value.trim().toUpperCase();
            const email = emailInput ? emailInput.value.trim() : '';
            const address = addressInput ? addressInput.value.trim() : '';
            
            if (!name) return;

            try {
                if (editingCustomerOriginalName) {
                    const { data, error } = await db.from('customers').update({ name: name, email: email, address: address }).eq('name', editingCustomerOriginalName).select();
                    if (error) {
                        if (error.code === '23505') alert("Another customer with that name already exists!");
                        else throw error;
                        return;
                    }
                    if (!data || data.length === 0) {
                        throw new Error("No se pudo actualizar el cliente. Revise las políticas de UPDATE (RLS) en Supabase para la tabla 'customers'.");
                    }
                    cancelEditCustomer();
                } else {
                    const { error } = await db.from('customers').insert([{ name: name, email: email, address: address }]);
                    if (error) {
                        if (error.code === '23505') alert("Customer already exists!");
                        else throw error;
                        return;
                    }
                    input.value = '';
                    if (emailInput) emailInput.value = '';
                    if (addressInput) addressInput.value = '';
                }
                
                await loadCustomersData(true);
                renderCustomerManagerList();
            } catch (err) {
                console.error("Failed to save customer:", err);
                alert("Error saving customer: " + (err.message || "Unknown error"));
            }
        }
        window.addNewCustomer = addNewCustomer;



        async function deleteCustomer(name) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') {
                alert("Only administrators can delete records.");
                return;
            }
            if (!confirm("Are you sure you want to remove this customer from the active list?")) return;
            try {
                const { data, error } = await db.from('customers').delete().eq('name', name).select();
                if (error) throw error;
                if (window.logActivity) window.logActivity("DELETED_RECORD", `[${new Date().toLocaleString()}] Eliminó Cliente: ${name}`);
                if (!data || data.length === 0) {
                     alert("El cliente no se pudo eliminar. Revise las políticas de DELETE (RLS) en Supabase.");
                }
                await loadCustomersData(true);
                renderCustomerManagerList();
            } catch (err) {
                console.error("Failed to delete customer:", err);
            }
        }
        window.deleteCustomer = deleteCustomer;

        // --- PICKUP ADDRESS MANAGEMENT LOGIC ---
        let currentPickupAddresses = [];
        window.openPickupAddressManager = function () {
            document.getElementById('pickup-address-manager-modal').style.display = 'flex';
            renderPickupAddressManagerList();
        }
        window.closePickupAddressManager = function () {
            document.getElementById('pickup-address-manager-modal').style.display = 'none';
        }

        async function loadPickupAddressesData(force = false) {
            if (!db) return;
            if (!force && currentPickupAddresses && currentPickupAddresses.length > 0) {
                refreshPickupAddressSelects();
                return;
            }
            try {
                const { data, error } = await db.from('pickup_addresses').select('*').eq('is_deleted', false).order('name', { ascending: true });
                if (error) throw error;

                // Seed if empty
                if (data.length === 0) {
                    const seed = [
                        "10110 NW 95 AVE", "10110 NW 105 AVE MEDLEY FL 33178", "10400 NW 95 AVE MEDLEY FL 33178",
                        "10458 ALTA DR JACKSONVILLE FL 32226", "14300 SW 194 AVE MIAMI FL 33196", "18300 SW 158 ST MIAMI FL",
                        "19-3 HYATT AVE NEWARK NJ 07105", "219 SQUANKUM RD FAMINGDALE NJ 07727", "230 GUN CLUB RD JACKSONVILLE FL 32218",
                        "2545 NW 35TH ST MIAMI FL 33142", "2640 S 12 AVE TAMPA FL 33619", "295 DOREMUS AVE NEWARK 07105",
                        "32 SPIRIT LAKE RD WINTER HAVEN FL", "321 GRANGE RD SAVANNAG GA 31407", "3220 N COCOA BLVD COCOA FL 32926",
                        "3237CHEESEQUAKE RD OLD BRIDGE NJ 08857", "340 COMMERCE DR RINCON GA 31326", "3500 KING ST SUITE a, COCOA FL 32926",
                        "4050 MARITIME BLVD TAMPA FL 33605", "4135 OLD MCDOUNGH RD GA", "5107 RAWLS RD TAMPA FL 33624",
                        "6508 EAST LOMBARD ST BALTIMORE MD 21224", "6601 TICO RD TITUSVILLE FL 32780", "6890 NW 25 ST MIAMI FL 33122",
                        "8211 FISCHER RD BALTIMORE MD 21222", "8300 NW 87 AVE MEDLEY FL 33166", "8421 NW 70 ST MIAMI FL 33166",
                        "8831 MONCRIEF-DISMORE RD JACKSONVILLE FL 32219", "9801 NW 106 ST MEDLEY FL 33178", "9804 NW 80 AVE HIALEAH FL 33106",
                        "ACE STEVEDORING", "BRADENTON", "CONGLOBAL JAX", "CONT MAINTENANCE", "DORAL", "FIT TERMINAL", "FLCHR YARD",
                        "GENERAL TRANS DEPO", "MARITIME CONT", "MIAMI CONT", "OKECHOBEE", "QUALITY CONT", "SOLO DEPOT", "ST CLOUD", "TRUCK YARD"
                    ];
                    const seedObjs = seed.map(n => ({ name: n }));
                    await db.from('pickup_addresses').insert(seedObjs);
                    return loadPickupAddressesData();
                }

                currentPickupAddresses = data;
                refreshPickupAddressSelects();
            } catch (err) {
                console.error("Error loading pickup addresses:", err);
            }
        }
        window.loadPickupAddressesData = loadPickupAddressesData;

        function refreshPickupAddressSelects() {
            const sideSel = document.getElementById('in-pickup-sel');
            const releaseSel = document.getElementById('rel-address');
            const filterSel = document.getElementById('f-pickup');

            const populate = (sel) => {
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = `<option value="" disabled selected>${sel.id === 'rel-address' ? 'Select Depot Address' : 'Select Pickup Address'}</option>`;
                currentPickupAddresses.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.name;
                    opt.textContent = a.name;
                    sel.appendChild(opt);
                });
                if (currentVal) sel.value = currentVal;
            };

            populate(sideSel);
            populate(releaseSel);
            populate(filterSel);

            // AUTO-SYNC DEPOT NAME: When selecting an address, show it in the DEPOT text field
            if (releaseSel && !releaseSel.dataset.listener) {
                releaseSel.addEventListener('change', () => {
                    const depotInput = document.getElementById('rel-depot');
                    if (depotInput) {
                        depotInput.value = releaseSel.value;
                        // trigger animation or highlight to show it was updated
                        depotInput.style.backgroundColor = '#fff7ed';
                        setTimeout(() => depotInput.style.backgroundColor = '', 500);
                    }
                });
                releaseSel.dataset.listener = "true";
            }
        }

        function renderPickupAddressManagerList() {
            const container = document.getElementById('pickup-address-list-body');
            if (!container) return;
            container.innerHTML = '';
            currentPickupAddresses.forEach(a => {
                const item = document.createElement('div');
                item.className = 'driver-item';
                item.innerHTML = `
                    <span>${a.name}</span>
                    ${(window.currentUserRole || '').toLowerCase().trim() === 'admin' ? `<button onclick="deletePickupAddress('${a.id}')" class="btn-del-driver" title="Delete Address">
                        <i class="fas fa-trash-alt"></i>
                    </button>` : ''}
                `;
                container.appendChild(item);
            });
        }

        async function addNewPickupAddress() {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot manage pickup addresses.");
                return;
            }
            const input = document.getElementById('new-pickup-address-name');
            const name = input.value.trim().toUpperCase();
            if (!name) return;

            try {
                const { error } = await db.from('pickup_addresses').insert([{ name: name }]);
                if (error) {
                    if (error.code === '23505') alert("Address already exists!");
                    else throw error;
                }
                input.value = '';
                await loadPickupAddressesData(true);
                renderPickupAddressManagerList();
            } catch (err) {
                console.error("Failed to add address:", err);
                alert("Error adding address: " + (err.message || "Unknown error"));
            }
        }
        window.addNewPickupAddress = addNewPickupAddress;

        async function deletePickupAddress(id) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') {
                alert("Only administrators can delete records.");
                return;
            }
            if (!confirm("Are you sure you want to remove this address from the active list?")) return;
            try {
                const { error } = await db.from('pickup_addresses').delete().eq('id', id);
                if (error) throw error;
                if (window.logActivity) window.logActivity("DELETED_RECORD", `[${new Date().toLocaleString()}] Eliminó Pickup Address ID: ${id}`);
                await loadPickupAddressesData(true);
                renderPickupAddressManagerList();
            } catch (err) {
                console.error("Failed to delete address:", err);
            }
        }
        window.deletePickupAddress = deletePickupAddress;

        // --- DELIVERY PLACE MANAGEMENT LOGIC ---
        let currentDeliveryAddresses = [];
        window.openDeliveryAddressManager = function () {
            document.getElementById('delivery-address-manager-modal').style.display = 'flex';
            renderDeliveryAddressManagerList();
        }
        window.closeDeliveryAddressManager = function () {
            document.getElementById('delivery-address-manager-modal').style.display = 'none';
        }

        async function loadDeliveryAddressesData(force = false) {
            if (!db) return;
            if (!force && currentDeliveryAddresses && currentDeliveryAddresses.length > 0) {
                refreshDeliveryAddressSelects();
                return;
            }
            try {
                const { data, error } = await db.from('delivery_addresses').select('*').eq('is_deleted', false).order('name', { ascending: true });
                if (error) throw error;

                // Optionally seed if empty like other managers, but we'll leave it empty to start
                currentDeliveryAddresses = data || [];
                refreshDeliveryAddressSelects();
            } catch (err) {
                console.error("Error loading delivery addresses:", err);
            }
        }
        window.loadDeliveryAddressesData = loadDeliveryAddressesData;

        function refreshDeliveryAddressSelects() {
            const deliverySel = document.getElementById('in-delivery-sel');
            if (!deliverySel) return;
            const currentVal = deliverySel.value;
            deliverySel.innerHTML = `<option value="" disabled selected>Select Delivery Place</option>`;
            currentDeliveryAddresses.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.name;
                opt.textContent = a.name;
                deliverySel.appendChild(opt);
            });
            if (currentVal) deliverySel.value = currentVal;
        }

        function renderDeliveryAddressManagerList() {
            const container = document.getElementById('delivery-address-list-body');
            if (!container) return;
            container.innerHTML = '';
            currentDeliveryAddresses.forEach(a => {
                const item = document.createElement('div');
                item.className = 'driver-item';
                item.innerHTML = `
                    <span>${a.name}</span>
                    ${(window.currentUserRole || '').toLowerCase().trim() === 'admin' ? `<button onclick="deleteDeliveryAddress('${a.id}')" class="btn-del-driver" title="Delete Address">
                        <i class="fas fa-trash-alt"></i>
                    </button>` : ''}
                `;
                container.appendChild(item);
            });
        }

        async function addNewDeliveryAddress() {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot manage delivery addresses.");
                return;
            }
            const input = document.getElementById('new-delivery-address-name');
            const name = input.value.trim().toUpperCase();
            if (!name) return;

            try {
                const { error } = await db.from('delivery_addresses').insert([{ name: name }]);
                if (error) {
                    if (error.code === '23505') alert("Address already exists!");
                    else throw error;
                }
                input.value = '';
                await loadDeliveryAddressesData(true);
                renderDeliveryAddressManagerList();
            } catch (err) {
                console.error("Failed to add address:", err);
                alert("Error adding address: " + (err.message || "Unknown error"));
            }
        }
        window.addNewDeliveryAddress = addNewDeliveryAddress;

        async function deleteDeliveryAddress(id) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') {
                alert("Only administrators can delete records.");
                return;
            }
            if (!confirm("Are you sure you want to remove this address from the active list?")) return;
            try {
                const { error } = await db.from('delivery_addresses').delete().eq('id', id);
                if (error) throw error;
                if (window.logActivity) window.logActivity("DELETED_RECORD", `[${new Date().toLocaleString()}] Eliminó Delivery Address ID: ${id}`);
                await loadDeliveryAddressesData(true);
                renderDeliveryAddressManagerList();
            } catch (err) {
                console.error("Failed to delete address:", err);
            }
        }
        window.deleteDeliveryAddress = deleteDeliveryAddress;

        // --- DEPOT MANAGEMENT LOGIC ---
        let currentDepots = [];
        window.openDepotManager = function () {
            document.getElementById('depot-manager-modal').style.display = 'flex';
            renderDepotManagerList();
        }
        window.closeDepotManager = function () {
            document.getElementById('depot-manager-modal').style.display = 'none';
        }

        async function loadDepotsData(force = false) {
            if (!db) return;
            if (!force && currentDepots && currentDepots.length > 0) {
                refreshDepotSelects();
                return;
            }
            try {
                const { data, error } = await db.from('depots').select('*').eq('is_deleted', false).order('name', { ascending: true });
                if (error) throw error;

                // One-time self-migration: Seed if empty
                if (data.length === 0) {
                    const seed = [
                        "SOLO DEPOT", "FIT", "SOUTH FLORIDA", "SEABOARD", "MIAMI CONTAINER", "SEABOARD MARINE", "QUALITY CONTAINER", "DELIVERED", "ALVARO YARD",
                        "ORIAN YARD", "PARTICULAR", "KING OCEAN PORT", "SF INTERMODAL OPA LOCKA", "TITUSVILLE", "GET BUY", "MARITIME CONTAINER", "BLUE LINE EQUIPMENT",
                        "CMC DEPOT", "GENERAL TRANSPORT SERVICE", "GOLD COAST", "CONGLOBAL SAV", "CRIST CONT DEPOT", "ACE STEVEDORING", "CMC-RINCON-SAV",
                        "CONGLOBAL MONCRIEF DISMORE", "CONGLOBAL ALTA DR", "PICORP INC BALTIMORE", "PORT OF TAMPA"
                    ];
                    const seedObjs = seed.map(n => ({ name: n }));
                    await db.from('depots').insert(seedObjs);
                    return loadDepotsData();
                }

                currentDepots = data;
                refreshDepotSelects();
            } catch (err) {
                console.error("Error loading depots:", err);
            }
        }
        window.loadDepotsData = loadDepotsData;

        function refreshDepotSelects() {
            const relSel = document.getElementById('rel-depot');
            const relFilterSel = document.getElementById('rf-depot');

            const populate = (sel, hasAll = false) => {
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = hasAll ? '<option value="">ALL</option>' : '<option value="" disabled selected>Select Depot</option>';
                currentDepots.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.name;
                    opt.textContent = d.name;
                    sel.appendChild(opt);
                });
                if (currentVal) sel.value = currentVal;
            };

            populate(relSel);
            populate(relFilterSel, true);
        }

        function renderDepotManagerList() {
            const container = document.getElementById('depot-list-body');
            if (!container) return;
            container.innerHTML = '';
            currentDepots.forEach(d => {
                const item = document.createElement('div');
                item.className = 'driver-item';
                item.innerHTML = `
                    <span>${d.name}</span>
                    ${(window.currentUserRole || '').toLowerCase().trim() === 'admin' ? `<button onclick="deleteDepot('${d.id}')" class="btn-del-driver" title="Delete Depot">
                        <i class="fas fa-trash-alt"></i>
                    </button>` : ''}
                `;
                container.appendChild(item);
            });
        }

        async function addNewDepot() {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot manage depots.");
                return;
            }
            const input = document.getElementById('new-depot-name');
            const name = input.value.trim().toUpperCase();
            if (!name) return;

            try {
                const { error } = await db.from('depots').insert([{ name: name }]);
                if (error) {
                    if (error.code === '23505') alert("Depot already exists!");
                    else throw error;
                }
                input.value = '';
                await loadDepotsData(true);
                renderDepotManagerList();
            } catch (err) {
                console.error("Failed to add depot:", err);
                alert("Error adding depot.");
            }
        }
        window.addNewDepot = addNewDepot;

        async function deleteDepot(id) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') {
                alert("Only administrators can delete records.");
                return;
            }
            if (!confirm("Are you sure you want to remove this depot?")) return;
            try {
                const { error } = await db.from('depots').delete().eq('id', id);
                if (error) throw error;
                if (window.logActivity) window.logActivity("DELETED_RECORD", `[${new Date().toLocaleString()}] Eliminó Depot ID: ${id}`);
                await loadDepotsData(true);
                renderDepotManagerList();
            } catch (err) {
                console.error("Failed to delete depot:", err);
            }
        }
        window.deleteDepot = deleteDepot;

        // --- SELLER MANAGEMENT LOGIC ---
        let currentSellers = [];
        window.openSellerManager = function () {
            document.getElementById('seller-manager-modal').style.display = 'flex';
            renderSellerManagerList();
        }
        window.closeSellerManager = function () {
            document.getElementById('seller-manager-modal').style.display = 'none';
        }

        async function loadSellersData(force = false) {
            if (!db) return;
            if (!force && currentSellers && currentSellers.length > 0) {
                refreshSellerSelects();
                if (window.updateCallSellerDropdown) window.updateCallSellerDropdown();
                return;
            }
            try {
                const { data, error } = await db.from('sellers').select('*').eq('is_deleted', false).order('name', { ascending: true });
                if (error) throw error;

                // One-time self-migration: Seed if empty
                if (data.length === 0) {
                    const seed = [
                        "ALBARO", "GN CONTAINERS", "PARTICULAR", "NORTH ATLANTIC", "GRAND PACIFIC", "GLOBAL CONTAINER", "BLUE SKY",
                        "SF INTERMODAL", "QUALITY TITUSVILLE", "CCP CONTAINER", "FLORENS", "ECOTAINER", "DINA'S CONTAINER", "JORGE PERUANO",
                        "NICK ANGEL", "SEACO", "ELIO", "NORGE", "YOSVANY", "JAIDEN TRANSPORT", "PAINT", "CARU CONT", "PAINT PURCHASE",
                        "PAINT LABOR", "NOMINA OFFICE", "SALARY", "ORBION CONTAINERS", "NOMINA", "RIO CONTAINER", "YXBOXX", "FLCHR"
                    ];
                    const seedObjs = seed.map(n => ({ name: n }));
                    await db.from('sellers').insert(seedObjs);
                    return loadSellersData();
                }

                currentSellers = data;
                window.currentSellers = data;
                refreshSellerSelects();
                if (window.updateCallSellerDropdown) window.updateCallSellerDropdown();
            } catch (err) {
                console.error("Error loading sellers:", err);
            }
        }
        window.loadSellersData = loadSellersData;

        function refreshSellerSelects() {
            const relSel = document.getElementById('rel-seller');
            const relFilterSel = document.getElementById('rf-seller');

            const populate = (sel, hasAll = false) => {
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = hasAll ? '<option value="">All Sellers</option>' : '<option value="" disabled selected>Select Seller</option>';
                currentSellers.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.name;
                    opt.textContent = s.name;
                    sel.appendChild(opt);
                });
                if (currentVal) sel.value = currentVal;
            };

            populate(relSel);
            populate(relFilterSel, true);
        }

        // --- STAFF PROFILES LOGIC (For Delivery Calendar Employee Field) ---
        let currentStaff = [];
        async function loadStaffProfiles(force = false) {
            if (!db) return;
            if (!force && currentStaff && currentStaff.length > 0) {
                refreshStaffSelects();
                return;
            }
            try {
                const { data, error } = await db.from('profiles')
                    .select('email, role')
                    .in('role', ['admin', 'ADMIN', 'employee', 'EMPLOYEE', 'staff', 'STAFF', 'student', 'STUDENT'])
                    .order('email');
                if (error) throw error;
                currentStaff = data || [];
                refreshStaffSelects();
            } catch (err) {
                console.error("Error loading staff profiles:", err);
            }
        }
        window.loadStaffProfiles = loadStaffProfiles;

        function refreshStaffSelects() {
            const calSellerSel = document.getElementById('in-seller');
            const calSellerFilter = document.getElementById('f-seller-cal');

            const populate = (sel, hasAll = false) => {
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = hasAll ? '<option value="">All Employees</option>' : '<option value="" disabled selected>Select Employee...</option>';
                currentStaff.forEach(p => {
                    if (p.email) {
                        const opt = document.createElement('option');
                        opt.value = p.email;
                        opt.textContent = p.email.split('@')[0].toUpperCase();
                        sel.appendChild(opt);
                    }
                });
                if (currentVal) sel.value = currentVal;
            };

            populate(calSellerSel);
            populate(calSellerFilter, true);
        }

        function renderSellerManagerList() {
            const container = document.getElementById('seller-list-body');
            if (!container) return;
            container.innerHTML = '';
            currentSellers.forEach(s => {
                const item = document.createElement('div');
                item.className = 'driver-item';
                item.innerHTML = `
                    <span>${s.name}</span>
                    ${(window.currentUserRole || '').toLowerCase().trim() === 'admin' ? `<button onclick="deleteSeller('${s.id}')" class="btn-del-driver" title="Delete Seller">
                        <i class="fas fa-trash-alt"></i>
                    </button>` : ''}
                `;
                container.appendChild(item);
            });
        }

        async function addNewSeller() {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot manage sellers.");
                return;
            }
            const input = document.getElementById('new-seller-name');
            const name = input.value.trim().toUpperCase();
            if (!name) return;

            try {
                const { error } = await db.from('sellers').insert([{ name: name }]);
                if (error) {
                    if (error.code === '23505') alert("Seller already exists!");
                    else throw error;
                }
                input.value = '';
                await loadSellersData(true);
                renderSellerManagerList();
            } catch (err) {
                console.error("Failed to add seller:", err);
                alert("Error adding seller.");
            }
        }
        window.addNewSeller = addNewSeller;

        async function deleteSeller(id) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') {
                alert("Only administrators can delete records.");
                return;
            }
            if (!confirm("Are you sure you want to remove this seller?")) return;
            try {
                const { error } = await db.from('sellers').delete().eq('id', id);
                if (error) throw error;
                if (window.logActivity) window.logActivity("DELETED_RECORD", `[${new Date().toLocaleString()}] Eliminó Seller ID: ${id}`);
                await loadSellersData(true);
                renderSellerManagerList();
            } catch (err) {
                console.error("Failed to delete seller:", err);
            }
        }
        window.deleteSeller = deleteSeller;

        // --- COMPANY MANAGEMENT LOGIC ---

        let currentCompanies = [];
        window.openCompanyManager = function () {
            document.getElementById('company-manager-modal').style.display = 'flex';
            renderCompanyManagerList();
        }
        window.closeCompanyManager = function () {
            document.getElementById('company-manager-modal').style.display = 'none';
        }

        async function loadCompaniesData() {
            if (!db) return;
            try {
                const { data, error } = await db.from('companies').select('*').eq('is_deleted', false).order('name', { ascending: true });
                if (error) throw error;

                // Seed if empty
                if (data.length === 0) {
                    const seed = ["RP TULIPAN", "JR SUPER CRANE", "CONTRACTOR", "ONLY SALES"];
                    const seedObjs = seed.map(n => ({ name: n }));
                    await db.from('companies').insert(seedObjs);
                    return loadCompaniesData();
                }

                currentCompanies = data;
                window.currentCompanies = data;
                refreshCompanySelects();
            } catch (err) {
                console.error("Error loading companies:", err);
            }
        }
        window.loadCompaniesData = loadCompaniesData;

        function refreshCompanySelects() {
            const sideSel = document.getElementById('in-company');
            const filterSel = document.getElementById('f-company');

            const populate = (sel, isFilter = false) => {
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = isFilter ? '<option value="">All Companies</option>' : '<option value="" disabled selected>Select Company</option>';
                currentCompanies.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    opt.textContent = c.name;
                    sel.appendChild(opt);
                });
                if (currentVal) sel.value = currentVal;
            };

            populate(sideSel, false);
            populate(filterSel, true);
        }

        function renderCompanyManagerList() {
            const container = document.getElementById('company-list-body');
            if (!container) return;
            container.innerHTML = '';
            currentCompanies.forEach(c => {
                const item = document.createElement('div');
                item.className = 'driver-item';
                item.innerHTML = `
                    <span>${c.name}</span>
                    ${(window.currentUserRole || '').toLowerCase().trim() === 'admin' ? `<button onclick="deleteCompany('${c.id}')" class="btn-del-driver" title="Delete Company">
                        <i class="fas fa-trash-alt"></i>
                    </button>` : ''}
                `;
                container.appendChild(item);
            });
        }

        async function addNewCompany() {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot manage companies.");
                return;
            }
            const input = document.getElementById('new-company-name');
            const name = input.value.trim().toUpperCase();
            if (!name) return;

            try {
                const { error } = await db.from('companies').insert([{ name: name }]);
                if (error) {
                    if (error.code === '23505') alert("Company already exists!");
                    else throw error;
                }
                input.value = '';
                await loadCompaniesData();
                renderCompanyManagerList();
            } catch (err) {
                console.error("Failed to add company:", err);
                alert("Error adding company: " + (err.message || "Unknown error"));
            }
        }
        window.addNewCompany = addNewCompany;

        async function deleteCompany(id) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') {
                alert("Only administrators can delete records.");
                return;
            }
            if (!confirm("Are you sure you want to remove this company from the active list?")) return;
            try {
                const { error } = await db.from('companies').delete().eq('id', id);
                if (error) throw error;
                if (window.logActivity) window.logActivity("DELETED_RECORD", `[${new Date().toLocaleString()}] Eliminó Company ID: ${id}`);
                await loadCompaniesData();
                renderCompanyManagerList();
            } catch (err) {
                console.error("Failed to delete company:", err);
            }
        }
        window.deleteCompany = deleteCompany;


        // --- CONTAINER SIZE MANAGEMENT LOGIC ---
        let currentContainerSizes = [];
        window.loadContainerSizesData = async function () {
            try {
                // Hardcoded defaults to ensure the user never sees an empty list
                const defaults = ["20' STD", "20' HC", "20' DD", "20' OS", "40' STD", "40' HC", "40' DD", "40' OS", "45' HC"];
                
                const { data, error } = await db.from('container_sizes').select('*').eq('is_deleted', false).order('name', { ascending: true });
                
                if (error) {
                    console.error("Supabase error loading sizes:", error);
                    // Fallback to defaults on error
                    currentContainerSizes = defaults.map((s, i) => ({ id: i, name: s }));
                } else if (!data || data.length === 0) {
                    // Table is empty, seed it
                    const seedObjs = defaults.map(s => ({ name: s }));
                    await db.from('container_sizes').insert(seedObjs);
                    // Reload to get real IDs
                    const { data: freshData } = await db.from('container_sizes').select('*').order('name', { ascending: true });
                    currentContainerSizes = (freshData && freshData.length > 0) ? freshData : defaults.map((s, i) => ({ id: i, name: s }));
                } else {
                    currentContainerSizes = data;
                }
                
                updateSizeDropdowns();
            } catch (err) {
                console.error("Critical error in loadContainerSizesData:", err);
            }
        };

        function updateSizeDropdowns() {
            const relSide = document.getElementById('rel-size-detail');
            const relFilt = document.getElementById('rf-size');
            const tripSide = document.getElementById('in-size-sel');
            const tripFilt = document.getElementById('f-size');
            
            const populate = (sel, isFilter) => {
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = isFilter ? '<option value="">ALL SIZES</option>' : '<option value="" disabled selected>Choose Size...</option>';
                currentContainerSizes.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.name;
                    opt.textContent = s.name;
                    sel.appendChild(opt);
                });
                if (currentVal) sel.value = currentVal;
            };

            populate(relSide, false);
            populate(relFilt, true);
            populate(tripSide, false);
            populate(tripFilt, true);
        }

        window.openSizeManager = function () {
            document.getElementById('size-manager-modal').style.display = 'flex';
            renderSizeManagerList();
        };
        window.closeSizeManager = function () {
            document.getElementById('size-manager-modal').style.display = 'none';
        };

        function renderSizeManagerList() {
            const container = document.getElementById('size-list-body');
            if (!container) return;
            container.innerHTML = '';
            currentContainerSizes.forEach(s => {
                const item = document.createElement('div');
                item.className = 'driver-item';
                item.innerHTML = `
                    <span>${s.name}</span>
                    ${(window.currentUserRole || '').toLowerCase().trim() === 'admin' ? `<button onclick="deleteContainerSize('${s.id}')" class="btn-del-driver" title="Delete Size">
                        <i class="fas fa-trash-alt"></i>
                    </button>` : ''}
                `;
                container.appendChild(item);
            });
        }

        window.addNewContainerSize = async function () {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot manage container sizes.");
                return;
            }
            const input = document.getElementById('new-size-name');
            const name = input.value.trim().toUpperCase();
            if (!name) return;
            try {
                const { error } = await db.from('container_sizes').insert([{ name: name }]);
                if (error) throw error;
                input.value = '';
                await loadContainerSizesData();
                renderSizeManagerList();
            } catch (err) {
                alert("Error adding size: " + err.message);
            }
        };

        window.deleteContainerSize = async function (id) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') {
                alert("Only administrators can delete records.");
                return;
            }
            if (!confirm("Are you sure you want to delete this size option?")) return;
            try {
                const { error } = await db.from('container_sizes').delete().eq('id', id);
                if (error) throw error;
                if (window.logActivity) window.logActivity("DELETED_RECORD", `[${new Date().toLocaleString()}] Eliminó Container Size ID: ${id}`);
                await loadContainerSizesData();
                renderSizeManagerList();
            } catch (err) {
                console.error("Delete err:", err);
            }
        };
        // --- EXPENSE CATEGORY MANAGEMENT LOGIC ---
        let currentExpenseCategories = [];

        window.loadExpenseCategoriesData = async function () {
            if (!db) return;
            try {
                // 1. Load current categories from Supabase
                const { data, error } = await db.from('expense_categories').select('*').eq('is_deleted', false).order('name', { ascending: true });

                if (error) {
                    console.error("Supabase error loading categories:", error);
                    const defaults = ["Fuel", "Service/Repairs", "Tolls", "Insurance", "Payroll", "Utilities", "Taxes/Licenses", "Other"];
                    currentExpenseCategories = defaults.map((name, i) => ({ id: i, name }));
                    refreshExpenseCategorySelects();
                    return;
                }

                let finalCategories = dbData || [];
                const isAdmin = (window.currentUserRole || '').toLowerCase().trim() === 'admin';

                // 2. Check if we have local categories to migrate/sync - ADMIN ONLY
                if (isAdmin) {
                    try {
                        const localRaw = localStorage.getItem('rp_expense_categories');
                        if (localRaw) {
                            const localData = JSON.parse(localRaw);
                            if (Array.isArray(localData) && localData.length > 0) {
                                const missingInDb = localData.filter(localCat =>
                                    !finalCategories.some(dbCat => dbCat.name.toLowerCase() === localCat.name.toLowerCase())
                                );

                                if (missingInDb.length > 0) {
                                    console.log(`Syncing ${missingInDb.length} local categories to Supabase...`);
                                    const toInsert = missingInDb.map(c => ({ name: c.name }));
                                    // OPT: Use .select() on insert to get IDs back directly, avoids a second query
                                    const { data: insertedData, error: syncError } = await db.from('expense_categories').insert(toInsert).select();
                                    if (!syncError && insertedData) {
                                        finalCategories = [...finalCategories, ...insertedData].sort((a, b) => a.name.localeCompare(b.name));
                                    } else if (syncError) {
                                        console.error("Failed to sync local categories:", syncError);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Could not sync local categories:", e);
                    }

                    // 3. If still empty (new DB), seed with defaults - ADMIN ONLY
                    if (finalCategories.length === 0) {
                        const defaults = ["Fuel", "Service/Repairs", "Tolls", "Insurance", "Payroll", "Utilities", "Taxes/Licenses", "Other"];
                        const seedObjs = defaults.map(name => ({ name: name }));
                        const { data: seededData } = await db.from('expense_categories').insert(seedObjs).select();
                        finalCategories = seededData || finalCategories;
                    }
                }

                currentExpenseCategories = finalCategories;
                refreshExpenseCategorySelects();
            } catch (err) {
                console.error("Critical error in loadExpenseCategoriesData:", err);
            }
        };



        function refreshExpenseCategorySelects() {
            const expSel = document.getElementById('exp-category');
            const expFilt = document.getElementById('exp-filter-category');
            
            const populate = (sel, isFilter) => {
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = isFilter ? '<option value="">All Categories</option>' : '<option value="" disabled selected>Select Category...</option>';
                currentExpenseCategories.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.name;
                    opt.textContent = s.name;
                    sel.appendChild(opt);
                });
                if (currentVal) sel.value = currentVal;
            };

            populate(expSel, false);
            populate(expFilt, true);
        }

        window.openExpenseCategoryManager = function () {
            document.getElementById('expense-category-manager-modal').style.display = 'flex';
            renderExpenseCategoryManagerList();
        };
        window.closeExpenseCategoryManager = function () {
            document.getElementById('expense-category-manager-modal').style.display = 'none';
        };

        function renderExpenseCategoryManagerList() {
            const container = document.getElementById('expense-category-list-body');
            if (!container) return;
            container.innerHTML = '';
            currentExpenseCategories.forEach(s => {
                const item = document.createElement('div');
                item.className = 'driver-item';
                item.innerHTML = `
                    <span>${s.name}</span>
                    ${(window.currentUserRole || '').toLowerCase().trim() === 'admin' ? `<button onclick="deleteExpenseCategory('${s.id}')" class="btn-del-driver" title="Delete Category">
                        <i class="fas fa-trash-alt"></i>
                    </button>` : ''}
                `;
                container.appendChild(item);
            });
        }

        window.addNewExpenseCategory = async function () {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot manage expense categories.");
                return;
            }
            const input = document.getElementById('new-expense-category-name');
            const name = input.value.trim();
            if (!name) return;

            try {
                // Check for duplicates locally
                if (currentExpenseCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
                    alert('This category already exists.');
                    return;
                }

                const { error } = await db.from('expense_categories').insert([{ name: name }]);
                if (error) throw error;

                input.value = '';
                await loadExpenseCategoriesData();
                renderExpenseCategoryManagerList();
            } catch (err) {
                console.error("Failed to add category:", err);
                alert("Error adding category: " + (err.message || "Unknown error"));
            }
        };

        window.deleteExpenseCategory = async function (id) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role !== 'admin') {
                alert("Only administrators can delete records.");
                return;
            }
            if (!confirm("Are you sure you want to delete this category?")) return;
            try {
                const { error } = await db.from('expense_categories').delete().eq('id', id);
                if (error) throw error;
                if (window.logActivity) window.logActivity("DELETED_RECORD", `[${new Date().toLocaleString()}] Eliminó Expense Category ID: ${id}`);
                await loadExpenseCategoriesData();
                renderExpenseCategoryManagerList();
            } catch (err) {
                console.error("Failed to delete category:", err);
                alert("Error deleting category.");
            }
        };



        function calculateFinalPay(company, grossPay) {
            if (company === 'RP TULIPAN' || company === 'JR SUPER CRANE') {
                return grossPay * 0.3;
            }
            return grossPay;
        }

        // --- UI STATE ---
        window.currentTrips = []; // Cache from Supabase
        window.currentReleases = []; // Cache from Supabase
        window.currentExpenses = []; // Cache from Supabase
        window.currentFleet = []; // Cache from Supabase
        let editingReleaseId = null;

        function newTripIdForDb() {
            return crypto.randomUUID();
        }
        window.newTripIdForDb = newTripIdForDb;

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
                status: f.status,
                last_driver: f.last_driver || 'N/A',
                lastUpdate: f.last_update_date || f.updated_at,
                note: f.note,
                lastInspection: f.last_inspection_date || '',
                lastGeneralMiles: f.last_general_maintenance_miles || 0,
                oilInterval: f.oil_interval || 8000,
                genInterval: f.general_interval || 24000
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
                status: u.status,
                last_driver: u.last_driver || null,
                last_update_date: u.lastUpdate || new Date().toISOString(),
                note: u.note || null,
                last_inspection_date: u.lastInspection === '' ? null : u.lastInspection,
                last_general_maintenance_miles: parseInt(u.lastGeneralMiles) || 0,
                oil_interval: parseInt(u.oilInterval) || 8000,
                general_interval: parseInt(u.genInterval) || 24000
            };
        }

        // --- EXPENSE DATA MAPPERS ---
        function mapExpenseToArray(e) {
            return [
                e.date || '---', e.category || '---', e.description || '---',
                `$${(e.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, e.note || '---',
                e.id,
                e.payment_method || 'cash' // Index 6: 'cash' | 'bank'
            ];
        }

        function mapArrayToExpense(row) {
            return {
                date: (row[0] === '---' || !row[0]) ? null : row[0],
                category: row[1],
                description: row[2],
                amount: parseFloat(row[3].replace('$', '').replace(/,/g, '')) || 0,
                note: row[4],
                payment_method: row[6] || 'cash'
            };
        }

        // --- RELEASE DATA MAPPERS ---
        function mapReleaseToArray(r) {
            return [
                r.release_no, r.date, r.type || 'EMPTY', r.condition || 'USED', r.depot || '---', r.depot_address || '---',
                r.city || '---', r.qty_20 || 0, r.price_20 || 0, r.qty_40 || 0, r.price_40 || 0,
                r.qty_45 || 0, r.price_45 || 0, r.seller || '---', r.total_stock || 0, r.id,
                r.container_size || '---',
                r.paid || false, // Index 17
                r.is_cash || false, // Index 18
                r.created_by || '---', // Index 19
                r.note || '---' // Index 20
            ];
        }

        function mapArrayToRelease(row) {
            return {
                id: row[15],
                release_no: row[0],
                date: row[1],
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
                total_stock: parseInt(row[14]) || 0,
                container_size: row[16] || '---',
                paid: row[17] || false,
                is_cash: row[18] || false,
                created_by: row[19] || null,
                note: row[20] || null
            };
        }

        window.mapReleaseToArray = mapReleaseToArray;
        window.mapArrayToRelease = mapArrayToRelease;
