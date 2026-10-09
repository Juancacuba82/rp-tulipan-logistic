(function () {
    const URL_IDX = 78;
    const NAME_IDX = 79;
    const MAX_BYTES = 10 * 1024 * 1024;

    window.ORDER_PDF_URL_IDX = URL_IDX;
    window.ORDER_PDF_NAME_IDX = NAME_IDX;
    window.pendingOrderPdfFile = null;

    function isDriverRole() {
        return (window.currentUserRole || '').toLowerCase().trim() === 'driver';
    }

    function isStudentRole() {
        return (window.currentUserRole || '').toLowerCase().trim() === 'student';
    }

    function canManagePdf() {
        return !isDriverRole() && !isStudentRole();
    }

    function sanitizeName(name) {
        const base = (name || 'order.pdf').split(/[/\\]/).pop();
        const cleaned = base.replace(/[^\w.\- ]+/g, '_').trim() || 'order.pdf';
        return cleaned.slice(0, 120);
    }

    function currentPdfFromRow(row) {
        if (!row) return { url: '', name: '' };
        return {
            url: (row[URL_IDX] || '').toString(),
            name: (row[NAME_IDX] || '').toString()
        };
    }

    window.getOrderPdfFromRow = currentPdfFromRow;

    window.patchTripPdfLocal = function (tripId, url, name) {
        const pools = [
            window.currentTrips,
            window.allTripsUnfiltered,
            window.docsTripsCache,
            window.combinedBillingTrips
        ];
        pools.forEach(pool => {
            if (!pool) return;
            const t = pool.find(r => r && r[0] === tripId);
            if (t) {
                t[URL_IDX] = url || '';
                t[NAME_IDX] = name || '';
            }
        });
        if (window.currentDocTrip && window.currentDocTrip[0] === tripId) {
            window.currentDocTrip[URL_IDX] = url || '';
            window.currentDocTrip[NAME_IDX] = name || '';
        }
    };

    window.uploadOrderPdfToStorage = async function (tripId, file) {
        if (!window.db) throw new Error('Database not ready');
        if (!tripId) throw new Error('Save the order first, then attach the PDF.');
        if (!file) throw new Error('No file selected');
        if (file.type && file.type !== 'application/pdf' && file.type !== '') {
            throw new Error('Only PDF files are allowed.');
        }
        const lower = (file.name || '').toLowerCase();
        if (!lower.endsWith('.pdf')) throw new Error('Only PDF files are allowed.');
        if (file.size > MAX_BYTES) throw new Error('PDF is too large (max 10 MB).');

        const safe = sanitizeName(file.name);
        const filePath = `order-pdfs/${tripId}/${Date.now()}_${safe}`;
        const { error: uploadError } = await window.db.storage
            .from('receipts')
            .upload(filePath, file, { contentType: 'application/pdf', upsert: true });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = window.db.storage.from('receipts').getPublicUrl(filePath);
        return { url: publicUrl, name: safe };
    };

    window.uploadOrderPdfFile = async function (tripId, file) {
        const saved = await window.uploadOrderPdfToStorage(tripId, file);
        const { error: updateError } = await window.db.from('trips')
            .update({ order_pdf_url: saved.url, order_pdf_name: saved.name })
            .eq('trip_id', tripId);
        if (updateError) throw updateError;
        window.patchTripPdfLocal(tripId, saved.url, saved.name);
        return saved;
    };

    window.openOrderPdf = function (url) {
        if (!url) {
            alert('This order has no PDF attached.');
            return;
        }
        window.open(url, '_blank', 'noopener');
    };

    window.triggerOrderPdfPicker = function () {
        const input = document.getElementById('in-order-pdf');
        if (!input) return;
        input.click();
    };

    window.openCurrentDocOrderPdf = function () {
        const trip = window.currentDocTrip;
        const pdf = currentPdfFromRow(trip);
        window.openOrderPdf(pdf.url);
    };

    window.openCalendarOrderPdf = function () {
        const tripId = window.editingTripDbId || null;
        const row = (window.currentTrips || []).find(t => t && t[0] === tripId);
        const pdf = currentPdfFromRow(row);
        window.openOrderPdf(pdf.url);
    };

    window.renderCalendarOrderPdf = function () {
        const status = document.getElementById('order-pdf-status');
        const attachBtn = document.getElementById('btn-order-pdf-attach');
        const openBtn = document.getElementById('btn-order-pdf-open');
        const removeBtn = document.getElementById('btn-order-pdf-remove');
        if (!status) return;

        const tripId = window.editingTripDbId || null;
        const row = (window.currentTrips || []).find(t => t && t[0] === tripId);
        const pending = window.pendingOrderPdfFile;
        const pdf = currentPdfFromRow(row);
        const manage = canManagePdf();

        if (attachBtn) attachBtn.style.display = manage ? '' : 'none';
        if (removeBtn) removeBtn.style.display = (manage && (pdf.url || pending)) ? '' : 'none';

        if (pending) {
            status.textContent = 'Ready to upload: ' + pending.name;
            if (openBtn) openBtn.style.display = 'none';
            return;
        }
        if (pdf.url) {
            status.textContent = pdf.name || 'Order PDF';
            if (openBtn) openBtn.style.display = '';
            return;
        }
        status.textContent = 'No PDF attached';
        if (openBtn) openBtn.style.display = 'none';
    };

    window.handleOrderPdfPick = async function (input) {
        if (!input || !input.files || !input.files[0]) return;
        const file = input.files[0];
        input.value = '';
        if (!canManagePdf()) {
            alert('You cannot attach PDFs.');
            return;
        }
        const tripId = window.editingTripDbId;
        try {
            if (tripId) {
                if (statusElBusy()) setStatusBusy('Uploading PDF...');
                await window.uploadOrderPdfFile(tripId, file);
                window.pendingOrderPdfFile = null;
                if (window.showToast) window.showToast('PDF attached', 'success');
            } else {
                if (file.size > MAX_BYTES) throw new Error('PDF is too large (max 10 MB).');
                if (!((file.name || '').toLowerCase().endsWith('.pdf'))) throw new Error('Only PDF files are allowed.');
                window.pendingOrderPdfFile = file;
            }
            window.renderCalendarOrderPdf();
        } catch (err) {
            console.error('PDF attach failed:', err);
            alert('Could not attach PDF: ' + (err.message || err));
            window.renderCalendarOrderPdf();
        }
    };

    function statusElBusy() {
        return document.getElementById('order-pdf-status');
    }

    function setStatusBusy(text) {
        const el = statusElBusy();
        if (el) el.textContent = text;
    }

    window.removeOrderPdf = async function () {
        if (!canManagePdf()) return;
        if (!confirm('Remove the attached PDF from this order?')) return;
        window.pendingOrderPdfFile = null;
        const tripId = window.editingTripDbId;
        if (!tripId) {
            window.renderCalendarOrderPdf();
            return;
        }
        try {
            const { error } = await window.db.from('trips')
                .update({ order_pdf_url: null, order_pdf_name: null })
                .eq('trip_id', tripId);
            if (error) throw error;
            window.patchTripPdfLocal(tripId, '', '');
            window.renderCalendarOrderPdf();
            window.renderDocsOrderPdf();
            if (window.showToast) window.showToast('PDF removed', 'success');
        } catch (err) {
            alert('Could not remove PDF: ' + (err.message || err));
        }
    };

    window.renderDocsOrderPdf = function () {
        const openBtn = document.getElementById('btn-docs-order-pdf');
        if (!openBtn) return;
        const trip = window.currentDocTrip;
        const pdf = currentPdfFromRow(trip);
        const hasPdf = !!(pdf && pdf.url);
        openBtn.disabled = !hasPdf;
        openBtn.title = hasPdf ? ('Open PDF: ' + (pdf.name || 'Order PDF')) : '';
        openBtn.style.display = hasPdf ? 'inline-flex' : 'none';
    };

    window.savePendingOrderPdfIfNeeded = async function (tripId) {
        const file = window.pendingOrderPdfFile;
        if (!file || !tripId) return currentPdfFromRow((window.currentTrips || []).find(t => t && t[0] === tripId));
        const saved = await window.uploadOrderPdfToStorage(tripId, file);
        window.pendingOrderPdfFile = null;
        window.patchTripPdfLocal(tripId, saved.url, saved.name);
        return saved;
    };

    document.addEventListener('DOMContentLoaded', function () {
        if (window.renderCalendarOrderPdf) window.renderCalendarOrderPdf();
    });
})();
