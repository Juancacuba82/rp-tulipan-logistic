(function () {
    const PDFJS_VER = '3.11.174';
    const SIGS_IDX = 80;
    let pdfBytes = null;
    let viewerTripId = null;
    let viewerUrl = null;
    let viewerName = '';
    let placeMode = false;
    let rendering = false;
    let dragState = null;

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

    function canEditPdfSignatures() {
        const role = (window.currentUserRole || '').toLowerCase().trim();
        return role === 'admin' || role === 'employee' || role === 'staff';
    }

    function robertBlocked() {
        const userEmail = (window.userEmail || '').toLowerCase();
        if (userEmail !== 'cortes410@aol.com') return false;
        const trip = findTripRow(viewerTripId) || window.currentDocTrip;
        const tripDriver = ((trip && trip[17]) || '').toUpperCase();
        return tripDriver !== 'ROBERT CORTEZ';
    }

    function findTripRow(tripId) {
        const pools = [window.currentTrips, window.allTripsUnfiltered, window.docsTripsCache, window.combinedBillingTrips];
        for (let i = 0; i < pools.length; i++) {
            const pool = pools[i];
            if (!pool) continue;
            const t = pool.find(r => r && r[0] === tripId);
            if (t) return t;
        }
        if (window.currentDocTrip && window.currentDocTrip[0] === tripId) return window.currentDocTrip;
        return null;
    }

    function getSignatures(tripId) {
        const row = findTripRow(tripId);
        const raw = row ? row[SIGS_IDX] : [];
        if (Array.isArray(raw)) return raw.slice();
        if (typeof raw === 'string') {
            try { return JSON.parse(raw) || []; } catch (e) { return []; }
        }
        return [];
    }

    async function persistSignatures(tripId, sigs) {
        const { error } = await window.db.from('trips')
            .update({ order_pdf_signatures: sigs })
            .eq('trip_id', tripId);
        if (error) throw error;
        if (window.patchTripPdfLocal) {
            const row = findTripRow(tripId);
            const url = row ? row[78] : viewerUrl;
            const name = row ? row[79] : viewerName;
            window.patchTripPdfLocal(tripId, url, name, sigs);
        }
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
        dragState = null;
        window._pdfSignPlacement = null;

        const modal = document.getElementById('order-pdf-viewer-modal');
        const title = document.getElementById('order-pdf-viewer-title');
        const pages = document.getElementById('order-pdf-viewer-pages');
        if (!modal || !pages) return;
        if (title) title.textContent = name;
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
        dragState = null;
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

    function defaultHint() {
        if (canEditPdfSignatures()) {
            return 'Drag a signature to move it. Use X to remove it.';
        }
        return 'Tap Sign, then tap the exact line on the PDF.';
    }

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
                : defaultHint();
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
        const sigs = getSignatures(viewerTripId);

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
            sigs.filter(s => s && s.pageIndex === (i - 1)).forEach(sig => {
                holder.appendChild(buildSigOverlay(sig, base.width, base.height));
            });
            pagesEl.appendChild(holder);
        }
        rendering = false;
        setPlaceMode(placeMode);
        updateDownloadBtn();
    }

    function updateDownloadBtn() {
        const btn = document.getElementById('btn-pdf-viewer-download');
        if (!btn) return;
        const sigs = getSignatures(viewerTripId);
        const hasSigs = sigs.length > 0;
        btn.disabled = !hasSigs;
        btn.style.display = 'inline-flex';
        btn.title = hasSigs
            ? 'Download PDF with signatures stamped for the customer'
            : 'Sign the PDF first, then download';
    }

    function dataUrlToUint8(dataUrl) {
        const b64 = (dataUrl || '').split(',')[1];
        if (!b64) throw new Error('Invalid signature image');
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
    }

    async function buildSignedPdfBytes() {
        if (!window.PDFLib) throw new Error('PDF library is not loaded.');
        if (!pdfBytes) throw new Error('PDF is not loaded.');
        const sigs = getSignatures(viewerTripId);
        const doc = await window.PDFLib.PDFDocument.load(pdfBytes.slice(0));
        for (let i = 0; i < sigs.length; i++) {
            const sig = sigs[i];
            if (!sig || !sig.dataUrl) continue;
            const pages = doc.getPages();
            const page = pages[sig.pageIndex];
            if (!page) continue;
            const png = await doc.embedPng(dataUrlToUint8(sig.dataUrl));
            const w = sig.w || Math.min(page.getWidth() * 0.32, 170);
            const h = sig.h || (w * 0.4);
            const x = (sig.pdfX || 0) - (w / 2);
            const y = sig.pdfY || 0;
            page.drawImage(png, { x: x, y: y, width: w, height: h });
        }
        return await doc.save();
    }

    window.downloadSignedOrderPdf = async function () {
        const sigs = getSignatures(viewerTripId);
        if (!sigs.length) {
            alert('Sign the PDF first, then download the signed copy.');
            return;
        }
        const btn = document.getElementById('btn-pdf-viewer-download');
        const old = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PREPARING...';
        }
        try {
            const bytes = await buildSignedPdfBytes();
            const copy = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            const blob = new Blob([copy], { type: 'application/pdf' });
            const base = (viewerName || 'order').replace(/\.pdf$/i, '');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = base + '_signed.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
            if (window.showToast) window.showToast('Signed PDF downloaded', 'success');
        } catch (err) {
            console.error('Download signed PDF failed:', err);
            alert('Could not download signed PDF: ' + (err.message || err));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = old || '<i class="fas fa-download"></i> DOWNLOAD SIGNED';
            }
            updateDownloadBtn();
        }
    };

    function buildSigOverlay(sig, pdfW, pdfH) {
        const wrap = document.createElement('div');
        wrap.className = 'order-pdf-sig-overlay';
        wrap.dataset.sigId = sig.id;
        const left = ((sig.pdfX - (sig.w / 2)) / pdfW) * 100;
        const top = ((pdfH - sig.pdfY - sig.h) / pdfH) * 100;
        const width = (sig.w / pdfW) * 100;
        const height = (sig.h / pdfH) * 100;
        wrap.style.left = left + '%';
        wrap.style.top = top + '%';
        wrap.style.width = width + '%';
        wrap.style.height = height + '%';
        const img = document.createElement('img');
        img.src = sig.dataUrl;
        img.alt = 'Signature';
        img.draggable = false;
        wrap.appendChild(img);
        if (canEditPdfSignatures()) {
            wrap.classList.add('is-draggable');
            const tools = document.createElement('div');
            tools.className = 'order-pdf-sig-tools';
            tools.innerHTML = '<button type="button" title="Remove" data-act="del"><i class="fas fa-times"></i></button>';
            tools.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
            tools.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const btn = e.target.closest('button');
                if (btn && btn.dataset.act === 'del') window.removeOrderPdfSignature(sig.id);
            });
            wrap.appendChild(tools);
            wrap.addEventListener('pointerdown', function (e) { startSigDrag(e, wrap, sig); });
        }
        wrap.addEventListener('click', function (e) { e.stopPropagation(); });
        return wrap;
    }

    function startSigDrag(e, wrap, sig) {
        if (!canEditPdfSignatures() || e.button === 2) return;
        if (e.target.closest('.order-pdf-sig-tools')) return;
        e.preventDefault();
        e.stopPropagation();
        const holder = wrap.parentElement;
        const hRect = holder.getBoundingClientRect();
        const oRect = wrap.getBoundingClientRect();
        dragState = {
            id: sig.id,
            wrap: wrap,
            holder: holder,
            startX: e.clientX,
            startY: e.clientY,
            origLeft: oRect.left - hRect.left,
            origTop: oRect.top - hRect.top,
            width: oRect.width,
            height: oRect.height,
            moved: false
        };
        wrap.classList.add('is-dragging');
        wrap.style.left = dragState.origLeft + 'px';
        wrap.style.top = dragState.origTop + 'px';
        wrap.style.width = dragState.width + 'px';
        wrap.style.height = dragState.height + 'px';
        try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
        wrap.addEventListener('pointermove', onSigDragMove);
        wrap.addEventListener('pointerup', onSigDragEnd);
        wrap.addEventListener('pointercancel', onSigDragEnd);
    }

    function onSigDragMove(e) {
        if (!dragState) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true;
        let holder = dragState.holder;
        dragState.wrap.style.pointerEvents = 'none';
        const under = document.elementFromPoint(e.clientX, e.clientY);
        dragState.wrap.style.pointerEvents = '';
        const other = under && under.closest ? under.closest('.order-pdf-page-wrap') : null;
        if (other && other !== holder) {
            other.appendChild(dragState.wrap);
            dragState.holder = other;
            holder = other;
            const hRect = holder.getBoundingClientRect();
            dragState.origLeft = e.clientX - hRect.left - dragState.width / 2;
            dragState.origTop = e.clientY - hRect.top - dragState.height / 2;
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
        }
        const hRect = holder.getBoundingClientRect();
        let left = dragState.origLeft + (e.clientX - dragState.startX);
        let top = dragState.origTop + (e.clientY - dragState.startY);
        left = Math.max(0, Math.min(left, hRect.width - dragState.width));
        top = Math.max(0, Math.min(top, hRect.height - dragState.height));
        dragState.wrap.style.left = left + 'px';
        dragState.wrap.style.top = top + 'px';
    }

    async function onSigDragEnd(e) {
        const state = dragState;
        const wrap = state && state.wrap;
        if (wrap) {
            wrap.removeEventListener('pointermove', onSigDragMove);
            wrap.removeEventListener('pointerup', onSigDragEnd);
            wrap.removeEventListener('pointercancel', onSigDragEnd);
            wrap.classList.remove('is-dragging');
            try { wrap.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        dragState = null;
        if (!state || !state.moved) return;
        const holder = state.holder;
        const canvas = holder.querySelector('canvas');
        if (!canvas) return;
        const hRect = holder.getBoundingClientRect();
        const oRect = wrap.getBoundingClientRect();
        const pdfW = parseFloat(canvas.dataset.pdfWidth);
        const pdfH = parseFloat(canvas.dataset.pdfHeight);
        const pageIndex = parseInt(canvas.dataset.pageIndex, 10) || 0;
        const leftPx = oRect.left - hRect.left;
        const topPx = oRect.top - hRect.top;
        const pdfX = ((leftPx + oRect.width / 2) / hRect.width) * pdfW;
        const pdfY = pdfH - (((topPx + oRect.height) / hRect.height) * pdfH);
        await relocateSignature(state.id, pageIndex, pdfX, pdfY, pdfW, pdfH);
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
        const pageIndex = parseInt(canvas.dataset.pageIndex, 10) || 0;

        window._pdfSignPlacement = {
            pageIndex: pageIndex,
            pdfX: pdfX,
            pdfY: pdfY,
            pdfW: pdfW,
            pdfH: pdfH,
            tripId: viewerTripId,
            name: viewerName
        };
        openPadForPdfSign();
    }

    async function relocateSignature(id, pageIndex, pdfX, pdfY, pdfW, pdfH) {
        const sigs = getSignatures(viewerTripId);
        const sig = sigs.find(s => s.id === id);
        if (!sig) return;
        let x = pdfX;
        let y = pdfY;
        x = Math.max(sig.w / 2, Math.min(x, pdfW - sig.w / 2));
        y = Math.max(0, Math.min(y, pdfH - sig.h));
        sig.pageIndex = pageIndex;
        sig.pdfX = x;
        sig.pdfY = y;
        try {
            await persistSignatures(viewerTripId, sigs);
            await renderPdfPages();
            if (window.showToast) window.showToast('Signature moved', 'success');
        } catch (err) {
            alert('Could not move signature: ' + (err.message || err) + '\nRun supabase-order-pdf.sql if the column is missing.');
        }
    }

    window.removeOrderPdfSignature = async function (id) {
        if (!canEditPdfSignatures()) return;
        if (!confirm('Remove this signature from the PDF? The original document is kept.')) return;
        const sigs = getSignatures(viewerTripId).filter(s => s.id !== id);
        try {
            await persistSignatures(viewerTripId, sigs);
            await renderPdfPages();
            if (window.showToast) window.showToast('Signature removed', 'success');
        } catch (err) {
            alert('Could not remove signature: ' + (err.message || err));
        }
    };

    function openPadForPdfSign() {
        const modal = document.getElementById('signature-modal');
        const title = document.getElementById('signature-modal-title');
        if (!modal) return;
        if (title) title.innerHTML = '<i class="fas fa-file-signature"></i> Sign on PDF';
        if (typeof window.openSignatureModal === 'function') {
            if (!window.currentDocTrip) {
                const row = findTripRow(viewerTripId);
                if (row) window.currentDocTrip = row;
            }
            if (window.currentDocTrip) {
                window.openSignatureModal('customer');
                if (title) title.innerHTML = '<i class="fas fa-file-signature"></i> Sign on PDF';
                return;
            }
        }
        modal.style.display = 'flex';
    }

    window.finishOrderPdfSignature = async function (sigCanvas) {
        const placement = window._pdfSignPlacement;
        if (!placement) return false;

        const dataUrl = sigCanvas.toDataURL('image/png');
        const saveBtn = document.querySelector('#signature-modal .btn-add-sidebar');
        const oldLabel = saveBtn ? saveBtn.textContent : '';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        window._pdfSigningNow = true;
        try {
            const pageW = placement.pdfW || 612;
            const pageH = placement.pdfH || 792;
            const imgW = sigCanvas.width || 450;
            const imgH = sigCanvas.height || 200;
            const w = Math.min(pageW * 0.32, 170);
            const h = w * (imgH / imgW);
            let pdfX = placement.pdfX;
            let pdfY = placement.pdfY;
            pdfX = Math.max(w / 2, Math.min(pdfX, pageW - w / 2));
            pdfY = Math.max(0, Math.min(pdfY, pageH - h));

            const sigs = getSignatures(placement.tripId || viewerTripId);
            sigs.push({
                id: 'sig_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                dataUrl: dataUrl,
                pageIndex: placement.pageIndex,
                pdfX: pdfX,
                pdfY: pdfY,
                w: w,
                h: h
            });
            await persistSignatures(placement.tripId || viewerTripId, sigs);
            window._pdfSignPlacement = null;
            if (window.closeSignatureModal) window.closeSignatureModal();
            setPlaceMode(false);
            await renderPdfPages();
            if (window.showToast) window.showToast('Signature saved on PDF', 'success');
        } catch (err) {
            console.error('Save PDF signature failed:', err);
            alert('Could not save signature: ' + (err.message || err) + '\nRun supabase-order-pdf.sql if the column is missing.');
        } finally {
            window._pdfSigningNow = false;
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = oldLabel || 'Save Signature';
            }
        }
        return true;
    };

    document.addEventListener('DOMContentLoaded', function () {
        const origClose = window.closeSignatureModal;
        window.closeSignatureModal = function () {
            if (!window._pdfSigningNow) window._pdfSignPlacement = null;
            if (origClose) origClose();
        };
    });
})();
