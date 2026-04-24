// docs-receipts.js - RP Tulipan Logistic

(function () {
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
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const tomorrowStr = tomorrow.toLocaleDateString('sv-SE');

        // Trigger silent tracking
        if (window.logActivity) {
            const lastLog = sessionStorage.getItem('last_tomorrow_docs_view_v350');
            if (lastLog !== tomorrowStr) {
                window.logActivity('VIEW_TOMORROW_ORDERS', `Driver viewed orders in Docs Center for ${tomorrowStr}`, tomorrowStr);
                sessionStorage.setItem('last_tomorrow_docs_view_v350', tomorrowStr);
            }
        }

        const docsDriverFilter = (document.getElementById('docs-driver-dropdown')?.value || '').toLowerCase();
        const docsStatusFilter = (document.getElementById('docs-status-dropdown')?.value || '');
        const docsPaymentFilter = (document.getElementById('docs-payment-dropdown')?.value || '');
        const docsCustomerFilter = (document.getElementById('docs-customer-dropdown')?.value || '').toLowerCase();
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
                return match ? parseInt(match[1]) : 999999;
            };
            return getOrder(a) - getOrder(b);
        });

        sortedTrips.forEach(trip => {
            const date = trip[1] || '';
            const cust = (trip[11] || '').toLowerCase();
            const drv = (trip[17] || '').toLowerCase();
            const orderStatus = (trip[41] || 'PENDING_PAYMENT').toString().toUpperCase();

            // Payment Status Calculation
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
            const dropdownCustomerMatch = !docsCustomerFilter || cust === docsCustomerFilter || cust.includes(docsCustomerFilter);
            const dropdownStatusMatch = !docsStatusFilter || orderStatus === docsStatusFilter;
            
            let dropdownPaymentMatch = true;
            if (docsPaymentFilter === 'PAID') dropdownPaymentMatch = isFullyPaid;
            else if (docsPaymentFilter === 'PENDING') dropdownPaymentMatch = !isFullyPaid;

            const matchesDate = (!fromDate || date >= fromDate) && (!toDate || date <= toDate);

            // DRIVER RESTRICTION: Only show their own trips (EXCEPT Robert Cortez)
            let roleDriverMatch = true;
            if (window.currentUserRole === 'driver') {
                const drvRef = (window.currentDriverNameRef || '').toUpperCase();
                if (drvRef === "ROBERT CORTEZ") {
                    roleDriverMatch = true;
                } else {
                    const isMyTrip = (drv === drvRef.toLowerCase());
                    const isComplete = (trip[41] === 'PAID');
                    roleDriverMatch = isMyTrip && !isComplete;
                }
            }

            if (matchesDate && roleDriverMatch && dropdownDriverMatch && dropdownCustomerMatch && dropdownStatusMatch && dropdownPaymentMatch) {
                const div = document.createElement('div');
                div.className = 'trip-item';
                if (window.currentDocTrip && window.currentDocTrip[0] === trip[0]) div.classList.add('active');

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
        window.currentDocTrip = trip;
        document.querySelectorAll('.trip-item').forEach(i => i.classList.remove('active'));
        if (el) el.classList.add('active');
        window.drawReceipt();
        window.renderTripPhotos();

        // --- ACTIVITY LOGGING ---
        if (window.logActivity && trip && trip[1]) {
            const tripId = trip[0];
            const tripDate = trip[1]; // YYYY-MM-DD
            
            // Key must be per-USER per-TRIP so each driver gets their own log
            // Get current session email asynchronously to build the key
            if (db) {
                db.auth.getSession().then(({ data: { session } }) => {
                    const userEmail = session?.user?.email || 'unknown';
                    const sessionKey = `logged_view_${tripId}_${userEmail}`;
                    if (!sessionStorage.getItem(sessionKey)) {
                        window.logActivity('VIEW_TRIP_DETAILS', `Driver viewed receipt for trip ${tripId}`, tripDate);
                        sessionStorage.setItem(sessionKey, 'true');
                    }
                });
            }
        }
    }

    window.renderTripPhotos = function() {
        const gallery = document.getElementById('trip-photos-gallery');
        const list = document.getElementById('photos-list');
        if (!gallery || !list) return;

        const photos = window.currentDocTrip ? (window.currentDocTrip[55] || []) : [];

        if (photos.length === 0) {
            gallery.style.display = 'none';
            return;
        }

        gallery.style.display = 'block';
        list.innerHTML = '';

        photos.forEach((url, idx) => {
            const div = document.createElement('div');
            div.style.position = 'relative';
            div.innerHTML = `
                <img src="${url}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; cursor: pointer;" onclick="window.open('${url}', '_blank')">
                <button onclick="deleteTripPhoto(${idx})" style="position: absolute; top: -8px; right: -8px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);" title="Delete photo">
                    <i class="fas fa-times"></i>
                </button>
            `;
            list.appendChild(div);
        });
    }

    // ============================================================
    // PHOTO UPLOAD / DELETE LOGIC
    // ============================================================

    window.handleTripPhotoUpload = async function (input) {
        if (!input.files || input.files.length === 0) return;
        if (!window.currentDocTrip) {
            alert('Please select a trip first.');
            input.value = '';
            return;
        }

        const file = input.files[0];
        input.value = ''; // Reset so same file can be picked again

        // Show loading state on the button
        const btn = document.getElementById('btn-docs-photos');
        const originalHTML = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

        try {
            const tripId = window.currentDocTrip[0];
            const ext = file.name.split('.').pop() || 'jpg';
            const fileName = `trip_${tripId}_${Date.now()}.${ext}`;
            const filePath = `trip-photos/${fileName}`;

            // Upload to Supabase Storage bucket 'receipts'
            const { data: uploadData, error: uploadError } = await db.storage
                .from('receipts')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: file.type
                });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: { publicUrl } } = db.storage
                .from('receipts')
                .getPublicUrl(filePath);

            // Add URL to photos array
            const currentPhotos = Array.isArray(window.currentDocTrip[55])
                ? [...window.currentDocTrip[55]]
                : [];
            currentPhotos.push(publicUrl);

            // Save to Supabase
            const { error: updateError } = await db.from('trips')
                .update({ photos: currentPhotos })
                .eq('trip_id', tripId);

            if (updateError) throw updateError;

            // Update local cache
            window.currentDocTrip[55] = currentPhotos;
            const idx = currentTrips.findIndex(t => t[0] === tripId);
            if (idx !== -1) currentTrips[idx][55] = currentPhotos;

            // Refresh UI
            window.renderTripPhotos();
            window.drawReceipt();

            if (window.showToast) window.showToast('Photo uploaded successfully!', 'success');

        } catch (err) {
            console.error('Error uploading photo:', err);
            alert('Error uploading photo: ' + (err.message || JSON.stringify(err)));
        } finally {
            if (btn) btn.innerHTML = originalHTML;
        }
    };

    window.deleteTripPhoto = async function (idx) {
        if (!window.currentDocTrip) return;
        if (!confirm('Delete this photo? This cannot be undone.')) return;

        const photos = Array.isArray(window.currentDocTrip[55])
            ? [...window.currentDocTrip[55]]
            : [];

        if (idx < 0 || idx >= photos.length) return;

        const urlToDelete = photos[idx];
        const tripId = window.currentDocTrip[0];

        // Show loading
        const btn = document.getElementById('btn-docs-photos');
        const originalHTML = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

        try {
            // Extract Storage file path from public URL
            // Public URL format: https://<project>.supabase.co/storage/v1/object/public/receipts/<path>
            const urlObj = new URL(urlToDelete);
            const pathParts = urlObj.pathname.split('/object/public/receipts/');
            if (pathParts.length === 2) {
                const storagePath = decodeURIComponent(pathParts[1]);
                const { error: delStorageErr } = await db.storage
                    .from('receipts')
                    .remove([storagePath]);
                if (delStorageErr) {
                    console.warn('Could not delete from Storage (continuing):', delStorageErr.message);
                }
            }

            // Remove from array
            photos.splice(idx, 1);

            // Update Supabase
            const { error: updateError } = await db.from('trips')
                .update({ photos: photos })
                .eq('trip_id', tripId);

            if (updateError) throw updateError;

            // Update local cache
            window.currentDocTrip[55] = photos;
            const tripIdx = currentTrips.findIndex(t => t[0] === tripId);
            if (tripIdx !== -1) currentTrips[tripIdx][55] = photos;

            // Refresh UI
            window.renderTripPhotos();
            window.drawReceipt();

            if (window.showToast) window.showToast('Photo deleted.', 'success');

        } catch (err) {
            console.error('Error deleting photo:', err);
            alert('Error deleting photo: ' + (err.message || JSON.stringify(err)));
        } finally {
            if (btn) btn.innerHTML = originalHTML;
        }
    };

    window.getTripReceiptContent = function (trip) {
        if (!trip) return '';
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
            _rawPhone: (trip[23] && trip[23] !== '---') ? trip[23].trim() : '',
            pickup: (trip[7] && trip[7] !== '---') ? trip[7] : '',
            place: (trip[8] && trip[8] !== '---') ? trip[8] : '',
            miles: parseFloat(trip[10]) || 0,
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
            signature: trip[54] || '',
            signature_driver: trip[56] || ''
        };

        // Parse Phone # field: format is "CLIENT NAME 305-555-1234"
        // Split text (name) from the phone number (first digit-starting sequence at the end)
        const _raw = data._rawPhone;
        const _phoneMatch = _raw.match(/^(.*?)\s*(\+?\(?\d[\d\s\-\.\(\)]{5,})$/);
        data.clientName = _phoneMatch ? _phoneMatch[1].trim() : '';
        data.phone = _phoneMatch ? _phoneMatch[2].trim() : _raw;

        const subtotal = data.yard + data.storage + data.transp + data.sales;
        const taxVal = subtotal * (data.taxRate / 100);
        const total = subtotal + taxVal;

        const f = (label, val) => {
            if (!val || val === '---') return '';
            return `<div class="receipt-field"><label>${label}</label><span>${val}</span></div>`;
        };

        const s = (title, content) => {
            if (!content.trim()) return '';
            return `<div class="receipt-section-title">${title}</div><div class="receipt-grid-3">${content}</div>`;
        };

        const logisticContent = f('RELEASE / BOOKING', data.rel) + f('ORDER / BOL', data.order) + f('DRIVER', data.driver);
        const equipmentContent = f('CONTAINER #', data.cont) + f('SIZE & TYPE', data.size) + f('QTY', data.qty > 1 ? data.qty : '') + f('DOORS DIRECTION', data.doors) + f('PICK UP FROM', data.pickup) + f('DELIVERY PLACE', data.place) + (data.miles > 0 ? f('MILES', data.miles.toLocaleString() + ' mi') : '');
        const clientContent = f('CUSTOMER NAME', data.clientName) + f('PHONE', data.phone);

        let inspectionContent = '';
        const checkIcon = '<span style="width:14px; height:14px; border:1px solid #000; display:inline-block; text-align:center; line-height:14px; font-weight:bold; font-size:10px; margin-right:5px;">X</span>';
        if (data.cond.asis) inspectionContent += `<div>${checkIcon} AS IS</div>`;
        if (data.cond.wwt) inspectionContent += `<div>${checkIcon} WWT</div>`;
        if (data.cond.cw) inspectionContent += `<div>${checkIcon} CW</div>`;
        if (data.cond.new) inspectionContent += `<div>${checkIcon} NEW</div>`;
        if (data.cond.holes) inspectionContent += `<div>${checkIcon} NO HOLES</div>`;
        if (data.cond.doors) inspectionContent += `<div>${checkIcon} DOORS OK</div>`;

        let inspectionSectionHtml = inspectionContent ? `<div class="receipt-section-title">Inspection & Condition</div><div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; font-size: 0.8rem;">${inspectionContent}</div>` : '';

        const bBadge = (st) => `<span style="font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:4px; margin-right:8px; display:inline-block; vertical-align:middle; ${st==='PAID' ? 'background:#dcfce7; color:#166534; border:1px solid #166534;' : 'background:#fee2e2; color:#991b1b; border:1px solid #991b1b;'}">${st}</span>`;
        let billingRows = '';
        if (data.yard > 0) billingRows += `<tr><td>Yard Fee</td><td style="text-align:right;">${bBadge(data.yardStatus)}$${data.yard.toFixed(2)}</td></tr>`;
        if (data.storage > 0) billingRows += `<tr><td>Storage</td><td style="text-align:right;">${bBadge(data.storageStatus)}$${data.storage.toFixed(2)}</td></tr>`;
        if (data.transp > 0) billingRows += `<tr><td>Transport</td><td style="text-align:right;">${bBadge(data.transpStatus)}$${data.transp.toFixed(2)}</td></tr>`;
        if (data.sales > 0) billingRows += `<tr><td>Sales</td><td style="text-align:right;">${bBadge(data.salesStatus)}$${data.sales.toFixed(2)}</td></tr>`;
        if (data.takeTax && taxVal > 0) billingRows += `<tr><td>Taxes (${data.taxRate}%)</td><td style="text-align:right;">${bBadge(data.taxStatus)}$${taxVal.toFixed(2)}</td></tr>`;

        let billingSectionHtml = (total > 0 && data.showBilling) ? `<div class="receipt-section-title">Billing Summary</div><table class="receipt-table"><tbody>${billingRows}</tbody><tfoot><tr class="receipt-total-row"><td>TOTAL DUE</td><td style="text-align:right;">$${total.toFixed(2)}</td></tr></tfoot></table>` : '';

        const photos = trip[55] || [];
        let photosHtml = '';
        if (photos.length > 0) {
            let imgList = '';
            photos.forEach(url => { imgList += `<img src="${url}" style="width: 31%; height: 180px; object-fit: cover; border-radius: 5px; margin-bottom: 10px;">`; });
            photosHtml = `<div class="receipt-section-title" style="margin-top: 35px;">Evidence</div><div style="display: flex; gap: 3%; flex-wrap: wrap; margin-top: 15px;">${imgList}</div>`;
        }

        return `
            <div style="padding: 40px; font-family: 'Outfit', sans-serif;">
                <div class="receipt-header">
                    <div>
                        <h1 style="color:#b91c1c; margin:0;">RP TULIPAN</h1>
                        <p style="font-weight:900; margin:0;">TRANSPORT, INC.</p>
                    </div>
                    <div style="text-align:right;">
                        <h2 style="margin:0;">RECEIPT</h2>
                        <p>ORDER: ${data.order}</p>
                        <p>DATE: ${data.date}</p>
                    </div>
                </div>
                ${s('Logistics', logisticContent)}
                ${s('Equipment', equipmentContent)}
                ${s('Client', clientContent)}
                ${inspectionSectionHtml}
                ${billingSectionHtml}
                <div style="margin-top:25px; border-left: 4px solid #b91c1c; padding-left:10px; background:#f8fafc;">${data.notes}</div>
                ${photosHtml}
                <div style="display:flex; justify-content:space-between; margin-top:60px;">
                    <div style="width:45%; border-top:1px solid #000; text-align:center; position:relative;">
                        ${data.signature_driver ? `<img src="${data.signature_driver}" style="position:absolute; bottom:10px; left:50%; transform:translateX(-50%); max-height:60px;">` : ''}
                        RP TULIPAN
                    </div>
                    <div style="width:45%; border-top:1px solid #000; text-align:center; position:relative;">
                        ${data.signature ? `<img src="${data.signature}" style="position:absolute; bottom:10px; left:50%; transform:translateX(-50%); max-height:60px;">` : ''}
                        CUSTOMER
                    </div>
                </div>
            </div>
        `;
    }

    window.drawReceipt = function () {
        const preview = document.getElementById('receipt-a4');
        if (!preview || !window.currentDocTrip) return;
        preview.innerHTML = window.getTripReceiptContent(window.currentDocTrip);
    }

    window.clearDocsFilters = function () {
        const fromDate = document.getElementById('trip-from-date');
        const toDate = document.getElementById('trip-to-date');
        const driverDd = document.getElementById('docs-driver-dropdown');
        const customerDd = document.getElementById('docs-customer-dropdown');
        const statusDd = document.getElementById('docs-status-dropdown');
        const paymentDd = document.getElementById('docs-payment-dropdown');

        if (fromDate) fromDate.value = '';
        if (toDate) toDate.value = '';
        if (driverDd) driverDd.value = '';
        if (customerDd) customerDd.value = '';
        if (statusDd) statusDd.value = '';
        if (paymentDd) paymentDd.value = '';

        window.loadDocTrips();
    }

    // ============================================================
    // PRINT LOGIC
    // ============================================================
    window.printA4Document = function () {
        const el = document.getElementById('receipt-a4');
        if (!el || !window.currentDocTrip) {
            alert('Please select a trip first.');
            return;
        }

        const printWin = window.open('', '_blank', 'width=1000,height=1200');
        if (!printWin) {
            alert('Popup blocked. Please allow popups for this site and try again.');
            return;
        }

        printWin.document.write('<html><head><title>Print Receipt</title>');
        printWin.document.write('<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet">');
        printWin.document.write('<style>');
        printWin.document.write(`
            * { box-sizing: border-box; }
            body { margin: 0; padding: 0; font-family: 'Outfit', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .a4-paper { width: 210mm; margin: 0 auto; padding: 15mm 20mm; background: white; min-height: 297mm; }
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
            @media print {
                @page { size: A4; margin: 10mm; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
        `);
        printWin.document.write('</style></head><body>');
        printWin.document.write('<div class="a4-paper">');
        printWin.document.write(el.innerHTML);
        printWin.document.write('</div></body></html>');
        printWin.document.close();

        // Wait for fonts/images to load before printing
        printWin.onload = function () {
            setTimeout(() => {
                printWin.focus();
                printWin.print();
            }, 600);
        };

        // Fallback if onload doesn't fire (some browsers)
        setTimeout(() => {
            if (!printWin.closed) {
                printWin.focus();
                printWin.print();
            }
        }, 1500);
    };

    // ============================================================
    // SIGNATURE MODAL LOGIC
    // ============================================================
    let _sigType = 'customer'; // 'customer' | 'driver'
    let _sigCanvas = null;
    let _sigCtx = null;
    let _sigDrawing = false;
    let _sigLastX = 0;
    let _sigLastY = 0;

    function _sigGetPos(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        if (e.touches) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    function _sigStart(e) {
        e.preventDefault();
        _sigDrawing = true;
        const pos = _sigGetPos(e, _sigCanvas);
        _sigLastX = pos.x;
        _sigLastY = pos.y;
        _sigCtx.beginPath();
        _sigCtx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
        _sigCtx.fillStyle = '#1e293b';
        _sigCtx.fill();
    }

    function _sigMove(e) {
        if (!_sigDrawing) return;
        e.preventDefault();
        const pos = _sigGetPos(e, _sigCanvas);
        _sigCtx.beginPath();
        _sigCtx.moveTo(_sigLastX, _sigLastY);
        _sigCtx.lineTo(pos.x, pos.y);
        _sigCtx.strokeStyle = '#1e293b';
        _sigCtx.lineWidth = 2.5;
        _sigCtx.lineCap = 'round';
        _sigCtx.lineJoin = 'round';
        _sigCtx.stroke();
        _sigLastX = pos.x;
        _sigLastY = pos.y;
    }

    function _sigEnd() { _sigDrawing = false; }

    window.openSignatureModal = function (type) {
        if (!window.currentDocTrip) {
            alert('Please select a trip first.');
            return;
        }
        _sigType = type || 'customer';
        const modal = document.getElementById('signature-modal');
        const title = document.getElementById('signature-modal-title');
        if (!modal) return;

        if (title) {
            title.innerHTML = _sigType === 'driver'
                ? '<i class="fas fa-user-tie"></i> Driver Signature'
                : '<i class="fas fa-file-signature"></i> Client Signature';
        }

        // Setup canvas
        _sigCanvas = document.getElementById('signature-pad');
        if (!_sigCanvas) return;
        _sigCtx = _sigCanvas.getContext('2d');
        _sigCtx.clearRect(0, 0, _sigCanvas.width, _sigCanvas.height);

        // Pre-load existing signature if any
        const existingSig = _sigType === 'driver'
            ? (window.currentDocTrip[56] || '')
            : (window.currentDocTrip[54] || '');
        if (existingSig) {
            const img = new Image();
            img.onload = () => _sigCtx.drawImage(img, 0, 0, _sigCanvas.width, _sigCanvas.height);
            img.src = existingSig;
        }

        // Remove old listeners, re-add fresh
        const c = _sigCanvas;
        const newCanvas = c.cloneNode(true);
        c.parentNode.replaceChild(newCanvas, c);
        _sigCanvas = newCanvas;
        _sigCtx = _sigCanvas.getContext('2d');
        if (existingSig) {
            const img2 = new Image();
            img2.onload = () => _sigCtx.drawImage(img2, 0, 0, _sigCanvas.width, _sigCanvas.height);
            img2.src = existingSig;
        }

        _sigCanvas.addEventListener('mousedown', _sigStart);
        _sigCanvas.addEventListener('mousemove', _sigMove);
        _sigCanvas.addEventListener('mouseup', _sigEnd);
        _sigCanvas.addEventListener('mouseleave', _sigEnd);
        _sigCanvas.addEventListener('touchstart', _sigStart, { passive: false });
        _sigCanvas.addEventListener('touchmove', _sigMove, { passive: false });
        _sigCanvas.addEventListener('touchend', _sigEnd);

        modal.style.display = 'flex';
    };

    window.closeSignatureModal = function () {
        const modal = document.getElementById('signature-modal');
        if (modal) modal.style.display = 'none';
    };

    window.clearSignature = function () {
        if (_sigCtx && _sigCanvas) {
            _sigCtx.clearRect(0, 0, _sigCanvas.width, _sigCanvas.height);
        }
    };

    window.saveSignature = async function () {
        if (!_sigCanvas || !window.currentDocTrip) return;

        // Check if canvas is blank
        const px = _sigCtx.getImageData(0, 0, _sigCanvas.width, _sigCanvas.height).data;
        const isBlank = px.every(v => v === 0);
        if (isBlank) {
            alert('Please draw a signature before saving.');
            return;
        }

        const dataUrl = _sigCanvas.toDataURL('image/png');
        const tripId = window.currentDocTrip[0];

        // Determine which column to update: trip[54] = customer sig, trip[56] = driver sig
        const colName = _sigType === 'driver' ? 'signature_driver' : 'signature';

        try {
            const { error } = await db.from('trips').update({ [colName]: dataUrl }).eq('id', tripId);
            if (error) throw error;

            // Update local cache
            if (_sigType === 'driver') {
                window.currentDocTrip[56] = dataUrl;
            } else {
                window.currentDocTrip[54] = dataUrl;
            }

            // Also update in currentTrips array
            const idx = currentTrips.findIndex(t => t[0] === tripId);
            if (idx !== -1) {
                if (_sigType === 'driver') currentTrips[idx][56] = dataUrl;
                else currentTrips[idx][54] = dataUrl;
            }

            window.closeSignatureModal();
            window.drawReceipt();

            // Toast notification
            if (window.showToast) {
                window.showToast(_sigType === 'driver' ? 'Driver signature saved!' : 'Client signature saved!', 'success');
            } else {
                alert(_sigType === 'driver' ? 'Driver signature saved!' : 'Client signature saved!');
            }
        } catch (err) {
            console.error('Error saving signature:', err);
            alert('Error saving signature: ' + (err.message || err));
        }
    };

})();
