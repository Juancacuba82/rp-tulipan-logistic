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
})();
