        window.resetReleaseForm = function () {
            editingReleaseId = null;
            const btn = document.querySelector('#releases-view .btn-add-sidebar');
            if (btn) {
                btn.textContent = 'Add Release';
                btn.classList.remove('btn-update');
            }
            const resetBtn = document.getElementById('btn-reset-release');
            if (resetBtn) resetBtn.style.display = 'none';

            ['rel-no-releases', 'rel-size-detail', 'rel-qty-unified', 'rel-pickup-unified', 'rel-stock-unified', 'rel-price-unified', 'rel-date', 'rel-city', 'rel-depot', 'rel-address', 'rel-seller'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = (id.includes('qty') || id.includes('price') || id.includes('stock') || id.includes('pickup')) ? '0' : '';
            });

            // Reset radios
            const dry = document.querySelector('input[name="rel-uni-type"][value="DRY"]');
            const used = document.querySelector('input[name="rel-uni-cond"][value="NEW"]');
            if (dry) dry.checked = true;
            if (used) used.checked = true;
            const paid = document.getElementById('rel-paid');
            if (paid) {
                paid.checked = false;
                if (window.updatePaidBadgeStyle) window.updatePaidBadgeStyle(false);
            }
            const isCash = document.getElementById('rel-is-cash');
            if (isCash) {
                isCash.checked = false;
                if (window.updateCashBadgeStyle) window.updateCashBadgeStyle(false);
            }

            loadReleasesData();
        };

        window.loadReleaseToEdit = function (idx) {
            if (!currentReleases[idx]) return;
            const row = currentReleases[idx];
            editingReleaseId = row[15]; // DB UUID

            document.getElementById('rel-no-releases').value = row[0];
            document.getElementById('rel-date').value = (row[1] === '---' || !row[1]) ? '' : row[1];
            document.getElementById('rel-city').value = (row[6] === '---') ? '' : row[6];
            document.getElementById('rel-depot').value = (row[4] === '---') ? '' : row[4];
            document.getElementById('rel-address').value = (row[5] === '---') ? '' : row[5];
            // Seller Loading Logic (Robust)
            const sellerSel = document.getElementById('rel-seller');
            const sellerVal = (row[13] === '---' || !row[13]) ? '' : row[13].toString().trim();
            if (sellerSel) {
                let exists = Array.from(sellerSel.options).some(opt => opt.value === sellerVal);
                if (!exists && sellerVal) {
                    const opt = document.createElement('option');
                    opt.value = sellerVal;
                    opt.textContent = sellerVal;
                    sellerSel.appendChild(opt);
                }
                sellerSel.value = sellerVal;
            }

            // Populate Unified Size/Qty/Price
            const sizeDetail = document.getElementById('rel-size-detail');
            if (sizeDetail) sizeDetail.value = row[16] || '---';

            // We get the quantity from the first non-zero base column
            const qtyVal = parseInt(row[7]) || parseInt(row[9]) || parseInt(row[11]) || 0;
            document.getElementById('rel-qty-unified').value = qtyVal;

            // STOCK POPULATION (From the actual column in DB)
            const currentStock = parseInt(row[14]) || 0;
            document.getElementById('rel-stock-unified').value = currentStock;

            // PICKUP POPULATION (Calculated)
            document.getElementById('rel-pickup-unified').value = Math.max(0, qtyVal - currentStock);

            const priceVal = parseFloat(row[8]) || parseFloat(row[10]) || parseFloat(row[12]) || 0;
            document.getElementById('rel-price-unified').value = priceVal;

            // Type & Cond
            const t = document.querySelector(`input[name="rel-uni-type"][value="${row[2]}"]`); if (t) t.checked = true;
            const c = document.querySelector(`input[name="rel-uni-cond"][value="${row[3]}"]`); if (c) c.checked = true;
            const paid = document.getElementById('rel-paid');
            if (paid) {
                paid.checked = !!row[17];
                if (window.updatePaidBadgeStyle) window.updatePaidBadgeStyle(paid.checked);
            }
            const isCash = document.getElementById('rel-is-cash');
            if (isCash) {
                isCash.checked = !!row[18];
                if (window.updateCashBadgeStyle) window.updateCashBadgeStyle(isCash.checked);
            }

            const btn = document.querySelector('#releases-view .btn-add-sidebar');
            if (btn) {
                btn.textContent = 'Update Release';
                btn.classList.add('btn-update');
            }
            const resetBtn = document.getElementById('btn-reset-release');
            if (resetBtn) resetBtn.style.display = 'block';

            applyReleasesFilters();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        window.saveReleasesData = function () {
            // Obsolete now that we use Supabase directly, but keeping it empty for potential temporary use
        };

        function toggleReleaseMode(forceMode) {
            const sel = document.getElementById('in-release-sel');
            const man = document.getElementById('in-release');
            const icon = document.getElementById('toggle-icon');

            let isManual = man.style.display !== 'none';
            if (forceMode === 'manual') isManual = false;
            if (forceMode === 'list') isManual = true;

            if (isManual) {
                // Switch to List
                man.style.display = 'none';
                sel.style.display = 'block';
                icon.className = 'fas fa-edit';
                man.value = '';
            } else {
                // Switch to Manual
                sel.style.display = 'none';
                man.style.display = 'block';
                icon.className = 'fas fa-list';
                sel.selectedIndex = 0;
            }
        }
        window.toggleReleaseMode = toggleReleaseMode;

        function toggleCustomerMode(forceMode) {
            const sel = document.getElementById('in-customer-sel');
            const man = document.getElementById('in-customer');
            const icon = document.getElementById('toggle-icon-customer');

            let isManual = man.style.display !== 'none';
            if (forceMode === 'manual') isManual = false;
            if (forceMode === 'list') isManual = true;

            if (isManual) {
                // Switch to List
                man.style.display = 'none';
                sel.style.display = 'block';
                icon.className = 'fas fa-edit';
                man.value = '';
            } else {
                // Switch to Manual
                sel.style.display = 'none';
                man.style.display = 'block';
                icon.className = 'fas fa-list';
                sel.selectedIndex = 0;
            }
        }
        window.toggleCustomerMode = toggleCustomerMode;

        function togglePickupAddressMode(forceMode) {
            const sel = document.getElementById('in-pickup-sel');
            const man = document.getElementById('in-pickup');
            const icon = document.getElementById('toggle-icon-pickup');

            let isManual = man.style.display !== 'none';
            if (forceMode === 'manual') isManual = false;
            if (forceMode === 'list') isManual = true;

            if (isManual) {
                man.style.display = 'none';
                sel.style.display = 'block';
                icon.className = 'fas fa-edit';
                man.value = '';
            } else {
                sel.style.display = 'none';
                man.style.display = 'block';
                icon.className = 'fas fa-list';
                sel.selectedIndex = 0;
            }
        }
        window.togglePickupAddressMode = togglePickupAddressMode;

        window.togglePickupAddressMode = togglePickupAddressMode;

        async function loadReleasesData() {
            try {
                const data = await getReleases();
                const sorted = (data || []).sort((a, b) => {
                    const dateA = new Date(a.date || '1970-01-01');
                    const dateB = new Date(b.date || '1970-01-01');
                    return dateB - dateA;
                });
                
                // Always update the global array first
                currentReleases = sorted.map(mapReleaseToArray);
                window.currentReleases = currentReleases;
                
                // Update Sidebar Dropdowns globally if they exist
                if (window.updateReleaseDatalist) window.updateReleaseDatalist();
                if (window.populateInventorDropdowns) window.populateInventorDropdowns();

                // Only proceed with table rendering if we are in the Releases view
                const body = document.getElementById('releases-body');
                if (!body) return;

                applyReleasesFilters();
                refreshReleaseNoFilter(); // Update the filter dropdown
            } catch (err) {
                console.error("Error loading releases:", err);
            }
        }
        window.loadReleasesData = loadReleasesData;

        function renderReleasesTable(filteredData) {
            const body = document.getElementById('releases-body');
            if (!body) return;

            const dataToRender = filteredData || currentReleases;
            body.innerHTML = '';

            // Total Stats Accumulators
            let globalInitialTotal = 0;
            let globalRemainingTotal = 0;
            let globalPendingTotal = 0;

            dataToRender.forEach((rowData, idx) => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                const originalIdx = currentReleases.indexOf(rowData);
                tr.onclick = (e) => {
                    const relId = rowData[15];
                    const isAlreadySelected = window.selectedReleaseIds.includes(relId);
                    const isOnlySelected = window.selectedReleaseIds.length === 1 && isAlreadySelected;

                    if (e.ctrlKey) {
                        if (isAlreadySelected) {
                            window.selectedReleaseIds = window.selectedReleaseIds.filter(id => id !== relId);
                        } else {
                            window.selectedReleaseIds.push(relId);
                        }
                    } else {
                        if (isOnlySelected) {
                            window.selectedReleaseIds = [];
                        } else {
                            window.selectedReleaseIds = [relId];
                        }
                    }

                    if (window.selectedReleaseIds.length > 0) {
                        window.loadReleaseToEdit(originalIdx !== -1 ? originalIdx : 0);
                    } else {
                        window.resetReleaseForm();
                        applyReleasesFilters(); // Re-render to clear highlights
                    }
                };

                if (editingReleaseId === rowData[15]) tr.classList.add('editing-row');
                else if (window.selectedReleaseIds.includes(rowData[15])) tr.classList.add('selected-row');

                // DATA EXTRACTION
                const initialQty = (parseInt(rowData[7]) || 0) + (parseInt(rowData[9]) || 0) + (parseInt(rowData[11]) || 0);
                const unitPrice = parseFloat(rowData[8]) || parseFloat(rowData[10]) || parseFloat(rowData[12]) || 0;
                const remainingQty = Math.min(parseInt(rowData[14]) || 0, initialQty); // SECURITY CAP
                const pickedUpQty = Math.max(0, initialQty - remainingQty);
                const isPaid = rowData[17] || false;

                const lineInitialTotal = initialQty * unitPrice;
                const lineRemainingTotal = remainingQty * unitPrice;

                globalInitialTotal += lineInitialTotal;
                globalRemainingTotal += lineRemainingTotal;
                if (!isPaid) globalPendingTotal += lineInitialTotal;

                const displayIndices = [0, 1, 2, 3, 'SIZE', 6, 4, 5, 'PRICE', 'TOTAL', 'PAID', 'IN', 'PICKUP', 'STOCK', 13, 'ACTION'];

                displayIndices.forEach(idx => {
                    const td = document.createElement('td');
                    let text = rowData[idx];

                    if (idx === 0) { // RELEASE NO with icon
                        const isCash = rowData[18] || false;
                        const iconHtml = isCash 
                            ? `<i class="fas fa-money-bill-wave" style="color: #059669; margin-right: 8px;"></i>` 
                            : `<i class="fas fa-university" style="color: #3b82f6; margin-right: 8px;"></i>`;
                        td.innerHTML = `${iconHtml} <span style="font-weight: 700;">${text}</span>`;
                    }
                    else if (idx === 1 && text && text !== '---') { // DATE
                        td.textContent = window.formatDateMMDDYYYY(text);
                    }
                    else if (idx === 2) { // TYPE
                        td.style.textAlign = 'center';
                        if (text === 'DRY') td.innerHTML = `<i class="fas fa-fire" title="DRY" style="color: #f59e0b; font-size: 1.2rem;"></i>`;
                        else if (text === 'REEFER') td.innerHTML = `<i class="fas fa-snowflake" title="REEFER" style="color: #3b82f6; font-size: 1.2rem;"></i>`;
                        else td.textContent = text;
                    }
                    else if (idx === 3) { // COND
                        td.style.textAlign = 'center';
                        if (text === 'NEW') td.innerHTML = `<i class="fas fa-star" title="NEW Condition" style="color: #f59e0b; font-size: 1.2rem;"></i>`;
                        else td.innerHTML = `<i class="fas fa-tools" title="USED Condition" style="color: #64748b; font-size: 1.2rem;"></i>`;
                    }
                    else if (idx === 'SIZE') {
                        let sizeVal = rowData[16] || '---';
                        if (sizeVal === '---' || !sizeVal) {
                            if (parseInt(rowData[7]) > 0) sizeVal = "20'"; else if (parseInt(rowData[9]) > 0) sizeVal = "40'"; else if (parseInt(rowData[11]) > 0) sizeVal = "45'";
                        }
                        td.textContent = sizeVal;
                        td.style.fontWeight = '800';
                    }
                    else if (idx === 'PRICE') {
                        td.textContent = `$${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                        td.style.fontWeight = '700';
                        td.style.color = '#1e293b';
                        td.style.borderLeft = '2px solid #e2e8f0';
                        td.style.background = '#f8fafc';
                    }
                    else if (idx === 'TOTAL') {
                        td.textContent = `$${lineRemainingTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                        td.style.fontWeight = '900';
                        td.style.color = '#1e293b';
                        td.style.background = '#f8fafc';
                    }
                    else if (idx === 'PAID') {
                        td.innerHTML = isPaid ? '<i class="fas fa-check-circle" style="color: #10b981; font-size: 1.2rem;"></i>' : '<i class="fas fa-hourglass-half" style="color: #ef4444; font-size: 1.2rem;"></i>';
                        td.style.textAlign = 'center';
                        td.style.background = '#f8fafc';
                    }
                    else if (idx === 'IN' || idx === 'PICKUP' || idx === 'STOCK') {
                        let valDisplay = 0;
                        if (idx === 'IN') valDisplay = initialQty;
                        else if (idx === 'PICKUP') valDisplay = pickedUpQty;
                        else if (idx === 'STOCK') valDisplay = remainingQty;

                        td.textContent = valDisplay;
                        td.style.fontWeight = '900';
                        if (idx === 'STOCK') {
                            if (valDisplay <= 0) td.style.color = '#ef4444';
                            else if (valDisplay <= 5) td.style.color = '#f59e0b';
                            else td.style.color = '#10b981';
                        }
                    }
                    else if (idx === 'ACTION') {
                        td.innerHTML = `
                            <button onclick="event.stopPropagation(); window.deleteRelease('${rowData[15]}', '${rowData[0]}')" 
                                    style="background: #fee2e2; border: none; color: #ef4444; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        `;
                        td.style.textAlign = 'center';
                        td.style.background = '#f8fafc';
                    }
                    else {
                        td.textContent = text;
                    }

                    tr.appendChild(td);
                });
                body.appendChild(tr);
            });

            // Update Global Stats
            const elInitial = document.getElementById('rel-stats-initial');
            const elRemaining = document.getElementById('rel-stats-remaining');
            const elPending = document.getElementById('rel-stats-pending');
            if (elInitial) elInitial.textContent = `$${globalInitialTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            if (elRemaining) elRemaining.textContent = `$${globalRemainingTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            if (elPending) elPending.textContent = `$${globalPendingTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            if (window.updateReleaseDatalist) window.updateReleaseDatalist();

            // Update Summary Card Counter
            const releasesCountEl = document.getElementById('releases-count-display');
            if (releasesCountEl) {
                releasesCountEl.textContent = dataToRender.length;
                // Visual feedback: red if filtering
                const isFiltered = document.getElementById('rf-no')?.value || 
                                   document.getElementById('rf-date-from')?.value || 
                                   document.getElementById('rf-date-to')?.value ||
                                   document.getElementById('rf-type')?.value ||
                                   document.getElementById('rf-cond')?.value ||
                                   document.getElementById('rf-size')?.value ||
                                   document.getElementById('rf-paid')?.value ||
                                   document.getElementById('rf-city')?.value ||
                                   document.getElementById('rf-depot')?.value ||
                                   document.getElementById('rf-seller')?.value;
                releasesCountEl.style.color = isFiltered ? '#b91c1c' : '#1e293b';
            }
        }
        window.renderReleasesTable = renderReleasesTable;

        async function deleteRelease(id, relNo) {
            if (!id || id === 'undefined') {
                alert("Error: No se puede borrar un release sin ID (posiblemente no se guardó en la base de datos).");
                return;
            }
            if (!confirm(`¿Estás seguro de que quieres eliminar el Release #${relNo}? Esta acción no se puede deshacer.`)) return;

            try {
                const { error } = await db.from('releases').delete().eq('id', id);
                if (error) throw error;

                alert("Release eliminado correctamente.");
                await loadReleasesData();
            } catch (err) {
                console.error("Error deleting release:", err);
                alert("Error al eliminar de la base de datos.");
            }
        }
        window.deleteRelease = deleteRelease;

        function applyReleasesFilters() {
            const fNo = document.getElementById('rf-no').value.toLowerCase();
            const fDateFrom = document.getElementById('rf-date-from').value;
            const fDateTo = document.getElementById('rf-date-to').value;
            const fType = document.getElementById('rf-type').value;
            const fCond = document.getElementById('rf-cond').value;
            const fSize = document.getElementById('rf-size').value;
            const fPaid = document.getElementById('rf-paid').value;
            const fCity = document.getElementById('rf-city').value.toLowerCase();
            const fDepot = document.getElementById('rf-depot').value.toLowerCase();
            const fStock = parseInt(document.getElementById('rf-stock').value) || 0;
            const fSeller = document.getElementById('rf-seller').value.toLowerCase();
            const fShowZero = document.getElementById('rf-show-zero')?.checked || false;

            const ids = ['rf-no', 'rf-date-from', 'rf-date-to', 'rf-type', 'rf-cond', 'rf-size', 'rf-paid', 'rf-city', 'rf-depot', 'rf-stock', 'rf-seller'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.value !== '') el.classList.add('rel-filter-active');
                else if (el) el.classList.remove('rel-filter-active');
            });

            const filtered = currentReleases.filter(r => {
                let match = true;
                const curStock = parseInt(r[14]) || 0; // Use total_stock column

                if (!fShowZero && curStock <= 0) match = false;

                // Use detailed size (index 16) for filtering
                let rowSize = (r[16] || '---').trim();

                if (rowSize === '---' || !rowSize) {
                    // Fallback for legacy data
                    if (r[7] > 0) rowSize = "20' STD";
                    else if (r[9] > 0) rowSize = "40' HC";
                    else if (r[11] > 0) rowSize = "45' HC";
                }

                if (fNo && !r[0].toLowerCase().includes(fNo)) match = false;

                if (r[1] && r[1] !== '---') {
                    const rowD = new Date(r[1] + 'T00:00:00');
                    if (fDateFrom) {
                        const fromD = new Date(fDateFrom + 'T00:00:00');
                        if (rowD < fromD) match = false;
                    }
                    if (fDateTo) {
                        const toD = new Date(fDateTo + 'T00:00:00');
                        if (rowD > toD) match = false;
                    }
                } else if (fDateFrom || fDateTo) {
                    match = false;
                }

                if (fType && r[2] !== fType) match = false;
                if (fCond && r[3] !== fCond) match = false;
                if (fSize && rowSize !== fSize) match = false;
                if (fPaid) {
                    const isRowPaid = r[17] || false;
                    if (fPaid === 'PAID' && !isRowPaid) match = false;
                    if (fPaid === 'PENDING' && isRowPaid) match = false;
                }
                if (fCity && !r[6].toLowerCase().includes(fCity)) match = false;
                if (fDepot && !r[4].toLowerCase().includes(fDepot)) match = false;
                if (fStock && curStock < fStock) match = false;
                if (fSeller && !r[13].toLowerCase().includes(fSeller)) match = false;
                return match;
            });
            renderReleasesTable(filtered);
        }
        window.applyReleasesFilters = applyReleasesFilters;

        function refreshReleaseNoFilter() {
            // Function logic removed: rf-no is now a manual text input instead of a dropdown.
        }
        window.refreshReleaseNoFilter = refreshReleaseNoFilter;

        window.resetReleasesFilters = function () {
            ['rf-no', 'rf-date-from', 'rf-date-to', 'rf-type', 'rf-cond', 'rf-size', 'rf-paid', 'rf-city', 'rf-depot', 'rf-stock', 'rf-seller'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.value = ''; el.classList.remove('rel-filter-active'); }
            });
            const zeroCheck = document.getElementById('rf-show-zero');
            if (zeroCheck) zeroCheck.checked = true;
            applyReleasesFilters();
        };
        window.loadReleasesData = loadReleasesData; // Expose globally
        // Mobile menu behavior is handled by global toggleMobileMenu and closeMenu functions.

        // EXPENSE MANAGEMENT LOGIC
        window.toggleOtherExpense = () => {
            const cat = document.getElementById('exp-category').value;
            const groupOther = document.getElementById('group-exp-other');
            
            if (groupOther) groupOther.style.display = (cat === 'Other') ? 'block' : 'none';
        };

        window.editingExpenseId = null;

        window.addExpenseRow = async () => {
            const date = document.getElementById('exp-date').value || '---';
            const cat = document.getElementById('exp-category').value;
            const otherVal = document.getElementById('exp-other-desc').value;
            const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
            const note = document.getElementById('exp-note').value || '---';

            const btn = document.getElementById('btn-save-expense');

            if (!date || date === '---') return alert("Please select a date.");
            if (!cat) return alert("Please select a category.");

            let desc = (cat === 'Other') ? otherVal : cat;
            const rowData = [date, cat, desc, `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, note];

            try {
                const expenseObj = mapArrayToExpense(rowData);
                
                if (window.editingExpenseId) {
                    const { error } = await db.from('expenses').update(expenseObj).eq('id', window.editingExpenseId);
                    if (error) throw error;
                    alert("Expense updated successfully!");
                } else {
                    await addExpense(expenseObj);
                    alert("Expense saved successfully!");
                }

                await loadExpensesData(); // Reload from Supabase
                window.resetExpenseForm();
            } catch (err) {
                console.error("Error saving expense:", err);
                alert("Failed to save expense to database.");
            }
        };


        window.resetExpenseForm = () => {
            window.editingExpenseId = null;
            document.getElementById('exp-date').value = '';
            document.getElementById('exp-category').selectedIndex = 0;
            const otherGroup = document.getElementById('group-exp-other');
            if (otherGroup) otherGroup.style.display = 'none';
            document.getElementById('exp-other-desc').value = '';
            document.getElementById('exp-amount').value = '0';
            document.getElementById('exp-note').value = '';
            
            const btn = document.getElementById('btn-save-expense');
            if (btn) {
                btn.textContent = "Save Expense";
                btn.classList.remove('btn-update'); 
            }

            // Remove highlighted rows
            document.querySelectorAll('#expenses-body tr').forEach(r => r.classList.remove('editing-row'));
        };

        // New logic for Release Row addition (SUPABASE)
        window.addReleaseRow = async () => {
            const relNo = document.getElementById('rel-no-releases').value;
            const dte = document.getElementById('rel-date').value || '---';
            const cty = document.getElementById('rel-city').value || '---';
            const dpt = document.getElementById('rel-depot').value || '---';
            const adr = document.getElementById('rel-address').value || '---';
            const slr = document.getElementById('rel-seller').value || '---';

            // Unified Inputs
            const fullSize = document.getElementById('rel-size-detail').value;
            const qty = parseInt(document.getElementById('rel-qty-unified').value) || 0;
            const price = parseFloat(document.getElementById('rel-price-unified').value) || 0;
            const type = document.querySelector('input[name="rel-uni-type"]:checked').value;
            const condition = document.querySelector('input[name="rel-uni-cond"]:checked').value;

            if (!relNo) { alert('Please enter a Release Number'); return; }
            if (!fullSize) { alert('Please select a container size'); return; }
            if (qty <= 0 && !editingReleaseId) { alert('Please enter a quantity greater than 0'); return; }

            // Map specific size to the old base columns for backward compatibility
            let q20 = 0, q40 = 0, q45 = 0;
            let p20 = 0, p40 = 0, p45 = 0;

            if (fullSize.startsWith("20")) { q20 = qty; p20 = price; }
            else if (fullSize.startsWith("40")) { q40 = qty; p40 = price; }
            else if (fullSize.startsWith("45")) { q45 = qty; p45 = price; }

            // STOCK LOGIC: Directly use the value from the new manual 'rel-stock-unified' field
            const finalStock = parseInt(document.getElementById('rel-stock-unified').value) || 0;

            const relObj = {
                release_no: relNo,
                date: dte === '---' ? null : dte,
                type: type,
                condition: condition,
                depot: dpt,
                depot_address: adr,
                city: cty,
                qty_20: q20,
                price_20: p20,
                qty_40: q40,
                price_40: p40,
                qty_45: q45,
                price_45: p45,
                seller: slr,
                total_stock: finalStock,
                container_size: fullSize,
                paid: document.getElementById('rel-paid').checked,
                is_cash: document.getElementById('rel-is-cash').checked
            };

            try {
                if (editingReleaseId) {
                    const targets = (window.selectedReleaseIds && window.selectedReleaseIds.length > 1) ? window.selectedReleaseIds : [editingReleaseId];
                    if (targets.length > 1) {
                        if (!confirm(`¿Actualizar estos ${targets.length} releases con la nueva información?`)) return;
                    }

                    for (const targetId of targets) {
                        let finalRelObj = { ...relObj };

                        // For single-record edits, use the exact value from the UI field.
                        // For bulk updates, we still use the 'smart' deduction logic to preserve individual sold counts.
                        if (targets.length > 1) {
                            const targetRel = currentReleases.find(r => r[15] === targetId);
                            if (targetRel) {
                                const oldInitial = (parseInt(targetRel[7]) || 0) + (parseInt(targetRel[9]) || 0) + (parseInt(targetRel[11]) || 0);
                                const oldStock = parseInt(targetRel[14]) || 0;
                                const sold = Math.max(0, oldInitial - oldStock);
                                finalRelObj.total_stock = Math.max(0, qty - sold);
                            }
                        } else {
                            finalRelObj.total_stock = finalStock;
                        }

                        await updateRelease(targetId, finalRelObj);
                    }
                    alert("Releases actualizados correctamente.");
                    window.selectedReleaseIds = []; // Clear selection after update
                } else {
                    await addRelease(relObj);
                    alert("Release added successfully!");
                }
                resetReleaseForm();
                await loadReleasesData();
                if (window.updateReleaseDatalist) window.updateReleaseDatalist();
            } catch (err) {
                alert("Operation failed: " + err.message);
            }
        };
