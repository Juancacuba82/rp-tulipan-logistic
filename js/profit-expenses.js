        async function loadExpensesData() {
            try {
                const data = await getExpenses();
                currentExpenses = data.map(mapExpenseToArray);
                renderExpensesHistory();
            } catch (err) {
                console.error("Error loading expenses:", err);
            }
        }
        window.loadExpensesData = loadExpensesData;

        window.renderExpensesHistory = function () {
            const body = document.getElementById('expenses-body');
            if (!body) return;

            const fromDate = document.getElementById('exp-filter-from')?.value;
            const toDate = document.getElementById('exp-filter-to')?.value;
            const category = document.getElementById('exp-filter-category')?.value;
            const driverName = document.getElementById('exp-filter-driver')?.value;
            const search = (document.getElementById('exp-filter-search')?.value || '').toLowerCase();

            const filtered = (currentExpenses || []).filter(row => {
                const rowDate = row[0];
                const rowCat = row[1];
                const rowDesc = (row[2] || '').toLowerCase();
                const rowNote = (row[4] || '').toLowerCase();

                const matchDate = (!fromDate || rowDate >= fromDate) && (!toDate || rowDate <= toDate);
                const matchCat = !category || rowCat === category;
                const matchDriver = !driverName || rowDesc.includes(driverName.toLowerCase()) || rowNote.includes(driverName.toLowerCase());
                const matchSearch = !search || rowDesc.includes(search) || rowNote.includes(search);

                return matchDate && matchCat && matchDriver && matchSearch;
            });

            body.innerHTML = '';
            filtered.forEach((rowData) => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                const expenseId = rowData[5];

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
                            await loadExpensesData();
                        } catch (e) {
                            console.error("Error deleting expense:", e);
                            alert("Failed to delete expense from database.");
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
                document.getElementById('exp-other-desc').value = rowData[2] || '';
            } else {
                document.getElementById('exp-other-desc').value = '';
            }
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
        window.renderProfitReport = function () {
            const dateFrom = document.getElementById('profit-date-from').value;
            const dateTo = document.getElementById('profit-date-to').value;

            const logisticsData = currentTrips || [];
            const expensesData = currentExpenses || [];

            // 0. Build Release Lookup Map for Container Purchase Costs
            const relMap = new Map();
            currentReleases.forEach(r => {
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
                sales: 0,        // Net Sales Profit (sales_price - container_cost)
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

                // Only include orders marked as Complete (status value = 'PAID')
                if (orderStatus !== 'PAID') return;

                // Date filter
                if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                    const salesPrice = parseFloat(row[20]) || 0;
                    const hasYard    = (row[12] === 'YES');
                    const hasTrans   = (row[42] === 'YES');
                    const hasSales   = (row[43] === 'YES');

                    // A. Sales Component — Net profit = (sales_price - unitCost) * qty
                    if (hasSales && salesPrice > 0) {
                        const relNo      = (row[4] || '').toString().trim();
                        const tripSize   = (row[2] || '').toString();
                        const qty        = parseInt(row[53]) || 1; // index 53 is qty
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

                        const totalSales = salesPrice * qty;
                        const totalCost  = unitCost * qty;
                        const salesProfit = totalSales - totalCost;

                        totals.sales += salesProfit;
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
                            const days = Math.max(0, Math.round((dateOut - dateIn) / (1000 * 60 * 60 * 24)));
                            storage = pricePerDay * days;
                        }
                        totals.yard += yardVal + storage;
                    }

                    // C. Transport Component — assign to company bucket
                    if (hasTrans) {
                        const transVal = parseFloat(row[18]) || 0;
                        const company  = (row[16] || '').toString().toUpperCase();
                        if (company === 'RP TULIPAN')       totals.tulipan    += transVal;
                        else if (company === 'JR SUPER CRAME') totals.jr      += transVal;
                        else if (company === 'CONTRACTOR')  totals.contractor += transVal;
                    }
                }
            });

            // 1.5 Process PAID Rentals
            if (window.currentRentals && window.calculateRentalCost) {
                window.currentRentals.forEach(row => {
                    if (row.payment_status === 'PAID') {
                        const rowDate = row.start_date;
                        if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                            const costInfo = window.calculateRentalCost(row.start_date, row.final_date, row.base_price, row.daily_rate, row.status, row.time_rent);
                            totals.rentals += costInfo.total;
                        }
                    }
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
            const totalRevenue = totals.tulipan + totals.jr + totals.contractor + totals.sales + totals.yard + totals.rentals;
            const totalGlobalExpenses = totals.expenses;
            const netProfit = totalRevenue - totalGlobalExpenses;

            // 4. Update Summary Cards
            document.getElementById('total-revenue-val').textContent = `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('total-expenses-val').textContent = `$${totalGlobalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            const netEl = document.getElementById('net-profit-val');
            const profitCard = document.getElementById('profit-card-status');
            netEl.textContent = `$${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            if (netProfit >= 0) {
                netEl.className = 'positive';
                profitCard.className = 'summary-card profit positive';
            } else {
                netEl.className = 'negative';
                profitCard.className = 'summary-card profit negative';
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
        };

        window.resetProfitFilters = function () {
            document.getElementById('profit-date-from').value = '';
            document.getElementById('profit-date-to').value = '';
            renderProfitReport();
        };

