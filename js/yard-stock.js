console.log('CRITICAL: Yard Stock JS v99 is active');

(function () {
    let currentYardStock = [];
    let editingYardId = null;

    function parseYardNotes(notesStr) {
        let entryFee = 0;
        let dailyRate = 0;
        let exitDate = '';
        let cleanNote = notesStr || '';

        // Strip [Storage Yard] first if present
        const isStorage = cleanNote.includes('[Storage Yard]');
        if (isStorage) {
            cleanNote = cleanNote.replace('[Storage Yard] ', '').replace('[Storage Yard]', '');
        }

        // Parse [EntryFee: X]
        const entryMatch = cleanNote.match(/\[EntryFee:\s*([\d.]+)\]/);
        if (entryMatch) {
            entryFee = parseFloat(entryMatch[1]) || 0;
            cleanNote = cleanNote.replace(entryMatch[0], '');
        }

        // Parse [DailyRate: X]
        const dailyMatch = cleanNote.match(/\[DailyRate:\s*([\d.]+)\]/);
        if (dailyMatch) {
            dailyRate = parseFloat(dailyMatch[1]) || 0;
            cleanNote = cleanNote.replace(dailyMatch[0], '');
        }

        // Parse [ExitDate: YYYY-MM-DD]
        const exitMatch = cleanNote.match(/\[ExitDate:\s*([\d\-]+)\]/);
        if (exitMatch) {
            exitDate = exitMatch[1].trim();
            cleanNote = cleanNote.replace(exitMatch[0], '');
        }

        // Clean up any double spaces and trim
        cleanNote = cleanNote.replace(/\s+/g, ' ').trim();

        return {
            isStorage,
            entryFee,
            dailyRate,
            exitDate,
            cleanNote
        };
    }

    // --- INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof window.showView === 'function') {
            const originalShowView = window.showView;
            window.showView = function(viewId) {
                originalShowView(viewId);
                if (viewId === 'yard') {
                    loadYardData(false);
                }
            };
        }
    });

    // --- DATA LOADING ---
    async function loadYardData(force = false) {
        if (!window.db) return;
        
        if (!force && currentYardStock && currentYardStock.length > 0) {
            renderYardTable();
            renderStorageTable();
            updateYardSelectors(document.getElementById('in-container-source')?.value || 'YARD');
            return;
        }
        
        try {
            const { data, error } = await window.db
                .from('yard_stock')
                .select('id, created_at, container_no, size, type, condition, origin_release, notes, status')
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            currentYardStock = data || [];
            renderYardTable();
            renderStorageTable();
            updateYardSelectors(document.getElementById('in-container-source')?.value || 'YARD');
        } catch (err) {
            console.error("Error loading yard stock:", err);
        }
    }
    window.loadYardData = loadYardData;

    function renderYardTable() {
        const body = document.getElementById('yard-body');
        const countEl = document.getElementById('yard-total-count');
        if (!body) return;

        const searchTerm = document.getElementById('yf-search')?.value.toLowerCase() || '';
        const sizeFilter = document.getElementById('yf-size')?.value || '';

        const filtered = currentYardStock.filter(item => {
            const isStorage = (item.notes || '').includes('[Storage Yard]');
            if (isStorage) return false; // Left table is only RPTulipan Yard
            
            const matchSearch = (item.container_no || '').toLowerCase().includes(searchTerm) || 
                               (item.origin_release || '').toLowerCase().includes(searchTerm);
            const matchSize = sizeFilter ? (item.size || '').includes(sizeFilter) : true;
            return matchSearch && matchSize;
        });

        if (countEl) countEl.textContent = filtered.filter(item => item.status !== 'SOLD').length;

        body.innerHTML = '';
        filtered.forEach(item => {
            const isSelected = (editingYardId === item.id);
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.style.transition = 'background-color 0.2s ease';
            tr.style.borderBottom = '1px solid #475569'; // Darker, more visible line

            const isExited = item.status === 'SOLD';
            // Visual state helper
            const applyStyle = (isHover) => {
                if (isSelected) {
                    tr.style.backgroundColor = '#e0f2fe'; // Brighter blue for selected
                    tr.style.borderLeft = '4px solid #0284c7';
                } else if (isExited) {
                    tr.style.backgroundColor = '#f1f5f9'; // Inactive gray background
                    tr.style.opacity = '0.75';
                    tr.style.color = '#64748b';
                    tr.style.borderLeft = '4px solid transparent';
                } else if (isHover) {
                    tr.style.backgroundColor = '#f8fafc'; // Very light gray on hover
                    tr.style.borderLeft = '4px solid transparent';
                } else {
                    tr.style.backgroundColor = 'transparent';
                    tr.style.borderLeft = '4px solid transparent';
                }
            };

            applyStyle(false);

            tr.onmouseenter = () => applyStyle(true);
            tr.onmouseleave = () => applyStyle(false);

            // DIRECT CLICK HANDLER
            tr.onclick = (e) => {
                // Ignore if clicking action buttons
                if (e.target.closest('.btn-manage-inline')) return;
                
                if (editingYardId === item.id) {
                    resetYardForm();
                } else {
                    editYardItem(item.id);
                }
            };

            const parsed = parseYardNotes(item.notes);
            const entryDate = new Date(item.created_at || new Date());
            const endDate = parsed.exitDate ? new Date(parsed.exitDate + 'T12:00:00') : new Date();
            const d1 = Date.UTC(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
            const d2 = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            const accumStorage = parsed.dailyRate * days;
            const exitFee = parsed.exitDate ? parsed.entryFee : 0;
            const totalCost = parsed.entryFee + accumStorage + exitFee;

            const tooltipTitle = parsed.exitDate 
                ? `Entry: $${parsed.entryFee.toFixed(2)} | Daily: $${parsed.dailyRate.toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit: $${parsed.entryFee.toFixed(2)} | Exit Date: ${parsed.exitDate}`
                : `Entry: $${parsed.entryFee.toFixed(2)} | Daily: $${parsed.dailyRate.toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit: Not Exited yet ($0.00)`;

            const containerNoDisplay = isExited
                ? `<span style="text-decoration: line-through; color: #64748b;">${item.container_no || '---'}</span> <span style="font-size: 0.65rem; background: #cbd5e1; color: #475569; padding: 2px 5px; border-radius: 4px; font-weight: 800; margin-left: 5px;">EXITED</span>`
                : `${item.container_no || '---'}`;

            tr.innerHTML = `
                <td style="padding: 12px 15px; border: 1px solid #475569;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: ${isExited ? '#64748b' : '#1e40af'};">${containerNoDisplay}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.size || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.type || 'DRY'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <span class="inv-badge ${item.condition === 'NEW' ? 'inv-badge-green' : 'inv-badge-blue'}">${item.condition || 'USED'}</span>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.origin_release || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.75rem; color: #475569; max-width: 250px;">${parsed.cleanNote || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem;" title="${tooltipTitle}">
                    <div style="font-weight: 700; color: #475569;">${days} days${parsed.exitDate ? ' (Exited)' : ''}</div>
                    <div style="font-weight: 900; color: #10b981;">$${totalCost.toFixed(2)}</div>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button onclick="editYardItem('${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="Edit" style="background: #f1f5f9; color: #1e40af; border: 1px solid #cbd5e1; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteYardItem('${item.id}'); event.stopPropagation();" class="btn-manage-inline btn-delete-yard" title="Delete" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            `;
            body.appendChild(tr);
        });
    }
    window.renderYardTable = renderYardTable;

    function renderStorageTable() {
        const body = document.getElementById('storage-yard-body');
        const countEl = document.getElementById('storage-total-count');
        if (!body) return;

        const searchTerm = document.getElementById('sf-search')?.value.toLowerCase() || '';
        const sizeFilter = document.getElementById('sf-size')?.value || '';

        const filtered = currentYardStock.filter(item => {
            const isStorage = (item.notes || '').includes('[Storage Yard]');
            if (!isStorage) return false; // Right table is only Storage Yard
            
            const matchSearch = (item.container_no || '').toLowerCase().includes(searchTerm) || 
                               (item.origin_release || '').toLowerCase().includes(searchTerm);
            const matchSize = sizeFilter ? (item.size || '').includes(sizeFilter) : true;
            return matchSearch && matchSize;
        });

        if (countEl) countEl.textContent = filtered.filter(item => item.status !== 'SOLD').length;

        body.innerHTML = '';
        if (filtered.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="9" style="padding: 20px; text-align: center; color: #64748b; font-weight: 600;">
                        No items in Storage Yard
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(item => {
            const isSelected = (editingYardId === item.id);
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.style.transition = 'background-color 0.2s ease';
            tr.style.borderBottom = '1px solid #475569';

            const isExited = item.status === 'SOLD';
            const applyStyle = (isHover) => {
                if (isSelected) {
                    tr.style.backgroundColor = '#e0f2fe';
                    tr.style.borderLeft = '4px solid #0284c7';
                } else if (isExited) {
                    tr.style.backgroundColor = '#f1f5f9';
                    tr.style.opacity = '0.75';
                    tr.style.color = '#64748b';
                    tr.style.borderLeft = '4px solid transparent';
                } else if (isHover) {
                    tr.style.backgroundColor = '#f8fafc';
                    tr.style.borderLeft = '4px solid transparent';
                } else {
                    tr.style.backgroundColor = 'transparent';
                    tr.style.borderLeft = '4px solid transparent';
                }
            };

            applyStyle(false);
            tr.onmouseenter = () => applyStyle(true);
            tr.onmouseleave = () => applyStyle(false);

            tr.onclick = (e) => {
                if (e.target.closest('.btn-manage-inline')) return;
                if (editingYardId === item.id) {
                    resetYardForm();
                } else {
                    editYardItem(item.id);
                }
            };

            const parsed = parseYardNotes(item.notes);
            const entryDate = new Date(item.created_at || new Date());
            const endDate = parsed.exitDate ? new Date(parsed.exitDate + 'T12:00:00') : new Date();
            const d1 = Date.UTC(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
            const d2 = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            const accumStorage = parsed.dailyRate * days;
            const exitFee = parsed.exitDate ? parsed.entryFee : 0;
            const totalCost = parsed.entryFee + accumStorage + exitFee;

            const tooltipTitle = parsed.exitDate 
                ? `Entry: $${parsed.entryFee.toFixed(2)} | Daily: $${parsed.dailyRate.toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit: $${parsed.entryFee.toFixed(2)} | Exit Date: ${parsed.exitDate}`
                : `Entry: $${parsed.entryFee.toFixed(2)} | Daily: $${parsed.dailyRate.toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit: Not Exited yet ($0.00)`;

            const containerNoDisplay = isExited
                ? `<span style="text-decoration: line-through; color: #64748b;">${item.container_no || '---'}</span> <span style="font-size: 0.65rem; background: #cbd5e1; color: #475569; padding: 2px 5px; border-radius: 4px; font-weight: 800; margin-left: 5px;">EXITED</span>`
                : `${item.container_no || '---'}`;

            tr.innerHTML = `
                <td style="padding: 12px 15px; border: 1px solid #475569;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: ${isExited ? '#64748b' : '#10b981'};">${containerNoDisplay}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.size || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.type || 'DRY'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <span class="inv-badge ${item.condition === 'NEW' ? 'inv-badge-green' : 'inv-badge-blue'}">${item.condition || 'USED'}</span>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.origin_release || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.75rem; color: #475569; max-width: 250px;">${parsed.cleanNote || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem;" title="${tooltipTitle}">
                    <div style="font-weight: 700; color: #475569;">${days} days${parsed.exitDate ? ' (Exited)' : ''}</div>
                    <div style="font-weight: 900; color: #10b981;">$${totalCost.toFixed(2)}</div>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button onclick="editYardItem('${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="Edit" style="background: #f1f5f9; color: #1e40af; border: 1px solid #cbd5e1; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteYardItem('${item.id}'); event.stopPropagation();" class="btn-manage-inline btn-delete-yard" title="Delete" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            `;
            body.appendChild(tr);
        });
    }
    window.renderStorageTable = renderStorageTable;

    // --- ACTIONS ---
    window.saveYardContainer = async function() {
        const containerNo = document.getElementById('yard-container-no').value.trim();
        const size = document.getElementById('yard-size').value;
        const type = document.getElementById('yard-type').value;
        const condition = document.getElementById('yard-condition').value;
        const origin = document.getElementById('yard-origin').value.trim();
        const note = document.getElementById('yard-note').value.trim();
        const entryDateInput = document.getElementById('yard-entry-date').value;
        const yardDest = document.getElementById('yard-dest-select')?.value || 'RPTULIPAN';
        const yardNotesPrefix = yardDest === 'STORAGE' ? '[Storage Yard] ' : '';

        const entryFee = parseFloat(document.getElementById('yard-entry-fee').value) || 0;
        const dailyRate = parseFloat(document.getElementById('yard-daily-rate').value) || 0;
        const exitDate = document.getElementById('yard-exit-date').value || '';
        const priceTags = `[EntryFee: ${entryFee}] [DailyRate: ${dailyRate}]` + (exitDate ? ` [ExitDate: ${exitDate}]` : '');

        if (!containerNo) return alert("Please enter a Container Number.");

        const btn = document.getElementById('btn-save-yard');
        btn.disabled = true;
        btn.textContent = "SAVING...";

        const status = exitDate ? 'SOLD' : 'AVAILABLE';

        const yardObj = {
            container_no: containerNo.toUpperCase(),
            size,
            type,
            condition,
            origin_release: origin,
            notes: `${yardNotesPrefix}${priceTags} ${note}`.trim(),
            status: status
        };

        // Use the date from the input field if provided
        if (entryDateInput) {
            yardObj.created_at = new Date(entryDateInput + 'T12:00:00').toISOString();
        }

        try {
            if (editingYardId) {
                const { data, error } = await window.db.from('yard_stock').update(yardObj).eq('id', editingYardId).select();
                if (error) throw error;
                const idx = currentYardStock.findIndex(item => item.id === editingYardId);
                if (idx !== -1) currentYardStock[idx] = data[0];
            } else {
                const { data, error } = await window.db.from('yard_stock').insert([yardObj]).select();
                if (error) throw error;
                currentYardStock.unshift(data[0]);
            }

            alert("Container saved to yard stock!");
            resetYardForm();
            loadYardData(false);
        } catch (err) {
            console.error("Error saving yard container:", err);
            alert("Failed to save container.");
        } finally {
            btn.disabled = false;
            btn.textContent = "SAVE TO YARD";
        }
    };

    window.editYardItem = function(id) {
        const item = currentYardStock.find(i => i.id === id);
        if (!item) return;

        editingYardId = id;
        document.getElementById('yard-container-no').value = item.container_no || '';
        document.getElementById('yard-size').value = item.size || '';
        document.getElementById('yard-type').value = item.type || 'DRY';
        document.getElementById('yard-condition').value = item.condition || 'USED';
        document.getElementById('yard-origin').value = item.origin_release || '';
        
        // Parse notes and prices
        const parsed = parseYardNotes(item.notes);
        if (document.getElementById('yard-dest-select')) {
            document.getElementById('yard-dest-select').value = parsed.isStorage ? 'STORAGE' : 'RPTULIPAN';
        }
        document.getElementById('yard-entry-fee').value = parsed.entryFee > 0 ? parsed.entryFee : '';
        document.getElementById('yard-daily-rate').value = parsed.dailyRate > 0 ? parsed.dailyRate : '';
        document.getElementById('yard-exit-date').value = parsed.exitDate || '';
        document.getElementById('yard-note').value = parsed.cleanNote || '';

        // Populate the entry date field
        if (item.created_at) {
            const d = new Date(item.created_at);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            document.getElementById('yard-entry-date').value = `${yyyy}-${mm}-${dd}`;
        } else {
            document.getElementById('yard-entry-date').value = '';
        }

        const btn = document.getElementById('btn-save-yard');
        if (btn) {
            btn.textContent = "UPDATE CONTAINER";
            btn.classList.add('btn-update');
        }
        renderYardTable(); // Refresh selection
        renderStorageTable();
    };

    window.deleteYardItem = async function(id) {
        if (!confirm("Are you sure you want to remove this container from the yard?")) return;
        try {
            const { error } = await window.db.from('yard_stock').delete().eq('id', id);
            if (error) throw error;
            
            // Local-first removal
            currentYardStock = currentYardStock.filter(item => item.id !== id);
            
            if (editingYardId === id) resetYardForm();
            loadYardData(false);
        } catch (err) {
            console.error("Error deleting yard item:", err);
        }
    };

    function resetYardForm() {
        editingYardId = null;
        const cno = document.getElementById('yard-container-no');
        const org = document.getElementById('yard-origin');
        const nte = document.getElementById('yard-note');
        const dtf = document.getElementById('yard-entry-date');
        const dest = document.getElementById('yard-dest-select');
        const eFee = document.getElementById('yard-entry-fee');
        const dRate = document.getElementById('yard-daily-rate');
        const xDate = document.getElementById('yard-exit-date');
        
        if (cno) cno.value = '';
        if (org) org.value = '';
        if (nte) nte.value = '';
        if (dest) dest.value = 'RPTULIPAN';
        if (eFee) eFee.value = '';
        if (dRate) dRate.value = '';
        if (xDate) xDate.value = '';
        // Reset date to today for next new record
        if (dtf) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dtf.value = `${yyyy}-${mm}-${dd}`;
        }
        
        const btn = document.getElementById('btn-save-yard');
        if (btn) {
            btn.textContent = "SAVE TO YARD";
            btn.classList.remove('btn-update');
        }
        renderYardTable(); // Refresh selection
        renderStorageTable();
    }

    // --- CALENDAR INTEGRATION ---
    function updateYardSelectors(filterType = 'YARD') {
        const sel = document.getElementById('in-yard-stock-sel');
        if (!sel) return;

        const lbl = document.querySelector('#yard-group-container label');
        if (lbl) {
            lbl.textContent = filterType === 'STORAGE' ? 'Select Storage' : 'Select RPTulipan';
        }

        const currentVal = sel.value;
        sel.innerHTML = filterType === 'STORAGE' 
            ? '<option value="" disabled selected>Select Container in Storage...</option>'
            : '<option value="" disabled selected>Select Container in Yard...</option>';
        
        currentYardStock.filter(i => {
            const isStorage = (i.notes || '').includes('[Storage Yard]');
            const matchYard = filterType === 'STORAGE' ? isStorage : !isStorage;
            return i.status === 'AVAILABLE' && matchYard;
        }).forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.container_no} - ${item.size} (${item.condition})`;
            opt.dataset.size = item.size;
            opt.dataset.type = item.type;
            opt.dataset.cond = item.condition;
            sel.appendChild(opt);
        });

        if (currentVal) sel.value = currentVal;
    }
    window.updateYardSelectors = updateYardSelectors;

    window.isYardItemInStorage = function(itemId) {
        const item = currentYardStock.find(i => i.id === itemId);
        return item ? (item.notes || '').includes('[Storage Yard]') : false;
    };

    window.setContainerSource = function(source) {
        document.getElementById('in-container-source').value = source;
        const releaseGroup = document.getElementById('release-group-container');
        const yardGroup = document.getElementById('yard-group-container');
        const btnRelease = document.getElementById('source-release');
        const btnYard = document.getElementById('source-yard');
        const btnStorage = document.getElementById('source-storage');

        // Toggle active button style
        const buttons = [
            { id: 'source-release', val: 'RELEASE', btn: btnRelease },
            { id: 'source-yard', val: 'YARD', btn: btnYard },
            { id: 'source-storage', val: 'STORAGE', btn: btnStorage }
        ];

        buttons.forEach(b => {
            if (b.btn) {
                if (source === b.val) {
                    b.btn.style.background = '#0f172a';
                    b.btn.style.color = 'white';
                } else {
                    b.btn.style.background = 'transparent';
                    b.btn.style.color = '#64748b';
                }
            }
        });

        if (source === 'RELEASE') {
            releaseGroup.style.display = 'block';
            yardGroup.style.display = 'none';
        } else {
            releaseGroup.style.display = 'none';
            yardGroup.style.display = 'block';
            
            // Load and update selectors based on source (YARD or STORAGE)
            loadYardData().then(() => {
                updateYardSelectors(source);
                
                const yardItemId = document.getElementById('in-yard-item-id')?.value;
                if (yardItemId) {
                    const sel = document.getElementById('in-yard-stock-sel');
                    if (sel) sel.value = yardItemId;
                }
            });
        }
    };

    window.autoPopulateFromYard = function(sel) {
        const opt = sel.options[sel.selectedIndex];
        if (!opt || !opt.value) return;

        const size = opt.dataset.size;
        const type = opt.dataset.type;
        const cond = opt.dataset.cond;

        // Populate Calendar Fields
        const inSize = document.getElementById('in-size');
        const inSizeSel = document.getElementById('in-size-sel');
        const inType = document.getElementById('in-rel-type');
        const inCond = document.getElementById('in-rel-condition');
        const inNCont = document.getElementById('in-ncont');

        if (inSizeSel) inSizeSel.value = size;
        if (inSize) inSize.value = size;
        if (inType) inType.value = type;
        if (inCond) inCond.value = cond;
        
        // Store the yard item ID for later deduction logic
        const inYardId = document.getElementById('in-yard-item-id');
        if (inYardId) inYardId.value = opt.value;
        
        // Use the container number from the selection text (first part)
        const contNo = opt.textContent.split(' - ')[0];
        if (inNCont) inNCont.value = contNo;
    };

    window.setYardDisplayMode = function(mode) {
        const col1 = document.getElementById('col-rptulipan-yard');
        const col2 = document.getElementById('col-storage-yard');
        const btnBoth = document.getElementById('yard-view-both');
        const btnRPTulipan = document.getElementById('yard-view-rptulipan');
        const btnStorage = document.getElementById('yard-view-storage');

        if (!col1 || !col2) return;

        const buttons = [
            { mode: 'BOTH', btn: btnBoth },
            { mode: 'RPTULIPAN', btn: btnRPTulipan },
            { mode: 'STORAGE', btn: btnStorage }
        ];

        buttons.forEach(b => {
            if (b.btn) {
                if (mode === b.mode) {
                    b.btn.style.background = '#0f172a';
                    b.btn.style.color = 'white';
                } else {
                    b.btn.style.background = 'transparent';
                    b.btn.style.color = '#64748b';
                }
            }
        });

        if (mode === 'BOTH') {
            col1.style.display = 'flex';
            col1.style.flex = '1 1 calc(50% - 13px)';
            col2.style.display = 'flex';
            col2.style.flex = '1 1 calc(50% - 13px)';
        } else if (mode === 'RPTULIPAN') {
            col1.style.display = 'flex';
            col1.style.flex = '1 1 100%';
            col2.style.display = 'none';
        } else if (mode === 'STORAGE') {
            col1.style.display = 'none';
            col2.style.display = 'flex';
            col2.style.flex = '1 1 100%';
        }
    };

})();
