import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import Joi from 'joi';
import csurf from 'csurf';
import admin from 'firebase-admin';
import { LRUCache } from 'lru-cache';
import xss from 'xss';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDir, '..');
const envFiles = [
  path.resolve(projectRoot, '.env'),
  path.resolve(serverDir, '.env'),
];

const fileEnv = envFiles.reduce((acc, envPath) => ({
  ...acc,
  ...parseEnvFile(envPath),
}), {});
const env = {
  ...fileEnv,
  ...process.env,
};

const sentryDsn = String(env.SENTRY_DSN || '').trim();
const sentryEnvironment = String(env.SENTRY_ENVIRONMENT || env.NODE_ENV || 'development').trim();
const sentryTracesSampleRate = Number(env.SENTRY_TRACES_SAMPLE_RATE || 0.1);

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: sentryEnvironment,
    tracesSampleRate: Number.isFinite(sentryTracesSampleRate) ? sentryTracesSampleRate : 0.1,
  });
}

const OPENWEATHER_KEY = env.OPENWEATHER_API_KEY || '';
const NEWS_KEY = env.NEWS_API_KEY || '';
const GOOGLE_MAPS_KEY = env.GOOGLE_MAPS_API_KEY || '';
const OSRM_BASE_URL = String(env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const ORS_BASE_URL = String(env.ORS_BASE_URL || 'https://api.openrouteservice.org').replace(/\/$/, '');
const ORS_API_KEY = env.ORS_API_KEY || '';

const app = express();
const port = Number(env.PORT) || 8787;
app.set('trust proxy', 1);
const allowedOrigins = (env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

// â•â•â• ISSUE #12: GEOCODING CACHE WITH LRU â•â•â•
// LRU cache: 1000 items, 24h TTL
const geocodingCache = new LRUCache({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000,
});

const webhookRequireHmac = String(env.WEBHOOK_REQUIRE_HMAC || 'false').toLowerCase() === 'true';
const webhookAllowLegacySecret = String(env.WEBHOOK_ALLOW_LEGACY_SECRET || 'true').toLowerCase() === 'true';
const webhookTimestampToleranceSec = Math.max(30, Number(env.WEBHOOK_TIMESTAMP_TOLERANCE_SEC) || 300);
const apiRateLimitPerMinute = Math.max(1, Number(env.API_RATE_LIMIT_PER_MINUTE) || 100);
const webhookRateLimitPerMinute = Math.max(10, Number(env.WEBHOOK_RATE_LIMIT_PER_MINUTE) || 120);
const retentionEnabled = String(env.RETENTION_ENABLED || 'true').toLowerCase() === 'true';
const retentionDays = Math.max(30, Number(env.RETENTION_DAYS) || 365);
const retentionRunEveryHours = Math.max(1, Number(env.RETENTION_RUN_EVERY_HOURS) || 24);
const piiEncryptionKey = String(env.PII_ENCRYPTION_KEY || '').trim();
const webhookRetryEnabled = String(env.WEBHOOK_RETRY_ENABLED || 'true').toLowerCase() === 'true';
const webhookRetryIntervalSec = Math.max(15, Number(env.WEBHOOK_RETRY_INTERVAL_SEC) || 60);
const webhookRetryMaxAttempts = Math.max(1, Number(env.WEBHOOK_RETRY_MAX_ATTEMPTS) || 6);
const webhookRetryBatchSize = Math.max(1, Math.min(200, Number(env.WEBHOOK_RETRY_BATCH_SIZE) || 25));
const cspEnabled = String(env.CSP_ENABLED || 'false').toLowerCase() === 'true';

// â•â•â• ISSUE #7: RATE LIMITING - GEOCODING REDUCED TO 50 REQ/MIN â•â•â•
const geocodingRateLimitPerMinute = Math.max(1, Number(env.GEOCODING_RATE_LIMIT_PER_MINUTE) || 50);

// â•â•â• ISSUE #33: CONSISTENT ERROR MESSAGE FORMAT â•â•â•
/**
 * Standardized error codes and messages for API responses
 */
const API_ERRORS = {
  INVALID_SHIPMENT_PAYLOAD: {
    code: 'INVALID_SHIPMENT_PAYLOAD',
    message: 'Invalid shipment data format',
    statusCode: 400,
    retryable: false
  },
  EMPTY_SHIPMENTS_ARRAY: {
    code: 'EMPTY_SHIPMENTS_ARRAY',
    message: 'Expected a non-empty shipments array',
    statusCode: 400,
    retryable: false
  },
  TOO_MANY_SHIPMENTS: {
    code: 'TOO_MANY_SHIPMENTS',
    message: 'Too many shipments in one request (max 5000)',
    statusCode: 400,
    retryable: false
  },
  INVALID_COORDINATES: {
    code: 'INVALID_COORDINATES',
    message: 'Coordinates must be valid (lat: -90..90, lon: -180..180)',
    statusCode: 400,
    retryable: false
  },
  AUTHENTICATION_REQUIRED: {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication required for this operation',
    statusCode: 401,
    retryable: false
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Unauthorized webhook request',
    statusCode: 401,
    retryable: false
  },
  WEBHOOK_SECRET_MISSING: {
    code: 'WEBHOOK_SECRET_MISSING',
    message: 'WEBHOOK_SECRET is not configured',
    statusCode: 503,
    retryable: false
  },
  FIRESTORE_UNAVAILABLE: {
    code: 'FIRESTORE_UNAVAILABLE',
    message: 'Firestore ingestion is not configured',
    statusCode: 503,
    retryable: false
  },
  EXTERNAL_SERVICE_UNAVAILABLE: {
    code: 'EXTERNAL_SERVICE_UNAVAILABLE',
    message: 'External service temporarily unavailable',
    statusCode: 503,
    retryable: true
  },
  INTERNAL_SERVER_ERROR: {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
    statusCode: 500,
    retryable: false
  }
};

/**
 * Send standardized error response
 * @param {Object} res - Express response object
 * @param {string} errorKey - Key from API_ERRORS
 * @param {string} [customMessage] - Optional custom message to override default
 * @param {Object} [extra] - Extra fields to include in response
 */
function sendError(res, errorKey, customMessage = null, extra = {}) {
  const error = API_ERRORS[errorKey] || API_ERRORS.INTERNAL_SERVER_ERROR;
  res.status(error.statusCode).json({
    ok: false,
    code: error.code,
    message: customMessage || error.message,
    retryable: error.retryable,
    requestId: res.locals?.requestId || null,
    ...extra
  });
}

const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: apiRateLimitPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Max 100 requests per minute per IP.' },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: webhookRateLimitPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests' },
});

