// js/email-service.js - Handles PDF generation, Supabase Upload, and EmailJS integration

(function () {
    /**
     * Generates a PDF blob from rowData using the receipt template
     * @param {Array} rowData - Trip data array
     * @param {Object} options - { isEmailVersion: boolean, quality: number, scale: number }
     * @returns {Promise<Blob>} - PDF blob
     */
    window.generatePDFFromData = async function (rowData, options = {}) {
        const isEmail = options.isEmailVersion || false;
        const scale = options.scale || (isEmail ? 1.2 : 2);
        const quality = options.quality || (isEmail ? 0.7 : 0.9);

        if (!window.getTripReceiptContent) {
            console.error("getTripReceiptContent not found. Is docs-receipts.js loaded?");
            return null;
        }

        const { jsPDF } = window.jspdf;

        const container = document.createElement('div');
        container.id = 'temp-pdf-render';
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '210mm'; 
        container.style.background = 'white';
        
        // Use a copy to avoid mutating the original rowData
        let contentData = [...rowData];
        
        // If it's a very large trip with many photos, we might still want to limit them for the PDF
        // But for now, we include everything as it's being uploaded to Supabase
        
        container.innerHTML = window.getTripReceiptContent(contentData);

        const style = document.createElement('style');
        style.textContent = `
            * { box-sizing: border-box; }
            #temp-pdf-render { font-family: 'Outfit', sans-serif; padding: 15mm 20mm; }
            .receipt-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px; }
            .receipt-header h1 { font-size: 1.8rem; margin: 0; font-weight: 900; }
            .receipt-header p { margin: 2px 0; }
            .receipt-section-title { background: #f8fafc; padding: 6px 12px; font-weight: 800; font-size: 0.75rem; margin-top: 18px; border-left: 5px solid #1e293b; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; }
            .receipt-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 12px; }
            .receipt-field { font-size: 0.85rem; }
            .receipt-field label { display: block; font-weight: 700; color: #64748b; font-size: 0.65rem; margin-bottom: 2px; text-transform: uppercase; }
            .receipt-field span { font-weight: 700; border-bottom: 1px dashed #cbd5e1; display: block; min-height: 1.4rem; padding-bottom: 2px; }
            .receipt-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.85rem; }
            .receipt-table th { background: #1e293b; color: white; text-align: left; padding: 8px 10px; font-size: 0.75rem; }
            .receipt-table td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
            .receipt-total-row td { background: #f1f5f9; font-weight: 900; font-size: 1.1rem; }
            img { max-width: 100%; }
        `;
        container.appendChild(style);
        document.body.appendChild(container);

        try {
            const images = container.getElementsByTagName('img');
            await Promise.all(Array.from(images).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(r => { img.onload = r; img.onerror = r; });
            }));

            const canvas = await html2canvas(container, {
                scale: 1.2, // Increased for better quality
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.6); // Increased for better quality
            const pdf = new jsPDF({ compress: true, orientation: 'p', unit: 'mm', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * pageWidth) / canvas.width;

            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);

            // Add clickable links over images
            const pxToMm = imgWidth / container.clientWidth;
            const rectContainer = container.getBoundingClientRect();
            Array.from(images).forEach(img => {
                if (!img.src || img.src.startsWith('data:')) return; // Skip signatures
                const rectImg = img.getBoundingClientRect();
                const xPx = rectImg.left - rectContainer.left;
                const yPx = rectImg.top - rectContainer.top;
                
                const xMm = xPx * pxToMm;
                const yMm = yPx * pxToMm;
                const wMm = rectImg.width * pxToMm;
                const hMm = rectImg.height * pxToMm;

                pdf.link(xMm, yMm, wMm, hMm, { url: img.src });
            });

            const blob = pdf.output('blob');
            console.log("PDF Generated. Size:", (blob.size / 1024).toFixed(2), "KB");
            return blob;
        } catch (err) {
            console.error("PDF Generation error:", err);
            return null;
        } finally {
            document.body.removeChild(container);
        }
    };

    /**
     * Sends the PDF receipt via EmailJS with a Supabase public link
     * @param {Array} rowData - Trip data array
     * @param {Blob} existingBlob - Optional existing blob
     */
    window.sendReceiptEmail = async function (rowData, existingBlob = null, companyOverride = null) {
        let pdfBlob = existingBlob;
        
        try {
            // 1. Generate Receipt PDF (no photos)
            if (!pdfBlob) {
                if (window.getTripReceiptContent) {
                    const html = window.getTripReceiptContent(rowData, { excludePhotos: true, companyOverride });
                    pdfBlob = await htmlToPDFBlob(html, 'p');
                } else {
                    pdfBlob = await window.generatePDFFromData(rowData, { isEmailVersion: true, scale: 1.5, quality: 0.8, excludePhotos: true });
                }
            }

            if (!pdfBlob) throw new Error("Could not generate PDF");

            // 2. Upload Receipt to Supabase Storage
            const tripId = rowData[0] || 'manual';
            const orderNo = rowData[5] || 'no-order';
            const ts = Date.now();
            
            const receiptUrl = await uploadPDFToSupabase(pdfBlob, `receipt_${orderNo}_${tripId}_${ts}.pdf`);
            console.log("Receipt PDF Public URL:", receiptUrl);

            // 3. Generate and Upload Photos PDF (if there are photos)
            const photosArray = rowData[55];
            const hasPhotos = Array.isArray(photosArray) && photosArray.length > 0;
            let photosUrl = receiptUrl; // Fallback to receipt link if no photos
            let pBlob = null;
            
            if (hasPhotos && window.getTripPhotosOnlyContent) {
                console.log("Generating Photos PDF...");
                const photosHtml = window.getTripPhotosOnlyContent(rowData, { companyOverride });
                pBlob = await htmlToPDFBlob(photosHtml, 'p');
                if (pBlob) {
                    photosUrl = await uploadPDFToSupabase(pBlob, `photos_${orderNo}_${tripId}_${ts}.pdf`);
                    console.log("Photos PDF Public URL:", photosUrl);
                }
            }

            // Convert PDFs to Base64 for EmailJS Attachments
            const blobToBase64 = (blob) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            const base64Recibo = await blobToBase64(pdfBlob);
            const base64Fotos = pBlob ? await blobToBase64(pBlob) : ''; // Empty if no photos

            // 4. Send Email via EmailJS
            const serviceId = localStorage.getItem('ejs_service_id');
            const templateId = 'template_3pi4xzv' || localStorage.getItem('ejs_template_id');
            const publicKey = localStorage.getItem('ejs_public_key');

            if (!serviceId || !templateId || !publicKey) {
                alert("EmailJS is not configured. Please go to Email Settings.");
                return;
            }

            emailjs.init(publicKey);
            
            return new Promise((resolve, reject) => {
                const templateParams = {
                    to_email: rowData[36],
                    customer_name: rowData[11],
                    order_no: orderNo,
                    date: rowData[1],
                    receipt_url: receiptUrl,
                    photos_url: photosUrl,
                    pdf_url: receiptUrl, // Fallback in case old template variable is used
                    adjunto_recibo: base64Recibo,
                    adjunto_fotos: base64Fotos
                };

                emailjs.send(serviceId, templateId, templateParams).then(response => {
                    if (window.showToast) window.showToast("Email sent with active links and attachments!", "success");
                    else alert("Email sent successfully!");
                    resolve(response);
                }).catch(err => {
                    console.error('EmailJS Error:', err);
                    alert("Error sending email: " + (err.text || JSON.stringify(err)));
                    reject(err);
                });
            });

        } catch (err) {
            console.error("Critical Error in sendReceiptEmail:", err);
            alert("Failed to process email: " + err.message);
        }
    };

    // ── HELPER: render an offscreen HTML element, capture as PDF blob ──────────
    window.htmlToPDFBlob = async function htmlToPDFBlob(htmlContent, orientation = 'p') {
        const { jsPDF } = window.jspdf;

        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:0;top:0;width:800px;z-index:-9999;pointer-events:none;background:white;';
        container.innerHTML = htmlContent;

        const style = document.createElement('style');
        style.textContent = `
            * { box-sizing: border-box; }
            body { margin: 0; }
            img { max-width: 100%; }
            .receipt-header { display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e293b;padding-bottom:15px;margin-bottom:20px; }
            .receipt-header h1 { font-size:1.8rem;margin:0;font-weight:900; }
            .receipt-header p { margin:2px 0; }
            .receipt-section-title { background:#f8fafc;padding:6px 12px;font-weight:800;font-size:0.75rem;margin-top:18px;border-left:5px solid #1e293b;color:#1e293b;text-transform:uppercase;letter-spacing:0.05em; }
            .receipt-grid-3 { display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin-top:12px; }
            .receipt-field { font-size:0.85rem; }
            .receipt-field label { display:block;font-weight:700;color:#64748b;font-size:0.65rem;margin-bottom:2px;text-transform:uppercase; }
            .receipt-field span { font-weight:700;border-bottom:1px dashed #cbd5e1;display:block;min-height:1.4rem;padding-bottom:2px; }
            .receipt-table { width:100%;border-collapse:collapse;margin-top:12px;font-size:0.85rem; }
            .receipt-table th { background:#1e293b;color:white;text-align:left;padding:8px 10px;font-size:0.75rem; }
            .receipt-table td { padding:8px 10px;border-bottom:1px solid #e2e8f0; }
            .receipt-total-row td { background:#f1f5f9;font-weight:900;font-size:1.1rem; }
        `;
        container.appendChild(style);
        document.body.appendChild(container);

        try {
            // Wait for images to load
            const images = container.getElementsByTagName('img');
            await Promise.all(Array.from(images).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(r => { img.onload = r; img.onerror = r; });
            }));

            const canvas = await html2canvas(container, {
                scale: 1.2, // Balanced scale for quality and size
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: 800,
                width: 800
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.6); // Balanced quality JPEG to stay under 500Kb limit
            const pdf     = new jsPDF({ compress: true, orientation: orientation, unit: 'mm', format: 'a4' });
            const pw      = pdf.internal.pageSize.getWidth();
            const ph      = pdf.internal.pageSize.getHeight();
            const iw      = pw;
            const ih      = (canvas.height * pw) / canvas.width;
            const margin  = 5;
            const usable  = ph - margin * 2;

            if (ih <= usable) {
                pdf.addImage(imgData, 'JPEG', 0, margin, iw, ih);
            } else {
                const pages = Math.ceil(ih / usable);
                for (let pg = 0; pg < pages; pg++) {
                    if (pg > 0) pdf.addPage();
                    const yo = margin - pg * usable;
                    pdf.addImage(imgData, 'JPEG', 0, yo, iw, ih);
                    pdf.setFillColor(255, 255, 255);
                    if (pg > 0) pdf.rect(0, 0, pw, margin, 'F');
                    const ov = yo + ih - ph + margin;
                    if (ov > 0) pdf.rect(0, ph - margin, pw, margin + 1, 'F');
                }
            }

            // Add clickable links over images
            const pxToMm = iw / container.clientWidth;
            const rectContainer = container.getBoundingClientRect();
            Array.from(images).forEach(img => {
                if (!img.src || img.src.startsWith('data:')) return; // Skip signatures
                const rectImg = img.getBoundingClientRect();
                const xPx = rectImg.left - rectContainer.left;
                const yPx = rectImg.top - rectContainer.top;
                
                const xMm = xPx * pxToMm;
                const yMmAll = yPx * pxToMm;
                const wMm = rectImg.width * pxToMm;
                const hMm = rectImg.height * pxToMm;

                const startPage = Math.floor(yMmAll / usable);
                const yoOnPage = margin + (yMmAll % usable);

                // Check if page exists before setting
                if (startPage < Math.ceil(ih / usable)) {
                    pdf.setPage(startPage + 1);
                    pdf.link(xMm, yoOnPage, wMm, hMm, { url: img.src });
                }
            });

            return pdf.output('blob');
        } finally {
            document.body.removeChild(container);
        }
    }

    // ── HELPER: upload a blob to Supabase and return public URL ──────────────
    async function uploadPDFToSupabase(blob, fileName) {
        const filePath = `invoices/${fileName}`;
        const { error: uploadError } = await db.storage
            .from('receipts')
            .upload(filePath, blob, { contentType: 'application/pdf', upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = db.storage.from('receipts').getPublicUrl(filePath);
        return publicUrl;
    }

    /**
     * Sends 3 PDFs in a single email:
     *   1. Master Invoice (from billing-manager's rendered preview)
     *   2. Receipt WITHOUT photos
     *   3. Photos-only document
     * @param {Array[]} rows - Array of trip rows for the same order
     */
    window.sendThreePDFEmail = async function (rows) {
        if (!rows || rows.length === 0) throw new Error('No row data provided');

        const mainRow = rows[0];
        const orderNo = (mainRow[5] || 'NO-ORDER').toString();
        const tripId  = mainRow[0] || 'manual';
        const ts      = Date.now();

        // Read the selected billing company from the UI selector
        const selectedCompany = (document.getElementById('bm-company-selector')?.value || 'RP TULIPAN TRANSPORT INC');
        const companyOverrideOpts = { companyOverride: selectedCompany };

        // ── 1. Master Invoice PDF ─────────────────────────────
        console.log('[3-PDF] Generating Master Invoice PDF...');
        const invoiceBlob = await window.generateMasterInvoiceBlob();
        if (!invoiceBlob) throw new Error('Could not generate Master Invoice PDF');

        // ── 2. Receipt (no photos) PDF ────────────────────────
        console.log('[3-PDF] Generating Receipt (no photos) PDF...');
        let receiptBlob = null;
        if (window.getTripReceiptContent) {
            let combinedReceiptHtml = '';
            for (let i = 0; i < rows.length; i++) {
                if (i > 0) {
                    combinedReceiptHtml += '<div style="height: 40px; background: #f1f5f9; margin: 40px 0; border-top: 2px dashed #94a3b8; border-bottom: 2px dashed #94a3b8; text-align: center; line-height: 40px; font-weight: bold; color: #64748b; font-family: sans-serif;">--- NEXT CONTAINER ---</div>';
                }
                combinedReceiptHtml += window.getTripReceiptContent(rows[i], { excludePhotos: true, ...companyOverrideOpts });
            }
            receiptBlob = await htmlToPDFBlob(combinedReceiptHtml, 'p');
        } else {
            // Fallback: use the standard PDF generator with no-photos flag
            receiptBlob = await window.generatePDFFromData(mainRow, { excludePhotos: true });
        }
        if (!receiptBlob) throw new Error('Could not generate Receipt PDF');

        // ── 3. Photos-only PDF ────────────────────────────────
        console.log('[3-PDF] Generating Photos PDF...');
        let photosBlob = null;
        if (window.getTripPhotosOnlyContent) {
            let combinedPhotosHtml = '';
            for (let i = 0; i < rows.length; i++) {
                if (i > 0) {
                    combinedPhotosHtml += '<div style="height: 40px; background: #f1f5f9; margin: 40px 0; border-top: 2px dashed #94a3b8; border-bottom: 2px dashed #94a3b8; text-align: center; line-height: 40px; font-weight: bold; color: #64748b; font-family: sans-serif;">--- NEXT CONTAINER ---</div>';
                }
                combinedPhotosHtml += window.getTripPhotosOnlyContent(rows[i], companyOverrideOpts);
            }
            photosBlob = await htmlToPDFBlob(combinedPhotosHtml, 'p');
        }
        if (!photosBlob) throw new Error('Could not generate Photos PDF');

        // ── Upload all 3 to Supabase ──────────────────────────
        console.log('[3-PDF] Uploading to Supabase...');
        const [invoiceUrl, receiptUrl, photosUrl] = await Promise.all([
            uploadPDFToSupabase(invoiceBlob,  `invoice_${orderNo}_${tripId}_${ts}.pdf`),
            uploadPDFToSupabase(receiptBlob,  `receipt_${orderNo}_${tripId}_${ts}.pdf`),
            uploadPDFToSupabase(photosBlob,   `photos_${orderNo}_${tripId}_${ts}.pdf`)
        ]);

        console.log('[3-PDF] Upload complete.', { invoiceUrl, receiptUrl, photosUrl });

        // Convert PDFs to Base64 for EmailJS Attachments
        const blobToBase64 = (blob) => new Promise((resolve, reject) => {
            if (!blob) return resolve('');
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const base64Invoice = await blobToBase64(invoiceBlob);
        const base64Recibo = await blobToBase64(receiptBlob);
        const base64Fotos = photosBlob ? await blobToBase64(photosBlob) : '';

        // ── Send via EmailJS ──────────────────────────────────
        const serviceId  = localStorage.getItem('ejs_service_id');
        const templateId = localStorage.getItem('ejs_invoice_template_id') || localStorage.getItem('ejs_template_id'); // Fallback if invoice template is missing
        const publicKey  = localStorage.getItem('ejs_public_key');

        if (!serviceId || !templateId || !publicKey) {
            alert('EmailJS is not configured. Please go to Email Settings.');
            return;
        }

        emailjs.init(publicKey);

        const templateParams = {
            to_email:      mainRow[36],
            customer_name: mainRow[11],
            order_no:      orderNo,
            date:          mainRow[1],
            invoice_url:   invoiceUrl,
            receipt_url:   receiptUrl,
            photos_url:    photosUrl,
            adjunto_invoice: base64Invoice,
            adjunto_recibo: base64Recibo,
            adjunto_fotos: base64Fotos
        };

        const response = await emailjs.send(serviceId, templateId, templateParams);
        console.log('[3-PDF] Email sent successfully:', response);

        // ── Auto-mark Invoice as SENT in Supabase ────────────
        try {
            console.log('[3-PDF] Marking invoice_sent = YES for order', orderNo, '...');

            // Update every trip row that belongs to this order
            const tripIds = rows.map(r => r[0]).filter(Boolean);

            // Fire all updates in parallel
            await Promise.all(
                tripIds.map(id =>
                    db.from('trips').update({ invoice_sent: 'YES' }).eq('trip_id', id)
                )
            );

            // Sync local cache so the Billing table refreshes its badge immediately
            tripIds.forEach(id => {
                const localRow = (window.currentTrips || []).find(t => t[0] === id);
                if (localRow) localRow[57] = 'YES';

                const unfiltered = (window.allTripsUnfiltered || []).find(t => t[0] === id);
                if (unfiltered) unfiltered[57] = 'YES';
            });

            // Refresh the billing table badge if it is visible
            if (window.renderBillingTable) window.renderBillingTable();

            console.log('[3-PDF] invoice_sent marked for', tripIds.length, 'trip(s).');
        } catch (markErr) {
            // Non-fatal: email was already sent, just log the warning
            console.warn('[3-PDF] Could not auto-mark invoice_sent:', markErr);
        }

        if (window.showToast) window.showToast('✅ Email sent & marked as invoiced!', 'success');
        return response;
    };

})();

