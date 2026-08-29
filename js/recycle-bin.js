// recycle-bin.js

window.openRecycleBin = async function() {
    if (!isAdmin()) {
        alert("Acceso denegado: Solo los administradores pueden ver la papelera de reciclaje.");
        return;
    }

    const existing = document.getElementById('recycle-bin-modal');
    if (existing) existing.remove();

    const modalHtml = `
        <div id="recycle-bin-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; align-items:center; justify-content:center;">
            <div style="background:#fff; width:96%; max-width:1100px; height:88vh; border-radius:12px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
                
                <div style="padding:18px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-trash-restore" style="font-size:1.4rem; color:#ef4444;"></i>
                        <div>
                            <h2 style="margin:0; font-size:1.2rem; color:#0f172a;">Papelera de Reciclaje</h2>
                            <div id="rb-count" style="font-size:0.75rem; color:#64748b; margin-top:2px;">Registros eliminados — no aparecen en el resto del sistema</div>
                        </div>
                    </div>
                    <button onclick="document.getElementById('recycle-bin-modal').style.display='none'" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#64748b;">&times;</button>
                </div>

                <div style="padding:12px 16px; background:#fff; border-bottom:1px solid #e2e8f0; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                    <select id="rb-table-select" style="padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1; outline:none;" onchange="document.getElementById('rb-search').value=''; loadRecycleBin()">
                        <option value="trips">Viajes</option>
                        <option value="rentals">Rentals</option>
                        <option value="releases">Releases</option>
                        <option value="expenses">Gastos</option>
                        <option value="receivables_invoices">Facturas</option>
                        <option value="settlement_history">Liquidaciones</option>
                        <option value="fleet">Flota</option>
                        <option value="drivers">Choferes</option>
                        <option value="customers">Clientes</option>
                        <option value="call_logs">Llamadas</option>
                        <option value="yard_stock">Yard Stock</option>
                    </select>
                    <input id="rb-search" type="search" placeholder="Buscar cliente, orden, contenedor..."
                        oninput="rbApplySearch()"
                        style="flex:1; min-width:220px; padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1; outline:none;">
                    <button class="glossy-blue-btn" onclick="loadRecycleBin()" style="padding:0 15px; height:35px;"><i class="fas fa-sync-alt"></i> Refresh</button>
                </div>

                <div style="flex:1; overflow:auto; padding:12px 16px; background:#f1f5f9;">
                    <div id="rb-list"></div>
                </div>

            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('recycle-bin-modal').style.display = 'flex';
    loadRecycleBin();
};

function rbIsMissingRpc(error, fnName) {
    if (!error) return false;
    const code = String(error.code || '');
    const msg = String(error.message || '').toLowerCase();
    return code === 'PGRST202' || code === '42883' || msg.includes(fnName) || msg.includes('could not find the function');
}

function rbRecordId(table, item) {
    if (table === 'trips') return item.trip_id;
    if (table === 'fleet') return item.unit_id;
    return item.id;
}

function rbEsc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function rbClean(val) {
    if (val === null || val === undefined) return '';
    const s = String(val).trim();
    if (!s || s === '---' || s === 'null' || s === 'undefined') return '';
    return s;
}

function rbFmtDay(val) {
    const s = rbClean(val);
    if (!s) return '';
    const d = new Date(s.includes('T') ? s : s + 'T12:00:00');
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rbFmtWhen(val) {
    const s = rbClean(val);
    if (!s) return 'Fecha desconocida';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString('es-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function rbFmtMoney(val) {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n === 0) return '';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rbWho(email) {
    const s = rbClean(email);
    if (!s) return { name: 'Desconocido', title: '' };
    const name = s.includes('@') ? s.split('@')[0] : s;
    return { name, title: s };
}

function rbChip(label, value) {
    const v = rbClean(value);
    if (!v) return '';
    return `<span style="display:inline-flex; align-items:center; gap:5px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:3px 8px; font-size:0.75rem; color:#334155;">
        <span style="font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.03em; font-size:0.65rem;">${rbEsc(label)}</span>
        ${rbEsc(v)}
    </span>`;
}

function rbBuildCard(table, item) {
    let title = 'Registro';
    let subtitle = '';
    const chips = [];

    if (table === 'trips') {
        title = rbClean(item.customer) || 'Viaje sin cliente';
        const parts = [rbFmtDay(item.date), rbClean(item.order_no) ? 'Orden ' + rbClean(item.order_no) : '', rbClean(item.n_cont) ? 'Cont. ' + rbClean(item.n_cont) : ''].filter(Boolean);
        subtitle = parts.join('  ·  ');
        const from = rbClean(item.pickup_address);
        const to = rbClean(item.delivery_place);
        if (from || to) chips.push(rbChip('Ruta', (from || '—') + '  →  ' + (to || '—')));
        chips.push(rbChip('Chofer', item.driver));
        chips.push(rbChip('Servicio', item.service_mode));
        chips.push(rbChip('Release', item.release_no));
        chips.push(rbChip('Monto', rbFmtMoney(item.amount)));
    } else if (table === 'rentals') {
        title = rbClean(item.customer_name) || 'Rental sin cliente';
        subtitle = [rbClean(item.container_no) ? 'Cont. ' + rbClean(item.container_no) : '', rbClean(item.release_no) ? 'Release ' + rbClean(item.release_no) : ''].filter(Boolean).join('  ·  ');
        const range = [rbFmtDay(item.start_date), rbFmtDay(item.final_date || item.end_date)].filter(Boolean).join(' → ');
        chips.push(rbChip('Periodo', range));
        chips.push(rbChip('Estado', item.status));
        chips.push(rbChip('Pago', item.payment_status));
        chips.push(rbChip('Precio', rbFmtMoney(item.base_price)));
    } else if (table === 'releases') {
        title = rbClean(item.release_no) ? 'Release ' + rbClean(item.release_no) : 'Release';
        subtitle = [rbFmtDay(item.date), rbClean(item.depot)].filter(Boolean).join('  ·  ');
        chips.push(rbChip('Tipo', item.type));
        chips.push(rbChip('Condición', item.condition));
        chips.push(rbChip('Seller', item.seller));
        chips.push(rbChip('Stock', item.total_stock));
    } else if (table === 'expenses') {
        title = rbClean(item.description) || 'Gasto';
        subtitle = [rbFmtDay(item.date), rbClean(item.category)].filter(Boolean).join('  ·  ');
        chips.push(rbChip('Monto', rbFmtMoney(item.amount)));
        chips.push(rbChip('Pago', item.payment_method));
        chips.push(rbChip('Nota', item.note));
    } else if (table === 'receivables_invoices') {
        title = rbClean(item.invoice_number) ? 'Factura ' + rbClean(item.invoice_number) : 'Factura';
        subtitle = [rbClean(item.customer_name || item.customer), rbFmtDay(item.date_generated || item.date)].filter(Boolean).join('  ·  ');
        chips.push(rbChip('Total', rbFmtMoney(item.total_amount)));
        chips.push(rbChip('Estado', item.status));
        chips.push(rbChip('Servicio', item.service_type));
    } else if (table === 'settlement_history') {
        title = rbClean(item.driver_name) || 'Liquidación';
        const range = [rbFmtDay(item.start_date), rbFmtDay(item.end_date)].filter(Boolean).join(' → ');
        subtitle = range;
        chips.push(rbChip('Bruto', rbFmtMoney(item.gross_amount)));
        chips.push(rbChip('Cash', rbFmtMoney(item.cash_balance)));
    } else if (table === 'fleet') {
        title = rbClean(item.num) ? 'Unidad #' + rbClean(item.num) : (rbClean(item.unit_id) || 'Equipo');
        subtitle = [rbClean(item.type), rbClean(item.plate) ? 'Placa ' + rbClean(item.plate) : ''].filter(Boolean).join('  ·  ');
        chips.push(rbChip('VIN', item.vin));
        chips.push(rbChip('Año', item.year));
    } else if (table === 'drivers') {
        title = rbClean(item.name) || 'Chofer';
        chips.push(rbChip('Teléfono', item.phone || item.phone_no));
        chips.push(rbChip('Email', item.email));
    } else if (table === 'customers') {
        title = rbClean(item.name) || 'Cliente';
        chips.push(rbChip('Email', item.email));
        chips.push(rbChip('Dirección', item.address));
        chips.push(rbChip('Teléfono', item.phone || item.phone_no));
    } else if (table === 'call_logs') {
        title = rbClean(item.customer) || 'Llamada';
        subtitle = [rbFmtDay(item.date), rbClean(item.city), rbClean(item.status)].filter(Boolean).join('  ·  ');
        chips.push(rbChip('Teléfono', item.phone));
        chips.push(rbChip('Servicio', item.service_type));
        chips.push(rbChip('Monto', rbFmtMoney(item.amount)));
        chips.push(rbChip('Asignado', item.created_by));
    } else if (table === 'yard_stock') {
        title = rbClean(item.container_no) ? 'Contenedor ' + rbClean(item.container_no) : 'Yard stock';
        subtitle = [rbClean(item.customer_name), rbClean(item.origin_release) ? 'Release ' + rbClean(item.origin_release) : ''].filter(Boolean).join('  ·  ');
        chips.push(rbChip('Size', item.size));
        chips.push(rbChip('Estado', item.status));
        chips.push(rbChip('Tipo', item.type));
    } else {
        title = 'ID ' + rbClean(item.id || item.trip_id || item.unit_id);
    }

    const searchText = [title, subtitle, ...chips.map(c => c.replace(/<[^>]+>/g, ' '))].join(' ').toLowerCase();
    return { title, subtitle, chips: chips.filter(Boolean), searchText };
}

async function rbFetchDeleted(table) {
    const { data, error } = await window.db.rpc('admin_list_deleted', { p_table: table });
    if (!error) return Array.isArray(data) ? data : [];
    if (!rbIsMissingRpc(error, 'admin_list_deleted')) throw error;

    const fallback = await window.db.from(table)
        .select('*')
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false });
    if (fallback.error) throw fallback.error;
    return fallback.data || [];
}

function rbRenderRows(rows) {
    const list = document.getElementById('rb-list');
    const table = window._rbLastTable;
    const countEl = document.getElementById('rb-count');
    const total = (window._rbLastRows || []).length;

    if (countEl) {
        countEl.textContent = rows.length === total
            ? `${total} registro${total === 1 ? '' : 's'} eliminado${total === 1 ? '' : 's'}`
            : `${rows.length} de ${total} registros`;
    }

    if (!rows.length) {
        list.innerHTML = '<div style="text-align:center; padding:40px 20px; color:#94a3b8;"><i class="fas fa-box-open" style="font-size:2rem; margin-bottom:10px; display:block;"></i>No hay registros en la papelera para esta tabla.</div>';
        return;
    }

    list.innerHTML = rows.map(item => {
        const card = rbBuildCard(table, item);
        const who = rbWho(item.deleted_by);
        const idVal = rbRecordId(table, item);
        const chipsHtml = card.chips.join('');

        return `
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; margin-bottom:10px; display:flex; gap:14px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap;">
                <div style="flex:1; min-width:260px;">
                    <div style="font-weight:700; font-size:0.95rem; color:#0f172a; margin-bottom:2px;">${rbEsc(card.title)}</div>
                    ${card.subtitle ? `<div style="font-size:0.8rem; color:#64748b; margin-bottom:8px;">${rbEsc(card.subtitle)}</div>` : '<div style="height:8px;"></div>'}
                    <div style="display:flex; flex-wrap:wrap; gap:6px;">${chipsHtml}</div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px; min-width:180px;">
                    <div style="text-align:right; font-size:0.75rem; color:#64748b; line-height:1.35;">
                        <div>Eliminado por <strong style="color:#334155;" title="${rbEsc(who.title)}">${rbEsc(who.name)}</strong></div>
                        <div>${rbEsc(rbFmtWhen(item.deleted_at))}</div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button onclick="restoreRecord('${table}', '${idVal}')" class="glossy-blue-btn" style="height:32px; padding:0 12px; font-size:0.75rem;" title="Restaurar">
                            <i class="fas fa-undo"></i> Restaurar
                        </button>
                        <button onclick="hardDeleteRecord('${table}', '${idVal}')" class="glossy-red-btn" style="height:32px; padding:0 12px; font-size:0.75rem; background:#ef4444;" title="Borrar permanente">
                            <i class="fas fa-times"></i> Destruir
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.rbApplySearch = function() {
    const q = (document.getElementById('rb-search')?.value || '').trim().toLowerCase();
    const rows = window._rbLastRows || [];
    if (!q) {
        rbRenderRows(rows);
        return;
    }
    rbRenderRows(rows.filter(item => rbBuildCard(window._rbLastTable, item).searchText.includes(q)));
};

window.loadRecycleBin = async function() {
    const table = document.getElementById('rb-table-select').value;
    const list = document.getElementById('rb-list');
    list.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Cargando registros eliminados...</div>';

    try {
        const data = await rbFetchDeleted(table);
        window._rbLastTable = table;
        window._rbLastRows = data || [];
        rbApplySearch();
    } catch (err) {
        console.error("Error loading recycle bin:", err);
        list.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Error: ${rbEsc(err.message)}</div>`;
    }
};

window.restoreRecord = async function(table, idValue) {
    if (!confirm(`¿Estás seguro de que quieres RESTAURAR este registro? Volverá a aparecer en el sistema.`)) return;
    try {
        const rpc = await window.db.rpc('admin_restore_record', { p_table: table, p_id: String(idValue) });
        let error = rpc.error;
        if (error && rbIsMissingRpc(error, 'admin_restore_record')) {
            const idCol = table === 'trips' ? 'trip_id' : (table === 'fleet' ? 'unit_id' : 'id');
            const fallback = await window.db.from(table).update({
                is_deleted: false,
                deleted_at: null,
                deleted_by: null
            }).eq(idCol, idValue);
            error = fallback.error;
        }
        if (error) throw error;

        if (window.logActivity) window.logActivity("RESTORED_RECORD", `[${new Date().toLocaleString()}] Restauró registro en ${table} ID: ${idValue}`);

        alert("¡Registro restaurado exitosamente!");
        loadRecycleBin();

        if (table === 'trips' && typeof window.loadTableData === 'function') {
             window.loadTableData(null, true);
        } else if (table === 'receivables_invoices' && typeof window.renderReceivables === 'function') {
             if (window.receivablesData) window.receivablesData.invoices = null;
             window.renderReceivables();
        } else if (table === 'fleet' && typeof window.loadFleetData === 'function') {
             window.loadFleetData(true);
        } else if (table === 'drivers' && typeof window.loadDriversData === 'function') {
             window.loadDriversData(true);
        } else if (table === 'expenses' && typeof window.loadExpensesData === 'function') {
             window.loadExpensesData(true);
        } else if (table === 'releases' && typeof window.loadReleasesData === 'function') {
             window.loadReleasesData(true);
        } else if (table === 'rentals' && typeof window.loadRentalsData === 'function') {
             window.loadRentalsData(true);
        } else if (table === 'call_logs' && typeof window.loadCallsData === 'function') {
             window.loadCallsData(true);
        } else if (table === 'yard_stock' && typeof window.loadYardData === 'function') {
             window.loadYardData(true);
        }

    } catch (err) {
        console.error("Error restoring:", err);
        alert("Error al restaurar: " + err.message);
    }
};

window.hardDeleteRecord = async function(table, idValue) {
    if (!confirm(`¡ADVERTENCIA CRÍTICA!\n\nEstás a punto de borrar este registro PERMANENTEMENTE de la base de datos. Esta acción NO se puede deshacer.\n\n¿Estás absolutamente seguro?`)) return;
    try {
        const rpc = await window.db.rpc('admin_hard_delete', { p_table: table, p_id: String(idValue) });
        let error = rpc.error;
        if (error && rbIsMissingRpc(error, 'admin_hard_delete')) {
            const idCol = table === 'trips' ? 'trip_id' : (table === 'fleet' ? 'unit_id' : 'id');
            const fallback = await window.db.from(table).delete().eq(idCol, idValue);
            error = fallback.error;
        }
        if (error) throw error;

        if (window.logActivity) window.logActivity("HARD_DELETED_RECORD", `[${new Date().toLocaleString()}] Destruyó permanentemente registro en ${table} ID: ${idValue}`);

        alert("Registro destruido.");
        loadRecycleBin();
    } catch (err) {
        console.error("Error hard deleting:", err);
        alert("Error al destruir: " + err.message);
    }
};
