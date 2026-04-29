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
    const fInvoice = document.getElementById('ci-f-invoice')?.value || '';

    const logisticsData = currentTrips || [];

    const filtered = logisticsData.filter(row => {
        // 1. Basic Status Filter (Only Complete/Delivered/Finalized-PAID rows)
        const orderStatus = (row[41] || '').toString().toUpperCase();
        
        // In this system, 'PAID' status usually means 'Finalized' (Green in calendar)
        const isReady = (orderStatus === 'COMPLETE' || orderStatus === 'DELIVERED' || orderStatus === 'PAID');
        if (!isReady) return false;

        // 2. Component Payment Check (Only show if there's actually a debt)
        const hasTrans = (row[42] === 'YES');
        const hasSales = (row[43] === 'YES');
        const hasYard  = (row[12] === 'YES');

        // Check if those components are still PENDING
        const isRatePend  = hasTrans && (row[32] === 'PEND');
        const isSalesPend = hasSales && (row[33] === 'PEND');
        const isYardPend  = hasYard  && (row[30] === 'PEND');

        // Only show if at least ONE required component is still PENDING
        if (!isRatePend && !isSalesPend && !isYardPend) return false;

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

        // Invoice Filter (Index 57)
        const invoiceSentStatus = (row[57] || 'NO').toUpperCase();
        if (fInvoice && invoiceSentStatus !== fInvoice) return false;

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
        
        const qtyVal = parseInt(row[53]) || 1;
        const totalSales = salesPrice * qtyVal;
        
        // Define cash flags from indices 46, 47 and 48
        const isYCash = row[46] === true || row[46] === 'true';
        const isRCash = row[47] === true || row[47] === 'true';
        const isSCash = row[48] === true || row[48] === 'true';
        
        const yardRate = parseFloat(row[13]) || 0;
        
        let cashAmountValue = 0;
        if (isYCash) cashAmountValue += yardRate;
        if (isRCash) cashAmountValue += transPay;
        if (isSCash) cashAmountValue += totalSales;
        
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
        const isInvoiceSent = (row[57] === 'YES');
        
        tr.style.cssText = 'border-bottom: 1px solid #dee2e6; transition: background 0.2s;';
        tr.style.backgroundColor = isInvoiceSent ? '#dcfce7' : '#fee2e2'; // Light Green if YES, Light Red if NO
        
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
            <td style="${cellStyle}">$${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td style="${cellStyle} color: #10b981;">${cashDisplay}</td>
            <td style="${cellStyle} white-space: normal; min-width: 150px; text-align: left; font-size: 0.75rem;">${note}</td>
            <td style="${cellStyle}">
                <div style="display: flex; gap: 5px; justify-content: center;">
                    <button onclick="sendInvoiceEmailByIndex(${index})" class="btn-calendar" title="Send by Email" style="padding: 5px 10px; font-size: 0.75rem; background: #1e40af; min-width: 80px;">
                        <i class="fas fa-envelope"></i> EMAIL
                    </button>
                    <button onclick="downloadInvoiceByIndex(${index})" class="btn-calendar" title="Download PDF" style="padding: 5px 10px; font-size: 0.75rem; background: #10b981; min-width: 80px;">
                        <i class="fas fa-download"></i> PDF
                    </button>
                </div>
            </td>
        `;

        // Color handled by invoice status above
        body.appendChild(tr);
    });

    if (filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="12" style="padding: 40px; text-align: center; color: #94a3b8; font-style: italic; font-size: 0.9rem;">No pending customer invoices found for the selected filters.</td></tr>';
    }

    // Update Summary Card Counter
    const invoiceCountEl = document.getElementById('invoice-count-display');
    if (invoiceCountEl) {
        invoiceCountEl.textContent = filtered.length;
        // Visual feedback: blue if filtering
        const isFiltered = fOrder || fCity || fPlace || fCustomer || fFrom || fTo || fInvoice;
        invoiceCountEl.style.color = isFiltered ? '#3b82f6' : '#1e293b';
    }
};

window.downloadInvoiceByIndex = function (index) {
    const rowData = window.custInvoiceRows[index];
    if (!rowData) return;

    if (!window.generatePDFFromData) {
        alert("PDF logic not loaded yet. Please wait or refresh.");
        return;
    }

    const btn = event.currentTarget;
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    window.generatePDFFromData(rowData).then(blob => {
        if (blob) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const orderNo = rowData[5] || 'OR';
            a.download = `Invoice_${orderNo.replace(/\s+/g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            alert("No se pudo generar el PDF de la factura.");
        }
    }).catch(err => {
        console.error("Invoice download error:", err);
        alert("Error generando el documento.");
    }).finally(() => {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    });
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
    if (document.getElementById('ci-f-invoice')) document.getElementById('ci-f-invoice').value = '';
    renderCustInvoiceTable();
};

window.downloadCustInvoiceSummary = async function(format, btnElement = null) {
    const table = document.getElementById('cust-invoice-table');
    if (!table) return;

    const btn = btnElement || (window.event ? window.event.currentTarget : null);
    const originalContent = btn ? btn.innerHTML : '';

    const customerSelector = document.getElementById('ci-f-customer');
    const customerName = customerSelector ? customerSelector.value || 'All Customers' : 'All Customers';
    
    // Create a temporary container for the report to be captured
    const reportContainer = document.createElement('div');
    reportContainer.style.padding = '40px';
    reportContainer.style.background = 'white';
    reportContainer.style.width = '1200px';
    reportContainer.style.position = 'fixed';
    reportContainer.style.left = '-9999px';
    reportContainer.style.top = '0';
    reportContainer.style.fontFamily = 'Arial, sans-serif';
    document.body.appendChild(reportContainer);

    // Add Header
    reportContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px;">
            <div>
                <h1 style="margin: 0; color: #1e293b; font-size: 2.2rem; font-weight: 900;">PENDING PAYMENTS SUMMARY</h1>
                <h3 style="margin: 5px 0; color: #475569; text-transform: uppercase;">CUSTOMER: ${customerName}</h3>
            </div>
            <div style="text-align: right;">
                <p style="margin: 0; color: #64748b; font-weight: bold;">Date: ${new Date().toLocaleDateString()}</p>
                <p style="margin: 5px 0; font-weight: 900; color: #1e40af; font-size: 1.1rem;">RP TULIPAN TRANSPORT INC</p>
            </div>
        </div>
    `;

    // Clone the table
    const tableClone = table.cloneNode(true);
    tableClone.style.width = '100%';
    tableClone.style.borderCollapse = 'collapse';
    tableClone.style.fontSize = '0.85rem';
    
    // Remove the Actions column from header
    const headerRow = tableClone.querySelector('thead tr');
    if (headerRow && headerRow.lastElementChild) headerRow.lastElementChild.remove();
    
    // Remove Actions column from all rows and fix styles
    tableClone.querySelectorAll('tbody tr').forEach(tr => {
        if (tr.lastElementChild) tr.lastElementChild.remove();
        // Ensure colors are preserved in capture
        const cells = tr.querySelectorAll('td');
        cells.forEach(td => {
            td.style.borderBottom = '1px solid #e2e8f0';
            td.style.padding = '10px';
        });
    });

    reportContainer.appendChild(tableClone);

    // Calculate Total
    let totalPending = 0;
    const bodyRows = document.querySelectorAll('#cust-invoice-body tr');
    bodyRows.forEach(row => {
        if (row.cells.length >= 9) {
            const transStr = row.cells[7].textContent.replace(/[$,]/g, '').trim();
            const salesStr = row.cells[8].textContent.replace(/[$,]/g, '').trim();
            const trans = parseFloat(transStr) || 0;
            const sales = parseFloat(salesStr) || 0;
            totalPending += (trans + sales);
        }
    });

    // Add Footer with Total
    const footer = document.createElement('div');
    footer.style.marginTop = '40px';
    footer.style.textAlign = 'right';
    footer.style.borderTop = '3px solid #1e293b';
    footer.style.paddingTop = '20px';
    footer.innerHTML = `
        <h2 style="margin: 0; color: #1e293b; font-size: 1.8rem; font-weight: 900;">TOTAL BALANCE DUE: <span style="color: #dc2626;">$${totalPending.toLocaleString('en-US', {minimumFractionDigits: 2})}</span></h2>
        <p style="margin-top: 15px; font-size: 0.9rem; color: #475569; font-style: italic; font-weight: bold;">Please process payment at your earliest convenience. Thank you for your business!</p>
    `;
    reportContainer.appendChild(footer);

    // Capture process
    try {
        const canvas = await html2canvas(reportContainer, { 
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        });

        if (format === 'IMAGE') {
            const url = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `Pending_Summary_${customerName.replace(/\s+/g, '_')}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else if (format === 'PDF') {
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('l', 'mm', 'a4'); 
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 10;
            const imgWidth = pageWidth - (margin * 2);
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
            pdf.save(`Pending_Summary_${customerName.replace(/\s+/g, '_')}.pdf`);
        } else if (format === 'EMAIL') {
            if (!window.custInvoiceRows || window.custInvoiceRows.length === 0) {
                alert("No data to send.");
                return;
            }

            const customerEmail = window.custInvoiceRows[0][36];
            if (!customerEmail || customerEmail === '---') {
                alert("Selected customer has no email registered.");
                return;
            }

            const confirmSend = confirm(`Send Pending Summary to ${customerEmail}?`);
            if (!confirmSend) return;

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SENDING...';
            }

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('l', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 10;
            const imgWidth = pageWidth - (margin * 2);
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
            const blob = pdf.output('blob');

            // Prepare rowData dummy for the email service
            const emailData = [...window.custInvoiceRows[0]];
            emailData[5] = "PENDING_SUMMARY_" + (new Date().toLocaleDateString().replace(/\//g, '-'));
            emailData[1] = new Date().toLocaleDateString();

            try {
                await window.sendReceiptEmail(emailData, blob);
                alert("Summary successfully sent to " + customerEmail);
            } catch (err) {
                console.error(err);
                alert("Failed to send email.");
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                }
            }
        }
    } catch (err) {
        console.error("Error generating summary:", err);
        alert("There was an error generating the summary.");
    } finally {
        document.body.removeChild(reportContainer);
    }
};
