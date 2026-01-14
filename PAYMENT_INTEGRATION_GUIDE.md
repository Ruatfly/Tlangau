# Payment Gateway Integration Guide

This guide explains how to integrate a payment gateway into your Tlangau web portal.

## Current Status

✅ **UI is Ready:** Payment form is designed and functional  
⏳ **Payment Gateway:** Pending integration  
📝 **Backend API:** Ready at `/api/create-payment` endpoint

## Payment Gateway Options

### 1. Razorpay (Recommended for India)
- **Pros:** Easy integration, UPI support, good documentation
- **Cons:** KYC required for live mode
- **Website:** [razorpay.com](https://razorpay.com)
- **Docs:** [razorpay.com/docs](https://razorpay.com/docs)

### 2. Cashfree
- **Pros:** Good for Indian market, multiple payment methods
- **Cons:** KYC required
- **Website:** [cashfree.com](https://www.cashfree.com)
- **Docs:** [docs.cashfree.com](https://docs.cashfree.com)

### 3. Stripe
- **Pros:** International, excellent documentation
- **Cons:** Higher fees for Indian cards
- **Website:** [stripe.com](https://stripe.com)
- **Docs:** [stripe.com/docs](https://stripe.com/docs)

### 4. PayU
- **Pros:** Popular in India, easy setup
- **Cons:** KYC required
- **Website:** [payu.in](https://payu.in)
- **Docs:** [devguide.payu.in](https://devguide.payu.in)

## Integration Steps (Generic)

### Step 1: Choose Payment Gateway

Based on your needs:
- **India only:** Razorpay or Cashfree
- **International:** Stripe
- **Quick setup:** Razorpay

### Step 2: Create Account

1. Sign up on payment gateway website
2. Complete KYC (if required)
3. Get API keys:
   - **Test/Development keys** (for testing)
   - **Live/Production keys** (for real payments)

### Step 3: Add Payment Gateway SDK

Add to `index.html` or `payment.html`:

```html
<!-- Example: Razorpay -->
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>

<!-- Example: Stripe -->
<script src="https://js.stripe.com/v3/"></script>
```

### Step 4: Update `script.js`

Replace the payment form handler with actual gateway integration:

```javascript
// Example: Razorpay Integration
paymentForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    
    // Call your backend API to create payment
    const response = await fetch('https://your-backend-api.com/api/create-payment', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email })
    });
    
    const data = await response.json();
    
    // Initialize payment gateway
    const options = {
        key: 'YOUR_RAZORPAY_KEY',
        amount: 100, // ₹1 in paise
        currency: 'INR',
        name: 'Tlangau',
        description: 'Server Access Code',
        order_id: data.orderId,
        handler: function(response) {
            // Payment successful
            // Redirect to success page
            window.location.href = 'success.html?payment_id=' + response.razorpay_payment_id;
        },
        prefill: {
            email: email
        },
        theme: {
            color: '#667eea'
        }
    };
    
    const razorpay = new Razorpay(options);
    razorpay.open();
});
```

### Step 5: Handle Payment Success

Update `success.html` to:
1. Verify payment with backend
2. Show access code (if backend sends it)
3. Or redirect to email confirmation

### Step 6: Backend Integration

Your backend (`server.js`) should:
1. Create payment order with gateway
2. Return order details to frontend
3. Handle webhook for payment confirmation
4. Generate and email access code on success

## Example: Razorpay Integration

### Frontend (`script.js`):

```javascript
// Add Razorpay script to payment.html first:
// <script src="https://checkout.razorpay.com/v1/checkout.js"></script>

const paymentForm = document.getElementById('paymentForm');

paymentForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const amount = 100; // ₹1 in paise
    
    try {
        // Create order on your backend
        const response = await fetch('YOUR_BACKEND_URL/api/create-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, amount })
        });
        
        const order = await response.json();
        
        // Initialize Razorpay
        const options = {
            key: 'YOUR_RAZORPAY_KEY_ID', // From Razorpay dashboard
            amount: amount,
            currency: 'INR',
            name: 'Tlangau',
            description: 'Server Access Code',
            order_id: order.id, // From your backend
            handler: function(response) {
                // Payment successful
                // Verify payment with backend
                verifyPayment(response, email);
            },
            prefill: {
                email: email
            },
            theme: {
                color: '#667eea'
            },
            modal: {
                ondismiss: function() {
                    console.log('Payment cancelled');
                }
            }
        };
        
        const razorpay = new Razorpay(options);
        razorpay.open();
        
    } catch (error) {
        console.error('Payment error:', error);
        alert('Payment failed. Please try again.');
    }
});

async function verifyPayment(paymentResponse, email) {
    try {
        const response = await fetch('YOUR_BACKEND_URL/api/verify-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_signature: paymentResponse.razorpay_signature,
                email: email
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Redirect to success page
            window.location.href = 'success.html';
        } else {
            alert('Payment verification failed');
        }
    } catch (error) {
        console.error('Verification error:', error);
        alert('Payment verification failed');
    }
}
```

### Backend (`server.js`):

```javascript
// Add Razorpay SDK
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET_KEY
});

// Create payment order
app.post('/api/create-payment', async (req, res) => {
    try {
        const { email, amount } = req.body;
        
        const options = {
            amount: amount, // in paise
            currency: 'INR',
            receipt: `order_${Date.now()}`,
            notes: {
                email: email
            }
        };
        
        const order = await razorpay.orders.create(options);
        
        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (error) {
        console.error('Razorpay error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verify payment webhook
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, email } = req.body;
        
        // Verify signature
        const crypto = require('crypto');
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_SECRET_KEY)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');
        
        if (generated_signature === razorpay_signature) {
            // Payment verified - generate access code
            const accessCode = generateAccessCode();
            await db.createAccessCode({
                code: accessCode,
                email: email,
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                used: false,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            });
            
            await sendAccessCodeEmail(email, accessCode);
            
            res.json({ success: true, message: 'Payment verified' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid signature' });
        }
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
```

## Testing

### Test Mode:
1. Use test API keys
2. Use test cards provided by gateway
3. Test payment flow end-to-end
4. Verify access code generation

### Live Mode:
1. Complete KYC
2. Get live API keys
3. Test with small amount first
4. Monitor transactions

## Security Best Practices

1. **Never expose secret keys** in frontend code
2. **Always verify payments** on backend
3. **Use HTTPS** for all requests
4. **Validate signatures** from payment gateway
5. **Store API keys** in environment variables
6. **Log all transactions** for audit

## Troubleshooting

### Payment Not Processing:
- Check API keys are correct
- Verify backend is accessible
- Check browser console for errors
- Verify CORS settings on backend

### Payment Succeeds But No Code:
- Check backend webhook/verification
- Verify email service is working
- Check database for access code
- Review server logs

## Next Steps

1. ✅ Choose payment gateway
2. ✅ Create account and get API keys
3. ✅ Integrate SDK in frontend
4. ✅ Update backend API
5. ✅ Test in test mode
6. ✅ Complete KYC
7. ✅ Go live!

---

**Need Help?** Check payment gateway documentation or contact their support!


