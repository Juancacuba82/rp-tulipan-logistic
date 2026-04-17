        // DOCS CENTER LOGIC
        const docSelector = document.getElementById('doc-type-selector');
        const templates = {
            'delivery': document.getElementById('tpl-delivery'),
            'yard': document.getElementById('tpl-yard'),
            'sales': document.getElementById('tpl-sales')
        };

        const fieldGroups = {
            'delivery': document.querySelectorAll('.field-delivery'),
            'yard': document.querySelectorAll('.field-yard'),
            'sales': document.querySelectorAll('.field-sales')
        };

        window.currentDocTrip = null;

        window.loadDocTrips = async function () {
            const docsDriverFilter = (document.getElementById('docs-driver-dropdown')?.value || '').toLowerCase();
            const docsStatusFilter = (document.getElementById('docs-status-dropdown')?.value || '');
            const docsPaymentFilter = (document.getElementById('docs-payment-dropdown')?.value || '');
            const fromDate = document.getElementById('trip-from-date')?.value;
            const toDate = document.getElementById('trip-to-date')?.value;
            const list = document.getElementById('trip-list-scroll');
            if (!list) return;

            // Ensure data is available
            if (currentTrips.length === 0) {
                try {
                    const data = await getTrips();
                    currentTrips = data.map(mapTripToArray);
                } catch (e) {
                    console.error("Failed to load trips for Docs:", e);
                    return;
                }
            }

            list.innerHTML = '';

            // Custom sorting for drivers: based on numeric prefix in Notes (index 25)
            const sortedTrips = [...currentTrips].sort((a, b) => {
                const getOrder = (trip) => {
                    const note = trip[25] || '';
                    const match = note.trim().match(/^(\d+)\./);
                    return match ? parseInt(match[1]) : 999999; // Trips without numbers go last
                };
                return getOrder(a) - getOrder(b);
            });

            sortedTrips.forEach(trip => {
                const id = (trip[0] || '').toString().toLowerCase();
                const date = trip[1] || '';
                const cont = (trip[3] || '').toLowerCase();
                const cust = (trip[11] || '').toLowerCase();
                const drv = (trip[17] || '').toLowerCase(); // Index 17: Driver
                const ord = (trip[5] || '').toLowerCase();  // Index 5: Order

                const orderStatus = trip[41] || 'PENDING_PAYMENT';

                // Payment Status Calculation (Same logic as advanced filters)
                const vY = parseFloat(trip[13]) || 0;
                const vR = parseFloat(trip[18]) || 0;
                const vS = parseFloat(trip[20]) || 0;
                const vA = parseFloat(trip[22]) || 0;
                const vRent = parseFloat(trip[27]) || 0;
                const takeTax = (trip[49] === true || trip[49] === 'true' || trip[49] === 'YES' || trip[49] === 'on' || trip[49] === 1);

                const clearY = (trip[30] === 'PAID' || vY <= 0.01);
                const clearR = (trip[32] === 'PAID' || vR <= 0.01);
                const clearS = (trip[33] === 'PAID' || vS <= 0.01);
                const clearA = (trip[34] === 'PAID' || vA <= 0.01);
                const clearRent = (trip[31] === 'PAID' || vRent <= 0.01);
                const clearTax = (!takeTax || trip[52] === 'PAID');

                const isFullyPaid = (clearY && clearR && clearS && clearA && clearRent && clearTax);

                const dropdownDriverMatch = !docsDriverFilter || drv === docsDriverFilter || drv.includes(docsDriverFilter);
                const dropdownStatusMatch = !docsStatusFilter || orderStatus === docsStatusFilter;
                
                let dropdownPaymentMatch = true;
                if (docsPaymentFilter === 'PAID') dropdownPaymentMatch = isFullyPaid;
                else if (docsPaymentFilter === 'PENDING') dropdownPaymentMatch = !isFullyPaid;

                const matchesDate = (!fromDate || date >= fromDate) && (!toDate || date <= toDate);

                // DRIVER RESTRICTION: Only show their own trips
                let roleDriverMatch = true;
                if (window.currentUserRole === 'driver') {
                    const drvRef = (window.currentDriverNameRef || '').toLowerCase();
                    const isMyTrip = (drv === drvRef);
                    const isComplete = (trip[41] === 'PAID');
                    roleDriverMatch = isMyTrip && !isComplete;
                }

                if (matchesDate && roleDriverMatch && dropdownDriverMatch && dropdownStatusMatch && dropdownPaymentMatch) {
                    const div = document.createElement('div');
                    div.className = 'trip-item';
                    // Highlight if currently selected
                    if (window.currentDocTrip && window.currentDocTrip[0] === trip[0]) div.classList.add('active');

                    // Extract order from note for visual label
                    const note = trip[25] || '';
                    const match = note.trim().match(/^(\d+)\./);
                    const orderLabel = match ? `[${match[1]}] ` : '';

                    div.innerHTML = `
                            <h4>${orderLabel}${trip[5] && trip[5] !== '---' ? 'Order ' + trip[5] : 'Trip'} · ${window.formatDateMMDDYYYY(trip[1])}</h4>
                            <p style="font-weight:bold; color:#1e293b;">${trip[17] || 'No Driver'}</p>
                            <p>${trip[3] || 'No Cont'} | ${trip[11] || 'No Cust'}</p>
                            <p style="font-size:0.55rem; color:#64748b;">Truck: ${trip[37] || 'N/A'} | Trailer: ${trip[38] || 'N/A'}</p>
                        `;
                    div.onclick = () => fillReceiptFromTrip(trip, div);
                    list.appendChild(div);
                }
            });
        }

        window.fillReceiptFromTrip = function (trip, el) {
            console.log("Selecting Trip for Direct Receipt:", trip);
            window.currentDocTrip = trip;

            // UI Active State
            document.querySelectorAll('.trip-item').forEach(i => i.classList.remove('active'));
            if (el) el.classList.add('active');

            // Generate preview directly from data
            window.drawReceipt();
            window.renderTripPhotos();
        }

        window.renderTripPhotos = function() {
            const gallery = document.getElementById('trip-photos-gallery');
            const list = document.getElementById('photos-list');
            if (!gallery || !list) return;

            if (!window.currentDocTrip || !window.currentDocTrip[55] || window.currentDocTrip[55].length === 0) {
                gallery.style.display = 'none';
                return;
            }

            gallery.style.display = 'block';
            list.innerHTML = '';

            const photos = window.currentDocTrip[55];
            photos.forEach((url, idx) => {
                const div = document.createElement('div');
                div.style.position = 'relative';
                div.innerHTML = `
                    <img src="${url}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1;">
                    <button onclick="deleteTripPhoto(${idx})" style="position: absolute; top: -8px; right: -8px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                list.appendChild(div);
            });
        }

        window.handleTripPhotoUpload = async function(input) {
            const file = input.files[0];
            if (!file || !window.currentDocTrip) return;

            try {
                const tripId = window.currentDocTrip[0];
                const orderNo = window.currentDocTrip[5] || 'OR';
                const fileName = `trip_${tripId}_${Date.now()}.jpg`;

                // Show loading state
                const btn = document.querySelector('.btn-photo-docs');
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> UPLOADING...';
                btn.disabled = true;

                // 1. Upload to Supabase Storage
                // We'll use a bucket named 'trip-photos' (ensure it exists)
                const { data, error } = await db.storage
                    .from('trip-photos')
                    .upload(fileName, file, { cacheControl: '3600', upsert: true });

                if (error) throw error;

                // 2. Get Public URL
                const { data: { publicUrl } } = db.storage.from('trip-photos').getPublicUrl(fileName);

                // 3. Update local and remote data
                const currentPhotos = [...(window.currentDocTrip[55] || [])];
                currentPhotos.push(publicUrl);
                
                await updateTrip(tripId, { photos: currentPhotos });
                
                // Update specific trip in currentTrips list
                window.currentDocTrip[55] = currentPhotos;
                const idx = currentTrips.findIndex(t => t[0] === tripId);
                if (idx !== -1) currentTrips[idx][55] = currentPhotos;

                // 4. UI Feedback
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                input.value = ''; // clear input
                
                window.renderTripPhotos();
                alert("Photo uploaded successfully!");

            } catch (err) {
                console.error("Photo upload failed:", err);
                alert("Error uploading photo. Please ensure 'trip-photos' bucket exists in Supabase.");
                const btn = document.querySelector('.btn-photo-docs');
                btn.innerHTML = '<i class="fas fa-camera"></i> PHOTOS';
                btn.disabled = false;
            }
        }

        window.deleteTripPhoto = async function(photoIdx) {
            if (!confirm("Are you sure you want to delete this photo and permanently remove the file from storage?")) return;
            if (!window.currentDocTrip) return;

            const tripId = window.currentDocTrip[0];
            const currentPhotos = [...(window.currentDocTrip[55] || [])];
            const photoUrl = currentPhotos[photoIdx];
            
            // Extract filename from public URL
            // Format: .../public/trip-photos/filename.jpg
            let fileName = '';
            try {
                const parts = photoUrl.split('trip-photos/');
                if (parts.length > 1) fileName = parts[1];
            } catch (e) {
                console.error("Path extraction failed", e);
            }

            currentPhotos.splice(photoIdx, 1);

            try {
                // 1. Delete from database
                await updateTrip(tripId, { photos: currentPhotos });
                
                // 2. Delete from storage if filename was found
                if (fileName) {
                    const { error: storageError } = await db.storage
                        .from('trip-photos')
                        .remove([fileName]);
                    if (storageError) console.warn("Storage cleanup failed:", storageError);
                }

                // 3. Update local state
                window.currentDocTrip[55] = currentPhotos;
                const idx = currentTrips.findIndex(t => t[0] === tripId);
                if (idx !== -1) currentTrips[idx][55] = currentPhotos;
                
                window.renderTripPhotos();
                console.log("Photo and file deleted successfully.");
            } catch (err) {
                console.error("Delete photo failed:", err);
                alert("Failed to delete photo.");
            }
        }

        window.getTripReceiptContent = function (trip) {
            if (!trip) return '';

            // Tax and Billing visibility settings (indices 49, 50, 51)
            const takeTax = (trip[49] === true || trip[49] === 'true' || trip[49] === 'YES' || trip[49] === 'on' || trip[49] === 1);
            const taxRate = takeTax ? (parseFloat(trip[50]) || 0) : 0;
            const showBilling = (trip[51] === true || trip[51] === 'true' || trip[51] === 'YES' || trip[51] === 'on' || trip[51] === 1);

            const data = {
                date: window.formatDateMMDDYYYY(trip[1]),
                cont: (trip[3] && trip[3] !== '---') ? trip[3] : '',
                size: (trip[2] && trip[2] !== '---') ? trip[2] : '',
                rel: (trip[4] && trip[4] !== '---') ? trip[4] : '',
                order: (trip[5] && trip[5] !== '---') ? trip[5] : '',
                doors: (trip[9] && trip[9] !== '---') ? trip[9] : '',
                cust: (trip[11] && trip[11] !== '---') ? trip[11] : '',
                phone: (trip[23] && trip[23] !== '---') ? trip[23] : '',
                pickup: (trip[7] && trip[7] !== '---') ? trip[7] : '',
                place: (trip[8] && trip[8] !== '---') ? trip[8] : '',
                yard: parseFloat(trip[13]) || 0,
                storage: parseFloat(trip[27]) || 0,
                transp: parseFloat(trip[18]) || 0,
                sales: parseFloat(trip[20]) || 0,
                qty: parseInt(trip[53]) || 1,
                taxRate: taxRate,
                takeTax: takeTax,
                showBilling: showBilling,
                driver: (trip[17] && trip[17] !== '---') ? trip[17] : '',
                notes: (trip[25] && trip[25] !== '---') ? trip[25] : '',
                cond: {
                    asis: (trip[25] || '').toUpperCase().includes('AS IS'),
                    wwt: (trip[25] || '').toUpperCase().includes('WWT'),
                    cw: (trip[25] || '').toUpperCase().includes('CW'),
                    new: (trip[25] || '').toUpperCase().includes('NEW'),
                    holes: (trip[25] || '').toUpperCase().includes('NO HOLES'),
                    doors: (trip[25] || '').toUpperCase().includes('DOORS OK')
                },
                status: trip[41] || 'PENDING_PAYMENT',
                yardStatus: trip[30] === 'PAID' ? 'PAID' : 'PENDING',
                storageStatus: trip[31] === 'PAID' ? 'PAID' : 'PENDING',
                transpStatus: trip[32] === 'PAID' ? 'PAID' : 'PENDING',
                salesStatus: trip[33] === 'PAID' ? 'PAID' : 'PENDING',
                taxStatus: (trip[52] === 'PAID' || trip[52] === true || trip[52] === 'true') ? 'PAID' : 'PENDING',
                signature: trip[54] || ''
            };

            const subtotal = data.yard + data.storage + data.transp + data.sales;
            const taxVal = subtotal * (data.taxRate / 100);
            const total = subtotal + taxVal;

            const f = (label, val) => {
                if (!val || val === '---') return '';
                return `<div class="receipt-field"><label>${label}</label><span>${val}</span></div>`;
            };

            const s = (title, content) => {
                if (!content.trim()) return '';
                return `
                    <div class="receipt-section-title">${title}</div>
                    <div class="receipt-grid-3">${content}</div>
                `;
            };

            // Basic layout sections
            const logisticContent = f('RELEASE / BOOKING', data.rel) + f('ORDER / BOL', data.order) + f('DRIVER', data.driver);
            const equipmentContent = f('CONTAINER #', data.cont) + f('SIZE & TYPE', data.size) + f('QTY', data.qty > 1 ? data.qty : '') + f('DOORS DIRECTION', data.doors) + f('PICK UP FROM', data.pickup) + f('DELIVERY PLACE', data.place);
            const clientContent = f('CUSTOMER NAME', data.cust) + f('PHONE', data.phone);

            // Inspection content
            let inspectionContent = '';
            const checkIcon = '<span style="width:14px; height:14px; border:1px solid #000; display:inline-block; text-align:center; line-height:14px; font-weight:bold; font-size:10px; margin-right:5px;">X</span>';
            if (data.cond.asis) inspectionContent += `<div style="display:flex; align-items:center;">${checkIcon} AS IS</div>`;
            if (data.cond.wwt) inspectionContent += `<div style="display:flex; align-items:center;">${checkIcon} WWT</div>`;
            if (data.cond.cw) inspectionContent += `<div style="display:flex; align-items:center;">${checkIcon} CW</div>`;
            if (data.cond.new) inspectionContent += `<div style="display:flex; align-items:center;">${checkIcon} NEW</div>`;
            if (data.cond.holes) inspectionContent += `<div style="display:flex; align-items:center;">${checkIcon} NO HOLES</div>`;
            if (data.cond.doors) inspectionContent += `<div style="display:flex; align-items:center;">${checkIcon} DOORS OK</div>`;

            let inspectionSectionHtml = '';
            if (inspectionContent) {
                inspectionSectionHtml = `
                    <div class="receipt-section-title">Inspection & Condition</div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; font-size: 0.8rem;">
                        ${inspectionContent}
                    </div>
                `;
            }

            const bBadge = (st) => `<span style="font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:4px; margin-right:8px; display:inline-block; vertical-align:middle; ${st==='PAID' ? 'background:#dcfce7; color:#166534; border:1px solid #166534;' : 'background:#fee2e2; color:#991b1b; border:1px solid #991b1b;'}">${st}</span>`;
            
            // Billing Rows
            let billingRows = '';
            if (data.yard > 0) billingRows += `<tr><td>Yard Loading / Interchange Fee</td><td style="text-align:right; vertical-align:middle;">${bBadge(data.yardStatus)}$${data.yard.toFixed(2)}</td></tr>`;
            if (data.storage > 0) billingRows += `<tr><td>Storage / Rental Fee</td><td style="text-align:right; vertical-align:middle;">${bBadge(data.storageStatus)}$${data.storage.toFixed(2)}</td></tr>`;
            if (data.transp > 0) billingRows += `<tr><td>Transport Fee</td><td style="text-align:right; vertical-align:middle;">${bBadge(data.transpStatus)}$${data.transp.toFixed(2)}</td></tr>`;
            if (data.sales > 0) billingRows += `<tr><td>Container Sales</td><td style="text-align:right; vertical-align:middle;">${bBadge(data.salesStatus)}$${data.sales.toFixed(2)}</td></tr>`;
            if (data.takeTax && taxVal > 0) billingRows += `<tr><td>Taxes (${data.taxRate}%)</td><td style="text-align:right; vertical-align:middle;">${bBadge(data.taxStatus)}$${taxVal.toFixed(2)}</td></tr>`;

            let billingSectionHtml = '';
            if (total > 0 && data.showBilling) {
                billingSectionHtml = `
                    <div class="receipt-section-title">Billing Summary</div>
                    <table class="receipt-table">
                        <thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
                        <tbody>${billingRows}</tbody>
                        <tfoot>
                            <tr class="receipt-total-row">
                                <td>TOTAL DUE</td>
                                <td style="text-align:right; font-size:1.4rem; color:#b91c1c;">$${total.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                `;
            }

            const notesHtml = data.notes ? `
                <div style="margin-top:25px;">
                    <label style="font-size:0.7rem; font-weight:bold; color:#64748b;">NOTES / DESCRIPTION:</label>
                    <div style="min-height:60px; border:1px solid #e2e8f0; padding:10px; font-size:0.8rem; margin-top:5px; background:#f8fafc; border-left: 4px solid #b91c1c;">
                        ${data.notes}
                    </div>
                </div>
            ` : '';

            const statusLabel = data.status === 'PAID' ? 'COMPLETE' : 'PENDING';
            const statusColor = data.status === 'PAID' ? '#166534' : '#991b1b';
            const statusBg = data.status === 'PAID' ? '#dcfce7' : '#fee2e2';

            const photos = trip[55] || [];
            let photosHtml = '';
            if (photos.length > 0) {
                let imgList = '';
                photos.forEach(url => {
                    imgList += `<img src="${url}" style="width: 31%; height: 180px; object-fit: cover; border-radius: 5px; border: 1px solid #e2e8f0; margin-bottom: 10px;">`;
                });
                photosHtml = `
                    <div class="receipt-section-title" style="margin-top: 35px; break-before: auto;"><i class="fas fa-camera"></i> Delivery Evidence</div>
                    <div style="display: flex; gap: 3%; flex-wrap: wrap; margin-top: 15px;">
                        ${imgList}
                    </div>
                `;
            }

            const headerHtml = `
                <div class="receipt-header" style="position: relative;">
                    <div class="receipt-logo-area">
                        <h1 style="color:#b91c1c; font-size: 1.8rem; letter-spacing:-1px; margin:0;">RP TULIPAN</h1>
                        <p style="font-weight:900; color:#1e293b; margin-top:-5px; margin-bottom:5px;">TRANSPORT, INC.</p>
                        <p style="font-size:0.7rem; color:#64748b; margin:0;">9804 nw 80 ave Hialeah Gardens fl 33016</p>
                        <p style="font-size:0.7rem; color:#64748b; margin:0;">Phone: 786-768-4409 | 786-736-6288</p>
                    </div>
                    <div class="receipt-meta-box">
                        <div style="display: inline-block; padding: 4px 12px; background: ${statusBg}; color: ${statusColor}; border-radius: 4px; font-weight: 900; font-size: 0.8rem; margin-bottom: 8px; border: 1px solid ${statusColor}; text-transform: uppercase;">
                            ${statusLabel}
                        </div>
                        <h2 style="color:#1e293b; margin-bottom:5px; border-bottom: 2px solid #b91c1c; padding-bottom:5px; margin-top:0;">RECEIPT</h2>
                        ${data.order ? `<p style="margin:2px 0;">ORDER: <strong style="font-size:1rem; color:#b91c1c;">${data.order}</strong></p>` : ''}
                        <p style="margin:2px 0;">DATE: <strong>${data.date || '---'}</strong></p>
                    </div>
                </div>
            `;

            return `
                <div style="padding: 40px; font-family: 'Outfit', sans-serif; background:white;">
                    ${headerHtml}
                    ${s('Logistics & Movement', logisticContent)}
                    ${s('Equipment Information', equipmentContent)}
                    ${s('Client Details', clientContent)}
                    ${inspectionSectionHtml}
                    ${billingSectionHtml}
                    ${notesHtml}
                    ${photosHtml}
                    <div style="display:flex; justify-content:space-between; margin-top:60px;">
                        <div style="width:45%; border-top:1px solid #94a3b8; padding-top:10px; text-align:center; font-size:0.7rem; color:#64748b; font-weight:bold;">AUTHORIZED BY (RP TULIPAN)</div>
                        <div style="width:45%; border-top:1px solid #94a3b8; padding-top:10px; text-align:center; font-size:0.7rem; color:#64748b; font-weight:bold; position: relative;">
                            ${data.signature ? `<img src="${data.signature}" style="position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); max-height: 80px; width: auto; pointer-events: none;">` : ''}
                            RECEIVED BY (CUSTOMER)
                        </div>
                    </div>
                </div>
            `;
        }

        window.drawReceipt = function () {
            const preview = document.getElementById('receipt-a4');
            if (!preview) return;

            const trip = window.currentDocTrip;
            if (!trip) return;

            const hasReceiptBody = (trip[1] && trip[1] !== '---') || (trip[5] && trip[5] !== '---') || (trip[3] && trip[3] !== '---');
            if (!hasReceiptBody) {
                preview.innerHTML = `
                    <div style="text-align: center; margin-top: 50% !important; color: #cbd5e1; font-style: italic;">
                        Select a trip from the list to generate a receipt preview.
                    </div>
                `;
                return;
            }

            preview.innerHTML = window.getTripReceiptContent(trip);
        }


        // --- PDF & EMAIL UTILITIES ---
        window.generatePDFFromData = async function (tripData) {
            const renderContainer = document.getElementById('receipt-pdf-render');
            if (!renderContainer || !window.html2canvas || !window.jspdf) {
                console.error("Missing libraries or render container for PDF.");
                return null;
            }

            const tempDiv = document.createElement('div');
            tempDiv.className = 'a4-paper';
            renderContainer.appendChild(tempDiv);

            await renderReceiptToElement(tripData, tempDiv);

            try {
                const canvas = await html2canvas(tempDiv, { scale: 2, useCORS: true, logging: false });
                const imgData = canvas.toDataURL('image/png');
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                renderContainer.removeChild(tempDiv);
                return pdf.output('blob');
            } catch (err) {
                console.error("PDF Fail:", err);
                if (tempDiv.parentNode) renderContainer.removeChild(tempDiv);
                return null;
            }
        }

        async function renderReceiptToElement(trip, container) {
            container.innerHTML = window.getTripReceiptContent(trip);
        }

        window.sendReceiptEmail = async function (tripData, pdfBlob) {
            const serviceId = localStorage.getItem('ejs_service_id');
            const templateId = localStorage.getItem('ejs_template_id');
            const publicKey = localStorage.getItem('ejs_public_key');
            const emailTo = tripData[36];

            if (!serviceId || !templateId || !publicKey || !emailTo || emailTo === '---') {
                console.log("Email skip: Incomplete config or no email.");
                return;
            }

            try {
                // 1. Upload to Supabase Storage
                const orderNo = tripData[5] || 'OR';
                const fileName = `receipt_${orderNo.replace(/\s+/g, '_')}_${Date.now()}.pdf`;

                console.log("Uploading receipt to Supabase...");
                const publicUrl = await uploadReceipt(pdfBlob, fileName);
                console.log("Receipt uploaded! URL:", publicUrl);

                // 2. Send email with the URL link
                const templateParams = {
                    to_email: emailTo,
                    customer_name: tripData[11] || 'Valued Customer',
                    order_no: tripData[5] || '---',
                    receipt_url: publicUrl
                };

                const response = await emailjs.send(serviceId, templateId, templateParams, publicKey);
                console.log("EmailJS Success:", response.status, response.text);
                
                console.log("Email Sent via EmailJS with link!");
            } catch (e) {
                console.error("Email/Upload Critical Error:", e);
                const errorMsg = e.text || e.message || (typeof e === 'string' ? e : JSON.stringify(e));
                alert("Error enviando el correo: " + errorMsg);
            }
        }

        window.printA4Document = function () {
            const el = document.getElementById('receipt-a4');
            if (!el) return;

            const printWin = window.open('', '', 'width=1000,height=1200');
            printWin.document.write('<html><head><title>Print Receipt</title>');
            // Import the same fonts
            printWin.document.write('<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&family=Roboto+Condensed:wght@400;700&display=swap" rel="stylesheet">');
            printWin.document.write('<style>');
            printWin.document.write(`
                    body { margin: 0; padding: 0; font-family: "Outfit", sans-serif; -webkit-print-color-adjust: exact; }
                    .a4-paper { width: 210mm; margin: 0 auto; padding: 20mm; background: white; min-height: 297mm; }
                    .receipt-header { display: flex; justify-content: space-between; border-bottom: 3px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px; }
                    .receipt-logo-area h1 { font-size: 1.8rem; margin: 0; font-weight: 900; color: #b91c1c; }
                    .receipt-logo-area p { font-size: 0.8rem; margin: 2px 0; color: #1e293b; }
                    .receipt-meta-box { text-align: right; }
                    .receipt-meta-box h2 { font-size: 1.5rem; margin: 0; color: #b91c1c; font-weight: 900; }
                    .receipt-section-title { background: #f8fafc; padding: 6px 12px; font-weight: 800; font-size: 0.8rem; margin-top: 18px; border-left: 5px solid #1e293b; color: #1e293b; text-transform: uppercase; }
                    .receipt-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 12px; }
                    .receipt-field { font-size: 0.9rem; }
                    .receipt-field label { display: block; font-weight: 700; color: #64748b; font-size: 0.7rem; margin-bottom: 2px; }
                    .receipt-field span { font-weight: 700; border-bottom: 1px dashed #cbd5e1; display: block; min-height: 1.4rem; }
                    .receipt-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    .receipt-table th { background: #1e293b; color: white; text-align: left; padding: 10px; font-size: 0.8rem; }
                    .receipt-table td { padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
                    .receipt-total-row { background: #f1f5f9; font-weight: 900; font-size: 1.2rem; }
                    .signature-box { width: 45%; border-top: 2px solid #1a1a1a; text-align: center; padding-top: 10px; font-size: 0.8rem; margin-top: 60px; font-weight: 700; position: relative; }
                    .signature-img { position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); max-height: 80px; width: auto; }
                    @media print { @page { size: auto; margin: 10mm; } }
                `);
            printWin.document.write('</style></head><body>');
            printWin.document.write(el.innerHTML);
            printWin.document.write('</body></html>');
            printWin.document.close();

            printWin.focus();
            setTimeout(() => {
                printWin.print();
                printWin.close();
            }, 500);
        }

        window.updateCalendarFromReceipt = async function () {
            if (!currentDocTrip || !currentDocTrip[0]) return alert('Select a trip first!');
            const tripUuid = currentDocTrip[0];

            if (!confirm('This will update the main Delivery Calendar with these manual changes. Continue?')) return;

            // Sync Back to Supabase using proper field names
            const updates = {
                date: document.getElementById('u-r-date').value || null,
                n_cont: document.getElementById('u-r-cont').value,
                size: document.getElementById('u-r-size').value,
                release_no: document.getElementById('u-r-rel').value,
                order_no: document.getElementById('u-r-order').value,
                customer: document.getElementById('u-r-customer').value,
                phone_no: document.getElementById('u-r-phone').value,
                pickup_address: document.getElementById('u-r-pickup').value,
                delivery_place: document.getElementById('u-r-place').value,
                yard_rate: parseFloat(document.getElementById('u-r-yard').value) || 0,
                monthly_rate: parseFloat(document.getElementById('u-r-storage').value) || 0,
                sales_price: parseFloat(document.getElementById('u-r-sales').value) || 0,
                note: document.getElementById('u-r-notes').value
            };

            try {
                await updateTrip(tripUuid, updates);
                if (window.loadTableData) await window.loadTableData();
                await window.loadDocTrips();
                alert('Success! Calendar and Report Panel have been updated with these values.');
            } catch (err) {
                console.error("Sync failed:", err);
                alert("Failed to sync calendar with Supabase.");
            }
        }

        window.clearDocsFilters = function() {
            const f1 = document.getElementById('trip-from-date');
            const f2 = document.getElementById('trip-to-date');
            const f3 = document.getElementById('docs-driver-dropdown');
            const f4 = document.getElementById('docs-status-dropdown');
            const f5 = document.getElementById('docs-payment-dropdown');

            if(f1) f1.value = '';
            if(f2) f2.value = '';
            if(f3) f3.value = '';
            if(f4) f4.value = '';
            if(f5) f5.value = '';

            window.loadDocTrips();
        }

        // --- DIGITAL SIGNATURE LOGIC ---
        let sigCanvas, sigCtx, isDrawing = false;

        window.initSignaturePad = function() {
            sigCanvas = document.getElementById('signature-pad');
            if (!sigCanvas) return;
            sigCtx = sigCanvas.getContext('2d');
            sigCtx.strokeStyle = '#1e293b';
            sigCtx.lineWidth = 2;
            sigCtx.lineCap = 'round';

            // Mouse Events
            sigCanvas.addEventListener('mousedown', startDrawing);
            sigCanvas.addEventListener('mousemove', draw);
            window.addEventListener('mouseup', stopDrawing);

            // Touch Events
            sigCanvas.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                startDrawing(touch);
                e.preventDefault();
            });
            sigCanvas.addEventListener('touchmove', (e) => {
                const touch = e.touches[0];
                draw(touch);
                e.preventDefault();
            });
            sigCanvas.addEventListener('touchend', stopDrawing);
        }

        function startDrawing(e) {
            isDrawing = true;
            const rect = sigCanvas.getBoundingClientRect();
            const x = (e.clientX || e.pageX) - rect.left;
            const y = (e.clientY || e.pageY) - rect.top;
            sigCtx.beginPath();
            sigCtx.moveTo(x, y);
        }

        function draw(e) {
            if (!isDrawing) return;
            const rect = sigCanvas.getBoundingClientRect();
            const x = (e.clientX || e.pageX) - rect.left;
            const y = (e.clientY || e.pageY) - rect.top;
            sigCtx.lineTo(x, y);
            sigCtx.stroke();
        }

        function stopDrawing() {
            isDrawing = false;
        }

        window.openSignatureModal = function() {
            if (!window.currentDocTrip) return alert("Select a trip first!");
            const modal = document.getElementById('signature-modal');
            modal.style.display = 'flex';
            if (!sigCanvas) window.initSignaturePad();
            window.clearSignature();
        }

        window.closeSignatureModal = function() {
            const modal = document.getElementById('signature-modal');
            modal.style.display = 'none';
        }

        window.clearSignature = function() {
            if (!sigCtx) return;
            sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
        }

        window.saveSignature = async function() {
            if (!window.currentDocTrip) return;
            const tripId = window.currentDocTrip[0];
            const dataUrl = sigCanvas.toDataURL('image/png');

            try {
                // Update Supabase
                await updateTrip(tripId, { signature: dataUrl });
                
                // Update local data
                window.currentDocTrip[54] = dataUrl;
                
                // Update specific trip in currentTrips list
                const idx = currentTrips.findIndex(t => t[0] === tripId);
                if (idx !== -1) currentTrips[idx][54] = dataUrl;

                alert("Signature saved successfully!");
                window.closeSignatureModal();
                window.drawReceipt();
            } catch (err) {
                console.error("Signature save fail:", err);
                alert("Failed to save signature.");
            }
        }

        // Initialize on load if possible
        document.addEventListener('DOMContentLoaded', () => {
             // In case it's already in the DOM
             window.initSignaturePad();
        });

