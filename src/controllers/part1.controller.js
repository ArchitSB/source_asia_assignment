const { getOrCreateUser, resetWindowIfExpired, getAllStats } = require('../store/rateLimiter.store');

async function handleRequest(req, res, next) {
  try {
    const body = req.body;

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid JSON body' });
    }

    const { user_id, payload } = body;

    if (!user_id || typeof user_id !== 'string' || user_id.trim() === '') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'user_id is required and must be a non-empty string',
      });
    }

    if (user_id.trim().length > 256) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'user_id must not exceed 256 characters',
      });
    }

    if (!('payload' in body)) {
      return res.status(400).json({ error: 'Bad Request', message: 'payload is required' });
    }

    const userId = user_id.trim();
    const entry = getOrCreateUser(userId);
    resetWindowIfExpired(entry);

    if (entry.accepted < 5) {
      entry.accepted += 1;
      return res.status(201).json({
        status: 'accepted',
        message: 'Request accepted',
        user_id: userId,
        accepted_in_window: entry.accepted,
      });
    } else {
      entry.rejected += 1;
      const retryAfterSeconds = Math.ceil((entry.windowStart + 60000 - Date.now()) / 1000);
      return res.status(429).json({
        status: 'rejected',
        error: 'Rate limit exceeded',
        message: 'Maximum 5 requests per minute allowed per user',
        user_id: userId,
        retry_after_seconds: retryAfterSeconds,
      });
    }
  } catch (err) {
    next(err);
  }
}

async function handleStats(req, res, next) {
  try {
    const { users, total_accepted_in_window, total_rejected_cumulative } = getAllStats();
    return res.status(200).json({
      users,
      global: {
        total_accepted_in_window,
        total_rejected_cumulative,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { handleRequest, handleStats };
