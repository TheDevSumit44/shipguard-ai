/**
 * ═══ ISSUE #31: Polyline & Route Validation ═══
 * Validates geographic data before encoding/processing
 */

/**
 * Validate a single geographic coordinate pair
 * @param {number} lat - Latitude (-90 to 90)
 * @param {number} lon - Longitude (-180 to 180)
 * @returns {boolean}
 */
export function isValidCoordinate(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Validate a polyline path (array of [lat, lon] pairs)
 * @param {Array} path - Array of coordinate pairs
 * @returns {{valid: boolean, error?: string}}
 */
export function validatePolylinePath(path) {
  if (!Array.isArray(path)) {
    return { valid: false, error: 'Path must be an array' };
  }

  if (path.length < 2) {
    return { valid: false, error: 'Path must contain at least 2 coordinate pairs' };
  }

  if (path.length > 10000) {
    return { valid: false, error: 'Path exceeds maximum size (10,000 points)' };
  }

  for (let i = 0; i < path.length; i += 1) {
    const point = path[i];

    if (!Array.isArray(point) || point.length !== 2) {
      return {
        valid: false,
        error: `Point at index ${i} is invalid: must be [lat, lon] pair`,
      };
    }

    const [lat, lon] = point;

    if (!isValidCoordinate(lat, lon)) {
      return {
        valid: false,
        error: `Point at index ${i} has invalid coordinates: lat=${lat}, lon=${lon}. ` +
               `Expected lat in [-90, 90] and lon in [-180, 180]`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate encoded polyline string
 * @param {string} polyline - Encoded polyline
 * @returns {{valid: boolean, error?: string}}
 */
export function validateEncodedPolyline(polyline) {
  if (typeof polyline !== 'string') {
    return { valid: false, error: 'Polyline must be a string' };
  }

  if (polyline.length === 0) {
    return { valid: false, error: 'Polyline cannot be empty' };
  }

  if (polyline.length > 50000) {
    return { valid: false, error: 'Encoded polyline exceeds maximum size (50,000 chars)' };
  }

  // Basic validation: polyline should only contain printable ASCII in range 63-95 (plus 32-126 after decoding)
  const validChars = /^[?-~]+$/;
  if (!validChars.test(polyline)) {
    return { valid: false, error: 'Polyline contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate origin/destination coordinates for routing
 * @param {Object} origin - {lat, lon}
 * @param {Object} destination - {lat, lon}
 * @returns {{valid: boolean, error?: string}}
 */
export function validateRoutingCoordinates(origin, destination) {
  if (!origin || typeof origin !== 'object') {
    return { valid: false, error: 'Origin must be an object with lat and lon' };
  }

  if (!destination || typeof destination !== 'object') {
    return { valid: false, error: 'Destination must be an object with lat and lon' };
  }

  const originLat = Number(origin.lat);
  const originLon = Number(origin.lon);
  const destLat = Number(destination.lat);
  const destLon = Number(destination.lon);

  if (!isValidCoordinate(originLat, originLon)) {
    return {
      valid: false,
      error: `Origin coordinates invalid: lat=${originLat}, lon=${originLon}`,
    };
  }

  if (!isValidCoordinate(destLat, destLon)) {
    return {
      valid: false,
      error: `Destination coordinates invalid: lat=${destLat}, lon=${destLon}`,
    };
  }

  // Check for same origin/destination
  if (originLat === destLat && originLon === destLon) {
    return { valid: false, error: 'Origin and destination cannot be identical' };
  }

  return { valid: true };
}

/**
 * Sanitize and validate route data structure
 * @param {Object} route - Route object to validate
 * @returns {{valid: boolean, error?: string, sanitized?: Object}}
 */
export function validateRoute(route) {
  if (!route || typeof route !== 'object') {
    return { valid: false, error: 'Route must be an object' };
  }

  const { polyline, distance, duration } = route;

  // Validate polyline if present
  if (polyline) {
    const polylineCheck = validateEncodedPolyline(polyline);
    if (!polylineCheck.valid) {
      return { valid: false, error: `Invalid polyline: ${polylineCheck.error}` };
    }
  }

  // Validate distance if present
  if (distance !== undefined && distance !== null) {
    const distNum = Number(distance);
    if (!Number.isFinite(distNum) || distNum < 0 || distNum > 40000) {
      return {
        valid: false,
        error: `Distance must be a number between 0 and 40000 km, got ${distance}`,
      };
    }
  }

  // Validate duration if present
  if (duration !== undefined && duration !== null) {
    const durationNum = Number(duration);
    if (!Number.isFinite(durationNum) || durationNum < 0 || durationNum > 86400) {
      return {
        valid: false,
        error: `Duration must be a number between 0 and 86400 minutes, got ${duration}`,
      };
    }
  }

  return { valid: true, sanitized: route };
}

export default {
  isValidCoordinate,
  validatePolylinePath,
  validateEncodedPolyline,
  validateRoutingCoordinates,
  validateRoute,
};
