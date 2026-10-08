import { useEffect, useState, useRef } from 'react';
import { Bell, X, AlertTriangle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAlerts, acknowledgeAlert } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';
import ViewerNotifications from './ViewerNotifications';
import toast from 'react-hot-toast';

export default function NotificationPopover() {
  const { userProfile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef(null);

  const isAdmin = userProfile?.role === 'admin';
  const isViewer = userProfile?.role === 'viewer';

  useEffect(() => {
    if (!isOpen || !isAdmin) return;

    const loadAlerts = async () => {
      setLoading(true);
      try {
        const data = await getAlerts({ limit: 10 });
        // Filter incident reports
        setAlerts(data.filter(a => a.type === 'incident_report'));
      } catch (error) {
        console.error('Failed to load alerts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();
  }, [isOpen, isAdmin]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleAcknowledge = async (alertId) => {
    try {
      await acknowledgeAlert(alertId);
      setAlerts(alerts.filter(a => a.id !== alertId));
      toast.success('Alert acknowledged');
    } catch (error) {
      toast.error('Failed to acknowledge alert');
    }
  };

  const incidentAlerts = alerts.filter(a => a.type === 'incident_report');
  const unreadCount = incidentAlerts.length;

  // Only show for admin and viewer
  if (!isAdmin && !isViewer) return null;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        title={isAdmin ? "Incident Reports" : "My Notifications"}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && isAdmin && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
        )}
      </button>

      {/* Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-lg border border-slate-200 z-50 max-h-[500px] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <h3 className="font-semibold text-slate-800">
                {isAdmin ? 'Incident Reports' : 'My Notifications'}
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1">
              {isAdmin ? (
                // Admin view - incident reports
                <>
                  {loading ? (
                    <div className="p-4 text-center">
                      <div className="w-6 h-6 border-3 border-slate-200 border-t-brand-600 rounded-full animate-spin mx-auto" />
                    </div>
                  ) : incidentAlerts.length === 0 ? (
                    <div className="p-6 text-center">
                      <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No incident reports</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {incidentAlerts.map(alert => (
                        <motion.div
                          key={alert.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 border-l-4 border-red-500 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-slate-800 truncate">{alert.title}</p>
                              <p className="text-xs text-slate-600 mt-1 line-clamp-2">{alert.message}</p>
                              <div className="flex items-center gap-2 mt-2 text-xs">
                                <span className="px-2 py-1 bg-red-100 text-red-700 rounded capitalize font-medium">
                                  {alert.severity}
                                </span>
                                {alert.trackingId && (
                                  <span className="text-slate-600 font-mono">{alert.trackingId}</span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleAcknowledge(alert.id)}
                              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-black/10 text-slate-600 hover:text-slate-700 transition-colors"
                              title="Acknowledge"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                // Viewer view - their submissions and replies
                <ViewerNotifications />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
