        // --- FLEET MANAGEMENT LOGIC ---
        let currentFleetTab = 'truck';

        window.resetOilFromCard = async function(id) {
            const unit = currentFleet.find(u => u.id === id);
            if (!unit) return;

            if (!confirm(`Confirm OIL SERVICE completed for Unit #${unit.num}? (This will reset the counter to zero)`)) return;

            try {
                // We keep all other data, just update lastMiles
                const dbUnit = mapUIToFleet({ ...unit, lastMiles: unit.miles });
                await saveFleet(dbUnit);
                await loadFleetData();
                alert(`Counter reset! Next service for Unit #${unit.num} starts now.`);
            } catch (err) {
                console.error("Error resetting oil:", err);
                alert("Failed to reset counter.");
            }
        };

        window.saveFleetUnit = async function () {
            try {
                const id = document.getElementById('f-id').value;
                const unitData = {
                    id: id || Date.now().toString(),
                    type: document.getElementById('f-type')?.value || 'truck',
                    num: document.getElementById('f-unit').value,
                    vin: document.getElementById('f-vin').value,
                    plate: document.getElementById('f-plate').value,
                    year: document.getElementById('f-year').value,
                    miles: document.getElementById('f-miles').value,
                    lastDate: document.getElementById('f-last-date')?.value || '',
                    lastMiles: document.getElementById('f-last-miles')?.value || '0',
                    status: 'Available' // Default
                };

                if (!unitData.num) return alert('TRUCK # is required');

                const dbUnit = mapUIToFleet(unitData);
                await saveFleet(dbUnit);
                await loadFleetData();
                resetFleetForm();
                alert('Unit registered successfully!');
            } catch (err) {
                console.error("Error saving fleet unit:", err);
                alert("Failed to save: " + err.message);
            }
        };

        window.renderFleetTable = function () {
            renderFleetCards();
        };

        window.renderFleetCards = function() {
            const container = document.getElementById('fleet-cards-container');
            if (!container) return;
            container.innerHTML = '';

            const unitFilterEl = document.getElementById('filter-fleet-unit');
            const unitFilter = unitFilterEl ? unitFilterEl.value : 'ALL';

            // Refresh Filter dropdown
            if (unitFilterEl) {
                const currentVal = unitFilterEl.value;
                unitFilterEl.innerHTML = '<option value="ALL">All Active Units</option>';
                const uniqueNums = [...new Set(currentFleet.map(u => u.num))].sort();
                uniqueNums.forEach(num => {
                    const opt = document.createElement('option');
                    opt.value = num;
                    opt.textContent = `Unit #${num}`;
                    unitFilterEl.appendChild(opt);
                });
                unitFilterEl.value = currentVal;
                if (!unitFilterEl.value) unitFilterEl.value = 'ALL';
            }

            const filtered = currentFleet.filter(u => {
                const matchUnit = (unitFilter === 'ALL' || u.num === unitFilter);
                return matchUnit;
            });

            if (filtered.length === 0) {
                container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: #64748b;">No trucks found.</div>';
                return;
            }

            filtered.forEach(u => {
                const currentMiles = parseInt(u.miles) || 0;
                const lastServiceMiles = parseInt(u.lastMiles) || 0;
                const milesSince = Math.max(0, currentMiles - lastServiceMiles);
                const limit = 8000;
                const progressPercent = Math.min(100, (milesSince / limit) * 100);
                
                let cardColor = '#10b981';
                let statusText = 'HEALTHY';
                if (milesSince >= 8000) { cardColor = '#ef4444'; statusText = 'OVERDUE'; }
                else if (milesSince >= 7500) { cardColor = '#f59e0b'; statusText = 'SOON'; }

                // Determine "Last Updated Logic"
                // AUDIT LOG LOGIC
                const lastDriverStr = u.last_driver || 'N/A';
                const lastUpdateStr = u.lastUpdate ? new Date(u.lastUpdate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

                const card = document.createElement('div');
                card.style = `background: white; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border-top: 6px solid ${cardColor}; padding: 20px; transition: transform 0.2s; position: relative;`;
                
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                        <div>
                            <span style="display: block; font-size: 0.6rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">UNIT ID</span>
                            <h3 style="font-size: 1.5rem; font-weight: 900; color: #1e293b; margin: 0;">#${u.num}</h3>
                        </div>
                        <div style="background: ${cardColor}15; color: ${cardColor}; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 900;">
                            ${statusText}
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 8px;">
                        <div>
                            <label style="display: block; font-size: 0.5rem; color: #64748b;">PLATE / TAG</label>
                            <span style="font-weight: 700; font-size: 0.8rem; color: #334155;">${u.plate || 'N/A'}</span>
                        </div>
                        <div>
                            <label style="display: block; font-size: 0.5rem; color: #64748b;">YEAR</label>
                            <span style="font-weight: 700; font-size: 0.8rem; color: #334155;">${u.year || 'N/A'}</span>
                        </div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 0.65rem; font-weight: 8200; color: #1e293b;">OIL CHANGE PROXIMITY</span>
                            <span style="font-size: 0.75rem; font-weight: 900; color: ${cardColor};">${milesSince.toLocaleString()} / 8k mi</span>
                        </div>
                        <div style="height: 10px; background: #e2e8f0; border-radius: 10px; overflow: hidden;">
                            <div style="width: ${progressPercent}%; height: 100%; background: ${cardColor}; transition: width 0.5s;"></div>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #e2e8f0;">
                         <div>
                            <span style="display: block; font-size: 0.55rem; color: #94a3b8; text-transform: uppercase;">Total Odometer</span>
                            <span style="font-weight: 900; font-size: 1.1rem; color: #1e293b;">${currentMiles.toLocaleString()} mi</span>
                         </div>
                         <div style="display: flex; gap: 5px;">
                            <button onclick="editFleetUnit('${u.id}')" title="Edit" style="background: #f1f5f9; border: none; padding: 8px; border-radius: 8px; color: #64748b; cursor: pointer;"><i class="fas fa-edit"></i></button>
                            <button onclick="resetOilFromCard('${u.id}')" title="Service Completed" style="background: #1e293b; border: none; padding: 8px; border-radius: 8px; color: white; cursor: pointer;"><i class="fas fa-sync-alt"></i></button>
                            <button onclick="deleteFleetUnit('${u.id}')" title="Delete" style="background: #fef2f2; border: none; padding: 8px; border-radius: 8px; color: #ef4444; cursor: pointer;"><i class="fas fa-trash-alt"></i></button>
                         </div>
                    </div>

                    <!-- AUDIT SECTION -->
                    <div style="display: flex; align-items: center; gap: 10px; background: #fdf2f2; padding: 8px 12px; border-radius: 8px; border: 1px solid #fee2e2;">
                        <div style="background: #ef4444; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem;">
                            <i class="fas fa-user-clock"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 0.6rem; color: #991b1b; font-weight: 800; text-transform: uppercase;">LAST ACTIVITY</div>
                            <div style="font-size: 0.75rem; color: #450a0a; font-weight: 700;">
                                ${lastDriverStr} <span style="font-weight: 400; color: #991b1b; font-size: 0.65rem;">• ${lastUpdateStr}</span>
                            </div>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        };

        window.editFleetUnit = function (id) {
            const unit = currentFleet.find(u => u.id === id);
            if (!unit) return;
            const safeSetVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val || '';
            };
            safeSetVal('f-id', unit.id);
            safeSetVal('f-unit', unit.num);
            safeSetVal('f-vin', unit.vin);
            safeSetVal('f-plate', unit.plate);
            safeSetVal('f-year', unit.year);
            safeSetVal('f-miles', unit.miles);
            
            document.getElementById('fleet-form-title').textContent = 'Editing Truck #' + unit.num;
            const delBtn = document.getElementById('fleet-delete-btn');
            if (delBtn) delBtn.style.display = 'block';
        };

        window.deleteCurrentUnitFromForm = async function() {
            const id = document.getElementById('f-id').value;
            if (!id) return;
            await window.deleteFleetUnit(id);
            resetFleetForm();
        };

        window.deleteFleetUnit = async function (id) {
            if (!confirm('Permanently delete this truck?')) return;
            try {
                await window.supabaseDeleteFleetUnit(id); 
                await loadFleetData();
                alert("Truck deleted.");
            } catch (err) {
                console.error("Delete err:", err);
            }
        };

        function resetFleetForm() {
            const fields = ['f-id', 'f-unit', 'f-vin', 'f-plate', 'f-year', 'f-miles'];
            fields.forEach(f => {
                const el = document.getElementById(f);
                if (el) el.value = (f === 'f-miles') ? '0' : '';
            });
            document.getElementById('fleet-form-title').textContent = 'Fleet Management';
            const delBtn = document.getElementById('fleet-delete-btn');
            if (delBtn) delBtn.style.display = 'none';
        }
        window.resetFleetForm = resetFleetForm;

        async function loadFleetData() {
            try {
                const data = await getFleet();
                if (typeof currentFleet !== 'undefined') {
                    currentFleet = data.map(mapFleetToUI).sort((a, b) => {
                        const numA = parseInt(a.num) || 0;
                        const numB = parseInt(b.num) || 0;
                        return numA - numB;
                    });
                }
                renderFleetCards();
                refreshQuickFleetSelect();
                populateDriverAuditList();
            } catch (err) {
                console.error("Error loading fleet:", err);
            }
        }
        window.loadFleetData = loadFleetData;

        function populateDriverAuditList() {
            const list = document.getElementById('drivers-list');
            if (!list) return;
            
            // Use official driver list from central DB
            const drivers = window.currentDrivers || [];
            if (!drivers || drivers.length === 0) return;
            
            list.innerHTML = '';
            drivers.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                list.appendChild(opt);
            });
        }
        window.populateDriverAuditList = populateDriverAuditList;

        function refreshQuickFleetSelect() {
            const sel = document.getElementById('quick-truck-sel');
            if (!sel) return;
            const currentVal = sel.value;
            sel.innerHTML = '<option value="" disabled selected>Choose truck...</option>';
            currentFleet.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `TRUCK #${u.num} (${u.plate})`;
                sel.appendChild(opt);
            });
            if (currentVal) sel.value = currentVal;
        }

        window.quickUpdateMileage = async function() {
            const truckId = document.getElementById('quick-truck-sel').value;
            const driverName = document.getElementById('quick-driver-name').value.trim();
            const newMilesInput = document.getElementById('quick-miles');
            const newMiles = parseInt(newMilesInput.value) || 0;

            if (!truckId) return alert("Please select a truck first.");
            if (!driverName) return alert("Driver name is required for audit.");
            if (newMiles === 0) return alert("Please enter valid mileage.");

            const truck = currentFleet.find(u => u.id === truckId);
            if (!truck) return;

            const currentMiles = parseInt(truck.miles) || 0;
            if (newMiles < currentMiles) {
                alert(`⚠️ ERROR: Lower mileage entered. This truck already has ${currentMiles.toLocaleString()} mi.`);
                return;
            }

            try {
                // Update with Driver and Timestamp
                const updateBatch = { 
                    ...truck, 
                    miles: newMiles, 
                    status: 'Available',
                    last_driver: driverName,
                    lastUpdate: new Date().toISOString()
                };
                
                const dbUnit = mapUIToFleet(updateBatch);
                // Ensure dbUnit includes the new fields for Supabase
                dbUnit.last_driver = driverName; 
                // Note: updated_at is usually handled by Supabase, but we force it for UI consistency if needed
                
                await saveFleet(dbUnit);
                await loadFleetData();
                newMilesInput.value = '';
                document.getElementById('quick-driver-name').value = '';
                alert(`✅ Truck #${truck.num} updated by ${driverName}!`);
            } catch (err) {
                console.error("Error in quickUpdate:", err);
                alert("Update failed.");
            }
        };

        loadFleetData();

        document.addEventListener('DOMContentLoaded', () => {
             // Listener removed to simplify
        });
