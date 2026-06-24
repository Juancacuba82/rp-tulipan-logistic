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
    let currentFilter = 'cash'; // 'all' | 'cash' | 'bank'
    let isLoading = false;

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


    // =========================================================================
    // API PÚBLICA: window.logCashTransaction
    // Llamada pasivamente por driver-settlements.js y releases.js
    // Si falla, NO afecta el flujo del llamador.
    // =========================================================================
    window.logCashTransaction = async function (data) {
        try {
            if (!window.db) return;

            // Para transacciones manuales desde Ledger, las guardamos en la tabla `expenses`
            // Así todo se centraliza y el historial no se pierde
            const entry = {
                date: new Date().toISOString().split('T')[0],
                amount: parseFloat(data.monto) || 0,
                category: data.tipo === 'ingreso' ? 'Ledger Income' : 'Ledger Expense',
                description: data.descripcion || '',
                note: `[Ledger: ${data.metodo}] ${data.referencia || ''} ${data.chofer ? '[Entidad: ' + data.chofer + ']' : ''}`.trim()
            };

            const { error } = await window.db.from('expenses').insert([entry]);
            if (error) {
                console.warn('[Accounting] logCashTransaction error (non-fatal):', error.message);
            } else {
                console.log('[Accounting] Transaction logged to expenses:', entry.description, entry.amount);
                const view = document.getElementById('accounting-view');
                if (view && view.style.display !== 'none') {
                    loadAccountingData(true);
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
                const metodo = (expenseData.payment_method === 'bank') ? 'bank' : 'cash';
                const newTx = {
                    id: expenseData.id || Math.random().toString(),
                    created_at: expenseData.date || new Date().toISOString().split('T')[0],
                    tipo: 'egreso',
                    metodo: metodo,
                    monto: amt,
                    descripcion: expenseData.description || expenseData.category || 'Gasto General',
                    referencia: expenseData.note || '',
                    chofer: extractDriverFromExpense(expenseData),
                    customer: '',
                    n_cont: '',
                    order_no: '',
                    release_no: ''
                };

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
        if (!force && allTransactions && allTransactions.length > 0) {
            // Already loaded, just render
            window.renderAccountingDashboard();
            return;
        }

        if (isLoading) return;
        isLoading = true;
        setLoadingState(true);

        try {
            if (!window.db) throw new Error('DB not available');

            // 1. Cargar Ingresos (Trips)
            const pTrips = window.db.from('trips')
                .select('trip_id, date, amount, driver, order_no, release_no, status, has_sales, sales_price, s_cash, has_trans, trans_pay, r_cash, yard_services, yard_rate, y_cash, qty, customer, n_cont, trans_cash_amt, trans_bank_amt, yard_cash_amt, yard_bank_amt, sales_cash_amt, sales_bank_amt, amount_cash_amt, amount_bank_amt');

            // 2. Cargar Egresos (Expenses)
            const pExpenses = window.db.from('expenses').select('*');

            // 3. Cargar Egresos (Releases pagados)
            const pReleases = window.db.from('releases')
                .select('*')
                .eq('paid', true);

            // 4. Cargar Balances Reales de Choferes (Settlements)
            const pSettlements = window.db.from('settlement_history')
                .select('driver_name, cash_balance, end_date')
                .order('end_date', { ascending: false });

            const [resTrips, resExpenses, resReleases, resSettlements] = await Promise.all([pTrips, pExpenses, pReleases, pSettlements]);

            if (resTrips.error) console.error("Error trips:", resTrips.error);
            if (resExpenses.error) console.error("Error expenses:", resExpenses.error);
            if (resReleases.error) console.error("Error releases:", resReleases.error);
            if (resSettlements.error) console.error("Error settlements:", resSettlements.error);

            // Calcular Balance Real de Choferes
            let driverWalletActual = 0;
            if (resSettlements && resSettlements.data) {
                const driverMap = {};
                resSettlements.data.forEach(s => {
                    const dName = s.driver_name || 'UNKNOWN';
                    if (driverMap[dName] === undefined) {
                        driverMap[dName] = parseFloat(s.cash_balance) || 0;
                        if (driverMap[dName] > 0) {
                            driverWalletActual += driverMap[dName];
                        }
                    }
                });
                window.driverWalletMap = driverMap;
            }
            window.actualDriverWalletTotal = driverWalletActual;

            let unified = [];

            // Procesar Trips (Ingresos)
            (resTrips.data || []).forEach(t => {
                const status = (t.status || '').toString().toUpperCase();
                // Solo procesamos ingresos si la orden está completada/pagada
                if (status !== 'COMPLETE' && status !== 'PAID' && status !== 'DELIVERED') return;

                const qty = parseInt(t.qty) || 1;
                const orderRef = `Orden: ${t.order_no || t.release_no || 'N/A'}`;
                
                const isSCash = (t.s_cash === true || t.s_cash === 'true');
                const isRCash = (t.r_cash === true || t.r_cash === 'true');
                const isYCash = (t.y_cash === true || t.y_cash === 'true');

                // A. Ventas
                if (t.has_sales === 'YES' || t.has_sales === true) {
                    const cAmt = parseFloat(t.sales_cash_amt) || 0;
                    const bAmt = parseFloat(t.sales_bank_amt) || 0;
                    if (cAmt > 0 || bAmt > 0) {
                        if (cAmt > 0) unified.push({ id: t.trip_id + '-sc', created_at: t.date || '2000-01-01', tipo: 'ingreso', metodo: 'cash', monto: cAmt, descripcion: 'Venta de Contenedor', referencia: orderRef, chofer: '', customer: t.customer || '', n_cont: t.n_cont || '', order_no: t.order_no || '', release_no: t.release_no || '' });
                        if (bAmt > 0) unified.push({ id: t.trip_id + '-sb', created_at: t.date || '2000-01-01', tipo: 'ingreso', metodo: 'bank', monto: bAmt, descripcion: 'Venta de Contenedor', referencia: orderRef, chofer: '', customer: t.customer || '', n_cont: t.n_cont || '', order_no: t.order_no || '', release_no: t.release_no || '' });
                    } else {
                        const salesMonto = (parseFloat(t.sales_price) || 0) * qty;
                        if (salesMonto > 0) {
                            unified.push({
                                id: (t.trip_id || Math.random().toString()) + '-s', created_at: t.date || '2000-01-01', tipo: 'ingreso', metodo: isSCash ? 'cash' : 'bank', monto: salesMonto,
                                descripcion: `Venta de Contenedor`, referencia: orderRef, chofer: '', customer: t.customer || '', n_cont: t.n_cont || '', order_no: t.order_no || '', release_no: t.release_no || ''
                            });
                        }
                    }
                }

                // B. Transporte
                if (t.has_trans === 'YES' || t.has_trans === true) {
                    const cAmt = parseFloat(t.trans_cash_amt) || 0;
                    const bAmt = parseFloat(t.trans_bank_amt) || 0;
                    if (cAmt > 0 || bAmt > 0) {
                        if (cAmt > 0) unified.push({ id: t.trip_id + '-tc', created_at: t.date || '2000-01-01', tipo: 'ingreso', metodo: 'cash', monto: cAmt, descripcion: 'Servicio de Transporte', referencia: orderRef, chofer: t.driver || '', customer: t.customer || '', n_cont: t.n_cont || '', order_no: t.order_no || '', release_no: t.release_no || '' });
                        if (bAmt > 0) unified.push({ id: t.trip_id + '-tb', created_at: t.date || '2000-01-01', tipo: 'ingreso', metodo: 'bank', monto: bAmt, descripcion: 'Servicio de Transporte', referencia: orderRef, chofer: t.driver || '', customer: t.customer || '', n_cont: t.n_cont || '', order_no: t.order_no || '', release_no: t.release_no || '' });
                    } else {
                        const transMonto = parseFloat(t.trans_pay) || 0;
                        if (transMonto > 0) {
                            unified.push({
                                id: (t.trip_id || Math.random().toString()) + '-t', created_at: t.date || '2000-01-01', tipo: 'ingreso', metodo: isRCash ? 'cash' : 'bank', monto: transMonto,
                                descripcion: `Servicio de Transporte`, referencia: orderRef, chofer: t.driver || '', customer: t.customer || '', n_cont: t.n_cont || '', order_no: t.order_no || '', release_no: t.release_no || ''
                            });
                        }
                    }
                }

                // C. Yarda
                if (t.yard_services === 'YES' || t.yard_services === true) {
                    const cAmt = parseFloat(t.yard_cash_amt) || 0;
                    const bAmt = parseFloat(t.yard_bank_amt) || 0;
                    if (cAmt > 0 || bAmt > 0) {
                        if (cAmt > 0) unified.push({ id: t.trip_id + '-yc', created_at: t.date || '2000-01-01', tipo: 'ingreso', metodo: 'cash', monto: cAmt, descripcion: 'Servicio de Yarda', referencia: orderRef, chofer: '', customer: t.customer || '', n_cont: t.n_cont || '', order_no: t.order_no || '', release_no: t.release_no || '' });
                        if (bAmt > 0) unified.push({ id: t.trip_id + '-yb', created_at: t.date || '2000-01-01', tipo: 'ingreso', metodo: 'bank', monto: bAmt, descripcion: 'Servicio de Yarda', referencia: orderRef, chofer: '', customer: t.customer || '', n_cont: t.n_cont || '', order_no: t.order_no || '', release_no: t.release_no || '' });
                    } else {
                        const yardMonto = (parseFloat(t.yard_rate) || 0) * qty;
                        if (yardMonto > 0) {
                            unified.push({
                                id: (t.trip_id || Math.random().toString()) + '-y', created_at: t.date || '2000-01-01', tipo: 'ingreso', metodo: isYCash ? 'cash' : 'bank', monto: yardMonto,
                                descripcion: `Servicio de Yarda`, referencia: orderRef, chofer: '', customer: t.customer || '', n_cont: t.n_cont || '', order_no: t.order_no || '', release_no: t.release_no || ''
                            });
                        }
                    }
                }
            });

            // Procesar Expenses (Egresos)
            (resExpenses.data || []).forEach(e => {
                const amt = parseFloat(e.amount) || 0;
                if (amt > 0) {
                    // Usar el campo payment_method real de la base de datos.
                    // Fallback a 'cash' para registros antiguos sin el campo.
                    const metodo = (e.payment_method === 'bank') ? 'bank' : 'cash';
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
                        release_no: ''
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
                        release_no: r.release_no || ''
                    });
                }
            });

            // Ordenar por fecha (más reciente primero)
            unified.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            allTransactions = unified;
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

    // =========================================================================
    // FILTRO DE VISTA
    // =========================================================================
    window.filterAccountingView = function (mode) {
        currentFilter = mode;

        // Update toggle button styles
        ['btn-acct-all', 'btn-acct-cash', 'btn-acct-bank'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.remove('acct-toggle-active');
        });
        const activeMap = { all: 'btn-acct-all', cash: 'btn-acct-cash', bank: 'btn-acct-bank' };
        const activeBtn = document.getElementById(activeMap[mode]);
        if (activeBtn) activeBtn.classList.add('acct-toggle-active');

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
        
        // 1. Text Search Filter (General)
        const searchInput = document.getElementById('acct-text-search');
        if (searchInput && searchInput.value.trim() !== '') {
            const term = searchInput.value.trim().toLowerCase();
            list = list.filter(t => {
                const desc = (t.descripcion || '').toLowerCase();
                const ref = (t.referencia || '').toLowerCase();
                const chofer = (t.chofer || '').toLowerCase();
                const cust = (t.customer || '').toLowerCase();
                const nCont = (t.n_cont || '').toLowerCase();
                return desc.includes(term) || ref.includes(term) || chofer.includes(term) || cust.includes(term) || nCont.includes(term);
            });
        }

        // 2. Button Filter (Method)
        if (currentFilter !== 'all') {
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
            const rowDate = t.created_at;
            let matchDate = true;
            if (dateFrom && rowDate < dateFrom) matchDate = false;
            if (dateTo && rowDate > dateTo) matchDate = false;

            const tDesc = (t.descripcion || '').toLowerCase();
            const matchService = !filterService || tDesc.includes(filterService);

            const matchTipo = !filterTipo || t.tipo === filterTipo;

            const tCust = (t.customer || '').toLowerCase();
            const matchCust = !filterCust || tCust.includes(filterCust);

            const tCont = (t.n_cont || '').toLowerCase();
            const matchCont = !filterCont || tCont.includes(filterCont);

            const tRel = (t.release_no || '').toLowerCase();
            const matchRel = !filterRel || tRel.includes(filterRel);

            const tOrd = (t.order_no || '').toLowerCase();
            const matchOrd = !filterOrd || tOrd.includes(filterOrd);

            return matchDate && matchTipo && matchService && matchCust && matchCont && matchRel && matchOrd;
        });

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
        
        window.filterAccountingView('cash'); // This internally calls renderAccountingDashboard
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

    function updateSummaryCards(totals) {
        setText('acct-cash-balance',  fmt(totals.cashBalance));
        setText('acct-bank-balance',  fmt(totals.bankBalance));
        setText('acct-total-balance', fmt(totals.totalBalance));
        setText('acct-driver-wallet', fmt(totals.driverWallet));
        setText('acct-cash-in',       '+' + fmt(totals.totalCashIn));
        setText('acct-cash-out',      '-' + fmt(totals.totalCashOut));
        setText('acct-bank-in',       '+' + fmt(totals.totalBankIn));
        setText('acct-bank-out',      '-' + fmt(totals.totalBankOut));
        setText('acct-tx-count',      getFilteredTransactions().length);

        // Color balance totals
        colorBalance('acct-cash-balance',  totals.cashBalance);
        colorBalance('acct-bank-balance',  totals.bankBalance);
        colorBalance('acct-total-balance', totals.totalBalance);
    }

    function renderTransactionTable(transactions) {
        const tbody = document.getElementById('acct-table-body');
        if (!tbody) return;

        if (transactions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:40px; color:#94a3b8; font-style:italic;">
                        <i class="fas fa-inbox" style="font-size:2rem; display:block; margin-bottom:10px; opacity:0.4;"></i>
                        No hay transacciones${currentFilter !== 'all' ? ' para el filtro seleccionado' : ''}.
                    </td>
                </tr>`;
            return;
        }

        let runningBalance = 0;
        // Calculate running balance in reverse (oldest first)
        const reversed = [...transactions].reverse();
        const balances = [];
        reversed.forEach(t => {
            const amt = parseFloat(t.monto) || 0;
            const multiplier = (t.metodo === 'cash' || t.metodo === 'driver_wallet') ? 1 : 1;
            runningBalance += (t.tipo === 'ingreso' ? amt : -amt);
            balances.push(runningBalance);
        });
        balances.reverse(); // Restore newest-first order

        tbody.innerHTML = transactions.map((t, i) => {
            const isIncome = t.tipo === 'ingreso';
            const isCash   = t.metodo === 'cash' || t.metodo === 'driver_wallet';
            const amt      = parseFloat(t.monto) || 0;
            const balance  = balances[i];

            const tipoColor  = isIncome ? '#10b981' : '#ef4444';
            const tipoIcon   = isIncome ? 'fa-arrow-down' : 'fa-arrow-up';
            const metodoBadge = isCash
                ? `<span class="acct-badge acct-badge-cash"><i class="fas fa-money-bill-wave"></i> CASH</span>`
                : `<span class="acct-badge acct-badge-bank"><i class="fas fa-university"></i> BANK</span>`;

            const dateStr = t.created_at
                ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
                : '---';
            const timeStr = t.created_at
                ? new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                : '';

            const balColor = balance >= 0 ? '#10b981' : '#ef4444';
            
            let entidadText = '—';
            let entidadIcon = '';
            let entidadStyle = 'color:#94a3b8;';

            if (t.chofer) {
                entidadText = t.chofer;
                entidadIcon = '<i class="fas fa-truck" style="margin-right:4px;"></i>';
                entidadStyle = 'background:#eff6ff; color:#1e40af; padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; display:inline-flex; align-items:center;';
            } else if (t.customer) { // Customer or Seller depending on context
                entidadText = t.customer;
                if (t.descripcion && t.descripcion.toLowerCase().includes('release')) {
                    entidadIcon = '<i class="fas fa-building" style="margin-right:4px;"></i>';
                    entidadStyle = 'background:#f8fafc; color:#475569; border: 1px solid #e2e8f0; padding:1px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; display:inline-flex; align-items:center;';
                } else {
                    entidadIcon = '<i class="fas fa-user" style="margin-right:4px;"></i>';
                    entidadStyle = 'background:#f0fdf4; color:#166534; padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; display:inline-flex; align-items:center;';
                }
            } else if (t.category && t.category !== 'Ledger Income' && t.category !== 'Ledger Expense') {
                entidadText = t.category;
                entidadIcon = '<i class="fas fa-tags" style="margin-right:4px;"></i>';
                entidadStyle = 'background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; display:inline-flex; align-items:center;';
            }

            const entidadCell = entidadText !== '—'
                ? `<span style="${entidadStyle}">${entidadIcon}${entidadText}</span>`
                : `<span style="color:#94a3b8;">—</span>`;

            const deleteBtn = (window.currentUserRole === 'admin')
                ? `<button onclick="window.deleteAccountingTx('${t.id}')" 
                       style="background:#fee2e2; border:none; color:#ef4444; width:28px; height:28px; border-radius:6px; cursor:pointer; transition:all 0.2s;"
                       title="Delete">
                       <i class="fas fa-trash-alt" style="font-size:0.7rem;"></i>
                   </button>`
                : '';

            return `
            <tr class="acct-table-row" style="transition: background 0.15s;">
                <td style="white-space:nowrap;">
                    <div style="font-weight:700; color:#1e293b; font-size:0.82rem;">${dateStr}</div>
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
                    <div style="font-weight:600; color:#1e293b; font-size:0.82rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${t.descripcion || ''}">${t.descripcion || '—'}</div>
                    ${t.referencia ? `<div style="color:#64748b; font-size:0.7rem;">${t.referencia}</div>` : ''}
                </td>
                <td style="text-align:center;">${entidadCell}</td>
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
        const monto      = parseFloat(document.getElementById('acct-form-monto')?.value) || 0;
        const descripcion = document.getElementById('acct-form-desc')?.value?.trim();
        const referencia  = document.getElementById('acct-form-ref')?.value?.trim();
        const chofer      = document.getElementById('acct-form-chofer')?.value?.trim();

        if (!monto || monto <= 0) return alert('Por favor ingresa un monto válido mayor que $0.');
        if (!descripcion)         return alert('Por favor ingresa una descripción.');

        const btn = document.getElementById('btn-acct-save-tx');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

        await window.logCashTransaction({ tipo, metodo, monto, descripcion, referencia, chofer });

        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> SAVE TRANSACTION'; }

        // Reset form
        ['acct-form-monto', 'acct-form-desc', 'acct-form-ref', 'acct-form-chofer'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        // Reload
        await loadAccountingData(true);
    };

    // =========================================================================
    // DELETE TRANSACTION (Admin only)
    // =========================================================================
    window.deleteAccountingTx = async function (id) {
        alert("Las transacciones mostradas aquí son un espejo de tus Órdenes, Gastos y Releases.\n\nPara eliminar una transacción, por favor bórrala desde su módulo original (Trips, Expenses o Releases).");
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
                            loadAccountingData();
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
