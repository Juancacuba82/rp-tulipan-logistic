const fs = require('fs');
const file = 'c:/Users/Juanca/Desktop/RP tulipan logistic/js/billing-manager.js';
let content = fs.readFileSync(file, 'utf8');

const newCode = `
    window.updateMasterBillingCompany = function() {
        const select = document.getElementById('mb-billing-company-select');
        const companyId = select.value;

        const nameEl = document.getElementById('mb-company-name');
        const addrEl = document.getElementById('mb-company-address');
        const bName = document.getElementById('mb-bank-name');
        const bCompany = document.getElementById('mb-bank-company');
        const bAccount = document.getElementById('mb-bank-account');
        const bRouting = document.getElementById('mb-bank-routing');
        const bSwift = document.getElementById('mb-bank-swift');
        const bAddr = document.getElementById('mb-bank-addr');
        const bZelle = document.getElementById('mb-bank-zelle');

        if (companyId === 'LOGISTICS_SOLUTIONS') {
            nameEl.textContent = 'LOGISTICS SOLUTIONS CORP';
            addrEl.textContent = '9804 NW 80TH AVE, HIALEAH GARDENS FL 33016';
            bName.textContent = 'Chase Bank';
            bCompany.textContent = 'LOGISTICS SOLUTIONS CORP';
            bAccount.textContent = '123456789';
            bRouting.textContent = '021000021';
            bSwift.textContent = 'CHASUS33';
            bAddr.textContent = '270 Park Ave, New York, NY 10017';
            bZelle.textContent = 'LOGISTICS@GMAIL.COM';
        } else if (companyId === 'TULIPAN_TRUCKING') {
            nameEl.textContent = 'TULIPAN TRUCKING LLC';
            addrEl.textContent = '9804 NW 80TH AVE, HIALEAH GARDENS FL 33016';
            bName.textContent = 'Wells Fargo';
            bCompany.textContent = 'TULIPAN TRUCKING LLC';
            bAccount.textContent = '987654321';
            bRouting.textContent = '121000248';
            bSwift.textContent = 'WFBIUS6S';
            bAddr.textContent = '420 Montgomery St, San Francisco, CA 94104';
            bZelle.textContent = 'TRUCKING@GMAIL.COM';
        } else {
            // Default: RP_TULIPAN
            nameEl.textContent = 'RP TULIPAN TRANSPORT INC';
            addrEl.textContent = '9804 NW 80th Ave, Hialeah Gardens FL 33016';
            bName.textContent = 'Bank Of America';
            bCompany.textContent = 'RP TULIPAN TRANSPORT INC';
            bAccount.textContent = '898111245429';
            bRouting.textContent = '063100277';
            bSwift.textContent = 'BOFAUS3N';
            bAddr.textContent = '900 W 49 ST, Hialeah, FL 33012';
            bZelle.textContent = '786-768-4409';
        }
    };

    window.downloadFilteredInvoicePDF = async function() {
        const btn = event.currentTarget;
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GENERATING PDF...';

        try {
            const container = document.getElementById('mb-invoice-preview');
            // Hide buttons temporarily
            const actionsDiv = container.querySelector('div:last-child');
            actionsDiv.style.display = 'none';

            // Wait a tick for UI update
            await new Promise(r => setTimeout(r, 100));

            // Ensure html2canvas and jspdf are available
            if (typeof html2canvas === 'undefined' || !window.jspdf) {
                alert('Librerías para PDF no encontradas.');
                actionsDiv.style.display = 'flex';
                return;
            }

            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            actionsDiv.style.display = 'flex';

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ compress: true, orientation: 'p', unit: 'mm', format: 'a4' });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            
            const customer = document.getElementById('bc-f-customer')?.value || 'Customer';
            pdf.save(\`INVOICE_\${customer.replace(/[^a-z0-9]/gi, '_')}.pdf\`);
            
        } catch (e) {
            console.error('Error generating PDF:', e);
            alert('Error generando el PDF.');
            // Restore actions just in case
            const actionsDiv = document.getElementById('mb-invoice-preview').querySelector('div:last-child');
            if (actionsDiv) actionsDiv.style.display = 'flex';
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    };
`;

content = content.replace(/\}\)\(\);\s*$/, newCode + '\n})();\n');
fs.writeFileSync(file, content);
console.log("Appended updateMasterBillingCompany and downloadFilteredInvoicePDF");
