function parseJsonField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseJsonField(value, null);
    if (Array.isArray(parsed)) return parsed;
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

module.exports = { parseJsonField, asArray };
