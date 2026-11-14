(function () {
    const SKIP_TYPES = {
        email: true,
        password: true,
        number: true,
        date: true,
        time: true,
        'datetime-local': true,
        month: true,
        week: true,
        color: true,
        range: true,
        file: true,
        checkbox: true,
        radio: true,
        hidden: true,
        button: true,
        submit: true,
        reset: true,
        search: false
    };

    const EMAIL_TOKEN = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
    const WHOLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function looksLikeEmailField(el) {
        if (!el) return false;
        if ((el.type || '').toLowerCase() === 'email') return true;
        const blob = ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.className || '') + ' ' + (el.autocomplete || '')).toLowerCase();
        if (blob.indexOf('email') !== -1 || blob.indexOf('e-mail') !== -1) return true;
        if ((el.getAttribute('inputmode') || '').toLowerCase() === 'email') return true;
        return false;
    }

    // Keep mixed case even if the login eye toggle switches type="password" to type="text".
    function looksLikePasswordField(el) {
        if (!el) return false;
        if ((el.type || '').toLowerCase() === 'password') return true;
        const id = (el.id || '').toLowerCase();
        const name = (el.name || '').toLowerCase();
        if (id.indexOf('password') !== -1 || name.indexOf('password') !== -1) return true;
        const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
        return ac === 'current-password' || ac === 'new-password';
    }

    // EmailJS keys/IDs are case-sensitive (service_xxx, template_xxx, public keys).
    function looksLikeEmailJsConfigField(el) {
        if (!el) return false;
        const id = (el.id || '').toLowerCase();
        const name = (el.name || '').toLowerCase();
        return id.indexOf('ejs-') === 0 || id.indexOf('ejs_') === 0
            || name.indexOf('ejs-') === 0 || name.indexOf('ejs_') === 0;
    }

    function shouldForce(el) {
        if (!el || el.disabled || el.readOnly) return false;
        if (looksLikeEmailJsConfigField(el)) return false;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA') return !looksLikeEmailField(el);
        if (tag === 'INPUT') {
            const type = (el.type || 'text').toLowerCase();
            if (SKIP_TYPES[type]) return false;
            if (looksLikeEmailField(el) || looksLikePasswordField(el)) return false;
            return true;
        }
        if (el.isContentEditable) return !looksLikeEmailField(el);
        return false;
    }

    function uppercasePreservingEmails(str) {
        if (!str) return str;
        const trimmed = str.trim();
        if (WHOLE_EMAIL.test(trimmed)) return str;
        EMAIL_TOKEN.lastIndex = 0;
        const emails = [];
        const masked = str.replace(EMAIL_TOKEN, function (m) {
            emails.push(m);
            return '\0E' + (emails.length - 1) + '\0';
        });
        const upper = masked.toUpperCase();
        return upper.replace(/\0E(\d+)\0/g, function (_, i) {
            return emails[Number(i)];
        });
    }

    function applyUpper(el) {
        if (!shouldForce(el)) return;
        if (el.isContentEditable) {
            const next = uppercasePreservingEmails(el.textContent || '');
            if ((el.textContent || '') !== next) el.textContent = next;
            return;
        }
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = uppercasePreservingEmails(el.value || '');
        if (el.value === next) return;
        el.value = next;
        try {
            if (typeof start === 'number' && typeof end === 'number') {
                el.setSelectionRange(start, end);
            }
        } catch (e) { /* some input types reject selection */ }
    }

    document.addEventListener('input', function (e) {
        applyUpper(e.target);
    }, true);

    document.addEventListener('paste', function (e) {
        const el = e.target;
        if (!shouldForce(el)) return;
        requestAnimationFrame(function () { applyUpper(el); });
    }, true);

    document.addEventListener('blur', function (e) {
        applyUpper(e.target);
    }, true);
})();
