# Source Asia Backend Assignment

## 1. Overview

A production-quality HTTP service built with **Node.js** and **Express.js**, using **in-memory storage (Maps)** — no database required. The service is split into two independent parts:

- **Part 1 — Rate Limiter API**: Accepts or rejects requests per user using a fixed 1-minute sliding window, with full stats tracking.
- **Part 2 — Product Catalog API**: A CRUD-style catalog for products with separate media management, pagination, and URL validation.

No external packages are used beyond `express` and `uuid`.

---

## 2. How to Run

```bash
npm install
npm run dev    # development (nodemon, auto-restarts on change)
# or
npm start      # production (plain node)
```

The server listens on **port 3000**.

---

## 3. Part 1 — Rate Limiter

### Design

| Property | Value |
|---|---|
| Window type | Fixed 1-minute window per user |
| Limit | 5 accepted requests per user per window |
| Rejected counter | Cumulative — persists across window resets |
| Window reset | On next request after 60 seconds have elapsed |

- `accepted` resets to 0 at the start of each new window.
- `rejected` is **never reset** — it tracks lifetime rejections.
- `retry_after_seconds` tells the client exactly how many seconds remain before their window resets.

### Response Codes

| Code | Meaning |
|---|---|
| 201 | Request accepted within rate limit |
| 429 | Rate limit exceeded |
| 400 | Missing or invalid input |

### Example curl Commands

```bash
# Send a request
curl -X POST http://localhost:3000/request \
  -H "Content-Type: application/json" \
  -d '{"user_id": "alice", "payload": {"action": "buy"}}'

# Get stats
curl http://localhost:3000/stats

# Trigger rate limit (run 6 times for same user)
for i in {1..6}; do
  curl -X POST http://localhost:3000/request \
    -H "Content-Type: application/json" \
    -d '{"user_id": "alice", "payload": "test"}'
done
```

---

## 4. Part 1 — API Schema

### POST /request

**Request body:**
```json
{
  "user_id": "alice",
  "payload": { "action": "buy" }
}
```

- `user_id`: required, non-empty string
- `payload`: required key (value may be any JSON including `null`, `false`, `0`, `""`)

**201 Accepted:**
```json
{
  "status": "accepted",
  "message": "Request accepted",
  "user_id": "alice",
  "accepted_in_window": 1
}
```

**429 Rate Limited:**
```json
{
  "status": "rejected",
  "error": "Rate limit exceeded",
  "message": "Maximum 5 requests per minute allowed per user",
  "user_id": "alice",
  "retry_after_seconds": 42
}
```

**400 Bad Input:**
```json
{ "error": "Bad Request", "message": "user_id is required and must be a non-empty string" }
```

---

### GET /stats

**200 Response:**
```json
{
  "users": [
    {
      "user_id": "alice",
      "accepted_in_window": 5,
      "rejected_cumulative": 3,
      "window_started_at": "2024-01-01T12:00:00.000Z"
    }
  ],
  "global": {
    "total_accepted_in_window": 5,
    "total_rejected_cumulative": 3
  }
}
```

---

## 5. Part 2 — Product Catalog

### Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /products | Create a product |
| GET | /products | List products (paginated) |
| GET | /products/:id | Get product by ID (includes URLs) |
| POST | /products/:id/media | Append image/video URLs to a product |

### URL Validation Rules
- Each URL must be a string
- Must start with `http://` or `https://`
- Maximum 2048 characters per URL
- Maximum 20 URLs per array per request

### Pagination Defaults

| Parameter | Default | Maximum |
|---|---|---|
| `limit` | 20 | 100 |
| `offset` | 0 | — |

### Sort Order

**Sort order:** Products are returned in insertion order (oldest first).
This is deterministic and consistent with the in-memory Map structure.
In a PostgreSQL implementation, this would be `ORDER BY created_at ASC`
with an index on `created_at`.

### Example curl Commands

```bash
# Create a product
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Widget A",
    "sku": "SKU-001",
    "image_urls": ["https://cdn.example.com/products/sku-001/img-1.jpg"],
    "video_urls": ["https://cdn.example.com/products/sku-001/demo.mp4"]
  }'

# List products
curl "http://localhost:3000/products?limit=10&offset=0"

# Get product by ID
curl http://localhost:3000/products/<id>

# Append media
curl -X POST http://localhost:3000/products/<id>/media \
  -H "Content-Type: application/json" \
  -d '{"image_urls": ["https://cdn.example.com/products/sku-001/img-2.jpg"]}'
```

### Response Shapes

