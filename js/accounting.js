// =============================================================================
// accounting.js — Módulo de Contabilidad y Flujo de Caja
// RP TULIPAN LOGISTIC
// =============================================================================
// Este archivo es 100% independiente. No modifica ningún código existente.
// Solo expone:
//   - window.logCashTransaction(data) → API pasiva llamada por otros módulos
//   - window.loadAccountingData()     → Carga datos al abrir la vista
// =============================================================================

(function () {
    'use strict';

    // --- ESTADO INTERNO DEL MÓDULO ---
    let allTransactions = [];
    let currentFilter = 'all'; // 'all' | 'cash' | 'bank'
    let isLoading = false;
    let tablePage = 0;
    let filterTimer = null;
    let lastLoadMeta = { trips: 0, expenses: 0, releases: 0, ledger: 0, invoices: 0, rows: 0 };
    const TABLE_PAGE_SIZE = 400;
    const FETCH_PAGE_SIZE = 1000;

    async function fetchAllPaged(makeQuery) {
        const all = [];
        let from = 0;
        let lastError = null;
        while (from < 200000) {
            const to = from + FETCH_PAGE_SIZE - 1;
            const { data, error } = await makeQuery().range(from, to);
            if (error) {
                lastError = error;
                break;
            }
            const rows = data || [];
            all.push(...rows);
            if (rows.length < FETCH_PAGE_SIZE) break;
            from += FETCH_PAGE_SIZE;
        }
        return { data: all, error: all.length ? null : lastError };
    }

    // Helper para extraer nombre de la entidad (chofer, cliente, etc.) de los gastos
    function extractEntityFromExpense(expense) {
        if (expense.category === 'Driver Payment' && expense.description) {
            let s = expense.description.replace(/Liquidaci[oó]n de\s+/i, '');
            return s.split(' - ')[0].trim();
        }
        if (expense.category === 'Ledger Income' || expense.category === 'Ledger Expense') {
            const match = (expense.note || '').match(/\[Entidad:\s*([^\]]+)\]/i);
            if (match) return match[1].trim();
        }
        return '';
    }

    function normalizeLedgerToken(value) {
        return (value || '').toString().trim().toUpperCase().replace(/\s+/g, ' ');
    }

    function extractOrderToken(t) {
        const blob = [t.order_no, t.release_no, t.referencia].filter(Boolean).join(' ');
        const m = normalizeLedgerToken(blob).match(/\b((?:ORD|REL|INV)[-\s]?\d+)\b/);
        if (m) return m[1].replace(/\s+/g, '');
        return normalizeLedgerToken(t.order_no || t.release_no || '');
    }

    function extractServiceToken(desc) {
        const d = normalizeLedgerToken(desc);
        if (/\bVENTA\b|\bSALES?\b/.test(d)) return 'SALES';
        if (/TRANSPORTE|TRANSPORT/.test(d)) return 'TRANS';
        if (/YARDA|\bYARD\b|STORAGE|\bSTOR\b/.test(d)) return 'YARD';
        if (/RELEASE/.test(d)) return 'RELEASE';
        if (/PAYMENT FOR INVOICE/.test(d)) return 'INVOICE';
        return d;
    }

    function isOrderLinkedTx(t) {
        return !!(extractOrderToken(t) || normalizeLedgerToken(t.n_cont));
    }

    function ledgerDupKey(t) {
        const amt = (parseFloat(t.monto) || 0).toFixed(2);
        const order = extractOrderToken(t);
        const cont = normalizeLedgerToken(t.n_cont);
        const service = extractServiceToken(t.descripcion);
        const cust = normalizeLedgerToken(t.customer || t.cliente);
        const tipo = normalizeLedgerToken(t.tipo);
        const metodo = (t.metodo === 'driver_wallet') ? 'CASH' : normalizeLedgerToken(t.metodo);
        const chofer = normalizeLedgerToken(t.chofer);
        const entity = normalizeLedgerToken(t.chofer || t.customer || t.cliente || t.category);
        if (!order && !cont) {
            return [tipo, metodo, amt, service, entity, normalizeLedgerToken(t.descripcion), normalizeLedgerToken(t.referencia)].join('|');
        }
        return [tipo, metodo, amt, order, cont, service, cust].join('|');
    }

    function ledgerRowId(t, idx) {
        return [t.id || '', t.source_table || '', t.created_at || '', t.monto || '', idx].join('::');
    }

    function ledgerTxDate(t) {
        const raw = t.created_at || t.date || '';
        if (!raw) return null;
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }

    function daysBetweenDates(a, b) {
        const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
        const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
        return Math.abs(da - db) / 86400000;
    }

    // Recurring payroll/rent across weeks or months is normal.
    // WEEKLY/MONTHLY: only the same calendar day is suspicious (double save).
    const EXPENSE_DUP_WINDOW_DAYS = 6;

    function isRecurringLedgerTx(t) {
        const d = normalizeLedgerToken((t.descripcion || '') + ' ' + (t.referencia || '') + ' ' + (t.category || ''));
        return /WEEKLY|SEMANAL|\bWEEKS?\b|MONTHLY|MENSUAL|\bMONTH\b|PAYROLL|NOMINA|SALARY|\bRENTA\b|\bRENTS?\b|YARD RENT/.test(d);
    }

    function dupWindowDaysFor(t) {
        return isRecurringLedgerTx(t) ? 0 : EXPENSE_DUP_WINDOW_DAYS;
    }

    function findLedgerDuplicates(transactions) {
        const groups = {};
        (transactions || []).forEach((t, idx) => {
            const key = ledgerDupKey(t);
            if (!groups[key]) groups[key] = [];
            groups[key].push({ t, idx, id: ledgerRowId(t, idx), date: ledgerTxDate(t) });
        });

        const dupIds = new Set();
        let extraMoney = 0;
        let dupRows = 0;
        let groupCount = 0;

        Object.keys(groups).forEach(key => {
            const items = groups[key];
            if (items.length < 2) return;

            const linked = isOrderLinkedTx(items[0].t);
            const suspect = new Set();

            if (linked) {
                items.forEach((_, i) => suspect.add(i));
            } else {
                for (let i = 0; i < items.length; i++) {
                    for (let j = i + 1; j < items.length; j++) {
                        if (!items[i].date || !items[j].date) continue;
                        const windowDays = Math.min(dupWindowDaysFor(items[i].t), dupWindowDaysFor(items[j].t));
                        if (daysBetweenDates(items[i].date, items[j].date) <= windowDays) {
                            suspect.add(i);
                            suspect.add(j);
                        }
                    }
                }
            }

            if (suspect.size < 2) return;
            groupCount++;
            const amt = parseFloat(items[0].t.monto) || 0;
            extraMoney += amt * (suspect.size - 1);
            dupRows += suspect.size;
            suspect.forEach(i => dupIds.add(items[i].id));
        });

        return { dupIds, extraMoney, dupRows, groupCount };
    }

    function isSuspiciousLedgerMatch(probe, existing) {
        if (ledgerDupKey(probe) !== ledgerDupKey(existing)) return false;
        if (isOrderLinkedTx(probe) || isOrderLinkedTx(existing)) return true;
        const d1 = ledgerTxDate(probe) || new Date();
        const d2 = ledgerTxDate(existing);
        if (!d2) return false;
        const windowDays = Math.min(dupWindowDaysFor(probe), dupWindowDaysFor(existing));
        return daysBetweenDates(d1, d2) <= windowDays;
    }

    function renderLedgerDupBanner(stats) {
        const banner = document.getElementById('acct-dup-banner');
        if (!banner) return;
        if (!stats || stats.groupCount === 0) {
            banner.style.display = 'none';
            banner.className = '';
            banner.innerHTML = '';
            return;
        }
        const extra = stats.extraMoney.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        banner.className = 'acct-dup-banner';
        banner.style.display = 'flex';
        banner.innerHTML = `<i class="fas fa-exclamation-triangle"></i>
            <span>${stats.dupRows} sospecha${stats.dupRows === 1 ? '' : 's'} (${stats.groupCount} grupo${stats.groupCount === 1 ? '' : 's'})</span>
            <span style="margin-left:auto; font-weight:900;">Posible dinero de más: $${extra}</span>
            <span style="font-size:0.72rem; font-weight:600; color:#b91c1c;">Misma orden 2 veces, o el mismo cargo el mismo día. Rentas WEEKLY/MONTHLY de semanas o meses distintos no cuentan</span>`;
    }


    // =========================================================================
    // API PÚBLICA: window.logCashTransaction
    // Llamada pasivamente por driver-settlements.js y releases.js
    // Si falla, NO afecta el flujo del llamador.
    // =========================================================================
    window.logCashTransaction = async function (data) {
        try {
            if (!window.db) return;

            // Transacciones manuales y rentas se guardan en su propia tabla 'cash_ledger'
            const dateStr = (data.date || '').toString().trim();
            const entry = {
                date: /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : new Date().toISOString().split('T')[0],
                tipo: data.tipo,       // 'ingreso' o 'egreso'
                metodo: data.metodo,   // 'cash' o 'bank' o 'driver_wallet'
                monto: parseFloat(data.monto) || 0,
                descripcion: data.descripcion || '',
                referencia: data.referencia || '',
                chofer: data.chofer || '',
                cliente: data.cliente || ''
            };

            const { data: insertedData, error } = await window.db.from('cash_ledger').insert([entry]).select();
            if (error) {
                console.warn('[Accounting] logCashTransaction error (non-fatal):', error.message);
            } else if (insertedData && insertedData.length > 0) {
                console.log('[Accounting] Transaction logged to cash_ledger:', entry.descripcion, entry.monto);
                allTransactions.unshift(insertedData[0]); // Agregar a la memoria local sin recargar DB
                if (typeof renderAccountingTable === 'function') {
                    renderAccountingTable();
                }
            }
        } catch (err) {
            console.warn('[Accounting] logCashTransaction exception (non-fatal):', err.message);
        }
    };

    // =========================================================================
    // API PÚBLICA: window.syncExpenseToLedger
    // Llamada por releases.js al crear/editar/eliminar un gasto.
    // Actualiza el array local SIN hacer una query a Supabase.
    // =========================================================================
    window.syncExpenseToLedger = function (expenseData, mode) {
        // mode: 'add' | 'update' | 'delete'
        // expenseData: objeto con { id, date, category, description, amount, note, payment_method }
        try {
            const amt = parseFloat(expenseData.amount) || 0;

            if (mode === 'delete') {
                allTransactions = allTransactions.filter(t => t.id !== expenseData.id);
            } else {
                const metodo = (expenseData.payment_method === 'bank') ? 'bank'
                    : (expenseData.payment_method === 'driver_wallet' ? 'driver_wallet' : 'cash');
                const newTx = {
                    id: expenseData.id || Math.random().toString(),
                    created_at: expenseData.date || new Date().toISOString().split('T')[0],
                    tipo: 'egreso',
                    metodo: metodo,
                    monto: amt,
                    descripcion: expenseData.description || expenseData.category || 'Gasto General',
                    referencia: expenseData.note || '',
                    chofer: extractEntityFromExpense(expenseData),
                    customer: '',
                    n_cont: '',
                    order_no: '',
                    release_no: '',
                    category: expenseData.category || ''
                };
                if ((expenseData.category || '') === 'Ledger Income') {
                    newTx.tipo = 'ingreso';
                }

                if (mode === 'update') {
                    const idx = allTransactions.findIndex(t => t.id === expenseData.id);
                    if (idx !== -1) {
                        allTransactions[idx] = newTx;
                    } else {
                        // Si por alguna razón no existe (ej: primer load aún no ocurrió), lo insertamos
                        allTransactions.unshift(newTx);
                    }
                } else { // 'add'
                    allTransactions.unshift(newTx);
                    // Re-sort por fecha descendente
                    allTransactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                }
            }

            // Si el Cash Ledger está actualmente visible, re-renderizar
            const view = document.getElementById('accounting-view');
            if (view && view.style.display !== 'none') {
                window.renderAccountingDashboard();
            }
        } catch (err) {
            console.warn('[Accounting] syncExpenseToLedger error (non-fatal):', err.message);
        }
    };

    // =========================================================================
    // CARGA DE DATOS DESDE SUPABASE (Dinámico desde Trips, Expenses, Releases)
    // =========================================================================
    async function loadAccountingData(force = false) {
        if (isLoading) return;
        isLoading = true;
        setLoadingState(true);

        try {
            if (!window.db) throw new Error('DB not available');

            const tripCols = 'trip_id, date, amount, driver, order_no, release_no, status, paid, st_rate, st_sales, st_yard, st_amount, st_tax, has_sales, sales_price, s_cash, has_trans, trans_pay, r_cash, yard_services, yard_rate, y_cash, qty, customer, n_cont, trans_cash_amt, trans_bank_amt, yard_cash_amt, yard_bank_amt, sales_cash_amt, sales_bank_amt, amount_cash_amt, amount_bank_amt, cash_collector, driver_cash_held';
            const tripColsNoHold = 'trip_id, date, amount, driver, order_no, release_no, status, paid, st_rate, st_sales, st_yard, st_amount, st_tax, has_sales, sales_price, s_cash, has_trans, trans_pay, r_cash, yard_services, yard_rate, y_cash, qty, customer, n_cont, trans_cash_amt, trans_bank_amt, yard_cash_amt, yard_bank_amt, sales_cash_amt, sales_bank_amt, amount_cash_amt, amount_bank_amt';

            const [resTrips, resExpenses, resReleases, resSettlements, resCashLedger, resInvoices] = await Promise.all([
                fetchAllPaged(() => window.db.from('trips').select(tripCols).or('is_deleted.eq.false,is_deleted.is.null')),
                fetchAllPaged(() => window.db.from('expenses').select('*').or('is_deleted.eq.false,is_deleted.is.null')),
                fetchAllPaged(() => window.db.from('releases').select('*').eq('paid', true).or('is_deleted.eq.false,is_deleted.is.null')),
                fetchAllPaged(() => window.db.from('settlement_history').select('driver_name, cash_balance, end_date, created_at').or('is_deleted.eq.false,is_deleted.is.null').order('created_at', { ascending: false })),
                fetchAllPaged(() => window.db.from('cash_ledger').select('*').or('is_deleted.eq.false,is_deleted.is.null')),
                fetchAllPaged(() => window.db.from('receivables_invoices').select('invoice_number, trip_ids, service_type, status, amount_paid').or('is_deleted.eq.false,is_deleted.is.null'))
            ]);

            if (resTrips.error) {
                console.error("Error trips:", resTrips.error);
                if (/cash_collector|driver_cash_held/i.test(resTrips.error.message || '')) {
                    const retry = await fetchAllPaged(() => window.db.from('trips').select(tripColsNoHold).or('is_deleted.eq.false,is_deleted.is.null'));
                    if (!retry.error) resTrips.data = retry.data;
                }
            }
            if (resExpenses.error) console.error("Error expenses:", resExpenses.error);
            if (resReleases.error) console.error("Error releases:", resReleases.error);
            if (resSettlements.error) console.error("Error settlements:", resSettlements.error);
            if (resCashLedger.error) {
                console.error("Error cash_ledger:", resCashLedger.error);
                if (/is_deleted/i.test(resCashLedger.error.message || '')) {
                    const retryLed = await fetchAllPaged(() => window.db.from('cash_ledger').select('*'));
                    if (!retryLed.error) resCashLedger.data = retryLed.data;
                }
            }
            if (resInvoices.error) console.error("Error invoices:", resInvoices.error);

            // Chofer "me debe": leftover del último settlement + cash aún en órdenes (después de esa liquidación)
            const driverMap = {};
            const latestSettle = {};
            (resSettlements.data || []).forEach(s => {
                const dName = (s.driver_name || '').toString().trim().toUpperCase();
                if (!dName || latestSettle[dName]) return;
                latestSettle[dName] = s;
                const leftover = Math.max(0, parseFloat(s.cash_balance) || 0);
                if (leftover > 0.009) driverMap[dName] = leftover;
            });
            if (resTrips && resTrips.data && window.getHoldFromDbTrip) {
                resTrips.data.forEach(t => {
                    const h = window.getHoldFromDbTrip(t);
                    if (h < 0.01) return;
                    const dName = (t.driver || 'UNKNOWN').toString().trim().toUpperCase();
                    if (!dName || dName === '---') return;
                    const lastEnd = latestSettle[dName] && latestSettle[dName].end_date;
                    if (lastEnd && String(t.date || '') <= String(lastEnd)) return;
                    driverMap[dName] = (driverMap[dName] || 0) + h;
                });
            }
            Object.keys(driverMap).forEach(d => {
                driverMap[d] = Math.round((driverMap[d] || 0) * 100) / 100;
            });
            let driverWalletActual = 0;
            Object.keys(driverMap).forEach(d => {
                if (driverMap[d] > 0) driverWalletActual += driverMap[d];
            });
            window.driverWalletMap = driverMap;
            window.actualDriverWalletTotal = driverWalletActual;

            // --- Deduplicación de Pagos por Invoices ---
            // Si un servicio fue pagado via Accounts Receivable (invoice), ya está en cash_ledger como "Payment for Invoice..."
            // Evitamos que se duplique aquí leyendo qué servicios de qué trips ya están cubiertos por un invoice pagado.
            const cashLedgerRefs = new Set();
            (resCashLedger.data || []).forEach(c => cashLedgerRefs.add(c.referencia));

            const coveredServices = {};
            (resInvoices.data || []).forEach(inv => {
                const st = (inv.status || '').toString();
                const paidAmt = parseFloat(inv.amount_paid) || 0;
                const hasCollection = paidAmt > 0.009
                    || /^(Paid|Partial)$/i.test(st)
                    || cashLedgerRefs.has(inv.invoice_number);
                if (hasCollection) {
                    if (inv.trip_ids) {
                        const tids = inv.trip_ids.split(',').map(s => s.trim()).filter(Boolean);

                        // service_type looks like "TRANSPORT,SALES|GROUP:ORDER|COMPANY:RP_TULIPAN"
                        const sTypeClean = (inv.service_type || '')
                            .toUpperCase()
                            .replace(/\|COMPANY:[^|]*/g, '')
                            .split('|GROUP:')[0]
                            .trim();
                        const tokens = sTypeClean
                            .split(/[,+/]+/)
                            .map(s => s.trim())
                            .filter(Boolean);

                        const covered = new Set();
                        let recognised = false;
                        tokens.forEach(tok => {
                            if (/TRANSPORT|TRANS|RATE/.test(tok)) { covered.add('TRANSPORT'); recognised = true; }
                            if (/SALES|SALE/.test(tok)) { covered.add('SALES'); recognised = true; }
                            if (/YARD|STORAGE|STOR/.test(tok)) { covered.add('YARD'); recognised = true; }
                            // Rent is not part of this income loop, but it is a valid
                            // service: seeing it must not trigger the "covers all" fallback.
                            if (/RENT/.test(tok)) recognised = true;
                        });
                        // Only an unknown or empty service type means the invoice covered everything
                        if (!recognised) {
                            covered.add('SALES');
                            covered.add('TRANSPORT');
                            covered.add('YARD');
                        }

                        tids.forEach(tid => {
                            if (!coveredServices[tid]) coveredServices[tid] = new Set();
                            covered.forEach(s => coveredServices[tid].add(s));
                        });
                    }
                }
            });

            let unified = [];

            const flagYes = (v) => v === true || v === 'true' || v === 'YES' || v === 'yes';
            const servicePaid = (st) => st === 'PAID' || st === true || st === 'true';
            const skipTripOfficeCash = (t) => {
                const c = (t.cash_collector || '').toString().toLowerCase().trim();
                const held = parseFloat(t.driver_cash_held) || 0;
                if (c === 'driver' && held > 0.009) return true;
                if (c === 'turned_in' || c === 'settled' || c === 'wallet') return true;
                return false;
            };

            // Procesar Trips (Ingresos): cada servicio solo si ESE servicio está pagado.
            // Cash en manos del chofer no entra a caja oficina.
            (resTrips.data || []).forEach(t => {
                const status = (t.status || '').toString().toUpperCase();
                if (status === 'PENDING') return;

                const qty = parseInt(t.qty) || 1;
                const orderRef = `Orden: ${t.order_no || t.release_no || 'N/A'}`;
                const cov = coveredServices[t.trip_id] || new Set();
                const hideDriverCash = skipTripOfficeCash(t);
                const base = {
                    created_at: t.date || '2000-01-01',
                    tipo: 'ingreso',
                    referencia: orderRef,
                    customer: t.customer || '',
                    n_cont: t.n_cont || '',
                    order_no: t.order_no || '',
                    release_no: t.release_no || '',
                    source_table: 'trips',
                    orig_id: t.trip_id
                };

                const pushService = (cfg) => {
                    if (cfg.covered || !cfg.enabled) return;
                    let cAmt = parseFloat(cfg.cashAmt) || 0;
                    const bAmt = parseFloat(cfg.bankAmt) || 0;
                    if (hideDriverCash) cAmt = 0;
                    const paid = servicePaid(cfg.st);
                    if (!paid && cAmt < 0.01 && bAmt < 0.01) return;
                    if (cAmt > 0.009 || bAmt > 0.009) {
                        if (cAmt > 0.009) {
                            unified.push(Object.assign({}, base, {
                                id: t.trip_id + cfg.idCash, metodo: 'cash', monto: cAmt,
                                descripcion: cfg.desc, chofer: cfg.chofer || '', sub_type: cfg.subCash
                            }));
                        }
                        if (bAmt > 0.009) {
                            unified.push(Object.assign({}, base, {
                                id: t.trip_id + cfg.idBank, metodo: 'bank', monto: bAmt,
                                descripcion: cfg.desc, chofer: cfg.chofer || '', sub_type: cfg.subBank
                            }));
                        }
                        return;
                    }
                    if (!paid) return;
                    const monto = cfg.fallback || 0;
                    if (monto <= 0) return;
                    const wantCash = flagYes(cfg.cashFlag);
                    if (wantCash && hideDriverCash) return;
                    unified.push(Object.assign({}, base, {
                        id: (t.trip_id || '') + cfg.idFb,
                        metodo: wantCash ? 'cash' : 'bank',
                        monto: monto,
                        descripcion: cfg.desc,
                        chofer: cfg.chofer || '',
                        sub_type: cfg.subFb
                    }));
                };

                pushService({
                    covered: cov.has('SALES'),
                    enabled: flagYes(t.has_sales),
                    cashAmt: t.sales_cash_amt, bankAmt: t.sales_bank_amt, st: t.st_sales,
                    cashFlag: t.s_cash, fallback: (parseFloat(t.sales_price) || 0) * qty,
                    desc: 'Venta de Contenedor', chofer: '',
                    idCash: '-sc', idBank: '-sb', idFb: '-s', subCash: 'sales_c', subBank: 'sales_b', subFb: 'sales'
                });
                pushService({
                    covered: cov.has('TRANSPORT'),
                    enabled: flagYes(t.has_trans),
                    cashAmt: t.trans_cash_amt, bankAmt: t.trans_bank_amt, st: t.st_rate,
                    cashFlag: t.r_cash, fallback: (parseFloat(t.trans_pay) || 0) * qty,
                    desc: 'Servicio de Transporte', chofer: t.driver || '',
                    idCash: '-tc', idBank: '-tb', idFb: '-t', subCash: 'trans_c', subBank: 'trans_b', subFb: 'trans'
                });
                pushService({
                    covered: cov.has('YARD'),
                    enabled: flagYes(t.yard_services) || t.yard_services === 'YES',
                    cashAmt: t.yard_cash_amt, bankAmt: t.yard_bank_amt, st: t.st_yard,
                    cashFlag: t.y_cash, fallback: (parseFloat(t.yard_rate) || 0) * qty,
                    desc: 'Servicio de Yarda', chofer: '',
                    idCash: '-yc', idBank: '-yb', idFb: '-y', subCash: 'yard_c', subBank: 'yard_b', subFb: 'yard'
                });
            });

            // Procesar Expenses (Egresos)
            (resExpenses.data || []).forEach(e => {
                const amt = parseFloat(e.amount) || 0;
                if (amt > 0) {
                    // Usar el campo payment_method real de la base de datos.
                    // Fallback a 'cash' para registros antiguos sin el campo.
                    const metodo = (e.payment_method === 'bank') ? 'bank'
                        : (e.payment_method === 'driver_wallet' ? 'driver_wallet' : 'cash');
                    const descStr = `${e.category || ''} - ${e.description || ''}`;

                    unified.push({
                        id: e.id || Math.random().toString(),
                        created_at: e.date || '2000-01-01',
                        tipo: (e.category === 'Ledger Income') ? 'ingreso' : 'egreso',
                        metodo: metodo,
                        monto: amt,
                        descripcion: e.description || e.category || 'Gasto General',
                        referencia: e.note || '',
                        chofer: extractEntityFromExpense(e),
                        customer: '',
                        category: e.category,
                        n_cont: '',
                        order_no: '',
                        release_no: '',
                        source_table: 'expenses',
                        orig_id: e.id
                    });
                }
            });

            // Procesar Releases (Egresos por contenedores)
            (resReleases.data || []).forEach(r => {
                // Asegurar que solo se procesen los releases que han sido pagados
                if (!r.paid) return;

                const totalMonto = ((parseFloat(r.qty_20)||0) * (parseFloat(r.price_20)||0)) +
                                   ((parseFloat(r.qty_40)||0) * (parseFloat(r.price_40)||0)) +
                                   ((parseFloat(r.qty_45)||0) * (parseFloat(r.price_45)||0));
                
                if (totalMonto > 0) {
                    unified.push({
                        id: r.id || Math.random().toString(),
                        created_at: r.date || '2000-01-01',
                        tipo: 'egreso',
                        metodo: r.is_cash ? 'cash' : 'bank',
                        monto: totalMonto,
                        descripcion: `Pago de Release #${r.release_no || 'N/A'}`,
                        referencia: r.depot || '',
                        chofer: '',
                        customer: r.seller || '',
                        n_cont: '',
                        order_no: '',
                        release_no: r.release_no || '',
                        source_table: 'releases',
                        orig_id: r.id
                    });
                }
            });

            // Procesar Cash Ledger (Transacciones manuales)
            (resCashLedger.data || []).forEach(c => {
                const amt = parseFloat(c.monto) || 0;
                const ref = (c.referencia || '').toString();
                // Legacy turn-ins duplicated trip cash after collector flipped to office.
                if (ref === 'DRIVER_CASH_TURN_IN') return;
                if (c.is_deleted === true) return;
                if (amt > 0) {
                    unified.push({
                        id: c.id,
                        created_at: c.date || c.created_at || '2000-01-01',
                        tipo: c.tipo, // 'ingreso' o 'egreso'
                        metodo: c.metodo,
                        monto: amt,
                        descripcion: c.descripcion || '',
                        referencia: c.referencia || '',
                        chofer: c.chofer || '',
                        customer: c.cliente || '',
                        n_cont: '',
                        order_no: '',
                        release_no: '',
                        source_table: 'cash_ledger'
                    });
                }
            });

            // Ordenar por fecha (más reciente primero)
            unified.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            allTransactions = unified;
            lastLoadMeta = {
                trips: (resTrips.data || []).length,
                expenses: (resExpenses.data || []).length,
                releases: (resReleases.data || []).length,
                ledger: (resCashLedger.data || []).length,
                invoices: (resInvoices.data || []).length,
                rows: unified.length
            };
            tablePage = 0;
            window.renderAccountingDashboard();

        } catch (err) {
            console.error('[Accounting] loadAccountingData error:', err.message);
            showError(err.message);
        } finally {
            isLoading = false;
            setLoadingState(false);
        }
    }
    window.loadAccountingData = loadAccountingData;

    window.refreshAccountingModule = async function () {
        await window.withRefreshButton('btn-refresh-accounting', async () => {
            await loadAccountingData(true);
        }, 'ledger');
    };

    // =========================================================================
    // FILTRO DE VISTA
    // =========================================================================
    window.filterAccountingView = function (mode) {
        currentFilter = mode;

        // Update toggle button styles
        ['btn-acct-all', 'btn-acct-cash', 'btn-acct-bank', 'btn-acct-dups'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.remove('acct-toggle-active');
        });
        const activeMap = { all: 'btn-acct-all', cash: 'btn-acct-cash', bank: 'btn-acct-bank', dups: 'btn-acct-dups' };
        const activeBtn = document.getElementById(activeMap[mode]);
        if (activeBtn) activeBtn.classList.add('acct-toggle-active');

        // Toggle visibility of rows and cards based on the selected mode
        const rowCash = document.getElementById('acct-row-cash');
        const rowBank = document.getElementById('acct-row-bank');
        const cardTotal = document.getElementById('acct-card-total-empresa');

        if (mode === 'all' || mode === 'dups') {
            if (rowCash) rowCash.style.display = 'flex';
            if (rowBank) rowBank.style.display = 'flex';
            if (cardTotal) cardTotal.style.visibility = 'visible';
        } else if (mode === 'cash') {
            if (rowCash) rowCash.style.display = 'flex';
            if (rowBank) rowBank.style.display = 'none';
            // cardTotal uses visibility so the flex space is preserved for alignment
            if (cardTotal) cardTotal.style.visibility = 'hidden';
        } else if (mode === 'bank') {
            if (rowCash) rowCash.style.display = 'none';
            if (rowBank) rowBank.style.display = 'flex';
            if (cardTotal) cardTotal.style.visibility = 'hidden';
        }

        tablePage = 0;
        window.renderAccountingDashboard();
    };

    window.scheduleAccountingFilter = function () {
        tablePage = 0;
        if (filterTimer) clearTimeout(filterTimer);
        filterTimer = setTimeout(() => window.renderAccountingDashboard(), 220);
    };

    window.acctTablePage = function (delta) {
        tablePage = Math.max(0, tablePage + (parseInt(delta, 10) || 0));
        window.renderAccountingDashboard();
    };

    // =========================================================================
    // RENDERIZADO Y CÁLCULOS
    // =========================================================================
    window.renderAccountingDashboard = function renderAccountingDashboard() {
        // Filter
        const filtered = getFilteredTransactions();

        // Calculate summary cards
        const totals = calculateTotals(filtered); // Cards now update based on filters
        updateSummaryCards(totals);

        // Render transaction table
        renderTransactionTable(filtered);
    };

    function getFilteredTransactions() {
        let list = allTransactions;
        

        // 2. Button Filter (Method) — 'dups' is not a payment method
        if (currentFilter === 'cash' || currentFilter === 'bank') {
            list = list.filter(t => t.metodo === currentFilter);
        }

        // 3. Advanced Filters
        const dateFrom = document.getElementById('acct-filter-date-from')?.value;
        const dateTo = document.getElementById('acct-filter-date-to')?.value;
        const filterService = document.getElementById('acct-filter-service')?.value.trim().toLowerCase();
        const filterTipo = document.getElementById('acct-filter-tipo')?.value.trim().toLowerCase();
        const filterCust = document.getElementById('acct-filter-customer')?.value.trim().toLowerCase();
        const filterCont = document.getElementById('acct-filter-container')?.value.trim().toLowerCase();
        const filterRel = document.getElementById('acct-filter-release')?.value.trim().toLowerCase();
        const filterOrd = document.getElementById('acct-filter-order')?.value.trim().toLowerCase();

        list = list.filter(t => {
            const rowDay = String(t.created_at || t.date || '').slice(0, 10);
            if (dateFrom && rowDay && rowDay < dateFrom) return false;
            if (dateTo && rowDay && rowDay > dateTo) return false;

            const tDesc = (t.descripcion || '').toLowerCase();
            const tRef = (t.referencia || '').toLowerCase();
            if (filterService && !tDesc.includes(filterService) && !tRef.includes(filterService)) return false;

            if (filterTipo && t.tipo !== filterTipo) return false;

            const tCust = (t.customer || '').toLowerCase();
            const tChofer = (t.chofer || '').toLowerCase();
            if (filterCust && !tCust.includes(filterCust) && !tChofer.includes(filterCust)) return false;

            const tCont = (t.n_cont || '').toLowerCase();
            if (filterCont && !tCont.includes(filterCont) && !tRef.includes(filterCont)) return false;

            const tRel = (t.release_no || '').toLowerCase();
            if (filterRel && !tRel.includes(filterRel) && !tRef.includes(filterRel)) return false;

            const tOrd = (t.order_no || '').toLowerCase();
            if (filterOrd && !tOrd.includes(filterOrd) && !tRef.includes(filterOrd) && !tDesc.includes(filterOrd)) return false;

            return true;
        });

        if (currentFilter === 'dups') {
            const { dupIds } = findLedgerDuplicates(list);
            list = list.filter((t, idx) => dupIds.has(ledgerRowId(t, idx)));
        }

        return list;
    }

    window.resetAccountingFilters = function() {
        if (document.getElementById('acct-filter-date-from')) document.getElementById('acct-filter-date-from').value = '';
        if (document.getElementById('acct-filter-tipo')) document.getElementById('acct-filter-tipo').value = '';
        if (document.getElementById('acct-filter-service')) document.getElementById('acct-filter-service').value = '';
        if (document.getElementById('acct-filter-date-to')) document.getElementById('acct-filter-date-to').value = '';
        if (document.getElementById('acct-filter-customer')) document.getElementById('acct-filter-customer').value = '';
        if (document.getElementById('acct-filter-container')) document.getElementById('acct-filter-container').value = '';
        if (document.getElementById('acct-filter-release')) document.getElementById('acct-filter-release').value = '';
        if (document.getElementById('acct-filter-order')) document.getElementById('acct-filter-order').value = '';
        if (document.getElementById('acct-text-search')) document.getElementById('acct-text-search').value = '';
        
        window.filterAccountingView('all'); // This internally calls renderAccountingDashboard
    };

    function calculateTotals(transactions) {
        let cashIn = 0, cashOut = 0, bankIn = 0, bankOut = 0;

        transactions.forEach(t => {
            const amount = parseFloat(t.monto) || 0;
            if (t.metodo === 'cash') {
                if (t.tipo === 'ingreso') cashIn += amount;
                else cashOut += amount;
            } else if (t.metodo === 'bank') {
                if (t.tipo === 'ingreso') bankIn += amount;
                else bankOut += amount;
            }
            // We skip driver_wallet transactions in the general balance calculation 
            // since we now pull the accurate driverWallet total directly from the Settlements DB.
        });

        let actualDriverWallet = 0;
        const searchInput = document.getElementById('acct-text-search');
        const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const driverMap = window.driverWalletMap || {};

        if (term !== '') {
            // Si hay una búsqueda de texto (ej. nombre de chofer), sumar solo las billeteras que coincidan
            Object.keys(driverMap).forEach(dName => {
                if (dName.toLowerCase().includes(term) && driverMap[dName] > 0) {
                    actualDriverWallet += driverMap[dName];
                }
            });
        } else {
            // Si no hay búsqueda de texto, mostrar el total global
            actualDriverWallet = window.actualDriverWalletTotal || 0;
        }

        return {
            cashBalance:   cashIn - cashOut,
            bankBalance:   bankIn - bankOut,
            driverWallet:  actualDriverWallet,
            totalCashIn:   cashIn,
            totalCashOut:  cashOut,
            totalBankIn:   bankIn,
            totalBankOut:  bankOut,
            totalBalance:  (cashIn - cashOut) + (bankIn - bankOut)
        };
    }

    function prettyDriverName(name) {
        return (name || '').toString().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
    }

    function renderDriverWalletAlerts(term) {
        const wrap = document.getElementById('acct-driver-alerts');
        if (!wrap) return;
        const driverMap = window.driverWalletMap || {};
        const q = (term || '').toLowerCase();
        const chips = Object.keys(driverMap)
            .filter(d => (parseFloat(driverMap[d]) || 0) > 0.009)
            .filter(d => !q || d.toLowerCase().includes(q))
            .sort((a, b) => a.localeCompare(b))
            .map(d => {
                const amt = parseFloat(driverMap[d]) || 0;
                const label = prettyDriverName(d);
                return `<span style="display:inline-flex; align-items:center; gap:6px; background:#fffbeb; border:1px solid #fbbf24; color:#92400e; padding:5px 10px; border-radius:999px; font-size:0.78rem; font-weight:800; box-shadow:0 1px 2px rgba(0,0,0,0.06);">
                    <i class="fas fa-money-bill-wave"></i>
                    ${label} tiene $${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tuyos
                </span>`;
            });
        wrap.innerHTML = chips.join('');
        wrap.style.display = chips.length ? 'flex' : 'none';
    }

    function updateSummaryCards(totals) {
        setText('acct-cash-balance',  fmt(totals.cashBalance));
        setText('acct-bank-balance',  fmt(totals.bankBalance));
        setText('acct-total-balance', fmt(totals.totalBalance));
        setText('acct-cash-in',       '+' + fmt(totals.totalCashIn));
        setText('acct-cash-out',      '-' + fmt(totals.totalCashOut));
        setText('acct-bank-in',       '+' + fmt(totals.totalBankIn));
        setText('acct-bank-out',      '-' + fmt(totals.totalBankOut));
        setText('acct-tx-count',      getFilteredTransactions().length);
        const metaEl = document.getElementById('acct-load-meta');
        if (metaEl) {
            metaEl.textContent = 'Cargadas ' + (lastLoadMeta.trips || 0) + ' órdenes · '
                + (lastLoadMeta.expenses || 0) + ' gastos · '
                + (lastLoadMeta.ledger || 0) + ' asientos · '
                + (lastLoadMeta.rows || 0) + ' filas ledger';
        }

        const searchInput = document.getElementById('acct-text-search');
        renderDriverWalletAlerts(searchInput ? searchInput.value.trim() : '');

        colorBalance('acct-cash-balance',  totals.cashBalance);
        colorBalance('acct-bank-balance',  totals.bankBalance);
        colorBalance('acct-total-balance', totals.totalBalance);
    }

    function renderTransactionTable(transactions) {
        const tbody = document.getElementById('acct-table-body');
        if (!tbody) return;

        if (transactions.length === 0) {
            const pagerEmpty = document.getElementById('acct-table-pager');
            if (pagerEmpty) pagerEmpty.style.display = 'none';
            renderLedgerDupBanner({ groupCount: 0 });
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center; padding:40px; color:#94a3b8; font-style:italic;">
                        <i class="fas fa-inbox" style="font-size:2rem; display:block; margin-bottom:10px; opacity:0.4;"></i>
                        No hay ${currentFilter === 'dups' ? 'duplicados' : 'transacciones'}${currentFilter !== 'all' && currentFilter !== 'dups' ? ' para el filtro seleccionado' : currentFilter === 'dups' ? ' en esta vista' : ''}.
                    </td>
                </tr>`;
            return;
        }

        const needDupScan = currentFilter === 'dups' || transactions.length <= 2500;
        const dupStats = needDupScan
            ? findLedgerDuplicates(transactions)
            : { dupIds: new Set(), extraMoney: 0, dupRows: 0, groupCount: 0 };
        renderLedgerDupBanner(dupStats);

        let runningBalance = 0;
        const reversed = [...transactions].reverse();
        const balancesAll = [];
        reversed.forEach(t => {
            const amt = parseFloat(t.monto) || 0;
            if (t.metodo !== 'driver_wallet') {
                runningBalance += (t.tipo === 'ingreso' ? amt : -amt);
            }
            balancesAll.push(runningBalance);
        });
        balancesAll.reverse();

        const maxPage = Math.max(0, Math.ceil(transactions.length / TABLE_PAGE_SIZE) - 1);
        if (tablePage > maxPage) tablePage = maxPage;
        const start = tablePage * TABLE_PAGE_SIZE;
        const pageRows = transactions.slice(start, start + TABLE_PAGE_SIZE);
        const pager = document.getElementById('acct-table-pager');
        if (pager) {
            const shownFrom = transactions.length ? start + 1 : 0;
            const shownTo = Math.min(start + pageRows.length, transactions.length);
            pager.style.display = 'flex';
            pager.innerHTML = '<span style="font-size:0.78rem;font-weight:700;color:#475569;">Mostrando '
                + shownFrom + '–' + shownTo + ' de ' + transactions.length
                + ' (los totales de arriba usan todas las filas filtradas)</span>'
                + '<span style="display:flex;gap:8px;">'
                + '<button type="button" class="acct-toggle-btn" ' + (tablePage <= 0 ? 'disabled' : '') + ' onclick="window.acctTablePage(-1)">Anterior</button>'
                + '<button type="button" class="acct-toggle-btn" ' + (tablePage >= maxPage ? 'disabled' : '') + ' onclick="window.acctTablePage(1)">Siguiente</button>'
                + '</span>';
        }

        tbody.innerHTML = pageRows.map((t, i) => {
            const globalIdx = start + i;
            const isIncome = t.tipo === 'ingreso';
            const isWallet = t.metodo === 'driver_wallet';
            const isCash   = t.metodo === 'cash';
            const amt      = parseFloat(t.monto) || 0;
            const balance  = balancesAll[globalIdx];
            const isDuplicate = dupStats.dupIds.has(ledgerRowId(t, globalIdx));

            const tipoColor  = isIncome ? '#10b981' : '#ef4444';
            const tipoIcon   = isIncome ? 'fa-arrow-down' : 'fa-arrow-up';
            let badgeHtml = isWallet
                ? `<span class="acct-badge" style="background:#fffbeb;color:#92400e;border:1px solid #fbbf24;"><i class="fas fa-user"></i> WALLET</span>`
                : isCash
                ? `<span class="acct-badge acct-badge-cash"><i class="fas fa-money-bill-wave"></i> CASH</span>`
                : `<span class="acct-badge acct-badge-bank"><i class="fas fa-university"></i> BANK</span>`;
                
            if (window.currentUserRole === 'admin') {
                badgeHtml = `<div style="cursor:pointer;" onclick="window.toggleCashLedgerMethod('${t.id}', '${t.metodo}')" title="Cambiar método de pago">${badgeHtml}</div>`;
            }
            const metodoBadge = badgeHtml;

            const dateStr = t.created_at
                ? (window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(t.created_at) : t.created_at)
                : '---';
            const timeStr = t.created_at
                ? new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                : '';

            const balColor = balance >= 0 ? '#10b981' : '#ef4444';
            
            let clienteText = '—';
            let clienteIcon = '';
            let clienteStyle = 'color:#94a3b8;';

            if (t.customer) { // Customer or Seller depending on context
                clienteText = t.customer;
                if (t.descripcion && t.descripcion.toLowerCase().includes('release')) {
                    clienteIcon = '<i class="fas fa-building" style="margin-right:4px;"></i>';
                    clienteStyle = 'background:#f8fafc; color:#475569; border: 1px solid #e2e8f0; padding:1px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; display:inline-flex; align-items:center;';
                } else {
                    clienteIcon = '<i class="fas fa-user" style="margin-right:4px;"></i>';
                    clienteStyle = 'background:#f0fdf4; color:#166534; padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; display:inline-flex; align-items:center;';
                }
            } else if (t.category && t.category !== 'Ledger Income' && t.category !== 'Ledger Expense') {
                clienteText = t.category;
                clienteIcon = '<i class="fas fa-tags" style="margin-right:4px;"></i>';
                clienteStyle = 'background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; display:inline-flex; align-items:center;';
            }

            const clienteCell = clienteText !== '—'
                ? `<span style="${clienteStyle}">${clienteIcon}${clienteText}</span>`
                : `<span style="color:#94a3b8;">—</span>`;

            let choferText = '—';
            let choferIcon = '';
            let choferStyle = 'color:#94a3b8;';

            if (t.chofer) {
                choferText = t.chofer;
                choferIcon = '<i class="fas fa-truck" style="margin-right:4px;"></i>';
                choferStyle = 'background:#eff6ff; color:#1e40af; padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; display:inline-flex; align-items:center;';
            }

            const choferCell = choferText !== '—'
                ? `<span style="${choferStyle}">${choferIcon}${choferText}</span>`
                : `<span style="color:#94a3b8;">—</span>`;

            const deleteBtn = (window.currentUserRole === 'admin')
                ? `<button onclick="window.deleteAccountingTx('${t.id}', '${t.source_table || ''}')" 
                       style="background:#fee2e2; border:none; color:#ef4444; width:28px; height:28px; border-radius:6px; cursor:pointer; transition:all 0.2s;"
                       title="Delete">
                       <i class="fas fa-trash-alt" style="font-size:0.7rem;"></i>
                   </button>`
                : '';

            const dupBadge = isDuplicate
                ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#fee2e2;color:#b91c1c;padding:2px 7px;border-radius:6px;font-size:0.65rem;font-weight:900;letter-spacing:0.3px;"><i class="fas fa-exclamation-triangle"></i> SOSPECHA</span>`
                : '';

            return `
            <tr class="acct-table-row${isDuplicate ? ' acct-dup-row' : ''}" style="transition: background 0.15s;" title="${isDuplicate ? 'Sospecha de dinero de más: misma orden repetida, o el mismo cargo el mismo día' : ''}">
                <td style="white-space:nowrap;">
                    <div style="font-weight:700; color:${isDuplicate ? '#991b1b' : '#1e293b'}; font-size:0.82rem;">${dateStr}</div>
                    <div style="color:#94a3b8; font-size:0.7rem;">${timeStr}</div>
                </td>
                <td style="text-align:center;">
                    <span style="display:inline-flex; align-items:center; gap:5px; font-weight:800; font-size:0.8rem; color:${tipoColor};">
                        <i class="fas ${tipoIcon}"></i>
                        ${isIncome ? 'INGRESO' : 'EGRESO'}
                    </span>
                </td>
                <td>${metodoBadge}</td>
                <td style="max-width:220px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <div style="font-weight:${isDuplicate ? '800' : '600'}; color:${isDuplicate ? '#991b1b' : '#1e293b'}; font-size:0.82rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${t.descripcion || ''}">${t.descripcion || '—'}</div>
                        ${dupBadge}
                    </div>
                    ${t.referencia ? `<div style="color:#64748b; font-size:0.7rem;">${t.referencia}</div>` : ''}
                </td>
                <td style="text-align:center;">${clienteCell}</td>
                <td style="text-align:center;">${choferCell}</td>
                <td style="text-align:right; white-space:nowrap;">
                    <span style="font-weight:900; font-size:1rem; color:${tipoColor};">
                        ${isIncome ? '+' : '-'}$${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                </td>
                <td style="text-align:right; white-space:nowrap;">
                    <span style="font-weight:800; font-size:0.9rem; color:${balColor};">
                        $${Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        ${balance < 0 ? '<span style="font-size:0.65rem; color:#ef4444;">(neg)</span>' : ''}
                    </span>
                </td>
                <td style="text-align:center;">${deleteBtn}</td>
            </tr>`;
        }).join('');
    }

    // =========================================================================
    // MANUAL TRANSACTION FORM
    // =========================================================================
    window.saveManualTransaction = async function () {
        if (window.currentUserRole !== 'admin') return;

        const tipo       = document.getElementById('acct-form-tipo')?.value;
        const metodo     = document.getElementById('acct-form-metodo')?.value;
        const fechaTx    = document.getElementById('acct-form-date')?.value;
        const monto      = parseFloat(document.getElementById('acct-form-monto')?.value) || 0;
        const descripcion = document.getElementById('acct-form-desc')?.value?.trim();
        const referencia  = document.getElementById('acct-form-ref')?.value?.trim();
        const cliente     = document.getElementById('acct-form-cliente')?.value?.trim();
        const chofer      = document.getElementById('acct-form-chofer')?.value?.trim();

        if (!monto || monto <= 0) return alert('Por favor ingresa un monto válido mayor que $0.');
        if (!descripcion)         return alert('Por favor ingresa una descripción.');

        const probe = {
            tipo, metodo, monto, descripcion, referencia,
            customer: cliente, cliente, chofer, order_no: '', n_cont: '',
            created_at: new Date().toISOString()
        };
        const existingDupes = allTransactions.filter(t => isSuspiciousLedgerMatch(probe, t));
        if (existingDupes.length > 0) {
            const ok = confirm(
                `Sospecha de duplicado: ya hay ${existingDupes.length} movimiento(s) igual(es) por $${monto.toFixed(2)} en la misma orden o en los últimos ${EXPENSE_DUP_WINDOW_DAYS} días.\n\nNómina o renta de otro mes/semana no cuenta.\n¿Guardar de todas formas?`
            );
            if (!ok) return;
        }

        const btn = document.getElementById('btn-acct-save-tx');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

        await window.logCashTransaction({ tipo, metodo, monto, descripcion, referencia, cliente, chofer, date: fechaTx });

        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> SAVE TRANSACTION'; }

        // Reset form
        ['acct-form-monto', 'acct-form-desc', 'acct-form-ref', 'acct-form-cliente', 'acct-form-chofer', 'acct-form-date'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        // Reload
        await loadAccountingData(true);
    };

    // =========================================================================
    // DELETE TRANSACTION (Admin only)
    // =========================================================================
    window.deleteAccountingTx = async function (id, source_table) {
        const role = (window.currentUserRole || '').toLowerCase().trim();
        if (role !== 'admin') {
            alert("Only administrators can delete records.");
            return;
        }
        if (source_table === 'cash_ledger') {
            if (!confirm('¿Estás seguro de que quieres eliminar esta transacción manual del Cash Ledger?')) return;
            try {
                const now = new Date().toISOString();
                const { error } = await window.db.from('cash_ledger').update({
                    is_deleted: true,
                    deleted_at: now,
                    deleted_by: window.userEmail || window.userName || 'Unknown'
                }).eq('id', id);
                if (error) {
                    const { error: delErr } = await window.db.from('cash_ledger').delete().eq('id', id);
                    if (delErr) throw delErr;
                }
                alert('Transacción eliminada con éxito.');
                loadAccountingData(true);
            } catch (err) {
                alert('Error eliminando: ' + err.message);
            }
        } else {
            alert("Las transacciones mostradas aquí son un espejo de tus Órdenes, Gastos y Releases.\n\nPara eliminar una transacción, por favor bórrala desde su módulo original (Trips, Expenses o Releases).");
        }
    };

    window.toggleCashLedgerMethod = async function(id, currentMethod) {
        if (currentMethod === 'driver_wallet') {
            alert('El pago desde wallet del chofer no se cambia a caja/banco aquí.');
            return;
        }
        if (!confirm('¿Deseas cambiar el método de pago de esta transacción (Cash ↔ Bank)?')) return;
        const newMethod = (currentMethod === 'cash') ? 'bank' : 'cash';
        
        // Optimistic UI update
        const tbody = document.getElementById('acct-table-body');
        if (tbody) tbody.style.opacity = '0.5';

        try {
            // Find the transaction in local cache to get source info
            let tx = null;
            if (typeof allTransactions !== 'undefined') {
                tx = allTransactions.find(t => t.id === id);
            }
            if (!tx || !tx.source_table) {
                throw new Error("No se pudo determinar el origen de esta transacción.");
            }

            // DB Update based on source_table
            if (tx.source_table === 'cash_ledger') {
                const { error } = await window.db.from('cash_ledger').update({ metodo: newMethod }).eq('id', id);
                if (error) throw error;
            } else if (tx.source_table === 'expenses') {
                const { error } = await window.db.from('expenses').update({ payment_method: newMethod }).eq('id', tx.orig_id);
                if (error) throw error;
            } else if (tx.source_table === 'releases') {
                const { error } = await window.db.from('releases').update({ is_cash: newMethod === 'cash' }).eq('id', tx.orig_id);
                if (error) throw error;
            } else if (tx.source_table === 'trips') {
                // Determine which column to update based on sub_type
                const updates = {};
                if (tx.sub_type === 'sales') {
                    updates.s_cash = (newMethod === 'cash');
                } else if (tx.sub_type === 'trans') {
                    updates.r_cash = (newMethod === 'cash');
                } else if (tx.sub_type === 'yard') {
                    updates.y_cash = (newMethod === 'cash');
                } else if (tx.sub_type.endsWith('_c') || tx.sub_type.endsWith('_b')) {
                    // It's a split payment, we are moving the amount from cash to bank or viceversa
                    const { data: tripData, error: fetchErr } = await window.db.from('trips').select('*').eq('trip_id', tx.orig_id).or('is_deleted.eq.false,is_deleted.is.null').maybeSingle();
                    if (fetchErr) throw fetchErr;
                    if (!tripData) throw new Error('Trip not found or deleted');
                    
                    let cCol, bCol;
                    if (tx.sub_type.startsWith('sales')) { cCol = 'sales_cash_amt'; bCol = 'sales_bank_amt'; }
                    else if (tx.sub_type.startsWith('trans')) { cCol = 'trans_cash_amt'; bCol = 'trans_bank_amt'; }
                    else if (tx.sub_type.startsWith('yard')) { cCol = 'yard_cash_amt'; bCol = 'yard_bank_amt'; }
                    
                    const cAmt = parseFloat(tripData[cCol]) || 0;
                    const bAmt = parseFloat(tripData[bCol]) || 0;
                    
                    if (tx.sub_type.endsWith('_c')) {
                        updates[cCol] = '0';
                        updates[bCol] = (bAmt + cAmt).toString();
                    } else {
                        updates[bCol] = '0';
                        updates[cCol] = (cAmt + bAmt).toString();
                    }
                }
                const { error } = await window.db.from('trips').update(updates).eq('trip_id', tx.orig_id);
                if (error) throw error;
            }
            
            // Re-fetch to reconstruct all split entries properly if it was a trip split
            if (tx.source_table === 'trips' && (tx.sub_type.endsWith('_c') || tx.sub_type.endsWith('_b'))) {
                await loadAccountingData(true);
            } else {
                tx.metodo = newMethod;
                if (typeof window.renderAccountingDashboard === 'function') {
                    window.renderAccountingDashboard();
                } else {
                    loadAccountingData(true);
                }
            }
        } catch (err) {
            console.error('Error changing payment method:', err);
            alert('Error al cambiar el método de pago: ' + err.message);
        } finally {
            if (tbody) tbody.style.opacity = '1';
        }
    };

    // =========================================================================
    // UTILS
    // =========================================================================
    function fmt(n) {
        return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function colorBalance(id, val) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.color = val >= 0 ? '#10b981' : '#ef4444';
    }

    function setLoadingState(loading) {
        const tbody = document.getElementById('acct-table-body');
        if (loading && tbody) {
            tbody.innerHTML = `
                <tr><td colspan="7" style="text-align:center; padding:40px; color:#94a3b8;">
                    <i class="fas fa-spinner fa-spin" style="font-size:1.5rem; display:block; margin-bottom:8px;"></i>
                    Cargando transacciones...
                </td></tr>`;
        }
    }

    function showError(msg) {
        const tbody = document.getElementById('acct-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr><td colspan="7" style="text-align:center; padding:40px; color:#ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size:1.5rem; display:block; margin-bottom:8px;"></i>
                    Error al cargar: ${msg}<br>
                    <small style="color:#94a3b8;">Asegúrate de haber creado la tabla <strong>cash_ledger</strong> en Supabase.</small>
                </td></tr>`;
        }
    }

    // =========================================================================
    // INICIALIZACIÓN: Hook on view navigation
    // =========================================================================
    document.addEventListener('DOMContentLoaded', () => {
        // Observe when accounting-view becomes visible (used by showView to trigger load)
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const view = document.getElementById('accounting-view');
                    if (view && view.style.display !== 'none' && view.style.display !== '') {
                        if (window.currentUserRole === 'admin') {
                            const dateEl = document.getElementById('acct-form-date');
                            if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
                            loadAccountingData(true);
                        }
                    }
                }
            });
        });

        const acctView = document.getElementById('accounting-view');
        if (acctView) {
            observer.observe(acctView, { attributes: true });
        }
    });

})();
