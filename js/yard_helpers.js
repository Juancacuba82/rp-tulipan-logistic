
// --- HELPER FUNCTIONS FOR BILLING & INVOICE INTEGRATION ---
window.generateYardInvoiceHTML = function(items) {
    let invoiceHtml = `
    <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 20px; font-size: 11px;">
        <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a;">
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">N&deg; CONT</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">SIZE</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">TYPE</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">CONDITION</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">DATE IN</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">ORDER# IN</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">DATE OUT</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">ORDER# OUT</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">LIFTS</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">DAYS</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">DAYS COST</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">LIFTS COST</th>
                <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">TOTAL</th>
            </tr>
        </thead>
        <tbody>
    `;

    let grandTotal = 0;
    let sumDaysCost = 0;
    let sumLiftsCost = 0;

    items.forEach(item => {
        const entryDate = new Date(item.created_at);
        const billingStartDate = item.last_billed_date ? new Date(item.last_billed_date) : entryDate;
        const exitDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();
        const d1 = Date.UTC(billingStartDate.getFullYear(), billingStartDate.getMonth(), billingStartDate.getDate());
        const d2 = Date.UTC(exitDate.getFullYear(), exitDate.getMonth(), exitDate.getDate());
        const days = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
        
        const accumStorage = (item.daily_rate || 0) * days;
        
        const billedLifts = item.billed_lifts || 0;
        const totalLifts = item.lifts || 1;
        const unbilledLifts = Math.max(0, totalLifts - billedLifts);
        const liftCost = unbilledLifts * (item.lift_cost || 0);
        
        const totalCost = accumStorage + liftCost;

        grandTotal += totalCost;
        sumDaysCost += accumStorage;
        sumLiftsCost += liftCost;

        invoiceHtml += `
            <tr>
                <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: ${item.exit_date ? '#64748b' : '#1e40af'};">${item.container_no || '---'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.size || '---'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.type || 'DRY'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.condition || 'USED'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.origin_release || '---'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00') : '---'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.order_out || '---'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${unbilledLifts}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${days}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${accumStorage.toFixed(2)}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${liftCost.toFixed(2)}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #10b981;">${totalCost.toFixed(2)}</td>
            </tr>
        `;
    });

    invoiceHtml += `
        </tbody>
    </table>

    <table style="width: 250px; margin-left: auto; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px;">
        <tr>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; background-color: #fcece3; color: #000;">DAYS COST</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; color: #000;">$${sumDaysCost.toFixed(2)}</td>
        </tr>
        <tr>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; background-color: #fcece3; color: #000;">LIFTS COST</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; color: #000;">$${sumLiftsCost.toFixed(2)}</td>
        </tr>
        <tr>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; background-color: #fcece3; color: #000;">TOTAL</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; color: #000;">$${grandTotal.toFixed(2)}</td>
        </tr>
    </table>

    <div style="margin-top: 20px; text-align: right; font-family: Arial, sans-serif; font-size: 14px; color: #000;">
        <span style="font-weight: bold; background-color: #fcece3; padding: 6px 10px; border: 1px solid #cbd5e1; display: inline-block;">TOTAL INVOICE</span>
        <span style="font-weight: bold; font-size: 16px; margin-left: 10px;">$${grandTotal.toFixed(2)}</span>
    </div>
    `;
    return { html: invoiceHtml, total: grandTotal };
};

window.downloadSpecificYardInvoicePDF = async function(items, customerName) {
    const { html } = window.generateYardInvoiceHTML(items);
    const b64Pdf = await window.generateYardInvoiceBase64(html, customerName);
    const a = document.createElement('a');
    a.href = b64Pdf;
    a.download = `Yard_Invoice_${customerName}.pdf`;
    a.click();
};

window.sendSpecificYardInvoiceEmail = async function(items, customerName, email) {
    const serviceId = localStorage.getItem('ejs_yard_service_id') || localStorage.getItem('ejs_service_id');
    const templateId = localStorage.getItem('ejs_yard_template_id') || localStorage.getItem('ejs_template_id');
    const publicKey = localStorage.getItem('ejs_public_key');
    
    emailjs.init(publicKey);
    const { html, total } = window.generateYardInvoiceHTML(items);
    const b64Pdf = await window.generateYardInvoiceBase64(html, customerName);
    
    const templateParams = {
        to_email: email,
        customer_name: customerName,
        invoice_html: "",
        grand_total: total.toFixed(2),
        pdf_attachment: b64Pdf
    };
    await emailjs.send(serviceId, templateId, templateParams);
};

window.markYardItemAsPaid = async function(yardItemId) {
    if (!window.db) throw new Error("Database not initialized");
    const item = (window.getYardStockData() || []).find(i => i.id === yardItemId);
    if (!item) throw new Error("Yard item not found locally");
    const now = new Date().toISOString().split('T')[0];
    const { error } = await window.db.from('yard_stock')
        .update({
            last_billed_date: now,
            billed_lifts: item.lifts || 1
        })
        .eq('id', yardItemId);
    if (error) throw error;
    item.last_billed_date = now;
    item.billed_lifts = item.lifts || 1;
};
