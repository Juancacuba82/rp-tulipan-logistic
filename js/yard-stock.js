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
            renderStorageTable();
            if (window.renderBothTable) window.renderBothTable();
            updateYardSelectors(document.getElementById('in-container-source')?.value || 'YARD');
            return;
        }
        
        try {
            const { data, error } = await window.db
                .from('yard_stock')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            currentYardStock = data || [];
            if (window.populateYardCustomerSelect) await window.populateYardCustomerSelect();
            if (window.updateYardCustomerFilters) window.updateYardCustomerFilters();
            renderYardTable();
            renderStorageTable();
            if (window.renderBothTable) window.renderBothTable();
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
        const statusFilter = document.getElementById('global-yard-status')?.value || 'ACTIVE';
        const customerFilter = document.getElementById('yf-customer')?.value || '';
        const dateFrom = document.getElementById('yf-date-from')?.value || '';
        const dateTo = document.getElementById('yf-date-to')?.value || '';
        
        const globalInvBtn = document.getElementById('btn-global-invoice-yard');
        if (globalInvBtn) {
            globalInvBtn.style.display = customerFilter ? 'flex' : 'none';
        }

        const filtered = currentYardStock.filter(item => {
            const isStorage = (item.notes || '').includes('[Storage Yard]');
            if (isStorage) return false; // Left table is only RPTulipan Yard
            
            const matchSearch = (item.container_no || '').toLowerCase().includes(searchTerm) || 
                               (item.origin_release || '').toLowerCase().includes(searchTerm);
            const matchSize = sizeFilter ? (item.size || '').includes(sizeFilter) : true;
            const matchCustomer = customerFilter ? (item.customer_name === customerFilter) : true;
            
            let matchStatus = true;
            // if (statusFilter === 'ACTIVE') matchStatus = item.status !== 'SOLD';
            // else if (statusFilter === 'INACTIVE') matchStatus = item.status === 'SOLD';
            
            let matchDate = true;
            if (dateFrom || dateTo) {
                const itemDate = item.created_at ? item.created_at.split('T')[0] : '';
                if (dateFrom && itemDate < dateFrom) matchDate = false;
                if (dateTo && itemDate > dateTo) matchDate = false;
            }
            
            return matchSearch && matchSize && matchStatus && matchCustomer && matchDate;
        });

        if (countEl) countEl.textContent = filtered.length;

        body.innerHTML = '';
        const fragment = document.createDocumentFragment();
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

            const entryDate = new Date(item.created_at || new Date());
            const billingStartDate = item.last_billed_date ? new Date(item.last_billed_date) : entryDate;
            const endDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
            const d1 = Date.UTC(billingStartDate.getFullYear(), billingStartDate.getMonth(), billingStartDate.getDate());
            const d2 = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            const accumStorage = (item.daily_rate || 0) * days;
            
            const billedLifts = item.billed_lifts || 0;
            const totalLifts = item.lifts || 1;
            const unbilledLifts = Math.max(0, totalLifts - billedLifts);
            
            const totalCost = accumStorage + (unbilledLifts * (item.lift_cost || 0));

            const tooltipTitle = item.exit_date 
                ? `Daily: $${(item.daily_rate || 0).toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit Date: ${item.exit_date}`
                : `Daily: $${(item.daily_rate || 0).toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit: Not Exited yet`;

            const containerNoDisplay = `${item.container_no || '---'}`;

            tr.innerHTML = `
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: #1e40af;">${containerNoDisplay}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.size || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.type || 'DRY'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <span class="inv-badge ${item.condition === 'NEW' ? 'inv-badge-green' : 'inv-badge-blue'}">${item.condition || 'USED'}</span>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.origin_release || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.order_out || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${(item.lifts || 1)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${days}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${accumStorage.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${((item.lifts || 1) * (item.lift_cost || 0)).toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 900; color: #10b981;">${totalCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.customer_name || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${window.formatUSPhone ? window.formatUSPhone(item.customer_phone || '') : (item.customer_phone || '---')}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.75rem; color: #475569; max-width: 250px;">${(item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : '') || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button onclick="window.showBillingHistory('${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="History" style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-receipt"></i>
                        </button>
                        <button onclick="editYardItem('${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="Edit" style="background: #f1f5f9; color: #1e40af; border: 1px solid #cbd5e1; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteYardItem('${item.id}'); event.stopPropagation();" class="btn-manage-inline btn-delete-yard" title="Delete" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        });
        body.appendChild(fragment);
    }
    window.renderYardTable = renderYardTable;

    function renderStorageTable() {
        const body = document.getElementById('storage-yard-body');
        const countEl = document.getElementById('storage-total-count');
        if (!body) return;

        const searchTerm = document.getElementById('sf-search')?.value.toLowerCase() || '';
        const sizeFilter = document.getElementById('sf-size')?.value || '';
        const statusFilter = document.getElementById('global-yard-status')?.value || 'ACTIVE';
        const customerFilter = document.getElementById('sf-customer')?.value || '';
        const dateFrom = document.getElementById('sf-date-from')?.value || '';
        const dateTo = document.getElementById('sf-date-to')?.value || '';

        const globalInvBtn = document.getElementById('btn-global-invoice-storage');
        if (globalInvBtn) {
            globalInvBtn.style.display = customerFilter ? 'flex' : 'none';
        }

        const filtered = currentYardStock.filter(item => {
            const isStorage = (item.notes || '').includes('[Storage Yard]');
            if (!isStorage) return false; // Right table is only Storage Yard
            
            const matchSearch = (item.container_no || '').toLowerCase().includes(searchTerm) || 
                               (item.origin_release || '').toLowerCase().includes(searchTerm);
            const matchSize = sizeFilter ? (item.size || '').includes(sizeFilter) : true;
            const matchCustomer = customerFilter ? (item.customer_name === customerFilter) : true;
            
            let matchStatus = true;
            // if (statusFilter === 'ACTIVE') matchStatus = item.status !== 'SOLD';
            // else if (statusFilter === 'INACTIVE') matchStatus = item.status === 'SOLD';

            let matchDate = true;
            if (dateFrom || dateTo) {
                const itemDate = item.created_at ? item.created_at.split('T')[0] : '';
                if (dateFrom && itemDate < dateFrom) matchDate = false;
                if (dateTo && itemDate > dateTo) matchDate = false;
            }

            return matchSearch && matchSize && matchStatus && matchCustomer && matchDate;
        });

        if (countEl) countEl.textContent = filtered.length;

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

        const fragment = document.createDocumentFragment();
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

            const entryDate = new Date(item.created_at || new Date());
            const billingStartDate = item.last_billed_date ? new Date(item.last_billed_date) : entryDate;
            const endDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
            const d1 = Date.UTC(billingStartDate.getFullYear(), billingStartDate.getMonth(), billingStartDate.getDate());
            const d2 = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            const accumStorage = (item.daily_rate || 0) * days;
            
            const billedLifts = item.billed_lifts || 0;
            const totalLifts = item.lifts || 1;
            const unbilledLifts = Math.max(0, totalLifts - billedLifts);
            
            const totalCost = accumStorage + (unbilledLifts * (item.lift_cost || 0));

            const tooltipTitle = item.exit_date 
                ? `Daily: $${(item.daily_rate || 0).toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit Date: ${item.exit_date}`
                : `Daily: $${(item.daily_rate || 0).toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit: Not Exited yet`;

            const containerNoDisplay = `${item.container_no || '---'}`;

            tr.innerHTML = `
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: #1e40af;">${containerNoDisplay}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.size || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.type || 'DRY'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <span class="inv-badge ${item.condition === 'NEW' ? 'inv-badge-green' : 'inv-badge-blue'}">${item.condition || 'USED'}</span>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.origin_release || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.order_out || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${(item.lifts || 1)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${days}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${accumStorage.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${((item.lifts || 1) * (item.lift_cost || 0)).toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 900; color: #10b981;">${totalCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.customer_name || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${window.formatUSPhone ? window.formatUSPhone(item.customer_phone || '') : (item.customer_phone || '---')}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.75rem; color: #475569; max-width: 250px;">${(item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : '') || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button onclick="window.showBillingHistory('${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="History" style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-receipt"></i>
                        </button>
                        <button onclick="editYardItem('${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="Edit" style="background: #f1f5f9; color: #1e40af; border: 1px solid #cbd5e1; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteYardItem('${item.id}'); event.stopPropagation();" class="btn-manage-inline btn-delete-yard" title="Delete" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        });
        body.appendChild(fragment);
    }
    window.renderStorageTable = renderStorageTable;

    function renderBothTable() {
        const body = document.getElementById('both-yard-body');
        const countEl = document.getElementById('both-total-count');
        if (!body) return;

        const searchTerm = document.getElementById('both-search')?.value.toLowerCase() || '';
        const sizeFilter = document.getElementById('both-size')?.value || '';
        const statusFilter = document.getElementById('global-yard-status')?.value || 'ACTIVE';
        const customerFilter = document.getElementById('both-customer')?.value || '';
        const dateFrom = document.getElementById('both-date-from')?.value || '';
        const dateTo = document.getElementById('both-date-to')?.value || '';

        const globalInvBtn = document.getElementById('btn-global-invoice-both');
        if (globalInvBtn) {
            globalInvBtn.style.display = customerFilter ? 'flex' : 'none';
        }

        const filtered = currentYardStock.filter(item => {
            const matchSearch = (item.container_no || '').toLowerCase().includes(searchTerm) || 
                               (item.origin_release || '').toLowerCase().includes(searchTerm);
            const matchSize = sizeFilter ? (item.size || '').includes(sizeFilter) : true;
            const matchCustomer = customerFilter ? (item.customer_name === customerFilter) : true;
            
            let matchStatus = true;
            // if (statusFilter === 'ACTIVE') matchStatus = item.status !== 'SOLD';
            // else if (statusFilter === 'INACTIVE') matchStatus = item.status === 'SOLD';

            let matchDate = true;
            if (dateFrom || dateTo) {
                const itemDate = item.created_at ? item.created_at.split('T')[0] : '';
                if (dateFrom && itemDate < dateFrom) matchDate = false;
                if (dateTo && itemDate > dateTo) matchDate = false;
            }

            return matchSearch && matchSize && matchStatus && matchCustomer && matchDate;
        });

        if (countEl) countEl.textContent = filtered.length;

        body.innerHTML = '';
        if (filtered.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="18" style="padding: 20px; text-align: center; color: #64748b; font-weight: 600;">
                        No items to display
                    </td>
                </tr>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach(item => {
            const isStorage = (item.notes || '').includes('[Storage Yard]');
            const isSelected = (editingYardId === item.id);
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.style.transition = 'background-color 0.2s ease';
            tr.style.borderBottom = '1px solid #475569';

            const isExited = item.status === 'SOLD';
            const baseBgColor = isStorage ? '#f0fdf4' : '#eff6ff'; // Light green for storage, light blue for rptulipan
            
            const applyStyle = (isHover) => {
                if (isSelected) {
                    tr.style.backgroundColor = '#e0f2fe';
                    tr.style.borderLeft = '4px solid #0284c7';
                } else if (isHover) {
                    tr.style.backgroundColor = '#f8fafc';
                    tr.style.borderLeft = '4px solid transparent';
                } else {
                    tr.style.backgroundColor = baseBgColor;
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

            const entryDate = new Date(item.created_at || new Date());
            const billingStartDate = item.last_billed_date ? new Date(item.last_billed_date) : entryDate;
            const endDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
            const d1 = Date.UTC(billingStartDate.getFullYear(), billingStartDate.getMonth(), billingStartDate.getDate());
            const d2 = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            const accumStorage = (item.daily_rate || 0) * days;
            
            const billedLifts = item.billed_lifts || 0;
            const totalLifts = item.lifts || 1;
            const unbilledLifts = Math.max(0, totalLifts - billedLifts);
            
            const totalCost = accumStorage + (unbilledLifts * (item.lift_cost || 0));

            const containerNoDisplay = `${item.container_no || '---'}`;

            const yardBadge = isStorage 
                ? `<span style="font-size: 0.7rem; font-weight: 800; padding: 3px 6px; border-radius: 4px; background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;">STORAGE</span>`
                : `<span style="font-size: 0.7rem; font-weight: 800; padding: 3px 6px; border-radius: 4px; background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe;">RPTULIPAN</span>`;

            tr.innerHTML = `
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">${yardBadge}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: #1e40af;">${containerNoDisplay}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.size || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.type || 'DRY'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <span class="inv-badge ${item.condition === 'NEW' ? 'inv-badge-green' : 'inv-badge-blue'}">${item.condition || 'USED'}</span>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.origin_release || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.order_out || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${(item.lifts || 1)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${days}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${accumStorage.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${((item.lifts || 1) * (item.lift_cost || 0)).toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 900; color: #10b981;">${totalCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.customer_name || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${window.formatUSPhone ? window.formatUSPhone(item.customer_phone || '') : (item.customer_phone || '---')}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.75rem; color: #475569; max-width: 250px;">${(item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : '') || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button onclick="window.showBillingHistory('${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="History" style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-receipt"></i>
                        </button>
                        <button onclick="editYardItem('${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="Edit" style="background: #f1f5f9; color: #1e40af; border: 1px solid #cbd5e1; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteYardItem('${item.id}'); event.stopPropagation();" class="btn-manage-inline btn-delete-yard" title="Delete" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        });
        body.appendChild(fragment);
    }
    window.renderBothTable = renderBothTable;

    window.toggleYardPaymentMethod = function() {
        const exitDate = document.getElementById('yard-exit-date').value;
        const group = document.getElementById('yard-pay-method-group');
        if (exitDate) {
            group.style.display = 'block';
        } else {
            group.style.display = 'none';
        }
        window.toggleYardSplitMethod();
    };

    window.toggleYardSplitMethod = function() {
        const method = document.getElementById('yard-pay-method').value;
        const splitGroup = document.getElementById('yard-split-amounts');
        if (method === 'SPLIT') {
            splitGroup.style.display = 'flex';
        } else {
            splitGroup.style.display = 'none';
            document.getElementById('yard-cash-amt').value = '';
            document.getElementById('yard-bank-amt').value = '';
        }
    };

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

        const customerSel = document.getElementById('yard-customer-sel');
        const customer = (customerSel && customerSel.style.display !== 'none') ? customerSel.value : (document.getElementById('yard-customer')?.value || '');
        const phone = document.getElementById('yard-phone')?.value || '';

        const dailyRate = parseFloat(document.getElementById('yard-daily-rate').value) || 0;
        const exitDate = document.getElementById('yard-exit-date').value || '';
        const orderOut = document.getElementById('yard-order-out')?.value.trim() || '';
        const lifts = parseFloat(document.getElementById('yard-lifts')?.value) || 0;
        const liftCost = parseFloat(document.getElementById('yard-lift-cost')?.value) || 0.00;

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
            notes: `${yardNotesPrefix} ${note}`.trim(),
            status: status,
            customer_name: customer,
            customer_phone: phone,
            entry_fee: 0,
            daily_rate: dailyRate,
            exit_date: exitDate || null,
            order_out: orderOut || null,
            lifts: lifts,
            lift_cost: liftCost
        };

        // Use the date from the input field if provided
        if (entryDateInput) {
            yardObj.created_at = new Date(entryDateInput + 'T12:00:00').toISOString();
        }

        try {
            let savedRecord = null;
            if (editingYardId) {
                const { data, error } = await window.db.from('yard_stock').update(yardObj).eq('id', editingYardId).select();
                if (error) throw error;
                const idx = currentYardStock.findIndex(item => item.id === editingYardId);
                if (idx !== -1) currentYardStock[idx] = data[0];
                savedRecord = data[0];
            } else {
                const { data, error } = await window.db.from('yard_stock').insert([yardObj]).select();
                if (error) throw error;
                currentYardStock.unshift(data[0]);
                savedRecord = data[0];
            }

            // (Cash ledger sync removed; handled by Monthly Closing)

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

    window.sendYardInvoice = async function(id) {
        const item = currentYardStock.find(i => i.id === id);
        if (!item) return;

        const entryDate = new Date(item.created_at || new Date());
        const endDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
        const d1 = Date.UTC(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
        const d2 = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
        const accumStorage = (item.daily_rate || 0) * days;
        const totalCost = accumStorage + ((item.lifts || 1) * (item.lift_cost || 0));

        const serviceId = localStorage.getItem('ejs_yard_service_id') || localStorage.getItem('ejs_service_id');
        const templateId = localStorage.getItem('ejs_yard_template_id') || localStorage.getItem('ejs_template_id');
        const publicKey = localStorage.getItem('ejs_public_key');

        if (!serviceId || !templateId || !publicKey) {
            alert('EmailJS is not configured. Please go to Email Settings.');
            return;
        }

        if (!item.customer_name || !item.customer_phone) {
            alert('Customer Name and Phone are required to send an invoice.');
            return;
        }

        // We assume we might need an email address, but we might just use a placeholder if not present
        // If there's an email field we could use it, for now we will prompt the user for the email
        const emailRaw = prompt("Please enter the customer's email address to send the invoice:", "");
        if (!emailRaw || !emailRaw.trim()) return; 
        const email = emailRaw.trim();

        const btn = document.activeElement;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            emailjs.init(publicKey);

            const templateParams = {
                to_email: email,
                customer_name: item.customer_name,
                container_no: item.container_no,
                order_in: item.origin_release,
                order_out: item.order_out,
                entry_date: window.formatDateMMDDYYYY(item.created_at),
                exit_date: item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : 'Not Exited',
                days: days,
                days_cost: accumStorage.toFixed(2),
                lifts: item.lifts || 1,
                lifts_cost: ((item.lifts || 1) * (item.lift_cost || 0)).toFixed(2),
                total_cost: totalCost.toFixed(2)
            };

            await emailjs.send(serviceId, templateId, templateParams);
            
            if (window.showToast) window.showToast('Invoice sent successfully!', 'success');
            else alert('Invoice sent successfully!');

        } catch (err) {
            console.error('EmailJS Error:', err);
            alert("Error sending email: " + (err.text || JSON.stringify(err)));
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    async function generateYardInvoiceBase64(htmlContent, customerName) {
        const { jsPDF } = window.jspdf;
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:-9999px;top:0;width:280mm;background:white;padding:20px;';
        
        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e293b;padding-bottom:15px;margin-bottom:20px;font-family:Arial,sans-serif;">
                <div>
                    <h1 style="font-size:1.8rem;margin:0;font-weight:900;color:#1e293b;">STATEMENT OF ACCOUNT</h1>
                    <p style="margin:5px 0;color:#64748b;font-weight:bold;">RP TULIPAN LOGISTIC</p>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0;font-weight:bold;color:#1e293b;">CUSTOMER: ${customerName}</p>
                    <p style="margin:0;color:#64748b;">DATE: ${window.formatDateMMDDYYYY(new Date().toISOString())}</p>
                </div>
            </div>
            ${htmlContent}
        `;

        document.body.appendChild(container);

        try {
            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            const pdf = new jsPDF('l', 'mm', 'a4'); // 'l' for landscape because the table is wide
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();
            const iw = pw;
            const ih = (canvas.height * pw) / canvas.width;
            const margin = 10;
            const usable = ph - margin * 2;

            if (ih <= usable) {
                pdf.addImage(imgData, 'JPEG', 0, margin, iw, ih);
            } else {
                const pages = Math.ceil(ih / usable);
                for (let pg = 0; pg < pages; pg++) {
                    if (pg > 0) pdf.addPage();
                    const yo = margin - pg * usable;
                    pdf.addImage(imgData, 'JPEG', 0, yo, iw, ih);
                    pdf.setFillColor(255, 255, 255);
                    if (pg > 0) pdf.rect(0, 0, pw, margin, 'F');
                    const ov = yo + ih - ph + margin;
                    if (ov > 0) pdf.rect(0, ph - margin, pw, margin + 1, 'F');
                }
            }

            return pdf.output('datauristring');
        } finally {
            document.body.removeChild(container);
        }
    }

    window.sendGlobalYardInvoice = async function(tableType = 'YARD') {
        let customerFilter = '';
        if (tableType === 'YARD') customerFilter = document.getElementById('yf-customer')?.value || '';
        else if (tableType === 'STORAGE') customerFilter = document.getElementById('sf-customer')?.value || '';
        else if (tableType === 'BOTH') customerFilter = document.getElementById('both-customer')?.value || '';
        
        if (!customerFilter) {
            alert('Please select a Customer from the filter first.');
            return;
        }

        const filtered = currentYardStock.filter(item => {
            const isStorage = (item.notes || '').includes('[Storage Yard]');
            if (tableType === 'YARD' && isStorage) return false;
            if (tableType === 'STORAGE' && !isStorage) return false;
            if (item.customer_name !== customerFilter) return false;
            
            // Apply other filters if necessary, but generally we want to invoice what's currently shown
            // const statusFilter = document.getElementById('global-yard-status')?.value || 'ACTIVE';
            // if (statusFilter === 'ACTIVE' && item.status === 'SOLD') return false;
            // if (statusFilter === 'INACTIVE' && item.status !== 'SOLD') return false;
            
            return true;
        });

        if (filtered.length === 0) {
            alert('No records found for this customer to invoice.');
            return;
        }

        const serviceId = localStorage.getItem('ejs_yard_service_id') || localStorage.getItem('ejs_service_id');
        const templateId = localStorage.getItem('ejs_yard_template_id') || localStorage.getItem('ejs_template_id');
        const publicKey = localStorage.getItem('ejs_public_key');

        if (!serviceId || !templateId || !publicKey) {
            alert('EmailJS is not configured. Please go to Email Settings.');
            return;
        }

        let email = "";
        if (window.yardCustomersList) {
            const cust = window.yardCustomersList.find(c => c.name === customerFilter);
            if (cust && cust.email) email = cust.email;
        }

        if (email) {
            if (!confirm(`Email found: ${email}\n\nDo you want to send the Statement to this address?`)) {
                const emailRaw = prompt("Please enter a different email address:", email);
                if (!emailRaw || !emailRaw.trim()) return;
                email = emailRaw.trim();
            }
        } else {
            const emailRaw = prompt("No email saved for this customer. Please enter an email address manually:", "");
            if (!emailRaw || !emailRaw.trim()) return; 
            email = emailRaw.trim();
        }

        let btn;
        if (tableType === 'YARD') btn = document.getElementById('btn-global-invoice-yard');
        else if (tableType === 'STORAGE') btn = document.getElementById('btn-global-invoice-storage');
        else if (tableType === 'BOTH') btn = document.getElementById('btn-global-invoice-both');

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            emailjs.init(publicKey);

            let invoiceHtml = `
            <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 20px; font-size: 11px;">
                <thead>
                    <tr style="background-color: #f1f5f9; color: #0f172a;">
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">N&deg; CONT</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">SIZE</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">TYPE</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">CONDITION</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">DATE IN</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">ORDER# IN</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">DATE OUT</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">ORDER# OUT</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">LIFTS</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">DAYS</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">DAYS COST</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">LIFTS COST</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
            `;

            let grandTotal = 0;
            let sumDaysCost = 0;
            let sumLiftsCost = 0;

            filtered.forEach(item => {
                const entryDate = new Date(item.created_at);
                const exitDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
                const d1 = Date.UTC(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
                const d2 = Date.UTC(exitDate.getFullYear(), exitDate.getMonth(), exitDate.getDate());
                const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
                
                const accumStorage = (item.daily_rate || 0) * days;
                const liftCost = ((item.lifts || 1) * (item.lift_cost || 0));
                const totalCost = accumStorage + liftCost;

                grandTotal += totalCost;
                sumDaysCost += accumStorage;
                sumLiftsCost += liftCost;

                invoiceHtml += `
                    <tr>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: ${item.exit_date ? '#64748b' : '#1e40af'};">${item.container_no || '---'}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.size || '---'}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.type || 'DRY'}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.condition || 'USED'}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.origin_release || '---'}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : '---'}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.order_out || '---'}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${(item.lifts || 1)}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${days}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${accumStorage.toFixed(2)}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${liftCost.toFixed(2)}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #10b981;">${totalCost.toFixed(2)}</td>
                    </tr>
                `;
            });

            invoiceHtml += `
                </tbody>
            </table>

            <table style="width: 250px; margin-left: auto; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px;">
                <tr>
                    <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; background-color: #fcece3; color: #000;">DAYS COST</td>
                    <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; color: #000;">$${sumDaysCost.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; background-color: #fcece3; color: #000;">LIFTS COST</td>
                    <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; color: #000;">$${sumLiftsCost.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; background-color: #fcece3; color: #000;">TOTAL</td>
                    <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; color: #000;">$${grandTotal.toFixed(2)}</td>
                </tr>
            </table>

            <div style="margin-top: 20px; text-align: right; font-family: Arial, sans-serif; font-size: 14px; color: #000;">
                <span style="font-weight: bold; background-color: #fcece3; padding: 6px 10px; border: 1px solid #cbd5e1; display: inline-block;">TOTAL INVOICE</span>
                <span style="font-weight: bold; font-size: 16px; margin-left: 10px;">$${grandTotal.toFixed(2)}</span>
            </div>
            `;

            const b64Pdf = await generateYardInvoiceBase64(invoiceHtml, customerFilter);

            const templateParams = {
                to_email: email,
                customer_name: customerFilter,
                invoice_html: "", // No enviar la tabla en el cuerpo del correo
                grand_total: grandTotal.toFixed(2),
                pdf_attachment: b64Pdf
            };

            await emailjs.send(serviceId, templateId, templateParams);
            
            if (window.showToast) window.showToast('Global Invoice sent successfully!', 'success');
            else alert('Global Invoice sent successfully!');

        } catch (err) {
            console.error('EmailJS Error:', err);
            alert("Error sending email: " + (err.text || JSON.stringify(err)));
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
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
        
        const selC = document.getElementById('yard-customer-sel');
        const inpC = document.getElementById('yard-customer');
        if (selC && inpC) {
            selC.style.display = 'block'; inpC.style.display = 'none'; selC.value = item.customer_name || '';
            if (selC.value === "" && item.customer_name) { selC.style.display = 'none'; inpC.style.display = 'block'; inpC.value = item.customer_name; }
        }
        const phoneInp = document.getElementById('yard-phone');
        if (phoneInp) phoneInp.value = item.customer_phone || '';
        
        // Parse notes and prices
        const isStorage = (item.notes || '').includes('[Storage Yard]');
        if (document.getElementById('yard-dest-select')) {
            document.getElementById('yard-dest-select').value = isStorage ? 'STORAGE' : 'RPTULIPAN';
        }
        document.getElementById('yard-daily-rate').value = (item.daily_rate || 0) > 0 ? (item.daily_rate || 0) : '';
        document.getElementById('yard-exit-date').value = item.exit_date || '';
        
        if (document.getElementById('yard-order-out')) document.getElementById('yard-order-out').value = item.order_out || '';
        if (document.getElementById('yard-lifts')) document.getElementById('yard-lifts').value = (item.lifts || 1) !== undefined ? (item.lifts || 1) : 1;
        if (document.getElementById('yard-lift-cost')) document.getElementById('yard-lift-cost').value = (item.lift_cost !== undefined) ? item.lift_cost : 0.00;
        
        document.getElementById('yard-note').value = (item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : '') || '';

        // Fetch Cash Ledger info if it has an exit_date
        if (item.exit_date) {
            window.db.from('cash_ledger').select('metodo, monto').like('id', `${item.id}-y%`).then(({data}) => {
                const payMethodEl = document.getElementById('yard-pay-method');
                const cashAmtEl = document.getElementById('yard-cash-amt');
                const bankAmtEl = document.getElementById('yard-bank-amt');
                
                if (data && data.length > 0) {
                    if (data.length === 1) {
                        payMethodEl.value = data[0].metodo === 'cash' ? 'CASH' : 'BANK';
                    } else if (data.length > 1) {
                        payMethodEl.value = 'SPLIT';
                        data.forEach(d => {
                            if (d.metodo === 'cash') cashAmtEl.value = d.monto;
                            if (d.metodo === 'bank') bankAmtEl.value = d.monto;
                        });
                    }
                } else {
                    payMethodEl.value = 'BANK';
                }
                if(window.toggleYardPaymentMethod) window.toggleYardPaymentMethod();
            });
        } else {
            document.getElementById('yard-pay-method').value = 'BANK';
            if(window.toggleYardPaymentMethod) window.toggleYardPaymentMethod();
        }

        document.getElementById('modal-title-yard').textContent = 'Edit Yard Container';
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
        if (window.renderBothTable) window.renderBothTable();
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
        const dRate = document.getElementById('yard-daily-rate');
        const xDate = document.getElementById('yard-exit-date');
        const orderOut = document.getElementById('yard-order-out');
        const lifts = document.getElementById('yard-lifts');
        const liftCost = document.getElementById('yard-lift-cost');
        
        if (cno) cno.value = '';
        if (org) org.value = '';
        if (nte) nte.value = '';
        if (dest) dest.value = 'RPTULIPAN';
        if (dRate) dRate.value = '';
        if (xDate) xDate.value = '';
        if (orderOut) orderOut.value = '';
        if (lifts) lifts.value = '1';
        if (liftCost) liftCost.value = '0.00';
        
        const selC = document.getElementById('yard-customer-sel');
        const inpC = document.getElementById('yard-customer');
        if (selC && inpC) {
            selC.style.display = 'block'; inpC.style.display = 'none'; selC.value = ''; inpC.value = '';
        }
        const phoneInp = document.getElementById('yard-phone');
        if (phoneInp) phoneInp.value = '';
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
        if (window.renderBothTable) window.renderBothTable();
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
            const deductGroup = document.getElementById('deduct-stock-group');
            if (deductGroup) deductGroup.style.display = 'block';
        } else {
            releaseGroup.style.display = 'none';
            yardGroup.style.display = 'block';
            const deductGroup = document.getElementById('deduct-stock-group');
            if (deductGroup) deductGroup.style.display = 'none';
            
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
        const colBoth = document.getElementById('col-both-yard');
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
            col1.style.display = 'none';
            col2.style.display = 'none';
            if (colBoth) colBoth.style.display = 'flex';
            if (window.renderBothTable) window.renderBothTable();
        } else if (mode === 'RPTULIPAN') {
            col1.style.display = 'flex';
            col1.style.flex = '1 1 100%';
            col2.style.display = 'none';
            if (colBoth) colBoth.style.display = 'none';
        } else if (mode === 'STORAGE') {
            col1.style.display = 'none';
            col2.style.display = 'flex';
            col2.style.flex = '1 1 100%';
            if (colBoth) colBoth.style.display = 'none';
        }
    };

    window.toggleYardCustomerMode = function() {
        const sel = document.getElementById('yard-customer-sel');
        const inp = document.getElementById('yard-customer');
        const icon = document.getElementById('yard-toggle-icon-customer');
        if (!sel || !inp || !icon) return;
        if (sel.style.display !== 'none') {
            sel.style.display = 'none'; inp.style.display = 'block';
            icon.className = 'fas fa-list'; inp.focus();
        } else {
            sel.style.display = 'block'; inp.style.display = 'none';
            icon.className = 'fas fa-edit'; window.populateYardCustomerSelect();
        }
    };

    window.populateYardCustomerSelect = async function() {
        const sel = document.getElementById('yard-customer-sel');
        if (!sel) return;
        const currentVal = sel.value;
        
        try {
            // Use global currentCustomers from data-managers.js
            window.yardCustomersList = window.currentCustomers || [];
            
            sel.innerHTML = '<option value="">Select Customer...</option>';
            const fragment1 = document.createDocumentFragment();
            window.yardCustomersList.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.name; 
                opt.textContent = c.name;
                fragment1.appendChild(opt);
            });
            sel.appendChild(fragment1);
            
            if (currentVal) sel.value = currentVal;
            
            if (window.updateYardCustomerFilters) window.updateYardCustomerFilters();
        } catch (err) {
            console.error("Error loading yard customers:", err);
        }
    };

    window.updateYardCustomerFilters = function() {
        const yfCustomer = document.getElementById('yf-customer');
        const sfCustomer = document.getElementById('sf-customer');
        const bothCustomer = document.getElementById('both-customer');
        
        if (!yfCustomer && !sfCustomer && !bothCustomer) return;
        
        let dynamicCustomers = [];
        if (currentYardStock && currentYardStock.length > 0) {
            dynamicCustomers = currentYardStock.map(item => item.customer_name).filter(n => n);
        }
        
        const allCustomers = [...new Set(dynamicCustomers)].sort();
        
        const populateSelect = (selectEl) => {
            if (!selectEl) return;
            const currentVal = selectEl.value;
            selectEl.innerHTML = '<option value="">All Customers</option>';
            const fragment2 = document.createDocumentFragment();
            allCustomers.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                fragment2.appendChild(opt);
            });
            selectEl.appendChild(fragment2);
            if (allCustomers.includes(currentVal)) {
                selectEl.value = currentVal;
            }
        };
        
        populateSelect(yfCustomer);
        populateSelect(sfCustomer);
        populateSelect(bothCustomer);
    };
    
    window.updateLocalYardStatus = function(yardItemId, newStatus, newNotes, exitDate, newLifts, orderOut) {
        if (!currentYardStock) return;
        const item = currentYardStock.find(i => i.id === yardItemId);
        if (item) {
            if (newStatus !== undefined) item.status = newStatus;
            if (newNotes !== undefined) item.notes = newNotes;
            if (exitDate !== undefined) item.exit_date = exitDate;
            if (newLifts !== undefined) item.lifts = newLifts;
            if (orderOut !== undefined) item.order_out = orderOut;
            
            // Re-render both tables with the updated data
            renderYardTable();
            renderStorageTable();
            if (window.renderBothTable) window.renderBothTable();
            
            // Optionally update the count displays immediately
            const rptCount = currentYardStock.filter(i => i.status !== 'SOLD' && !(i.notes || '').includes('[Storage Yard]')).length;
            const strCount = currentYardStock.filter(i => i.status !== 'SOLD' && (i.notes || '').includes('[Storage Yard]')).length;
            const yTotalEl = document.getElementById('yard-total-count');
            const sTotalEl = document.getElementById('storage-total-count');
            if (yTotalEl) yTotalEl.textContent = rptCount;
            if (sTotalEl) sTotalEl.textContent = strCount;
        }
    };
    
    // Also attach onchange to yard-customer to auto-fill phone
    const yardCustomerSelect = document.getElementById('yard-customer-sel');
    if (yardCustomerSelect) {
        yardCustomerSelect.addEventListener('change', (e) => {
            const name = e.target.value;
            if (window.yardCustomersList) {
                const customer = window.yardCustomersList.find(c => c.name === name);
                if (customer && customer.phone) {
                    const phoneEl = document.getElementById('yard-phone');
                    if (phoneEl) phoneEl.value = customer.phone;
                }
            }
        });
    }

    window.showBillingHistory = async function(yardId) {
        const item = currentYardStock.find(i => i.id === yardId);
        if (!item) return;

        document.getElementById('history-container-no').textContent = item.container_no;
        const tbody = document.getElementById('billing-history-body');
        tbody.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center;">Cargando...</td></tr>';
        
        const modal = document.getElementById('yard-billing-history-modal');
        modal.style.display = 'block';
        setTimeout(() => {
            modal.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 50);

        try {
            const { data, error } = await window.db
                .from('yard_billing')
                .select('*')
                .eq('yard_id', yardId)
                .order('end_date', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #64748b;">No hay cobros registrados para este contenedor.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            data.forEach(b => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${b.start_date} a ${b.end_date}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${b.days_billed}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${b.lifts_billed}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #0f172a;">$${b.amount.toFixed(2)}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 0.75rem;">${b.created_at ? window.formatDateMMDDYYYY(b.created_at) : '---'}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            console.error("Error fetching billing history:", err);
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #ef4444;">Error cargando el historial.</td></tr>';
        }
    };

    let pendingBillingData = [];
    
    window.toggleMonthlyClosingSplit = function() {
        const method = document.getElementById('monthly-closing-payment-method').value;
        document.getElementById('monthly-closing-split-fields').style.display = (method === 'split') ? 'flex' : 'none';
    };
    
    window.openMonthlyClosingModal = function(yardType) {
        let dynamicCustomers = currentYardStock.filter(item => {
            const isStorage = (item.notes || '').includes('[Storage Yard]');
            if (yardType === 'YARD' && isStorage) return false;
            if (yardType === 'STORAGE' && !isStorage) return false;
            return true;
        }).map(item => item.customer_name).filter(n => n);
        
        const allCustomers = [...new Set(dynamicCustomers)].sort();
        
        const sel = document.getElementById('monthly-closing-customer');
        sel.innerHTML = '<option value="">Selecciona Cliente...</option>';
        allCustomers.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            sel.appendChild(opt);
        });
        
        document.getElementById('monthly-closing-date').value = '';
        document.getElementById('monthly-closing-preview-body').innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #94a3b8;">Selecciona un cliente y fecha para previsualizar.</td></tr>';
        document.getElementById('monthly-closing-total').textContent = '0.00';
        document.getElementById('btn-process-monthly-closing').disabled = true;
        
        const modal = document.getElementById('yard-monthly-closing-modal');
        modal.style.display = 'block';
        modal.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.previewMonthlyClosing = function() {
        const customer = document.getElementById('monthly-closing-customer').value;
        const closingDateStr = document.getElementById('monthly-closing-date').value;
        const tbody = document.getElementById('monthly-closing-preview-body');
        const btn = document.getElementById('btn-process-monthly-closing');
        
        if (!customer || !closingDateStr) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #94a3b8;">Selecciona un cliente y fecha para previsualizar.</td></tr>';
            document.getElementById('monthly-closing-total').textContent = '0.00';
            btn.disabled = true;
            return;
        }

        const closingDate = new Date(closingDateStr + 'T23:59:59');
        pendingBillingData = [];
        let grandTotal = 0;
        
        const filtered = currentYardStock.filter(i => i.customer_name === customer);
        
        filtered.forEach(item => {
            const entryDate = new Date(item.created_at);
            const startDate = item.last_billed_date ? new Date(item.last_billed_date) : entryDate;
            
            if (item.exit_date) {
                const exitD = new Date(item.exit_date + 'T12:00:00');
                if (exitD <= startDate) return; // already fully billed
            }
            
            let endDate = closingDate;
            let isFinalBill = false;
            
            if (item.exit_date) {
                const exitD = new Date(item.exit_date + 'T12:00:00');
                if (exitD <= closingDate) {
                    endDate = exitD;
                    isFinalBill = true;
                }
            }
            
            if (startDate >= endDate) return; // Nothing to bill in this period
            
            const d1 = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const d2 = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            
            if (days === 0 && !isFinalBill && item.last_billed_date) return;
            
            let liftsToBill = 0;
            const billedLifts = item.billed_lifts || 0;
            const totalLifts = item.lifts || 1;
            
            if (!item.last_billed_date) {
                liftsToBill = 1;
            } else if (isFinalBill) {
                liftsToBill = Math.max(0, totalLifts - billedLifts);
            }
            
            const accumStorage = (item.daily_rate || 0) * days;
            const liftCost = liftsToBill * (item.lift_cost || 0);
            const total = accumStorage + liftCost;
            
            if (total > 0) {
                grandTotal += total;
                pendingBillingData.push({
                    item: item,
                    startStr: startDate.toISOString().split('T')[0],
                    endStr: endDate.toISOString().split('T')[0],
                    days: days,
                    lifts: liftsToBill,
                    amount: total,
                    accumStorage,
                    liftCost
                });
            }
        });
        
        if (pendingBillingData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #94a3b8;">No hay cobros pendientes para este cliente en esta fecha.</td></tr>';
            document.getElementById('monthly-closing-total').textContent = '0.00';
            btn.disabled = true;
            return;
        }

        tbody.innerHTML = '';
        pendingBillingData.forEach(data => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #1e40af;">${data.item.container_no}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${data.startStr} al ${data.endStr}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${data.days}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${data.lifts}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">$${data.amount.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
        
        document.getElementById('monthly-closing-total').textContent = grandTotal.toFixed(2);
        btn.disabled = false;
    };

    window.processMonthlyClosing = async function() {
        if (pendingBillingData.length === 0) return;
        
        const btn = document.getElementById('btn-process-monthly-closing');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;
        
        try {
            const customer = document.getElementById('monthly-closing-customer').value;
            const paymentMethod = document.getElementById('monthly-closing-payment-method').value;
            
            let email = "";
            if (window.yardCustomersList) {
                const cust = window.yardCustomersList.find(c => c.name === customer);
                if (cust && cust.email) email = cust.email;
            }
            if (!email) {
                const emailRaw = prompt(`No se encontró correo guardado para ${customer}. Ingrese el correo para enviar la factura (o deje en blanco para no enviarla):`, "");
                if (emailRaw && emailRaw.trim()) email = emailRaw.trim();
            }
            
            let b64Pdf = null;
            let grandTotal = 0;
            if (email) {
                let invoiceHtml = `
                <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 20px; font-size: 11px;">
                    <thead>
                        <tr style="background-color: #f1f5f9; color: #0f172a;">
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">N&deg; CONT</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">SIZE</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">TYPE</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">CONDITION</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">DATE IN</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">ORDER# IN</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">DATE OUT</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">ORDER# OUT</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">LIFTS</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">DAYS</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">DAYS COST</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">LIFTS COST</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; background-color: #e0f2fe;">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                `;
                
                let totalDaysCost = 0;
                let totalLiftsCost = 0;
                
                for (let data of pendingBillingData) {
                    const item = data.item;
                    grandTotal += data.amount;
                    totalDaysCost += (data.accumStorage || 0);
                    totalLiftsCost += (data.liftCost || 0);
                    
                    invoiceHtml += `
                        <tr>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: ${item.exit_date ? '#64748b' : '#1e40af'};">${item.container_no || '---'}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.size || '---'}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.type || 'DRY'}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.condition || 'USED'}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1;">${window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(item.created_at) : item.created_at.split('T')[0]}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.origin_release || '---'}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.exit_date ? (window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : item.exit_date) : '---'}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.order_out || '---'}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${data.lifts}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${data.days}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${(data.accumStorage || 0).toFixed(2)}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${(data.liftCost || 0).toFixed(2)}</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #10b981; background-color: #f0fdf4;">${data.amount.toFixed(2)}</td>
                        </tr>
                    `;
                }
                
                invoiceHtml += `
                    </tbody>
                </table>
                
                <table style="width: 250px; margin-left: auto; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px;">
                    <tr>
                        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; background-color: #fcece3;">DAYS COST</td>
                        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right;">$${totalDaysCost.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; background-color: #fcece3;">LIFTS COST</td>
                        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right;">$${totalLiftsCost.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; background-color: #fcece3;">TOTAL</td>
                        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right;">$${grandTotal.toFixed(2)}</td>
                    </tr>
                </table>

                <div style="text-align: right; margin-top: 15px; font-family: Arial, sans-serif;">
                    <span style="font-weight: bold; background-color: #fcece3; padding: 6px 10px; border: 1px solid #cbd5e1; display: inline-block;">TOTAL INVOICE</span>
                    <span style="font-weight: bold; font-size: 16px; margin-left: 10px;">$${grandTotal.toFixed(2)}</span>
                </div>
                `;
                
                if (typeof generateYardInvoiceBase64 === 'function') {
                    b64Pdf = await generateYardInvoiceBase64(invoiceHtml, customer);
                }
            }
            
            let cashSplit = 0;
            let bankSplit = 0;
            if (paymentMethod === 'split') {
                cashSplit = parseFloat(document.getElementById('monthly-closing-split-cash').value) || 0;
                bankSplit = parseFloat(document.getElementById('monthly-closing-split-bank').value) || 0;
            }
            
            const billingRecords = [];
            const cashLedgerEntries = [];
            
            for (let data of pendingBillingData) {
                billingRecords.push({
                    yard_id: data.item.id,
                    start_date: data.startStr,
                    end_date: data.endStr,
                    days_billed: data.days,
                    lifts_billed: data.lifts,
                    amount: data.amount
                });
                
                const isStorage = (data.item.notes || '').includes('[Storage Yard]');
                const yardLabel = isStorage ? '[Storage Yard]' : '[RP Tulipan Yard]';
                
                // If it's not a split payment, record each container individually
                if (paymentMethod !== 'split') {
                    cashLedgerEntries.push({
                        date: new Date().toISOString().split('T')[0],
                        tipo: 'ingreso',
                        metodo: paymentMethod,
                        monto: data.amount,
                        descripcion: `Cierre Mensual ${yardLabel} - Cont: ${data.item.container_no} (${data.startStr} a ${data.endStr})`,
                        referencia: customer,
                        chofer: ''
                    });
                }
                
                const newBilledLifts = (data.item.billed_lifts || 0) + data.lifts;
                const newBilledDate = data.endStr + 'T12:00:00.000Z'; 
                
                await window.db.from('yard_stock')
                    .update({
                        last_billed_date: newBilledDate,
                        billed_lifts: newBilledLifts
                    })
                    .eq('id', data.item.id);
                    
                data.item.last_billed_date = newBilledDate;
                data.item.billed_lifts = newBilledLifts;
            }
            
            // If it IS a split payment, create aggregated entries for the batch
            if (paymentMethod === 'split') {
                const containerNumbers = pendingBillingData.map(d => d.item.container_no).join(', ');
                
                let hasStorage = false;
                let hasRPT = false;
                for (let d of pendingBillingData) {
                    if ((d.item.notes || '').includes('[Storage Yard]')) hasStorage = true;
                    else hasRPT = true;
                }
                let yardLabel = (hasStorage && hasRPT) ? '[Global Yard]' : (hasStorage ? '[Storage Yard]' : '[RP Tulipan Yard]');
                
                if (cashSplit > 0) {
                    cashLedgerEntries.push({
                        date: new Date().toISOString().split('T')[0],
                        tipo: 'ingreso',
                        metodo: 'cash',
                        monto: cashSplit,
                        descripcion: `Cierre Mensual ${yardLabel} (Split Cash) - Varios Cont.`,
                        referencia: customer,
                        chofer: ''
                    });
                }
                if (bankSplit > 0) {
                    cashLedgerEntries.push({
                        date: new Date().toISOString().split('T')[0],
                        tipo: 'ingreso',
                        metodo: 'bank',
                        monto: bankSplit,
                        descripcion: `Cierre Mensual ${yardLabel} (Split Bank) - Varios Cont.`,
                        referencia: customer,
                        chofer: ''
                    });
                }
            }
            
            if (billingRecords.length > 0) {
                const { error } = await window.db.from('yard_billing').insert(billingRecords);
                if (error) throw error;
            }
            
            if (cashLedgerEntries.length > 0) {
                const { error: ledgerError } = await window.db.from('cash_ledger').insert(cashLedgerEntries);
                if (ledgerError) throw ledgerError;
                
                if (window.loadAccountingData) {
                    window.loadAccountingData();
                }
            }
            
            if (email && b64Pdf) {
                const serviceId = localStorage.getItem('ejs_yard_service_id') || localStorage.getItem('ejs_service_id');
                const templateId = localStorage.getItem('ejs_yard_template_id') || localStorage.getItem('ejs_template_id');
                const templateParams = {
                    to_email: email,
                    customer_name: customer,
                    invoice_html: "",
                    grand_total: grandTotal.toFixed(2),
                    pdf_attachment: b64Pdf
                };
                
                const publicKey = localStorage.getItem('ejs_public_key');
                if (publicKey) {
                    emailjs.init(publicKey);
                    await emailjs.send(serviceId, templateId, templateParams);
                } else {
                    console.warn("EmailJS public key not found in local storage.");
                }
            }
            
            alert(email ? '¡Cierre procesado y Factura enviada por correo!' : '¡Cierre mensual procesado correctamente!');
            document.getElementById('yard-monthly-closing-modal').style.display = 'none';
            
            renderYardTable();
            renderStorageTable();
            if (window.renderBothTable) window.renderBothTable();
            
        } catch (err) {
            console.error("Error processing monthly closing:", err);
            alert("Hubo un error procesando el cierre. Revisa la consola.");
        } finally {
            btn.innerHTML = '<i class="fas fa-check-circle" style="margin-right: 8px;"></i> Procesar y Facturar';
            btn.disabled = false;
        }
    };

})();
// Trigger GitHub Pages deploy

