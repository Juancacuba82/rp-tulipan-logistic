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

    // ── WEEKLY REMINDER CHECK ─────────────────────────────────
    /**
     * Finds orders that are still unpaid, had an invoice sent, but it's been ≥7 days.
     * Re-sends the invoice as a reminder.
     * Runs once per session when billing view loads.
     */
    window.checkAndSendInvoiceReminders = async function () {
        const trips = window.currentTrips || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const toRemind = [];

        trips.forEach(row => {
            const status = (row[41] || '').toUpperCase();
            const isReady = status === 'COMPLETE' || status === 'DELIVERED';
            if (!isReady) return;

            const hasPending = rowHasPendingPaymentLocal(row);
            if (!hasPending) return;  // already paid, skip

            const lastSentDate = row[63];
            if (!lastSentDate) return;  // never sent, handled by autoSend above

            // Calculate days since last send
            const last = new Date(lastSentDate);
            last.setHours(0, 0, 0, 0);
            const daysSince = Math.floor((today - last) / (1000 * 60 * 60 * 24));

            if (daysSince < REMINDER_DAYS) return;  // not yet time

            const validation = window.validateInvoiceReadiness(row);
            if (!validation.ok) return;  // Guardian blocks it

            toRemind.push({ row, daysSince });
        });

        if (toRemind.length === 0) {
            console.log('[AutoInvoice] No reminders due today.');
            return;
        }

        console.log(`[AutoInvoice] ${toRemind.length} reminder(s) due.`);

        for (const { row, daysSince } of toRemind) {
            try {
                await sendInvoiceForRow(row, 'auto-reminder');
                console.log(`[AutoInvoice] ✅ Reminder sent for order ${row[5]} (${daysSince} days since last)`);
                await new Promise(r => setTimeout(r, 1500));
            } catch (err) {
                console.warn(`[AutoInvoice] ⚠️ Could not send reminder for order ${row[5]}:`, err);
            }
        }
    };

    // ── CORE SEND + TRACK ─────────────────────────────────────
    /**
     * Sends the 3-PDF invoice package and updates tracking columns in Supabase.
     * @param {Array}  row  - trip data row
     * @param {string} mode - 'auto-first' | 'auto-reminder' | 'manual'
     */
    async function sendInvoiceForRow(row, mode = 'manual') {
        if (!window.sendThreePDFEmail) throw new Error('Email service not loaded');

        const tripId = row[0];
        const isUUID = str => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        if (!tripId || !isUUID(tripId)) throw new Error('Invalid trip ID');

        // Open the billing detail modal silently (needed by generateMasterInvoiceBlob)
        // We render off-screen so we can capture the invoice PDF
        await prepareInvoicePreviewForRow(row);

        // Send the 3 PDFs
        await window.sendThreePDFEmail([row]);

        // Update tracking fields
        const now = new Date().toISOString();
        const currentCount = parseInt(row[64]) || 0;
        const newCount = currentCount + 1;

        const updateData = {
            invoice_sent: 'YES',
            invoice_last_sent: now,
            invoice_reminder_count: newCount
        };

        try {
            await db.from('trips').update(updateData).eq('trip_id', tripId);

            // Sync local cache
            row[57] = 'YES';
            row[63] = now;
            row[64] = newCount;

            const ufRow = (window.allTripsUnfiltered || []).find(t => t[0] === tripId);
            if (ufRow) {
                ufRow[57] = 'YES';
                ufRow[63] = now;
                ufRow[64] = newCount;
            }
        } catch (err) {
            console.warn('[AutoInvoice] Could not update tracking fields:', err);
        }

        if (window.renderBillingTable) window.renderBillingTable();
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
    window.sendBillingEmailWithValidation = async function () {
        const rows = window.currentBillingOrderRows;
        if (!rows || rows.length === 0) return;

        const btn = event?.currentTarget;
        const row = rows[0];

        // ── 1. Run the Guardian ──────────────────────────────
        const validation = window.validateInvoiceReadiness(row);
        if (!validation.ok) {
            showValidationBlockModal(row, validation.reasons, () => {
                executeManualSendProcess(row, btn);
            });
            return;
        }

        executeManualSendProcess(row, btn);
    };

    async function executeManualSendProcess(row, btn) {
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
            confirmMsg += `\n\n📋 Previous sends: ${reminderCount}  |  Last sent: ${lastSentText}`;
            confirmMsg += `\n\nSending now will reset the 7-day automatic reminder clock.`;
        }
        if (!confirm(confirmMsg)) return;

        // ── 3. Get the button that triggered the event ───────
        const orig = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }

        try {
            await sendInvoiceForRow(row, 'manual');
            if (window.showToast) window.showToast('✅ Invoice sent & tracking updated!', 'success');
            else alert(`Invoice package sent to ${customerEmail}!`);
        } catch (e) {
            console.error('Manual send error:', e);
            alert('Error sending invoice: ' + (e.message || e));
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = orig; }
        }
    }

    // ── VALIDATION BLOCK MODAL ────────────────────────────────
    function showValidationBlockModal(row, reasons, onForceSend) {
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

        // Expose callback globally so the button can call it
        window.__forceSendInvoiceCallback = () => {
            modal.remove();
            if (onForceSend) onForceSend();
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
                    <button onclick="document.getElementById('invoice-blocked-modal').remove()"
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
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
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

        try {
            await window.autoSendNewCompleteInvoices();
        } catch (err) {
            console.warn('[AutoInvoice] autoSendNewCompleteInvoices error:', err);
        }

        try {
            await window.checkAndSendInvoiceReminders();
        } catch (err) {
            console.warn('[AutoInvoice] checkAndSendInvoiceReminders error:', err);
        }
    };

})();
