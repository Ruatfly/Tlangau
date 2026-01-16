// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Payment form handling
const paymentForm = document.getElementById('paymentForm');
if (paymentForm) {
    paymentForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
        
        // Validate email
        if (!email || !isValidEmail(email)) {
            alert('Please enter a valid email address');
            return;
        }
        
        // Disable submit button
        const submitButton = paymentForm.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span>Processing...</span>';
        
        try {
            // Get backend URL (use environment variable or default)
            const backendUrl = window.BACKEND_URL || 'http://localhost:3001';
            
            // Create payment order
            const response = await fetch(`${backendUrl}/api/create-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    amount: 100, // ₹1 in paise
                }),
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to create payment order');
            }
            
            console.log('Payment order created:', data);
            
            // Redirect to Cashfree payment page
            // Cashfree will handle the payment and redirect back to success.html
            if (data.paymentUrl) {
                // Use the payment URL provided by backend
                window.location.href = data.paymentUrl;
            } else if (data.paymentSessionId) {
                // Fallback: construct payment URL from session ID
                const cashfreeBase = window.CASHFREE_ENV === 'production' 
                    ? 'https://payments.cashfree.com' 
                    : 'https://sandbox.cashfree.com';
                window.location.href = `${cashfreeBase}/pg/checkout/${data.paymentSessionId}`;
            } else {
                // Fallback: redirect to success page (for testing)
                window.location.href = `success.html?order_id=${data.orderId}`;
            }
            
        } catch (error) {
            console.error('Payment error:', error);
            alert('Payment failed: ' + error.message + '\n\nPlease try again or contact support.');
            submitButton.disabled = false;
            submitButton.innerHTML = originalText;
        }
    });
}

// Email validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Add animation on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', function() {
    const animatedElements = document.querySelectorAll('.feature-card, .step, .faq-item');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});


