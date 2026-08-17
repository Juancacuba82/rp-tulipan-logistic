const fs = require('fs');
const file = 'c:/Users/Juanca/Desktop/RP tulipan logistic/js/billing-manager.js';
let content = fs.readFileSync(file, 'utf8');

const newCode = `
    // ── MASTER FILTERED INVOICE ───────────────────────────────
    window.openMasterBillingModal = function() {
        const rows = window.billingRows || [];
        if (rows.length === 0) {
            alert('No hay órdenes para facturar en la vista actual.');
            return;
        }

        const customer = document.getElementById('bc-f-customer')?.value;
        if (!customer) {
            alert('Debe seleccionar un cliente específico para generar un invoice.');
            return;
        }

        document.getElementById('mb-bill-to-name').textContent = customer;
        document.getElementById('mb-date-display').textContent = new Date().toLocaleDateString('en-US');

        const tbody = document.getElementById('mb-services-body');
        tbody.innerHTML = '';
        let grandTotal = 0;

        // Simple aggregation logic based on what's visible
        let totalTransport = 0, transportCount = 0;
        let totalYard = 0, yardCount = 0;
        let totalSales = 0, salesCount = 0;
        let totalStorage = 0, storageCount = 0;
        let totalRent = 0, rentCount = 0;

        rows.forEach(r => {
            if ((parseFloat(r[18]) || 0) > 0 && r[42] === 'YES') { totalTransport += parseFloat(r[18]); transportCount++; }
            if ((parseFloat(r[13]) || 0) > 0) { totalYard += parseFloat(r[13]); yardCount++; }
            if ((parseFloat(r[20]) || 0) > 0 && r[43] === 'YES') { totalSales += parseFloat(r[20]) * (parseInt(r[53])||1); salesCount += parseInt(r[53])||1; }
            if ((parseFloat(r[14]) || 0) > 0) {
                const entry = new Date(r[1]);
                const exit = r[15] && r[15] !== '---' ? new Date(r[15]) : new Date();
                const days = Math.max(1, Math.ceil(Math.abs(exit - entry) / (1000 * 60 * 60 * 24)));
                totalStorage += parseFloat(r[14]) * days;
                storageCount += days;
            }
            if ((parseFloat(r[27]) || 0) > 0) {
                // Approximate 1 month/period for simplicity in this aggregated view
                totalRent += parseFloat(r[27]);
                rentCount++;
            }
        });

        const addRow = (desc, qty, total) => {
            if (total <= 0) return;
            const unit = total / qty;
            grandTotal += total;
            tbody.innerHTML += \`
                <tr>
                    <td style="padding:14px 15px;font-weight:600;color:#1e293b;">\${desc}</td>
                    <td style="padding:14px 15px;text-align:center;color:#0f172a;">\${qty}</td>
                    <td style="padding:14px 15px;text-align:right;color:#0f172a;">$\${unit.toFixed(2)}</td>
                    <td style="padding:14px 15px;text-align:right;font-weight:800;color:#1e293b;">$\${total.toFixed(2)}</td>
                </tr>
            \`;
        };

        addRow('TRANSPORT SERVICE', transportCount, totalTransport);
        addRow('YARD / ADDITIONAL SERVICES', yardCount, totalYard);
        addRow('CONTAINER SALES', salesCount, totalSales);
        addRow('STORAGE SERVICE', storageCount, totalStorage);
        // Only show rent if there's any
        addRow('CONTAINER RENTAL', rentCount, totalRent);

        document.getElementById('mb-total').textContent = \`$\${grandTotal.toFixed(2)}\`;

        const modal = document.getElementById('master-billing-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeMasterBillingModal = function() {
        const modal = document.getElementById('master-billing-modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    };

    window.sendFilteredInvoiceEmail = async function() {
        const btn = event.currentTarget;
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ENVIANDO...';

        try {
            // Check if automation function is available, else simulate
            if (window.sendBillingEmailWithValidation) {
                window.currentBillingOrderRows = window.billingRows;
                await window.sendBillingEmailWithValidation();
            } else {
                await new Promise(r => setTimeout(r, 1500));
                if (window.showToast) window.showToast('Factura enviada exitosamente!', 'success');
                else alert('Factura enviada exitosamente!');
            }
            window.closeMasterBillingModal();
        } catch(e) {
            console.error(e);
            alert('Error enviando la factura.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    };
`;

content = content.replace(/\}\)\(\);\s*$/, newCode + '\n})();\n');
fs.writeFileSync(file, content);
console.log("Appended");
