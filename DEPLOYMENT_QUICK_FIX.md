# Quick Fix: Deploy Backend & Update Config

## 🚨 The Problem

You're getting a 400 error because:
1. GitHub Pages only serves static files (HTML/CSS/JS)
2. Your backend (Node.js server) needs to run separately
3. The frontend is trying to call `localhost:3001` which doesn't exist on GitHub Pages

## ✅ The Solution

Deploy your backend to Railway (free) and update the config file.

## 🚀 Quick Steps (5 minutes)

### Step 1: Deploy Backend to Railway

1. Go to [Railway.app](https://railway.app/)
2. Sign up with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select your `Tlangau` repository
5. Set **Root Directory** to `tlangau-web` (in Settings)
6. Railway will auto-deploy your backend

### Step 2: Get Your Backend URL

After deployment, Railway gives you a URL like:
```
https://your-project-name.up.railway.app
```

Copy this URL!

### Step 3: Set Environment Variables in Railway

1. Go to Railway project → **"Variables"** tab
2. Add these variables:

```env
PORT=3001
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
INSTAMOJO_API_KEY=your_instamojo_api_key
INSTAMOJO_AUTH_TOKEN=your_instamojo_auth_token
INSTAMOJO_ENV=test
FRONTEND_URL=https://ruatfly.github.io/Tlangau
BACKEND_URL=https://your-project-name.up.railway.app
```

**Replace:**
- `your_email@gmail.com` → Your Gmail
- `your_gmail_app_password` → Gmail app password (get from Google Account → Security → App Passwords)
- `your_instamojo_api_key` → Your Instamojo API key
- `your_instamojo_auth_token` → Your Instamojo auth token
- `your-project-name.up.railway.app` → Your actual Railway URL

### Step 4: Update config.js

1. In your `tlangau-web` folder, edit `config.js`
2. Replace this line:
   ```javascript
   window.BACKEND_URL = 'https://your-backend-url.railway.app';
   ```
   With your actual Railway URL:
   ```javascript
   window.BACKEND_URL = 'https://your-project-name.up.railway.app';
   ```

### Step 5: Push to GitHub

```bash
git add tlangau-web/config.js
git commit -m "Update backend URL for Railway"
git push
```

GitHub Pages will automatically update in 1-2 minutes!

### Step 6: Test

1. Visit: `https://ruatfly.github.io/Tlangau/payment.html`
2. Enter email and try payment
3. Should work now! ✅

## 📋 Checklist

- [ ] Backend deployed to Railway
- [ ] Got Railway URL
- [ ] Environment variables set in Railway
- [ ] `config.js` updated with Railway URL
- [ ] Changes pushed to GitHub
- [ ] Tested payment page

## 🔧 If Still Not Working

1. **Check Railway logs:**
   - Railway dashboard → Your project → Deployments → View Logs
   - Look for errors

2. **Check browser console:**
   - Open DevTools (F12)
   - Check for CORS errors or other issues

3. **Verify config.js:**
   - Make sure Railway URL is correct
   - No typos in the URL

4. **Test backend directly:**
   - Visit: `https://your-railway-url/api/health`
   - Should return: `{"status":"ok",...}`

## 📚 Full Guide

For detailed instructions, see: `RAILWAY_DEPLOYMENT.md`

---

**That's it!** Your backend will be live on Railway and your frontend on GitHub Pages will work together! 🎉
