// receivables.js

window.receivablesData = {
    invoices: []
};

window.initReceivables = async function () {
    console.log('[Receivables] initReceivables');
    await loadReceivables();
    renderReceivables();
};

async function loadReceivables() {
    try {
        const { data, error } = await window.db.from('receivables_invoices')
            .select('*')
            .eq('is_deleted', false)
            .order('created_at', { ascending: false });
        if (error) throw error;
        window.receivablesData.invoices = data || [];
    } catch (err) {
        console.error('[Receivables] Error loading invoices:', err);
    }
}

function getOrderNumbersFromTripIds(tripIdsStr) {
    if (!tripIdsStr) return '';
    const ids = tripIdsStr.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) return '';
    
    if (!window.combinedBillingTrips || window.combinedBillingTrips.length === 0) {
        if (window.compileCombinedBillingTrips) window.compileCombinedBillingTrips();
    }
    
    const combined = window.combinedBillingTrips || [];
    const orders = [];
    ids.forEach(id => {
        const row = combined.find(r => String(r[0]) === String(id));
        if (row && row[5] && row[5] !== '---') {
            orders.push(row[5]);
        }
    });
    
    if (orders.length === 0) return '';
    return [...new Set(orders)].join(', ');
}

window.resetReceivablesFilters = function() {
    window.recvCustomerFilter = '';
    window.recvServiceFilter = '';
    window.recvOrderFilter = '';
    window.renderReceivables();
};

