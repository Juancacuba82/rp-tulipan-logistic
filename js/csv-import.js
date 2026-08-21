// CSV Import Logic for Bank of America Statements

window.recurringExpensesCache = [];
window.csvParsedData = []; // Array to hold processed rows

// Open Modal
window.openCsvImportModal = async function() {
    document.getElementById('csv-import-modal').style.display = 'flex';
    document.getElementById('csv-file-input').value = '';
    document.getElementById('csv-preview-container').style.display = 'none';
    document.getElementById('csv-preview-body').innerHTML = '';
    document.getElementById('csv-selected-total').textContent = '$0.00';
    
    // Fetch recurring expenses in the background
    if (window.db) {
        try {
            const { data } = await window.db.from('recurring_expenses').select('*');
            if (data) window.recurringExpensesCache = data;
        } catch (e) {
            console.error("Error fetching recurring expenses:", e);
        }
    }
};

// Close Modal
window.closeCsvImportModal = function() {
    document.getElementById('csv-import-modal').style.display = 'none';
};

// Handle File Selection
document.getElementById('csv-file-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        complete: function(results) {
            processBankCsv(results.data);
        },
        skipEmptyLines: true
    });
});

function processBankCsv(rawData) {
    window.csvParsedData = [];
    
    // BofA CSVs usually have [Date, Description, Amount, Running Balance]
    // Sometimes there's a header row, sometimes not.
    // We'll iterate and try to find valid rows.
    
    let tempParsed = [];
    
    rawData.forEach((row, index) => {
        // Skip obvious header rows
        if (row.length < 3) return;
        const col0 = (row[0] || '').toString().trim();
        const col1 = (row[1] || '').toString().trim();
        let col2 = (row[2] || '').toString().trim();
        
        if (col0.toLowerCase().includes('date') || col1.toLowerCase().includes('description')) {
            hasHeader = true;
            return;
        }

        // Validate date (looks like MM/DD/YYYY)
        const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        if (!dateRegex.test(col0)) return; // Not a valid row
        
        // Convert to YYYY-MM-DD
        const match = col0.match(dateRegex);
        const m = match[1];
        const d = match[2];
        const y = match[3];
        const isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        
        // Parse amount (remove quotes, commas, dollar signs)
        col2 = col2.replace(/["$,]/g, '');
        const amount = parseFloat(col2);
        
        // We only care about expenses
        if (isNaN(amount) || amount >= 0) return; // Skip deposits/credits
        
        const absoluteAmount = Math.abs(amount);
        
        tempParsed.push({
            date: isoDate,
            description: col1,
            amount: absoluteAmount
        });
    });

    // Grouping Logic
    const groupedMap = new Map();

    function getGroupKey(desc) {
        let key = desc.toUpperCase();
        // Do NOT group Zelle, Transfers, or Checks broadly, keep them specific
        if (key.startsWith("ZELLE") || key.startsWith("CHECK") || key.startsWith("TRANSFER")) {
            return key; // Exact match only for grouping
        }
        
        // Specific groupings for common services found in your statement
        if (key.startsWith("SUNPASS")) return "SUNPASS TOLLS";
        if (key.includes("E ZPASS")) return "E-ZPASS TOLLS";
        if (key.startsWith("APPLE.COM")) return "APPLE.COM/BILL";
        if (key.includes("FPL")) return "FPL ELECTRICITY";
        if (key.startsWith("FACEBK") || key.startsWith("FACEBOOK")) return "FACEBOOK ADS";
        if (key.startsWith("TIKTOK ADS")) return "TIKTOK ADS";
        if (key.startsWith("UBER")) return "UBER (Eats/Trip)";
        if (key.startsWith("WIRE TRANSFER FEE")) return "WIRE TRANSFER FEES";
        
        // Loans, Insurance, and Office Supplies
        if (key.includes("FORD MOTOR CR") || key.includes("FORDCREDIT")) return "FORD MOTOR CREDIT (LOAN)";
        if (key.includes("ALLY PAYMT") || key.startsWith("ALLY ")) return "ALLY FINANCIAL (LOAN)";
        if (key.includes("PROG SELECT INS") || key.includes("PROGRESSIVE")) return "PROGRESSIVE INSURANCE";
        if (key.includes("THE HOME DEPOT") || key.includes("HOME DEPOT")) return "THE HOME DEPOT";
        if (key.includes("O'REILLY") || key.includes("OREILLY")) return "O'REILLY AUTO PARTS";
        if (key.includes("TMOBILE") || key.includes("T-MOBILE")) return "T-MOBILE";
        if (key.includes("RETURN ITEM CHARGEBACK")) return "RETURN ITEM CHARGEBACK";
        
        // Gas & Truck Stops
        if (key.includes("SHELL OIL") || key.includes("SHELL SERVICE") || 
            key.includes("LOVE'S") || key.includes("LOVES") || 
            key.includes("PILOT #") || key.includes("PILOT") || 
            key.includes("RACETRAC") || key.includes("SUNSHINE 8") || 
            key.includes("SUNFLEX") || key.includes("EXXON") || 
            key.includes("BP#") || key.includes("MARATHON") || key.includes("305 DIESEL") ||
            key.includes("MURPHY USA") || key.includes("7-ELEVEN") || key.includes("7 ELEVEN")) {
            return "GAS STATIONS";
        }
        
        // Remove common Bank of America junk IDs to find true vendor name
        let cleanKey = key.replace(/ID:\d+/g, '')
                          .replace(/CO ID:\d+/g, '')
                          .replace(/INDN:[A-Z\s]+/g, '')
                          .replace(/\bWEB\b|\bPPD\b|\bDES:INTERNET\b/g, '')
                          .replace(/[0-9]/g, '') // remove numbers
                          .trim();
        return cleanKey || key; // fallback to original if completely stripped
    }

    tempParsed.forEach(item => {
        const groupKey = getGroupKey(item.description);
        
        if (groupedMap.has(groupKey)) {
            const existing = groupedMap.get(groupKey);
            existing.amount += item.amount;
            // Update to latest date
            if (item.date > existing.date) {
                existing.date = item.date;
            }
            // Add a counter to description
            existing.count = (existing.count || 1) + 1;
            existing.displayDesc = `${groupKey} (${existing.count} cargos agrupados)`;
            existing.subItems.push(item);
        } else {
            groupedMap.set(groupKey, {
                date: item.date,
                description: item.description,
                displayDesc: groupKey.startsWith("SUNPASS") ? "SUNPASS TOLLS (1 cargo)" : item.description,
                amount: item.amount,
                count: 1,
                groupKey: groupKey,
                subItems: [item]
            });
        }
    });

    let index = 0;
    groupedMap.forEach(item => {
        // Use the cleaned groupKey as the primary description for display and matching, unless it's too short
        let finalDesc = item.groupKey;
        if (item.count > 1) {
            finalDesc = item.displayDesc;
        } else if (item.groupKey === item.description.toUpperCase()) {
            finalDesc = item.description;
        }

        window.csvParsedData.push({
            id: 'csv_' + index++,
            date: item.date,
            description: finalDesc,
            originalBankDesc: item.description, // keep original for notes
            amount: item.amount,
            suggestedCategory: 'Other',
            shouldSelect: false,
            statusMessage: '',
            isRecurring: false,
            subItems: item.subItems
        });
    });
    
    applyHistoricalMemory();
    renderCsvPreview();
}

function applyHistoricalMemory() {
    const pastExpenses = window.currentExpenses || [];
    
    window.csvParsedData.forEach(row => {
        let matched = false;
        const lowerDesc = row.description.toLowerCase();
        const origDesc = row.originalBankDesc.toLowerCase();
        
        // 1. Check Recurring Expenses
        for (const rec of window.recurringExpensesCache) {
            const recDesc = (rec.description || '').toLowerCase();
            
            // Smart matching for recurring
            // If the bank description contains 'fpl' and recurring description contains 'fpl'
            let isMatch = false;
            if (recDesc.includes('fpl') && lowerDesc.includes('fpl')) isMatch = true;
            else if (recDesc.length > 4 && lowerDesc.includes(recDesc.substring(0, 10))) isMatch = true;
            else if (recDesc.length > 2 && origDesc.includes(recDesc)) isMatch = true;

            if (isMatch) {
                row.isRecurring = true;
                row.shouldSelect = false;
                row.statusMessage = `<span style="color:#ef4444; font-weight:700;"><i class="fas fa-ban"></i> Ignorar (Autogenerado: ${rec.category || 'Recurrente'})</span>`;
                matched = true;
                break;
            }
        }
        
        if (matched) return;
        
        // Custom check for Gas Stations / Titan Fuel
        if (lowerDesc === 'gas stations') {
            row.suggestedCategory = 'Fuel';
            row.shouldSelect = true;
            row.statusMessage = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Agrupado Automático (Fuel)</span>`;
            matched = true;
            return;
        }

        if (lowerDesc.includes('titan fuel') || origDesc.includes('titan fuel')) {
            row.description = 'CRYSTAL FUEL';
            row.suggestedCategory = 'Fuel';
            row.shouldSelect = true;
            row.statusMessage = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Titan detectado (Crystal Fuel)</span>`;
            matched = true;
            return;
        }

        // Custom mappings for newly discovered frequent items
        if (lowerDesc.includes('progressive insurance')) {
            row.suggestedCategory = 'Insurance';
            row.shouldSelect = true;
            row.statusMessage = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Categoría sugerida (Insurance)</span>`;
            matched = true;
            return;
        }
        if (lowerDesc.includes('ford motor credit') || lowerDesc.includes('ally financial')) {
            row.suggestedCategory = 'Equipment & Machinery';
            row.shouldSelect = true;
            row.statusMessage = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Categoría sugerida (Loans)</span>`;
            matched = true;
            return;
        }
        if (lowerDesc.includes("o'reilly") || lowerDesc.includes("home depot")) {
            row.suggestedCategory = 'Maintenance & Repairs';
            row.shouldSelect = true;
            row.statusMessage = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Categoría sugerida (Repairs)</span>`;
            matched = true;
            return;
        }
        if (lowerDesc.includes('t-mobile')) {
            row.suggestedCategory = 'Communication';
            row.shouldSelect = true;
            row.statusMessage = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Categoría sugerida</span>`;
            matched = true;
            return;
        }
        if (lowerDesc.includes('legoland')) {
            row.suggestedCategory = 'Other';
            row.shouldSelect = false;
            row.statusMessage = `<span style="color:#f59e0b; font-weight:700;"><i class="fas fa-exclamation-triangle"></i> Ignorar (Personal)</span>`;
            matched = true;
            return;
        }
        
        // 1.5 Explicit check for Payroll / Salary / Commissions
        if (lowerDesc.includes('salary') || lowerDesc.includes('payroll') || lowerDesc.includes('commission') || origDesc.includes('salary')) {
            row.suggestedCategory = 'Payroll';
            row.shouldSelect = false;
            row.statusMessage = `<span style="color:#ef4444; font-weight:700;"><i class="fas fa-ban"></i> Ignorar (Autogenerado en Módulos)</span>`;
            matched = true;
            return;
        }

        // 2. Check Historical Memory
        for (const past of pastExpenses) {
            const pastDesc = (past[2] || '').toLowerCase(); 
            
            if (pastDesc && pastDesc !== '---' && pastDesc.length > 3) {
                // To avoid false positives like "RP TULIPAN" matching insurance, we check if the FIRST word matches, or exact include of a longer string
                const pastFirstWord = pastDesc.split(' ')[0];
                const rowFirstWord = lowerDesc.split(' ')[0];
                
                let isHistMatch = false;
                if (pastFirstWord.length > 3 && rowFirstWord === pastFirstWord) isHistMatch = true;
                else if (pastDesc.length > 6 && lowerDesc.includes(pastDesc.substring(0, 12))) isHistMatch = true;

                if (isHistMatch) {
                    row.suggestedCategory = past[1];
                    
                    const catUpper = (past[1] || '').toUpperCase();
                    if (catUpper === 'PAYROLL' || catUpper === 'COMMISSION') {
                        row.shouldSelect = false;
                        row.statusMessage = `<span style="color:#ef4444; font-weight:700;"><i class="fas fa-ban"></i> Ignorar (Autogenerado en Módulos)</span>`;
                    } else if (catUpper === 'UTILITIES') {
                        row.shouldSelect = true;
                        row.statusMessage = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Historial (Utilities)</span>`;
                    } else {
                        row.shouldSelect = true;
                        row.statusMessage = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Encontrado en Historial</span>`;
                    }
                    
                    matched = true;
                    break;
                }
            }
        }
        
        // 3. No match
        if (!matched) {
            row.shouldSelect = false; // User must manually approve unknown expenses
            row.statusMessage = `<span style="color:#f59e0b; font-weight:700;"><i class="fas fa-question-circle"></i> Desconocido (Revisar)</span>`;
        }
    });
}

function renderCsvPreview() {
    const container = document.getElementById('csv-preview-container');
    const tbody = document.getElementById('csv-preview-body');
    
    if (window.csvParsedData.length === 0) {
        alert("No valid expenses found in this file. Please ensure it's a Bank of America CSV.");
        return;
    }
    
    container.style.display = 'block';
    tbody.innerHTML = '';
    
    // Get unique categories for the dropdown
    const catSelect = document.getElementById('exp-category');
    let categoryOptions = '';
    if (catSelect) {
        Array.from(catSelect.options).forEach(opt => {
            if (opt.value) categoryOptions += `<option value="${opt.value}">${opt.text}</option>`;
        });
    } else {
        categoryOptions = `<option value="Other">Other</option>`;
    }
    
    window.csvParsedData.forEach((row, i) => {
        const tr = document.createElement('tr');
        if (row.isRecurring) {
            tr.style.backgroundColor = '#fef2f2'; // light red
        } else if (!row.shouldSelect) {
            tr.style.backgroundColor = '#fffbeb'; // light yellow
        }
        
        let descHtml = row.description;
        if (row.subItems && row.subItems.length > 1) {
            descHtml = `<span style="cursor:pointer; color:#3b82f6; display:inline-block; width:20px;" onclick="window.toggleSubRows('sub-row-${i}', this)"><i class="fas fa-chevron-down"></i></span> ${row.description}`;
        }

        tr.innerHTML = `
            <td style="text-align:center;">
                <input type="checkbox" class="csv-row-checkbox" data-index="${i}" ${row.shouldSelect ? 'checked' : ''} onchange="updateCsvTotal()" style="transform: scale(1.2);">
            </td>
            <td>${row.date}</td>
            <td style="font-size: 0.85rem; font-weight: 700;">${descHtml}</td>
            <td>
                <select class="csv-category-select" data-index="${i}" style="width:100%; padding: 4px; border-radius: 4px; border: 1px solid #cbd5e1;">
                    ${categoryOptions}
                </select>
            </td>
            <td style="text-align:right; font-weight: 900; color: #ef4444;">$${row.amount.toFixed(2)}</td>
            <td style="font-size: 0.85rem;">${row.statusMessage}</td>
        `;
        
        tbody.appendChild(tr);
        
        // Render sub-items if present
        if (row.subItems && row.subItems.length > 1) {
            row.subItems.forEach(sub => {
                const subTr = document.createElement('tr');
                subTr.className = `csv-table-row sub-row-${i}`;
                subTr.style.display = 'none';
                subTr.style.backgroundColor = '#f8fafc'; // light gray background for nested rows
                subTr.innerHTML = `
                    <td></td>
                    <td style="font-size: 0.8rem; color: #64748b;">${sub.date}</td>
                    <td style="font-size: 0.8rem; color: #64748b; padding-left: 25px;">&#8627; ${sub.description}</td>
                    <td></td>
                    <td style="font-size: 0.8rem; color: #64748b; text-align:right;">$${sub.amount.toFixed(2)}</td>
                    <td></td>
                `;
                tbody.appendChild(subTr);
            });
        }
        
        // Set selected category
        const selectEl = tr.querySelector('.csv-category-select');
        selectEl.value = row.suggestedCategory;
        if (!selectEl.value) selectEl.value = 'Other'; // fallback
    });
    updateCsvTotal();
}

window.toggleSubRows = function(className, spanEl) {
    const rows = document.querySelectorAll('.' + className);
    const icon = spanEl.querySelector('i');
    let isHidden = false;
    if (rows.length > 0) {
        isHidden = rows[0].style.display === 'none';
        rows.forEach(r => r.style.display = isHidden ? '' : 'none');
    }
    if (icon) {
        icon.className = isHidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    }
};

window.toggleAllCsvSelection = function() {
    const isChecked = document.getElementById('csv-select-all').checked;
    document.querySelectorAll('.csv-row-checkbox').forEach(cb => {
        cb.checked = isChecked;
    });
    updateCsvTotal();
};

window.updateCsvTotal = function() {
    let total = 0;
    document.querySelectorAll('.csv-row-checkbox').forEach(cb => {
        if (cb.checked) {
            const index = cb.getAttribute('data-index');
            total += window.csvParsedData[index].amount;
        }
    });
    document.getElementById('csv-selected-total').textContent = `$${total.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
};

window.saveSelectedCsvExpenses = async function() {
    const btn = document.getElementById('btn-save-csv-import');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;
    
    const checkboxes = document.querySelectorAll('.csv-row-checkbox:checked');
    let savedCount = 0;
    
    if (checkboxes.length === 0) {
        alert("Please select at least one expense to save.");
        btn.innerHTML = '<i class="fas fa-save"></i> Save Selected';
        btn.disabled = false;
        return;
    }
    
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
    
    for (const cb of checkboxes) {
        const index = cb.getAttribute('data-index');
        const rowData = window.csvParsedData[index];
        const selectEl = document.querySelector(`.csv-category-select[data-index="${index}"]`);
        const finalCategory = selectEl.value;
        
        let expenseNote = `Imported from Bank CSV (${rowData.date}) - ${rowData.originalBankDesc || rowData.description}`;
        
        if (rowData.description === 'GAS STATIONS') {
            expenseNote = 'DIESEL DELIVERY';
        } else if (rowData.description === 'CRYSTAL FUEL') {
            const match = (rowData.originalBankDesc || '').match(/"([^"]+)"/);
            if (match) {
                expenseNote = match[1]; // Extract the inner text like "Diesel deliveey 645.6 G x 5.29"
            }
        }
        
        const expenseObj = {
            date: todayStr, // Always use today's date instead of the bank statement date
            category: finalCategory,
            description: rowData.description.substring(0, 50), // Bank description
            amount: rowData.amount,
            note: expenseNote,
            payment_method: 'bank'
        };
        
        try {
            if (window.addExpense) {
                const saved = await window.addExpense(expenseObj);
                if (saved) savedCount++;
            } else {
                console.error("window.addExpense is not defined.");
            }
        } catch (e) {
            console.error("Error saving expense:", e);
        }
    }
    
    alert(`Successfully imported ${savedCount} expenses.`);
    
    // Refresh main expenses table
    if (window.loadExpensesData) {
        window.loadExpensesData(true); // force reload
    }
    
    window.closeCsvImportModal();
    btn.innerHTML = '<i class="fas fa-save"></i> Save Selected';
    btn.disabled = false;
};

// Search Bar Logic
document.getElementById('csv-search-input')?.addEventListener('input', function(e) {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#csv-preview-body tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
});