**POST /products — 201:**
```json
{
  "id": "uuid-here",
  "name": "Widget A",
  "sku": "SKU-001",
  "image_count": 1,
  "video_count": 1,
  "created_at": "2024-01-01T12:00:00.000Z",
  "image_urls": ["https://cdn.example.com/products/sku-001/img-1.jpg"],
  "video_urls": ["https://cdn.example.com/products/sku-001/demo.mp4"]
}
```

**POST /products — 409 Duplicate SKU:**
```json
{ "error": "Conflict", "message": "A product with this SKU already exists" }
```

**GET /products — 200:**
```json
{
  "products": [
    {
      "id": "uuid-here",
      "name": "Widget A",
      "sku": "SKU-001",
      "image_count": 1,
      "video_count": 1,
      "created_at": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 20,
    "offset": 0,
    "has_more": false
  }
}
```

**GET /products/:id — 200** (same as POST response, includes URLs)

**GET /products/:id — 404:**
```json
{ "error": "Not Found", "message": "Product not found" }
```

---

## 6. Data Model

The product catalog uses three separate in-memory Maps to keep operations efficient:

### `productsCore` Map
Stores only lightweight scalar fields per product:
`id`, `name`, `sku`, `image_count`, `video_count`, `created_at`

**Why**: The `GET /products` list endpoint reads only from this map. With 1,000 products each having 10 URLs, the list endpoint never loads or serializes 10,000 URL strings — it reads only the 6 core fields per product.

### `mediaStore` Map
Stores URL arrays per product:
`{ image_urls: [...], video_urls: [...] }`

**Why**: Only accessed on `GET /products/:id` (detail view) and `POST /products/:id/media` (append). Completely bypassed during listing.

### `skuIndex` Map
Maps each `sku` string → `product_id`.

**Why**: Provides O(1) duplicate SKU detection on creation without scanning the full products map.

---

## 7. Production Limitations

### Part 1 — Rate Limiter

**Single instance only.** In a multi-instance deployment (e.g., behind a load balancer with 3 Node.js processes), each instance has its own independent `rateLimiterStore`. A user routed to different instances would effectively get 5 × N requests per window.

**Fix**: Replace the in-memory Map with **Redis** using atomic operations:
- `INCR key` (atomic counter increment)
- `EXPIRE key 60` (auto-reset after 60 seconds)
- `SETNX` for window start timestamp

**Restart loses all state.** All rate limit windows and counters vanish on process restart. Fix: persist to Redis with appropriate TTLs.

---

### Part 2 — Product Catalog

**All data lost on restart.** In-memory Maps are not durable. Fix: use **PostgreSQL** with:
- A `products` table with columns `id`, `name`, `sku`, `image_count`, `video_count`, `created_at`
- A `media` table with `product_id` (FK), `url`, `type` (`image` | `video`)
- `UNIQUE` index on `sku` for conflict detection at the DB level
- Index on `created_at` for efficient pagination

**With PostgreSQL + CDN**: store only URL strings in the DB, serve actual assets from a CDN edge (S3 + CloudFront, GCS + Cloud CDN, etc.). The DB holds the reference; the CDN handles bandwidth and latency.

**List query efficiency**: the `GET /products` SQL query would `SELECT id, name, sku, image_count, video_count, created_at FROM products LIMIT $1 OFFSET $2` — it never joins the `media` table, preserving the same separation as the in-memory model.

- **GET /stats scalability:** The stats endpoint currently returns all users in a single response.
  With millions of users this becomes an unbounded payload. In production this endpoint would
  require pagination (limit/offset), authentication/authorization so only admins can access it,
  and ideally be served from a separate analytics store (e.g. Redis sorted sets or a time-series DB)
  rather than the primary request store.

- **Security headers:** This service does not implement security headers (CORS, Helmet.js,
  rate limiting by IP, etc.) as they are outside the scope of this assignment.
  In production, `helmet` middleware would be added for secure HTTP headers,
  CORS policies would be configured per environment, and IP-level rate limiting
  would complement the existing user-level rate limiting.

---

## 8. Seed Script (Performance Test)

To prove `GET /products` stays fast with large data:

1. Start the server: `npm run dev`
2. In a new terminal: `node seed.js`

This creates 1,000 products each with 10 image URLs and 3 video URLs (13,000 total URLs in memory).
It then calls `GET /products?limit=20` and prints the response — showing only core fields are returned, no URLs.

The script sends requests in batches of 50 concurrent `Promise.all` calls and reports:
- Total products created successfully
- Any failures with their SKU and HTTP status
- Total time taken in seconds

---

## 9. Note on AI Usage

Claude AI was used to assist with boilerplate structure, README drafting, and code review suggestions. All logic, design decisions, and architecture were authored and reviewed by the developer.
