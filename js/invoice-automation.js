// ============================================================
// invoice-automation.js — Invoice Guardian & Reminder Engine
// Handles:
//   1. validateInvoiceReadiness(row) — the "Guardián"
//   2. Incomplete-order alert banner on Billing & Invoices load
//   3. Auto-send on order status → COMPLETE (checked on page load)
//   4. Weekly reminder check (runs once per session on load)
//   5. Manual send that resets the 7-day clock
// ============================================================

(function () {

    // ── CONSTANTS ─────────────────────────────────────────────
    const REMINDER_DAYS = 7;     // days between automatic reminders
    const MIN_PHOTOS    = 4;     // minimum driver photos required

    // ── ROW INDEX MAP ─────────────────────────────────────────
    // row[41]  status
    // row[54]  signature (client)
    // row[55]  photos array
    // row[56]  signature_driver
    // row[57]  invoice_sent
    // row[63]  invoice_last_sent  (ISO date string or null)
    // row[64]  invoice_reminder_count (integer)

    // ── GUARDIAN: VALIDATE INVOICE READINESS ─────────────────
    /**
     * Checks whether an order has all required data to send its invoice.
     * Returns { ok: true } or { ok: false, reasons: [string] }
     */
    window.validateInvoiceReadiness = function (row) {
        const reasons = [];

        // 1. Photos: need at least MIN_PHOTOS
        const photos = row[55];
        const photoCount = Array.isArray(photos) ? photos.length : 0;
        if (photoCount < MIN_PHOTOS) {
            reasons.push(`Only ${photoCount} photo(s) uploaded (minimum ${MIN_PHOTOS} required)`);
        }

        // 2. Client signature
        const clientSig = row[54];
        if (!clientSig || clientSig === '' || clientSig === null) {
            reasons.push('Missing client signature');
        }

        // 3. Driver signature
        const driverSig = row[56];
        if (!driverSig || driverSig === '' || driverSig === null) {
            reasons.push('Missing driver signature');
        }

        // 4. Customer email
        const email = row[36];
        if (!email || email === '---' || email === '') {
            reasons.push('Customer has no email registered');
        }

        if (reasons.length > 0) {
            return { ok: false, reasons };
        }
        return { ok: true, reasons: [] };
    };

    // ── INCOMPLETE ORDERS ALERT BANNER ───────────────────────
    /**
     * Scans all COMPLETE/DELIVERED/PAID orders for validation issues.
     * Renders (or updates) the alert banner in the billing view.
     */
    window.renderIncompleteOrdersBanner = function () {
        const existing = document.getElementById('invoice-incomplete-banner');
        if (existing) existing.remove();

        // Use billingRows to respect the current table filters, fallback to currentTrips
        const trips = (typeof window.billingRows !== 'undefined') ? window.billingRows : (window.currentTrips || []);
        const incomplete = [];

        trips.forEach(row => {
            const status = (row[41] || '').toUpperCase();
            const isReady = status === 'COMPLETE' || status === 'DELIVERED' || status === 'PAID';
            if (!isReady) return;

            // Only flag orders that still have a pending payment (invoice not fully collected)
            const hasPending = rowHasPendingPaymentLocal(row);
            if (!hasPending) return;

            const validation = window.validateInvoiceReadiness(row);
            if (!validation.ok) {
                incomplete.push({ row, reasons: validation.reasons });
            }
        });

        if (incomplete.length === 0) return;  // nothing to flag

        const container = document.getElementById('billing-center-view');
        if (!container) return;

        // Build the banner HTML
        const banner = document.createElement('div');
        banner.id = 'invoice-incomplete-banner';
        banner.style.cssText = `
            background: linear-gradient(135deg, #fff7ed, #fef3c7);
            border: 2px solid #f59e0b;
            border-radius: 12px;
            padding: 16px 20px;
            margin: 0 20px 20px;
            position: relative;
            animation: bannerSlideIn 0.4s ease;
        `;

        // Build list items
        const listItems = incomplete.map(({ row, reasons }) => {
            const orderNo = (row[5] || 'N/A').toString().toUpperCase();
            const customer = row[11] || 'Unknown customer';
            const reasonText = reasons.join(' · ');
            return `
                <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #fde68a;">
                    <span style="background:#f59e0b;color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:900;flex-shrink:0;margin-top:2px;">!</span>
                    <div>
                        <span style="font-weight:900;color:#92400e;font-size:0.82rem;">ORDER #${orderNo}</span>
                        <span style="color:#78350f;font-size:0.78rem;"> — ${customer}</span>
                        <div style="color:#b45309;font-size:0.72rem;margin-top:2px;font-style:italic;">${reasonText}</div>
                    </div>
                </div>
            `;
        }).join('');

        banner.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <i class="fas fa-exclamation-triangle" style="color:#d97706;font-size:1.2rem;"></i>
                    <div>
                        <span style="font-weight:900;color:#92400e;font-size:0.9rem;">
                            ${incomplete.length} order${incomplete.length > 1 ? 's' : ''} cannot be invoiced — incomplete data
                        </span>
                        <div style="color:#78350f;font-size:0.72rem;margin-top:2px;">
                            These orders are complete but missing required data. Invoices will not be sent (manually or automatically) until resolved.
                        </div>
                    </div>
                </div>
                <button onclick="document.getElementById('invoice-incomplete-banner').remove()"
                    style="background:transparent;border:none;cursor:pointer;color:#92400e;font-size:1.1rem;padding:4px 8px;border-radius:6px;transition:background 0.2s;"
                    onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'"
                    title="Dismiss">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="max-height:200px;overflow-y:auto;">
                ${listItems}
            </div>
            <style>
                @keyframes bannerSlideIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            </style>
        `;

        // Insert the banner right at the top of the billing view content
        const innerDiv = container.querySelector('div');
        if (innerDiv) {
            const firstChild = innerDiv.firstChild;
            innerDiv.insertBefore(banner, firstChild ? firstChild.nextSibling : null);
        }
    };

    // ── AUTO-SEND: New COMPLETE orders that haven't been invoiced ─────
    /**
     * Finds orders that just became COMPLETE and have never had an invoice sent.
     * Sends the first invoice automatically (if validation passes).
     * Runs once per session when billing view loads.
     */
    window.autoSendNewCompleteInvoices = async function () {
        const trips = window.currentTrips || [];
        const toSend = [];

        trips.forEach(row => {
            const status = (row[41] || '').toUpperCase();
            const isComplete = status === 'COMPLETE' || status === 'DELIVERED';
            const invoiceSent = (row[57] || 'NO').toUpperCase();
            const lastSentDate = row[63];

            // Only auto-send if: status is COMPLETE, invoice never sent, and no last-sent date
            if (!isComplete) return;
            if (invoiceSent === 'YES') return;
            if (lastSentDate && lastSentDate !== '' && lastSentDate !== null) return;

            const hasPending = rowHasPendingPaymentLocal(row);
            if (!hasPending) return;

            const validation = window.validateInvoiceReadiness(row);
            if (!validation.ok) return;  // Guardian blocks it

            toSend.push(row);
        });

        if (toSend.length === 0) return;

        console.log(`[AutoInvoice] ${toSend.length} new complete order(s) eligible for first invoice send.`);

        for (const row of toSend) {
            try {
                await sendInvoiceForRow(row, 'auto-first');
                console.log(`[AutoInvoice] ✅ First invoice sent for order ${row[5]}`);
                // Small delay between sends to avoid rate limits
                await new Promise(r => setTimeout(r, 1500));
            } catch (err) {
                console.warn(`[AutoInvoice] ⚠️ Could not auto-send invoice for order ${row[5]}:`, err);
            }
        }
    };



    // ── CORE SEND + TRACK ─────────────────────────────────────
    /**
     * Sends the 3-PDF invoice package and updates tracking columns in Supabase.
     * @param {Array}  row  - trip data row
     */
    async function sendInvoiceForRow(row, mode = 'manual', numPDFs = 3) {
        if (!window.sendThreePDFEmail) throw new Error('Email service not loaded');

        const tripId = row[0];
        const isUUID = str => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        if (!tripId || !isUUID(tripId)) throw new Error('Invalid trip ID');

        // Capture AR info BEFORE any async operations that might close the modal
        const invoiceNoToSave = window.currentMasterInvoiceNo;
        const totalNumToSave = parseFloat((document.getElementById('mb-total')?.textContent || '0').replace(/[^0-9.-]+/g,"")) || 0;
        const detailsHtmlToSave = document.getElementById('mb-services-container')?.innerHTML || '';
        const svcFilterToSave = document.getElementById('bc-f-service')?.value || '';

        // Open the billing detail modal silently (needed by generateMasterInvoiceBlob)
        // We render off-screen so we can capture the invoice PDF
        await prepareInvoicePreviewForRow(row);

        // Send the requested number of PDFs
        await window.sendThreePDFEmail([row], numPDFs);

        // Update tracking fields
        const now = new Date().toISOString();
        const currentCount = parseInt(row[64]) || 0;
        const newCount = currentCount + 1;

        const incTrans   = document.getElementById('mb-svc-transport')?.checked ?? true;
        const incRent    = document.getElementById('mb-svc-rent')?.checked ?? true;
        const incSales   = document.getElementById('mb-svc-sales')?.checked ?? true;
        const incStorage = document.getElementById('mb-svc-storage')?.checked ?? true;
        const incYard    = document.getElementById('mb-svc-yard')?.checked ?? true;

        let invoiced = row[75] ? row[75].split(',') : [];
        
        if (incTrans && row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0) invoiced.push('TRANSPORT');
        if (incYard && (parseFloat(row[13]) || 0) > 0) invoiced.push('YARD');
        if (incSales && row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0) invoiced.push('SALES');
        if (incRent && (parseFloat(row[27]) || 0) > 0) invoiced.push('RENT');
        if (incStorage && (parseFloat(row[14]) || 0) > 0) invoiced.push('STORAGE');
        
        invoiced = [...new Set(invoiced)].filter(Boolean);
        const newInvoicedServices = invoiced.join(',');

        const updateData = {
            invoice_sent: 'YES',
            invoice_last_sent: now,
            invoice_reminder_count: newCount,
            invoiced_services: newInvoicedServices
        };

        try {
            await db.from('trips').update(updateData).eq('trip_id', tripId);

            // Sync local cache
            row[57] = 'YES';
            row[63] = now;
            row[64] = newCount;
            row[75] = newInvoicedServices;

            const ufRow = (window.allTripsUnfiltered || []).find(t => t[0] === tripId);
            if (ufRow) {
                ufRow[57] = 'YES';
                ufRow[63] = now;
                ufRow[64] = newCount;
                ufRow[75] = newInvoicedServices;
            }
        } catch (err) {
            console.warn('[AutoInvoice] Could not update tracking fields:', err);
        }

        if (window.renderBillingTable) window.renderBillingTable();

        // ── Push to Accounts Receivable ───────────────────────────
        if (window.addInvoiceToReceivables && invoiceNoToSave) {
            window.addInvoiceToReceivables(row[11] || 'Customer', invoiceNoToSave, totalNumToSave, detailsHtmlToSave, [row[0]], svcFilterToSave);
        }
    }

    /**
     * Silently renders the invoice preview so generateMasterInvoiceBlob() can capture it.
     * We use the billing-manager's own render function but don't open the modal.
     */
    async function prepareInvoicePreviewForRow(row) {
        // Use the existing renderBillingDetailModal by setting global state
        // then calling the internal render path
        window.currentBillingOrderRows = [row];

        // Call the render function that populates #bm-invoice-preview
        if (window.renderBillingDetailModalForRow) {
            window.renderBillingDetailModalForRow([row], row[5]);
        } else if (window.openBillingDetail) {
            // Find the global index
            const globalIdx = (window.currentTrips || []).indexOf(row);
            if (globalIdx >= 0) {
                // Temporarily suppress modal open
                const modal = document.getElementById('billing-detail-modal');
                const wasDisplay = modal ? modal.style.display : '';
                // Call to populate the preview content without showing modal
                const origStyle = document.body.style.overflow;
                window.openBillingDetail(globalIdx);
                // Immediately hide modal again if it opened
                if (modal) modal.style.display = 'none';
                document.body.style.overflow = origStyle;
            }
        }

        // Small wait for DOM to settle
        await new Promise(r => setTimeout(r, 300));
    }

    // ── MANUAL SEND (overrides billing-manager's sendBillingEmail) ────
    /**
     * Wraps the existing sendBillingEmail to add validation + clock reset.
     * Called from the SEND EMAIL button inside the detail modal.
     */
    window.sendBillingEmailWithValidation = async function (externalBtn = null, numPDFs = 3) {
        const rows = window.currentBillingOrderRows;
        if (!rows || rows.length === 0) return;

        const btn = externalBtn || event?.currentTarget;
        const row = rows[0];

        //  YARD STOCK BIFURCATION
        if (row.isYardRecord) {
            const customerEmail = document.getElementById('bd-email')?.value || '';
            if (!customerEmail || !customerEmail.includes('@')) {
                alert('Please enter a valid email address in the detail window.');
                return;
            }
            if (!confirm(`Send Yard Stock invoice to ${customerEmail}?`)) return;
            
            const orig = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }
            
            try {
                if (row.isYardAggregate) {
                    const agg = row.yardAggregateData;
                    const d1 = agg.periodStart.toISOString().split('T')[0];
                    const d2 = agg.periodEnd.toISOString().split('T')[0];
                    const serviceId = localStorage.getItem('ejs_yard_service_id') || localStorage.getItem('ejs_service_id');
                    const templateId = localStorage.getItem('ejs_yard_template_id') || localStorage.getItem('ejs_template_id');
                    const publicKey = localStorage.getItem('ejs_public_key');
                    emailjs.init(publicKey);
                    const { html, total } = window.generateYardInvoiceHTML(agg.items, d1, d2, false, null);
                    const b64Pdf = await window.generateYardInvoiceBase64(html, agg.customer_name);
                    const templateParams = {
                        to_email: customerEmail,
                        customer_name: agg.customer_name,
                        invoice_html: "",
                        grand_total: total.toFixed(2),
                        attachment_b64: b64Pdf.split(',')[1]
                    };
                    await emailjs.send(serviceId, templateId, templateParams);
                } else {
                    const yardItems = rows.map(r => r.yardItem);
                    const customerName = yardItems[0].customer_name || 'Customer';
                    await window.sendSpecificYardInvoiceEmail(yardItems, customerName, customerEmail);
                }
                
                if (window.showToast) window.showToast('Yard invoice sent successfully!', 'success');
                else alert('Yard invoice sent successfully!');
            } catch(e) {
                console.error(e);
                alert('Error sending Yard invoice: ' + (e.message || 'Check console.'));
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = orig; }
            }
            return;
        }

        // ── 1. Run the Guardian ──────────────────────────────
        // If there are multiple rows being sent at once (e.g., from Booking or Service invoice), process them together
        const isMasterInvoice = rows.length > 1;
        
        if (isMasterInvoice) {
            await executeMasterInvoiceSendProcess(rows, btn, numPDFs);
            return;
        }

        const validation = window.validateInvoiceReadiness(row);
        if (!validation.ok) {
            const force = await showValidationBlockModal(row, validation.reasons);
            if (force) {
                await executeManualSendProcess(row, btn, numPDFs);
            } else {
                if (btn) {
                    btn.disabled = false;
                    const isMaster = btn.id === 'mb-btn-send-email';
                    btn.innerHTML = isMaster ? '<i class="fas fa-paper-plane"></i> SEND EMAIL (3 PDFS)' : '<i class="fas fa-paper-plane"></i> ENVIAR INVOICE';
                }
            }
            return;
        }

        await executeManualSendProcess(row, btn, numPDFs);
    };

    async function executeMasterInvoiceSendProcess(rows, btn, numPDFs = 3) {
        let customerEmail = document.getElementById('bd-email')?.value || rows[0][36] || '';
        if (!customerEmail || !customerEmail.includes('@')) {
            alert('Please enter a valid email address in the detail window.');
            return;
        }
        
        // Find if they all share the same booking number
        const firstBooking = (rows[0][65] || '---').toString().trim().toUpperCase();
        const allSameBooking = firstBooking !== '---' && rows.every(r => (r[65] || '---').toString().trim().toUpperCase() === firstBooking);
        const masterTitle = allSameBooking ? `BOOKING ${firstBooking}` : 'MASTER INVOICE';
        
        // Check for duplicate containers
        const seenContainers = new Set();
        const duplicateContainers = new Set();
        
        rows.forEach(r => {
            const containerNo = (r[3] || '').toString().trim().toUpperCase();
            if (containerNo && containerNo !== '---') {
                if (seenContainers.has(containerNo)) {
                    duplicateContainers.add(containerNo);
                } else {
                    seenContainers.add(containerNo);
                }
            }
        });
        
        if (duplicateContainers.size > 0) {
            const dups = Array.from(duplicateContainers).join(', ');
            const confirmDup = confirm(`¡Atención! Hemos detectado contenedores duplicados en este grupo: ${dups}.\n\n¿Estás seguro de que deseas enviar la factura de todos modos a ${customerEmail}?`);
            if (!confirmDup) {
                const testEmail = prompt("Envío cancelado. Si deseas enviar una prueba, ingresa el correo destino aquí (o déjalo en blanco para abortar):", customerEmail);
                if (!testEmail || !testEmail.includes('@')) return;
                customerEmail = testEmail.trim();
            }
        } else {
            if (!confirm(`Send ${masterTitle} package to ${customerEmail}?`)) {
                const testEmail = prompt("Envío cancelado. Si deseas enviar una prueba, ingresa el correo destino aquí (o déjalo en blanco para abortar):", customerEmail);
                if (!testEmail || !testEmail.includes('@')) return;
                customerEmail = testEmail.trim();
            }
        }


        try {

            // 1. Master Invoice PDF
            let b64Pdf = "";
            let invoiceBlob = null;
            if (numPDFs !== 4) {
                if (!window.generateMasterInvoiceBlob) throw new Error('Master invoice generator not found');
                invoiceBlob = await window.generateMasterInvoiceBlob();
                if (!invoiceBlob) throw new Error('Failed to generate PDF');

                const reader = new FileReader();
                const b64Promise = new Promise(resolve => {
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(invoiceBlob);
                });
                b64Pdf = await b64Promise;
            }
            
            const serviceId = localStorage.getItem('ejs_service_id') || 'service_pwwi83e';
            const templateId = localStorage.getItem('ejs_invoice_template_id') || localStorage.getItem('ejs_template_id') || 'template_v8a5z0d';
            const publicKey = localStorage.getItem('ejs_public_key') || 'yIom8YvRj8_jD3W7r';
            
            // Calculate grand total from the modal display
            const gtDisplay = document.getElementById('mb-total');
            const grandTotalStr = gtDisplay ? gtDisplay.textContent : '0.00';
            
            emailjs.init(publicKey);
            
            // 2. Receipt PDF
            let base64Recibo = "";
            if (numPDFs >= 2 && window.htmlToPDFBlob && window.getTripReceiptContent) {
                const selectedCompany = (document.getElementById('mb-billing-company-select')?.value || 'RP TULIPAN TRANSPORT INC');
                const companyOverrideOpts = { companyOverride: selectedCompany };
                let combinedReceiptHtml = '';
                for (let i = 0; i < rows.length; i++) {
                    if (i > 0) combinedReceiptHtml += '<div style="height: 40px; background: #f1f5f9; margin: 40px 0; border-top: 2px dashed #94a3b8; border-bottom: 2px dashed #94a3b8; text-align: center; line-height: 40px; font-weight: bold; color: #64748b; font-family: sans-serif;">--- NEXT CONTAINER ---</div>';
                    combinedReceiptHtml += window.getTripReceiptContent(rows[i], { excludePhotos: true, ...companyOverrideOpts });
                }
                const receiptBlob = await window.htmlToPDFBlob(combinedReceiptHtml, 'p');
                if (receiptBlob) {
                    const rReader = new FileReader();
                    base64Recibo = await new Promise(resolve => {
                        rReader.onloadend = () => resolve(rReader.result.split(',')[1]);
                        rReader.readAsDataURL(receiptBlob);
                    });
                }
            }

            // 3. Photos PDF
            let base64Fotos = "";
            if (numPDFs >= 3 && window.generateNativePhotosPDFBlob) {
                const selectedCompany = (document.getElementById('mb-billing-company-select')?.value || 'RP TULIPAN TRANSPORT INC');
                const companyOverrideOpts = { companyOverride: selectedCompany };
                const photosBlob = await window.generateNativePhotosPDFBlob(rows, companyOverrideOpts);
                if (photosBlob) {
                    const pReader = new FileReader();
                    base64Fotos = await new Promise(resolve => {
                        pReader.onloadend = () => resolve(pReader.result.split(',')[1]);
                        pReader.readAsDataURL(photosBlob);
                    });
                }
            }
            
            const templateParams = {
                to_email: customerEmail,
                customer_name: rows[0][11] || 'Customer',
                order_number: masterTitle,
                grand_total: grandTotalStr,
                adjunto_invoice: b64Pdf, // For newer templates
                adjunto_recibo: base64Recibo,
                adjunto_fotos: base64Fotos
            };
            
            await emailjs.send(serviceId, templateId, templateParams, publicKey);
            
            if (window.addInvoiceToReceivables) {
                const totalNum = parseFloat(grandTotalStr.replace(/[^0-9.-]+/g,"")) || 0;
                const detailsHtml = document.getElementById('mb-services-container')?.innerHTML || '';
                const masterTripIds = rows.map(r => r[0]).filter(Boolean);
                const svcFilter = document.getElementById('bc-f-service')?.value || '';
                window.addInvoiceToReceivables(templateParams.customer_name, window.currentMasterInvoiceNo || masterTitle, totalNum, detailsHtml, masterTripIds, svcFilter);
            }

            // Update tracking for all rows
            const nowIso = new Date().toISOString();
            const incTrans   = document.getElementById('mb-svc-transport')?.checked ?? true;
            const incRent    = document.getElementById('mb-svc-rent')?.checked ?? true;
            const incSales   = document.getElementById('mb-svc-sales')?.checked ?? true;
            const incStorage = document.getElementById('mb-svc-storage')?.checked ?? true;
            const incYard    = document.getElementById('mb-svc-yard')?.checked ?? true;
            
            for (const row of rows) {
                const tripId = row[0];
                if (tripId && !tripId.startsWith('VIRTUAL_RENTAL_')) {
                    const currentCount = parseInt(row[64]) || 0;
                    const newCount = currentCount + 1;
                    
                    let invoiced = row[75] ? row[75].split(',') : [];
                    
                    if (incTrans && row[42] === 'YES' && (parseFloat(row[18]) || 0) > 0) invoiced.push('TRANSPORT');
                    if (incYard && (parseFloat(row[13]) || 0) > 0) invoiced.push('YARD');
                    if (incSales && row[43] === 'YES' && (parseFloat(row[20]) || 0) > 0) invoiced.push('SALES');
                    if (incRent && (parseFloat(row[27]) || 0) > 0) invoiced.push('RENT');
                    if (incStorage && (parseFloat(row[14]) || 0) > 0) invoiced.push('STORAGE');
                    
                    invoiced = [...new Set(invoiced)].filter(Boolean);
                    const newInvoicedServices = invoiced.join(',');
                    
                    await window.db.from('trips').update({
                        invoice_sent: 'YES',
                        invoice_last_sent: nowIso,
                        invoice_reminder_count: newCount,
                        invoiced_services: newInvoicedServices
                    }).eq('trip_id', tripId);
                    
                    row[57] = 'YES';
                    row[63] = nowIso;
                    row[64] = newCount;
                    row[75] = newInvoicedServices;
                    
                    if (window.allTripsUnfiltered) {
                        const ufRow = window.allTripsUnfiltered.find(t => t[0] === tripId);
                        if (ufRow) {
                            ufRow[57] = 'YES';
                            ufRow[63] = nowIso;
                            ufRow[64] = newCount;
                            ufRow[75] = newInvoicedServices;
                        }
                    }
                }
            }

            if (typeof window.renderBillingTable === 'function') window.renderBillingTable();
            if (window.showToast) window.showToast('✅ Master Invoice sent & tracking updated!', 'success');
            else alert(`Master Invoice sent to ${customerEmail}!`);

        } catch (e) {
            console.error('Master Invoice send error:', e);
            const errMsg = e.text || e.message || JSON.stringify(e);
            alert('Error sending master invoice: ' + errMsg);
            throw e; // Re-throw so the caller's finally can restore the button
        }
    }

    async function executeManualSendProcess(row, btn, numPDFs = 3) {
        // ── 2. Confirm send ──────────────────────────────────
        const customerEmail = row[36];
        const orderNo = (row[5] || 'N/A').toString();
        const lastSentDate = row[63];
        const reminderCount = parseInt(row[64]) || 0;
        let lastSentText = '—';
        if (lastSentDate) {
            const daysSince = Math.floor((Date.now() - new Date(lastSentDate)) / 86400000);
            lastSentText = daysSince === 0 ? 'Today' : `${daysSince}d ago`;
            if (reminderCount > 1) lastSentText += ` (×${reminderCount})`;
        }

        let confirmMsg = `Send 3-document invoice package to ${customerEmail} for Order #${orderNo}?`;
        if (lastSentDate) {
            confirmMsg += `\n\n🔔 Previous sends: ${reminderCount}  |  Last sent: ${lastSentText}`;
        }
        
        let targetEmail = customerEmail;
        if (!confirm(confirmMsg)) {
            const testEmail = prompt("Envío cancelado. Si deseas enviar una prueba, ingresa el correo destino aquí (o déjalo en blanco para abortar):", customerEmail);
            if (!testEmail || !testEmail.includes('@')) return;
            targetEmail = testEmail.trim();
        }

        const originalEmail = row[36];
        row[36] = targetEmail;

        try {
            await sendInvoiceForRow(row, 'manual', numPDFs);
            
            if (window.showToast) window.showToast('✅ Invoice sent & tracking updated!', 'success');
            else alert(`Invoice package sent to ${customerEmail}!`);
        } catch (e) {
            console.error('Manual send error:', e);
            const errMsg = e.text || e.message || JSON.stringify(e);
            alert('Error sending invoice: ' + errMsg);
            throw e; // Re-throw so caller's finally restores the button
        } finally {
            row[36] = originalEmail;
        }
    }

    // ── VALIDATION BLOCK MODAL ────────────────────────────────
    function showValidationBlockModal(row, reasons) {
        return new Promise((resolve) => {
            // Remove old if exists
            const old = document.getElementById('invoice-blocked-modal');
            if (old) old.remove();

            const orderNo = (row[5] || '').toString().toUpperCase();
            const reasonItems = reasons.map(r =>
                `<li style="padding:6px 0;border-bottom:1px solid #fde68a;color:#92400e;font-size:0.85rem;">
                    <i class="fas fa-exclamation-circle" style="color:#f59e0b;margin-right:8px;"></i>${r}
                </li>`
            ).join('');

            const modal = document.createElement('div');
            modal.id = 'invoice-blocked-modal';
            modal.style.cssText = `
                position: fixed; inset: 0; background: rgba(15,23,42,0.7);
                z-index: 99999; display: flex; align-items: center; justify-content: center;
                animation: fadeIn 0.2s ease;
            `;

            // Expose callbacks globally so the buttons can call them
            window.__forceSendInvoiceCallback = () => {
                modal.remove();
                resolve(true);
            };
            window.__cancelInvoiceCallback = () => {
                modal.remove();
                resolve(false);
            };

            modal.innerHTML = `
            <div style="background:white;border-radius:16px;max-width:500px;width:90%;padding:0;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.4);">
                <div style="background:linear-gradient(135deg,#d97706,#b45309);padding:20px 25px;display:flex;align-items:center;gap:12px;">
                    <i class="fas fa-exclamation-triangle" style="color:white;font-size:1.5rem;"></i>
                    <div>
                        <div style="color:white;font-weight:900;font-size:1rem;">Incomplete Data — Order #${orderNo}</div>
                        <div style="color:rgba(255,255,255,0.8);font-size:0.75rem;margin-top:2px;">This order is missing data required for automatic sending.</div>
                    </div>
                </div>
                <div style="padding:20px 25px;">
                    <div style="font-size:0.85rem;color:#475569;margin-bottom:12px;">You can force send it manually, but note the following missing items:</div>
                    <ul style="list-style:none;padding:0;margin:0;">
                        ${reasonItems}
                    </ul>
                </div>
                <div style="padding:15px 25px 20px;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #f1f5f9;">
                    <button onclick="window.__cancelInvoiceCallback()"
                        style="background:#f1f5f9;color:#334155;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.85rem;">
                        Cancel
                    </button>
                    <button onclick="window.__forceSendInvoiceCallback()"
                        style="background:#dc2626;color:white;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.85rem;box-shadow:0 4px 12px rgba(220,38,38,0.2);">
                        <i class="fas fa-paper-plane"></i> Force Send Anyway
                    </button>
                </div>
            </div>
            <style>@keyframes fadeIn { from{opacity:0} to{opacity:1} }</style>
        `;

        // Close on backdrop click
        modal.addEventListener('click', e => { if (e.target === modal) window.__cancelInvoiceCallback(); });
        document.body.appendChild(modal);
        });
    }

    // ── VALIDATION STATUS BADGE HELPER ───────────────────────
    /**
     * Returns an HTML badge string indicating the validation status of a row.
     * Used by billing-manager.js when rendering the table.
     */
    window.getInvoiceValidationBadge = function (row) {
        const validation = window.validateInvoiceReadiness(row);
        if (validation.ok) {
            return `<span title="All data complete — ready to invoice"
                style="background:#dcfce7;color:#15803d;padding:2px 7px;border-radius:10px;font-size:0.62rem;font-weight:800;white-space:nowrap;">
                ✓ READY
            </span>`;
        } else {
            const tip = validation.reasons.join('\n');
            return `<span title="${tip.replace(/"/g, '&quot;')}"
                style="background:#fff7ed;color:#c2410c;padding:2px 7px;border-radius:10px;font-size:0.62rem;font-weight:800;white-space:nowrap;cursor:help;border:1px solid #fed7aa;">
                ⚠ INCOMPLETE
            </span>`;
        }
    };

    // ── LOCAL HELPER (mirrors billing-manager's rowHasPendingPayment) ─
    function rowHasPendingPaymentLocal(row) {
        const hasTrans = row[42] === 'YES';
        const hasSales = row[43] === 'YES';
        const yardRate = parseFloat(row[13]) || 0;
        const takeTax  = row[49] === true || row[49] === 'true' || row[49] === 'YES' || row[49] === 'on' || row[49] === 1;
        if (hasTrans && row[32] !== 'PAID') return true;
        if (hasSales && row[33] !== 'PAID') return true;
        if (yardRate > 0.01 && row[30] !== 'PAID') return true;
        if (takeTax  && row[52] !== 'PAID') return true;
        return false;
    }

    // ── SESSION-ONCE FLAG ─────────────────────────────────────
    // Prevents running auto-checks more than once per session
    let _autoCheckDone = false;

    /**
     * Entry point called by initBillingCenter (hooked below).
     * Runs the banner + auto-send + reminder check.
     */
    window.runInvoiceAutomation = async function () {
        // Always refresh the banner
        window.renderIncompleteOrdersBanner();

        // Only run auto-send & reminders once per session
        if (_autoCheckDone) return;
        _autoCheckDone = true;

        // Check EmailJS config first — if not set, skip silent sends
        const serviceId = localStorage.getItem('ejs_service_id');
        const publicKey  = localStorage.getItem('ejs_public_key');
        if (!serviceId || !publicKey) {
            console.log('[AutoInvoice] EmailJS not configured — skipping auto-sends.');
            return;
        }

        // ── Desactivado: El primer envío ahora siempre debe ser manual ──
        // try {
        //     await window.autoSendNewCompleteInvoices();
        // } catch (err) {
        //     console.warn('[AutoInvoice] autoSendNewCompleteInvoices error:', err);
        // }


    };

})();
