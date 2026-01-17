# Deploy Backend to Railway (Free & Easy)

Quick guide to deploy your Node.js backend to Railway so it works with GitHub Pages frontend.

## 🚀 Why Railway?

- ✅ **Free tier available** (with limits)
- ✅ **Easy deployment** from GitHub
- ✅ **Automatic HTTPS** (SSL certificate)
- ✅ **Environment variables** support
- ✅ **No credit card required** for free tier

## 📋 Prerequisites

1. GitHub account (you already have this)
2. Railway account (free to create)
3. Your Instamojo API keys (you already have these)

## 🎯 Step-by-Step Deployment

### Step 1: Create Railway Account

1. Go to [Railway](https://railway.app/)
2. Click **"Start a New Project"**
3. Sign up with GitHub (easiest option)
4. Authorize Railway to access your GitHub

### Step 2: Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Select your `Tlangau` repository
4. Railway will detect it's a Node.js project

### Step 3: Configure Project

1. Railway will auto-detect `tlangau-web` folder
2. If not, click **"Settings"** → **"Root Directory"** → Set to `tlangau-web`
3. Railway will automatically:
   - Detect `package.json`
   - Install dependencies
   - Start the server

### Step 4: Set Environment Variables

1. Go to your project → **"Variables"** tab
2. Click **"New Variable"**
3. Add these variables one by one:

```env
PORT=3001
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
INSTAMOJO_API_KEY=your_instamojo_api_key
INSTAMOJO_AUTH_TOKEN=your_instamojo_auth_token
INSTAMOJO_ENV=test
FRONTEND_URL=https://ruatfly.github.io/Tlangau
BACKEND_URL=https://your-project-name.railway.app
```

**Important:** Replace:
- `your_email@gmail.com` with your Gmail
- `your_gmail_app_password` with Gmail app password
- `your_instamojo_api_key` with your Instamojo API key
- `your_instamojo_auth_token` with your Instamojo auth token
- `your-project-name.railway.app` with your actual Railway URL (you'll get this after deployment)

### Step 5: Get Your Backend URL

1. After deployment, Railway will give you a URL like:
   ```
   https://your-project-name.up.railway.app
   ```
2. Copy this URL - this is your `BACKEND_URL`

### Step 6: Update Environment Variables

1. Go back to **"Variables"** in Railway
2. Update `BACKEND_URL` to your actual Railway URL:
   ```
   BACKEND_URL=https://your-project-name.up.railway.app
   ```
3. Railway will automatically restart with new variables

### Step 7: Update Frontend Config

1. In your `tlangau-web` folder, edit `config.js`
2. Replace the backend URL:
   ```javascript
   window.BACKEND_URL = 'https://your-project-name.up.railway.app';
   ```
3. Commit and push to GitHub:
   ```bash
   git add tlangau-web/config.js
   git commit -m "Update backend URL for Railway deployment"
   git push
   ```

### Step 8: Configure Instamojo Webhook

1. Go to [Instamojo Dashboard](https://www.instamojo.com/)
2. Navigate to **Settings** → **API & Plugins** → **Webhooks**
3. Click **"Add Webhook"**
4. Enter webhook URL:
   ```
   https://your-project-name.up.railway.app/api/payment-webhook
   ```
5. Select events:
   - ✅ Payment Completed
   - ✅ Payment Failed
6. Click **"Save"**

### Step 9: Test Your Deployment

1. Visit your GitHub Pages site: `https://ruatfly.github.io/Tlangau/payment.html`
2. Enter email and try to create payment
3. Check Railway logs:
   - Go to Railway dashboard → Your project → **"Deployments"** → Click latest deployment → **"View Logs"**
4. You should see:
   ```
   🚀 Tlangau Server Access Portal API running on port 3001
   💳 Payment gateway: Configured (Instamojo)
   ```

## ✅ Verification Checklist

- [ ] Railway project created and deployed
- [ ] Environment variables set in Railway
- [ ] Backend URL obtained from Railway
- [ ] `config.js` updated with Railway URL
- [ ] Changes pushed to GitHub
- [ ] Instamojo webhook configured
- [ ] Payment page loads without errors
- [ ] Can create payment link successfully

## 🔧 Troubleshooting

### Issue: "Backend URL not configured"

**Solution:**
- Check `config.js` has the correct Railway URL
- Make sure you pushed changes to GitHub
- Clear browser cache and reload

### Issue: "Failed to create payment link"

**Solution:**
- Check Railway logs for errors
- Verify Instamojo API keys in Railway environment variables
- Check if Railway deployment is running (green status)

### Issue: "CORS error"

**Solution:**
- Railway should handle CORS automatically
- If not, check `server.js` has `app.use(cors())`

### Issue: Webhook not working

**Solution:**
- Verify webhook URL in Instamojo dashboard
- Check Railway logs for incoming webhook requests
- Test webhook URL manually: `curl https://your-backend-url.railway.app/api/payment-webhook`

## 📊 Railway Free Tier Limits

- **500 hours/month** of usage (usually enough)
- **$5 credit** per month
- **Automatic sleep** after inactivity (wakes up on request)

## 💰 Upgrade (Optional)

If you need more resources:
- **Hobby Plan**: $5/month
- **Pro Plan**: $20/month

Free tier is usually sufficient for small projects!

## 🎉 You're Done!

Your backend is now live on Railway and your frontend on GitHub Pages can communicate with it!

**Next Steps:**
1. Test payment flow end-to-end
2. Complete Instamojo KYC for production
3. Switch to production Instamojo keys
4. Monitor Railway logs for any issues

---

**Need Help?** Check Railway docs: https://docs.railway.app/
