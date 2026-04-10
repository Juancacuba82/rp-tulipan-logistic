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
                    rowData.slice(0, 5).forEach(text => { // Show first 5 columns
                        const td = document.createElement('td');
                        td.textContent = text;
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

            const logisticsData = currentTrips;
            const expensesData = currentExpenses;

            let totals = {
                sales: 0,
                rentals: 0,
                yard: 0,
                collects: 0,
                expenses: 0,
                releases: 0,
                tulipan: 0,
                contractor: 0
            };

            // 1. Calculate Revenue from Logistics (Fixed Indices matching mapTripToArray)
            // RULE: Only include an order in Profit Report if the finalization toggle (swish) is GREEN
            // row[41] = status — 'PAID' = green (finalized), 'PENDING_PAYMENT' = red (pending)
            logisticsData.forEach(row => {
                const rowDate = row[1];
                const isFinalized = (row[41] === 'PAID'); // The swish toggle state

                if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo) && isFinalized) {
                    // Sales Price
                    totals.sales += parseFloat(row[20]) || 0;  // sales_price at index 20

                    // Yard Services (yard_rate + daily storage)
                    totals.yard += parseFloat(row[13]) || 0;   // yard_rate at index 13

                    // Price per day × days (Date Out - Date In)
                    const pricePerDay = parseFloat(row[14]) || 0; // price_per_day at index 14
                    if (pricePerDay > 0 && row[1] && row[15] && row[15] !== '---') { // date_out at index 15
                        const dateIn = new Date(row[1]);
                        const dateOut = new Date(row[15]);
                        const days = Math.max(0, Math.round((dateOut - dateIn) / (1000 * 60 * 60 * 24)));
                        totals.yard += pricePerDay * days;
                    }

                    // Collections (Amount)
                    totals.collects += parseFloat(row[22]) || 0; // amount at index 22

                    // Transport: RP TULIPAN vs CONTRACTOR (company at index 16, trans_pay at 18, paid_driver at 24)
                    const company = row[16] || '';
                    const transPay = parseFloat(row[18]) || 0;
                    const driverPay = parseFloat(row[24]) || 0;
                    if (company === 'RP TULIPAN' || company === 'JR SUPER CRAME') {
                        totals.tulipan += (transPay - driverPay);
                    } else if (company === 'CONTRACTOR') {
                        totals.contractor += (transPay - driverPay);
                    }
                }
            });

            // 2. Calculate Expenses
            expensesData.forEach(row => {
                const rowDate = row[0];
                if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                    const amountStr = row[3] ? row[3].replace('$', '').replace(/,/g, '') : '0';
                    totals.expenses += parseFloat(amountStr) || 0;
                }
            });

            // 3. New: Calculate Release Costs (Container Purchases)
            currentReleases.forEach(row => {
                const rowDate = row[1];
                if ((!dateFrom || rowDate >= dateFrom) && (!dateTo || rowDate <= dateTo)) {
                    const q20 = parseFloat(row[6]) || 0;
                    const p20 = parseFloat(row[7]) || 0;
                    const q40 = parseFloat(row[8]) || 0;
                    const p40 = parseFloat(row[9]) || 0;
                    const q45 = parseFloat(row[10]) || 0;
                    const p45 = parseFloat(row[11]) || 0;
                    totals.releases += (q20 * p20) + (q40 * p40) + (q45 * p45);
                }
            });

            const totalRevenue = totals.sales + totals.yard + totals.collects + totals.tulipan + totals.contractor;
            const totalGlobalExpenses = totals.expenses + totals.releases;
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
            document.getElementById('val-yard').textContent = `$${totals.yard.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            document.getElementById('val-tulipan').textContent = `$${totals.tulipan.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('val-contractor').textContent = `$${totals.contractor.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            document.getElementById('val-releases').textContent = `$${totals.releases.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            // 6. Update Simple Bar Chart
            const maxVal = Math.max(totals.sales, totals.yard, totals.tulipan, totals.contractor, totals.releases, 1);
            document.getElementById('bar-sales').style.width = `${(totals.sales / maxVal) * 100}%`;
            document.getElementById('bar-yard').style.width = `${(totals.yard / maxVal) * 100}%`;
            document.getElementById('bar-tulipan').style.width = `${(totals.tulipan / maxVal) * 100}%`;
            document.getElementById('bar-contractor').style.width = `${(totals.contractor / maxVal) * 100}%`;
        };

        window.resetProfitFilters = function () {
            document.getElementById('profit-date-from').value = '';
            document.getElementById('profit-date-to').value = '';
            renderProfitReport();
        };

