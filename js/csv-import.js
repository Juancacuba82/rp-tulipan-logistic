// CSV Import Logic for Bank of America Statements

window.recurringExpensesCache = [];
window.csvParsedData = []; // Array to hold processed rows

function parseLocalIsoDate(isoDate) {
    const parts = String(isoDate || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(n => !n && n !== 0)) return null;
    const [y, m, d] = parts;
    return new Date(y, m - 1, d, 12, 0, 0);
}

function formatIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatCsvDate(isoDate) {
    if (window.formatDateMMDDYYYY) return window.formatDateMMDDYYYY(isoDate);
    return isoDate || '';
}

// US week (Sun–Sat). Grouped expenses use that week's Wednesday.
function getWednesdayOfWeek(isoDate) {
    const date = parseLocalIsoDate(isoDate);
    if (!date) return isoDate;
    const day = date.getDay(); // 0 = Sunday
    date.setDate(date.getDate() + (3 - day));
    return formatIsoDate(date);
}

function isTitanFuel(desc) {
    const key = (desc || '').toUpperCase();
    return key.includes('TITAN FUEL') || key.includes('TITAN DIESEL') ||
        (key.includes('TITAN') && (key.includes('FUEL') || key.includes('CRYSTAL') || key.includes('DIESEL')));
}

function getGroupKey(desc) {
    let key = (desc || '').toUpperCase();

    // Yard diesel delivery: never merge with roadside gas, never merge with other Titan charges
    if (isTitanFuel(key)) return 'CRYSTAL FUEL';

    if (key.startsWith('ZELLE') || key.startsWith('CHECK') || key.startsWith('TRANSFER')) {
        return key;
    }

    if (key.startsWith('SUNPASS')) return 'SUNPASS TOLLS';
    if (key.includes('E ZPASS')) return 'E-ZPASS TOLLS';
    if (key.startsWith('APPLE.COM')) return 'APPLE.COM/BILL';
    if (key.includes('FPL')) return 'FPL ELECTRICITY';
    if (key.startsWith('FACEBK') || key.startsWith('FACEBOOK')) return 'FACEBOOK ADS';
    if (key.startsWith('TIKTOK ADS')) return 'TIKTOK ADS';
    if (key.startsWith('UBER')) return 'UBER (Eats/Trip)';
    if (key.startsWith('WIRE TRANSFER FEE')) return 'WIRE TRANSFER FEES';

    if (key.includes('FORD MOTOR CR') || key.includes('FORDCREDIT')) return 'FORD MOTOR CREDIT (LOAN)';
    if (key.includes('ALLY PAYMT') || key.startsWith('ALLY ')) return 'ALLY FINANCIAL (LOAN)';
    if (key.includes('PROG SELECT INS') || key.includes('PROGRESSIVE')) return 'PROGRESSIVE INSURANCE';
    if (key.includes('THE HOME DEPOT') || key.includes('HOME DEPOT')) return 'THE HOME DEPOT';
    if (key.includes("O'REILLY") || key.includes('OREILLY')) return "O'REILLY AUTO PARTS";
    if (key.includes('TMOBILE') || key.includes('T-MOBILE')) return 'T-MOBILE';
    if (key.includes('RETURN ITEM CHARGEBACK')) return 'RETURN ITEM CHARGEBACK';

    // Roadside / truck-stop fuel — Titan is excluded above
    if (key.includes('SHELL OIL') || key.includes('SHELL SERVICE') ||
        key.includes("LOVE'S") || key.includes('LOVES') ||
        key.includes('PILOT #') || key.includes('PILOT') ||
        key.includes('RACETRAC') || key.includes('SUNSHINE 8') ||
        key.includes('SUNFLEX') || key.includes('EXXON') ||
        key.includes('BP#') || key.includes('MARATHON') || key.includes('305 DIESEL') ||
        key.includes('MURPHY USA') || key.includes('7-ELEVEN') || key.includes('7 ELEVEN')) {
        return 'GAS STATIONS';
    }

    let cleanKey = key.replace(/ID:\d+/g, '')
        .replace(/CO ID:\d+/g, '')
        .replace(/INDN:[A-Z\s]+/g, '')
        .replace(/\bWEB\b|\bPPD\b|\bDES:INTERNET\b/g, '')
        .replace(/[0-9]/g, '')
        .trim();
    return cleanKey || key;
}

