import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

const OWNER_FIELDS = ['ownerId', 'userId', 'createdBy'];

function sortByCreatedAtDesc(rows) {
  return [...rows].sort((a, b) => {
    const aDate = toJsDate(a.createdAt);
    const bDate = toJsDate(b.createdAt);
    const at = aDate ? aDate.getTime() : 0;
    const bt = bDate ? bDate.getTime() : 0;
    return bt - at;
  });
}

function toJsDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initTrendBuckets(days) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const buckets = [];
  const byKey = new Map();

  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = dayKey(date);
    const row = {
      key,
      date: date.toLocaleDateString('en-US', { weekday: 'short' }),
      shipments: 0,
      atRisk: 0,
      delayed: 0,
      riskTotal: 0,
      riskCount: 0,
    };
    buckets.push(row);
    byKey.set(key, row);
  }

  return { start, buckets, byKey };
}

function applyOptionalShipmentFilters(constraints, filters = {}) {
  if (filters.status) constraints.push(where('status', '==', filters.status));
  if (filters.riskLevel) constraints.push(where('riskLevel', '==', filters.riskLevel));
  if (filters.carrier) constraints.push(where('carrier', '==', filters.carrier));
}

function applyOwnerLimit(rows, filters = {}) {
  const sorted = sortByCreatedAtDesc(rows);
  if (!filters.limit) return sorted;
  return sorted.slice(0, Math.max(1, Number(filters.limit) || 1));
}

