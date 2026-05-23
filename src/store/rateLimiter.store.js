// A setInterval below cleans up stale entries every 5 minutes
const rateLimiterStore = new Map();

function getOrCreateUser(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId passed to store');
  }
  if (!rateLimiterStore.has(userId)) {
    rateLimiterStore.set(userId, {
      windowStart: Date.now(),
      accepted: 0,
      rejected: 0,
    });
  }
  return rateLimiterStore.get(userId);
}

function resetWindowIfExpired(entry) {
  if (Date.now() - entry.windowStart >= 60000) {
    entry.windowStart = Date.now();
    entry.accepted = 0;
  }
}

function getAllStats() {
  const users = [];
  let total_accepted_in_window = 0;
  let total_rejected_cumulative = 0;

  for (const [user_id, entry] of rateLimiterStore.entries()) {
    users.push({
      user_id,
      accepted_in_window: entry.accepted,
      rejected_cumulative: entry.rejected,
      window_started_at: new Date(entry.windowStart).toISOString(),
    });
    total_accepted_in_window += entry.accepted;
    total_rejected_cumulative += entry.rejected;
  }

  return { users, total_accepted_in_window, total_rejected_cumulative };
}

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, entry] of rateLimiterStore.entries()) {
    const windowAge = now - entry.windowStart;
    // Entry is stale if window expired more than STALE_THRESHOLD ago
    if (windowAge > 60000 + STALE_THRESHOLD_MS && entry.rejected === 0) {
      rateLimiterStore.delete(userId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[CLEANUP] Removed ${cleaned} stale rate limiter entries`);
  }
}, CLEANUP_INTERVAL_MS);

module.exports = { rateLimiterStore, getOrCreateUser, resetWindowIfExpired, getAllStats };
