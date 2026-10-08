import { AlertTriangle, Clock, MapPin, Clock as ClockIcon, ChevronRight, Trash2, Mail, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { deleteIncidentNote, subscribeToIncidentNotifications } from '../services/firestoreService';
import ViewerMessageModal from './ViewerMessageModal';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';

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

const SEVERITY_COLORS = {
  low: 'bg-green-50 border-green-200 text-green-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  high: 'bg-orange-50 border-orange-200 text-orange-700',
  critical: 'bg-red-50 border-red-200 text-red-700'
};

const SEVERITY_BADGE = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700'
};

const SEVERITY_DOT = {
  low: 'bg-green-500',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500'
};

export default function IncidentNotesTimeline({ notes = [], loading = false, showHeader = true, shipmentId = null, onAdminViewDetails = null }) {
  const { userProfile, currentUser } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState({});
  const [hasMessages, setHasMessages] = useState({});
  const [showMessageModal, setShowMessageModal] = useState(false);
  
  // Subscribe to incident notifications to track messages
  useEffect(() => {
    if (!currentUser?.email) {
      console.log('IncidentNotesTimeline: No current user email');
      return;
    }

    console.log('IncidentNotesTimeline: Setting up subscription for', currentUser.email);

    const unsub = subscribeToIncidentNotifications(currentUser.email, (notifications) => {
      console.log('IncidentNotesTimeline: Received notifications:', notifications.length);
      const unread = {};
      const msgs = {};
      
      notifications.forEach(notif => {
        console.log('Checking notification:', { type: notif.type, shipmentId: notif.shipmentId });
        if (notif.type === 'admin_message' && notif.shipmentId) {
          unread[notif.shipmentId] = !notif.read;
          msgs[notif.shipmentId] = true; // Has messages
        }
      });
      
      console.log('Updated unread:', unread, 'hasMessages:', msgs);
      setUnreadMessages(unread);
      setHasMessages(msgs);
    });

    return () => unsub();
  }, [currentUser?.email]);
  
  const handleDeleteNote = async (e, noteId) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this incident report? This action cannot be undone.')) {
      return;
    }

    try {
      console.log('Delete initiated:', { userRole: userProfile?.role, shipmentId, noteId });
      await deleteIncidentNote(shipmentId, noteId);
      toast.success('Incident report deleted');
    } catch (error) {
      console.error('Failed to delete note:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        userRole: userProfile?.role,
        shipmentId,
        noteId
      });
      
      if (error.code === 'permission-denied') {
        toast.error('Permission denied: You must be an admin to delete incident reports');
      } else {
        toast.error(`Failed to delete incident report: ${error.message}`);
      }
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown date';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="stat-card">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Incident Reports</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="w-8 h-8 border-3 border-slate-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-slate-500">Loading incident reports...</p>
          </div>
        </div>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="stat-card">
        {showHeader && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">Incident Reports</h3>
            </div>
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">No incident reports yet</p>
              <p className="text-xs text-slate-400 mt-1">Reports will appear here when submitted</p>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="stat-card"
    >
      {showHeader && (
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-semibold text-slate-700">Incident Reports ({notes.length})</h3>
        </div>
      )}

      <div className="space-y-0">
        {notes.map((note, idx) => {
          const severityColor = SEVERITY_COLORS[note.severity] || SEVERITY_COLORS.medium;
          const severityBadge = SEVERITY_BADGE[note.severity] || SEVERITY_BADGE.medium;
          const severityDot = SEVERITY_DOT[note.severity] || SEVERITY_DOT.medium;
          const incidentLabel = INCIDENT_LABELS[note.incidentType] || note.incidentType;

          return (
            <div key={note.id || idx} className="flex gap-4 pb-6 last:pb-0">
              {/* Timeline Dot & Line */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-3 h-3 rounded-full ${severityDot} flex-shrink-0 mt-1.5`} />
                {idx < notes.length - 1 && (
                  <div className="w-0.5 h-20 bg-slate-200 mt-2" />
                )}
              </div>

              {/* Note Content */}
              <div className={`flex-1 p-4 rounded-xl border ${severityColor} ${userProfile?.role === 'admin' ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} relative`}
                onClick={() => userProfile?.role === 'admin' && onAdminViewDetails && onAdminViewDetails(note)}
              >
                {/* Message Inbox Icon for Viewers AND Admins */}
                {(userProfile?.role === 'viewer' || userProfile?.role === 'admin') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMessageModal(true);
                    }}
                    title={userProfile?.role === 'admin' ? 'View sent messages' : 'View admin messages'}
                    className={`absolute top-3 p-1.5 rounded-lg hover:bg-purple-50 text-purple-600 hover:text-purple-700 transition-colors border border-purple-200 ${
                      userProfile?.role === 'admin' ? 'right-12' : 'right-3'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                )}

                {/* Delete Icon for Admin - positioned at far right */}
                {userProfile?.role === 'admin' && (
                  <button
                    onClick={(e) => handleDeleteNote(e, note.id)}
                    title="Delete incident report"
                    className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors border border-slate-200"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-semibold text-slate-800">{incidentLabel}</p>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${severityBadge}`}>
                        {note.severity}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(note.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-slate-700 mb-3 leading-relaxed break-words">
                  {note.text}
                </p>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {note.location?.lat && note.location?.lng && (
                    <div className="flex items-start gap-2 text-xs">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-slate-600">
                          <span className="font-medium">{note.location.lat.toFixed(4)}°, {note.location.lng.toFixed(4)}°</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {note.estimatedDelay > 0 && (
                    <div className="flex items-start gap-2 text-xs">
                      <ClockIcon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-slate-600">
                          <span className="font-medium">+{note.estimatedDelay} hours</span> estimated delay
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-3 pt-3 border-t border-slate-300 border-opacity-30 flex items-center justify-between">
                  <p className="text-xs text-slate-600">
                    Reported by: <span className="font-medium text-slate-700">{note.createdBy || 'Unknown'}</span>
                  </p>
                  {userProfile?.role === 'admin' && (
                    <button
                      onClick={() => onAdminViewDetails && onAdminViewDetails(note)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      View Details
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Message Modal for Viewers AND Admins */}
      {(userProfile?.role === 'viewer' || userProfile?.role === 'admin') && (
        <ViewerMessageModal 
          isOpen={showMessageModal} 
          onClose={() => setShowMessageModal(false)}
          shipmentId={shipmentId}
          viewerEmail={currentUser?.email}
          isAdmin={userProfile?.role === 'admin'}
        />
      )}
    </motion.div>
  );
}
