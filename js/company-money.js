// Cómo va la empresa. Reads the same sources as Profit Report without changing that screen.
(function () {
    const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function parseISO(iso) {
        const [y, m, d] = String(iso || '').split('-').map(Number);
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d);
    }

    function toISO(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    function addDays(date, n) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        d.setDate(d.getDate() + n);
        return d;
    }

    function firstMonday(year, monthIndex) {
        const d = new Date(year, monthIndex, 1);
        const day = d.getDay();
        const add = day === 0 ? 1 : (day === 1 ? 0 : 8 - day);
        d.setDate(1 + add);
        return d;
    }

    function workMonthRange(year, monthIndex) {
        const start = firstMonday(year, monthIndex);
        const lastDay = new Date(year, monthIndex + 1, 0);
        let lastMonday = new Date(start);
        const cursor = new Date(start);
        while (cursor <= lastDay) {
            if (cursor.getDay() === 1 && cursor.getMonth() === monthIndex) lastMonday = new Date(cursor);
            cursor.setDate(cursor.getDate() + 1);
        }
        return { start: start, end: addDays(lastMonday, 5) };
    }

    function weekMonSat(isoDate) {
        const d = parseISO(isoDate);
        if (!d) return null;
        const day = d.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const start = addDays(d, mondayOffset);
        return { start: start, end: addDays(start, 5) };
    }

    function eachDay(start, end, skipSunday) {
        const out = [];
        let d = new Date(start);
        while (d <= end) {
            if (!(skipSunday && d.getDay() === 0)) out.push(toISO(d));
            d = addDays(d, 1);
        }
        return out;
    }

    function monthLabel(year, monthIndex) {
        return new Date(year, monthIndex, 1).toLocaleDateString('es', { month: 'short', year: 'numeric' });
    }

    function shortDay(iso) {
        const d = parseISO(iso);
        if (!d) return iso;
        return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    function expenseAmount(row) {
        return parseFloat(String(row[3] || '0').replace(/[$,]/g, '')) || 0;
    }

    function looksGrouped(row) {
        const note = String(row[4] || '');
        const amounts = note.match(/\$\s?\d[\d,]*(?:\.\d{2})?/g) || [];
        if (amounts.length >= 2) return true;
        const dates = note.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g) || [];
        return dates.length >= 2;
    }

    function inRange(date, from, to) {
        if (!date) return false;
        if (from && date < from) return false;
        if (to && date > to) return false;
        return true;
    }

    function emptyTotals() {
        return {
            sales: 0, yard: 0, rentals: 0, tulipan: 0, jr: 0, contractor: 0,
            storageTulipan: 0, storageYard: 0, customInvoices: 0, ledgerIncome: 0,
            expenses: 0, releases: 0, internalSalesHaul: 0,
            byCategory: {}, byLine: {}, groupedCount: 0, groupedAmount: 0
        };
    }

    function buildReleaseMap() {
        if (typeof window.buildReleasePriceMap === 'function') {
            return window.buildReleasePriceMap(window.currentReleases || []);
        }
        const m = new Map();
        (window.currentReleases || []).forEach(r => {
            if (r && r[0]) {
                const rNo = r[0].toString().trim();
                const existing = m.get(rNo) || { p20: 0, p40: 0, p45: 0 };
                m.set(rNo, {
                    p20: (parseFloat(r[8]) || 0) || existing.p20,
                    p40: (parseFloat(r[10]) || 0) || existing.p40,
                    p45: (parseFloat(r[12]) || 0) || existing.p45
                });
            }
        });
        return m;
    }

    function applyTrips(totals, trips, from, to, relMap, tracePool) {
        const normCont = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const yardStockList = (typeof window.getYardStockData === 'function') ? (window.getYardStockData() || []) : [];
        const yardStockConts = new Set(yardStockList.map(item => normCont(item.container_no)).filter(Boolean));
        const yardStockIds = new Set(yardStockList.map(item => String(item.id || '')).filter(Boolean));

        (trips || []).forEach(row => {
            const rowDate = row[1];
            const orderStatus = (row[41] || '').toString().toUpperCase();
            if (orderStatus !== 'COMPLETE' && orderStatus !== 'PAID' && orderStatus !== 'DELIVERED') return;
            if (!inRange(rowDate, from, to)) return;
            const serviceMode = (row[26] || '').toString().toUpperCase();
            if (serviceMode === 'RENTAL INVOICE' || serviceMode === 'YARD INVOICE') return;

            const qty = parseInt(row[53], 10) || 1;
            const salesPrice = parseFloat(row[20]) || 0;
            const rawYard = (row[12] || '').toString().trim().toUpperCase();
            const yardVal = parseFloat(row[13]) || 0;
            const pricePerDay = parseFloat(row[14]) || 0;
            const hasYard = (rawYard && rawYard !== 'NO' && rawYard !== '---') || yardVal > 0 || pricePerDay > 0;
            const rawTrans = (row[42] || '').toString().trim().toUpperCase();
            const transVal = parseFloat(row[18]) || 0;
            const hasTrans = (rawTrans && rawTrans !== 'NO' && rawTrans !== '---') || transVal > 0;
            const rawSales = (row[43] || '').toString().trim().toUpperCase();
            const hasSales = (rawSales && rawSales !== 'NO' && rawSales !== '---') || salesPrice > 0;

            if (hasSales && salesPrice > 0) {
                const unitCost = (typeof window.resolveContainerPurchaseCost === 'function')
                    ? window.resolveContainerPurchaseCost(row, relMap, tracePool).unitCost
                    : 0;
                totals.sales += salesPrice * qty;
                totals.releases += (unitCost || 0) * qty;
            }

            if (hasYard) {
                let storage = 0;
                if (pricePerDay > 0 && row[1] && row[15] && row[15] !== '---') {
                    const dateIn = new Date(row[1]);
                    const dateOut = new Date(row[15]);
                    if (!isNaN(dateIn.getTime()) && !isNaN(dateOut.getTime())) {
                        const days = Math.max(0, Math.round((dateOut - dateIn) / 86400000)) || 0;
                        storage = pricePerDay * days;
                    }
                }
                const orderCont = normCont(row[3]);
                const orderYardId = (row[59] || '').toString();
                const inYardStock = (orderYardId && yardStockIds.has(orderYardId)) || (orderCont && yardStockConts.has(orderCont));
                const storageToAdd = (storage > 0 && inYardStock) ? 0 : storage;
                totals.yard += ((yardVal || 0) + (storageToAdd || 0)) * qty;
            }

            if (hasTrans) {
                const totalTrans = transVal * qty;
                const company = (row[16] || '').toString().toUpperCase();
                if (company === 'RP TULIPAN') totals.tulipan += totalTrans;
                else if (company === 'JR SUPER CRANE') totals.jr += totalTrans;
                else if (company === 'CONTRACTOR') totals.contractor += totalTrans;
                if (window.isInternalCompanyCustomer && window.isInternalCompanyCustomer(row[11])) {
                    totals.internalSalesHaul += totalTrans;
                }
            }
        });
    }

    function applyRentals(totals, invoices, from, to) {
        (invoices || []).forEach(row => {
            const note = (row[25] || '').toString();
            if (/WRITE-?OFF|WAIVED|COMPLIMENTARY/i.test(note)) return;
            const periodStart = (row[28] && row[28] !== '---') ? row[28] : row[1];
            const periodEnd = (row[29] && row[29] !== '---') ? row[29] : periodStart;
            if (from && periodEnd && periodEnd < from) return;
            if (to && periodStart && periodStart > to) return;
            totals.rentals += parseFloat(row[27]) || 0;
        });
    }

    function applyExpenses(totals, expenses, from, to) {
        (expenses || []).forEach(row => {
            if (!inRange(row[0], from, to)) return;
            const amount = expenseAmount(row);
            const category = (row[1] || '').toString().trim();
            if (category === 'Ledger Income') {
                totals.ledgerIncome += amount;
                return;
            }
            totals.expenses += amount;
            const catName = window.normalizeExpenseCategory ? window.normalizeExpenseCategory(category) : (category || 'Other');
            totals.byCategory[catName] = (totals.byCategory[catName] || 0) + amount;
            const rawLine = (row[7] || '').toString().trim();
            const line = rawLine && window.normalizeExpenseProfitLine
                ? (window.normalizeExpenseProfitLine(rawLine) || 'unassigned')
                : (rawLine || 'unassigned');
            if (!totals.byLine[line]) totals.byLine[line] = {};
            totals.byLine[line][catName] = (totals.byLine[line][catName] || 0) + amount;
            if (looksGrouped(row)) {
                totals.groupedCount += 1;
                totals.groupedAmount += amount;
            }
        });
    }

    function applyYard(totals, from, to) {
        if (typeof window.getYardStockData !== 'function' || typeof window.calculateDynamicYardCosts !== 'function') return;
        (window.getYardStockData() || []).forEach(item => {
            if (typeof window.checkYardDateMatch === 'function' && !window.checkYardDateMatch(item, from, to)) return;
            const costs = window.calculateDynamicYardCosts(item, from || null, to || null);
            if ((item.notes || '').includes('[Storage Yard]')) totals.storageYard += costs.totalCost || 0;
            else totals.storageTulipan += costs.totalCost || 0;
        });
    }

    function applyCustom(totals, receipts, from, to) {
        (receipts || []).forEach(r => {
            const fin = window.parseCustomReceiptFinance ? window.parseCustomReceiptFinance(r) : null;
            if (!fin || !fin.include) return;
            if (!inRange((r.date || '').toString(), from, to)) return;
            if (typeof window.applyCustomReceiptToRevenueTotals === 'function') {
                window.applyCustomReceiptToRevenueTotals(totals, fin);
            } else {
                totals.customInvoices += fin.postedAmount || 0;
            }
        });
    }

    function summarize(t) {
        const revenue = t.tulipan + t.jr + t.contractor + t.sales + t.yard + t.rentals + t.storageTulipan + t.storageYard + t.customInvoices + t.ledgerIncome;
        const spent = t.expenses + t.internalSalesHaul;
        const invested = t.releases;
        return {
            revenue: revenue,
            spent: spent,
            invested: invested,
            net: revenue - spent - invested,
            bankSpent: t.expenses,
            internalHaul: t.internalSalesHaul,
            groupedCount: t.groupedCount,
            groupedAmount: t.groupedAmount,
            byCategory: t.byCategory,
            byLine: t.byLine,
            incomes: {
                tulipan: t.tulipan,
                jr: t.jr,
                sales: t.sales,
                yard: t.yard,
                contractor: t.contractor
            },
            leftoverSources: [
                { label: 'Rentals', amount: t.rentals },
                { label: 'Storage Yard', amount: t.storageYard },
                { label: 'Storage RP', amount: t.storageTulipan },
                { label: 'Facturas custom', amount: t.customInvoices },
                { label: 'Ingreso manual', amount: t.ledgerIncome }
            ].filter(s => s.amount > 0)
        };
    }

    function sliceTotals(ctx, from, to) {
        const t = emptyTotals();
        applyTrips(t, ctx.trips, from, to, ctx.relMap, ctx.trips);
        applyRentals(t, ctx.rentals, from, to);
        applyExpenses(t, ctx.expenses, from, to);
        applyYard(t, from, to);
        applyCustom(t, ctx.receipts, from, to);
        return summarize(t);
    }

    function resolveRange() {
        const today = toISO(new Date());
        const fromVal = document.getElementById('cm-from')?.value || today;
        const toVal = document.getElementById('cm-to')?.value || today;
        let start = parseISO(fromVal) || new Date();
        let end = parseISO(toVal) || new Date();
        if (end < start) { const tmp = start; start = end; end = tmp; }
        const days = Math.round((end - start) / 86400000) + 1;
        let grain = 'day';
        if (days > 90) grain = 'month';
        else if (days > 16) grain = 'week';
        return {
            start: start,
            end: end,
            grain: grain,
            label: shortDay(toISO(start)) + ' – ' + shortDay(toISO(end))
        };
    }

    function clipIso(d, lo, hi) {
        const iso = toISO(d);
        if (iso < lo) return lo;
        if (iso > hi) return hi;
        return iso;
    }

    function buildBuckets(range) {
        const lo = toISO(range.start);
        const hi = toISO(range.end);
        if (range.grain === 'month') {
            const buckets = [];
            let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
            while (cursor <= range.end) {
                const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
                buckets.push({
                    label: monthLabel(cursor.getFullYear(), cursor.getMonth()),
                    from: clipIso(cursor, lo, hi),
                    to: clipIso(last, lo, hi)
                });
                cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            }
            return buckets;
        }
        if (range.grain === 'week') {
            const buckets = [];
            const wk = weekMonSat(lo);
            let monday = wk.start;
            while (monday <= range.end) {
                const sat = addDays(monday, 5);
                const from = clipIso(monday, lo, hi);
                const to = clipIso(sat, lo, hi);
                if (from <= to) {
                    buckets.push({
                        label: shortDay(from) + ' – ' + shortDay(to),
                        from: from,
                        to: to
                    });
                }
                monday = addDays(monday, 7);
            }
            return buckets;
        }
        return eachDay(range.start, range.end, false).map(iso => ({
            label: shortDay(iso),
            from: iso,
            to: iso
        }));
    }

    function barColumn(bucket, max) {
        const h = (n) => Math.max(2, Math.round((Math.abs(n) / max) * 160));
        const flag = bucket.groupedCount > 0 ? '<div title="Hay un gasto agrupado en este tramo" style="color:#b45309;font-weight:900;font-size:0.85rem;">!</div>' : '';
        const netColor = bucket.net >= 0 ? '#166534' : '#b91c1c';
        return '<div style="flex:1; min-width:72px; text-align:center;">' +
            flag +
            '<div style="font-size:0.68rem; font-weight:800; color:' + netColor + '; margin-bottom:4px;">' + money(bucket.net) + '</div>' +
            '<div style="display:flex; align-items:flex-end; justify-content:center; gap:3px; height:170px;">' +
            '<div title="Entró ' + money(bucket.revenue) + '" style="width:14px; height:' + h(bucket.revenue) + 'px; background:#16a34a; border-radius:3px 3px 0 0;"></div>' +
            '<div title="Se gastó ' + money(bucket.spent) + '" style="width:14px; height:' + h(bucket.spent) + 'px; background:#dc2626; border-radius:3px 3px 0 0;"></div>' +
            '<div title="Contenedores ' + money(bucket.invested) + '" style="width:14px; height:' + h(bucket.invested) + 'px; background:#d97706; border-radius:3px 3px 0 0;"></div>' +
            '</div>' +
            '<div style="font-size:0.68rem; font-weight:700; color:#334155; margin-top:6px; line-height:1.2;">' + bucket.label + '</div>' +
            '</div>';
    }

    function rankList(items, total, color, note) {
        const rows = items.map(it => {
            const pct = total > 0 ? Math.round((it.amount / total) * 100) : 0;
            return '<div style="margin-bottom:8px;">' +
                '<div style="display:flex; justify-content:space-between; gap:8px; font-size:0.78rem; font-weight:700; color:#1e293b;">' +
                '<span>' + it.label + '</span><span style="white-space:nowrap;">' + money(it.amount) + ' · ' + pct + '%</span></div>' +
                '<div style="height:8px; background:#f1f5f9; border-radius:99px; overflow:hidden;">' +
                '<div style="width:' + Math.min(pct, 100) + '%; height:100%; background:' + color + ';"></div></div></div>';
        }).join('');
        const totalRow = '<div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:0.82rem; font-weight:900; color:#0f172a;">' +
            '<span>Total</span><span>' + money(total) + '</span></div>';
        const noteRow = note
            ? '<p style="margin:8px 0 0; font-size:0.75rem; line-height:1.4; color:#475569;">' + note + '</p>'
            : '';
        if (!items.length) {
            return '<p style="margin:0; color:#94a3b8; font-size:0.85rem;">Nada en este rango.</p>' + totalRow + noteRow;
        }
        return rows + totalRow + noteRow;
    }

    function kpiCard(label, value, hint, color, cornerPercent) {
        const pct = cornerPercent
            ? '<span style="position:absolute; top:12px; right:14px; font-size:0.95rem; font-weight:900; color:' + color + ';">' + cornerPercent + '</span>'
            : '';
        return '<div style="position:relative; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px;">' +
            '<div style="font-size:0.72rem; font-weight:800; letter-spacing:0.04em; color:#64748b; padding-right:56px;">' + label + '</div>' +
            pct +
            '<div style="font-size:1.45rem; font-weight:900; color:' + color + '; margin-top:4px;">' + value + '</div></div>';
    }

    let renderToken = 0;

    window.renderCompanyMoney = async function () {
        const token = ++renderToken;
        const range = resolveRange();
        const label = document.getElementById('cm-range-label');
        if (label) label.textContent = range.label + ' · cargando…';

        if (typeof window.loadExpensesData === 'function') await window.loadExpensesData();
        if (typeof window.loadReleasesData === 'function') await window.loadReleasesData();
        if (typeof window.loadRentalsData === 'function') await window.loadRentalsData();
        if (typeof window.loadYardData === 'function') await window.loadYardData();
        if (typeof window.loadRentalInvoiceTrips === 'function') await window.loadRentalInvoiceTrips(false);

        let trips = [];
        if (typeof window.getAllTripsForProfit === 'function' && typeof window.mapTripToArray === 'function') {
            const raw = await window.getAllTripsForProfit();
            trips = (raw || []).map(window.mapTripToArray);
        }
        if (token !== renderToken) return;

        let receipts = [];
        const db = window.db;
        if (db) {
            try {
                const { data } = await db.from('custom_receipts').select('*');
                receipts = data || [];
            } catch (e) { receipts = []; }
        }

        const rentalInvoices = (window.rentalInvoiceTrips && window.rentalInvoiceTrips.length)
            ? window.rentalInvoiceTrips
            : trips.filter(row => (row[26] || '').toString().toUpperCase() === 'RENTAL INVOICE');

        const ctx = {
            trips: trips,
            rentals: rentalInvoices,
            expenses: window.currentExpenses || [],
            receipts: receipts,
            relMap: buildReleaseMap()
        };

        const from = toISO(range.start);
        const to = toISO(range.end);
        const total = sliceTotals(ctx, from, to);
        const buckets = buildBuckets(range).map(b => Object.assign(b, sliceTotals(ctx, b.from, b.to)));
        if (token !== renderToken) return;

        if (label) label.textContent = range.label + ' · ' + shortDay(from) + ' al ' + shortDay(to);

        const kpis = document.getElementById('cm-kpis');
        if (kpis) {
            const marginPct = total.revenue > 0 ? ((total.net / total.revenue) * 100).toFixed(1) + '%' : '';
            kpis.innerHTML =
                kpiCard('ENTRÓ', money(total.revenue), '', '#166534') +
                kpiCard('SE GASTÓ', money(total.spent), '', '#b91c1c') +
                kpiCard('CONTENEDORES', money(total.invested), '', '#b45309') +
                kpiCard('QUEDÓ', money(total.net), '', total.net >= 0 ? '#166534' : '#b91c1c', marginPct);
        }

        const note = document.getElementById('cm-grouped-note');
        if (note) {
            if (total.groupedCount > 0) {
                note.style.display = 'block';
                note.textContent = total.groupedCount + ' gasto(s) agrupado(s) por ' + money(total.groupedAmount) + ' caen enteros en la fecha de su fila. Ese tramo lleva ! hasta que los partas por día.';
            } else {
                note.style.display = 'none';
            }
        }

        const hint = document.getElementById('cm-chart-hint');
        if (hint) {
            const grain = range.grain === 'month' ? 'Cada barra es un mes.' :
                range.grain === 'week' ? 'Cada grupo es una semana.' :
                    'Cada grupo es un día.';
            hint.textContent = grain + ' El número de arriba es lo que quedó en ese tramo.';
        }

        const chart = document.getElementById('cm-chart');
        if (chart) {
            const max = Math.max(1, ...buckets.map(b => Math.max(b.revenue, b.spent, b.invested)));
            chart.innerHTML = buckets.map(b => barColumn(b, max)).join('');
        }

        const haul = total.internalHaul || 0;
        const leftover = total.leftoverSources || [];
        const leftoverSum = leftover.reduce((s, it) => s + (it.amount || 0), 0);
        const spendEl = document.getElementById('cm-spend-rank');
        if (spendEl) spendEl.innerHTML = spendByProfitLine(total.byLine, haul, total.spent, '', total.incomes, leftover, total.invested || 0);
        const incomeEl = document.getElementById('cm-income-rank');
        if (incomeEl) rankHost(incomeEl, leftover, leftoverSum, '#16a34a', '');
    };

    function lineLabel(id) {
        if (id === 'unassigned') return 'Sin asignar';
        if (window.formatExpenseProfitLineLabel) return window.formatExpenseProfitLineLabel(id);
        return id;
    }

    function spendByProfitLine(byLine, haul, grand, note, incomes, leftover, invested) {
        incomes = incomes || {};
        const inMap = {
            rpt_transportation: [
                { label: 'Transport RP', amount: incomes.tulipan || 0 },
                { label: 'JR Super Crane', amount: incomes.jr || 0 }
            ],
            rpt_sales: [{ label: 'Ventas', amount: incomes.sales || 0 }],
            rpt_yard: [{ label: 'Yard del pedido', amount: incomes.yard || 0 }],
            contractors: [{ label: 'Contractors', amount: incomes.contractor || 0 }]
        };
        const order = (window.EXPENSE_PROFIT_LINES || []).map(l => l.id).concat(['unassigned']);
        const ids = order.filter(id => (byLine[id] && Object.keys(byLine[id]).length) || (inMap[id] && inMap[id].some(r => r.amount > 0)) || (id === 'rpt_sales' && (haul > 0 || (invested || 0) > 0)));
        Object.keys(byLine).forEach(id => { if (!ids.includes(id)) ids.push(id); });
        const pctOf = (n, base) => (base > 0 ? ((n / base) * 100).toFixed(1) : '0');
        const row = (label, valueHtml, extraClass) =>
            '<div class="cm-kv-row' + (extraClass ? ' ' + extraClass : '') + '">' +
            '<span class="cm-kv-label">' + label + '</span>' +
            '<span class="cm-kv-lead" aria-hidden="true"></span>' +
            '<span class="cm-kv-val">' + valueHtml + '</span></div>';
        const box = (bg, fg, inner) =>
            '<div style="background:' + bg + '; color:' + fg + '; border-radius:10px; padding:10px 10px 8px; margin-bottom:8px; overflow:hidden;">' + inner + '</div>';

        let html = '<div style="display:flex; flex-wrap:wrap; gap:12px; align-items:stretch;">';
        ids.forEach(id => {
            const cats = Object.keys(byLine[id] || {}).map(name => ({ label: name, amount: byLine[id][name] }))
                .sort((a, b) => b.amount - a.amount);
            if (id === 'rpt_sales' && haul > 0) cats.push({ label: 'Viajes internos', amount: haul });
            cats.sort((a, b) => b.amount - a.amount);
            const spent = cats.reduce((s, c) => s + c.amount, 0);
            const inRows = inMap[id] || [];
            const entered = inRows.reduce((s, r) => s + r.amount, 0);
            const containerCost = (id === 'rpt_sales') ? (invested || 0) : 0;
            const afterContainers = entered - containerCost;
            const profit = afterContainers - spent;
            let body = '';
            const pctBase = entered > 0 ? entered : spent;
            if (inRows.length) {
                let inHtml = '<div style="font-size:0.78rem; font-weight:900; letter-spacing:0.04em; margin-bottom:6px; color:#ecfdf5;">ENTRÓ</div>';
                if (id !== 'rpt_sales' && id !== 'rpt_yard' && id !== 'contractors') {
                    inRows.forEach(r => {
                        inHtml += row(r.label, money(r.amount) + (entered > 0 ? '<span class="cm-kv-pct">' + pctOf(r.amount, entered) + '%</span>' : ''));
                    });
                }
                if (entered > 0) inHtml += row('Total que entró', money(entered) + '<span class="cm-kv-pct">100%</span>', 'cm-kv-total');
                body += box('#166534', '#ecfdf5', inHtml);
            }
            if (containerCost > 0) {
                body += box('#c2410c', '#fff7ed', row('Inversión en contenedores', money(containerCost)));
            }
            const spentPct = pctBase > 0 ? pctOf(spent, pctBase) + '%' : '';
            let spentHtml = row('SE GASTÓ', money(spent) + (spentPct ? '<span class="cm-kv-pct">' + spentPct + '</span>' : ''), 'cm-kv-total');
            spentHtml += cats.map(c => row(c.label, money(c.amount) + (pctBase > 0 ? '<span class="cm-kv-pct">' + pctOf(c.amount, pctBase) + '%</span>' : '')))
                .join('');
            if (!cats.length) spentHtml += '<p style="margin:0; color:#fecaca; font-size:0.75rem;">Sin gastos en esta línea.</p>';
            body += box('#b91c1c', '#fff', spentHtml);
            if (inRows.length) {
                const ok = profit >= 0;
                const pBg = ok ? '#bbf7d0' : '#fecaca';
                const pFg = ok ? '#14532d' : '#7f1d1d';
                const gPct = entered > 0 ? pctOf(profit, entered) + '%' : '';
                let pHtml = row('GANANCIA', money(profit) + (gPct ? '<span class="cm-kv-pct">' + gPct + '</span>' : ''));
                body += box(pBg, pFg, pHtml);
            }
            html += '<div class="cm-line-card" onclick="window.focusCompanyMoneyCard(this)" style="flex:1 1 200px; min-width:0; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; overflow:hidden;">' +
                '<div style="font-size:0.82rem; font-weight:900; color:#0f172a; margin-bottom:10px;">' + lineLabel(id) + '</div>' +
                body + '</div>';
        });
        html += '</div>';

        const lineSpent = (id) => Object.keys(byLine[id] || {}).reduce((s, k) => s + (byLine[id][k] || 0), 0);
        const profitTransport = (incomes.tulipan || 0) + (incomes.jr || 0) - lineSpent('rpt_transportation');
        const profitSales = (incomes.sales || 0) - (invested || 0) - lineSpent('rpt_sales') - (haul || 0);
        const profitYard = (incomes.yard || 0) - lineSpent('rpt_yard');
        const profitContractors = (incomes.contractor || 0) - lineSpent('contractors');
        const profitsSum = profitTransport + profitSales + profitYard + profitContractors;
        const extraIn = (leftover || []).reduce((s, it) => s + (it.amount || 0), 0);
        const operating = lineSpent('rpt_operating');
        const afterExtras = profitsSum + extraIn;
        const finalNet = afterExtras - operating;
        const finalOk = finalNet >= 0;
        const band = (label, amt, kind) => {
            const styles = {
                plus: { bg: '#bbf7d0', fg: '#14532d' },
                minus: { bg: '#fecaca', fg: '#7f1d1d' },
                orange: { bg: '#ffedd5', fg: '#9a3412' },
                sum: { bg: '#e2e8f0', fg: '#0f172a' }
            };
            const tone = kind === 'orange' ? 'orange' : (kind === 'sum' ? 'sum' : (amt >= 0 && kind !== 'minus' ? 'plus' : 'minus'));
            const s = styles[tone];
            return '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; width:100%; box-sizing:border-box; background:' + s.bg + '; color:' + s.fg + '; border-radius:10px; padding:10px 14px; margin-bottom:8px; font-weight:900;">' +
                '<span>' + label + '</span><span style="white-space:nowrap;">' + money(amt) + '</span></div>';
        };
        html += '<div style="margin-top:16px; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px;">' +
            '<div style="font-size:0.95rem; font-weight:900; color:#0f172a; margin-bottom:8px;">Lo que queda después de Operating</div>' +
            '<p style="margin:0 0 10px; font-size:0.8rem; color:#64748b; line-height:1.4;">Se suman las ganancias de Transport, Sales, Yard y Contractors, más Rentals y Storage. A ese total se le resta Operating. La inversión en contenedores ya se restó dentro de Sales. Los viajes internos ya van dentro de Sales.</p>' +
            band('Ganancia Transport', profitTransport) +
            band('Ganancia Sales', profitSales) +
            band('Ganancia Yard', profitYard) +
            band('Ganancia Contractors', profitContractors) +
            (leftover || []).map(it => band('+ ' + it.label, it.amount)).join('') +
            band('Suma', afterExtras, 'sum') +
            band('− Operating expenses', operating, 'minus') +
            '<div style="margin-top:4px; background:' + (finalOk ? '#86efac' : '#fca5a5') + '; color:' + (finalOk ? '#14532d' : '#7f1d1d') + '; border-radius:10px; padding:14px 16px; display:flex; justify-content:space-between; gap:12px; font-size:1.15rem; font-weight:900;">' +
            '<span>QUEDA</span><span>' + money(finalNet) + '</span></div>' +
            '<p style="margin:8px 0 0; font-size:0.75rem; color:#64748b;">' + money(profitsSum) + ' de ganancias + ' + money(extraIn) + ' de Rentals/Storage − ' + money(operating) + ' de Operating = ' + money(finalNet) + '.</p>' +
            '</div>';

        html += '<div style="display:flex; justify-content:space-between; margin-top:12px; font-size:0.9rem; font-weight:900; color:#0f172a;">' +
            '<span>Total gastado</span><span>' + money(grand) + '</span></div>';
        if (note) html += '<p style="margin:8px 0 0; font-size:0.75rem; line-height:1.4; color:#475569;">' + note + '</p>';
        if (!ids.length && haul <= 0) {
            return '<p style="margin:0; color:#94a3b8; font-size:0.85rem;">Nada en este rango.</p>' + html;
        }
        return html;
    }

    window.focusCompanyMoneyCard = function (el) {
        const overlay = document.getElementById('cm-card-focus');
        const body = document.getElementById('cm-card-focus-body');
        if (!overlay || !body || !el) return;
        body.innerHTML = el.innerHTML;
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };

    window.closeCompanyMoneyCard = function () {
        const overlay = document.getElementById('cm-card-focus');
        if (!overlay) return;
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') window.closeCompanyMoneyCard();
    });

    function rankHost(el, items, total, color, note) {
        el.innerHTML = rankList(items, total, color, note);
    }

    function initDefaults() {
        const now = new Date();
        const today = toISO(now);
        const monthStart = today.slice(0, 8) + '01';
        const fromEl = document.getElementById('cm-from');
        const toEl = document.getElementById('cm-to');
        if (fromEl && !fromEl.value) fromEl.value = monthStart;
        if (toEl && !toEl.value) toEl.value = today;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDefaults);
    else initDefaults();
})();
