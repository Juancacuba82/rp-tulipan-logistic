        // --- FLEET MANAGEMENT LOGIC ---
        let currentFleetTab = 'truck';

        window.resetOilFromCard = async function(id) {
            const unit = currentFleet.find(u => u.id === id);
            if (!unit) return;
            if (!confirm(`Confirm OIL SERVICE completed for Unit #${unit.num}? (This will reset the counter to zero)`)) return;
            try {
                const dbUnit = mapUIToFleet({ ...unit, lastMiles: unit.miles });
                await saveFleet(dbUnit);
                await loadFleetData();
                alert(`Counter reset! Next service for Unit #${unit.num} starts now.`);
            } catch (err) {
                console.error("Error resetting oil:", err);
                alert("Failed to reset counter.");
            }
        };

        window.viewFleetNote = function(id) {
            const unit = currentFleet.find(u => u.id === id);
            if (!unit || !unit.note) return;
            
            document.getElementById('fleet-note-text').textContent = unit.note;
            document.getElementById('active-fleet-note-id').value = id;
            document.getElementById('fleet-note-modal').style.display = 'flex';
        };

        window.populateDriverAuditList = function() {
            const list = document.getElementById('fleet-drivers-list');
            if (!list) return;
            const drivers = window.currentDrivers || [];
            list.innerHTML = '';
            drivers.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                list.appendChild(opt);
            });
        };

        // Initialize driver list if already loaded by other scripts
        window.populateDriverAuditList();

        window.closeFleetNoteModal = function() {
            document.getElementById('fleet-note-modal').style.display = 'none';
        };

        window.clearCurrentFleetNote = async function() {
            const id = document.getElementById('active-fleet-note-id').value;
            if (!id) return;
            if (!confirm("Confirm issue resolved? This will remove the alert icon from the card.")) return;
            const unit = currentFleet.find(u => u.id === id);
            if (!unit) return;
            try {
                const dbUnit = mapUIToFleet({ ...unit, note: null });
                await saveFleet(dbUnit);
                await loadFleetData();
                closeFleetNoteModal();
                alert("Alert cleared! Vehicle marked as resolved.");
            } catch (err) {
                console.error("Error clearing note:", err);
                alert("Action failed.");
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
                    lastInspection: document.getElementById('f-inspection-date').value || '',
                    status: 'Available'
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

        window.renderFleetCards = function() {
            const container = document.getElementById('fleet-cards-container');
            if (!container) return;
            container.innerHTML = '';

            const unitFilterEl = document.getElementById('filter-fleet-unit');
            const unitFilter = unitFilterEl ? unitFilterEl.value : 'ALL';
            const showAlertsOnly = document.getElementById('filter-alerts-only')?.checked || false;

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
                const matchAlert = !showAlertsOnly || !!u.note;
                return matchUnit && matchAlert;
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
                const oilPercent = Math.min(100, (milesSince / limit) * 100);
                
                let oilColor = '#10b981';
                if (milesSince >= 8000) { oilColor = '#ef4444'; }
                else if (milesSince >= 7500) { oilColor = '#f59e0b'; }

                // Technical Inspection Logic (1 Year)
                let inspColor = '#3b82f6';
                let inspPercent = 0;
                let inspStatus = 'UP TO DATE';
                
                if (u.lastInspection) {
                    const lastDate = new Date(u.lastInspection);
                    const now = new Date();
                    const diffTime = Math.abs(now - lastDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    inspPercent = Math.min(100, (diffDays / 365) * 100);
                    
                    if (diffDays >= 365) { inspColor = '#ef4444'; inspStatus = 'OVERDUE'; }
                    else if (diffDays >= 335) { inspColor = '#f59e0b'; inspStatus = 'SOON'; }
                } else {
                    inspStatus = 'NOT SET';
                }

                const lastDriverStr = u.last_driver || 'N/A';
                const lastUpdateStr = u.lastUpdate ? new Date(u.lastUpdate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

                const card = document.createElement('div');
                card.style = `background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-top: 5px solid ${oilColor}; padding: 15px; transition: transform 0.2s; position: relative;`;
                
                const alertIcon = u.note ? `
                    <div onclick="viewFleetNote('${u.id}')" title="DRIVER ALERT!" style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #ef4444; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.5); z-index: 10; animation: pulse 2s infinite;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                ` : '';

                card.innerHTML = `
                    ${alertIcon}
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <span style="display: block; font-size: 0.55rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">UNIT ID</span>
                            <h3 style="font-size: 1.3rem; font-weight: 900; color: #1e293b; margin: 0;">#${u.num}</h3>
                        </div>
                        <div style="background: ${oilColor}15; color: ${oilColor}; padding: 3px 10px; border-radius: 20px; font-size: 0.65rem; font-weight: 900;">
                            ${milesSince >= 8000 ? 'OIL OVERDUE' : 'HEALTHY'}
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; background: #f8fafc; padding: 8px; border-radius: 6px;">
                        <div>
                            <label style="display: block; font-size: 0.5rem; color: #64748b;">PLATE / TAG</label>
                            <span style="font-weight: 700; font-size: 0.75rem; color: #334155;">${u.plate || 'N/A'}</span>
                        </div>
                        <div>
                            <label style="display: block; font-size: 0.5rem; color: #64748b;">YEAR</label>
                            <span style="font-weight: 700; font-size: 0.75rem; color: #334155;">${u.year || 'N/A'}</span>
                        </div>
                    </div>

                    <!-- PROGRESS BARS SECTION -->
                    <div style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <!-- Oil Change -->
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                                <span style="font-size: 0.55rem; font-weight: 800; color: #1e293b;">OIL SERVICE</span>
                                <span style="font-size: 0.65rem; font-weight: 900; color: ${oilColor};">${milesSince.toLocaleString()} / 8k mi</span>
                            </div>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 10px; overflow: hidden;">
                                <div style="width: ${oilPercent}%; height: 100%; background: ${oilColor}; transition: width 0.5s;"></div>
                            </div>
                        </div>
                        <!-- Technical Inspection -->
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                                <span style="font-size: 0.55rem; font-weight: 800; color: #1e293b;">ANNUAL INSPECTION</span>
                                <span style="font-size: 0.65rem; font-weight: 900; color: ${inspColor};">${inspStatus}</span>
                            </div>
                            <div style="height: 6px; background: #e2e8f0; border-radius: 10px; overflow: hidden;">
                                <div style="width: ${inspPercent}%; height: 100%; background: ${inspColor}; transition: width 0.5s;"></div>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #e2e8f0;">
                         <div>
                            <span style="display: block; font-size: 0.5rem; color: #94a3b8; text-transform: uppercase;">Total Odometer</span>
                            <span style="font-weight: 900; font-size: 1rem; color: #1e293b;">${currentMiles.toLocaleString()} mi</span>
                         </div>
                         <div style="display: flex; gap: 4px;">
                            <button onclick="editFleetUnit('${u.id}')" title="Edit" style="background: #f1f5f9; border: none; padding: 6px; border-radius: 6px; color: #64748b; cursor: pointer; font-size: 0.75rem;"><i class="fas fa-edit"></i></button>
                            <button onclick="resetOilFromCard('${u.id}')" title="Oil Service Done" style="background: #1e293b; border: none; padding: 6px; border-radius: 6px; color: white; cursor: pointer; font-size: 0.75rem;"><i class="fas fa-sync-alt"></i></button>
                            <button onclick="deleteFleetUnit('${u.id}')" title="Delete" style="background: #fef2f2; border: none; padding: 6px; border-radius: 6px; color: #ef4444; cursor: pointer; font-size: 0.75rem;"><i class="fas fa-trash-alt"></i></button>
                         </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px; background: #fdf2f2; padding: 6px 10px; border-radius: 6px; border: 1px solid #fee2e2;">
                        <div style="background: #ef4444; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6rem;">
                            <i class="fas fa-user-clock"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 0.55rem; color: #991b1b; font-weight: 800; text-transform: uppercase;">LAST ACTIVITY</div>
                            <div style="font-size: 0.7rem; color: #450a0a; font-weight: 700;">
                                ${lastDriverStr} <span style="font-weight: 400; color: #991b1b; font-size: 0.6rem;">• ${lastUpdateStr}</span>
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
            safeSetVal('f-inspection-date', unit.lastInspection);
            document.getElementById('fleet-form-title').textContent = 'Editing Truck #' + unit.num;
            const delBtn = document.getElementById('fleet-delete-btn');
            if (delBtn) delBtn.style.display = 'block';
        };

        window.deleteFleetUnit = async function (id) {
            if (!confirm('Permanently delete this truck?')) return;
            try {
                await window.supabaseDeleteFleetUnit(id); 
                await loadFleetData();
                alert("Truck deleted.");
            } catch (err) { console.error("Delete err:", err); }
        };

        function resetFleetForm() {
            const fields = ['f-id', 'f-unit', 'f-vin', 'f-plate', 'f-year', 'f-miles', 'f-inspection-date'];
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
                    currentFleet = data.map(mapFleetToUI).sort((a, b) => (parseInt(a.num) || 0) - (parseInt(b.num) || 0));
                }
                renderFleetCards();
                refreshQuickFleetSelect();
                if (window.populateDriverAuditList) window.populateDriverAuditList();
            } catch (err) { console.error("Error loading fleet:", err); }
        }
        window.loadFleetData = loadFleetData;

        function refreshQuickFleetSelect() {
            const sel = document.getElementById('quick-truck-sel');
            if (!sel) return;
            const val = sel.value;
            sel.innerHTML = '<option value="" disabled selected>Choose truck...</option>';
            currentFleet.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `TRUCK #${u.num} (${u.plate})`;
                sel.appendChild(opt);
            });
            if (val) sel.value = val;
        }

        window.quickUpdateMileage = async function() {
            const truckId = document.getElementById('quick-truck-sel').value;
            const driverName = document.getElementById('quick-driver-name').value.trim();
            const noteText = document.getElementById('quick-note').value.trim();
            const newMilesInput = document.getElementById('quick-miles');
            const newMiles = parseInt(newMilesInput.value) || 0;
            if (!truckId || !driverName || newMiles === 0) return alert("Please fill all required fields.");
            const truck = currentFleet.find(u => u.id === truckId);
            if (!truck) return;
            const currentMiles = parseInt(truck.miles) || 0;
            if (newMiles < currentMiles) return alert(`⚠️ ERROR: Lower mileage entered (${currentMiles} mi exist).`);
            try {
                const updateBatch = { ...truck, miles: newMiles, last_driver: driverName, lastUpdate: new Date().toISOString(), note: noteText || truck.note };
                const dbUnit = mapUIToFleet(updateBatch);
                await saveFleet(dbUnit);
                await loadFleetData();
                newMilesInput.value = '';
                document.getElementById('quick-driver-name').value = '';
                document.getElementById('quick-note').value = '';
                document.getElementById('quick-truck-sel').value = '';
                alert(`✅ Truck #${truck.num} updated!`);
            } catch (err) { alert("Update failed."); }
        };

        loadFleetData();
