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
    const fDriver = (document.getElementById('ci-f-driver')?.value || '').trim();
    const fFrom = document.getElementById('ci-f-from')?.value || '';
    const fTo = document.getElementById('ci-f-to')?.value || '';

    const logisticsData = currentTrips || [];

    const filtered = logisticsData.filter(row => {
        // 1. Basic Status Filter (Only Complete/Paid/Delivered rows)
        const orderStatus = (row[41] || '').toString().toUpperCase();
        const isComplete = (orderStatus === 'COMPLETE' || orderStatus === 'PAID' || orderStatus === 'DELIVERED');
        if (!isComplete) return false;

        // 2. Payment Filter (Only PENDING components)
        const isRatePend = (row[32] === 'PEND');
        const isSalesPend = (row[33] === 'PEND');
        if (!isRatePend && !isSalesPend) return false;

        // 3. User UI Filters
        const orderNo = (row[5] || '').toString().toLowerCase();
        const city = (row[6] || '').toString().trim();
        const place = (row[8] || '').toString().trim();
        const driver = (row[17] || '').toString().trim();
        const rowDate = row[1] || ''; // YYYY-MM-DD

        if (fOrder && !orderNo.includes(fOrder)) return false;
        if (fCity && city !== fCity) return false;
        if (fPlace && place !== fPlace) return false;
        if (fDriver && driver !== fDriver) return false;
        
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
        const city = row[6] || '---';
        const place = row[8] || '---';
        const miles = row[10] || 0;
        const driver = row[17] || '---';
        const transPay = parseFloat(row[18]) || 0;
        const salesPrice = parseFloat(row[20]) || 0;
        
        const isRCash = (row[47] === true || row[47] === 'true');
        const isSCash = (row[48] === true || row[48] === 'true');
        
        let cashAmountValue = 0;
        if (isRCash) cashAmountValue += transPay;
        if (isSCash) cashAmountValue += salesPrice;
        
        const cashDisplay = cashAmountValue > 0 ? `$${cashAmountValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '---';

        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom: 1px solid #dee2e6; transition: background 0.2s;';
        const cellStyle = 'padding: 12px 14px; border: 1px solid #dee2e6; color: #000; font-weight: 700; text-align: center; vertical-align: middle;';

        tr.innerHTML = `
            <td style="${cellStyle}">${orderNo}</td>
            <td style="${cellStyle}">${city}</td>
            <td style="${cellStyle} white-space: normal; min-width: 150px;">${place}</td>
            <td style="${cellStyle}">${miles}</td>
            <td style="${cellStyle}">${driver}</td>
            <td style="${cellStyle}">$${transPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td style="${cellStyle}">$${salesPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td style="${cellStyle} color: #10b981;">${cashDisplay}</td>
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
        body.innerHTML = '<tr><td colspan="9" style="padding: 40px; text-align: center; color: #94a3b8; font-style: italic; font-size: 0.9rem;">No pending customer invoices found for the selected filters.</td></tr>';
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
    const drivers = new Set();

    if (typeof currentTrips !== 'undefined') {
        currentTrips.forEach(row => {
            const status = (row[41] || '').toString().toUpperCase();
            if (status === 'COMPLETE' || status === 'PAID' || status === 'DELIVERED') {
                if (row[6] && row[6] !== '---') cities.add(row[6]);
                if (row[8] && row[8] !== '---') places.add(row[8]);
                if (row[17] && row[17] !== '---') drivers.add(row[17]);
            }
        });
    }

    const fill = (id, vals) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        const defaultText = id.includes('city') ? 'All Cities' : id.includes('place') ? 'All Places' : 'All Drivers';
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
    fill('ci-f-driver', drivers);
};

window.resetCustInvoiceFilters = function () {
    if (document.getElementById('ci-f-order')) document.getElementById('ci-f-order').value = '';
    if (document.getElementById('ci-f-city')) document.getElementById('ci-f-city').value = '';
    if (document.getElementById('ci-f-place')) document.getElementById('ci-f-place').value = '';
    if (document.getElementById('ci-f-driver')) document.getElementById('ci-f-driver').value = '';
    if (document.getElementById('ci-f-from')) document.getElementById('ci-f-from').value = '';
    if (document.getElementById('ci-f-to')) document.getElementById('ci-f-to').value = '';
    renderCustInvoiceTable();
};
