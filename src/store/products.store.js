const { v4: uuidv4 } = require('uuid');

const productsCore = new Map();
const mediaStore = new Map();
const skuIndex = new Map();

function createProduct(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data passed to createProduct');
  }
  const { name, sku, image_urls = [], video_urls = [] } = data;
  if (skuIndex.has(sku)) {
    return { conflict: true };
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  productsCore.set(id, {
    id,
    name,
    sku,
    image_count: image_urls.length,
    video_count: video_urls.length,
    created_at: now,
  });

  mediaStore.set(id, {
    image_urls: (data.image_urls || []).map(u => u.trim()),
    video_urls: (data.video_urls || []).map(u => u.trim()),
  });

  skuIndex.set(sku, id);

  return { ...productsCore.get(id), ...mediaStore.get(id) };
}

function listProducts({ limit, offset }) {
  const all = Array.from(productsCore.values());
  const total = all.length;
  const products = all.slice(offset, offset + limit);
  return { products, total, limit, offset };
}

function getProductById(id) {
  const core = productsCore.get(id);
  if (!core) return null;
  const media = mediaStore.get(id);
  return { ...core, ...media };
}

function appendMedia(id, { image_urls = [], video_urls = [] } = {}) {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid id passed to appendMedia');
  }
  const core = productsCore.get(id);
  if (!core) return null;

  const media = mediaStore.get(id);
  const newImageUrls = (image_urls || []).map(u => u.trim());
  const newVideoUrls = (video_urls || []).map(u => u.trim());
  media.image_urls.push(...newImageUrls);
  media.video_urls.push(...newVideoUrls);

  core.image_count = media.image_urls.length;
  core.video_count = media.video_urls.length;

  return { ...core, ...media };
}

module.exports = { createProduct, listProducts, getProductById, appendMedia };
