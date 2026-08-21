// recycle-bin.js

window.openRecycleBin = async function() {
    // Restrict access to Admins only
    if (!isAdmin()) {
        alert("Acceso denegado: Solo los administradores pueden ver la papelera de reciclaje.");
        return;
    }

    // Inject modal if it doesn't exist
    if (!document.getElementById('recycle-bin-modal')) {
        const modalHtml = `
        <div id="recycle-bin-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; align-items:center; justify-content:center;">
            <div style="background:#fff; width:95%; max-width:900px; height:85vh; border-radius:12px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
                
                <div style="padding:20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-trash-restore" style="font-size:1.5rem; color:#ef4444;"></i>
                        <h2 style="margin:0; font-size:1.25rem; color:#0f172a;">Papelera de Reciclaje (Soft Deleted)</h2>
                    </div>
                    <button onclick="document.getElementById('recycle-bin-modal').style.display='none'" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#64748b;">&times;</button>
                </div>

                <div style="padding:15px; background:#fff; border-bottom:1px solid #e2e8f0; display:flex; gap:10px; flex-wrap:wrap;">
                    <select id="rb-table-select" style="padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1; outline:none;" onchange="loadRecycleBin()">
                        <option value="trips">Trips (Viajes)</option>
                        <option value="rentals">Rentals</option>
                        <option value="releases">Releases</option>
                        <option value="expenses">Expenses (Gastos)</option>
                        <option value="receivables_invoices">Receivables (Facturas)</option>
                        <option value="settlement_history">Settlements (Liquidaciones)</option>
                        <option value="fleet">Fleet (Equipos)</option>
                        <option value="drivers">Drivers (Choferes)</option>
                        <option value="customers">Customers (Clientes)</option>
                        <option value="call_logs">Calls (Llamadas)</option>
                    </select>
                    <button class="glossy-blue-btn" onclick="loadRecycleBin()" style="padding:0 15px; height:35px;"><i class="fas fa-sync-alt"></i> Refresh</button>
                </div>

                <div style="flex:1; overflow:auto; padding:0; background:#f1f5f9;">
                    <table style="width:100%; border-collapse:collapse; background:#fff;">
                        <thead style="position:sticky; top:0; background:#f8fafc; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                            <tr>
                                <th style="padding:12px 15px; text-align:left; font-size:0.8rem; color:#64748b; font-weight:600; border-bottom:1px solid #e2e8f0;">DETALLES PRINCIPALES</th>
                                <th style="padding:12px 15px; text-align:left; font-size:0.8rem; color:#64748b; font-weight:600; border-bottom:1px solid #e2e8f0;">ELIMINADO POR</th>
                                <th style="padding:12px 15px; text-align:left; font-size:0.8rem; color:#64748b; font-weight:600; border-bottom:1px solid #e2e8f0;">FECHA (DELETED_AT)</th>
                                <th style="padding:12px 15px; text-align:right; font-size:0.8rem; color:#64748b; font-weight:600; border-bottom:1px solid #e2e8f0;">ACCIONES</th>
                            </tr>
                        </thead>
                        <tbody id="rb-tbody">
                            <tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    document.getElementById('recycle-bin-modal').style.display = 'flex';
    loadRecycleBin();
};

window.loadRecycleBin = async function() {
    const table = document.getElementById('rb-table-select').value;
    const tbody = document.getElementById('rb-tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Cargando registros eliminados...</td></tr>';
    
    try {
        const { data, error } = await window.db.from(table)
            .select('*')
            .eq('is_deleted', true)
            .order('deleted_at', { ascending: false });
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:#94a3b8;"><i class="fas fa-box-open" style="font-size:2rem; margin-bottom:10px; display:block;"></i>No hay registros en la papelera para esta tabla.</td></tr>';
            return;
        }

        let html = '';
        data.forEach(item => {
            let details = 'ID: ' + (item.id || item.trip_id || item.unit_id);
            
            // Generate readable details based on table
            if (table === 'trips') details = `<strong>TRIP:</strong> ${item.trip_id} | ${item.customer} | ${item.pickup_address} -> ${item.delivery_place}`;
            else if (table === 'customers' || table === 'drivers') details = `<strong>Nombre:</strong> ${item.name}`;
            else if (table === 'expenses') details = `<strong>Gasto:</strong> $${item.amount} | ${item.category} | ${item.description}`;
            else if (table === 'receivables_invoices') details = `<strong>Factura:</strong> ${item.invoice_number} | $${item.total_amount}`;
            else if (table === 'releases') details = `<strong>Release:</strong> ${item.release_no} | ${item.depot}`;
            else if (table === 'rentals') details = `<strong>Rental:</strong> ${item.release_no} | ${item.container_no}`;
            else if (table === 'settlement_history') details = `<strong>Settlement:</strong> ${item.driver_name} ($${item.gross_amount})`;

            const deletedAt = item.deleted_at ? new Date(item.deleted_at).toLocaleString() : 'Desconocido';
            const deletedBy = item.deleted_by || 'Desconocido';

            html += `
                <tr style="border-bottom:1px solid #f1f5f9; transition:background 0.2s;">
                    <td style="padding:12px 15px; font-size:0.85rem; color:#334155;">${details}</td>
                    <td style="padding:12px 15px; font-size:0.85rem; color:#64748b;">${deletedBy}</td>
                    <td style="padding:12px 15px; font-size:0.85rem; color:#64748b;">${deletedAt}</td>
                    <td style="padding:12px 15px; text-align:right; display:flex; justify-content:flex-end; gap:8px;">
                        <button onclick="restoreRecord('${table}', '${item.id || item.trip_id || item.unit_id}')" class="glossy-blue-btn" style="height:30px; padding:0 12px; font-size:0.75rem;" title="Restaurar">
                            <i class="fas fa-undo"></i> Restaurar
                        </button>
                        <button onclick="hardDeleteRecord('${table}', '${item.id || item.trip_id || item.unit_id}')" class="glossy-red-btn" style="height:30px; padding:0 12px; font-size:0.75rem; background:#ef4444;" title="Borrar Permanente">
                            <i class="fas fa-times"></i> Destruir
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        
    } catch (err) {
        console.error("Error loading recycle bin:", err);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#ef4444;">Error: ${err.message}</td></tr>`;
    }
};