function parseExpenseAmount(row) {
    return parseFloat(String(row[3] || '0').replace(/[$,]/g, '')) || 0;
}

function amountsEqual(a, b) {
    return Math.abs(Number(a) - Number(b)) < 0.005;
}

window.openCsvImportModal = async function() {
    document.getElementById('csv-import-modal').style.display = 'flex';
    document.getElementById('csv-file-input').value = '';
    document.getElementById('csv-preview-container').style.display = 'none';
    document.getElementById('csv-preview-body').innerHTML = '';
    document.getElementById('csv-selected-total').textContent = '$0.00';

    if (typeof window.loadExpensesData === 'function') {
        try { await window.loadExpensesData(); } catch (e) { console.error(e); }
    }

    if (window.db) {
        try {
            const { data } = await window.db.from('recurring_expenses').select('*');
            if (data) window.recurringExpensesCache = data;
        } catch (e) {
            console.error('Error fetching recurring expenses:', e);
        }
    }
};

window.closeCsvImportModal = function() {
    document.getElementById('csv-import-modal').style.display = 'none';
};

document.getElementById('csv-file-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (typeof Papa === 'undefined') {
        alert('ERROR CRÍTICO: La librería PapaParse no se cargó. Esto suele suceder si no hay conexión a internet o el servidor bloquea la descarga de la librería.');
        return;
    }

    let parseConfig = {
        complete: function(results) {
            processBankCsv(results.data);
        },
        error: function(error) {
            alert('Error en PapaParse: ' + error.message);
        },
        skipEmptyLines: true
    };

    if (file.name.toLowerCase().endsWith('.dat') || file.name.toLowerCase().endsWith('.tsv')) {
        parseConfig.delimiter = '\t';
    }

    Papa.parse(file, parseConfig);
});

