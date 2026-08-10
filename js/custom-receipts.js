// custom-receipts.js - Handles the standalone Custom Receipts functionality

let customReceiptItems = [];

function openCustomReceiptModal() {
    // Reset form
    document.getElementById('cr-company').value = 'tulipan';
    document.getElementById('cr-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('cr-order').value = '';
    document.getElementById('cr-customer').value = '';
    document.getElementById('cr-email').value = '';
    
    document.getElementById('cr-cc-fee').value = '0';
    document.getElementById('cr-tax-rate').value = '0';
    document.getElementById('cr-payments').value = '0';
    
    customReceiptItems = [];
    addCustomReceiptItem(); // Add one empty row by default
    
    updateCustomReceiptTotals();
    
    document.getElementById('custom-receipt-modal').style.display = 'block';
}

function closeCustomReceiptModal() {
    document.getElementById('custom-receipt-modal').style.display = 'none';
}

function addCustomReceiptItem() {
    const id = Date.now().toString();
    customReceiptItems.push({ id, desc: '', qty: 1, price: 0 });
    renderCustomReceiptItems();
}

function removeCustomReceiptItem(id) {
    customReceiptItems = customReceiptItems.filter(item => item.id !== id);
    renderCustomReceiptItems();
    updateCustomReceiptTotals();
}

function updateItemField(id, field, value) {
    const item = customReceiptItems.find(i => i.id === id);
    if (item) {
        if (field === 'qty' || field === 'price') {
            item[field] = parseFloat(value) || 0;
        } else {
            item[field] = value;
        }
        
        // Auto-update total cell without full re-render for better UX
        const tr = document.querySelector(`tr[data-cr-id="${id}"]`);
        if (tr) {
            const total = item.qty * item.price;
            tr.querySelector('.cr-item-total').textContent = `$${total.toFixed(2)}`;
        }
        updateCustomReceiptTotals();
    }
}

function renderCustomReceiptItems() {
    const tbody = document.getElementById('cr-items-body');
    tbody.innerHTML = '';
    
    customReceiptItems.forEach(item => {
        const total = item.qty * item.price;
        const tr = document.createElement('tr');
        tr.dataset.crId = item.id;
        tr.innerHTML = `
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
                <input type="text" value="${item.desc}" oninput="updateItemField('${item.id}', 'desc', this.value)" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem;" placeholder="Item description">
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                <input type="number" value="${item.qty}" oninput="updateItemField('${item.id}', 'qty', this.value)" style="width: 60px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; font-size: 0.85rem;">
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                <input type="number" value="${item.price}" oninput="updateItemField('${item.id}', 'price', this.value)" style="width: 80px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: right; font-size: 0.85rem;" step="0.01">
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #1e293b;" class="cr-item-total">
                $${total.toFixed(2)}
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                <button onclick="removeCustomReceiptItem('${item.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 1rem;"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateCustomReceiptTotals() {
    const subtotal = customReceiptItems.reduce((sum, item) => sum + (item.qty * item.price), 0);
    const ccFee = parseFloat(document.getElementById('cr-cc-fee').value) || 0;
    const taxRate = parseFloat(document.getElementById('cr-tax-rate').value) || 0;
    const payments = parseFloat(document.getElementById('cr-payments').value) || 0;
    
    const taxAmount = subtotal * (taxRate / 100);
    const totalDue = subtotal + ccFee + taxAmount - payments;
    
    document.getElementById('cr-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('cr-balance-due').textContent = `$${Math.max(0, totalDue).toFixed(2)}`;
    
    return { subtotal, ccFee, taxRate, taxAmount, payments, totalDue };
}

function getCompanyDetails(companyKey) {
    if (companyKey === 'supercrane') {
        return {
            name: "JR Super Crane Inc",
            address: "9804 NW 80 AVE, HIALEAH FL 33016",
            phone: "786-768-4409",
            email: "rptulipantransport@gmail.com",
            color: "#6d28d9", // Violet-blue
            logoUrl: "assets/crane-logo.png" // Placeholder or user-provided
        };
    } else {
        return {
            name: "RP Tulipan Transport",
            address: "9804 NW 80 AVE, HIALEAH FL 33016",
            phone: "786-768-4409",
            email: "rptulipantransport@gmail.com",
            color: "#b91c1c", // Red
            logoUrl: "assets/tulipan-logo.png" // Placeholder or user-provided
        };
    }
}

function previewCustomReceipt() {
    // Generate HTML for A4 preview
    const companyKey = document.getElementById('cr-company').value;
    const date = document.getElementById('cr-date').value;
    const orderNo = document.getElementById('cr-order').value || '---';
    const customer = document.getElementById('cr-customer').value || '---';
    const email = document.getElementById('cr-email').value || '';
    
    const totals = updateCustomReceiptTotals();
    const company = getCompanyDetails(companyKey);
    
    let itemsHtml = '';
    customReceiptItems.forEach(item => {
        if (item.desc || item.price > 0) {
            itemsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 10px; font-size: 0.95rem; color: #1e293b;">${item.desc}</td>
                    <td style="padding: 12px 10px; font-size: 0.95rem; color: #1e293b; text-align: center;">${item.qty}</td>
                    <td style="padding: 12px 10px; font-size: 0.95rem; color: #1e293b; text-align: right;">$${item.price.toFixed(2)}</td>
                    <td style="padding: 12px 10px; font-size: 0.95rem; color: #1e293b; text-align: right; font-weight: 700;">$${(item.qty * item.price).toFixed(2)}</td>
                </tr>
            `;
        }
    });

    const a4Html = `
        <div style="font-family: 'Inter', sans-serif; color: #0f172a; max-width: 800px; margin: 0 auto; background: white;">
            
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${company.color}; padding-bottom: 20px; margin-bottom: 30px;">
                <div>
                    <h1 style="color: ${company.color}; font-size: 2.2rem; font-weight: 900; margin: 0 0 5px 0; text-transform: uppercase;">${company.name}</h1>
                    <p style="margin: 2px 0; font-size: 0.9rem; color: #475569;"><i class="fas fa-map-marker-alt" style="width: 15px; color: ${company.color};"></i> ${company.address}</p>
                    <p style="margin: 2px 0; font-size: 0.9rem; color: #475569;"><i class="fas fa-phone" style="width: 15px; color: ${company.color};"></i> ${company.phone}</p>
                    <p style="margin: 2px 0; font-size: 0.9rem; color: #475569;"><i class="fas fa-envelope" style="width: 15px; color: ${company.color};"></i> ${company.email}</p>
                </div>
                <div style="text-align: right;">
                    <h2 style="font-size: 2.5rem; font-weight: 900; color: #e2e8f0; margin: 0 0 10px 0; letter-spacing: 2px; text-transform: uppercase;">INVOICE</h2>
                    <div style="display: inline-block; text-align: left; background: #f8fafc; padding: 10px 15px; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <p style="margin: 0; font-weight: 700; color: #64748b; font-size: 0.8rem;">INVOICE NO.</p>
                        <p style="margin: 0; font-weight: 900; color: #1e293b; font-size: 1.1rem;">${orderNo}</p>
                        <div style="height: 1px; background: #e2e8f0; margin: 5px 0;"></div>
                        <p style="margin: 0; font-weight: 700; color: #64748b; font-size: 0.8rem;">DATE</p>
                        <p style="margin: 0; font-weight: 900; color: #1e293b; font-size: 1.1rem;">${date}</p>
                    </div>
                </div>
            </div>

            <!-- Bill To -->
            <div style="margin-bottom: 30px;">
                <h3 style="font-size: 0.9rem; color: ${company.color}; font-weight: 800; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">BILL TO</h3>
                <p style="margin: 0 0 5px 0; font-size: 1.1rem; font-weight: 700; color: #1e293b;">${customer}</p>
                <p style="margin: 0; font-size: 0.9rem; color: #64748b;">${email}</p>
            </div>

            <!-- Items Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background: ${company.color}; color: white;">
                        <th style="padding: 12px 10px; text-align: left; font-weight: 700; font-size: 0.9rem; text-transform: uppercase;">Description</th>
                        <th style="padding: 12px 10px; text-align: center; font-weight: 700; font-size: 0.9rem; text-transform: uppercase; width: 10%;">Qty</th>
                        <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 0.9rem; text-transform: uppercase; width: 15%;">Unit Price</th>
                        <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 0.9rem; text-transform: uppercase; width: 15%;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml || '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #94a3b8; font-style: italic;">No items added</td></tr>'}
                </tbody>
            </table>

            <!-- Totals -->
            <div style="display: flex; justify-content: flex-end;">
                <div style="width: 350px;">
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f5f9;">
                        <span style="font-weight: 600; color: #64748b;">Subtotal</span>
                        <span style="font-weight: 700; color: #1e293b;">$${totals.subtotal.toFixed(2)}</span>
                    </div>
                    ${totals.taxAmount > 0 ? `
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f5f9;">
                        <span style="font-weight: 600; color: #64748b;">Tax (${totals.taxRate}%)</span>
                        <span style="font-weight: 700; color: #1e293b;">$${totals.taxAmount.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    ${totals.ccFee > 0 ? `
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f5f9;">
                        <span style="font-weight: 600; color: #64748b;">CC Fee</span>
                        <span style="font-weight: 700; color: #1e293b;">$${totals.ccFee.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    ${totals.payments > 0 ? `
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f5f9; color: #16a34a;">
                        <span style="font-weight: 600;">Payments Received</span>
                        <span style="font-weight: 700;">-$${totals.payments.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    
                    <div style="display: flex; justify-content: space-between; padding: 15px 0 5px 0; margin-top: 5px; border-top: 2px solid ${company.color};">
                        <span style="font-weight: 900; color: #0f172a; font-size: 1.2rem; text-transform: uppercase;">Balance Due</span>
                        <span style="font-weight: 900; color: ${company.color}; font-size: 1.2rem;">$${Math.max(0, totals.totalDue).toFixed(2)}</span>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 40px; margin-bottom: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 20px;">
                <h3 style="font-size: 0.95rem; color: ${company.color}; font-weight: 800; text-transform: uppercase; margin-top: 0; margin-bottom: 5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">ACH / Wire Payment Information</h3>
                <p style="margin: 0 0 15px 0; font-size: 0.85rem; color: #475569;">Please use the following information to submit ACH/WIRE payments.</p>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <tbody>
                        <tr>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; width: 35%; color: #64748b; font-weight: 600;">Company Name:</td>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">${company.name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Bank Name:</td>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">Bank of America</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Bank Address:</td>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">900 W 49 ST, Hialeah, FL 33012</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Routing Number: ACH</td>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">063100277</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Routing Number: WIRE</td>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">026009593</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Account Number:</td>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">898111245429</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">SWIFT Code:</td>
                            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">BOFAUS3N</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; color: #64748b; font-weight: 600;">Zelle:</td>
                            <td style="padding: 8px 10px; font-weight: 700; color: #1e293b;">786-768-4409</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top: 50px; text-align: center; color: #94a3b8; font-size: 0.85rem; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <p>Thank you for your business!</p>
            </div>
        </div>
    `;

    document.getElementById('cr-a4-preview').innerHTML = a4Html;
}

async function saveAndPreviewCustomReceipt() {
    const btn = document.getElementById('btn-save-cr');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    try {
        const companyKey = document.getElementById('cr-company').value;
        const date = document.getElementById('cr-date').value;
        const orderNo = document.getElementById('cr-order').value;
        const customer = document.getElementById('cr-customer').value;
        const email = document.getElementById('cr-email').value;
        const totals = updateCustomReceiptTotals();
        
        // Prepare data for Supabase
        const payload = {
            company: companyKey,
            date: date,
            order_no: orderNo,
            customer_name: customer,
            customer_contact: email,
            items: customReceiptItems, // JSONB in Supabase
            subtotal: totals.subtotal,
            tax: totals.taxAmount,
            cc_fee: totals.ccFee,
            payments: totals.payments,
            total: totals.totalDue
        };
        
        // Ensure supabase client is available
        const sc = window.db || (typeof db !== 'undefined' ? db : (typeof supabase !== 'undefined' ? supabase : null));
        if (sc) {
            console.log("Saving to Supabase 'custom_receipts'...", payload);
            const { error } = await sc.from('custom_receipts').insert([payload]);
            if (error) {
                console.warn("Could not save to Supabase. This might happen if the table 'custom_receipts' is not created yet.", error);
            }
        }
        
        // Success (even if saving failed, we still preview and print)
        previewCustomReceipt();
        document.getElementById('cr-preview-modal').style.display = 'block';
        
    } catch (err) {
        console.error("Error generating custom receipt", err);
        alert("An error occurred. Check the console.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save & Preview';
    }
}

function printCustomReceipt() {
    const printContent = document.getElementById('cr-a4-preview').innerHTML;
    
    // Switch body content for printing
    document.body.innerHTML = `
        <div class="print-force-visible" style="background: white; padding: 20px;">
            ${printContent}
        </div>
    `;
    
    // Inject a style to override the global @media print that hides everything
    const style = document.createElement('style');
    style.innerHTML = `
        @media print { 
            @page { margin: 10mm; }
            body * { visibility: hidden !important; } 
            .print-force-visible, .print-force-visible * { 
                visibility: visible !important; 
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important;
            } 
            .print-force-visible { 
                position: absolute !important; 
                left: 0 !important; 
                top: 0 !important; 
                width: 100% !important; 
                margin: 0 !important; 
            } 
        }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => {
        window.print();
        // Restore and re-attach events (page reload is safer)
        location.reload();
    }, 200);
}

window.viewCustomReceiptHistory = function(receiptData) {
    // Populate form fields so previewCustomReceipt can read them
    document.getElementById('cr-company').value = receiptData.company || 'tulipan';
    document.getElementById('cr-date').value = receiptData.date || '';
    document.getElementById('cr-order').value = receiptData.order_no || '';
    document.getElementById('cr-customer').value = receiptData.customer_name || '';
    document.getElementById('cr-email').value = receiptData.customer_contact || '';
    
    // Reverse engineer tax/fees or just set them to trigger correct totals
    document.getElementById('cr-cc-fee').value = receiptData.cc_fee || '0';
    document.getElementById('cr-payments').value = receiptData.payments || '0';
    
    // Tax rate calculation (reverse from amount)
    let sub = parseFloat(receiptData.subtotal) || 0;
    let taxAmt = parseFloat(receiptData.tax) || 0;
    let taxRate = 0;
    if (sub > 0 && taxAmt > 0) {
        taxRate = (taxAmt / sub) * 100;
    }
    document.getElementById('cr-tax-rate').value = taxRate.toFixed(2);
    
    // Set items
    if (Array.isArray(receiptData.items)) {
        customReceiptItems = receiptData.items;
    } else {
        customReceiptItems = [];
    }
    
    // Render
    renderCustomReceiptItems();
    updateCustomReceiptTotals();
    previewCustomReceipt();
    
    // Hide the save button since this is history (optional, or let them clone it)
    const btnSave = document.getElementById('btn-save-cr');
    if (btnSave) btnSave.style.display = 'none'; // We can hide it in the modal, but preview modal only has Print/Close
    
    // Show preview modal directly
    document.getElementById('cr-preview-modal').style.display = 'block';
};
