# Quick Start Guide - Tlangau Web

Get your Tlangau web portal up and running in minutes!

## 🚀 Quick Steps

### 1. Test Locally (2 minutes)

```bash
# Navigate to project folder
cd E:\Projects\tlangau\tlangau-web

# Open in browser (Windows)
start index.html

# Or use Python server
python -m http.server 8000
# Then visit: http://localhost:8000
```

### 2. Push to GitHub (5 minutes)

Follow `GITHUB_SETUP_GUIDE.md` for detailed steps, or:

```bash
# Initialize git
git init
git add .
git commit -m "Initial commit"

# Add remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/tlangau-web.git
git branch -M main
git push -u origin main
```

### 3. Enable GitHub Pages (1 minute)

1. Go to repository → Settings → Pages
2. Source: `main` branch, `/ (root)` folder
3. Save
4. Visit: `https://YOUR_USERNAME.github.io/tlangau-web/`

### 4. Get Domain (Optional - 10 minutes)

1. Buy domain from Namecheap
2. Follow `DOMAIN_SETUP_GUIDE.md`
3. Point DNS to GitHub Pages
4. Wait 24-48 hours for propagation

### 5. Update Domain in Files

After domain is live:
- Update `sitemap.xml` with your domain
- Update `index.html` meta tags with your domain
- Update `robots.txt` with your domain

## ✅ Checklist

- [ ] Test website locally
- [ ] Push to GitHub
- [ ] Enable GitHub Pages
- [ ] Test live website
- [ ] (Optional) Set up custom domain
- [ ] (Optional) Integrate payment gateway

## 📚 Detailed Guides

- **GitHub Setup:** See `GITHUB_SETUP_GUIDE.md`
- **Domain Setup:** See `DOMAIN_SETUP_GUIDE.md`
- **Deployment:** See `DEPLOYMENT_GUIDE.md`
- **Payment Integration:** See `PAYMENT_INTEGRATION_GUIDE.md`

## 🎯 Next Steps

1. Customize content (text, colors, images)
2. Integrate payment gateway
3. Connect to backend API
4. Test payment flow
5. Launch! 🎉

---

**Need Help?** Check the detailed guides or GitHub documentation!