function processBankCsv(rawData) {
    try {
        window.csvParsedData = [];
        let tempParsed = [];
        window.csvDebugRows = [];

        if (!rawData || !Array.isArray(rawData)) {
            alert('Error: rawData is not an array. Value: ' + JSON.stringify(rawData));
            return;
        }

        rawData.forEach((row, index) => {
            if (index < 5) window.csvDebugRows.push(JSON.stringify(row));

            if (!row || row.length < 3) return;
            const col0 = (row[0] || '').toString().trim();
            const col1 = (row[1] || '').toString().trim();
            let col2 = (row[2] || '').toString().trim();

            if (col0.toLowerCase().includes('date') || col1.toLowerCase().includes('description')) {
                return;
            }

            const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
            if (!dateRegex.test(col0)) return;

            const match = col0.match(dateRegex);
            const isoDate = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;

            col2 = col2.replace(/["$,]/g, '');
            const amount = parseFloat(col2);

            if (isNaN(amount) || amount >= 0) return;

            tempParsed.push({
                date: isoDate,
                description: col1,
                amount: Math.abs(amount)
            });
        });

        const groupedMap = new Map();

        tempParsed.forEach((item, idx) => {
            const titan = isTitanFuel(item.description);
            const groupKey = getGroupKey(item.description);
            const weekWednesday = getWednesdayOfWeek(item.date);

            // Titan stays as individual bank charges. Everything else groups by vendor + week.
            const mapKey = titan ? `__titan_${idx}` : `${groupKey}||${weekWednesday}`;

            if (!titan && groupedMap.has(mapKey)) {
                const existing = groupedMap.get(mapKey);
                existing.amount += item.amount;
                existing.count += 1;
                existing.displayDesc = `${groupKey} (${existing.count} cargos agrupados)`;
                existing.subItems.push(item);
            } else {
                groupedMap.set(mapKey, {
                    bankDate: item.date,
                    weekWednesday,
                    description: item.description,
                    displayDesc: titan ? 'CRYSTAL FUEL' : (groupKey.startsWith('SUNPASS') ? 'SUNPASS TOLLS' : groupKey),
                    amount: item.amount,
                    count: 1,
                    groupKey,
                    isTitan: titan,
                    subItems: [item]
                });
            }
        });

        let index = 0;
        groupedMap.forEach(item => {
            const isGrouped = item.count > 1;
            let finalDesc = item.groupKey;
            if (item.isTitan) {
                finalDesc = 'CRYSTAL FUEL';
            } else if (item.groupKey === (item.description || '').toUpperCase()) {
                finalDesc = item.description;
            }

            window.csvParsedData.push({
                id: 'csv_' + index++,
                date: isGrouped ? item.weekWednesday : item.bankDate,
                weekWednesday: item.weekWednesday,
                bankDate: item.bankDate,
                usesWednesdayDate: isGrouped,
                isTitan: item.isTitan,
                description: finalDesc,
                groupKey: item.groupKey,
                originalBankDesc: item.description,
                amount: item.amount,
                suggestedCategory: 'Other',
                shouldSelect: false,
                statusMessage: '',
                isRecurring: false,
                isDuplicate: false,
                isUnknown: false,
                aiExplanation: null,
                subItems: item.subItems,
                groupedCount: item.count
            });
        });

        applyHistoricalMemory();
        hydrateCsvAiFromCache();
        renderCsvPreview();

        if ((localStorage.getItem('openai_api_key') || '').trim()) {
            window.explainCsvExpensesWithAi('unknown', { auto: true });
        }
    } catch (err) {
        alert('Ocurrió un error inesperado al procesar el archivo: ' + err.message + '\n\n' + err.stack);
    }
}

function buildVendorMemory() {
    const map = new Map();

    const remember = (rawKey, row) => {
        const key = (rawKey || '').toString().trim().toUpperCase();
        if (!key || key.length < 3 || key === '---') return;
        const rec = map.get(key) || { category: row[1], count: 0, lastDate: row[0] || '', lastAmount: parseExpenseAmount(row) };
        rec.count += 1;
        if ((row[0] || '') >= rec.lastDate) {
            rec.lastDate = row[0] || rec.lastDate;
            rec.lastAmount = parseExpenseAmount(row);
            rec.category = row[1] || rec.category;
        }
        map.set(key, rec);
    };

    (window.currentExpenses || []).forEach(row => {
        const desc = row[2] || '';
        const note = row[4] || '';
        remember(desc, row);
        remember(getGroupKey(desc), row);

        if (isTitanFuel(desc) || isTitanFuel(note) || desc.toUpperCase().includes('CRYSTAL FUEL')) {
            remember('CRYSTAL FUEL', row);
        }
        if (desc.toUpperCase().includes('GAS STATION') || (note || '').toUpperCase().includes('DIESEL DELIVERY')) {
            remember('GAS STATIONS', row);
        }

        const imported = String(note).match(/Imported from Bank CSV \([^)]+\) - (.+)/i);
        if (imported) {
            remember(imported[1], row);
            remember(getGroupKey(imported[1]), row);
        }
    });

    return map;
}

function findHistoryMatch(row, memory) {
    const keysToTry = [
        row.groupKey,
        row.description,
        row.originalBankDesc,
        getGroupKey(row.originalBankDesc || '')
    ].filter(Boolean);

    let best = null;
    keysToTry.forEach(key => {
        const rec = memory.get(String(key).trim().toUpperCase());
        if (rec && (!best || rec.count > best.count)) {
            best = rec;
        }
    });
    return best;
}

function isAlreadyImported(row) {
    const key = (row.groupKey || row.description || '').toUpperCase();
    const original = (row.originalBankDesc || '').toUpperCase();

    return (window.currentExpenses || []).some(past => {
        if (!amountsEqual(parseExpenseAmount(past), row.amount)) return false;

        const pastDate = past[0] || '';
        const sameWeek = pastDate && getWednesdayOfWeek(pastDate) === row.weekWednesday;
        const sameDate = pastDate === row.date || pastDate === row.bankDate;
        if (!sameWeek && !sameDate) return false;

        const pastDesc = (past[2] || '').toUpperCase();
        const pastNote = (past[4] || '').toUpperCase();
        const descHit = (key && pastDesc.includes(key.slice(0, 18))) ||
            (pastDesc && key.includes(pastDesc.slice(0, 18))) ||
            (original && pastNote.includes(original.slice(0, 24)));
        return !!descHit;
    });
}

function historyStatusHtml(match) {
    const last = match.lastDate ? formatCsvDate(match.lastDate) : '';
    const extra = last ? ` · último ${last}` : '';
    return `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Historial: ${match.category || 'gasto'} · ${match.count} vez${match.count === 1 ? '' : 'es'}${extra}</span>`;
}

function applyHistoricalMemory() {
    const memory = buildVendorMemory();

    window.csvParsedData.forEach(row => {
        let matched = false;
        const lowerDesc = (row.description || '').toLowerCase();
        const origDesc = (row.originalBankDesc || '').toLowerCase();

        for (const rec of window.recurringExpensesCache) {
            const recDesc = (rec.description || '').toLowerCase();
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

        if (isAlreadyImported(row)) {
            row.isDuplicate = true;
            row.shouldSelect = false;
            row.statusMessage = `<span style="color:#ef4444; font-weight:700;"><i class="fas fa-clone"></i> Ya importado esta semana</span>`;
            return;
        }

        if (lowerDesc.includes('salary') || lowerDesc.includes('payroll') || lowerDesc.includes('commission') || origDesc.includes('salary')) {
            row.suggestedCategory = 'Payroll';
            row.shouldSelect = false;
            row.statusMessage = `<span style="color:#ef4444; font-weight:700;"><i class="fas fa-ban"></i> Ignorar (Autogenerado en Módulos)</span>`;
            return;
        }

        if (lowerDesc.includes('legoland')) {
            row.suggestedCategory = 'Other';
            row.shouldSelect = false;
            row.statusMessage = `<span style="color:#f59e0b; font-weight:700;"><i class="fas fa-exclamation-triangle"></i> Ignorar (Personal)</span>`;
            return;
        }

        // Standing business rules: yard diesel vs roadside fuel
        if (row.isTitan || lowerDesc === 'crystal fuel' || origDesc.includes('titan fuel')) {
            row.description = 'CRYSTAL FUEL';
            row.suggestedCategory = 'Fuel';
            row.shouldSelect = true;
            const hist = findHistoryMatch(row, memory);
            row.statusMessage = hist
                ? historyStatusHtml(hist)
                : `<span style="color:#10b981; font-weight:700;"><i class="fas fa-gas-pump"></i> Titan / Crystal Fuel (fecha del banco)</span>`;
            return;
        }

        if (row.groupKey === 'GAS STATIONS') {
            row.suggestedCategory = 'Fuel';
            row.shouldSelect = true;
            const hist = findHistoryMatch(row, memory);
            row.statusMessage = hist
                ? historyStatusHtml(hist)
                : `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Gas stations (miércoles agrupado)</span>`;
            return;
        }

        const hist = findHistoryMatch(row, memory);
        if (hist) {
            row.suggestedCategory = hist.category || 'Other';
            const catUpper = (hist.category || '').toUpperCase();
            if (catUpper === 'PAYROLL' || catUpper === 'COMMISSION') {
                row.shouldSelect = false;
                row.statusMessage = `<span style="color:#ef4444; font-weight:700;"><i class="fas fa-ban"></i> Ignorar (Autogenerado en Módulos)</span>`;
            } else {
                row.shouldSelect = true;
                row.statusMessage = historyStatusHtml(hist);
            }
            return;
        }

        // Category hints only — do not auto-check vendors the client has never registered
        if (lowerDesc.includes('progressive insurance')) {
            row.suggestedCategory = 'Insurance';
        } else if (lowerDesc.includes('ford motor credit') || lowerDesc.includes('ally financial')) {
            row.suggestedCategory = 'Equipment & Machinery';
        } else if (lowerDesc.includes("o'reilly") || lowerDesc.includes('home depot')) {
            row.suggestedCategory = 'Maintenance & Repairs';
        } else if (lowerDesc.includes('t-mobile')) {
            row.suggestedCategory = 'Communication';
        } else if (lowerDesc.includes('fpl')) {
            row.suggestedCategory = 'Utilities';
        }

        row.isUnknown = true;
        row.shouldSelect = false;
        row.statusMessage = `<span style="color:#f59e0b; font-weight:700;"><i class="fas fa-question-circle"></i> Desconocido (no aparece en gastos)</span>`;
    });
}

function renderCsvPreview() {
    const container = document.getElementById('csv-preview-container');
    const tbody = document.getElementById('csv-preview-body');

    if (window.csvParsedData.length === 0) {
        alert('No valid expenses found. Debug info:\n' + (window.csvDebugRows || []).join('\n'));
        return;
    }

    container.style.display = 'block';
    tbody.innerHTML = '';

    const catSelect = document.getElementById('exp-category');
    const catList = document.getElementById('exp-category-list');
    let categoryOptions = '';

    if (catList && catList.options) {
        Array.from(catList.options).forEach(opt => {
            if (opt.value) categoryOptions += `<option value="${opt.value}">${opt.value}</option>`;
        });
    } else if (catSelect && catSelect.options) {
        Array.from(catSelect.options).forEach(opt => {
            if (opt.value) categoryOptions += `<option value="${opt.value}">${opt.text || opt.value}</option>`;
        });
    } else {
        categoryOptions = `<option value="Other">Other</option>`;
    }

    window.csvParsedData.forEach((row, i) => {
        const tr = document.createElement('tr');
        if (row.isRecurring || row.isDuplicate) {
            tr.style.backgroundColor = '#fef2f2';
        } else if (!row.shouldSelect) {
            tr.style.backgroundColor = '#fffbeb';
        }

        let descHtml = row.description;
        if (row.subItems && row.subItems.length > 1) {
            descHtml = `<span style="cursor:pointer; color:#3b82f6; display:inline-block; width:20px;" onclick="window.toggleSubRows('sub-row-${i}', this)"><i class="fas fa-chevron-down"></i></span> ${escapeHtml(row.description)} <span style="color:#64748b; font-weight:600;">(${row.groupedCount} cargos)</span>`;
        } else {
            descHtml = escapeHtml(row.description);
        }

        const dateHint = row.usesWednesdayDate
            ? `<div style="font-size:0.7rem; color:#4f46e5; font-weight:800;">Miércoles de la semana</div>`
            : `<div style="font-size:0.7rem; color:#64748b; font-weight:700;">Fecha del banco</div>`;

        tr.className = 'csv-main-row';
        tr.setAttribute('data-csv-index', String(i));
        tr.innerHTML = `
            <td style="text-align:center;">
                <input type="checkbox" class="csv-row-checkbox" data-index="${i}" ${row.shouldSelect ? 'checked' : ''} onchange="updateCsvTotal()" style="transform: scale(1.2);">
            </td>
            <td>${formatCsvDate(row.date)}${dateHint}</td>
            <td style="font-size: 0.85rem; font-weight: 700;">
                ${descHtml}
                <div class="csv-ai-slot" data-index="${i}">${renderCsvAiBlock(row, i)}</div>
            </td>
            <td>
                <select class="csv-category-select" data-index="${i}" style="width:100%; padding: 4px; border-radius: 4px; border: 1px solid #cbd5e1;">
                    ${categoryOptions}
                </select>
            </td>
            <td style="text-align:right; font-weight: 900; color: #ef4444;">$${row.amount.toFixed(2)}</td>
            <td style="font-size: 0.85rem;">${row.statusMessage}</td>
        `;

        tbody.appendChild(tr);

        if (row.subItems && row.subItems.length > 1) {
            row.subItems.forEach(sub => {
                const subTr = document.createElement('tr');
                subTr.className = `csv-table-row sub-row-${i}`;
                subTr.style.display = 'none';
                subTr.style.backgroundColor = '#f8fafc';
                subTr.innerHTML = `
                    <td></td>
                    <td style="font-size: 0.8rem; color: #64748b;">${formatCsvDate(sub.date)}</td>
                    <td style="font-size: 0.8rem; color: #64748b; padding-left: 25px;">&#8627; ${sub.description}</td>
                    <td></td>
                    <td style="font-size: 0.8rem; color: #64748b; text-align:right;">$${sub.amount.toFixed(2)}</td>
                    <td></td>
                `;
                tbody.appendChild(subTr);
            });
        }

        const selectEl = tr.querySelector('.csv-category-select');
        selectEl.value = row.suggestedCategory;
        if (!selectEl.value) selectEl.value = 'Other';
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
    const boxes = document.querySelectorAll('.csv-row-checkbox');
    boxes.forEach(cb => {
        if (cb.checked) {
            const index = cb.getAttribute('data-index');
            total += window.csvParsedData[index].amount;
        }
    });
    document.getElementById('csv-selected-total').textContent = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const selectAll = document.getElementById('csv-select-all');
    if (selectAll && boxes.length) {
        selectAll.checked = [...boxes].every(cb => cb.checked);
    }
};

window.saveSelectedCsvExpenses = async function() {
    const btn = document.getElementById('btn-save-csv-import');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const checkboxes = document.querySelectorAll('.csv-row-checkbox:checked');
    let savedCount = 0;

    if (checkboxes.length === 0) {
        alert('Please select at least one expense to save.');
        btn.innerHTML = '<i class="fas fa-save"></i> Save Selected';
        btn.disabled = false;
        return;
    }

    for (const cb of checkboxes) {
        const index = cb.getAttribute('data-index');
        const rowData = window.csvParsedData[index];
        const selectEl = document.querySelector(`.csv-category-select[data-index="${index}"]`);
        const finalCategory = selectEl.value;

        let expenseNote = `Imported from Bank CSV (${rowData.bankDate || rowData.date}) - ${rowData.originalBankDesc || rowData.description}`;

        if (rowData.groupKey === 'GAS STATIONS' || rowData.description === 'GAS STATIONS') {
            expenseNote = 'DIESEL DELIVERY';
        } else if (rowData.description === 'CRYSTAL FUEL' || rowData.isTitan) {
            const match = (rowData.originalBankDesc || '').match(/"([^"]+)"/);
            expenseNote = match ? match[1] : (rowData.originalBankDesc || 'Titan / Crystal Fuel');
        } else if (rowData.usesWednesdayDate && rowData.subItems && rowData.subItems.length > 1) {
            const first = rowData.subItems[0].date;
            const last = rowData.subItems[rowData.subItems.length - 1].date;
            expenseNote = `Imported from Bank CSV (${first} to ${last}) - ${rowData.groupedCount} cargos agrupados`;
        }

        const expenseObj = {
            date: rowData.date,
            category: finalCategory,
            description: String(rowData.description || '').substring(0, 50),
            amount: rowData.amount,
            note: expenseNote,
            payment_method: 'bank'
        };

        try {
            if (window.addExpense) {
                const saved = await window.addExpense(expenseObj);
                if (saved) savedCount++;
            } else {
                console.error('window.addExpense is not defined.');
            }
        } catch (e) {
            console.error('Error saving expense:', e);
        }
    }

    alert(`Successfully imported ${savedCount} expenses.`);

    if (window.loadExpensesData) {
        window.loadExpensesData(true);
    }

    window.closeCsvImportModal();
    btn.innerHTML = '<i class="fas fa-save"></i> Save Selected';
    btn.disabled = false;
};

document.getElementById('csv-search-input')?.addEventListener('input', function(e) {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#csv-preview-body tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
});

const OPENAI_KEY_LS = 'openai_api_key';
const AI_CACHE_LS = 'rp_csv_ai_explanations';

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function aiCacheKey(row) {
    const base = `${row.groupKey || ''}||${row.originalBankDesc || row.description || ''}`;
    return base.toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 120);
}

function loadAiCache() {
    try { return JSON.parse(localStorage.getItem(AI_CACHE_LS) || '{}'); } catch (e) { return {}; }
}

function saveAiCache(cache) {
    try { localStorage.setItem(AI_CACHE_LS, JSON.stringify(cache)); } catch (e) { console.warn(e); }
}

function hydrateCsvAiFromCache() {
    const cache = loadAiCache();
    (window.csvParsedData || []).forEach(row => {
        const cached = cache[aiCacheKey(row)];
        if (cached && cached.explanation) row.aiExplanation = cached;
    });
}

function getOpenAiApiKey() {
    return (localStorage.getItem(OPENAI_KEY_LS) || '').trim();
}

function openOpenAiKeyPanel(message) {
    const panel = document.getElementById('csv-openai-key-panel');
    const input = document.getElementById('csv-openai-key-input');
    if (!panel || !input) return;
    panel.style.display = 'block';
    const existing = getOpenAiApiKey();
    input.value = existing;
    input.placeholder = existing ? 'Key guardada. Pega una nueva para reemplazarla.' : 'sk-...';
    if (message) {
        let hint = document.getElementById('csv-openai-key-hint');
        if (!hint) {
            hint = document.createElement('p');
            hint.id = 'csv-openai-key-hint';
            hint.style.cssText = 'margin:8px 0 0 0; font-size:0.8rem; color:#b45309; font-weight:700;';
            panel.appendChild(hint);
        }
        hint.textContent = message;
    }
    setTimeout(() => input.focus(), 50);
}

window.setOpenAiApiKey = function() {
    const panel = document.getElementById('csv-openai-key-panel');
    if (panel && panel.style.display === 'block') {
        panel.style.display = 'none';
        return;
    }
    openOpenAiKeyPanel('');
};

window.saveOpenAiApiKeyFromPanel = function() {
    const input = document.getElementById('csv-openai-key-input');
    const key = (input && input.value ? input.value : '').trim();
    if (!key) {
        alert('Pega primero tu API key (empieza con sk-).');
        return false;
    }
    localStorage.setItem(OPENAI_KEY_LS, key);
    const panel = document.getElementById('csv-openai-key-panel');
    if (panel) panel.style.display = 'none';
    if (input) input.value = '';
    alert('API key guardada. Ya puedes pulsar “Explicar desconocidos”.');
    return true;
};

document.getElementById('csv-openai-key-input')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        window.saveOpenAiApiKeyFromPanel();
    }
});

