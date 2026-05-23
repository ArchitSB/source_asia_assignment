function validateUrls(urls) {
  for (let url of urls) {
    if (typeof url !== 'string') {
      return { valid: false, message: 'Each URL must be a string' };
    }

    url = url.trim();

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { valid: false, message: `Invalid URL "${url}": must start with http:// or https://` };
    }
    if (url.length > 2048) {
      return { valid: false, message: `URL exceeds maximum allowed length of 2048 characters` };
    }
  }
  return { valid: true };
}

function validateUrlArray(urls, fieldName) {
  if (urls === undefined || urls === null) {
    return { valid: true };
  }
  if (!Array.isArray(urls)) {
    return { valid: false, message: `${fieldName} must be an array` };
  }
  if (urls.length > 20) {
    return { valid: false, message: `${fieldName} must not exceed 20 URLs per request` };
  }
  return validateUrls(urls);
}

module.exports = { validateUrls, validateUrlArray };
