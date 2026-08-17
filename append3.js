const fs = require('fs');
const file = 'c:/Users/Juanca/Desktop/RP tulipan logistic/js/billing-manager.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /\s*const tbody = document\.getElementById\('mb-services-body'\);\s*tbody\.innerHTML = '';\s*let grandTotal = 0;([\s\S]*?)if \(activeServices > 1\) \{\s*prefix = 'AS';\s*\}/;

const replacement = `
        const tbody = document.getElementById('mb-services-body');
        tbody.innerHTML = '';
        let grandTotal = 0;
        let activeServices = 0;
        let prefix = 'INV';

        const fService = (document.getElementById('bc-f-service')?.value || '').trim();

        const serviceGroups = {
            TRANSPORT: {},
            YARD: {},
            SALES: {},
            STORAGE: {},
            RENT: {}
        };

        const addGroup = (srv, booking, unitCost, qty, total) => {
            const key = booking && booking !== '---' ? \`B|\${booking}|\${unitCost}\` : \`NB|\${unitCost}\`;
            if (!serviceGroups[srv][key]) {
                serviceGroups[srv][key] = { booking: booking && booking !== '---' ? booking : null, unitCost, qty: 0, total: 0 };
            }
            serviceGroups[srv][key].qty += qty;
            serviceGroups[srv][key].total += total;
        };

        rows.forEach(r => {
            const orderNo = (r[5] || '').toString().toUpperCase();
            const bookingNo = (r[65] && r[65] !== '---') ? r[65].toString().trim() : '---';
            const isYardStorageRow = orderNo.startsWith('YRD-');

            let rYard = parseFloat(r[13]) || 0;
            let rTrans = parseFloat(r[18]) || 0;
            const rQty = parseInt(r[53]) || 1;
            let rSales = (parseFloat(r[20]) || 0) * rQty;

            let rStorage = 0;
            if (isYardStorageRow) {
                rStorage = rYard;
                rYard = 0;
            } else {
                const ppd = parseFloat(r[14]) || 0;
                if (ppd > 0) {
                    const entryDate = new Date(r[1]);
                    const exitDate = r[15] && r[15] !== '---' ? new Date(r[15]) : new Date();
                    const diffDays = Math.max(1, Math.ceil(Math.abs(exitDate - entryDate) / (1000 * 60 * 60 * 24)));
                    rStorage = ppd * diffDays;
                }
            }

            let rRent = 0;
            const mrate = parseFloat(r[27]) || 0;
            if (mrate > 0) {
                const tripId = r[0] || '';
                let rentalId = null;
                if (tripId.startsWith('VIRTUAL_RENTAL_')) {
                    rentalId = tripId.replace('VIRTUAL_RENTAL_', '');
                } else if (r.isActiveRentalMerged) {
                    rentalId = r.isActiveRentalMerged;
                }
                if (rentalId) {
                    const rental = (window.currentRentals || []).find(rt => String(rt.id) === String(rentalId));
                    if (rental && window.calculateRentalCost) {
                        const costInfo = window.calculateRentalCost(rental.start_date, rental.final_date, rental.base_price, rental.daily_rate, rental.status, rental.time_rent, null, null);
                        rRent = (r[31] === 'PAID') ? 0 : costInfo.total;
                    } else {
                        rRent = mrate;
                    }
                } else {
                    const entryDate = new Date(r[1]);
                    const exitDate = r[15] && r[15] !== '---' ? new Date(r[15]) : new Date();
                    const diffDays = Math.ceil(Math.abs(exitDate - entryDate) / (1000 * 60 * 60 * 24));
                    const diffPeriods = Math.max(1, Math.ceil(diffDays / 30));
                    rRent = mrate * diffPeriods;
                }
            }

            if ((fService === '' || fService === 'TRANSPORT') && rTrans > 0 && r[42] === 'YES') {
                addGroup('TRANSPORT', bookingNo, rTrans, 1, rTrans);
            }
            if ((fService === '' || fService === 'YARD') && rYard > 0) {
                addGroup('YARD', bookingNo, rYard, 1, rYard);
            }
            if ((fService === '' || fService === 'SALES') && rSales > 0 && r[43] === 'YES') {
                const uCost = rSales / rQty;
                addGroup('SALES', bookingNo, uCost, rQty, rSales);
            }
            if ((fService === '' || fService === 'STORAGE') && rStorage > 0) {
                addGroup('STORAGE', bookingNo, rStorage, 1, rStorage);
            }
            if ((fService === '' || fService === 'RENT') && rRent > 0) {
                addGroup('RENT', bookingNo, rRent, 1, rRent);
            }
        });

        const renderService = (srv, title, prefixKey) => {
            const keys = Object.keys(serviceGroups[srv]);
            if (keys.length === 0) return;
            
            activeServices++;
            prefix = prefixKey;
            
            tbody.innerHTML += \`
                <tr style="background:#e2e8f0;">
                    <td colspan="4" style="padding:10px 15px;font-weight:900;color:#1e293b;text-align:center;">\${title}</td>
                </tr>
            \`;

            let srvTotal = 0;
            
            keys.forEach(k => {
                const grp = serviceGroups[srv][k];
                const desc = grp.booking ? \`Booking: \${grp.booking}\` : title;
                srvTotal += grp.total;
                
                tbody.innerHTML += \`
                    <tr>
                        <td style="padding:14px 15px;font-weight:600;color:#1e293b; border-bottom:1px solid #e2e8f0;">\${desc}</td>
                        <td style="padding:14px 15px;text-align:center;color:#0f172a; border-bottom:1px solid #e2e8f0;">\${grp.qty}</td>
                        <td style="padding:14px 15px;text-align:right;color:#0f172a; border-bottom:1px solid #e2e8f0;">\$\${grp.unitCost.toFixed(2)}</td>
                        <td style="padding:14px 15px;text-align:right;font-weight:800;color:#1e293b; border-bottom:1px solid #e2e8f0;">\$\${grp.total.toFixed(2)}</td>
                    </tr>
                \`;
            });
            
            grandTotal += srvTotal;
        };

        renderService('TRANSPORT', 'TRANSPORT SERVICE', 'TRANS');
        renderService('YARD', 'YARD / ADDITIONAL SERVICES', 'YARD');
        renderService('SALES', 'CONTAINER SALES', 'SALE');
        renderService('STORAGE', 'STORAGE SERVICE', 'STOR');
        renderService('RENT', 'CONTAINER RENTAL', 'RENT');

        if (activeServices > 1) {
            prefix = 'AS';
        }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log("Updated invoice logic grouped by booking!");
