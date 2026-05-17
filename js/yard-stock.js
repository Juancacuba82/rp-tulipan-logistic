console.log('CRITICAL: Yard Stock JS v99 is active');

(function () {
    let currentYardStock = [];
    let editingYardId = null;

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
            updateYardSelectors();
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
            updateYardSelectors();
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
            const matchSearch = (item.container_no || '').toLowerCase().includes(searchTerm) || 
                               (item.origin_release || '').toLowerCase().includes(searchTerm);
            const matchSize = sizeFilter ? (item.size || '').includes(sizeFilter) : true;
            return matchSearch && matchSize && item.status !== 'SOLD';
        });

        if (countEl) countEl.textContent = filtered.length;

        body.innerHTML = '';
        filtered.forEach(item => {
            const isSelected = (editingYardId === item.id);
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.style.transition = 'background-color 0.2s ease';
            tr.style.borderBottom = '1px solid #475569'; // Darker, more visible line

            // Visual state helper
            const applyStyle = (isHover) => {
                if (isSelected) {
                    tr.style.backgroundColor = '#e0f2fe'; // Brighter blue for selected
                    tr.style.borderLeft = '4px solid #0284c7';
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

            tr.innerHTML = `
                <td style="padding: 12px 15px; border: 1px solid #475569;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: #1e40af;">${item.container_no || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.size || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.type || 'DRY'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <span class="inv-badge ${item.condition === 'NEW' ? 'inv-badge-green' : 'inv-badge-blue'}">${item.condition || 'USED'}</span>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.origin_release || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.75rem; color: #475569; max-width: 250px;">${item.notes || '---'}</td>
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

    // --- ACTIONS ---
    window.saveYardContainer = async function() {
        const containerNo = document.getElementById('yard-container-no').value.trim();
        const size = document.getElementById('yard-size').value;
        const type = document.getElementById('yard-type').value;
        const condition = document.getElementById('yard-condition').value;
        const origin = document.getElementById('yard-origin').value.trim();
        const note = document.getElementById('yard-note').value.trim();

        if (!containerNo) return alert("Please enter a Container Number.");

        const btn = document.getElementById('btn-save-yard');
        btn.disabled = true;
        btn.textContent = "SAVING...";

        const yardObj = {
            container_no: containerNo.toUpperCase(),
            size,
            type,
            condition,
            origin_release: origin,
            notes: note,
            status: 'AVAILABLE'
        };

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
        document.getElementById('yard-note').value = item.notes || '';

        const btn = document.getElementById('btn-save-yard');
        if (btn) {
            btn.textContent = "UPDATE CONTAINER";
            btn.classList.add('btn-update');
        }
        renderYardTable(); // Refresh selection
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
        if (cno) cno.value = '';
        if (org) org.value = '';
        if (nte) nte.value = '';
        
        const btn = document.getElementById('btn-save-yard');
        if (btn) {
            btn.textContent = "SAVE TO YARD";
            btn.classList.remove('btn-update');
        }
        renderYardTable(); // Refresh selection
    }

    // --- CALENDAR INTEGRATION ---
    function updateYardSelectors() {
        const sel = document.getElementById('in-yard-stock-sel');
        if (!sel) return;

        const currentVal = sel.value;
        sel.innerHTML = '<option value="" disabled selected>Select Container in Yard...</option>';
        
        currentYardStock.filter(i => i.status === 'AVAILABLE').forEach(item => {
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

    window.setContainerSource = function(source) {
        document.getElementById('in-container-source').value = source;
        const releaseGroup = document.getElementById('release-group-container');
        const yardGroup = document.getElementById('yard-group-container');
        const btnRelease = document.getElementById('source-release');
        const btnYard = document.getElementById('source-yard');

        if (source === 'RELEASE') {
            releaseGroup.style.display = 'block';
            yardGroup.style.display = 'none';
            btnRelease.style.background = '#0f172a';
            btnRelease.style.color = 'white';
            btnYard.style.background = 'transparent';
            btnYard.style.color = '#64748b';
        } else {
            releaseGroup.style.display = 'none';
            yardGroup.style.display = 'block';
            btnYard.style.background = '#0f172a';
            btnYard.style.color = 'white';
            btnRelease.style.background = 'transparent';
            btnRelease.style.color = '#64748b';
            
            // Load fresh yard data when switching to yard source
            loadYardData();
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
        
        // NEW: Store the yard item ID for later deduction logic
        const inYardId = document.getElementById('in-yard-item-id');
        if (inYardId) inYardId.value = opt.value;
        
        // Use the container number from the selection text (first part)
        const contNo = opt.textContent.split(' - ')[0];
        if (inNCont) inNCont.value = contNo;
    };

})();
