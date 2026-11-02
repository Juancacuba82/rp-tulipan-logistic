// Customer AR statement — one PDF of everything a customer still owes.
(function () {
    const money = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtDate(raw) {
        if (!raw || raw === '---' || raw === 'N/A') return '—';
        if (window.formatDateMMDDYYYY) return window.formatDateMMDDYYYY(raw);
        const s = String(raw).split('T')[0];
        const p = s.split('-');
        if (p.length === 3 && p[0].length === 4) return p[1] + '/' + p[2] + '/' + p[0];
        return s;
    }

    function invoiceBalance(inv) {
        return (parseFloat(inv.total_amount) || 0) - (parseFloat(inv.amount_paid) || 0);
    }

    function isOpenReceivable(inv) {
        if (!inv) return false;
        const st = (inv.status || '').toString().toLowerCase();
        if (st === 'paid' || st === 'written off' || st === 'written-off') return false;
        if ((inv.payment_method || '').toString().toUpperCase() === 'WRITE-OFF') return false;
        return invoiceBalance(inv) > 0.01;
    }

    function customerPendingInvoices(customerName) {
        const want = (customerName || '').toString().trim().toUpperCase();
        const list = (window.receivablesData && window.receivablesData.invoices) || [];
        return list.filter(inv => {
            const name = (inv.customer_name || '').toString().trim().toUpperCase();
            return name === want && isOpenReceivable(inv);
        }).sort((a, b) => String(a.date_generated || '').localeCompare(String(b.date_generated || '')));
    }

    function kindLabel(inv) {
        const svc = (inv.service_type || '').toString().toUpperCase();
        const no = (inv.invoice_number || '').toString().toUpperCase();
        if (svc.includes('YARD') || no.startsWith('YRD-') || no.startsWith('YARD-')) return 'Yard storage';
        if (svc.includes('RENT') || no.startsWith('RENT-')) return 'Rental';
        if (svc.includes('SALE') || no.startsWith('SALE')) return 'Sales';
        if (svc.includes('TRANS') || no.startsWith('TRANS-')) return 'Transportation';
        if (no.startsWith('AS-')) return 'Combined services';
        const clean = svc.replace(/\|COMPANY:[^|]*/gi, '').split('|GROUP:')[0].trim();
        return clean || 'Invoice';
    }

    function findRow(tid) {
        const id = String(tid);
        const pools = [
            window.currentTrips,
            window.combinedBillingTrips,
            window.allTripsUnfiltered,
            window.yardInvoiceTrips,
            window.rentalInvoiceTrips
        ];
        for (const pool of pools) {
            if (!pool) continue;
            const hit = pool.find(r => r && String(r[0]) === id);
            if (hit) return hit;
        }
        return null;
    }

    async function loadTripRows(inv) {
        const ids = (inv.trip_ids || '').split(',').map(s => s.trim()).filter(id =>
            id && !id.startsWith('RENTAL_ID:') && !id.startsWith('VIRTUAL_RENTAL_')
        );
        const rows = [];
        const missing = [];
        ids.forEach(id => {
            const row = findRow(id);
            if (row) rows.push(row);
            else missing.push(id);
        });
        if (missing.length && window.db) {
            try {
                const { data } = await window.db.from('trips').select('*').in('trip_id', missing);
                (data || []).forEach(t => {
                    const row = typeof window.mapTripToArray === 'function' ? window.mapTripToArray(t) : null;
                    if (row) rows.push(row);
                });
            } catch (e) {
                console.warn('[Statement] Could not load trips', e);
            }
        }
        return rows;
    }

    function parseSnap(row) {
        let raw = row && row[12];
        if (!raw || raw === '---') return null;
        if (typeof raw === 'object') return raw;
        if (typeof raw === 'string' && raw.trim().startsWith('{')) {
            try { return JSON.parse(raw); } catch (e) { return null; }
        }
        return null;
    }

    function yardDetailHtml(rows) {
        const snap = rows.map(parseSnap).find(s => s && (s.items || s.dateFrom));
        if (!snap) return '';
        const period = (typeof window.formatYardStatementPeriod === 'function' && snap.dateFrom && snap.dateTo)
            ? window.formatYardStatementPeriod(snap.dateFrom, snap.dateTo)
            : ((snap.dateFrom || '') + (snap.dateTo ? ' → ' + snap.dateTo : ''));
        const items = snap.items || [];
        if (!items.length) {
            return period ? `<p style="margin:6px 0 0;font-size:11px;color:#334155;">Period: <strong>${esc(period)}</strong></p>` : '';
        }
        let h = period ? `<p style="margin:6px 0 8px;font-size:11px;color:#334155;">Billing period: <strong>${esc(period)}</strong> (1st through 1st; last day is not charged)</p>` : '';
        h += `<table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:4px;">
            <thead><tr style="background:#f8fafc;color:#475569;">
                <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:left;">Container</th>
                <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:left;">Size</th>
                <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:right;">This invoice</th>
            </tr></thead><tbody>`;
        items.forEach(it => {
            h += `<tr>
                <td style="border:1px solid #e2e8f0;padding:4px 6px;">${esc(it.container_no || '—')}</td>
                <td style="border:1px solid #e2e8f0;padding:4px 6px;">${esc(it.size || '—')}</td>
                <td style="border:1px solid #e2e8f0;padding:4px 6px;text-align:right;">${money(it.item_total)}</td>
            </tr>`;
        });
        h += '</tbody></table>';
        return h;
    }

    function tripServiceLines(row, inv) {
        const lines = [];
        const svc = (inv.service_type || '').toString().toUpperCase();
        const wantAll = !svc || svc.includes('ALL') || svc.startsWith('AS');
        const trans = parseFloat(row[18]) || 0;
        const sales = parseFloat(row[20]) || 0;
        const yard = parseFloat(row[13]) || 0;
        const rent = parseFloat(row[27]) || 0;
        const extras = typeof window.transExtrasTotal === 'function' ? window.transExtrasTotal(row) : 0;
        if ((wantAll || svc.includes('TRANS') || svc.includes('RATE')) && trans > 0) lines.push(['Transportation', trans]);
        if ((wantAll || svc.includes('EXTRA')) && extras > 0) lines.push(['Extra services', extras]);
        if ((wantAll || svc.includes('SALE')) && sales > 0) lines.push(['Sales', sales]);
        if ((wantAll || svc.includes('YARD') || svc.includes('STORAGE')) && yard > 0) lines.push(['Yard / storage', yard]);
        if ((wantAll || svc.includes('RENT')) && rent > 0) lines.push(['Rent', rent]);
        if (!lines.length && (trans + sales + yard + rent + extras) > 0) {
            if (trans) lines.push(['Transportation', trans]);
            if (extras) lines.push(['Extra services', extras]);
            if (sales) lines.push(['Sales', sales]);
            if (yard) lines.push(['Yard / storage', yard]);
            if (rent) lines.push(['Rent', rent]);
        }
        return lines;
    }

    function transportDetailHtml(rows, inv) {
        if (!rows.length) {
            const sub = typeof getReceivableSubtitle === 'function' ? '' : '';
            return sub ? `<p style="margin:6px 0 0;font-size:11px;">${esc(sub)}</p>` : '';
        }
        let h = `<table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:6px;">
            <thead><tr style="background:#f8fafc;color:#475569;">
                <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:left;">Date</th>
                <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:left;">Order</th>
                <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:left;">Container</th>
                <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:left;">Service</th>
                <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:right;">Amount</th>
            </tr></thead><tbody>`;
        rows.forEach(row => {
            const lines = tripServiceLines(row, inv);
            const date = fmtDate(row[1]);
            const order = row[5] && row[5] !== '---' ? row[5] : '—';
            const cont = row[3] && row[3] !== '---' ? row[3] : '—';
            if (!lines.length) {
                h += `<tr>
                    <td style="border:1px solid #e2e8f0;padding:4px 6px;">${esc(date)}</td>
                    <td style="border:1px solid #e2e8f0;padding:4px 6px;">${esc(order)}</td>
                    <td style="border:1px solid #e2e8f0;padding:4px 6px;">${esc(cont)}</td>
                    <td style="border:1px solid #e2e8f0;padding:4px 6px;">Services</td>
                    <td style="border:1px solid #e2e8f0;padding:4px 6px;text-align:right;">—</td>
                </tr>`;
                return;
            }
            lines.forEach((ln, i) => {
                h += `<tr>
                    <td style="border:1px solid #e2e8f0;padding:4px 6px;">${i === 0 ? esc(date) : ''}</td>
                    <td style="border:1px solid #e2e8f0;padding:4px 6px;">${i === 0 ? esc(order) : ''}</td>
                    <td style="border:1px solid #e2e8f0;padding:4px 6px;">${i === 0 ? esc(cont) : ''}</td>
                    <td style="border:1px solid #e2e8f0;padding:4px 6px;">${esc(ln[0])}</td>
                    <td style="border:1px solid #e2e8f0;padding:4px 6px;text-align:right;">${money(ln[1])}</td>
                </tr>`;
            });
        });
        h += '</tbody></table>';
        return h;
    }

    async function invoiceDetailHtml(inv, rows) {
        if (kindLabel(inv) === 'Yard storage') return yardDetailHtml(rows);
        return transportDetailHtml(rows, inv);
    }

    async function lookupEmail(customerName) {
        const want = (customerName || '').toString().trim().toUpperCase();
        const lists = [window.currentCustomers, window.yardCustomersList];
        for (const list of lists) {
            if (!Array.isArray(list)) continue;
            const hit = list.find(c => (c.name || '').toString().trim().toUpperCase() === want);
            const email = ((hit && hit.email) || '').toString().trim();
            if (email.includes('@')) return email;
        }
        if (!window.db) return '';
        try {
            const { data } = await window.db.from('customers').select('name, email')
                .eq('name', customerName).or('is_deleted.eq.false,is_deleted.is.null').limit(5);
            const email = ((data && data[0] && data[0].email) || '').toString().trim();
            if (email.includes('@')) return email;
            const { data: all } = await window.db.from('customers').select('name, email')
                .or('is_deleted.eq.false,is_deleted.is.null');
            const hit = (all || []).find(c => (c.name || '').toString().trim().toUpperCase() === want);
            const em = ((hit && hit.email) || '').toString().trim();
            return em.includes('@') ? em : '';
        } catch (e) {
            return '';
        }
    }

    function invKey(inv) {
        return String(inv.id || inv.invoice_number || '');
    }

    async function prepareInvoicePacks(invoices) {
        const packs = [];
        for (const inv of invoices) {
            const rows = await loadTripRows(inv);
            packs.push({
                inv,
                key: invKey(inv),
                bal: invoiceBalance(inv),
                detail: await invoiceDetailHtml(inv, rows)
            });
        }
        return packs;
    }

    function selectedPacks(packs, root) {
        const boxes = root ? root.querySelectorAll('.ar-stmt-inc') : [];
        const on = new Set();
        boxes.forEach(cb => { if (cb.checked) on.add(cb.getAttribute('data-key')); });
        if (!boxes.length) return packs;
        return packs.filter(p => on.has(p.key));
    }

    function buildStatementHtml(packs, opts) {
        const interactive = !!(opts && opts.interactive);
        const grand = packs.reduce((s, p) => s + p.bal, 0);
        const today = fmtDate(new Date().toISOString());
        const incCell = (p) => interactive
            ? `<th style="border:1px solid #cbd5e1;padding:6px 8px;text-align:center;width:36px;">Inc</th>`
            : '';
        const incTd = (p) => interactive
            ? `<td style="border:1px solid #e2e8f0;padding:6px 8px;text-align:center;">
                    <input type="checkbox" class="ar-stmt-inc" data-key="${esc(p.key)}" checked style="width:16px;height:16px;cursor:pointer;">
               </td>`
            : '';
        const incCol = interactive ? 6 : 5;

        const blocks = packs.map(p => `
                <div class="ar-stmt-block" data-key="${esc(p.key)}" style="margin:0 0 18px;page-break-inside:avoid;">
                    <table style="width:100%;border-collapse:collapse;font-size:11px;">
                        <tr style="background:#0f172a;color:#fff;">
                            ${interactive ? `<td style="padding:8px 10px;width:36px;text-align:center;"><input type="checkbox" class="ar-stmt-inc" data-key="${esc(p.key)}" checked style="width:16px;height:16px;cursor:pointer;"></td>` : ''}
                            <td style="padding:8px 10px;font-weight:800;">${esc(p.inv.invoice_number || '—')}</td>
                            <td style="padding:8px 10px;">${esc(kindLabel(p.inv))}</td>
                            <td style="padding:8px 10px;">${esc(fmtDate(p.inv.date_generated))}</td>
                            <td style="padding:8px 10px;text-align:right;">Balance ${money(p.bal)}</td>
                        </tr>
                    </table>
                    <div style="padding:8px 4px 0;font-size:11px;color:#64748b;">
                        Invoice total ${money(p.inv.total_amount)} · Paid ${money(p.inv.amount_paid)} · Still due ${money(p.bal)}
                    </div>
                    ${p.detail}
                </div>
            `);

        return {
            total: grand,
            html: `
            <div style="font-family:Arial,sans-serif;color:#0f172a;">
                <p style="margin:0 0 4px;font-size:12px;color:#64748b;">This is a statement of open invoices, not a new invoice. Each item below is already on file.</p>
                <p style="margin:0 0 16px;font-size:12px;">Statement date: <strong>${esc(today)}</strong> · Included invoices: <strong class="ar-stmt-count">${packs.length}</strong></p>
                ${interactive ? '<p style="margin:-8px 0 14px;font-size:11px;color:#64748b;">Uncheck any invoice you do not want to send. All are included by default.</p>' : ''}
                <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px;">
                    <thead>
                        <tr style="background:#f1f5f9;color:#334155;">
                            ${interactive ? '<th style="border:1px solid #cbd5e1;padding:6px 8px;text-align:center;width:36px;">Inc</th>' : ''}
                            <th style="border:1px solid #cbd5e1;padding:6px 8px;text-align:left;">Invoice #</th>
                            <th style="border:1px solid #cbd5e1;padding:6px 8px;text-align:left;">Type</th>
                            <th style="border:1px solid #cbd5e1;padding:6px 8px;text-align:left;">Date</th>
                            <th style="border:1px solid #cbd5e1;padding:6px 8px;text-align:right;">Total</th>
                            <th style="border:1px solid #cbd5e1;padding:6px 8px;text-align:right;">Paid</th>
                            <th style="border:1px solid #cbd5e1;padding:6px 8px;text-align:right;">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${packs.map(p => `<tr class="ar-stmt-sum-row" data-key="${esc(p.key)}">
                            ${incTd(p)}
                            <td style="border:1px solid #e2e8f0;padding:6px 8px;font-weight:700;">${esc(p.inv.invoice_number || '—')}</td>
                            <td style="border:1px solid #e2e8f0;padding:6px 8px;">${esc(kindLabel(p.inv))}</td>
                            <td style="border:1px solid #e2e8f0;padding:6px 8px;">${esc(fmtDate(p.inv.date_generated))}</td>
                            <td style="border:1px solid #e2e8f0;padding:6px 8px;text-align:right;">${money(p.inv.total_amount)}</td>
                            <td style="border:1px solid #e2e8f0;padding:6px 8px;text-align:right;color:#15803d;">${money(p.inv.amount_paid)}</td>
                            <td style="border:1px solid #e2e8f0;padding:6px 8px;text-align:right;color:#b91c1c;font-weight:800;">${money(p.bal)}</td>
                        </tr>`).join('')}
                        <tr style="background:#0f172a;color:#fff;font-weight:900;">
                            <td colspan="${incCol}" style="padding:8px 10px;text-align:right;">AMOUNT DUE</td>
                            <td class="ar-stmt-due" style="padding:8px 10px;text-align:right;">${money(grand)}</td>
                        </tr>
                    </tbody>
                </table>
                <h3 style="margin:0 0 10px;font-size:13px;letter-spacing:0.04em;">DETAIL BY INVOICE</h3>
                ${blocks.join('')}
            </div>`
        };
    }

    function syncStatementChecks(root, packs, sourceCb) {
        if (!root) return;
        const state = {};
        if (sourceCb && sourceCb.getAttribute) {
            state[sourceCb.getAttribute('data-key')] = !!sourceCb.checked;
        }
        root.querySelectorAll('.ar-stmt-inc').forEach(cb => {
            const key = cb.getAttribute('data-key');
            if (state[key] == null) state[key] = cb.checked;
        });
        root.querySelectorAll('.ar-stmt-inc').forEach(cb => {
            const key = cb.getAttribute('data-key');
            cb.checked = !!state[key];
        });
        const chosen = selectedPacks(packs, root);
        const due = chosen.reduce((s, p) => s + p.bal, 0);
        const dueEl = root.querySelector('.ar-stmt-due');
        const countEl = root.querySelector('.ar-stmt-count');
        if (dueEl) dueEl.textContent = money(due);
        if (countEl) countEl.textContent = String(chosen.length);
        packs.forEach(p => {
            const on = chosen.some(c => c.key === p.key);
            root.querySelectorAll(`[data-key="${p.key}"]`).forEach(el => {
                if (el.classList && el.classList.contains('ar-stmt-inc')) return;
                el.style.opacity = on ? '1' : '0.4';
            });
        });
    }

    function ensureModal() {
        let modal = document.getElementById('ar-statement-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'ar-statement-modal';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.45);align-items:center;justify-content:center;padding:24px;';
        modal.innerHTML = `
            <div style="background:#fff;width:min(980px,100%);max-height:92vh;border-radius:14px;display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,0.25);">
                <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:12px;">
                    <div>
                        <div style="font-size:0.75rem;font-weight:800;color:#64748b;letter-spacing:0.06em;">STATEMENT OF ACCOUNT</div>
                        <div id="ar-stmt-title" style="font-size:1.15rem;font-weight:900;color:#0f172a;"></div>
                    </div>
                    <button type="button" id="ar-stmt-close" style="border:none;background:#f1f5f9;width:36px;height:36px;border-radius:8px;cursor:pointer;font-size:1.2rem;">&times;</button>
                </div>
                <div id="ar-stmt-body" style="flex:1;overflow:auto;padding:20px;background:#f8fafc;"></div>
                <div style="padding:14px 20px;border-top:1px solid #e2e8f0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <label style="font-size:0.75rem;font-weight:800;color:#64748b;">SEND TO</label>
                    <input id="ar-stmt-email" type="text" style="flex:1;min-width:220px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-weight:700;">
                    <button type="button" id="ar-stmt-cancel" style="padding:10px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-weight:800;cursor:pointer;">CANCEL</button>
                    <button type="button" id="ar-stmt-send" class="glossy-blue-btn" style="padding:10px 18px;"><i class="fas fa-paper-plane"></i> SEND STATEMENT</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const hide = () => { modal.style.display = 'none'; };
        modal.querySelector('#ar-stmt-close').onclick = hide;
        modal.querySelector('#ar-stmt-cancel').onclick = hide;
        modal.addEventListener('click', (e) => { if (e.target === modal) hide(); });
        return modal;
    }

    window.openCustomerArStatement = async function (customerName) {
        const name = (customerName || '').toString().trim();
        if (!name) return;
        const invoices = customerPendingInvoices(name);
        if (!invoices.length) {
            alert('This customer has no open invoices.');
            return;
        }
        const modal = ensureModal();
        modal.style.display = 'flex';
        document.getElementById('ar-stmt-title').textContent = name;
        document.getElementById('ar-stmt-body').innerHTML = '<p style="color:#64748b;font-weight:700;">Building statement…</p>';
        document.getElementById('ar-stmt-email').value = await lookupEmail(name);

        const packs = await prepareInvoicePacks(invoices);
        const preview = buildStatementHtml(packs, { interactive: true });
        const body = document.getElementById('ar-stmt-body');
        body.innerHTML = preview.html;
        modal._stmt = { name, packs };
        body.onchange = function (e) {
            if (!e.target || !e.target.classList.contains('ar-stmt-inc')) return;
            syncStatementChecks(body, packs, e.target);
        };

        const sendBtn = document.getElementById('ar-stmt-send');
        sendBtn.onclick = async function () {
            const email = (document.getElementById('ar-stmt-email').value || '').trim();
            if (!email || !email.includes('@')) {
                alert('Enter a valid email.');
                return;
            }
            const chosen = selectedPacks(packs, body);
            if (!chosen.length) {
                alert('Select at least one invoice to include.');
                return;
            }
            const finalDoc = buildStatementHtml(chosen, { interactive: false });
            const orig = sendBtn.innerHTML;
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SENDING...';
            try {
                if (typeof window.sendYardStatementEmail === 'function') {
                    const ok = await window.sendYardStatementEmail(
                        name,
                        finalDoc.html,
                        finalDoc.total,
                        '',
                        '',
                        email
                    );
                    if (!ok) throw new Error('EmailJS is not configured.');
                } else {
                    throw new Error('Email sender is not loaded.');
                }
                if (window.showToast) window.showToast('Statement sent to ' + email, 'success');
                else alert('Statement sent to ' + email);
                modal.style.display = 'none';
            } catch (err) {
                alert('Could not send statement: ' + (err.text || err.message || err));
            } finally {
                sendBtn.disabled = false;
                sendBtn.innerHTML = orig;
            }
        };
    };
})();
