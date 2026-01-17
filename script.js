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
        
        // Validate email
        if (!email || !isValidEmail(email)) {
            showError('Please enter a valid email address');
            return;
        }
        
        // Disable submit button
        const submitButton = paymentForm.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span>Creating Payment Link...</span>';
        
        try {
            // Get backend URL from config
            const backendUrl = window.BACKEND_URL || 'http://localhost:3001';
            
            if (!backendUrl || backendUrl.includes('your-backend-url')) {
                showError('Backend URL not configured. Please update config.js with your backend URL.');
                submitButton.disabled = false;
                submitButton.innerHTML = originalText;
                return;
            }
            
            // Build request body
            const requestBody = {
                email: email,
                amount: 10, // ₹10
            };
            
            // Create payment link
            const response = await fetch(`${backendUrl}/api/create-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Failed to parse error response' }));
                console.error('Backend error:', errorData);
                console.error('Error details:', JSON.stringify(errorData, null, 2));
                
                // Show detailed error message
                let errorMessage = errorData.message || errorData.error || `Server error: ${response.status}`;
                
                // If validation errors, show first error
                if (errorData.errors && errorData.errors.length > 0) {
                    errorMessage = errorData.errors[0].msg || errorData.errors[0].message || errorMessage;
                }
                
                throw new Error(errorMessage);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to create payment link');
            }
            
            console.log('Payment link created:', data);
            
            // Redirect directly to Instamojo payment page
            if (data.paymentUrl) {
                window.location.href = data.paymentUrl;
            } else {
                throw new Error('Payment URL not received from server');
            }
            
        } catch (error) {
            console.error('Payment error:', error);
            showError('Payment failed: ' + error.message + '\n\nPlease try again or contact support.');
            submitButton.disabled = false;
            submitButton.innerHTML = originalText;
        }
    });
}

// Show error message
function showError(message) {
    // Create or update error message element
    let errorDiv = document.getElementById('paymentError');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'paymentError';
        errorDiv.className = 'error-message';
        paymentForm.insertBefore(errorDiv, paymentForm.firstChild);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
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


