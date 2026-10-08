import { useState, useEffect } from 'react';
import { X, Mail, Clock, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import toast from 'react-hot-toast';

export default function ViewerMessageModal({ isOpen, onClose, shipmentId, viewerEmail, isAdmin = false }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !shipmentId) return;

    setLoading(true);

    try {
      // Both admin and viewer: load all messages for this shipment
      // Viewers can see all messages for the shipment they reported
      const q = query(
        collection(db, 'incidentNotifications'),
        where('shipmentId', '==', shipmentId),
        where('type', '==', 'admin_message')
      );
      
      // Real-time listener
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setMessages(msgs);
        setLoading(false);
      }, (error) => {
        console.error('Failed to load messages');
        setMessages([]);
        setLoading(false);
      });

      return () => {
        unsubscribe();
      };
    } catch (error) {
      console.error('Error setting up subscription');
      setLoading(false);
    }
  }, [isOpen, shipmentId, viewerEmail, isAdmin]);

  const handleDeleteMessage = async (messageId) => {
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
      await deleteDoc(doc(db, 'incidentNotifications', messageId));
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast.success('Message deleted');
    } catch (error) {
      console.error('Failed to delete message:', error);
      toast.error('Failed to delete message');
    }
  };

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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-white rounded-2xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      {isAdmin ? 'Sent Messages' : 'Messages from Admin'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Shipment: {shipmentId}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-3 border-slate-200 border-t-purple-600 rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12">
                    <Mail className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500">No messages yet</p>
                    <p className="text-xs text-slate-400 mt-1">Admin messages will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div key={msg.id} className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-800">{msg.title || 'Message from Admin'}</p>
                            {isAdmin && msg.viewerEmail && (
                              <p className="text-xs text-slate-500 mt-1">To: {msg.viewerEmail}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                              Admin
                            </span>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="p-1 rounded hover:bg-red-100 text-red-600 transition-colors"
                                title="Delete message"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-slate-700 mb-3 leading-relaxed">
                          {msg.message}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(msg.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
