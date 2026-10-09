(function () {
    const PDFJS_VER = '3.11.174';
    let pdfBytes = null;
    let viewerTripId = null;
    let viewerUrl = null;
    let viewerName = '';
    let placeMode = false;
    let rendering = false;

    function ensurePdfJs() {
        if (!window.pdfjsLib) throw new Error('PDF viewer library is not loaded.');
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.worker.min.js';
        }
    }

    function canSignPdf() {
        const role = (window.currentUserRole || '').toLowerCase().trim();
        return role !== 'student';
    }

    function robertBlocked() {
        const userEmail = (window.userEmail || '').toLowerCase();
        if (userEmail !== 'cortes410@aol.com') return false;
        const trip = (window.currentTrips || []).find(t => t && t[0] === viewerTripId) || window.currentDocTrip;
        const tripDriver = ((trip && trip[17]) || '').toUpperCase();
        return tripDriver !== 'ROBERT CORTEZ';
    }

    window.openOrderPdfViewer = async function (opts) {
        const url = opts && opts.url;
        const tripId = opts && opts.tripId;
        const name = (opts && opts.name) || 'Order PDF';
        if (!url) {
            alert('This order has no PDF attached.');
            return;
        }
        ensurePdfJs();

        viewerTripId = tripId || (window.currentDocTrip && window.currentDocTrip[0]) || window.editingTripDbId;
        viewerUrl = url;
        viewerName = name;
        placeMode = false;
        window._pdfSignPlacement = null;

        const modal = document.getElementById('order-pdf-viewer-modal');
        const title = document.getElementById('order-pdf-viewer-title');
        const hint = document.getElementById('order-pdf-viewer-hint');
        const pages = document.getElementById('order-pdf-viewer-pages');
        if (!modal || !pages) return;
        if (title) title.textContent = name;
        if (hint) hint.textContent = 'Tap Sign, then tap the exact line on the PDF.';
        pages.innerHTML = '<p style="color:#fff;padding:24px;text-align:center;">Loading PDF...</p>';
        modal.style.display = 'flex';
        setPlaceMode(false);

        try {
            const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
            if (!res.ok) throw new Error('Could not download PDF');
            pdfBytes = await res.arrayBuffer();
            await renderPdfPages();
        } catch (err) {
            console.error('PDF viewer failed:', err);
            pages.innerHTML = '<p style="color:#fecaca;padding:24px;text-align:center;">Could not open PDF: ' +
                (err.message || err) + '</p>';
        }
    };

    window.closeOrderPdfViewer = function () {
        const modal = document.getElementById('order-pdf-viewer-modal');
        if (modal) modal.style.display = 'none';
        placeMode = false;
        window._pdfSignPlacement = null;
        pdfBytes = null;
        const pages = document.getElementById('order-pdf-viewer-pages');
        if (pages) pages.innerHTML = '';
    };

    window.togglePdfSignPlaceMode = function () {
        if (!canSignPdf()) {
            alert('You cannot sign PDFs.');
            return;
        }
        if (robertBlocked()) {
            alert('Restricted: You can only sign trips assigned to ROBERT CORTEZ.');
            return;
        }
        setPlaceMode(!placeMode);
    };

    function setPlaceMode(on) {
        placeMode = !!on;
        const btn = document.getElementById('btn-pdf-viewer-sign');
        const hint = document.getElementById('order-pdf-viewer-hint');
        const pages = document.getElementById('order-pdf-viewer-pages');
        if (btn) {
            btn.classList.toggle('is-active', placeMode);
            btn.innerHTML = placeMode
                ? '<i class="fas fa-hand-pointer"></i> TAP THE LINE'
                : '<i class="fas fa-file-signature"></i> SIGN';
        }
        if (hint) {
            hint.textContent = placeMode
                ? 'Tap the signature line on the document.'
                : 'Tap Sign, then tap the exact line on the PDF.';
        }
        if (pages) pages.classList.toggle('pdf-place-mode', placeMode);
    }

    async function renderPdfPages() {
        if (!pdfBytes || rendering) return;
        rendering = true;
        const pagesEl = document.getElementById('order-pdf-viewer-pages');
        if (!pagesEl) {
            rendering = false;
            return;
        }
        pagesEl.innerHTML = '';
        const loading = window.pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
        const pdf = await loading.promise;
        const wrapW = Math.max(280, pagesEl.clientWidth || 700);

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(2.2, wrapW / base.width);
            const viewport = page.getViewport({ scale: scale });
            const canvas = document.createElement('canvas');
            canvas.className = 'order-pdf-page-canvas';
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.dataset.pageIndex = String(i - 1);
            canvas.dataset.pdfWidth = String(base.width);
            canvas.dataset.pdfHeight = String(base.height);
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            canvas.addEventListener('click', onPdfPageClick);
            const holder = document.createElement('div');
            holder.className = 'order-pdf-page-wrap';
            holder.appendChild(canvas);
            pagesEl.appendChild(holder);
        }
        rendering = false;
    }

    function onPdfPageClick(ev) {
        if (!placeMode) return;
        const canvas = ev.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        const pdfW = parseFloat(canvas.dataset.pdfWidth);
        const pdfH = parseFloat(canvas.dataset.pdfHeight);
        const pdfX = (x / rect.width) * pdfW;
        const pdfY = pdfH - ((y / rect.height) * pdfH);
        window._pdfSignPlacement = {
            pageIndex: parseInt(canvas.dataset.pageIndex, 10) || 0,
            pdfX: pdfX,
            pdfY: pdfY,
            tripId: viewerTripId,
            name: viewerName
        };
        openPadForPdfSign();
    }

    function openPadForPdfSign() {
        const modal = document.getElementById('signature-modal');
        const title = document.getElementById('signature-modal-title');
        if (!modal) return;
        if (title) title.innerHTML = '<i class="fas fa-file-signature"></i> Sign on PDF';
        if (typeof window.openSignatureModal === 'function' && window.currentDocTrip) {
            window.openSignatureModal('customer');
            if (title) title.innerHTML = '<i class="fas fa-file-signature"></i> Sign on PDF';
            return;
        }
        const pad = document.getElementById('signature-pad');
        if (pad && typeof window.openSignatureModal === 'function') {
            const row = (window.currentTrips || []).find(t => t && t[0] === viewerTripId);
            if (row) window.currentDocTrip = row;
            window.openSignatureModal('customer');
            if (title) title.innerHTML = '<i class="fas fa-file-signature"></i> Sign on PDF';
            return;
        }
        modal.style.display = 'flex';
    }

    window.finishOrderPdfSignature = async function (sigCanvas) {
        const placement = window._pdfSignPlacement;
        if (!placement || !pdfBytes) return false;
        if (!window.PDFLib) {
            alert('PDF signing library is not loaded.');
            return true;
        }

        const dataUrl = sigCanvas.toDataURL('image/png');
        const saveBtn = document.querySelector('#signature-modal .btn-add-sidebar');
        const oldLabel = saveBtn ? saveBtn.textContent : '';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        window._pdfSigningNow = true;
        try {
            const pngBytes = dataUrlToUint8(dataUrl);
            const doc = await window.PDFLib.PDFDocument.load(pdfBytes);
            const page = doc.getPage(placement.pageIndex);
            const png = await doc.embedPng(pngBytes);
            const pageW = page.getWidth();
            const targetW = Math.min(pageW * 0.32, 170);
            const scale = targetW / png.width;
            const w = png.width * scale;
            const h = png.height * scale;
            let x = placement.pdfX - (w / 2);
            let y = placement.pdfY;
            x = Math.max(8, Math.min(x, pageW - w - 8));
            y = Math.max(8, Math.min(y, page.getHeight() - h - 8));
            page.drawImage(png, { x: x, y: y, width: w, height: h });
            const signed = await doc.save();
            const signedCopy = signed instanceof Uint8Array ? signed : new Uint8Array(signed);
            const blob = new Blob([signedCopy], { type: 'application/pdf' });
            const fileName = (placement.name || viewerName || 'order.pdf').replace(/\.pdf$/i, '') + '_signed.pdf';
            const file = new File([blob], fileName, { type: 'application/pdf' });
            const tripId = placement.tripId || viewerTripId;
            const saved = await window.uploadOrderPdfFile(tripId, file);
            viewerUrl = saved.url;
            viewerName = saved.name;
            pdfBytes = signedCopy.buffer.slice(signedCopy.byteOffset, signedCopy.byteOffset + signedCopy.byteLength);
            window._pdfSignPlacement = null;
            if (window.closeSignatureModal) window.closeSignatureModal();
            setPlaceMode(false);
            await renderPdfPages();
            if (window.showToast) window.showToast('Signature saved on PDF', 'success');
        } catch (err) {
            console.error('Stamp PDF failed:', err);
            alert('Could not save signature on PDF: ' + (err.message || err));
        } finally {
            window._pdfSigningNow = false;
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = oldLabel || 'Save Signature';
            }
        }
        return true;
    };

    function dataUrlToUint8(dataUrl) {
        const b64 = dataUrl.split(',')[1];
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
    }

    document.addEventListener('DOMContentLoaded', function () {
        const origClose = window.closeSignatureModal;
        window.closeSignatureModal = function () {
            if (!window._pdfSigningNow) window._pdfSignPlacement = null;
            if (origClose) origClose();
        };
    });
})();
