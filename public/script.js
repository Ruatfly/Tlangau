// ==================== SMOOTH SCROLLING ====================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ==================== SERVICE SELECTION ====================

const SERVICE_PRICE = 10; // ₹10 per service
const SERVICE_NAMES = {
    ring: 'Ring Notification',
    message: 'Message Notification',
    broadcast: 'Broadcast Message',
};

function getSelectedServices() {
    const checkboxes = document.querySelectorAll('input[name="services"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function updateOrderSummary() {
    const selected = getSelectedServices();
    const total = selected.length * SERVICE_PRICE;

    // Update service count
    const serviceCountEl = document.getElementById('serviceCount');
    if (serviceCountEl) {
        serviceCountEl.textContent = selected.length === 0
            ? '0 selected'
            : `${selected.length} service${selected.length > 1 ? 's' : ''}`;
    }

    // Update line items
    const lineItemsEl = document.getElementById('serviceLineItems');
    if (lineItemsEl) {
        if (selected.length === 0) {
            lineItemsEl.innerHTML = '';
        } else {
            lineItemsEl.innerHTML = selected.map(s => `
                <div class="summary-item summary-line-item">
                    <span>• ${SERVICE_NAMES[s] || s}</span>
                    <span>₹${SERVICE_PRICE}.00</span>
                </div>
            `).join('');
        }
    }

    // Update total
    const totalEl = document.getElementById('totalAmount');
    if (totalEl) totalEl.textContent = `₹${total}.00`;

    // Update button
    const paymentBtn = document.getElementById('paymentBtn');
    const btnText = document.getElementById('paymentBtnText');
    const btnAmount = document.getElementById('paymentBtnAmount');

    if (paymentBtn) {
        paymentBtn.disabled = selected.length === 0;
    }
    if (btnText) {
        btnText.textContent = selected.length === 0
            ? 'Select services to continue'
            : 'Proceed to Payment';
    }
    if (btnAmount) {
        btnAmount.textContent = `₹${total}`;
    }

    // Hide error
    const errorEl = document.getElementById('serviceError');
    if (errorEl && selected.length > 0) {
        errorEl.style.display = 'none';
    }

    // Update select all button text
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (selectAllBtn) {
        const allServices = document.querySelectorAll('input[name="services"]');
        selectAllBtn.textContent = selected.length === allServices.length
            ? 'Deselect All'
            : `Select All (₹${allServices.length * SERVICE_PRICE})`;
    }
}

function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('input[name="services"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);

    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });

    updateOrderSummary();
}

// Initialize service selection listeners
document.addEventListener('DOMContentLoaded', function () {
    const checkboxes = document.querySelectorAll('input[name="services"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateOrderSummary);
    });

    // Initial state
    updateOrderSummary();
});

// ==================== PAYMENT FORM ====================
const paymentForm = document.getElementById('paymentForm');
if (paymentForm) {
    paymentForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        hideError();

        const email = document.getElementById('email').value.trim();
        const services = getSelectedServices();

        if (services.length === 0) {
            const errorEl = document.getElementById('serviceError');
            if (errorEl) errorEl.style.display = 'block';
            return;
        }

        if (!email || !isValidEmail(email)) {
            showError('Please enter a valid email address.');
            return;
        }

        const submitButton = paymentForm.querySelector('button[type="submit"]');
        const originalHTML = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span>Creating Payment Link...</span>';

        try {
            const backendUrl = window.BACKEND_URL || 'http://localhost:3001';
            if (!backendUrl || backendUrl.includes('your-backend-url')) {
                showError('Backend URL not configured. Please contact support.');
                submitButton.disabled = false;
                submitButton.innerHTML = originalHTML;
                return;
            }

            const response = await fetch(`${backendUrl}/api/create-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, services }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                let errorMessage = errorData.message || errorData.error || `Server error: ${response.status}`;
                if (errorData.errors && errorData.errors.length > 0) {
                    errorMessage = errorData.errors[0].msg || errorMessage;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to create payment link');
            }

            if (!data.paymentUrl) {
                throw new Error('Payment URL not received from server');
            }

            console.log('Payment link created:', data.orderId, 'Services:', data.services);

            // Redirect directly to Instamojo payment page
            window.location.href = data.paymentUrl;

        } catch (error) {
            console.error('Payment error:', error);
            showError(error.message || 'Something went wrong. Please try again.');
            submitButton.disabled = false;
            submitButton.innerHTML = originalHTML;
        }
    });
}

// ==================== HELPERS ====================

function showError(message) {
    let errorDiv = document.getElementById('paymentError');
    if (!errorDiv && paymentForm) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'paymentError';
        errorDiv.className = 'error-message';
        paymentForm.insertBefore(errorDiv, paymentForm.firstChild);
    }
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 8000);
    }
}

function hideError() {
    const errorDiv = document.getElementById('paymentError');
    if (errorDiv) errorDiv.style.display = 'none';
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ==================== SCROLL ANIMATIONS ====================

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
};

const observer = new IntersectionObserver(function (entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.addEventListener('DOMContentLoaded', function () {
    const animatedElements = document.querySelectorAll('.feature-card, .step, .faq-item');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});
