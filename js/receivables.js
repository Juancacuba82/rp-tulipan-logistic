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
        const { data, error } = await window.db.from('receivables_invoices').select('*').order('date_generated', { ascending: false });
        if (error) throw error;
        window.receivablesData.invoices = data || [];
    } catch (err) {
        console.error('[Receivables] Error loading invoices:', err);
    }
}

window.renderReceivables = function () {
    const container = document.getElementById('receivables-module');
    if (!container) return;

    // Group invoices by customer
    const grouped = {
        pending: {},
        history: {}
    };

    window.receivablesData.invoices.forEach(inv => {
        const custName = inv.customer_name || 'UNKNOWN';
        const groupKey = inv.status === 'Paid' ? 'history' : 'pending';

        if (!grouped[groupKey][custName]) grouped[groupKey][custName] = [];
        grouped[groupKey][custName].push(inv);
    });

    let html = `
    <div class="header-banner" style="margin-bottom: 20px;">
        <div>
            <h1><i class="fas fa-file-invoice-dollar" style="color:var(--primary-light);"></i> ACCOUNTS RECEIVABLE</h1>
            <p>Manage and track your customer invoices and payments</p>
        </div>
        <div>
            <button class="btn-reset-modern" onclick="initReceivables()"><i class="fas fa-sync-alt"></i> REFRESH</button>
        </div>
    </div>
    
    <div class="tabs-container" style="display:flex; gap:10px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom:10px;">
        <button class="glossy-blue-btn" onclick="document.getElementById('recv-pending').style.display='block'; document.getElementById('recv-history').style.display='none';">Pending Invoices</button>
        <button class="glossy-dark-btn" onclick="document.getElementById('recv-pending').style.display='none'; document.getElementById('recv-history').style.display='block';">Payment History</button>
    </div>
    
    <!-- PENDING TAB -->
    <div id="recv-pending">
    `;

    if (Object.keys(grouped.pending).length === 0) {
        html += `<p style="color:#64748b; font-style:italic;">No pending invoices found.</p>`;
    } else {
        for (const [custName, invoices] of Object.entries(grouped.pending)) {
            let totalPending = invoices.reduce((sum, i) => sum + parseFloat(i.total_amount || 0), 0);
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
                                <th style="padding:8px 0;">AMOUNT</th>
                                <th style="padding:8px 0; text-align:right;">ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            invoices.forEach(inv => {
                const d = inv.date_generated ? new Date(inv.date_generated).toLocaleDateString() : 'N/A';
                const displayInvNo = inv.invoice_number ? inv.invoice_number.toString() : 'N/A';
                html += `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding:10px 0; font-weight:700;">${displayInvNo}</td>
                                <td style="padding:10px 0; color:#64748b;">${d}</td>
                                <td style="padding:10px 0; font-weight:700;">$${parseFloat(inv.total_amount || 0).toFixed(2)}</td>
                                <td style="padding:10px 0; text-align:right; display:flex; justify-content:flex-end; gap:10px;">
                                    <button class="glossy-blue-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="openReceivablePreview('${inv.id}')" title="View Invoice">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="glossy-green-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="markReceivablePaid('${inv.id}', ${inv.total_amount}, '${inv.invoice_number}', '${custName}')">
                                        MARK PAID
                                    </button>
                                    <button class="glossy-red-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="deleteReceivable('${inv.id}')" title="Delete Invoice">
                                        <i class="fas fa-trash"></i>
                                    </button>
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

    html += `</div>`; // End pending tab

    // HISTORY TAB
    html += `<div id="recv-history" style="display:none;">`;
    if (Object.keys(grouped.history).length === 0) {
        html += `<p style="color:#64748b; font-style:italic;">No payment history found.</p>`;
    } else {
        for (const [custName, invoices] of Object.entries(grouped.history)) {
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
                html += `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding:10px 0; font-weight:700; color:#94a3b8;"><del>${displayInvNo}</del></td>
                                <td style="padding:10px 0; color:#64748b;">${d}</td>
                                <td style="padding:10px 0;">
                                    <span style="background:#e0f2fe; color:#0284c7; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">${inv.payment_method || 'N/A'}</span>
                                </td>
                                <td style="padding:10px 0; font-weight:700; text-align:right; color:#10b981;">$${parseFloat(inv.total_amount || 0).toFixed(2)}</td>
                                <td style="padding:10px 0; text-align:right; display:flex; justify-content:flex-end; gap:10px;">
                                    <button class="glossy-blue-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="openReceivablePreview('${inv.id}')" title="View Invoice">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="glossy-red-btn" style="height:30px; padding:0 15px; font-size:0.75rem;" onclick="deleteReceivable('${inv.id}')" title="Delete Invoice">
                                        <i class="fas fa-trash"></i>
                                    </button>
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
    html += `</div>`;

    container.innerHTML = html;
};

window.markReceivablePaid = function (id, totalAmount, invoiceNumber, custName) {
    totalAmount = parseFloat(totalAmount);

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
    modal.style.width = '400px';
    modal.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
    modal.style.fontFamily = "'Outfit', sans-serif";

    let html = `
        <h2 style="margin: 0 0 10px 0; color: #0f172a; font-size: 1.5rem;"><i class="fas fa-money-check-alt" style="color: #3b82f6;"></i> Process Payment</h2>
        <p style="margin: 0 0 20px 0; color: #64748b; font-size: 0.95rem;">Invoice: <strong>${invoiceNumber}</strong><br>Total Due: <strong style="color: #ef4444;">$${totalAmount.toFixed(2)}</strong></p>
        
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
                <span id="recv-bank-portion">$${totalAmount.toFixed(2)}</span>
            </div>
            <button id="btn-confirm-split" class="glossy-red-btn" style="width: 100%; justify-content: center;">CONFIRM SPLIT</button>
        </div>

        <button id="btn-cancel-payment" style="margin-top: 20px; width: 100%; background: transparent; border: 1px solid #cbd5e1; padding: 10px; border-radius: 10px; cursor: pointer; color: #64748b; font-weight: 700; transition: all 0.2s;">CANCEL</button>
    `;

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('btn-cancel-payment');
    closeBtn.onclick = () => overlay.remove();
    closeBtn.onmouseover = () => closeBtn.style.background = '#f1f5f9';
    closeBtn.onmouseout = () => closeBtn.style.background = 'transparent';

    const processPayment = async (cashAmount, bankAmount, label) => {
        const btnAllBank = document.getElementById('btn-pay-bank');
        const btnAllCash = document.getElementById('btn-pay-cash');
        const btnSplit = document.getElementById('btn-pay-split');
        const btnConfirmSplit = document.getElementById('btn-confirm-split');
        if (btnAllBank) btnAllBank.disabled = true;
        if (btnAllCash) btnAllCash.disabled = true;
        if (btnSplit) btnSplit.disabled = true;
        if (btnConfirmSplit) btnConfirmSplit.disabled = true;

        try {
            const { error: updateErr } = await window.db.from('receivables_invoices')
                .update({
                    status: 'Paid',
                    payment_method: label,
                    paid_date: new Date().toISOString()
                })
                .eq('id', id);

            if (updateErr) throw updateErr;

            // ── Sync trip payment status in calendar ─────────────
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

    document.getElementById('btn-pay-bank').onclick = () => processPayment(0, totalAmount, 'Bank');
    document.getElementById('btn-pay-cash').onclick = () => processPayment(totalAmount, 0, 'Cash');

    const methodSelection = document.getElementById('recv-method-selection');
    const splitInputDiv = document.getElementById('recv-split-input');
    const cashInput = document.getElementById('recv-cash-amount');
    const bankPortionLabel = document.getElementById('recv-bank-portion');

    document.getElementById('btn-pay-split').onclick = () => {
        methodSelection.style.display = 'none';
        splitInputDiv.style.display = 'flex';
        cashInput.focus();
    };

    cashInput.oninput = () => {
        let val = parseFloat(cashInput.value) || 0;
        if (val > totalAmount) {
            cashInput.value = totalAmount;
            val = totalAmount;
        } else if (val < 0) {
            cashInput.value = 0;
            val = 0;
        }
        let rem = totalAmount - val;
        bankPortionLabel.textContent = '$' + rem.toFixed(2);
    };

    document.getElementById('btn-confirm-split').onclick = () => {
        let val = parseFloat(cashInput.value);
        if (isNaN(val) || val <= 0 || val >= totalAmount) {
            alert('Please enter a valid cash amount greater than 0 and less than the total.');
            return;
        }
        let rem = totalAmount - val;
        let label = `Split (Cash: $${val.toFixed(2)}, Bank: $${rem.toFixed(2)})`;
        processPayment(val, rem, label);
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
    if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) return;
    try {
        const { error } = await window.db.from('receivables_invoices').delete().eq('id', id);
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

        <div style="margin-top:30px; display:flex; justify-content:flex-end;">
            <button id="btn-close-preview" class="glossy-dark-btn" style="padding:10px 30px;">CLOSE</button>
        </div>
    `;

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('btn-close-preview').onclick = () => overlay.remove();
};
