        async function loadExpensesData(force = false) {
            if (!force && window.currentExpenses && window.currentExpenses.length > 0) {
                renderExpensesHistory();
                return;
            }
            try {
                const data = await getExpenses();
                const mappedData = data.map(mapExpenseToArray);
                window.currentExpenses = mappedData; // Sync global cache
                renderExpensesHistory();
            } catch (err) {
                console.error("Error loading expenses:", err);
            }
        }
        window.loadExpensesData = loadExpensesData;

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
            const driverName = document.getElementById('exp-filter-driver')?.value;
            const search = (document.getElementById('exp-filter-search')?.value || '').toLowerCase();

            const filtered = (window.currentExpenses || []).filter(row => {
                const rowDate = row[0];
                const rowCat = row[1];
                const rowDesc = (row[2] || '').toLowerCase();
                const rowNote = (row[4] || '').toLowerCase();

                const matchDate = (!fromDate || rowDate >= fromDate) && (!toDate || rowDate <= toDate);
                const matchCat = !category || rowCat === category;
                const driverRegex = driverName ? new RegExp(`\\b${driverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
                const matchDriver = !driverName || driverRegex.test(rowDesc) || driverRegex.test(rowNote);
                const matchSearch = !search || rowDesc.includes(search) || rowNote.includes(search);

                return matchDate && matchCat && matchDriver && matchSearch;
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

            body.innerHTML = '';
            filtered.forEach((rowData) => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                const expenseId = rowData[5];
                
                // Create the same key for the current row
                const rowKey = rowData.slice(0, 5).map(val => (val || '').toString().trim().toUpperCase()).join('|');
                const isDuplicate = rowCounts[rowKey] > 1;

                // Highlight if duplicate found globally
                if (isDuplicate) {
                    tr.style.backgroundColor = '#fef2f2'; // Soft red background
                    tr.style.borderLeft = '4px solid #ef4444'; // Bright red indicator
                }

                if (window.editingExpenseId === expenseId) {
                    tr.classList.add('editing-row');
                }

                tr.onclick = () => window.editExpenseRow(rowData);

                rowData.slice(0, 5).forEach((text, i) => { // Show first 5 columns
                    const td = document.createElement('td');
                    td.textContent = (i === 0) ? window.formatDateMMDDYYYY(text) : text;
                    
                    if (i === 3) { // Amount
                        td.style.color = '#ef4444';
                        td.style.textAlign = 'right';
                    }

                    // If it's a strict duplicate, highlight the text
                    if (isDuplicate) {
                        td.style.color = (i === 3) ? '#b91c1c' : '#991b1b';
                        if (i === 2) td.style.fontWeight = '900'; // Make description boldest
                    }

                    tr.appendChild(td);
                });

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
                            currentExpenses = currentExpenses.filter(row => row[5] !== expenseId);
                            renderExpensesHistory();
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
                body.appendChild(tr);
            });

            calculateExpenseTotal();

            // Update Summary Card Counter
            const countEl = document.getElementById('expense-count-display');
            if (countEl) {
                countEl.textContent = filtered.length;
                // Visual feedback: red if filtering
                const isFiltered = fromDate || toDate || category || driverName || search;
                countEl.style.color = isFiltered ? '#ef4444' : '#1e293b';
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
            
            // Handle Category Selection
            let catFound = false;
            for (let opt of sel.options) {
                if (opt.value === cat) {
                    sel.value = cat;
                    catFound = true;
                    break;
                }
            }

            if (!catFound) {
                sel.value = 'Other';
            }
            document.getElementById('exp-other-desc').value = rowData[2] || '';
            window.toggleOtherExpense();

            const amountStr = (rowData[3] || '0').replace('$', '').replace(/,/g, '');
            document.getElementById('exp-amount').value = parseFloat(amountStr) || 0;
            document.getElementById('exp-note').value = rowData[4] || '';

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
            if (document.getElementById('exp-filter-driver')) document.getElementById('exp-filter-driver').value = '';
            if (document.getElementById('exp-filter-search')) document.getElementById('exp-filter-search').value = '';
            renderExpensesHistory();
        };

        function calculateExpenseTotal() {
            let total = 0;
            document.querySelectorAll('#expenses-body tr').forEach(row => {
                const amountStr = row.cells[3].textContent.replace('$', '').replace(/,/g, '');
                total += parseFloat(amountStr) || 0;
            });
            document.getElementById('exp-total-badge').textContent = `Total: $${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        function saveExpensesData() {
            // Obsolete now that we use Supabase
        }

        // PROFIT REPORT CALCULATIONS
        window.renderProfitReport = async function (tripsData = null) {
            try {
            // Ensure rentals data is loaded if we are going to use it independently
            if (typeof window.loadRentalsData === 'function' && (!window.currentRentals || window.currentRentals.length === 0)) {
                await window.loadRentalsData();
            }

            const dateFrom = document.getElementById('profit-date-from').value;
            const dateTo = document.getElementById('profit-date-to').value;

            // Show loading status on the button or title if possible
            const titleEl = document.querySelector('#profit-report-view h2');
            const originalTitle = titleEl ? titleEl.innerHTML : 'Financial Profit Report';
            if (titleEl) titleEl.innerHTML = 'Financial Profit Report <i class="fas fa-spinner fa-spin" style="font-size:1rem; margin-left: 10px;"></i>';

            // --- FETCH ALL LOGISTICS DATA directly from database ---
            let logisticsData = [];
            if (window.getAllTripsForProfit) {
                const financialData = await window.getAllTripsForProfit(dateFrom, dateTo);
                logisticsData = financialData.map(t => {
                    const row = new Array(63).fill('---');
                    row[1]  = t.date || '---';
                    row[41] = t.status || 'PENDING_PAYMENT';
                    row[53] = t.qty || 1;
                    row[20] = t.sales_price || 0;
                    row[12] = t.yard_services || 'NO';
                    row[13] = t.yard_rate || 0;
                    row[14] = t.price_per_day || 0;
                    row[15] = t.date_out || '---';
                    row[18] = t.trans_pay || 0;
                    row[16] = t.company || '---';
                    row[42] = (t.has_trans === 'YES' || t.has_trans === true) ? 'YES' : 'NO';
                    row[43] = (t.has_sales === 'YES' || t.has_sales === true) ? 'YES' : 'NO';
                    row[4]  = t.release_no || '---';
                    row[2]  = t.size || '---';
                    row[49] = t.take_tax || false;
                    row[50] = t.tax_percent || 0;
                    return row;
                });
            } else {
                logisticsData = tripsData || window.currentTrips || [];
            }

            if (titleEl) titleEl.innerHTML = originalTitle;

            const expensesData = window.currentExpenses || [];

            // 0. Build Release Lookup Map for Container Purchase Costs
            const relMap = new Map();
            (window.currentReleases || []).forEach(r => {
                if (r && r[0]) {
                    const rNo = r[0].toString().trim();
                    const existing = relMap.get(rNo) || { p20: 0, p40: 0, p45: 0 };
                    relMap.set(rNo, { 
                        p20: (parseFloat(r[8]) || 0) || existing.p20,
                        p40: (parseFloat(r[10]) || 0) || existing.p40,
                        p45: (parseFloat(r[12]) || 0) || existing.p45
                    });
                }
            });

            let totals = {
                sales: 0,        // Gross Sales Revenue (sales_price * qty)
                yard: 0,         // Yard / Storage income
                rentals: 0,      // PAID rentals income
                tulipan: 0,      // RP Tulipan transport revenue
                jr: 0,           // JR Super Crame transport revenue
                contractor: 0,   // Contractor transport revenue
                expenses: 0,     // Business expenses
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
                    const qty        = parseInt(row[53]) || 1;  // index 53: qty
                    const salesPrice = parseFloat(row[20]) || 0; // index 20: sales_price
                    const hasYard    = (row[12] === 'YES');       // index 12: yard_services
                    const hasTrans   = (row[42] === 'YES');       // index 42: has_trans
                    const hasSales   = (row[43] === 'YES');       // index 43: has_sales

                    // A. Sales Component — Gross Revenue = sales_price * qty
                    if (hasSales && salesPrice > 0) {
                        const relNo      = (row[4] || '').toString().trim();
                        const tripSize   = (row[2] || '').toString();
                        const releaseData = relMap.get(relNo);

                        let unitCost = 0;
                        if (releaseData) {
                            if (tripSize.includes('20'))      unitCost = releaseData.p20;
                            else if (tripSize.includes('40')) unitCost = releaseData.p40;
                            else if (tripSize.includes('45')) unitCost = releaseData.p45;

                            // Fallback if specific size price is 0
                            if (unitCost === 0) {
                                unitCost = releaseData.p20 || releaseData.p40 || releaseData.p45 || 0;
                            }
                        }

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

                        if (company === 'RP TULIPAN')       totals.tulipan    += (transVal || 0);
                        else if (company === 'JR SUPER CRAME') totals.jr      += (transVal || 0);
                        else if (company === 'CONTRACTOR')  totals.contractor += (transVal || 0);
                    }
                }
            });            // 1.5 Process Rentals Independently (Accumulated Total)
            if (window.currentRentals && window.calculateRentalCost) {
                window.currentRentals.forEach(row => {
                    const costInfo = window.calculateRentalCost(row.start_date, row.final_date, row.base_price, row.daily_rate, row.status, row.time_rent);
                    totals.rentals += costInfo.total;
                });
            }
            // 2. Process Business Expenses
            expensesData.forEach(row => {
                const rowDate = row[0];
                if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                    const amountStr = row[3] ? row[3].replace('$', '').replace(/,/g, '') : '0';
                    const amount = parseFloat(amountStr) || 0;
                    totals.expenses += amount;
                }
            });

            // 3. Final Summaries
            const totalRevenue = (totals.tulipan || 0) + (totals.jr || 0) + (totals.contractor || 0) + (totals.sales || 0) + (totals.yard || 0) + (totals.rentals || 0);
            const totalGlobalExpenses = (totals.expenses || 0);
            const netProfit = totalRevenue - totalGlobalExpenses - (totals.releases || 0);

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

            // 5. Update Breakdown List
            document.getElementById('val-sales').textContent = `$${totals.sales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            if (document.getElementById('val-yard'))       document.getElementById('val-yard').textContent       = `$${totals.yard.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            if (document.getElementById('val-rentals'))    document.getElementById('val-rentals').textContent    = `$${totals.rentals.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('val-tulipan').textContent    = `$${totals.tulipan.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('val-jr').textContent         = `$${totals.jr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('val-contractor').textContent = `$${totals.contractor.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            // Total row (sum of all revenue: sales + yard + rentals + tulipan + jr + contractor)
            if (document.getElementById('val-revenue-total')) document.getElementById('val-revenue-total').textContent = `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('val-expenses').textContent   = `$${totals.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            // Container Purchases — informational only, NOT subtracted from revenue or expenses
            if (document.getElementById('val-releases')) document.getElementById('val-releases').textContent = `$${totals.releases.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            // 6. Update Bar Chart
            const maxVal = Math.max(totalRevenue, totals.sales, totals.yard, totals.rentals, totals.tulipan, totals.jr, totals.contractor, totalGlobalExpenses, totals.releases, 1);
            if (document.getElementById('bar-sales'))      document.getElementById('bar-sales').style.width      = `${(totals.sales / maxVal) * 100}%`;
            if (document.getElementById('bar-yard'))       document.getElementById('bar-yard').style.width       = `${(totals.yard / maxVal) * 100}%`;
            if (document.getElementById('bar-rentals'))    document.getElementById('bar-rentals').style.width    = `${(totals.rentals / maxVal) * 100}%`;
            if (document.getElementById('bar-tulipan'))    document.getElementById('bar-tulipan').style.width    = `${(totals.tulipan / maxVal) * 100}%`;
            if (document.getElementById('bar-jr'))         document.getElementById('bar-jr').style.width         = `${(totals.jr / maxVal) * 100}%`;
            if (document.getElementById('bar-contractor')) document.getElementById('bar-contractor').style.width = `${(totals.contractor / maxVal) * 100}%`;
            if (document.getElementById('bar-expenses'))   document.getElementById('bar-expenses').style.width   = `${(totalGlobalExpenses / maxVal) * 100}%`;
            if (document.getElementById('bar-releases'))   document.getElementById('bar-releases').style.width   = `${(totals.releases / maxVal) * 100}%`;
            } catch (err) {
                console.error("CRITICAL ERROR in renderProfitReport:", err);
            }
        };

        window.resetProfitFilters = function () {
            document.getElementById('profit-date-from').value = '';
            document.getElementById('profit-date-to').value = '';
            renderProfitReport();
        };
