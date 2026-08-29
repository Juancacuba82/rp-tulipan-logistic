        // FORM INVENTOR — Detailed container sales breakdown
        window.inventoryDataCache = null;

        window.renderInventorTable = async function () {
            console.log("=== INVENTORY RENDER TRACE START ===");
            console.log("window.inventoryDataCache exists:", !!window.inventoryDataCache);
            console.log("window.profitDataCache exists:", !!window.profitDataCache);

            const body = document.getElementById('inventor-body');
            if (!body) return;

            // --- Fetch full history for accurate Inventory calculations ---
            if (!window.inventoryDataCache) {
                console.log("getAllTripsForProfit type:", typeof window.getAllTripsForProfit);
                console.log("mapTripToArray type:", typeof window.mapTripToArray);

                if (window.profitDataCache && typeof window.mapTripToArray === 'function') {
                    console.log("Using profitDataCache. length:", window.profitDataCache.length);
                    window.inventoryDataCache = window.profitDataCache.map(window.mapTripToArray);
                } else if (typeof window.getAllTripsForProfit === 'function' && typeof window.mapTripToArray === 'function') {
                    console.log("Fetching full history from getAllTripsForProfit...");
                    body.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; font-weight:bold; color:#1e40af;"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i> Buscando historial completo de ventas...</td></tr>';
                    const rawData = await window.getAllTripsForProfit();
                    window.profitDataCache = rawData;
                    window.inventoryDataCache = rawData.map(window.mapTripToArray);
                    console.log("Fetched rawData length:", rawData.length);
                } else {
                    console.log("Fallback: using currentTrips");
                    window.inventoryDataCache = window.allTripsUnfiltered || window.currentTrips || [];
                }
            }

            const logisticsData = window.inventoryDataCache;
            console.log("logisticsData length for Inventory:", logisticsData ? logisticsData.length : 0);
            
            if (window.populateInventorDropdowns) window.populateInventorDropdowns();

            const dateFrom = document.getElementById('inv-date-from')?.value || '';
            const dateTo = document.getElementById('inv-date-to')?.value || '';

            // Text filters (partial match)
            const fSize = (document.getElementById('inv-f-size')?.value || '').toUpperCase().trim();
            const fNCont = (document.getElementById('inv-f-ncont')?.value || '').toUpperCase().trim();
            const fPhone = (document.getElementById('inv-f-phone')?.value || '').toUpperCase().trim();

            // Select filters (exact match)
            const fCustomer = (document.getElementById('inv-f-customer')?.value || '').trim();
            const fSeller = (document.getElementById('inv-f-seller')?.value || '').trim();
            const fRelease = (document.getElementById('inv-f-release')?.value || '').trim();
            const fCity = (document.getElementById('inv-f-city')?.value || '').trim();

            // Build Release Lookup Map for Purchase Prices
            const relMap = new Map();
            if (typeof window.currentReleases !== 'undefined') {
                window.currentReleases.forEach(r => {
                    if (r && r[0]) {
                        const rNo = r[0].toString().trim();
                        const existing = relMap.get(rNo) || { p20: 0, p40: 0, p45: 0, seller: '---', city: '---' };
                        relMap.set(rNo, {
                            p20: (parseFloat(r[8]) || 0) || existing.p20,
                            p40: (parseFloat(r[10]) || 0) || existing.p40,
                            p45: (parseFloat(r[12]) || 0) || existing.p45,
                            seller: r[13] || existing.seller || '---',
                            city: r[6] || existing.city || '---'
                        });
                    }
                });
            }

            // Filter: COMPLETE orders with Sales
            const filtered = logisticsData.filter(row => {
                // Ignore pending debts so they don't skew the sales totals
                const nContVal = (row[3] || '').toString().toUpperCase();
                if (nContVal.includes('DEUDA PENDIENTE')) return false;

                const orderStatus = (row[41] || '').toString().toUpperCase();
                // Show COMPLETE, PAID, DELIVERED orders
                // (User requested to see all delivered containers regardless of payment status)
                const allowedStatuses = ['COMPLETE', 'PAID', 'DELIVERED'];
                if (!allowedStatuses.includes(orderStatus)) return false;

                const hasSales = (row[43] === 'YES');
                if (!hasSales) return false;

                const salesPrice = parseFloat(row[20]) || 0;
                if (salesPrice <= 0) return false;

                // Date filter
                const rowDate = row[1];
                if (dateFrom && rowDate < dateFrom) return false;
                if (dateTo && rowDate > dateTo) return false;

                // Text filters (partial)
                const size = (row[2] || '').toString().toUpperCase();
                const nCont = (row[3] || '').toString().toUpperCase();
                const phone = (row[23] || '').toString().toUpperCase();
                const customer = (row[11] || '').toString().trim();

                if (fSize && !size.includes(fSize)) return false;
                if (fNCont && !nCont.includes(fNCont)) return false;
                if (fPhone && !phone.includes(fPhone)) return false;
                if (fCustomer && customer !== fCustomer) return false;

                // Select filters (exact)
                const relNo = (row[4] || '').toString().trim();
                const city = (row[6] || '').toString().trim();
                const releaseData = relMap.get(relNo);
                const seller = releaseData ? (releaseData.seller || '---') : '---';

                if (fSeller && seller !== fSeller) return false;
                if (fRelease && relNo !== fRelease) return false;
                if (fCity && city !== fCity) return false;

                return true;
            });

            console.log("Filtered length for Inventory:", filtered.length);

            // Totals
            let totalSales = 0;
            let totalCost = 0;
            let totalTransport = 0;
            let totalGross = 0;
            let totalQty = 0;

            body.innerHTML = '';

            filtered.forEach(row => {
                const date = row[1] || '---';
                const size = row[2] || '---';
                const nCont = row[3] || '---';
                const phone = row[23] || '---';
                const customer = row[11] || '---';
                const salesPrice = parseFloat(row[20]) || 0;
                const note = row[25] || '---';

                // Get purchase price from release
                let relNo = (row[4] || '').toString().trim();
                const tripSize = (row[2] || '').toString();

                // --- FIX: Yard-sourced sales — trace back to find the actual Release number.
                // When a container is sold from Yard Stock, row[4] may contain an order number
                // (e.g. "ORD-RQ59") because that's what yard_stock.origin_release stores.
                // We trace: sale trip → yard item → origin order → original trip → release number.
                if (!relMap.has(relNo)) {
                    const containerSource = (row[58] || 'RELEASE').toString();
                    const yardItemId    = (row[59] || '').toString();
                    if ((containerSource === 'YARD' || containerSource === 'STORAGE') && yardItemId) {
                        const yardItems = window.getYardStockData ? window.getYardStockData() : [];
                        const yardItem  = yardItems.find(y => String(y.id) === String(yardItemId));
                        if (yardItem && yardItem.origin_release) {
                            const originOrderNo = yardItem.origin_release; // This is an ORDER number
                            // Search ALL trips (not just filtered) for that order to get its release
                            const allT = window.inventoryDataCache || [];
                            const originalTrip = allT.find(t =>
                                Array.isArray(t) &&
                                (t[5] || '').toString().trim() === originOrderNo.toString().trim()
                            );
                            if (originalTrip) {
                                const foundRelNo = (originalTrip[4] || '').toString().trim();
                                if (foundRelNo && relMap.has(foundRelNo)) {
                                    relNo = foundRelNo; // Use the real release number
                                }
                            }
                        }
                    }
                }

                const releaseData = relMap.get(relNo);

                let unitCost = 0;
                let seller = '---';
                if (releaseData) {
                    seller = releaseData.seller || '---';
                    if (tripSize.includes('20')) unitCost = releaseData.p20;
                    else if (tripSize.includes('40')) unitCost = releaseData.p40;
                    else if (tripSize.includes('45')) unitCost = releaseData.p45;

                    if (unitCost === 0) {
                        unitCost = releaseData.p20 || releaseData.p40 || releaseData.p45 || 0;
                    }
                }

                const qty = parseInt(row[53]) || 1;
                const totalItemSales = salesPrice * qty;
                const totalItemCost = unitCost * qty;
                const gross = totalItemSales - totalItemCost;

                totalSales += totalItemSales;
                totalCost += totalItemCost;
                totalGross += gross;
                totalQty += qty;

                const tr = document.createElement('tr');
                tr.style.cssText = 'border-bottom: 1px solid #dee2e6; cursor: pointer; transition: background 0.2s;';
                tr.title = 'Click to view full details';
                tr.onclick = () => window.showInventoryDetails(row, unitCost, seller);

                const cellStyle = 'padding: 5px 4px; border: 1px solid #dee2e6; color: #000; font-weight: 700; text-align: center; vertical-align: middle; white-space: nowrap;';

                tr.innerHTML = `
                    <td style="${cellStyle}">${window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(date) : date}</td>
                    <td style="${cellStyle} white-space: normal; min-width: 80px; max-width: 120px;">${size}</td>
                    <td style="${cellStyle} color: #1e40af; font-weight: 800;">${qty}</td>
                    <td style="${cellStyle}">${nCont}</td>
                    <td style="${cellStyle}">${relNo}</td>
                    <td style="${cellStyle}">${window.formatUSPhone(phone)}</td>
                    <td style="${cellStyle} white-space: normal; min-width: 80px; max-width: 100px;">${seller}</td>
                    <td style="${cellStyle} white-space: normal; font-weight: 800; color: #1e293b; min-width: 100px; max-width: 140px;">${customer}</td>
                    <td style="${cellStyle} color: #ef4444;">$${totalItemCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td style="${cellStyle} color: #0f172a; font-weight: 900;">$${totalItemSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td style="${cellStyle} color: ${gross >= 0 ? '#10b981' : '#ef4444'}; font-weight: 900;">$${gross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td style="${cellStyle} white-space: normal; min-width: 120px; max-width: 180px; text-align: left;">${note}</td>
                `;

                // Hover effect
                tr.onmouseenter = () => { if (tr.style.backgroundColor !== '#f8f9fa') tr.style.backgroundColor = '#f1f5f9'; };
                tr.onmouseleave = () => { tr.style.backgroundColor = (body.children.length % 2 === 0) ? '#f8f9fa' : ''; };

                // Zebra striping
                if (body.children.length % 2 === 1) {
                    tr.style.backgroundColor = '#f8f9fa';
                }

                body.appendChild(tr);
            });

            // Summary cards
            const fmt = v => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            if (document.getElementById('inv-total-sales')) document.getElementById('inv-total-sales').textContent = fmt(totalSales);
            if (document.getElementById('inv-total-cost')) document.getElementById('inv-total-cost').textContent = fmt(totalCost);
            if (document.getElementById('inv-total-gross')) document.getElementById('inv-total-gross').textContent = fmt(totalGross);

            // Empty state
            if (filtered.length === 0) {
                body.innerHTML = '<tr><td colspan="11" style="padding: 40px; text-align: center; color: #94a3b8; font-style: italic; font-size: 0.9rem;">No completed container sales found for the selected filters.</td></tr>';
            }

            // Update Summary Card Counter
            const countEl = document.getElementById('inventor-count-display');
            if (countEl) {
                countEl.textContent = filtered.length;
                // Visual feedback: orange if filtering
                const isFiltered = dateFrom || dateTo || fSize || fNCont || fPhone || fCustomer || fSeller || fRelease || fCity;
                countEl.style.color = isFiltered ? '#f59e0b' : '#1e293b';
            }

            const qtyEl = document.getElementById('inventor-total-qty-display');
            if (qtyEl) {
                qtyEl.textContent = totalQty;
                const isFiltered = dateFrom || dateTo || fSize || fNCont || fPhone || fCustomer || fSeller || fRelease || fCity;
                qtyEl.style.color = isFiltered ? '#1e40af' : '#1e293b';
            }

            const avgEl = document.getElementById('inventor-avg-profit-display');
            if (avgEl) {
                const avg = totalQty > 0 ? (totalGross / totalQty) : 0;
                avgEl.textContent = fmt(avg);
                const isFiltered = dateFrom || dateTo || fSize || fNCont || fPhone || fCustomer || fSeller || fRelease || fCity;
                avgEl.style.color = isFiltered ? '#10b981' : '#1e293b';
            }

            // --- SYNC TOP SCROLLBAR ---
            setTimeout(() => {
                const topScroll = document.getElementById('inv-top-scroll-container');
                const topContent = document.getElementById('inv-top-scroll-content');
                const bottomScroll = document.getElementById('inv-table-container');
                const table = document.getElementById('inventor-table');

                if (topScroll && topContent && bottomScroll && table) {
                    // Sync width
                    topContent.style.width = table.offsetWidth + 'px';

                    // Hide top scroll container if no scrolling is required
                    if (table.offsetWidth <= bottomScroll.clientWidth) {
                        topScroll.style.display = 'none';
                    } else {
                        topScroll.style.display = 'block';
                    }

                    // Sync scrolls
                    topScroll.onscroll = () => {
                        bottomScroll.scrollLeft = topScroll.scrollLeft;
                    };
                    bottomScroll.onscroll = () => {
                        topScroll.scrollLeft = bottomScroll.scrollLeft;
                    };
                }
            }, 100);
        };

        // Populate dropdown filters with unique values from existing data
        window.populateInventorDropdowns = function () {
            const sellers = new Set();
            const customers = new Set();
            const releaseEntries = []; // { relNo, size, city }
            const releaseNosAdded = new Set();
            const cities = new Set();
            const sizes = new Set();

            // From releases data
            if (typeof currentReleases !== 'undefined') {
                currentReleases.forEach(r => {
                    if (r[13] && r[13] !== '---') sellers.add(r[13]);
                    if (r[6] && r[6] !== '---') cities.add(r[6]);

                    const relNo = (r[0] || '').toString().trim();
                    const size = r[16] || '---';
                    if (size && size !== '---') sizes.add(size);
                    const city = r[6] || '---';
                    if (relNo && relNo !== '---' && !releaseNosAdded.has(relNo)) {
                        releaseNosAdded.add(relNo);
                        releaseEntries.push({ relNo, size, city });
                    }
                });
            }

            // Also extract cities from trips for broader coverage
            const tripsSource = window.allTripsUnfiltered || window.currentTrips || [];
            if (tripsSource) {
                tripsSource.forEach(row => {
                    if (row[6] && row[6] !== '---') cities.add(row[6]);
                    if (row[2] && row[2] !== '---') sizes.add(row[2]);
                    if (row[11] && row[11] !== '---') customers.add(row[11]);
                });
            }

            // Merge with hardcoded cities from delivery calendar
            const hardcodedCities = ["MIAMI", "MEDLEY", "TAMPA", "JACKSONVILLE", "SAVANNAH", "TITUSVILLE", "MASCOTTE", "ORLANDO", "ATLANTA", "CHARLESTON", "NEWARK", "SUMMERVILLE", "BALTIMORE"];
            hardcodedCities.forEach(c => cities.add(c));

            const hardcodedSizes = ["40' HC", "40' STD", "40' DD", "40' OS", "45' HC", "20' STD", "20' HC", "20' DD", "20' OS"];
            hardcodedSizes.forEach(s => sizes.add(s));

            // Fill Seller and City as simple selects
            const fillSelect = (id, values) => {
                const sel = document.getElementById(id);
                if (!sel) return;
                const currentVal = sel.value;
                sel.innerHTML = '<option value="">All</option>';
                [...values].sort().forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v;
                    sel.appendChild(opt);
                });
                if (currentVal) sel.value = currentVal;
            };

            fillSelect('inv-f-seller', sellers);
            fillSelect('inv-f-customer', customers);
            fillSelect('inv-f-city', cities);
            fillSelect('inv-f-size', sizes);

            // Fill N Release with "relNo - size - city" format
            const relSel = document.getElementById('inv-f-release');
            if (relSel) {
                const currentVal = relSel.value;
                relSel.innerHTML = '<option value="">All</option>';
                releaseEntries.sort((a, b) => a.relNo.localeCompare(b.relNo)).forEach(entry => {
                    const opt = document.createElement('option');
                    opt.value = entry.relNo;
                    opt.textContent = `${entry.relNo} - ${entry.size} - ${entry.city}`;
                    relSel.appendChild(opt);
                });
                if (currentVal) relSel.value = currentVal;
            }
        };

        window.resetInventorFilters = function () {
            document.getElementById('inv-date-from').value = '';
            document.getElementById('inv-date-to').value = '';
            document.getElementById('inv-f-size').value = '';
            document.getElementById('inv-f-ncont').value = '';
            document.getElementById('inv-f-phone').value = '';
            document.getElementById('inv-f-customer').value = '';
            document.getElementById('inv-f-seller').value = '';
            document.getElementById('inv-f-release').value = '';
            document.getElementById('inv-f-city').value = '';
            renderInventorTable();
        };

        // Override renderInventorTable
        const _origRender = window.renderInventorTable;
        window.renderInventorTable = async function () {
            await _origRender();
        };

        window.showInventoryDetails = function(row, unitCost, seller) {
            const modal = document.getElementById('inventory-detail-modal');
            if (!modal) return;

            const fmt = v => `$${(parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            const formatDate = d => window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(d) : d;

            // Fill header
            const orderNo = row[5] || '---';
            document.getElementById('inv-modal-subtitle').textContent = `Order Ref: #${orderNo}`;
            
            // Specs
            document.getElementById('inv-det-size').textContent = row[2] || '---';
            document.getElementById('inv-det-ncont').textContent = row[3] || '---';
            document.getElementById('inv-det-release').textContent = row[4] || '---';
            
            // Logistics
            document.getElementById('inv-det-customer').textContent = row[11] || '---';
            document.getElementById('inv-det-city').textContent = row[6] || '---';
            document.getElementById('inv-det-seller').textContent = seller || '---';
            document.getElementById('inv-det-date').textContent = formatDate(row[1]);

            // Financials
            const qty = parseInt(row[53]) || 1;
            const sPrice = parseFloat(row[20]) || 0;
            const uCost = parseFloat(unitCost) || 0;
            const totalS = sPrice * qty;
            const totalC = uCost * qty;
            const net = totalS - totalC;

            document.getElementById('inv-det-cost').textContent = fmt(totalC);
            document.getElementById('inv-det-sales').textContent = fmt(totalS);
            document.getElementById('inv-det-profit').textContent = fmt(net);
            document.getElementById('inv-det-profit').style.color = net >= 0 ? '#10b981' : '#ef4444';

            // Note
            document.getElementById('inv-det-note').textContent = row[25] && row[25] !== '---' ? row[25] : 'No additional notes provided for this transaction.';

            // Show Modal
            modal.style.display = 'flex';
        };

        window.closeInventoryDetail = function() {
            const modal = document.getElementById('inventory-detail-modal');
            if (modal) modal.style.display = 'none';
        };

        window.refreshInventoryModule = async function() {
            await window.withRefreshButton('btn-refresh-inventory', async () => {
                window.inventoryDataCache = null;
                window.profitDataCache = null;
                if (typeof window.loadReleasesData === 'function') await window.loadReleasesData(true);
                if (typeof window.renderInventorTable === 'function') await window.renderInventorTable();
            }, 'inventory');
        };
