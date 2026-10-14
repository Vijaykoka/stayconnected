# 100% Free Production Setup: Git + Cloudflare Pages + Existing Domain

This guide provides the complete, step-by-step instructions to host your **SIM Verification & Top-Up Web Service** for **FREE** using:
1. **GitHub** (Free code repository)
2. **Cloudflare Pages** (Free edge hosting & serverless functions with unlimited bandwidth)
3. **Your Existing Domain Name** (Connected to Cloudflare with free SSL HTTPS)
4. **Cloudflare D1 / Supabase** (Free cloud database holding hundreds of thousands of ICCIDs)
5. **Direct Excel (.xlsx / .xls) Upload** (Upload distributor spreadsheets directly into your database)

---

## Architecture

```text
[Amazon Customer Scans QR Code on SIM Package]
                       │
                       ▼
    [Your Existing Domain: https://topup.yourdomain.com]
                       │
           Cloudflare Edge Network (100% FREE)
   ┌───────────────────┴───────────────────┐
   ▼                                       ▼
Static Web Form (HTML/CSS)           Cloudflare Pages Functions
from public/ directory                from functions/api/
                                           │
                       ┌───────────────────┴───────────────────┐
                       ▼                                       ▼
         Cloud Database (Cloudflare D1 / Supabase)       Email Alert (Resend)
         (Stores 100,000s of ICCIDs & Requests)         (Vendor inbox notification)
```

---

## Step 1: Push Your Code to GitHub (Free)

1. Open PowerShell in this project folder (`v:\esim4\i-am-a-vender-selling-esim`).
2. Run the following commands:
   ```powershell
   git init
   git add .
   git commit -m "Initial commit for Cloudflare SIM Top-Up Service"
   ```
3. Go to [https://github.com/new](https://github.com/new) and create a **Private Repository** (e.g. `sim-topup-service`).
4. Link your local project and push:
   ```powershell
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/sim-topup-service.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Connect to Cloudflare Pages (100% Free)

1. Log in to your free [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation, click **Workers & Pages**.
3. Click **Create Application** → Select the **Pages** tab → Click **Connect to Git**.
4. Select your GitHub repository (`sim-topup-service`).
5. Configure the Build Settings:
   - **Project Name:** `sim-topup`
   - **Production Branch:** `main`
   - **Framework Preset:** `None`
   - **Build Command:** *(Leave blank)*
   - **Build Output Directory:** `public`
6. Click **Save and Deploy**.
7. In ~30 seconds, Cloudflare will give you a live free URL like:
   `https://sim-topup.pages.dev`

---

## Step 3: Connect Your Free Cloud Database

You can choose either **Cloudflare D1 (Native Free)** or **Supabase (Free)**:

### Option A: Cloudflare D1 (100% Free, Zero External Accounts)
1. In the Cloudflare Dashboard, go to **Workers & Pages** → **D1 SQL Database**.
2. Click **Create Database**, name it `sim_db`.
3. Click on the database → **Console** tab, paste the following SQL and click **Execute**:
   ```sql
   CREATE TABLE IF NOT EXISTS sims (
     iccid TEXT PRIMARY KEY,
     ecommerce TEXT DEFAULT 'Amazon',
     batch_id TEXT,
     network TEXT,
     status TEXT DEFAULT 'available',
     last_top_up_value TEXT,
     order_id TEXT,
     customer_email TEXT,
     recharges_count INTEGER DEFAULT 0,
     created_at TEXT,
     last_activity_at TEXT
   );

   CREATE TABLE IF NOT EXISTS topup_requests (
     id TEXT PRIMARY KEY,
     amazon_order_id TEXT NOT NULL,
     sim_iccid TEXT NOT NULL,
     network_name TEXT NOT NULL,
     top_up_value TEXT NOT NULL,
     iccid_verified INTEGER DEFAULT 1,
     customer_email TEXT,
     submitted_at TEXT
   );

   CREATE INDEX IF NOT EXISTS idx_sims_order ON sims(order_id);
   CREATE INDEX IF NOT EXISTS idx_req_order ON topup_requests(amazon_order_id);
   ```
4. Bind it to your Pages project:
   - Go to **Workers & Pages** → Your `sim-topup` Pages project → **Settings** → **Functions**.
   - Under **D1 Database Bindings**, click **Add binding**.
   - **Variable name:** `DB`
   - **D1 Database:** Select `sim_db`.
   - Click **Save**.

---

## Step 4: Connect Your Existing Domain Name for Free

1. In your Cloudflare Pages project, go to the **Custom Domains** tab.
2. Click **Set up a custom domain**.
3. Enter your domain or subdomain (for example: `topup.yourdomain.com` or `sim.yourdomain.com`).
4. **If your domain is already on Cloudflare:**
   - Cloudflare will automatically configure the DNS record in 1 click!
5. **If your domain is on GoDaddy, Namecheap, or Google Domains:**
   - Add a `CNAME` record in your registrar's DNS settings:
     - **Name / Host:** `topup`
     - **Target / Value:** `sim-topup.pages.dev`
6. Cloudflare will automatically provision and manage a **Free SSL Certificate (HTTPS)** for your domain.

---

## Step 5: Set Your Admin Password & Email Variables

1. In your Cloudflare Pages project, go to **Settings** → **Environment Variables**.
2. Add the following variables:

| Variable Name | Value | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | `YourSecretPassword123` | Password to unlock `/admin.html` |
| `RESEND_API_KEY` | `re_...` *(optional)* | Free API key from [resend.com](https://resend.com) for email alerts |
| `NOTIFICATION_EMAIL` | `vendor-orders@yourdomain.com` | Email address where top-up alerts arrive |

---

## Step 6: Uploading Excel (.xlsx / .xls) to the Database

You do not need to convert your distributor files to CSV manually. The admin dashboard has a built-in Excel engine.

1. Open your live admin portal:
   `https://topup.yourdomain.com/admin.html`
2. Enter your **Admin Password** to unlock the dashboard.
3. In the **Bulk Import** card:
   - Drag and drop your **Excel file (`.xlsx` or `.xls`)** or click to select it.
   - The system instantly reads all worksheets and detects every 18–22 digit ICCID (e.g. `8944...`).
   - The dashboard shows: `✓ 5,420 ICCIDs detected in Excel`.
4. Enter an optional **Batch ID** (e.g. `AMZ-UK-SHIPMENT-01`).
5. Click **Import Authorized ICCIDs**.
6. All ICCIDs are now saved in your live cloud database and ready for instant customer verification!

---

## Step 7: Generating Customer QR Codes

Print QR codes on your SIM card stickers or instruction leaflets:

### Standard QR Code:
```text
https://topup.yourdomain.com
```

### Pre-filled QR Code (Pre-populates ICCID and Network):
```text
https://topup.yourdomain.com/?iccid=8944115559845100001&network=giffgaff
```
When your Amazon customer scans the QR code with their mobile phone:
1. The portal opens instantly.
2. The SIM ICCID is verified against your authorized stock on Cloudflare.
3. Customer inputs Amazon Order ID and selects their top-up value.
4. You receive an instant alert and spreadsheet record ready to recharge!
