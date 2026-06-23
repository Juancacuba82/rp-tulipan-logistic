const fs = require('fs');
let js = fs.readFileSync('js/yard-stock.js', 'utf8');

// 1. saveYardContainer
const oldSave1 = `const exitDate = document.getElementById('yard-exit-date').value || '';
        const priceTags = \`[EntryFee: \${entryFee}] [DailyRate: \${dailyRate}]\` + (exitDate ? \` [ExitDate: \${exitDate}]\` : '');`;
const newSave1 = `const exitDate = document.getElementById('yard-exit-date').value || '';
        const orderOut = document.getElementById('yard-order-out')?.value.trim() || '';
        const lifts = parseFloat(document.getElementById('yard-lifts')?.value) || 0;
        const liftCost = parseFloat(document.getElementById('yard-lift-cost')?.value) || 50.00;
        
        let priceTags = \`[EntryFee: \${entryFee}] [DailyRate: \${dailyRate}]\`;
        if (exitDate) priceTags += \` [ExitDate: \${exitDate}]\`;
        if (orderOut) priceTags += \` [OrderOut: \${orderOut}]\`;
        priceTags += \` [Lifts: \${lifts}] [LiftCost: \${liftCost}]\`;`;

// 2. editYardItem
const oldEdit1 = `document.getElementById('yard-daily-rate').value = parsed.dailyRate > 0 ? parsed.dailyRate : '';
        document.getElementById('yard-exit-date').value = parsed.exitDate || '';
        document.getElementById('yard-note').value = parsed.cleanNote || '';`;
const newEdit1 = `document.getElementById('yard-daily-rate').value = parsed.dailyRate > 0 ? parsed.dailyRate : '';
        document.getElementById('yard-exit-date').value = parsed.exitDate || '';
        
        if (document.getElementById('yard-order-out')) document.getElementById('yard-order-out').value = parsed.orderOut || '';
        if (document.getElementById('yard-lifts')) document.getElementById('yard-lifts').value = parsed.lifts !== undefined ? parsed.lifts : 1;
        if (document.getElementById('yard-lift-cost')) document.getElementById('yard-lift-cost').value = parsed.liftCost !== undefined ? parsed.liftCost : 50.00;
        
        document.getElementById('yard-note').value = parsed.cleanNote || '';`;

// 3. resetYardForm
const oldReset1 = `const dRate = document.getElementById('yard-daily-rate');
        const xDate = document.getElementById('yard-exit-date');`;
const newReset1 = `const dRate = document.getElementById('yard-daily-rate');
        const xDate = document.getElementById('yard-exit-date');
        const orderOut = document.getElementById('yard-order-out');
        const lifts = document.getElementById('yard-lifts');
        const liftCost = document.getElementById('yard-lift-cost');`;

const oldReset2 = `if (eFee) eFee.value = '';
        if (dRate) dRate.value = '';
        if (xDate) xDate.value = '';`;
const newReset2 = `if (eFee) eFee.value = '';
        if (dRate) dRate.value = '';
        if (xDate) xDate.value = '';
        if (orderOut) orderOut.value = '';
        if (lifts) lifts.value = '1';
        if (liftCost) liftCost.value = '50.00';`;

js = js.replace(oldSave1, newSave1);
js = js.replace(oldEdit1, newEdit1);
js = js.replace(oldReset1, newReset1);
js = js.replace(oldReset2, newReset2);

fs.writeFileSync('js/yard-stock.js', js);
console.log('Done');
