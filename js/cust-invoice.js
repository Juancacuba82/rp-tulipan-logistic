// CUSTOMERS INVOICE — Pending invoices for completed orders
// Shows only orders with status 'COMPLETE' or 'PAID' and pending payment

window.custInvoiceRows = []; // Global storage for currently filtered rows to avoid onclick stringification issues

window.renderCustInvoiceTable = function () {
    const body = document.getElementById('cust-invoice-body');
    if (!body) return;

    if (window.populateCustInvoiceFilters) window.populateCustInvoiceFilters();

    const fOrder = (document.getElementById('ci-f-order')?.value || '').toLowerCase().trim();
    const fCity = (document.getElementById('ci-f-city')?.value || '').trim();
    const fPlace = (document.getElementById('ci-f-place')?.value || '').trim();
    const fCustomer = (document.getElementById('ci-f-customer')?.value || '').trim();
    const fFrom = document.getElementById('ci-f-from')?.value || '';
    const fTo = document.getElementById('ci-f-to')?.value || '';

    const logisticsData = currentTrips || [];

    const filtered = logisticsData.filter(row => {
        // 1. Basic Status Filter (Only Complete/Delivered/Finalized-PAID rows)
        const orderStatus = (row[41] || '').toString().toUpperCase();
        
        // In this system, 'PAID' status usually means 'Finalized' (Green in calendar)
        const isReady = (orderStatus === 'COMPLETE' || orderStatus === 'DELIVERED' || orderStatus === 'PAID');
        if (!isReady) return false;

        // 2. Component Payment Check (Only show if there's actually a debt)
        // Check if the order involves Transport and/or Sales components
        const hasTrans = (row[42] === 'YES');
        const hasSales = (row[43] === 'YES');

        // Check if those components are still PENDING
        const isRatePend = hasTrans && (row[32] === 'PEND');
        const isSalesPend = hasSales && (row[33] === 'PEND');

        // Only show if at least ONE required component is still PENDING
        if (!isRatePend && !isSalesPend) return false;

        // 3. User UI Filters
        const orderNo = (row[5] || '').toString().toLowerCase();
        const city = (row[6] || '').toString().trim();
        const place = (row[8] || '').toString().trim();
        const customer = (row[11] || '').toString().trim();
        const rowDate = row[1] || ''; // YYYY-MM-DD

        if (fOrder && !orderNo.includes(fOrder)) return false;
        if (fCity && city !== fCity) return false;
        if (fPlace && place !== fPlace) return false;
        if (fCustomer && customer !== fCustomer) return false;
        
        // Date Range
        if (fFrom && rowDate < fFrom) return false;
        if (fTo && rowDate > fTo) return false;

        return true;
    });

    // Save to global for index-based access
    window.custInvoiceRows = filtered;
    body.innerHTML = '';

    filtered.forEach((row, index) => {
        const orderNo = row[5] || '---';
        const nCont = row[3] || '---';
        const city = row[6] || '---';
        const place = row[8] || '---';
        const miles = row[10] || 0;
        const customerCol = row[11] || '---';
        const transPay = parseFloat(row[18]) || 0;
        const salesPrice = parseFloat(row[20]) || 0;
        const note = row[25] && row[25] !== '---' ? row[25] : '';
        
        const isRCash = (row[47] === true || row[47] === 'true');
        const isSCash = (row[48] === true || row[48] === 'true');
        
        let cashAmountValue = 0;
        if (isRCash) cashAmountValue += transPay;
        if (isSCash) cashAmountValue += salesPrice;
        
        const cashDisplay = cashAmountValue > 0 ? `$${cashAmountValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '---';

        // Format row date to MM/DD/YYYY
        const formatDateCI = (ds) => {
            if (!ds || ds === '---') return '---';
            const parts = ds.split('-');
            if (parts.length !== 3) return ds;
            return `${parts[1]}/${parts[2]}/${parts[0]}`;
        };
        const displayDate = formatDateCI(row[1]);

        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom: 1px solid #dee2e6; transition: background 0.2s;';
        const cellStyle = 'padding: 12px 14px; border: 1px solid #dee2e6; color: #000; font-weight: 700; text-align: center; vertical-align: middle;';

        tr.innerHTML = `
            <td style="${cellStyle}">${displayDate}</td>
            <td style="${cellStyle}">${orderNo}</td>
            <td style="${cellStyle}">${nCont}</td>
            <td style="${cellStyle}">${city}</td>
            <td style="${cellStyle} white-space: normal; min-width: 150px;">${place}</td>
            <td style="${cellStyle}">${miles}</td>
            <td style="${cellStyle}">${customerCol}</td>
            <td style="${cellStyle}">$${transPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td style="${cellStyle}">$${salesPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td style="${cellStyle} color: #10b981;">${cashDisplay}</td>
            <td style="${cellStyle} white-space: normal; min-width: 150px; text-align: left; font-size: 0.75rem;">${note}</td>
            <td style="${cellStyle}">
                <button onclick="sendInvoiceEmailByIndex(${index})" class="btn-calendar" style="padding: 5px 10px; font-size: 0.75rem; background: #1e40af; min-width: 80px;">
                    <i class="fas fa-envelope"></i> EMAIL
                </button>
            </td>
        `;

        if (body.children.length % 2 === 1) tr.style.backgroundColor = '#f8f9fa';
        body.appendChild(tr);
    });

    if (filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="12" style="padding: 40px; text-align: center; color: #94a3b8; font-style: italic; font-size: 0.9rem;">No pending customer invoices found for the selected filters.</td></tr>';
    }
};

window.sendInvoiceEmailByIndex = function (index) {
    const rowData = window.custInvoiceRows[index];
    if (!rowData) return;

    if (!window.generatePDFFromData || !window.sendReceiptEmail) {
        alert("Email logic not loaded yet. Please wait or refresh.");
        return;
    }

    const confirmSend = confirm(`Do you want to send the invoice email for Order #${rowData[5]}?`);
    if (!confirmSend) return;

    const btn = event.currentTarget;
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';

    window.generatePDFFromData(rowData).then(blob => {
        if (blob) {
            window.sendReceiptEmail(rowData, blob).then(() => {
                alert(`¡Email enviado correctamente para la Orden #${rowData[5]}!`);
            }).catch(e => {
                console.error("Email send err:", e);
                alert("Error enviando el correo.");
            }).finally(() => {
                btn.disabled = false;
                btn.innerHTML = originalContent;
            });
        } else {
            alert("No se pudo generar el PDF de la factura.");
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }).catch(err => {
        console.error("Invoice email error:", err);
        alert("Error generando el documento.");
        btn.disabled = false;
        btn.innerHTML = originalContent;
    });
};

window.populateCustInvoiceFilters = function () {
    const cities = new Set();
    const places = new Set();
    const customers = new Set();

    if (typeof currentTrips !== 'undefined') {
        currentTrips.forEach(row => {
            const orderStatus = (row[41] || '').toString().toUpperCase();
            const isReady = (orderStatus === 'COMPLETE' || orderStatus === 'DELIVERED' || orderStatus === 'PAID');
            if (!isReady) return;

            const hasTrans = (row[42] === 'YES');
            const hasSales = (row[43] === 'YES');
            const isRatePend = hasTrans && (row[32] === 'PEND');
            const isSalesPend = hasSales && (row[33] === 'PEND');

            if (isRatePend || isSalesPend) {
                if (row[6] && row[6] !== '---') cities.add(row[6]);
                if (row[8] && row[8] !== '---') places.add(row[8]);
                if (row[11] && row[11] !== '---') customers.add(row[11]);
            }
        });
    }

    const fill = (id, vals) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        const defaultText = id.includes('city') ? 'All Cities' : id.includes('place') ? 'All Places' : 'All Customers';
        sel.innerHTML = `<option value="">${defaultText}</option>`;
        [...vals].sort().forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            sel.appendChild(opt);
        });
        if (cur) sel.value = cur;
    };

    fill('ci-f-city', cities);
    fill('ci-f-place', places);
    fill('ci-f-customer', customers);
};

window.resetCustInvoiceFilters = function () {
    if (document.getElementById('ci-f-order')) document.getElementById('ci-f-order').value = '';
    if (document.getElementById('ci-f-city')) document.getElementById('ci-f-city').value = '';
    if (document.getElementById('ci-f-place')) document.getElementById('ci-f-place').value = '';
    if (document.getElementById('ci-f-customer')) document.getElementById('ci-f-customer').value = '';
    if (document.getElementById('ci-f-from')) document.getElementById('ci-f-from').value = '';
    if (document.getElementById('ci-f-to')) document.getElementById('ci-f-to').value = '';
    renderCustInvoiceTable();
};
