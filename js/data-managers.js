        // --- ACTIVITY LOGGING LOGIC ---
        window.logActivity = async function (actionType, details = null, viewDate = null) {
            if (!db) return;
            try {
                const { data: { session } } = await db.auth.getSession();
                if (!session) return;

                const user = session.user;
                const email = user.email;
                
                // Get name from profiles table
                const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single();
                
                // Tiered name fallback:
                let driverName = profile?.driver_name_ref || profile?.full_name || profile?.name || email.split('@')[0];
                
                // Final safety:
                if (!driverName || driverName === 'null') {
                    driverName = email.split('@')[0] || "Unknown";
                }

                const { error } = await db.from('activity_logs').insert([{
                    user_email: email.trim(),
                    action_type: actionType,
                    details: details,
                    view_date: viewDate,
                    driver_name: driverName.toString().trim()
                }]);
                
                if (error) throw error;
                console.log(`Activity logged (v900): ${actionType} for ${driverName}`);
                
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
                let query = db.from('activity_logs').select('*');
                if (type) query = query.eq('action_type', type);
                if (date) query = query.eq('view_date', date);
                
                const { data, error } = await query.order('created_at', { ascending: false });
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
            document.getElementById('email-settings-modal').style.display = 'block';
        }
        window.saveEmailSettings = function () {
            localStorage.setItem('ejs_public_key', document.getElementById('ejs-public-key').value);
            localStorage.setItem('ejs_service_id', document.getElementById('ejs-service-id').value);
            localStorage.setItem('ejs_template_id', document.getElementById('ejs-template-id').value);
            alert('Settings Saved Locally');
            closeEmailSettings();
        }
        window.closeEmailSettings = function () {
            document.getElementById('email-settings-modal').style.display = 'none';
        }

        // --- SMART IMPORTER LOGIC REMOVED ---

        async function loadDriversData() {
            if (!db) return;
            try {
                const { data, error } = await db.from('drivers').select('*').order('name', { ascending: true });
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
                
                // If it's a driver logged in, force their value (EXCEPT Robert Cortez)
                if (isFilter && sel.id === 'filter-search' && window.currentDriverNameRef) {
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
                if (currentVal) docsFilterSel.value = currentVal;
            }

            // TRIGGER SYNC: This fixes the "UNASSIGNED" lag on startup
            if (window.syncDriverNames) window.syncDriverNames();
            if (window.renderDriverLog) window.renderDriverLog();
        }

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
                    <button onclick="deleteDriver('${d.id}')" class="btn-del-driver" title="Delete Driver">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                container.appendChild(item);
            });
        }

        async function addNewDriver() {
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
                await loadDriversData();
                renderDriverManagerList();
            } catch (err) {
                console.error("Failed to add driver:", err);
                alert("Error adding driver.");
            }
        }
        window.addNewDriver = addNewDriver;

        async function deleteDriver(id) {
            if (!confirm("Are you sure you want to remove this driver from the active list?")) return;
            try {
                const { error } = await db.from('drivers').delete().eq('id', id);
                if (error) throw error;
                await loadDriversData();
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
            document.getElementById('customer-manager-modal').style.display = 'none';
        }

        async function loadCustomersData() {
            if (!db) return;
            try {
                const { data, error } = await db.from('customers').select('*').order('name', { ascending: true });
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

            // Auto-fill email when selecting a customer
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
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.85rem;">${c.name}</span>
                        <span style="font-size: 0.7rem; color: #64748b; text-transform: lowercase; font-weight: normal;">${c.email || 'no email'}</span>
                    </div>
                    <button onclick="deleteCustomer('${c.id}')" class="btn-del-driver" title="Delete Customer">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                container.appendChild(item);
            });
        }

        async function addNewCustomer() {
            const input = document.getElementById('new-customer-name');
            const emailInput = document.getElementById('new-customer-email');
            const name = input.value.trim().toUpperCase();
            const email = emailInput ? emailInput.value.trim() : '';
            if (!name) return;

            try {
                const { error } = await db.from('customers').insert([{ name: name, email: email }]);
                if (error) {
                    if (error.code === '23505') alert("Customer already exists!");
                    else throw error;
                }
                input.value = '';
                if (emailInput) emailInput.value = '';
                await loadCustomersData();
                renderCustomerManagerList();
            } catch (err) {
                console.error("Failed to add customer:", err);
                alert("Error adding customer: " + (err.message || "Unknown error"));
            }
        }
        window.addNewCustomer = addNewCustomer;

        async function deleteCustomer(id) {
            if (!confirm("Are you sure you want to remove this customer from the active list?")) return;
            try {
                const { error } = await db.from('customers').delete().eq('id', id);
                if (error) throw error;
                await loadCustomersData();
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

        async function loadPickupAddressesData() {
            if (!db) return;
            try {
                const { data, error } = await db.from('pickup_addresses').select('*').order('name', { ascending: true });
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
                    <button onclick="deletePickupAddress('${a.id}')" class="btn-del-driver" title="Delete Address">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                container.appendChild(item);
            });
        }

        async function addNewPickupAddress() {
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
                await loadPickupAddressesData();
                renderPickupAddressManagerList();
            } catch (err) {
                console.error("Failed to add address:", err);
                alert("Error adding address: " + (err.message || "Unknown error"));
            }
        }
        window.addNewPickupAddress = addNewPickupAddress;

        async function deletePickupAddress(id) {
            if (!confirm("Are you sure you want to remove this address from the active list?")) return;
            try {
                const { error } = await db.from('pickup_addresses').delete().eq('id', id);
                if (error) throw error;
                await loadPickupAddressesData();
                renderPickupAddressManagerList();
            } catch (err) {
                console.error("Failed to delete address:", err);
            }
        }
        window.deletePickupAddress = deletePickupAddress;

        // --- DEPOT MANAGEMENT LOGIC ---
        let currentDepots = [];
        window.openDepotManager = function () {
            document.getElementById('depot-manager-modal').style.display = 'flex';
            renderDepotManagerList();
        }
        window.closeDepotManager = function () {
            document.getElementById('depot-manager-modal').style.display = 'none';
        }

        async function loadDepotsData() {
            if (!db) return;
            try {
                const { data, error } = await db.from('depots').select('*').order('name', { ascending: true });
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
                    <button onclick="deleteDepot('${d.id}')" class="btn-del-driver" title="Delete Depot">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                container.appendChild(item);
            });
        }

        async function addNewDepot() {
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
                await loadDepotsData();
                renderDepotManagerList();
            } catch (err) {
                console.error("Failed to add depot:", err);
                alert("Error adding depot.");
            }
        }
        window.addNewDepot = addNewDepot;

        async function deleteDepot(id) {
            if (!confirm("Are you sure you want to remove this depot?")) return;
            try {
                const { error } = await db.from('depots').delete().eq('id', id);
                if (error) throw error;
                await loadDepotsData();
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

        async function loadSellersData() {
            if (!db) return;
            try {
                const { data, error } = await db.from('sellers').select('*').order('name', { ascending: true });
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
                sel.innerHTML = hasAll ? '<option value="">ALL</option>' : '<option value="" disabled selected>Select Seller</option>';
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

        function renderSellerManagerList() {
            const container = document.getElementById('seller-list-body');
            if (!container) return;
            container.innerHTML = '';
            currentSellers.forEach(s => {
                const item = document.createElement('div');
                item.className = 'driver-item';
                item.innerHTML = `
                    <span>${s.name}</span>
                    <button onclick="deleteSeller('${s.id}')" class="btn-del-driver" title="Delete Seller">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                container.appendChild(item);
            });
        }

        async function addNewSeller() {
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
                await loadSellersData();
                renderSellerManagerList();
            } catch (err) {
                console.error("Failed to add seller:", err);
                alert("Error adding seller.");
            }
        }
        window.addNewSeller = addNewSeller;

        async function deleteSeller(id) {
            if (!confirm("Are you sure you want to remove this seller?")) return;
            try {
                const { error } = await db.from('sellers').delete().eq('id', id);
                if (error) throw error;
                await loadSellersData();
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
                const { data, error } = await db.from('companies').select('*').order('name', { ascending: true });
                if (error) throw error;

                // Seed if empty
                if (data.length === 0) {
                    const seed = ["RP TULIPAN", "JR SUPER CRAME", "CONTRACTOR", "ONLY SALES"];
                    const seedObjs = seed.map(n => ({ name: n }));
                    await db.from('companies').insert(seedObjs);
                    return loadCompaniesData();
                }

                currentCompanies = data;
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
                    <button onclick="deleteCompany('${c.id}')" class="btn-del-driver" title="Delete Company">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                container.appendChild(item);
            });
        }

        async function addNewCompany() {
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
            if (!confirm("Are you sure you want to remove this company from the active list?")) return;
            try {
                const { error } = await db.from('companies').delete().eq('id', id);
                if (error) throw error;
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
                
                const { data, error } = await db.from('container_sizes').select('*').order('name', { ascending: true });
                
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
                    <button onclick="deleteContainerSize('${s.id}')" class="btn-del-driver" title="Delete Size">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                container.appendChild(item);
            });
        }

        window.addNewContainerSize = async function () {
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
            if (!confirm("Are you sure you want to delete this size option?")) return;
            try {
                const { error } = await db.from('container_sizes').delete().eq('id', id);
                if (error) throw error;
                await loadContainerSizesData();
                renderSizeManagerList();
            } catch (err) {
                console.error("Delete err:", err);
            }
        };
        // --- EXPENSE CATEGORY MANAGEMENT LOGIC ---
        let currentExpenseCategories = [];
        window.loadExpenseCategoriesData = async function () {
            try {
                const defaults = ["Fuel", "Service/Repairs", "Tolls", "Insurance", "Payroll", "Utilities", "Taxes/Licenses", "Other"];
                
                const { data, error } = await db.from('expense_categories').select('*').order('name', { ascending: true });
                
                if (error) {
                    console.error("Supabase error loading expense categories:", error);
                    currentExpenseCategories = defaults.map((s, i) => ({ id: i, name: s }));
                } else if (!data || data.length === 0) {
                    const seedObjs = defaults.map(s => ({ name: s }));
                    await db.from('expense_categories').insert(seedObjs);
                    const { data: freshData } = await db.from('expense_categories').select('*').order('name', { ascending: true });
                    currentExpenseCategories = (freshData && freshData.length > 0) ? freshData : defaults.map((s, i) => ({ id: i, name: s }));
                } else {
                    currentExpenseCategories = data;
                }
                
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
                    <button onclick="deleteExpenseCategory('${s.id}')" class="btn-del-driver" title="Delete Category">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                container.appendChild(item);
            });
        }

        window.addNewExpenseCategory = async function () {
            const input = document.getElementById('new-expense-category-name');
            const name = input.value.trim();
            if (!name) return;
            try {
                const { error } = await db.from('expense_categories').insert([{ name: name }]);
                if (error) throw error;
                input.value = '';
                await loadExpenseCategoriesData();
                renderExpenseCategoryManagerList();
            } catch (err) {
                alert("Error adding category: " + err.message);
            }
        };

        window.deleteExpenseCategory = async function (id) {
            if (!confirm("Are you sure you want to delete this category?")) return;
            try {
                const { error } = await db.from('expense_categories').delete().eq('id', id);
                if (error) throw error;
                await loadExpenseCategoriesData();
                renderExpenseCategoryManagerList();
            } catch (err) {
                console.error("Delete err:", err);
            }
        };


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
        let editingReleaseId = null;

        function newTripIdForDb() {
            return 'TRIP-' + Date.now().toString().slice(-6);
        }
        window.newTripIdForDb = newTripIdForDb;
        window.currentTrips = currentTrips; // Expose globally for fleet module suggestions
        window.currentReleases = currentReleases;
        window.currentExpenses = currentExpenses;

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
                lastGeneralMiles: f.last_general_maintenance_miles || 0
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
                last_general_maintenance_miles: parseInt(u.lastGeneralMiles) || 0
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
                r.qty_45 || 0, r.price_45 || 0, r.seller || '---', r.total_stock || 0, r.id,
                r.container_size || '---',
                r.paid || false, // Index 17
                r.is_cash || false // Index 18
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
                is_cash: row[18] || false
            };
        }