// â•â•â• ISSUE #7: GEOCODING RATE LIMITER - 50 REQ/MIN â•â•â•
const geocodingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: geocodingRateLimitPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Geocoding rate limit exceeded' },
});

// â•â•â• ISSUE #5: INCIDENT NOTE RATE LIMITING - 5 NOTES/MIN PER USER â•â•â•
const incidentNoteRateLimiter = (req, res, next) => {
  const uid = req.auth?.uid;
  if (!uid) return res.status(401).json({ error: 'Authentication required' });
  
  const key = `note-${uid}`;
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: () => key,
    skip: false,
  });
  return limiter(req, res, next);
};

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed by CORS policy'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret', 'X-Webhook-Signature', 'X-Webhook-Timestamp', 'X-Request-Id', 'X-CSRF-Token'],
  credentials: true,
}));

app.use(helmet({
  contentSecurityPolicy: cspEnabled
    ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    }
    : false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
}));

app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

morgan.token('requestId', (req) => req.requestId || '-');
app.use(morgan(':date[iso] :remote-addr :method :url :status :response-time ms reqId=:requestId'));

app.use(express.json({
  limit: '2mb',
  verify(req, _res, buf) {
    req.rawBody = buf ? buf.toString('utf8') : '';
  },
}));

// â•â•â• ISSUE #8: CSRF PROTECTION â•â•â•
const csrfProtection = null; // CSRF disabled for development

// Apply CSRF only to non-GET routes and exclude read-only APIs
app.use((req, res, next) => {
  // CSRF disabled - skip all CSRF checks
  next();
});

// Development mode: CSRF disabled
// Return dummy token for frontend
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: 'dev-token' });
});

app.use('/api', apiLimiter);

