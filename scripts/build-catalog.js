const fs = require('fs');

const ASIN_CATALOG = {
  'B017M2ZZ3A': { network: 'O2', topUp: '£15', title: 'O2 £15 Big Bundle' },
  'B01M2XS5GL': { network: 'EE', topUp: '£15', title: 'EE £15 Data Pack' },
  'B0GZKJCQ9R': { network: 'EE', topUp: '£15', title: 'EE 20GB (£15)' },
  'B0GZKNYBKR': { network: 'EE', topUp: '£15', title: 'EE 25GB/30GB (£15)' },
  'B0GZKKK685': { network: 'EE', topUp: '£15', title: 'EE SIM Pack (£15)' },
  'B01N1L2YCE': { network: 'EE', topUp: '£20', title: 'EE 50GB (£20)' },
  'B016MWIMRW': { network: 'EE', topUp: '£10', title: 'EE 3-in-1 SIM' },
  'B0DYKW3CK1': { network: 'THREE', topUp: '£10', title: 'Three 40GB (£10)' },
  'B0888G1C16': { network: 'THREE', topUp: '£10', title: 'Three Mobile PAYG SIM' },
  'B000TIY0EK': { network: 'THREE', topUp: '£10', title: 'Network 3 PAYG SIM' },
  'B0D6W46FJK': { network: 'THREE', topUp: '£10', title: 'SMARTY (Three) SIM' },
  'B0002GDK2C': { network: 'O2', topUp: '£10', title: 'O2 PAYG SIM Blue' },
  'B08265GRSP': { network: 'O2', topUp: '£15', title: 'O2 Big Bundle Unlimited' },
  'B08KHDBZK5': { network: 'O2', topUp: '£10', title: 'Giffgaff/O2 PAYG SIM' },
  'B01M5GWY1N': { network: 'O2', topUp: '£10', title: 'Giffgaff Triple SIM' },
  'B0189VSP3U': { network: 'O2', topUp: '£10', title: 'Giffgaff O2 4G Multi SIM' },
  'B017TKT978': { network: 'O2', topUp: '£10', title: 'Giffgaff Nano SIM' },
  'B07DLYWX6W': { network: 'O2', topUp: '£10', title: 'Vodafone/VOXI SIM' },
  'B0FQ5LH556': { network: 'O2', topUp: '£10', title: 'VOXI SIM (£10)' }
};

const ordersMap = new Map();

// Read existing amazon-orders.json
if (fs.existsSync('data/amazon-orders.json')) {
  const existing = JSON.parse(fs.readFileSync('data/amazon-orders.json', 'utf8'));
  for (const o of existing.orders || []) {
    if (o.orderId) ordersMap.set(o.orderId, o);
  }
}

// Parse CSV
const csvFiles = fs.readdirSync('AOID').filter(f => f.endsWith('.csv'));
for (const f of csvFiles) {
  const text = fs.readFileSync('AOID/' + f, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(';').map(p => p.replace(/^"|"$/g, '').trim());
    const orderIdMatch = parts.join(' ').match(/\b\d{3}-\d{7}-\d{7}\b/);
    if (!orderIdMatch) continue;
    const orderId = orderIdMatch[0];
    const asinMatch = parts.join(' ').match(/\bB0[0-9A-Z]{8}\b/);
    const asin = asinMatch ? asinMatch[0] : '';
    const catalog = ASIN_CATALOG[asin] || {};
    const isCancelled = line.toLowerCase().includes('return');
    const existing = ordersMap.get(orderId) || {};
    ordersMap.set(orderId, {
      orderId,
      network: catalog.network || existing.network || 'EE',
      topUpValue: catalog.topUp || existing.topUpValue || '£15',
      itemTitle: catalog.title || existing.itemTitle || 'SIM Card',
      sku: existing.sku || '',
      itemPrice: existing.itemPrice || '',
      source: 'sellerboard_csv',
      status: isCancelled ? 'cancelled' : (existing.status || 'unclaimed'),
      claimedIccid: existing.claimedIccid || null,
      claimedAt: existing.claimedAt || null,
      createdAt: existing.createdAt || new Date().toISOString()
    });
  }
}

console.log('Total unique orders loaded in catalog:', ordersMap.size);
const ordersList = Array.from(ordersMap.values());
fs.writeFileSync('data/amazon-orders.json', JSON.stringify({ orders: ordersList }, null, 2), 'utf8');

// Also create a fast lookup JSON for frontend and worker
const lookup = {};
for (const o of ordersList) {
  lookup[o.orderId] = {
    network: o.network,
    topUpValue: o.topUpValue,
    status: o.status,
    claimed: o.status === 'claimed',
    cancelled: o.status === 'cancelled'
  };
}
fs.writeFileSync('public/orders-catalog.json', JSON.stringify(lookup), 'utf8');
console.log('Saved public/orders-catalog.json with', Object.keys(lookup).length, 'entries');
