/**
 * Conditional Logger Utility
 * Logs only in development mode or when DEBUG is enabled
 * 
 * Usage:
 * import { debug, info, warn, error } from '@/lib/logger';
 * 
 * debug('Development only message');
 * info('Important info - shown in dev and when DEBUG=true');
 * warn('Warning message');
 * error('Error message');
 */

const isDev = import.meta.env.DEV;
const debugEnabled = import.meta.env.VITE_DEBUG === 'true' || (typeof window !== 'undefined' && window.__DEBUG_MODE__ === true);

/**
 * Debug log - only in development mode
 * @param {string} message
 * @param {any} data
 */
export function debug(message, data) {
  if (isDev || debugEnabled) {
    console.log(`[DEBUG] ${message}`, data || '');
  }
}

/**
 * Info log - shown in dev and when DEBUG enabled
 * @param {string} message
 * @param {any} data
 */
export function info(message, data) {
  if (isDev || debugEnabled) {
    console.info(`[INFO] ${message}`, data || '');
  }
}

/**
 * Warning log - always shown (but conditional on production flag)
 * @param {string} message
 * @param {any} data
 */
export function warn(message, data) {
  if (isDev || debugEnabled) {
    console.warn(`[WARN] ${message}`, data || '');
  }
}

/**
 * Error log - always shown for error tracking
 * @param {string} message
 * @param {Error} error
 */
export function logError(message, error) {
  console.error(`[ERROR] ${message}`, error?.message || error || '');
  
  // Send to error tracking service (Sentry) if available
  if (window.__SENTRY__) {
    window.__SENTRY__.captureException(new Error(message), { extra: error });
  }
}

/**
 * Enable debug mode programmatically
 */
export function enableDebugMode() {
  if (typeof window !== 'undefined') {
    window.__DEBUG_MODE__ = true;
    console.log('🐛 Debug mode enabled');
  }
}

/**
 * Disable debug mode programmatically
 */
export function disableDebugMode() {
  if (typeof window !== 'undefined') {
    window.__DEBUG_MODE__ = false;
    console.log('🐛 Debug mode disabled');
  }
}

// Export console compatibility functions (in case code uses console directly)
export const logger = {
  debug,
  info,
  warn,
  error: logError,
  enableDebug: enableDebugMode,
  disableDebug: disableDebugMode,
};

export default logger;
