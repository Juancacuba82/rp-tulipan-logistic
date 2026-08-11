// custom-receipts.js - Handles the standalone Custom Receipts functionality

let customReceiptItems = [];

function openCustomReceiptModal() {
    // Reset form
    document.getElementById('cr-company').value = 'tulipan';
    document.getElementById('cr-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('cr-order').value = '';
    document.getElementById('cr-customer').value = '';
    document.getElementById('cr-contact-name').value = '';
    document.getElementById('cr-address').value = '';
    document.getElementById('cr-phone').value = '';
    document.getElementById('cr-email').value = '';
    
    document.getElementById('cr-cc-fee').checked = false;
    document.getElementById('cr-tax-rate').checked = false;
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
    customReceiptItems.push({ id, desc: '', qty: 1, price: '' });
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
            item[field] = value === '' ? '' : (parseFloat(value) || 0);
        } else {
            item[field] = value;
        }
        
        // Auto-update total cell without full re-render for better UX
        const tr = document.querySelector(`tr[data-cr-id="${id}"]`);
        if (tr) {
            const qtyNum = parseFloat(item.qty) || 0;
            const priceNum = parseFloat(item.price) || 0;
            const total = qtyNum * priceNum;
            tr.querySelector('.cr-item-total').textContent = `$${total.toFixed(2)}`;
        }
        updateCustomReceiptTotals();
    }
}

