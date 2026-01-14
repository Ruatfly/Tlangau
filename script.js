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
    paymentForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
        
        // Validate email
        if (!email || !isValidEmail(email)) {
            alert('Please enter a valid email address');
            return;
        }
        
        // TODO: Integrate with payment gateway
        // For now, show success message
        console.log('Payment initiated:', {
            email: email,
            paymentMethod: paymentMethod,
            amount: 1.00
        });
        
        // Redirect to success page (this will be replaced with actual payment gateway integration)
        // window.location.href = 'success.html';
        
        // For now, show alert
        alert('Payment gateway integration pending. This is a UI preview.\n\nEmail: ' + email + '\nPayment Method: ' + paymentMethod);
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


