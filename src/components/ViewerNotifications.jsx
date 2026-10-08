import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle2, Clock, AlertTriangle, Mail, MessageSquare, Trash2, Check } from 'lucide-react';
import { db } from '../config/firebase';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const INCIDENT_LABELS = {
  fuel_shortage: 'Fuel Shortage',
  engine_failure: 'Engine Failure',
  landslide: 'Landslide',
  accident: 'Accident',
  terrorist_attack: 'Terrorist Attack',
  natural_disaster: 'Natural Disaster',
  port_closure: 'Port Closure',
  customs_delay: 'Customs Delay',
  weather_emergency: 'Weather Emergency',
  other: 'Other Incident'
};

export default function ViewerNotifications() {
  const { currentUser, userProfile } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleDelete = async (notifId) => {
    if (!confirm('Are you sure you want to delete this notification?')) return;
    
    try {
      await deleteDoc(doc(db, 'incidentNotifications', notifId));
      toast.success('Notification deleted');
    } catch (error) {
      console.error('Failed to delete notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const handleMarkAsRead = async (notifId) => {
    try {
      await updateDoc(doc(db, 'incidentNotifications', notifId), {
        read: true
      });
      toast.success('Marked as read');
    } catch (error) {
      console.error('Failed to mark as read:', error);
      toast.error('Failed to mark as read');
    }
  };

  useEffect(() => {
    if (!currentUser?.email) {
      console.log('ViewerNotifications: No currentUser email, skipping subscription');
      return;
    }

    console.log('ViewerNotifications: Setting up subscription for email:', currentUser.email);
    setLoading(true);

    try {
      // Query for all notifications - they'll show any admin messages sent to any shipment the viewer has access to
      const q = query(
        collection(db, 'incidentNotifications'),
        orderBy('createdAt', 'desc')
      );

      const unsub = onSnapshot(q, (snapshot) => {
        console.log('ViewerNotifications: Received update, count:', snapshot.docs.length);
        const data = snapshot.docs.map(doc => {
          console.log('Notification:', { id: doc.id, ...doc.data() });
          return {
            id: doc.id,
            ...doc.data()
          };
        });
        setNotifications(data);
        setLoading(false);
      }, (error) => {
        console.error('ViewerNotifications: Failed to load notifications:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        setNotifications([]);
        setLoading(false);
      });

      return () => unsub();
    } catch (error) {
      console.error('ViewerNotifications: Error setting up notifications:', error);
      setLoading(false);
    }
  }, [currentUser?.email]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="w-6 h-6 border-3 border-slate-200 border-t-brand-600 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-500 mt-2">Loading notifications...</p>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="p-8 text-center">
        <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-500">No notifications yet</p>
        <p className="text-xs text-slate-400 mt-1">Your incident reports and admin replies will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      <AnimatePresence>
        {notifications.map((notif, idx) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 border rounded-lg hover:bg-slate-50 transition-colors relative ${
              notif.read ? 'border-slate-200 bg-slate-50/50' : 'border-purple-200 bg-white'
            }`}
          >
            {/* Action buttons */}
            <div className="absolute top-2 right-2 flex items-center gap-1">
              {!notif.read && (
                <button
                  onClick={() => handleMarkAsRead(notif.id)}
                  className="p-1 rounded hover:bg-green-100 text-green-600 transition-colors"
                  title="Mark as read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => handleDelete(notif.id)}
                className="p-1 rounded hover:bg-red-100 text-red-600 transition-colors"
                title="Delete notification"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {notif.type === 'incident_submitted' ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      Incident Report Submitted
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      <span className="font-medium">{INCIDENT_LABELS[notif.incidentType] || notif.incidentType}</span>
                      {' '}on shipment <span className="font-mono">{notif.trackingId}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(notif.createdAt)}
                    </p>
                  </div>
                </div>
              </>
            ) : notif.type === 'admin_reply' || notif.type === 'admin_message' ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      Message from Admin
                    </p>
                    <p className="text-xs text-slate-700 mt-1 bg-purple-50 p-2 rounded border border-purple-200">
                      {notif.message}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(notif.createdAt)}
                    </p>
                  </div>
                </div>
              </>
            ) : notif.type === 'issue_resolved' ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      Incident Resolved
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Your incident report has been resolved by admin.
                    </p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(notif.createdAt)}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