window.restoreRecord = async function(table, idValue) {
    if (!confirm(`¿Estás seguro de que quieres RESTAURAR este registro? Volverá a aparecer en el sistema.`)) return;
    try {
        const idCol = table === 'trips' ? 'trip_id' : (table === 'fleet' ? 'unit_id' : 'id');
        const { error } = await window.db.from(table).update({
            is_deleted: false,
            deleted_at: null,
            deleted_by: null
        }).eq(idCol, idValue);
        
        if (error) throw error;
        
        if (window.logActivity) window.logActivity("RESTORED_RECORD", `[${new Date().toLocaleString()}] Restauró registro en ${table} ID: ${idValue}`);
        
        alert("¡Registro restaurado exitosamente!");
        loadRecycleBin(); // Refresh list
        
        // Force manual UI refresh for the specific module to guarantee it appears instantly
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
        }
        
    } catch (err) {
        console.error("Error restoring:", err);
        alert("Error al restaurar: " + err.message);
    }
};

window.hardDeleteRecord = async function(table, idValue) {
    if (!confirm(`¡ADVERTENCIA CRÍTICA!\n\nEstás a punto de borrar este registro PERMANENTEMENTE de la base de datos. Esta acción NO se puede deshacer.\n\n¿Estás absolutamente seguro?`)) return;
    try {
        const idCol = table === 'trips' ? 'trip_id' : (table === 'fleet' ? 'unit_id' : 'id');
        const { error } = await window.db.from(table).delete().eq(idCol, idValue);
        
        if (error) throw error;
        
        if (window.logActivity) window.logActivity("HARD_DELETED_RECORD", `[${new Date().toLocaleString()}] Destruyó permanentemente registro en ${table} ID: ${idValue}`);
        
        alert("Registro destruido.");
        loadRecycleBin(); // Refresh list
    } catch (err) {
        console.error("Error hard deleting:", err);
        alert("Error al destruir: " + err.message);
    }
};
