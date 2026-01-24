# Brevo (Sendinblue) Setup Guide

This guide will help you set up a **free** Brevo account to send transactional emails (like access codes) from your backend. Brevo allows 300 free emails per day, which is perfect for your needs.

## Step 1: Create a Brevo Account
1. Go to [https://www.brevo.com/](https://www.brevo.com/)
2. Click **"Sign Up Free"**.
3. Fill in your details (or sign up with Google).
4. Complete the simple setup wizard (you can skip most business profile questions).
5. **Important**: You might need to verify your phone number.

## Step 2: Get your SMTP Key
1. Once logged in, click your **profile name** in the top-right corner.
2. Select **"SMTP & API"** from the menu.
3. Click on the **"SMTP"** tab (not API Keys).
4. Click **"Generate a new SMTP key"**.
5. Name your key (e.g., `Tlangau Server`).
6. Click **"Generate"**.
7. **COPY THE PASSWORD IMMEDIATELY**. It will only be shown once.
   - This long string of characters is your `EMAIL_PASS`.

## Step 3: Configure your Environment
You need to update your environment variables for the backend.

### If running locally (update `.env`):
```env
# Change these values:
EMAIL_SERVICE=brevo
EMAIL_USER=your_login_email@gmail.com  <-- The email you used to login to Brevo
EMAIL_PASS=xsmtpsib-12345...           <-- The long SMTP Key you just copied
```

### If deploying to Render (Environment Variables):
Add these Environment Variables in your Render Dashboard:
- `EMAIL_SERVICE`: `brevo`
- `EMAIL_USER`: (Your Brevo login email)
- `EMAIL_PASS`: (Your generated SMTP Key)

## Verified Sender (Optional but Recommended)
To prevent your emails from going to Spam:
1. Go to **Senders & IP** in Brevo settings.
2. Add the email address you want to appear as the "Sender" (e.g., `admin@tlangau.com` or your personal Gmail).
3. Verify it by clicking the link sent to that email.
