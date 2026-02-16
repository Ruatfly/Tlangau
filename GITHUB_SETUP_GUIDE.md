# GitHub Repository Setup Guide

This guide will help you set up a GitHub repository for your Tlangau web portal.

## Prerequisites

- Git installed on your computer
- GitHub account (create at [github.com](https://github.com))

## Step 1: Install Git (If Not Already Installed)

### Windows:
1. Download from [git-scm.com](https://git-scm.com/download/win)
2. Run installer with default settings
3. Open Git Bash or Command Prompt

### Verify Installation:
```bash
git --version
```

## Step 2: Configure Git

```bash
# Set your name (replace with your name)
git config --global user.name "Your Name"

# Set your email (use your GitHub email)
git config --global user.email "your.email@example.com"

# Verify settings
git config --list
```

## Step 3: Create GitHub Repository

1. **Go to GitHub:**
   - Visit [github.com](https://github.com) and sign in

2. **Create New Repository:**
   - Click the **"+"** icon (top right)
   - Select **"New repository"**

3. **Repository Settings:**
   - **Repository name:** `tlangau-web` (or your preferred name)
   - **Description:** "Tlangau Server Access Code Purchase Portal"
   - **Visibility:** Public (required for free GitHub Pages)
   - **DO NOT** check "Initialize with README"
   - **DO NOT** add .gitignore or license
   - Click **"Create repository"**

## Step 4: Initialize Local Repository

Open terminal/command prompt in your project folder:

```bash
# Navigate to project folder
cd E:\Projects\tlangau\tlangau-web

# Initialize git repository
git init

# Check status
git status
```

## Step 5: Add Files to Git

```bash
# Add all files
git add .

# Check what will be committed
git status

# Commit files
git commit -m "Initial commit: Tlangau web portal"
```

## Step 6: Connect to GitHub

```bash
# Add remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/tlangau-web.git

# Verify remote was added
git remote -v
```

## Step 7: Push to GitHub

```bash
# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

**Note:** You'll be prompted for GitHub credentials:
- **Username:** Your GitHub username
- **Password:** Use a Personal Access Token (not your GitHub password)

### Create Personal Access Token:

1. Go to GitHub → Settings → Developer settings
2. Click **Personal access tokens** → **Tokens (classic)**
3. Click **Generate new token (classic)**
4. Name it: "Tlangau Web"
5. Select scopes: **repo** (all repo permissions)
6. Click **Generate token**
7. **Copy the token immediately** (you won't see it again)
8. Use this token as password when pushing

## Step 8: Verify Upload

1. Go to your GitHub repository
2. You should see all your files
3. Files should match your local folder

## Step 9: Enable GitHub Pages

1. In your repository, click **Settings** tab
2. Scroll to **Pages** section (left sidebar)
3. Under **Source:**
   - Branch: `main`
   - Folder: `/ (root)`
4. Click **Save**
5. Wait 1-2 minutes
6. Visit: `https://YOUR_USERNAME.github.io/tlangau-web/`

## Step 10: Make Updates

Whenever you make changes:

```bash
# Check what changed
git status

# Add changed files
git add .

# Commit changes
git commit -m "Description of changes"

# Push to GitHub
git push
```

GitHub Pages will automatically update in 1-2 minutes.

## Common Git Commands

```bash
# Check status
git status

# See what changed
git diff

# View commit history
git log

# Undo changes (before commit)
git checkout -- filename

# Undo last commit (keep changes)
git reset --soft HEAD~1

# See remote repository
git remote -v

# Pull latest changes
git pull
```

## Troubleshooting

### Issue: "Repository not found"
- Check repository name is correct
- Verify you have access to the repository
- Check remote URL: `git remote -v`

### Issue: "Authentication failed"
- Use Personal Access Token instead of password
- Check token has correct permissions
- Regenerate token if needed

### Issue: "Permission denied"
- Check you're using correct username
- Verify repository exists
- Check you have write access

### Issue: "Branch main does not exist"
```bash
# Create and switch to main branch
git checkout -b main

# Push main branch
git push -u origin main
```

## Best Practices

1. **Commit Often:** Make small, frequent commits
2. **Clear Messages:** Write descriptive commit messages
3. **Don't Commit Secrets:** Never commit passwords, API keys, etc.
4. **Use .gitignore:** Already included in this project
5. **Pull Before Push:** Always pull latest changes before pushing

## Next Steps

After setting up GitHub:
1. ✅ Enable GitHub Pages (Step 9)
2. ✅ Set up custom domain (see DOMAIN_SETUP_GUIDE.md)
3. ✅ Configure SEO (already done in HTML files)
4. ✅ Test website functionality
5. ✅ Share your website!

## Need Help?

- **Git Documentation:** [git-scm.com/doc](https://git-scm.com/doc)
- **GitHub Help:** [help.github.com](https://help.github.com)
- **GitHub Community:** [github.community](https://github.community)

---

**Congratulations!** Your code is now on GitHub and your website is live! 🎉