async function getUnscopedShipments(filters = {}) {
  const constraints = [];
  applyOptionalShipmentFilters(constraints, filters);
  constraints.push(orderBy('createdAt', 'desc'));
  if (filters.limit) constraints.push(limit(filters.limit));

  const qRef = query(collection(db, 'shipments'), ...constraints);
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getOwnerScopedShipmentsWithFallback(filters, currentUid) {
  for (const ownerField of OWNER_FIELDS) {
    const constraints = [where(ownerField, '==', currentUid)];
    applyOptionalShipmentFilters(constraints, filters);
    const qRef = query(collection(db, 'shipments'), ...constraints);
    const snap = await getDocs(qRef);
    if (!snap.empty) {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return applyOwnerLimit(rows, filters);
    }
  }

  return [];
}

export async function getDailyShipmentAggregates(options = {}) {
  const days = Math.max(1, Math.min(90, Number(options.days) || 7));
  const atRiskThreshold = Number(options.atRiskThreshold) || 50;
  const { start, buckets, byKey } = initTrendBuckets(days);

  const shipments = await getShipments();
  shipments.forEach((shipment) => {
    const createdAt = toJsDate(shipment.createdAt);
    if (!createdAt || createdAt < start) return;

    const bucket = byKey.get(dayKey(createdAt));
    if (!bucket) return;

    const risk = Number(shipment.riskScore) || 0;
    bucket.shipments += 1;
    if (risk >= atRiskThreshold) bucket.atRisk += 1;
    if (shipment.isDelayed) bucket.delayed += 1;
    if (risk > 0) {
      bucket.riskTotal += risk;
      bucket.riskCount += 1;
    }
  });

  return buckets.map((row) => ({
    date: row.date,
    shipments: row.shipments,
    atRisk: row.atRisk,
    delayed: row.delayed,
    riskAvg: row.riskCount > 0 ? Math.round(row.riskTotal / row.riskCount) : 0,
  }));
}

// ─── Shipments ───
export async function getShipments(filters = {}) {
  let q = collection(db, 'shipments');
  const constraints = [];
  const currentUid = auth.currentUser?.uid || null;
  const ownerScoped = Boolean(currentUid && filters.scope !== 'all');
  if (ownerScoped) {
    const ownerScopedRows = await getOwnerScopedShipmentsWithFallback(filters, currentUid);
    if (ownerScopedRows.length > 0) return ownerScopedRows;

    // Backward compatibility for webhook/legacy rows that were stored without owner metadata.
    return getUnscopedShipments(filters);
  }

  applyOptionalShipmentFilters(constraints, filters);

  if (!ownerScoped) {
    constraints.push(orderBy('createdAt', 'desc'));
    if (filters.limit) constraints.push(limit(filters.limit));
  }

  q = query(q, ...constraints);
  const snap = await getDocs(q);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return rows;
}

export async function getShipmentById(id) {
  const snap = await getDoc(doc(db, 'shipments', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addShipment(data) {
  const ownerId = auth.currentUser?.uid || data.ownerId || null;
  return addDoc(collection(db, 'shipments'), {
    ...data,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateShipment(id, data) {
  return updateDoc(doc(db, 'shipments', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteShipment(id) {
  return deleteDoc(doc(db, 'shipments', id));
}

export function subscribeToShipments(callback, filters = {}) {
  let q = collection(db, 'shipments');
  const constraints = [];
  const currentUid = auth.currentUser?.uid || null;
  const ownerScoped = Boolean(currentUid && filters.scope !== 'all');
  applyOptionalShipmentFilters(constraints, filters);

  if (ownerScoped) {
    let activeUnsub = null;

    const attachUnscoped = () => {
      const globalConstraints = [...constraints, orderBy('createdAt', 'desc')];
      if (filters.limit) globalConstraints.push(limit(filters.limit));
      const globalQuery = query(collection(db, 'shipments'), ...globalConstraints);

      activeUnsub = onSnapshot(
        globalQuery,
        (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          callback(docs);
        },
        (error) => {
          console.error('Shipments listener failed:', error);
          // Keep the current UI data instead of forcing a temporary empty state.
        }
      );
    };

    const attachForOwnerField = (ownerFieldIndex) => {
      const ownerField = OWNER_FIELDS[ownerFieldIndex];
      const ownerConstraints = [where(ownerField, '==', currentUid), ...constraints];
      const ownerQuery = query(collection(db, 'shipments'), ...ownerConstraints);

      activeUnsub = onSnapshot(
        ownerQuery,
        (snap) => {
          if (snap.empty && ownerFieldIndex < OWNER_FIELDS.length - 1) {
            if (activeUnsub) activeUnsub();
            attachForOwnerField(ownerFieldIndex + 1);
            return;
          }

          if (snap.empty) {
            if (activeUnsub) activeUnsub();
            attachUnscoped();
            return;
          }

          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          callback(applyOwnerLimit(docs, filters));
        },
        (error) => {
          if (ownerFieldIndex < OWNER_FIELDS.length - 1) {
            if (activeUnsub) activeUnsub();
            attachForOwnerField(ownerFieldIndex + 1);
            return;
          }

          if (activeUnsub) activeUnsub();
          attachUnscoped();
        }
      );
    };

    attachForOwnerField(0);

    return () => {
      if (activeUnsub) activeUnsub();
    };
  }

  if (!ownerScoped) {
    constraints.push(orderBy('createdAt', 'desc'));
    if (filters.limit) constraints.push(limit(filters.limit));
  }

  q = query(q, ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(docs);
    },
    (error) => {
      console.error('Shipments listener failed:', error);
      // Do not clear existing rows on transient connectivity/listen failures.
    }
  );
}

// ─── Alerts ───
export async function getAlerts(filters = {}) {
  let q = collection(db, 'alerts');
  const constraints = [];
  if (filters.severity) constraints.push(where('severity', '==', filters.severity));
  if (filters.status) constraints.push(where('status', '==', filters.status));
  if (filters.shipmentId) constraints.push(where('shipmentId', '==', filters.shipmentId));
  constraints.push(orderBy('createdAt', 'desc'));
  if (filters.limit) constraints.push(limit(filters.limit));
  q = query(q, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addAlert(data) {
  return addDoc(collection(db, 'alerts'), {
    ...data,
    status: 'active',
    createdAt: serverTimestamp(),
  });
}

export async function updateAlert(id, data) {
  return updateDoc(doc(db, 'alerts', id), { ...data, updatedAt: serverTimestamp() });
}

export async function acknowledgeAlert(id) {
  return updateDoc(doc(db, 'alerts', id), {
    status: 'acknowledged',
    acknowledgedAt: serverTimestamp(),
  });
}

export async function resolveAlert(id, resolution) {
  return updateDoc(doc(db, 'alerts', id), {
    status: 'resolved',
    resolution,
    resolvedAt: serverTimestamp(),
  });
}

export async function deleteAlert(id) {
  return deleteDoc(doc(db, 'alerts', id));
}

export function subscribeToAlerts(callback, filters = {}) {
  let q = collection(db, 'alerts');
  const constraints = [];
  if (filters.severity) constraints.push(where('severity', '==', filters.severity));
  constraints.push(orderBy('createdAt', 'desc'));
  if (filters.limit) constraints.push(limit(filters.limit));
  q = query(q, ...constraints);
  return onSnapshot(q, (snap) => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(docs);
  });
}

// ─── Interventions / Recommendations ───
export async function getInterventions(shipmentId) {
  const q = query(
    collection(db, 'interventions'),
    where('shipmentId', '==', shipmentId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addIntervention(data) {
  return addDoc(collection(db, 'interventions'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function updateIntervention(id, data) {
  return updateDoc(doc(db, 'interventions', id), { ...data, updatedAt: serverTimestamp() });
}

// ─── Route Intelligence Recommendations ───
export async function getRouteRecommendations(filters = {}) {
  let qRef = collection(db, 'routeRecommendations');
  const constraints = [];
  if (filters.shipmentId) constraints.push(where('shipmentId', '==', filters.shipmentId));
  if (filters.status) constraints.push(where('status', '==', filters.status));
  if (filters.limit) constraints.push(limit(filters.limit));
  if (constraints.length) qRef = query(qRef, ...constraints);
  const snap = await getDocs(qRef);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return rows.sort((a, b) => {
    const at = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
    const bt = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
    return bt - at;
  });
}

export function subscribeToRouteRecommendations(callback, filters = {}) {
  let qRef = collection(db, 'routeRecommendations');
  const constraints = [];
  if (filters.shipmentId) constraints.push(where('shipmentId', '==', filters.shipmentId));
  if (filters.status) constraints.push(where('status', '==', filters.status));
  if (filters.limit) constraints.push(limit(filters.limit));
  if (constraints.length) qRef = query(qRef, ...constraints);

  return onSnapshot(qRef, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => {
      const at = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
      const bt = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
      return bt - at;
    });
    callback(rows);
  });
}

export async function upsertRouteRecommendationForShipment(shipment, intelligence, prediction = null) {
  if (!shipment || !intelligence?.recommendedRoute) return null;

  const shipmentId = shipment.id || shipment.trackingId;
  const recommendation = {
    shipmentId,
    trackingId: shipment.trackingId || shipment.id,
    status: 'active',
    mode: shipment.mode || 'road',
    origin: shipment.origin,
    destination: shipment.destination,
    currentRiskScore: prediction?.riskScore || shipment.riskScore || intelligence.overallWeatherRisk || 0,
    weatherRiskScore: intelligence.overallWeatherRisk || 0,
    recommendedRoute: intelligence.recommendedRoute,
    alternatives: intelligence.alternatives || [],
    summary: intelligence.summary || 'Alternative route available.',
    source: intelligence.source || 'route-intelligence',
    generatedAt: intelligence.generatedAt || new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };

  const qExisting = query(collection(db, 'routeRecommendations'), where('shipmentId', '==', shipmentId), limit(1));
  const snap = await getDocs(qExisting);

  let recommendationId;
  if (!snap.empty) {
    recommendationId = snap.docs[0].id;
    await updateDoc(doc(db, 'routeRecommendations', recommendationId), recommendation);
  } else {
    const ref = await addDoc(collection(db, 'routeRecommendations'), {
      ...recommendation,
      createdAt: serverTimestamp(),
    });
    recommendationId = ref.id;
  }

  const severity = recommendation.weatherRiskScore >= 75
    ? 'critical'
    : recommendation.weatherRiskScore >= 50
    ? 'high'
    : recommendation.weatherRiskScore >= 30
    ? 'medium'
    : 'low';

  const routeAlertPayload = {
    shipmentId,
    type: 'route_alternative',
    severity,
    title: `Alternative route suggested: ${shipment.trackingId || shipmentId}`,
    message: recommendation.recommendedRoute?.recommendationReason || 'Alternative route available for reduced delay risk.',
    riskScore: recommendation.weatherRiskScore,
    status: 'active',
    source: 'route-intelligence',
    updatedAt: serverTimestamp(),
  };

  const qAlert = query(
    collection(db, 'alerts'),
    where('shipmentId', '==', shipmentId),
    where('type', '==', 'route_alternative'),
    limit(1)
  );
  const alertSnap = await getDocs(qAlert);
  if (!alertSnap.empty) {
    await updateDoc(doc(db, 'alerts', alertSnap.docs[0].id), routeAlertPayload);
  } else {
    await addDoc(collection(db, 'alerts'), {
      ...routeAlertPayload,
      createdAt: serverTimestamp(),
    });
  }

  return recommendationId;
}

// ─── Analytics ───
export async function getAnalyticsData() {
  const shipments = await getShipments();

  let alerts = [];
  try {
    const alertsSnap = await getDocs(collection(db, 'alerts'));
    alerts = alertsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('Analytics alerts query failed:', error?.message || error);
  }

  const totalShipments = shipments.length;
  const atRisk = shipments.filter(s => s.riskScore >= 60).length;
  const onTime = shipments.filter(s => s.status === 'delivered' && !s.isDelayed).length;
  const delayed = shipments.filter(s => s.isDelayed).length;
  const avgRiskScore = totalShipments > 0
    ? Math.round(shipments.reduce((a, s) => a + (s.riskScore || 0), 0) / totalShipments)
    : 0;

  // Risk distribution
  const riskDistribution = [
    { name: 'Critical', value: shipments.filter(s => s.riskLevel === 'critical').length, color: '#ef4444' },
    { name: 'High', value: shipments.filter(s => s.riskLevel === 'high').length, color: '#f97316' },
    { name: 'Medium', value: shipments.filter(s => s.riskLevel === 'medium').length, color: '#f59e0b' },
    { name: 'Low', value: shipments.filter(s => s.riskLevel === 'low').length, color: '#22c55e' },
  ];

  // Carrier performance
  const carriers = [...new Set(shipments.map(s => s.carrier))];
  const carrierPerformance = carriers.map(c => {
    const cShipments = shipments.filter(s => s.carrier === c);
    const onTimeCount = cShipments.filter(s => !s.isDelayed).length;
    return {
      carrier: c,
      total: cShipments.length,
      onTime: onTimeCount,
      delayed: cShipments.length - onTimeCount,
      onTimeRate: cShipments.length > 0 ? Math.round((onTimeCount / cShipments.length) * 100) : 0,
      avgRisk: cShipments.length > 0
        ? Math.round(cShipments.reduce((a, s) => a + (s.riskScore || 0), 0) / cShipments.length)
        : 0,
    };
  });

  const dailyVolume = await getDailyShipmentAggregates({ days: 7, atRiskThreshold: 60 });

  return {
    totalShipments,
    atRisk,
    onTime,
    delayed,
    avgRiskScore,
    riskDistribution,
    carrierPerformance,
    dailyVolume,
    activeAlerts: alerts.filter(a => a.status === 'active').length,
    resolvedAlerts: alerts.filter(a => a.status === 'resolved').length,
  };
}

// ─── Batch seed helper ───
export async function seedShipments(shipments) {
  const batch = writeBatch(db);
  shipments.forEach((s) => {
    const ref = doc(collection(db, 'shipments'));
    batch.set(ref, { ...s, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

export async function seedAlerts(alerts) {
  const batch = writeBatch(db);
  alerts.forEach((a) => {
    const ref = doc(collection(db, 'alerts'));
    batch.set(ref, { ...a, createdAt: serverTimestamp() });
  });
  await batch.commit();
}

// ─── Admin Helper Functions ───
export async function getAllUsers() {
  try {
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
  } catch (e) {
    console.error('Failed to fetch users:', e);
    return [];
  }
}

export async function getUserShipments(userId) {
  try {
    const constraints = [
      where('ownerId', '==', userId)
    ];
    const qRef = query(collection(db, 'shipments'), ...constraints);
    const snap = await getDocs(qRef);
    return snap.docs.length;
  } catch (e) {
    console.error('Failed to fetch user shipments:', e);
    return 0;
  }
}

export async function getUserLastActive(userId) {
  try {
    const ref = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    
    const data = snap.data();
    const lastActivity = data?.lastActive || data?.updatedAt || null;
    return toJsDate(lastActivity);
  } catch (e) {
    console.error('Failed to fetch user last active:', e);
    return null;
  }
}

// ──────────────────────────────────────────────────────
// Incident Notes Functions - Viewer incident reporting
// ──────────────────────────────────────────────────────

export async function addIncidentNote(shipmentId, noteData) {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';
    
    const response = await fetch(`${backendUrl}/api/shipments/${shipmentId}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(noteData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to add incident note: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (e) {
    console.error('Failed to add incident note:', e);
    throw e;
  }
}

export async function getShipmentNotes(shipmentId) {
  try {
    const notesRef = collection(db, 'shipments', shipmentId, 'notes');
    const q = query(notesRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (e) {
    console.error('Failed to fetch shipment notes:', e);
    return [];
  }
}

export function subscribeToShipmentNotes(shipmentId, callback) {
  try {
    const notesRef = collection(db, 'shipments', shipmentId, 'notes');
    const q = query(notesRef, orderBy('createdAt', 'desc'));
    
    const unsub = onSnapshot(q, (snap) => {
      const notes = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(notes);
    }, (error) => {
      console.error('Failed to subscribe to shipment notes:', error);
      callback([]);
    });

    return unsub;
  } catch (e) {
    console.error('Failed to set up notes subscription:', e);
    return () => {};
  }
}

// ──────────────────────────────────────────────────────
// Real-time subscription to a single shipment by ID
// ──────────────────────────────────────────────────────

export function subscribeToShipmentById(shipmentId, callback) {
  try {
    const shipmentRef = doc(db, 'shipments', shipmentId);
    
    const unsub = onSnapshot(shipmentRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data());
      } else {
        console.warn('Shipment not found:', shipmentId);
        callback(null);
      }
    }, (error) => {
      console.error('Failed to subscribe to shipment:', error);
      callback(null);
    });

    return unsub;
  } catch (e) {
    console.error('Failed to set up shipment subscription:', e);
    return () => {};
  }
}

// ──────────────────────────────────────────────────────
// Incident Resolved Notifications
// ──────────────────────────────────────────────────────

export async function createResolvedNotification(shipmentId, viewerEmail, resolvedBy, metadata = {}) {
  try {
    const notificationsRef = collection(db, 'incidentNotifications');
    
    const notification = {
      shipmentId,
      viewerEmail,
      type: metadata.type || 'issue_resolved',
      title: metadata.title || 'Incident Resolved',
      message: metadata.message || `An incident for shipment ${shipmentId} has been resolved`,
      resolvedBy,
      createdAt: serverTimestamp(),
      read: false,
      ...metadata
    };

    const docRef = await addDoc(notificationsRef, notification);
    return { id: docRef.id, ...notification };
  } catch (e) {
    console.error('Failed to create resolved notification:', e);
    throw e;
  }
}

export async function getIncidentNotifications(viewerEmail) {
  try {
    const notificationsRef = collection(db, 'incidentNotifications');
    const q = query(
      notificationsRef,
      where('viewerEmail', '==', viewerEmail),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (e) {
    console.error('Failed to fetch incident notifications:', e);
    return [];
  }
}

export function subscribeToIncidentNotifications(viewerEmail, callback) {
  try {
    const notificationsRef = collection(db, 'incidentNotifications');
    const q = query(
      notificationsRef,
      where('viewerEmail', '==', viewerEmail),
      orderBy('createdAt', 'desc')
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const notifications = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(notifications);
    }, (error) => {
      console.error('Failed to subscribe to incident notifications:', error);
      callback([]);
    });

    return unsub;
  } catch (e) {
    console.error('Failed to set up notifications subscription:', e);
    return () => {};
  }
}

export async function markNotificationAsRead(notificationId) {
  try {
    const notificationRef = doc(db, 'incidentNotifications', notificationId);
    await updateDoc(notificationRef, { read: true });
  } catch (e) {
    console.error('Failed to mark notification as read:', e);
    throw e;
  }
}

// ──────────────────────────────────────────────────────
// Delete Incident Notes
// ──────────────────────────────────────────────────────

export async function deleteIncidentNote(shipmentId, noteId) {
  try {
    console.log(`Attempting to delete incident note: shipmentId=${shipmentId}, noteId=${noteId}`);
    
    // Delete the incident note
    const noteRef = doc(db, 'shipments', shipmentId, 'notes', noteId);
    await deleteDoc(noteRef);
    console.log(`Successfully deleted incident note ${noteId}`);
    
    // Cascade delete associated alerts linked by shipmentId only
    // (We'll filter by noteId in-memory since composite indexes might not be set up)
    const alertsSnap = await getDocs(
      query(collection(db, 'alerts'), 
        where('shipmentId', '==', shipmentId)
      )
    );
    console.log(`Found ${alertsSnap.docs.length} total alerts for shipment, filtering by noteId...`);
    
    // Filter alerts by noteId in JavaScript (since composite index might not exist)
    const alertsToDelete = alertsSnap.docs.filter(doc => doc.data().noteId === noteId);
    console.log(`Filtered to ${alertsToDelete.length} alerts with matching noteId`);
    
    const deleteAlertPromises = alertsToDelete.map(alertDoc => deleteDoc(alertDoc.ref));
    await Promise.all(deleteAlertPromises);
    
    console.log(`Successfully deleted incident note ${noteId} and ${deleteAlertPromises.length} associated alerts`);
    return true;
  } catch (e) {
    console.error('Failed to delete incident note:', e);
    console.error('Error code:', e.code);
    console.error('Error message:', e.message);
    throw e;
  }
}

export async function deleteAllIncidentNotes(shipmentId) {
  try {
    const notesRef = collection(db, 'shipments', shipmentId, 'notes');
    const snap = await getDocs(notesRef);
    
    const deletePromises = snap.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    return snap.docs.length;
  } catch (e) {
    console.error('Failed to delete all incident notes:', e);
    throw e;
  }
}
