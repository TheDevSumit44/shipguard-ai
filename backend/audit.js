/**
 * ═══ ISSUE #30: Granular Audit Trail Logging ═══
 * Enhanced audit logging for all sensitive operations
 * Tracks: alert changes, shipment overrides, risk updates, user actions
 */

import admin from 'firebase-admin';

/**
 * Log shipment ingestion event
 * @param {Object} options
 * @param {number} options.count - Number of shipments written
 * @param {string} options.source - Source of shipment (webhook, api, manual)
 * @param {Object} options.req - Express request object
 * @param {string} [options.requestId] - Request ID
 */
export async function auditShipmentIngestion({ count, source, req, requestId }) {
  return writeAuditEvent({
    eventType: 'shipment.ingestion',
    severity: 'info',
    actor: req?.auth?.uid || 'webhook',
    requestId,
    details: {
      shipmentsWritten: count,
      source,
      ip: req?.ip,
    },
    req,
  });
}

/**
 * Log alert state change
 * @param {Object} options
 * @param {string} options.alertId - Alert document ID
 * @param {string} options.oldStatus - Previous status
 * @param {string} options.newStatus - New status
 * @param {string} [options.reason] - Reason for change
 * @param {Object} options.req - Express request object
 */
export async function auditAlertChange({ alertId, oldStatus, newStatus, reason, req }) {
  return writeAuditEvent({
    eventType: 'alert.status_changed',
    severity: 'warning',
    actor: req?.auth?.uid || 'system',
    details: {
      alertId,
      previousStatus: oldStatus,
      newStatus,
      reason: reason || null,
      timestamp: new Date().toISOString(),
    },
    req,
  });
}

/**
 * Log risk score override
 * @param {Object} options
 * @param {string} options.shipmentId - Shipment tracking ID
 * @param {number} options.oldScore - Previous risk score
 * @param {number} options.newScore - New risk score
 * @param {string} [options.reason] - Reason for override
 * @param {Object} options.req - Express request object
 */
export async function auditRiskOverride({ shipmentId, oldScore, newScore, reason, req }) {
  return writeAuditEvent({
    eventType: 'shipment.risk_override',
    severity: 'warning',
    actor: req?.auth?.uid || 'system',
    details: {
      shipmentId,
      previousRiskScore: oldScore,
      newRiskScore: newScore,
      reason: reason || null,
      overrideAmount: Math.abs(newScore - oldScore),
    },
    req,
  });
}

/**
 * Log webhook authentication attempt
 * @param {Object} options
 * @param {boolean} options.success - Whether auth succeeded
 * @param {string} options.method - Auth method (hmac, legacy-secret)
 * @param {string} [options.reason] - Failure reason if unsuccessful
 * @param {Object} options.req - Express request object
 */
export async function auditWebhookAuth({ success, method, reason, req }) {
  return writeAuditEvent({
    eventType: 'webhook.authentication',
    severity: success ? 'info' : 'warning',
    actor: 'webhook',
    details: {
      success,
      authMethod: method,
      failureReason: reason || null,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    },
    req,
  });
}

/**
 * Log PII encryption operation
 * @param {Object} options
 * @param {string} options.shipmentId - Shipment ID
 * @param {Array} options.fields - Fields encrypted (e.g., ['customer', 'product'])
 * @param {Object} options.req - Express request object
 */
export async function auditPiiEncryption({ shipmentId, fields, req }) {
  return writeAuditEvent({
    eventType: 'shipment.pii_encrypted',
    severity: 'info',
    actor: 'system',
    details: {
      shipmentId,
      encryptedFields: fields,
      algorithm: 'aes-256-gcm',
    },
    req,
  });
}

/**
 * Log data retention cleanup
 * @param {Object} options
 * @param {string} options.collection - Collection cleaned
 * @param {number} options.docsDeleted - Number of documents deleted
 * @param {number} options.retentionDays - Retention policy days
 */
export async function auditRetentionCleanup({ collection, docsDeleted, retentionDays }) {
  return writeAuditEvent({
    eventType: 'retention.cleanup',
    severity: 'info',
    actor: 'system',
    details: {
      collection,
      documentsDeleted: docsDeleted,
      retentionPolicyDays: retentionDays,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log webhook retry processing
 * @param {Object} options
 * @param {string} options.queueId - Retry queue document ID
 * @param {number} options.attempt - Attempt number
 * @param {boolean} options.success - Whether attempt succeeded
 * @param {string} [options.error] - Error message if failed
 */
export async function auditWebhookRetry({ queueId, attempt, success, error }) {
  return writeAuditEvent({
    eventType: 'webhook.retry_processed',
    severity: success ? 'info' : 'warning',
    actor: 'system',
    details: {
      retryQueueId: queueId,
      attemptNumber: attempt,
      success,
      errorMessage: error || null,
    },
  });
}

/**
 * Internal: Write audit event to Firestore
 * @private
 */
async function writeAuditEvent({ eventType, severity = 'info', details = {}, req = null, actor = 'system', requestId = null }) {
  // Get db singleton from module context - should be injected by caller
  if (typeof global.auditDb === 'undefined') {
    console.warn('[Audit] Database not configured, audit event not logged:', eventType);
    return null;
  }

  try {
    await global.auditDb.collection('audit_logs').add({
      eventType,
      severity,
      actor,
      requestId: requestId || req?.requestId || null,
      ip: req?.ip || null,
      method: req?.method || null,
      path: req?.path || null,
      userAgent: req?.headers?.['user-agent'] || null,
      details,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error(`[Audit] Failed to write audit event (${eventType}):`, error.message);
  }

  return null;
}

export default {
  auditShipmentIngestion,
  auditAlertChange,
  auditRiskOverride,
  auditWebhookAuth,
  auditPiiEncryption,
  auditRetentionCleanup,
  auditWebhookRetry,
};
