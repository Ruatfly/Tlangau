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
    // Handle payment method selection
    const paymentMethodInputs = document.querySelectorAll('input[name="paymentMethod"]');
    const upiIdGroup = document.getElementById('upiIdGroup');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    
    paymentMethodInputs.forEach(input => {
        input.addEventListener('change', function() {
            if (this.value === 'upi-id') {
                upiIdGroup.style.display = 'block';
                document.getElementById('upiId').required = true;
            } else {
                upiIdGroup.style.display = 'none';
                document.getElementById('upiId').required = false;
                document.getElementById('upiId').value = '';
            }
        });
    });

    // UPI ID validation
    const upiIdInput = document.getElementById('upiId');
    const upiIdValidation = document.getElementById('upiIdValidation');
    
    if (upiIdInput) {
        upiIdInput.addEventListener('input', function() {
            const upiId = this.value.trim();
            if (upiId && upiIdGroup.style.display !== 'none') {
                if (isValidUPIId(upiId)) {
                    upiIdValidation.style.display = 'block';
                    upiIdValidation.className = 'validation-message success';
                    upiIdValidation.textContent = '✓ Valid UPI ID';
                } else {
                    upiIdValidation.style.display = 'block';
                    upiIdValidation.className = 'validation-message error';
                    upiIdValidation.textContent = '✗ Invalid UPI ID format (e.g., yourname@paytm)';
                }
            } else {
                upiIdValidation.style.display = 'none';
            }
        });
    }

    paymentForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
        const upiId = document.getElementById('upiId').value.trim();
        
        // Validate email
        if (!email || !isValidEmail(email)) {
            showError('Please enter a valid email address');
            return;
        }

        // Validate UPI ID if UPI ID method is selected
        if (paymentMethod === 'upi-id') {
            if (!upiId) {
                showError('Please enter your UPI ID');
                return;
            }
            if (!isValidUPIId(upiId)) {
                showError('Please enter a valid UPI ID (e.g., yourname@paytm, yourname@phonepe)');
                return;
            }
        }
        
        // Hide QR code container if shown from previous attempt
        qrCodeContainer.style.display = 'none';
        
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
            
            // Build request body - only include upiId if it's provided
            const requestBody = {
                email: email,
                amount: 10, // ₹10
            };
            
            // Only add upiId if UPI ID method is selected and value is provided
            if (paymentMethod === 'upi-id' && upiId && upiId.trim()) {
                requestBody.upiId = upiId.trim();
            }
            
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
            
            // Show QR code and payment options
            if (data.qrCode) {
                document.getElementById('qrCodeImage').src = data.qrCode;
                document.getElementById('paymentLink').href = data.paymentUrl;
                qrCodeContainer.style.display = 'block';
                
                // Scroll to QR code
                qrCodeContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                
                // Update submit button
                submitButton.disabled = false;
                submitButton.innerHTML = '<span>Payment Link Created ✓</span>';
                submitButton.style.background = 'var(--success-color)';
                
                // Store order ID for verification
                window.currentOrderId = data.orderId;
                
                // Start polling for payment status
                startPaymentStatusPolling(data.orderId, backendUrl);
            } else {
                // Fallback: redirect to payment URL
                window.location.href = data.paymentUrl;
            }
            
        } catch (error) {
            console.error('Payment error:', error);
            showError('Payment failed: ' + error.message + '\n\nPlease try again or contact support.');
            submitButton.disabled = false;
            submitButton.innerHTML = originalText;
        }
    });
}

// UPI ID validation
function isValidUPIId(upiId) {
    // UPI ID format: username@provider
    // Common providers: paytm, phonepe, ybl, okaxis, payu, amazonpay, etc.
    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    return upiRegex.test(upiId);
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

// Poll payment status
function startPaymentStatusPolling(orderId, backendUrl) {
    const maxAttempts = 60; // Poll for 5 minutes (60 * 5 seconds)
    let attempts = 0;
    
    const pollInterval = setInterval(async () => {
        attempts++;
        
        if (attempts > maxAttempts) {
            clearInterval(pollInterval);
            return;
        }
        
        try {
            const response = await fetch(`${backendUrl}/api/verify-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ orderId }),
            });
            
            const data = await response.json();
            
            if (data.success && data.paymentStatus === 'SUCCESS') {
                clearInterval(pollInterval);
                // Redirect to success page
                window.location.href = `success.html?order_id=${orderId}`;
            }
        } catch (error) {
            console.error('Error polling payment status:', error);
        }
    }, 5000); // Poll every 5 seconds
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


