        // --- FLEET MANAGEMENT LOGIC ---
        let currentFleetTab = 'truck';

        window.openMaintenanceLog = async function(unitId) {
            const unit = currentFleet.find(u => u.id === unitId);
            if (!unit) return;
            document.getElementById('active-history-unit-id').value = unitId;
            document.getElementById('history-modal-title').innerHTML = `<i class="fas fa-history"></i> History: Unit #${unit.num}`;
            document.getElementById('fleet-history-modal').style.display = 'flex';
            renderMaintenanceHistory(unitId);
        };

        window.closeFleetHistoryModal = function() {
            document.getElementById('fleet-history-modal').style.display = 'none';
        };

        window.renderMaintenanceHistory = async function(unitId) {
            const body = document.getElementById('fleet-history-body');
            body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Loading history...</td></tr>';
            
            try {
                const { data, error } = await db.from('fleet_maintenance_log')
                    .select('*')
                    .eq('unit_id', unitId)
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                
                body.innerHTML = '';
                if (!data || data.length === 0) {
                    body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">No records found.</td></tr>';
                    return;
                }
                
                data.forEach(row => {
                    const date = new Date(row.created_at).toLocaleDateString();
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid #f1f5f9';
                    tr.innerHTML = `
                        <td style="padding:10px; font-size:0.8rem; color:#64748b;">${date}</td>
                        <td style="padding:10px; font-size:0.85rem; font-weight:700; color:#1e293b;">${row.task}</td>
                        <td style="padding:10px; font-size:0.85rem; text-align:right; color:#1e293b;">${row.mileage ? row.mileage.toLocaleString() : '--'} mi</td>
                        <td style="padding:10px; text-align:center;">
                            <button onclick="deleteMaintenanceEntry('${row.id}', '${unitId}')" style="background:none; border:none; color:#94a3b8; cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
                        </td>
                    `;
                    body.appendChild(tr);
                });
            } catch (err) {
                console.error("Error loading history:", err);
                body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#ef4444;">Error loading data.</td></tr>';
            }
        };

        window.saveMaintenanceEntry = async function() {
            const unitId = document.getElementById('active-history-unit-id').value;
            const task = document.getElementById('hist-task').value.trim();
            const miles = parseInt(document.getElementById('hist-miles').value) || null;
            
            if (!task) return alert("Please enter the activity performed.");
            
            try {
                const { error } = await db.from('fleet_maintenance_log').insert([{
                    unit_id: unitId,
                    task: task,
                    mileage: miles
                }]);
                
                if (error) throw error;
                
                document.getElementById('hist-task').value = '';
                document.getElementById('hist-miles').value = '';
                renderMaintenanceHistory(unitId);
            } catch (err) {
                console.error("Error saving entry:", err);
                alert("Failed to save entry.");
            }
        };

        window.deleteMaintenanceEntry = async function(entryId, unitId) {
            if (!confirm("Delete this record permanently?")) return;
            try {
                const { error } = await db.from('fleet_maintenance_log').delete().eq('id', entryId);
                if (error) throw error;
                renderMaintenanceHistory(unitId);
            } catch (err) {
                console.error("Error deleting entry:", err);
                alert("Delete failed.");
            }
        };

        window.resetOilFromCard = async function(id) {
            const unit = currentFleet.find(u => u.id === id);
            if (!unit) return;
            if (!confirm(`Confirm OIL SERVICE completed for Unit #${unit.num}?`)) return;
            try {
                const dbUnit = mapUIToFleet({ ...unit, lastMiles: unit.miles });
                await saveFleet(dbUnit);
                await loadFleetData();
            } catch (err) { alert("Failed to reset oil."); }
        };

        window.resetGeneralFromCard = async function(id) {
            const unit = currentFleet.find(u => u.id === id);
            if (!unit) return;
            if (!confirm(`Confirm GENERAL MAINTENANCE (24k) completed for Unit #${unit.num}?`)) return;
            try {
                const dbUnit = mapUIToFleet({ ...unit, lastGeneralMiles: unit.miles });
                await saveFleet(dbUnit);
                await loadFleetData();
                alert(`General maintenance recorded! Counter reset for Unit #${unit.num}.`);
            } catch (err) { alert("Failed to reset general maintenance."); }
        };

        window.viewFleetNote = function(id) {
            const unit = currentFleet.find(u => u.id === id);
            if (!unit || !unit.note) return;
            document.getElementById('fleet-note-text').textContent = unit.note;
            document.getElementById('active-fleet-note-id').value = id;
            document.getElementById('fleet-note-modal').style.display = 'flex';
        };

        window.closeFleetNoteModal = function() {
            document.getElementById('fleet-note-modal').style.display = 'none';
        };

        window.clearCurrentFleetNote = async function() {
            const id = document.getElementById('active-fleet-note-id').value;
            if (!id) return;
            const unit = currentFleet.find(u => u.id === id);
            if (!unit) return;
            try {
                const dbUnit = mapUIToFleet({ ...unit, note: null });
                await saveFleet(dbUnit);
                await loadFleetData();
                closeFleetNoteModal();
            } catch (err) { alert("Action failed."); }
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
                    lastGeneralMiles: document.getElementById('f-general-miles').value || '0',
                    lastInspection: document.getElementById('f-inspection-date').value || '',
                    status: 'Available'
                };
                if (!unitData.num) return alert('TRUCK # is required');
                const dbUnit = mapUIToFleet(unitData);
                await saveFleet(dbUnit);
                await loadFleetData();
                resetFleetForm();
                alert('Unit registered successfully!');
            } catch (err) { alert("Failed to save: " + err.message); }
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
                const uniqueNums = [...new Set(currentFleet.map(u => u.num))].sort((a,b)=>a-b);
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
                
                // OIL (8k)
                const lastOilMiles = parseInt(u.lastMiles) || 0;
                const oilDiff = Math.max(0, currentMiles - lastOilMiles);
                const oilPercent = Math.min(100, (oilDiff / 8000) * 100);
                let oilColor = oilPercent >= 100 ? '#ef4444' : oilPercent >= 90 ? '#f59e0b' : '#10b981';

                // GENERAL (24k)
                const lastGenMiles = parseInt(u.lastGeneralMiles) || 0;
                const genDiff = Math.max(0, currentMiles - lastGenMiles);
                const genPercent = Math.min(100, (genDiff / 24000) * 100);
                let genColor = genPercent >= 100 ? '#5b21b6' : genPercent >= 85 ? '#a78bfa' : '#7c3aed';

                // INSPECTION (1 Year)
                let inspColor = '#3b82f6';
                let inspPercent = 0;
                let inspStatus = 'UP TO DATE';
                if (u.lastInspection) {
                    const diffDays = Math.ceil(Math.abs(new Date() - new Date(u.lastInspection)) / (1000 * 60 * 60 * 24));
                    inspPercent = Math.min(100, (diffDays / 365) * 100);
                    if (diffDays >= 365) { inspColor = '#ef4444'; inspStatus = 'OVERDUE'; }
                    else if (diffDays >= 335) { inspColor = '#f59e0b'; inspStatus = 'SOON'; }
                } else { inspStatus = 'NOT SET'; }

                const lastUpdateStr = u.lastUpdate ? new Date(u.lastUpdate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

                const card = document.createElement('div');
                card.style = `background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-top: 5px solid ${oilColor}; padding: 15px; position: relative;`;
                
                const alertIcon = u.note ? `
                    <div onclick="viewFleetNote('${u.id}')" style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #ef4444; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; animation: pulse 2s infinite; z-index: 10;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                ` : '';

                card.innerHTML = `
                    ${alertIcon}
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <span style="display: block; font-size: 0.55rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">UNIT ID</span>
                            <h3 style="font-size: 1.3rem; font-weight: 900; color: #1e293b; margin: 0;">#${u.num} <i onclick="openMaintenanceLog('${u.id}')" class="fas fa-cog" style="font-size: 0.9rem; color: #94a3b8; cursor: pointer; margin-left: 5px; vertical-align: middle;"></i></h3>
                        </div>
                        <div style="background: ${oilColor}15; color: ${oilColor}; padding: 3px 10px; border-radius: 20px; font-size: 0.6rem; font-weight: 900;">${oilPercent >= 100 ? 'SERVICE REQ' : 'HEALTHY'}</div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; background: #f8fafc; padding: 8px; border-radius: 6px;">
                        <div><label style="display: block; font-size: 0.5rem; color: #64748b;">PLATE</label><span style="font-weight: 700; font-size: 0.75rem;">${u.plate || 'N/A'}</span></div>
                        <div><label style="display: block; font-size: 0.5rem; color: #64748b;">YEAR</label><span style="font-weight: 700; font-size: 0.75rem;">${u.year || 'N/A'}</span></div>
                    </div>

                    <div style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <!-- Oil -->
                        <div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.55rem; font-weight: 800; margin-bottom: 2px;">
                                <span>OIL SERVICE</span><span>${oilDiff.toLocaleString()} / 8k mi</span>
                            </div>
                            <div style="height: 5px; background: #e2e8f0; border-radius: 10px; overflow: hidden;"><div style="width: ${oilPercent}%; height: 100%; background: ${oilColor};"></div></div>
                        </div>
                        <!-- General -->
                        <div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.55rem; font-weight: 800; margin-bottom: 2px;">
                                <span style="color: #6d28d9;">GENERAL MAINT (24k)</span><span>${genDiff.toLocaleString()} / 24k mi</span>
                            </div>
                            <div style="height: 5px; background: #e2e8f0; border-radius: 10px; overflow: hidden;"><div style="width: ${genPercent}%; height: 100%; background: ${genColor};"></div></div>
                        </div>
                        <!-- Inspection -->
                        <div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.55rem; font-weight: 800; margin-bottom: 2px;">
                                <span>ANNUAL INSP</span><span style="color: ${inspColor};">${inspStatus}</span>
                            </div>
                            <div style="height: 5px; background: #e2e8f0; border-radius: 10px; overflow: hidden;"><div style="width: ${inspPercent}%; height: 100%; background: ${inspColor};"></div></div>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;">
                        <div><span style="display: block; font-size: 0.5rem; color: #94a3b8; text-transform: uppercase;">Total Odometer</span><span style="font-weight: 900; font-size: 1rem;">${currentMiles.toLocaleString()} mi</span></div>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="editFleetUnit('${u.id}')" title="Edit" style="background: #f1f5f9; border: none; padding: 6px; border-radius: 6px; color: #64748b; cursor: pointer;"><i class="fas fa-edit"></i></button>
                            <button onclick="resetOilFromCard('${u.id}')" title="Reset Oil" style="background: #1e293b; border: none; padding: 6px; border-radius: 6px; color: white; cursor: pointer;"><i class="fas fa-oil-can"></i></button>
                            <button onclick="resetGeneralFromCard('${u.id}')" title="Reset General" style="background: #6d28d9; border: none; padding: 6px; border-radius: 6px; color: white; cursor: pointer;"><i class="fas fa-tools"></i></button>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px; background: #fdf2f2; padding: 6px 10px; border-radius: 6px; border: 1px solid #fee2e2;">
                        <div style="background: #ef4444; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6rem;"><i class="fas fa-user-clock"></i></div>
                        <div style="font-size: 0.65rem; color: #450a0a; font-weight: 700;">${u.last_driver || 'N/A'} <span style="font-weight: 400; color: #991b1b; font-size: 0.55rem;">• ${lastUpdateStr}</span></div>
                    </div>
                `;
                container.appendChild(card);
            });
        };

        window.editFleetUnit = function (id) {
            const unit = currentFleet.find(u => u.id === id);
            if (!unit) return;
            const safeSetVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
            safeSetVal('f-id', unit.id);
            safeSetVal('f-unit', unit.num);
            safeSetVal('f-vin', unit.vin);
            safeSetVal('f-plate', unit.plate);
            safeSetVal('f-year', unit.year);
            safeSetVal('f-miles', unit.miles);
            safeSetVal('f-general-miles', unit.lastGeneralMiles);
            safeSetVal('f-inspection-date', unit.lastInspection);
            document.getElementById('fleet-form-title').textContent = 'Editing Truck #' + unit.num;
            document.getElementById('fleet-delete-btn').style.display = 'block';
        };

        window.deleteFleetUnit = async function (id) {
            if (!confirm('Permanently delete this truck?')) return;
            try { await window.supabaseDeleteFleetUnit(id); await loadFleetData(); } catch (err) {}
        };

        function resetFleetForm() {
            const fields = ['f-id', 'f-unit', 'f-vin', 'f-plate', 'f-year', 'f-miles', 'f-general-miles', 'f-inspection-date'];
            fields.forEach(f => { const el = document.getElementById(f); if (el) el.value = (f.includes('miles')) ? '0' : ''; });
            document.getElementById('fleet-form-title').textContent = 'Fleet Management';
            document.getElementById('fleet-delete-btn').style.display = 'none';
        }
        window.resetFleetForm = resetFleetForm;

        async function loadFleetData() {
            try {
                const data = await getFleet();
                if (typeof currentFleet !== 'undefined') currentFleet = data.map(mapFleetToUI).sort((a, b) => (parseInt(a.num) || 0) - (parseInt(b.num) || 0));
                renderFleetCards();
                refreshQuickFleetSelect();
                if (window.populateDriverAuditList) window.populateDriverAuditList();
            } catch (err) {}
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
            if (newMiles < parseInt(truck.miles)) return alert(`⚠️ ERROR: Lower mileage entered.`);
            try {
                const dbUnit = mapUIToFleet({ ...truck, miles: newMiles, last_driver: driverName, lastUpdate: new Date().toISOString(), note: noteText || truck.note });
                await saveFleet(dbUnit);
                await loadFleetData();
                newMilesInput.value = '';
                document.getElementById('quick-driver-name').value = '';
                document.getElementById('quick-note').value = '';
                document.getElementById('quick-truck-sel').value = '';
                alert(`✅ Truck #${truck.num} updated!`);
            } catch (err) {}
        };

        loadFleetData();
