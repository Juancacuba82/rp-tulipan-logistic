const fs = require('fs');
const file = 'c:/Users/Juanca/Desktop/RP tulipan logistic/js/billing-manager.js';
let content = fs.readFileSync(file, 'utf8');

const functionsToRemove = [
    'window.openBillingDetail =',
    'window.closeBillingDetail =',
    'window.updateBillingCompany =',
    'window.sendBillingEmail =',
    'window.downloadBillingInvoicePDF =',
    'window.markBillingRowAsPaid =',
    'window.markAllFilteredAsPaid ='
];

for (const fn of functionsToRemove) {
    let startIdx = content.indexOf(fn);
    if (startIdx === -1) continue;
    
    // Rewind slightly to remove leading spaces/tabs if desired (optional)
    
    const firstBraceIdx = content.indexOf('{', startIdx);
    if (firstBraceIdx === -1) continue;
    
    let openCount = 1;
    let currIdx = firstBraceIdx + 1;
    
    while (openCount > 0 && currIdx < content.length) {
        if (content[currIdx] === '{') openCount++;
        else if (content[currIdx] === '}') openCount--;
        currIdx++;
    }
    
    if (content[currIdx] === ';') currIdx++;
    
    content = content.slice(0, startIdx) + content.slice(currIdx);
}

const tdBlock = `<td style="\${cs}">
                    <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                        <button onclick="openBillingDetail(\${globalIdx})" class="glossy-dark-btn-sm">
                            <i class="fas fa-file-invoice-dollar"></i> VIEW SEND
                        </button>
                        \${isOrderPendingPayment ? \`
                        <button onclick="markBillingRowAsPaid(\${globalIdx}, this)" class="glossy-green-btn-sm" title="Mark as Paid">
                            <i class="fas fa-check-double"></i> PAID
                        </button>
                        \` : ''}
                    </div>
                </td>`;
content = content.replace(tdBlock, '');

fs.writeFileSync(file, content);
console.log("Cleanup done.");