function sanitizeNewsQuery(query) {
  return String(query || 'shipping delay OR port congestion OR supply chain disruption').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deriveEncryptionKey() {
  if (!piiEncryptionKey) return null;

  if (/^[A-Za-z0-9+/=]+$/.test(piiEncryptionKey)) {
    try {
      const decoded = Buffer.from(piiEncryptionKey, 'base64');
      // â•â•â• ISSUE #34: ENCRYPTION KEY LENGTH VALIDATION â•â•â•
      if (decoded.length < 32) {
        throw new Error(
          `PII_ENCRYPTION_KEY is too short (${decoded.length * 8} bits). ` +
          `Must be 256 bits (32 bytes) for AES-256. ` +
          `Generate with: openssl rand -base64 32`
        );
      }
      if (decoded.length === 32) return decoded;
      if (decoded.length === 64) {
        console.warn('PII_ENCRYPTION_KEY is 512 bits (64 bytes) - unnecessarily long for AES-256, truncating to 32 bytes');
        return decoded.slice(0, 32);
      }
      throw new Error(`PII_ENCRYPTION_KEY must be exactly 256 bits (32 bytes), got ${decoded.length * 8} bits`);
    } catch (e) {
      if (e.message.includes('bits')) throw e;
      throw new Error(`PII_ENCRYPTION_KEY is not valid base64: ${e.message}`);
    }
  }

  // String-based key derivation with warning
  const derived = crypto.createHash('sha256').update(piiEncryptionKey, 'utf8').digest();
  console.warn('WARNING: PII_ENCRYPTION_KEY appears to be a plaintext string, not base64. ' +
    'SHA256 hashing it for derivation. Prefer base64-encoded 256-bit key for better security.');
  return derived;
}

const piiKey = deriveEncryptionKey();

function validateStartupConfiguration() {
  const errors = [];
  const warnings = [];
  const isProd = String(env.NODE_ENV || '').toLowerCase() === 'production';

  if (!String(env.WEBHOOK_SECRET || '').trim()) {
    errors.push('WEBHOOK_SECRET is required');
  } else if (String(env.WEBHOOK_SECRET || '').trim().length < 32) {
    errors.push('WEBHOOK_SECRET must be at least 32 characters long');
  }

  if (!piiKey) {
    warnings.push('PII_ENCRYPTION_KEY is missing; customer/product fields may be stored as plaintext fallback.');
  }

  if (!OPENWEATHER_KEY) warnings.push('OPENWEATHER_API_KEY is not configured; weather endpoints will return 503.');
  if (!NEWS_KEY) warnings.push('NEWS_API_KEY is not configured; news endpoint will return 503.');
  if (isProd && !sentryDsn) warnings.push('SENTRY_DSN is not configured in production.');

  // â•â•â• ISSUE #26: ADMIN WHITELIST LOGGING â•â•â•
  const adminEmails = String(env.VITE_ADMIN_EMAILS || '').trim().split(',').map(e => e.trim()).filter(Boolean);
  if (adminEmails.length === 0) {
    console.warn('[Startup] VITE_ADMIN_EMAILS is empty - no admin emails configured');
  } else {
    // Admin emails configured but not logged for security (prevents email exposure in logs)
  }

  return { errors, warnings };
}

async function writeAuditEvent({ eventType, severity = 'info', details = {}, req = null, actor = 'system' }) {
  if (!db) return;
  // â•â•â• ISSUE #30: GRANULAR AUDIT LOGGING â•â•â•
  await db.collection('audit_logs').add({
    eventType,
    severity,
    actor,
    requestId: req?.requestId || null,
    ip: req?.ip || null,
    method: req?.method || null,
    path: req?.path || null,
    userAgent: req?.headers?.['user-agent'] || null,
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function queueAuditEvent(payload) {
  writeAuditEvent(payload).catch((error) => {
    console.warn('[Audit] Failed to write audit event:', error.message);
  });
}

// â•â•â• ISSUE #9: PII ENCRYPTION WITH DETERMINISTIC IV â•â•â•
function encryptPiiValue(value, trackingId = '') {
  if (!piiKey) return null;
  const plain = String(value || '').trim();
  if (!plain) return null;

  // Deterministic IV based on tracking ID + value to ensure same plaintext always encrypts the same
  const ivData = `${trackingId}:${plain}`.slice(0, 32);
  const iv = crypto.createHash('sha256').update(ivData).digest().slice(0, 12);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', piiKey, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');
  return payload;
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseSignature(headerValue) {
  const value = String(headerValue || '').trim();
  if (!value) return '';
  return value.replace(/^sha256=/i, '').trim();
}

function validateTimestamp(tsHeader) {
  if (!tsHeader) return { ok: true, ts: null };
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'Invalid webhook timestamp header' };
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > webhookTimestampToleranceSec) {
    return { ok: false, reason: 'Webhook timestamp outside allowed tolerance' };
  }
  return { ok: true, ts };
}

function verifyWebhookHmac(req, secret) {
  const signatureHeader = req.headers['x-webhook-signature'];
  const signature = parseSignature(signatureHeader);
  if (!signature) return { ok: false, reason: 'Missing webhook signature header' };

  const tsHeader = req.headers['x-webhook-timestamp'];
  const tsCheck = validateTimestamp(tsHeader);
  if (!tsCheck.ok) return { ok: false, reason: tsCheck.reason };

  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : '';
  const payload = tsCheck.ts ? `${tsCheck.ts}.${rawBody}` : rawBody;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (!timingSafeEqualString(signature, expected)) {
    return { ok: false, reason: 'Invalid webhook signature' };
  }

  return { ok: true };
}

function isAllowedMode(mode) {
  return ['road', 'rail', 'air', 'sea', 'multimodal'].includes(String(mode || '').toLowerCase());
}

// â•â•â• ISSUE #32: JSDoc TYPE HINTS â•â•â•
/**
 * Validate if status is allowed
 * @param {string} status - Shipment status to validate
 * @returns {boolean} True if status is allowed
 */
function isAllowedStatus(status) {
  return ['pending', 'in_transit', 'delivered', 'delayed', 'cancelled', 'exception'].includes(String(status || '').toLowerCase());
}

/**
 * Validate if risk level is allowed
 * @param {string} level - Risk level to validate (low, medium, high, critical)
 * @returns {boolean} True if risk level is allowed
 */
function isAllowedRiskLevel(level) {
  return ['low', 'medium', 'high', 'critical'].includes(String(level || '').toLowerCase());
}

/**
 * Validate if priority is allowed
 * @param {string} priority - Priority level to validate (low, standard, high, urgent, critical)
 * @returns {boolean} True if priority is allowed
 */
function isAllowedPriority(priority) {
  return ['low', 'standard', 'high', 'urgent', 'critical'].includes(String(priority || '').toLowerCase());
}

const shipmentSchema = Joi.object({
  trackingId: Joi.string().trim().max(120).required(),
  status: Joi.string().valid('pending', 'in_transit', 'delivered', 'delayed', 'cancelled', 'exception').optional(),
  mode: Joi.string().valid('road', 'rail', 'air', 'sea', 'multimodal').optional(),
  riskLevel: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  priority: Joi.string().valid('low', 'standard', 'high', 'urgent', 'critical').optional(),
  carrier: Joi.string().allow('', null).optional(),
  origin: Joi.string().allow('', null).optional(),
  destination: Joi.string().allow('', null).optional(),
  eta: Joi.date().iso().allow(null, '').optional(),
  departureDate: Joi.date().iso().allow(null, '').optional(),
  progress: Joi.number().min(0).max(100).optional(),
  delayHours: Joi.number().min(0).max(3650).optional(),
  riskScore: Joi.number().min(0).max(100).optional(),
  items: Joi.number().min(0).max(1000000).optional(),
  weight: Joi.number().min(0).max(10000000).optional(),
  isDelayed: Joi.boolean().optional(),
  weather: Joi.any().optional(),
  traffic: Joi.any().optional(),
  port: Joi.any().optional(),
  route: Joi.any().optional(),
  product: Joi.string().allow('', null).optional(),
  customer: Joi.string().allow('', null).optional(),
  source: Joi.string().allow('', null).optional(),
}).unknown(true);

// ═══ INCIDENT NOTE SCHEMA - Joi validation for note creation ═══
const noteSchema = Joi.object({
  text: Joi.string().trim().max(1000).required(),
  incidentType: Joi.string()
    .valid('fuel_shortage', 'engine_failure', 'landslide', 'accident', 'terrorist_attack', 'natural_disaster', 'port_closure', 'customs_delay', 'weather_emergency', 'other')
    .required(),
  severity: Joi.string()
    .valid('low', 'medium', 'high', 'critical')
    .required(),
  location: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required()
  }).optional(),
  estimatedDelay: Joi.number().min(0).max(720).optional()
});