function getCsvCategoryNames() {
    const sel = document.getElementById('exp-category');
    if (!sel) return ['Fuel', 'Other'];
    return Array.from(sel.options).map(o => o.value).filter(Boolean);
}

function renderCsvAiBlock(row, index) {
    if (row.aiExplanation && row.aiExplanation.explanation) {
        const verdict = row.aiExplanation.verdict || 'unclear';
        const colors = {
            business: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', label: 'Parece gasto de la empresa' },
            personal: { bg: '#fff1f2', border: '#e11d48', text: '#9f1239', label: 'Parece personal / no típico de la operación' },
            unclear: { bg: '#eef2ff', border: '#6366f1', text: '#312e81', label: 'No está claro: confirma con el cliente' }
        };
        const theme = colors[verdict] || colors.unclear;
        const merchant = row.aiExplanation.merchant ? `<strong>${escapeHtml(row.aiExplanation.merchant)}.</strong> ` : '';
        return `<div style="margin-top:8px; background:${theme.bg}; border-left:3px solid ${theme.border}; padding:8px 10px; border-radius:6px; font-weight:500; color:${theme.text}; font-size:0.78rem; line-height:1.45;">
            <div style="font-weight:800; margin-bottom:4px;"><i class="fas fa-robot"></i> Qué es este cargo</div>
            <div>${merchant}${escapeHtml(row.aiExplanation.explanation)}</div>
            <div style="margin-top:6px; font-weight:800;">${theme.label}</div>
        </div>`;
    }

    return `<button type="button" onclick="explainOneCsvExpense(${index})" style="margin-top:6px; background:none; border:none; color:#4f46e5; font-weight:800; cursor:pointer; font-size:0.75rem; padding:0;">
        <i class="fas fa-robot"></i> Explicar este gasto
    </button>`;
}

