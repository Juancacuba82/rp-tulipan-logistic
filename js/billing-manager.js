// ============================================================
// billing-manager.js — Unified Billing Center
// Combines: cust-invoice.js + master-invoice.js
// ============================================================

(function () {

    // ── GLOBAL STATE ──────────────────────────────────────────
    window.billingRows = [];              // Current filtered rows in table
    window.currentBillingOrderRows = []; // Rows for the open order in the modal

    // ── HELPERS ───────────────────────────────────────────────

    function fmtMoney(v) {
        return '$' + (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
    }

    function fmtDate(ds) {
        if (!ds || ds === '---') return '---';
        const p = ds.split('-');
        if (p.length !== 3) return ds;
        return `${p[1]}/${p[2]}/${p[0]}`;
    }

    function rowHasPendingPayment(row) {
        const hasTrans = row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0;
        const hasSales = row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0;
        const yardRate = parseFloat(row[13]) || 0;
        const takeTax  = row[49] === true || row[49] === 'true' || row[49] === 'YES' || row[49] === 'on' || row[49] === 1;

        if (hasTrans && row[32] !== 'PAID') return true;
        if (hasSales && row[33] !== 'PAID') return true;
        if (yardRate > 0.01 && row[30] !== 'PAID') return true;
        if (takeTax  && row[52] !== 'PAID') return true;
        return false;
    }

    // ── POPULATE FILTERS ──────────────────────────────────────
    window.populateBillingFilters = function () {
        const cities     = new Set();
        const places     = new Set();
        const customers  = new Set();
        const drivers    = new Set();
        const releases   = new Set();

        const fOrder    = (document.getElementById('bc-f-order')?.value    || '').toLowerCase().trim();
        const fCity     = (document.getElementById('bc-f-city')?.value     || '').trim();
        const fPlace    = (document.getElementById('bc-f-place')?.value    || '').trim();
        const fCustomer = (document.getElementById('bc-f-customer')?.value || '').trim();
        const fDriver   = (document.getElementById('bc-f-driver')?.value   || '').trim();
        const fService  = (document.getElementById('bc-f-service')?.value  || '').trim();
        const fRelease  = (document.getElementById('bc-f-release')?.value  || '').trim();
        const fFrom     = document.getElementById('bc-f-from')?.value || '';
        const fTo       = document.getElementById('bc-f-to')?.value   || '';
        const fInvoice  = document.getElementById('bc-f-invoice')?.value || '';
        const fPayment  = (document.getElementById('bc-f-payment')?.value || 'all').toLowerCase();

        (window.currentTrips || []).forEach(row => {
            const status = (row[41] || '').toUpperCase();
            if (!(status === 'COMPLETE' || status === 'DELIVERED' || status === 'PAID')) return;

            const isPending = rowHasPendingPayment(row);
            
            const orderNo  = (row[5]  || '').toString().toLowerCase();
            const city     = (row[6]  || '').toString().trim();
            const place    = (row[8]  || '').toString().trim();
            const customer = (row[11] || '').toString().trim();
            const driver   = (row[17] || '').toString().trim();
            const release  = (row[4]  || '---').toString().trim();
            const rowDate  = row[1]   || '';
            const invSent  = (row[57] || 'NO').toUpperCase();

            const hasTrans = row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0;
            const hasSales = row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0;
            const hasYard  = (parseFloat(row[13]) || 0) > 0.01;

            // Check non-dropdown filters
            if (fPayment === 'pending' && !isPending) return;
            if (fPayment === 'paid' && isPending) return;
            if (fOrder && !orderNo.includes(fOrder)) return;
            if (fFrom && rowDate < fFrom) return;
            if (fTo && rowDate > fTo) return;
            if (fInvoice && invSent !== fInvoice) return;
            if (fRelease && release !== fRelease) return;

            if (fService === 'TRANSPORT' && !hasTrans) return;
            if (fService === 'SALES' && !hasSales) return;
            if (fService === 'YARD' && !hasYard) return;

            // To add a value to a specific dropdown, it must pass all OTHER dropdown filters
            const passCity = !fCity || city === fCity;
            const passPlace = !fPlace || place === fPlace;
            const passCustomer = !fCustomer || customer === fCustomer;
            const passDriver = !fDriver || driver === fDriver;
            const passRelease = !fRelease || release === fRelease;

            if (passPlace && passCustomer && passDriver && passRelease && city && city !== '---') cities.add(city);
            if (passCity && passCustomer && passDriver && passRelease && place && place !== '---') places.add(place);
            if (passCity && passPlace && passDriver && passRelease && customer && customer !== '---') customers.add(customer);
            if (passCity && passPlace && passCustomer && passRelease && driver && driver !== '---') drivers.add(driver);
            if (passCity && passPlace && passCustomer && passDriver && release && release !== '---') releases.add(release);
        });

        const fill = (id, vals, defaultTxt) => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = `<option value="">${defaultTxt}</option>`;
            [...vals].sort().forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                sel.appendChild(opt);
            });
            if (cur && vals.has(cur)) {
                sel.value = cur;
            } else {
                sel.value = '';
            }
        };

        fill('bc-f-city',     cities,    'All Cities');
        fill('bc-f-place',    places,    'All Places');
        fill('bc-f-customer', customers, 'All Customers');
        fill('bc-f-driver',   drivers,   'All Drivers');
        fill('bc-f-release',  releases,  'All Releases');
    };

    // ── RENDER MAIN TABLE ─────────────────────────────────────
    window.renderBillingTable = function () {
        const body = document.getElementById('billing-table-body');
        if (!body) return;

        window.populateBillingFilters();

        const fOrder    = (document.getElementById('bc-f-order')?.value    || '').toLowerCase().trim();
        const fBooking  = (document.getElementById('bc-f-booking')?.value  || '').toLowerCase().trim();
        const fCity     = (document.getElementById('bc-f-city')?.value     || '').trim();
        const fPlace    = (document.getElementById('bc-f-place')?.value    || '').trim();
        const fCustomer = (document.getElementById('bc-f-customer')?.value || '').trim();
        const fDriver   = (document.getElementById('bc-f-driver')?.value   || '').trim();
        const fService  = (document.getElementById('bc-f-service')?.value || '').trim();
        const fRelease  = (document.getElementById('bc-f-release')?.value || '').trim();
        const fFrom     = document.getElementById('bc-f-from')?.value || '';
        const fTo       = document.getElementById('bc-f-to')?.value   || '';
        const fInvoice  = document.getElementById('bc-f-invoice')?.value || '';
        const fPayment  = (document.getElementById('bc-f-payment')?.value || 'all').toLowerCase();

        const filtered = (window.currentTrips || []).filter(row => {
            const status = (row[41] || '').toUpperCase();
            if (!(status === 'COMPLETE' || status === 'DELIVERED' || status === 'PAID')) return false;
            
            const isPending = rowHasPendingPayment(row);
            if (fPayment === 'pending' && !isPending) return false;
            if (fPayment === 'paid' && isPending) return false;

            const orderNo  = (row[5]  || '').toString().toLowerCase();
            const city     = (row[6]  || '').toString().trim();
            const place    = (row[8]  || '').toString().trim();
            const customer = (row[11] || '').toString().trim();
            const driver   = (row[17] || '').toString().trim();
            const release  = (row[4]  || '---').toString().trim();
            const booking  = (row[65] && row[65] !== '---') ? row[65].toString().toLowerCase() : '';
            const rowDate  = row[1]   || '';
            const invSent  = (row[57] || 'NO').toUpperCase();
            
            const hasTrans = row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0;
            const hasSales = row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0;
            const hasYard  = (parseFloat(row[13]) || 0) > 0.01;

            if (fOrder    && !orderNo.includes(fOrder))    return false;
            if (fBooking  && !booking.includes(fBooking))  return false;
            if (fCity     && city     !== fCity)            return false;
            if (fPlace    && place    !== fPlace)           return false;
            if (fCustomer && customer !== fCustomer)        return false;
            if (fDriver   && driver   !== fDriver)          return false;
            if (fRelease  && release  !== fRelease)         return false;

            if (fService === 'TRANSPORT' && !hasTrans)      return false;
            if (fService === 'SALES'     && !hasSales)      return false;
            if (fService === 'YARD'      && !hasYard)       return false;
            if (fFrom     && rowDate  < fFrom)              return false;
            if (fTo       && rowDate  > fTo)                return false;
            if (fInvoice  && invSent  !== fInvoice)         return false;

            return true;
        });

        window.billingRows = filtered;
        body.innerHTML    = '';

        let visibleCount = 0;
        let totalOwedAmount = 0;

        filtered.forEach((row) => {
            const orderNo = (row[5] || '---').toString().toUpperCase();
            const isInvoiceSent = (row[57] === 'YES');

            // Compute totals for this single row
            let totalTrans = 0;
            let totalSales = 0;
            let totalYard  = 0;
            let isOrderPendingPayment = false;

            const hasTrans = row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0;
            const hasSales = row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0;
            const qty      = parseInt(row[53]) || 1;
            if (hasTrans) totalTrans += (parseFloat(row[18]) || 0);
            if (hasSales) totalSales += (parseFloat(row[20]) || 0) * qty;
            totalYard  += (parseFloat(row[13]) || 0);
            
            // Calculate pending portions for total due
            let rowSubtotalOwed = 0;
            if (hasTrans && row[32] !== 'PAID') rowSubtotalOwed += (parseFloat(row[18]) || 0);
            if (hasSales && row[33] !== 'PAID') rowSubtotalOwed += (parseFloat(row[20]) || 0) * qty;
            if ((parseFloat(row[13]) || 0) > 0.01 && row[30] !== 'PAID') rowSubtotalOwed += (parseFloat(row[13]) || 0);
            
            const takeTax = row[49] === true || row[49] === 'true' || row[49] === 'YES' || row[49] === 'on' || row[49] === 1;
            let rowTaxOwed = 0;
            if (takeTax && row[52] !== 'PAID') {
                const taxPct = parseFloat(row[50]) || 0;
                rowTaxOwed = ((totalTrans + totalSales + totalYard) * taxPct) / 100;
            }
            
            totalOwedAmount += (rowSubtotalOwed + rowTaxOwed);

            if (rowHasPendingPayment(row)) {
                isOrderPendingPayment = true;
            }

            const grandTotal = totalTrans + totalSales + totalYard;
            const displayDate = fmtDate(row[1]);
            const customer    = row[11] || '---';
            const city        = row[6]  || '---';
            const place       = row[8]  || '---';
            const nCont       = row[3]  || '---';
            const bookingNo   = (row[65] && row[65] !== '---') ? row[65] : '—';
            const release     = row[4]  || '---';
            const driverName  = row[17] || '---';

            let rowBg = isOrderPendingPayment ? '#fee2e2' : '#dcfce7'; // RED if pending, GREEN if paid

            const cs     = 'padding: 11px 13px; border-bottom: 1px solid #e2e8f0; text-align: center; vertical-align: middle; font-weight: 700; color: #0f172a;';
            const invBadge = isInvoiceSent
                ? `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:0.68rem;font-weight:800;">SENT ✓</span>`
                : `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:12px;font-size:0.68rem;font-weight:800;">PENDING</span>`;

            // Validation badge (Guardian check)
            const validBadge = window.getInvoiceValidationBadge
                ? window.getInvoiceValidationBadge(row)
                : '';

            // Last sent / reminder count info
            const lastSentDate = row[63];
            const reminderCount = parseInt(row[64]) || 0;
            let lastSentText = '—';
            if (lastSentDate) {
                const daysSince = Math.floor((Date.now() - new Date(lastSentDate)) / 86400000);
                lastSentText = daysSince === 0 ? 'Today' : `${daysSince}d ago`;
                if (reminderCount > 1) lastSentText += ` (×${reminderCount})`;
            }

            const tr = document.createElement('tr');
            tr.style.background = rowBg;
            tr.style.transition = 'background 0.15s';
            tr.onmouseenter = () => tr.style.background = '#e2e8f0';
            tr.onmouseleave = () => tr.style.background = rowBg;

            // We need the global index from currentTrips to easily identify this exact row
            const globalIdx = (window.currentTrips || []).indexOf(row);

            tr.innerHTML = `
                <td style="${cs}">${displayDate}</td>
                <td style="${cs}">${orderNo}</td>
                <td style="${cs}">${nCont}</td>
                <td style="${cs}">${bookingNo}</td>
                <td style="${cs}">${release}</td>
                <td style="${cs}">${customer}</td>
                <td style="${cs}">${city}</td>
                <td style="${cs} white-space:normal; min-width:130px; text-align:left;">${place}</td>
                <td style="display:none; ${cs}">${driverName}</td>
                <td style="${cs} color:#1e40af;">${totalTrans > 0 ? fmtMoney(totalTrans) : ''}</td>
                <td style="${cs} color:#10b981;">${totalSales > 0 ? fmtMoney(totalSales) : ''}</td>
                <td style="${cs} color:#f59e0b;">${totalYard > 0 ? fmtMoney(totalYard) : ''}</td>
                <td style="${cs} font-size:1rem; font-weight:900; color:#1e293b;">${fmtMoney(grandTotal)}</td>
                <td style="${cs}">${invBadge}</td>
                <td style="${cs}">${validBadge}</td>
                <td style="${cs} font-size:0.7rem; color:#475569;">${lastSentText}</td>
                <td style="${cs}">
                    <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                        <button onclick="openBillingDetail(${globalIdx})"
                            style="background:#1e293b;color:white;border:none;padding:6px 12px;border-radius:7px;cursor:pointer;font-size:0.72rem;font-weight:800;display:flex;align-items:center;gap:5px;white-space:nowrap;">
                            <i class="fas fa-file-invoice-dollar"></i> VIEW & SEND
                        </button>
                        ${isOrderPendingPayment ? `
                        <button onclick="markBillingRowAsPaid(${globalIdx}, this)"
                            style="background:#10b981;color:white;border:none;padding:6px 12px;border-radius:7px;cursor:pointer;font-size:0.72rem;font-weight:800;display:flex;align-items:center;gap:5px;white-space:nowrap;" title="Mark as Paid">
                            <i class="fas fa-check-double"></i> PAID
                        </button>
                        ` : ''}
                    </div>
                </td>
            `;
            body.appendChild(tr);
            visibleCount++;
        });

        if (visibleCount === 0) {
            body.innerHTML = '<tr><td colspan="13" style="padding:50px;text-align:center;color:#94a3b8;font-style:italic;">No pending invoices found for the selected filters.</td></tr>';
        }

        // Counter
        const counter = document.getElementById('billing-count-display');
        if (counter) counter.textContent = visibleCount;

        // Total Due
        const totalDueDisplay = document.getElementById('billing-total-due-display');
        if (totalDueDisplay) totalDueDisplay.textContent = fmtMoney(totalOwedAmount);

        // Update the incomplete orders alert banner to reflect the filtered rows
        if (typeof window.renderIncompleteOrdersBanner === 'function') {
            window.renderIncompleteOrdersBanner();
        }
    };

    // ── RESET FILTERS ─────────────────────────────────────────
    window.resetBillingFilters = function () {
        ['bc-f-order','bc-f-booking','bc-f-city','bc-f-place','bc-f-customer','bc-f-driver','bc-f-service','bc-f-release','bc-f-from','bc-f-to','bc-f-invoice']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const fPayment = document.getElementById('bc-f-payment');
        if (fPayment) fPayment.value = 'pending';
        window.renderBillingTable();
    };

    // ── OPEN DETAIL MODAL ─────────────────────────────────────
    window.openBillingDetail = function (globalIdx) {
        const trips = window.currentTrips || [];
        const row = trips[globalIdx];

        if (!row) {
            alert(`Record not found.`);
            return;
        }

        const orderNo = (row[5] || '---').toString();
        window.currentBillingOrderRows = [row];
        renderBillingDetailModal([row], orderNo);

        const modal = document.getElementById('billing-detail-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeBillingDetail = function () {
        const modal = document.getElementById('billing-detail-modal');
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = '';
    };

    // Close modal on backdrop click
    document.addEventListener('click', function (e) {
        const modal = document.getElementById('billing-detail-modal');
        if (modal && e.target === modal) window.closeBillingDetail();
    });

    // ── RENDER DETAIL CONTENT INSIDE MODAL ───────────────────
    function renderBillingDetailModal(rows, orderNo) {
        const mainRow     = rows[0];
        const preview     = document.getElementById('bm-invoice-preview');
        if (!preview) return;

        // Company selector
        const coSel  = document.getElementById('bm-company-selector');
        const coDisp = document.getElementById('bm-company-name-display');
        if (coSel && coDisp) coDisp.textContent = coSel.value;

        // Header
        document.getElementById('bm-order-display').textContent = mainRow[5] || '---';
        document.getElementById('bm-date-display').textContent  = window.formatDateMMDDYYYY
            ? window.formatDateMMDDYYYY(mainRow[1])
            : fmtDate(mainRow[1]);

        // Bill To
        const customerName = mainRow[11] && mainRow[11] !== '---' ? mainRow[11] : 'No Customer';
        document.getElementById('bm-bill-to-name').textContent = customerName;

        const customerObj    = (window.currentCustomers || []).find(c => c.name === customerName);
        const billAddressEl  = document.getElementById('bm-bill-to-address');
        if (billAddressEl) {
            if (customerObj && customerObj.address) {
                billAddressEl.textContent     = customerObj.address;
                billAddressEl.style.display   = 'block';
            } else {
                billAddressEl.style.display   = 'none';
            }
        }

        document.getElementById('bm-from-address').textContent = mainRow[7] && mainRow[7] !== '---' ? mainRow[7] : 'N/A';
        document.getElementById('bm-to-address').textContent   = mainRow[8] && mainRow[8] !== '---' ? mainRow[8] : 'N/A';

        // Status badge
        let isEntirelyPaid = true;
        rows.forEach(r => {
            const hasTrans  = r[42] === 'YES' && (parseFloat(r[18]) || 0) > 0;
            const hasSales  = r[43] === 'YES' && (parseFloat(r[20]) || 0) > 0;
            const yardRate  = parseFloat(r[13]) || 0;
            const takeTax   = r[49] === true || r[49] === 'true' || r[49] === 'YES' || r[49] === 'on' || r[49] === 1;
            if (hasTrans  && r[32] !== 'PAID') isEntirelyPaid = false;
            if (hasSales  && r[33] !== 'PAID') isEntirelyPaid = false;
            if (yardRate > 0.01 && r[30] !== 'PAID') isEntirelyPaid = false;
            if (takeTax   && r[52] !== 'PAID') isEntirelyPaid = false;
        });

        const badge = document.getElementById('bm-status-badge');
        if (badge) {
            badge.textContent       = isEntirelyPaid ? 'PAID' : 'PENDING';
            badge.style.background  = isEntirelyPaid ? '#dcfce7' : '#fee2e2';
            badge.style.color       = isEntirelyPaid ? '#15803d' : '#991b1b';
        }

        // Services table
        const body    = document.getElementById('bm-services-body');
        body.innerHTML = '';
        let subtotal   = 0;

        rows.forEach(row => {
            const hasTrans        = row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0;
            const hasSales        = row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0;
            const yardDesc        = row[12] && row[12] !== '---' ? row[12] : '';
            const yardRate        = parseFloat(row[13]) || 0;
            const qty             = parseInt(row[53]) || 1;

            if (hasTrans) {
                const price = parseFloat(row[18]) || 0;
                addDetailRow(body, 'TRANSPORT SERVICE', qty, price);
                subtotal += qty * price;
            }
            if (hasSales) {
                const price = parseFloat(row[20]) || 0;
                addDetailRow(body, 'CONTAINER SALES', qty, price);
                subtotal += qty * price;
            }
            if (yardRate > 0) {
                const desc = yardDesc ? `YARD SERVICE: ${yardDesc}` : 'YARD SERVICE';
                addDetailRow(body, desc, qty, yardRate);
                subtotal += qty * yardRate;
            }
        });

        // Tax
        const takeTax   = mainRow[49] === true || mainRow[49] === 'true';
        const taxPct    = parseFloat(mainRow[50]) || 0;
        let   taxAmount = 0;

        const taxRow = document.getElementById('bm-tax-row');
        if (takeTax && taxPct > 0) {
            taxAmount = (subtotal * taxPct) / 100;
            if (taxRow) taxRow.style.display = 'table-row';
            document.getElementById('bm-tax-rate').textContent   = taxPct;
            document.getElementById('bm-tax-amount').textContent = fmtMoney(taxAmount);
        } else {
            if (taxRow) taxRow.style.display = 'none';
        }

        const grandTotal = subtotal + taxAmount;
        document.getElementById('bm-subtotal').textContent = fmtMoney(subtotal);
        document.getElementById('bm-total').textContent    = fmtMoney(grandTotal);
    }

    function addDetailRow(body, desc, qty, unitPrice) {
        const tr    = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        const total = qty * unitPrice;
        tr.innerHTML = `
            <td style="padding:14px 15px;font-weight:600;color:#1e293b;">${desc}</td>
            <td style="padding:14px 15px;text-align:center;color:#0f172a;">${qty}</td>
            <td style="padding:14px 15px;text-align:right;color:#0f172a;">${fmtMoney(unitPrice)}</td>
            <td style="padding:14px 15px;text-align:right;font-weight:800;color:#1e293b;">${fmtMoney(total)}</td>
        `;
        body.appendChild(tr);
    }

    // ── COMPANY SELECTOR ──────────────────────────────────────
    window.updateBillingCompany = function () {
        const sel  = document.getElementById('bm-company-selector');
        const disp = document.getElementById('bm-company-name-display');
        if (sel && disp) disp.textContent = sel.value;
    };

    // ── DOWNLOAD MASTER INVOICE PDF ───────────────────────────
    window.downloadBillingInvoicePDF = async function () {
        const btn = event.currentTarget;
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            const blob = await generateMasterInvoiceBlob();
            if (blob) {
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                const ord  = document.getElementById('bm-order-display')?.textContent || 'ORDER';
                a.href     = url;
                a.download = `Invoice_${ord}.pdf`;
                document.body.appendChild(a);
                a.click();
                URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (e) {
            console.error(e);
            alert('Error generating PDF');
        } finally {
            btn.disabled  = false;
            btn.innerHTML = orig;
        }
    };

    // ── GENERATE MASTER INVOICE PDF BLOB ─────────────────────
    async function generateMasterInvoiceBlob() {
        const originalEl = document.getElementById('bm-invoice-preview');
        if (!originalEl) return null;

        // Create an off-screen container to ensure html2canvas can render it
        // even if the modal is hidden (display: none).
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:-9999px;top:0;width:860px;background:white;z-index:-1;';
        
        // Clone the preview element deeply
        const clone = originalEl.cloneNode(true);
        // Temporarily hide actions for PDF in the clone
        const actions = clone.querySelector('#bm-invoice-actions');
        if (actions) actions.style.display = 'none';

        container.appendChild(clone);
        document.body.appendChild(container);

        try {
            const { jsPDF } = window.jspdf;
            const canvas    = await html2canvas(clone, { scale: 1.2, useCORS: true, backgroundColor: '#ffffff' });
            const imgData   = canvas.toDataURL('image/jpeg', 0.7);

            const pdf      = new jsPDF('p', 'mm', 'a4');
            const pw       = pdf.internal.pageSize.getWidth();
            const imgW     = pw;
            const imgH     = (canvas.height * pw) / canvas.width;

            // Multi-page support
            const ph       = pdf.internal.pageSize.getHeight();
            const margin   = 5;
            const usable   = ph - margin * 2;

            if (imgH <= usable) {
                pdf.addImage(imgData, 'JPEG', 0, margin, imgW, imgH);
            } else {
                const pages = Math.ceil(imgH / usable);
                for (let pg = 0; pg < pages; pg++) {
                    if (pg > 0) pdf.addPage();
                    const yOffset = -(pg * usable) + margin;
                    pdf.addImage(imgData, 'JPEG', 0, yOffset, imgW, imgH);
                    pdf.setFillColor(255, 255, 255);
                    if (pg > 0) pdf.rect(0, 0, pw, margin, 'F');
                    const over = yOffset + imgH - ph + margin;
                    if (over > 0) pdf.rect(0, ph - margin, pw, margin + 1, 'F');
                }
            }

            return pdf.output('blob');
        } finally {
            document.body.removeChild(container);
        }
    }

    // Make it globally accessible for email-service
    window.generateMasterInvoiceBlob = generateMasterInvoiceBlob;

    // ── SEND EMAIL (3 PDFs) — routed through Guardian ────────
    // The actual implementation lives in invoice-automation.js (sendBillingEmailWithValidation).
    // This wrapper keeps backward compatibility with the HTML button onclick.
    window.sendBillingEmail = function () {
        if (window.sendBillingEmailWithValidation) {
            return window.sendBillingEmailWithValidation();
        }
        // Fallback if automation module hasn't loaded yet
        alert('Invoice automation module not loaded. Please refresh the page.');
    };

    // ── ACCOUNT STATEMENT (bulk summary for selected customer) ─
    window.downloadBillingStatement = async function (format, btnElement) {
        // Re-use logic similar to old downloadCustInvoiceSummary
        const table = document.getElementById('billing-center-table');
        if (!table) return;

        const btn = btnElement || (window.event ? window.event.currentTarget : null);
        const originalContent = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        }

        const customerSel  = document.getElementById('bc-f-customer');
        const customerName = customerSel ? customerSel.value || 'All Customers' : 'All Customers';

        const reportContainer = document.createElement('div');
        reportContainer.style.cssText = 'padding:40px;background:white;width:1200px;position:fixed;left:-9999px;top:0;font-family:Arial,sans-serif;';
        document.body.appendChild(reportContainer);

        reportContainer.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1e293b;padding-bottom:20px;margin-bottom:30px;">
                <div>
                    <h1 style="margin:0;color:#1e293b;font-size:2.2rem;font-weight:900;">ACCOUNT STATEMENT</h1>
                    <h3 style="margin:5px 0;color:#475569;text-transform:uppercase;">CUSTOMER: ${customerName}</h3>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0;color:#64748b;font-weight:bold;">Date: ${new Date().toLocaleDateString()}</p>
                    <p style="margin:5px 0;font-weight:900;color:#1e40af;font-size:1.1rem;">RP TULIPAN TRANSPORT INC</p>
                </div>
            </div>
        `;

        const tableClone = table.cloneNode(true);
        tableClone.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.85rem;';

        const headerRow = tableClone.querySelector('thead tr');
        if (headerRow) {
            const ths = headerRow.querySelectorAll('th');
            for (let i = ths.length - 1; i >= 12; i--) {
                if (ths[i]) ths[i].remove();
            }
        }

        tableClone.querySelectorAll('tbody tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            for (let i = tds.length - 1; i >= 12; i--) {
                if (tds[i]) tds[i].remove();
            }
            tr.querySelectorAll('td').forEach(td => {
                td.style.borderBottom = '1px solid #e2e8f0';
                td.style.padding      = '10px';
            });
        });

        reportContainer.appendChild(tableClone);

        let totalPending = 0;
        window.billingRows.forEach(row => {
            const hasTrans  = row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0;
            const hasSales  = row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0;
            const qty       = parseInt(row[53]) || 1;
            if (hasTrans && row[32] === 'PEND') totalPending += (parseFloat(row[18]) || 0);
            if (hasSales && row[33] === 'PEND') totalPending += (parseFloat(row[20]) || 0) * qty;
        });

        const footer = document.createElement('div');
        footer.style.cssText = 'margin-top:40px;text-align:right;border-top:3px solid #1e293b;padding-top:20px;';
        footer.innerHTML = `
            <h2 style="margin:0;color:#1e293b;font-size:1.8rem;font-weight:900;">TOTAL BALANCE DUE: <span style="color:#dc2626;">${fmtMoney(totalPending)}</span></h2>
            <p style="margin-top:15px;font-size:0.9rem;color:#475569;font-style:italic;font-weight:bold;">Please process payment at your earliest convenience. Thank you for your business!</p>
        `;
        reportContainer.appendChild(footer);

        try {
            const canvas = await html2canvas(reportContainer, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

            if (format === 'IMAGE') {
                const url = canvas.toDataURL('image/png');
                const a   = document.createElement('a');
                a.href     = url;
                a.download = `Statement_${customerName.replace(/\s+/g, '_')}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

            } else if (format === 'PDF') {
                const { jsPDF } = window.jspdf;
                const imgData   = canvas.toDataURL('image/jpeg', 0.95);
                const pdf       = new jsPDF('l', 'mm', 'a4');
                const pw = pdf.internal.pageSize.getWidth();
                const ph = pdf.internal.pageSize.getHeight();
                const m  = 10;
                const iw = pw - m * 2;
                const ih = (canvas.height * iw) / canvas.width;
                const up = ph - m * 2;

                if (ih <= up) {
                    pdf.addImage(imgData, 'JPEG', m, m, iw, ih);
                } else {
                    const pages = Math.ceil(ih / up);
                    for (let pg = 0; pg < pages; pg++) {
                        if (pg > 0) pdf.addPage();
                        const yo = m - pg * up;
                        pdf.addImage(imgData, 'JPEG', m, yo, iw, ih);
                        pdf.setFillColor(255, 255, 255);
                        if (pg > 0) pdf.rect(0, 0, pw, m, 'F');
                        const ov = yo + ih - ph + m;
                        if (ov > 0) pdf.rect(0, ph - m, pw, m + 1, 'F');
                    }
                }
                pdf.save(`Statement_${customerName.replace(/\s+/g, '_')}.pdf`);
            }
        } catch (err) {
            console.error('Error generating statement:', err);
            alert('Error generating statement.');
        } finally {
            document.body.removeChild(reportContainer);
            if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
        }
    };

    // ── INIT: called when billing center view is shown ────────
    window.initBillingCenter = async function () {
        if (!window.currentTrips || window.currentTrips.length === 0) {
            if (window.loadTableData) await window.loadTableData();
        }
        window.renderBillingTable();
        // Run the invoice automation engine (banner + auto-send + reminders)
        if (window.runInvoiceAutomation) {
            setTimeout(() => window.runInvoiceAutomation(), 800);
        }
    };

    // Expose renderBillingDetailModal globally so the automation engine
    // can silently populate the invoice preview before generating PDFs
    window.renderBillingDetailModalForRow = function(rows, orderNo) {
        renderBillingDetailModal(rows, orderNo);
    };

    // ── MARK AS PAID DIRECTLY ─────────────────────────────────
    window.markBillingRowAsPaid = async function(globalIdx, btn) {
        const trips = window.currentTrips || [];
        const row = trips[globalIdx];
        if (!row) return;

        const tripId = row[0];
        const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        if (!tripId || !isUUID(tripId)) {
            alert("No se puede marcar como pagado. ID inválido.");
            return;
        }

        const confirmPay = confirm(`¿Marcar la orden ${row[5]} como totalmente PAGADA?`);
        if (!confirmPay) return;

        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const updateData = {
                st_rate: 'PAID',
                st_sales: 'PAID',
                st_yard: 'PAID',
                st_tax: 'PAID',
                paid: true,
                invoice_sent: 'YES'
            };

            await window.updateTrip(tripId, updateData);

            // Update local state
            row[32] = 'PAID'; // st_rate
            row[33] = 'PAID'; // st_sales
            row[30] = 'PAID'; // st_yard
            // NOTE: row[34] (st_amount) is NOT updated here — it belongs to the calendar
            // "amount" field and indicates if that amount was collected in cash, not billing status.
            row[52] = 'PAID'; // st_tax
            row[57] = 'YES'; // invoice_sent

            if (window.allTripsUnfiltered) {
                const ufRow = window.allTripsUnfiltered.find(t => t[0] === tripId);
                if (ufRow) {
                    ufRow[32] = 'PAID';
                    ufRow[33] = 'PAID';
                    ufRow[30] = 'PAID';
                    // NOTE: ufRow[34] (st_amount) is intentionally NOT updated here.
                    ufRow[52] = 'PAID';
                    ufRow[57] = 'YES';
                }
            }

            if (window.showToast) window.showToast('Marcado como pagado exitosamente', 'success');
            else alert('Marcado como pagado exitosamente');
            
            // Re-render billing table
            window.renderBillingTable();
        } catch (err) {
            console.error('Error marking as paid:', err);
            alert('Error al marcar como pagado.');
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    };

    // ── MARK ALL FILTERED AS PAID ─────────────────────────────
    window.markAllFilteredAsPaid = async function(btn) {
        // Find all pending rows in window.billingRows
        const pendingRows = (window.billingRows || []).filter(row => rowHasPendingPayment(row));
        
        if (pendingRows.length === 0) {
            alert('No hay órdenes pendientes en la vista filtrada actual.');
            return;
        }

        const confirmPay = confirm(`¿Estás seguro de marcar las ${pendingRows.length} órdenes filtradas como totalmente PAGADAS?`);
        if (!confirmPay) return;

        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

        try {
            let updatedCount = 0;
            for (const row of pendingRows) {
                const tripId = row[0];
                const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
                if (!tripId || !isUUID(tripId)) {
                    console.warn("Invalid ID skipped:", tripId);
                    continue;
                }

                const updateData = {
                    st_rate: 'PAID',
                    st_sales: 'PAID',
                    st_yard: 'PAID',
                    st_tax: 'PAID',
                    paid: true,
                    invoice_sent: 'YES'
                };

                await window.updateTrip(tripId, updateData);

                // Update local state
                row[32] = 'PAID'; 
                row[33] = 'PAID'; 
                row[30] = 'PAID'; 
                row[52] = 'PAID'; 
                row[57] = 'YES'; 

                if (window.allTripsUnfiltered) {
                    const ufRow = window.allTripsUnfiltered.find(t => t[0] === tripId);
                    if (ufRow) {
                        ufRow[32] = 'PAID';
                        ufRow[33] = 'PAID';
                        ufRow[30] = 'PAID';
                        ufRow[52] = 'PAID';
                        ufRow[57] = 'YES';
                    }
                }
                updatedCount++;
            }

            if (window.showToast) window.showToast(`${updatedCount} órdenes marcadas como pagadas`, 'success');
            else alert(`${updatedCount} órdenes marcadas como pagadas exitosamente`);
            
            // Re-render billing table
            window.renderBillingTable();
        } catch (err) {
            console.error('Error marking bulk as paid:', err);
            alert('Hubo un error al marcar algunas órdenes como pagadas.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    };

})();
