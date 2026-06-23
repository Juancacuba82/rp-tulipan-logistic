const fs = require('fs');

let yardJs = fs.readFileSync('js/yard-stock.js', 'utf8');

yardJs = yardJs.replace(/parsed\.exitDate/g, 'item.exit_date');
yardJs = yardJs.replace(/parsed\.entryFee/g, '(item.entry_fee || 0)');
yardJs = yardJs.replace(/parsed\.dailyRate/g, '(item.daily_rate || 0)');
yardJs = yardJs.replace(/parsed\.orderOut/g, 'item.order_out');
yardJs = yardJs.replace(/parsed\.lifts/g, '(item.lifts || 1)');
yardJs = yardJs.replace(/parsed\.liftCost/g, '(item.lift_cost || 50)');
yardJs = yardJs.replace(/parsed\.cleanNote/g, "(item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : '')");

fs.writeFileSync('js/yard-stock.js', yardJs);
console.log('yard-stock.js fixed');

let profitJs = fs.readFileSync('js/profit-expenses.js', 'utf8');
profitJs = profitJs.replace(/parsed\.exitDate/g, 'item.exit_date');
profitJs = profitJs.replace(/parsed\.entryFee/g, '(item.entry_fee || 0)');
profitJs = profitJs.replace(/parsed\.dailyRate/g, '(item.daily_rate || 0)');
profitJs = profitJs.replace(/parsed\.orderOut/g, 'item.order_out');
profitJs = profitJs.replace(/parsed\.lifts/g, '(item.lifts || 1)');
profitJs = profitJs.replace(/parsed\.liftCost/g, '(item.lift_cost || 50)');
profitJs = profitJs.replace(/parsed\.cleanNote/g, "(item.notes ? item.notes.replace(/^YARD_ITEM/, '').replace(/^STORAGE_ITEM/, '').trim() : '')");

fs.writeFileSync('js/profit-expenses.js', profitJs);
console.log('profit-expenses.js fixed');
