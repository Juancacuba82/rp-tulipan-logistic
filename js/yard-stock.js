console.log('CRITICAL: Yard Stock JS v99 is active');

(function () {
    let currentYardStock = [];
    window.getYardStockData = () => currentYardStock;
    let editingYardId = null;



    // --- INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof window.showView === 'function') {
            const originalShowView = window.showView;
            window.showView = function (viewId) {
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
                .or('is_deleted.eq.false,is_deleted.is.null')
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

    window.calculateDynamicYardCosts = function(item, dateFrom, dateTo) {
        const entryDate = new Date(item.created_at || new Date());
        // User requested to ALWAYS show total days regardless of billing history
        const billingStartDate = entryDate;
        const endDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
        
        let calcStart = billingStartDate;
        let calcEnd = endDate;

        if (dateFrom || dateTo) {
            if (dateFrom) {
                const fFromDate = new Date(dateFrom + 'T12:00:00');
                if (calcStart < fFromDate) calcStart = fFromDate;
            }
            if (dateTo) {
                const fToDate = new Date(dateTo + 'T23:59:59');
                if (calcEnd > fToDate) calcEnd = fToDate;
            }
        }

        const d1 = Date.UTC(calcStart.getFullYear(), calcStart.getMonth(), calcStart.getDate());
        const d2 = Date.UTC(calcEnd.getFullYear(), calcEnd.getMonth(), calcEnd.getDate());
        let days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
        if (isNaN(days)) days = 0;
        
        const accumStorage = (parseFloat(item.daily_rate) || 0) * days;
        
        let billedLiftsDisplay = 0;
        let liftCost = 0;
        
        const totalLifts = parseInt(item.lifts) || 1;

        if (dateFrom || dateTo) {
            let periodLifts = 0;
            const eStr = item.created_at ? item.created_at.split('T')[0] : '';
            const xStr = item.exit_date ? item.exit_date.split('T')[0] : '';
            
            if (eStr && (!dateFrom || eStr >= dateFrom) && (!dateTo || eStr <= dateTo)) periodLifts++;
            if (xStr && (!dateFrom || xStr >= dateFrom) && (!dateTo || xStr <= dateTo)) periodLifts++;
            
            periodLifts = Math.min(periodLifts, totalLifts);
            billedLiftsDisplay = periodLifts;
            liftCost = periodLifts * (parseFloat(item.lift_cost) || 0);
        } else {
            billedLiftsDisplay = totalLifts;
            liftCost = totalLifts * (parseFloat(item.lift_cost) || 0);
        }
        
        const totalCost = accumStorage + liftCost;

        return {
            days,
            accumStorage,
            lifts: billedLiftsDisplay,
            liftCost,
            totalCost
        };
    };

    window.checkYardDateMatch = function(item, dateFrom, dateTo) {
        if (!dateFrom && !dateTo) return true;
        
        const eStr = item.created_at ? item.created_at.split('T')[0] : '';
        const xStr = item.exit_date ? item.exit_date.split('T')[0] : '2099-12-31';
        
        const fFrom = dateFrom || '2000-01-01';
        const fTo = dateTo || '2099-12-31';
        
        if (eStr <= fTo && xStr >= fFrom) {
            return true;
        }
        return false;
    };

    function renderYardTable() {
        const body = document.getElementById('yard-body');
        const countEl = document.getElementById('yard-total-count');
        if (!body) return;

        const stateFilter = document.getElementById('yf-state')?.value || 'ALL';
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

            let matchState = true;
            if (stateFilter === 'ACTIVE') {
                matchState = !item.exit_date;
            } else if (stateFilter === 'INACTIVE') {
                matchState = !!item.exit_date;
            }

            const matchSize = sizeFilter ? (item.size || '').includes(sizeFilter) : true;
            const matchCustomer = customerFilter ? (item.customer_name === customerFilter) : true;

            let matchStatus = true;
            // if (statusFilter === 'ACTIVE') matchStatus = item.status !== 'SOLD';
            // else if (statusFilter === 'INACTIVE') matchStatus = item.status === 'SOLD';

            let matchDate = window.checkYardDateMatch(item, dateFrom, dateTo);

            return matchState && matchSize && matchStatus && matchCustomer && matchDate;
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

            const costs = window.calculateDynamicYardCosts(item, dateFrom, dateTo);

            const tooltipTitle = item.exit_date
                ? `Daily: $${(parseFloat(item.daily_rate) || 0).toFixed(2)}/day ($${costs.accumStorage.toFixed(2)}) | Exit Date: ${item.exit_date}`
                : `Daily: $${(parseFloat(item.daily_rate) || 0).toFixed(2)}/day ($${costs.accumStorage.toFixed(2)}) | Exit: Not Exited yet`;

            const containerNoDisplay = `${item.container_no || '---'}`;
            let displayExitDate = item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : '---';
            let displayOrderOut = item.order_out || '---';

            if (dateTo && item.exit_date) {
                const eDate = item.exit_date.split('T')[0];
                if (eDate > dateTo) {
                    displayExitDate = '---';
                    displayOrderOut = '---';
                }
            }

            tr.innerHTML = `
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: #1e40af;">${containerNoDisplay}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.size || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.type || 'DRY'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <span class="inv-badge ${item.condition === 'NEW' ? 'inv-badge-green' : 'inv-badge-blue'}">${item.condition || 'USED'}</span>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.origin_release || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${displayExitDate}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${displayOrderOut}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${costs.lifts}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${costs.days}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${costs.accumStorage.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${costs.liftCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 900; color: #10b981;">${costs.totalCost.toFixed(2)}</td>
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

        const stateFilter = document.getElementById('sf-state')?.value || 'ALL';
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

            let matchState = true;
            if (stateFilter === 'ACTIVE') {
                matchState = !item.exit_date;
            } else if (stateFilter === 'INACTIVE') {
                matchState = !!item.exit_date;
            }

            const matchSize = sizeFilter ? (item.size || '').includes(sizeFilter) : true;
            const matchCustomer = customerFilter ? (item.customer_name === customerFilter) : true;

            let matchStatus = true;
            // if (statusFilter === 'ACTIVE') matchStatus = item.status !== 'SOLD';
            // else if (statusFilter === 'INACTIVE') matchStatus = item.status === 'SOLD';

            let matchDate = window.checkYardDateMatch(item, dateFrom, dateTo);

            return matchState && matchSize && matchStatus && matchCustomer && matchDate;
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

            const costs = window.calculateDynamicYardCosts(item, dateFrom, dateTo);

            const tooltipTitle = item.exit_date
                ? `Daily: $${(parseFloat(item.daily_rate) || 0).toFixed(2)}/day ($${costs.accumStorage.toFixed(2)}) | Exit Date: ${item.exit_date}`
                : `Daily: $${(parseFloat(item.daily_rate) || 0).toFixed(2)}/day ($${costs.accumStorage.toFixed(2)}) | Exit: Not Exited yet`;

            const containerNoDisplay = `${item.container_no || '---'}`;
            let displayExitDate = item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : '---';
            let displayOrderOut = item.order_out || '---';

            if (dateTo && item.exit_date) {
                const eDate = item.exit_date.split('T')[0];
                if (eDate > dateTo) {
                    displayExitDate = '---';
                    displayOrderOut = '---';
                }
            }

            tr.innerHTML = `
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: #1e40af;">${containerNoDisplay}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.size || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${item.type || 'DRY'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <span class="inv-badge ${item.condition === 'NEW' ? 'inv-badge-green' : 'inv-badge-blue'}">${item.condition || 'USED'}</span>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${item.origin_release || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">${displayExitDate}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${displayOrderOut}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${costs.lifts}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${costs.days}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${costs.accumStorage.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${costs.liftCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 900; color: #10b981;">${costs.totalCost.toFixed(2)}</td>
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

        const stateFilter = document.getElementById('both-state')?.value || 'ALL';
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
            let matchState = true;
            if (stateFilter === 'ACTIVE') {
                matchState = !item.exit_date;
            } else if (stateFilter === 'INACTIVE') {
                matchState = !!item.exit_date;
            }

            const matchSize = sizeFilter ? (item.size || '').includes(sizeFilter) : true;
            const matchCustomer = customerFilter ? (item.customer_name === customerFilter) : true;

            let matchStatus = true;
            // if (statusFilter === 'ACTIVE') matchStatus = item.status !== 'SOLD';
            // else if (statusFilter === 'INACTIVE') matchStatus = item.status === 'SOLD';

            let matchDate = window.checkYardDateMatch(item, dateFrom, dateTo);

            return matchState && matchSize && matchStatus && matchCustomer && matchDate;
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

            const costs = window.calculateDynamicYardCosts(item, dateFrom, dateTo);

            const containerNoDisplay = `${item.container_no || '---'}`;
            let displayExitDate = item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : '---';
            let displayOrderOut = item.order_out || '---';

            if (dateTo && item.exit_date) {
                const eDate = item.exit_date.split('T')[0];
                if (eDate > dateTo) {
                    displayExitDate = '---';
                    displayOrderOut = '---';
                }
            }

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
                <td style="padding: 12px 15px; border: 1px solid #475569;">${displayExitDate}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${displayOrderOut}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${costs.lifts}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${costs.days}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${costs.accumStorage.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${costs.liftCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 900; color: #10b981;">${costs.totalCost.toFixed(2)}</td>
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
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        });
        body.appendChild(fragment);
    }
    window.renderBothTable = renderBothTable;

    window.toggleYardPaymentMethod = function () {
        const exitDate = document.getElementById('yard-exit-date').value;
        const group = document.getElementById('yard-pay-method-group');
        if (exitDate) {
            group.style.display = 'block';
        } else {
            group.style.display = 'none';
        }
        window.toggleYardSplitMethod();
    };

    window.toggleYardSplitMethod = function () {
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
    window.saveYardContainer = async function () {
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

    window.sendYardInvoice = async function (id) {
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

    window.generateYardInvoiceBase64 = async function (htmlContent, customerName) {
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

    window.sendGlobalYardInvoice = async function (tableType = 'YARD') {
        let customerFilter = '';
        let dateFrom = '';
        let dateTo = '';
        
        if (tableType === 'YARD') {
            customerFilter = document.getElementById('yf-customer')?.value || '';
            dateFrom = document.getElementById('yf-date-from')?.value || '';
            dateTo = document.getElementById('yf-date-to')?.value || '';
        } else if (tableType === 'STORAGE') {
            customerFilter = document.getElementById('sf-customer')?.value || '';
            dateFrom = document.getElementById('sf-date-from')?.value || '';
            dateTo = document.getElementById('sf-date-to')?.value || '';
        } else if (tableType === 'BOTH') {
            customerFilter = document.getElementById('both-customer')?.value || '';
            dateFrom = document.getElementById('both-date-from')?.value || '';
            dateTo = document.getElementById('both-date-to')?.value || '';
        }

        if (!customerFilter) {
            alert('Please select a Customer from the filter first.');
            return;
        }

        const filtered = currentYardStock.filter(item => {
            const isStorage = (item.notes || '').includes('[Storage Yard]');
            if (tableType === 'YARD' && isStorage) return false;
            if (tableType === 'STORAGE' && !isStorage) return false;
            if (item.customer_name !== customerFilter) return false;

            let matchDate = window.checkYardDateMatch(item, dateFrom, dateTo);
            if (!matchDate) return false;

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

        let btn;
        if (tableType === 'YARD') btn = document.getElementById('btn-global-invoice-yard');
        else if (tableType === 'STORAGE') btn = document.getElementById('btn-global-invoice-storage');
        else if (tableType === 'BOTH') btn = document.getElementById('btn-global-invoice-both');

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            let activeItemIds = filtered.map(i => i.id);

            window.togglePreviewItem = function(id, isChecked) {
                if(isChecked) {
                    if(!activeItemIds.includes(id)) activeItemIds.push(id);
                } else {
                    activeItemIds = activeItemIds.filter(iId => iId !== id);
                }
                const { html: newInteractiveHtml } = window.generateYardInvoiceHTML(filtered, dateFrom, dateTo, true, activeItemIds);
                const container = document.getElementById('preview-invoice-html-container');
                if(container) container.innerHTML = newInteractiveHtml;
            };

            const { html: interactiveHtml } = window.generateYardInvoiceHTML(filtered, dateFrom, dateTo, true, activeItemIds);

            let modal = document.getElementById('preview-global-invoice-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'preview-global-invoice-modal';
                modal.className = 'simple-modal'; 
                modal.style.zIndex = '10005';
                document.body.appendChild(modal);
            }

            const previewContent = `
                <div class="modal-content" style="width: 900px; max-width: 95vw; display: flex; flex-direction: column; max-height: 90vh;">
                    <div class="modal-header">
                        <h3>Statement Preview - ${customerFilter}</h3>
                        <button class="btn-close-modal" onclick="document.getElementById('preview-global-invoice-modal').style.display='none'">&times;</button>
                    </div>
                    <div style="flex: 1; overflow-y: auto; background: #fff; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e293b;padding-bottom:15px;margin-bottom:20px;font-family:Arial,sans-serif;">
                            <div>
                                <h1 style="font-size:1.8rem;margin:0;font-weight:900;color:#1e293b;">STATEMENT OF ACCOUNT</h1>
                                <p style="margin:5px 0;color:#64748b;font-weight:bold;">RP TULIPAN LOGISTIC</p>
                            </div>
                            <div style="text-align:right;">
                                <p style="margin:0;font-weight:bold;color:#1e293b;">CUSTOMER: ${customerFilter}</p>
                                <p style="margin:0;color:#64748b;">DATE: ${window.formatDateMMDDYYYY(new Date().toISOString())}</p>
                            </div>
                        </div>
                        <div id="preview-invoice-html-container">
                            ${interactiveHtml}
                        </div>
                    </div>
                    <div class="modal-footer" style="flex-direction: column; align-items: stretch; margin-top: 20px; border-top: none;">
                        <div style="background:#f8fafc; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:15px;">
                            <div style="display:flex; align-items:center; justify-content:space-between;">
                                <div>
                                    <strong style="color:#1e293b; font-size:1.1rem; display:block;">Método de Pago</strong>
                                    <span style="font-size:0.85rem; color:#64748b;">Selecciona cómo te pagaron o te pagarán.</span>
                                </div>
                                <select id="ys-pay-method" style="padding:10px; border-radius:6px; border:1px solid #cbd5e1; font-weight:bold; font-size:0.95rem;">
                                    <option value="bank">🏦 Bank</option>
                                    <option value="cash">💵 Cash</option>
                                    <option value="split">✂️ Split</option>
                                </select>
                            </div>
                            
                            <div id="ys-split-fields" style="display:none; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:15px; align-items:center; gap:15px;">
                                <div style="flex:1;">
                                    <label style="font-size:0.8rem; font-weight:bold; color:#166534;">💵 Monto CASH</label>
                                    <input id="ys-split-cash" type="number" step="0.01" value="0" style="width:100%; padding:8px; border:1px solid #86efac; border-radius:4px;">
                                </div>
                                <div style="flex:1;">
                                    <label style="font-size:0.8rem; font-weight:bold; color:#166534;">🏦 Monto BANK</label>
                                    <input id="ys-split-bank" type="number" step="0.01" value="0" style="width:100%; padding:8px; border:1px solid #86efac; border-radius:4px;">
                                </div>
                            </div>

                            <div style="display:flex; align-items:center; gap:10px; border-top:1px solid #e2e8f0; padding-top:15px;">
                                <input type="checkbox" id="ys-is-paid" style="width:20px; height:20px; cursor:pointer;">
                                <label for="ys-is-paid" style="font-size:1rem; font-weight:bold; color:#10b981; cursor:pointer;">✅ Invoice YA PAGADO</label>
                                <span style="font-size:0.8rem; color:#64748b; margin-left:10px;">(Si lo marcas, el dinero ingresará al Cash Ledger ahora mismo)</span>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:10px;">
                            <button onclick="document.getElementById('preview-global-invoice-modal').style.display='none'" style="padding: 10px 20px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; cursor: pointer; font-weight: bold;">CANCEL</button>
                            <button id="btn-confirm-send-global" style="padding: 10px 20px; border-radius: 8px; border: none; background: #10b981; color: white; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px;"><i class="fas fa-paper-plane"></i> SEND INVOICE & SAVE</button>
                        </div>
                    </div>
                </div>
            `;
            modal.innerHTML = previewContent;
            modal.style.display = 'flex';
            
            const pMethodSel = document.getElementById('ys-pay-method');
            const pSplitFlds = document.getElementById('ys-split-fields');
            pMethodSel.onchange = function() {
                pSplitFlds.style.display = this.value === 'split' ? 'flex' : 'none';
            };
            
            btn.innerHTML = originalText;
            btn.disabled = false;

            document.getElementById('btn-confirm-send-global').onclick = async function() {
                const itemsToInvoice = filtered.filter(i => activeItemIds.includes(i.id));
                if (itemsToInvoice.length === 0) {
                    alert("Please select at least one container to invoice.");
                    return;
                }

                const { html: finalHtml, total: finalGrandTotal } = window.generateYardInvoiceHTML(itemsToInvoice, dateFrom, dateTo, false, null);

                let finalEmail = email;
                if (finalEmail) {
                    if (!confirm(`Email found: ${finalEmail}\n\nDo you want to send the Statement to this address?`)) {
                        const emailRaw = prompt("Please enter a different email address:", finalEmail);
                        if (!emailRaw || !emailRaw.trim()) return;
                        finalEmail = emailRaw.trim();
                    }
                } else {
                    const emailRaw = prompt("No email saved for this customer. Please enter an email address manually:", "");
                    if (!emailRaw || !emailRaw.trim()) return;
                    finalEmail = emailRaw.trim();
                }

                const sendBtn = this;
                const sendOriginalText = sendBtn.innerHTML;
                sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SENDING...';
                sendBtn.disabled = true;

                try {
                    emailjs.init(publicKey);
                    const b64Pdf = await window.generateYardInvoiceBase64(finalHtml, customerFilter);
                    const templateParams = {
                        to_email: finalEmail,
                        customer_name: customerFilter,
                        invoice_html: "", 
                        grand_total: finalGrandTotal.toFixed(2),
                        pdf_attachment: b64Pdf
                    };

                    await emailjs.send(serviceId, templateId, templateParams);

                    // ── CREATE STATIC BILLING RECORD IN TRIPS TABLE ──────────
                    const invoiceDate = dateTo ? dateTo : new Date().toISOString().split('T')[0];
                    const invDateObj = new Date(invoiceDate + 'T12:00:00');
                    const yyyymm = `${invDateObj.getFullYear()}${String(invDateObj.getMonth() + 1).padStart(2, '0')}`;
                    const safeCustomer = (customerFilter || 'UNKN').replace(/[^a-zA-Z0-9]/g, '');
                    const customerPrefix = safeCustomer.substring(0, 4).toUpperCase();
                    const orderNo = `YRD-${customerPrefix}-${yyyymm}`;

                    const containerNos = itemsToInvoice.map(i => i.container_no || '').filter(Boolean).join(', ');

                    let periodLabel = 'YARD STORAGE';
                    if (dateFrom && dateTo) {
                        const fmt = (s) => { const p = s.split('-'); return `${p[1]}/${p[2]}/${p[0]}`; };
                        periodLabel = `YARD STORAGE\n(${fmt(dateFrom)} - ${fmt(dateTo)})`;
                    }

                    // ── CAPTURE PAYMENT INTENT ──
                    const pMethod = document.getElementById('ys-pay-method').value;
                    const cVal = parseFloat(document.getElementById('ys-split-cash').value) || 0;
                    const bVal = parseFloat(document.getElementById('ys-split-bank').value) || 0;
                    const isPaidNow = document.getElementById('ys-is-paid').checked;

                    // Snapshot items so the PDF can be rebuilt from Billing + Store payment intent
                    const invoiceSnapshot = JSON.stringify({
                        items: itemsToInvoice.map(i => {
                            const isStorage = (i.notes || '').includes('[Storage Yard]');
                            const costs = window.calculateDynamicYardCosts(i, dateFrom, dateTo);
                            return {
                                id: i.id,
                                container_no: i.container_no,
                                size: i.size,
                                type: i.type,
                                condition: i.condition,
                                created_at: i.created_at,
                                exit_date: i.exit_date,
                                origin_release: i.origin_release,
                                order_out: i.order_out,
                                daily_rate: i.daily_rate,
                                lift_cost: i.lift_cost,
                                lifts: i.lifts,
                                last_billed_date: i.last_billed_date,
                                billed_lifts: i.billed_lifts,
                                customer_name: i.customer_name,
                                yard_type: isStorage ? 'STORAGE' : 'RPTULIPAN',
                                item_total: costs.totalCost
                            };
                        }),
                        dateFrom: dateFrom,
                        dateTo: dateTo,
                        total: finalGrandTotal,
                        paymentMethod: pMethod,
                        cashSplit: cVal,
                        bankSplit: bVal
                    });

                    const tripObj = {
                        trip_id: crypto.randomUUID(),
                        date: invoiceDate,
                        order_no: orderNo,
                        customer: customerFilter,
                        delivery_place: periodLabel,
                        n_cont: containerNos,
                        yard_rate: finalGrandTotal,
                        yard_services: invoiceSnapshot,
                        service_mode: 'YARD INVOICE',
                        status: 'COMPLETE',
                        st_yard: isPaidNow ? 'PAID' : 'PEND',
                        st_rate: 'PAID',
                        st_sales: 'PAID',
                        st_amount: 'PAID',
                        has_trans: 'NO',
                        has_sales: 'NO',
                        invoice_sent: 'YES'
                    };
                    if (isPaidNow) tripObj.paid = true;

                    // ── LOG TO CASH LEDGER IF PAID NOW ──
                    if (isPaidNow && window.logCashTransaction) {
                        const desc = `Pago Factura Yard - ${orderNo}`;
                        if (pMethod === 'cash' || pMethod === 'bank') {
                            await window.logCashTransaction({ tipo: 'ingreso', metodo: pMethod, monto: finalGrandTotal, descripcion: desc, referencia: orderNo, chofer: customerFilter });
                        } else if (pMethod === 'split') {
                            if (cVal > 0) await window.logCashTransaction({ tipo: 'ingreso', metodo: 'cash', monto: cVal, descripcion: `${desc} (Split Cash)`, referencia: orderNo, chofer: customerFilter });
                            if (bVal > 0) await window.logCashTransaction({ tipo: 'ingreso', metodo: 'bank', monto: bVal, descripcion: `${desc} (Split Bank)`, referencia: orderNo, chofer: customerFilter });
                        }
                    }

                    if (window.db) {
                        const newBilledDate = dateTo || new Date().toISOString().split('T')[0];
                        
                        // ── 1. UPDATE YARD STOCK STATUS ──
                        for (const item of itemsToInvoice) {
                            const newBilledLifts = parseInt(item.lifts) || 1;
                            await window.db.from('yard_stock').update({
                                last_billed_date: newBilledDate,
                                billed_lifts: newBilledLifts,
                                invoice_sent: 'YES'
                            }).eq('id', item.id);
                            item.last_billed_date = newBilledDate;
                            item.billed_lifts = newBilledLifts;
                            item.invoice_sent = 'YES';

                            // ── 2. INSERT YARD BILLING HISTORY ──
                            try {
                                const diffTime = Math.abs(new Date(newBilledDate) - new Date(dateFrom || item.created_at));
                                const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                                await window.db.from('yard_billing').insert([{
                                    yard_id: item.id,
                                    start_date: dateFrom || item.created_at,
                                    end_date: newBilledDate,
                                    days_billed: diffDays,
                                    lifts_billed: newBilledLifts,
                                    amount: parseFloat(item.daily_rate * diffDays) + parseFloat(item.lift_cost * newBilledLifts),
                                    is_paid: isPaidNow
                                }]);
                            } catch (err) {
                                console.error('Error logging to yard_billing:', err);
                            }
                        }

                        // ── 3. ALWAYS INSERT TO TRIPS AND ACCOUNTS RECEIVABLE ──
                        if (true) {
                            const { error: tripErr } = await window.db.from('trips').insert([tripObj]);
                            if (tripErr) {
                                console.error('Error creating billing record:', tripErr);
                            } else {
                                // ── 4. AUTO-CREATE ACCOUNTS RECEIVABLE RECORD ──
                                if (window.addInvoiceToReceivables) {
                                    try {
                                        const amtPaid = isPaidNow ? finalGrandTotal : 0;
                                        const payMethodStr = isPaidNow ? pMethod : '';
                                        await window.addInvoiceToReceivables(
                                            customerFilter, 
                                            orderNo, 
                                            finalGrandTotal, 
                                            finalHtml, 
                                            [tripObj.trip_id], 
                                            'YARD STORAGE',
                                            amtPaid,
                                            payMethodStr
                                        );
                                    } catch (err) {
                                        console.error('Error auto-creating Accounts Receivable:', err);
                                    }
                                }

                                // ── INSTANT LOCAL UPDATE: push to currentTrips so Billing updates without refresh
                                if (window.currentTrips) {
                                    const newRow = new Array(74).fill('');
                                    newRow[0]  = tripObj.trip_id;
                                    newRow[1]  = tripObj.date;
                                    newRow[3]  = tripObj.n_cont;
                                    newRow[4]  = '---';
                                    newRow[5]  = tripObj.order_no;
                                    newRow[6]  = '---';
                                    newRow[8]  = tripObj.delivery_place;
                                    newRow[11] = tripObj.customer;
                                    newRow[12] = tripObj.yard_services;
                                    newRow[13] = tripObj.yard_rate;
                                    newRow[17] = '---';
                                    newRow[18] = 0;
                                    newRow[20] = 0;
                                    newRow[30] = tripObj.st_yard;
                                    newRow[32] = 'PAID';
                                    newRow[33] = 'PAID';
                                    newRow[41] = 'COMPLETE';
                                    newRow[42] = 'NO';
                                    newRow[43] = 'NO';
                                    newRow[49] = false;
                                    newRow[57] = 'YES'; // Invoice sent
                                    newRow[63] = new Date().toISOString(); // Sent date for Accounts integration
                                    newRow[64] = 1; // Send count
                                    newRow[65] = '---';
                                    window.currentTrips.push(newRow);
                                }
                                if (typeof window.renderBillingTable === 'function') {
                                    window.renderBillingTable();
                                }
                            }
                        }
                    }
                    // ── END STATIC BILLING RECORD ─────────────────────────────

                    if (window.showToast) window.showToast('Invoice sent and recorded in Billing!', 'success');
                    else alert('Invoice sent and recorded in Billing!');
                    modal.style.display = 'none';
                } catch (sendErr) {
                    console.error('EmailJS Error:', sendErr);
                    alert("Error sending email: " + (sendErr.text || JSON.stringify(sendErr)));
                } finally {
                    sendBtn.innerHTML = sendOriginalText;
                    sendBtn.disabled = false;
                }
            };

        } catch (err) {
            console.error('Generation Error:', err);
            alert("Error sending email: " + (err.text || JSON.stringify(err)));
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    window.editYardItem = function (id) {
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
            window.db.from('cash_ledger').select('metodo, monto').like('id', `${item.id}-y%`).then(({ data }) => {
                const payMethodEl = document.getElementById('yard-pay-method');
                const cashAmtEl = document.getElementById('yard-cash-amt');
                const bankAmtEl = document.getElementById('yard-bank-amt');

                if (payMethodEl) {
                    if (data && data.length > 0) {
                        if (data.length === 1) {
                            payMethodEl.value = data[0].metodo === 'cash' ? 'CASH' : 'BANK';
                        } else if (data.length > 1) {
                            payMethodEl.value = 'SPLIT';
                            data.forEach(d => {
                                if (d.metodo === 'cash' && cashAmtEl) cashAmtEl.value = d.monto;
                                if (d.metodo === 'bank' && bankAmtEl) bankAmtEl.value = d.monto;
                            });
                        }
                    } else {
                        payMethodEl.value = 'BANK';
                    }
                    if (window.toggleYardPaymentMethod) window.toggleYardPaymentMethod();
                }
            });
        } else {
            const payMethodEl = document.getElementById('yard-pay-method');
            if (payMethodEl) {
                payMethodEl.value = 'BANK';
                if (window.toggleYardPaymentMethod) window.toggleYardPaymentMethod();
            }
        }

        const titleEl = document.getElementById('modal-title-yard');
        if (titleEl) titleEl.textContent = 'Edit Yard Container';
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
            btn.style.display = 'block';
        }
        const warningEl = document.getElementById('yard-creation-warning');
        if (warningEl) warningEl.style.display = 'none';

        renderYardTable(); // Refresh selection
        renderStorageTable();
        if (window.renderBothTable) window.renderBothTable();
    };

    window.deleteYardItem = async function (id) {
        const role = (window.currentUserRole || '').toLowerCase().trim();
        if (role !== 'admin') {
            alert("Only administrators can delete records.");
            return;
        }
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
            btn.style.display = 'none';
        }
        const warningEl = document.getElementById('yard-creation-warning');
        if (warningEl) warningEl.style.display = 'block';

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
            opt.dataset.originRelease = item.origin_release || '';
            sel.appendChild(opt);
        });

        if (currentVal) sel.value = currentVal;
    }
    window.updateYardSelectors = updateYardSelectors;

    window.isYardItemInStorage = function (itemId) {
        const item = currentYardStock.find(i => i.id === itemId);
        return item ? (item.notes || '').includes('[Storage Yard]') : false;
    };

    window.setContainerSource = function (source) {
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

    window.autoPopulateFromYard = function (sel) {
        const opt = sel.options[sel.selectedIndex];
        if (!opt || !opt.value) return;

        const size = opt.dataset.size;
        const type = opt.dataset.type;
        const cond = opt.dataset.cond;
        const originRelease = opt.dataset.originRelease || '';

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

        // --- FIX: Carry the original Release number from Yard so Form Inventor
        //     can look up the purchase price correctly.
        //     yard_stock.origin_release stores the ORDER NUMBER of the trip that sent the
        //     container to Yard — not the Release number. We trace back through trips to
        //     find the actual Release number so Form Inventor can look up the purchase price.
        if (originRelease) {
            let releaseNo = '';

            // origin_release = ORDER number (e.g. "ORD-RQ59")
            // Find the original trip with that order number to get the Release number
            const allTrips = window.allTripsUnfiltered || window.currentTrips || [];
            const originalTrip = allTrips.find(t =>
                Array.isArray(t) &&
                (t[5] || '').toString().trim() === originRelease.toString().trim()
            );
            if (originalTrip) {
                releaseNo = (originalTrip[4] || '').toString().trim(); // row[4] = release_no
            }

            // Fallback: if the lookup didn't work (trip not loaded), use originRelease directly
            // (it might already be a release number if the yard item was added manually)
            if (!releaseNo) releaseNo = originRelease;

            if (releaseNo) {
                const inRelSel = document.getElementById('in-release-sel');
                const inRelMan = document.getElementById('in-release');
                if (inRelSel) {
                    const exists = Array.from(inRelSel.options).some(o => o.value === releaseNo);
                    if (!exists) {
                        const tempOpt = document.createElement('option');
                        tempOpt.value = releaseNo;
                        tempOpt.textContent = releaseNo;
                        inRelSel.appendChild(tempOpt);
                    }
                    inRelSel.value = releaseNo;
                }
                if (inRelMan) inRelMan.value = releaseNo;
            }
        }
    };

    window.setYardDisplayMode = function (mode) {
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

    window.toggleYardCustomerMode = function () {
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

    window.populateYardCustomerSelect = async function () {
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

    window.updateYardCustomerFilters = function () {
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

    window.updateLocalYardStatus = function (yardItemId, newStatus, newNotes, exitDate, newLifts, orderOut) {
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

    window.showBillingHistory = async function (yardId) {
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







    // --- HELPER FUNCTIONS FOR BILLING & INVOICE INTEGRATION ---
    window.generateYardInvoiceHTML = function (items, dateFrom, dateTo, interactive = false, activeItemIds = null) {
        let invoiceHtml = `
    <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 20px; font-size: 11px;">
        <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a;">
                ${interactive ? `<th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">INC</th>` : ''}
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

        items.forEach(item => {
            const isActive = activeItemIds ? activeItemIds.includes(item.id) : true;
            const costs = window.calculateDynamicYardCosts(item, dateFrom, dateTo);

            if (isActive) {
                grandTotal += costs.totalCost;
                sumDaysCost += costs.accumStorage;
                sumLiftsCost += costs.liftCost;
            }

            let displayExitDate = item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : '---';
            let displayOrderOut = item.order_out || '---';

            if (dateTo && item.exit_date) {
                const eDate = item.exit_date.split('T')[0];
                if (eDate > dateTo) {
                    displayExitDate = '---';
                    displayOrderOut = '---';
                }
            }

            const rowStyle = isActive ? '' : 'opacity: 0.4; text-decoration: line-through; background: #f8fafc;';

            invoiceHtml += `
            <tr style="${rowStyle}">
                ${interactive ? `<td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;"><input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.togglePreviewItem('${item.id}', this.checked)" style="cursor:pointer; width:16px; height:16px;"></td>` : ''}
                <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: ${item.exit_date ? '#64748b' : '#1e40af'};">${item.container_no || '---'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.size || '---'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.type || 'DRY'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.condition || 'USED'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.origin_release || '---'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${displayExitDate}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${displayOrderOut}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${costs.lifts}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${costs.days}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${costs.accumStorage.toFixed(2)}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${costs.liftCost.toFixed(2)}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #10b981;">${costs.totalCost.toFixed(2)}</td>
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
        return { html: invoiceHtml, total: grandTotal };
    };

    window.downloadSpecificYardInvoicePDF = async function (items, customerName) {
        const { html } = window.generateYardInvoiceHTML(items);
        const b64Pdf = await window.generateYardInvoiceBase64(html, customerName);
        const a = document.createElement('a');
        a.href = b64Pdf;
        a.download = `Yard_Invoice_${customerName}.pdf`;
        a.click();
    };

    window.sendSpecificYardInvoiceEmail = async function (items, customerName, email) {
        const serviceId = localStorage.getItem('ejs_yard_service_id') || localStorage.getItem('ejs_service_id');
        const templateId = localStorage.getItem('ejs_yard_template_id') || localStorage.getItem('ejs_template_id');
        const publicKey = localStorage.getItem('ejs_public_key');

        emailjs.init(publicKey);
        const { html, total } = window.generateYardInvoiceHTML(items);
        const b64Pdf = await window.generateYardInvoiceBase64(html, customerName);

        const templateParams = {
            to_email: email,
            customer_name: customerName,
            invoice_html: "",
            grand_total: total.toFixed(2),
            pdf_attachment: b64Pdf
        };
        await emailjs.send(serviceId, templateId, templateParams);

        // Attempt to persist status to Supabase (Requires invoice_sent column in yard_stock table)
        try {
            for (const item of items) {
                await window.db.from('yard_stock').update({ invoice_sent: 'YES' }).eq('id', item.id);
                item.invoice_sent = 'YES';
            }
        } catch (e) {
            console.warn("Could not save invoice_sent status to database. Please ensure 'invoice_sent' column exists in yard_stock table.", e);
        }
    };

    window.markYardItemAsPaid = async function (yardItemId, periodEndDate, totalBilledLiftsAfterThis) {
        if (!window.db) throw new Error("Database not initialized");
        const item = (window.getYardStockData() || []).find(i => i.id === yardItemId);
        if (!item) throw new Error("Yard item not found locally");
        const newBilledDate = periodEndDate || new Date().toISOString().split('T')[0];
        const newBilledLifts = totalBilledLiftsAfterThis !== undefined ? totalBilledLiftsAfterThis : (item.lifts || 1);
        const { error } = await window.db.from('yard_stock')
            .update({
                last_billed_date: newBilledDate,
                billed_lifts: newBilledLifts,
                invoice_sent: null // Reset invoice sent status for the next billing cycle
            })
            .eq('id', yardItemId);
        if (error) throw error;
        item.last_billed_date = newBilledDate;
        item.billed_lifts = newBilledLifts;
        item.invoice_sent = null;
    };

})();
// Trigger GitHub Pages deploy
