        // --- Expense → Profit Report allocation ---
        window.EXPENSE_PROFIT_LINES = [
            { id: 'sales', label: 'Sales', short: 'Sales', color: '#f97316' },
            { id: 'yard', label: 'Yard Services', short: 'Yard', color: '#22c55e' },
            { id: 'rentals', label: 'Rentals', short: 'Rentals', color: '#f59e0b' },
            { id: 'tulipan', label: 'RP Tulipan', short: 'RP Tulipan', color: '#2dd4bf' },
            { id: 'jr', label: 'JR Super Crane', short: 'JR Crane', color: '#3b82f6' },
            { id: 'contractor', label: 'Contractor', short: 'Contractor', color: '#a855f7' },
            { id: 'storage_tulipan', label: 'Storage RPTulipan', short: 'Stor. RP', color: '#6366f1' },
            { id: 'storage_yard', label: 'Storage Yard', short: 'Stor. Yard', color: '#10b981' },
            { id: 'custom_invoices', label: 'Custom Invoices', short: 'Custom Inv.', color: '#0ea5e9' },
            { id: 'overhead', label: 'Overhead / General', short: 'Overhead', color: '#64748b' }
        ];

        const OVERHEAD_CATEGORIES = new Set([
            'utilities', 'taxes/licenses', 'insurance', 'payroll', 'rent',
            'office/supplies', 'marketing/ads', 'professional services'
        ]);

        window.getExpenseProfitLineMeta = function (id) {
            const key = (id || '').toString().trim();
            if (!key) return { id: '', label: 'Unassigned', short: 'Unassigned', color: '#f59e0b' };
            return window.EXPENSE_PROFIT_LINES.find(l => l.id === key) || { id: key, label: key, short: key, color: '#94a3b8' };
        };

        window.formatExpenseProfitLineLabel = function (id) {
            return window.getExpenseProfitLineMeta(id).label;
        };

        window.suggestExpenseProfitLine = function (category, description, note) {
            const cat = (category || '').toString().trim().toLowerCase();
            const blob = `${category || ''} ${description || ''} ${note || ''}`.toUpperCase();

            if (OVERHEAD_CATEGORIES.has(cat)) return 'overhead';

            if (blob.includes('JR SUPER') || blob.includes('JR CRANE')) return 'jr';
            if (blob.includes('CONTRACTOR')) return 'contractor';
            if (blob.includes('RP TULIPAN') || blob.includes('RPTULIPAN') || blob.includes('RP TULIPÁN')) return 'tulipan';
            if (blob.includes('STORAGE YARD')) return 'storage_yard';
            if (blob.includes('STORAGE') && blob.includes('TULIPAN')) return 'storage_tulipan';
            if (/\bRENTAL/.test(blob)) return 'rentals';
            if (/\bYARD\b/.test(blob) && !blob.includes('STORAGE')) return 'yard';
            if (/\bSALES?\b/.test(blob) || blob.includes('CONTAINER PURCHASE')) return 'sales';

            return '';
        };

        window.buildProfitLineSelectOptions = function (selected, includeEmpty) {
            const sel = (selected || '').toString().trim();
            let html = includeEmpty
                ? `<option value="">${includeEmpty === true ? 'Select profit line...' : includeEmpty}</option>`
                : '';
            window.EXPENSE_PROFIT_LINES.forEach(l => {
                html += `<option value="${l.id}" ${sel === l.id ? 'selected' : ''}>${l.label}</option>`;
            });
            return html;
        };

        window.fillExpenseProfitLineSelects = function () {
            const formSel = document.getElementById('exp-profit-line');
            if (formSel) {
                const prev = formSel.value;
                formSel.innerHTML = window.buildProfitLineSelectOptions(prev, 'Select profit line...');
                if (prev) formSel.value = prev;
            }
            const filterSel = document.getElementById('exp-filter-profit-line');
            if (filterSel) {
                const prev = filterSel.value;
                filterSel.innerHTML = `<option value="">All Profit Lines</option><option value="__unassigned__">Unassigned only</option>${window.buildProfitLineSelectOptions(prev, false)}`;
                if (prev) filterSel.value = prev;
            }
            const bulkSel = document.getElementById('bulk-profit-line-target');
            if (bulkSel) {
                const prev = bulkSel.value;
                bulkSel.innerHTML = window.buildProfitLineSelectOptions(prev, 'Assign to...');
                if (prev) bulkSel.value = prev;
            }
        };

        window.updateExpenseProfitLineBanner = function () {
            const banner = document.getElementById('expense-profit-line-banner');
            const countEl = document.getElementById('expense-unassigned-count');
            if (!banner || !countEl) return;
            const unassigned = (window.currentExpenses || []).filter(r => !(r[7] || '').toString().trim());
            const n = unassigned.length;
            countEl.textContent = String(n);
            banner.style.display = n > 0 ? 'flex' : 'none';
        };

        async function loadExpensesData(force = false) {
            if (!force && window.currentExpenses && window.currentExpenses.length > 0) {
                renderExpensesHistory();
                if (typeof window.refreshExpenseCategorySelects === 'function') window.refreshExpenseCategorySelects();
                if (typeof window.fillExpenseProfitLineSelects === 'function') window.fillExpenseProfitLineSelects();
                return;
            }
            try {
                const data = await getExpenses();
                const mappedData = data.map(mapExpenseToArray);
                window.currentExpenses = mappedData; // Sync global cache
                renderExpensesHistory();
                if (typeof window.refreshExpenseCategorySelects === 'function') window.refreshExpenseCategorySelects();
                if (typeof window.fillExpenseProfitLineSelects === 'function') window.fillExpenseProfitLineSelects();
            } catch (err) {
                console.error("Error loading expenses:", err);
            }
        }
        window.loadExpensesData = loadExpensesData;

        window.refreshExpensesModule = async function() {
            await window.withRefreshButton('btn-refresh-expenses', async () => {
                await loadExpensesData(true);
            }, 'expenses');
        };

        window.refreshProfitModule = async function() {
            await window.withRefreshButton('btn-refresh-profit', async () => {
                window.profitPurchaseTripCache = null;
                await loadExpensesData(true);
                if (typeof window.loadReleasesData === 'function') await window.loadReleasesData(true);
                if (typeof window.loadRentalsData === 'function') await window.loadRentalsData(true);
                if (typeof window.loadYardData === 'function') await window.loadYardData(true);
                if (typeof window.renderProfitReport === 'function') await window.renderProfitReport();
            }, 'profit');
        };

        window.updateExpenseDescriptionHistory = function() {
            const datalist = document.getElementById('expense-descriptions-list');
            if (!datalist) return;
            
            const uniqueDescriptions = new Set();
            (window.currentExpenses || []).forEach(row => {
                const desc = row[2]; // Index 2 is description
                if (desc && desc !== '---') {
                    uniqueDescriptions.add(desc.trim());
                }
            });
            
            datalist.innerHTML = '';
            [...uniqueDescriptions].sort().forEach(desc => {
                const option = document.createElement('option');
                option.value = desc;
                datalist.appendChild(option);
            });
        };

        window.renderExpensesHistory = function () {
            // Update description history whenever we render/refresh expenses
            window.updateExpenseDescriptionHistory();

            const body = document.getElementById('expenses-body');
            if (!body) return;

            const fromDate = document.getElementById('exp-filter-from')?.value;
            const toDate = document.getElementById('exp-filter-to')?.value;
            const category = document.getElementById('exp-filter-category')?.value;
            const profitLineFilter = document.getElementById('exp-filter-profit-line')?.value;
            const driverName = document.getElementById('exp-filter-driver')?.value;
            const search = (document.getElementById('exp-filter-search')?.value || '').toLowerCase();

            const filtered = (window.currentExpenses || []).filter(row => {
                const rowDate = row[0];
                const rowCat = row[1];
                const rowDesc = (row[2] || '').toLowerCase();
                const rowNote = (row[4] || '').toLowerCase();
                const rowLine = (row[7] || '').toString().trim();

                const matchDate = (!fromDate || rowDate >= fromDate) && (!toDate || rowDate <= toDate);
                const matchCat = !category || rowCat === category
                    || (window.normalizeExpenseCategory && window.normalizeExpenseCategory(rowCat) === category);
                const matchLine = !profitLineFilter
                    || (profitLineFilter === '__unassigned__' ? !rowLine : rowLine === profitLineFilter);
                const driverRegex = driverName ? new RegExp(`\\b${driverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
                const matchDriver = !driverName || driverRegex.test(rowDesc) || driverRegex.test(rowNote);
                const matchSearch = !search || rowDesc.includes(search) || rowNote.includes(search);

                return matchDate && matchCat && matchLine && matchDriver && matchSearch;
            });

            // --- DUPLICATE DETECTION LOGIC (Strict: All columns must match) ---
            const rowCounts = {};
            (window.currentExpenses || []).forEach(row => {
                // Create a unique key using the first 5 visible columns
                const key = row.slice(0, 5).map(val => (val || '').toString().trim().toUpperCase()).join('|');
                if (key) {
                    rowCounts[key] = (rowCounts[key] || 0) + 1;
                }
            });

            let pendingThisMonthCount = 0;
            const currentMonthStr = new Date().toISOString().substring(0, 7); // "YYYY-MM"

            body.innerHTML = '';
            const fragment = document.createDocumentFragment();
            filtered.forEach((rowData) => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                const expenseId = rowData[5];
                
                // Create the same key for the current row
                const rowKey = rowData.slice(0, 5).map(val => (val || '').toString().trim().toUpperCase()).join('|');
                const isDuplicate = rowCounts[rowKey] > 1;

                const amountStr = (rowData[3] || '0').toString().replace('$', '').replace(/,/g, '');
                const amount = parseFloat(amountStr) || 0;
                const rowDateStr = rowData[0] || '';
                const noteStr = (rowData[4] || '').toUpperCase();
                
                const isPending = (amount === 0) && (noteStr.includes('PENDIENTE') || rowDateStr.startsWith(currentMonthStr));
                
                if (isPending && rowDateStr.startsWith(currentMonthStr)) {
                    pendingThisMonthCount++;
                }

                // Highlight if duplicate found globally
                if (isDuplicate) {
                    tr.style.backgroundColor = '#fef2f2'; // Soft red background
                    tr.style.borderLeft = '4px solid #ef4444'; // Bright red indicator
                }

                // Highlight if it's a pending expense
                if (isPending) {
                    tr.style.backgroundColor = '#fff1f2'; // rose-50
                    tr.style.borderLeft = '4px solid #e11d48'; // rose-600
                }

                if (window.editingExpenseId === expenseId) {
                    tr.classList.add('editing-row');
                }

                tr.onclick = () => window.editExpenseRow(rowData);

                // DATE
                const tdDate = document.createElement('td');
                tdDate.textContent = window.formatDateMMDDYYYY(rowData[0]);
                if (isDuplicate || isPending) tdDate.style.color = '#991b1b';
                tr.appendChild(tdDate);

                // PROFIT LINE
                const tdLine = document.createElement('td');
                const lineMeta = window.getExpenseProfitLineMeta(rowData[7]);
                const lineAssigned = !!(rowData[7] || '').toString().trim();
                tdLine.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;font-size:0.72rem;font-weight:800;background:${lineAssigned ? lineMeta.color + '22' : '#fef3c7'};color:${lineAssigned ? lineMeta.color : '#b45309'};border:1px solid ${lineAssigned ? lineMeta.color + '55' : '#fcd34d'};">${lineMeta.short}</span>`;
                tr.appendChild(tdLine);

                // CATEGORY
                const tdCat = document.createElement('td');
                tdCat.textContent = rowData[1];
                if (isDuplicate || isPending) tdCat.style.color = '#991b1b';
                tr.appendChild(tdCat);

                // DESCRIPTION
                const tdDesc = document.createElement('td');
                tdDesc.textContent = rowData[2];
                if (isDuplicate || isPending) {
                    tdDesc.style.color = '#991b1b';
                    tdDesc.style.fontWeight = '900';
                }
                tr.appendChild(tdDesc);

                // AMOUNT
                const tdAmt = document.createElement('td');
                tdAmt.textContent = rowData[3];
                tdAmt.style.color = (isDuplicate || isPending) ? '#b91c1c' : '#ef4444';
                tdAmt.style.textAlign = 'right';
                tr.appendChild(tdAmt);

                // Payment Method Badge (index 6)
                const pmTd = document.createElement('td');
                pmTd.style.display = 'flex';
                pmTd.style.justifyContent = 'center';
                pmTd.style.alignItems = 'center';
                pmTd.style.height = '100%';
                
                const pm = rowData[6] || 'cash';
                if (pm === 'cash') {
                    pmTd.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#15803d;padding:3px 8px;border-radius:6px;font-size:0.72rem;font-weight:800;margin:auto;"><i class="fas fa-money-bill-wave"></i> CASH</span>`;
                } else {
                    pmTd.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;background:#dbeafe;color:#1d4ed8;padding:3px 8px;border-radius:6px;font-size:0.72rem;font-weight:800;margin:auto;"><i class="fas fa-university"></i> BANK</span>`;
                }
                tr.appendChild(pmTd);

                // Note (index 4)
                const noteTd = document.createElement('td');
                noteTd.textContent = rowData[4];
                tr.appendChild(noteTd);

                // Action Cell (Delete using expense_id at rowData[5])
                const actionsTd = document.createElement('td');
                actionsTd.onclick = (e) => e.stopPropagation(); // Don't trigger edit when deleting

                if (window.currentUserRole === 'admin') {
                    const delBtn = document.createElement('button');
                    delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                    delBtn.className = 'btn-delete-row';
                    delBtn.title = "Delete Expense";
                    delBtn.onclick = async () => {
                        if (!confirm('Are you sure you want to delete this expense?')) return;
                        try {
                            await deleteExpense(expenseId);
                            // Update local state instead of full reload
                            window.currentExpenses = window.currentExpenses.filter(row => row[5] !== expenseId);
                            renderExpensesHistory();

                            // Sync al Cash Ledger local, sin query a Supabase
                            if (window.syncExpenseToLedger) window.syncExpenseToLedger({ id: expenseId }, 'delete');
                        } catch (e) {
                            console.error("Error deleting expense:", e);
                            alert("Failed to delete expense.");
                        }
                    };
                    actionsTd.appendChild(delBtn);
                } else {
                    actionsTd.textContent = '---';
                }
                tr.appendChild(actionsTd);
                fragment.appendChild(tr);
            });
            body.appendChild(fragment);

            calculateExpenseTotal(filtered);

            // Update Summary Card Counter
            const countEl = document.getElementById('expense-count-display');
            if (countEl) {
                countEl.textContent = filtered.length;
                // Visual feedback: red if filtering
                const isFiltered = fromDate || toDate || category || profitLineFilter || driverName || search;
                countEl.style.color = isFiltered ? '#ef4444' : '#1e293b';
            }

            window.updateExpenseProfitLineBanner();

            // Update Global Expense Banner
            const expenseBanner = document.getElementById('global-expense-banner');
            const expenseCountSpan = document.getElementById('pending-expenses-count');
            if (expenseBanner && expenseCountSpan) {
                if (pendingThisMonthCount > 0) {
                    expenseCountSpan.textContent = pendingThisMonthCount;
                    expenseBanner.style.display = 'flex';
                    expenseBanner.style.justifyContent = 'center';
                    expenseBanner.style.alignItems = 'center';
                    
                    if (document.body.classList.contains('banner-active')) {
                        expenseBanner.style.top = '45px';
                        document.body.style.paddingTop = '90px';
                        document.getElementById('header-nav').style.top = '90px';
                    } else {
                        expenseBanner.style.top = '0';
                        document.body.style.paddingTop = '45px';
                        document.getElementById('header-nav').style.top = '45px';
                    }
                } else {
                    expenseBanner.style.display = 'none';
                    if (document.body.classList.contains('banner-active')) {
                        document.body.style.paddingTop = '45px';
                        document.getElementById('header-nav').style.top = '45px';
                    } else {
                        document.body.style.paddingTop = '0';
                        document.getElementById('header-nav').style.top = '0';
                    }
                }
            }
        };

        window.editExpenseRow = function (rowData) {
            window.editingExpenseId = rowData[5];

            // Trigger re-render to highlight the row
            window.renderExpensesHistory();

            // Fill form
            document.getElementById('exp-date').value = rowData[0] || '';
            const cat = rowData[1];
            const sel = document.getElementById('exp-category');
            
            // Handle Category Selection — prefer official name when editing legacy rows
            if (sel) {
                const normalized = window.normalizeExpenseCategory ? window.normalizeExpenseCategory(cat) : cat;
                if (typeof window.refreshExpenseCategorySelects === 'function') window.refreshExpenseCategorySelects();
                sel.value = window.isOfficialExpenseCategory && window.isOfficialExpenseCategory(cat) ? cat : (normalized || cat || '');
                if (!sel.value && cat) {
                    // force legacy option
                    sel.innerHTML = (window.getOfficialExpenseCategoryOptionsHtml
                        ? window.getOfficialExpenseCategoryOptionsHtml(cat, 'Select category...')
                        : sel.innerHTML);
                    sel.value = cat;
                }
            }
            
            document.getElementById('exp-other-desc').value = rowData[2] || '';
            if (typeof window.toggleOtherExpense === 'function') window.toggleOtherExpense();

            const amountStr = (rowData[3] || '0').replace('$', '').replace(/,/g, '');
            document.getElementById('exp-amount').value = parseFloat(amountStr) || 0;
            document.getElementById('exp-note').value = rowData[4] || '';

            // Load payment method (index 6)
            const pm = rowData[6] || 'cash';
            if (window.selectExpensePaymentMethod) window.selectExpensePaymentMethod(pm);

            // Profit line (index 7)
            const lineSel = document.getElementById('exp-profit-line');
            if (lineSel) {
                const existing = (rowData[7] || '').toString().trim();
                const suggested = existing || window.suggestExpenseProfitLine(rowData[1], rowData[2], rowData[4]);
                lineSel.value = suggested;
            }

            // Update Button
            const btn = document.getElementById('btn-save-expense');
            if (btn) {
                btn.textContent = "Update Expense";
                btn.classList.add('btn-update');
            }
            
            // Scroll to form (for mobile)
            document.querySelector('.expenses-view aside')?.scrollTo(0, 0);
        };

        window.resetExpenseFilters = function () {
            if (document.getElementById('exp-filter-from')) document.getElementById('exp-filter-from').value = '';
            if (document.getElementById('exp-filter-to')) document.getElementById('exp-filter-to').value = '';
            if (document.getElementById('exp-filter-category')) document.getElementById('exp-filter-category').value = '';
            if (document.getElementById('exp-filter-profit-line')) document.getElementById('exp-filter-profit-line').value = '';
            if (document.getElementById('exp-filter-driver')) document.getElementById('exp-filter-driver').value = '';
            if (document.getElementById('exp-filter-search')) document.getElementById('exp-filter-search').value = '';
            renderExpensesHistory();
        };

        function calculateExpenseTotal(filteredRows) {
            let total = 0;
            const rows = filteredRows || window.currentExpenses || [];
            rows.forEach(row => {
                const amountStr = (row[3] || '0').toString().replace('$', '').replace(/,/g, '');
                total += parseFloat(amountStr) || 0;
            });
            const badge = document.getElementById('exp-total-badge');
            if (badge) {
                badge.textContent = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
        }

        function saveExpensesData() {
            // Obsolete now that we use Supabase
        }

        function parseYardNotes(notesStr) {
            let entryFee = 0;
            let dailyRate = 0;
            let exitDate = '';
            let cleanNote = notesStr || '';

            const isStorage = cleanNote.includes('[Storage Yard]');
            if (isStorage) {
                cleanNote = cleanNote.replace('[Storage Yard] ', '').replace('[Storage Yard]', '');
            }

            const entryMatch = cleanNote.match(/\[EntryFee:\s*([\d.]+)\]/);
            if (entryMatch) {
                entryFee = parseFloat(entryMatch[1]) || 0;
                cleanNote = cleanNote.replace(entryMatch[0], '');
            }

            const dailyMatch = cleanNote.match(/\[DailyRate:\s*([\d.]+)\]/);
            if (dailyMatch) {
                dailyRate = parseFloat(dailyMatch[1]) || 0;
                cleanNote = cleanNote.replace(dailyMatch[0], '');
            }

            const exitMatch = cleanNote.match(/\[ExitDate:\s*([\d\-]+)\]/);
            if (exitMatch) {
                exitDate = exitMatch[1].trim();
                cleanNote = cleanNote.replace(exitMatch[0], '');
            }

            cleanNote = cleanNote.replace(/\s+/g, ' ').trim();

            return {
                isStorage,
                entryFee,
                dailyRate,
                exitDate,
                cleanNote
            };
        }

        // PROFIT REPORT CALCULATIONS
        window.renderProfitReport = async function (tripsData = null) {
            try {
            // Ensure rentals and yard stock are loaded for accrued totals
            if (typeof window.loadRentalsData === 'function' && (!window.currentRentals || window.currentRentals.length === 0)) {
                await window.loadRentalsData();
            }
            const yardCache = (typeof window.getYardStockData === 'function') ? window.getYardStockData() : [];
            if (typeof window.loadYardData === 'function' && (!yardCache || yardCache.length === 0)) {
                await window.loadYardData();
            }

            const dateFrom = document.getElementById('profit-date-from').value;
            const dateTo = document.getElementById('profit-date-to').value;

            // Show loading status on the button or title if possible
            const titleEl = document.querySelector('#profit-report-view h2');
            if (titleEl) {
                // Remove any existing spinner before saving the original title
                const cleanTitle = titleEl.innerHTML.replace(/<i class="fas fa-spinner fa-spin".*?<\/i>/g, '').trim();
                titleEl.dataset.originalTitle = cleanTitle;
                titleEl.innerHTML = `${cleanTitle} <i class="fas fa-spinner fa-spin" style="font-size:1rem; margin-left: 10px;"></i>`;
            }

            // --- FETCH ALL LOGISTICS DATA directly from database ---
            let logisticsData = [];
            if (window.getAllTripsForProfit) {
                const financialData = await window.getAllTripsForProfit(dateFrom, dateTo);
                if (typeof window.mapTripToArray === 'function') {
                    logisticsData = financialData.map(window.mapTripToArray);
                } else {
                    console.error("mapTripToArray not found!");
                }
            } else {
                logisticsData = tripsData || window.currentTrips || [];
            }

            if (titleEl && titleEl.dataset.originalTitle) {
                titleEl.innerHTML = titleEl.dataset.originalTitle;
            }

            const expensesData = window.currentExpenses || [];

            // 0. Build Release Lookup Map for Container Purchase Costs
            const relMap = typeof window.buildReleasePriceMap === 'function'
                ? window.buildReleasePriceMap(window.currentReleases || [])
                : (() => {
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
                })();

            // Full trip history for Yard→Release purchase traceback (date filters must not hide origin trips)
            let purchaseTracePool = logisticsData;
            if (dateFrom || dateTo) {
                if (window.inventoryDataCache && window.inventoryDataCache.length) {
                    purchaseTracePool = window.inventoryDataCache;
                } else if (window.profitPurchaseTripCache && window.profitPurchaseTripCache.length) {
                    purchaseTracePool = window.profitPurchaseTripCache;
                } else if (typeof window.getAllTripsForProfit === 'function' && typeof window.mapTripToArray === 'function') {
                    const fullRaw = await window.getAllTripsForProfit();
                    window.profitPurchaseTripCache = (fullRaw || []).map(window.mapTripToArray);
                    purchaseTracePool = window.profitPurchaseTripCache;
                }
            } else {
                window.profitPurchaseTripCache = logisticsData;
            }

            let totals = {
                sales: 0,        // Gross Sales Revenue (sales_price * qty)
                yard: 0,         // Yard / Storage income
                rentals: 0,      // Accrued rental income from Rentals (by date, not payment)
                tulipan: 0,      // RP Tulipan transport revenue
                jr: 0,           // JR Super Crane transport revenue
                contractor: 0,   // Contractor transport revenue
                storageTulipan: 0, // Accrued RPTulipan yard (days + lifts)
                storageYard: 0,    // Accrued Storage Yard (days + lifts)
                customInvoices: 0, // Marked custom receipts from Docs
                expenses: 0,     // Business expenses (all)
                expenseByLine: {
                    sales: 0, yard: 0, rentals: 0, tulipan: 0, jr: 0, contractor: 0,
                    storage_tulipan: 0, storage_yard: 0, custom_invoices: 0, overhead: 0, unassigned: 0
                },
                releases: 0      // Informational: total container purchase cost in COMPLETE orders
            };

            // 1. Process Logistics Data (Trips) — only COMPLETE orders count
            logisticsData.forEach(row => {
                const rowDate = row[1];
                const orderStatus = (row[41] || '').toString().toUpperCase();

                // Only include orders marked as Complete, Paid or Delivered
                if (orderStatus !== 'COMPLETE' && orderStatus !== 'PAID' && orderStatus !== 'DELIVERED') return;

                // Date filter
                if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                    const serviceMode = (row[26] || '').toString().toUpperCase();
                    if (serviceMode === 'RENTAL INVOICE') {
                        return; // Rentals come from the Rentals module (accrued), not paid invoices
                    }
                    if (serviceMode === 'YARD INVOICE') {
                        return; // Storage comes from Yard Stock (accrued days + lifts), not paid invoices
                    }
                    
                    const qty        = parseInt(row[53]) || 1;  // index 53: qty
                    const salesPrice = parseFloat(row[20]) || 0; // index 20: sales_price
                    const yardVal    = parseFloat(row[13]) || 0;
                    const pricePerDay= parseFloat(row[14]) || 0;
                    const rawYard    = (row[12] || '').toString().trim().toUpperCase();
                    const hasYard    = (rawYard && rawYard !== 'NO' && rawYard !== '---') || yardVal > 0 || pricePerDay > 0;
                    const rawTrans   = (row[42] || '').toString().trim().toUpperCase();
                    const transVal   = parseFloat(row[18]) || 0;
                    const hasTrans   = (rawTrans && rawTrans !== 'NO' && rawTrans !== '---') || transVal > 0;
                    
                    const rawSales   = (row[43] || '').toString().trim().toUpperCase();
                    const hasSales   = (rawSales && rawSales !== 'NO' && rawSales !== '---') || salesPrice > 0;

                    // A. Sales Component — Gross Revenue = sales_price * qty
                    if (hasSales && salesPrice > 0) {
                        // Same purchase-cost resolution as Inventory (full history for Yard traceback)
                        const unitCost = (typeof window.resolveContainerPurchaseCost === 'function')
                            ? window.resolveContainerPurchaseCost(row, relMap, purchaseTracePool).unitCost
                            : 0;

                        const totalSales = (salesPrice || 0) * (qty || 1);
                        const totalCost  = (unitCost || 0) * (qty || 1);

                        totals.sales += totalSales;
                        totals.releases += totalCost; // Track total container cost
                    }

                    // B. Yard / Storage Component
                    if (hasYard) {
                        const yardVal     = parseFloat(row[13]) || 0;
                        const pricePerDay = parseFloat(row[14]) || 0;
                        let storage = 0;
                        if (pricePerDay > 0 && row[1] && row[15] && row[15] !== '---') {
                            const dateIn  = new Date(row[1]);
                            const dateOut = new Date(row[15]);
                            if (!isNaN(dateIn.getTime()) && !isNaN(dateOut.getTime())) {
                                const diffMs = (dateOut.getTime() - dateIn.getTime());
                                const days = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24))) || 0;
                                storage = pricePerDay * days;
                            }
                        }
                        totals.yard += ((yardVal || 0) + (storage || 0)) * (qty || 1);
                    }

                    // C. Transport Component — assign to company bucket
                    if (hasTrans) {
                        const transVal   = parseFloat(row[18]) || 0; // index 18: trans_pay
                        const company    = (row[16] || '').toString().toUpperCase(); // index 16: company
                        const totalTrans = transVal * qty; // Multiply by qty

                        if (company === 'RP TULIPAN')       totals.tulipan    += totalTrans;
                        else if (company === 'JR SUPER CRANE') totals.jr      += totalTrans;
                        else if (company === 'CONTRACTOR')  totals.contractor += totalTrans;
                    }
                }
            });
            // 1.5 Rental income from cycle invoices (exclude write-offs / complimentary)
            if (typeof window.loadRentalInvoiceTrips === 'function') {
                await window.loadRentalInvoiceTrips(false);
            }
            const rentalInvoices = (window.rentalInvoiceTrips && window.rentalInvoiceTrips.length)
                ? window.rentalInvoiceTrips
                : (logisticsData || []).filter(row => (row[26] || '').toString().toUpperCase() === 'RENTAL INVOICE');
            rentalInvoices.forEach(row => {
                const note = (row[25] || '').toString();
                if (/WRITE-?OFF|WAIVED|COMPLIMENTARY/i.test(note)) return;
                const periodStart = (row[28] && row[28] !== '---') ? row[28] : row[1];
                const periodEnd = (row[29] && row[29] !== '---') ? row[29] : periodStart;
                if (dateFrom && periodEnd && periodEnd < dateFrom) return;
                if (dateTo && periodStart && periodStart > dateTo) return;
                totals.rentals += parseFloat(row[27]) || 0;
            });
            // 2. Process Business Expenses (allocate by profit_line + category breakdown)
            const costsByLineCategory = {}; // { lineKey: { CategoryName: amount } }
            const bumpLineCat = (lineKey, category, amount) => {
                if (!costsByLineCategory[lineKey]) costsByLineCategory[lineKey] = {};
                const catName = (window.normalizeExpenseCategory
                    ? window.normalizeExpenseCategory(category)
                    : (category || 'Other')) || 'Other';
                costsByLineCategory[lineKey][catName] = (costsByLineCategory[lineKey][catName] || 0) + amount;
            };

            expensesData.forEach(row => {
                const rowDate = row[0];
                if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                    const amountStr = row[3] ? row[3].replace('$', '').replace(/,/g, '') : '0';
                    const amount = parseFloat(amountStr) || 0;
                    totals.expenses += amount;
                    const line = (row[7] || '').toString().trim();
                    const category = row[1];
                    if (line && totals.expenseByLine.hasOwnProperty(line)) {
                        totals.expenseByLine[line] += amount;
                        bumpLineCat(line, category, amount);
                    } else if (line) {
                        totals.expenseByLine.overhead += amount;
                        bumpLineCat('overhead', category, amount);
                    } else {
                        totals.expenseByLine.unassigned += amount;
                        bumpLineCat('unassigned', category, amount);
                    }
                }
            });
            totals.costsByLineCategory = costsByLineCategory;

            // 2.5 Accrued yard storage from Yard Stock (days + entry/exit lifts, by location)
            if (typeof window.getYardStockData === 'function' && typeof window.calculateDynamicYardCosts === 'function') {
                const yardItems = window.getYardStockData() || [];
                yardItems.forEach(item => {
                    if (typeof window.checkYardDateMatch === 'function' && !window.checkYardDateMatch(item, dateFrom, dateTo)) {
                        return;
                    }
                    const costs = window.calculateDynamicYardCosts(item, dateFrom || null, dateTo || null);
                    const isStorage = (item.notes || '').includes('[Storage Yard]');
                    if (isStorage) {
                        totals.storageYard += costs.totalCost || 0;
                    } else {
                        totals.storageTulipan += costs.totalCost || 0;
                    }
                });
            }

            if (typeof window.loadCustomReceiptsForProfit === 'function') {
                totals.customInvoices = await window.loadCustomReceiptsForProfit(dateFrom || '', dateTo || '');
            }

            // 3. Final Summaries
            const totalRevenue = (totals.tulipan || 0) + (totals.jr || 0) + (totals.contractor || 0) + (totals.sales || 0) + (totals.yard || 0) + (totals.rentals || 0) + (totals.storageTulipan || 0) + (totals.storageYard || 0) + (totals.customInvoices || 0);
            const totalGlobalExpenses = (totals.expenses || 0) + (totals.releases || 0);
            const netProfit = totalRevenue - totalGlobalExpenses;

            // 4. Update Summary Cards
            document.getElementById('total-revenue-val').textContent = `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('total-expenses-val').textContent = `$${totalGlobalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            const netEl = document.getElementById('net-profit-val');
            const profitCard = document.getElementById('profit-card-status');
            const percentEl = document.getElementById('net-profit-percent');

            netEl.textContent = `$${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            if (netProfit >= 0) {
                netEl.className = 'positive';
                profitCard.className = 'summary-card profit positive';
            } else {
                netEl.className = 'negative';
                profitCard.className = 'summary-card profit negative';
            }

            // Update Percentage Badge
            if (percentEl) {
                if (totalRevenue > 0) {
                    const margin = (netProfit / totalRevenue) * 100;
                    percentEl.textContent = `${margin >= 0 ? '+' : ''}${margin.toFixed(2)}%`;
                    percentEl.style.display = 'inline-flex';
                    percentEl.className = 'profit-percent-badge ' + (margin >= 0 ? 'positive' : 'negative');
                } else {
                    percentEl.style.display = 'none';
                }
            }

            // 5. Performance table — revenue / costs / net / margin% / share%
            // Sales costs include Container Purchases (COGS) so Sales margin is realistic.
            const money = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
            const ebl = totals.expenseByLine;
            const salesCosts = (ebl.sales || 0) + (totals.releases || 0);

            const serviceRows = [
                { key: 'sales', label: 'Total Sales', color: '#f59e0b', revenue: totals.sales, costs: salesCosts, costNote: totals.releases > 0 ? `incl. containers ${money(totals.releases)}` : '' },
                { key: 'yard', label: 'Yard Services', color: '#06b6d4', revenue: totals.yard, costs: ebl.yard || 0 },
                { key: 'rentals', label: 'Rentals', color: '#ec4899', revenue: totals.rentals, costs: ebl.rentals || 0 },
                { key: 'tulipan', label: 'RP Tulipan', color: '#2dd4bf', revenue: totals.tulipan, costs: ebl.tulipan || 0 },
                { key: 'jr', label: 'JR Super Crane', color: '#3b82f6', revenue: totals.jr, costs: ebl.jr || 0 },
                { key: 'contractor', label: 'Contractor', color: '#a855f7', revenue: totals.contractor, costs: ebl.contractor || 0 },
                { key: 'storage_tulipan', label: 'Storage RPTulipan', color: '#6366f1', revenue: totals.storageTulipan, costs: ebl.storage_tulipan || 0 },
                { key: 'storage_yard', label: 'Storage Yard', color: '#10b981', revenue: totals.storageYard, costs: ebl.storage_yard || 0 },
                { key: 'custom_invoices', label: 'Custom Invoices', color: '#0ea5e9', revenue: totals.customInvoices || 0, costs: ebl.custom_invoices || 0 }
            ];

            const maxMix = Math.max(...serviceRows.map(r => Math.max(r.revenue || 0, r.costs || 0)), totalGlobalExpenses, 1);

            const pctBadge = (pct, emptyLabel = '—') => {
                if (pct === null || pct === undefined || !isFinite(pct)) {
                    return `<span class="pp-pct muted">${emptyLabel}</span>`;
                }
                const cls = pct >= 0 ? 'positive' : 'negative';
                const sign = pct > 0 ? '+' : '';
                return `<span class="pp-pct ${cls}">${sign}${pct.toFixed(1)}%</span>`;
            };

            const renderServiceRow = (row) => {
                const net = (row.revenue || 0) - (row.costs || 0);
                const margin = row.revenue > 0 ? (net / row.revenue) * 100 : null;
                const share = totalRevenue > 0 ? ((row.revenue || 0) / totalRevenue) * 100 : 0;
                const revW = ((row.revenue || 0) / maxMix) * 100;
                const costW = ((row.costs || 0) / maxMix) * 100;
                const note = row.costNote
                    ? `<div class="pp-cost-note">${row.costNote}</div>`
                    : '';
                return `<tr class="pp-service-row" data-line="${row.key}">
                    <td class="col-line">
                        <div class="pp-line-cell"><span class="pp-dot" style="background:${row.color}"></span><span class="pp-label">${row.label}</span></div>
                    </td>
                    <td class="col-num">${money(row.revenue)}</td>
                    <td class="col-num cost">${row.costs > 0 ? '−' + money(row.costs) : '—'}${note}</td>
                    <td class="col-num net ${net >= 0 ? 'pos' : 'neg'}">${money(net)}</td>
                    <td class="col-pct">${pctBadge(margin)}</td>
                    <td class="col-pct"><span class="pp-share">${share.toFixed(1)}%</span></td>
                    <td class="col-bar">
                        <div class="pp-mix">
                            <div class="pp-mix-rev" style="width:${revW}%; background:${row.color}"></div>
                            <div class="pp-mix-cost" style="width:${costW}%"></div>
                        </div>
                    </td>
                </tr>`;
            };

            const renderCostOnlyRow = (opts) => {
                const amt = opts.amount || 0;
                if (opts.hideIfZero && amt <= 0) return '';
                const costW = (amt / maxMix) * 100;
                return `<tr class="pp-cost-row ${opts.extraClass || ''}" ${opts.id ? `id="${opts.id}"` : ''}>
                    <td class="col-line">
                        <div class="pp-line-cell"><span class="pp-dot" style="background:${opts.color}"></span><span class="pp-label">${opts.label}</span></div>
                    </td>
                    <td class="col-num muted">—</td>
                    <td class="col-num cost">−${money(amt)}</td>
                    <td class="col-num net neg">−${money(amt)}</td>
                    <td class="col-pct"><span class="pp-pct muted">—</span></td>
                    <td class="col-pct"><span class="pp-share muted">—</span></td>
                    <td class="col-bar">
                        <div class="pp-mix">
                            <div class="pp-mix-cost" style="width:${costW}%; background:${opts.color}"></div>
                        </div>
                    </td>
                </tr>`;
            };

            const body = document.getElementById('profit-performance-body');
            if (body) {
                let html = serviceRows.map(renderServiceRow).join('');

                html += `<tr class="pp-section-row"><td colspan="7">Company-level costs</td></tr>`;
                html += renderCostOnlyRow({
                    label: 'Overhead / General',
                    color: '#64748b',
                    amount: ebl.overhead || 0
                });
                html += renderCostOnlyRow({
                    label: 'Unassigned (assign in Expenses)',
                    color: '#f59e0b',
                    amount: ebl.unassigned || 0,
                    hideIfZero: true,
                    id: 'profit-unassigned-row',
                    extraClass: 'pp-unassigned'
                });

                html += `<tr class="pp-total-row">
                    <td class="col-line"><span class="pp-label">COMPANY TOTAL</span></td>
                    <td class="col-num">${money(totalRevenue)}</td>
                    <td class="col-num cost">−${money(totalGlobalExpenses)}</td>
                    <td class="col-num net ${netProfit >= 0 ? 'pos' : 'neg'}">${money(netProfit)}</td>
                    <td class="col-pct">${pctBadge(totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : null)}</td>
                    <td class="col-pct"><span class="pp-share">100%</span></td>
                    <td class="col-bar"></td>
                </tr>`;

                // Best margin callout among lines with meaningful revenue
                const ranked = serviceRows
                    .filter(r => (r.revenue || 0) > 0)
                    .map(r => ({
                        ...r,
                        net: (r.revenue || 0) - (r.costs || 0),
                        margin: (((r.revenue || 0) - (r.costs || 0)) / r.revenue) * 100
                    }))
                    .sort((a, b) => b.margin - a.margin);
                if (ranked.length > 0) {
                    const best = ranked[0];
                    html += `<tr class="pp-insight-row">
                        <td colspan="7">
                            Best margin: <strong>${best.label}</strong> at
                            <strong style="color:${best.margin >= 0 ? '#15803d' : '#b91c1c'}">${best.margin >= 0 ? '+' : ''}${best.margin.toFixed(1)}%</strong>
                            (Net ${money(best.net)}) · Largest share:
                            <strong>${[...serviceRows].sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0].label}</strong>
                        </td>
                    </tr>`;
                }

                body.innerHTML = html;
            }

            // Legacy hidden fields (compat)
            setText('val-sales', money(totals.sales));
            setText('val-yard', money(totals.yard));
            setText('val-rentals', money(totals.rentals));
            setText('val-tulipan', money(totals.tulipan));
            setText('val-jr', money(totals.jr));
            setText('val-contractor', money(totals.contractor));
            setText('val-storage-rptulipan', money(totals.storageTulipan));
            setText('val-storage-yard', money(totals.storageYard));
            setText('val-custom-invoices', money(totals.customInvoices || 0));
            setText('val-revenue-total', money(totalRevenue));
            setText('val-expenses', money(totals.expenses));
            setText('val-exp-overhead', money(ebl.overhead));
            setText('val-exp-unassigned', money(ebl.unassigned));
            setText('val-releases', money(totals.releases));
            setText('val-exp-sales', salesCosts > 0 ? `−${money(salesCosts)}` : '—');
            setText('val-net-sales', money((totals.sales || 0) - salesCosts));

            // Assignment progress for current profit date range
            const assignedAmt = totals.expenses - ebl.unassigned;
            const pctEl = document.getElementById('profit-expense-assign-pct');
            if (pctEl) {
                if (totals.expenses > 0) {
                    const pct = (assignedAmt / totals.expenses) * 100;
                    pctEl.textContent = `${pct.toFixed(0)}% expenses assigned to profit lines`;
                    pctEl.style.display = 'inline-flex';
                    pctEl.style.background = pct >= 95 ? '#dcfce7' : (pct >= 50 ? '#fef3c7' : '#fee2e2');
                    pctEl.style.color = pct >= 95 ? '#166534' : (pct >= 50 ? '#92400e' : '#991b1b');
                } else {
                    pctEl.style.display = 'none';
                }
            }

            // 6. Right panel — Where the money went (cost mix by category per line)
            const costMixEl = document.getElementById('profit-costmix-body');
            if (costMixEl) {
                const byLineCat = totals.costsByLineCategory || {};
                const mixSections = [
                    ...serviceRows.map(r => ({
                        key: r.key,
                        label: r.label,
                        color: r.color,
                        // Sales: merge expense categories + container purchases
                        extraItems: r.key === 'sales' && (totals.releases || 0) > 0
                            ? [{ name: 'Container Purchases', amount: totals.releases }]
                            : []
                    })),
                    { key: 'overhead', label: 'Overhead / General', color: '#64748b', extraItems: [] },
                    { key: 'unassigned', label: 'Unassigned', color: '#f59e0b', extraItems: [] }
                ];

                const buildItems = (section) => {
                    const map = { ...(byLineCat[section.key] || {}) };
                    (section.extraItems || []).forEach(it => {
                        map[it.name] = (map[it.name] || 0) + (it.amount || 0);
                    });
                    return Object.entries(map)
                        .map(([name, amount]) => ({ name, amount: amount || 0 }))
                        .filter(it => it.amount > 0)
                        .sort((a, b) => b.amount - a.amount);
                };

                let mixHtml = '';
                let anySection = false;
                mixSections.forEach(section => {
                    const items = buildItems(section);
                    if (items.length === 0) return;
                    anySection = true;
                    const lineTotal = items.reduce((s, it) => s + it.amount, 0);
                    const top = items[0];
                    mixHtml += `<div class="costmix-block">
                        <div class="costmix-block-head">
                            <span class="pp-dot" style="background:${section.color}"></span>
                            <span class="costmix-block-title">${section.label}</span>
                            <span class="costmix-block-total">${money(lineTotal)}</span>
                        </div>
                        <div class="costmix-rows">`;
                    items.forEach(it => {
                        const pct = lineTotal > 0 ? (it.amount / lineTotal) * 100 : 0;
                        mixHtml += `<div class="costmix-row">
                            <div class="costmix-row-top">
                                <span class="costmix-cat">${it.name}</span>
                                <span class="costmix-amt">−${money(it.amount)}</span>
                            </div>
                            <div class="costmix-bar-track">
                                <div class="costmix-bar-fill" style="width:${pct}%; background:${section.color}"></div>
                            </div>
                            <div class="costmix-pct">${pct.toFixed(1)}% of this line</div>
                        </div>`;
                    });
                    mixHtml += `</div>
                        <div class="costmix-top-note">Most spent: <strong>${top.name}</strong> (${((top.amount / lineTotal) * 100).toFixed(1)}%)</div>
                    </div>`;
                });

                if (!anySection) {
                    mixHtml = `<div class="costmix-empty">
                        No costs in this date range yet.<br>
                        Assign Profit Lines in Expenses to see the mix here.
                    </div>`;
                }
                costMixEl.innerHTML = mixHtml;
            }
            } catch (err) {
                console.error("CRITICAL ERROR in renderProfitReport:", err);
                const titleEl = document.querySelector('#profit-report-view h2');
                if (titleEl && titleEl.dataset.originalTitle) {
                    titleEl.innerHTML = titleEl.dataset.originalTitle;
                }
            }
        };

        window.resetProfitFilters = function () {
            document.getElementById('profit-date-from').value = '';
            document.getElementById('profit-date-to').value = '';
            renderProfitReport();
        };

        // --- Bulk assign profit lines for existing expenses ---
        window.openExpenseProfitLineAssignModal = function () {
            const modal = document.getElementById('expense-profit-line-assign-modal');
            if (!modal) return;
            if (typeof window.fillExpenseProfitLineSelects === 'function') window.fillExpenseProfitLineSelects();
            window.renderExpenseProfitLineAssignList();
            modal.style.display = 'flex';
        };

        window.closeExpenseProfitLineAssignModal = function () {
            const modal = document.getElementById('expense-profit-line-assign-modal');
            if (modal) modal.style.display = 'none';
        };

        window.renderExpenseProfitLineAssignList = function () {
            const body = document.getElementById('bulk-profit-line-body');
            if (!body) return;
            const onlyUnassigned = document.getElementById('bulk-only-unassigned')?.checked !== false;
            const catFilter = document.getElementById('bulk-filter-category')?.value || '';
            const rows = (window.currentExpenses || []).filter(r => {
                const line = (r[7] || '').toString().trim();
                if (onlyUnassigned && line) return false;
                if (catFilter && r[1] !== catFilter) return false;
                return true;
            });

            const catSel = document.getElementById('bulk-filter-category');
            if (catSel && catSel.options.length <= 1) {
                const cats = new Set();
                (window.currentExpenses || []).forEach(r => { if (r[1] && r[1] !== '---') cats.add(r[1]); });
                [...cats].sort().forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c;
                    catSel.appendChild(opt);
                });
            }

            body.innerHTML = '';
            if (rows.length === 0) {
                body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#64748b;">No expenses match this filter.</td></tr>`;
                const summary = document.getElementById('bulk-assign-summary');
                if (summary) summary.textContent = '0 expenses';
                return;
            }

            let sum = 0;
            rows.forEach(r => {
                const amountStr = (r[3] || '0').toString().replace('$', '').replace(/,/g, '');
                sum += parseFloat(amountStr) || 0;
                const tr = document.createElement('tr');
                const lineMeta = window.getExpenseProfitLineMeta(r[7]);
                const assigned = !!(r[7] || '').toString().trim();
                tr.innerHTML = `
                    <td style="text-align:center;"><input type="checkbox" class="bulk-pl-check" data-id="${r[5]}" checked></td>
                    <td>${window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(r[0]) : r[0]}</td>
                    <td>${r[1] || ''}</td>
                    <td>${(r[2] || '').toString().substring(0, 48)}</td>
                    <td style="text-align:right;color:#ef4444;font-weight:700;">${r[3]}</td>
                    <td><span style="font-size:0.7rem;font-weight:800;color:${assigned ? lineMeta.color : '#b45309'};">${lineMeta.short}</span></td>
                `;
                body.appendChild(tr);
            });
            const summary = document.getElementById('bulk-assign-summary');
            if (summary) {
                summary.textContent = `${rows.length} expenses · $${sum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            }
        };

        window.toggleBulkProfitLineChecks = function (checked) {
            document.querySelectorAll('.bulk-pl-check').forEach(cb => { cb.checked = !!checked; });
        };

        window.applyBulkExpenseProfitLine = async function () {
            const target = document.getElementById('bulk-profit-line-target')?.value;
            if (!target) {
                alert('Select a Profit Line to assign.');
                return;
            }
            const ids = [...document.querySelectorAll('.bulk-pl-check:checked')].map(cb => cb.getAttribute('data-id')).filter(Boolean);
            if (ids.length === 0) {
                alert('Select at least one expense.');
                return;
            }
            if (!confirm(`Assign ${ids.length} expense(s) to "${window.formatExpenseProfitLineLabel(target)}"?`)) return;

            const btn = document.getElementById('btn-apply-bulk-profit-line');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }
            try {
                if (!window.updateExpenseProfitLines) throw new Error('updateExpenseProfitLines not available');
                const updated = await window.updateExpenseProfitLines(ids, target);
                const byId = new Map((updated || []).map(e => [e.id, e]));
                window.currentExpenses = (window.currentExpenses || []).map(row => {
                    if (!ids.includes(row[5]) && !ids.includes(String(row[5]))) return row;
                    const fresh = byId.get(row[5]) || byId.get(String(row[5]));
                    if (fresh && window.mapExpenseToArray) return window.mapExpenseToArray(fresh);
                    const copy = row.slice();
                    copy[7] = target;
                    return copy;
                });
                window.renderExpensesHistory();
                window.renderExpenseProfitLineAssignList();
                if (typeof window.renderProfitReport === 'function') {
                    // soft refresh if profit view open
                    const profitView = document.getElementById('profit-report-view');
                    if (profitView && !profitView.classList.contains('hidden')) window.renderProfitReport();
                }
                alert(`Assigned ${ids.length} expense(s) to ${window.formatExpenseProfitLineLabel(target)}.`);
            } catch (err) {
                console.error(err);
                alert('Failed to assign profit lines. Did you run the SQL migration in Supabase?\n\n' + (err.message || err));
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Assign Selected'; }
            }
        };

        window.autoAssignSafeOverheadExpenses = async function () {
            const ids = (window.currentExpenses || [])
                .filter(r => !(r[7] || '').toString().trim())
                .filter(r => {
                    const suggested = window.suggestExpenseProfitLine(r[1], r[2], r[4]);
                    return suggested === 'overhead';
                })
                .map(r => r[5]);
            if (ids.length === 0) {
                alert('No unassigned expenses match safe overhead rules (Utilities, Taxes/Licenses, Insurance, Payroll).');
                return;
            }
            if (!confirm(`Auto-assign ${ids.length} expense(s) to Overhead / General?`)) return;
            try {
                const updated = await window.updateExpenseProfitLines(ids, 'overhead');
                const byId = new Map((updated || []).map(e => [e.id, e]));
                window.currentExpenses = (window.currentExpenses || []).map(row => {
                    if (!ids.includes(row[5]) && !ids.includes(String(row[5]))) return row;
                    const fresh = byId.get(row[5]) || byId.get(String(row[5]));
                    if (fresh && window.mapExpenseToArray) return window.mapExpenseToArray(fresh);
                    const copy = row.slice();
                    copy[7] = 'overhead';
                    return copy;
                });
                window.renderExpensesHistory();
                window.renderExpenseProfitLineAssignList();
                alert(`Assigned ${ids.length} expense(s) to Overhead.`);
            } catch (err) {
                console.error(err);
                alert('Auto-assign failed. Run supabase-add-expense-profit-line.sql in Supabase first.\n\n' + (err.message || err));
            }
        };

        // Populate profit-line dropdowns once DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                if (typeof window.fillExpenseProfitLineSelects === 'function') window.fillExpenseProfitLineSelects();
            });
        } else if (typeof window.fillExpenseProfitLineSelects === 'function') {
            window.fillExpenseProfitLineSelects();
        }
