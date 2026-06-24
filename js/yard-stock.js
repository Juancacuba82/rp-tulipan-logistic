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
            updateYardSelectors(document.getElementById('in-container-source')?.value || 'YARD');
            return;
        }
        
        try {
            const { data, error } = await window.db
                .from('yard_stock')
                .select('id, created_at, container_no, size, type, condition, origin_release, notes, status, customer_name, customer_phone')
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            currentYardStock = data || [];
            if (window.populateYardCustomerSelect) await window.populateYardCustomerSelect();
            if (window.updateYardCustomerFilters) window.updateYardCustomerFilters();
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
        const statusFilter = document.getElementById('global-yard-status')?.value || 'ACTIVE';
        const customerFilter = document.getElementById('yf-customer')?.value || '';
        
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
            if (statusFilter === 'ACTIVE') matchStatus = item.status !== 'SOLD';
            else if (statusFilter === 'INACTIVE') matchStatus = item.status === 'SOLD';
            
            return matchSearch && matchSize && matchStatus && matchCustomer;
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

            const entryDate = new Date(item.created_at || new Date());
        const endDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
            const d1 = Date.UTC(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
            const d2 = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            const accumStorage = (item.daily_rate || 0) * days;
            const exitFee = item.exit_date ? (item.entry_fee || 0) : 0;
            const totalCost = (item.entry_fee || 0) + accumStorage + exitFee + ((item.lifts || 1) * (item.lift_cost || 50));

            const tooltipTitle = item.exit_date 
                ? `Entry: $${(item.entry_fee || 0).toFixed(2)} | Daily: $${(item.daily_rate || 0).toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit: $${(item.entry_fee || 0).toFixed(2)} | Exit Date: ${item.exit_date}`
                : `Entry: $${(item.entry_fee || 0).toFixed(2)} | Daily: $${(item.daily_rate || 0).toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit: Not Exited yet ($0.00)`;

            const containerNoDisplay = isExited
                ? `<span style="text-decoration: line-through; color: #64748b;">${item.container_no || '---'}</span> <span style="font-size: 0.65rem; background: #cbd5e1; color: #475569; padding: 2px 5px; border-radius: 4px; font-weight: 800; margin-left: 5px;">EXITED</span>`
                : `${item.container_no || '---'}`;

            tr.innerHTML = `
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: ${isExited ? '#64748b' : '#1e40af'};">${containerNoDisplay}</td>
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
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${((item.lifts || 1) * (item.lift_cost || 50)).toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 900; color: #10b981;">${totalCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.customer_name || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${window.formatUSPhone ? window.formatUSPhone(item.customer_phone || '') : (item.customer_phone || '---')}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.75rem; color: #475569; max-width: 250px;">${(item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : '') || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button onclick="sendYardInvoice('${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="Send Invoice" style="background: #e0e7ff; color: #4f46e5; border: 1px solid #c7d2fe; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-envelope"></i>
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
        const statusFilter = document.getElementById('global-yard-status')?.value || 'ACTIVE';
        const customerFilter = document.getElementById('sf-customer')?.value || '';

        const filtered = currentYardStock.filter(item => {
            const isStorage = (item.notes || '').includes('[Storage Yard]');
            if (!isStorage) return false; // Right table is only Storage Yard
            
            const matchSearch = (item.container_no || '').toLowerCase().includes(searchTerm) || 
                               (item.origin_release || '').toLowerCase().includes(searchTerm);
            const matchSize = sizeFilter ? (item.size || '').includes(sizeFilter) : true;
            const matchCustomer = customerFilter ? (item.customer_name === customerFilter) : true;
            
            let matchStatus = true;
            if (statusFilter === 'ACTIVE') matchStatus = item.status !== 'SOLD';
            else if (statusFilter === 'INACTIVE') matchStatus = item.status === 'SOLD';

            return matchSearch && matchSize && matchStatus && matchCustomer;
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

            const entryDate = new Date(item.created_at || new Date());
        const endDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
            const d1 = Date.UTC(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
            const d2 = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            const accumStorage = (item.daily_rate || 0) * days;
            const exitFee = item.exit_date ? (item.entry_fee || 0) : 0;
            const totalCost = (item.entry_fee || 0) + accumStorage + exitFee + ((item.lifts || 1) * (item.lift_cost || 50));

            const tooltipTitle = item.exit_date 
                ? `Entry: $${(item.entry_fee || 0).toFixed(2)} | Daily: $${(item.daily_rate || 0).toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit: $${(item.entry_fee || 0).toFixed(2)} | Exit Date: ${item.exit_date}`
                : `Entry: $${(item.entry_fee || 0).toFixed(2)} | Daily: $${(item.daily_rate || 0).toFixed(2)}/day ($${accumStorage.toFixed(2)}) | Exit: Not Exited yet ($0.00)`;

            const containerNoDisplay = isExited
                ? `<span style="text-decoration: line-through; color: #64748b;">${item.container_no || '---'}</span> <span style="font-size: 0.65rem; background: #cbd5e1; color: #475569; padding: 2px 5px; border-radius: 4px; font-weight: 800; margin-left: 5px;">EXITED</span>`
                : `${item.container_no || '---'}`;

            tr.innerHTML = `
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: ${isExited ? '#64748b' : '#1e40af'};">${containerNoDisplay}</td>
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
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${((item.lifts || 1) * (item.lift_cost || 50)).toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 900; color: #10b981;">${totalCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">${item.customer_name || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">${window.formatUSPhone ? window.formatUSPhone(item.customer_phone || '') : (item.customer_phone || '---')}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.75rem; color: #475569; max-width: 250px;">${(item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : '') || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button onclick="sendYardInvoice('${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="Send Invoice" style="background: #e0e7ff; color: #4f46e5; border: 1px solid #c7d2fe; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-envelope"></i>
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

        const customerSel = document.getElementById('yard-customer-sel');
        const customer = (customerSel && customerSel.style.display !== 'none') ? customerSel.value : (document.getElementById('yard-customer')?.value || '');
        const phone = document.getElementById('yard-phone')?.value || '';

        const entryFee = parseFloat(document.getElementById('yard-entry-fee').value) || 0;
        const dailyRate = parseFloat(document.getElementById('yard-daily-rate').value) || 0;
        const exitDate = document.getElementById('yard-exit-date').value || '';
        const orderOut = document.getElementById('yard-order-out')?.value.trim() || '';
        const lifts = parseFloat(document.getElementById('yard-lifts')?.value) || 0;
        const liftCost = parseFloat(document.getElementById('yard-lift-cost')?.value) || 50.00;

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
            entry_fee: entryFee,
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

    window.sendYardInvoice = async function(id) {
        const item = currentYardStock.find(i => i.id === id);
        if (!item) return;

        const entryDate = new Date(item.created_at || new Date());
        const endDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
        const d1 = Date.UTC(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
        const d2 = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
        const accumStorage = (item.daily_rate || 0) * days;
        const exitFee = item.exit_date ? (item.entry_fee || 0) : 0;
        const totalCost = (item.entry_fee || 0) + accumStorage + exitFee + ((item.lifts || 1) * (item.lift_cost || 50));

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
                lifts_cost: ((item.lifts || 1) * (item.lift_cost || 50)).toFixed(2),
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

    window.sendGlobalYardInvoice = async function(tableType = 'YARD') {
        const customerFilter = tableType === 'YARD' ? (document.getElementById('yf-customer')?.value || '') : (document.getElementById('sf-customer')?.value || '');
        
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
            const statusFilter = document.getElementById('global-yard-status')?.value || 'ACTIVE';
            if (statusFilter === 'ACTIVE' && item.status === 'SOLD') return false;
            if (statusFilter === 'INACTIVE' && item.status !== 'SOLD') return false;
            
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

        let customerEmail = "";
        if (window.yardCustomersList) {
            const cust = window.yardCustomersList.find(c => c.name === customerFilter);
            if (cust && cust.email) customerEmail = cust.email;
        }

        const emailRaw = prompt("Please enter the customer's email address to send the global invoice:", customerEmail);
        if (!emailRaw || !emailRaw.trim()) return; 
        const email = emailRaw.trim();

        const btn = tableType === 'YARD' ? document.getElementById('btn-global-invoice-yard') : document.getElementById('btn-global-invoice-storage');
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

            filtered.forEach(item => {
                const entryDate = new Date(item.created_at);
                const exitDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
                const d1 = Date.UTC(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
                const d2 = Date.UTC(exitDate.getFullYear(), exitDate.getMonth(), exitDate.getDate());
                const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
                
                const accumStorage = (item.daily_rate || 0) * days;
                const exitFee = item.exit_date ? (item.entry_fee || 0) : 0;
                const liftCost = ((item.lifts || 1) * (item.lift_cost || 50));
                const totalCost = (item.entry_fee || 0) + accumStorage + exitFee + liftCost;

                grandTotal += totalCost;

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
                <tfoot>
                    <tr>
                        <td colspan="12" style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; font-size: 1.1em;">GRAND TOTAL:</td>
                        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; font-size: 1.1em; color: #10b981;">$${grandTotal.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
            `;

            const templateParams = {
                to_email: email,
                customer_name: customerFilter,
                invoice_html: invoiceHtml,
                grand_total: grandTotal.toFixed(2)
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
        document.getElementById('yard-entry-fee').value = (item.entry_fee || 0) > 0 ? (item.entry_fee || 0) : '';
        document.getElementById('yard-daily-rate').value = (item.daily_rate || 0) > 0 ? (item.daily_rate || 0) : '';
        document.getElementById('yard-exit-date').value = item.exit_date || '';
        
        if (document.getElementById('yard-order-out')) document.getElementById('yard-order-out').value = item.order_out || '';
        if (document.getElementById('yard-lifts')) document.getElementById('yard-lifts').value = (item.lifts || 1) !== undefined ? (item.lifts || 1) : 1;
        if (document.getElementById('yard-lift-cost')) document.getElementById('yard-lift-cost').value = (item.lift_cost || 50) !== undefined ? (item.lift_cost || 50) : 50.00;
        
        document.getElementById('yard-note').value = (item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : '') || '';

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
        const orderOut = document.getElementById('yard-order-out');
        const lifts = document.getElementById('yard-lifts');
        const liftCost = document.getElementById('yard-lift-cost');
        
        if (cno) cno.value = '';
        if (org) org.value = '';
        if (nte) nte.value = '';
        if (dest) dest.value = 'RPTULIPAN';
        if (eFee) eFee.value = '';
        if (dRate) dRate.value = '';
        if (xDate) xDate.value = '';
        if (orderOut) orderOut.value = '';
        if (lifts) lifts.value = '1';
        if (liftCost) liftCost.value = '50.00';
        
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
            const { data, error } = await window.db.from('yard_customers').select('*').order('name', { ascending: true });
            if (error) throw error;
            
            window.yardCustomersList = data || [];
            
            sel.innerHTML = '<option value="">Select or Add...</option>';
            window.yardCustomersList.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.name; 
                opt.textContent = c.name;
                sel.appendChild(opt);
            });
            
            if (currentVal) sel.value = currentVal;
            
            if (window.updateYardCustomerFilters) window.updateYardCustomerFilters();
        } catch (err) {
            console.error("Error loading yard customers:", err);
        }
    };

    window.updateYardCustomerFilters = function() {
        const yfCustomer = document.getElementById('yf-customer');
        const sfCustomer = document.getElementById('sf-customer');
        
        if (!yfCustomer && !sfCustomer) return;
        
        let dynamicCustomers = [];
        if (currentYardStock && currentYardStock.length > 0) {
            dynamicCustomers = currentYardStock.map(item => item.customer_name).filter(n => n);
        }
        
        let savedCustomers = [];
        if (window.yardCustomersList && window.yardCustomersList.length > 0) {
            savedCustomers = window.yardCustomersList.map(c => c.name).filter(n => n);
        }
        
        const allCustomers = [...new Set([...dynamicCustomers, ...savedCustomers])].sort();
        
        const populateSelect = (selectEl) => {
            if (!selectEl) return;
            const currentVal = selectEl.value;
            selectEl.innerHTML = '<option value="">All Customers</option>';
            allCustomers.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                selectEl.appendChild(opt);
            });
            if (allCustomers.includes(currentVal)) {
                selectEl.value = currentVal;
            }
        };
        
        populateSelect(yfCustomer);
        populateSelect(sfCustomer);
    };
    
    window.updateLocalYardStatus = function(yardItemId, newStatus, newNotes, exitDate, newLifts) {
        if (!currentYardStock) return;
        const item = currentYardStock.find(i => i.id === yardItemId);
        if (item) {
            if (newStatus !== undefined) item.status = newStatus;
            if (newNotes !== undefined) item.notes = newNotes;
            if (exitDate !== undefined) item.exit_date = exitDate;
            if (newLifts !== undefined) item.lifts = newLifts;
            
            // Re-render both tables with the updated data
            renderYardTable();
            renderStorageTable();
            
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

})();
    window.openYardCustomerModal = function() {
        document.getElementById('add-yard-customer-modal').style.display = 'flex';
        renderYardCustomerManagerList();
    };

    window.closeYardCustomerModal = function() {
        if (window.cancelEditYardCustomer) window.cancelEditYardCustomer();
        document.getElementById('add-yard-customer-modal').style.display = 'none';
    };

    function renderYardCustomerManagerList() {
        const container = document.getElementById('yard-customer-list-body');
        if (!container) return;
        container.innerHTML = '';
        const list = window.yardCustomersList || [];
        list.forEach(c => {
            const item = document.createElement('div');
            item.className = 'driver-item';
            item.innerHTML = `
                <div style="display: flex; flex-direction: column; flex: 1; padding-right: 10px;">
                    <span style="font-size: 0.85rem; font-weight: bold;">${c.name}</span>
                    <span style="font-size: 0.7rem; color: #64748b; font-weight: normal;">Phone: ${c.phone || 'N/A'} | Email: ${c.email || 'N/A'}</span>
                    <span style="font-size: 0.7rem; color: #475569; font-weight: normal; margin-top: 2px;">${c.address || 'no address'}</span>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="startEditYardCustomer('${c.name.replace(/'/g, "\\'")}', '${(c.phone || '').replace(/'/g, "\\'")}', '${(c.email || '').replace(/'/g, "\\'")}', '${(c.address || '').replace(/'/g, "\\'")}')" class="btn-del-driver" style="background: #e2e8f0; color: #3b82f6;" title="Edit Customer">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteYardCustomer('${c.name.replace(/'/g, "\\'")}')" class="btn-del-driver" title="Delete Customer">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }

    let editingYardCustomerOriginalName = null;

    window.startEditYardCustomer = function(name, phone, email, address) {
        editingYardCustomerOriginalName = name;
        
        const inputName = document.getElementById('new-yc-name');
        const inputPhone = document.getElementById('new-yc-phone');
        const inputEmail = document.getElementById('new-yc-email');
        const inputAddress = document.getElementById('new-yc-address');
        const btnAddUpdate = document.getElementById('btn-add-update-yc');
        const btnCancel = document.getElementById('btn-cancel-edit-yc');
        
        if (inputName) inputName.value = name;
        if (inputPhone) inputPhone.value = phone;
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

    window.cancelEditYardCustomer = function() {
        editingYardCustomerOriginalName = null;
        
        const inputName = document.getElementById('new-yc-name');
        const inputPhone = document.getElementById('new-yc-phone');
        const inputEmail = document.getElementById('new-yc-email');
        const inputAddress = document.getElementById('new-yc-address');
        const btnAddUpdate = document.getElementById('btn-add-update-yc');
        const btnCancel = document.getElementById('btn-cancel-edit-yc');
        
        if (inputName) inputName.value = '';
        if (inputPhone) inputPhone.value = '';
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

    window.addNewYardCustomer = async function() {
        const inputName = document.getElementById('new-yc-name');
        const inputPhone = document.getElementById('new-yc-phone');
        const inputEmail = document.getElementById('new-yc-email');
        const inputAddress = document.getElementById('new-yc-address');
        
        const name = inputName ? inputName.value.trim().toUpperCase() : '';
        const phone = inputPhone ? inputPhone.value.trim() : '';
        const email = inputEmail ? inputEmail.value.trim() : '';
        const address = inputAddress ? inputAddress.value.trim() : '';
        
        if (!name) {
            alert('Name / Company is required.');
            return;
        }

        try {
            if (editingYardCustomerOriginalName) {
                const { data, error } = await window.db.from('yard_customers')
                    .update({ name, phone, email, address })
                    .eq('name', editingYardCustomerOriginalName)
                    .select();
                
                if (error) {
                    if (error.code === '23505') alert("Another customer with that name already exists!");
                    else throw error;
                    return;
                }
                cancelEditYardCustomer();
            } else {
                const { error } = await window.db.from('yard_customers')
                    .insert([{ name, phone, email, address }]);
                
                if (error) {
                    if (error.code === '23505') alert("Customer already exists!");
                    else throw error;
                    return;
                }
                if (inputName) inputName.value = '';
                if (inputPhone) inputPhone.value = '';
                if (inputEmail) inputEmail.value = '';
                if (inputAddress) inputAddress.value = '';
            }
            
            if (window.populateYardCustomerSelect) await window.populateYardCustomerSelect();
            renderYardCustomerManagerList();
        } catch (err) {
            console.error("Failed to save yard customer:", err);
            alert("Error saving yard customer: " + (err.message || "Unknown error"));
        }
    };

    window.deleteYardCustomer = async function(name) {
        if (!confirm("Are you sure you want to remove this yard customer?")) return;
        try {
            const { error } = await window.db.from('yard_customers').delete().eq('name', name);
            if (error) throw error;
            
            if (window.populateYardCustomerSelect) await window.populateYardCustomerSelect();
            renderYardCustomerManagerList();
        } catch (err) {
            console.error("Failed to delete yard customer:", err);
            alert("Failed to delete customer.");
        }
    };
