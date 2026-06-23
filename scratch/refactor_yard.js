const fs = require('fs');

let yardJs = fs.readFileSync('js/yard-stock.js', 'utf8');

// 1. Remove parseYardNotes function definition
yardJs = yardJs.replace(/function parseYardNotes\([\s\S]*?return \{[\s\S]*?\};\n\s*\}/, '');

// 2. saveYardContainer updates
const saveRegex = /const exitDate = document\.getElementById\('yard-exit-date'\)\.value \|\| '';[\s\S]*?const yardObj = \{[\s\S]*?customer_phone: phone\n\s*\};/;
const newSaveObj = `const exitDate = document.getElementById('yard-exit-date').value || '';
        const orderOut = document.getElementById('yard-order-out')?.value.trim() || '';
        const lifts = parseFloat(document.getElementById('yard-lifts')?.value) || 0;
        const liftCost = parseFloat(document.getElementById('yard-lift-cost')?.value) || 50.00;

        if (!containerNo) return alert("Please enter a Container Number.");

        const btn = document.getElementById('btn-save-yard');
        btn.disabled = true;
        btn.textContent = "SAVING...";

        const status = exitDate ? 'SOLD' : 'AVAILABLE';

        const yardObj = {
            container_no: containerNo.toUpperCase(),
            size,
            type,
            condition,
            origin_release: origin,
            notes: \`\${yardNotesPrefix} \${note}\`.trim(),
            status: status,
            customer_name: customer,
            customer_phone: phone,
            entry_fee: entryFee,
            daily_rate: dailyRate,
            exit_date: exitDate || null,
            order_out: orderOut || null,
            lifts: lifts,
            lift_cost: liftCost
        };`;

yardJs = yardJs.replace(saveRegex, newSaveObj);

// 3. editYardItem updates
const editRegex = /const parsed = parseYardNotes\(item\.notes\);\n\s*document\.getElementById\('yard-entry-fee'\)\.value = parsed\.entryFee > 0 \? parsed\.entryFee : '';[\s\S]*?document\.getElementById\('yard-note'\)\.value = parsed\.cleanNote \|\| '';/;
const newEdit = `document.getElementById('yard-entry-fee').value = item.entry_fee > 0 ? item.entry_fee : '';
        document.getElementById('yard-daily-rate').value = item.daily_rate > 0 ? item.daily_rate : '';
        document.getElementById('yard-exit-date').value = item.exit_date || '';
        
        if (document.getElementById('yard-order-out')) document.getElementById('yard-order-out').value = item.order_out || '';
        if (document.getElementById('yard-lifts')) document.getElementById('yard-lifts').value = item.lifts !== undefined ? item.lifts : 1;
        if (document.getElementById('yard-lift-cost')) document.getElementById('yard-lift-cost').value = item.lift_cost !== undefined ? item.lift_cost : 50.00;
        
        document.getElementById('yard-note').value = item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : '';`;

yardJs = yardJs.replace(editRegex, newEdit);

// 4. render table variables updates (global replacements)
yardJs = yardJs.replace(/const parsed = parseYardNotes\(item\.notes\);\n\s*const entryDate = new Date\(item\.created_at \|\| new Date\(\)\);\n\s*const endDate = parsed\.exitDate \? new Date\(parsed\.exitDate \+ 'T12:00:00'\) : new Date\(\);/g, 
`const entryDate = new Date(item.created_at || new Date());
        const endDate = item.exit_date ? new Date(item.exit_date + 'T12:00:00') : new Date();`);

yardJs = yardJs.replace(/const accumStorage = parsed\.dailyRate \* days;/g, 'const accumStorage = (item.daily_rate || 0) * days;');
yardJs = yardJs.replace(/const exitFee = parsed\.exitDate \? parsed\.entryFee : 0;/g, 'const exitFee = item.exit_date ? (item.entry_fee || 0) : 0;');
yardJs = yardJs.replace(/const totalCost = parsed\.entryFee \+ accumStorage \+ exitFee \+ \(parsed\.lifts \* parsed\.liftCost\);/g, 'const totalCost = (item.entry_fee || 0) + accumStorage + exitFee + ((item.lifts || 1) * (item.lift_cost || 50));');

