# Domain Setup Guide - Namecheap

This guide will help you purchase and configure a domain name from Namecheap for your Tlangau web portal.

## Step 1: Purchase Domain from Namecheap

### 1.1 Create Namecheap Account

1. Go to [Namecheap](https://www.namecheap.com)
2. Click **Sign Up** (top right)
3. Fill in your details and create account
4. Verify your email address

### 1.2 Search for Domain

1. In the search bar, type your desired domain:
   - Example: `tlangau.com`
   - Or: `tlangau.in`, `tlangau.net`, etc.
2. Click **Search**
3. Check availability and prices

### 1.3 Purchase Domain

1. Select your preferred domain extension (.com recommended)
2. Click **Add to Cart**
3. Review your cart
4. Choose registration period (1 year minimum)
5. **Enable Privacy Protection** (free with Namecheap)
6. Click **Confirm Order**
7. Complete payment

---

## Step 2: Configure DNS Records

After purchasing, you need to point your domain to your hosting provider.

### Option A: GitHub Pages

1. **Get GitHub Pages IP Addresses:**
   - GitHub Pages uses these IPs: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`

2. **In Namecheap Dashboard:**
   - Go to **Domain List**
   - Click **Manage** next to your domain
   - Go to **Advanced DNS** tab

3. **Add A Records:**
   - Click **Add New Record**
   - Type: **A Record**
   - Host: `@`
   - Value: `185.199.108.153`
   - TTL: Automatic
   - Click **Save**
   - Repeat for all 4 IPs (add 4 A records)

4. **Add CNAME Record (for www):**
   - Type: **CNAME Record**
   - Host: `www`
   - Value: `YOUR_USERNAME.github.io`
   - TTL: Automatic
   - Click **Save**

5. **In GitHub Repository:**
   - Go to Settings → Pages
   - Add your custom domain: `tlangau.com`
   - Check "Enforce HTTPS" (after DNS propagates)

### Option B: Netlify

1. **In Netlify Dashboard:**
   - Go to Site settings → Domain management
   - Add custom domain: `tlangau.com`
   - Netlify will show you DNS records needed

2. **In Namecheap:**
   - Go to Advanced DNS
   - Add A Record:
     - Host: `@`
     - Value: `75.2.60.5` (Netlify's IP - check Netlify for current IP)
   - Add CNAME:
     - Host: `www`
     - Value: `your-site.netlify.app`

### Option C: Vercel

1. **In Vercel Dashboard:**
   - Go to Project → Settings → Domains
   - Add domain: `tlangau.com`
   - Vercel will show DNS configuration

2. **In Namecheap:**
   - Add the DNS records shown in Vercel dashboard
   - Usually includes A records and CNAME records

### Option D: Traditional Web Hosting

1. **Get Nameservers from Your Host:**
   - Usually something like: `ns1.yourhost.com`, `ns2.yourhost.com`

2. **In Namecheap:**
   - Go to Domain List → Manage
   - Go to **Nameservers** section
   - Select **Custom DNS**
   - Enter nameservers provided by your host
   - Click **Save**

---

## Step 3: Wait for DNS Propagation

DNS changes can take **24-48 hours** to propagate worldwide.

**Check DNS Propagation:**
- Use [whatsmydns.net](https://www.whatsmydns.net)
- Enter your domain
- Check if DNS records are updated globally

**Quick Test:**
```bash
# In terminal/command prompt
ping your-domain.com
# Should show your hosting provider's IP
```

---

## Step 4: Enable SSL/HTTPS

### GitHub Pages:
- Automatic after adding custom domain
- Enable "Enforce HTTPS" in Pages settings

### Netlify:
- Automatic SSL certificate (Let's Encrypt)
- Enabled by default

### Vercel:
- Automatic SSL certificate
- Enabled by default

### Traditional Hosting:
- Contact your hosting provider
- Many offer free SSL (Let's Encrypt)
- Or purchase SSL certificate

---

## Step 5: Update Website Files

After domain is live, update these files:

### 1. Update `sitemap.xml`:
```xml
<loc>https://tlangau.com/</loc>
```
Replace `tlangau.com` with your actual domain.

### 2. Update `index.html` meta tags:
```html
<meta property="og:url" content="https://tlangau.com/">
```
Replace with your domain.

### 3. Update `robots.txt`:
```
Sitemap: https://tlangau.com/sitemap.xml
```
Replace with your domain.

---

## Step 6: Verify Everything Works

1. **Visit your domain:** `https://your-domain.com`
2. **Check HTTPS:** Should show padlock icon
3. **Test all pages:** Home, Payment, etc.
4. **Check mobile:** Test on phone
5. **SEO Check:** View page source, verify meta tags

---

## Common Issues & Solutions

### Issue: Domain Not Resolving

**Solution:**
- Wait 24-48 hours for DNS propagation
- Clear browser cache
- Try different DNS server (8.8.8.8 - Google DNS)
- Check DNS records are correct in Namecheap

### Issue: SSL Certificate Not Working

**Solution:**
- Wait for SSL to provision (can take a few hours)
- Ensure DNS is fully propagated first
- Check hosting provider's SSL status

### Issue: www vs non-www Redirect

**Solution:**
- Set up redirect in hosting platform
- Or add both www and non-www in DNS
- Choose one as primary (recommend non-www)

### Issue: Subdomain Not Working

**Solution:**
- Add CNAME record for subdomain
- Example: `blog` → `your-site.netlify.app`

---

## Namecheap Support

If you need help:
- **Live Chat:** Available 24/7 on Namecheap website
- **Knowledge Base:** [namecheap.com/support](https://www.namecheap.com/support)
- **Community:** [community.namecheap.com](https://community.namecheap.com)

---

## Additional Tips

1. **Enable Privacy Protection:** Free with Namecheap, hides your personal info from WHOIS
2. **Auto-Renewal:** Enable to avoid losing domain
3. **Domain Lock:** Keep enabled for security
4. **Two-Factor Authentication:** Enable for account security

---

## Cost Estimate

- **Domain (.com):** ~$10-15/year
- **Privacy Protection:** Free with Namecheap
- **Hosting:** Free (GitHub Pages/Netlify/Vercel)
- **SSL Certificate:** Free (automatic on most platforms)

**Total:** ~$10-15/year for domain only!

---

## Next Steps

After domain is set up:
1. ✅ Test website functionality
2. ✅ Set up Google Search Console
3. ✅ Submit sitemap to Google
4. ✅ Set up Google Analytics (optional)
5. ✅ Integrate payment gateway
6. ✅ Test payment flow

---

**Need Help?** Check Namecheap's documentation or contact their support team!