function renderCustomReceiptItems() {
    const tbody = document.getElementById('cr-items-body');
    tbody.innerHTML = '';
    
    customReceiptItems.forEach(item => {
        const qtyNum = parseFloat(item.qty) || 0;
        const priceNum = parseFloat(item.price) || 0;
        const total = qtyNum * priceNum;
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
                <input type="text" inputmode="decimal" value="${item.price}" oninput="updateItemField('${item.id}', 'price', this.value)" style="width: 80px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: right; font-size: 0.85rem;" placeholder="0.00">
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
    const subtotal = customReceiptItems.reduce((sum, item) => {
        const qtyNum = parseFloat(item.qty) || 0;
        const priceNum = parseFloat(item.price) || 0;
        return sum + (qtyNum * priceNum);
    }, 0);
    const applyCcFee = document.getElementById('cr-cc-fee').checked;
    const applyTax = document.getElementById('cr-tax-rate').checked;
    const payments = parseFloat(document.getElementById('cr-payments').value) || 0;
    
    const taxRate = applyTax ? 7 : 0;
    const taxAmount = subtotal * (taxRate / 100);
    
    const ccFee = applyCcFee ? (subtotal + taxAmount) * 0.04 : 0;
    
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
    const contactName = document.getElementById('cr-contact-name').value || '';
    const address = document.getElementById('cr-address').value || '';
    const phone = document.getElementById('cr-phone').value || '';
    const email = document.getElementById('cr-email').value || '';
    
    const totals = updateCustomReceiptTotals();
    const company = getCompanyDetails(companyKey);
    
    let itemsHtml = '';
    customReceiptItems.forEach(item => {
        const qtyNum = parseFloat(item.qty) || 0;
        const priceNum = parseFloat(item.price) || 0;
        if (item.desc || priceNum > 0) {
            itemsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 10px; font-size: 0.95rem; color: #1e293b;">${item.desc}</td>
                    <td style="padding: 12px 10px; font-size: 0.95rem; color: #1e293b; text-align: center;">${qtyNum}</td>
                    <td style="padding: 12px 10px; font-size: 0.95rem; color: #1e293b; text-align: right;">$${priceNum.toFixed(2)}</td>
                    <td style="padding: 12px 10px; font-size: 0.95rem; color: #1e293b; text-align: right; font-weight: 700;">$${(qtyNum * priceNum).toFixed(2)}</td>
                </tr>
            `;
        }
    });

    const a4Html = `
        <div style="font-family: 'Inter', sans-serif; color: #0f172a; width: 100%; background: white; padding: 20px; box-sizing: border-box;">
            
            <!-- Header -->
            <table style="width: 100%; border-bottom: 3px solid ${company.color}; margin-bottom: 30px; border-collapse: collapse; font-family: 'Inter', sans-serif;">
                <tr>
                    <td style="vertical-align: top; padding-bottom: 20px; width: 60%;">
                        <div style="color: ${company.color}; font-size: 35px; font-weight: 900; margin-bottom: 5px; text-transform: uppercase;">${company.name}</div>
                        <div style="margin-bottom: 3px; font-size: 14px; color: #475569;"><span style="color: ${company.color}; font-weight: 800; font-size: 13px; padding-right: 5px;">ADDR:</span> ${company.address}</div>
                        <div style="margin-bottom: 3px; font-size: 14px; color: #475569;"><span style="color: ${company.color}; font-weight: 800; font-size: 13px; padding-right: 5px;">TEL:</span> ${company.phone}</div>
                        <div style="margin-bottom: 3px; font-size: 14px; color: #475569;"><span style="color: ${company.color}; font-weight: 800; font-size: 13px; padding-right: 5px;">EMAIL:</span> ${company.email}</div>
                    </td>
                    <td style="vertical-align: top; text-align: right; padding-bottom: 20px; width: 40%;">
                        <div style="font-size: 40px; font-weight: 900; color: #e2e8f0; margin-bottom: 10px; letter-spacing: 2px; text-transform: uppercase; text-align: right;">INVOICE</div>
                        <table style="width: 180px; border-collapse: collapse; margin-left: auto; background: #f8fafc; border: 1px solid #e2e8f0;">
                            <tr>
                                <td style="padding: 10px 15px; text-align: left;">
                                    <div style="font-weight: 700; color: #64748b; font-size: 13px; margin-bottom: 2px;">INVOICE NO.</div>
                                    <div style="font-weight: 900; color: #1e293b; font-size: 18px; margin-bottom: 8px;">${orderNo}</div>
                                    <div style="border-top: 1px solid #cbd5e1; margin-bottom: 8px;"></div>
                                    <div style="font-weight: 700; color: #64748b; font-size: 13px; margin-bottom: 2px;">DATE</div>
                                    <div style="font-weight: 900; color: #1e293b; font-size: 18px;">${date}</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <!-- Bill To -->
            <div style="margin-bottom: 30px;">
                <div style="font-size: 14px; color: ${company.color}; font-weight: 800; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">BILL TO</div>
                <div style="margin-bottom: 5px; font-size: 18px; font-weight: 700; color: #1e293b;">${customer}</div>
                ${contactName ? `<div style="margin-bottom: 2px; font-size: 14px; font-weight: 600; color: #334155;">ATTN: ${contactName}</div>` : ''}
                ${address ? `<div style="margin-bottom: 2px; font-size: 14px; color: #475569;">${address}</div>` : ''}
                ${phone ? `<div style="margin-bottom: 2px; font-size: 14px; color: #475569;">${phone}</div>` : ''}
                ${email ? `<div style="margin-bottom: 2px; font-size: 14px; color: #475569;">${email}</div>` : ''}
            </div>

            <!-- Items Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background: ${company.color}; color: white;">
                        <th style="padding: 12px 10px; text-align: left; font-weight: 700; font-size: 14px; text-transform: uppercase;">Description</th>
                        <th style="padding: 12px 10px; text-align: center; font-weight: 700; font-size: 14px; text-transform: uppercase; width: 10%;">Qty</th>
                        <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 14px; text-transform: uppercase; width: 15%;">Unit Price</th>
                        <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 14px; text-transform: uppercase; width: 15%;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml || '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #94a3b8; font-style: italic;">No items added</td></tr>'}
                </tbody>
            </table>

            <!-- Totals -->
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td></td>
                    <td style="width: 350px; vertical-align: top;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #64748b; text-align: left; font-size: 15px;">Subtotal</td>
                                <td style="padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-weight: 700; color: #1e293b; text-align: right; font-size: 15px;">$${totals.subtotal.toFixed(2)}</td>
                            </tr>
                            ${totals.taxAmount > 0 ? `
                            <tr>
                                <td style="padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #64748b; text-align: left; font-size: 15px;">Tax (${totals.taxRate}%)</td>
                                <td style="padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-weight: 700; color: #1e293b; text-align: right; font-size: 15px;">$${totals.taxAmount.toFixed(2)}</td>
                            </tr>
                            ` : ''}
                            ${totals.ccFee > 0 ? `
                            <tr>
                                <td style="padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #64748b; text-align: left; font-size: 15px;">CC Fee</td>
                                <td style="padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-weight: 700; color: #1e293b; text-align: right; font-size: 15px;">$${totals.ccFee.toFixed(2)}</td>
                            </tr>
                            ` : ''}
                            ${totals.payments > 0 ? `
                            <tr>
                                <td style="padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #16a34a; text-align: left; font-size: 15px;">Payments Received</td>
                                <td style="padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-weight: 700; color: #16a34a; text-align: right; font-size: 15px;">-$${totals.payments.toFixed(2)}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td style="padding: 15px 0 5px 0; border-top: 2px solid ${company.color}; font-weight: 900; color: #0f172a; font-size: 19px; text-transform: uppercase; text-align: left;">Balance Due</td>
                                <td style="padding: 15px 0 5px 0; border-top: 2px solid ${company.color}; font-weight: 900; color: ${company.color}; font-size: 19px; text-align: right;">$${Math.max(0, totals.totalDue).toFixed(2)}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            
            <div style="margin-top: 40px; margin-bottom: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 20px;">
                <h3 style="font-size: 15px; color: ${company.color}; font-weight: 800; text-transform: uppercase; margin-top: 0; margin-bottom: 5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">ACH / Wire Payment Information</h3>
                <p style="margin: 0 0 15px 0; font-size: 14px; color: #475569;">Please use the following information to submit ACH/WIRE payments.</p>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
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
            
            <div style="margin-top: 50px; text-align: center; color: #94a3b8; font-size: 14px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
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
        const contactName = document.getElementById('cr-contact-name').value;
        const address = document.getElementById('cr-address').value;
        const phone = document.getElementById('cr-phone').value;
        const email = document.getElementById('cr-email').value;
        const totals = updateCustomReceiptTotals();
        
        // Pack extra contact details into JSON to avoid database migration
        const contactData = JSON.stringify({
            email: email,
            contact_name: contactName,
            address: address,
            phone: phone
        });
        
        // Prepare data for Supabase
        const payload = {
            company: companyKey,
            date: date,
            order_no: orderNo,
            customer_name: customer,
            customer_contact: contactData,
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
    
    // Parse contact details if stored as JSON
    let contactData = receiptData.customer_contact || '';
    if (contactData.startsWith('{')) {
        try {
            const parsed = JSON.parse(contactData);
            document.getElementById('cr-email').value = parsed.email || '';
            document.getElementById('cr-contact-name').value = parsed.contact_name || '';
            document.getElementById('cr-address').value = parsed.address || '';
            document.getElementById('cr-phone').value = parsed.phone || '';
        } catch (e) {
            document.getElementById('cr-email').value = contactData;
            document.getElementById('cr-contact-name').value = '';
            document.getElementById('cr-address').value = '';
            document.getElementById('cr-phone').value = '';
        }
    } else {
        document.getElementById('cr-email').value = contactData;
        document.getElementById('cr-contact-name').value = '';
        document.getElementById('cr-address').value = '';
        document.getElementById('cr-phone').value = '';
    }
    
    // Reverse engineer tax/fees or just set them to trigger correct totals
    document.getElementById('cr-cc-fee').checked = parseFloat(receiptData.cc_fee) > 0;
    document.getElementById('cr-payments').value = receiptData.payments || '0';
    
    // Tax rate calculation (reverse from amount)
    let taxAmt = parseFloat(receiptData.tax) || 0;
    document.getElementById('cr-tax-rate').checked = taxAmt > 0;
    
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

window.emailCustomReceipt = async function() {
    const btn = document.getElementById('btn-email-cr');
    const originalText = btn.innerHTML;
    
    const email = document.getElementById('cr-email').value;
    if (!email || !email.includes('@')) {
        alert("Please enter a valid Customer Email before sending.");
        return;
    }
    
    if (!window.sendReceiptEmail || !window.htmlToPDFBlob) {
        alert("Email service is not loaded yet. Please wait or refresh.");
        return;
    }
    
    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SENDING...';
        btn.disabled = true;
        
        // Use htmlToPDFBlob from the current A4 view
        const html = document.getElementById('cr-a4-preview').innerHTML;
        const pdfBlob = await window.htmlToPDFBlob(html, 'p');
        
        if (!pdfBlob) throw new Error("Could not generate PDF");
        
        // Create mock rowData for sendReceiptEmail
        const companyKey = document.getElementById('cr-company').value;
        const date = document.getElementById('cr-date').value;
        const orderNo = document.getElementById('cr-order').value || 'CUSTOM';
        const customer = document.getElementById('cr-customer').value || 'Customer';
        
        const mockRowData = [];
        mockRowData[0] = 'custom_' + Date.now(); // tripId
        mockRowData[1] = date;
        mockRowData[5] = orderNo;
        mockRowData[11] = customer;
        mockRowData[36] = email;
        mockRowData[55] = []; // No photos
        
        let companyOverride = 'RP TULIPAN';
        if (companyKey === 'supercrane') companyOverride = 'JR SUPER CRANE';
        
        await window.sendReceiptEmail(mockRowData, pdfBlob, companyOverride);
        
        // Success
        btn.innerHTML = '<i class="fas fa-check"></i> SENT!';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 3000);
        
    } catch (err) {
        console.error("Error sending custom receipt via email:", err);
        alert("Error sending email: " + (err.message || JSON.stringify(err)));
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};
