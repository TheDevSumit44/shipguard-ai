/**
 * CSRF Token Management
 * Handles fetching and storing CSRF tokens for protecting against Cross-Site Request Forgery attacks
 */

import * as Sentry from '@sentry/react';

let cachedCsrfToken = null;

/**
 * Fetch a fresh CSRF token from the backend
 */
export async function fetchCsrfToken() {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';
    const response = await fetch(`${backendUrl}/api/csrf-token`, {
      method: 'GET',
      credentials: 'include', // Include cookies for double-submit pattern
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch CSRF token: ${response.statusText}`);
    }

    const { csrfToken } = await response.json();
    if (!csrfToken) {
      throw new Error('No CSRF token in response');
    }

    cachedCsrfToken = csrfToken;
    return csrfToken;
  } catch (error) {
    console.error('[CSRF] Failed to fetch token:', error.message);
    
    // ═══ ISSUE #23: SENTRY ERROR REPORTING ═══
    // Report CSRF failures for visibility (potential misconfiguration)
    Sentry.captureMessage(
      `CSRF token fetch failed: ${error.message}`,
      'warning'
    );
    
    // Return null - endpoint may not be available in all environments
    return null;
  }
}

/**
 * Get cached CSRF token or fetch a new one
 */
export async function getCsrfToken() {
  if (cachedCsrfToken) {
    return cachedCsrfToken;
  }
  return fetchCsrfToken();
}

/**
 * Add CSRF token to request headers if needed
 * Called before state-changing requests (POST, PUT, PATCH, DELETE)
 */
export async function addCsrfToHeaders(headers = {}, method = 'GET') {
  // Only add CSRF token for state-changing operations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    return headers;
  }

  const token = await getCsrfToken();
  if (!token) {
    // CSRF protection unavailable - request will still work but with lower CSRF protection
    return headers;
  }

  return {
    ...headers,
    'X-CSRF-Token': token,
  };
}

/**
 * Clear cached token (e.g., after logout or token expiration)
 */
export function clearCsrfToken() {
  cachedCsrfToken = null;
}
