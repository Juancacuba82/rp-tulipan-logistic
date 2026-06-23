const fs = require('fs');
let js = fs.readFileSync('js/yard-stock.js', 'utf8');

// Replace the table row innerHTML for renderYardTable and renderStorageTable
const regexRow = /tr\.innerHTML = `[\s\S]*?`;/g;

// Total should be EntryFee + AccumStorage + LiftsCost + ExitFee (which is equal to EntryFee if exited).
// Actually, let's redefine totalCost to include parsed.lifts * parsed.liftCost.
const oldTotalCostCalc = "const totalCost = parsed.entryFee + accumStorage + exitFee;";
const newTotalCostCalc = "const totalCost = parsed.entryFee + accumStorage + exitFee + (parsed.lifts * parsed.liftCost);";

js = js.replace(new RegExp(oldTotalCostCalc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newTotalCostCalc);

const newRowTemplate = `tr.innerHTML = \`
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 800; color: \${isExited ? '#64748b' : '#1e40af'};">\${containerNoDisplay}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">\${item.size || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">\${window.formatDateMMDDYYYY(item.created_at)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">\${parsed.exitDate ? window.formatDateMMDDYYYY(parsed.exitDate + 'T12:00:00') : '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">\${item.origin_release || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.85rem; color: #1e293b; font-weight: 600;">\${parsed.orderOut || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">\${parsed.lifts}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">\${days}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">$\${accumStorage.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">$\${(parsed.lifts * parsed.liftCost).toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 900; color: #10b981;">$\${totalCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700;">\${item.customer_name || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-weight: 700; text-align: center;">\${window.formatUSPhone ? window.formatUSPhone(item.customer_phone || '') : (item.customer_phone || '---')}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569;">\${item.type || 'DRY'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <span class="inv-badge \${item.condition === 'NEW' ? 'inv-badge-green' : 'inv-badge-blue'}">\${item.condition || 'USED'}</span>
                </td>
                <td style="padding: 12px 15px; border: 1px solid #475569; font-size: 0.75rem; color: #475569; max-width: 250px;">\${parsed.cleanNote || '---'}</td>
                <td style="padding: 12px 15px; border: 1px solid #475569; text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button onclick="sendYardInvoice('\${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="Send Invoice" style="background: #e0e7ff; color: #4f46e5; border: 1px solid #c7d2fe; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-envelope"></i>
                        </button>
                        <button onclick="editYardItem('\${item.id}'); event.stopPropagation();" class="btn-manage-inline" title="Edit" style="background: #f1f5f9; color: #1e40af; border: 1px solid #cbd5e1; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteYardItem('\${item.id}'); event.stopPropagation();" class="btn-manage-inline btn-delete-yard" title="Delete" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; padding: 6px; border-radius: 4px;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            \`;`;

let matchCount = (js.match(regexRow) || []).length;
console.log('Matches found for tr.innerHTML:', matchCount);
js = js.replace(regexRow, newRowTemplate);

fs.writeFileSync('js/yard-stock.js', js);
console.log('Done');
