        // FORM INVENTOR — Detailed container sales breakdown
        // Shows only COMPLETE (status='PAID') orders that have Sales enabled (has_sales='YES')

        window.renderInventorTable = function () {
            const body = document.getElementById('inventor-body');
            if (!body) return;

            const dateFrom = document.getElementById('inv-date-from')?.value || '';
            const dateTo = document.getElementById('inv-date-to')?.value || '';

            // Text filters (partial match)
            const fSize = (document.getElementById('inv-f-size')?.value || '').toUpperCase().trim();
            const fNCont = (document.getElementById('inv-f-ncont')?.value || '').toUpperCase().trim();
            const fPhone = (document.getElementById('inv-f-phone')?.value || '').toUpperCase().trim();

            // Select filters (exact match)
            const fSeller = (document.getElementById('inv-f-seller')?.value || '').trim();
            const fRelease = (document.getElementById('inv-f-release')?.value || '').trim();
            const fCity = (document.getElementById('inv-f-city')?.value || '').trim();

            const logisticsData = currentTrips || [];

            // Build Release Lookup Map for Purchase Prices
            const relMap = new Map();
            if (typeof currentReleases !== 'undefined') {
                currentReleases.forEach(r => {
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
                const orderStatus = (row[41] || '').toString().toUpperCase();
                if (orderStatus !== 'PAID') return false;

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

                if (fSize && !size.includes(fSize)) return false;
                if (fNCont && !nCont.includes(fNCont)) return false;
                if (fPhone && !phone.includes(fPhone)) return false;

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

            // Totals
            let totalSales = 0;
            let totalCost = 0;
            let totalTransport = 0;
            let totalGross = 0;

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
                const relNo = (row[4] || '').toString().trim();
                const tripSize = (row[2] || '').toString();
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

                const gross = salesPrice - unitCost;

                totalSales += salesPrice;
                totalCost += unitCost;
                totalGross += gross;

                const tr = document.createElement('tr');
                tr.style.cssText = 'border-bottom: 1px solid #dee2e6; cursor: pointer; transition: background 0.2s;';
                tr.title = 'Click to view full details';
                tr.onclick = () => window.showInventoryDetails(row, unitCost, seller);

                const cellStyle = 'padding: 10px 14px; border: 1px solid #dee2e6; color: #000; font-weight: 700; text-align: center; vertical-align: middle; white-space: nowrap;';

                tr.innerHTML = `
                    <td style="${cellStyle}">${window.formatDateMMDDYYYY ? window.formatDateMMDDYYYY(date) : date}</td>
                    <td style="${cellStyle}">${size}</td>
                    <td style="${cellStyle}">${nCont}</td>
                    <td style="${cellStyle}">${phone}</td>
                    <td style="${cellStyle}">${seller}</td>
                    <td style="${cellStyle} font-weight: 800; color: #1e293b;">${customer}</td>
                    <td style="${cellStyle} color: #ef4444;">$${unitCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td style="${cellStyle} color: #0f172a; font-weight: 900;">$${salesPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td style="${cellStyle} color: ${gross >= 0 ? '#10b981' : '#ef4444'}; font-weight: 900;">$${gross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td style="${cellStyle} white-space: normal; min-width: 150px; max-width: 250px; text-align: left;">${note}</td>
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
                body.innerHTML = '<tr><td colspan="10" style="padding: 40px; text-align: center; color: #94a3b8; font-style: italic; font-size: 0.9rem;">No completed container sales found for the selected filters.</td></tr>';
            }
        };

        // Populate dropdown filters with unique values from existing data
        window.populateInventorDropdowns = function () {
            const sellers = new Set();
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
            if (typeof currentTrips !== 'undefined') {
                currentTrips.forEach(row => {
                    if (row[6] && row[6] !== '---') cities.add(row[6]);
                    if (row[2] && row[2] !== '---') sizes.add(row[2]);
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
            document.getElementById('inv-f-seller').value = '';
            document.getElementById('inv-f-release').value = '';
            document.getElementById('inv-f-city').value = '';
            renderInventorTable();
        };

        // Override renderInventorTable to also populate dropdowns on first call
        const _origRender = window.renderInventorTable;
        window.renderInventorTable = function () {
            // Populate dropdowns before rendering (preserves current selection)
            if (window.populateInventorDropdowns) window.populateInventorDropdowns();
            _origRender();
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
            const sPrice = parseFloat(row[20]) || 0;
            const uCost = parseFloat(unitCost) || 0;
            const net = sPrice - uCost;

            document.getElementById('inv-det-cost').textContent = fmt(uCost);
            document.getElementById('inv-det-sales').textContent = fmt(sPrice);
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
        }
