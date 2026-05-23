const { createProduct, listProducts, getProductById, appendMedia } = require('../store/products.store');
const { validateUrlArray } = require('../utils/urlValidator');

async function handleCreateProduct(req, res, next) {
  try {
    const body = req.body;

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid JSON body' });
    }

    const { name, sku, image_urls, video_urls } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name is required and must be a non-empty string',
      });
    }

    if (name.trim().length > 500) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name must not exceed 500 characters',
      });
    }

    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'sku is required and must be a non-empty string',
      });
    }

    if (sku.trim().length > 100) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'sku must not exceed 100 characters',
      });
    }

    const imageCheck = validateUrlArray(image_urls, 'image_urls');
    if (!imageCheck.valid) {
      return res.status(400).json({ error: 'Bad Request', message: imageCheck.message });
    }

    const videoCheck = validateUrlArray(video_urls, 'video_urls');
    if (!videoCheck.valid) {
      return res.status(400).json({ error: 'Bad Request', message: videoCheck.message });
    }

    const result = createProduct({
      name: name.trim(),
      sku: sku.trim(),
      image_urls: image_urls || [],
      video_urls: video_urls || [],
    });

    if (result.conflict) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A product with this SKU already exists',
      });
    }

    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function handleListProducts(req, res, next) {
  try {
    if (req.query.limit !== undefined) {
      const rawLimit = Number(req.query.limit);
      if (Number.isFinite(rawLimit) && !Number.isInteger(rawLimit)) {
        return res.status(400).json({ error: 'Bad Request', message: 'limit must be a whole number' });
      }
    }

    if (req.query.offset !== undefined) {
      const rawOffset = Number(req.query.offset);
      if (Number.isFinite(rawOffset) && !Number.isInteger(rawOffset)) {
        return res.status(400).json({ error: 'Bad Request', message: 'offset must be a whole number' });
      }
    }

    let limit = req.query.limit !== undefined ? Number(req.query.limit) : 20;
    let offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;

    if (!Number.isInteger(limit) || limit <= 0) {
      return res.status(400).json({ error: 'Bad Request', message: 'limit must be a positive integer' });
    }
    if (!Number.isInteger(offset) || offset < 0) {
      return res.status(400).json({ error: 'Bad Request', message: 'offset must be a non-negative integer' });
    }
    if (limit > 100) {
      return res.status(400).json({ error: 'Bad Request', message: 'limit must not exceed 100' });
    }

    const { products, total } = listProducts({ limit, offset });

    return res.status(200).json({
      products,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + products.length < total,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function handleGetProduct(req, res, next) {
  try {
    const product = getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Not Found', message: 'Product not found' });
    }
    return res.status(200).json(product);
  } catch (err) {
    next(err);
  }
}

async function handleAppendMedia(req, res, next) {
  try {
    const body = req.body;

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid JSON body' });
    }

    const { image_urls, video_urls } = body;

    const imageCheck = validateUrlArray(image_urls, 'image_urls');
    if (!imageCheck.valid) {
      return res.status(400).json({ error: 'Bad Request', message: imageCheck.message });
    }

    const videoCheck = validateUrlArray(video_urls, 'video_urls');
    if (!videoCheck.valid) {
      return res.status(400).json({ error: 'Bad Request', message: videoCheck.message });
    }

    const normalizedImages = image_urls || [];
    const normalizedVideos = video_urls || [];

    if (normalizedImages.length === 0 && normalizedVideos.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'At least one URL must be provided in image_urls or video_urls',
      });
    }

    const result = appendMedia(req.params.id, {
      image_urls: normalizedImages,
      video_urls: normalizedVideos,
    });

    if (!result) {
      return res.status(404).json({ error: 'Not Found', message: 'Product not found' });
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { handleCreateProduct, handleListProducts, handleGetProduct, handleAppendMedia };
