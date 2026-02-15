# Deployment Guide - Tlangau Web

This guide will help you deploy your Tlangau web portal to various hosting platforms.

## Option 1: GitHub Pages (Recommended - Free)

### Step 1: Create GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the "+" icon in the top right → "New repository"
3. Name it: `tlangau-web` (or any name you prefer)
4. Make it **Public** (required for free GitHub Pages)
5. **Don't** initialize with README, .gitignore, or license
6. Click "Create repository"

### Step 2: Push Your Code

```bash
# Navigate to your project folder
cd E:\Projects\tlangau\tlangau-web

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Tlangau web portal"

# Add remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/tlangau-web.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** tab
3. Scroll down to **Pages** section (left sidebar)
4. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
5. Click **Save**
6. Wait 1-2 minutes, then visit: `https://YOUR_USERNAME.github.io/tlangau-web/`

### Step 4: Custom Domain (Optional)

After setting up your domain (see DOMAIN_SETUP_GUIDE.md):
1. In GitHub Pages settings, add your custom domain
2. GitHub will create a CNAME file automatically
3. Update DNS records as per domain guide

---

## Option 2: Netlify (Free & Easy)

### Step 1: Create Netlify Account

1. Go to [Netlify](https://www.netlify.com)
2. Sign up with GitHub (recommended) or email

### Step 2: Deploy

**Method A: Drag & Drop**
1. Zip your `tlangau-web` folder
2. Go to Netlify dashboard
3. Drag and drop the zip file
4. Your site will be live in seconds!

**Method B: Git Integration**
1. Connect your GitHub repository
2. Netlify will auto-deploy on every push
3. Get a free subdomain: `your-site.netlify.app`

### Step 3: Custom Domain

1. In Netlify dashboard → Domain settings
2. Add custom domain
3. Update DNS records as per domain guide

---

## Option 3: Vercel (Free & Fast)

### Step 1: Create Vercel Account

1. Go to [Vercel](https://vercel.com)
2. Sign up with GitHub

### Step 2: Deploy

1. Click "New Project"
2. Import your GitHub repository
3. Vercel auto-detects static site
4. Click "Deploy"
5. Get free subdomain: `your-site.vercel.app`

### Step 3: Custom Domain

1. In project settings → Domains
2. Add your custom domain
3. Update DNS records

---

## Option 4: Traditional Web Hosting

If you have a traditional web hosting account (cPanel, etc.):

1. **Upload Files via FTP:**
   - Use FileZilla or similar FTP client
   - Upload all files to `public_html` or `www` folder
   - Maintain folder structure

2. **Upload via cPanel File Manager:**
   - Log into cPanel
   - Open File Manager
   - Navigate to `public_html`
   - Upload all files

3. **Access Your Site:**
   - Visit: `http://your-domain.com`
   - Or: `http://your-domain.com/index.html`

---

## Post-Deployment Checklist

- [ ] Test all pages load correctly
- [ ] Check mobile responsiveness
- [ ] Verify SEO meta tags (view page source)
- [ ] Test payment form (UI only, gateway pending)
- [ ] Update `sitemap.xml` with your actual domain
- [ ] Update `robots.txt` if needed
- [ ] Set up custom domain (if applicable)
- [ ] Enable HTTPS/SSL (automatic on most platforms)

---

## Updating Your Site

### GitHub Pages:
```bash
# Make changes to files
git add .
git commit -m "Update website"
git push
# Site updates automatically in 1-2 minutes
```

### Netlify/Vercel:
- Auto-updates on git push (if connected)
- Or manually redeploy from dashboard

---

## Troubleshooting

**Issue: 404 Error**
- Check file paths are correct
- Ensure `index.html` is in root directory
- Clear browser cache

**Issue: Styles Not Loading**
- Check `styles.css` path in HTML
- Ensure file is uploaded
- Check browser console for errors

**Issue: Domain Not Working**
- Wait 24-48 hours for DNS propagation
- Check DNS records are correct
- Verify domain is added in hosting platform

---

## Need Help?

For issues or questions, check:
- Platform-specific documentation
- Browser console for errors
- Network tab for failed requests


