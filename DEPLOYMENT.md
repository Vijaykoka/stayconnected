# Live Web Page Service Deployment Guide

This guide explains how to deploy your **SIM Verification and Top-Up Portal** as a live, publicly accessible Web Page Service on **Vercel** with a Cloud Database (**Supabase** or **Neon PostgreSQL**), **Automated Email Alerts**, **Admin Password Protection**, and your **Custom Domain** (e.g. `https://topup.yourdomain.com`).

---

## Architecture

```text
[Customer Mobile / QR Code] 
          │
          ▼
   Vercel / Netlify (Global CDN & Edge Hosting)
   ├── Web Form: https://topup.yourdomain.com
   └── Serverless Functions: /api/*
          │
    ┌─────┴─────────────────────────┐
    ▼                               ▼
Supabase / Neon DB             Resend Email API
(100,000s of ICCIDs)     (Instant alert to your inbox)
```

---

## Step 1: Set Up Cloud Database (Supabase or Neon) — 2 Minutes

You can choose either **Supabase** or **Neon** (both provide free tiers):

### Option A: Supabase (Recommended)
1. Go to [https://supabase.com](https://supabase.com) and create a free account.
2. Click **New Project** and name it `sim-topup`.
3. Go to **Project Settings** → **Database** → **Connection string**.
4. Select **URI** (or Connection Pooling mode) and copy the URL. It looks like:
   ```text
   postgresql://postgres.yourproject:yourpassword@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
   ```
   *(Replace `yourpassword` with your actual database password).*

### Option B: Neon
1. Go to [https://neon.tech](https://neon.tech) and create a free project.
2. Copy the Connection String from the dashboard.

> **Note:** The application automatically creates all necessary SQL tables (`sims`, `topup_requests`) and indexes on the first run. No manual SQL typing is required.

---

## Step 2: Set Up Automated Email Notifications (Resend) — 1 Minute

1. Go to [https://resend.com](https://resend.com) and create a free account.
2. Go to **API Keys** → **Create API Key**. Copy your key (`re_...`).
3. Whenever a customer submits a valid top-up, you will instantly receive an email:
   - **Amazon Order ID:** `123-1234567-1234567`
   - **SIM ICCID:** `8944XXXXXXXXXXXXXXX`
   - **Network Name:** `giffgaff`
   - **Top-Up Value:** `£10`
   - **ICCID Verified:** `Yes`

---

## Step 3: Deploy to Vercel — 2 Minutes

### Method 1: Using GitHub (Easiest)
1. Push this folder to a private GitHub repository:
   ```powershell
   git init
   git add .
   git commit -m "Initial commit for SIM top-up web service"
   git remote add origin https://github.com/YOUR_USERNAME/sim-topup-portal.git
   git branch -M main
   git push -u origin main
   ```
2. Open [https://vercel.com](https://vercel.com) and click **Add New** → **Project**.
3. Import your GitHub repository.
4. Under **Environment Variables**, add:

| Name | Example Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:...@...supabase.co:6543/postgres` | Cloud database connection string |
| `ADMIN_PASSWORD` | `MySecretAdmin2026!` | Password to unlock `/admin.html` |
| `RESEND_API_KEY` | `re_123456789abcdef` | Resend API key for email alerts |
| `NOTIFICATION_EMAIL` | `vendor-orders@yourdomain.com` | Email address where alerts are delivered |

5. Click **Deploy**. Your service will be live in 30 seconds at a free URL like:
   `https://sim-topup-portal.vercel.app`

### Method 2: Using Vercel CLI (Direct from terminal)
```powershell
npm install -g vercel
vercel login
vercel
```

---

## Step 4: Connect Your Custom Domain (e.g. `topup.yourdomain.com`)

1. In your **Vercel Project Dashboard**, go to **Settings** → **Domains**.
2. Enter your desired domain or subdomain (e.g., `topup.yourdomain.com` or `sim.yourdomain.com`).
3. Vercel will display the DNS record to add to your domain registrar (GoDaddy, Namecheap, Cloudflare, Route53):
   - **Type:** `CNAME`
   - **Name:** `topup`
   - **Value:** `cname.vercel-dns.com`
4. Vercel automatically issues and renews a free **SSL Certificate (HTTPS)** for your domain.

---

## Step 5: Printing Your QR Codes

Print QR codes on your SIM card packages or insert cards pointing to your live URL:

```text
https://topup.yourdomain.com
```

### Prefilled QR Codes
You can also generate QR codes with pre-filled ICCIDs:

```text
https://topup.yourdomain.com/?iccid=8944115559845100001&network=giffgaff
```
When scanned by a smartphone camera, the form opens with the ICCID already populated, requiring the customer only to enter their Amazon Order ID and choose their top-up value.

---

## Step 6: Managing SIMs in Production

- Open `https://topup.yourdomain.com/admin.html`
- Enter your **Admin Password** in the secure login modal.
- **Bulk Upload:** Drag and drop your carrier CSV with thousands of ICCIDs.
- **Incoming Requests:** See real-time customer submissions.
- **Spreadsheet Export:** Click **Export Requests (CSV)** to download customer top-up requests for manual or batch carrier recharging.
