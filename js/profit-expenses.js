        // --- Expense → Profit Report allocation (5 official profit lines) ---
        window.EXPENSE_PROFIT_LINES = [
            { id: 'rpt_transportation', label: 'RP TULIPAN TRANSPORTATION', short: 'TRANSPORT', color: '#2dd4bf' },
            { id: 'rpt_sales', label: 'RP TULIPAN SALES', short: 'SALES', color: '#f59e0b' },
            { id: 'rpt_operating', label: 'RP TULIPAN OPERATING EXPENSES', short: 'OPERATING', color: '#64748b' },
            { id: 'rpt_yard', label: 'RP TULIPAN YARD SERVICE', short: 'YARD', color: '#06b6d4' },
            { id: 'contractors', label: 'CONTRACTORS', short: 'CONTRACTORS', color: '#a855f7' }
        ];

        /** Revenue rows that receive equal shares of rpt_operating (no direct expense lines). */
        window.PROFIT_OPERATING_ALLOC_REVENUE_KEYS = [];
        const OPERATING_ALLOC_LABEL = 'Operating allocation (equal share)';

        window.PROFIT_LINE_LEGACY_TO_CANONICAL = {
            sales: 'rpt_sales',
            yard: 'rpt_yard',
            tulipan: 'rpt_transportation',
            overhead: 'rpt_operating',
            contractor: 'contractors',
            jr: 'rpt_transportation',
            rentals: 'rpt_sales',
            storage_tulipan: 'rpt_yard',
            storage_yard: 'rpt_yard',
            custom_invoices: 'rpt_sales'
        };

        window.normalizeExpenseProfitLine = function (line) {
            const key = (line || '').toString().trim();
            if (!key) return '';
            if (window.PROFIT_LINE_LEGACY_TO_CANONICAL[key]) {
                return window.PROFIT_LINE_LEGACY_TO_CANONICAL[key];
            }
            if (window.EXPENSE_PROFIT_LINES.some(l => l.id === key)) return key;
            return '';
        };

        const OVERHEAD_CATEGORIES = new Set([
            'utilities', 'taxes/licenses', 'insurance', 'payroll', 'rent',
            'office/supplies', 'marketing/ads', 'professional services',
            'yard rent', 'software & apps', 'office / yard supplies', 'tools',
            'containers supplies', 'marketing', 'other expenses'
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

            if (OVERHEAD_CATEGORIES.has(cat)) return 'rpt_operating';
            if (cat === 'fuel' || cat === 'diesel') return 'rpt_transportation';
            if (cat === 'commission') return 'rpt_sales';
            if (cat === 'driver payment') {
                if (/\bCONTRACTOR\b|\bEXTERNAL\b|\b1099\b/i.test(blob)) return 'contractors';
                return 'rpt_transportation';
            }

            if (blob.includes('CONTRACTOR') && (cat === 'driver payment' || /DRIVER|PAYMENT|SETTLEMENT/.test(blob))) {
                return 'contractors';
            }
            if (/\bYARD\b/.test(blob) && !blob.includes('STORAGE')) return 'rpt_yard';
            if (/\bSALES?\b/.test(blob) || blob.includes('CONTAINER PURCHASE')) return 'rpt_sales';
            if (blob.includes('RP TULIPAN') || blob.includes('RPTULIPAN') || blob.includes('RP TULIPÁN')) {
                return 'rpt_transportation';
            }

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

        window.refreshExpenseFormReadouts = function () {
            const setReadout = (selectId, readoutId) => {
                const sel = document.getElementById(selectId);
                const ro = document.getElementById(readoutId);
                if (!sel || !ro) return;
                if (!sel.value) {
                    ro.textContent = '';
                    return;
                }
                const opt = sel.options[sel.selectedIndex];
                ro.textContent = opt ? `Selected: ${opt.textContent}` : '';
            };
            setReadout('exp-profit-line', 'exp-profit-line-readout');
            setReadout('exp-category', 'exp-category-readout');
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
            if (typeof window.refreshExpenseFormReadouts === 'function') window.refreshExpenseFormReadouts();
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
                const canonLine = window.normalizeExpenseProfitLine
                    ? window.normalizeExpenseProfitLine(rowLine)
                    : rowLine;
                const matchLine = !profitLineFilter
                    || (profitLineFilter === '__unassigned__' ? !rowLine : canonLine === profitLineFilter);
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

            document.getElementById('exp-other-desc').value = rowData[2] || '';

            const amountStr = (rowData[3] || '0').replace('$', '').replace(/,/g, '');
            document.getElementById('exp-amount').value = parseFloat(amountStr) || 0;
            document.getElementById('exp-note').value = rowData[4] || '';

            // Load payment method (index 6)
            const pm = rowData[6] || 'cash';
            if (window.selectExpensePaymentMethod) window.selectExpensePaymentMethod(pm);

            // Profit line first (category dropdown depends on it)
            if (typeof window.fillExpenseProfitLineSelects === 'function') window.fillExpenseProfitLineSelects();
            const lineSel = document.getElementById('exp-profit-line');
            let profitLineVal = '';
            if (lineSel) {
                const existing = (rowData[7] || '').toString().trim();
                const suggested = existing || window.suggestExpenseProfitLine(rowData[1], rowData[2], rowData[4]);
                if (suggested) lineSel.value = suggested;
                if (existing && lineSel.value !== existing) {
                    const meta = window.getExpenseProfitLineMeta ? window.getExpenseProfitLineMeta(existing) : { label: existing };
                    const opt = document.createElement('option');
                    opt.value = existing;
                    opt.textContent = meta.label || existing;
                    opt.selected = true;
                    lineSel.appendChild(opt);
                    lineSel.value = existing;
                }
                profitLineVal = lineSel.value || '';
            }

            const sel = document.getElementById('exp-category');
            if (sel) {
                const mapped = window.mapCategoryForProfitLine
                    ? window.mapCategoryForProfitLine(cat, profitLineVal)
                    : (window.normalizeExpenseCategory ? window.normalizeExpenseCategory(cat) : cat);
                sel.innerHTML = window.getOfficialExpenseCategoryOptionsHtml
                    ? window.getOfficialExpenseCategoryOptionsHtml(mapped || cat, 'Select category...', profitLineVal)
                    : sel.innerHTML;
                const allowed = window.getExpenseCategoriesForProfitLine
                    ? window.getExpenseCategoriesForProfitLine(profitLineVal)
                    : [];
                if (mapped && allowed.includes(mapped)) sel.value = mapped;
                else if (cat && Array.from(sel.options).some(o => o.value === cat)) sel.value = cat;
                else if (mapped && Array.from(sel.options).some(o => o.value === mapped)) sel.value = mapped;
            }

            if (typeof window.toggleOtherExpense === 'function') window.toggleOtherExpense();

            if (typeof window.refreshExpenseFormReadouts === 'function') window.refreshExpenseFormReadouts();

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
                    rpt_transportation: 0,
                    rpt_sales: 0,
                    rpt_operating: 0,
                    rpt_yard: 0,
                    contractors: 0,
                    unassigned: 0
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
                    const rawLine = (row[7] || '').toString().trim();
                    const line = rawLine
                        ? (window.normalizeExpenseProfitLine ? window.normalizeExpenseProfitLine(rawLine) : rawLine)
                        : '';
                    const category = row[1];
                    if (line && totals.expenseByLine.hasOwnProperty(line)) {
                        totals.expenseByLine[line] += amount;
                        bumpLineCat(line, category, amount);
                    } else {
                        totals.expenseByLine.unassigned += amount;
                        bumpLineCat('unassigned', category, amount);
                    }
                }
            });

            const operatingPool = totals.expenseByLine.rpt_operating || 0;
            const operatingShare = operatingPool > 0 ? (operatingPool / 3) : 0;
            
            if (operatingShare > 0) {
                ['rpt_transportation', 'rpt_sales', 'rpt_yard'].forEach(line => {
                    totals.expenseByLine[line] += operatingShare;
                    bumpLineCat(line, 'OPERATING EXPENSES', operatingShare);
                });
            }

            totals.operatingPool = operatingPool;
            totals.operatingShare = operatingShare;
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

            // 5. Performance table — line / revenue
            const money = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
            const ebl = totals.expenseByLine;
            const opShare = totals.operatingShare || 0;
            const salesCosts = (ebl.rpt_sales || 0) + (totals.releases || 0);

            const serviceRows = [
                { key: 'sales', label: 'RP Tulipan Sales', color: '#f59e0b', revenue: totals.sales, costs: salesCosts },
                { key: 'yard', label: 'RP Tulipan Yard Service', color: '#06b6d4', revenue: totals.yard, costs: ebl.rpt_yard || 0 },
                { key: 'rentals', label: 'Rentals', color: '#ec4899', revenue: totals.rentals, costs: 0 },
                { key: 'tulipan', label: 'RP Tulipan Transportation', color: '#2dd4bf', revenue: totals.tulipan, costs: ebl.rpt_transportation || 0 },
                { key: 'jr', label: 'JR Super Crane', color: '#3b82f6', revenue: totals.jr, costs: 0 },
                { key: 'contractor', label: 'Contractors (transport revenue)', color: '#a855f7', revenue: totals.contractor, costs: (ebl.contractors || 0) },
                { key: 'storage_tulipan', label: 'Storage RPTulipan', color: '#6366f1', revenue: totals.storageTulipan, costs: 0 },
                { key: 'storage_yard', label: 'Storage Yard', color: '#10b981', revenue: totals.storageYard, costs: 0 },
                { key: 'custom_invoices', label: 'Custom Invoices', color: '#0ea5e9', revenue: totals.customInvoices || 0, costs: 0 }
            ];

            const renderServiceRow = (row) => {
                return `<tr class="pp-service-row" data-line="${row.key}">
                    <td class="col-line">
                        <div class="pp-line-cell"><span class="pp-dot" style="background:${row.color}"></span><span class="pp-label">${row.label}</span></div>
                    </td>
                    <td class="col-num">${money(row.revenue)}</td>
                </tr>`;
            };

            const renderCostOnlyRow = (opts) => {
                const amt = opts.amount || 0;
                if (opts.hideIfZero && amt <= 0) return '';
                return `<tr class="pp-cost-row ${opts.extraClass || ''}" ${opts.id ? `id="${opts.id}"` : ''}>
                    <td class="col-line">
                        <div class="pp-line-cell"><span class="pp-dot" style="background:${opts.color}"></span><span class="pp-label">${opts.label}</span></div>
                    </td>
                    <td class="col-num muted">—</td>
                </tr>`;
            };

            const body = document.getElementById('profit-performance-body');
            if (body) {
                let html = serviceRows.map(renderServiceRow).join('');

                html += `<tr class="pp-section-row"><td colspan="2">Company-level costs</td></tr>`;
                const operatingPool = totals.operatingPool || 0;
                if (operatingPool > 0) {
                    html += `<tr class="pp-insight-row pp-operating-note">
                        <td colspan="2">
                            <strong>RP Tulipan Operating expenses</strong> (${money(operatingPool)} in period) automatically prorated
                            <strong> equally</strong> across Sales, Yard, and Transport
                            (${money(totals.operatingShare)} each).
                        </td>
                    </tr>`;
                }
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
                </tr>`;

                // Best margin callout — use the 4 profit-line groups (not the 9 service rows)
                // so sub-lines like Rentals/JR/Storage don't inflate margins (they have costs=0)
                const profitLineMargins = [
                    { label: 'RP Tulipan Sales', revenue: (totals.sales || 0), costs: salesCosts },
                    { label: 'RP Tulipan Yard', revenue: (totals.yard || 0), costs: ebl.rpt_yard || 0 },
                    { label: 'RP Tulipan Transport', revenue: (totals.tulipan || 0) + (totals.jr || 0), costs: ebl.rpt_transportation || 0 },
                    { label: 'Contractors', revenue: totals.contractor || 0, costs: ebl.contractors || 0 }
                ];
                const ranked = profitLineMargins
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
                        <td colspan="2">
                            Best margin: <strong>${best.label}</strong> at
                            <strong style="color:${best.margin >= 0 ? '#15803d' : '#b91c1c'}">${best.margin >= 0 ? '+' : ''}${best.margin.toFixed(1)}%</strong>
                            (Net ${money(best.net)}) · Largest share:
                            <strong>${[...profitLineMargins].sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0].label}</strong>
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
            setText('val-exp-overhead', money(ebl.rpt_operating));
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

            // 6. Right panel — 4-part circle (profit lines) + Net Profit in the center
            const wheelEl = document.getElementById('profit-wheel-body');
            if (wheelEl) {
                const byLineCat = totals.costsByLineCategory || {};

                const moneyShort = (n) => {
                    const v = n || 0;
                    const sign = v < 0 ? '−' : '';
                    return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                };
                const esc = (s) => String(s || '')
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const isDarkHex = (hex) => {
                    const c = (hex || '#888').replace('#', '');
                    if (c.length !== 6) return false;
                    const r = parseInt(c.slice(0, 2), 16);
                    const g = parseInt(c.slice(2, 4), 16);
                    const b = parseInt(c.slice(4, 6), 16);
                    return (0.299 * r + 0.587 * g + 0.114 * b) < 160;
                };
                const polar = (cx, cy, r, deg) => {
                    const rad = (deg * Math.PI) / 180;
                    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
                };
                const donutSlice = (cx, cy, rInner, rOuter, a0, a1) => {
                    const o0 = polar(cx, cy, rOuter, a0);
                    const o1 = polar(cx, cy, rOuter, a1);
                    const i1 = polar(cx, cy, rInner, a1);
                    const i0 = polar(cx, cy, rInner, a0);
                    const largeArc = (a1 - a0) > 180 ? 1 : 0;
                    return `M ${o0.x.toFixed(2)} ${o0.y.toFixed(2)} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${o1.x.toFixed(2)} ${o1.y.toFixed(2)} L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${i0.x.toFixed(2)} ${i0.y.toFixed(2)} Z`;
                };

                const mixHex = (fromHex, toHex, t) => {
                    const parse = (hex) => {
                        const c = (hex || '#888888').replace('#', '');
                        return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
                    };
                    const a = parse(fromHex);
                    const b = parse(toHex);
                    const m = a.map((v, i) => Math.round(v + (b[i] - v) * t));
                    return `#${m.map(v => v.toString(16).padStart(2, '0')).join('')}`;
                };
                const expenseRed = (i, n) => {
                    const t = n <= 1 ? 0 : i / (n - 1);
                    return mixHex('#7f1d1d', '#fecaca', t);
                };
                const normDeg = (d) => ((d % 360) + 360) % 360;

                const mappedCatTotals = (lineId) => {
                    const raw = byLineCat[lineId] || {};
                    const official = (typeof window.getExpenseCategoriesForProfitLine === 'function')
                        ? window.getExpenseCategoriesForProfitLine(lineId)
                        : [];
                        
                    if (['rpt_transportation', 'rpt_sales', 'rpt_yard'].includes(lineId)) {
                        if (!official.includes('OPERATING EXPENSES')) {
                            official.push('OPERATING EXPENSES');
                        }
                    }

                    const sums = {};
                    official.forEach(name => { sums[name] = 0; });
                    Object.keys(raw).forEach(cat => {
                        const mapped = (typeof window.mapCategoryForProfitLine === 'function')
                            ? window.mapCategoryForProfitLine(cat, lineId)
                            : cat;
                        const hit = official.find(n => n.toLowerCase() === String(mapped || '').toLowerCase());
                        if (!hit) return;
                        sums[hit] = (sums[hit] || 0) + (raw[cat] || 0);
                    });
                    return { official, sums };
                };

                const lineSlices = (window.EXPENSE_PROFIT_LINES || []).filter(m => m.id !== 'rpt_operating').map(meta => {
                    let revenue = 0;
                    const extraCats = [];
                    // Transport outer total = RP Tulipan + Super Crane. Contractors stay their own wedge.
                    if (meta.id === 'rpt_transportation') revenue = (totals.tulipan || 0) + (totals.jr || 0);
                    else if (meta.id === 'rpt_sales') {
                        revenue = (totals.sales || 0);
                        if ((totals.releases || 0) > 0) {
                            extraCats.push({ name: 'Container Purchases', amount: totals.releases });
                        }
                    } else if (meta.id === 'rpt_yard') revenue = (totals.yard || 0);
                    else if (meta.id === 'contractors') revenue = totals.contractor || 0;

                    const { official, sums } = mappedCatTotals(meta.id);
                    extraCats.forEach(ex => {
                        const hit = official.find(n => n.toLowerCase() === ex.name.toLowerCase());
                        const key = hit || ex.name;
                        sums[key] = (sums[key] || 0) + (ex.amount || 0);
                    });

                    const expenseCats = official
                        .map(name => ({ name, amount: sums[name] || 0, kind: 'expense' }));
                    extraCats.forEach(ex => {
                        const existing = expenseCats.find(c => c.name.toLowerCase() === ex.name.toLowerCase());
                        if (existing) return;
                        expenseCats.push({ name: ex.name, amount: sums[ex.name] || ex.amount || 0, kind: 'expense' });
                    });
                    expenseCats.sort((a, b) => (b.amount || 0) - (a.amount || 0));

                    const extraCost = extraCats.reduce((s, c) => s + (c.amount || 0), 0);
                    const costs = (ebl[meta.id] || 0) + extraCost;
                    const net = revenue - costs;
                    const cats = expenseCats.concat([{ name: 'Profit', amount: net, kind: 'profit' }]);
                    return {
                        id: meta.id,
                        label: meta.label,
                        short: meta.short,
                        color: meta.color,
                        revenue,
                        costs,
                        net,
                        cats
                    };
                });

                // Rentals and Custom Invoices are standalone revenue (no expenses)
                // Add them back to netSum so wheel NET PROFIT matches the Summary Card
                const standaloneRevenue = (totals.rentals || 0) + (totals.customInvoices || 0) + (totals.storageTulipan || 0) + (totals.storageYard || 0);
                const netSum = lineSlices.reduce((s, sl) => s + (sl.net || 0), 0) + standaloneRevenue - (ebl.unassigned || 0);

                // Store globally so drill-down re-renders can access updated data
                window._profitWheelLineSlices = lineSlices;
                window._profitWheelNetSum = netSum;
                window._profitWheelStandaloneItems = [
                    { label: 'Rentals', amount: totals.rentals || 0, color: '#ec4899' },
                    { label: 'Custom Invoices', amount: totals.customInvoices || 0, color: '#0ea5e9' },
                    { label: 'Storage RPTulipan', amount: totals.storageTulipan || 0, color: '#6366f1' },
                    { label: 'Storage Yard', amount: totals.storageYard || 0, color: '#10b981' }
                ].filter(it => it.amount > 0);

                // Create / reuse floating tooltip element
                let tooltipEl = document.getElementById('profit-wheel-tooltip');
                if (!tooltipEl) {
                    tooltipEl = document.createElement('div');
                    tooltipEl.id = 'profit-wheel-tooltip';
                    tooltipEl.style.cssText = 'position:fixed;pointer-events:none;display:none;z-index:9999;background:#0f172a;color:#f8fafc;padding:10px 14px;border-radius:10px;font-size:0.82rem;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,0.45);max-width:240px;line-height:1.6;border:1px solid #1e293b;';
                    document.body.appendChild(tooltipEl);
                }

                // ── OVERVIEW (sin textos internos; tooltip al hover; clic para desglosar) ──
                window._renderProfitWheelOverview = function () {
                    const slices = window._profitWheelLineSlices;
                    const netSumVal = window._profitWheelNetSum;
                    const size = 760, pad = 110, cx = size / 2, cy = size / 2;
                    const rOuter = 268, rInner = 102, start0 = -90;
                    const sliceDeg = 360 / Math.max(slices.length, 1);

                    let svg = `
                    <style>
                    .profit-wheel-svg.is-hovering .pwh-group { opacity: 0.25; transition: opacity 0.3s ease, filter 0.3s ease; }
                    .profit-wheel-svg.is-hovering .pwh-group.is-active { opacity: 1; filter: drop-shadow(0 0 10px rgba(0,0,0,0.15)); }
                    .pwh-group { transition: opacity 0.3s ease, filter 0.3s ease; }
                    </style>
                    <svg class="profit-wheel-svg" viewBox="${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}" role="img" aria-label="Profit lines circle" style="cursor:pointer;">`;

                    const gapDeg = 0;

                    slices.forEach((sl, i) => {
                        const a0 = start0 + i * sliceDeg + gapDeg / 2;
                        const usableDeg = sliceDeg - gapDeg;
                        const a1 = a0 + usableDeg;
                        const nCats = Math.max(sl.cats.length, 1);
                        const catDeg = usableDeg / nCats;
                        const expenseCount = sl.cats.filter(c => c.kind !== 'profit').length;

                        svg += `<g class="pwh-group" data-line-id="${esc(sl.id)}">`;

                        // Porciones de sub-categoría — SIN etiquetas de texto
                        sl.cats.forEach((cat, ci) => {
                            const c0 = a0 + ci * catDeg;
                            const c1 = c0 + catDeg;
                            const fill = cat.kind === 'profit'
                                ? (cat.amount >= 0 ? '#16a34a' : '#b91c1c')
                                : expenseRed(ci, Math.max(expenseCount, 1));
                            const signed = cat.kind === 'profit'
                                ? moneyShort(cat.amount)
                                : (cat.amount ? '−' + moneyShort(cat.amount) : '');
                            svg += `<path class="profit-wheel-slice pwh-interactive"
                                d="${donutSlice(cx, cy, rInner, rOuter, c0, c1)}"
                                fill="${fill}"
                                data-line-id="${esc(sl.id)}"
                                data-line-label="${esc(sl.short)}"
                                data-line-revenue="${esc(moneyShort(sl.revenue))}"
                                data-cat="${esc(cat.name)}"
                                data-amount="${esc(signed)}"
                                data-kind="${cat.kind}"
                                style="cursor:pointer;">
                            </path>`;
                        });

                        // Divisores entre sub-categorías
                        sl.cats.forEach((_c, ci) => {
                            if (ci === 0) return;
                            const ang = a0 + ci * catDeg;
                            const p0 = polar(cx, cy, rInner, ang);
                            const p1 = polar(cx, cy, rOuter, ang);
                            svg += `<line x1="${p0.x.toFixed(1)}" y1="${p0.y.toFixed(1)}" x2="${p1.x.toFixed(1)}" y2="${p1.y.toFixed(1)}" stroke="#ffffff" stroke-width="2" pointer-events="none"/>`;
                        });

                        // Textos internos: Importe y Porcentaje (SIN nombres)
                        const totalAmt = sl.cats.reduce((sum, c) => sum + Math.abs(c.amount || 0), 0);
                        sl.cats.forEach((cat, ci) => {
                            const amt = cat.amount || 0;
                            if (amt === 0 && cat.kind !== 'profit') return;

                            const mid = a0 + (ci + 0.5) * catDeg;
                            const pt = polar(cx, cy, (rInner + rOuter) / 2, mid);
                            let rot = mid;
                            const nd = normDeg(mid);
                            if (nd > 90 && nd < 270) rot = mid + 180;
                            
                            const rawPct = totalAmt > 0 ? (Math.abs(amt) / totalAmt) * 100 : 0;
                            const pct = totalAmt > 0 ? rawPct.toFixed(2) + '%' : '';

                            const fill = cat.kind === 'profit'
                                ? '#16a34a'
                                : expenseRed(ci, Math.max(expenseCount, 1));
                            const dark = isDarkHex(fill);
                            const amtFill = cat.kind === 'profit'
                                ? (amt >= 0 ? '#dcfce7' : '#fee2e2')
                                : (dark ? '#fecaca' : '#7f1d1d');
                            const labelFill = dark ? '#f8fafc' : '#0f172a';
                            const amtText = cat.kind === 'profit'
                                ? moneyShort(amt)
                                : (amt > 0 ? `−${moneyShort(amt)}` : '');

                            svg += `<text class="profit-wheel-cat" transform="translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)}) rotate(${rot.toFixed(1)})" pointer-events="none" text-anchor="middle">
                                ${amtText ? `<tspan x="0" y="-2" fill="${amtFill}" font-weight="800" font-size="12">${amtText}</tspan>` : ''}
                                ${pct ? `<tspan x="0" y="12" fill="${labelFill}" font-weight="600" font-size="10">${pct}</tspan>` : ''}
                            </text>`;
                        });

                        // Borde de sección (colored separator)
                        svg += `<path class="profit-wheel-slice-stroke" d="${donutSlice(cx, cy, rInner, rOuter, a0, a1)}" style="stroke: #000000; stroke-width: 4px;" pointer-events="none"/>`;

                        // Etiquetas externas (nombre de línea + ingreso total)
                        const midOuter = start0 + i * sliceDeg + sliceDeg / 2;
                        const lp = polar(cx, cy, rOuter + 58, midOuter);
                        const nd = normDeg(midOuter);
                        let anchor = 'middle';
                        if (lp.x > cx + 10) anchor = 'start';
                        else if (lp.x < cx - 10) anchor = 'end';
                        svg += `<text class="profit-wheel-title" text-anchor="${anchor}" x="${lp.x.toFixed(1)}" y="${(lp.y - 8).toFixed(1)}" fill="#0f172a" pointer-events="none">${esc(sl.short)}</text>`;
                        svg += `<text class="profit-wheel-title-net" text-anchor="${anchor}" x="${lp.x.toFixed(1)}" y="${(lp.y + 12).toFixed(1)}" fill="#166534" pointer-events="none">${moneyShort(sl.revenue)}</text>`;

                        svg += `</g>`; // Cierra pwh-group
                    });

                    // Centro con NET PROFIT
                    const holeFill = netSumVal >= 0 ? '#ecfdf5' : '#fef2f2';
                    const holeText = netSumVal >= 0 ? '#166534' : '#991b1b';
                    svg += `<circle cx="${cx}" cy="${cy}" r="${rInner - 2}" fill="${holeFill}" stroke="#fff" stroke-width="4" pointer-events="none"/>`;
                    svg += `<text text-anchor="middle" x="${cx}" y="${cy - 10}" fill="#64748b" font-size="13" font-weight="800" pointer-events="none">NET PROFIT</text>`;
                    svg += `<text text-anchor="middle" x="${cx}" y="${cy + 20}" fill="${holeText}" font-size="22" font-weight="900" pointer-events="none">${moneyShort(netSumVal)}</text>`;
                    svg += `</svg>`;

                    // Standalone revenue items (no expenses) — shown absolute top-left
                    let standalone = '';
                    const stItems = window._profitWheelStandaloneItems || [];
                    if (stItems.length > 0) {
                        standalone += `<div style="position:absolute;top:0;left:0;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);z-index:10;">`;
                        standalone += `<div style="font-size:0.68rem;font-weight:700;color:#94a3b8;margin-bottom:8px;letter-spacing:0.05em;text-transform:uppercase;">Standalone Revenue (no expenses)</div>`;
                        stItems.forEach(it => {
                            standalone += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;">`;
                            standalone += `<span class="pp-dot" style="background:${it.color}"></span>`;
                            standalone += `<span style="font-size:0.82rem;font-weight:600;color:#334155;">${it.label}</span>`;
                            standalone += `<span style="margin-left:auto;font-size:0.88rem;font-weight:800;color:#166534;">${moneyShort(it.amount)}</span>`;
                            standalone += `</div>`;
                        });
                        standalone += `</div>`;
                    }

                    wheelEl.style.position = 'relative';
                    wheelEl.innerHTML = svg + standalone;

                    // Eventos: hover effect y tooltip
                    const svgEl = wheelEl.querySelector('svg');
                    if (svgEl) {
                        svgEl.addEventListener('mousemove', (e) => {
                            // Dimming de otras secciones
                            const group = e.target.closest('.pwh-group');
                            if (group) {
                                svgEl.classList.add('is-hovering');
                                svgEl.querySelectorAll('.pwh-group').forEach(g => {
                                    if (g === group) g.classList.add('is-active');
                                    else g.classList.remove('is-active');
                                });
                            } else {
                                svgEl.classList.remove('is-hovering');
                                svgEl.querySelectorAll('.pwh-group').forEach(g => g.classList.remove('is-active'));
                            }

                            // Lógica del Tooltip
                            const path = e.target.closest('.pwh-interactive');
                            if (!path) { tooltipEl.style.display = 'none'; return; }
                            const lineLabel = path.getAttribute('data-line-label');
                            const lineRevenue = path.getAttribute('data-line-revenue');
                            const cat = path.getAttribute('data-cat');
                            const amount = path.getAttribute('data-amount');
                            const kind = path.getAttribute('data-kind');
                            const isProfit = kind === 'profit';
                            const isNeg = (amount || '').includes('−');
                            tooltipEl.innerHTML = `
                                <div style="font-size:0.68rem;color:#64748b;margin-bottom:4px;letter-spacing:0.04em;">CLIC PARA DESGLOSAR</div>
                                <div style="font-weight:800;font-size:1rem;color:#f8fafc;margin-bottom:2px;">${lineLabel}</div>
                                <div style="font-size:0.72rem;color:#64748b;margin-bottom:8px;">Ingresos: ${lineRevenue}</div>
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                                    <span style="color:#cbd5e1;font-size:0.8rem;">${cat}</span>
                                    <span style="font-weight:800;font-size:0.9rem;color:${isProfit ? (isNeg ? '#f87171' : '#4ade80') : '#f87171'};">${amount || '—'}</span>
                                </div>`;
                            tooltipEl.style.display = 'block';
                            tooltipEl.style.left = (e.clientX + 18) + 'px';
                            tooltipEl.style.top = Math.max(8, e.clientY - 30) + 'px';
                        });
                        svgEl.addEventListener('mouseleave', () => { 
                            tooltipEl.style.display = 'none'; 
                            svgEl.classList.remove('is-hovering');
                            svgEl.querySelectorAll('.pwh-group').forEach(g => g.classList.remove('is-active'));
                        });
                        // Clic en porción → drill-down
                        svgEl.addEventListener('click', (e) => {
                            const path = e.target.closest('.pwh-interactive');
                            if (!path) return;
                            const lineId = path.getAttribute('data-line-id');
                            if (lineId) window._renderProfitWheelDrillDown(lineId);
                        });
                    }
                    // Clic en leyenda también abre drill-down
                    wheelEl.querySelectorAll('.profit-wheel-legend-clickable').forEach(el => {
                        el.addEventListener('click', () => {
                            const lineId = el.getAttribute('data-line-id');
                            if (lineId) window._renderProfitWheelDrillDown(lineId);
                        });
                    });
                };

                // ── DRILL-DOWN (la línea seleccionada llena 360°; porciones proporcionales) ──
                window._renderProfitWheelDrillDown = function (lineId) {
                    tooltipEl.style.display = 'none';
                    const slices = window._profitWheelLineSlices;
                    const sl = slices.find(s => s.id === lineId);
                    if (!sl) return;

                    const size = 760, pad = 110, cx = size / 2, cy = size / 2;
                    const rOuter = 268, rInner = 102, start0 = -90;

                    // Usar todas las categorías, igual que en la vista general (sin filtrar)
                    const catsRaw = sl.cats;
                    const expenseCount = catsRaw.filter(c => c.kind !== 'profit').length;
                    const totalAmt = catsRaw.reduce((s, c) => s + Math.abs(c.amount || 0), 0);

                    let svg = `<svg class="profit-wheel-svg" viewBox="${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}" role="img" aria-label="Desglose: ${esc(sl.label)}" style="cursor:default;">`;

                    let currentAngle = start0;

                    catsRaw.forEach((cat, ci) => {
                        const absAmt = Math.abs(cat.amount || 0);
                        const catDeg = totalAmt > 0 ? (absAmt / totalAmt) * 360 : (360 / Math.max(catsRaw.length, 1));
                        const c0 = currentAngle;
                        const c1 = c0 + catDeg;
                        currentAngle = c1;

                        const fill = cat.kind === 'profit'
                            ? (cat.amount >= 0 ? '#16a34a' : '#b91c1c')
                            : expenseRed(ci, Math.max(expenseCount, 1));
                        
                        const amt = cat.amount || 0;
                        const signed = cat.kind === 'profit'
                            ? moneyShort(amt)
                            : (amt > 0 ? `−${moneyShort(amt)}` : '');

                        svg += `<path class="profit-wheel-slice pwh-drill"
                            d="${donutSlice(cx, cy, rInner, rOuter, c0, c1)}"
                            fill="${fill}"
                            data-cat="${esc(cat.name)}"
                            data-amount="${esc(signed)}"
                            data-kind="${cat.kind}">
                        </path>`;

                        // Divisor al inicio de la porción
                        const pd0 = polar(cx, cy, rInner, c0);
                        const pd1 = polar(cx, cy, rOuter, c0);
                        svg += `<line x1="${pd0.x.toFixed(1)}" y1="${pd0.y.toFixed(1)}" x2="${pd1.x.toFixed(1)}" y2="${pd1.y.toFixed(1)}" stroke="#ffffff" stroke-width="2" pointer-events="none"/>`;

                        // Etiqueta (siempre mostrar, con nombre, monto y porcentaje)
                        const mid = (c0 + c1) / 2;
                        const pt = polar(cx, cy, (rInner + rOuter) / 2, mid);
                        let rot = mid;
                        if (normDeg(mid) > 90 && normDeg(mid) < 270) rot = mid + 180;
                        
                        const rawPct = (totalAmt > 0 && amt !== 0) ? (Math.abs(amt) / totalAmt) * 100 : 0;
                        const pct = (totalAmt > 0 && amt !== 0) ? rawPct.toFixed(2) + '%' : '';
                        
                        const labelFill = isDarkHex(fill) ? '#f8fafc' : '#0f172a';
                        const amtFill = cat.kind === 'profit'
                            ? (amt >= 0 ? '#dcfce7' : '#fee2e2')
                            : (isDarkHex(fill) ? '#fecaca' : '#7f1d1d');
                        const short = cat.name.length > 20 ? cat.name.slice(0, 18) + '…' : cat.name;
                        if (catDeg >= 15) {
                            svg += `<text class="profit-wheel-cat" transform="translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)}) rotate(${rot.toFixed(1)})" fill="${labelFill}" pointer-events="none" text-anchor="middle" font-size="15">
                                <tspan x="0" y="${signed || pct ? -12 : 3}" font-weight="700">${esc(short)}</tspan>
                                ${signed ? `<tspan x="0" y="8" fill="${amtFill}" font-weight="800" font-size="16">${esc(signed)}</tspan>` : ''}
                                ${pct ? `<tspan x="0" y="26" fill="${labelFill}" font-weight="700" font-size="14">${pct}</tspan>` : ''}
                            </text>`;
                        }
                    });

                    // Centro: botón volver + resumen de línea
                    const holeFill = sl.net >= 0 ? '#ecfdf5' : '#fef2f2';
                    const holeText = sl.net >= 0 ? '#166634' : '#991b1b';
                    svg += `<circle class="pwh-back-btn" cx="${cx}" cy="${cy}" r="${rInner - 2}" fill="${holeFill}" stroke="#fff" stroke-width="4" style="cursor:pointer;"/>`;
                    svg += `<text text-anchor="middle" x="${cx}" y="${cy - 30}" fill="#64748b" font-size="11" font-weight="700" pointer-events="none">← VOLVER</text>`;
                    svg += `<text text-anchor="middle" x="${cx}" y="${cy - 12}" fill="#0f172a" font-size="13" font-weight="900" pointer-events="none">${esc(sl.short.toUpperCase())}</text>`;
                    svg += `<text text-anchor="middle" x="${cx}" y="${cy + 8}" fill="#166534" font-size="11" font-weight="600" pointer-events="none">Rev: ${moneyShort(sl.revenue)}</text>`;
                    svg += `<text text-anchor="middle" x="${cx}" y="${cy + 26}" fill="${holeText}" font-size="18" font-weight="900" pointer-events="none">${moneyShort(sl.net)}</text>`;
                    svg += `</svg>`;

                    const backBtnHtml = `<div style="text-align:center;margin-top:10px;">
                        <button id="pwh-back-overview-btn" style="background:#f1f5f9;border:1.5px solid #cbd5e1;border-radius:8px;padding:7px 20px;font-size:0.82rem;font-weight:700;color:#334155;cursor:pointer;">← Volver al resumen</button>
                    </div>`;

                    wheelEl.innerHTML = svg + backBtnHtml;

                    const svgEl = wheelEl.querySelector('svg');
                    if (svgEl) {
                        svgEl.addEventListener('mousemove', (e) => {
                            const path = e.target.closest('.pwh-drill');
                            if (!path) { tooltipEl.style.display = 'none'; return; }
                            const cat = path.getAttribute('data-cat');
                            const amount = path.getAttribute('data-amount');
                            const kind = path.getAttribute('data-kind');
                            const isProfit = kind === 'profit';
                            const isNeg = (amount || '').includes('−');
                            tooltipEl.innerHTML = `
                                <div style="font-weight:800;font-size:0.95rem;color:#f8fafc;margin-bottom:4px;">${cat}</div>
                                <div style="font-size:1.05rem;font-weight:900;color:${isProfit ? (isNeg ? '#f87171' : '#4ade80') : '#f87171'};">${amount || '—'}</div>`;
                            tooltipEl.style.display = 'block';
                            tooltipEl.style.left = (e.clientX + 18) + 'px';
                            tooltipEl.style.top = Math.max(8, e.clientY - 30) + 'px';
                        });
                        svgEl.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
                        svgEl.addEventListener('click', (e) => {
                            if (e.target.closest('.pwh-back-btn')) window._renderProfitWheelOverview();
                        });
                    }
                    const backEl = document.getElementById('pwh-back-overview-btn');
                    if (backEl) backEl.addEventListener('click', () => window._renderProfitWheelOverview());
                };

                // Render inicial — modo overview
                window._renderProfitWheelOverview();
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
                    return suggested === 'rpt_operating';
                })
                .map(r => r[5]);
            if (ids.length === 0) {
                alert('No unassigned expenses match safe operating rules (Utilities, Taxes/Licenses, Insurance, Payroll).');
                return;
            }
            if (!confirm(`Auto-assign ${ids.length} expense(s) to RP Tulipan Operating expenses?`)) return;
            try {
                const updated = await window.updateExpenseProfitLines(ids, 'rpt_operating');
                const byId = new Map((updated || []).map(e => [e.id, e]));
                window.currentExpenses = (window.currentExpenses || []).map(row => {
                    if (!ids.includes(row[5]) && !ids.includes(String(row[5]))) return row;
                    const fresh = byId.get(row[5]) || byId.get(String(row[5]));
                    if (fresh && window.mapExpenseToArray) return window.mapExpenseToArray(fresh);
                    const copy = row.slice();
                    copy[7] = 'rpt_operating';
                    return copy;
                });
                window.renderExpensesHistory();
                window.renderExpenseProfitLineAssignList();
                alert(`Assigned ${ids.length} expense(s) to Operating expenses.`);
            } catch (err) {
                console.error(err);
                alert('Auto-assign failed. Run supabase-add-expense-profit-line.sql in Supabase first.\n\n' + (err.message || err));
            }
        };

        window.initProfitPanelToggles = function () {
            const wrap = document.getElementById('profit-panels-wrap');
            if (!wrap || wrap.dataset.toggleBound === '1') return;
            wrap.dataset.toggleBound = '1';
            const storageKey = 'profitReportPanelState';
            const labels = {
                perf: 'Performance by Service',
                wheel: 'Profit Lines Circle'
            };

            const readState = () => {
                try {
                    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
                    return { perf: !!saved.perf, wheel: !!saved.wheel };
                } catch (e) {
                    return { perf: false, wheel: false };
                }
            };

            const applyState = (state) => {
                wrap.classList.toggle('perf-collapsed', state.perf);
                wrap.classList.toggle('wheel-collapsed', state.wheel);
                wrap.querySelectorAll('[data-panel]').forEach((panel) => {
                    const key = panel.getAttribute('data-panel');
                    const collapsed = !!state[key];
                    panel.classList.toggle('is-collapsed', collapsed);
                    const btn = panel.querySelector(`[data-profit-panel="${key}"]`);
                    if (!btn) return;
                    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                    btn.title = collapsed ? `Show ${labels[key]}` : `Minimize ${labels[key]}`;
                    const icon = btn.querySelector('i');
                    if (icon) icon.className = collapsed ? 'fas fa-plus' : 'fas fa-minus';
                });
            };

            let state = readState();
            wrap.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-profit-panel]');
                if (!btn) return;
                const key = btn.getAttribute('data-profit-panel');
                if (key !== 'perf' && key !== 'wheel') return;
                state[key] = !state[key];
                try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (err) { /* ignore */ }
                applyState(state);
            });
            applyState(state);
        };

        // Populate profit-line dropdowns once DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                if (typeof window.fillExpenseProfitLineSelects === 'function') window.fillExpenseProfitLineSelects();
                if (typeof window.initProfitPanelToggles === 'function') window.initProfitPanelToggles();
            });
        } else {
            if (typeof window.fillExpenseProfitLineSelects === 'function') window.fillExpenseProfitLineSelects();
            if (typeof window.initProfitPanelToggles === 'function') window.initProfitPanelToggles();
        }
