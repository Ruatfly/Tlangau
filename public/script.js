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

const SERVICE_PRICE = 10; // ₹10 per service (monthly plan)
const YEARLY_FLAT_PRICE = 100; // Rs 100 flat
const SERVICE_NAMES = {
    ring: 'Ring Notification',
    message: 'Message Notification',
    broadcast: 'Broadcast Message',
};

const PLAN_META = {
    monthly: { validityLabel: '30 Days' },
    yearly: { validityLabel: '365 Days' },
};

function getSelectedServices() {
    const checkboxes = document.querySelectorAll('input[name="services"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function getSelectedPlanDuration() {
    const select = document.getElementById('planDuration');
    const value = (select?.value || 'monthly').trim();
    return value === 'yearly' ? 'yearly' : 'monthly';
}

function computeTotalAmount(selectedServices, planDuration) {
    if (planDuration === 'yearly') return YEARLY_FLAT_PRICE;
    return selectedServices.length * SERVICE_PRICE;
}

function updateOrderSummary() {
    const selected = getSelectedServices();
    const planDuration = getSelectedPlanDuration();
    const total = computeTotalAmount(selected, planDuration);

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
            const linePrice = planDuration === 'yearly'
                ? `Included in yearly plan`
                : `₹${SERVICE_PRICE}.00`;
            lineItemsEl.innerHTML = selected.map(s => `
                <div class="summary-item summary-line-item">
                    <span>• ${SERVICE_NAMES[s] || s}</span>
                    <span>${linePrice}</span>
                </div>
            `).join('');
        }
    }

    const summaryValidity = document.getElementById('summaryValidity');
    if (summaryValidity) {
        summaryValidity.textContent = PLAN_META[planDuration].validityLabel;
    }
    const validityInfoLine = document.getElementById('validityInfoLine');
    if (validityInfoLine) {
        validityInfoLine.textContent = planDuration === 'yearly'
            ? 'Valid for 365 days from purchase'
            : 'Valid for 30 days from purchase';
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
            : (planDuration === 'yearly'
                ? 'Select All (included in yearly)'
                : `Select All (₹${allServices.length * SERVICE_PRICE})`);
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
    const planSelect = document.getElementById('planDuration');
    if (planSelect) {
        planSelect.addEventListener('change', updateOrderSummary);
    }

    // Initial state
    updateOrderSummary();
});

// ==================== PAYMENT FORM ====================
const paymentForm = document.getElementById('paymentForm');
const PAYMENT_STORAGE_KEY = 'tlangau_last_payment';

function buildSuccessUrl(orderId) {
    return `success.html?order_id=${encodeURIComponent(orderId)}`;
}

function saveLastPaymentSession(session) {
    try {
        sessionStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(session));
    } catch (_) {
        // Non-fatal: continue even if storage is unavailable.
    }
}

function showCheckoutExperience(data, context) {
    const checkoutWrap = document.getElementById('checkoutExperience');
    const metaText = document.getElementById('checkoutMetaText');
    const hintText = document.getElementById('checkoutHintText');
    const openUpiBtn = document.getElementById('openUpiCheckoutBtn');
    const openWebBtn = document.getElementById('openCheckoutWebBtn');
    const verifyBtn = document.getElementById('verifyPaymentNowBtn');
    const qrImg = document.getElementById('checkoutQrImage');

    if (!checkoutWrap || !openUpiBtn || !openWebBtn || !verifyBtn || !qrImg) {
        throw new Error('Checkout UI is not available.');
    }

    const successUrl = buildSuccessUrl(data.orderId);
    const amountLabel = Number(data.amount || 0).toFixed(2);
    if (metaText) {
        metaText.textContent = `Order ${data.orderId} • Amount ₹${amountLabel} • Plan: ${(data.planDuration || 'monthly')}`;
    }
    if (hintText) {
        hintText.textContent = 'Tip: If auto-return does not happen from your UPI app, open this page again and tap "I\'ve Paid - Verify Now".';
    }

    openUpiBtn.onclick = (e) => {
        e.preventDefault();
        window.location.href = data.paymentUrl;
    };

    openWebBtn.href = data.paymentUrl;
    verifyBtn.href = successUrl;

    const qrPayload = encodeURIComponent(data.paymentUrl);
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${qrPayload}`;

    checkoutWrap.style.display = 'block';
    checkoutWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

    saveLastPaymentSession({
        orderId: data.orderId,
        email: context.email,
        services: context.services,
        planDuration: context.planDuration,
        paymentUrl: data.paymentUrl,
        amount: data.amount,
        createdAt: new Date().toISOString(),
    });
}

if (paymentForm) {
    paymentForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        hideError();

        const email = document.getElementById('email').value.trim();
        const services = getSelectedServices();
        const planDuration = getSelectedPlanDuration();

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
        submitButton.innerHTML = '<span>Creating Secure Checkout...</span>';

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
                body: JSON.stringify({ email, services, planDuration }),
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
            showCheckoutExperience(data, { email, services, planDuration });
            submitButton.disabled = false;
            submitButton.innerHTML = originalHTML;

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
