        function mapTripToArray(t) {
            const normPaid = (val) => (val === true || val === 1 || val === 'PAID' || val === 'true') ? 'PAID' : 'PEND';

            return [
                t.trip_id || '',           // 0
                t.date || '---',           // 1
                t.size || '---',           // 2
                t.n_cont || '---',         // 3
                t.release_no || '---',      // 4
                t.order_no || '---',       // 5
                t.city || '---',           // 6
                t.pickup_address || '---',  // 7
                t.delivery_place || '---',  // 8
                t.doors_direction || '---', // 9
                t.miles || 0,              // 10
                t.customer || '---',       // 11
                t.yard_services || '---',  // 12 (in-yard)
                t.yard_rate || 0,          // 13 (in-yardrate)
                t.price_per_day || 0,      // 14 (in-priceperday)
                t.date_out || '---',       // 15 (in-dateout)
                t.company || '---',        // 16 (in-company)
                t.driver || '---',         // 17 (in-driver)
                t.trans_pay || 0,          // 18 (in-rate)
                t.type_payment || '---',   // 19 (in-paytype)
                t.sales_price || 0,        // 20 (in-sales)
                t.collect_payment || '---', // 21 (in-collect)
                t.amount || 0,             // 22 (in-amount)
                t.phone_no || '---',       // 23 (in-phone)
                t.paid_driver || 0,         // 24 (in-paiddriver)
                t.note || '---',           // 25 (in-note)
                t.service_mode || 'SALE',  // 26 (in-mode)
                t.monthly_rate || 0,       // 27 (in-mrate)
                t.start_date_rent || '---', // 28 (in-sdaterent)
                t.next_due || '---',       // 29 (in-nextdue)
                normPaid(t.st_yard),       // 30
                normPaid(t.st_rent),       // 31
                normPaid(t.st_rate || t.trans_pay_paid),  // 32
                normPaid(t.st_sales || t.sales_price_paid),// 33
                normPaid(t.st_amount || t.amount_paid || t.paid), // 34
                `$${(t.pending_balance || 0).toFixed(2)}`,       // 35
                t.email || '---',          // 36
                t.truck_unit || '---',      // 37
                t.trailer_unit || '---',    // 38
                t.final_driver_pay || 0,    // 39
                t.yard_rate_paid || false,  // 40
                t.status || 'PENDING_PAYMENT', // 41
                t.has_trans === 'YES' || t.has_trans === true || (t.has_trans === null && t.trip_id) ? 'YES' : 'NO', // 42
                t.has_sales === 'YES' || t.has_sales === true || (t.has_sales === null && t.trip_id) ? 'YES' : 'NO', // 43
                t.rel_type || '---',        // 44
                t.rel_condition || '---',   // 45
                t.y_cash || false,          // 46
                t.r_cash || false,          // 47
                t.s_cash || false,          // 48
                t.take_tax || false,        // 49 (Persisted per order)
                t.tax_percent || 0,         // 50 (Persisted per order)
                t.hide_amounts || false,    // 51 (NEW: Hides billing summary on receipt)
                normPaid(t.st_tax)          // 52
            ];
        }


        // Maps sidebar save rowData (no trip UUID in row — checkboxes inserted before last field)
        function mapArrayToTrip(row) {
            return {
                date: row[1] === '---' ? null : row[1],
                size: row[2],
                n_cont: row[3],
                release_no: row[4],
                order_no: row[5],
                city: row[6],
                pickup_address: row[7],
                delivery_place: row[8],
                doors_direction: row[9],
                miles: parseFloat(row[10]) || 0,
                customer: row[11],
                yard_services: row[12],
                yard_rate: parseFloat(row[13]) || 0,
                price_per_day: parseFloat(row[14]) || 0,
                date_out: row[15] === '---' ? null : row[15],
                company: row[16],
                driver: row[17],
                trans_pay: parseFloat(row[18]) || 0,
                type_payment: row[19],
                sales_price: parseFloat(row[20]) || 0,
                collect_payment: row[21],
                amount: parseFloat(row[22]) || 0,
                phone_no: row[23],
                paid_driver: parseFloat(row[24]) || 0,
                note: row[25],
                service_mode: row[26] || 'SALE',
                monthly_rate: parseFloat(row[27]) || 0,
                start_date_rent: row[28] === '---' ? null : row[28],
                next_due: row[29] === '---' ? null : row[29],
                st_yard: row[30],
                st_rent: row[31],
                st_rate: row[32],
                st_sales: row[33],
                st_amount: row[34],
                pending_balance: row[35] ? parseFloat(row[35].toString().replace('$', '').replace(/,/g, '')) || 0 : 0,
                email: row[36],
                truck_unit: row[37] === '---' ? null : row[37],
                trailer_unit: row[38] === '---' ? null : row[38],
                final_driver_pay: parseFloat(row[39]) || 0,
                yard_rate_paid: row[40] === true || row[40] === 'true',
                status: row[41] || 'PENDING_PAYMENT',
                has_trans: row[42] === 'NO' ? 'NO' : 'YES',
                has_sales: row[43] === 'NO' ? 'NO' : 'YES',
                rel_type: row[44] || '---',
                rel_condition: row[45] || '---',
                y_cash: row[46] === true || row[46] === 'true',
                r_cash: row[47] === true || row[47] === 'true',
                s_cash: row[48] === true || row[48] === 'true',
                take_tax: row[49] === true || row[49] === 'true',
                tax_percent: parseFloat(row[50]) || 0,
                hide_amounts: row[51] === true || row[51] === 'true',
                st_tax: row[52]
            };
        }