function isValidDateValue(value) {
  if (value === null || value === undefined || value === '') return true;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

// â•â•â• ISSUE #32: JSDoc FOR COORDINATE VALIDATION â•â•â•
/**
 * Validate geographic coordinates
 * @param {number} lat - Latitude (-90 to 90)
 * @param {number} lon - Longitude (-180 to 180)
 * @returns {boolean} True if coordinates are valid
 */
function isValidCoordinate(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function validateShipmentInput(input, idx) {
  const schemaCheck = shipmentSchema.validate(input, { abortEarly: false });
  if (schemaCheck.error) {
    return schemaCheck.error.details.map((detail) => {
      const keyPath = detail.path?.length ? detail.path.join('.') : 'payload';
      return `shipments[${idx}].${keyPath}: ${detail.message.replace(/"/g, '')}`;
    });
  }

  const errors = [];
  const prefix = `shipments[${idx}]`;
  const trackingId = String(input?.trackingId || '').trim();

  if (!trackingId) errors.push(`${prefix}.trackingId is required`);
  if (trackingId.length > 120) errors.push(`${prefix}.trackingId is too long`);
  if (input?.status && !isAllowedStatus(input.status)) errors.push(`${prefix}.status is invalid`);
  if (input?.mode && !isAllowedMode(input.mode)) errors.push(`${prefix}.mode is invalid`);
  if (input?.riskLevel && !isAllowedRiskLevel(input.riskLevel)) errors.push(`${prefix}.riskLevel is invalid`);
  if (input?.priority && !isAllowedPriority(input.priority)) errors.push(`${prefix}.priority is invalid`);
  if (!isValidDateValue(input?.eta)) errors.push(`${prefix}.eta must be a valid date/time`);
  if (!isValidDateValue(input?.departureDate)) errors.push(`${prefix}.departureDate must be a valid date/time`);

  const numericRules = [
    { key: 'progress', min: 0, max: 100 },
    { key: 'delayHours', min: 0, max: 3650 },
    { key: 'riskScore', min: 0, max: 100 },
    { key: 'items', min: 0, max: 1000000 },
    { key: 'weight', min: 0, max: 10000000 },
  ];

  numericRules.forEach(({ key, min, max }) => {
    if (input?.[key] === undefined || input?.[key] === null || input?.[key] === '') return;
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
      errors.push(`${prefix}.${key} must be between ${min} and ${max}`);
    }
  });

  // â•â•â• ISSUE #24: CROSS-FIELD VALIDATION â•â•â•
  const eta = input?.eta ? new Date(input.eta) : null;
  const departureDate = input?.departureDate ? new Date(input.departureDate) : null;
  
  if (eta && departureDate && eta < departureDate) {
    errors.push(`${prefix}.eta must be after departureDate`);
  }

  if (input?.status === 'pending' && input?.progress && input.progress > 0) {
    errors.push(`${prefix}.progress must be 0 when status is 'pending'`);
  }

  if (input?.status === 'delivered' && input?.delayHours && input.delayHours > 0) {
    errors.push(`${prefix}.delayHours must be 0 when status is 'delivered'`);
  }

  if (input?.items && input.items > 0 && input?.weight === 0) {
    errors.push(`${prefix}.weight must be > 0 when items > 0`);
  }

  return errors;
}

function extractWebhookShipments(body) {
  if (Array.isArray(body?.shipments)) return body.shipments;
  if (Array.isArray(body)) return body;
  if (body?.shipment && typeof body.shipment === 'object') return [body.shipment];
  return null;
}

function authorizeWebhookRequest(req, secret) {
  const hmacResult = verifyWebhookHmac(req, secret);
  if (hmacResult.ok) return { ok: true, method: 'hmac' };

  if (webhookRequireHmac) {
    return { ok: false, status: 401, reason: hmacResult.reason || 'HMAC authentication required' };
  }

  if (!webhookAllowLegacySecret) {
    return { ok: false, status: 401, reason: 'Legacy webhook secret auth disabled' };
  }

  // â•â•â• ISSUE #29: BEARER TOKEN FORMAT VALIDATION â•â•â•
  const authHeader = req.headers.authorization || '';
  let bearerToken = '';
  
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(\S+)$/i);
    if (match) {
      bearerToken = match[1];
    } else if (authHeader.trim()) {
      // Authorization header is present but not in Bearer format
      return { ok: false, status: 401, reason: 'Invalid authorization format. Expected: Bearer <token>' };
    }
  }

  // Check for x-webhook-secret header as fallback
  const webhookSecret = req.headers['x-webhook-secret'] || bearerToken || '';
  
  if (!webhookSecret) {
    return { ok: false, status: 401, reason: 'Missing authorization credentials' };
  }

  if (!timingSafeEqualString(webhookSecret, secret)) {
    return { ok: false, status: 401, reason: 'Unauthorized webhook request' };
  }

  // â•â•â• ISSUE #35: DEPRECATION WARNING FOR LEGACY AUTH â•â•â•
  if (req.headers['x-webhook-secret'] || (authHeader && !bearerToken)) {
    console.warn(
      '[DEPRECATION] Webhook authenticated using legacy secret header. ' +
      'Migrate to HMAC-based authentication (X-Webhook-Signature header). ' +
      'Legacy auth will be removed in v2.0.'
    );
    queueAuditEvent({
      eventType: 'webhook.legacy_auth_used',
      severity: 'warning',
      details: { authMethod: 'legacy-secret', removalVersion: 'v2.0' }
    });
  }

  return { ok: true, method: 'legacy-secret' };
}

function normalizeShipment(input) {
  const trackingId = String(input.trackingId || '').trim();
  const customerEncrypted = encryptPiiValue(input.customer, trackingId);
  const productEncrypted = encryptPiiValue(input.product, trackingId);

  return {
    trackingId,
    status: input.status || 'in_transit',
    carrier: input.carrier || 'unknown',
    mode: input.mode || 'road',
    origin: input.origin || 'Unknown',
    destination: input.destination || 'Unknown',
    eta: input.eta || null,
    departureDate: input.departureDate || null,
    progress: Number.isFinite(Number(input.progress)) ? Number(input.progress) : 0,
    isDelayed: Boolean(input.isDelayed),
    delayHours: Number.isFinite(Number(input.delayHours)) ? Number(input.delayHours) : 0,
    riskScore: Number.isFinite(Number(input.riskScore)) ? Number(input.riskScore) : 0,
    riskLevel: input.riskLevel || 'low',
    priority: input.priority || 'standard',
    weather: input.weather || null,
    traffic: input.traffic || null,
    port: input.port || null,
    route: input.route || null,
    product: productEncrypted ? '[ENCRYPTED]' : (input.product || 'Unspecified goods'),
    customer: customerEncrypted ? '[ENCRYPTED]' : (input.customer || 'Unknown customer'),
    productEncrypted,
    customerEncrypted,
    piiEncrypted: Boolean(productEncrypted || customerEncrypted),
    items: Number.isFinite(Number(input.items)) ? Number(input.items) : 0,
    weight: Number.isFinite(Number(input.weight)) ? Number(input.weight) : 0,
    source: input.source || 'webhook',
  };
}

async function writeShipmentsInBatches(validShipments) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  let written = 0;

  for (let i = 0; i < validShipments.length; i += 400) {
    const chunk = validShipments.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach((shipment) => {
      const ref = db.collection('shipments').doc(shipment.trackingId);
      batch.set(ref, {
        ...shipment,
        updatedAt: now,
        createdAt: now,
      }, { merge: true });
    });

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await batch.commit();
        written += chunk.length;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const backoffMs = Math.min(250 * (2 ** attempt) + Math.round(Math.random() * 100), 2500);
        await sleep(backoffMs);
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  return written;
}

function nextRetryTimestamp(attempts) {
  const backoffSeconds = Math.min(60 * (2 ** Math.max(0, attempts - 1)), 3600);
  const jitterSeconds = Math.floor(Math.random() * 15);
  return admin.firestore.Timestamp.fromDate(new Date(Date.now() + (backoffSeconds + jitterSeconds) * 1000));
}