function refreshCsvAiSlots() {
    document.querySelectorAll('.csv-ai-slot').forEach(slot => {
        const index = Number(slot.getAttribute('data-index'));
        const row = window.csvParsedData[index];
        if (!row) return;
        slot.innerHTML = renderCsvAiBlock(row, index);
    });
}

function applyAiCategoryHint(row, index) {
    if (!row.isUnknown || !row.aiExplanation) return;
    const cat = row.aiExplanation.suggested_category;
    if (!cat) return;
    const sel = document.querySelector(`.csv-category-select[data-index="${index}"]`);
    if (!sel) return;
    const exists = Array.from(sel.options).some(o => o.value === cat);
    if (exists) {
        sel.value = cat;
        row.suggestedCategory = cat;
    }
}

async function requestOpenAiExplanations(rows, apiKey) {
    const categories = getCsvCategoryNames();
    const payload = rows.map(r => ({
        id: r._aiId,
        date: r.date,
        amount: r.amount,
        bank_description: r.originalBankDesc || r.description,
        grouped_as: r.groupKey,
        sub_charges: (r.subItems || []).slice(0, 8).map(s => `${s.date} ${s.description} $${Number(s.amount).toFixed(2)}`)
    }));

    const system = `Eres un asistente para un contador que NO vive en Estados Unidos y registra gastos de RP Tulipan Logistic, una empresa de venta, transporte y yard de contenedores en South Florida (Miami, Hialeah, Hialeah Gardens, etc.). El cliente gasta desde una cuenta Bank of America.

Tu trabajo: explicar con detalle, en español claro, qué es CADA cargo del extracto bancario. Las descripciones del banco son crípticas (Zelle, SQ*, SP, WIRE, DEBIT CARD, IDs, ciudades abreviadas).

Para cada ítem incluye:
- Qué empresa, persona o servicio es (nombre real, rubro, qué venden o hacen).
- Qué significa ese tipo de cargo en Florida / EE.UU. (peajes, farmacia, Square, transferencia book, leasing de contenedores, etc.).
- Si encaja como gasto de una empresa de camiones/contenedores o parece personal/ajeno.
- Una categoría sugerida SOLO de esta lista: ${categories.join(', ')}.

Reglas:
- Zelle suele ser un pago a una persona; el memo (rolling door, maintenance, salary) dice el motivo.
- SQ * es un cobro con Square (negocio chico o servicio).
- CVS ExtraCare es farmacia/fidelidad CVS, casi nunca es gasto operativo de camiones.
- Wires a Florens u otras leasing/asset companies suelen ser alquiler o compra de contenedores.
- No inventes datos precisos si no estás seguro; dilo y da la interpretación más probable.
- Responde SOLO JSON válido, sin markdown, con esta forma: {"items":[{"id":0,"merchant":"...","explanation":"2 a 5 oraciones","verdict":"business|personal|unclear","suggested_category":"..."}]}`;

    const body = {
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Explica estos cargos:\n${JSON.stringify(payload)}` }
        ]
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = raw.error?.message || res.statusText || 'Error de OpenAI';
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }

    let text = raw.choices?.[0]?.message?.content || '{}';
    text = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = {}; }
    return Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
}

window.explainOneCsvExpense = function(index) {
    return window.explainCsvExpensesWithAi('one', { index });
};

window.explainCsvExpensesWithAi = async function(mode = 'unknown', options = {}) {
    const btn = document.getElementById('btn-csv-ai-explain');
    const data = window.csvParsedData || [];
    if (!data.length) {
        if (!options.auto) alert('Primero carga el archivo del banco.');
        return;
    }

    const targets = data
        .map((row, index) => ({ row, index }))
        .filter(({ row, index }) => {
            if (row.aiExplanation && row.aiExplanation.explanation) return false;
            if (mode === 'one') return index === options.index;
            if (mode === 'all') return true;
            return !!row.isUnknown;
        });

    if (!targets.length) {
        if (!options.auto && mode !== 'one') alert('No hay gastos desconocidos pendientes de explicar.');
        return;
    }

    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
        if (!options.auto) openOpenAiKeyPanel('Primero guarda tu API key y vuelve a pulsar Explicar desconocidos.');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Explicando...';
    }

    const cache = loadAiCache();
    const chunkSize = 18;

    try {
        for (let start = 0; start < targets.length; start += chunkSize) {
            const chunk = targets.slice(start, start + chunkSize).map(({ row, index }) => {
                row._aiId = index;
                return row;
            });
            const items = await requestOpenAiExplanations(chunk, apiKey);
            const byId = new Map(items.map(item => [Number(item.id), item]));

            chunk.forEach(row => {
                const item = byId.get(row._aiId);
                if (!item) return;
                const explanation = {
                    merchant: item.merchant || '',
                    explanation: item.explanation || item.what || '',
                    verdict: ['business', 'personal', 'unclear'].includes(item.verdict) ? item.verdict : 'unclear',
                    suggested_category: item.suggested_category || ''
                };
                if (!explanation.explanation) return;
                row.aiExplanation = explanation;
                cache[aiCacheKey(row)] = explanation;
                applyAiCategoryHint(row, row._aiId);
            });
            refreshCsvAiSlots();
        }
        saveAiCache(cache);
    } catch (err) {
        console.error('CSV AI explain error:', err);
        if (err.status === 401) {
            localStorage.removeItem(OPENAI_KEY_LS);
            alert('La API key de OpenAI no es válida. Ábrela con API KEY y pégala de nuevo.');
            openOpenAiKeyPanel('La key no es válida. Pega una nueva desde platform.openai.com');
        } else {
            alert('No se pudo explicar con IA: ' + (err.message || 'error desconocido'));
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-robot"></i> Explicar desconocidos';
        }
    }
};

