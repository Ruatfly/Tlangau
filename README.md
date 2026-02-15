# Tlangau Web - Server Access Code Purchase Portal

A modern, SEO-optimized website for purchasing Tlangau server access codes.

## Features

- 🎨 Modern, responsive UI design
- 📱 Mobile-friendly layout
- 🔍 SEO optimized with meta tags, sitemap, and robots.txt
- 💳 Payment-ready interface (payment gateway integration pending)
- ⚡ Fast loading and optimized
- 🎯 Clear call-to-actions and user flow

## Project Structure

```
tlangau-web/
├── index.html          # Landing page with features
├── payment.html        # Payment page
├── success.html        # Success page
├── styles.css          # Main stylesheet
├── script.js           # JavaScript functionality
├── robots.txt          # SEO robots file
├── sitemap.xml         # SEO sitemap
└── README.md           # This file
```

## Getting Started

1. Clone this repository
2. Open `index.html` in a web browser
3. For local development, use a local server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js (if you have http-server installed)
   npx http-server
   ```

## Deployment

This website can be deployed to:
- GitHub Pages (free)
- Netlify (free)
- Vercel (free)
- Any static hosting service

See `DEPLOYMENT_GUIDE.md` for detailed instructions.

## Domain Setup

See `DOMAIN_SETUP_GUIDE.md` for Namecheap domain configuration.

## Payment Gateway Integration

The payment form is ready for integration. You'll need to:
1. Choose a payment gateway (Razorpay, Cashfree, Stripe, etc.)
2. Add payment gateway JavaScript SDK
3. Update `script.js` to handle payment processing
4. Connect to your backend API for access code generation

## License

Copyright © 2025 Tlangau. All rights reserved.


