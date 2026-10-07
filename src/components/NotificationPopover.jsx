import { useEffect, useState, useRef } from 'react';
import { Bell, X, AlertTriangle, Check, Clock, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAlerts, acknowledgeAlert } from '../services/firestoreService';
import toast from 'react-hot-toast';

export default function NotificationPopover({ userRole }) {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen]);

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

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200 text-red-700';
      case 'high':
        return 'bg-orange-50 border-orange-200 text-orange-700';
      case 'medium':
        return 'bg-amber-50 border-amber-200 text-amber-700';
      default:
        return 'bg-green-50 border-green-200 text-green-700';
    }
  };

  const incidentAlerts = alerts.filter(a => a.type === 'incident_report');
  const unreadCount = incidentAlerts.length;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        title="Incident Reports"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
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
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Incident Reports</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1">
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
                      className={`p-4 border-l-4 transition-colors ${getSeverityColor(alert.severity)}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{alert.title}</p>
                          <p className="text-xs mt-1 line-clamp-2">{alert.message}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs opacity-75">
                            <span className="inline-block px-2 py-1 bg-current/10 rounded capitalize">
                              {alert.severity}
                            </span>
                            {alert.trackingId && (
                              <span className="text-slate-600">{alert.trackingId}</span>
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
