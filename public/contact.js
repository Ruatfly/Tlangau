(function () {
    const form = document.getElementById('contactForm');
    if (!form) return;

    const statusEl = document.getElementById('contactFormStatus');
    const backendUrl = window.BACKEND_URL || '';

    function setStatus(msg, isError) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.style.display = 'block';
        statusEl.className = isError ? 'error' : 'success';
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const name = document.getElementById('name')?.value?.trim() || '';
        const email = document.getElementById('email')?.value?.trim() || '';
        const subject = document.getElementById('subject')?.value?.trim() || '';
        const orderId = document.getElementById('orderId')?.value?.trim() || '';
        const message = document.getElementById('message')?.value?.trim() || '';

        if (!backendUrl) {
            form.submit();
            return;
        }

        if (btn) btn.disabled = true;
        setStatus('Sending…', false);

        try {
            const res = await fetch(`${backendUrl}/api/public/contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, subject, message, orderId }),
            });
            const data = await res.json();
            if (data.success) {
                setStatus(data.message || 'Message sent. Thank you!', false);
                form.reset();
            } else {
                setStatus(data.message || 'Could not send. Please email us directly.', true);
            }
        } catch (_) {
            setStatus('Network error. Please email chhakchhuakr59@gmail.com directly.', true);
        } finally {
            if (btn) btn.disabled = false;
        }
    });
})();
