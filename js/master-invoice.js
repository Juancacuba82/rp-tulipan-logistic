// MASTER INVOICE — Detailed invoices by Order #
(function () {
    window.currentMasterInvoiceRows = [];
    
    window.resetMasterInvoice = function() {
        const searchInput = document.getElementById('mi-search-order');
        if (searchInput) searchInput.value = '';
        
        document.getElementById('mi-invoice-preview').style.display = 'none';
        document.getElementById('mi-empty-state').style.display = 'block';
        window.currentMasterInvoiceRows = [];
    };

    window.loadMasterInvoiceByOrder = async function () {
        const orderInput = document.getElementById('mi-search-order');
        if (!orderInput) return;

        const orderNo = orderInput.value.trim().toUpperCase();
        if (!orderNo) {
            alert("Please enter an Order #");
            return;
        }

        const btn = document.querySelector('button[onclick="loadMasterInvoiceByOrder()"]');
        const originalBtnHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        // If currentTrips is empty, try to load it first
        if (!window.currentTrips || window.currentTrips.length === 0) {
            if (window.loadTableData) await window.loadTableData();
        }

        const logisticsData = window.currentTrips || [];
        const matches = logisticsData.filter(row => {
            const rowOrder = (row[5] || '').toString().trim().toUpperCase();
            return rowOrder === orderNo;
        });

        btn.innerHTML = originalBtnHtml;
        btn.disabled = false;

        if (matches.length === 0) {
            alert(`No records found for Order #${orderNo}`);
            document.getElementById('mi-invoice-preview').style.display = 'none';
            document.getElementById('mi-empty-state').style.display = 'block';
            return;
        }

        window.currentMasterInvoiceRows = matches;
        renderInvoicePreview(matches);
    };

    function renderInvoicePreview(rows) {
        const preview = document.getElementById('mi-invoice-preview');
        const emptyState = document.getElementById('mi-empty-state');
        const body = document.getElementById('mi-services-body');

        preview.style.display = 'block';
        emptyState.style.display = 'none';
        body.innerHTML = '';

        // Header Info (from the first row)
        const mainRow = rows[0];
        document.getElementById('mi-order-display').textContent = mainRow[5] || '---';
        document.getElementById('mi-date-display').textContent = window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(mainRow[1]) : mainRow[1];
        
        // Update company name from selector
        const coSelector = document.getElementById('mi-company-selector');
        const coDisplay = document.getElementById('mi-company-name-display');
        if (coSelector && coDisplay) coDisplay.textContent = coSelector.value;
        
        // Payment Status Calculation
        let isEntireInvoicePaid = true;
        rows.forEach(r => {
            const hasTrans = r[42] === 'YES';
            const hasSales = r[43] === 'YES';
            const yardRate = parseFloat(r[13]) || 0;
            const takeTax = r[49] === true || r[49] === 'true' || r[49] === 'YES' || r[49] === 'on' || r[49] === 1;

            const transPaid = !hasTrans || r[32] === 'PAID';
            const salesPaid = !hasSales || r[33] === 'PAID';
            const yardPaid = yardRate <= 0.01 || r[30] === 'PAID';
            const taxPaid = !takeTax || r[52] === 'PAID';

            if (!transPaid || !salesPaid || !yardPaid || !taxPaid) {
                isEntireInvoicePaid = false;
            }
        });

        const badge = document.getElementById('mi-status-badge');
        badge.textContent = isEntireInvoicePaid ? 'PAID' : 'PENDING';
        badge.style.background = isEntireInvoicePaid ? '#dcfce7' : '#fee2e2';
        badge.style.color = isEntireInvoicePaid ? '#15803d' : '#991b1b';

        // Service Location / Delivery Address
        document.getElementById('mi-bill-to-name').textContent = mainRow[11] && mainRow[11] !== '---' ? mainRow[11] : 'No Customer Provided';
        document.getElementById('mi-from-address').textContent = mainRow[7] && mainRow[7] !== '---' ? mainRow[7] : 'N/A';
        document.getElementById('mi-to-address').textContent = mainRow[8] && mainRow[8] !== '---' ? mainRow[8] : 'N/A';
        
        let subtotal = 0;
        
        // Loop through all rows for this order and collect services
        rows.forEach(row => {
            const hasTrans = row[42] === 'YES';
            const hasSales = row[43] === 'YES';
            const yardServiceDesc = row[12] && row[12] !== '---' ? row[12] : '';
            const yardRate = parseFloat(row[13]) || 0;
            const qty = parseInt(row[53]) || 1;

            if (hasTrans) {
                const price = parseFloat(row[18]) || 0;
                addServiceRow(body, "TRANSPORT SERVICE", qty, price);
                subtotal += (qty * price);
            }
            if (hasSales) {
                const price = parseFloat(row[20]) || 0;
                addServiceRow(body, "CONTAINER SALES", qty, price);
                subtotal += (qty * price);
            }
            if (yardRate > 0) {
                const desc = yardServiceDesc ? `YARD SERVICE: ${yardServiceDesc}` : "YARD SERVICE";
                addServiceRow(body, desc, qty, yardRate);
                subtotal += (qty * yardRate);
            }
        });

        // Taxes
        const takeTax = mainRow[49] === true || mainRow[49] === 'true';
        const taxPercent = parseFloat(mainRow[50]) || 0;
        let taxAmount = 0;

        if (takeTax && taxPercent > 0) {
            taxAmount = (subtotal * taxPercent) / 100;
            document.getElementById('mi-tax-row').style.display = 'table-row';
            document.getElementById('mi-tax-rate').textContent = taxPercent;
            document.getElementById('mi-tax-amount').textContent = `$${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        } else {
            document.getElementById('mi-tax-row').style.display = 'none';
        }

        const grandTotal = subtotal + taxAmount;
        document.getElementById('mi-subtotal').textContent = `$${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        document.getElementById('mi-total').textContent = `$${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    function addServiceRow(body, desc, qty, unitPrice) {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        const total = qty * unitPrice;
        tr.innerHTML = `
            <td style="padding: 15px; font-weight: 600; color: #1e293b;">${desc}</td>
            <td style="padding: 15px; text-align: center; color: #000000;">${qty}</td>
            <td style="padding: 15px; text-align: right; color: #000000;">$${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 15px; text-align: right; font-weight: 700; color: #1e293b;">$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        `;
        body.appendChild(tr);
    }

    window.downloadMasterInvoicePDF = async function () {
        const btn = event.currentTarget;
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            const blob = await generateMasterInvoiceBlob();
            if (blob) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                const orderNo = document.getElementById('mi-order-display').textContent || 'OR';
                a.href = url;
                a.download = `Master_Invoice_${orderNo}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (e) {
            console.error(e);
            alert("Error generating PDF");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    };

    window.sendMasterInvoiceEmail = async function () {
        const rows = window.currentMasterInvoiceRows;
        if (!rows || rows.length === 0) return;

        const customerEmail = rows[0][36];
        if (!customerEmail || customerEmail === '---') {
            alert("This customer has no email registered.");
            return;
        }

        const confirmSend = confirm(`Send Master Invoice to ${customerEmail}?`);
        if (!confirmSend) return;

        const btn = event.currentTarget;
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        try {
            const blob = await generateMasterInvoiceBlob();
            if (blob) {
                // Reuse existing sendReceiptEmail logic if possible, 
                // but Master Invoice might need a custom EmailJS template or parameters
                await window.sendReceiptEmail(rows[0], blob);
                alert("Master Invoice sent successfully!");
            }
        } catch (e) {
            console.error(e);
            alert("Error sending email");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    };

    async function generateMasterInvoiceBlob() {
        const element = document.getElementById('mi-invoice-preview');
        // Temporarily hide actions for PDF
        const actions = document.getElementById('mi-invoice-actions');
        if (actions) actions.style.display = 'none';

        const { jsPDF } = window.jspdf;
        const canvas = await html2canvas(element, { scale: 2 });
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * pageWidth) / canvas.width;

        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        
        actions.style.display = 'flex'; // Restore actions
        return pdf.output('blob');
    }

    window.updateMasterInvoiceCompany = function () {
        const selector = document.getElementById('mi-company-selector');
        const display = document.getElementById('mi-company-name-display');
        if (selector && display) {
            display.textContent = selector.value;
        }
    };

})();
