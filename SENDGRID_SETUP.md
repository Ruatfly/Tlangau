# SendGrid Email Setup Guide

## Problem
Railway (and many cloud platforms) block SMTP connections, causing email sending to fail with connection timeouts.

## Solution: Use SendGrid API
SendGrid uses HTTP API instead of SMTP, which works reliably in server environments.

## Setup Steps

### 1. Create SendGrid Account
1. Go to https://sendgrid.com/
2. Sign up for a free account (100 emails/day free)
3. Verify your email address

### 2. Create API Key
1. Go to SendGrid Dashboard → Settings → API Keys
2. Click "Create API Key"
3. Name it: "Tlangau Email Service"
4. Select "Full Access" or "Restricted Access" with "Mail Send" permission
5. Click "Create & View"
6. **Copy the API key immediately** (you won't see it again!)

### 3. Verify Sender Email (Required)
1. Go to SendGrid Dashboard → Settings → Sender Authentication
2. Click "Verify a Single Sender"
3. Fill in your details:
   - **From Email**: Your email (e.g., `noreply@yourdomain.com` or your Gmail)
   - **From Name**: Tlangau
   - **Reply To**: Your email
   - Fill in other required fields
4. Click "Create"
5. **Check your email** and click the verification link

### 4. Add Environment Variables to Railway
In your Railway project, add these environment variables:

```
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=SG.your_api_key_here
SENDGRID_FROM_EMAIL=your-verified-email@example.com
```

**Important:**
- `EMAIL_SERVICE=sendgrid` - Tells the server to use SendGrid
- `SENDGRID_API_KEY` - Your SendGrid API key (starts with `SG.`)
- `SENDGRID_FROM_EMAIL` - The email you verified in SendGrid (optional, will use EMAIL_USER if not set)

### 5. Redeploy
After adding the environment variables, Railway will automatically redeploy.

## Verification

After deployment, check the logs. You should see:
```
📧 Using SendGrid for email delivery
✅ SendGrid email service configured (no verification needed)
```

## Testing

Make a test payment and check logs for:
```
📧 Attempting to send access code email to: user@example.com (Attempt 1/3)
✅ Access code email sent successfully to user@example.com via SendGrid
   Status Code: 202
```

## Free Tier Limits
- **100 emails/day** (free tier)
- Perfect for your use case (₹10 payments)

## Alternative: Keep Gmail (Not Recommended)
If you want to keep using Gmail, you'll need to:
1. Use a different hosting platform that allows SMTP
2. Or use a VPN/proxy (complex and unreliable)

**Recommendation: Use SendGrid** - It's free, reliable, and designed for server environments.

## Troubleshooting

### "Invalid API Key"
- Check that `SENDGRID_API_KEY` is set correctly
- Make sure it starts with `SG.`
- Regenerate the key if needed

### "Sender email not verified"
- Verify your sender email in SendGrid dashboard
- Check your email for verification link
- Make sure `SENDGRID_FROM_EMAIL` matches the verified email

### "Email not received"
- Check spam folder
- Verify the email address is correct
- Check SendGrid dashboard → Activity for delivery status