window.renderReceivables = function () {
    const container = document.getElementById('receivables-module');
    if (!container) return;

    const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';

    // Extract unique services from invoice prefixes
    const uniqueServices = new Set();
    window.receivablesData.invoices.forEach(inv => {
        if (inv.invoice_number && inv.invoice_number.toString().includes('-')) {
            uniqueServices.add(inv.invoice_number.toString().split('-')[0].toUpperCase());
        }
    });
    const servicesList = Array.from(uniqueServices).sort();

    // Group invoices by customer
    const grouped = {
        pending: {},
        history: {}
    };

    window.receivablesData.invoices.forEach(inv => {
        if (window.recvServiceFilter) {
            const invNo = (inv.invoice_number || '').toString().toUpperCase();
            if (!invNo.startsWith(window.recvServiceFilter + '-')) {
                return;
            }
        }

        if (window.recvOrderFilter && window.recvOrderFilter.trim() !== '') {
            const extractedOrders = getOrderNumbersFromTripIds(inv.trip_ids).toUpperCase();
            const searchVal = window.recvOrderFilter.trim().toUpperCase();
            if (!extractedOrders.includes(searchVal)) {
                return;
            }
        }

        const custName = inv.customer_name || 'UNKNOWN';
        const groupKey = inv.status === 'Paid' ? 'history' : 'pending';

        if (!grouped[groupKey][custName]) grouped[groupKey][custName] = [];
        grouped[groupKey][custName].push(inv);
    });

    let totalPendingDue = 0;
    let totalPendingCount = 0;
    for (const [custName, invoices] of Object.entries(grouped.pending)) {
        if (window.recvCustomerFilter && custName !== window.recvCustomerFilter) continue;
        invoices.forEach(inv => {
            const amtPaid = parseFloat(inv.amount_paid || 0);
            const totalAmt = parseFloat(inv.total_amount || 0);
            totalPendingDue += (totalAmt - amtPaid);
            totalPendingCount++;
        });
    }

    let html = `
    <div class="header-banner" style="margin-bottom: 20px;">
        <div>
            <h1><i class="fas fa-file-invoice-dollar" style="color:var(--primary-light);"></i> ACCOUNTS RECEIVABLE</h1>
            <p>Manage and track your customer invoices and payments</p>
        </div>
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <div class="filter-summary-card" style="margin-bottom: 0; border-color: #fca5a5; min-width: 200px;">
                <div class="filter-summary-icon" style="background: #fef2f2; color: #ef4444;">
                    <i class="fas fa-hand-holding-usd"></i>
                </div>
                <div class="filter-summary-info">
                    <span class="filter-summary-label">Total Due</span>
                    <span class="filter-summary-value" style="color: #ef4444;">$${totalPendingDue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
            </div>
            <div class="filter-summary-card" style="margin-bottom: 0; min-width: 150px;">
                <div class="filter-summary-icon" style="background: #eff6ff; color: #3b82f6;">
                    <i class="fas fa-file-invoice"></i>
                </div>
                <div class="filter-summary-info">
                    <span class="filter-summary-label">Pending Invoices</span>
                    <span class="filter-summary-value">${totalPendingCount}</span>
                </div>
            </div>
            <button class="btn-reset-modern" onclick="window.resetReceivablesFilters()" style="margin-left: 15px;"><i class="fas fa-filter-circle-xmark"></i> Clear all filters</button>
        </div>
    </div>
    
    <div class="tabs-container" style="display:flex; gap:10px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom:10px; align-items:center;">
        <button class="glossy-blue-btn" onclick="document.getElementById('recv-pending').style.display='block'; document.getElementById('recv-history').style.display='none';">Pending Invoices</button>
        <button class="glossy-dark-btn" onclick="document.getElementById('recv-pending').style.display='none'; document.getElementById('recv-history').style.display='block';">Payment History</button>
        
        <select id="recv-customer-filter" onchange="window.recvCustomerFilter = this.value; window.renderReceivables();" style="padding: 8px 15px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 700; outline: none; margin-left: auto; color:#0f172a;">
            <option value="">ALL CUSTOMERS</option>
            ${Object.keys(grouped.pending).sort().map(c => `<option value="${c}" ${window.recvCustomerFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>

        <select id="recv-service-filter" onchange="window.recvServiceFilter = this.value; window.renderReceivables();" style="padding: 8px 15px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 700; outline: none; margin-left: 10px; color:#0f172a;">
            <option value="">ALL SERVICES</option>
            ${servicesList.map(s => `<option value="${s}" ${window.recvServiceFilter === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>

        <input type="text" id="recv-order-filter" placeholder="Search Order #" oninput="window.recvOrderFilter = this.value; window.renderReceivables();" value="${window.recvOrderFilter || ''}" style="padding: 8px 15px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 700; outline: none; margin-left: 10px; color:#0f172a; width: 160px;" autofocus>
    </div>
    
    <!-- PENDING TAB -->
    <div id="recv-pending">
    `;

    let pendingCount = 0;
    if (Object.keys(grouped.pending).length > 0) {
        for (const [custName, invoices] of Object.entries(grouped.pending)) {
            if (window.recvCustomerFilter && custName !== window.recvCustomerFilter) continue;
            pendingCount++;
            let totalPending = invoices.reduce((sum, i) => sum + (parseFloat(i.total_amount || 0) - parseFloat(i.amount_paid || 0)), 0);
            html += `
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow:hidden;">
                <div style="background: #f8fafc; padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a;"><i class="fas fa-building" style="color:#3b82f6; margin-right:8px;"></i> ${custName}</h3>
                    <div style="font-weight:900; color:#ef4444; font-size:1.1rem;">Pending: $${totalPending.toFixed(2)}</div>
                </div>
                <div style="padding: 10px 20px;">
                    <table style="width:100%; border-collapse: collapse;">
                        <thead>
                            <tr style="text-align:left; color:#64748b; font-size:0.8rem; border-bottom: 2px solid #e2e8f0;">
                                <th style="padding:8px 0;">INVOICE #</th>
                                <th style="padding:8px 0;">DATE</th>
                                <th style="padding:8px 0;">TOTAL</th>
                                <th style="padding:8px 0; color:#10b981;">PAID</th>
                                <th style="padding:8px 0; color:#ef4444;">BALANCE</th>
                                <th style="padding:8px 0; text-align:right;">ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            invoices.forEach(inv => {
                const d = inv.date_generated ? new Date(inv.date_generated).toLocaleDateString() : 'N/A';
                const displayInvNo = inv.invoice_number ? inv.invoice_number.toString() : 'N/A';
                
                let orderNoExtracted = '';
                const extractedOrders = getOrderNumbersFromTripIds(inv.trip_ids);
                if (extractedOrders) {
                    orderNoExtracted = `<br><span style="font-size:0.85rem; color:#0f172a; font-weight:600; letter-spacing:0.5px;">(${extractedOrders})</span>`;
                }

                const amtPaid = parseFloat(inv.amount_paid || 0);
                const totalAmt = parseFloat(inv.total_amount || 0);
                const balance = totalAmt - amtPaid;
                html += `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding:10px 0; font-weight:700;">${displayInvNo}${orderNoExtracted}</td>
                                <td style="padding:10px 0; color:#64748b;">${d}</td>
                                <td style="padding:10px 0; font-weight:700;">$${totalAmt.toFixed(2)}</td>
                                <td style="padding:10px 0; font-weight:700; color:#10b981;">$${amtPaid.toFixed(2)}</td>
                                <td style="padding:10px 0; font-weight:700; color:#ef4444;">$${balance.toFixed(2)}</td>
                                <td style="padding:10px 0; text-align:right; display:flex; justify-content:flex-end; gap:10px;">
                                    <button class="glossy-blue-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="openReceivablePreview('${inv.id}')" title="View Invoice">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="glossy-green-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="markReceivablePaid('${inv.id}', ${balance.toFixed(2)}, '${inv.invoice_number}', '${custName}', ${totalAmt.toFixed(2)}, ${amtPaid.toFixed(2)})">
                                        PAY
                                    </button>
                                    ${isAdmin ? `<button class="glossy-red-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="deleteReceivable('${inv.id}')" title="Delete Invoice">
                                        <i class="fas fa-trash"></i>
                                    </button>` : ''}
                                </td>
                            </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            </div>`;
        }
    }
    
    if (pendingCount === 0) {
        html += `<p style="color:#64748b; font-style:italic;">No pending invoices found for the selected filter.</p>`;
    }

    html += `</div>`; // End pending tab

    // HISTORY TAB
    html += `<div id="recv-history" style="display:none;">`;
    let historyCount = 0;
    if (Object.keys(grouped.history).length > 0) {
        for (const [custName, invoices] of Object.entries(grouped.history)) {
            if (window.recvCustomerFilter && custName !== window.recvCustomerFilter) continue;
            historyCount++;
            let totalPaid = invoices.reduce((sum, i) => sum + parseFloat(i.total_amount || 0), 0);
            html += `
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow:hidden;">
                <div style="background: #f8fafc; padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.1rem; color:#0f172a;"><i class="fas fa-building" style="color:#10b981; margin-right:8px;"></i> ${custName}</h3>
                    <div style="font-weight:900; color:#10b981; font-size:1.1rem;">Total Paid: $${totalPaid.toFixed(2)}</div>
                </div>
                <div style="padding: 10px 20px;">
                    <table style="width:100%; border-collapse: collapse;">
                        <thead>
                            <tr style="text-align:left; color:#64748b; font-size:0.8rem; border-bottom: 2px solid #e2e8f0;">
                                <th style="padding:8px 0;">INVOICE #</th>
                                <th style="padding:8px 0;">DATE PAID</th>
                                <th style="padding:8px 0;">METHOD</th>
                                <th style="padding:8px 0; text-align:right;">AMOUNT</th>
                                <th style="padding:8px 0; text-align:right; width:60px;">ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            invoices.forEach(inv => {
                const d = inv.paid_date ? new Date(inv.paid_date).toLocaleDateString() : 'N/A';
                const displayInvNo = (inv.invoice_number || '---').toString();
                
                let orderNoExtracted = '';
                const extractedOrders = getOrderNumbersFromTripIds(inv.trip_ids);
                if (extractedOrders) {
                    orderNoExtracted = `<br><span style="font-size:0.85rem; color:#0f172a; font-weight:600; letter-spacing:0.5px;">(${extractedOrders})</span>`;
                }

                html += `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding:10px 0; font-weight:700; color:#94a3b8;"><del>${displayInvNo}</del>${orderNoExtracted}</td>
                                <td style="padding:10px 0; color:#64748b;">${d}</td>
                                <td style="padding:10px 0;">
                                    <span style="background:#e0f2fe; color:#0284c7; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">${inv.payment_method || 'N/A'}</span>
                                </td>
                                <td style="padding:10px 0; font-weight:700; text-align:right; color:#10b981;">$${parseFloat(inv.total_amount || 0).toFixed(2)}</td>
                                <td style="padding:10px 0; text-align:right; display:flex; justify-content:flex-end; gap:10px;">
                                    <button class="glossy-blue-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="openReceivablePreview('${inv.id}')" title="View Invoice">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    ${isAdmin ? `<button class="glossy-red-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="deleteReceivable('${inv.id}')" title="Delete Invoice">
                                        <i class="fas fa-trash"></i>
                                    </button>` : ''}
                                </td>
                            </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            </div>`;
        }
    }
    
    if (historyCount === 0) {
        html += `<p style="color:#64748b; font-style:italic;">No payment history found for the selected filter.</p>`;
    }
    html += `</div>`;

    const activeEl = document.activeElement;
    const isOrderFilterFocused = activeEl && activeEl.id === 'recv-order-filter';
    let cursorPos = 0;
    if (isOrderFilterFocused) {
        cursorPos = activeEl.selectionStart;
    }

    container.innerHTML = html;

    if (isOrderFilterFocused) {
        const newEl = document.getElementById('recv-order-filter');
        if (newEl) {
            newEl.focus();
            newEl.setSelectionRange(cursorPos, cursorPos);
        }
    }
};

window.markReceivablePaid = function (id, balance, invoiceNumber, custName, totalAmount, amtPaid) {
    balance = parseFloat(balance) || 0;
    totalAmount = parseFloat(totalAmount) || 0;
    amtPaid = parseFloat(amtPaid) || 0;

    // Remove existing modal if any
    let existing = document.getElementById('receivables-payment-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'receivables-payment-modal';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.7)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.borderRadius = '16px';
    modal.style.padding = '30px';
    modal.style.width = '420px';
    modal.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
    modal.style.fontFamily = "'Outfit', sans-serif";

    let html = `
        <h2 style="margin: 0 0 10px 0; color: #0f172a; font-size: 1.5rem;"><i class="fas fa-money-check-alt" style="color: #3b82f6;"></i> Process Payment</h2>
        <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:20px;">
            <p style="margin: 0 0 5px 0; color: #64748b; font-size: 0.95rem;">Invoice: <strong style="color:#0f172a;">${invoiceNumber}</strong></p>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem;">
                <span style="color:#64748b;">Total Invoice:</span>
                <span style="font-weight:700;">$${totalAmount.toFixed(2)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem;">
                <span style="color:#64748b;">Amount Paid:</span>
                <span style="font-weight:700; color:#10b981;">$${amtPaid.toFixed(2)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:1.1rem; margin-top:10px; border-top:1px dashed #cbd5e1; padding-top:10px;">
                <span style="color:#0f172a; font-weight:900;">Balance Due:</span>
                <span style="font-weight:900; color:#ef4444;">$${balance.toFixed(2)}</span>
            </div>
        </div>

        <div id="recv-step-1">
            <p style="margin:0 0 10px 0; font-size: 0.95rem; color: #334155; font-weight:700;">Payment Amount:</p>
            <div style="position: relative; margin-bottom:20px;">
                <span style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); font-weight: 900; color: #64748b; font-size:1.2rem;">$</span>
                <input type="number" id="recv-payment-amount" value="${balance.toFixed(2)}" max="${balance.toFixed(2)}" style="width: 100%; padding: 15px 15px 15px 35px; border: 2px solid #3b82f6; border-radius: 10px; font-size: 1.2rem; font-weight: 900; color:#0f172a; outline: none;">
            </div>
            <button id="btn-next-step" class="glossy-blue-btn" style="width: 100%; justify-content: center; font-size:1.1rem; padding:15px;">NEXT <i class="fas fa-arrow-right" style="margin-left:10px;"></i></button>
        </div>
        
        <div id="recv-step-2" style="display: none;">
            <p style="margin:0 0 15px 0; font-size: 0.95rem; color: #334155; font-weight:700; text-align:center;">Select Payment Method for <span id="display-pay-amt" style="color:#3b82f6; font-size:1.2rem;">$0.00</span></p>
            <div id="recv-method-selection" style="display: flex; flex-direction: column; gap: 10px;">
                <button id="btn-pay-bank" class="glossy-blue-btn" style="width: 100%; justify-content: center;">ALL BANK</button>
                <button id="btn-pay-cash" class="glossy-green-btn" style="width: 100%; justify-content: center;">ALL CASH</button>
                <button id="btn-pay-split" class="glossy-dark-btn" style="width: 100%; justify-content: center;">SPLIT PAYMENT</button>
            </div>

            <div id="recv-split-input" style="display: none; flex-direction: column; gap: 15px;">
                <p style="margin:0; font-size: 0.9rem; color: #334155;">Enter the portion paid in <strong>CASH</strong>:</p>
                <div style="position: relative;">
                    <span style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); font-weight: 900; color: #64748b;">$</span>
                    <input type="number" id="recv-cash-amount" placeholder="0.00" style="width: 100%; padding: 12px 15px 12px 30px; border: 2px solid #cbd5e1; border-radius: 10px; font-size: 1.1rem; font-weight: 700; outline: none;">
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:0.85rem; font-weight:700;">
                    <span>Bank Portion:</span>
                    <span id="recv-bank-portion">$0.00</span>
                </div>
                <button id="btn-confirm-split" class="glossy-red-btn" style="width: 100%; justify-content: center;">CONFIRM SPLIT</button>
            </div>
            
            <button id="btn-back-step" style="margin-top: 15px; width: 100%; background: transparent; border: none; cursor: pointer; color: #64748b; font-weight: 700; text-decoration:underline;">Back</button>
        </div>

        <button id="btn-cancel-payment" style="margin-top: 15px; width: 100%; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 12px; border-radius: 10px; cursor: pointer; color: #475569; font-weight: 700; transition: all 0.2s;">CANCEL</button>
    `;

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('btn-cancel-payment');
    closeBtn.onclick = () => overlay.remove();
    
    let currentPaymentAmount = balance;

    document.getElementById('btn-next-step').onclick = () => {
        const inputVal = parseFloat(document.getElementById('recv-payment-amount').value);
        if (!inputVal || inputVal <= 0) {
            alert("Please enter a valid payment amount.");
            return;
        }
        if (inputVal > balance + 0.01) {
            alert(`Payment cannot exceed the balance due ($${balance.toFixed(2)}).`);
            return;
        }
        currentPaymentAmount = inputVal;
        document.getElementById('display-pay-amt').textContent = `$${currentPaymentAmount.toFixed(2)}`;
        document.getElementById('recv-bank-portion').textContent = `$${currentPaymentAmount.toFixed(2)}`;
        document.getElementById('recv-step-1').style.display = 'none';
        document.getElementById('recv-step-2').style.display = 'block';
    };

    document.getElementById('btn-back-step').onclick = () => {
        document.getElementById('recv-step-2').style.display = 'none';
        document.getElementById('recv-step-1').style.display = 'block';
    };

    const processPayment = async (cashAmount, bankAmount, label) => {
        const btnAllBank = document.getElementById('btn-pay-bank');
        const btnAllCash = document.getElementById('btn-pay-cash');
        const btnSplit = document.getElementById('btn-pay-split');
        const btnConfirmSplit = document.getElementById('btn-confirm-split');
        if (btnAllBank) btnAllBank.disabled = true;
        if (btnAllCash) btnAllCash.disabled = true;
        if (btnSplit) btnSplit.disabled = true;
        if (btnConfirmSplit) btnConfirmSplit.disabled = true;

        const newAmountPaid = amtPaid + cashAmount + bankAmount;
        // Consider it fully paid if the difference is less than 2 cents
        const isFullyPaid = (totalAmount - newAmountPaid) <= 0.01;
        const newStatus = isFullyPaid ? 'Paid' : 'Partial';

        try {
            const updatePayload = {
                amount_paid: newAmountPaid,
                status: newStatus,
                paid_date: new Date().toISOString()
            };
            if (isFullyPaid) {
                updatePayload.payment_method = label; // Only label method if fully paid
            }

            const { error: updateErr } = await window.db.from('receivables_invoices')
                .update(updatePayload)
                .eq('id', id);

            if (updateErr) throw updateErr;
            if (window.logActivity) window.logActivity("UPDATED_RECORD", `[${new Date().toLocaleString()}] Actualizó Pago en Accounts Receivable ID: ${id}. Pagado: $${newAmountPaid}`);

            // ── Sync trip payment status in calendar (ONLY IF FULLY PAID) ─────────────
            if (isFullyPaid) {
                const invoiceRecord = window.receivablesData.invoices.find(i => i.id === id);
                if (invoiceRecord && invoiceRecord.trip_ids) {
                    const tripIdList = invoiceRecord.trip_ids.split(',').map(s => s.trim()).filter(Boolean);
                    const svcType = (invoiceRecord.service_type || '').toUpperCase();

                    // Map service type to the exact column(s) in the trips table
                    const serviceColumnMap = {
                        'TRANSPORT': { st_rate: 'PAID' },
                        'YARD':      { st_yard: 'PAID' },
                        'SALES':     { st_sales: 'PAID' },
                        'RENT':      { st_rent: 'PAID' },
                        'STORAGE':   { st_amount: 'PAID' },
                        'ALL':       { st_rate: 'PAID', st_yard: 'PAID', st_sales: 'PAID', st_rent: 'PAID', st_amount: 'PAID' },
                        '':          { st_rate: 'PAID', st_yard: 'PAID', st_sales: 'PAID', st_rent: 'PAID', st_amount: 'PAID' }
                    };
                    const colsToUpdate = serviceColumnMap[svcType] || serviceColumnMap['ALL'];

                    if (tripIdList.length > 0 && Object.keys(colsToUpdate).length > 0) {
                        await Promise.all(
                            tripIdList.map(tid =>
                                window.db.from('trips').update(colsToUpdate).eq('trip_id', tid)
                            )
                        );
                        // Sync local cache so calendar reflects immediately
                        tripIdList.forEach(tid => {
                            const localRow = (window.currentTrips || []).find(t => t[0] === tid);
                            if (localRow) {
                                if (colsToUpdate.st_rate)   localRow[32] = 'PAID';
                                if (colsToUpdate.st_yard)   localRow[30] = 'PAID';
                                if (colsToUpdate.st_sales)  localRow[33] = 'PAID';
                                if (colsToUpdate.st_rent)   localRow[31] = 'PAID';
                                if (colsToUpdate.st_amount) localRow[34] = 'PAID';
                            }
                        });
                        console.log(`[Receivables] Trip payment synced: ${tripIdList.join(',')} → ${JSON.stringify(colsToUpdate)}`);
                    }
                }
            }

            if (cashAmount > 0) {
                if (window.logCashTransaction) {
                    await window.logCashTransaction({
                        tipo: 'ingreso',
                        metodo: 'cash',
                        monto: cashAmount,
                        descripcion: `Payment for Invoice ${invoiceNumber} (CASH)`,
                        referencia: invoiceNumber,
                        cliente: custName
                    });
                } else {
                    const entry = {
                        date: new Date().toISOString().split('T')[0],
                        tipo: 'ingreso',
                        metodo: 'cash',
                        monto: cashAmount,
                        descripcion: `Payment for Invoice ${invoiceNumber} (CASH)`,
                        referencia: invoiceNumber,
                        cliente: custName
                    };
                    const { error: ledgerErr } = await window.db.from('cash_ledger').insert([entry]);
                    if (ledgerErr) console.error('[Receivables] Error saving cash to ledger:', ledgerErr);
                }
            }

            if (bankAmount > 0) {
                if (window.logCashTransaction) {
                    await window.logCashTransaction({
                        tipo: 'ingreso',
                        metodo: 'bank',
                        monto: bankAmount,
                        descripcion: `Payment for Invoice ${invoiceNumber} (BANK)`,
                        referencia: invoiceNumber,
                        cliente: custName
                    });
                } else {
                    const entry = {
                        date: new Date().toISOString().split('T')[0],
                        tipo: 'ingreso',
                        metodo: 'bank',
                        monto: bankAmount,
                        descripcion: `Payment for Invoice ${invoiceNumber} (BANK)`,
                        referencia: invoiceNumber,
                        cliente: custName
                    };
                    const { error: ledgerErr } = await window.db.from('cash_ledger').insert([entry]);
                    if (ledgerErr) console.error('[Receivables] Error saving bank to ledger:', ledgerErr);
                }
            }

            overlay.remove();
            await loadReceivables();
            renderReceivables();

        } catch (err) {
            console.error('Error marking paid:', err);
            alert('Failed to process payment: ' + err.message);
            if (btnAllBank) btnAllBank.disabled = false;
            if (btnAllCash) btnAllCash.disabled = false;
            if (btnSplit) btnSplit.disabled = false;
            if (btnConfirmSplit) btnConfirmSplit.disabled = false;
        }
    };

    document.getElementById('btn-pay-bank').onclick = () => processPayment(0, currentPaymentAmount, 'Bank');
    document.getElementById('btn-pay-cash').onclick = () => processPayment(currentPaymentAmount, 0, 'Cash');

    const splitInputDiv = document.getElementById('recv-split-input');
    const methodSelectionDiv = document.getElementById('recv-method-selection');

    document.getElementById('btn-pay-split').onclick = () => {
        methodSelectionDiv.style.display = 'none';
        splitInputDiv.style.display = 'flex';
        document.getElementById('recv-cash-amount').focus();
    };

    const cashInput = document.getElementById('recv-cash-amount');
    const bankPortionSpan = document.getElementById('recv-bank-portion');

    cashInput.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value) || 0;
        if (val > currentPaymentAmount) {
            val = currentPaymentAmount;
            e.target.value = val;
        }
        bankPortionSpan.textContent = '$' + (currentPaymentAmount - val).toFixed(2);
    });

    document.getElementById('btn-confirm-split').onclick = () => {
        const cashAmount = parseFloat(cashInput.value) || 0;
        const bankAmount = currentPaymentAmount - cashAmount;
        if (cashAmount <= 0 && bankAmount <= 0) {
            alert('Please enter a valid amount.');
            return;
        }
        processPayment(cashAmount, bankAmount, 'Split');
    };
};

window.addInvoiceToReceivables = async function (customerName, invoiceNumber, totalAmount, detailsHtml = '', tripIds = [], serviceType = '') {
    if (!customerName || !invoiceNumber || !totalAmount) return;
    try {
        const customerUpper = customerName.trim().toUpperCase();

        // Anti-Duplicado por Número de Factura Exacto (Double-click protection)
        const { data: dupInvNo } = await window.db.from('receivables_invoices')
            .select('id')
            .eq('invoice_number', invoiceNumber);

        if (dupInvNo && dupInvNo.length > 0) {
            console.log(`[Receivables] Anti-duplicate: Invoice ${invoiceNumber} is already recorded.`);
            return;
        }

        // Build trip sync metadata
        const tripIdsStr = Array.isArray(tripIds) ? tripIds.filter(Boolean).join(',') : (tripIds || '');
        const svcType = (serviceType || '').toString().toUpperCase().trim();

        const { error } = await window.db.from('receivables_invoices').insert([{
            customer_name: customerUpper,
            invoice_number: invoiceNumber,
            total_amount: parseFloat(totalAmount),
            details_html: detailsHtml,
            trip_ids: tripIdsStr || null,
            service_type: svcType || null
        }]);
        if (error) throw error;
        console.log(`[Receivables] Invoice ${invoiceNumber} added to AR. Trips: ${tripIdsStr}, Service: ${svcType}`);
    } catch (err) {
        console.error('[Receivables] Failed to add invoice to AR:', err);
        alert('Error al guardar en Accounts Receivable: ' + err.message);
    }
};

window.deleteReceivable = async function (id) {
    const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
    if (!isAdmin) {
        alert("Acceso denegado: Solo los administradores pueden eliminar registros.");
        return;
    }
    if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) return;
    try {
        const { error } = await window.db.from('receivables_invoices').update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: window.userEmail }).eq('id', id);
        if (error) throw error;

        console.log(`[Receivables] Invoice ${id} deleted.`);
        await loadReceivables();
        renderReceivables();
    } catch (err) {
        console.error('[Receivables] Error deleting invoice:', err);
        alert('Failed to delete invoice: ' + err.message);
    }
};