yardJs = yardJs.replace(/<td>\$\{parsed\.orderOut \|\| ''\}<\/td>/g, `<td>\${item.order_out || ''}</td>`);
yardJs = yardJs.replace(/<td>\$\{parsed\.lifts\}<\/td>/g, `<td>\${item.lifts || 1}</td>`);
yardJs = yardJs.replace(/<td>\$\$\{parsed\.liftCost\.toFixed\(2\)\}<\/td>/g, `<td>$$\${(item.lift_cost || 50).toFixed(2)}</td>`);
yardJs = yardJs.replace(/<td>\$\$\{\(parsed\.lifts \* parsed\.liftCost\)\.toFixed\(2\)\}<\/td>/g, `<td>$$\${((item.lifts || 1) * (item.lift_cost || 50)).toFixed(2)}</td>`);
yardJs = yardJs.replace(/<td>\$\{parsed\.cleanNote\}<\/td>/g, `<td>\${item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : ''}</td>`);

yardJs = yardJs.replace(/order_out: parsed\.orderOut,/g, 'order_out: item.order_out,');
yardJs = yardJs.replace(/exit_date: parsed\.exitDate \? window\.formatDateMMDDYYYY\(parsed\.exitDate \+ 'T12:00:00'\) : 'Not Exited',/g, 'exit_date: item.exit_date ? window.formatDateMMDDYYYY(item.exit_date + \'T12:00:00\') : \'Not Exited\',');
yardJs = yardJs.replace(/lifts: parsed\.lifts,/g, 'lifts: item.lifts || 1,');
yardJs = yardJs.replace(/lifts_cost: \(parsed\.lifts \* parsed\.liftCost\)\.toFixed\(2\),/g, 'lifts_cost: ((item.lifts || 1) * (item.lift_cost || 50)).toFixed(2),');

fs.writeFileSync('js/yard-stock.js', yardJs);
console.log('yard-stock.js updated');

// Update profit-expenses.js
let profitJs = fs.readFileSync('js/profit-expenses.js', 'utf8');

profitJs = profitJs.replace(/function parseYardNotes\([\s\S]*?return \{[\s\S]*?\};\n\s*\}/, '');
profitJs = profitJs.replace(/const parsed = parseYardNotes\(item\.notes\);\n\s*if \(\!parsed\.exitDate \|\| parsed\.exitDate < startDate \|\| parsed\.exitDate > endDate\)/g, 
`if (!item.exit_date || item.exit_date < startDate || item.exit_date > endDate)`);

profitJs = profitJs.replace(/const entryDate = new Date\(item\.created_at\);\n\s*const endDateObj = new Date\(parsed\.exitDate \+ 'T12:00:00'\);/g, 
`const entryDate = new Date(item.created_at);
                                const endDateObj = new Date(item.exit_date + 'T12:00:00');`);

profitJs = profitJs.replace(/const accumStorage = parsed\.dailyRate \* days;\n\s*const exitFee = parsed\.entryFee;\n\s*const liftTotal = parsed\.lifts \* parsed\.liftCost;\n\s*const total = parsed\.entryFee \+ accumStorage \+ exitFee \+ liftTotal;/g, 
`const accumStorage = (item.daily_rate || 0) * days;
                                const exitFee = item.entry_fee || 0;
                                const liftTotal = (item.lifts || 1) * (item.lift_cost || 50);
                                const total = (item.entry_fee || 0) + accumStorage + exitFee + liftTotal;`);

profitJs = profitJs.replace(/date: window\.formatDateMMDDYYYY\(parsed\.exitDate \+ 'T12:00:00'\),/g, `date: window.formatDateMMDDYYYY(item.exit_date + 'T12:00:00'),`);
profitJs = profitJs.replace(/desc: `\$\{item\.customer_name \|\| 'Unknown'\} - Container \$\{item\.container_no\} \\n\$\{days\} days @ \$\$\{parsed\.dailyRate\}\/day \+ 2x Entry\/Exit \(\$\$\{parsed\.entryFee\}\) \+ Lifts \(\$\$\{liftTotal\.toFixed\(2\)\}\)`,/g, 
`desc: \`\${item.customer_name || 'Unknown'} - Container \${item.container_no} \\n\${days} days @ $$\${item.daily_rate || 0}/day + 2x Entry/Exit ($$\${item.entry_fee || 0}) + Lifts ($$\${liftTotal.toFixed(2)})\`,`);

fs.writeFileSync('js/profit-expenses.js', profitJs);
console.log('profit-expenses.js updated');
