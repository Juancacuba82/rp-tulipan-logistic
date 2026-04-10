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
                            ${window.currentUserRole === 'admin' ? `<button onclick="deleteFleetUnit('${u.id}')" class="btn-cancel" style="padding: 2px 8px; font-size: 0.7rem;">DEL</button>` : ''}
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
            window.loadFleetData = loadFleetData;
            try {
                const data = await getFleet();
                currentFleet = data.map(mapFleetToUI);
                renderFleetTable();
            } catch (err) {
                console.error("Error loading fleet:", err);
            }
        }
        window.loadFleetData = loadFleetData;


        // --- SMART IMPORTER LOGIC REMOVED ---



        // Importer functions removed


        window.setImportTarget = function (target) {
            importTarget = target;
            const btnRel = document.getElementById('target-rel');
            const btnTrips = document.getElementById('target-trips');

            if (target === 'releases') {
                btnRel.classList.add('active');
                btnTrips.classList.remove('active');
            } else {
                btnTrips.classList.add('active');
                btnRel.classList.remove('active');
            }
            // If data was already pasted, re-render mapping to show appropriate options
            if (pastedDataGrid.length > 0) processPastedData();
        }

        window.resetImporter = function () {
            document.getElementById('import-paste-area').value = '';
            document.getElementById('mapping-container').innerHTML = '';
            document.getElementById('importer-step-1').style.display = 'block';
            document.getElementById('importer-step-2').style.display = 'none';
            pastedDataGrid = [];
        }

        window.processPastedData = function () {
            const raw = document.getElementById('import-paste-area').value.trim();
            if (!raw) return;

            // Excel uses Tabs (\t) for columns and Newlines (\n) for rows
            const rows = raw.split(/\r?\n/).map(row => row.split('\t'));
            if (rows.length === 0) return;

            pastedDataGrid = rows;
            renderMappingUI();

            document.getElementById('importer-step-1').style.display = 'none';
            document.getElementById('importer-step-2').style.display = 'block';
        }

        // renderMappingUI removed


        window.executeFinalImport = async function () {
            const selects = document.querySelectorAll('.map-select');
            const mapping = {};
            let hasSelection = false;

            selects.forEach(s => {
                if (s.value !== 'IGNORE') {
                    mapping[s.getAttribute('data-col')] = s.value;
                    hasSelection = true;
                }
            });

            if (!hasSelection) {
                alert("Please map at least one column before importing!");
                return;
            }

            if (!confirm(`Are you sure you want to import ${pastedDataGrid.length} records?`)) return;

            const btn = document.querySelector('#smart-importer-modal .btn-add-sidebar[onclick*="executeFinalImport"]');
            const originalText = btn ? btn.textContent : 'DO MAGIC';
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'WORKING MAGIC... 🪄';
            }

            try {
                const finalObjects = [];

                for (const row of pastedDataGrid) {
                    const obj = {};
                    let isHeader = false;

                    for (let colIdx in mapping) {
                        const fieldName = mapping[colIdx];
                        let val = (row[colIdx] || '').trim();

                        // 1. Detect if this is a header row (e.g., "Fecha" instead of "2024-01-01")
                        if (fieldName === 'date' && val && isNaN(Date.parse(val))) {
                            isHeader = true;
                            break;
                        }

                        // 2. Data Sanitization
                        if (fieldName.includes('price') || fieldName.includes('qty') || fieldName === 'amount') {
                            val = val.replace(/[^0-9.-]+/g, "");
                            val = parseFloat(val) || 0;
                        } else if (fieldName === 'paid' || fieldName === 'status') {
                            const lower = val.toLowerCase();
                            val = (lower === 'paid' || lower === 'yes' || lower === 'true' || lower === '1' || lower === 'ok');
                        }

                        obj[fieldName] = val;
                    }

                    // Skip this row if it was identified as a header
                    if (isHeader) continue;
                    if (Object.keys(obj).length === 0) continue;

                    // Special behavior for Releases: Calculate Initial Stock if not mapped
                    if (importTarget === 'releases') {
                        if (!obj.total_stock) {
                            obj.total_stock = (parseInt(obj.qty_20) || 0) + (parseInt(obj.qty_40) || 0) + (parseInt(obj.qty_45) || 0);
                        }
                    } else {
                        // Special behavior for TRIPS: Ensure trip_id and default mode
                        if (!obj.trip_id) {
                            obj.trip_id = 'TRIP-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                        }
                        if (!obj.service_mode) obj.service_mode = 'SALE';
                    }

                    finalObjects.push(obj);
                }

                if (finalObjects.length === 0) {
                    alert("No valid data found to import (Check if you mapped the columns correctly).");
                    return;
                }

                const tableName = importTarget === 'releases' ? 'releases' : 'trips';
                const { error } = await db.from(tableName).insert(finalObjects);

                if (error) {
                    console.error("Database Insert Error:", error);
                    throw new Error(`DATABASE ERROR (${error.code}): ${error.message} - ${error.details || ''}`);
                }

                alert(`🎯 SUCCESS! ${finalObjects.length} records imported correctly.`);
                closeSmartImporter();

                // Refresh relevant view
                if (importTarget === 'releases') {
                    if (window.loadReleasesData) await window.loadReleasesData();
                } else {
                    if (window.loadTableData) await window.loadTableData();
                }

            } catch (err) {
                console.error("Import failed:", err);
                alert("Import failed: " + err.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            }
        }

        // Run initial load
        loadFleetData();

        document.addEventListener('DOMContentLoaded', async () => {
            // 1. Initial Logic: Read last section
            let activeSection = localStorage.getItem('activeSection') || 'hero';
            if (activeSection === 'auth') activeSection = 'hero';

            // 2. Immediate Show (Don't wait for data/auth yet)
            // Fix F5 Flicker: temporarily fake the role to bypass the auth check in showView
            // The real auth check will run below and correct it in 0.5s.
            window.currentUserRole = 'loading';
            showView(activeSection);

            // 3. Auth Check in background
            let loggedIn = false;
            // Ensure we start with a clean state
            document.body.style.background = '#f0f2f5';

            try {
                loggedIn = await checkAuth();
            } catch (authErr) {
                console.error("Auth check failed:", authErr);
            }

            if (loggedIn) {
                showView(activeSection);
            } else {
                showView('auth');
            }

            // Safety check: if no view is visible after 2 seconds, force auth
            setTimeout(() => {
                const visible = Array.from(document.querySelectorAll('.view-section')).some(s => s.style.display !== 'none');
                if (!visible) {
                    console.warn("Emergency: No view visible. Forcing Auth View.");
                    const av = document.getElementById('auth-view');
                    if (av) {
                        av.classList.remove('hidden');
                        av.style.setProperty('display', 'flex', 'important');
                    }
                }
            }, 3000);

            // 4. Background Loading (Parallel)
            const loaders = [
                () => window.loadTableData?.(),
                () => window.loadDriversData?.(),
                () => window.loadCustomersData?.(),
                () => window.loadPickupAddressesData?.(),
                () => window.loadCompaniesData?.(),
                () => window.loadDepotsData?.(),
                () => window.loadSellersData?.(),
                () => window.loadFleetData?.(),
                () => window.loadReleasesData?.(),
                () => window.loadContainerSizesData?.()
            ];

            // Run loaders all at once for maximum speed
            Promise.allSettled(loaders.map(f => f())).then(() => {
                console.log("All background data loaded.");
            });

            // 5. Global Cleanup
            window.currentUserRole = window.currentUserRole || 'staff';
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
