/**
 * ═══ ISSUE #33: Standardized Error Responses ═══
 * Centralized error definitions for consistent API responses
 * 
 * Usage:
 * import { API_ERRORS, sendError } from './errors.js';
 * sendError(res, 'INVALID_SHIPMENT', 'Custom message', { extra: 'details' });
 */

export const API_ERRORS = {
  INVALID_SHIPMENT: {
    code: 'INVALID_SHIPMENT_PAYLOAD',
    message: 'Invalid shipment data format',
    statusCode: 400,
    retryable: false,
  },
  SHIPMENT_ARRAY_EMPTY: {
    code: 'EMPTY_SHIPMENTS_ARRAY',
    message: 'Expected a non-empty shipments array',
    statusCode: 400,
    retryable: false,
  },
  BACKEND_SERVICE_UNAVAILABLE: {
    code: 'BACKEND_SERVICE_UNAVAILABLE',
    message: 'Backend service temporarily unavailable',
    statusCode: 503,
    retryable: true,
  },
  AUTHENTICATION_REQUIRED: {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication required for this operation',
    statusCode: 401,
    retryable: false,
  },
  HMAC_AUTH_REQUIRED: {
    code: 'HMAC_AUTHENTICATION_REQUIRED',
    message: 'HMAC authentication required',
    statusCode: 401,
    retryable: false,
  },
  LEGACY_AUTH_DISABLED: {
    code: 'LEGACY_AUTH_DISABLED',
    message: 'Legacy webhook secret auth disabled',
    statusCode: 401,
    retryable: false,
  },
  WEBHOOK_FORBIDDEN: {
    code: 'WEBHOOK_FORBIDDEN',
    message: 'Unauthorized webhook request',
    statusCode: 403,
    retryable: false,
  },
  WEBHOOK_RATE_LIMITED: {
    code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
    message: 'Webhook rate limit exceeded',
    statusCode: 429,
    retryable: true,
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
    statusCode: 500,
    retryable: false,
  },
  INVALID_COORDINATES: {
    code: 'INVALID_COORDINATES',
    message: 'Invalid coordinates provided',
    statusCode: 400,
    retryable: false,
  },
  GEOCODING_FAILED: {
    code: 'GEOCODING_FAILED',
    message: 'Geocoding service failed',
    statusCode: 503,
    retryable: true,
  },
};

/**
 * Send standardized error response
 * @param {Object} res - Express response object
 * @param {string} errorType - Error type key from API_ERRORS
 * @param {string} [customMessage] - Override default message
 * @param {Object} [extra] - Additional error details
 * @param {string} [requestId] - Request ID for tracking
 */
export function sendError(res, errorType, customMessage = null, extra = {}, requestId = null) {
  const error = API_ERRORS[errorType] || API_ERRORS.INTERNAL_ERROR;
  
  const response = {
    ok: false,
    code: error.code,
    message: customMessage || error.message,
    retryable: error.retryable || false,
  };

  if (requestId) {
    response.requestId = requestId;
  }

  if (Object.keys(extra).length > 0) {
    response.details = extra;
  }

  res.status(error.statusCode).json(response);
}

/**
 * Wrap async handlers with error logging
 * @param {Function} handler - Async request handler
 * @returns {Function} Express middleware
 */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      console.error(`[Handler Error] ${req.method} ${req.path}:`, err.message);
      sendError(
        res,
        'INTERNAL_ERROR',
        process.env.NODE_ENV === 'production' ? undefined : err.message,
        {},
        req.requestId
      );
    });
  };
}

export default {
  API_ERRORS,
  sendError,
  asyncHandler,
};