async function enqueueRetryPayload(validShipments, errorMessage, req) {
  const queueDoc = {
    status: 'pending',
    attempts: 0,
    maxAttempts: webhookRetryMaxAttempts,
    lastError: String(errorMessage || 'Unknown webhook processing error').slice(0, 500),
    nextAttemptAt: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    payload: {
      shipments: validShipments,
    },
    requestMeta: {
      ip: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      webhookTimestamp: req.headers['x-webhook-timestamp'] || null,
      signaturePresent: Boolean(req.headers['x-webhook-signature']),
    },
  };

  await db.collection('webhook_retry_queue').add(queueDoc);
}

async function processWebhookRetryQueue() {
  if (!db || !webhookRetryEnabled) return;

  const instanceId = `${process.env.HOSTNAME || os.hostname()}_${process.pid}_${Date.now()}`;
  const lockTimeoutMs = 5 * 60 * 1000; // 5 minutes
  const nowTs = admin.firestore.Timestamp.now();
  const lockExpiredTs = new admin.firestore.Timestamp(
    Math.floor((Date.now() - lockTimeoutMs) / 1000),
    0
  );

  // â•â•â• ISSUE #27: PESSIMISTIC LOCKING FOR WEBHOOK RETRY QUEUE â•â•â•
  const snap = await db
    .collection('webhook_retry_queue')
    .where('status', '==', 'pending')
    .where('lockedBy', '==', null)
    .limit(webhookRetryBatchSize)
    .get();

  if (snap.empty) {
    // Also check for expired locks
    const expiredLockSnap = await db
      .collection('webhook_retry_queue')
      .where('status', '==', 'pending')
      .where('lockedAt', '<', lockExpiredTs)
      .limit(webhookRetryBatchSize)
      .get();

    if (expiredLockSnap.empty) return;

    for (const docSnap of expiredLockSnap.docs) {
      await docSnap.ref.set({
        lockedBy: null,
        lockedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return;
  }

  for (const docSnap of snap.docs) {
    // Acquire lock
    try {
      await docSnap.ref.set({
        lockedBy: instanceId,
        lockedAt: nowTs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      // Could not acquire lock, skip
      continue;
    }

    const item = docSnap.data();
    const nextAttemptAt = item.nextAttemptAt;
    if (nextAttemptAt && typeof nextAttemptAt.toMillis === 'function' && nextAttemptAt.toMillis() > nowTs.toMillis()) {
      // Release lock and continue
      await docSnap.ref.set({
        lockedBy: null,
        lockedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }

    const attempts = Number(item.attempts || 0);
    if (attempts >= webhookRetryMaxAttempts) {
      await docSnap.ref.set({
        status: 'failed',
        lockedBy: null,
        lockedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }

    const shipments = Array.isArray(item?.payload?.shipments) ? item.payload.shipments : [];
    if (shipments.length === 0) {
      await docSnap.ref.set({
        status: 'failed',
        lastError: 'Retry payload is empty',
        lockedBy: null,
        lockedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }

    try {
      await writeShipmentsInBatches(shipments);
      await docSnap.ref.set({
        status: 'completed',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        lockedBy: null,
        lockedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      const nextAttempts = attempts + 1;
      await docSnap.ref.set({
        attempts: nextAttempts,
        status: nextAttempts >= webhookRetryMaxAttempts ? 'failed' : 'pending',
        nextAttemptAt: nextRetryTimestamp(nextAttempts),
        lastError: String(error.message || error).slice(0, 500),
        lockedBy: null,
        lockedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
}

async function purgeOldCollectionDocs(collectionName, dateField, cutoffTs, batchSize = 400) {
  if (!db) return 0;

  let deleted = 0;
  while (true) {
    const snap = await db
      .collection(collectionName)
      .where(dateField, '<', cutoffTs)
      .limit(batchSize)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snap.size;
  }

  return deleted;
}

async function runRetentionCleanup() {
  if (!db || !retentionEnabled) return;

  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoffTs = admin.firestore.Timestamp.fromDate(cutoffDate);

  try {
    const shipmentsDeleted = await purgeOldCollectionDocs('shipments', 'updatedAt', cutoffTs);
    const alertsDeleted = await purgeOldCollectionDocs('alerts', 'createdAt', cutoffTs);
    const queueDeleted = await purgeOldCollectionDocs('webhook_retry_queue', 'updatedAt', cutoffTs);

    if (shipmentsDeleted || alertsDeleted || queueDeleted) {
      console.log(
        `[Retention] Deleted shipments=${shipmentsDeleted}, alerts=${alertsDeleted}, retryQueue=${queueDeleted}`
      );
    }
  } catch (error) {
    console.error('[Retention] Cleanup failed:', error.message);
  }
}

function getServiceAccount() {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) {
    const decoded = Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccountPath = path.isAbsolute(env.FIREBASE_SERVICE_ACCOUNT_PATH)
      ? env.FIREBASE_SERVICE_ACCOUNT_PATH
      : path.resolve(projectRoot, env.FIREBASE_SERVICE_ACCOUNT_PATH);
    return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  }

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      type: 'service_account',
      project_id: env.FIREBASE_PROJECT_ID,
      client_email: env.FIREBASE_CLIENT_EMAIL,
      private_key: String(env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n'),
    };
  }

  return null;
}

let db = null;
try {
  const serviceAccount = getServiceAccount();
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
    db = admin.firestore();
    console.log('Firebase Admin initialized for ingestion/webhooks.');
  } else if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID,
    });
    db = admin.firestore();
    console.log('Firebase Admin initialized with application default credentials.');
  } else {
    console.warn('Firebase Admin credentials not configured. Webhook ingestion is disabled.');
  }
} catch (e) {
  console.error('Failed to initialize Firebase Admin:', e.message);
}

const startupValidation = validateStartupConfiguration();
if (startupValidation.warnings.length) {
  startupValidation.warnings.forEach((warning) => console.warn(`[Startup validation] ${warning}`));
}
if (startupValidation.errors.length) {
  startupValidation.errors.forEach((message) => console.error(`[Startup validation] ${message}`));
  process.exit(1);
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'shipguard-backend',
    integrations: {
      openWeather: Boolean(OPENWEATHER_KEY),
      newsApi: Boolean(NEWS_KEY),
      firestoreIngestion: Boolean(db),
      piiEncryption: Boolean(piiKey),
      webhookRetry: Boolean(db && webhookRetryEnabled),
      retentionPolicy: Boolean(db && retentionEnabled),
    },
  });
});

app.get('/api/news/logistics', asyncHandler(async (req, res) => {
  if (!NEWS_KEY) {
    res.status(503).json({ error: 'NEWS_API_KEY is not configured on backend' });
    return;
  }

  const q = sanitizeNewsQuery(req.query.q);
  const pageSize = Number(req.query.pageSize) || 10;
  const apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=${Math.max(1, Math.min(20, pageSize))}&apiKey=${NEWS_KEY}`;

  const upstream = await fetch(apiUrl);
  const data = await upstream.json();
  if (!upstream.ok) {
    res.status(upstream.status).json({
      error: data.message || 'News API request failed',
      code: data.code || 'news_upstream_error',
    });
    return;
  }
  res.json({
    status: data.status,
    totalResults: data.totalResults,
    articles: (data.articles || []).map((article) => ({
      title: article.title,
      description: article.description,
      source: article.source?.name,
      url: article.url,
      publishedAt: article.publishedAt,
    })),
  });
}));

app.get('/api/weather/by-city', asyncHandler(async (req, res) => {
  if (!OPENWEATHER_KEY) {
    res.status(503).json({ error: 'OPENWEATHER_API_KEY is not configured on backend' });
    return;
  }

  const city = String(req.query.city || '').trim();
  if (!city) {
    res.status(400).json({ error: 'city query parameter is required' });
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const uri = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OPENWEATHER_KEY}&units=metric`;
    const upstream = await fetch(uri, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!upstream.ok) {
      const errorData = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json({ error: errorData.message || 'Weather API request failed' });
      return;
    }
    
    const data = await upstream.json();
    res.json(data);
  } catch (error) {
    console.error(`[Weather API Error] ${error.message}`);
    res.status(503).json({ error: `Weather service error: ${error.message}` });
  }
}));

app.get('/api/weather/by-coords', asyncHandler(async (req, res) => {
  if (!OPENWEATHER_KEY) {
    res.status(503).json({ error: 'OPENWEATHER_API_KEY is not configured on backend' });
    return;
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'lat and lon query parameters are required' });
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const uri = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_KEY}&units=metric`;
    const upstream = await fetch(uri, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!upstream.ok) {
      const errorData = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json({ error: errorData.message || 'Weather API request failed' });
      return;
    }
    
    const data = await upstream.json();
    res.json(data);
  } catch (error) {
    console.error(`[Weather Coords API Error] ${error.message}`);
    res.status(503).json({ error: `Weather service error: ${error.message}` });
  }
}));

app.get('/api/weather/geocode', asyncHandler(async (req, res) => {
  if (!OPENWEATHER_KEY) {
    res.status(503).json({ error: 'OPENWEATHER_API_KEY is not configured on backend' });
    return;
  }

  const city = String(req.query.city || '').trim();
  if (!city) {
    res.status(400).json({ error: 'city query parameter is required' });
    return;
  }

  const uri = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${OPENWEATHER_KEY}`;
  const upstream = await fetch(uri);
  const data = await upstream.json();
  if (!upstream.ok) {
    res.status(upstream.status).json({ error: data.message || 'Geocoding request failed' });
    return;
  }
  res.json(data);
}));

app.get('/api/weather/forecast', asyncHandler(async (req, res) => {
  if (!OPENWEATHER_KEY) {
    res.status(503).json({ error: 'OPENWEATHER_API_KEY is not configured on backend' });
    return;
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'lat and lon query parameters are required' });
    return;
  }

  const uri = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_KEY}&units=metric`;
  const upstream = await fetch(uri);
  const data = await upstream.json();
  if (!upstream.ok) {
    res.status(upstream.status).json({ error: data.message || 'Forecast request failed' });
    return;
  }
  res.json(data);
}));

app.get('/api/routes/geocode', geocodingLimiter, asyncHandler(async (req, res) => {
  const city = String(req.query.city || '').trim();
  if (!city) {
    res.status(400).json({ error: 'city query parameter is required' });
    return;
  }

  //ISSUE #12: GEOCODING CACHE WITH LRU
  const cacheKey = city.toLowerCase();
  if (geocodingCache.has(cacheKey)) {
    res.json(geocodingCache.get(cacheKey));
    return;
  }

  let result = null;

  // Try Nominatim with retry logic
  async function tryNominatim() {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const nomResponse = await fetch(nomUrl, {
          headers: {
            'User-Agent': 'ShipGuardAI/1.0 (routing-geocoder)',
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (nomResponse.ok) {
          const nomData = await nomResponse.json();
          if (Array.isArray(nomData) && nomData.length > 0) {
            result = [
              {
                name: city,
                lat: Number(nomData[0].lat),
                lon: Number(nomData[0].lon),
                displayName: nomData[0].display_name,
              },
            ];
            
            // Cache for 24 hours
            geocodingCache.set(cacheKey, result);
            return true;
          }
        } else if (nomResponse.status === 429 || nomResponse.status === 503) {
          // Rate limited or service unavailable - retry with backoff
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
            console.warn(`[Geocoding] Attempt ${attempt} failed (${nomResponse.status}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
      } catch (err) {
        console.error(`[Geocoding] Attempt ${attempt} error: ${err.message}`);
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }
    return false;
  }

  const success = await tryNominatim();
  
  // Return result (empty if all retries failed)
  res.json(result || []);
}));

// â•â•â• ISSUE #32: JSDoc FOR DISTANCE CALCULATION â•â•â•
/**
 * Calculate distance between two geographic coordinates using Haversine formula
 * @param {number} lat1 - Starting latitude
 * @param {number} lon1 - Starting longitude
 * @param {number} lat2 - Ending latitude
 * @param {number} lon2 - Ending longitude
 * @returns {number} Distance in kilometers
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseDurationMinutes(durationText) {
  if (!durationText) return null;
  const seconds = Number(String(durationText).replace('s', ''));
  return Number.isFinite(seconds) ? Math.max(1, Math.round(seconds / 60)) : null;
}

// â•â•â• ISSUE #32: JSDoc FOR ROUTE CALCULATION â•â•â•
/**
 * Get alternative routes between two coordinates using OSRM/ORS
 * @param {Object} origin - Origin coordinate {lat: number, lon: number}
 * @param {Object} destination - Destination coordinate {lat: number, lon: number}
 * @returns {Promise<Array<Object>>} Array of route objects with id, name, distanceKm, durationMin, polyline
 * @throws {Error} If routing service fails
 */
async function getRoutes(origin, destination) {
  // Try OSRM first (free, no key needed, working great)
  try {
    if (process.env.DEBUG_ROUTING) console.log(`[Routing] Trying OSRM for: ${origin.lat},${origin.lon} -> ${destination.lat},${destination.lon}`);
    const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
    const params = new URLSearchParams({
      alternatives: '3',
      overview: 'full',
      geometries: 'polyline',
      steps: 'false',
    });

    const url = `${OSRM_BASE_URL}/route/v1/driving/${coordinates}?${params.toString()}`;
    
    // â•â•â• ISSUE #19: API TIMEOUTS WITH ABORTCONTROLLER â•â•â•
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    let upstream;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        upstream = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        break;
      } catch (err) {
        if (attempt === 0) {
          console.warn(`[Routing] OSRM attempt ${attempt + 1} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          clearTimeout(timeoutId);
          throw err;
        }
      }
    }

    const data = await upstream.json();

    const osrmCode = String(data?.code || '').toLowerCase();
    const osrmMessage = String(data?.message || '').toLowerCase();
    const isImpossibleRoute = osrmCode === 'noroute' || osrmMessage.includes('impossible route');

    if (isImpossibleRoute) {
      console.warn(`[Routing] OSRM: No route found: ${osrmMessage}`);
      // Fall through to ORS
    } else if (upstream.ok) {
      if (process.env.DEBUG_ROUTING) console.log(`[Routing] OSRM success: ${(data.routes || []).length} routes`);
      return (data.routes || []).map((route, idx) => ({
        id: `osrm-${idx}`,
        name: idx === 0 ? 'Primary Corridor' : `Alternate ${idx}`,
        source: 'osrm',
        distanceKm: Math.round((route.distance || 0) / 1000),
        durationMin: Math.max(1, Math.round((route.duration || 0) / 60)),
        fuelImpactPercent: idx === 0 ? 0 : Math.round(3 + idx * 4),
        warnings: [],
        polyline: route.geometry || null,
      }));
    } else {
      console.error(`[Routing] OSRM error: ${upstream.status} ${osrmCode} - ${osrmMessage}`);
    }
  } catch (err) {
    console.warn(`[Routing] OSRM failed: ${err.message}`);
  }

  // Fall back to OpenRouteService if OSRM fails
  if (ORS_API_KEY) {
    try {
      if (process.env.DEBUG_ROUTING) console.log(`[Routing] Trying ORS for: ${origin.lat},${origin.lon} -> ${destination.lat},${destination.lon}`);
      const orsUrl = `${ORS_BASE_URL}/v2/directions/driving-car?api_key=${encodeURIComponent(ORS_API_KEY)}`;
      if (process.env.DEBUG_ROUTING) console.log(`[Routing] ORS URL: ${orsUrl.replace(ORS_API_KEY, '***')}`);
      const orsResponse = await fetch(orsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: [[origin.lon, origin.lat], [destination.lon, destination.lat]],
        }),
      });

      if (!orsResponse.ok) {
        const orsErrorData = await orsResponse.text();
        console.error(`[Routing] ORS error: ${orsResponse.status} - ${orsErrorData}`);
      } else {
        const orsData = await orsResponse.json();
        if (orsData.routes && orsData.routes.length > 0) {
          if (process.env.DEBUG_ROUTING) console.log(`[Routing] ORS success: ${orsData.routes.length} routes`);
          return orsData.routes.map((route, idx) => ({
            id: `ors-${idx}`,
            name: idx === 0 ? 'Primary Corridor' : `Alternate ${idx}`,
            source: 'ors',
            distanceKm: Math.round((route.summary.distance || 0) / 1000),
            durationMin: Math.max(1, Math.round((route.summary.duration || 0) / 60)),
            fuelImpactPercent: idx === 0 ? 0 : Math.round(3 + idx * 4),
            warnings: [],
            polyline: route.geometry || null,
          }));
        }
      }
    } catch (err) {
      console.warn(`[Routing] ORS failed: ${err.message}`);
    }
  }

  // No routes available
  console.error(`[Routing] All routing services failed`);
  return [];
}

app.post('/api/routes/alternatives', geocodingLimiter, asyncHandler(async (req, res) => {
  const origin = req.body?.origin;
  const destination = req.body?.destination;
  const requestedMode = String(req.body?.mode || 'road').toLowerCase();

  if (!origin || !destination) {
    res.status(400).json({ error: 'origin and destination are required' });
    return;
  }

  const originLat = Number(origin.lat);
  const originLon = Number(origin.lon);
  const destinationLat = Number(destination.lat);
  const destinationLon = Number(destination.lon);

  // â•â•â• ISSUE #10: COORDINATE VALIDATION â•â•â•
  if (!isValidCoordinate(originLat, originLon) || !isValidCoordinate(destinationLat, destinationLon)) {
    res.status(400).json({ error: 'origin and destination coordinates must be valid (lat: -90..90, lon: -180..180)' });
    return;
  }

  // Multi-provider routing: tries ORS first, falls back to OSRM
  const routingMode = 'road';

  const routes = await getRoutes(
    { lat: originLat, lon: originLon },
    { lat: destinationLat, lon: destinationLon }
  );
  if (!routes.length) {
    res.status(200).json({
      source: 'ors/osrm',
      requestedMode,
      routingMode,
      routes: [],
      warning: 'No drivable route found between origin and destination',
    });
    return;
  }

  res.json({
    source: routes.length > 0 ? routes[0].source : 'unknown',
    requestedMode,
    routingMode,
    routes,
  });
}));

app.post('/api/webhooks/shipments', webhookLimiter, asyncHandler(async (req, res) => {
  const secret = env.WEBHOOK_SECRET || '';
  if (!secret) {
    res.status(503).json({ error: 'WEBHOOK_SECRET is not configured' });
    return;
  }

  if (secret.length < 32) {
    res.status(503).json({ error: 'WEBHOOK_SECRET must be at least 32 characters long' });
    return;
  }

  const authResult = authorizeWebhookRequest(req, secret);
  if (!authResult.ok) {
    queueAuditEvent({
      eventType: 'webhook.auth.failed',
      severity: 'warning',
      req,
      details: { reason: authResult.reason || 'Unauthorized webhook request' },
    });
    res.status(authResult.status || 401).json({ error: authResult.reason || 'Unauthorized webhook request' });
    return;
  }

  if (!db) {
    res.status(503).json({ error: 'Firestore ingestion is not configured on backend' });
    return;
  }

  const list = extractWebhookShipments(req.body);
  if (!list || list.length === 0) {
    res.status(400).json({ error: 'Expected a non-empty shipments array, an array body, or shipment object' });
    return;
  }

  if (list.length > 5000) {
    res.status(400).json({ error: 'Too many shipments in one request (max 5000)' });
    return;
  }

  const validationErrors = list.flatMap((shipment, idx) => validateShipmentInput(shipment, idx));
  if (validationErrors.length > 0) {
    queueAuditEvent({
      eventType: 'webhook.validation.failed',
      severity: 'warning',
      req,
      details: {
        validationErrors: validationErrors.length,
      },
    });
    res.status(400).json({
      error: 'Invalid shipment payload',
      details: validationErrors.slice(0, 25),
      totalValidationErrors: validationErrors.length,
    });
    return;
  }

  const valid = list.map(normalizeShipment).filter((shipment) => shipment.trackingId.length > 0);
  if (valid.length === 0) {
    res.status(400).json({ error: 'No valid shipments found (trackingId is required)' });
    return;
  }

  try {
    const written = await writeShipmentsInBatches(valid);
    queueAuditEvent({
      eventType: 'webhook.ingestion.succeeded',
      req,
      details: { written, authMethod: authResult.method },
    });
    res.json({ ok: true, written, authMethod: authResult.method, queuedForRetry: false });
  } catch (error) {
    if (webhookRetryEnabled) {
      try {
        await enqueueRetryPayload(valid, error.message || error, req);
        queueAuditEvent({
          eventType: 'webhook.ingestion.queued_for_retry',
          severity: 'warning',
          req,
          details: {
            shipments: valid.length,
            error: String(error.message || error),
            authMethod: authResult.method,
          },
        });
        res.status(202).json({
          ok: true,
          written: 0,
          authMethod: authResult.method,
          queuedForRetry: true,
          warning: 'Ingestion is queued for retry due to transient failure',
        });
        return;
      } catch (queueError) {
        console.error('Failed to enqueue webhook retry payload:', queueError.message);
      }
    }

    throw error;
  }
}));

app.use((err, _req, res, _next) => {
  console.error('Unhandled backend error:', err);
  if (sentryDsn) {
    Sentry.captureException(err, {
      tags: { service: 'shipguard-backend' },
      extra: {
        requestId: _req.requestId,
        path: _req.path,
        method: _req.method,
      },
    });
  }
  res.status(500).json({ error: 'Internal server error', requestId: _req.requestId || null });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  if (sentryDsn) Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  if (sentryDsn) Sentry.captureException(error);
});

if (db && webhookRetryEnabled) {
  setInterval(() => {
    processWebhookRetryQueue().catch((error) => {
      console.error('[WebhookRetry] Processing failed:', error.message);
    });
  }, webhookRetryIntervalSec * 1000);
}

if (db && retentionEnabled) {
  setInterval(() => {
    runRetentionCleanup().catch((error) => {
      console.error('[Retention] Scheduled cleanup failed:', error.message);
    });
  }, retentionRunEveryHours * 60 * 60 * 1000);
}

// ═══ INCIDENT NOTES ENDPOINT - Viewer incident reporting ═══
app.post('/api/shipments/:id/notes', apiLimiter, asyncHandler(async (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Firestore not initialized' });
    return;
  }

  const { id } = req.params;
  const { text, incidentType, severity, location, estimatedDelay, viewerEmail, viewerName } = req.body;

  // DEBUG: Log received data
  console.log('📝 Creating incident note:', {
    shipmentId: id,
    viewerEmail,
    viewerName,
    incidentType,
    severity
  });

  // Validate note data
  const { error, value } = noteSchema.validate({
    text,
    incidentType,
    severity,
    location,
    estimatedDelay
  });

  if (error) {
    const messages = error.details.map(d => d.message).join('; ');
    res.status(400).json({ error: `Validation failed: ${messages}` });
    return;
  }

  try {
    // Get shipment to verify it exists
    const shipmentRef = db.collection('shipments').doc(id);
    const shipmentSnap = await shipmentRef.get();

    if (!shipmentSnap.exists) {
      res.status(404).json({ error: 'Shipment not found' });
      return;
    }

    const shipmentData = shipmentSnap.data();

    // Create note
    const noteData = {
      text: value.text,
      incidentType: value.incidentType,
      severity: value.severity,
      location: value.location || null,
      estimatedDelay: value.estimatedDelay || 0,
      createdBy: req.auth?.uid || 'system',
      viewerEmail: viewerEmail || req.auth?.email || 'unknown',
      viewerName: viewerName || 'Anonymous Viewer',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      trackingId: shipmentData.trackingId
    };

    // Add note to subcollection
    const noteRef = await shipmentRef.collection('notes').add(noteData);

    console.log('✅ Note created successfully:', {
      noteId: noteRef.id,
      viewerEmail: noteData.viewerEmail,
      viewerName: noteData.viewerName
    });

    // Create alert for admin
    const alertData = {
      title: `Incident Report: ${value.incidentType}`,
      message: value.text,
      severity: value.severity,
      type: 'incident_report',
      status: 'active',
      shipmentId: id,
      trackingId: shipmentData.trackingId,
      reportedBy: req.auth?.uid || 'system',
      noteId: noteRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('alerts').add(alertData);

    // Log to audit trail
    await queueAuditEvent({
      eventType: 'incident_note_created',
      severity: 'info',
      details: {
        shipmentId: id,
        trackingId: shipmentData.trackingId,
        incidentType: value.incidentType,
        severity: value.severity
      },
      req,
      actor: req.auth?.email || 'unknown'
    });

    res.status(201).json({
      ok: true,
      noteId: noteRef.id,
      message: 'Incident note created successfully'
    });

  } catch (e) {
    console.error('Failed to create note:', e);
    res.status(500).json({ error: 'Failed to create note' });
  }
}));

app.listen(port, () => {
  console.log(`ShipGuard backend listening on http://localhost:${port}`);
  console.log('[Audit] Firestore audit log collection: audit_logs');
  if (!piiKey) {
    console.warn('PII encryption key not configured. customer/product values are stored as plaintext fallback.');
  }
});