window.openReceivablePreview = function (id) {
    const inv = window.receivablesData.invoices.find(i => i.id === id);
    if (!inv) return;

    const invoiceNumber = inv.invoice_number;
    const customerName = inv.customer_name;
    const totalAmount = inv.total_amount;
    const date = inv.date_generated ? new Date(inv.date_generated).toLocaleDateString() : 'N/A';
    const status = inv.status;
    const paymentMethod = inv.payment_method || '';
    const paidDate = inv.paid_date || '';

    let detailsContent = inv.details_html || `
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
            <thead>
                <tr style="border-bottom:2px solid #e2e8f0; color:#64748b; font-size:0.8rem; text-transform:uppercase;">
                    <th style="text-align:left; padding:10px 0;">Description</th>
                    <th style="text-align:right; padding:10px 0;">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:15px 0; color:#0f172a; font-weight:700;">Balance Forward / Services Rendered</td>
                    <td style="padding:15px 0; color:#0f172a; font-weight:900; text-align:right;">$${parseFloat(totalAmount).toFixed(2)}</td>
                </tr>
            </tbody>
        </table>
    `;

    let existing = document.getElementById('recv-preview-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'recv-preview-modal';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.7)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.borderRadius = '16px';
    modal.style.padding = '40px';
    modal.style.width = '700px';
    modal.style.maxWidth = '90vw';
    modal.style.maxHeight = '90vh';
    modal.style.overflowY = 'auto';
    modal.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
    modal.style.fontFamily = "'Outfit', sans-serif";

    let paidInfo = '';
    if (status === 'Paid') {
        const pd = paidDate ? new Date(paidDate).toLocaleDateString() : 'N/A';
        paidInfo = `
            <div style="background:#ecfdf5; padding:15px; border-radius:10px; margin-top:20px; border:1px solid #10b981; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h4 style="margin:0; color:#065f46; font-size:0.9rem;">PAYMENT RECEIVED</h4>
                    <p style="margin:5px 0 0; color:#047857; font-size:0.8rem;">Method: <strong>${paymentMethod}</strong> | Date: <strong>${pd}</strong></p>
                </div>
                <i class="fas fa-check-circle" style="color:#10b981; font-size:2rem;"></i>
            </div>
        `;
    }

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #e2e8f0; padding-bottom:20px; margin-bottom:20px;">
            <div>
                <h1 style="margin:0; color:#0f172a; font-size:1.8rem; font-weight:900;">INVOICE PREVIEW</h1>
                <p style="margin:5px 0 0; color:#64748b; font-size:0.95rem;">Invoice #: <strong style="color:#0f172a;">${invoiceNumber}</strong></p>
            </div>
            <div style="text-align:right;">
                <h3 style="margin:0; color:#64748b; font-size:0.8rem; text-transform:uppercase;">Status</h3>
                <span style="display:inline-block; margin-top:5px; padding:5px 12px; border-radius:20px; font-weight:900; font-size:0.8rem; 
                    ${status === 'Paid' ? 'background:#ecfdf5; color:#10b981;' : 'background:#fef2f2; color:#ef4444;'}">
                    ${status}
                </span>
            </div>
        </div>

        <div style="margin-bottom:30px;">
            <h4 style="margin:0 0 10px; color:#64748b; font-size:0.8rem; text-transform:uppercase;">Bill To</h4>
            <p style="margin:0; font-size:1.2rem; font-weight:900; color:#0f172a;">${customerName}</p>
            <p style="margin:5px 0 0; color:#64748b; font-size:0.9rem;">Date Generated: ${date}</p>
        </div>

        <div style="background:#f8fafc; padding:20px; border-radius:10px; margin-bottom:20px; border:1px solid #e2e8f0;">
            <h4 style="margin:0 0 15px; color:#0f172a; font-size:1rem; border-bottom:1px solid #cbd5e1; padding-bottom:10px;">SERVICES BILLED</h4>
            <div class="billing-details-wrapper" style="font-size:0.9rem;">
                ${detailsContent}
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:20px; border-radius:10px; color:white;">
            <span style="font-weight:900; font-size:1.2rem;">GRAND TOTAL</span>
            <span style="font-weight:900; color:#38bdf8; font-size:1.5rem;">$${parseFloat(totalAmount).toFixed(2)}</span>
        </div>

        ${paidInfo}

        <div style="margin-top:30px; display:flex; justify-content:space-between; align-items:center;">
            <button id="btn-resend-invoice" class="glossy-blue-btn" style="padding:10px 30px;"><i class="fas fa-paper-plane"></i> RESEND EMAIL</button>
            <button id="btn-close-preview" class="glossy-dark-btn" style="padding:10px 30px;">CLOSE</button>
        </div>
    `;

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('btn-close-preview').onclick = () => overlay.remove();

    document.getElementById('btn-resend-invoice').onclick = () => {
        if (!inv.trip_ids) {
            alert('This invoice record does not have associated trip data and cannot be resent automatically from here. Please use the Billing module.');
            return;
        }

        const tripIds = inv.trip_ids.split(',').map(id => id.trim());
        
        // Ensure combinedBillingTrips is available (usually loaded with billing)
        if (!window.combinedBillingTrips || window.combinedBillingTrips.length === 0) {
            if (window.compileCombinedBillingTrips) {
                window.compileCombinedBillingTrips();
            } else {
                alert("Please open the BILLING tab first to initialize the billing data, then come back here.");
                return;
            }
        }

        const rows = (window.combinedBillingTrips || []).filter(r => tripIds.includes(r[0]));
        if (rows.length === 0) {
            alert("Could not find the original orders for this invoice. They might have been deleted.");
            return;
        }

        // Close this preview modal
        overlay.remove();

        // Open the Master Billing Modal with the exact rows and original invoice number
        if (window.openMasterBillingModal) {
            window.openMasterBillingModal(rows, invoiceNumber, customerName);
        } else {
            alert("Billing module is not fully loaded.");
        }
    };
};
