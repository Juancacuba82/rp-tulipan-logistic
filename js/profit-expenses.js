        async function loadExpensesData() {
            window.loadExpensesData = loadExpensesData;
            const body = document.getElementById('expenses-body');
            if (!body) return;

            try {
                const data = await getExpenses();
                currentExpenses = data.map(mapExpenseToArray);

                body.innerHTML = '';
                currentExpenses.forEach((rowData) => {
                    const tr = document.createElement('tr');
                    rowData.slice(0, 5).forEach((text, i) => { // Show first 5 columns
                        const td = document.createElement('td');
                        td.textContent = (i === 0) ? window.formatDateMMDDYYYY(text) : text;
                        tr.appendChild(td);
                    });

                    // Action Cell (Delete using expense_id at rowData[5])
                    const actionsTd = document.createElement('td');
                    if (window.currentUserRole === 'admin') {
                        const delBtn = document.createElement('button');
                        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                        delBtn.className = 'btn-cancel';
                        delBtn.style.padding = '5px 10px';
                        delBtn.onclick = async () => {
                            if (!confirm('Are you sure you want to delete this expense?')) return;
                            try {
                                const expenseId = rowData[5];
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
            } catch (err) {
                console.error("Error loading expenses:", err);
            }
        }

        function calculateExpenseTotal() {
            let total = 0;
            document.querySelectorAll('#expenses-body tr').forEach(row => {
                const amountStr = row.cells[3].textContent.replace('$', '').replace(/,/g, '');
                total += parseFloat(amountStr) || 0;
            });
            document.getElementById('exp-total-badge').textContent = `Total: $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
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

            // 0. Build Release Lookup Map for Costs
            const relMap = new Map();
            currentReleases.forEach(r => {
                if (r && r[0]) {
                    relMap.set(r[0].toString().trim(), { 
                        p20: parseFloat(r[8]) || 0,
                        p40: parseFloat(r[10]) || 0,
                        p45: parseFloat(r[12]) || 0
                    });
                }
            });

            let totals = {
                sales: 0,
                rentals: 0,
                yard: 0,
                tulipan: 0,
                jr: 0,
                contractor: 0,
                expenses: 0, 
                releases: 0, 
                payouts: 0   
            };

            // 1. Process Logistics Data (Trips)
            logisticsData.forEach(row => {
                const rowDate = row[1];
                if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                    const salesPrice = parseFloat(row[20]) || 0;
                    const isSalesPaid = (row[33] === 'PAID'); 
                    const isYardPaid = (row[30] === 'PAID');
                    const isRatePaid = (row[32] === 'PAID'); 

                    let orderProfit = 0;

                    // A. Sales Component
                    if (isSalesPaid) {
                        totals.sales += salesPrice; // Show Gross Sales
                        orderProfit += salesPrice;  // Gross goes to company
                    }
                    
                    // B. Yard Component
                    if (isYardPaid) {
                        const yardVal = parseFloat(row[13]) || 0; 
                        const pricePerDay = parseFloat(row[14]) || 0;
                        let storage = 0;
                        if (pricePerDay > 0 && row[1] && row[15] && row[15] !== '---') {
                            const dateIn = new Date(row[1]);
                            const dateOut = new Date(row[15]);
                            const days = Math.max(0, Math.round((dateOut - dateIn) / (1000 * 60 * 60 * 24)));
                            storage = pricePerDay * days;
                        }
                        const totalYard = yardVal + storage;
                        totals.yard += totalYard;
                        orderProfit += totalYard;
                    }

                    // C. Transport Component
                    if (isRatePaid) {
                        const transVal = parseFloat(row[18]) || 0;
                        orderProfit += transVal;
                    }

                    // D. Assign Gross Order Revenue to Company
                    const company = row[16] || '';
                    if (company === 'RP TULIPAN') totals.tulipan += orderProfit;
                    else if (company === 'JR SUPER CRAME') totals.jr += orderProfit;
                    else if (company === 'CONTRACTOR') totals.contractor += orderProfit;
                }
            });

            // 2. Process Releases (Investments / Purchases)
            currentReleases.forEach(row => {
                const rowDate = row[1];
                if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                    const initialQty = (parseInt(row[7]) || 0) + (parseInt(row[9]) || 0) + (parseInt(row[11]) || 0);
                    const unitPrice = parseFloat(row[8]) || parseFloat(row[10]) || parseFloat(row[12]) || 0;
                    const releaseTotal = initialQty * unitPrice;
                    totals.releases += releaseTotal;
                }
            });

            // 3. Process Business Expenses (Includes Driver Payouts)
            expensesData.forEach(row => {
                const rowDate = row[0];
                if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                    const amountStr = row[3] ? row[3].replace('$', '').replace(/,/g, '') : '0';
                    const amount = parseFloat(amountStr) || 0;
                    totals.expenses += amount;
                }
            });

            // 4. Final Summaries
            const totalRevenue = totals.tulipan + totals.jr + totals.contractor;
            const totalGlobalExpenses = totals.expenses + totals.releases;
            const netProfit = totalRevenue - totalGlobalExpenses;

            // 4. Update Summary Cards (Note: indexing shifted in original code)
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
            document.getElementById('val-yard').textContent = `$${totals.yard.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            document.getElementById('val-tulipan').textContent = `$${totals.tulipan.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('val-jr').textContent = `$${totals.jr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('val-contractor').textContent = `$${totals.contractor.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            
            // Costs
            document.getElementById('val-expenses').textContent = `$${totals.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('val-releases').textContent = `$${totals.releases.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            // 6. Update Simple Bar Chart
            const maxVal = Math.max(totals.sales, totals.yard, totals.tulipan, totals.jr, totals.contractor, totalGlobalExpenses, 1);
            if (document.getElementById('bar-sales')) document.getElementById('bar-sales').style.width = `${(totals.sales / maxVal) * 100}%`;
            if (document.getElementById('bar-yard')) document.getElementById('bar-yard').style.width = `${(totals.yard / maxVal) * 100}%`;
            if (document.getElementById('bar-tulipan')) document.getElementById('bar-tulipan').style.width = `${(totals.tulipan / maxVal) * 100}%`;
            if (document.getElementById('bar-jr')) document.getElementById('bar-jr').style.width = `${(totals.jr / maxVal) * 100}%`;
            if (document.getElementById('bar-contractor')) document.getElementById('bar-contractor').style.width = `${(totals.contractor / maxVal) * 100}%`;
            if (document.getElementById('bar-expenses')) document.getElementById('bar-expenses').style.width = `${(totalGlobalExpenses / maxVal) * 100}%`;
        };

        window.resetProfitFilters = function () {
            document.getElementById('profit-date-from').value = '';
            document.getElementById('profit-date-to').value = '';
            renderProfitReport();
        };

