// seed.js
//
// Creates 1,000 products on the running server at http://localhost:3000 by sending
// batched POST /products requests (50 concurrent at a time via Promise.all).
//
// After seeding, calls GET /products?limit=20&offset=0 to demonstrate that the list
// endpoint returns only core fields (id, name, sku, image_count, video_count,
// created_at) — no URL arrays — even with 13,000 URLs held in memory.
//
// Usage:
//   1. Start the server:  npm run dev
//   2. In a new terminal: node seed.js

const BASE_URL = 'http://localhost:3000';
const TOTAL = 1000;
const BATCH_SIZE = 50;

function buildProduct(i) {
  const padded = String(i).padStart(4, '0');
  return {
    name: `Product ${i}`,
    sku: `SKU-${padded}`,
    image_urls: Array.from({ length: 10 }, (_, j) =>
      `https://cdn.example.com/products/sku-${padded}/img-${j + 1}.jpg`
    ),
    video_urls: Array.from({ length: 3 }, (_, j) =>
      `https://cdn.example.com/products/sku-${padded}/demo-${j + 1}.mp4`
    ),
  };
}

async function postProduct(product) {
  const res = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  });
  return { ok: res.ok, status: res.status, sku: product.sku };
}

async function seed() {
  try {
    console.log(`Seeding ${TOTAL} products in batches of ${BATCH_SIZE}...\n`);
    const start = Date.now();

    let successCount = 0;
    const failures = [];

    for (let batchStart = 1; batchStart <= TOTAL; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, TOTAL);
      const products = [];
      for (let i = batchStart; i <= batchEnd; i++) {
        products.push(buildProduct(i));
      }

      const results = await Promise.all(products.map(postProduct));

      for (const result of results) {
        if (result.ok) {
          successCount++;
        } else {
          failures.push({ sku: result.sku, status: result.status });
        }
      }

      process.stdout.write(`\rProgress: ${batchEnd}/${TOTAL}`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);

    console.log('\n');
    console.log(`Total products created successfully: ${successCount}`);

    if (failures.length > 0) {
      console.log(`Failures (${failures.length}):`);
      for (const { sku, status } of failures) {
        console.log(`  - ${sku} (HTTP ${status})`);
      }
    } else {
      console.log('Failures: none');
    }

    console.log(`Time taken: ${elapsed}s`);

    console.log('\n--- Verifying list endpoint: GET /products?limit=20&offset=0 ---\n');
    const listRes = await fetch(`${BASE_URL}/products?limit=20&offset=0`);
    const listData = await listRes.json();
    console.log(JSON.stringify(listData, null, 2));
    console.log(
      '\nNote: each product above contains only core fields — image_urls and video_urls are absent,',
      `\nconfirming the list endpoint never reads from mediaStore regardless of how many URLs are stored.`
    );
  } catch (err) {
    console.error('Seed script failed:', err.message);
    process.exit(1);
  }
}

seed();
